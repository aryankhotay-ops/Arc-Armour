// Versioned client/server contract for online play (Milestone 12, started 2026-11-10).
// Pure serializable types and runtime validators: no Phaser, DOM, or Node APIs, so both
// the browser client and the authoritative server can import this package.
//
// Trust model: clients send INTENTS only (aim, move, select, fire). The server runs the
// shared deterministic GameEngine and owns damage, health, terrain, projectiles and match
// results. There is deliberately NO command that carries health/damage/result values, so a
// client cannot even express an authoritative-state forgery; unknown types are rejected.

export const PROTOCOL_VERSION = 3;

export type RuntimeMode = 'local' | 'online';

export interface ProtocolIdentity {
  readonly protocolVersion: number;
  readonly runtimeMode: RuntimeMode;
}

export type PlayerSlot = 'player1' | 'player2';

// ---------------------------------------------------------------------------------------
// Client -> server commands
// ---------------------------------------------------------------------------------------

export interface CommandBase {
  readonly v: number;
  /** Client-chosen sequence number echoed in acks/rejections for request correlation. */
  readonly seq: number;
}

export interface CreateRoomCommand extends CommandBase {
  readonly type: 'create-room';
  readonly name: string;
}

export interface JoinRoomCommand extends CommandBase {
  readonly type: 'join-room';
  readonly roomCode: string;
  readonly name: string;
}

export interface ReadyCommand extends CommandBase {
  readonly type: 'ready';
}

/** Absolute aim values; the server clamps to engine limits. */
export interface AimCommand extends CommandBase {
  readonly type: 'aim';
  readonly angleDegrees: number;
  readonly power: number;
}

/** Bounded relative movement; the engine enforces the per-turn allowance and slopes. */
export interface MoveCommand extends CommandBase {
  readonly type: 'move';
  readonly deltaX: number;
}

export interface SelectWeaponCommand extends CommandBase {
  readonly type: 'select-weapon';
  readonly weaponId: string;
}

/**
 * Firing carries the turn number the client believes it is acting in. The server accepts
 * at most ONE shot per turn, so a duplicated/replayed/delayed fire command (network retry,
 * double-tap, malicious replay) can never launch a second volley.
 */
export interface FireCommand extends CommandBase {
  readonly type: 'fire';
  readonly turn: number;
}

export interface LeaveRoomCommand extends CommandBase {
  readonly type: 'leave-room';
}

/** Round-trip latency probe; the server echoes `sentAt` immediately in a pong event. */
export interface PingCommand extends CommandBase {
  readonly type: 'ping';
  readonly sentAt: number;
}

/**
 * Resume a live session after a transport drop. The token was issued in `welcome`; on
 * success the server re-binds the seat and replays the accepted-command log so the
 * deterministic mirror can rebuild the exact match state.
 */
export interface ReconnectCommand extends CommandBase {
  readonly type: 'reconnect';
  readonly roomCode: string;
  readonly resumeToken: string;
}

/** Post-match rematch vote; the match restarts when both players have voted. */
export interface RematchCommand extends CommandBase {
  readonly type: 'rematch';
}

export type ClientCommand =
  | CreateRoomCommand
  | JoinRoomCommand
  | ReadyCommand
  | AimCommand
  | MoveCommand
  | SelectWeaponCommand
  | FireCommand
  | LeaveRoomCommand
  | PingCommand
  | ReconnectCommand
  | RematchCommand;

export const CLIENT_COMMAND_TYPES: readonly ClientCommand['type'][] = [
  'create-room',
  'join-room',
  'ready',
  'aim',
  'move',
  'select-weapon',
  'fire',
  'leave-room',
  'ping',
  'reconnect',
  'rematch',
];

/** Hard input-size limits enforced before any game logic sees a command. */
export const COMMAND_LIMITS = Object.freeze({
  maxMessageBytes: 4096,
  maxNameLength: 24,
  maxWeaponIdLength: 64,
  roomCodeLength: 4,
  /** Largest single move intent; repeated commands still obey the engine allowance. */
  maxMoveDelta: 40,
});

export type CommandRejection =
  | 'malformed'
  | 'unsupported-version'
  | 'unknown-command'
  | 'invalid-field'
  | 'not-in-room'
  | 'already-in-room'
  | 'room-not-found'
  | 'room-full'
  | 'not-ready-phase'
  | 'not-your-turn'
  | 'not-accepting-input'
  | 'illegal-action'
  | 'rate-limited'
  | 'stale-turn'
  | 'already-fired'
  | 'invalid-resume'
  | 'not-finished';

/**
 * Structural validation only (shape, types, bounds). Session/turn legality is the server
 * room's job. Returns the typed command or a rejection reason, never throws.
 */
export const parseClientCommand = (
  raw: unknown,
): { ok: true; command: ClientCommand } | { ok: false; reason: CommandRejection } => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'malformed' };
  }
  const record = raw as Record<string, unknown>;
  if (record.v !== PROTOCOL_VERSION) return { ok: false, reason: 'unsupported-version' };
  if (typeof record.seq !== 'number' || !Number.isFinite(record.seq)) {
    return { ok: false, reason: 'malformed' };
  }
  const type = record.type;
  if (typeof type !== 'string' || !(CLIENT_COMMAND_TYPES as readonly string[]).includes(type)) {
    return { ok: false, reason: 'unknown-command' };
  }
  const str = (key: string, max: number): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 && value.length <= max
      ? value
      : undefined;
  };
  const num = (key: string): number | undefined => {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  switch (type) {
    case 'create-room': {
      const name = str('name', COMMAND_LIMITS.maxNameLength);
      if (name === undefined) return { ok: false, reason: 'invalid-field' };
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type, name } };
    }
    case 'join-room': {
      const name = str('name', COMMAND_LIMITS.maxNameLength);
      const roomCode = str('roomCode', COMMAND_LIMITS.roomCodeLength);
      if (name === undefined || roomCode === undefined || roomCode.length !== 4) {
        return { ok: false, reason: 'invalid-field' };
      }
      return {
        ok: true,
        command: {
          v: PROTOCOL_VERSION,
          seq: record.seq,
          type,
          roomCode: roomCode.toUpperCase(),
          name,
        },
      };
    }
    case 'aim': {
      const angleDegrees = num('angleDegrees');
      const power = num('power');
      if (angleDegrees === undefined || power === undefined) {
        return { ok: false, reason: 'invalid-field' };
      }
      return {
        ok: true,
        command: { v: PROTOCOL_VERSION, seq: record.seq, type, angleDegrees, power },
      };
    }
    case 'move': {
      const deltaX = num('deltaX');
      if (deltaX === undefined || Math.abs(deltaX) > COMMAND_LIMITS.maxMoveDelta) {
        return { ok: false, reason: 'invalid-field' };
      }
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type, deltaX } };
    }
    case 'select-weapon': {
      const weaponId = str('weaponId', COMMAND_LIMITS.maxWeaponIdLength);
      if (weaponId === undefined) return { ok: false, reason: 'invalid-field' };
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type, weaponId } };
    }
    case 'fire': {
      const turn = num('turn');
      if (turn === undefined || !Number.isInteger(turn) || turn < 1) {
        return { ok: false, reason: 'invalid-field' };
      }
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type, turn } };
    }
    case 'ping': {
      const sentAt = num('sentAt');
      if (sentAt === undefined) return { ok: false, reason: 'invalid-field' };
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type, sentAt } };
    }
    case 'reconnect': {
      const roomCode = str('roomCode', COMMAND_LIMITS.roomCodeLength);
      const resumeToken = str('resumeToken', 64);
      if (roomCode === undefined || roomCode.length !== 4 || resumeToken === undefined) {
        return { ok: false, reason: 'invalid-field' };
      }
      return {
        ok: true,
        command: {
          v: PROTOCOL_VERSION,
          seq: record.seq,
          type,
          roomCode: roomCode.toUpperCase(),
          resumeToken,
        },
      };
    }
    case 'ready':
    case 'leave-room':
    case 'rematch':
      return { ok: true, command: { v: PROTOCOL_VERSION, seq: record.seq, type } };
    default:
      return { ok: false, reason: 'unknown-command' };
  }
};

// ---------------------------------------------------------------------------------------
// Server -> client events
// ---------------------------------------------------------------------------------------

/** Public per-player state. Server-private data (sockets, tokens) never appears here. */
export interface PlayerSnapshot {
  readonly slot: PlayerSlot;
  readonly name: string;
  readonly connected: boolean;
  readonly ready: boolean;
}

export interface TankSnapshot {
  readonly slot: PlayerSlot;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly angleDegrees: number;
  readonly power: number;
  readonly facing: 1 | -1;
  readonly movementRemaining: number;
  readonly selectedWeaponId: string;
}

export interface ProjectileSnapshot {
  readonly id: number;
  readonly weaponId: string;
  readonly x: number;
  readonly y: number;
}

/** Authoritative per-tick view. Terrain is sent once at start plus deform deltas. */
export interface MatchSnapshot {
  readonly phase: string;
  readonly turnNumber: number;
  readonly activeSlot: PlayerSlot;
  readonly wind: number;
  readonly tanks: readonly TankSnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly winner: PlayerSlot | null | undefined;
}

/** Body of an accepted gameplay command, shared by live rebroadcast and resume replay. */
export type AppliedCommandBody =
  | { readonly type: 'aim'; readonly angleDegrees: number; readonly power: number }
  | { readonly type: 'move'; readonly deltaX: number }
  | { readonly type: 'select-weapon'; readonly weaponId: string }
  | { readonly type: 'fire' };

export type ServerEvent =
  | {
      readonly v: number;
      readonly type: 'welcome';
      readonly sessionId: string;
      readonly protocolVersion: number;
      /** Secret resume token for this session; present it to reclaim a seat after a drop. */
      readonly resumeToken: string;
    }
  | {
      readonly v: number;
      readonly type: 'pong';
      readonly seq: number;
      /** Echo of the client clock from the ping; latency = now - sentAt on the client. */
      readonly sentAt: number;
    }
  | {
      readonly v: number;
      /** Opponent transport dropped; the server holds their seat for `graceSeconds`. */
      readonly type: 'opponent-disconnected';
      readonly slot: PlayerSlot;
      readonly graceSeconds: number;
    }
  | {
      readonly v: number;
      readonly type: 'opponent-reconnected';
      readonly slot: PlayerSlot;
    }
  | {
      readonly v: number;
      /** Successful resume: everything needed to rebuild the deterministic mirror. */
      readonly type: 'resumed';
      readonly seq: number;
      readonly roomCode: string;
      readonly slot: PlayerSlot;
      readonly players: readonly PlayerSnapshot[];
      readonly phase: string;
      readonly terrainSeed: number;
      /** Full accepted-command log since match start, for mirror replay. */
      readonly commandLog: readonly {
        readonly slot: PlayerSlot;
        readonly command: AppliedCommandBody;
      }[];
      readonly snapshot: MatchSnapshot | null;
    }
  | {
      readonly v: number;
      /** Post-match rematch voting state; updates as votes arrive. */
      readonly type: 'rematch-state';
      readonly votes: readonly PlayerSlot[];
    }
  | {
      readonly v: number;
      readonly type: 'room-created';
      readonly seq: number;
      readonly roomCode: string;
      readonly slot: PlayerSlot;
    }
  | {
      readonly v: number;
      readonly type: 'room-joined';
      readonly seq: number;
      readonly roomCode: string;
      readonly slot: PlayerSlot;
      readonly players: readonly PlayerSnapshot[];
    }
  | {
      readonly v: number;
      readonly type: 'lobby';
      readonly players: readonly PlayerSnapshot[];
    }
  | {
      readonly v: number;
      readonly type: 'match-started';
      readonly terrainSeed: number;
      readonly snapshot: MatchSnapshot;
    }
  | { readonly v: number; readonly type: 'snapshot'; readonly snapshot: MatchSnapshot }
  | {
      readonly v: number;
      readonly type: 'combat-events';
      /** Serialized authoritative CombatEvent list drained from the server engine. */
      readonly events: readonly unknown[];
    }
  | {
      readonly v: number;
      readonly type: 'ack';
      readonly seq: number;
    }
  | {
      readonly v: number;
      /**
       * A gameplay intent the server ACCEPTED, rebroadcast to every client in the room.
       * Clients replay these into their deterministic mirror engines, so both screens
       * compute identical projectile trajectories and terrain changes while the server
       * engine remains the authority for damage, health and results.
       */
      readonly type: 'command-applied';
      readonly slot: PlayerSlot;
      /** Position in the room's accepted-command log; lets clients detect gaps/replays. */
      readonly index: number;
      readonly command: AppliedCommandBody;
    }
  | {
      readonly v: number;
      readonly type: 'rejected';
      readonly seq: number;
      readonly reason: CommandRejection;
    }
  | {
      readonly v: number;
      readonly type: 'player-left';
      readonly slot: PlayerSlot;
    }
  | {
      readonly v: number;
      readonly type: 'match-ended';
      readonly winner: PlayerSlot | null;
      readonly byForfeit: boolean;
    };

/** Distributes Omit over the event union so each variant keeps its own fields. */
type WithoutVersion<T> = T extends { v: number } ? Omit<T, 'v'> : never;

export const serverEvent = <T extends WithoutVersion<ServerEvent>>(
  event: T,
): T & { v: number } => ({
  v: PROTOCOL_VERSION,
  ...event,
});
