import type { LocalSettings } from '../settings/LocalSettings';
import { DEFAULT_ROUND_NAME } from '../game/GameArsenal';
import {
  backgroundOptions,
  chooseBackground,
  type BackgroundId,
} from '../rendering/BackgroundCatalog';

interface BattleMenuActions {
  readonly onPauseChange: (paused: boolean) => void;
  readonly onSettingsChange: (settings: LocalSettings) => void;
  readonly onRestart: () => void;
  readonly onNewDraft: () => void;
  readonly onMainMenu: () => void;
  readonly onBackgroundChange: (id: BackgroundId) => void;
}

// A native modal keeps keyboard focus out of the canvas and gives touch/keyboard players
// the same controls. Opening it freezes the existing match, including an in-flight shot.
// Destructive actions require a second click; the draft and combat rules stay untouched.
export class BattleMenu {
  private readonly trigger = document.createElement('button');
  private readonly dialog = document.createElement('dialog');
  private readonly preview: HTMLInputElement;
  private readonly shake: HTMLInputElement;
  private readonly mute: HTMLInputElement;
  private readonly master: HTMLInputElement;
  private readonly musicSlider: HTMLInputElement;
  private readonly effectsSlider: HTMLInputElement;
  private readonly help: HTMLDetailsElement;
  private readonly confirmation: HTMLElement;
  private pendingAction: 'restart' | 'draft' | 'home' | undefined;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: LocalSettings,
    private readonly actions: BattleMenuActions,
    triggerHost: HTMLElement,
  ) {
    this.trigger.className = 'battle-menu-trigger';
    this.trigger.type = 'button';
    this.trigger.textContent = 'PAUSE';
    this.trigger.title = 'Pause / help (Escape or P)';
    this.trigger.setAttribute('aria-label', 'Pause game');
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.addEventListener('click', () => this.open());
    this.trigger.addEventListener('keydown', (event) => event.stopPropagation());
    this.trigger.addEventListener('keyup', (event) => event.stopPropagation());

    this.dialog.className = 'battle-menu';
    this.dialog.setAttribute('aria-label', 'Paused game');
    this.dialog.innerHTML = `
      <header><p class="menu-eyebrow">ARC &amp; ARMOR / LOCAL VERSUS</p>
        <h1>Match paused</h1>
        <p>Your shot, terrain and turn are frozen. Resume when both players are ready.</p>
      </header>
      <button type="button" data-action="resume" class="menu-primary" autofocus>Resume game</button>
      <fieldset><legend>Audio</legend>
        <label><input type="checkbox" name="muted"> Mute all audio</label>
        <label class="menu-slider">Master volume
          <input type="range" name="masterVolume" min="0" max="100" step="5"></label>
        <label class="menu-slider">Music
          <input type="range" name="musicVolume" min="0" max="100" step="5"></label>
        <label class="menu-slider">Sound effects
          <input type="range" name="effectsVolume" min="0" max="100" step="5"></label>
        <p class="menu-note">All audio is original and synthesized in the browser. It starts
          after your first click or key press, as browsers require.</p>
      </fieldset>
      <fieldset><legend>Visual settings</legend>
        <label><input type="checkbox" name="trajectoryPreview"> Show trajectory preview</label>
        <label><input type="checkbox" name="screenShake"> Screen shake</label>
        <label class="menu-background">Battlefield background<select name="background" aria-label="Battlefield background">${backgroundOptions()}</select></label>
        <p class="menu-note">Pencil and lunar themes include matching ground materials. Switching does not reset craters, health, ammo or a shot.</p>
        <p class="menu-note">Saved on this device. Reduced-motion preferences always disable shake.</p>
      </fieldset>
      <details><summary>How to play</summary>
        <p>Two players share this device. Draft five exclusive weapons each, then take turns.
          ${DEFAULT_ROUND_NAME} has unlimited ammo. Reduce your opponent's health to zero to win.</p>
        <dl>
          <dt>Move</dt><dd>A / D, or hold the MOVE buttons. Fuel resets each turn.</dd>
          <dt>Aim / power</dt><dd>W / S and Q / E, drag in the battlefield, use the sliders, or tap/hold the + / − buttons.</dd>
          <dt>Weapons</dt><dd>Swipe the arsenal sideways and tap a weapon, use number keys, or Z / X to cycle. Scroll the weapon panel vertically for information.</dd>
          <dt>Fire</dt><dd>Space or FIRE. Wait for all warheads and explosions to resolve.</dd>
          <dt>Pause / help</dt><dd>Escape / P pauses. H opens these instructions.</dd>
        </dl>
        <p>Watch the wind. Craters change the ground and falling tanks take damage.
          A rematch keeps your loadouts; a new draft replaces them. Rotate your phone for a wider
          battlefield and a right-hand control rail. Rotation preserves the match; no fullscreen
          or orientation lock is required. You can hold movement and aiming with different fingers.</p>
      </details>
      <div class="menu-actions">
        <button type="button" data-action="home">Main menu</button>
        <button type="button" data-action="restart">Restart match</button>
        <button type="button" data-action="draft">New weapon draft</button>
      </div>
      <section class="menu-confirmation" aria-live="polite" hidden>
        <p data-confirm-message></p>
        <div class="menu-actions">
          <button type="button" data-action="confirm" class="menu-danger">Confirm</button>
          <button type="button" data-action="cancel">Keep playing</button>
        </div>
      </section>
      <p class="menu-note">Escape / P resumes. No online connection is required.</p>
    `;
    this.preview = this.dialog.querySelector<HTMLInputElement>('[name="trajectoryPreview"]')!;
    this.shake = this.dialog.querySelector<HTMLInputElement>('[name="screenShake"]')!;
    this.mute = this.dialog.querySelector<HTMLInputElement>('[name="muted"]')!;
    this.master = this.dialog.querySelector<HTMLInputElement>('[name="masterVolume"]')!;
    this.musicSlider = this.dialog.querySelector<HTMLInputElement>('[name="musicVolume"]')!;
    this.effectsSlider = this.dialog.querySelector<HTMLInputElement>('[name="effectsVolume"]')!;
    this.help = this.dialog.querySelector<HTMLDetailsElement>('details')!;
    this.confirmation = this.dialog.querySelector<HTMLElement>('.menu-confirmation')!;
    this.preview.checked = settings.trajectoryPreview;
    this.shake.checked = settings.screenShake;
    this.mute.checked = settings.muted;
    this.master.value = String(Math.round(settings.masterVolume * 100));
    this.musicSlider.value = String(Math.round(settings.musicVolume * 100));
    this.effectsSlider.value = String(Math.round(settings.effectsVolume * 100));
    const publishSettings = (): void => {
      this.actions.onSettingsChange({
        trajectoryPreview: this.preview.checked,
        screenShake: this.shake.checked,
        muted: this.mute.checked,
        masterVolume: Number(this.master.value) / 100,
        musicVolume: Number(this.musicSlider.value) / 100,
        effectsVolume: Number(this.effectsSlider.value) / 100,
      });
    };
    this.dialog.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.name === 'background')
        this.actions.onBackgroundChange(chooseBackground(target.value));
      else publishSettings();
    });
    // Sliders also publish while dragging so loudness feedback is immediate.
    this.dialog.addEventListener('input', publishSettings);
    this.dialog.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest<HTMLButtonElement>('button')?.dataset.action;
      if (action === 'resume') this.close();
      else if (action === 'restart' || action === 'draft' || action === 'home')
        this.requestAction(action);
      else if (action === 'cancel') this.cancelAction();
      else if (action === 'confirm') {
        const pending = this.pendingAction;
        this.close();
        if (pending === 'restart') this.actions.onRestart();
        else if (pending === 'draft') this.actions.onNewDraft();
        else if (pending === 'home') this.actions.onMainMenu();
      }
    });
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (this.pendingAction !== undefined) this.cancelAction();
      else this.close();
    });
    this.dialog.addEventListener('keydown', (event) => {
      // Do not leak a menu key to Phaser or let held-key auto-repeat reopen the menu.
      event.stopPropagation();
      if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (event.repeat) return;
        if (this.pendingAction !== undefined) this.cancelAction();
        else this.close();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          this.dialog.querySelectorAll<HTMLElement>('button, input, select, summary'),
        ).filter(
          (element) => element.getClientRects().length > 0 && !element.hasAttribute('disabled'),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    // Space activates native buttons and checkboxes on keyup. Phaser's global capture
    // must not cancel that default action, even though its scene plugin is disabled.
    this.dialog.addEventListener('keyup', (event) => event.stopPropagation());
    triggerHost.append(this.trigger);
    document.body.append(this.dialog);
    window.addEventListener('keydown', this.handleShortcut, true);
  }

  public open(showHelp = false): void {
    if (this.dialog.open) return;
    this.pendingAction = undefined;
    this.confirmation.hidden = true;
    this.help.open = showHelp;
    this.actions.onPauseChange(true);
    this.dialog.showModal();
    if (showHelp) this.help.querySelector('summary')?.focus();
  }

  public close(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    this.actions.onPauseChange(false);
    this.canvas.focus({ preventScroll: true });
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleShortcut, true);
    // Removal during scene shutdown must not resume a replacement match.
    this.dialog.remove();
    this.trigger.remove();
  }

  private requestAction(action: 'restart' | 'draft' | 'home'): void {
    this.pendingAction = action;
    this.confirmation.hidden = false;
    this.dialog.querySelector('[data-confirm-message]')!.textContent =
      action === 'restart'
        ? 'Restart this match? Health, ammo and terrain will reset. Your loadouts stay the same.'
        : action === 'draft'
          ? 'Leave this match for a new weapon draft? Current match progress will be lost.'
          : 'Return to the main menu? Current match progress will be lost.';
    this.dialog.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.focus();
  }

  private cancelAction(): void {
    this.pendingAction = undefined;
    this.confirmation.hidden = true;
    this.dialog.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
  }

  private readonly handleShortcut = (event: KeyboardEvent): void => {
    if (this.dialog.open) return;
    const key = event.key.toLowerCase();
    if (key !== 'escape' && key !== 'p' && key !== 'h') return;
    // Handle native modal shortcuts synchronously, before Phaser's deferred key queue.
    // Otherwise the opening Escape can also perform the dialog's default cancel action.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) this.open(key === 'h');
  };
}
