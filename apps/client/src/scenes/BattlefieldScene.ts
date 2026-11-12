import Phaser from 'phaser';
import { GAME_WEAPONS, GAME_ARSENAL_ID } from '../game/GameArsenal';
import { tankModelId, type TankModelId } from '@artillery/content';
import { currentTanks, type TankSelection } from '../settings/TankSelection';
import { preloadTankSprites } from '../rendering/TankSprites';

import {
  GameEngine,
  predictTrajectory,
  WORLD_BOUNDS,
  TERRAIN_STYLES,
  TERRAIN_GENERATION_VERSION,
  type CombatEvent,
} from '@artillery/simulation';

import { CombatView } from '../rendering/CombatRenderer';
import { onKeyPress } from '../input/keyPress';
import { TankView } from '../rendering/TankRenderer';
import { TerrainView } from '../rendering/TerrainRenderer';
import { LandscapeView } from '../rendering/LandscapeRenderer';
import { preloadBackgrounds } from '../rendering/BackgroundCatalog';
import {
  AIM_PREVIEW_SECONDS,
  BATTLEFIELD_SCALE,
  screenToBattlefield,
} from '../rendering/BattlefieldLayout';
import { resolveTerrainSeed, type MatchSetup } from '../match/MatchSetup';
import type { AppliedCommandBody, PlayerSlot } from '@artillery/protocol';
import type { OnlineClient } from '../online/OnlineClient';
import { OnlineMirrorEngine } from '../online/OnlineMirrorEngine';
import { BattleHud, type HudControl } from '../ui/BattleHud';
import { BattleMenu } from '../ui/BattleMenu';
import { GameAudio } from '../audio/GameAudio';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type LocalSettings,
} from '../settings/LocalSettings';
import { COLOR, PLAYER_THEME, textStyle } from '../ui/theme';

// The native HUD reserves header/footer grid rows. The entire 1280×720 canvas is now
// battlefield, with the same world transform as before and no covered aiming regions.
const ARSENAL_KEYS = [
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'ZERO',
  'MINUS',
  'PLUS',
];

interface HeldControls {
  readonly moveLeft: Phaser.Input.Keyboard.Key;
  readonly moveRight: Phaser.Input.Keyboard.Key;
  readonly angleUp: Phaser.Input.Keyboard.Key;
  readonly angleDown: Phaser.Input.Keyboard.Key;
  readonly powerDown: Phaser.Input.Keyboard.Key;
  readonly powerUp: Phaser.Input.Keyboard.Key;
}

/** Online match handoff from the menu's lobby panel. */
export interface OnlineMatchData {
  readonly online: {
    readonly client: OnlineClient;
    readonly slot: PlayerSlot;
    readonly terrainSeed: number;
    readonly names: Readonly<Record<PlayerSlot, string>>;
  };
}

export class BattlefieldScene extends Phaser.Scene {
  private engine!: GameEngine;
  /** Online transport + mirror identity; undefined in local play. */
  private online: OnlineMatchData['online'] | undefined;
  private onlineBanner: Phaser.GameObjects.Text | undefined;
  /** True while a rematch restart hands the live client to the next scene instance. */
  private onlineHandoff = false;
  /** Drafted loadouts for this match; undefined means both players carry the full arsenal. */
  private setup: MatchSetup | undefined;
  private terrainSeed = 0;
  private tankModels: TankSelection = ['marigold', 'cobalt'];
  private terrainView!: TerrainView;
  private landscape!: LandscapeView;
  private combatView!: CombatView;
  private tankViews!: [TankView, TankView];
  private aimGuide!: Phaser.GameObjects.Graphics;
  private worldLayer!: Phaser.GameObjects.Container;
  private hud!: BattleHud;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private controls: HeldControls | undefined;
  private readonly heldTouchControls = new Set<string>();
  private eventLog: CombatEvent[] = [];
  private menu!: BattleMenu;
  private paused = false;
  private settings: LocalSettings = { ...DEFAULT_SETTINGS };
  private audio!: GameAudio;
  private lastTankPositions: [number, number] = [0, 0];

  public constructor() {
    super({ key: 'BattlefieldScene' });
  }

  /** Receives the draft result. A restart passes the same setup back in. */
  public init(
    data:
      | (Partial<MatchSetup> &
          Partial<OnlineMatchData> & {
            terrainSeed?: number;
            tankModels?: readonly [TankModelId, TankModelId];
          })
      | undefined,
  ): void {
    this.online = data?.online;
    this.setup = data?.loadouts === undefined ? undefined : (data as MatchSetup);
    this.terrainSeed = this.online?.terrainSeed ?? data?.terrainSeed ?? resolveTerrainSeed();
    if (this.online !== undefined) {
      // The mirror engine must match the server engine exactly, so online matches use the
      // default physics geometry rather than per-device tank model selections.
      this.tankModels = ['marigold', 'cobalt'];
      return;
    }
    const chosen = data?.tankModels ?? currentTanks();
    const params = new URLSearchParams(window.location.search);
    this.tankModels = [
      tankModelId(params.get('tank1') ?? chosen[0], 'marigold'),
      tankModelId(params.get('tank2') ?? chosen[1], 'cobalt'),
    ];
  }

  public preload(): void {
    preloadBackgrounds(this);
    preloadTankSprites(this, this.tankModels);
  }

  public create(): void {
    this.input.enabled = true;
    if (this.input.keyboard !== null) this.input.keyboard.enabled = true;
    this.paused = false;
    try {
      this.settings = loadSettings(window.localStorage);
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    // Online: a deterministic mirror of the server engine. Local inputs become intents;
    // only server-accepted command rebroadcasts mutate it, so both clients replay the
    // identical battle while the server stays authoritative for results. The mirror must
    // NOT add client-only options like tank models that alter physics geometry.
    this.engine =
      this.online !== undefined
        ? new OnlineMirrorEngine(this.online.client, this.online.slot, this.terrainSeed)
        : new GameEngine({
            weapons: GAME_WEAPONS,
            captureProjectileMotion: true,
            terrainSeed: this.terrainSeed,
            tankModels: this.tankModels,
            ...(this.setup === undefined ? {} : { loadouts: this.setup.loadouts }),
          });
    document.body.dataset.terrainSeed = String(this.engine.terrainSeed);
    document.body.dataset.weaponArsenal = GAME_ARSENAL_ID;
    document.body.dataset.terrainGenerationVersion = String(TERRAIN_GENERATION_VERSION);
    document.body.dataset.terrainLayout =
      TERRAIN_STYLES[this.engine.terrainSeed % TERRAIN_STYLES.length];
    // Snapshot of the ORIGINAL map once per match, not a per-frame terrain serialization.
    document.body.dataset.terrainProfile = JSON.stringify(
      this.engine.terrain.surfaceY.filter((_y, x) => x % 40 === 0).map((y) => Math.round(y)),
    );
    this.heldTouchControls.clear();
    this.eventLog = [];
    this.audio = new GameAudio(this.settings, (id) => this.engine.weapon(id));
    this.lastTankPositions = [this.engine.state.tanks[0].x, this.engine.state.tanks[1].x];
    this.landscape = new LandscapeView(this);
    const backdrop = new Set(this.children.getChildren());
    this.terrainView = new TerrainView(this, this.landscape.activeBackground);
    this.terrainView.update(this.engine.terrain);
    this.tankViews = [
      new TankView(this, this.engine.state.tanks[0], this.reducedMotion, 1 / BATTLEFIELD_SCALE),
      new TankView(this, this.engine.state.tanks[1], this.reducedMotion, 1 / BATTLEFIELD_SCALE),
    ];
    this.combatView = new CombatView(this, (id) => this.engine.weapon(id), this.reducedMotion);
    this.aimGuide = this.add.graphics().setDepth(18);
    // Project all gameplay geometry with ONE uniform transform. Tank contacts, visible
    // muzzles, terrain cuts and projectile paths cannot drift apart as the map zooms out.
    const worldObjects = this.children.getChildren().filter((object) => !backdrop.has(object));
    this.worldLayer = this.add
      .container(0, 0, worldObjects)
      .setScale(BATTLEFIELD_SCALE)
      .setDepth(10);
    this.worldLayer.sort('depth');
    this.hud = new BattleHud(this.engine, {
      onSelect: (weaponId) => {
        this.audio.unlock();
        if (!this.paused && this.engine.selectWeapon(weaponId)) {
          this.audio.playWeaponSelect(1);
          this.hud.update(this.engine, this.paused);
        }
      },
      onHold: (control, held) => {
        if (held) this.audio.unlock();
        if (held && !this.paused && this.engine.acceptsInput) this.heldTouchControls.add(control);
        else this.heldTouchControls.delete(control);
      },
      onStep: (control) => this.stepHudControl(control),
      onAim: (angle, power) => {
        this.audio.unlock();
        if (!this.paused) this.engine.setAim(angle, power);
        this.hud.update(this.engine, this.paused);
      },
      onFire: () => {
        this.audio.unlock();
        this.fireOrRestart();
      },
      onNewDraft: () => {
        if (!this.paused && this.engine.state.phase === 'game-over') this.scene.start('DraftScene');
      },
      onLayout: () => {
        // refresh() alone reuses stale parentSize after a HUD disclosure/grid resize.
        // Measure the actual remaining arena first, otherwise CSS max-height distorts aim.
        this.scale.getParentBounds();
        this.scale.refresh();
      },
    });
    this.createInput();
    this.createMenu();
    if (this.online !== undefined) this.createOnlinePresence();
    this.refreshPresentation(0);

    document.body.dataset.gameReady = 'true';
    document.body.dataset.scene = 'battlefield';
  }

  /** Online-only presence banner, connection HUD, results panel and transport wiring. */
  private createOnlinePresence(): void {
    const online = this.online!;
    this.onlineBanner = this.add
      .text(640, 700, '', textStyle(15, '#fff6e6', { font: 'display', stroke: COLOR.ink }))
      .setOrigin(0.5, 1)
      .setDepth(60);
    // Native connection strip: status, live latency, opponent connectivity notices.
    const strip = document.createElement('div');
    strip.className = 'online-status-strip';
    strip.setAttribute('aria-live', 'polite');
    strip.innerHTML =
      '<span data-online-status-label>CONNECTED</span><span data-online-latency></span><span data-online-notice></span>';
    document.body.append(strip);
    const statusLabel = strip.querySelector<HTMLElement>('[data-online-status-label]')!;
    const latencyLabel = strip.querySelector<HTMLElement>('[data-online-latency]')!;
    const noticeLabel = strip.querySelector<HTMLElement>('[data-online-notice]')!;
    const publishStatus = (status: string): void => {
      statusLabel.textContent = status.toUpperCase();
      strip.dataset.status = status;
      document.body.dataset.onlineStatus = status;
    };
    publishStatus(online.client.status);
    online.client.setCallbacks({
      onStatus: (status) => publishStatus(status),
      onLatency: (ms) => {
        latencyLabel.textContent = `${Math.round(ms)} ms`;
        document.body.dataset.onlineLatency = String(Math.round(ms));
      },
      onOpponentConnection: (connected, graceSeconds) => {
        noticeLabel.textContent = connected
          ? ''
          : `Opponent disconnected — holding their seat ${graceSeconds ?? 30}s`;
        document.body.dataset.opponentConnected = String(connected);
        if (connected) this.onlineBanner?.setText('OPPONENT RECONNECTED');
      },
      onResumed: (resume) => {
        // Our own transport came back: rebuild the mirror from the accepted-command log.
        const mirror = this.engine as OnlineMirrorEngine;
        if (resume.terrainSeed === this.terrainSeed) {
          this.rebuildMirrorFromLog(resume.commandLog);
        }
        noticeLabel.textContent = '';
        document.body.dataset.onlineResumed = 'true';
        void mirror;
      },
      onRematchVotes: (votes) => {
        document.body.dataset.rematchVotes = votes.join(',');
        this.syncResultsPanel();
      },
      onMatchStarted: (start) => {
        // Both players voted: the server reset everything on a fresh seed. Restart the
        // scene with the SAME transport/client so no page refresh is ever needed.
        this.onlineHandoff = true;
        this.scene.restart({
          online: { ...online, terrainSeed: start.terrainSeed },
        });
      },
      onEnded: (winner, byForfeit) => {
        // A forfeit is an authoritative server verdict, not an engine command, so the
        // mirror cannot reach game-over by replay. Publish it as its own observable state.
        document.body.dataset.onlineEnded = byForfeit ? 'forfeit' : 'complete';
        document.body.dataset.onlineWinner = winner ?? '';
        if (byForfeit && this.onlineBanner !== undefined) {
          const won = winner === online.slot;
          this.onlineBanner.setText(
            won ? 'OPPONENT LEFT — YOU WIN BY FORFEIT' : 'MATCH FORFEITED',
          );
        }
        this.syncResultsPanel();
      },
      onClosed: () => {
        publishStatus('closed');
        noticeLabel.textContent = 'Connection lost — return to the menu with ESC.';
        this.onlineBanner?.setText('CONNECTION LOST — RETURN TO MENU WITH ESC');
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      strip.remove();
      this.resultsPanel?.remove();
      this.resultsPanel = undefined;
      // A rematch restart hands the SAME client to the next scene instance; only a real
      // exit (menu/draft navigation) leaves the room and closes the transport.
      if (!this.onlineHandoff) {
        void online.client.leave().then(() => online.client.disconnect());
      }
      this.onlineHandoff = false;
      delete document.body.dataset.onlineSlot;
      delete document.body.dataset.onlineRoom;
      delete document.body.dataset.onlineEnded;
      delete document.body.dataset.onlineWinner;
      delete document.body.dataset.onlineStatus;
      delete document.body.dataset.onlineLatency;
      delete document.body.dataset.opponentConnected;
      delete document.body.dataset.onlineResumed;
      delete document.body.dataset.rematchVotes;
    });
  }

  /** Rebuilds the deterministic mirror after our own reconnect. */
  private rebuildMirrorFromLog(
    log: readonly { readonly slot: PlayerSlot; readonly command: AppliedCommandBody }[],
  ): void {
    const online = this.online!;
    const fresh = new OnlineMirrorEngine(online.client, online.slot, this.terrainSeed);
    fresh.replayCommandLog(log);
    this.engine = fresh;
    this.terrainView.update(fresh.terrain);
    this.hud.update(fresh, this.paused);
  }

  /**
   * Native results panel for online matches: winner announcement, rematch voting,
   * return to lobby (menu) and departure. Shown once per match end, replaced on votes.
   */
  private resultsPanel: HTMLElement | undefined;

  private syncResultsPanel(): void {
    const online = this.online;
    if (online === undefined || online.client.ended === undefined) return;
    const { winner, byForfeit } = online.client.ended;
    const votes = online.client.rematchVotes;
    if (this.resultsPanel === undefined) {
      this.resultsPanel = document.createElement('section');
      this.resultsPanel.className = 'online-results';
      this.resultsPanel.setAttribute('aria-label', 'Match results');
      document.body.append(this.resultsPanel);
    }
    const won = winner === online.slot;
    const title =
      winner === null ? 'DRAW' : won ? 'VICTORY!' : `${online.names[winner].toUpperCase()} WINS`;
    const youVoted = votes.includes(online.slot);
    const theyVoted = votes.includes(online.slot === 'player1' ? 'player2' : 'player1');
    this.resultsPanel.innerHTML = `
      <h2 data-result="${winner === null ? 'draw' : won ? 'win' : 'loss'}">${title}</h2>
      <p>${byForfeit ? 'Won by forfeit — the opponent left the match.' : `${online.names.player1} vs ${online.names.player2} · settled on the battlefield.`}</p>
      <p data-rematch-status>${
        youVoted && !theyVoted
          ? 'Waiting for your opponent to accept the rematch…'
          : !youVoted && theyVoted
            ? 'Your opponent wants a rematch!'
            : 'Play again on a fresh battlefield?'
      }</p>
      <div class="online-results-actions">
        <button type="button" data-action="rematch" ${youVoted || byForfeit ? 'disabled' : ''}>
          ${youVoted ? 'REMATCH VOTED ✓' : 'REMATCH'}</button>
        <button type="button" data-action="to-lobby">RETURN TO MENU</button>
      </div>`;
    this.resultsPanel
      .querySelector('[data-action="rematch"]')
      ?.addEventListener('click', () => {
        void online.client.voteRematch().catch(() => undefined);
        this.syncResultsPanel();
      });
    this.resultsPanel.querySelector('[data-action="to-lobby"]')?.addEventListener('click', () => {
      this.scene.start('MenuScene');
    });
  }

  private syncOnlineBanner(): void {
    const online = this.online;
    if (online === undefined || this.onlineBanner === undefined) return;
    if (online.client.ended !== undefined) return; // forfeit/loss text is sticky
    const engine = this.engine as OnlineMirrorEngine;
    const yourTurn = engine.state.activePlayerId === online.slot;
    this.onlineBanner.setText(
      engine.state.phase === 'game-over'
        ? ''
        : yourTurn
          ? `YOUR TURN — YOU ARE ${online.names[online.slot].toUpperCase()}`
          : `WAITING FOR ${online.names[online.slot === 'player1' ? 'player2' : 'player1'].toUpperCase()}…`,
    );
  }

  public override update(time: number, deltaMilliseconds: number): void {
    if (this.paused) {
      this.publishTestState();
      return;
    }
    const deltaSeconds = Math.min(0.05, deltaMilliseconds / 1000);
    this.updateHeldControls(deltaSeconds);
    if (this.engine instanceof OnlineMirrorEngine) {
      // Apply server-accepted commands in arrival order. A command that cannot apply yet
      // (mirror still resolving a shot) stays queued for a later frame — order is never
      // changed, so both mirrors replay the identical stream.
      const queue = this.online!.client.matchQueue;
      while (queue.length > 0) {
        const next = queue[0]!;
        if (next.type !== 'command-applied') {
          queue.shift();
          continue;
        }
        if (!this.engine.applyServerCommand(next)) break;
        queue.shift();
      }
      this.engine.flushIntents(time);
      this.syncOnlineBanner();
    }
    this.engine.update(deltaSeconds);
    this.refreshPresentation(deltaSeconds);
  }

  // -------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------

  private createInput(): void {
    const keyboard = this.input.keyboard;
    // Autoplay policy: construct/resume the AudioContext only from real user gestures.
    // Calling on every input is safe; after the first success it only resumes a suspension.
    const unlock = (): void => this.audio.unlock();
    this.input.on('pointerdown', unlock);
    keyboard?.on('keydown', unlock);
    if (keyboard !== null) {
      this.controls = keyboard.addKeys({
        moveLeft: Phaser.Input.Keyboard.KeyCodes.A,
        moveRight: Phaser.Input.Keyboard.KeyCodes.D,
        angleUp: Phaser.Input.Keyboard.KeyCodes.W,
        angleDown: Phaser.Input.Keyboard.KeyCodes.S,
        powerDown: Phaser.Input.Keyboard.KeyCodes.Q,
        powerUp: Phaser.Input.Keyboard.KeyCodes.E,
      }) as HeldControls;
      keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.TAB,
      ]);
      onKeyPress(keyboard, 'SPACE', () => this.fireOrRestart());
      onKeyPress(keyboard, 'TAB', () => {
        if (!this.paused && this.engine.cycleWeapon(1)) this.audio.playWeaponSelect(1);
      });
      onKeyPress(keyboard, 'X', () => {
        if (!this.paused && this.engine.cycleWeapon(1)) this.audio.playWeaponSelect(1);
      });
      onKeyPress(keyboard, 'Z', () => {
        if (!this.paused && this.engine.cycleWeapon(-1)) this.audio.playWeaponSelect(-1);
      });
      onKeyPress(keyboard, 'R', () => {
        if (!this.paused && this.engine.state.phase === 'game-over') this.restartMatch(true);
      });
      onKeyPress(keyboard, 'N', () => {
        if (!this.paused && this.engine.state.phase === 'game-over') this.scene.start('DraftScene');
      });
      // 1–9, 0, -, = select the active player's own arsenal slots directly.
      ARSENAL_KEYS.forEach((key, index) => {
        onKeyPress(keyboard, key, () => {
          if (this.paused) return;
          const weapon = this.hud.arsenal.carriedBy(this.engine.activeTank)[index];
          if (weapon !== undefined && this.engine.selectWeapon(weapon.id)) {
            this.audio.playWeaponSelect(1);
          }
        });
      });
    }

    const aim = (pointer: Phaser.Input.Pointer): void => {
      if (this.paused) return;
      if (pointer.worldX < 0 || pointer.worldY < 0 || pointer.worldX > 1280 || pointer.worldY > 720)
        return;
      const point = screenToBattlefield(pointer.worldX, pointer.worldY);
      this.engine.aimAtPoint(point.x, point.y);
    };
    // One battlefield gesture owns aiming until its finger is released. HUD fingers
    // never become battlefield drags, and a cancelled/rotated gesture cannot get stuck.
    let aimPointer: number | undefined;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0 || aimPointer !== undefined) return;
      aimPointer = pointer.id;
      aim(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.id === aimPointer) aim(pointer);
    });
    const releaseAim = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id === aimPointer) aimPointer = undefined;
    };
    this.input.on('pointerup', releaseAim);
    this.input.on('pointerupoutside', releaseAim);
    const cancelInput = (): void => {
      aimPointer = undefined;
      this.heldTouchControls.clear();
      keyboard?.resetKeys();
    };
    const canvas = this.game.canvas;
    canvas.addEventListener('pointercancel', cancelInput);
    canvas.addEventListener('touchcancel', cancelInput);
    window.addEventListener('resize', cancelInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointercancel', cancelInput);
      canvas.removeEventListener('touchcancel', cancelInput);
      window.removeEventListener('resize', cancelInput);
    });
  }

  private fireOrRestart(): void {
    if (this.paused) return;
    this.heldTouchControls.clear();
    if (this.engine.state.phase === 'game-over') this.restartMatch(true);
    else this.engine.fire();
  }

  /** Restart keeps the map for retrying; completed-match rematch deals a new landscape. */
  private restartMatch(newMap = false): void {
    if (this.online !== undefined) {
      // Online rematch requires a fresh server lobby; return to the menu instead of
      // silently forking a local game that the opponent cannot see.
      this.scene.start('MenuScene');
      return;
    }
    this.scene.restart({
      ...this.setup,
      tankModels: this.tankModels,
      terrainSeed: newMap
        ? resolveTerrainSeed(window.location.search, this.terrainSeed)
        : this.terrainSeed,
    });
  }

  private createMenu(): void {
    const canvas = this.game.canvas;
    canvas.removeAttribute('aria-hidden');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Arc & Armor battlefield. Escape or P pauses. H opens help.');
    this.menu = new BattleMenu(
      canvas,
      this.settings,
      {
        onPauseChange: (paused) => {
          // The pause click/key is also a user gesture: let it unlock audio for pointer-only
          // players, then freeze or thaw playback alongside the simulation.
          this.audio.unlock();
          if (this.paused !== paused) this.audio.playMenuToggle(paused);
          this.setPaused(paused);
        },
        onSettingsChange: (settings) => {
          this.settings = settings;
          this.audio.unlock();
          this.audio.applySettings(settings);
          try {
            saveSettings(window.localStorage, settings);
          } catch {
            // Accessing localStorage itself may be denied; preferences still work this session.
          }
          this.drawAimGuide();
          this.publishTestState();
        },
        onRestart: () => this.restartMatch(),
        onBackgroundChange: (id) => {
          this.landscape.setBackground(id);
          this.terrainView.setBackground(this.landscape.activeBackground);
          // Paused scenes don't run their regular update. Redraw only presentation now;
          // retain the original surface samples so craters/grass cannot reset on switching.
          this.terrainView.update(this.engine.terrain);
        },
        onNewDraft: () => this.scene.start('DraftScene'),
        onMainMenu: () => this.scene.start('MenuScene'),
      },
      this.hud.menuHost,
    );
    const pauseWhenHidden = (): void => {
      if (document.hidden) this.menu.open();
    };
    const pauseOnBlur = (): void => this.menu.open();
    document.addEventListener('visibilitychange', pauseWhenHidden);
    this.game.events.on(Phaser.Core.Events.BLUR, pauseOnBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      this.game.events.off(Phaser.Core.Events.BLUR, pauseOnBlur);
      this.menu.destroy();
      this.hud.destroy();
      this.audio.destroy();
      document.body.dataset.paused = 'false';
    });
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.audio.setPaused(paused);
    this.heldTouchControls.clear();
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.resetKeys();
      keyboard.enabled = !paused;
    }
    this.input.enabled = !paused;
    if (paused) {
      this.tweens.pauseAll();
      this.cameras.main.shakeEffect.reset();
    } else {
      this.tweens.resumeAll();
    }
    this.hud.update(this.engine, paused);
    this.publishTestState();
  }

  private updateHeldControls(deltaSeconds: number): void {
    if (!this.engine.acceptsInput) this.heldTouchControls.clear();
    const held = (key: Phaser.Input.Keyboard.Key | undefined, touch: string): boolean =>
      (key?.isDown ?? false) || this.heldTouchControls.has(touch);
    const c = this.controls;
    const move = Number(held(c?.moveRight, 'move-right')) - Number(held(c?.moveLeft, 'move-left'));
    const angle = Number(held(c?.angleUp, 'angle-up')) - Number(held(c?.angleDown, 'angle-down'));
    const power = Number(held(c?.powerUp, 'power-up')) - Number(held(c?.powerDown, 'power-down'));
    // Drive rate scaled with the 320-unit allowance: full movement takes ~1.7s of holding.
    if (move !== 0) this.engine.moveActiveTank(move * 190 * deltaSeconds);
    if (angle !== 0 || power !== 0) {
      this.engine.adjustAim(angle * 38 * deltaSeconds, power * 0.48 * deltaSeconds);
    }
  }

  private stepHudControl(control: HudControl): void {
    this.audio.unlock();
    if (this.paused || !this.engine.acceptsInput) return;
    if (control === 'move-left' || control === 'move-right')
      this.engine.moveActiveTank(control === 'move-left' ? -8 : 8);
    else
      this.engine.adjustAim(
        control === 'angle-up' ? 1 : control === 'angle-down' ? -1 : 0,
        control === 'power-up' ? 0.01 : control === 'power-down' ? -0.01 : 0,
      );
    this.hud.update(this.engine, this.paused);
  }

  // -------------------------------------------------------------------------------------------
  // Presentation
  // -------------------------------------------------------------------------------------------

  private refreshPresentation(deltaSeconds: number): void {
    this.landscape.update(deltaSeconds);
    const state = this.engine.state;
    const events = this.engine.drainEvents();
    this.eventLog.push(...events);
    if (this.eventLog.length > 400) this.eventLog.splice(0, this.eventLog.length - 400);
    this.combatView.handleEvents(events, state.tanks, this.engine.terrain);
    this.tankViews.forEach((view, i) => view.handleEvents(state.tanks[i]!, events));
    // Audio consumes the same drained event batch as the other presentation layers. It never
    // feeds anything back into the engine, so playback cannot skew future state/replays.
    this.audio.handleEvents(events);
    const moved =
      state.tanks[0].x !== this.lastTankPositions[0] ||
      state.tanks[1].x !== this.lastTankPositions[1];
    this.lastTankPositions = [state.tanks[0].x, state.tanks[1].x];
    this.audio.update({
      paused: this.paused,
      phase: state.phase,
      projectiles: state.projectiles,
      activeDistance: 0,
      activeAngle: this.engine.activeTank.aim.angleDegrees,
      movedThisFrame: moved,
    });
    for (const event of events) {
      if (event.type === 'explosion' && this.settings.screenShake && !this.reducedMotion) {
        this.cameras.main.shake(180, Math.min(0.012, event.blastRadius / 9000));
      } else if (event.type === 'tank-damaged') {
        const tank = state.tanks.find((t) => t.playerId === event.tankId);
        if (tank !== undefined) {
          const damage = this.add
            .text(
              tank.x * BATTLEFIELD_SCALE,
              (tank.groundY - 90) * BATTLEFIELD_SCALE,
              `${event.cause === 'direct-hit' ? 'DIRECT! ' : event.cause === 'fall' ? 'FALL ' : ''}−${event.amount}`,
              textStyle(22, COLOR.text, { font: 'display', stroke: COLOR.ink, strokeThickness: 5 }),
            )
            .setOrigin(0.5)
            .setDepth(45);
          this.tweens.add({
            targets: damage,
            y: damage.y - (this.reducedMotion ? 0 : 36),
            alpha: 0,
            delay: 350,
            duration: 700,
            onComplete: () => damage.destroy(),
          });
        }
      }
    }

    this.terrainView.update(this.engine.terrain);
    this.tankViews[0].update(state.tanks[0], state.activePlayerId === 'player1', deltaSeconds);
    this.tankViews[1].update(state.tanks[1], state.activePlayerId === 'player2', deltaSeconds);
    this.combatView.update(
      deltaSeconds,
      state.projectiles,
      state.explosions,
      this.engine.drainProjectileMotion(),
      this.engine.interpolationAlpha,
      state.tanks,
    );
    this.drawAimGuide();
    this.hud.update(this.engine, this.paused);
    this.publishTestState();
  }

  /** Mirrors key state onto <body> data attributes so browser tests can observe the game. */
  private publishTestState(): void {
    const state = this.engine.state;
    const active = this.engine.activeTank;
    const data = document.body.dataset;
    data.phase = state.phase;
    data.paused = String(this.paused);
    data.trajectoryPreview = String(this.settings.trajectoryPreview);
    data.screenShake = String(this.settings.screenShake && !this.reducedMotion);
    data.turn = String(state.turnNumber);
    data.activePlayer = state.activePlayerId;
    data.terrainRevision = String(this.engine.terrain.revision);
    data.weapon = active.selectedWeaponId;
    data.angle = String(Math.round(active.aim.angleDegrees));
    data.power = String(Math.round(active.aim.power * 100));
    data.movementRemaining = String(active.movementRemaining);
    data.ammo = JSON.stringify(active.inventory);
    data.p1Weapons = this.engine
      .carriedWeapons('player1')
      .map((weapon) => weapon.id)
      .join(',');
    data.p2Weapons = this.engine
      .carriedWeapons('player2')
      .map((weapon) => weapon.id)
      .join(',');
    data.drafted = String(this.setup !== undefined);
    data.projectiles = String(state.projectiles.length);
    data.projectilePositions = JSON.stringify(
      state.projectiles.map((p) => [p.id, p.x, p.y, p.ageSeconds]),
    );
    data.trails = String(this.combatView.activeTrailCount);
    data.particles = String(this.combatView.activeParticleCount);
    data.renderedProjectiles = JSON.stringify(this.combatView.motion.rendered);
    data.animationCounts = JSON.stringify(this.combatView.animationCounts);
    data.audioState = this.audio.state;
    data.audioCues = JSON.stringify(this.audio.playedCueCounts);
    data.muted = String(this.settings.muted);
    data.masterVolume = String(Math.round(this.settings.masterVolume * 100));
    data.tankAnimations = JSON.stringify(
      this.tankViews.map((view, i) => ({
        x: state.tanks[i]!.x,
        y: state.tanks[i]!.groundY,
        hullAngle: state.tanks[i]!.hullAngle,
        angle: view.animation.angle,
        trackDistance: view.animation.trackDistance,
        recoil: view.animation.recoil,
        hitAlpha: view.animation.hitAlpha,
        destroyed: view.animation.destroyed,
        destructionAge: view.animation.destructionAge,
        modelId: state.tanks[i]!.modelId,
      })),
    );
    data.visualTheme = this.landscape.activeBackground;
    data.worldWidth = String(WORLD_BOUNDS.width);
    data.worldHeight = String(WORLD_BOUNDS.height);
    data.battlefieldScale = String(this.worldLayer.scaleX);
    data.aimPreviewSeconds = String(AIM_PREVIEW_SECONDS);
    data.spawnSeparation = String(state.tanks[1].x - state.tanks[0].x);
    data.tankDesigns = state.tanks.map((t) => t.modelId).join(',');
    data.tankBarrels = JSON.stringify(
      this.tankViews.map((view, i) => view.barrelEvidence(state.tanks[i]!)),
    );
    data.health = `${state.tanks[0].health},${state.tanks[1].health}`;
    data.winner = state.winnerId ?? '';
    if (this.online !== undefined) {
      data.onlineSlot = this.online.slot;
      data.onlineRoom = 'joined';
    }
    const counts: Record<string, number> = {};
    for (const event of this.eventLog) counts[event.type] = (counts[event.type] ?? 0) + 1;
    data.eventCounts = JSON.stringify(counts);
  }

  private drawAimGuide(): void {
    this.aimGuide.clear();
    if (!this.engine.acceptsInput || !this.settings.trajectoryPreview) return;
    const weapon = this.engine.selectedWeapon;
    // The preview uses the same integrator as the live simulation; it never affects outcomes.
    const points = predictTrajectory(
      this.engine.terrain,
      this.engine.activeTank,
      weapon,
      this.engine.state.wind,
      // Short launch-direction aid only, never a near-full aiming solution across the map.
      AIM_PREVIEW_SECONDS,
    );
    points.forEach((point, index) => {
      if (index % 4 === 2) {
        const radius = Math.max(1.5, 3.6 - index * 0.02);
        this.aimGuide.fillStyle(COLOR.ink, 0.5);
        this.aimGuide.fillCircle(point.x, point.y, radius + 1.2);
        this.aimGuide.fillStyle(PLAYER_THEME[this.engine.state.activePlayerId].light, 0.85);
        this.aimGuide.fillCircle(point.x, point.y, radius);
      }
    });
  }
}
