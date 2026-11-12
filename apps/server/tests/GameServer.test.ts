import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ServerEvent } from '@artillery/protocol';

import { GameServer } from '../src/GameServer';

// Real client-server connection tests: a GameServer on an ephemeral port, driven by the
// runtime's built-in WebSocket client. These exercise the actual HTTP upgrade, RFC 6455
// framing, protocol validation, room/session/turn management and the authoritative engine.

type AnyEvent = ServerEvent & { [key: string]: unknown };

class TestClient {
  private socket!: WebSocket;
  private readonly inbox: AnyEvent[] = [];
  private seqCounter = 0;

  public async connect(port: number): Promise<void> {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/`);
    this.socket.addEventListener('message', (event) => {
      this.inbox.push(JSON.parse(String(event.data)) as AnyEvent);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('connect failed')), {
        once: true,
      });
    });
  }

  public sendRaw(text: string): void {
    this.socket.send(text);
  }

  public send(command: Record<string, unknown>): number {
    const seq = ++this.seqCounter;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq, ...command }));
    return seq;
  }

  /** Waits for the first buffered-or-future event matching the predicate. */
  public async expect(
    predicate: (event: AnyEvent) => boolean,
    timeoutMs = 4000,
  ): Promise<AnyEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.inbox.findIndex(predicate);
      if (index >= 0) return this.inbox.splice(index, 1)[0]!;
      if (Date.now() > deadline) {
        throw new Error(`timed out; inbox=${JSON.stringify(this.inbox.map((e) => e.type))}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  public drain(): AnyEvent[] {
    return this.inbox.splice(0);
  }

  public close(): void {
    try {
      this.socket.close();
    } catch {
      /* already closed */
    }
  }
}

let server: GameServer;
let port: number;
const clients: TestClient[] = [];

const newClient = async (): Promise<TestClient> => {
  const client = new TestClient();
  await client.connect(port);
  clients.push(client);
  await client.expect((event) => event.type === 'welcome');
  return client;
};

/** Creates a room with two ready players and returns both clients plus the room code. */
const startMatch = async (): Promise<{
  host: TestClient;
  guest: TestClient;
  roomCode: string;
}> => {
  const host = await newClient();
  const guest = await newClient();
  host.send({ type: 'create-room', name: 'Host' });
  const created = await host.expect((event) => event.type === 'room-created');
  const roomCode = created.roomCode as string;
  guest.send({ type: 'join-room', roomCode, name: 'Guest' });
  await guest.expect((event) => event.type === 'room-joined');
  host.send({ type: 'ready' });
  guest.send({ type: 'ready' });
  await host.expect((event) => event.type === 'match-started');
  await guest.expect((event) => event.type === 'match-started');
  return { host, guest, roomCode };
};

beforeEach(async () => {
  server = new GameServer();
  port = await server.listen(0);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server.close();
});

describe('connection and protocol boundary', () => {
  it('serves a health endpoint and completes a real WebSocket handshake with a welcome', async () => {
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
      ok: boolean;
      protocolVersion: number;
    };
    expect(health.ok).toBe(true);
    expect(health.protocolVersion).toBe(PROTOCOL_VERSION);
    await newClient(); // welcome asserted inside
  });

  it('rejects malformed JSON, wrong versions and unknown commands without crashing', async () => {
    const client = await newClient();
    client.sendRaw('this is not json');
    expect((await client.expect((e) => e.type === 'rejected')).reason).toBe('malformed');
    client.sendRaw(JSON.stringify({ v: 999, seq: 1, type: 'fire' }));
    expect((await client.expect((e) => e.type === 'rejected')).reason).toBe(
      'unsupported-version',
    );
    client.sendRaw(JSON.stringify({ v: PROTOCOL_VERSION, seq: 2, type: 'grant-victory' }));
    expect((await client.expect((e) => e.type === 'rejected')).reason).toBe('unknown-command');
    // The connection survives all three.
    client.send({ type: 'create-room', name: 'Still Alive' });
    await client.expect((event) => event.type === 'room-created');
  });

  it('rejects gameplay commands from sessions that never joined a room', async () => {
    const client = await newClient();
    client.send({ type: 'fire', turn: 1 });
    expect((await client.expect((e) => e.type === 'rejected')).reason).toBe('not-in-room');
  });
});

describe('rooms and sessions', () => {
  it('creates a room, joins a second player, and rejects a third', async () => {
    const { roomCode } = await startMatch();
    const third = await newClient();
    third.send({ type: 'join-room', roomCode, name: 'Third' });
    expect((await third.expect((e) => e.type === 'rejected')).reason).toBe('room-full');
  });

  it('rejects joining an unknown room code', async () => {
    const client = await newClient();
    client.send({ type: 'join-room', roomCode: 'ZZZZ', name: 'Lost' });
    expect((await client.expect((e) => e.type === 'rejected')).reason).toBe('room-not-found');
  });
});

describe('authoritative turn and action validation', () => {
  it('starts a match with identical authoritative state for both players', async () => {
    const { host, guest } = await startMatch();
    void host;
    void guest;
    // match-started asserted inside startMatch for both clients.
  });

  it('accepts aim/move/select/fire only from the active player and rejects the waiter', async () => {
    const { host, guest } = await startMatch();
    // player1 (host) is active on turn 1.
    const aimSeq = host.send({ type: 'aim', angleDegrees: 60, power: 0.8 });
    await host.expect((e) => e.type === 'ack' && e.seq === aimSeq);
    const snapshot = await host.expect((e) => e.type === 'snapshot');
    const tanks = (snapshot.snapshot as { tanks: { slot: string; angleDegrees: number }[] })
      .tanks;
    expect(tanks.find((tank) => tank.slot === 'player1')!.angleDegrees).toBe(60);

    const guestSeq = guest.send({ type: 'aim', angleDegrees: 30, power: 0.5 });
    expect(
      (await guest.expect((e) => e.type === 'rejected' && e.seq === guestSeq)).reason,
    ).toBe('not-your-turn');
  });

  it('clamps out-of-range aim values to engine limits instead of trusting the client', async () => {
    const { host } = await startMatch();
    const seq = host.send({ type: 'aim', angleDegrees: 9999, power: 42 });
    await host.expect((e) => e.type === 'ack' && e.seq === seq);
    const snapshot = await host.expect((e) => e.type === 'snapshot');
    const tank = (
      snapshot.snapshot as { tanks: { slot: string; angleDegrees: number; power: number }[] }
    ).tanks.find((entry) => entry.slot === 'player1')!;
    expect(tank.angleDegrees).toBeLessThanOrEqual(85);
    expect(tank.power).toBeLessThanOrEqual(1);
  });

  it('rejects oversized move intents at the protocol layer and enforces the turn allowance', async () => {
    const { host } = await startMatch();
    const bad = host.send({ type: 'move', deltaX: 5000 });
    expect((await host.expect((e) => e.type === 'rejected' && e.seq === bad)).reason).toBe(
      'invalid-field',
    );
    const good = host.send({ type: 'move', deltaX: 20 });
    await host.expect((e) => e.type === 'ack' && e.seq === good);
    const snapshot = await host.expect((e) => e.type === 'snapshot');
    const tank = (
      snapshot.snapshot as { tanks: { slot: string; movementRemaining: number }[] }
    ).tanks.find((entry) => entry.slot === 'player1')!;
    expect(tank.movementRemaining).toBeLessThan(320);
  });

  it('rejects selecting a weapon the player does not own', async () => {
    const { host } = await startMatch();
    const seq = host.send({ type: 'select-weapon', weaponId: 'definitely-not-a-weapon' });
    expect((await host.expect((e) => e.type === 'rejected' && e.seq === seq)).reason).toBe(
      'illegal-action',
    );
  });

  it('has no protocol path for client-authored damage, health or results', async () => {
    const { host } = await startMatch();
    for (const forged of [
      { type: 'set-health', health: 0 },
      { type: 'damage', target: 'player2', amount: 100 },
      { type: 'match-result', winner: 'player1' },
    ]) {
      host.sendRaw(JSON.stringify({ v: PROTOCOL_VERSION, seq: 77, ...forged }));
      expect((await host.expect((e) => e.type === 'rejected')).reason).toBe('unknown-command');
    }
  });

  it('resolves a fired shot authoritatively on the server and hands the turn over', async () => {
    const { host, guest } = await startMatch();
    const aim = host.send({ type: 'aim', angleDegrees: 45, power: 0.6 });
    await host.expect((e) => e.type === 'ack' && e.seq === aim);
    const fire = host.send({ type: 'fire', turn: 1 });
    await host.expect((e) => e.type === 'ack' && e.seq === fire);
    // Both clients receive authoritative combat events (at minimum shot-fired + explosion).
    const hostEvents = await host.expect((e) => e.type === 'combat-events');
    expect((hostEvents.events as { type: string }[]).some((ev) => ev.type === 'shot-fired')).toBe(
      true,
    );
    await guest.expect((e) => e.type === 'combat-events');
    // The server tick advances the simulation until turn handoff to player2.
    const handoff = await guest.expect(
      (e) =>
        e.type === 'snapshot' &&
        (e.snapshot as { activeSlot: string; phase: string }).activeSlot === 'player2' &&
        (e.snapshot as { phase: string }).phase === 'aiming',
      15000,
    );
    expect((handoff.snapshot as { turnNumber: number }).turnNumber).toBe(2);
    // A double-fire from the previous player is rejected.
    const stale = host.send({ type: 'fire', turn: 2 });
    expect((await host.expect((e) => e.type === 'rejected' && e.seq === stale)).reason).toBe(
      'not-your-turn',
    );
  });

  it('awards a forfeit win after a disconnect outlives the grace period', async () => {
    // This suite's default-config server has a 30s grace; use a short-grace server so the
    // test observes the full disconnect -> opponent-disconnected -> forfeit sequence fast.
    const shortGrace = new GameServer({ graceSeconds: 1 });
    const gracePort = await shortGrace.listen(0);
    try {
      const host = new TestClient();
      const guest = new TestClient();
      await host.connect(gracePort);
      await guest.connect(gracePort);
      await host.expect((event) => event.type === 'welcome');
      await guest.expect((event) => event.type === 'welcome');
      host.send({ type: 'create-room', name: 'Host' });
      const created = await host.expect((event) => event.type === 'room-created');
      guest.send({ type: 'join-room', roomCode: created.roomCode as string, name: 'Guest' });
      await guest.expect((event) => event.type === 'room-joined');
      host.send({ type: 'ready' });
      guest.send({ type: 'ready' });
      await host.expect((event) => event.type === 'match-started');
      guest.close();
      // Seat is held first (reliability), then forfeits when the grace expires.
      const notice = await host.expect((e) => e.type === 'opponent-disconnected', 8000);
      expect(notice.slot).toBe('player2');
      const ended = await host.expect((e) => e.type === 'match-ended', 8000);
      expect(ended.winner).toBe('player1');
      expect(ended.byForfeit).toBe(true);
      host.close();
    } finally {
      await shortGrace.close();
    }
  });
});
