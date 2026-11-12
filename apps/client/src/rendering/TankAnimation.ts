import type { CombatEvent, TankState } from '@artillery/simulation';

// Presentation state only. Root/contact pose is NEVER eased: terrain, hitboxes and the
// launch muzzle stay authoritative. Pointer aim eases briefly and snaps exactly on firing.
export class TankAnimation {
  public angle: number;
  public trackDistance = 0;
  public recoilAge = 1;
  public hitAge = 1;
  public destroyed = false;
  public destructionAge = 0;
  private lastX: number;
  private lastY: number;
  private lastShotId = -1;

  public constructor(
    tank: TankState,
    private readonly reducedMotion = false,
  ) {
    this.angle = tank.aim.angleDegrees;
    this.lastX = tank.x;
    this.lastY = tank.groundY;
  }

  public handleEvents(tank: TankState, events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (
        event.type === 'shot-fired' &&
        event.playerId === tank.playerId &&
        event.shotId !== this.lastShotId
      ) {
        this.lastShotId = event.shotId;
        this.angle = tank.aim.angleDegrees;
        this.recoilAge = 0;
      } else if (event.type === 'tank-damaged' && event.tankId === tank.playerId) {
        this.hitAge = 0;
      }
    }
    if (tank.health <= 0 && !this.destroyed) {
      this.destroyed = true;
      this.destructionAge = 0;
    }
  }

  public update(tank: TankState, dt: number): number {
    const dx = tank.x - this.lastX;
    const dy = tank.groundY - this.lastY;
    const distance = Math.abs(dx) > 0.001 ? Math.sign(dx) * Math.hypot(dx, dy) : 0;
    this.trackDistance += distance;
    this.lastX = tank.x;
    this.lastY = tank.groundY;
    this.recoilAge += dt;
    this.hitAge += dt;
    if (this.destroyed) this.destructionAge += dt;
    const target = tank.aim.angleDegrees;
    this.angle += (target - this.angle) * (1 - Math.exp(-32 * dt));
    if (this.reducedMotion || Math.abs(target - this.angle) < 0.05) this.angle = target;
    return distance;
  }

  public get recoil(): number {
    if (this.reducedMotion || this.destroyed || this.recoilAge >= 0.32) return 0;
    return (
      9 *
      Math.sin((Math.min(1, this.recoilAge / 0.045) * Math.PI) / 2) *
      Math.exp(-this.recoilAge * 12)
    );
  }

  public get hitAlpha(): number {
    return Math.max(0, 1 - this.hitAge / 0.24) * 0.55;
  }
}
