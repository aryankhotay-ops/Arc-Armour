import type Phaser from 'phaser';
import { tankArmorPaths, tankDetails } from './TankDetailArtwork';
import {
  TANK_MODELS,
  tankModel,
  type TankModelId,
  type TankModelDefinition,
} from '@artillery/content';

// Reference-inspired ORIGINAL vectors. Source sheet isn't cut into copyrighted photographs
// with backgrounds/baked-in barrels. Each cached hull has NO gun; each gun is a separate
// horizontal sprite whose origin is the shared physics pivot and tip is barrelLength.
export const HULL_VIEW = { x: -82, y: -108, width: 176, height: 116 } as const;
export const GUN_MARGIN = 8;
const points = (pts: TankModelDefinition['hull']): string => pts.map((p) => p.join(',')).join(' ');
const teamColor = (player: number): string => (player === 0 ? '#ffd166' : '#6cbcff');
const svg = (view: string, width: number, height: number, inside: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${view}">${inside}</svg>`;

export function hullArtwork(id: TankModelId, player: number): string {
  const m = tankModel(id),
    g = m.geometry;
  const half = g.trackHalfWidth + 6;
  const shaped = tankArmorPaths(id);
  const armor = (path: string | undefined, fallback: TankModelDefinition['hull']): string =>
    path === undefined
      ? `<polygon points="${points(fallback)}" fill="url(#armor-${id}-${player})" stroke="#18201e" stroke-width="1.8" stroke-linejoin="round"/>`
      : `<path d="${path}" fill="url(#armor-${id}-${player})" stroke="#18201e" stroke-width="1.8" stroke-linejoin="round"/>`;
  const track =
    m.id === 'mark-v'
      ? `<path d="M-71,-28 -47,-75 31,-74 72,-36 62,0 -46,0Z" fill="#272a29" stroke="#131b1c" stroke-width="2"/><path d="M-65,-29 -44,-68 28,-67 65,-35 58,-7 -43,-7Z" fill="${m.shade}" stroke="#898c7e" stroke-width="2"/>`
      : `<rect x="${-half}" y="${-m.trackHeight}" width="${half * 2}" height="${m.trackHeight}" rx="${m.trackHeight * 0.46}" fill="#1d2423" stroke="#121b1c" stroke-width="2"/><rect x="${-half + 3}" y="${-m.trackHeight + 3}" width="${half * 2 - 6}" height="${m.trackHeight - 6}" rx="${m.trackHeight * 0.38}" fill="#373e36" stroke="#8b8d75" stroke-width="1.2"/>`;
  let wheels = '';
  for (let i = 0; i < m.wheels; i++) {
    const x = -g.trackHalfWidth + 6 + i * ((g.trackHalfWidth * 2 - 12) / (m.wheels - 1));
    const r = Math.min(m.trackHeight * 0.36, ((g.trackHalfWidth * 2) / m.wheels) * 0.47);
    wheels += `<circle cx="${x}" cy="${-m.trackHeight * 0.49}" r="${r + 1}" fill="#17221c"/><circle cx="${x}" cy="${-m.trackHeight * 0.49}" r="${r - 0.8}" fill="${m.shade}" stroke="${m.light}" stroke-width=".9"/><circle cx="${x}" cy="${-m.trackHeight * 0.49}" r="${r * 0.3}" fill="${m.light}"/>`;
  }
  let cleats = '';
  for (let x = -half + 8; x < half - 5; x += 6)
    cleats += `<path d="M${x},-1v-3M${x},${-m.trackHeight + 1}v3" stroke="#a5a28d" stroke-width=".8"/>`;
  // Tiger/Panther overlapping wheels and end sprockets are a major recognition cue.
  if (id === 'tiger-i' || id === 'panther')
    for (let i = 0; i < 4; i++) {
      const x = -34 + i * 22;
      wheels += `<circle cx="${x}" cy="-14" r="9.6" fill="${m.color}" stroke="${m.light}" stroke-width=".8"/><circle cx="${x}" cy="-14" r="6.8" fill="none" stroke="${m.shade}" stroke-width=".9"/><circle cx="${x}" cy="-14" r="2.2" fill="${m.shade}"/>`;
    }
  for (const x of [-half + 8, half - 8])
    wheels += `<circle cx="${x}" cy="${-m.trackHeight * 0.5}" r="${m.trackHeight * 0.3}" fill="${m.shade}" stroke="${m.light}" stroke-width=".8"/><circle cx="${x}" cy="${-m.trackHeight * 0.5}" r="${m.trackHeight * 0.17}" fill="none" stroke="#222d29" stroke-width="1.2"/>`;
  let plates = '';
  for (let x = -g.trackHalfWidth + 10; x < g.trackHalfWidth - 4; x += 13)
    plates += `<path d="M${x},-42v16" stroke="${m.shade}" stroke-width="1"/><circle cx="${x + 3}" cy="-34" r="1" fill="${m.light}"/>`;
  let extras = '';
  if (id === 'renault-ft17')
    extras += `<path d="M-31,-29 -66,-14 -58,-7 -31,-15" fill="none" stroke="${m.shade}" stroke-width="3"/><path d="M-22,-54 -20,-35 24,-26" fill="none" stroke="${m.shade}" stroke-width="1.5"/>`;
  if (['abrams', 'merkava-mk4', 'leopard-2a7'].includes(id))
    extras += `<path d="M-48,-38H44V-21H-48Z" fill="${m.color}" stroke="${m.shade}" stroke-width="1.4"/>${plates}`;
  if (id === 'panther')
    extras += `<path d="M-43,-42 20,-51M-41,-33 11,-40" stroke="${m.shade}" stroke-width="4" opacity=".6"/>`;
  if (id === 'mark-v')
    extras += `<path d="M-8,-50H23V-27H-8Z" fill="${m.color}" stroke="${m.shade}" stroke-width="1.4"/><circle cx="-36" cy="-46" r="4" fill="#293128"/>`;
  const top = Math.min(...m.turret.map((p) => p[1]));
  let bolts = '';
  if (['mark-v', 'renault-ft17', 'tiger-i'].includes(id))
    for (let x = -25; x < 26; x += 8)
      bolts += `<circle cx="${x}" cy="-42" r=".9" fill="${m.light}"/>`;
  return `<defs><linearGradient id="armor-${id}-${player}" x2="0" y2="1"><stop stop-color="${m.light}"/><stop offset=".26" stop-color="${m.color}"/><stop offset="1" stop-color="${m.shade}"/></linearGradient></defs>${track}${wheels}${cleats}
  ${armor(shaped.hull, m.hull)}
  <path d="M${-half + 3},${-m.trackHeight + 1}H${half - 3}" stroke="${m.light}" stroke-width="2.5"/>
  ${armor(shaped.turret, m.turret)}
  <rect x="-7" y="${top - 3}" width="16" height="4" rx="1.5" fill="${m.color}" stroke="#23302b" stroke-width="1"/>
  <path d="M-24,${top + 9} -31,${top - 15}" stroke="#586860" stroke-width=".8"/>
  ${extras}${bolts}${tankDetails(id, player)}
  <rect x="${g.pivotX - 8}" y="${g.pivotY - 8}" width="15" height="16" rx="4" fill="${m.shade}" stroke="#1d2824" stroke-width="1.3"/>
  <circle cx="${g.pivotX}" cy="${g.pivotY}" r="4.5" fill="${m.color}" stroke="${m.light}" stroke-width="1"/>
  <path d="M-24,-29H-7" stroke="${teamColor(player)}" stroke-width="3"/>
  <circle cx="7" cy="-33" r="4.8" fill="${teamColor(player)}" stroke="#1d2531" stroke-width="1.2"/>
  <path d="${player === 0 ? 'M7,-36v6M4,-33h6' : 'M7,-37 11,-33 7,-29 3,-33Z'}" stroke="#222938" stroke-width="1.1" fill="none"/>`;
}

export function gunArtwork(id: TankModelId): string {
  const m = tankModel(id),
    length = m.geometry.barrelLength;
  const width = m.gun === 'short' ? 4.8 : m.gun === 'sleeved' ? 4.6 : 3.5;
  const brake =
    m.gun === 'brake'
      ? `<path d="M${length - 12},-4.5H${length}V4.5H${length - 12}Z" fill="${m.shade}" stroke="#1b2424" stroke-width="1.1"/><path d="M${length - 7},-3.3v6.6M${length - 3},-3.3v6.6" stroke="${m.light}" stroke-width="1"/>`
      : '';
  const sleeve =
    m.gun === 'sleeved'
      ? `<rect x="${length * 0.36}" y="-3.8" width="${length * 0.14}" height="7.6" rx="1" fill="${m.color}" stroke="#303a31" stroke-width="1"/>`
      : '';
  return `<path d="M0,${-width}H${length}V${width}H0Z" fill="${m.color}" stroke="#1b2424" stroke-width="1.2"/><path d="M2,${-width + 1.2}H${length - 1}" stroke="${m.light}" stroke-width="1.2"/>${sleeve}${brake}<path d="M${length},${-width + 1}V${width - 1}" stroke="#101b23" stroke-width="1.5"/>`;
}
export const hullSvg = (id: TankModelId, player = 0): string =>
  svg('-82 -108 176 116', 704, 464, hullArtwork(id, player));
export const gunSvg = (id: TankModelId): string => {
  const length = tankModel(id).geometry.barrelLength;
  return svg(
    `-${GUN_MARGIN} -12 ${length + GUN_MARGIN * 2} 24`,
    (length + GUN_MARGIN * 2) * 4,
    96,
    gunArtwork(id),
  );
};
export function portraitSvg(id: TankModelId, player = 0): string {
  const g = tankModel(id).geometry;
  // SAME viewport/scale for every option; don't enlarge the small Renault to Mark V size.
  return svg(
    '-88 -126 224 138',
    672,
    414,
    `${hullArtwork(id, player)}<g transform="translate(${g.pivotX} ${g.pivotY}) rotate(-18)">${gunArtwork(id)}</g>`,
  );
}
export const svgUrl = (markup: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
export const tankHullKey = (id: TankModelId, player: number): string => `arc-hull-${id}-${player}`;
export const tankGunKey = (id: TankModelId): string => `arc-gun-${id}`;
export function preloadTankSprites(scene: Phaser.Scene, ids: readonly TankModelId[]): void {
  for (const id of new Set(ids)) {
    for (let player = 0; player < 2; player++) {
      const key = tankHullKey(id, player);
      if (!scene.textures.exists(key)) scene.load.image(key, svgUrl(hullSvg(id, player)));
    }
    if (!scene.textures.exists(tankGunKey(id)))
      scene.load.image(tankGunKey(id), svgUrl(gunSvg(id)));
  }
}
export const referenceTankModels = TANK_MODELS.filter(
  (m) => m.id !== 'marigold' && m.id !== 'cobalt',
);
