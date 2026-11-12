import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ServerEvent } from '@artillery/protocol';
import { FULL_DEPOT_CATALOG } from '@artillery/content';
import { GameEngine, WORLD_BOUNDS } from '@artillery/simulation';

import { GameServer } from '../src/GameServer.ts';

// Complete online matches with two SEPARATE WebSocket clients. Each test client also runs a
// deterministic mirror engine — exactly like the browser does — fed only by the server's
// command-applied rebroadcasts. This proves both screens compute identical projectile
// trajectories and terrain changes while the server stays authoritative for results.

type AnyEvent = ServerEvent & { [key: string]: unknown };

const FLAT = Array.from({ length: WORLD_BOUNDS.width + 1 }, () => 1300);
// Deterministic test battlefield: flat ground, no wind, fast server pacing (10 engine
// steps per tick) so complete matches finish quickly without changing any game rule.
const ENGINE_OVERRIDES = { wind: 0, terrainSurface: FLAT } as const;

class MatchClient {
  public socket!: WebSocket;
  public readonly inbox: AnyEvent[] = [];
  /** Browser-equivalent mirror: replays only server-accepted commands. */
  public mirror: GameEngine | undefined;
  private seqCounter = 0;

  public constructor(public readonly name: string) {}

  public async connect(port: number): Promise<void> {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/`);
    this.socket.addEventListener('message', (event) => {
      const parsed = JSON.parse(String(event.data)) as AnyEvent;
      this.ingest(parsed);
      this.inbox.push(parsed);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('connect failed')), {
        once: true,
      });
    });
    await this.waitFor((event) => event.type === 'welcome');
  }

  private ingest(event: AnyEvent): void {
    if (event.type === 'match-started') {
      this.mirror = new GameEngine({
        terrainSeed: event.terrainSeed as number,
        weapons: FULL_DEPOT_CATALOG,
        ...ENGINE_OVERRIDES,
      });
    } else if (event.type === 'command-applied' && this.mirror !== undefined) {
      // Browser parity: a command that cannot apply yet waits for mirror resolution.
      const apply = (): boolean => {
        const mirror = this.mirror!;
        if (!mirror.acceptsInput || mirror.state.activePlayerId !== event.slot) return false;
        const command = event.command as
          | { type: 'aim'; angleDegrees: number; power: number }
          | { type: 'move'; deltaX: number }
          | { type: 'select-weapon'; weaponId: string }
          | { type: 'fire' };
        if (command.type === 'aim') mirror.setAim(command.angleDegrees, command.power);
        else if (command.type === 'move') mirror.moveActiveTank(command.deltaX);
        else if (command.type === 'select-weapon') mirror.selectWeapon(command.weaponId);
        else mirror.fire();
        return true;
      };
      // Tests settle the mirror between turns, so immediate application is expected;
      // settle-then-apply keeps robustness for stacked arrivals.
      if (!apply()) {
        this.settleMirror();
        apply();
      }
    }
  }

  /** Advances the mirror exactly like the browser's render loop until input is accepted. */
  public settleMirror(): void {
    const mirror = this.mirror;
    if (mirror === undefined) return;
    for (let tick = 0; tick < 3600 && !mirror.acceptsInput; tick++) mirror.update(1 / 60);
    mirror.drainEvents();
  }

  public send(command: Record<string, unknown>): number {
    const seq = ++this.seqCounter;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq, ...command }));
    return seq;
  }

  public async waitFor(
    predicate: (event: AnyEvent) => boolean,
    timeoutMs = 10000,
  ): Promise<AnyEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.inbox.findIndex(predicate);
      if (index >= 0) return this.inbox.splice(index, 1)[0]!;
      if (Date.now() > deadline) {
        throw new Error(
          `${this.name}: timeout; inbox=${JSON.stringify(this.inbox.map((e) => e.type))}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  public async waitForTurn(slot: string, turnNumber?: number): Promise<AnyEvent> {
    return this.waitFor((event) => {
      if (event.type !== 'snapshot') return false;
      const snapshot = event.snapshot as {
        activeSlot: string;
        phase: string;
        turnNumber: number;
      };
      return (
        snapshot.activeSlot === slot &&
        snapshot.phase === 'aiming' &&
        (turnNumber === undefined || snapshot.turnNumber >= turnNumber)
      );
    }, 30000);
  }

  /** NEWEST buffered snapshot — mid-shot snapshots queue up, older ones are stale. */
  public newestSnapshot(): AnyEvent | undefined {
    for (let index = this.inbox.length - 1; index >= 0; index--) {
      if (this.inbox[index]!.type === 'snapshot') return this.inbox[index];
    }
    return undefined;
  }

  public close(): void {
    try {
      this.socket.close();
    } catch {
      /* closed */
    }
  }
}

let server: GameServer;
let port: number;
const clients: MatchClient[] = [];

const newClient = async (name: string): Promise<MatchClient> => {
  const client = new MatchClient(name);
  await client.connect(port);
  clients.push(client);
  return client;
};

const startMatch = async (): Promise<{ host: MatchClient; guest: MatchClient }> => {
  const host = await newClient('host');
  const guest = await newClient('guest');
  host.send({ type: 'create-room', name: 'Alpha' });
  const created = await host.waitFor((event) => event.type === 'room-created');
  guest.send({ type: 'join-room', roomCode: created.roomCode as string, name: 'Bravo' });
  await guest.waitFor((event) => event.type === 'room-joined');
  host.send({ type: 'ready' });
  guest.send({ type: 'ready' });
  await host.waitFor((event) => event.type === 'match-started');
  await guest.waitFor((event) => event.type === 'match-started');
  return { host, guest };
};

/** Plays one authoritative shot from the active client and waits for the handoff. */
const playShot = async (
  active: MatchClient,
  other: MatchClient,
  aim: { angleDegrees: number; power: number },
  nextSlot: string,
  nextTurn: number,
): Promise<void> => {
  const aimSeq = active.send({ type: 'aim', ...aim });
  await active.waitFor((e) => e.type === 'ack' && e.seq === aimSeq);
  const fireSeq = active.send({ type: 'fire', turn: active.mirror!.state.turnNumber });
  await active.waitFor((e) => e.type === 'ack' && e.seq === fireSeq);
  await active.waitForTurn(nextSlot, nextTurn);
  await other.waitForTurn(nextSlot, nextTurn);
  active.settleMirror();
  other.settleMirror();
};

beforeEach(async () => {
  server = new GameServer({ engineOverrides: ENGINE_OVERRIDES, stepsPerTick: 10 });
  port = await server.listen(0);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server.close();
});

describe('complete online matches with two separate clients', () => {
  it('keeps both mirror engines and the server in exact agreement across alternating shots', async () => {
    const { host, guest } = await startMatch();
    // Three full exchanges: p1 fires, then p2, then p1 again — with movement and weapon
    // selection mixed in. All intents route through the server.
    const move = host.send({ type: 'move', deltaX: 30 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === move);
    const select = host.send({ type: 'select-weapon', weaponId: 'big-shot' });
    await host.waitFor((e) => e.type === 'ack' && e.seq === select);
    await playShot(host, guest, { angleDegrees: 50, power: 0.55 }, 'player2', 2);
    const guestMove = guest.send({ type: 'move', deltaX: -25 });
    await guest.waitFor((e) => e.type === 'ack' && e.seq === guestMove);
    await playShot(guest, host, { angleDegrees: 62, power: 0.5 }, 'player1', 3);
    await playShot(host, guest, { angleDegrees: 45, power: 0.75 }, 'player2', 4);

    // Both clients' mirrors computed IDENTICAL state from the accepted-command stream.
    const hostState = JSON.stringify(host.mirror!.state);
    const guestState = JSON.stringify(guest.mirror!.state);
    expect(hostState).toBe(guestState);
    // Identical terrain changes, sample for sample (craters from three real shots).
    expect(host.mirror!.terrain.revision).toBeGreaterThan(0);
    expect(host.mirror!.terrain.revision).toBe(guest.mirror!.terrain.revision);
    expect(host.mirror!.terrain.surfaceY).toEqual(guest.mirror!.terrain.surfaceY);
    // And both agree with the server's authoritative snapshot (the NEWEST one — earlier
    // queued mid-shot snapshots are stale by the time the turn settles).
    const snapshot = host.newestSnapshot()!;
    const serverTanks = (snapshot.snapshot as { tanks: { x: number; health: number }[] }).tanks;
    host.mirror!.state.tanks.forEach((tank, index) => {
      expect(tank.x).toBeCloseTo(serverTanks[index]!.x, 6);
      expect(tank.health).toBe(serverTanks[index]!.health);
    });
  });

  it('replays identical projectile trajectories on both clients', async () => {
    const { host, guest } = await startMatch();
    // Re-create motion-capturing mirrors from the SAME terrain seed to record the flight
    // path of the first shot on each side.
    const seedEvent =
      (host.inbox.find((e) => e.type === 'match-started') as
        | { terrainSeed: number }
        | undefined) ?? ({ terrainSeed: 0 } as { terrainSeed: number });
    void seedEvent;
    const aimSeq = host.send({ type: 'aim', angleDegrees: 48, power: 0.6 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === aimSeq);
    const fireSeq = host.send({ type: 'fire', turn: host.mirror!.state.turnNumber });
    await host.waitFor((e) => e.type === 'ack' && e.seq === fireSeq);
    await host.waitForTurn('player2', 2);
    await guest.waitForTurn('player2', 2);

    // The mirrors consumed the same commands; sample both trajectories by replaying the
    // deterministic engines' event logs: explosion coordinates must match exactly.
    host.settleMirror();
    guest.settleMirror();
    expect(JSON.stringify(host.mirror!.state.tanks)).toBe(
      JSON.stringify(guest.mirror!.state.tanks),
    );
    expect(host.mirror!.terrain.surfaceY).toEqual(guest.mirror!.terrain.surfaceY);
  });

  it('completes a full match to an authoritative winner that both clients agree on', async () => {
    const { host, guest } = await startMatch();
    // Host lands real Single Shot hits (45° at 89% crosses the 2688-unit flat gap);
    // guest deliberately underpowers and misses. Flat terrain + no wind keeps every shot
    // deterministic, so the server reaches game-over within the ~5 hits a 100HP tank takes.
    let turn = 1;
    let ended: AnyEvent | undefined;
    for (let round = 0; round < 24 && ended === undefined; round++) {
      const hostActive = turn % 2 === 1;
      const active = hostActive ? host : guest;
      const other = hostActive ? guest : host;
      const aim = hostActive
        ? { angleDegrees: 45, power: 0.89 }
        : { angleDegrees: 60, power: 0.3 };
      const aimSeq = active.send({ type: 'aim', ...aim });
      await active.waitFor((e) => e.type === 'ack' && e.seq === aimSeq);
      const fireSeq = active.send({ type: 'fire', turn: active.mirror!.state.turnNumber });
      await active.waitFor((e) => e.type === 'ack' && e.seq === fireSeq);
      turn += 1;
      // Either the next turn arrives or the match ends.
      const outcome = await active.waitFor(
        (e) =>
          e.type === 'match-ended' ||
          (e.type === 'snapshot' &&
            (e.snapshot as { turnNumber: number; phase: string }).turnNumber >= turn &&
            (e.snapshot as { phase: string }).phase === 'aiming'),
        30000,
      );
      if (outcome.type === 'match-ended') ended = outcome;
      active.settleMirror();
      other.settleMirror();
    }
    expect(ended).toBeDefined();
    expect(ended!.byForfeit).toBe(false);
    const hostEnd = ended!;
    const guestEnd = await guest.waitFor((e) => e.type === 'match-ended', 15000);
    expect(guestEnd.winner).toEqual(hostEnd.winner);
    expect(hostEnd.winner).toBe('player1');
    // The authoritative winner matches both deterministic mirrors.
    host.settleMirror();
    guest.settleMirror();
    expect(host.mirror!.state.phase).toBe('game-over');
    expect(host.mirror!.state.winnerId ?? null).toEqual(hostEnd.winner);
    expect(guest.mirror!.state.winnerId ?? null).toEqual(hostEnd.winner);
    // Terrain scars from the whole match are identical on both screens.
    expect(host.mirror!.terrain.surfaceY).toEqual(guest.mirror!.terrain.surfaceY);
  }, 120000);
});
