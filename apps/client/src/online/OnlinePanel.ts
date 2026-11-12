import type { LobbyView, MatchStart } from './OnlineClient';
import {
  OnlineClient,
  connectionTimeoutMs,
  inviteLink,
  pendingJoinCode,
  resolveServerUrl,
  serverConfigured,
} from './OnlineClient';

// Native DOM lobby for online play, mounted inside the main menu's ONLINE panel.
// Owns create/join forms, the shareable room code + invitation link, player list with
// ready states, and departure. Pure UI: all authority lives on the server, all game
// rules in the shared simulation.

export interface OnlinePanelActions {
  /** Called when the server starts the match; the scene takes over from here. */
  readonly start: (client: OnlineClient, lobby: LobbyView, match: MatchStart) => void;
}

export class OnlinePanel {
  private client: OnlineClient | undefined;
  private started = false;
  private destroyed = false;

  public constructor(
    private readonly root: HTMLElement,
    private readonly actions: OnlinePanelActions,
  ) {
    this.renderEntry();
    const code = pendingJoinCode();
    if (code !== undefined) {
      const input = this.root.querySelector<HTMLInputElement>('[name="roomCode"]');
      if (input !== null) input.value = code;
    }
  }

  public destroy(): void {
    this.destroyed = true;
    // Leaving the panel before a match starts abandons the lobby; a started match hands
    // its client to the battlefield scene instead.
    if (!this.started && this.client !== undefined) {
      const client = this.client;
      this.client = undefined;
      void client.leave().then(() => client.disconnect());
    }
    this.root.replaceChildren();
  }

  // -------------------------------------------------------------------------------------

  private renderEntry(error?: string): void {
    const unconfigured = !serverConfigured();
    delete this.root.dataset.onlineBusy;
    this.root.innerHTML = `
      ${error === undefined ? '' : `<p class="front-note" role="alert" data-online-error>${escapeText(error)}</p>`}
      ${
        unconfigured && error === undefined
          ? `<p class="front-note" role="status" data-online-unconfigured>No multiplayer server is configured for this build yet, so rooms cannot be created from here. The host can set <code>VITE_MULTIPLAYER_URL</code> at build time, or you can open this page with <code>?server=wss://your-server</code>.</p>`
          : ''
      }
      <form data-form="online-create" class="front-online-form">
        <h3>Create a private room</h3>
        <label>Your name<input name="name" maxlength="24" required value="Player 1" aria-label="Your name"></label>
        <button class="front-cta" type="submit">Create room →</button>
      </form>
      <form data-form="online-join" class="front-online-form">
        <h3>Join with a room code</h3>
        <label>Your name<input name="name" maxlength="24" required value="Player 2" aria-label="Your name for joining"></label>
        <label>Room code<input name="roomCode" maxlength="4" minlength="4" required pattern="[A-Za-z0-9]{4}" autocapitalize="characters" aria-label="Room code" placeholder="ABCD"></label>
        <button class="front-cta" type="submit">Join room →</button>
      </form>
      <p class="front-note">Rooms hold two players. The server owns all gameplay results; share the invitation link so a friend on another network or device can join.</p>`;
    this.root.querySelectorAll('form').forEach((form) =>
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const name = String(data.get('name') ?? 'Player');
        this.setBusy(form);
        if (form.dataset.form === 'online-create') void this.create(name);
        else void this.join(String(data.get('roomCode') ?? ''), name);
      }),
    );
  }

  /**
   * Immediate feedback for the click: the connection attempt is asynchronous and can take
   * seconds to fail, so without this the button looks dead. Both forms lock to prevent a
   * second socket racing the first; renderEntry/renderLobby replace the whole panel after.
   */
  private setBusy(form: HTMLFormElement): void {
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = true;
    });
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit !== null) {
      submit.dataset.busy = 'true';
      submit.textContent = 'Connecting…';
      submit.setAttribute('aria-busy', 'true');
    }
    this.root.dataset.onlineBusy = 'true';
    if (connectionTimeoutMs(resolveServerUrl()) > 6000) {
      const notice = document.createElement('p');
      notice.className = 'front-note';
      notice.setAttribute('role', 'status');
      notice.dataset.onlineProgress = 'true';
      notice.textContent =
        'Connecting to the server… Free hosting may need about a minute to wake up. Please keep this window open.';
      form.append(notice);
    }
  }

  private async connect(): Promise<OnlineClient> {
    const client = new OnlineClient();
    // Track even a connecting socket so leaving the panel cancels the attempt rather
    // than creating a hidden room after a long free-host cold start.
    this.client = client;
    await client.connect(resolveServerUrl());
    if (this.destroyed || this.client !== client) {
      client.disconnect();
      throw new Error('Connection cancelled.');
    }
    client.setCallbacks({
      onLobby: (lobby) => this.renderLobby(lobby),
      onMatchStarted: (match) => {
        const lobby = this.client?.lobby;
        if (lobby !== undefined && this.client !== undefined) {
          this.started = true;
          this.actions.start(this.client, lobby, match);
        }
      },
      onPlayerLeft: () => {
        const lobby = this.client?.lobby;
        if (!this.started && lobby !== undefined) this.renderLobby(lobby);
      },
      onClosed: () => {
        if (!this.started) this.renderEntry('Connection to the multiplayer server was lost.');
      },
    });
    this.client = client;
    return client;
  }

  private async create(name: string): Promise<void> {
    try {
      const client = await this.connect();
      this.renderLobby(await client.createRoom(name));
    } catch (error) {
      this.fail(error);
    }
  }

  private async join(roomCode: string, name: string): Promise<void> {
    try {
      const client = await this.connect();
      this.renderLobby(await client.joinRoom(roomCode, name));
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.client?.disconnect();
    this.client = undefined;
    if (this.destroyed) return;
    this.renderEntry(error instanceof Error ? error.message : 'Something went wrong.');
  }

  private renderLobby(lobby: LobbyView): void {
    delete this.root.dataset.onlineBusy;
    const link = inviteLink(lobby.roomCode);
    const me = lobby.players.find((player) => player.slot === lobby.slot);
    const rows = (['player1', 'player2'] as const)
      .map((slot) => {
        const player = lobby.players.find((entry) => entry.slot === slot);
        const you = slot === lobby.slot ? ' (you)' : '';
        return `<li data-online-player="${slot}">${
          player === undefined
            ? '<span>Waiting for a challenger…</span>'
            : `<b>${escapeText(player.name)}${you}</b><span data-ready="${player.ready}">${player.ready ? 'READY' : 'NOT READY'}</span>`
        }</li>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="front-online-room">
        <h3>Private room</h3>
        <p class="front-room-code" aria-label="Room code" data-room-code>${lobby.roomCode}</p>
        <label class="front-invite">Invitation link
          <input readonly value="${escapeText(link)}" aria-label="Invitation link" data-invite-link>
        </label>
        <button type="button" class="front-secondary" data-action="copy-invite">Copy invitation link</button>
        <ul class="front-online-players" aria-label="Players">${rows}</ul>
        <button class="front-cta" type="button" data-action="ready" ${me?.ready === true ? 'disabled' : ''}>
          ${me?.ready === true ? 'Waiting for opponent…' : "I'm ready"}</button>
        <button type="button" class="front-secondary" data-action="leave-room">Leave room</button>
        <p class="front-note">The match starts when both players are ready. Gameplay is simulated on the server; both screens replay the identical deterministic battle.</p>
      </div>`;
    this.root
      .querySelector('[data-action="copy-invite"]')
      ?.addEventListener('click', () => void this.copy(link));
    this.root.querySelector('[data-action="ready"]')?.addEventListener('click', () => {
      void this.client?.ready().catch((error: unknown) => this.fail(error));
      const button = this.root.querySelector<HTMLButtonElement>('[data-action="ready"]');
      if (button !== null) {
        button.disabled = true;
        button.textContent = 'Waiting for opponent…';
      }
    });
    this.root.querySelector('[data-action="leave-room"]')?.addEventListener('click', () => {
      // Await the server's departure ack BEFORE offering the join forms again: an instant
      // rejoin must find the seat already released, not race the old socket's leave.
      const client = this.client;
      this.client = undefined;
      const button = this.root.querySelector<HTMLButtonElement>('[data-action="leave-room"]');
      if (button !== null) button.disabled = true;
      void (async () => {
        await client?.leave();
        client?.disconnect();
        this.renderEntry();
      })();
    });
  }

  private async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = this.root.querySelector<HTMLInputElement>('[data-invite-link]');
      input?.select();
    }
  }
}

const escapeText = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
