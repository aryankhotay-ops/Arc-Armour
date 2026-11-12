import type { GameEngine } from '@artillery/simulation';

// Read-only presentation boundary. HUD values come from the engine, never DOM datasets or
// a second match model. Pause is scene state; it does not change the simulation's phase.
export const battleStatus = (engine: GameEngine, paused: boolean): string => {
  const state = engine.state;
  if (paused) return 'PAUSED';
  if (state.phase === 'game-over') {
    if (state.winnerId === undefined) return 'MATCH COMPLETE · DRAW';
    return `MATCH COMPLETE · ${state.winnerId === 'player1' ? 'P1' : 'P2'} WINS`;
  }
  const player = state.activePlayerId === 'player1' ? 'P1' : 'P2';
  if (state.phase === 'projectile') return `${player} · SHOT IN FLIGHT`;
  if (state.phase === 'resolving') return `${player} · IMPACT / SETTLING`;
  return `${player} · READY TO FIRE`;
};
