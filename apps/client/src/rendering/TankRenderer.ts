import type Phaser from 'phaser';
import { tankModel } from '@artillery/content';
import {
  BARREL_LENGTH,
  TURRET_PIVOT_LOCAL,
  type CombatEvent,
  type TankState,
  type PlayerId,
  muzzlePosition,
  localToWorld,
} from '@artillery/simulation';
import { GUN_MARGIN, tankHullKey, tankGunKey, HULL_VIEW } from './TankSprites';
import { currentTanks } from '../settings/TankSelection';
import { TankAnimation } from './TankAnimation';
import {
  COLOR,
  PLAYER_THEME,
  drawEmblem,
  healthColor,
  textStyle,
  type PlayerTheme,
} from '../ui/theme';

// Original chassis art. Both designs use the SAME simulation contacts, hull pose and muzzle.
// No active-player scaling: that would misalign the visible muzzle and physical projectile.
// Marigold: rounded cast armour, five road wheels, sun insignia, exhaust grille.
// Cobalt: wedge armour, four larger wheels, twin stripe, diamond insignia, cyan optics.
export const drawTankChassis = (g: Phaser.GameObjects.Graphics, theme: PlayerTheme): void => {
  const rounded = theme.emblem === 'sun';
  const s = rounded ? 1 : -1;
  g.fillStyle(COLOR.ink, 0.3);
  g.fillEllipse(0, 2, 110, 10);
  // Rear antenna and exhaust, behind the turret.
  g.lineStyle(2, COLOR.ink);
  g.lineBetween(-s * 29, -39, -s * 35, -81);
  g.fillStyle(theme.glow);
  g.fillCircle(-s * 35, -81, 2);
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(-s * 41 - 5, -54, 10, 24, 3);
  g.fillStyle(0x62627c);
  g.fillRect(-s * 41 - 3, -51, 6, 13);
  g.lineStyle(1, COLOR.ink);
  for (let y = -49; y < -37; y += 3) g.lineBetween(-s * 44, y, -s * 38, y);
  // Track silhouette lies exactly on the contact line (y=0).
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(-53, -28, 106, 28, 12);
  g.fillStyle(0x3b344f);
  g.fillRoundedRect(-51, -26, 102, 23, 10);
  g.lineStyle(2, 0x6d627f);
  g.strokeRoundedRect(-49, -24, 98, 19, 9);
  const wheelXs = rounded ? [-38, -19, 0, 19, 38] : [-36, -12, 12, 36];
  for (const x of wheelXs) {
    const r = rounded ? 8 : 9;
    g.fillStyle(COLOR.ink);
    g.fillCircle(x, -14, r + 1);
    g.fillStyle(theme.deep);
    g.fillCircle(x, -14, r - 1);
    g.lineStyle(1.5, theme.light, 0.7);
    g.strokeCircle(x, -14, r - 2);
    g.fillStyle(0x736e8b);
    g.fillCircle(x, -14, 3.6);
    g.fillStyle(COLOR.ink);
    g.fillCircle(x, -14, 1.5);
    g.lineStyle(1, theme.light, 0.45);
    g.lineBetween(x - 5, -14, x + 5, -14);
  }
  g.lineStyle(2, 0x91849b, 0.6);
  for (let x = -39; x <= 39; x += 8) {
    g.lineBetween(x, -2, x + 2, -5);
    g.lineBetween(x, -25, x + 2, -22);
  }
  // Main hull, thick ink line and lit upper bevel.
  if (rounded) {
    g.fillStyle(COLOR.ink);
    g.fillRoundedRect(-46, -49, 92, 27, { tl: 13, tr: 17, bl: 4, br: 5 });
    g.fillStyle(theme.primary);
    g.fillRoundedRect(-43, -47, 86, 22, { tl: 11, tr: 15, bl: 3, br: 4 });
    g.fillStyle(theme.light);
    g.fillRoundedRect(-33, -47, 57, 5, 3);
    g.fillStyle(theme.shade);
    g.fillRoundedRect(-43, -32, 86, 7, 3);
  } else {
    g.fillStyle(COLOR.ink);
    g.fillPoints(
      [
        { x: -49, y: -25 },
        { x: -38, y: -48 },
        { x: 33, y: -48 },
        { x: 49, y: -27 },
      ],
      true,
    );
    g.fillStyle(theme.primary);
    g.fillPoints(
      [
        { x: -44, y: -27 },
        { x: -36, y: -45 },
        { x: 31, y: -45 },
        { x: 44, y: -28 },
      ],
      true,
    );
    g.fillStyle(theme.light);
    g.fillPoints(
      [
        { x: -36, y: -45 },
        { x: 31, y: -45 },
        { x: 33, y: -41 },
        { x: -37, y: -41 },
      ],
      true,
    );
    g.fillStyle(theme.shade);
    g.fillRect(-39, -32, 78, 6);
    g.fillStyle(theme.trim);
    g.fillRect(-28, -40, 5, 11);
    g.fillRect(-19, -40, 3, 11);
  }
  // Side fenders, service panel, rivets and headlight.
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(-53, -29, 106, 6, 2);
  g.fillStyle(theme.light);
  g.fillRoundedRect(-49, -29, 98, 3, 1);
  g.fillStyle(theme.deep);
  g.fillRoundedRect(s * -24 - 9, -39, 18, 8, 2);
  g.lineStyle(1, theme.light, 0.7);
  for (let x = 0; x < 4; x++) g.lineBetween(s * -24 - 6 + x * 4, -37, s * -24 - 6 + x * 4, -33);
  for (const x of [-37, 34]) {
    g.fillStyle(COLOR.ink);
    g.fillCircle(x, -35, 2.2);
    g.fillStyle(theme.light);
    g.fillCircle(x - 0.5, -35.5, 1);
  }
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(s * 39 - 5, -36, 10, 8, 2);
  g.fillStyle(theme.glow);
  g.fillRoundedRect(s * 39 - 3, -34, 6, 4, 1);
  // Turret built around the shared simulation pivot.
  const px = s * TURRET_PIVOT_LOCAL.x;
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(px - 26, -61, 52, 20, rounded ? 10 : 3);
  g.fillStyle(theme.shade);
  g.fillRoundedRect(px - 23, -58, 46, 14, rounded ? 8 : 2);
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(px - 22, -72, 44, 25, rounded ? 12 : 5);
  g.fillStyle(theme.primary);
  g.fillRoundedRect(px - 19, -69, 38, 20, rounded ? 10 : 3);
  g.fillStyle(theme.light);
  g.fillRoundedRect(px - 14, -68, 24, 4, 2);
  g.fillStyle(theme.shade);
  g.fillRoundedRect(px - 17, -55, 34, 5, 2);
  g.fillStyle(COLOR.ink);
  g.fillRoundedRect(px - 12, -75, 23, 7, 2);
  g.fillStyle(theme.light);
  g.fillRect(px - 9, -73, 17, 2);
  g.fillStyle(COLOR.ink);
  g.fillRect(px + s * 10 - 4, -65, 8, 5);
  g.fillStyle(theme.glow);
  g.fillRect(px + s * 10 - 2, -64, 4, 2);
  drawEmblem(g, theme, -s * 2, -35, 6);
};

export const drawTankBarrel = (
  g: Phaser.GameObjects.Graphics,
  theme: PlayerTheme,
  facing: number,
  angleDegrees: number,
  recoil = 0,
): void => {
  const angle =
    facing === 1 ? (-angleDegrees * Math.PI) / 180 : Math.PI + (angleDegrees * Math.PI) / 180;
  const px = facing * TURRET_PIVOT_LOCAL.x,
    py = TURRET_PIVOT_LOCAL.y;
  const ux = Math.cos(angle),
    uy = Math.sin(angle),
    nx = -uy,
    ny = ux;
  const point = (length: number, side: number): { x: number; y: number } => ({
    x: px + ux * (length - recoil) + nx * side,
    y: py + uy * (length - recoil) + ny * side,
  });
  const length = BARREL_LENGTH - recoil;
  g.lineStyle(12, COLOR.ink);
  g.lineBetween(px, py, px + ux * length, py + uy * length);
  g.lineStyle(7, theme.primary);
  g.lineBetween(px, py, px + ux * length, py + uy * length);
  g.lineStyle(2, theme.light);
  g.lineBetween(
    px - nx * 2,
    py - ny * 2,
    px + ux * (length - 4) - nx * 2,
    py + uy * (length - 4) - ny * 2,
  );
  // Muzzle brake ends at the exact physics muzzle length.
  g.fillStyle(COLOR.ink);
  g.fillPoints([point(61, -7), point(72, -7), point(72, 7), point(61, 7)], true);
  g.fillStyle(theme.light);
  g.fillPoints([point(63, -4), point(70, -4), point(70, 4), point(63, 4)], true);
  g.lineStyle(2, theme.deep);
  g.lineBetween(point(67, -4).x, point(67, -4).y, point(67, 4).x, point(67, 4).y);
  g.fillStyle(COLOR.ink);
  g.fillCircle(px, py, 9);
  g.fillStyle(theme.shade);
  g.fillCircle(px, py, 6);
  g.fillStyle(theme.light);
  g.fillCircle(px - 1, py - 1, 3);
};

export const createTankPortrait = (
  scene: Phaser.Scene,
  player: PlayerId,
  x: number,
  y: number,
  scale: number,
): Phaser.GameObjects.Container => {
  const root = scene.add.container(x, y);
  const id = currentTanks()[player === 'player1' ? 0 : 1];
  const model = tankModel(id);
  if (
    id !== 'marigold' &&
    id !== 'cobalt' &&
    scene.textures.exists(tankHullKey(id, player === 'player1' ? 0 : 1))
  ) {
    const facing = player === 'player1' ? 1 : -1;
    const hull = scene.add
      .image(0, 0, tankHullKey(id, player === 'player1' ? 0 : 1))
      .setOrigin(-HULL_VIEW.x / HULL_VIEW.width, -HULL_VIEW.y / HULL_VIEW.height)
      .setScale(facing / 4, 0.25);
    const gun = scene.add
      .image(facing * model.geometry.pivotX, model.geometry.pivotY, tankGunKey(id))
      .setOrigin(GUN_MARGIN / (model.geometry.barrelLength + 2 * GUN_MARGIN), 0.5)
      .setScale(0.25)
      .setRotation(facing === 1 ? (-35 * Math.PI) / 180 : Math.PI + (35 * Math.PI) / 180);
    root.add([hull, gun]).setScale(scale);
    return root;
  }
  const body = scene.add.graphics(),
    barrel = scene.add.graphics();
  drawTankChassis(body, { ...PLAYER_THEME[player], emblem: id === 'marigold' ? 'sun' : 'diamond' });
  body.setScale((player === 'player1' ? 1 : -1) / (id === 'marigold' ? 1 : -1), 1);
  drawTankBarrel(barrel, PLAYER_THEME[player], player === 'player1' ? 1 : -1, 35);
  root.add([body, barrel]).setScale(scale);
  return root;
};

export class TankView {
  private readonly hullImage: Phaser.GameObjects.Image | undefined;
  private readonly gunImage: Phaser.GameObjects.Image | undefined;
  private readonly root: Phaser.GameObjects.Container;
  private readonly barrel: Phaser.GameObjects.Graphics;
  private readonly status: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly wheelMotion: Phaser.GameObjects.Graphics;
  private readonly chassis: Phaser.GameObjects.Graphics;
  private readonly hitFlash: Phaser.GameObjects.Graphics;
  private readonly wreck: Phaser.GameObjects.Graphics;
  public readonly animation: TankAnimation;
  private age = 0;

  public constructor(
    scene: Phaser.Scene,
    tank: TankState,
    private readonly reducedMotion = false,
    labelScale = 1,
  ) {
    const theme = PLAYER_THEME[tank.playerId];
    const model = tankModel(tank.modelId);
    const legacy = model.id === 'marigold' || model.id === 'cobalt';
    this.animation = new TankAnimation(tank, reducedMotion);
    this.root = scene.add.container(tank.x, tank.groundY).setDepth(20);
    this.chassis = scene.add.graphics();
    const chassisTheme = {
      ...theme,
      emblem: model.id === 'marigold' ? ('sun' as const) : ('diamond' as const),
    };
    if (legacy) {
      drawTankChassis(this.chassis, chassisTheme);
      this.chassis.setScale(tank.facing / (model.id === 'marigold' ? 1 : -1), 1);
    } else {
      const hullKey = tankHullKey(model.id, tank.playerId === 'player1' ? 0 : 1);
      const gunKey = tankGunKey(model.id);
      if (!scene.textures.exists(hullKey) || !scene.textures.exists(gunKey))
        throw new Error(`Tank art failed to load for ${model.name}`);
      this.hullImage = scene.add
        .image(0, 0, hullKey)
        .setOrigin(-HULL_VIEW.x / HULL_VIEW.width, -HULL_VIEW.y / HULL_VIEW.height)
        .setScale(tank.facing / 4, 1 / 4);
      this.gunImage = scene.add
        .image(tank.facing * model.geometry.pivotX, model.geometry.pivotY, gunKey)
        .setOrigin(GUN_MARGIN / (model.geometry.barrelLength + GUN_MARGIN * 2), 0.5)
        .setScale(0.25);
    }
    this.hitFlash = scene.add.graphics();
    if (legacy)
      drawTankChassis(this.hitFlash, {
        ...chassisTheme,
        primary: COLOR.text,
        shade: COLOR.text,
        light: COLOR.text,
      });
    this.hitFlash.setAlpha(0);
    if (legacy) this.hitFlash.setScale(tank.facing / (model.id === 'marigold' ? 1 : -1), 1);
    this.wreck = scene.add.graphics().setVisible(false);
    this.wreck.fillStyle(COLOR.ink);
    this.wreck.fillRoundedRect(-45, -43, 90, 20, 5);
    this.wreck.lineStyle(3, 0x746475);
    this.wreck.lineBetween(-29, -39, -9, -30);
    this.wreck.lineBetween(-9, -30, -2, -40);
    this.wreck.lineBetween(8, -32, 31, -39);
    this.wreck.lineStyle(11, COLOR.ink);
    this.wreck.lineBetween(0, -44, tank.facing * 32, -33);
    if (!legacy) {
      this.wreck.clear();
      this.wreck.fillStyle(COLOR.ink);
      this.wreck.fillPoints(
        model.hull.map(([x, y]) => ({ x: x * tank.facing, y })),
        true,
      );
      this.wreck.fillPoints(
        model.turret.map(([x, y]) => ({ x: x * tank.facing, y })),
        true,
      );
      this.wreck.lineStyle(2, 0x746475);
      this.wreck.lineBetween(-18, -39, 2, -29);
      this.wreck.lineBetween(2, -29, 21, -43);
      this.wreck.lineStyle(5, 0x75677d);
      this.wreck.lineBetween(
        tank.facing * model.geometry.pivotX,
        model.geometry.pivotY,
        tank.facing * (model.geometry.pivotX + model.geometry.barrelLength * 0.4),
        model.geometry.pivotY + 15,
      );
    } else {
      this.wreck.lineStyle(5, 0x75677d);
      this.wreck.lineBetween(0, -44, tank.facing * 32, -33);
    }
    this.wheelMotion = scene.add.graphics();
    this.barrel = scene.add.graphics();
    this.root.add([this.chassis, this.wheelMotion, this.barrel, this.wreck, this.hitFlash]);
    if (this.hullImage !== undefined && this.gunImage !== undefined) {
      // Keep hull at the bottom, animated wheel/cleat layer above it and rotating gun above
      // both. No second gun lives in the static hull texture.
      this.root.addAt(this.hullImage, 0);
      this.root.addAt(this.gunImage, 4);
    }
    this.status = scene.add.graphics().setDepth(22);
    this.label = scene.add
      .text(0, 0, '', textStyle(12, theme.text, { stroke: COLOR.ink, strokeThickness: 4 }))
      .setOrigin(0.5)
      .setScale(labelScale)
      .setDepth(23);
    this.update(tank, false, 0);
  }

  public handleEvents(tank: TankState, events: readonly CombatEvent[]): void {
    this.animation.handleEvents(tank, events);
  }

  /** Evidence from the actual gun sprite transform, not a second predicted launch pose.
   * Transform back to physical world units (root is inside the uniformly scaled world).
   */
  public barrelEvidence(tank: TankState): object {
    const model = tankModel(tank.modelId);
    const expected = muzzlePosition(tank, tank.aim.angleDegrees);
    const actual =
      this.gunImage === undefined
        ? muzzlePosition(tank, this.animation.angle)
        : this.gunImage
            .getWorldTransformMatrix()
            .transformPoint(model.geometry.barrelLength * 4, 0);
    const worldScale = this.root.parentContainer?.scaleX ?? 1;
    const tip =
      this.gunImage === undefined ? actual : { x: actual.x / worldScale, y: actual.y / worldScale };
    return {
      modelId: model.id,
      angle: this.animation.angle,
      expected,
      tip,
      recoil: this.animation.recoil,
      layer: this.gunImage === undefined ? 'graphics' : 'separate-sprite',
      pivot: localToWorld(tank, tank.facing * model.geometry.pivotX, model.geometry.pivotY),
      length: model.geometry.barrelLength,
    };
  }

  public update(tank: TankState, active: boolean, dt = 0): void {
    const theme = PLAYER_THEME[tank.playerId];
    const model = tankModel(tank.modelId);
    this.age += dt;
    this.animation.update(tank, dt);
    const a = this.animation;
    this.root.setPosition(tank.x, tank.groundY).setRotation(tank.hullAngle);
    this.chassis.setAlpha(a.destroyed ? 0.3 : 1);
    this.hullImage?.setAlpha(a.destroyed ? 0.35 : 1);
    if (this.hullImage !== undefined) {
      if (a.hitAlpha > 0) this.hullImage.setTint(0xffe8cc);
      else this.hullImage.clearTint();
    }
    this.wreck.setVisible(a.destroyed);
    this.barrel.setVisible(!a.destroyed);
    this.hitFlash.setAlpha(a.hitAlpha);
    this.barrel.clear();
    if (this.gunImage === undefined)
      drawTankBarrel(this.barrel, theme, tank.facing, a.angle, a.recoil);
    else {
      const rad =
        tank.facing === 1 ? (-a.angle * Math.PI) / 180 : Math.PI + (a.angle * Math.PI) / 180;
      this.gunImage
        .setVisible(!a.destroyed)
        .setRotation(rad)
        .setPosition(
          tank.facing * model.geometry.pivotX - Math.cos(rad) * a.recoil,
          model.geometry.pivotY - Math.sin(rad) * a.recoil,
        );
    }
    this.wheelMotion.clear();
    this.wheelMotion.lineStyle(1.3, theme.light, 0.5);
    const xs =
      this.hullImage === undefined
        ? model.id === 'marigold'
          ? [-38, -19, 0, 19, 38]
          : [-36, -12, 12, 36]
        : Array.from(
            { length: model.wheels },
            (_v, i) =>
              -model.geometry.trackHalfWidth +
              6 +
              (i * (model.geometry.trackHalfWidth * 2 - 12)) / (model.wheels - 1),
          );
    for (const x of xs) {
      const rotation = a.trackDistance / 8;
      this.wheelMotion.lineBetween(
        x + Math.cos(rotation) * 4,
        (this.hullImage === undefined ? -14 : -model.trackHeight * 0.49) + Math.sin(rotation) * 4,
        x - Math.cos(rotation) * 4,
        (this.hullImage === undefined ? -14 : -model.trackHeight * 0.49) - Math.sin(rotation) * 4,
      );
    }
    // Tread cleats advance only by accepted ground travel, not elapsed time or held input.
    const offset = ((a.trackDistance % 8) + 8) % 8;
    const treadHalf = this.hullImage === undefined ? 40 : model.geometry.trackHalfWidth - 6;
    const treadTop = this.hullImage === undefined ? -24 : -model.trackHeight + 4;
    for (let x = -treadHalf + offset; x < treadHalf + 1; x += 8) {
      this.wheelMotion.lineBetween(x, -4, x + 2, -7);
      this.wheelMotion.lineBetween(-x, treadTop, -x + 2, treadTop + 3);
    }
    this.wheelMotion.setAlpha(a.destroyed ? 0.25 : 1);
    this.label.setPosition(tank.x, tank.groundY - 133);
    this.label.setText(
      `${theme.short}  ${model.name.toUpperCase()}${a.destroyed ? ' / DISABLED' : ''}`,
    );
    this.status.clear();
    const bx = tank.x - 39,
      by = tank.groundY - 120;
    this.status.fillStyle(COLOR.ink);
    this.status.fillRoundedRect(bx, by, 78, 9, 4);
    if (tank.health > 0) {
      this.status.fillStyle(healthColor(tank.health));
      this.status.fillRoundedRect(bx + 2, by + 2, (74 * tank.health) / 100, 5, 2);
    }
    if (active && tank.health > 0) {
      const sy = tank.groundY - 155 + (this.reducedMotion ? 0 : Math.sin(this.age * 3) * 3);
      this.status.fillStyle(COLOR.ink);
      this.status.fillTriangle(tank.x - 8, sy, tank.x + 8, sy, tank.x, sy + 10);
      this.status.fillStyle(theme.primary);
      this.status.fillTriangle(tank.x - 5, sy + 2, tank.x + 5, sy + 2, tank.x, sy + 7);
    }
  }
}
