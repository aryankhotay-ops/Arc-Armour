import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ServerEvent } from '@artillery/protocol';
import { WORLD_BOUNDS } from '@artillery/simulation';

import { GameServer } from '../src/GameServer.ts';

// Reliability qualification: disconnect grace + reconnection with command-log replay,
// duplicate/stale fire rejection, delayed/reordered message handling, latency pings,
// abandoned-room cleanup, rematch voting and the complete online gameplay cycle.

type AnyEvent = ServerEvent & { [key: string]: unknown };

const FLAT = Array.from({ length: WORLD_BOUNDS.width + 1 }, () => 1300);
const ENGINE_OVERRIDES = { wind: 0, terrainSurface: FLAT } as const;

class TestClient {
  public socket!: WebSocket;
  public readonly inbox: AnyEvent[] = [];
  public resumeToken = '';
  private seqCounter = 0;

  public async connect(port: number): Promise<void> {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/`);
    this.socket.addEventListener('message', (event) => {
      const parsed = JSON.parse(String(event.data)) as AnyEvent;
      if (parsed.type === 'welcome') this.resumeToken = parsed.resumeToken as string;
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

  public send(command: Record<string, unknown>): number {
    const seq = ++this.seqCounter;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq, ...command }));
    return seq;
  }

  public sendRaw(text: string): void {
    this.socket.send(text);
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
        throw new Error(`timeout; inbox=${JSON.stringify(this.inbox.map((e) => e.type))}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Abruptly severs the transport WITHOUT a leave-room command (simulated network drop). */
  public sever(): void {
    this.socket.close();
  }
}

let server: GameServer;
let port: number;
const clients: TestClient[] = [];

const newClient = async (): Promise<TestClient> => {
  const client = new TestClient();
  await client.connect(port);
  clients.push(client);
  return client;
};

const startMatch = async (): Promise<{
  host: TestClient;
  guest: TestClient;
  roomCode: string;
}> => {
  const host = await newClient();
  const guest = await newClient();
  host.send({ type: 'create-room', name: 'Alpha' });
  const created = await host.waitFor((event) => event.type === 'room-created');
  const roomCode = created.roomCode as string;
  guest.send({ type: 'join-room', roomCode, name: 'Bravo' });
  await guest.waitFor((event) => event.type === 'room-joined');
  host.send({ type: 'ready' });
  guest.send({ type: 'ready' });
  await host.waitFor((event) => event.type === 'match-started');
  await guest.waitFor((event) => event.type === 'match-started');
  return { host, guest, roomCode };
};

const makeServer = (graceSeconds: number): Promise<number> => {
  server = new GameServer({
    engineOverrides: ENGINE_OVERRIDES,
    stepsPerTick: 10,
    graceSeconds,
  });
  return server.listen(0);
};

beforeEach(async () => {
  port = await makeServer(2);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.sever();
  await server.close();
});

describe('latency and connection status', () => {
  it('answers pings with the echoed client timestamp', async () => {
    const client = await newClient();
    const seq = client.send({ type: 'ping', sentAt: 123456 });
    const pong = await client.waitFor((e) => e.type === 'pong' && e.seq === seq);
    expect(pong.sentAt).toBe(123456);
  });
});

describe('duplicate and unauthorized commands', () => {
  it('accepts exactly one fire per turn: duplicates are rejected as already-fired', async () => {
    const { host } = await startMatch();
    const aim = host.send({ type: 'aim', angleDegrees: 60, power: 0.3 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === aim);
    const first = host.send({ type: 'fire', turn: 1 });
    // An immediate duplicate (double-tap / replayed packet) for the SAME turn.
    const duplicate = host.send({ type: 'fire', turn: 1 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === first);
    const rejection = await host.waitFor((e) => e.type === 'rejected' && e.seq === duplicate);
    expect(rejection.reason).toBe('already-fired');
    // Only ONE fire entered the accepted-command log.
    const applied: AnyEvent[] = [];
    for (;;) {
      const next = host.inbox.findIndex((e) => e.type === 'command-applied');
      if (next < 0) break;
      applied.push(host.inbox.splice(next, 1)[0]!);
    }
    expect(applied.filter((e) => (e.command as { type: string }).type === 'fire')).toHaveLength(
      1,
    );
  });

  it('rejects a delayed fire from an earlier turn as stale-turn', async () => {
    const { host, guest } = await startMatch();
    const aim = host.send({ type: 'aim', angleDegrees: 60, power: 0.3 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === aim);
    const fire = host.send({ type: 'fire', turn: 1 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === fire);
    // Wait for turn 2 (guest active) then deliver a "delayed" fire stamped for turn 1.
    await guest.waitFor(
      (e) =>
        e.type === 'snapshot' &&
        (e.snapshot as { turnNumber: number; phase: string }).turnNumber === 2 &&
        (e.snapshot as { phase: string }).phase === 'aiming',
      20000,
    );
    const delayed = guest.send({ type: 'fire', turn: 1 });
    const rejection = await guest.waitFor((e) => e.type === 'rejected' && e.seq === delayed);
    expect(rejection.reason).toBe('stale-turn');
  });

  it('still rejects waiting-player intents and forged authoritative commands', async () => {
    const { guest } = await startMatch();
    const aim = guest.send({ type: 'aim', angleDegrees: 50, power: 0.5 });
    expect((await guest.waitFor((e) => e.type === 'rejected' && e.seq === aim)).reason).toBe(
      'not-your-turn',
    );
    guest.sendRaw(JSON.stringify({ v: PROTOCOL_VERSION, seq: 99, type: 'set-health', health: 0 }));
    expect((await guest.waitFor((e) => e.type === 'rejected')).reason).toBe('unknown-command');
  });
});

describe('disconnect grace and reconnection', () => {
  it('holds the seat through a transport drop and resumes with the full command log', async () => {
    const { host, guest, roomCode } = await startMatch();
    const token = guest.resumeToken;
    // Host acts so the command log has real content to replay.
    const aim = host.send({ type: 'aim', angleDegrees: 55, power: 0.4 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === aim);
    const move = host.send({ type: 'move', deltaX: 25 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === move);

    // Guest's network drops WITHOUT leave-room.
    guest.sever();
    const notice = await host.waitFor((e) => e.type === 'opponent-disconnected');
    expect(notice.slot).toBe('player2');
    expect(notice.graceSeconds).toBe(2);
    // Match state is preserved: host's next aim is still accepted during the grace.
    const during = host.send({ type: 'aim', angleDegrees: 52, power: 0.45 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === during);

    // Fresh transport (new device/socket) resumes the held seat with the token.
    const revenant = await newClient();
    const resumeSeq = revenant.send({ type: 'reconnect', roomCode, resumeToken: token });
    const resumed = await revenant.waitFor((e) => e.type === 'resumed' && e.seq === resumeSeq);
    expect(resumed.slot).toBe('player2');
    expect(resumed.phase).toBe('playing');
    const log = resumed.commandLog as { command: { type: string } }[];
    expect(log.length).toBeGreaterThanOrEqual(3); // both aims + the move
    expect(log.some((entry) => entry.command.type === 'move')).toBe(true);
    await host.waitFor((e) => e.type === 'opponent-reconnected');
    // The resumed session has full authority over its turn after handoff.
    const fire = host.send({ type: 'fire', turn: 1 });
    await host.waitFor((e) => e.type === 'ack' && e.seq === fire);
    await revenant.waitFor(
      (e) =>
        e.type === 'snapshot' &&
        (e.snapshot as { activeSlot: string; phase: string }).activeSlot === 'player2' &&
        (e.snapshot as { phase: string }).phase === 'aiming',
      20000,
    );
    const guestAim = revenant.send({ type: 'aim', angleDegrees: 47, power: 0.5 });
    await revenant.waitFor((e) => e.type === 'ack' && e.seq === guestAim);
  });

  it('rejects resumption with a wrong token and forfeits after the grace expires', async () => {
    const { host, guest, roomCode } = await startMatch();
    guest.sever();
    await host.waitFor((e) => e.type === 'opponent-disconnected');
    const impostor = await newClient();
    const bad = impostor.send({ type: 'reconnect', roomCode, resumeToken: 'f'.repeat(32) });
    expect((await impostor.waitFor((e) => e.type === 'rejected' && e.seq === bad)).reason).toBe(
      'invalid-resume',
    );
    // Grace (2s in this suite) expires: the held seat forfeits to the remaining player.
    const ended = await host.waitFor((e) => e.type === 'match-ended', 8000);
    expect(ended.winner).toBe('player1');
    expect(ended.byForfeit).toBe(true);
  });

  it('keeps room seats closed to newcomers while a disconnected seat is held', async () => {
    const { guest, roomCode } = await startMatch();
    guest.sever();
    const intruder = await newClient();
    const join = intruder.send({ type: 'join-room', roomCode, name: 'Intruder' });
    expect((await intruder.waitFor((e) => e.type === 'rejected' && e.seq === join)).reason).toBe(
      'room-full',
    );
  });
});

describe('abandoned-room cleanup', () => {
  it('releases a lobby room after everyone leaves so its code is reusable', async () => {
    const host = await newClient();
    host.send({ type: 'create-room', name: 'Ghost' });
    const created = await host.waitFor((e) => e.type === 'room-created');
    const roomCode = created.roomCode as string;
    const leave = host.send({ type: 'leave-room' });
    await host.waitFor((e) => e.type === 'ack' && e.seq === leave);
    // Immediately reaped on explicit departure: joining reports room-not-found.
    const later = await newClient();
    const join = later.send({ type: 'join-room', roomCode, name: 'Later' });
    expect((await later.waitFor((e) => e.type === 'rejected' && e.seq === join)).reason).toBe(
      'room-not-found',
    );
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
      rooms: number;
    };
    expect(health.rooms).toBe(0);
  });
});

describe('complete online gameplay cycle with rematch', () => {
  it('plays a match to a winner, votes rematch, resets everything, and plays again', async () => {
    const { host, guest } = await startMatch();
    const playToEnd = async (): Promise<AnyEvent> => {
      // Host lands real hits (45° @ 89% crosses the flat 2688-unit gap); guest misses.
      for (let round = 0; round < 24; round++) {
        const hostTurn = round % 2 === 0;
        const active = hostTurn ? host : guest;
        const aim = hostTurn
          ? { angleDegrees: 45, power: 0.89 }
          : { angleDegrees: 60, power: 0.3 };
        const aimSeq = active.send({ type: 'aim', ...aim });
        await active.waitFor((e) => e.type === 'ack' && e.seq === aimSeq);
        const fireSeq = active.send({ type: 'fire', turn: round + 1 });
        await active.waitFor((e) => e.type === 'ack' && e.seq === fireSeq);
        const outcome = await active.waitFor(
          (e) =>
            e.type === 'match-ended' ||
            (e.type === 'snapshot' &&
              (e.snapshot as { turnNumber: number; phase: string }).turnNumber === round + 2 &&
              (e.snapshot as { phase: string }).phase === 'aiming'),
          30000,
        );
        if (outcome.type === 'match-ended') return outcome;
      }
      throw new Error('match did not finish');
    };

    // ---- Match 1: winner announcement reaches both clients.
    const firstEnd = await playToEnd();
    expect(firstEnd.winner).toBe('player1');
    expect(firstEnd.byForfeit).toBe(false);
    await guest.waitFor((e) => e.type === 'match-ended');
    const firstSeedEvent = host.inbox.find((e) => e.type === 'match-started');
    void firstSeedEvent;

    // Firing after the match is over is rejected (results are final).
    const postFire = host.send({ type: 'fire', turn: 99 });
    expect(
      (await host.waitFor((e) => e.type === 'rejected' && e.seq === postFire)).reason,
    ).toBe('not-accepting-input');

    // ---- Rematch voting: one vote is not enough; both votes restart the match.
    const hostVote = host.send({ type: 'rematch' });
    await host.waitFor((e) => e.type === 'ack' && e.seq === hostVote);
    // finish() broadcasts an initial empty rematch-state; wait for the one with the vote.
    const voteState = await guest.waitFor(
      (e) => e.type === 'rematch-state' && (e.votes as string[]).length > 0,
    );
    expect(voteState.votes).toEqual(['player1']);
    const guestVote = guest.send({ type: 'rematch' });
    await guest.waitFor((e) => e.type === 'ack' && e.seq === guestVote);

    // ---- Match 2 starts WITHOUT any reconnection: same sockets, fresh everything.
    const hostStart = await host.waitFor((e) => e.type === 'match-started', 10000);
    const guestStart = await guest.waitFor((e) => e.type === 'match-started', 10000);
    expect(hostStart.terrainSeed).toEqual(guestStart.terrainSeed);
    // Drop stale match-1 traffic so match-2 turn predicates can't match old snapshots.
    host.inbox.length = 0;
    guest.inbox.length = 0;
    const snapshot = hostStart.snapshot as {
      turnNumber: number;
      activeSlot: string;
      tanks: { health: number; movementRemaining: number }[];
      projectiles: unknown[];
    };
    // Full reset: health, movement, projectiles, turn order back to player1/turn 1.
    expect(snapshot.turnNumber).toBe(1);
    expect(snapshot.activeSlot).toBe('player1');
    expect(snapshot.projectiles).toHaveLength(0);
    for (const tank of snapshot.tanks) {
      expect(tank.health).toBe(100);
      expect(tank.movementRemaining).toBe(320);
    }
    // Weapon inventory reset: the limited-ammo Big Shot is selectable again.
    const select = host.send({ type: 'select-weapon', weaponId: 'big-shot' });
    await host.waitFor((e) => e.type === 'ack' && e.seq === select);
    // Return to unlimited Single Shot so the scripted win cannot run out of ammo.
    const back = host.send({ type: 'select-weapon', weaponId: 'single-shot' });
    await host.waitFor((e) => e.type === 'ack' && e.seq === back);
    // The rematch is fully playable: play it to a winner again.
    const secondEnd = await playToEnd();
    expect(secondEnd.winner).toBe('player1');
    expect(secondEnd.byForfeit).toBe(false);
  }, 120000);
});
