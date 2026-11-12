import type { WeaponDefinition, WeaponId } from '@artillery/content';
import { ammoOf, carries, formatAmmo, hasAmmo, type TankState } from '@artillery/simulation';
import { weaponStatBars, weaponTags } from './weaponStats';

// Native, scrollable loadout dock OUTSIDE the battlefield. Catalog order also defines the
// number-key shortcuts. Ownership, ammo, selection and input locks all come from the engine.
const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−', '='];

export class ArsenalPanel {
  public readonly element = document.createElement('section');
  private readonly owner: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly title: HTMLElement;
  private readonly role: HTMLElement;
  private readonly description: HTMLElement;
  private readonly tags: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly slots: HTMLButtonElement[] = [];
  private renderedKey = '';
  private renderedPlayer = '';
  private renderedWeapon = '';

  public constructor(
    private readonly weapons: readonly WeaponDefinition[],
    onSelect: (weaponId: WeaponId) => void,
  ) {
    this.element.className = 'hud-arsenal';
    this.element.setAttribute('aria-label', 'Weapon selection');
    this.element.tabIndex = 0;
    this.element.setAttribute(
      'aria-description',
      'Swipe horizontally to browse weapons; scroll vertically for weapon information.',
    );
    this.element.innerHTML = `
      <div class="hud-section-heading"><strong data-owner></strong><span>1–9 / 0 / − / = · Z / X cycle</span></div>
      <div class="hud-weapon-strip" role="group" aria-label="Carried weapons"></div>
      <div class="hud-selected-weapon"><div><strong data-weapon-title></strong><span data-weapon-role></span></div>
        <strong data-weapon-ammo></strong></div>
      <details class="hud-weapon-info"><summary>Weapon information</summary>
        <p data-description></p><p class="hud-weapon-tags" data-tags></p>
        <dl data-stats></dl><small>Damage is a per-shot cap, not guaranteed damage. Distances are world units.
          Reach is an ideal full-power, flat-ground estimate; terrain and wind change actual range.</small>
      </details>`;
    this.owner = this.element.querySelector('[data-owner]')!;
    this.strip = this.element.querySelector('.hud-weapon-strip')!;
    this.title = this.element.querySelector('[data-weapon-title]')!;
    this.role = this.element.querySelector('[data-weapon-role]')!;
    this.ammo = this.element.querySelector('[data-weapon-ammo]')!;
    this.description = this.element.querySelector('[data-description]')!;
    this.tags = this.element.querySelector('[data-tags]')!;
    this.stats = this.element.querySelector('[data-stats]')!;
    weapons.forEach(() => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-weapon-slot';
      button.innerHTML =
        '<kbd></kbd><span class="hud-slot-name"></span><span class="hud-slot-ammo"></span>';
      button.addEventListener('click', () => {
        const id = button.dataset.weaponId;
        const weapon = this.weapons.find((entry) => entry.id === id);
        if (weapon !== undefined && !button.disabled) onSelect(weapon.id);
      });
      this.strip.append(button);
      this.slots.push(button);
    });
  }

  public carriedBy(tank: TankState): WeaponDefinition[] {
    return this.weapons.filter((weapon) => carries(tank.inventory, weapon.id));
  }

  public update(tank: TankState, interactive: boolean): void {
    const key = `${tank.playerId}|${tank.selectedWeaponId}|${JSON.stringify(tank.inventory)}|${interactive}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const playerChanged = this.renderedPlayer !== tank.playerId;
    const selectionChanged = this.renderedWeapon !== tank.selectedWeaponId;
    this.renderedPlayer = tank.playerId;
    this.renderedWeapon = tank.selectedWeaponId;
    const carried = this.carriedBy(tank);
    this.owner.textContent = `${tank.playerId === 'player1' ? 'P1' : 'P2'} ARSENAL · ${carried.length} WEAPONS`;
    this.slots.forEach((button, index) => {
      const weapon = carried[index];
      button.hidden = weapon === undefined;
      if (weapon === undefined) {
        button.disabled = true;
        return;
      }
      const available = hasAmmo(tank.inventory, weapon.id);
      const ammo = formatAmmo(ammoOf(tank.inventory, weapon.id));
      button.dataset.weaponId = weapon.id;
      button.dataset.depleted = String(!available);
      button.style.setProperty(
        '--weapon-accent',
        `#${weapon.accent.toString(16).padStart(6, '0')}`,
      );
      button.disabled = !interactive || !available;
      button.setAttribute('aria-pressed', String(weapon.id === tank.selectedWeaponId));
      button.setAttribute(
        'aria-label',
        `${weapon.name}, ${ammo === '∞' ? 'unlimited' : ammo} ammo${available ? '' : ', depleted'}`,
      );
      button.title = `${SLOT_KEYS[index] ?? ''}: ${weapon.name} — ${weapon.role}`;
      button.querySelector('kbd')!.textContent = SLOT_KEYS[index] ?? '';
      button.querySelector('.hud-slot-name')!.textContent = weapon.name;
      button.querySelector('.hud-slot-ammo')!.textContent = available ? `${ammo} AMMO` : 'EMPTY';
    });
    const weapon = carried.find((entry) => entry.id === tank.selectedWeaponId);
    if (weapon === undefined) return;
    this.title.textContent = weapon.name;
    this.title.dataset.selectedWeapon = weapon.id;
    this.role.textContent = weapon.role;
    this.ammo.textContent = `AMMO ${formatAmmo(ammoOf(tank.inventory, weapon.id))}`;
    this.description.textContent = `${weapon.description}${weapon.adaptationNote ? ` ${weapon.adaptationNote}` : ''}`;
    this.tags.textContent = weaponTags(weapon).join(' · ') || 'Single impact shell';
    this.stats.replaceChildren();
    for (const bar of weaponStatBars(weapon)) {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = bar.label;
      dd.textContent = bar.text;
      this.stats.append(dt, dd);
    }
    const dt = document.createElement('dt'),
      dd = document.createElement('dd');
    dt.textContent = 'LAUNCH';
    dd.textContent = `${weapon.launch.projectileCount} projectile${weapon.launch.projectileCount === 1 ? '' : 's'} / round`;
    this.stats.append(dt, dd);
    if (playerChanged) {
      this.element.scrollTop = 0;
      this.strip.scrollLeft = 0;
    }
    // Keyboard selection and turn handoff reveal the selected slot inside its own strip,
    // never scrollIntoView (which can move the page or hide the fixed firing controls).
    if (selectionChanged || playerChanged) {
      const selected = this.slots.find(
        (button) => button.dataset.weaponId === tank.selectedWeaponId,
      );
      if (selected !== undefined) {
        const slot = selected.getBoundingClientRect(),
          strip = this.strip.getBoundingClientRect();
        if (slot.left < strip.left) this.strip.scrollLeft += slot.left - strip.left - 3;
        else if (slot.right > strip.right) this.strip.scrollLeft += slot.right - strip.right + 3;
      }
    }
  }
}
