import { tankModel, type TankModelId } from '@artillery/content';

// Refinement against the user's sheet: detailed original side profiles, not photo texture
// overlays. Clip camouflage/weathering to armor; don't change the tested track/pivot/muzzle
// interfaces. This stays offline/load-time vector work, never a per-frame effect.
export function tankArmorPaths(id: TankModelId): { hull?: string; turret?: string } {
  switch (id) {
    case 'tiger-i':
      return {
        hull: 'M-53,-25V-39L-48,-47H39L52,-42V-25Z',
        turret: 'M-28,-48V-62Q-27,-72 -11,-72H9Q23,-72 24,-61V-48Z',
      };
    case 'panther':
      return {
        hull: 'M-53,-27 -47,-43 -32,-45 29,-53 51,-37 54,-27Z',
        turret: 'M-28,-51 -28,-68 -19,-80 10,-78 21,-66 23,-52Z',
      };
    case 't34-85':
      return {
        hull: 'M-52,-27 -42,-45 27,-48 51,-28Z',
        turret: 'M-25,-50Q-32,-64 -18,-76Q-6,-83 11,-80Q24,-78 26,-66L22,-50Z',
      };
    case 'is-2':
      return {
        hull: 'M-54,-28 -39,-48 22,-51 41,-41 54,-28Z',
        turret: 'M-28,-51Q-36,-63 -21,-78Q-10,-86 8,-83Q29,-80 29,-65L21,-50Z',
      };
    case 'amx-13':
      return {
        hull: 'M-44,-26 -38,-40 -24,-46 20,-45 44,-26Z',
        turret: 'M-22,-47 -19,-60 -9,-64 -17,-68 -12,-77 13,-80 22,-72 19,-63 8,-55 14,-47Z',
      };
    case 'strv-103':
      return {
        hull: 'M-54,-23 -51,-35 -32,-44 -10,-44 6,-41 54,-25Z',
        turret: 'M-18,-39 -16,-46 -8,-51 2,-50 8,-40Z',
      };
    case 'churchill':
      return {
        hull: 'M-63,-33 -59,-49 -49,-57 40,-57 64,-34Z',
        turret: 'M-27,-54V-75Q-21,-84 -7,-84H10L25,-73V-54Z',
      };
    case 'abrams':
      return {
        hull: 'M-61,-26 -54,-43 -27,-46 27,-46 61,-28Z',
        turret: 'M-44,-44 -45,-57 -36,-66 0,-68 16,-64 29,-56 24,-44Z',
      };
    case 'merkava-mk4':
      return {
        hull: 'M-60,-30 -47,-49 -15,-47 31,-47 60,-28Z',
        turret: 'M-36,-47 -34,-63 -16,-76 -3,-73 20,-65 28,-52 21,-47Z',
      };
    case 'leopard-2a7':
      return {
        hull: 'M-59,-25 -55,-43 -30,-47 34,-47 61,-26Z',
        turret: 'M-39,-45 -38,-66 -17,-70 4,-68 30,-58 28,-44Z',
      };
    case 'renault-ft17':
      return {
        hull: 'M-36,-27 -31,-43 -23,-57 -17,-64 7,-61 21,-52 34,-27Z',
        turret: 'M-13,-62 -13,-84 -5,-92 10,-92 18,-81 17,-62Z',
      };
    case 'mark-v':
      return {
        hull: 'M-70,-28 -49,-72 30,-71 69,-37 61,-8 -45,-8Z',
        turret: 'M-14,-29 -14,-47 -8,-54 15,-54 23,-45 20,-29Z',
      };
    default:
      return {};
  }
}

export function tankDetails(id: TankModelId, player: number): string {
  const m = tankModel(id),
    key = `armor-detail-${id}-${player}`;
  const paths = tankArmorPaths(id);
  if (paths.hull === undefined) return '';
  const steel = m.shade;
  let camo = '';
  if (['panther', 'tiger-i', 'leopard-2a7'].includes(id)) {
    camo = `<path d="M-57,-41Q-32,-65 -21,-46T11,-54T48,-49L66,-30Q40,-19 30,-35T0,-30T-32,-26Z" fill="${id === 'leopard-2a7' ? '#434f3e' : '#617054'}" opacity=".5"/><path d="M-52,-54Q-28,-46 -23,-67T13,-68T41,-39M-38,-29Q-14,-41 0,-27T36,-31" fill="none" stroke="${id === 'leopard-2a7' ? '#273b36' : '#805a3d'}" stroke-width="5" opacity=".45"/>`;
  }
  const d: Record<string, string> = {
    'tiger-i': `<path d="M-48,-44H42M-48,-31H41M-28,-60H20" stroke="${m.light}" stroke-width="1.4"/><path d="M-48,-44V-31M35,-44V-31" stroke="${steel}" stroke-width="1.4"/><rect x="-24" y="-60" width="8" height="6" rx="1" fill="${steel}"/><path d="M-18,-65V-50M-13,-65V-50" stroke="${m.light}" opacity=".55"/><path d="M-40,-51H-28V-47H-40Z" fill="${steel}"/><path d="M-38,-42v8M-33,-42v8M-28,-42v8" stroke="${steel}" stroke-width="2"/>`,
    panther: `<path d="M-47,-41 28,-52M-38,-38 18,-47M29,-52 42,-37" stroke="${m.light}" stroke-width="1.2"/><path d="M-27,-66 -11,-69 13,-66M-23,-57H18" fill="none" stroke="${steel}" stroke-width="1.5"/><rect x="-32" y="-41" width="16" height="5" rx="1" fill="${steel}"/><path d="M-41,-34H-25M-45,-30H-32" stroke="${m.light}" stroke-width="1"/>`,
    't34-85': `<path d="M-19,-73Q-8,-80 9,-76M-22,-54Q0,-57 21,-54M-40,-42 22,-46" fill="none" stroke="${m.light}" stroke-width="1.3"/><path d="M-40,-36 20,-39M-16,-63 15,-63" stroke="${steel}" stroke-width="1"/><rect x="-49" y="-49" width="20" height="7" rx="3.5" fill="${steel}" stroke="${m.light}" stroke-width=".7"/><path d="M-43,-48v5M-36,-48v5" stroke="${m.color}" stroke-width="2"/>`,
    'is-2': `<path d="M-21,-72Q-12,-82 9,-77M-23,-53Q-4,-59 17,-53" fill="none" stroke="${m.light}" stroke-width="1.6"/><path d="M-33,-42H30M-27,-36H34" stroke="${steel}" stroke-width="1.1"/><rect x="-48" y="-50" width="20" height="7" rx="3" fill="${steel}" stroke="${m.light}" stroke-width=".9"/>`,
    'amx-13': `<path d="M-16,-67 8,-59 18,-66M-12,-74H14M-22,-48H13" fill="none" stroke="${m.light}" stroke-width="1.2"/><path d="M-14,-61 5,-54M-32,-38H18" stroke="${steel}" stroke-width="1.3"/><circle cx="-5" cy="-59" r="3.2" fill="${steel}" stroke="${m.light}" stroke-width=".9"/><rect x="-33" y="-44" width="10" height="5" rx="1" fill="${steel}"/>`,
    'strv-103': `<path d="M-46,-34H10L46,-26M-34,-41H-4" fill="none" stroke="${m.light}" stroke-width="1.2"/><path d="M-48,-29H29M-5,-42V-30M2,-40V-29" stroke="${steel}" stroke-width="1"/><rect x="-40" y="-34" width="15" height="6" fill="${steel}"/><path d="M-13,-50H-3V-45H-13" fill="${steel}"/><path d="M-50,-24 -52,-18 -31,-17" stroke="${m.light}" fill="none"/>`,
    churchill: `<path d="M-59,-47H49M-48,-53H41M-21,-75H17" stroke="${m.light}" stroke-width="1.3"/><path d="M-56,-41H50M-26,-61H21" stroke="${steel}" stroke-width="1.5"/><rect x="-39" y="-51" width="13" height="9" rx="1.2" fill="${m.shade}" stroke="${m.light}" stroke-width=".7"/><path d="M-58,-42V-32M-50,-42V-32M43,-42V-32M51,-42V-32" stroke="${steel}"/>`,
    abrams: `<path d="M-43,-58 -9,-60 14,-60 24,-53M-49,-41H23L47,-32" stroke="${m.light}" stroke-width="1.1" fill="none"/><path d="M-42,-49H19M-29,-64V-48M-15,-66V-48M1,-65V-48" stroke="${steel}" stroke-width="1.2"/><path d="M-40,-68H-17V-59H-40Z" fill="none" stroke="${steel}" stroke-width="1.2"/><rect x="-12" y="-72" width="11" height="5" rx="1" fill="${steel}"/><path d="M-8,-72 -3,-82 18,-82" fill="none" stroke="${steel}" stroke-width="1.4"/><rect x="-52" y="-36" width="13" height="7" fill="${steel}"/>`,
    'merkava-mk4': `<path d="M-30,-60 -13,-71 19,-62M-41,-44 27,-42 48,-32" fill="none" stroke="${m.light}" stroke-width="1.2"/><path d="M-24,-53 -10,-61 9,-53M-26,-50H22M-15,-70V-57" fill="none" stroke="${steel}" stroke-width="1.2"/><path d="M-34,-61 -43,-62 -44,-50 -35,-48" fill="${m.color}" stroke="${steel}"/><path d="M-31,-46l-3,5m8,-5 -3,5m8,-5 -3,5" stroke="${steel}" stroke-width="1.4"/>`,
    'leopard-2a7': `<path d="M-33,-64H6L26,-56M-52,-42H32L50,-30" fill="none" stroke="${m.light}" stroke-width="1.1"/><path d="M-30,-58H24M-28,-68V-46M-8,-68V-46M7,-66V-46" stroke="${steel}" stroke-width="1.2"/><path d="M-35,-58H-25V-50H-35Z" fill="${steel}"/><rect x="-4" y="-74" width="11" height="5" rx="1.2" fill="${steel}"/><path d="M-6,-70V-84M-1,-70V-85" stroke="${steel}" stroke-width=".9"/>`,
    'renault-ft17': `<path d="M-12,-82H15M-10,-88H10M-11,-65H15" stroke="${m.light}" stroke-width="1"/><path d="M-21,-52 -9,-43 22,-32M-19,-61 -21,-43 -29,-29" fill="none" stroke="${steel}" stroke-width="1.4"/><path d="M-2,-80H8V-70H-2Z" fill="${m.color}" stroke="${steel}" stroke-width="1"/><path d="M-35,-28 -65,-11 -52,-9 -31,-20" fill="none" stroke="${steel}" stroke-width="2.1"/>`,
    'mark-v': `<path d="M-44,-65H25L62,-37 54,-14H-42L-61,-29Z" fill="${m.color}" stroke="${m.light}" stroke-width="1.2"/><path d="M-13,-56H15L24,-45V-27H-14Z" fill="${m.shade}" stroke="${m.light}" stroke-width="1"/><path d="M-6,-50H15V-34H-6Z" fill="${m.color}" stroke="${steel}"/><rect x="-39" y="-49" width="13" height="18" rx="1" fill="${m.color}" stroke="${steel}"/><path d="M-45,-61V-19M-28,-63V-20M33,-58V-19M48,-47V-18" stroke="${steel}" stroke-width=".8"/>`,
  };
  let rivets = '';
  if (['renault-ft17', 'mark-v', 'churchill', 'tiger-i'].includes(id))
    for (let x = -44; x <= 36; x += 7)
      rivets += `<circle cx="${x}" cy="-40" r=".8" fill="${m.light}"/><circle cx="${x}" cy="-34" r=".65" fill="${steel}"/>`;
  return `<defs><clipPath id="${key}"><path d="${paths.hull}"/><path d="${paths.turret}"/></clipPath></defs><g clip-path="url(#${key})">${camo}${d[id] ?? ''}${rivets}<path d="M-70,-24H70" stroke="#9b8767" stroke-width="3" opacity=".25"/></g>`;
}
