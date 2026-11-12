// Authoritative match room. The room owns the shared deterministic GameEngine; connected
// clients submit INTENTS (aim/move/select/fire) that are validated against the live rules.
// Clients never submit damage, health, terrain or results — those exist only here and are
// broadcast as snapshots/events. Rendering and UI stay entirely in apps/client.
//
// Reliability (2026-11-10): accepted commands append to an indexed log that rebroadcasts
// live and replays on reconnect; firing is capped at one shot per turn (duplicate/delayed
// fire commands are rejected as stale-turn/already-fired); a transport drop starts a grace
// timer that holds the seat and preserves match state until the player resumes or the
// grace expires to a forfeit; finished matches run rematch voting that fully resets the
// engine (health, terrain, inventory, projectiles, turn order) on a fresh seed.
import {
  COMMAND_LIMITS,
  serverEvent,
  type AppliedCommandBody,
  type ClientCommand,
  type CommandRejection,
  type MatchSnapshot,
  type PlayerSlot,
  type PlayerSnapshot,
} from '@artillery/protocol';
import {
  GameEngine,
  MAX_POWER,
  MIN_POWER,
  MIN_ELEVATION_DEGREES,
  SIMULATION_HZ,
  type GameEngineOptions,
} from '@artillery/simulation';
import { FULL_DEPOT_CATALOG } from '@artillery/content';

export interface RoomClient {
  readonly sessionId: string;
  name: string;
  slot: PlayerSlot | undefined;
  ready: boolean;
  connected: boolean;
  send(json: string): void;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export type RoomPhase = 'lobby' | 'playing' | 'finished';

interface LoggedCommand {
  readonly slot: PlayerSlot;
  readonly command: AppliedCommandBody;
}

/** A held seat for a disconnected player awaiting reconnection. */
interface HeldSeat {
  readonly slot: PlayerSlot;
  readonly name: string;
  readonly resumeToken: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class ArtilleryRoom {
  public readonly code: string;
  public phase: RoomPhase = 'lobby';
  private readonly clients = new Map<string, RoomClient>();
  private engine: GameEngine | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private terrainSeed: number;
  /** Accepted gameplay commands since match start; replayed to reconnecting mirrors. */
  private commandLog: LoggedCommand[] = [];
  /** Turn number of the last ACCEPTED fire; blocks duplicated/replayed fire commands. */
  private lastFiredTurn = 0;
  private rematchVotes = new Set<PlayerSlot>();
  private readonly heldSeats = new Map<string, HeldSeat>();
  /** Monotonic match counter so rematches get fresh terrain deterministically. */
  private matchNumber = 0;

  public constructor(
    code: string,
    terrainSeed: number,
    /** Test hook: extra deterministic engine options (flat terrain, fixed wind). */
    private readonly engineOverrides: Partial<GameEngineOptions> = {},
    /** Fixed 60Hz engine steps per 20Hz network tick; 3 = real time, more = fast tests. */
    private readonly stepsPerTick = 3,
    /** Seconds a dropped player's seat is held before the match forfeits. */
    private readonly graceSeconds = 30,
  ) {
    this.code = code;
    this.terrainSeed = terrainSeed;
  }

  public get playerCount(): number {
    return [...this.clients.values()].filter((client) => client.slot !== undefined).length;
  }

  /** Empty means reapable: no live clients AND nobody waiting out a disconnect grace. */
  public get isEmpty(): boolean {
    return this.clients.size === 0 && this.heldSeats.size === 0;
  }

  // -------------------------------------------------------------------------------------
  // Membership, disconnect grace and reconnection
  // -------------------------------------------------------------------------------------

  /** Returns the assigned slot, or undefined when the room is full. */
  public join(client: RoomClient): PlayerSlot | undefined {
    if (this.phase !== 'lobby' && this.heldSeats.size > 0) return undefined;
    const taken = new Set(
      [...this.clients.values()].map((entry) => entry.slot).filter(Boolean),
    );
    for (const held of this.heldSeats.values()) taken.add(held.slot);
    const slot: PlayerSlot | undefined = !taken.has('player1')
      ? 'player1'
      : !taken.has('player2')
        ? 'player2'
        : undefined;
    if (slot === undefined) return undefined;
    client.slot = slot;
    client.ready = false;
    this.clients.set(client.sessionId, client);
    this.broadcastLobby();
    return slot;
  }

  /** Explicit, intentional departure: the seat is NOT held. */
  public leave(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client === undefined) return;
    this.clients.delete(sessionId);
    if (client.slot !== undefined) {
      this.broadcast(serverEvent({ type: 'player-left', slot: client.slot }));
      this.rematchVotes.delete(client.slot);
      if (this.phase === 'playing') {
        // Mid-match departure forfeits: the remaining player wins authoritatively.
        const winner: PlayerSlot = client.slot === 'player1' ? 'player2' : 'player1';
        this.finish(winner, true);
      } else {
        this.broadcastLobby();
        this.broadcastRematch();
      }
    }
  }

  /**
   * Transport drop (socket closed without leave-room). During a live or finished match the
   * seat is held for `graceSeconds` so the player can resume; the match state is fully
   * preserved — in-flight shots keep resolving on the tick, and turn input simply waits.
   * In the lobby a drop is treated as departure.
   */
  public handleDisconnect(sessionId: string, resumeToken: string): void {
    const client = this.clients.get(sessionId);
    if (client === undefined) return;
    if (client.slot === undefined || this.phase === 'lobby') {
      this.leave(sessionId);
      return;
    }
    this.clients.delete(sessionId);
    const slot = client.slot;
    const timer = setTimeout(() => {
      // Grace expired: now it is a real departure/forfeit.
      this.heldSeats.delete(resumeToken);
      this.broadcast(serverEvent({ type: 'player-left', slot }));
      if (this.phase === 'playing') {
        this.finish(slot === 'player1' ? 'player2' : 'player1', true);
      } else {
        this.broadcastLobby();
      }
    }, this.graceSeconds * 1000);
    this.heldSeats.set(resumeToken, { slot, name: client.name, resumeToken, timer });
    this.broadcast(
      serverEvent({ type: 'opponent-disconnected', slot, graceSeconds: this.graceSeconds }),
    );
  }

  /** Attempts to rebind a held seat to a fresh session. */
  public resume(
    client: RoomClient,
    resumeToken: string,
  ):
    | {
        readonly slot: PlayerSlot;
        readonly phase: RoomPhase;
        readonly terrainSeed: number;
        readonly commandLog: readonly LoggedCommand[];
        readonly snapshot: MatchSnapshot | null;
        readonly players: readonly PlayerSnapshot[];
      }
    | undefined {
    const held = this.heldSeats.get(resumeToken);
    if (held === undefined) return undefined;
    clearTimeout(held.timer);
    this.heldSeats.delete(resumeToken);
    client.slot = held.slot;
    client.name = held.name;
    client.ready = true;
    this.clients.set(client.sessionId, client);
    this.broadcast(serverEvent({ type: 'opponent-reconnected', slot: held.slot }));
    this.broadcastLobby();
    return {
      slot: held.slot,
      phase: this.phase,
      terrainSeed: this.terrainSeed,
      commandLog: this.commandLog,
      snapshot: this.engine === undefined ? null : this.snapshot(),
      players: this.lobbySnapshot(),
    };
  }

  public dispose(): void {
    if (this.ticker !== undefined) clearInterval(this.ticker);
    this.ticker = undefined;
    for (const held of this.heldSeats.values()) clearTimeout(held.timer);
    this.heldSeats.clear();
    this.clients.clear();
    this.engine = undefined;
  }

  // -------------------------------------------------------------------------------------
  // Command handling. Every result is 'ok' or a typed rejection; nothing throws.
  // -------------------------------------------------------------------------------------

  public handle(sessionId: string, command: ClientCommand): 'ok' | CommandRejection {
    const client = this.clients.get(sessionId);
    if (client === undefined || client.slot === undefined) return 'not-in-room';
    switch (command.type) {
      case 'ready':
        return this.handleReady(client);
      case 'aim': {
        // Clamp BEFORE applying so the rebroadcast carries the same values the server
        // engine consumed; mirror engines then replay identical inputs.
        const angle = clamp(command.angleDegrees, MIN_ELEVATION_DEGREES, 85);
        const power = clamp(command.power, MIN_POWER, MAX_POWER);
        return this.withActiveEngine(client, (engine) => {
          engine.setAim(angle, power);
          return 'ok';
        }, { type: 'aim', angleDegrees: angle, power });
      }
      case 'move': {
        // The engine enforces the per-turn allowance, slopes, bounds and separation;
        // the protocol already bounded the single-intent magnitude.
        const deltaX = clamp(
          command.deltaX,
          -COMMAND_LIMITS.maxMoveDelta,
          COMMAND_LIMITS.maxMoveDelta,
        );
        return this.withActiveEngine(client, (engine) => {
          engine.moveActiveTank(deltaX);
          return 'ok';
        }, { type: 'move', deltaX });
      }
      case 'select-weapon':
        return this.withActiveEngine(
          client,
          (engine) => (engine.selectWeapon(command.weaponId) ? 'ok' : 'illegal-action'),
          { type: 'select-weapon', weaponId: command.weaponId },
        );
      case 'fire': {
        // One accepted shot per turn, ever. A duplicated, delayed or replayed fire
        // command for a turn that already fired is rejected before touching the engine,
        // and a command for any turn other than the live one is stale.
        const engine = this.engine;
        if (this.phase !== 'playing' || engine === undefined) return 'not-accepting-input';
        if (command.turn !== engine.state.turnNumber) return 'stale-turn';
        if (this.lastFiredTurn === engine.state.turnNumber) return 'already-fired';
        return this.withActiveEngine(
          client,
          (eng) => {
            if (!eng.fire()) return 'illegal-action';
            this.lastFiredTurn = eng.state.turnNumber;
            return 'ok';
          },
          { type: 'fire' },
        );
      }
      case 'rematch':
        return this.handleRematch(client);
      case 'leave-room':
        this.leave(sessionId);
        return 'ok';
      default:
        return 'unknown-command';
    }
  }

  private handleReady(client: RoomClient): 'ok' | CommandRejection {
    if (this.phase !== 'lobby') return 'not-ready-phase';
    client.ready = true;
    this.broadcastLobby();
    const players = [...this.clients.values()].filter((entry) => entry.slot !== undefined);
    if (players.length === 2 && players.every((entry) => entry.ready)) this.startMatch();
    return 'ok';
  }

  /** Rematch voting: both seated players must vote; then the match fully resets. */
  private handleRematch(client: RoomClient): 'ok' | CommandRejection {
    if (this.phase !== 'finished') return 'not-finished';
    if (client.slot === undefined) return 'not-in-room';
    this.rematchVotes.add(client.slot);
    this.broadcastRematch();
    const seated = [...this.clients.values()].filter((entry) => entry.slot !== undefined);
    if (
      seated.length === 2 &&
      seated.every((entry) => entry.slot !== undefined && this.rematchVotes.has(entry.slot))
    ) {
      this.startMatch();
    }
    return 'ok';
  }

  /** Gates every gameplay intent: must be playing, your turn, and input-accepting phase. */
  private withActiveEngine(
    client: RoomClient,
    action: (engine: GameEngine) => 'ok' | CommandRejection,
    applied?: AppliedCommandBody,
  ): 'ok' | CommandRejection {
    const engine = this.engine;
    if (this.phase !== 'playing' || engine === undefined) return 'not-accepting-input';
    if (engine.state.activePlayerId !== client.slot) return 'not-your-turn';
    if (!engine.acceptsInput) return 'not-accepting-input';
    const result = action(engine);
    if (result === 'ok') {
      // Append to the indexed log and rebroadcast so every mirror replays the identical
      // stream; the log also replays on reconnect. Snapshots remain the authority check.
      if (applied !== undefined && client.slot !== undefined) {
        const index = this.commandLog.length;
        this.commandLog.push({ slot: client.slot, command: applied });
        this.broadcast(
          serverEvent({ type: 'command-applied', slot: client.slot, index, command: applied }),
        );
      }
      this.broadcastSnapshot();
    }
    return result;
  }

  // -------------------------------------------------------------------------------------
  // Match lifecycle
  // -------------------------------------------------------------------------------------

  /**
   * Starts a match OR a rematch. A rematch constructs a brand-new engine, which resets
   * tank health, terrain, weapon inventories, projectiles and turn order in one step —
   * the engine constructor IS the reset. A fresh deterministic seed varies the map.
   */
  private startMatch(): void {
    this.matchNumber += 1;
    if (this.matchNumber > 1) {
      // Deterministic fresh terrain per rematch; mirrors receive the seed from the
      // match-started event rather than trusting local entropy.
      this.terrainSeed = (Math.imul(this.terrainSeed, 1103515245) + 12345 + this.matchNumber) >>> 0;
    }
    this.commandLog = [];
    this.lastFiredTurn = 0;
    this.rematchVotes.clear();
    // Full depot roster, same as the client's normal arsenal. Mirror engines must be
    // constructed with identical options or determinism breaks.
    this.engine = new GameEngine({
      terrainSeed: this.terrainSeed,
      weapons: FULL_DEPOT_CATALOG,
      ...this.engineOverrides,
    });
    this.phase = 'playing';
    this.broadcast(
      serverEvent({
        type: 'match-started',
        terrainSeed: this.terrainSeed,
        snapshot: this.snapshot(),
      }),
    );
    if (this.ticker !== undefined) clearInterval(this.ticker);
    // Authoritative fixed-rate tick. Events and snapshots flow only from this loop and
    // from accepted commands; the engine never advances from client input directly.
    this.ticker = setInterval(() => this.tick(), 1000 / 20);
  }

  private tick(): void {
    const engine = this.engine;
    if (engine === undefined || this.phase !== 'playing') return;
    const before = engine.state.phase;
    // Advance at the engine's own fixed step. The engine clamps a single update() call,
    // so larger test pacing feeds whole steps one at a time to stay deterministic.
    for (let i = 0; i < this.stepsPerTick; i++) engine.update(1 / SIMULATION_HZ);
    const events = engine.drainEvents();
    if (events.length > 0) this.broadcast(serverEvent({ type: 'combat-events', events }));
    // Send state while a shot resolves, and on any phase boundary.
    if (before === 'projectile' || engine.state.phase !== before) this.broadcastSnapshot();
    if (engine.state.phase === 'game-over') {
      this.finish(engine.state.winnerId ?? null, false);
    }
  }

  private finish(winner: PlayerSlot | null, byForfeit: boolean): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    if (this.ticker !== undefined) clearInterval(this.ticker);
    this.ticker = undefined;
    this.rematchVotes.clear();
    this.broadcastSnapshot();
    this.broadcast(serverEvent({ type: 'match-ended', winner, byForfeit }));
    this.broadcastRematch();
  }

  // -------------------------------------------------------------------------------------
  // Snapshots: serializable, public-only views of authoritative state.
  // -------------------------------------------------------------------------------------

  public lobbySnapshot(): PlayerSnapshot[] {
    const seats: PlayerSnapshot[] = [...this.clients.values()]
      .filter((client) => client.slot !== undefined)
      .map((client) => ({
        slot: client.slot!,
        name: client.name,
        connected: client.connected,
        ready: client.ready,
      }));
    for (const held of this.heldSeats.values()) {
      seats.push({ slot: held.slot, name: held.name, connected: false, ready: true });
    }
    return seats.sort((a, b) => a.slot.localeCompare(b.slot));
  }

  public snapshot(): MatchSnapshot {
    const engine = this.engine;
    if (engine === undefined) {
      return {
        phase: 'lobby',
        turnNumber: 0,
        activeSlot: 'player1',
        wind: 0,
        tanks: [],
        projectiles: [],
        winner: undefined,
      };
    }
    const state = engine.state;
    return {
      phase: state.phase,
      turnNumber: state.turnNumber,
      activeSlot: state.activePlayerId,
      wind: state.wind,
      tanks: state.tanks.map((tank) => ({
        slot: tank.playerId,
        x: tank.x,
        y: tank.groundY,
        health: tank.health,
        angleDegrees: tank.aim.angleDegrees,
        power: tank.aim.power,
        facing: tank.facing,
        movementRemaining: tank.movementRemaining,
        selectedWeaponId: tank.selectedWeaponId,
      })),
      projectiles: state.projectiles.map((projectile) => ({
        id: projectile.id,
        weaponId: projectile.weaponId,
        x: projectile.x,
        y: projectile.y,
      })),
      winner: state.phase === 'game-over' ? (state.winnerId ?? null) : undefined,
    };
  }

  private broadcastLobby(): void {
    this.broadcast(serverEvent({ type: 'lobby', players: this.lobbySnapshot() }));
  }

  private broadcastRematch(): void {
    this.broadcast(serverEvent({ type: 'rematch-state', votes: [...this.rematchVotes] }));
  }

  private broadcastSnapshot(): void {
    this.broadcast(serverEvent({ type: 'snapshot', snapshot: this.snapshot() }));
  }

  private broadcast(event: unknown): void {
    const json = JSON.stringify(event);
    for (const client of this.clients.values()) {
      try {
        client.send(json);
      } catch {
        // A dead socket is cleaned up by its close handler; never break the loop.
      }
    }
  }
}
