import type Phaser from 'phaser';

import type { WeaponIconKind } from '@artillery/content';

// Original procedural weapon glyphs, drawn into a Graphics object centred on (0, 0) and sized
// to fit a `size` × `size` square. No external art assets are required.

type Draw = (g: Phaser.GameObjects.Graphics, s: number, color: number) => void;

const shell: Draw = (g, s, color) => {
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.18, -s * 0.12, s * 0.5, s * 0.24, s * 0.06);
  g.fillTriangle(s * 0.32, -s * 0.12, s * 0.32, s * 0.12, s * 0.46, 0);
  g.fillStyle(0x0b1215, 1);
  g.fillRect(-s * 0.12, -s * 0.12, s * 0.05, s * 0.24);
};

const ICONS: Record<WeaponIconKind, Draw> = {
  shell,
  heavy: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, s * 0.3);
    g.fillStyle(0x0b1215, 0.6);
    g.fillCircle(-s * 0.09, -s * 0.09, s * 0.08);
    g.lineStyle(Math.max(2, s * 0.06), color, 1);
    g.strokeCircle(0, 0, s * 0.4);
  },
  cluster: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, s * 0.16);
    for (let index = 0; index < 5; index += 1) {
      const angle = -Math.PI / 2 + ((index - 2) * Math.PI) / 4.5;
      g.fillCircle(Math.cos(angle) * s * 0.34, Math.sin(angle) * s * 0.34 + s * 0.08, s * 0.09);
    }
  },
  trident: (g, s, color) => {
    g.lineStyle(Math.max(2, s * 0.08), color, 1);
    for (const spread of [-0.32, 0, 0.32]) {
      g.beginPath();
      g.moveTo(-s * 0.36, s * 0.24);
      g.lineTo(s * 0.36, s * 0.24 - s * 0.5 - spread * s);
      g.strokePath();
    }
  },
  ricochet: (g, s, color) => {
    g.lineStyle(Math.max(2, s * 0.06), color, 0.85);
    g.beginPath();
    g.moveTo(-s * 0.42, -s * 0.3);
    g.lineTo(-s * 0.16, s * 0.3);
    g.lineTo(s * 0.1, -s * 0.06);
    g.lineTo(s * 0.3, s * 0.3);
    g.strokePath();
    g.fillStyle(color, 1);
    g.fillCircle(s * 0.3, s * 0.12, s * 0.14);
  },
  airburst: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillCircle(0, -s * 0.06, s * 0.13);
    g.lineStyle(Math.max(2, s * 0.05), color, 0.9);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      g.beginPath();
      g.moveTo(Math.cos(angle) * s * 0.2, -s * 0.06 + Math.sin(angle) * s * 0.2);
      g.lineTo(Math.cos(angle) * s * 0.36, -s * 0.06 + Math.sin(angle) * s * 0.36);
      g.strokePath();
    }
    g.lineStyle(Math.max(1, s * 0.04), 0x8baa61, 0.9);
    g.beginPath();
    g.moveTo(-s * 0.44, s * 0.42);
    g.lineTo(s * 0.44, s * 0.42);
    g.strokePath();
  },
  drill: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillTriangle(-s * 0.2, -s * 0.36, s * 0.2, -s * 0.36, 0, s * 0.42);
    g.lineStyle(Math.max(1, s * 0.05), 0x0b1215, 0.8);
    for (const y of [-0.2, 0, 0.18]) {
      g.beginPath();
      g.moveTo(-s * 0.16, y * s);
      g.lineTo(s * 0.12, (y + 0.1) * s);
      g.strokePath();
    }
  },
  crater: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.46, -s * 0.02, s * 0.92, s * 0.34);
    g.fillStyle(0x0b1215, 1);
    g.fillEllipse(0, -s * 0.02, s * 0.6, s * 0.4);
    g.fillStyle(color, 1);
    g.fillCircle(0, -s * 0.3, s * 0.08);
  },
  dart: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillTriangle(-s * 0.42, -s * 0.06, -s * 0.42, s * 0.06, s * 0.44, 0);
    g.fillTriangle(-s * 0.42, 0, -s * 0.24, -s * 0.18, -s * 0.24, s * 0.18);
  },
  timer: (g, s, color) => {
    g.lineStyle(Math.max(2, s * 0.07), color, 1);
    g.strokeCircle(0, s * 0.04, s * 0.32);
    g.beginPath();
    g.moveTo(0, s * 0.04);
    g.lineTo(0, -s * 0.16);
    g.moveTo(0, s * 0.04);
    g.lineTo(s * 0.16, s * 0.12);
    g.strokePath();
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.08, -s * 0.42, s * 0.16, s * 0.08);
  },
  fork: (g, s, color) => {
    g.lineStyle(Math.max(2, s * 0.07), color, 1);
    g.beginPath();
    g.moveTo(-s * 0.42, s * 0.3);
    g.lineTo(-s * 0.04, -s * 0.08);
    g.strokePath();
    for (const end of [
      [s * 0.4, -s * 0.36],
      [s * 0.42, s * 0.02],
      [s * 0.14, s * 0.38],
    ] as const) {
      g.beginPath();
      g.moveTo(-s * 0.04, -s * 0.08);
      g.lineTo(end[0], end[1]);
      g.strokePath();
    }
    g.fillStyle(color, 1);
    g.fillCircle(-s * 0.04, -s * 0.08, s * 0.09);
  },
  rail: (g, s, color) => {
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.42, -s * 0.05, s * 0.84, s * 0.1);
    g.lineStyle(Math.max(1, s * 0.05), color, 0.9);
    g.strokeCircle(s * 0.18, 0, s * 0.22);
    g.beginPath();
    g.moveTo(s * 0.18, -s * 0.32);
    g.lineTo(s * 0.18, s * 0.32);
    g.strokePath();
  },
};

export const drawWeaponIcon = (
  graphics: Phaser.GameObjects.Graphics,
  kind: WeaponIconKind,
  size: number,
  color: number,
): void => {
  ICONS[kind](graphics, size, color);
};
