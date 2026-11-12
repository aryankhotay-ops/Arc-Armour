import { WORLD_BOUNDS } from '@artillery/simulation';

// Keep readable controls at 1280 x 720 while the actual battlefield is larger.
// Uniform projection scales terrain, tanks, physics trails and effects together: never shrink
// only a sprite (which would leave an oversized invisible hitbox or a detached muzzle).
export const VIEW_BOUNDS = Object.freeze({ width: 1280, height: 720 });
export const BATTLEFIELD_SCALE = VIEW_BOUNDS.width / WORLD_BOUNDS.width;
export const AIM_PREVIEW_SECONDS = 0.55;
export const screenToBattlefield = (x: number, y: number): { x: number; y: number } => ({
  x: x / BATTLEFIELD_SCALE,
  y: y / BATTLEFIELD_SCALE,
});
