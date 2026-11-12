// Session and room management over the dependency-free WebSocket transport.
// Every inbound message is size-capped, JSON-parsed, structurally validated by the
// protocol package, rate-limited, then routed to the authoritative room. All rejections
// are explicit typed events; malformed traffic never reaches game logic.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import type { Duplex } from 'node:stream';

import {
  COMMAND_LIMITS,
  parseClientCommand,
  serverEvent,
  PROTOCOL_VERSION,
  type ClientCommand,
  type CommandRejection,
} from '@artillery/protocol';

import { ArtilleryRoom, type RoomClient } from './ArtilleryRoom.ts';
import { acceptUpgrade, type ServerSocket } from './websocket.ts';

interface Session {
  readonly id: string;
  readonly socket: ServerSocket;
  readonly client: RoomClient;
  /** Secret token a reconnecting transport presents to reclaim this session's seat. */
  readonly resumeToken: string;
  room: ArtilleryRoom | undefined;
  /** Sliding command-rate window. */
  windowStart: number;
  windowCount: number;
}

const RATE_LIMIT = Object.freeze({ windowMs: 1000, maxCommands: 30 });
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** An idle lobby room (no match, nobody connected/held) is reaped after this long. */
const ABANDONED_ROOM_SWEEP_MS = 30_000;

export interface GameServerOptions {
  /** Test hook forwarded to every room: deterministic engine overrides. */
  readonly engineOverrides?: ConstructorParameters<typeof ArtilleryRoom>[2];
  /** Engine steps per network tick; 3 = real time, larger values fast-forward tests. */
  readonly stepsPerTick?: number;
  /** Seconds a dropped player's seat is held before forfeiting. */
  readonly graceSeconds?: number;
}

export class GameServer {
  public readonly http: Server;
  private readonly sessions = new Map<string, Session>();
  private readonly rooms = new Map<string, ArtilleryRoom>();
  /** Lobby rooms with nobody present, candidate-stamped for the abandonment sweep. */
  private readonly abandonedSince = new Map<string, number>();
  private sweeper: ReturnType<typeof setInterval> | undefined;

  public constructor(private readonly options: GameServerOptions = {}) {
    this.http = createServer((request, response) => {
      // Health/readiness endpoint for hosting probes; everything else is the WS upgrade.
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            ok: true,
            protocolVersion: PROTOCOL_VERSION,
            rooms: this.rooms.size,
            sessions: this.sessions.size,
          }),
        );
        return;
      }
      response.writeHead(426, { 'content-type': 'text/plain' });
      response.end('WebSocket upgrade required');
    });
    this.http.on('upgrade', (request, stream) => this.accept(request, stream));
  }

  public listen(port: number, host = '127.0.0.1'): Promise<number> {
    // Abandoned-room sweep: a lobby room nobody occupies (no sockets, no held seats) is
    // disposed after ABANDONED_ROOM_SWEEP_MS so dead codes cannot accumulate forever.
    this.sweeper ??= setInterval(() => this.sweepAbandonedRooms(), 5000);
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(port, host, () => {
        const address = this.http.address();
        resolve(typeof address === 'object' && address !== null ? address.port : port);
      });
    });
  }

  public async close(): Promise<void> {
    if (this.sweeper !== undefined) clearInterval(this.sweeper);
    this.sweeper = undefined;
    for (const session of this.sessions.values()) session.socket.close();
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.sessions.clear();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  private sweepAbandonedRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty) {
        const since = this.abandonedSince.get(code);
        if (since === undefined) this.abandonedSince.set(code, now);
        else if (now - since > ABANDONED_ROOM_SWEEP_MS) {
          room.dispose();
          this.rooms.delete(code);
          this.abandonedSince.delete(code);
        }
      } else {
        this.abandonedSince.delete(code);
      }
    }
  }

  // -------------------------------------------------------------------------------------

  private accept(request: IncomingMessage, stream: Duplex): void {
    const sessionId = randomBytes(8).toString('hex');
    const resumeToken = randomBytes(16).toString('hex');
    const socket = acceptUpgrade(request, stream, COMMAND_LIMITS.maxMessageBytes, {
      onMessage: (text) => this.route(sessionId, text),
      onClose: () => this.drop(sessionId),
      onViolation: () => this.drop(sessionId),
    });
    if (socket === undefined) return;
    const client: RoomClient = {
      sessionId,
      name: 'Player',
      slot: undefined,
      ready: false,
      connected: true,
      send: (json) => socket.send(json),
    };
    this.sessions.set(sessionId, {
      id: sessionId,
      socket,
      client,
      resumeToken,
      room: undefined,
      windowStart: Date.now(),
      windowCount: 0,
    });
    socket.send(
      JSON.stringify(
        serverEvent({
          type: 'welcome',
          sessionId,
          protocolVersion: PROTOCOL_VERSION,
          resumeToken,
        }),
      ),
    );
  }

  /**
   * Transport closed without an explicit leave. During a match the room holds the seat
   * under the session's resume token so the player can reconnect within the grace period.
   */
  private drop(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return;
    this.sessions.delete(sessionId);
    session.room?.handleDisconnect(sessionId, session.resumeToken);
    this.reapRoom(session.room);
  }

  private reapRoom(room: ArtilleryRoom | undefined): void {
    if (room !== undefined && room.isEmpty) {
      room.dispose();
      this.rooms.delete(room.code);
    }
  }

  private route(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return;
    const reject = (seq: number, reason: Parameters<typeof this.rejectEvent>[1]): void =>
      session.socket.send(this.rejectEvent(seq, reason));

    // Rate limit before any parsing beyond byte size (transport already capped size).
    const now = Date.now();
    if (now - session.windowStart > RATE_LIMIT.windowMs) {
      session.windowStart = now;
      session.windowCount = 0;
    }
    session.windowCount += 1;
    if (session.windowCount > RATE_LIMIT.maxCommands) return reject(-1, 'rate-limited');

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reject(-1, 'malformed');
    }
    const parsed = parseClientCommand(raw);
    if (!parsed.ok) {
      const seq =
        typeof raw === 'object' && raw !== null && typeof (raw as { seq?: unknown }).seq === 'number'
          ? ((raw as { seq: number }).seq)
          : -1;
      return reject(seq, parsed.reason);
    }
    this.execute(session, parsed.command);
  }

  private execute(session: Session, command: ClientCommand): void {
    const send = (event: unknown): void => session.socket.send(JSON.stringify(event));
    switch (command.type) {
      case 'ping':
        // Latency probe answered immediately; never routed into room/game logic.
        return send(serverEvent({ type: 'pong', seq: command.seq, sentAt: command.sentAt }));
      case 'reconnect': {
        if (session.room !== undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'already-in-room' }));
        const room = this.rooms.get(command.roomCode);
        const resumed = room?.resume(session.client, command.resumeToken);
        if (room === undefined || resumed === undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'invalid-resume' }));
        session.room = room;
        return send(
          serverEvent({
            type: 'resumed',
            seq: command.seq,
            roomCode: room.code,
            slot: resumed.slot,
            players: resumed.players,
            phase: resumed.phase,
            terrainSeed: resumed.terrainSeed,
            commandLog: resumed.commandLog,
            snapshot: resumed.snapshot,
          }),
        );
      }
      case 'create-room': {
        if (session.room !== undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'already-in-room' }));
        const room = new ArtilleryRoom(
          this.newRoomCode(),
          randomInt(0, 2 ** 31),
          this.options.engineOverrides ?? {},
          this.options.stepsPerTick ?? 3,
          this.options.graceSeconds ?? 30,
        );
        this.rooms.set(room.code, room);
        session.client.name = command.name;
        const slot = room.join(session.client)!;
        session.room = room;
        return send(
          serverEvent({ type: 'room-created', seq: command.seq, roomCode: room.code, slot }),
        );
      }
      case 'join-room': {
        if (session.room !== undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'already-in-room' }));
        const room = this.rooms.get(command.roomCode);
        if (room === undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'room-not-found' }));
        session.client.name = command.name;
        const slot = room.join(session.client);
        if (slot === undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'room-full' }));
        session.room = room;
        return send(
          serverEvent({
            type: 'room-joined',
            seq: command.seq,
            roomCode: room.code,
            slot,
            players: room.lobbySnapshot(),
          }),
        );
      }
      default: {
        const room = session.room;
        if (room === undefined)
          return send(serverEvent({ type: 'rejected', seq: command.seq, reason: 'not-in-room' }));
        const result = room.handle(session.id, command);
        if (command.type === 'leave-room') {
          session.room = undefined;
          this.reapRoom(room);
        }
        return send(
          result === 'ok'
            ? serverEvent({ type: 'ack', seq: command.seq })
            : serverEvent({ type: 'rejected', seq: command.seq, reason: result }),
        );
      }
    }
  }

  private rejectEvent(seq: number, reason: CommandRejection): string {
    return JSON.stringify(serverEvent({ type: 'rejected', seq, reason }));
  }

  private newRoomCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < COMMAND_LIMITS.roomCodeLength; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
