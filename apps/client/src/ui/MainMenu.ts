import { GAME_WEAPONS as WEAPON_CATALOG, DEFAULT_ROUND_NAME } from '../game/GameArsenal';
import { DEFAULT_SETTINGS, type LocalSettings } from '../settings/LocalSettings';
import {
  BACKGROUNDS,
  backgroundOptions,
  chooseBackground,
  currentBackground,
  type BackgroundId,
} from '../rendering/BackgroundCatalog';
import './main-menu.css';
import { tankPickerMarkup, bindTankPicker } from './TankPicker';

// Original Golden Valley front end. Native controls retain their real touch targets and
// focus at every viewport size; only the decorative Phaser backdrop is canvas-scaled.
// Online is deliberately a truthful status destination until an authoritative server exists.
type MenuScreen = 'local' | 'online' | 'weapons' | 'controls' | 'settings' | 'credits';
export type LocalMode = 'draft' | 'random' | 'practice';
interface MenuActions {
  readonly play: (mode: LocalMode, seed: number) => void;
  readonly settingsChanged: (settings: LocalSettings) => void;
  readonly gesture: () => void;
  readonly select: () => void;
  readonly backgroundChanged: (id: BackgroundId) => void;
  /** Mounts the online lobby panel; returns a cleanup for leaving the screen. */
  readonly mountOnline?: (host: HTMLElement) => () => void;
}

const ICONS = {
  local:
    '<rect x="3" y="12" width="26" height="11" rx="5"/><path d="M9 12V8h12v4M20 8l7-5M8 26h16"/><circle cx="10" cy="18" r="2"/><circle cx="22" cy="18" r="2"/>',
  online:
    '<circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24M7 9h18M7 23h18"/>',
  weapons: '<path d="M8 23L21 4l7 5-14 19-6-5ZM8 23l-5 6 11-1M19 8l7 5M11 19l7 5"/>',
  controls:
    '<rect x="2" y="7" width="28" height="19" rx="6"/><path d="M7 16h9M11.5 11.5v9"/><circle cx="23" cy="14" r="1"/><circle cx="26" cy="19" r="1"/>',
  settings:
    '<circle cx="16" cy="16" r="6"/><path d="M13 3h6l1 5 4 2 5-1 2 6-4 3-1 4 1 5-6 2-3-4-4-1-5 1-3-5 4-4 1-4-2-5 5-3Z"/>',
  credits: '<path d="m16 3 4 9 10 1-8 7 2 10-8-5-9 5 2-10-8-7 11-1Z"/>',
  sound: '<path d="M3 13h6l7-7v20l-7-7H3ZM21 10c4 3 4 9 0 12M25 6c7 5 7 15 0 20"/>',
};
const icon = (id: keyof typeof ICONS): string =>
  `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>`;

// Self-authored responsive hero graphic. These tanks are menu illustration, not collision
// geometry or gameplay trajectories. The real game keeps its physics-locked renderer.
const HERO_ART = `<svg class="front-art" viewBox="0 0 620 235" fill="none" aria-hidden="true">
  <defs><linearGradient id="menu-terrain" x1="0" y1="130" x2="0" y2="235" gradientUnits="userSpaceOnUse"><stop stop-color="#485b68"/><stop offset="1" stop-color="#181b38"/></linearGradient>
  <linearGradient id="menu-gold" x1="100" y1="100" x2="200" y2="230" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe29a"/><stop offset=".45" stop-color="#f6b335"/><stop offset="1" stop-color="#be6f26"/></linearGradient></defs>
  <path d="M12 219 72 165 139 190 257 124 327 156 402 104 512 166 604 144V235H12Z" fill="#273f54" opacity=".7"/>
  <path d="M5 217Q115 176 224 208T425 184T618 203V235H5Z" fill="url(#menu-terrain)"/>
  <path d="M5 217Q115 176 224 208T425 184T618 203" stroke="#99c48c" stroke-width="2" opacity=".8"/>
  <path class="menu-arc" d="M217 67Q365-20 514 139" stroke="#ffd166" stroke-width="2" stroke-dasharray="3 11" opacity=".65"/>
  <circle cx="365" cy="42" r="5" fill="#ffe9b5"/><circle cx="365" cy="42" r="11" stroke="#ffd166" opacity=".3"/>
  <g stroke="#ffd166" stroke-width="2" opacity=".55"><path d="M514 139l-11-9M514 139l13-6M514 139l0-15"/></g>
  <g transform="translate(141 191) rotate(-4)">
    <ellipse cy="18" rx="87" ry="13" fill="#101128" opacity=".6"/>
    <path d="M-51-10-58-47h103l19 36Z" fill="url(#menu-gold)" stroke="#17132e" stroke-width="5"/>
    <rect x="-38" y="-70" width="71" height="34" rx="13" fill="url(#menu-gold)" stroke="#17132e" stroke-width="5"/>
    <path d="M1-53 72-115" stroke="#17132e" stroke-width="17"/><path d="M1-53 72-115" stroke="#ffda78" stroke-width="10"/><path d="m62-115 11-11 11 13-12 10Z" fill="#ffe8aa" stroke="#17132e" stroke-width="4"/>
    <path d="M-28-73h41M-38-42h64" stroke="#fff0b2" stroke-width="4"/>
    <rect x="-72" y="-13" width="143" height="35" rx="16" fill="#24223d" stroke="#17132e" stroke-width="5"/>
    <g fill="#b58849" stroke="#efcf83" stroke-width="2"><circle cx="-52" cy="4" r="10"/><circle cx="-26" cy="4" r="10"/><circle cy="4" r="10"/><circle cx="26" cy="4" r="10"/><circle cx="52" cy="4" r="10"/></g>
    <path d="M-48-48-55-98" stroke="#dcd3b5" stroke-width="2"/><circle cx="-55" cy="-98" r="3" fill="#a8f4de"/>
    <circle cx="2" cy="-29" r="10" fill="#382b48"/><path d="m2-36 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#ffe6a5"/>
    <rect x="43" y="-36" width="11" height="7" rx="2" fill="#fff8d6"/>
  </g>
  <g transform="translate(515 164) scale(.52)">
    <path d="M-64 0-47-37h89L67 0Z" fill="#3f8cff" stroke="#17132e" stroke-width="5"/>
    <rect x="-28" y="-60" width="59" height="29" rx="7" fill="#68b0ff" stroke="#17132e" stroke-width="5"/>
    <path d="M0-45-64-99" stroke="#17132e" stroke-width="15"/><path d="M0-45-64-99" stroke="#a0d9ff" stroke-width="8"/>
    <rect x="-70" y="-5" width="140" height="33" rx="15" fill="#24223d" stroke="#17132e" stroke-width="5"/>
    <g fill="#3e639b" stroke="#b3d3ff" stroke-width="2"><circle cx="-48" cy="11" r="10"/><circle cx="-16" cy="11" r="10"/><circle cx="16" cy="11" r="10"/><circle cx="48" cy="11" r="10"/></g>
    <path d="m0-28 7 7-7 7-7-7Z" fill="#edfaff"/>
  </g>
</svg>`;

export class MainMenu {
  private readonly root = document.createElement('section');
  private readonly dialog = document.createElement('dialog');
  private settings: LocalSettings;
  private opener: HTMLElement | undefined;
  private activeScreen: MenuScreen | undefined;
  private readonly sound: HTMLButtonElement;
  private unmountOnline: (() => void) | undefined;

  public constructor(
    settings: LocalSettings,
    private readonly seed: number,
    private readonly actions: MenuActions,
  ) {
    this.settings = settings;
    this.root.className = 'front-shell';
    this.root.setAttribute('aria-label', 'Main menu');
    this.root.innerHTML = `
      <div class="front-inner">
        <header class="front-top"><span class="front-brand">${icon('local')} <b>A&A</b><span>ARTILLERY CLUB</span></span>
          <button type="button" class="front-sound" aria-label="Mute audio">${icon('sound')}<span>Sound on</span></button></header>
        <div class="front-content">
          <div class="front-hero">
            <p class="front-kicker"><span></span> WELCOME TO GOLDEN VALLEY</p>
            <h1><span>ARC <em>&</em></span><strong>ARMOR</strong></h1>
            <p class="front-tagline">Big hills. Bigger rivalries.</p>
            <p class="front-intro">Pick your arsenal. Read the wind.<br>Make every shot a little more personal.</p>
            ${HERO_ART}
            <div class="front-chips"><span>02 PLAYERS</span><span>${WEAPON_CATALOG.length} WEAPONS</span><span>DESTRUCTIBLE TERRAIN</span></div>
          </div>
          <nav class="front-nav" aria-label="Game modes and options">
            <p class="front-nav-label">CHOOSE YOUR NEXT MOVE <span>01 / 06</span></p>
            <button class="front-tile front-play" type="button" data-open="local" aria-label="Play local">
              <span class="front-tile-icon">${icon('local')}</span><span><strong>Play local</strong><small>Two rivals. One device. All yours.</small></span><span class="front-arrow" aria-hidden="true">↗</span></button>
            <button class="front-tile front-online" type="button" data-open="online" aria-label="Online multiplayer">
              <span class="front-tile-icon">${icon('online')}</span><span><strong>Online multiplayer</strong><small>Online status & availability</small></span><span class="front-badge">INFO</span></button>
            <div class="front-options">
              ${(['weapons', 'controls', 'settings', 'credits'] as const).map((name) => `<button class="front-tile front-small" type="button" data-open="${name}" aria-label="${name === 'weapons' ? 'Weapon selection' : name[0]!.toUpperCase() + name.slice(1)}"><span class="front-tile-icon">${icon(name)}</span><strong>${name === 'weapons' ? 'Weapon selection' : name[0]!.toUpperCase() + name.slice(1)}</strong><span class="front-arrow" aria-hidden="true">↗</span></button>`).join('')}
            </div>
            <p class="front-nav-note">LOCAL BUILD <span>●</span> NO ACCOUNT. JUST GOOD AIM.</p>
          </nav>
        </div>
        <footer class="front-footer"><span><kbd>↑</kbd><kbd>↓</kbd> NAVIGATE <i>·</i> <kbd>ENTER</kbd> SELECT <i>·</i> <kbd>ESC</kbd> BACK</span><span>ORIGINAL ARCADE ARTILLERY <b>v0.1</b></span></footer>
      </div>`;
    this.sound = this.root.querySelector<HTMLButtonElement>('.front-sound')!;
    this.dialog.className = 'front-dialog';
    this.dialog.setAttribute('aria-labelledby', 'front-panel-title');
    this.root.append(this.dialog);
    this.root.addEventListener('pointerdown', () => this.actions.gesture(), { capture: true });
    this.root.addEventListener('keydown', (event) => {
      this.actions.gesture();
      // Phaser's global key captures from previous game scenes must not cancel native controls.
      event.stopPropagation();
      if (event.key === 'Escape' && this.dialog.open) {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Tab') {
        this.wrapFocus(event, this.dialog.open ? this.dialog : this.root);
      } else if (!this.dialog.open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = Array.from(
          this.root.querySelectorAll<HTMLButtonElement>('.front-nav button'),
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }
    });
    this.root.addEventListener('keyup', (event) => event.stopPropagation());
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.root.addEventListener('click', (event) => {
      const button =
        event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (button === null) return;
      this.actions.select();
      const open = button.dataset.open as MenuScreen | undefined;
      if (open !== undefined) this.open(open, button);
      else if (button === this.sound)
        this.changeSettings({ ...this.settings, muted: !this.settings.muted });
      else if (button.dataset.action === 'back') this.close();
      else if (button.dataset.action === 'draft') this.actions.play('draft', this.seed);
      else if (button.dataset.weapon !== undefined) this.showWeapon(button.dataset.weapon);
      else if (button.dataset.action === 'reset-settings') {
        this.changeSettings({ ...DEFAULT_SETTINGS });
        this.open('settings', this.opener);
      }
    });
    this.dialog.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      if (form.dataset.form !== 'local' || !form.reportValidity()) return;
      const data = new FormData(form);
      this.actions.play(data.get('mode') as LocalMode, Number(data.get('seed')) >>> 0);
    });
    this.dialog.addEventListener('input', (event) => {
      if (event.target instanceof Element && event.target.closest('.tank-picker') !== null) return;
      this.readSettings();
    });
    this.dialog.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.tank-picker') !== null) return;
      if (target instanceof HTMLSelectElement && target.name === 'background') {
        this.actions.backgroundChanged(chooseBackground(target.value));
        this.syncBackground();
      } else this.readSettings();
    });
    document.body.append(this.root);
    this.syncSound();
    this.syncBackground();
    this.root
      .querySelector<HTMLButtonElement>('[data-open="local"]')
      ?.focus({ preventScroll: true });
    document.body.dataset.menuScreen = 'home';
  }

  public destroy(): void {
    this.unmountOnline?.();
    this.unmountOnline = undefined;
    if (this.dialog.open) this.dialog.close();
    this.root.remove();
    delete document.body.dataset.menuScreen;
  }

  /** Deep links (?join=CODE) land directly on the online lobby screen. */
  public openOnline(): void {
    this.open('online');
  }

  private open(screen: MenuScreen, opener = this.opener): void {
    this.unmountOnline?.();
    this.unmountOnline = undefined;
    this.activeScreen = screen;
    // A cross-link inside the panel is about to be replaced. Restore focus to its real
    // home navigation destination, not a now-detached button, when the panel closes.
    this.opener =
      opener !== undefined && !this.dialog.contains(opener)
        ? opener
        : (this.root.querySelector<HTMLButtonElement>(`.front-nav [data-open="${screen}"]`) ??
          this.opener);
    const titles: Record<MenuScreen, string> = {
      local: 'Play local',
      online: 'Online multiplayer',
      weapons: 'Weapon selection',
      controls: 'Controls',
      settings: 'Settings',
      credits: 'Credits',
    };
    this.dialog.innerHTML = `<header class="front-panel-header"><div><p class="front-kicker">ARTILLERY CLUB / ${screen.toUpperCase()}</p><h2 id="front-panel-title">${titles[screen]}</h2></div><button type="button" data-action="back" class="front-back" aria-label="Back to main menu">← Back</button></header><div class="front-panel-body">${this.content(screen)}</div>`;
    if (screen === 'local')
      this.dialog.querySelector<HTMLInputElement>('[name="seed"]')!.value = String(this.seed);
    if (screen === 'settings') this.fillSettings();
    if (screen === 'weapons') this.showWeapon(WEAPON_CATALOG[0]!.id);
    if (screen === 'online') {
      const host = this.dialog.querySelector<HTMLElement>('[data-online-panel]');
      if (host !== null) this.unmountOnline = this.actions.mountOnline?.(host);
    }
    bindTankPicker(this.dialog);
    this.syncBackground();
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.scrollTop = 0;
    this.dialog
      .querySelector<HTMLButtonElement>('[data-action="back"]')
      ?.focus({ preventScroll: true });
    document.body.dataset.menuScreen = screen;
  }

  private close(): void {
    this.unmountOnline?.();
    this.unmountOnline = undefined;
    this.dialog.close();
    this.activeScreen = undefined;
    document.body.dataset.menuScreen = 'home';
    this.opener?.focus({ preventScroll: true });
  }

  private content(screen: MenuScreen): string {
    switch (screen) {
      case 'local':
        return `<p class="front-lead">Settle it on the same screen.</p><p>Two players take turns on one device. Choose the scenery for the wide, destructible battlefield.</p>
        <form data-form="local"><fieldset class="front-modes"><legend>Choose your loadout rules</legend>
          <label><input type="radio" name="mode" value="draft" checked><span><b>Draft your weapons</b><small>Take turns choosing five exclusive weapons each.</small></span></label>
          <label><input type="radio" name="mode" value="random"><span><b>Quick random match</b><small>A fair, seeded deal. Jump straight into battle.</small></span></label>
          <label><input type="radio" name="mode" value="practice"><span><b>Full-arsenal practice</b><small>Both players get every weapon. No draft required.</small></span></label></fieldset>
          <label class="front-seed">Draft seed<input name="seed" type="number" min="0" max="4294967295" step="1" required inputmode="numeric" aria-describedby="seed-note"></label>
          <p id="seed-note" class="front-note">Draft seed reproduces weapon deals only. Each new match gets a fresh terrain layout: rolling hills, valleys, terraces or highlands.</p>
          ${this.backgroundPicker()}
          ${tankPickerMarkup()}
          <button class="front-cta" type="submit">Start local game <span aria-hidden="true">→</span></button></form>`;
      case 'online':
        return `<p class="front-lead">Challenge a friend anywhere.</p>
        <p>Create a private room and share its 4-letter code or invitation link. The authoritative server runs the whole battle; both screens replay the identical deterministic simulation.</p>
        <div data-online-panel></div>
        <button class="front-cta" type="button" data-open="local">Play on this device instead →</button>`;
      case 'weapons':
        return `<p>${WEAPON_CATALOG.length} weapons${WEAPON_CATALOG.length > 12 ? ' · Original 30 + Deluxe 30 only' : ''}. Five exclusive picks each. ${DEFAULT_ROUND_NAME} is always available.</p>
        <div class="front-armory" aria-label="Weapon catalog">${WEAPON_CATALOG.map((w, i) => `<button type="button" class="front-weapon" data-weapon="${w.id}" aria-pressed="false"><span>${String(i + 1).padStart(2, '0')}</span><b>${w.name}</b><small>${w.role}</small></button>`).join('')}</div>
        <section class="front-weapon-detail" aria-live="polite" aria-label="Weapon details"></section>
        <button class="front-cta" type="button" data-action="draft">Choose loadouts in the draft →</button>`;
      case 'controls':
        return `<p class="front-lead">Read the wind. Own the arc.</p><p>Reduce the other tank to zero health. Craters change the ground; falls deal damage. Controls lock until every warhead and explosion resolves.</p>
        <dl class="front-control-list"><dt>Drive</dt><dd><kbd>A</kbd> / <kbd>D</kbd> or hold MOVE buttons. Fuel resets each turn.</dd>
          <dt>Aim</dt><dd><kbd>W</kbd> / <kbd>S</kbd>, drag on the battlefield, or hold ANGLE − / +.</dd>
          <dt>Power</dt><dd><kbd>Q</kbd> / <kbd>E</kbd>, drag farther/closer, or hold POWER − / +.</dd>
          <dt>Weapons</dt><dd>Tap a slot; use number keys, <kbd>Z</kbd> / <kbd>X</kbd>, or <kbd>Tab</kbd>.</dd>
          <dt>Fire</dt><dd><kbd>Space</kbd> or tap FIRE.</dd><dt>Pause & help</dt><dd><kbd>Esc</kbd> / <kbd>P</kbd> pauses; <kbd>H</kbd> opens help.</dd>
          <dt>Draft</dt><dd>Tap cards or number keys to pick. <kbd>R</kbd> random pick, <kbd>T</kbd> randomize rest, <kbd>U</kbd> undo, <kbd>Enter</kbd> battle.</dd>
          <dt>Menu</dt><dd><kbd>↑</kbd> / <kbd>↓</kbd> or <kbd>Tab</kbd> to navigate; <kbd>Enter</kbd> / <kbd>Space</kbd> to select; <kbd>Esc</kbd> to go back.</dd></dl>
          <p class="front-note">Mouse, keyboard and touch are supported. Landscape is recommended for small phones. Player emblems and distinct silhouettes supplement team colors.</p>
          <button class="front-cta" type="button" data-open="local">Ready to play →</button>`;
      case 'settings':
        return `<p>Preferences are saved on this device and shared with the in-game pause menu.</p>
        <fieldset class="front-settings"><legend>Sound desk</legend>
          <label><span>Mute all audio</span><input type="checkbox" name="muted"></label>
          ${(['masterVolume', 'musicVolume', 'effectsVolume'] as const).map((name, i) => `<label><span>${['Master volume', 'Music', 'Sound effects'][i]}</span><input type="range" name="${name}" aria-label="${['Master volume', 'Music', 'Sound effects'][i]}" min="0" max="100" step="5"><output data-output="${name}" aria-hidden="true"></output></label>`).join('')}
        </fieldset><fieldset class="front-settings"><legend>Visuals</legend>
          <label><span>Show trajectory preview</span><input type="checkbox" name="trajectoryPreview"></label>
          <label><span>Screen shake</span><input type="checkbox" name="screenShake"></label></fieldset>
        ${this.backgroundPicker()}
        ${tankPickerMarkup()}
        <p class="front-note">Audio starts only after a click or key press. Reduced-motion preferences always disable camera shake. The short trajectory guide does not show where a shot lands.</p>
        <p class="front-save" role="status">Changes apply immediately; saved when browser storage is available.</p><button type="button" class="front-secondary" data-action="reset-settings">Restore defaults</button>`;
      case 'credits':
        return `<p class="front-lead">Built for friendly rivalries.</p><div class="front-credit-grid">
        <article><h3>Art & identity</h3><p>Golden Valley, Desert Canyon, Moonlit Alpine, graphite Pencil Study and Lunar Earthrise scenery. Original tanks, weapons, particles and interface graphics. Lunar Earth photograph: NASA / Apollo 17 crew, AS17-148-22727. Scenery is an artistic composite, not an Apollo landing-site photograph.</p></article>
        <article><h3>Music & sound</h3><p>Original browser-synthesized soundtrack and weapon voices. No third-party samples or borrowed game audio.</p></article>
        <article><h3>Under the hood</h3><p>TypeScript · Phaser 3 · Vite · Web Audio API. Deterministic 60 Hz simulation. Vitest and Playwright testing.</p></article>
        <article><h3>A genre, reimagined</h3><p>Inspired by classic turn-based artillery games. Arc & Armor uses its own name, artwork, interface and weapon designs. Local development build v0.1.</p></article></div>`;
    }
  }

  private backgroundPicker(): string {
    return `<section class="front-background"><label for="front-background-choice">Battlefield background</label>
      <select id="front-background-choice" name="background" aria-describedby="background-note">${backgroundOptions()}</select>
      <img class="front-background-preview" data-background-preview alt="" width="1920" height="1080">
      <p id="background-note" class="front-note">Pencil and lunar themes also style the live ground. Terrain shape, tank positions, wind and weapon physics stay unchanged.</p></section>`;
  }

  private syncBackground(): void {
    const item = BACKGROUNDS.find((entry) => entry.id === currentBackground())!;
    const welcome = this.root.querySelector<HTMLElement>('.front-hero .front-kicker');
    if (welcome !== null) welcome.textContent = `WELCOME TO ${item.name.toUpperCase()}`;
    const preview = this.dialog.querySelector<HTMLImageElement>('[data-background-preview]');
    if (preview !== null) {
      preview.src = item.url;
      preview.alt = `${item.name}: ${item.description}`;
    }
  }

  private showWeapon(id: string): void {
    const weapon = WEAPON_CATALOG.find((w) => w.id === id);
    if (weapon === undefined) return;
    this.dialog
      .querySelectorAll<HTMLButtonElement>('[data-weapon]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.weapon === id)),
      );
    const detail = this.dialog.querySelector<HTMLElement>('.front-weapon-detail')!;
    detail.innerHTML = '<h3></h3><p></p><div class="front-weapon-stats"></div>';
    detail.querySelector('h3')!.textContent = weapon.name;
    detail.querySelector('p')!.textContent =
      `${weapon.description}${weapon.pack ? ` [${weapon.pack.toUpperCase()} PACK]` : ''}${weapon.adaptationNote ? ` ${weapon.adaptationNote}` : ''}`;
    detail.querySelector('.front-weapon-stats')!.textContent =
      `AMMO ${weapon.ammo === 'unlimited' ? '∞' : weapon.ammo}  /  DAMAGE CAP ${weapon.damageCapPerShot}  /  BLAST ${weapon.explosion.blastRadius}  /  CRATER ${weapon.explosion.terrainRadius}`;
  }

  private fillSettings(): void {
    for (const [name, value] of Object.entries(this.settings)) {
      const input = this.dialog.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input === null) continue;
      if (typeof value === 'boolean') input.checked = value;
      else {
        input.value = String(Math.round(value * 100));
        this.dialog.querySelector<HTMLOutputElement>(`[data-output="${name}"]`)!.value =
          `${input.value}%`;
      }
    }
  }

  private readSettings(): void {
    if (this.activeScreen !== 'settings') return;
    const input = (name: keyof LocalSettings): HTMLInputElement =>
      this.dialog.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    this.changeSettings({
      muted: input('muted').checked,
      screenShake: input('screenShake').checked,
      trajectoryPreview: input('trajectoryPreview').checked,
      masterVolume: Number(input('masterVolume').value) / 100,
      musicVolume: Number(input('musicVolume').value) / 100,
      effectsVolume: Number(input('effectsVolume').value) / 100,
    });
    this.fillSettings();
  }

  private changeSettings(settings: LocalSettings): void {
    this.settings = settings;
    this.actions.settingsChanged(settings);
    this.syncSound();
  }

  private syncSound(): void {
    this.sound.setAttribute('aria-label', this.settings.muted ? 'Unmute audio' : 'Mute audio');
    this.sound.setAttribute('aria-pressed', String(this.settings.muted));
    this.sound.querySelector('span')!.textContent = this.settings.muted ? 'Sound off' : 'Sound on';
  }

  private wrapFocus(event: KeyboardEvent, scope: HTMLElement): void {
    const elements = Array.from(
      scope.querySelectorAll<HTMLElement>('button, input, select, a[href]'),
    ).filter((element) => element.getClientRects().length > 0 && !element.hasAttribute('disabled'));
    const first = elements[0],
      last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
