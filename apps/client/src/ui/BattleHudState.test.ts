import { describe, expect, it } from 'vitest';
import { GameEngine } from '@artillery/simulation';
import { battleStatus } from './BattleHudState';

describe('read-only battle HUD match status', () => {
  it('follows the real shot lifecycle and player handoff', () => {
    const engine = new GameEngine();
    expect(battleStatus(engine, false)).toBe('P1 · READY TO FIRE');
    engine.fire();
    expect(battleStatus(engine, false)).toBe('P1 · SHOT IN FLIGHT');
    const observed = new Set<string>();
    for (let step = 0; step < 1000 && engine.state.turnNumber === 1; step++) {
      engine.update(0.05);
      observed.add(battleStatus(engine, false));
    }
    expect(observed).toContain('P1 · IMPACT / SETTLING');
    expect(battleStatus(engine, false)).toBe('P2 · READY TO FIRE');
  });

  it('can report pause without mutating or advancing the engine', () => {
    const engine = new GameEngine();
    engine.fire();
    const before = JSON.stringify(engine.state);
    expect(battleStatus(engine, true)).toBe('PAUSED');
    expect(JSON.stringify(engine.state)).toBe(before);
    expect(battleStatus(engine, false)).toBe('P1 · SHOT IN FLIGHT');
  });

  it('reports a real lethal shot result rather than the last active player as winner', () => {
    const engine = new GameEngine({ startingHealth: 1, wind: 0 });
    engine.selectWeapon('heavy-shell');
    engine.setAim(85, 0.2);
    engine.fire();
    for (let step = 0; step < 1000 && engine.state.phase !== 'game-over'; step++)
      engine.update(0.05);
    expect(engine.state.winnerId).toBe('player2');
    expect(battleStatus(engine, false)).toBe('MATCH COMPLETE · P2 WINS');
  });

  it('handles the draw presentation contract without inventing a winner', () => {
    const engine = new GameEngine();
    engine.state.phase = 'game-over';
    engine.state.winnerId = undefined;
    expect(battleStatus(engine, false)).toBe('MATCH COMPLETE · DRAW');
  });
});
