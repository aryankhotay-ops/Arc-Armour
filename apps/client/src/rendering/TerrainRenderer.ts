import type Phaser from 'phaser';
import { WORLD_BOUNDS, type MutableTerrainState } from '@artillery/simulation';
import { css } from '../ui/theme';
import { hash } from './LandscapeRenderer';
import type { BackgroundId } from './BackgroundCatalog';
import { terrainTheme, type TerrainTheme } from './TerrainTheme';

// Height-field rendering follows every simulation sample exactly. Soil is clipped to the live
// surface; the original grass cap is NOT regenerated in craters. Removed ground exposes layers,
// a pale rock edge and persistent charcoal scorch, making the deformation readable after smoke.
export class TerrainView {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private renderedRevision = -1;
  private original: number[] = [];
  private material: TerrainTheme;

  public constructor(scene: Phaser.Scene, background: BackgroundId = 'golden-valley') {
    this.material = terrainTheme(background);
    const key = 'arc-live-terrain';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const texture = scene.textures.createCanvas(key, WORLD_BOUNDS.width, WORLD_BOUNDS.height);
    if (texture === null) throw new Error('Cannot create terrain texture');
    this.texture = texture;
    scene.add.image(0, 0, key).setOrigin(0).setDepth(10);
  }

  public setBackground(background: BackgroundId): void {
    const material = terrainTheme(background);
    if (material === this.material) return;
    this.material = material;
    this.renderedRevision = -1;
  }

  public update(terrain: MutableTerrainState): void {
    if (terrain.revision === this.renderedRevision) return;
    if (this.original.length === 0) this.original = [...terrain.surfaceY];
    this.renderedRevision = terrain.revision;
    const c = this.texture.context;
    const material = this.material;
    document.body.dataset.terrainStyle = material.style;
    const { width, height } = WORLD_BOUNDS;
    const y = (x: number): number => terrain.surfaceY[x] ?? height;
    const oldY = (x: number): number => this.original[x] ?? height;
    c.clearRect(0, 0, width, height);
    c.save();
    c.beginPath();
    c.moveTo(0, y(0));
    for (let x = 1; x <= terrain.width; x++) c.lineTo(x, y(x));
    c.lineTo(width, height);
    c.lineTo(0, height);
    c.closePath();
    c.clip();
    c.fillStyle = css(material.topsoil);
    c.fillRect(0, 0, width, height);
    material.soilBands.forEach((color, i) => {
      c.beginPath();
      c.moveTo(0, height);
      for (let x = 0; x <= width; x += 2) {
        c.lineTo(x, oldY(x) + 24 + i * 40 + Math.sin(x * 0.015 + i) * 5);
      }
      c.lineTo(width, height);
      c.closePath();
      c.fillStyle = css(color);
      c.fill();
      c.strokeStyle = 'rgba(255,218,151,.16)';
      c.lineWidth = 2;
      c.stroke();
    });
    for (let i = 0; i < 800; i++) {
      const x = hash(i + 4) * width;
      const ry = oldY(Math.floor(x)) + 20 + hash(i + 180) * 300;
      const r = 1.5 + hash(i + 81) * 5;
      c.fillStyle = css(i % 3 === 0 ? material.rockDark : material.rockLight);
      c.beginPath();
      c.ellipse(x, ry, r * 1.6, r, hash(i) * 3, 0, Math.PI * 2);
      c.fill();
      if (r > 4) {
        c.fillStyle =
          material.style === 'arcade' ? 'rgba(255,219,172,.25)' : 'rgba(241,240,232,.18)';
        c.fillRect(x - r, ry - 2, r, 1);
      }
    }
    if (material.style === 'graphite') {
      // Dry-pencil hatching is clipped to the authoritative heightfield, including craters.
      // Redraw only when terrain revision/material changes, never on every animation frame.
      for (let x = -30; x < width + 60; x += 9) {
        for (let dy = 18; dy < 410; dy += 24) {
          const sy = oldY(Math.max(0, Math.min(width, x))) + dy;
          c.strokeStyle = `rgba(76,72,65,${0.11 + hash(x + dy) * 0.17})`;
          c.lineWidth = 0.7 + hash(x * 3 + dy) * 0.8;
          c.beginPath();
          c.moveTo(x, sy);
          c.lineTo(x + 22 + hash(x + dy) * 22, sy - 24 + hash(dy) * 4);
          c.stroke();
          if (dy % 3 === 0) {
            c.beginPath();
            c.moveTo(x, sy + 5);
            c.lineTo(x + 31, sy + 18);
            c.stroke();
          }
        }
      }
    } else if (material.style === 'regolith') {
      // Airless grey dust: shallow shaded pocks, scattered regolith and a bright top rim.
      // These marks are material texture INSIDE solid ground, not extra collision craters.
      const falloff = c.createLinearGradient(0, 0, 0, height);
      falloff.addColorStop(0.25, 'rgba(214,216,222,.12)');
      falloff.addColorStop(1, 'rgba(14,17,23,.48)');
      c.fillStyle = falloff;
      c.fillRect(0, 0, width, height);
      for (let i = 0; i < 240; i++) {
        const x = hash(i + 740) * width;
        const sy = oldY(Math.floor(x)) + 18 + hash(i + 920) * 390;
        const r = 3 + hash(i + 1130) * 16;
        c.beginPath();
        c.ellipse(x, sy, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(28,30,37,.20)';
        c.fill();
        c.beginPath();
        c.ellipse(x, sy, r * 1.6, r * 0.55, 0, Math.PI * 1.05, Math.PI * 1.9);
        c.lineWidth = 1.3;
        c.strokeStyle = 'rgba(220,222,223,.26)';
        c.stroke();
      }
    }
    // Original three themes retain their existing grass fringe, plants and flowers.
    if (material.style === 'arcade') {
      for (let x = 0; x < width; x++) {
        const original = oldY(x);
        if (y(x) - original > 2) continue;
        c.fillStyle = css(material.grassDark);
        c.fillRect(x, original, 1, 14 + hash(x) * 3);
        c.fillStyle = css(material.grass);
        c.fillRect(x, original, 1, 7 + hash(x) * 3);
        c.fillStyle = css(material.grassLight);
        c.fillRect(x, original, 1, 2);
      }
      // Sparse rocks and flowers stick to undamaged ground, and disappear when it is removed.
      for (let x = 9; x < width; x += 17) {
        if (y(x) - oldY(x) > 2) continue;
        const sy = y(x);
        c.strokeStyle = '#42662f';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, sy + 1);
        c.lineTo(x - 3, sy - 6);
        c.moveTo(x, sy + 1);
        c.lineTo(x + 3, sy - 4);
        c.stroke();
      }
    }
    // Built dirt is real collision material above the original ground; give it a visible
    // fill rather than leaving a flat untextured empty-looking patch after Magic Wall.
    for (let x = 0; x < width; x += 3) {
      if (y(x) >= oldY(x) - 2) continue;
      c.fillStyle =
        material.style === 'arcade'
          ? '#957249'
          : material.style === 'graphite'
            ? '#b9b5a9'
            : '#85868a';
      c.fillRect(x, y(x), 3, oldY(x) - y(x));
      c.strokeStyle = 'rgba(38,35,32,.18)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y(x) + 4);
      c.lineTo(x + 10, Math.min(oldY(x), y(x) + 22));
      c.stroke();
    }
    c.restore();
    // Outline only the current surface. Scorched edge cannot imply solid collision above it.
    for (let x = 1; x <= width; x++) {
      const cut = y(x) - oldY(x) > 2;
      c.lineWidth = cut ? 6 : 2;
      c.strokeStyle = css(cut ? material.scorch : material.edge);
      c.beginPath();
      c.moveTo(x - 1, y(x - 1) + (cut ? 3 : 1));
      c.lineTo(x, y(x) + (cut ? 3 : 1));
      c.stroke();
      if (cut) {
        c.strokeStyle = css(material.exposedRim);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x - 1, y(x - 1));
        c.lineTo(x, y(x));
        c.stroke();
      } else if (material.style === 'arcade' && x % 47 === 0) {
        c.fillStyle = x % 2 ? '#ffe693' : '#f5a0c0';
        c.beginPath();
        c.arc(x, y(x) - 5, 2.2, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#467638';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y(x));
        c.lineTo(x, y(x) - 3);
        c.stroke();
      }
    }
    for (const coating of terrain.coatings ?? []) {
      c.strokeStyle = coating.kind === 'rubber' ? '#efa8d8' : '#bdb1df';
      c.lineWidth = 5;
      c.beginPath();
      for (let x = Math.ceil(coating.minX); x <= coating.maxX; x += 2) {
        if (x === Math.ceil(coating.minX)) c.moveTo(x, y(x) + 3);
        else c.lineTo(x, y(x) + 3);
      }
      c.stroke();
    }
    this.texture.refresh();
  }
}
