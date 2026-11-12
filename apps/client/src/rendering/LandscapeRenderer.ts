import type Phaser from 'phaser';
import { VIEW_BOUNDS } from './BattlefieldLayout';
import { WORLD_COLOR } from '../ui/theme';
import { backgroundKey, currentBackground, type BackgroundId } from './BackgroundCatalog';

// Original, code-drawn golden-hour landscape. Canvas gradients work in Phaser's CANVAS
// renderer (Graphics.fillGradientStyle does not). Static art is cached, not repainted per frame.
export class LandscapeView {
  private activeId: BackgroundId = 'golden-valley';
  private readonly backdrop: Phaser.GameObjects.Image;
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(scene: Phaser.Scene) {
    const selected = currentBackground();
    const loadedKey = backgroundKey(selected);
    if (scene.textures.exists(loadedKey)) {
      this.activeId = selected;
      this.backdrop = scene.add
        .image(0, 0, loadedKey)
        .setOrigin(0)
        .setDepth(0)
        .setDisplaySize(VIEW_BOUNDS.width, VIEW_BOUNDS.height);
      document.body.dataset.background = selected;
      document.body.dataset.backgroundRender = 'webp';
      return;
    }
    // Keep the existing original canvas landscape as a graceful missing-asset fallback.
    // Static WebP plates need only one draw and no procedural cloud updates each frame.
    document.body.dataset.background = 'golden-valley';
    document.body.dataset.backgroundRender = 'procedural-fallback';
    const key = 'arc-golden-valley';
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.createCanvas(key, 1280, 720);
      if (texture === null) throw new Error('Cannot create landscape texture');
      const c = texture.context;
      const sky = c.createLinearGradient(0, 0, 0, 620);
      for (const [stop, color] of WORLD_COLOR.skyStops) sky.addColorStop(stop, color);
      c.fillStyle = sky;
      c.fillRect(0, 0, 1280, 720);
      const glow = c.createRadialGradient(1045, 245, 10, 1045, 245, 300);
      glow.addColorStop(0, 'rgba(255,221,158,.6)');
      glow.addColorStop(1, 'rgba(255,173,140,0)');
      c.fillStyle = glow;
      c.fillRect(700, 0, 580, 580);
      c.fillStyle = 'rgba(255,211,146,.12)';
      for (const r of [82, 105]) {
        c.beginPath();
        c.arc(1045, 245, r, 0, Math.PI * 2);
        c.fill();
      }
      const sun = c.createLinearGradient(0, 190, 0, 300);
      sun.addColorStop(0, WORLD_COLOR.sunCore);
      sun.addColorStop(1, WORLD_COLOR.sunEdge);
      c.fillStyle = sun;
      c.beginPath();
      c.arc(1045, 245, 57, 0, Math.PI * 2);
      c.fill();
      // Tiny distant birds, hand-authored arcs; no borrowed imagery.
      c.strokeStyle = 'rgba(59,36,95,.6)';
      c.lineWidth = 2;
      for (const [x, y, s] of [
        [852, 273, 7],
        [876, 264, 5],
        [897, 275, 4],
      ]) {
        if (x === undefined || y === undefined || s === undefined) continue;
        c.beginPath();
        c.moveTo(x - s, y);
        c.quadraticCurveTo(x - s / 2, y - s, x, y);
        c.quadraticCurveTo(x + s / 2, y - s, x + s, y);
        c.stroke();
      }
      // Faceted distant peaks with shaded faces and small snow shelves.
      const peaks = [
        [-40, 390, 160, 300],
        [235, 325, 175, 305],
        [515, 370, 220, 275],
        [810, 330, 210, 300],
        [1175, 360, 180, 265],
      ];
      for (const [x, y, w, h] of peaks) {
        if (x === undefined || y === undefined || w === undefined || h === undefined) continue;
        c.fillStyle = WORLD_COLOR.farMountain;
        polygon(c, [
          [x - w, y + h],
          [x, y],
          [x + w * 1.3, y + h],
        ]);
        c.fillStyle = '#755caa';
        polygon(c, [
          [x, y],
          [x + w * 0.15, y + h],
          [x + w * 1.3, y + h],
        ]);
        c.fillStyle = '#c6a8df';
        polygon(c, [
          [x, y],
          [x - 25, y + 65],
          [x - 8, y + 49],
          [x + 12, y + 74],
          [x + 31, y + 42],
        ]);
      }
      // Curving foothills, atmospheric distance colours and ridgeline highlights.
      ridge(c, 424, 38, 0.006, 1.3, '#66509e', '#ad81bb');
      ridge(c, 477, 31, 0.009, 0.2, WORLD_COLOR.farHill, '#5f9d9c');
      for (let x = 10; x < 1300; x += 23) {
        const y = hillY(x, 477, 31, 0.009, 0.2);
        pine(c, x, y + 1, 12 + hash(x) * 15, WORLD_COLOR.farHillTree);
      }
      ridge(c, 517, 28, 0.008, 2, WORLD_COLOR.nearHill, '#75ac72');
      for (let x = 6; x < 1300; x += 36) {
        pine(
          c,
          x,
          hillY(x, 517, 28, 0.008, 2) + 2,
          13 + hash(x + 1) * 22,
          WORLD_COLOR.nearHillTree,
        );
      }
      texture.refresh();
    }
    this.backdrop = scene.add.image(0, 0, key).setOrigin(0).setDepth(0);
    const cloudKey = 'arc-cloud';
    if (!scene.textures.exists(cloudKey)) {
      const texture = scene.textures.createCanvas(cloudKey, 340, 120);
      if (texture === null) throw new Error('Cannot create cloud texture');
      const c = texture.context;
      const cloud = c.createLinearGradient(0, 12, 0, 106);
      cloud.addColorStop(0, '#ffefdf');
      cloud.addColorStop(0.6, '#f9c6d0');
      cloud.addColorStop(1, '#cb9fd0');
      c.fillStyle = cloud;
      for (const [x, y, rx, ry] of [
        [80, 76, 64, 25],
        [128, 58, 46, 39],
        [185, 50, 53, 43],
        [240, 70, 47, 30],
        [284, 82, 36, 18],
        [162, 84, 106, 21],
      ]) {
        if (x === undefined || y === undefined || rx === undefined || ry === undefined) continue;
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = 'rgba(255,249,222,.6)';
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(185, 50, 48, 38, 0, Math.PI * 1.06, Math.PI * 1.87);
      c.stroke();
      texture.refresh();
    }
    for (const [x, y, scale, alpha] of [
      [70, 273, 0.67, 0.45],
      [300, 232, 0.88, 0.6],
      [685, 270, 0.54, 0.42],
      [920, 171, 0.72, 0.62],
      [1205, 307, 0.65, 0.48],
    ]) {
      if (x === undefined || y === undefined || scale === undefined || alpha === undefined)
        continue;
      this.clouds.push(scene.add.image(x, y, cloudKey).setScale(scale).setAlpha(alpha).setDepth(1));
    }
  }

  public get activeBackground(): BackgroundId {
    return this.activeId;
  }

  public setBackground(id: BackgroundId): void {
    const key = backgroundKey(id);
    if (!this.backdrop.scene.textures.exists(key)) return;
    this.activeId = id;
    this.backdrop.setTexture(key).setDisplaySize(VIEW_BOUNDS.width, VIEW_BOUNDS.height);
    for (const cloud of this.clouds) cloud.setVisible(false);
    document.body.dataset.background = id;
    document.body.dataset.backgroundRender = 'webp';
  }

  public update(dt: number): void {
    if (this.reducedMotion) return;
    this.clouds.forEach((cloud, i) => {
      cloud.x += dt * (2 + i * 0.4);
      if (cloud.x > VIEW_BOUNDS.width + 180) cloud.x = -180;
    });
  }
}

export const hash = (n: number): number => {
  const f = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return f - Math.floor(f);
};

const polygon = (c: CanvasRenderingContext2D, points: number[][]): void => {
  c.beginPath();
  points.forEach(([x, y], i) => {
    if (x !== undefined && y !== undefined) {
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  });
  c.closePath();
  c.fill();
};
const hillY = (x: number, y: number, amp: number, freq: number, phase: number): number =>
  y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.1) * amp * 0.23;
const ridge = (
  c: CanvasRenderingContext2D,
  y: number,
  amp: number,
  freq: number,
  phase: number,
  color: string,
  highlight: string,
): void => {
  c.beginPath();
  c.moveTo(0, 720);
  for (let x = 0; x <= 1280; x += 4) c.lineTo(x, hillY(x, y, amp, freq, phase));
  c.lineTo(1280, 720);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.beginPath();
  for (let x = 0; x <= 1280; x += 4) {
    const sy = hillY(x, y, amp, freq, phase);
    if (x === 0) c.moveTo(x, sy);
    else c.lineTo(x, sy);
  }
  c.strokeStyle = highlight;
  c.lineWidth = 2;
  c.stroke();
};
const pine = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
): void => {
  c.fillStyle = color;
  c.fillRect(x - 1, y - h, 2, h);
  polygon(c, [
    [x, y - h],
    [x - h * 0.24, y - h * 0.35],
    [x + h * 0.24, y - h * 0.35],
  ]);
  polygon(c, [
    [x, y - h * 0.72],
    [x - h * 0.33, y - 2],
    [x + h * 0.33, y - 2],
  ]);
};
