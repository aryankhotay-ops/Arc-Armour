import { PROTOCOL_VERSION } from '@artillery/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnlineClient } from './OnlineClient';

/**
 * A transport that delivers 'open' and the fresh 'welcome' in the SAME task, before the
 * promise continuation that sends 'reconnect'. Public TLS proxies can batch those events;
 * the old client used the new unseated token and got 'invalid-resume'.
 */
class BatchedWelcomeSocket extends EventTarget {
  public static readonly OPEN = 1;
  public static readonly sockets: BatchedWelcomeSocket[] = [];
  public static readonly reconnectTokens: string[] = [];
  public readyState = 0;
  private readonly number: number;

  public constructor() {
    super();
    this.number = BatchedWelcomeSocket.sockets.push(this);
    queueMicrotask(() => {
      this.readyState = BatchedWelcomeSocket.OPEN;
      this.dispatchEvent(new Event('open'));
      this.receive({
        type: 'welcome',
        sessionId: `session-${this.number}`,
        protocolVersion: PROTOCOL_VERSION,
        resumeToken: `token-${this.number}`,
      });
    });
  }

  private receive(event: Record<string, unknown>): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ v: PROTOCOL_VERSION, ...event }),
      }),
    );
  }

  public send(text: string): void {
    const command = JSON.parse(text) as { type: string; seq: number; resumeToken?: string };
    queueMicrotask(() => {
      if (command.type === 'create-room') {
        this.receive({ type: 'room-created', seq: command.seq, roomCode: 'ABCD', slot: 'player1' });
      } else if (command.type === 'reconnect') {
        BatchedWelcomeSocket.reconnectTokens.push(command.resumeToken ?? 'missing');
        if (command.resumeToken !== `token-${this.number - 1}`) {
          this.receive({ type: 'rejected', seq: command.seq, reason: 'invalid-resume' });
          return;
        }
        this.receive({
          type: 'resumed',
          seq: command.seq,
          roomCode: 'ABCD',
          slot: 'player1',
          players: [],
          phase: 'lobby',
          terrainSeed: 7,
          commandLog: [],
          snapshot: null,
        });
      }
    });
  }

  public close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  BatchedWelcomeSocket.sockets.length = 0;
  BatchedWelcomeSocket.reconnectTokens.length = 0;
});

describe('online reconnection token rotation', () => {
  it('uses the held seat token even if a fresh welcome arrives before reconnect is sent', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', BatchedWelcomeSocket);
    vi.stubGlobal('window', new EventTarget());
    const resumed = vi.fn();
    const closed = vi.fn();
    const client = new OnlineClient();
    client.setCallbacks({ onResumed: resumed, onClosed: closed });
    try {
      await client.connect('wss://test.example/');
      await client.createRoom('Player');
      BatchedWelcomeSocket.sockets[0]!.close();
      await vi.advanceTimersByTimeAsync(401);

      expect(BatchedWelcomeSocket.reconnectTokens).toEqual(['token-1']);
      expect(resumed).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
      expect(client.status).toBe('connected');

      // After resuming, adopt token-2 because the server holds that NEW session if it
      // drops again. Retaining token-1 forever would only fix the first interruption.
      BatchedWelcomeSocket.sockets[1]!.close();
      await vi.advanceTimersByTimeAsync(401);
      expect(BatchedWelcomeSocket.reconnectTokens).toEqual(['token-1', 'token-2']);
      expect(resumed).toHaveBeenCalledTimes(2);
      expect(closed).not.toHaveBeenCalled();
    } finally {
      client.disconnect();
    }
  });
});
