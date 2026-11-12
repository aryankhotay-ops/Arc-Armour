import { TANK_MODELS, tankModel } from '@artillery/content';
import { currentTanks, chooseTank } from '../settings/TankSelection';
import { hullArtwork, gunArtwork, portraitSvg, svgUrl } from '../rendering/TankSprites';
import './tank-picker.css';

// Native radio cards: keyboard, touch and mouse choose independently, including same-model
// matches. Shared-scale original artwork, not stretched photos. Preview gun rotates alone.
export function tankPickerMarkup(): string {
  const picks = currentTanks();
  return `<section class="tank-picker" aria-label="Tank selection">
    <h3>Choose your tanks</h3><p class="tank-picker-note">14 chassis · independent player picks · same health, fuel and arsenal rules. Footprints and gun joints follow each design. Game adaptations, not scale replicas.</p>
    <div class="tank-preview-pair">${picks.map((id, player) => `<article data-tank-preview="${player}"><strong>${player === 0 ? 'P1 / GOLD' : 'P2 / BLUE'}</strong><div data-tank-art></div><b data-tank-name>${tankModel(id).name}</b></article>`).join('')}</div>
    <label class="tank-preview-aim">Try the rotating gun <input name="tank-preview-angle" type="range" min="5" max="85" value="35" step="1" aria-label="Tank preview gun angle"><output data-preview-angle>35°</output></label>
    <div class="tank-player-tabs" role="group" aria-label="Choose player to customize"><button type="button" data-tank-tab="0" aria-pressed="true">Choose Player 1 tank</button><button type="button" data-tank-tab="1" aria-pressed="false">Choose Player 2 tank</button></div>
    ${picks.map((selected, player) => `<fieldset class="tank-roster" data-tank-roster="${player}"${player === 1 ? ' hidden' : ''}><legend>Player ${player + 1} tank</legend>${TANK_MODELS.map((m) => `<label class="tank-option"><input type="radio" name="tank-player${player + 1}" value="${m.id}" data-tank-choice="${player}"${selected === m.id ? ' checked' : ''} aria-label="Player ${player + 1}: ${m.name}"><img src="${svgUrl(portraitSvg(m.id, player))}" alt="" width="672" height="414" loading="lazy"><b>${m.name}</b></label>`).join('')}</fieldset>`).join('')}
    <p class="tank-picker-note">Gun and hull are separate layers. Aim with W/S, drag in the battlefield, or the ANGLE slider. Short/long barrels use their own real launch point. Strv 103 and Mark V use arcade gun articulation.</p>
  </section>`;
}
function updatePreviews(root: Element): void {
  const range = root.querySelector<HTMLInputElement>('[name="tank-preview-angle"]');
  const angle = Number(range?.value ?? 35);
  const picks = currentTanks();
  for (let player = 0; player < 2; player++) {
    const host = root.querySelector<HTMLElement>(`[data-tank-preview="${player}"]`);
    if (host === null) continue;
    const model = tankModel(picks[player]),
      g = model.geometry;
    host.querySelector('[data-tank-art]')!.innerHTML =
      `<svg viewBox="-88 -126 224 138" aria-label="${model.name} rotating gun preview" role="img"><g data-preview-hull>${hullArtwork(model.id, player)}</g><g data-preview-gun transform="translate(${g.pivotX} ${g.pivotY}) rotate(${-angle})">${gunArtwork(model.id)}</g></svg>`;
    host.querySelector('[data-tank-name]')!.textContent = model.name;
  }
  const output = root.querySelector('output[data-preview-angle]');
  if (output !== null) output.textContent = `${angle}°`;
}
export function bindTankPicker(root: Element): void {
  const picker = root.querySelector<HTMLElement>('.tank-picker');
  if (picker === null) return;
  updatePreviews(picker);
  picker.addEventListener('click', (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-tank-tab]')
        : null;
    if (target === null) return;
    const player = Number(target.dataset.tankTab);
    for (const tab of picker.querySelectorAll<HTMLElement>('[data-tank-tab]'))
      tab.setAttribute('aria-pressed', String(Number(tab.dataset.tankTab) === player));
    for (const roster of picker.querySelectorAll<HTMLElement>('[data-tank-roster]'))
      roster.hidden = Number(roster.dataset.tankRoster) !== player;
  });
  picker.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.tankChoice !== undefined) {
      chooseTank(Number(input.dataset.tankChoice), input.value);
      updatePreviews(picker);
    }
  });
  picker.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'tank-preview-angle') {
      const angle = Number(event.target.value);
      for (const gun of picker.querySelectorAll<SVGGElement>('[data-preview-gun]')) {
        const transform = gun
          .getAttribute('transform')!
          .replace(/rotate\([^)]*\)/, `rotate(${-angle})`);
        gun.setAttribute('transform', transform);
      }
      picker.querySelector('[data-preview-angle]')!.textContent = `${angle}°`;
    }
  });
}
