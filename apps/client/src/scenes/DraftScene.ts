import Phaser from 'phaser';

import { GAME_TITLE, type WeaponDefinition, type WeaponId, tankModel } from '@artillery/content';
import {
  GAME_WEAPONS as WEAPON_CATALOG,
  DEFAULT_ROUND_NAME,
  DRAFT_POOL_SIZE,
} from '../game/GameArsenal';
import {
  createRandomPoolDraftConfig,
  dealRandomDraft,
  SeededRandom,
  WeaponDraft,
  type PlayerId,
} from '@artillery/simulation';

import { resolveDraftSeed, type MatchSetup } from '../match/MatchSetup';
import { onKeyPress } from '../input/keyPress';
import { drawWeaponIcon } from '../ui/WeaponIcons';
import { weaponStatBars, weaponTags } from '../ui/weaponStats';
import { LandscapeView } from '../rendering/LandscapeRenderer';
import { createTankPortrait } from '../rendering/TankRenderer';
import { currentTanks } from '../settings/TankSelection';
import { preloadTankSprites } from '../rendering/TankSprites';
import { preloadBackgrounds } from '../rendering/BackgroundCatalog';
import { VIEW_BOUNDS } from '../rendering/BattlefieldLayout';
import { arcadeButton, setButtonEnabled } from '../ui/ArcadeButton';
import { ResponsiveDraft } from '../ui/ResponsiveDraft';
import { COLOR, FONT, PLAYER_THEME, css, drawPanel, drawEmblem, textStyle } from '../ui/theme';

// Pre-match weapon draft. Players take turns claiming weapons; a claimed weapon belongs to
// that player alone, so the two loadouts never share a drafted weapon. Standard Shell is
// standard issue for both. Players can choose each weapon, take a random pick, or have the
// whole draft dealt at random. All rules live in the simulation package's WeaponDraft.

const MONO = FONT.body;
const SANS = FONT.display;
const PLAYER_COLOR: Record<PlayerId, number> = {
  player1: PLAYER_THEME.player1.primary,
  player2: PLAYER_THEME.player2.primary,
};
const PLAYER_TEXT: Record<PlayerId, string> = {
  player1: PLAYER_THEME.player1.text,
  player2: PLAYER_THEME.player2.text,
};
const PLAYER_NAME: Record<PlayerId, string> = { player1: 'PLAYER 1', player2: 'PLAYER 2' };

// Pool grid: 4 columns × 3 rows of cards, centred.
const CARD_W = 172;
const CARD_H = 112;
const CARD_GAP = 12;
const GRID_COLUMNS = 4;
const GRID_X = VIEW_BOUNDS.width / 2 - (GRID_COLUMNS * CARD_W + (GRID_COLUMNS - 1) * CARD_GAP) / 2;
const GRID_Y = 118;
const SIDE_W = 222;
const KEY_NAMES = [
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
];

const hex = css;

interface Card {
  readonly weapon: WeaponDefinition;
  readonly x: number;
  readonly y: number;
  readonly frame: Phaser.GameObjects.Graphics;
  readonly icon: Phaser.GameObjects.Graphics;
  readonly badge: Phaser.GameObjects.Text;
  readonly hit: Phaser.GameObjects.Zone;
}

export class DraftScene extends Phaser.Scene {
  private draft!: WeaponDraft;
  private rng!: SeededRandom;
  private seed = 1;
  private poolConfig!: ReturnType<typeof createRandomPoolDraftConfig>;
  private poolWeapons: WeaponDefinition[] = [];
  private cards: Card[] = [];
  private hoveredId: WeaponId | undefined;
  private banner!: Phaser.GameObjects.Text;
  private subBanner!: Phaser.GameObjects.Text;
  private rosterText!: Record<PlayerId, Phaser.GameObjects.Text>;
  private rosterFrame!: Phaser.GameObjects.Graphics;
  private detail!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Text[] = [];
  private renderedKey = '';
  private landscape!: LandscapeView;
  private seedOverride: number | undefined;
  private responsiveDraft: ResponsiveDraft | undefined;

  public constructor() {
    super({ key: 'DraftScene' });
  }

  public init(data: { seed?: number } | undefined): void {
    this.seedOverride = data?.seed;
  }

  public preload(): void {
    preloadBackgrounds(this);
    preloadTankSprites(this, currentTanks());
  }

  public create(): void {
    this.game.canvas.removeAttribute('aria-hidden');
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute(
      'aria-label',
      'Weapon draft. Choose with number keys or tap cards. Escape returns to main menu.',
    );
    if (this.input.keyboard !== null) this.input.keyboard.enabled = true;
    this.seed = this.seedOverride ?? resolveDraftSeed();
    this.rng = new SeededRandom(this.seed);
    // Each match deals a fresh seeded random pool (20 of the full depot roster) that both
    // players draft from. The legacy 12-weapon fixture still drafts its whole small pool.
    this.poolConfig = createRandomPoolDraftConfig(WEAPON_CATALOG, this.rng, DRAFT_POOL_SIZE);
    this.draft = new WeaponDraft(this.poolConfig, WEAPON_CATALOG);
    const poolSet = new Set([...this.poolConfig.pool, ...this.poolConfig.shared]);
    this.poolWeapons = WEAPON_CATALOG.filter((weapon) => poolSet.has(weapon.id));
    this.cards = [];
    this.buttons = [];
    this.hoveredId = undefined;
    this.renderedKey = '';

    this.drawBackground();
    this.createHeader();
    this.createRosters();
    if (WEAPON_CATALOG.length <= 12) this.createCards();
    this.createControls();
    this.createKeyboard();
    this.responsiveDraft = new ResponsiveDraft(this.poolWeapons, this.game.canvas, {
      choose: (id) => this.choose(id),
      randomPick: () => this.randomPick(),
      randomizeRemaining: () => this.randomizeRemaining(),
      dealAllRandom: () => this.dealAllRandom(),
      undo: () => this.undo(),
      reset: () => this.reset(),
      start: () => this.startBattle(),
      home: () => this.scene.start('MenuScene'),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.responsiveDraft?.destroy();
      this.responsiveDraft = undefined;
    });
    this.refresh();

    const home = document.createElement('button');
    home.className = 'draft-home';
    home.type = 'button';
    home.textContent = '← Main menu';
    home.addEventListener('click', () => this.scene.start('MenuScene'));
    home.addEventListener('keydown', (event) => event.stopPropagation());
    home.addEventListener('keyup', (event) => event.stopPropagation());
    document.body.append(home);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => home.remove());

    document.body.dataset.gameReady = 'true';
    document.body.dataset.scene = 'draft';
  }

  public override update(_time: number, delta: number): void {
    this.landscape.update(Math.min(0.05, delta / 1000));
  }

  // -------------------------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------------------------

  private choose(weaponId: WeaponId): void {
    const picker = this.draft.currentPicker;
    if (picker === undefined) return;
    const result = this.draft.pick(picker, weaponId);
    if (!result.accepted) {
      const reason =
        result.reason === 'already-taken'
          ? `already drafted by ${PLAYER_NAME[result.takenBy ?? 'player1']}`
          : result.reason.replaceAll('-', ' ');
      this.flash(`${this.weaponName(weaponId)} is ${reason}.`);
    }
    this.refresh();
  }

  private randomPick(): void {
    this.draft.pickRandom(this.rng);
    this.refresh();
  }

  private randomizeRemaining(): void {
    this.draft.completeRandomly(this.rng);
    this.refresh();
  }

  /** Discards any picks and deals both loadouts at random from the next seed. */
  private dealAllRandom(): void {
    const dealt = dealRandomDraft(this.draft.config, WEAPON_CATALOG, this.rng);
    this.draft = dealt;
    this.refresh();
  }

  private undo(): void {
    this.draft.undo();
    this.refresh();
  }

  private reset(): void {
    this.draft.reset();
    this.refresh();
  }

  private startBattle(): void {
    if (!this.draft.isComplete) return;
    const methods = new Set(this.draft.picks.map((pick) => pick.method));
    const setup: MatchSetup = {
      loadouts: this.draft.loadouts(),
      draftMode: methods.size > 1 ? 'mixed' : methods.has('random') ? 'random' : 'chosen',
      seed: this.seed,
    };
    this.scene.start('BattlefieldScene', setup);
  }

  // -------------------------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------------------------

  private drawBackground(): void {
    this.landscape = new LandscapeView(this);
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(COLOR.ink, 0.57);
    g.fillRect(0, 0, 1280, 720);
    drawPanel(g, GRID_X, 490, 724, 110, { fill: COLOR.panelDeep, rim: COLOR.panelRim });
    drawPanel(g, 144, 630, 1096, 72, { fill: COLOR.panelDeep });
    for (const player of ['player1', 'player2'] as const) {
      const x = player === 'player1' ? 130 : 1150;
      createTankPortrait(this, player, x, 608, 1.2).setDepth(3);
      this.add
        .text(
          x,
          615,
          tankModel(currentTanks()[player === 'player1' ? 0 : 1]).name,
          textStyle(14, PLAYER_THEME[player].text, { font: 'display', stroke: COLOR.ink }),
        )
        .setOrigin(0.5)
        .setDepth(3);
    }
  }

  private createHeader(): void {
    this.add
      .text(
        VIEW_BOUNDS.width / 2,
        16,
        `${GAME_TITLE.toUpperCase()}  /  ARMORY`,
        textStyle(30, COLOR.gold, { font: 'display', stroke: COLOR.ink, shadow: true }),
      )
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.banner = this.add
      .text(VIEW_BOUNDS.width / 2, 60, '', {
        fontFamily: SANS,
        fontSize: '19px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.subBanner = this.add
      .text(VIEW_BOUNDS.width / 2, 88, '', {
        color: css(COLOR.textDim),
        fontFamily: MONO,
        fontSize: '12px',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  private createRosters(): void {
    this.rosterFrame = this.add.graphics().setDepth(3);
    const style = (playerId: PlayerId): Phaser.Types.GameObjects.Text.TextStyle => ({
      color: PLAYER_TEXT[playerId],
      fontFamily: MONO,
      fontSize: '14px',
      lineSpacing: 13,
      wordWrap: { width: SIDE_W - 28 },
    });
    this.rosterText = {
      player1: this.add.text(32, GRID_Y + 100, '', style('player1')).setDepth(5),
      player2: this.add
        .text(VIEW_BOUNDS.width - SIDE_W - 6, GRID_Y + 100, '', style('player2'))
        .setDepth(5),
    };
    for (const player of ['player1', 'player2'] as const) {
      const x = player === 'player1' ? 18 : VIEW_BOUNDS.width - SIDE_W - 18;
      const theme = PLAYER_THEME[player];
      const emblem = this.add.graphics().setDepth(5);
      drawEmblem(emblem, theme, x + 29, GRID_Y + 35, 16);
      this.add
        .text(x + 54, GRID_Y + 18, theme.tankName, textStyle(18, theme.text, { font: 'display' }))
        .setDepth(5);
      this.add.text(x + 54, GRID_Y + 45, theme.name, textStyle(11, COLOR.textDim)).setDepth(5);
      this.add
        .text(x + 15, GRID_Y + 77, 'STANDARD SHELL  /  UNLIMITED', textStyle(10, COLOR.textDim))
        .setDepth(5);
    }
  }

  private createCards(): void {
    this.draft.config.pool.forEach((weaponId, index) => {
      const weapon = WEAPON_CATALOG.find((entry) => entry.id === weaponId);
      if (weapon === undefined) return;
      const column = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const x = GRID_X + column * (CARD_W + CARD_GAP);
      const y = GRID_Y + row * (CARD_H + CARD_GAP);
      const frame = this.add.graphics().setDepth(3);
      const icon = this.add
        .graphics()
        .setPosition(x + 34, y + 38)
        .setDepth(4);
      icon.fillStyle(COLOR.panelRim, 0.6);
      icon.fillCircle(0, 0, 25);
      drawWeaponIcon(icon, weapon.icon, 40, weapon.accent);
      this.add
        .text(x + 66, y + 14, weapon.name.toUpperCase(), {
          color: hex(weapon.accent),
          fontFamily: SANS,
          fontSize: '14px',
          fontStyle: 'bold',
          wordWrap: { width: CARD_W - 74 },
        })
        .setDepth(5);
      this.add
        .text(x + 66, y + 50, weapon.role, {
          color: css(COLOR.textDim),
          fontFamily: MONO,
          fontSize: '10px',
          wordWrap: { width: CARD_W - 74 },
        })
        .setDepth(5);
      this.add
        .text(
          x + 10,
          y + CARD_H - 22,
          `×${weapon.ammo === 'unlimited' ? '∞' : weapon.ammo}   key ${this.keyLabel(index)}`,
          {
            color: css(COLOR.textDim),
            fontFamily: MONO,
            fontSize: '10px',
          },
        )
        .setDepth(5);
      const badge = this.add
        .text(x + CARD_W - 10, y + CARD_H - 10, '', {
          fontFamily: MONO,
          fontSize: '11px',
          fontStyle: 'bold',
        })
        .setOrigin(1, 1)
        .setDepth(5);
      const hit = this.add
        .zone(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.choose(weapon.id));
      hit.on('pointerover', () => {
        this.hoveredId = weapon.id;
        this.renderedKey = '';
        this.refresh();
      });
      hit.on('pointerout', () => {
        if (this.hoveredId === weapon.id) this.hoveredId = undefined;
        this.renderedKey = '';
        this.refresh();
      });
      this.cards.push({ weapon, x, y, frame, icon, badge, hit });
    });

    this.detail = this.add
      .text(GRID_X + 16, 506, '', textStyle(14, COLOR.text, { wrap: 692, lineSpacing: 5 }))
      .setDepth(5);
  }

  private createControls(): void {
    const y = 664;
    const specs: [string, () => void, number, number][] = [
      ['RANDOM PICK  [R]', () => this.randomPick(), 230, COLOR.control],
      ['RANDOMIZE REST  [T]', () => this.randomizeRemaining(), 400, COLOR.control],
      ['DEAL ALL RANDOM  [A]', () => this.dealAllRandom(), 580, 0x6550ad],
      ['UNDO  [U]', () => this.undo(), 740, COLOR.control],
      ['RESET', () => this.reset(), 850, COLOR.control],
    ];
    for (const [label, action, x, color] of specs) {
      const width = label.length * 8 + 28;
      this.buttons.push(this.makeButton(x, y, label, width, 42, color, action));
    }
    this.startButton = this.makeButton(1110, y, 'START BATTLE  ⏎', 240, 52, COLOR.fire, () =>
      this.startBattle(),
    );
  }

  private createKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    onKeyPress(keyboard, 'ESC', () => this.scene.start('MenuScene'));
    this.draft.config.pool.forEach((weaponId, index) => {
      const key = KEY_NAMES[index];
      if (key !== undefined) onKeyPress(keyboard, key, () => this.choose(weaponId));
    });
    onKeyPress(keyboard, 'R', () => this.randomPick());
    onKeyPress(keyboard, 'T', () => this.randomizeRemaining());
    onKeyPress(keyboard, 'A', () => this.dealAllRandom());
    onKeyPress(keyboard, 'U', () => this.undo());
    onKeyPress(keyboard, 'BACKSPACE', () => this.undo());
    onKeyPress(keyboard, 'ENTER', () => this.startBattle());
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    width: number,
    height: number,
    color: number,
    action: () => void,
  ): Phaser.GameObjects.Text {
    const button = arcadeButton(this, x, y, label, width, height, color, 12, 10);
    button.on('pointerdown', action);
    return button;
  }

  // -------------------------------------------------------------------------------------------
  // Presentation
  // -------------------------------------------------------------------------------------------

  private refresh(): void {
    const draft = this.draft;
    const key = `${draft.picks.map((pick) => pick.weaponId).join(',')}|${this.hoveredId ?? ''}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.responsiveDraft?.update(draft, WEAPON_CATALOG, this.seed);
    const picker = draft.currentPicker;

    // Banner: whose turn, or ready to start.
    if (picker === undefined) {
      this.banner.setText('DRAFT COMPLETE — READY FOR BATTLE').setColor('#9ee29a');
      this.subBanner.setText(
        `Unclaimed: ${draft.unclaimed.length}  ·  ${DEFAULT_ROUND_NAME} is standard issue for both`,
      );
    } else {
      const remaining = draft.totalPicks - draft.picks.length;
      this.banner.setText(`${PLAYER_NAME[picker]} — CHOOSE A WEAPON`).setColor(PLAYER_TEXT[picker]);
      this.subBanner.setText(
        `Pick ${draft.picks.length + 1} of ${draft.totalPicks}  ·  ${remaining} left  ·  a drafted weapon belongs to that player only  ·  seed ${this.seed}`,
      );
    }

    // Cards: owner badge, colour, and whether they can still be picked.
    for (const card of this.cards) {
      const owner = draft.ownerOf(card.weapon.id);
      const ownerId = owner === 'player1' || owner === 'player2' ? owner : undefined;
      const pick = draft.pickOf(card.weapon.id);
      const pickable = ownerId === undefined && picker !== undefined;
      const hovered = this.hoveredId === card.weapon.id && pickable;
      card.frame.clear();
      const outline =
        ownerId !== undefined
          ? PLAYER_COLOR[ownerId]
          : hovered && picker !== undefined
            ? PLAYER_COLOR[picker]
            : COLOR.panelRim;
      drawPanel(card.frame, card.x, card.y, CARD_W, CARD_H, {
        fill: ownerId !== undefined ? COLOR.panelDeep : hovered ? COLOR.control : COLOR.panel,
        rim: outline,
        rimWidth: ownerId !== undefined || hovered ? 3 : 1,
        radius: 12,
      });
      if (ownerId !== undefined) {
        card.frame.fillStyle(PLAYER_COLOR[ownerId], 0.12);
        card.frame.fillRoundedRect(card.x + 3, card.y + 76, CARD_W - 6, 33, 7);
      }
      card.icon.setAlpha(ownerId === undefined ? 1 : 0.35);
      card.badge.setText(
        ownerId === undefined
          ? picker === undefined
            ? 'UNCLAIMED'
            : ''
          : `${ownerId === 'player1' ? 'P1' : 'P2'}${pick?.method === 'random' ? ' · RANDOM' : ''}`,
      );
      card.badge.setColor(ownerId === undefined ? '#7f9c98' : PLAYER_TEXT[ownerId]);
      // Claimed cards stay clickable so a click explains who owns them; only the hand cursor
      // changes. The draft itself rejects any pick of a claimed weapon.
      card.hit.setInteractive({ useHandCursor: pickable });
    }

    // Rosters.
    this.rosterFrame.clear();
    for (const playerId of ['player1', 'player2'] as const) {
      const x = playerId === 'player1' ? 18 : VIEW_BOUNDS.width - SIDE_W - 18;
      const active = picker === playerId;
      drawPanel(this.rosterFrame, x, GRID_Y, SIDE_W, 3 * CARD_H + 2 * CARD_GAP, {
        fill: COLOR.panelDeep,
        rim: PLAYER_COLOR[playerId],
        rimWidth: active ? 3 : 1,
        rimAlpha: active ? 1 : 0.45,
      });
      this.rosterFrame.lineStyle(1, PLAYER_COLOR[playerId], 0.25);
      this.rosterFrame.lineBetween(x + 14, GRID_Y + 67, x + SIDE_W - 14, GRID_Y + 67);
      const picks = draft.picks.filter((pick) => pick.playerId === playerId);
      const slots = draft.order.filter((id) => id === playerId).length;
      const lines = Array.from({ length: slots }, (_, index) => {
        const pick = picks[index];
        return pick === undefined
          ? `${index + 1}. ——`
          : `${index + 1}. ${this.weaponName(pick.weaponId)}${pick.method === 'random' ? ' ⚄' : ''}`;
      });
      this.rosterText[playerId].setText(
        [...lines, '', active ? '◀ YOUR PICK' : `${picks.length} / ${slots} SELECTED`].join('\n'),
      );
    }

    // Hovered weapon detail line.
    const focus = this.cards.find((card) => card.weapon.id === this.hoveredId)?.weapon;
    if (focus === undefined) {
      this.detail.setText(
        `BUILD YOUR LOADOUT\nChoose five exclusive weapons each. ${DEFAULT_ROUND_NAME} is always available.\nHover for weapon stats · click / tap / number key to pick · ⚄ marks a random pick`,
      );
    } else {
      const stats = weaponStatBars(focus)
        .map((bar) => `${bar.label} ${bar.text}`)
        .join('  ·  ');
      const tags = weaponTags(focus);
      this.detail.setText(
        `${focus.name}: ${focus.description}\n${stats}${tags.length > 0 ? `  ·  ${tags.join(' · ')}` : ''}`,
      );
    }

    // Controls.
    const canPick = picker !== undefined;
    const canUndo = draft.picks.length > 0;
    const enabled = [canPick, canPick, true, canUndo, canUndo];
    this.buttons.forEach((button, index) => {
      const on = enabled[index] ?? false;
      setButtonEnabled(button, on);
    });
    setButtonEnabled(this.startButton, draft.isComplete);

    this.publishTestState();
  }

  private publishTestState(): void {
    const data = document.body.dataset;
    data.draftPicker = this.draft.currentPicker ?? '';
    data.draftComplete = String(this.draft.isComplete);
    data.draftPicks = JSON.stringify(
      this.draft.picks.map((pick) => [pick.playerId, pick.weaponId, pick.method]),
    );
    data.draftP1 = this.draft.picksOf('player1').join(',');
    data.draftP2 = this.draft.picksOf('player2').join(',');
    data.draftSeed = String(this.seed);
  }

  private flash(message: string): void {
    this.subBanner.setText(message).setColor('#ff9e99');
    this.time.delayedCall(1400, () => {
      this.subBanner.setColor('#9fc9c4');
      this.renderedKey = '';
      this.refresh();
    });
  }

  private weaponName(weaponId: WeaponId): string {
    return WEAPON_CATALOG.find((weapon) => weapon.id === weaponId)?.name ?? weaponId;
  }

  private keyLabel(index: number): string {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−'][index] ?? '';
  }
}
