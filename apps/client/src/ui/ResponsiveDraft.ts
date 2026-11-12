import type { WeaponDefinition, WeaponId } from '@artillery/content';
import type { WeaponDraft } from '@artillery/simulation';
import './responsive-draft.css';

interface DraftActions {
  readonly choose: (id: WeaponId) => void;
  readonly randomPick: () => void;
  readonly randomizeRemaining: () => void;
  readonly dealAllRandom: () => void;
  readonly undo: () => void;
  readonly reset: () => void;
  readonly start: () => void;
  readonly home: () => void;
}

// Small-screen presentation of the SAME draft as the original desktop canvas. No new RNG,
// ownership rules or loadout state. Native CSS-sized cards/actions never shrink below 48px.
export class ResponsiveDraft {
  private readonly element = document.createElement('section');
  private readonly media = window.matchMedia('(max-width: 1000px), (max-height: 600px)');
  private readonly listeners = new AbortController();
  private readonly status: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly cards = new Map<WeaponId, HTMLButtonElement>();
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly rosters: HTMLElement[];

  public constructor(
    weapons: readonly WeaponDefinition[],
    private readonly canvas: HTMLCanvasElement,
    actions: DraftActions,
  ) {
    this.element.className = 'responsive-draft';
    if (weapons.length > 12) this.element.classList.add('large-pool');
    this.element.setAttribute('aria-label', 'Weapon draft');
    this.element.innerHTML = `<header><div><h1>BUILD YOUR LOADOUT</h1>
      <strong role="status" aria-label="Draft status" aria-live="polite"></strong><p data-progress></p></div>
      <button type="button" data-action="home">← Main menu</button></header>
      <div class="responsive-draft-content" tabindex="0" aria-label="Weapons and loadouts">
        <p>Choose five exclusive weapons each. ${weapons.find((w) => w.ammo === 'unlimited')!.name} is unlimited and included for both players. ${weapons.length > 12 ? `This match's random pool offers ${weapons.filter((w) => w.ammo !== 'unlimited').length} draftable weapons.` : ''}</p>
        <details><summary>Player loadouts</summary><div class="responsive-draft-rosters"><p></p><p></p></div></details>
        <div class="responsive-draft-pool" role="group" aria-label="Draftable weapons"></div>
      </div>
      <footer><button type="button" data-action="randomPick">Random pick</button>
        <button type="button" data-action="randomizeRemaining">Randomize rest</button>
        <button type="button" data-action="dealAllRandom">Deal all random</button>
        <button type="button" data-action="undo">Undo pick</button>
        <button type="button" data-action="reset">Reset draft</button>
        <button type="button" data-action="start" class="responsive-draft-start">Start battle</button></footer>`;
    this.status = this.element.querySelector('[role="status"]')!;
    this.progress = this.element.querySelector('[data-progress]')!;
    this.rosters = Array.from(this.element.querySelectorAll('.responsive-draft-rosters p'));
    this.element.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      const action = button.dataset.action as Exclude<keyof DraftActions, 'choose'>;
      this.buttons.set(action, button);
      button.addEventListener('click', actions[action]);
    });
    const pool = this.element.querySelector('.responsive-draft-pool')!;
    for (const weapon of weapons.filter((weapon) => weapon.ammo !== 'unlimited')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.draftWeapon = weapon.id;
      button.innerHTML =
        '<strong></strong><span data-role></span><span data-description></span><span data-owner></span>';
      button.querySelector('strong')!.textContent = weapon.name;
      button.querySelector('[data-role]')!.textContent = weapon.role;
      button.querySelector('[data-description]')!.textContent = weapon.description;
      button.addEventListener('click', () => actions.choose(weapon.id));
      pool.append(button);
      this.cards.set(weapon.id, button);
    }
    const options = { signal: this.listeners.signal };
    this.element.addEventListener(
      'keydown',
      (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          actions.home();
        }
      },
      options,
    );
    this.element.addEventListener('keyup', (event) => event.stopPropagation(), options);
    document.body.append(this.element);
    this.media.addEventListener('change', this.syncCanvasAccess, options);
    this.syncCanvasAccess();
  }

  private readonly syncCanvasAccess = (): void => {
    const native = this.media.matches || this.element.classList.contains('large-pool');
    this.canvas.setAttribute('aria-hidden', String(native));
    this.canvas.tabIndex = native ? -1 : 0;
  };

  public update(draft: WeaponDraft, weapons: readonly WeaponDefinition[], seed: number): void {
    const picker = draft.currentPicker;
    this.status.textContent =
      picker === undefined
        ? 'DRAFT COMPLETE · READY FOR BATTLE'
        : `${picker === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} · CHOOSE A WEAPON`;
    this.progress.textContent = `${draft.picks.length} / ${draft.totalPicks} chosen · Seed ${seed}`;
    this.element.dataset.picker = picker ?? '';
    this.cards.forEach((button, id) => {
      const owner = draft.ownerOf(id);
      button.disabled = owner !== undefined || picker === undefined;
      button.dataset.owner = owner ?? '';
      button.querySelector('[data-owner]')!.textContent =
        owner === undefined
          ? 'TAP TO DRAFT'
          : `${owner === 'player1' ? 'P1' : 'P2'} · ${draft.pickOf(id)?.method === 'random' ? 'RANDOM PICK' : 'DRAFTED'}`;
    });
    ['player1', 'player2'].forEach((id, index) => {
      const picks = draft.picks.filter((pick) => pick.playerId === id);
      const names = picks.map(
        (pick) =>
          `${weapons.find((w) => w.id === pick.weaponId)?.name ?? pick.weaponId}${pick.method === 'random' ? ' (random)' : ''}`,
      );
      this.rosters[index]!.textContent =
        `P${index + 1} · ${picks.length} / ${draft.config.picksPerPlayer}\n${weapons.find((w) => w.ammo === 'unlimited')!.name}\n${names.join('\n') || 'No picks yet'}`;
    });
    this.buttons.get('start')!.disabled = !draft.isComplete;
    this.buttons.get('randomPick')!.disabled = draft.isComplete;
    this.buttons.get('randomizeRemaining')!.disabled = draft.isComplete;
    this.buttons.get('undo')!.disabled = draft.picks.length === 0;
    this.buttons.get('reset')!.disabled = draft.picks.length === 0;
  }

  public destroy(): void {
    this.listeners.abort();
    this.element.remove();
    this.canvas.removeAttribute('aria-hidden');
    this.canvas.tabIndex = 0;
  }
}
