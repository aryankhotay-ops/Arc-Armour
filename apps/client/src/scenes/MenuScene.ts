import Phaser from 'phaser';
import { GAME_WEAPONS as WEAPON_CATALOG, DRAFT_POOL_SIZE } from '../game/GameArsenal';
import { createRandomPoolDraftConfig, dealRandomDraft, SeededRandom } from '@artillery/simulation';

import { GameAudio } from '../audio/GameAudio';
import { resolveDraftSeed, type MatchSetup } from '../match/MatchSetup';
import { LandscapeView } from '../rendering/LandscapeRenderer';
import { preloadBackgrounds } from '../rendering/BackgroundCatalog';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type LocalSettings,
} from '../settings/LocalSettings';
import { MainMenu, type LocalMode } from '../ui/MainMenu';
import { OnlinePanel } from '../online/OnlinePanel';
import { pendingJoinCode } from '../online/OnlineClient';
import type { OnlineMatchData } from './BattlefieldScene';

// A real front-end scene, not a modal sitting on top of a running match. Simulation only
// starts after selecting a local mode; no timers/projectiles run behind menu screens.
export class MenuScene extends Phaser.Scene {
  private landscape!: LandscapeView;
  private menu!: MainMenu;
  private audio!: GameAudio;
  private backgrounded = false;

  public constructor() {
    super({ key: 'MenuScene' });
  }

  public preload(): void {
    preloadBackgrounds(this);
  }

  public create(): void {
    if (this.input.keyboard !== null) {
      this.input.keyboard.resetKeys();
      this.input.keyboard.enabled = false;
    }
    this.backgrounded = document.hidden;
    let settings: LocalSettings;
    try {
      settings = loadSettings(window.localStorage);
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
    this.landscape = new LandscapeView(this);
    this.audio = new GameAudio(settings, (id) => WEAPON_CATALOG.find((w) => w.id === id)!);
    this.menu = new MainMenu(settings, resolveDraftSeed(), {
      play: (mode, seed) => this.play(mode, seed),
      gesture: () => {
        this.audio.unlock();
        this.audio.setPaused(this.backgrounded);
      },
      select: () => this.audio.playWeaponSelect(),
      backgroundChanged: (id) => this.landscape.setBackground(id),
      settingsChanged: (updated) => {
        this.audio.applySettings(updated);
        try {
          saveSettings(window.localStorage, updated);
        } catch {
          /* Storage may be denied; settings still work this session. */
        }
      },
      mountOnline: (host) => {
        const panel = new OnlinePanel(host, {
          start: (client, lobby, match) => {
            const names: Record<'player1' | 'player2', string> = {
              player1: 'Player 1',
              player2: 'Player 2',
            };
            for (const player of lobby.players) names[player.slot] = player.name;
            const online: OnlineMatchData['online'] = {
              client,
              slot: lobby.slot,
              terrainSeed: match.terrainSeed,
              names,
            };
            this.scene.start('BattlefieldScene', { online });
          },
        });
        return () => panel.destroy();
      },
    });
    // Invitation deep link: land straight on the online lobby with the code prefilled.
    if (pendingJoinCode() !== undefined) this.menu.openOnline();
    const hidden = (): void => {
      this.backgrounded = document.hidden;
      this.audio.setPaused(this.backgrounded);
    };
    const blur = (): void => {
      this.backgrounded = true;
      this.audio.setPaused(true);
    };
    const focus = (): void => {
      this.backgrounded = document.hidden;
      this.audio.setPaused(this.backgrounded);
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      this.menu.destroy();
      this.audio.destroy();
    });
    this.game.canvas.tabIndex = -1;
    this.game.canvas.setAttribute('aria-hidden', 'true');
    document.body.dataset.scene = 'menu';
    document.body.dataset.gameReady = 'true';
    document.body.dataset.paused = 'false';
  }

  public override update(_time: number, delta: number): void {
    if (!this.backgrounded) this.landscape.update(Math.min(0.05, delta / 1000));
    this.audio.update({
      paused: this.backgrounded,
      phase: 'menu',
      projectiles: [],
      activeDistance: 0,
      activeAngle: 45,
      movedThisFrame: false,
    });
    document.body.dataset.audioState = this.audio.state;
  }

  private play(mode: LocalMode, seed: number): void {
    if (mode === 'draft') this.scene.start('DraftScene', { seed });
    else if (mode === 'practice') this.scene.start('BattlefieldScene');
    else {
      // One seed drives both the random 20-weapon pool and the picks, so a quick match
      // deal is fully reproducible from its seed alone.
      const rng = new SeededRandom(seed);
      const draft = dealRandomDraft(
        createRandomPoolDraftConfig(WEAPON_CATALOG, rng, DRAFT_POOL_SIZE),
        WEAPON_CATALOG,
        rng,
      );
      const setup: MatchSetup = { loadouts: draft.loadouts(), draftMode: 'random', seed };
      this.scene.start('BattlefieldScene', setup);
    }
  }
}
