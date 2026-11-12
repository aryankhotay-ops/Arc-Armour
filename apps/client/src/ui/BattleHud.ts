import type { WeaponId } from '@artillery/content';
import { tankModel } from '@artillery/content';
import {
  MAX_ELEVATION_DEGREES,
  MAX_POWER,
  MIN_ELEVATION_DEGREES,
  MIN_POWER,
  TURN_MOVEMENT_ALLOWANCE,
  type GameEngine,
} from '@artillery/simulation';
import { ArsenalPanel } from './ArsenalPanel';
import { battleStatus } from './BattleHudState';
import { PLAYER_THEME } from './theme';
import { PointerHolds } from '../input/PointerHolds';
import './battle-hud.css';

export type HudControl =
  'move-left' | 'move-right' | 'angle-down' | 'angle-up' | 'power-down' | 'power-up';
interface HudActions {
  readonly onSelect: (id: WeaponId) => void;
  readonly onHold: (control: HudControl, held: boolean) => void;
  readonly onStep: (control: HudControl) => void;
  readonly onAim: (angle: number, power: number) => void;
  readonly onFire: () => void;
  readonly onNewDraft: () => void;
  readonly onLayout: () => void;
}

// The shell reserves real grid rows for the HUD: no panel, controls or pause button can
// cover a projectile, tank or terrain. The unchanged 1280×720 arena occupies the middle row.
// All rendered fields are observations of the authoritative engine; commands go back through
// its legal-input methods. Native controls provide keyboard, touch and screen-reader access.
export class BattleHud {
  private readonly shell = document.createElement('div');
  public readonly menuHost: HTMLElement;
  public readonly arsenal: ArsenalPanel;
  private readonly arena: HTMLElement;
  private readonly observer: ResizeObserver;
  private readonly listeners = new AbortController();
  private readonly players: HTMLElement[] = [];
  private readonly status: HTMLElement;
  private readonly turn: HTMLElement;
  private readonly message: HTMLElement;
  private readonly wind: HTMLElement;
  private readonly angle: HTMLInputElement;
  private readonly power: HTMLInputElement;
  private readonly angleValue: HTMLOutputElement;
  private readonly powerValue: HTMLOutputElement;
  private readonly movement: HTMLElement;
  private readonly movementBar: HTMLMeterElement;
  private readonly launch: HTMLElement;
  private readonly fire: HTMLButtonElement;
  private readonly newDraft: HTMLButtonElement;
  private readonly controlButtons = new Map<HudControl, HTMLButtonElement>();
  private readonly holds: PointerHolds<HudControl>;
  private lastKey = '';

  public constructor(
    engine: GameEngine,
    private readonly actions: HudActions,
  ) {
    this.arena = document.getElementById('app')!;
    this.holds = new PointerHolds(actions.onHold, actions.onStep);
    this.shell.className = 'battle-shell';
    this.shell.innerHTML = `
      <header class="battle-hud-top" aria-label="Match HUD">
        <section class="hud-player" data-player="player1" aria-label="Player 1 status"></section>
        <div class="hud-match"><div class="hud-match-heading"><span>ARC &amp; ARMOR</span><strong data-turn></strong></div>
          <strong class="hud-status" role="status" aria-label="Match status" aria-live="polite" aria-atomic="true"></strong>
          <span class="hud-wind"></span><span class="hud-message"></span>
          <span class="hud-orientation-hint">↻ Landscape gives a wider battlefield</span></div>
        <section class="hud-player" data-player="player2" aria-label="Player 2 status"></section>
        <div class="hud-menu-host"></div>
      </header>
      <footer class="battle-hud-dock" aria-label="Battle controls">
        <section class="hud-aim" aria-label="Aiming controls">
          <div class="hud-section-heading"><strong>AIM &amp; FIRE</strong><span>W / S · Q / E · SPACE</span></div>
          <div class="hud-aim-grid">
            <div class="hud-aim-control"><label for="hud-angle">ANGLE <output id="hud-angle-value" for="hud-angle" aria-live="off"></output></label>
              <div class="hud-slider-row"><button type="button" data-control="angle-down" aria-label="Decrease firing angle">−</button>
                <input id="hud-angle" aria-label="Firing angle" type="range" step="1">
                <button type="button" data-control="angle-up" aria-label="Increase firing angle">+</button></div></div>
            <div class="hud-aim-control"><label for="hud-power">POWER <output id="hud-power-value" for="hud-power" aria-live="off"></output></label>
              <div class="hud-slider-row"><button type="button" data-control="power-down" aria-label="Decrease power">−</button>
                <input id="hud-power" aria-label="Power level" type="range" step="1">
                <button type="button" data-control="power-up" aria-label="Increase power">+</button></div></div>
          </div>
          <div class="hud-launch"></div>
          <div class="hud-fire-row"><div class="hud-movement"><div><strong>MOVE <span data-movement></span></strong>
              <meter aria-label="Movement remaining"></meter></div>
            <button type="button" data-control="move-left" aria-label="Move tank left">◀</button>
            <button type="button" data-control="move-right" aria-label="Move tank right">▶</button></div>
            <button type="button" class="hud-fire">FIRE</button>
            <button type="button" class="hud-new-draft" hidden>NEW DRAFT</button></div>
        </section>
      </footer>`;
    this.menuHost = this.shell.querySelector('.hud-menu-host')!;
    this.status = this.shell.querySelector('.hud-status')!;
    this.turn = this.shell.querySelector('[data-turn]')!;
    this.message = this.shell.querySelector('.hud-message')!;
    this.wind = this.shell.querySelector('.hud-wind')!;
    this.angle = this.shell.querySelector('#hud-angle')!;
    this.power = this.shell.querySelector('#hud-power')!;
    this.angleValue = this.shell.querySelector('#hud-angle-value')!;
    this.powerValue = this.shell.querySelector('#hud-power-value')!;
    this.movement = this.shell.querySelector('[data-movement]')!;
    this.movementBar = this.shell.querySelector('meter')!;
    this.launch = this.shell.querySelector('.hud-launch')!;
    this.fire = this.shell.querySelector('.hud-fire')!;
    this.newDraft = this.shell.querySelector('.hud-new-draft')!;
    this.angle.min = String(MIN_ELEVATION_DEGREES);
    this.power.min = String(MIN_POWER * 100);
    this.power.max = String(MAX_POWER * 100);
    this.movementBar.min = 0;
    this.movementBar.max = TURN_MOVEMENT_ALLOWANCE;
    for (const id of ['player1', 'player2'] as const) {
      const panel = this.shell.querySelector<HTMLElement>(`[data-player="${id}"]`)!;
      const theme = PLAYER_THEME[id];
      panel.style.setProperty('--player-color', theme.text);
      panel.innerHTML = `<div class="hud-player-heading"><strong>${theme.short} / ${tankModel(engine.tank(id).modelId).name.toUpperCase()}</strong><span data-activity></span></div>
        <div class="hud-health-row"><progress max="100" aria-label="${theme.short} health"></progress><strong data-health></strong></div>
        <div class="hud-player-weapon"></div>`;
      this.players.push(panel);
    }
    this.arsenal = new ArsenalPanel(engine.weapons, actions.onSelect);
    this.shell.querySelector('footer')!.prepend(this.arsenal.element);
    document.body.append(this.shell);
    this.shell.insertBefore(this.arena, this.shell.querySelector('footer'));

    const options = { signal: this.listeners.signal };
    this.shell.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (event.detail > 0 && target instanceof Element && target.closest('.hud-weapon-slot')) {
          this.arena.querySelector('canvas')?.focus({ preventScroll: true });
        }
      },
      options,
    );
    // Native Space/Enter must activate a focused HUD control, not also fire a tank.
    // Escape/P/H still reach BattleMenu's capture listener; unfocused canvas shortcuts remain.
    for (const type of ['keydown', 'keyup']) {
      this.shell.addEventListener(
        type,
        (event) => {
          if (event.target !== this.arena && event.target !== this.arena.querySelector('canvas'))
            event.stopPropagation();
        },
        options,
      );
    }
    this.shell.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
      const control = button.dataset.control as HudControl;
      this.controlButtons.set(control, button);
      const release = (event: PointerEvent): void => this.holds.stop(event.pointerId);
      button.addEventListener(
        'pointerdown',
        (event) => {
          if (event.button !== 0 || button.disabled) return;
          // No page drag/selection or synthetic click step after a held press. Pointer
          // capture + per-finger ownership allow movement and aiming at the same time.
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.holds.start(event.pointerId, control);
        },
        options,
      );
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      button.addEventListener('pointerleave', release, options);
      button.addEventListener(
        'pointermove',
        (event) => {
          const rect = button.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            release(event);
        },
        options,
      );
      // Keyboard/screen-reader activation has no pointerdown. Touch steps at pointerdown.
      button.addEventListener(
        'click',
        (event) => {
          if (event.detail === 0 && !button.disabled) actions.onStep(control);
        },
        options,
      );
    });
    const releaseAll = (): void => this.holds.clear();
    window.addEventListener('pointerup', (event) => this.holds.stop(event.pointerId), options);
    window.addEventListener('pointercancel', (event) => this.holds.stop(event.pointerId), options);
    window.addEventListener('blur', releaseAll, options);
    window.addEventListener('resize', releaseAll, options);
    window.screen.orientation?.addEventListener('change', releaseAll, options);
    document.addEventListener('visibilitychange', releaseAll, options);
    // Dynamic mobile browser bars and split-screen resize without re-creating the match.
    window.visualViewport?.addEventListener('resize', actions.onLayout, options);
    this.shell.addEventListener(
      'contextmenu',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('canvas, [data-control], input[type="range"], .hud-fire')
        )
          event.preventDefault();
      },
      options,
    );
    this.angle.addEventListener(
      'input',
      () => actions.onAim(Number(this.angle.value), engine.intendedAim.power),
      options,
    );
    this.power.addEventListener(
      'input',
      () => actions.onAim(engine.intendedAim.angleDegrees, Number(this.power.value) / 100),
      options,
    );
    this.fire.addEventListener('click', actions.onFire, options);
    this.newDraft.addEventListener('click', actions.onNewDraft, options);
    // Native HUD gestures unlock audio too, without letting pointer input aim behind a panel.
    this.observer = new ResizeObserver(actions.onLayout);
    this.observer.observe(this.arena);
    this.update(engine, false);
    actions.onLayout();
  }

  public update(engine: GameEngine, paused: boolean): void {
    const s = engine.state,
      tank = engine.activeTank,
      weapon = engine.selectedWeapon;
    const key = JSON.stringify([
      paused,
      s.phase,
      s.turnNumber,
      s.activePlayerId,
      s.wind,
      s.message,
      s.winnerId,
      s.tanks.map((t) => [t.health, t.movementRemaining, t.aim, t.selectedWeaponId, t.inventory]),
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const interactive = engine.acceptsInput && !paused;
    if (!interactive) this.holds.clear();
    this.shell.dataset.phase = paused ? 'paused' : s.phase;
    this.shell.dataset.activePlayer = s.activePlayerId;
    this.shell.style.setProperty('--active-color', PLAYER_THEME[s.activePlayerId].text);
    this.turn.textContent = `TURN ${String(s.turnNumber).padStart(2, '0')}`;
    this.status.textContent = battleStatus(engine, paused);
    this.message.textContent = s.message;
    this.wind.textContent =
      s.wind === 0
        ? 'WIND · CALM'
        : `WIND ${s.wind < 0 ? '◀' : '▶'} ${Math.abs(s.wind)} · ${s.wind < 0 ? 'LEFT' : 'RIGHT'}`;
    s.tanks.forEach((t, i) => {
      const panel = this.players[i]!;
      const active = t.playerId === s.activePlayerId && s.phase !== 'game-over';
      panel.dataset.active = String(active);
      panel.querySelector('[data-activity]')!.textContent =
        s.phase === 'game-over'
          ? s.winnerId === t.playerId
            ? 'WINNER'
            : s.winnerId === undefined
              ? 'DRAW'
              : 'DEFEATED'
          : active
            ? '▶ ACTIVE'
            : 'WAITING';
      const progress = panel.querySelector('progress')!;
      progress.value = t.health;
      progress.setAttribute('aria-valuetext', `${Math.ceil(t.health)} health points`);
      panel.dataset.lowHealth = String(t.health <= 30);
      panel.querySelector('[data-health]')!.textContent = `${Math.ceil(t.health)} HP`;
      panel.querySelector('.hud-player-weapon')!.textContent = engine.weapon(
        t.selectedWeaponId,
      ).name;
    });
    this.arsenal.update(tank, interactive);
    const maxAngle = weapon.launch.maxElevationDegrees ?? MAX_ELEVATION_DEGREES;
    this.angle.max = String(maxAngle);
    this.angle.value = String(Math.round(tank.aim.angleDegrees));
    this.power.value = String(Math.round(tank.aim.power * 100));
    this.angle.setAttribute(
      'aria-valuetext',
      `${Math.round(tank.aim.angleDegrees)} degrees; maximum ${maxAngle}`,
    );
    this.power.setAttribute('aria-valuetext', `${Math.round(tank.aim.power * 100)} percent`);
    this.angleValue.value = `${Math.round(tank.aim.angleDegrees)}°`;
    this.powerValue.value = `${Math.round(tank.aim.power * 100)}%`;
    this.angle.disabled = !interactive;
    this.power.disabled = !interactive;
    this.movement.textContent = `${Math.ceil(tank.movementRemaining)} / ${TURN_MOVEMENT_ALLOWANCE}`;
    this.movementBar.value = tank.movementRemaining;
    this.movementBar.setAttribute(
      'aria-valuetext',
      `${Math.ceil(tank.movementRemaining)} world units remaining`,
    );
    this.launch.textContent = `ELEVATION ${MIN_ELEVATION_DEGREES}–${maxAngle}° · SPEED ${Math.round(weapon.launch.speed * tank.aim.power)} u/s${maxAngle < MAX_ELEVATION_DEGREES ? ' · FLAT FIRE ONLY' : ''}`;
    this.controlButtons.forEach((button, control) => {
      button.disabled =
        !interactive ||
        (control.startsWith('move') && tank.movementRemaining <= 0) ||
        (control === 'angle-down' && tank.aim.angleDegrees <= MIN_ELEVATION_DEGREES) ||
        (control === 'angle-up' && tank.aim.angleDegrees >= maxAngle) ||
        (control === 'power-down' && tank.aim.power <= MIN_POWER) ||
        (control === 'power-up' && tank.aim.power >= MAX_POWER);
      if (button.disabled) this.holds.cancelControl(control);
    });
    const complete = s.phase === 'game-over';
    this.fire.textContent = paused
      ? 'PAUSED'
      : complete
        ? 'REMATCH'
        : interactive
          ? 'FIRE'
          : s.phase === 'projectile'
            ? 'IN FLIGHT'
            : 'SETTLING';
    this.fire.setAttribute('aria-label', complete ? 'Rematch' : 'Fire selected weapon');
    this.fire.disabled = paused || (!interactive && !complete);
    this.newDraft.hidden = !complete;
    this.newDraft.disabled = paused;
  }

  public destroy(): void {
    this.holds.clear();
    this.listeners.abort();
    this.observer.disconnect();
    // Restore Phaser's parent before another scene mounts its menu/draft. No duplicated HUD.
    document.body.append(this.arena);
    this.shell.remove();
    this.actions.onLayout();
  }
}
