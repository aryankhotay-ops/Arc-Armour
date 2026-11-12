import { WORLD_COLOR } from '../ui/theme';
import type { BackgroundId } from './BackgroundCatalog';

// User requested pencil scenery and a Moon surface with Earth, while retaining the first
// three backgrounds. Materials are presentation-only: never change gravity or height data.
export interface TerrainTheme {
  readonly style: 'arcade' | 'graphite' | 'regolith';
  readonly topsoil: number;
  readonly soilBands: readonly number[];
  readonly grass: number;
  readonly grassDark: number;
  readonly grassLight: number;
  readonly rockDark: number;
  readonly rockLight: number;
  readonly edge: number;
  readonly exposedRim: number;
  readonly scorch: number;
}

const ARCADE: TerrainTheme = {
  ...WORLD_COLOR,
  style: 'arcade',
  rockDark: 0x5d3740,
  rockLight: 0xd29161,
  edge: 0x38542b,
};
const GRAPHITE: TerrainTheme = {
  style: 'graphite',
  topsoil: 0xe7e4da,
  soilBands: [],
  grass: 0xd4d1c7,
  grassDark: 0xb4b1a9,
  grassLight: 0xefede4,
  rockDark: 0x94918b,
  rockLight: 0xb6b3a9,
  edge: 0x66645f,
  exposedRim: 0x8f8b82,
  scorch: 0x56534e,
};
const REGOLITH: TerrainTheme = {
  style: 'regolith',
  topsoil: 0x686a6e,
  soilBands: [],
  grass: 0x8b8c8e,
  grassDark: 0x53565b,
  grassLight: 0xc4c4c0,
  rockDark: 0x3f4248,
  rockLight: 0x919298,
  edge: 0xa3a5aa,
  exposedRim: 0xd0d0ce,
  scorch: 0x303138,
};

export function terrainTheme(id: BackgroundId): TerrainTheme {
  if (id === 'pencil-study') return GRAPHITE;
  if (id === 'lunar-earthrise') return REGOLITH;
  return ARCADE;
}
