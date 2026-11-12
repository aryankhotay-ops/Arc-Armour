import { PROTOCOL_VERSION } from '@artillery/protocol';
import { describe, expect, it } from 'vitest';

import type { OnlineClient } from './OnlineClient';
import { OnlineMirrorEngine } from './OnlineMirrorEngine';

type Intent = Parameters<OnlineClient['sendIntent']>[0];

/** Captures intents instead of opening a socket; nothing else on the client is touched. */
const fakeClient = (): { client: OnlineClient; sent: Intent[] } => {
  const sent: Intent[] = [];
  const client = {
    sendIntent: (command: Intent) => {
      sent.push(command);
    },
  } as unknown as OnlineClient;
  return { client, sent };
};

describe('OnlineMirrorEngine aim intents', () => {
  it('never mutates the mirror from local aim input until the server echoes it', () => {
    const { client, sent } = fakeClient();
    const mirror = new OnlineMirrorEngine(client, 'player1', 7);
    const before = { ...mirror.activeTank.aim };

    mirror.setAim(60, 0.9);
    expect(mirror.activeTank.aim).toEqual(before);
    expect(sent).toHaveLength(0); // throttled until the scene flushes

    mirror.flushIntents(1_000);
    expect(sent).toEqual([{ type: 'aim', angleDegrees: 60, power: 0.9 }]);
    expect(mirror.activeTank.aim).toEqual(before);

    mirror.applyServerCommand({
      v: PROTOCOL_VERSION,
      type: 'command-applied',
      index: 0,
      slot: 'player1',
      command: { type: 'aim', angleDegrees: 60, power: 0.9 },
    });
    expect(mirror.activeTank.aim).toEqual({ angleDegrees: 60, power: 0.9 });
  });

  it('exposes the pending intent as intendedAim so single-axis edits compose', () => {
    const { client, sent } = fakeClient();
    const mirror = new OnlineMirrorEngine(client, 'player1', 7);
    const confirmed = mirror.activeTank.aim;

    // Angle slider moves first; the server has not echoed anything yet.
    mirror.setAim(52, confirmed.power);
    expect(mirror.intendedAim).toEqual({ angleDegrees: 52, power: confirmed.power });

    // Power slider then reads intendedAim (as the HUD does) and keeps the new angle.
    mirror.setAim(mirror.intendedAim.angleDegrees, 1);
    expect(mirror.intendedAim).toEqual({ angleDegrees: 52, power: 1 });

    // Firing flushes the composed intent, not a stale angle.
    mirror.fire();
    expect(sent).toEqual([
      { type: 'aim', angleDegrees: 52, power: 1 },
      { type: 'fire', turn: 1 },
    ]);
  });

  it('adjustAim steps from the intended aim, so held keys accumulate before confirmation', () => {
    const { client } = fakeClient();
    const mirror = new OnlineMirrorEngine(client, 'player1', 7);
    const start = mirror.activeTank.aim.angleDegrees;

    mirror.adjustAim(1, 0);
    mirror.adjustAim(1, 0);
    mirror.adjustAim(1, 0);
    expect(mirror.intendedAim.angleDegrees).toBe(start + 3);
  });

  it('ignores local aim input when it is not the local player turn', () => {
    const { client, sent } = fakeClient();
    const mirror = new OnlineMirrorEngine(client, 'player2', 7);
    mirror.setAim(70, 1);
    mirror.flushIntents(1_000, true);
    expect(sent).toHaveLength(0);
    expect(mirror.intendedAim).toEqual(mirror.activeTank.aim);
  });
});
