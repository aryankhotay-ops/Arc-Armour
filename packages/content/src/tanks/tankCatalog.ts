// Tank-selection continuation: 12 side-profile designs from the user's reference sheet,
// plus the existing Marigold/Cobalt. These are ORIGINAL arcade adaptations, not photo crops
// or engineering-scale replicas. Preserve distinctive proportions; hull and gun are separate.
// Strv 103 and Mark V have adapted elevating gun joints for the game's aiming controls.
// Health, ammo and weapon damage are shared. Footprint/pivot/muzzle data must match rendering.
export type TankModelId =
  | 'marigold'
  | 'cobalt'
  | 'tiger-i'
  | 'panther'
  | 't34-85'
  | 'is-2'
  | 'amx-13'
  | 'strv-103'
  | 'churchill'
  | 'abrams'
  | 'merkava-mk4'
  | 'leopard-2a7'
  | 'renault-ft17'
  | 'mark-v';
export interface TankGeometryDefinition {
  readonly trackHalfWidth: number;
  readonly hullHalfLength: number;
  readonly hullRadius: number;
  readonly hullCenterY: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly barrelLength: number;
}
export interface TankModelDefinition {
  readonly id: TankModelId;
  readonly name: string;
  readonly description: string;
  readonly geometry: TankGeometryDefinition;
  readonly color: string;
  readonly light: string;
  readonly shade: string;
  readonly wheels: number;
  readonly trackHeight: number;
  readonly hull: readonly (readonly [number, number])[];
  readonly turret: readonly (readonly [number, number])[];
  readonly gun: 'brake' | 'plain' | 'sleeved' | 'short';
}
const LEGACY: TankGeometryDefinition = {
  trackHalfWidth: 46,
  hullHalfLength: 34,
  hullRadius: 26,
  hullCenterY: -24,
  pivotX: 3,
  pivotY: -56,
  barrelLength: 72,
};
const model = (
  id: TankModelId,
  name: string,
  description: string,
  geometry: TankGeometryDefinition,
  color: string,
  light: string,
  shade: string,
  wheels: number,
  trackHeight: number,
  hull: TankModelDefinition['hull'],
  turret: TankModelDefinition['turret'],
  gun: TankModelDefinition['gun'],
): TankModelDefinition =>
  Object.freeze({
    id,
    name,
    description,
    geometry: Object.freeze(geometry),
    color,
    light,
    shade,
    wheels,
    trackHeight,
    hull,
    turret,
    gun,
  });
export const TANK_MODELS: readonly TankModelDefinition[] = Object.freeze([
  model(
    'marigold',
    'Marigold',
    'Original rounded arcade chassis',
    LEGACY,
    '#f6b335',
    '#ffe08a',
    '#9b641f',
    5,
    28,
    [
      [-44, -46],
      [32, -46],
      [47, -25],
      [-47, -25],
    ],
    [
      [-20, -68],
      [18, -68],
      [24, -49],
      [-23, -49],
    ],
    'brake',
  ),
  model(
    'cobalt',
    'Cobalt',
    'Original angular arcade chassis',
    LEGACY,
    '#3f8cff',
    '#9fd2ff',
    '#285fca',
    4,
    28,
    [
      [-49, -25],
      [-38, -48],
      [33, -48],
      [49, -27],
    ],
    [
      [-21, -69],
      [18, -69],
      [24, -49],
      [-23, -49],
    ],
    'brake',
  ),
  model(
    'tiger-i',
    'Tiger I',
    'Boxy armor, overlapping wheels, cylindrical turret',
    {
      trackHalfWidth: 48,
      hullHalfLength: 35,
      hullRadius: 27,
      hullCenterY: -27,
      pivotX: 14,
      pivotY: -58,
      barrelLength: 70,
    },
    '#aa9869',
    '#d5c59b',
    '#6d684d',
    7,
    29,
    [
      [-52, -47],
      [42, -47],
      [52, -35],
      [53, -24],
      [-53, -24],
    ],
    [
      [-26, -68],
      [15, -70],
      [23, -63],
      [23, -46],
      [-27, -46],
    ],
    'brake',
  ),
  model(
    'panther',
    'Panther',
    'Sloped glacis and angular turret',
    {
      trackHalfWidth: 48,
      hullHalfLength: 33,
      hullRadius: 29,
      hullCenterY: -29,
      pivotX: 12,
      pivotY: -62,
      barrelLength: 81,
    },
    '#9e9a6c',
    '#c6c395',
    '#5d624c',
    7,
    30,
    [
      [-51, -26],
      [-47, -41],
      [28, -53],
      [53, -29],
    ],
    [
      [-26, -68],
      [-17, -79],
      [14, -75],
      [23, -58],
      [17, -50],
      [-23, -50],
    ],
    'brake',
  ),
  model(
    't34-85',
    'T-34/85',
    'Low sloping hull and rounded tall turret',
    {
      trackHalfWidth: 46,
      hullHalfLength: 33,
      hullRadius: 26,
      hullCenterY: -26,
      pivotX: 13,
      pivotY: -62,
      barrelLength: 78,
    },
    '#54654b',
    '#91a077',
    '#364737',
    5,
    28,
    [
      [-51, -27],
      [-42, -43],
      [28, -49],
      [51, -26],
    ],
    [
      [-24, -57],
      [-20, -73],
      [-9, -80],
      [15, -78],
      [26, -66],
      [22, -49],
      [-23, -49],
    ],
    'plain',
  ),
  model(
    'is-2',
    'IS-2',
    'Broad cast turret over heavy sloped armor',
    {
      trackHalfWidth: 49,
      hullHalfLength: 34,
      hullRadius: 29,
      hullCenterY: -29,
      pivotX: 12,
      pivotY: -65,
      barrelLength: 84,
    },
    '#6c7058',
    '#a5a387',
    '#454b3f',
    6,
    31,
    [
      [-53, -28],
      [-39, -48],
      [25, -51],
      [54, -29],
    ],
    [
      [-29, -58],
      [-25, -74],
      [-10, -84],
      [14, -80],
      [28, -68],
      [21, -49],
      [-26, -49],
    ],
    'brake',
  ),
  model(
    'amx-13',
    'AMX-13',
    'Compact hull and distinctive oscillating turret',
    {
      trackHalfWidth: 39,
      hullHalfLength: 26,
      hullRadius: 26,
      hullCenterY: -26,
      pivotX: 7,
      pivotY: -60,
      barrelLength: 72,
    },
    '#687660',
    '#a9b49b',
    '#414d40',
    5,
    26,
    [
      [-43, -26],
      [-37, -44],
      [18, -45],
      [44, -25],
    ],
    [
      [-21, -46],
      [-20, -64],
      [-13, -77],
      [17, -78],
      [22, -67],
      [10, -53],
      [18, -46],
    ],
    'brake',
  ),
  model(
    'strv-103',
    'Strv 103',
    'Very low wedge hull; arcade elevating gun mount',
    {
      trackHalfWidth: 47,
      hullHalfLength: 40,
      hullRadius: 20,
      hullCenterY: -20,
      pivotX: 30,
      pivotY: -34,
      barrelLength: 84,
    },
    '#596c61',
    '#9baaa0',
    '#394b42',
    4,
    22,
    [
      [-54, -23],
      [-50, -34],
      [-28, -43],
      [4, -44],
      [53, -25],
    ],
    [
      [-15, -38],
      [-10, -50],
      [1, -50],
      [7, -40],
    ],
    'sleeved',
  ),
  model(
    'churchill',
    'Churchill',
    'Long tall tracks and compact central turret',
    {
      trackHalfWidth: 58,
      hullHalfLength: 40,
      hullRadius: 31,
      hullCenterY: -31,
      pivotX: 8,
      pivotY: -67,
      barrelLength: 64,
    },
    '#596451',
    '#96a58b',
    '#384535',
    9,
    40,
    [
      [-63, -33],
      [-55, -56],
      [43, -56],
      [64, -32],
    ],
    [
      [-25, -56],
      [-24, -80],
      [14, -82],
      [25, -70],
      [22, -53],
    ],
    'plain',
  ),
  model(
    'abrams',
    'Abrams',
    'Long low hull, wide angular turret and bustle',
    {
      trackHalfWidth: 53,
      hullHalfLength: 40,
      hullRadius: 25,
      hullCenterY: -25,
      pivotX: 18,
      pivotY: -55,
      barrelLength: 84,
    },
    '#b29f75',
    '#e1d2ac',
    '#827653',
    7,
    26,
    [
      [-60, -26],
      [-51, -45],
      [25, -46],
      [61, -28],
    ],
    [
      [-43, -47],
      [-36, -66],
      [6, -68],
      [27, -58],
      [23, -43],
    ],
    'sleeved',
  ),
  model(
    'merkava-mk4',
    'Merkava Mk.4',
    'Bulky wedge turret with sloping front deck',
    {
      trackHalfWidth: 54,
      hullHalfLength: 39,
      hullRadius: 27,
      hullCenterY: -27,
      pivotX: 17,
      pivotY: -59,
      barrelLength: 79,
    },
    '#8e8c70',
    '#c7c4a5',
    '#62634d',
    6,
    29,
    [
      [-60, -30],
      [-45, -49],
      [30, -46],
      [60, -28],
    ],
    [
      [-32, -45],
      [-36, -61],
      [-14, -76],
      [20, -64],
      [29, -49],
    ],
    'sleeved',
  ),
  model(
    'leopard-2a7',
    'Leopard 2A7',
    'Broad angular turret and armored side skirts',
    {
      trackHalfWidth: 53,
      hullHalfLength: 39,
      hullRadius: 26,
      hullCenterY: -26,
      pivotX: 22,
      pivotY: -58,
      barrelLength: 85,
    },
    '#747a68',
    '#b2b6a1',
    '#4c5547',
    7,
    28,
    [
      [-59, -25],
      [-54, -44],
      [37, -47],
      [61, -26],
    ],
    [
      [-37, -45],
      [-36, -67],
      [4, -68],
      [30, -58],
      [28, -44],
    ],
    'sleeved',
  ),
  model(
    'renault-ft17',
    'Renault FT-17',
    'Small tall riveted hull with rear tail skid',
    {
      trackHalfWidth: 31,
      hullHalfLength: 20,
      hullRadius: 22,
      hullCenterY: -25,
      pivotX: 5,
      pivotY: -70,
      barrelLength: 42,
    },
    '#7e8f80',
    '#bccabc',
    '#536354',
    6,
    28,
    [
      [-36, -27],
      [-30, -56],
      [-18, -65],
      [16, -55],
      [34, -26],
    ],
    [
      [-13, -62],
      [-12, -84],
      [-5, -92],
      [11, -91],
      [18, -79],
      [16, -60],
    ],
    'short',
  ),
  model(
    'mark-v',
    'Mark V',
    'Long rhomboid tracks and side sponson; arcade gun joint',
    {
      trackHalfWidth: 62,
      hullHalfLength: 47,
      hullRadius: 27,
      hullCenterY: -35,
      pivotX: 24,
      pivotY: -49,
      barrelLength: 46,
    },
    '#877d69',
    '#bfb29a',
    '#574f44',
    10,
    56,
    [
      [-70, -28],
      [-49, -72],
      [30, -71],
      [69, -37],
      [61, -8],
      [-45, -8],
    ],
    [
      [-13, -47],
      [-10, -64],
      [11, -64],
      [22, -48],
      [19, -29],
      [-14, -29],
    ],
    'short',
  ),
]);
export const tankModelId = (value: unknown, fallback: TankModelId = 'marigold'): TankModelId =>
  TANK_MODELS.find((m) => m.id === value)?.id ?? fallback;
export const tankModel = (value: unknown): TankModelDefinition =>
  TANK_MODELS.find((m) => m.id === value) ?? TANK_MODELS[0]!;
