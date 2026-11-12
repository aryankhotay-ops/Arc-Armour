import type Phaser from 'phaser';

import type { PlayerId } from '@artillery/simulation';

// Arc & Armor visual identity: "golden-hour arcade". Every colour, font and panel shape used by
// the draft and battle scenes comes from here so the style stays consistent. Scenic plates
// are cached WebP assets; the Earth photograph in Lunar Earthrise is credited to NASA.

export const FONT = Object.freeze({
  display: '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, system-ui, sans-serif',
  body: '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
});

export const COLOR = Object.freeze({
  /** Outline ink used on every panel, tank, projectile and terrain edge. */
  ink: 0x17132e,
  panel: 0x231e4a,
  panelDeep: 0x17132f,
  panelRim: 0x4d4590,
  panelSheen: 0x8a80e0,
  text: 0xfff6e6,
  textDim: 0xbab2e2,
  textFaint: 0x8279b5,
  good: 0x7ee36b,
  warn: 0xffcc4d,
  bad: 0xff5d62,
  fire: 0xff5247,
  wind: 0x8fe9ff,
  gold: 0xffd166,
  control: 0x4a3f96,
});

/** Sky, landscape and terrain palette (shared by the backdrop, terrain and debris). */
export const WORLD_COLOR = Object.freeze({
  skyStops: [
    [0, '#1d1a4e'],
    [0.26, '#3b2e7a'],
    [0.5, '#874a9c'],
    [0.68, '#de688a'],
    [0.82, '#ff996b'],
    [1, '#ffd38c'],
  ] as const,
  sunCore: '#fff6cc',
  sunEdge: '#ffb15c',
  farMountain: '#9a80c8',
  snow: '#f3e2ff',
  midMountain: '#6b56a7',
  farHill: '#3f6e90',
  farHillTree: '#2f5878',
  nearHill: '#2f7a6a',
  nearHillTree: '#235f57',
  grass: 0x86d445,
  grassLight: 0xc8f47a,
  grassDark: 0x4a9636,
  topsoil: 0x7d4a2f,
  soilBands: [0x8f5433, 0xc2783f, 0xa8623a, 0x7b4530, 0x5b3638, 0x40283a] as const,
  rock: 0x8c6f73,
  exposedRim: 0xf3be86,
  scorch: 0x1e1014,
});

export type EmblemKind = 'sun' | 'diamond';

export interface PlayerTheme {
  readonly id: PlayerId;
  readonly name: string;
  readonly short: string;
  /** Cosmetic chassis name. Both tanks have identical gameplay stats. */
  readonly tankName: string;
  readonly tankStyle: string;
  readonly primary: number;
  readonly light: number;
  readonly shade: number;
  readonly deep: number;
  /** Trim/detail colour (stripes, emblem field). */
  readonly trim: number;
  /** Small emissive details (lights, lens, flag). */
  readonly glow: number;
  readonly text: string;
  /** Shape cue so the players stay distinguishable without relying on colour. */
  readonly emblem: EmblemKind;
}

// Gold vs. azure stays distinct under the common colour-vision deficiencies, and each player
// also has a distinct silhouette (rounded vs. angular hull) and emblem shape (sun vs. diamond).
export const PLAYER_THEME: Readonly<Record<PlayerId, PlayerTheme>> = Object.freeze({
  player1: Object.freeze({
    id: 'player1',
    name: 'PLAYER 1',
    short: 'P1',
    tankName: 'MARIGOLD',
    tankStyle: 'Rounded heavy chassis',
    primary: 0xf6b335,
    light: 0xffe08a,
    shade: 0xc47d1e,
    deep: 0x7f4712,
    trim: 0x2b2457,
    glow: 0xfff1a8,
    text: '#ffd36b',
    emblem: 'sun',
  }),
  player2: Object.freeze({
    id: 'player2',
    name: 'PLAYER 2',
    short: 'P2',
    tankName: 'COBALT',
    tankStyle: 'Angular strike chassis',
    primary: 0x3f8cff,
    light: 0x9fd2ff,
    shade: 0x285fca,
    deep: 0x173581,
    trim: 0xeef7ff,
    glow: 0x74f4ff,
    text: '#8fc9ff',
    emblem: 'diamond',
  }),
});

export const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export const rgba = (color: number, alpha: number): string =>
  `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;

export const mixColor = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  const channel = (shift: number): number =>
    Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

export const lighten = (color: number, t: number): number => mixColor(color, 0xffffff, t);
export const darken = (color: number, t: number): number => mixColor(color, 0x000000, t);

/** Health colour ramp: green → amber → red. */
export const healthColor = (health: number): number =>
  health > 55 ? COLOR.good : health > 28 ? COLOR.warn : COLOR.bad;

export interface TextOptions {
  readonly font?: keyof typeof FONT;
  readonly stroke?: number;
  readonly strokeThickness?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly wrap?: number;
  readonly lineSpacing?: number;
  readonly bold?: boolean;
  readonly shadow?: boolean;
}

/** Text style factory so every label in the game shares the same typography rules. */
export const textStyle = (
  size: number,
  color: number | string,
  options: TextOptions = {},
): Phaser.Types.GameObjects.Text.TextStyle => {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    color: typeof color === 'number' ? css(color) : color,
    fontFamily: FONT[options.font ?? 'body'],
    fontSize: `${size}px`,
    fontStyle: options.bold === false ? 'normal' : 'bold',
    align: options.align ?? 'left',
    lineSpacing: options.lineSpacing ?? 2,
  };
  if (options.stroke !== undefined) {
    style.stroke = css(options.stroke);
    style.strokeThickness = options.strokeThickness ?? Math.max(2, Math.round(size / 4));
  }
  if (options.wrap !== undefined) style.wordWrap = { width: options.wrap };
  if (options.shadow === true) {
    style.shadow = { offsetX: 0, offsetY: 3, color: 'rgba(10, 6, 30, 0.55)', blur: 0, fill: true };
  }
  return style;
};

export interface PanelOptions {
  readonly radius?: number;
  readonly fill?: number;
  readonly fillAlpha?: number;
  readonly rim?: number;
  readonly rimAlpha?: number;
  readonly rimWidth?: number;
  /** Optional outer glow (e.g. the active player's colour). */
  readonly glow?: number;
  readonly glowAlpha?: number;
  readonly shadow?: boolean;
}

/** Chunky arcade panel: drop shadow, ink outline, body, top sheen, coloured rim. */
export const drawPanel = (
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): void => {
  const radius = options.radius ?? 14;
  if (options.glow !== undefined) {
    g.fillStyle(options.glow, (options.glowAlpha ?? 0.35) * 0.45);
    g.fillRoundedRect(x - 7, y - 7, width + 14, height + 14, radius + 7);
    g.fillStyle(options.glow, options.glowAlpha ?? 0.35);
    g.fillRoundedRect(x - 4, y - 4, width + 8, height + 8, radius + 4);
  }
  if (options.shadow !== false) {
    g.fillStyle(0x07041a, 0.35);
    g.fillRoundedRect(x + 2, y + 5, width, height, radius);
  }
  g.fillStyle(COLOR.ink, 1);
  g.fillRoundedRect(x - 2, y - 2, width + 4, height + 4, radius + 2);
  g.fillStyle(options.fill ?? COLOR.panel, options.fillAlpha ?? 0.96);
  g.fillRoundedRect(x, y, width, height, radius);
  const sheenRadius = Math.max(2, radius - 3);
  g.fillStyle(0xffffff, 0.055);
  g.fillRoundedRect(x + 3, y + 3, width - 6, Math.max(6, height * 0.42), {
    tl: sheenRadius,
    tr: sheenRadius,
    bl: 3,
    br: 3,
  });
  g.lineStyle(options.rimWidth ?? 2, options.rim ?? COLOR.panelRim, options.rimAlpha ?? 0.9);
  g.strokeRoundedRect(x + 1, y + 1, width - 2, height - 2, Math.max(2, radius - 1));
};

/** Player emblem glyph centred on (x, y): a sun disc for P1, a diamond for P2. */
export const drawEmblem = (
  g: Phaser.GameObjects.Graphics,
  theme: PlayerTheme,
  x: number,
  y: number,
  radius: number,
): void => {
  g.fillStyle(COLOR.ink, 1);
  g.fillCircle(x, y, radius + 2);
  g.fillStyle(theme.primary, 1);
  g.fillCircle(x, y, radius);
  g.fillStyle(theme.light, 0.55);
  g.fillCircle(x - radius * 0.22, y - radius * 0.25, radius * 0.6);
  g.fillStyle(theme.primary, 1);
  g.fillCircle(x, y, radius * 0.78);
  const field = theme.emblem === 'sun' ? theme.trim : theme.deep;
  if (theme.emblem === 'sun') {
    g.fillStyle(field, 1);
    g.fillCircle(x, y, radius * 0.56);
    g.fillStyle(theme.light, 1);
    g.fillCircle(x, y, radius * 0.24);
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray / 8) * Math.PI * 2;
      const inner = radius * 0.32;
      const outer = radius * 0.5;
      const half = 0.2;
      g.fillTriangle(
        x + Math.cos(angle - half) * inner,
        y + Math.sin(angle - half) * inner,
        x + Math.cos(angle + half) * inner,
        y + Math.sin(angle + half) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
      );
    }
  } else {
    const d = radius * 0.62;
    g.fillStyle(field, 1);
    g.fillPoints(
      [
        { x, y: y - d },
        { x: x + d * 0.78, y },
        { x, y: y + d },
        { x: x - d * 0.78, y },
      ],
      true,
    );
    const e = d * 0.5;
    g.fillStyle(theme.trim, 1);
    g.fillPoints(
      [
        { x, y: y - e },
        { x: x + e * 0.78, y },
        { x, y: y + e },
        { x: x - e * 0.78, y },
      ],
      true,
    );
  }
  g.lineStyle(2, COLOR.ink, 1);
  g.strokeCircle(x, y, radius);
};
