import type Phaser from 'phaser';

// One-shot keyboard actions (fire, select, draft picks) must run exactly once per physical
// key press. Phaser re-processes its whole per-frame keyboard queue each time a new key event
// arrives within the same frame, and its duplicate check only compares against the most recent
// event. A fast "keydown, keyup, keydown" within one frame can therefore deliver the first
// keydown to handlers twice. This helper ignores re-deliveries of the same KeyboardEvent
// object and auto-repeat events from a held key.

const handled = new WeakSet<KeyboardEvent>();

export const onKeyPress = (
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
  keyName: string,
  action: () => void,
): void => {
  keyboard.on(`keydown-${keyName}`, (event: KeyboardEvent) => {
    if (event.repeat || handled.has(event)) return;
    handled.add(event);
    action();
  });
};
