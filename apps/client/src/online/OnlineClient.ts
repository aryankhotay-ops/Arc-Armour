import {
  PROTOCOL_VERSION,
  type AppliedCommandBody,
  type MatchSnapshot,
  type PlayerSlot,
  type PlayerSnapshot,
  type ServerEvent,
} from '@artillery/protocol';

// Browser side of the authoritative server connection. This module owns ONLY transport and
// protocol state (session, room, lobby, queued match events); all rendering stays in the
// scenes and all game rules stay in @artillery/simulation. Clients send INTENTS and render
// what the server accepted — nothing here can author damage, health or results.
//
// Reliability (2026-11-10): periodic ping/pong latency measurement, connection status
// reporting, automatic reconnection with the server's resume token (the held seat and
// accepted-command log preserve the match through short interruptions), and ordered
// delivery of command-applied events by log index so delayed/out-of-order arrivals can
// never corrupt the deterministic mirror.

export type AppliedCommand = Extract<ServerEvent, { type: 'command-applied' }>;
export type CombatEventsMessage = Extract<ServerEvent, { type: 'combat-events' }>;
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface LobbyView {
  readonly roomCode: string;
  readonly slot: PlayerSlot;
  readonly players: readonly PlayerSnapshot[];
}

export interface MatchStart {
  readonly terrainSeed: number;
  readonly snapshot: MatchSnapshot;
}

export interface ResumeData {
  readonly phase: string;
  readonly terrainSeed: number;
  readonly commandLog: readonly { slot: PlayerSlot; command: AppliedCommandBody }[];
  readonly snapshot: MatchSnapshot | null;
}

export interface OnlineCallbacks {
  readonly onLobby?: (view: LobbyView) => void;
  readonly onMatchStarted?: (start: MatchStart) => void;
  readonly onEnded?: (winner: PlayerSlot | null, byForfeit: boolean) => void;
  readonly onPlayerLeft?: (slot: PlayerSlot) => void;
  readonly onStatus?: (status: ConnectionStatus) => void;
  readonly onLatency?: (milliseconds: number) => void;
  readonly onOpponentConnection?: (connected: boolean, graceSeconds?: number) => void;
  readonly onRematchVotes?: (votes: readonly PlayerSlot[]) => void;
  readonly onResumed?: (resume: ResumeData) => void;
  readonly onClosed?: () => void;
}

/** The parts of `window.location` the server-URL rules depend on; injectable for tests. */
export interface ServerLocation {
  readonly search: string;
  readonly hostname: string;
  readonly protocol: string;
}

const currentLocation = (): ServerLocation => window.location;

const explicitServer = (search: string): string | undefined => {
  const param = new URLSearchParams(search).get('server');
  return param !== null && /^wss?:\/\//.test(param) ? param : undefined;
};

const builtInServer = (): string | undefined => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_MULTIPLAYER_URL;
  return configured !== undefined && configured !== '' ? configured : undefined;
};

const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '';

/** Resolves the server URL: explicit ?server= param, env override, then same-host default. */
export const resolveServerUrl = (location: ServerLocation = currentLocation()): string => {
  const explicit = explicitServer(location.search) ?? builtInServer();
  if (explicit !== undefined) return explicit;
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8090/`;
};

/**
 * Whether this page knows a real multiplayer server. The same-host:8090 default only
 * makes sense during local development; a static deployment (e.g. Vercel) without
 * VITE_MULTIPLAYER_URL or ?server= has nothing to connect to and should say so.
 */
export const serverConfigured = (location: ServerLocation = currentLocation()): boolean =>
  explicitServer(location.search) !== undefined ||
  builtInServer() !== undefined ||
  isLoopback(location.hostname);

/** Invitation link that lands a friend directly in the join flow for this room. */
export const inviteLink = (roomCode: string): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('join', roomCode);
  const server = new URLSearchParams(window.location.search).get('server');
  if (server !== null) url.searchParams.set('server', server);
  return url.toString();
};

/** Room code arriving through an invitation link. */
export const pendingJoinCode = (search = window.location.search): string | undefined => {
  const code = new URLSearchParams(search).get('join');
  return code !== null && /^[A-Za-z0-9]{4}$/.test(code) ? code.toUpperCase() : undefined;
};

const PING_INTERVAL_MS = 2000;
const RECONNECT_DELAYS_MS = [400, 800, 1600, 3200, 5000, 5000, 5000, 5000];
/** Initial handshake budget; browsers otherwise sit silently for 10s+ on a dead host. */
const CONNECT_TIMEOUT_MS = 6000;

/** Human-readable server location for connection errors (scheme + host, no path/query). */
const describeServer = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
};

export class OnlineClient {
  private socket: WebSocket | undefined;
  private url = '';
  private seqCounter = 0;
  private callbacks: OnlineCallbacks = {};
  private readonly waiters = new Map<
    number,
    { resolve: (event: ServerEvent) => void; reject: (error: Error) => void }
  >();
  /** Match-stream events queued for the battlefield scene to drain each frame. */
  public readonly matchQueue: AppliedCommand[] = [];
  /** Ordered-delivery buffer for command-applied events that arrived early. */
  private readonly pendingApplied = new Map<number, AppliedCommand>();
  private nextAppliedIndex = 0;
  public latestSnapshot: MatchSnapshot | undefined;
  public lobby: LobbyView | undefined;
  public matchStart: MatchStart | undefined;
  public ended: { winner: PlayerSlot | null; byForfeit: boolean } | undefined;
  public rematchVotes: readonly PlayerSlot[] = [];
  public status: ConnectionStatus = 'connecting';
  public latencyMs: number | undefined;
  public closed = false;
  private resumeToken: string | undefined;
  private pinger: ReturnType<typeof setInterval> | undefined;
  private reconnectAttempt = 0;
  private intentionalClose = false;

  public setCallbacks(callbacks: OnlineCallbacks): void {
    this.callbacks = callbacks;
  }

  public connect(url: string): Promise<void> {
    this.url = url;
    return this.open(url, false);
  }

  private open(url: string, isReconnect: boolean): Promise<void> {
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.socket = new WebSocket(url);
      } catch {
        reject(new Error('Could not open a connection.'));
        return;
      }
      const socket = this.socket;
      const timer = setTimeout(() => {
        if (settled || socket !== this.socket) return;
        // Closing fires the 'close' listener below, which rejects with the reach error.
        socket.close();
      }, CONNECT_TIMEOUT_MS);
      socket.addEventListener('message', (event) => this.receive(String(event.data)));
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        settled = true;
        this.setStatus('connected');
        this.reconnectAttempt = 0;
        this.startPinger();
        resolve();
      });
      // Diagnostic hook: abruptly severs THIS transport (as a network cut would) so
      // reconnection behaviour is testable; it never touches game or room state.
      window.addEventListener(
        'artillery-drop-transport',
        () => {
          try {
            socket.close();
          } catch {
            /* already closed */
          }
        },
        { once: true },
      );
      const fail = (): void => {
        if (socket !== this.socket) return; // superseded by a newer socket
        clearTimeout(timer);
        this.stopPinger();
        for (const waiter of this.waiters.values()) waiter.reject(new Error('Connection closed.'));
        this.waiters.clear();
        if (!settled) {
          settled = true;
          this.setStatus('closed');
          reject(
            new Error(
              `Could not reach the multiplayer server at ${describeServer(url)}. ` +
                'Check that it is running and reachable, then try again.',
            ),
          );
          return;
        }
        if (this.intentionalClose) {
          this.closed = true;
          this.setStatus('closed');
          this.callbacks.onClosed?.();
          return;
        }
        // Unexpected drop with a live room: try to resume within the server's grace.
        if (this.resumeToken !== undefined && this.lobby !== undefined) {
          this.scheduleReconnect();
        } else {
          this.closed = true;
          this.setStatus('closed');
          this.callbacks.onClosed?.();
        }
      };
      socket.addEventListener('error', fail);
      socket.addEventListener('close', fail);
    });
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    if (delay === undefined) {
      this.closed = true;
      this.setStatus('closed');
      this.callbacks.onClosed?.();
      return;
    }
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    setTimeout(() => {
      if (this.intentionalClose || this.closed) return;
      void this.open(this.url, true)
        .then(async () => {
          const lobby = this.lobby;
          const token = this.resumeToken;
          if (lobby === undefined || token === undefined) return;
          const event = await this.request({
            type: 'reconnect',
            roomCode: lobby.roomCode,
            resumeToken: token,
          });
          if (event.type !== 'resumed') {
            // Seat already forfeited or room gone; surface as a final close.
            this.closed = true;
            this.setStatus('closed');
            this.callbacks.onClosed?.();
            return;
          }
          this.lobby = { roomCode: event.roomCode, slot: event.slot, players: event.players };
          if (event.snapshot !== null) this.latestSnapshot = event.snapshot;
          // Mirror replay starts from scratch; reset ordered delivery to the log head.
          this.nextAppliedIndex = event.commandLog.length;
          this.pendingApplied.clear();
          this.matchQueue.length = 0;
          this.callbacks.onResumed?.({
            phase: event.phase,
            terrainSeed: event.terrainSeed,
            commandLog: event.commandLog,
            snapshot: event.snapshot,
          });
        })
        .catch(() => this.scheduleReconnect());
    }, delay);
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.stopPinger();
    this.closed = true;
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
  }

  // -------------------------------------------------------------------------------------
  // Latency measurement
  // -------------------------------------------------------------------------------------

  private startPinger(): void {
    this.stopPinger();
    this.pinger = setInterval(() => {
      void this.request({ type: 'ping', sentAt: Date.now() })
        .then((event) => {
          if (event.type === 'pong') {
            this.latencyMs = Math.max(0, Date.now() - event.sentAt);
            this.callbacks.onLatency?.(this.latencyMs);
          }
        })
        .catch(() => undefined);
    }, PING_INTERVAL_MS);
  }

  private stopPinger(): void {
    if (this.pinger !== undefined) clearInterval(this.pinger);
    this.pinger = undefined;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  // -------------------------------------------------------------------------------------
  // Requests with acks
  // -------------------------------------------------------------------------------------

  private request(command: Record<string, unknown>): Promise<ServerEvent> {
    const seq = ++this.seqCounter;
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected.'));
    }
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq, ...command }));
    return new Promise((resolve, reject) => {
      this.waiters.set(seq, { resolve, reject });
      setTimeout(() => {
        if (this.waiters.delete(seq)) reject(new Error('The server did not respond.'));
      }, 8000);
    });
  }

  public async createRoom(name: string): Promise<LobbyView> {
    const event = await this.request({ type: 'create-room', name });
    if (event.type !== 'room-created') throw new Error(this.reasonText(event));
    this.lobby = {
      roomCode: event.roomCode,
      slot: event.slot,
      players: [{ slot: event.slot, name, connected: true, ready: false }],
    };
    return this.lobby;
  }

  public async joinRoom(roomCode: string, name: string): Promise<LobbyView> {
    const event = await this.request({ type: 'join-room', roomCode: roomCode.toUpperCase(), name });
    if (event.type !== 'room-joined') throw new Error(this.reasonText(event));
    this.lobby = { roomCode: event.roomCode, slot: event.slot, players: event.players };
    return this.lobby;
  }

  public async ready(): Promise<void> {
    const event = await this.request({ type: 'ready' });
    if (event.type === 'rejected') throw new Error(this.reasonText(event));
  }

  /** Post-match rematch vote; the server restarts the match once both players voted. */
  public async voteRematch(): Promise<void> {
    const event = await this.request({ type: 'rematch' });
    if (event.type === 'rejected') throw new Error(this.reasonText(event));
  }

  /** Resolves once the server acknowledged the departure (or the attempt failed). */
  public async leave(): Promise<void> {
    this.lobby = undefined;
    this.matchStart = undefined;
    this.resumeToken = undefined;
    await this.request({ type: 'leave-room' }).catch(() => undefined);
  }

  /**
   * Gameplay intents with bounded retries. The render-rate mirror can finish a shot a
   * beat before the server's 20Hz tick, so an intent sent at that instant is rejected
   * with a TRANSIENT phase reason; retrying shortly lands it once the server catches up.
   * Fire intents carry their turn number, so the server accepts at most one shot per
   * turn — a retried, duplicated or delayed fire can never launch twice. Stale-turn and
   * already-fired rejections are final and never retried.
   */
  public sendIntent(
    command:
      | { type: 'aim'; angleDegrees: number; power: number }
      | { type: 'move'; deltaX: number }
      | { type: 'select-weapon'; weaponId: string }
      | { type: 'fire'; turn: number },
    attempt = 0,
  ): void {
    void this.request(command)
      .then((event) => {
        if (
          event.type === 'rejected' &&
          (event.reason === 'not-accepting-input' || event.reason === 'not-your-turn') &&
          attempt < 12 &&
          !this.closed
        ) {
          setTimeout(() => this.sendIntent(command, attempt + 1), 150);
        }
      })
      .catch(() => undefined);
  }

  private reasonText(event: ServerEvent): string {
    const reason = event.type === 'rejected' ? event.reason : 'unexpected-response';
    const messages: Record<string, string> = {
      'room-not-found': 'No room with that code was found.',
      'room-full': 'That room already has two players.',
      'already-in-room': 'You are already in a room.',
      'rate-limited': 'Too many commands; slow down.',
      'invalid-resume': 'The seat could not be resumed.',
    };
    return messages[reason] ?? `The server rejected the request (${reason}).`;
  }

  // -------------------------------------------------------------------------------------

  private receive(text: string): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(text) as ServerEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'room-created':
      case 'room-joined':
      case 'resumed':
      case 'pong':
      case 'ack':
      case 'rejected': {
        const waiter = this.waiters.get(event.seq);
        if (waiter !== undefined) {
          this.waiters.delete(event.seq);
          waiter.resolve(event);
        }
        return;
      }
      case 'welcome':
        this.resumeToken = event.resumeToken;
        return;
      case 'lobby': {
        if (this.lobby !== undefined) {
          this.lobby = { ...this.lobby, players: event.players };
          this.callbacks.onLobby?.(this.lobby);
        }
        return;
      }
      case 'match-started': {
        this.matchStart = { terrainSeed: event.terrainSeed, snapshot: event.snapshot };
        this.latestSnapshot = event.snapshot;
        this.ended = undefined;
        this.rematchVotes = [];
        this.matchQueue.length = 0;
        this.pendingApplied.clear();
        this.nextAppliedIndex = 0;
        this.callbacks.onMatchStarted?.(this.matchStart);
        return;
      }
      case 'command-applied':
        // Ordered delivery: a delayed/reordered event waits in the buffer until every
        // earlier log index has been queued, so the mirror replay can never skip or swap.
        this.pendingApplied.set(event.index, event);
        while (this.pendingApplied.has(this.nextAppliedIndex)) {
          this.matchQueue.push(this.pendingApplied.get(this.nextAppliedIndex)!);
          this.pendingApplied.delete(this.nextAppliedIndex);
          this.nextAppliedIndex += 1;
        }
        return;
      case 'combat-events':
        // The mirror engine regenerates identical combat events locally; the authoritative
        // stream is retained for diagnostics rather than double-driving presentation.
        return;
      case 'snapshot':
        this.latestSnapshot = event.snapshot;
        return;
      case 'opponent-disconnected':
        this.callbacks.onOpponentConnection?.(false, event.graceSeconds);
        return;
      case 'opponent-reconnected':
        this.callbacks.onOpponentConnection?.(true);
        return;
      case 'rematch-state':
        this.rematchVotes = event.votes;
        this.callbacks.onRematchVotes?.(event.votes);
        return;
      case 'player-left':
        this.callbacks.onPlayerLeft?.(event.slot);
        return;
      case 'match-ended':
        this.ended = { winner: event.winner, byForfeit: event.byForfeit };
        this.callbacks.onEnded?.(event.winner, event.byForfeit);
        return;
    }
  }
}
