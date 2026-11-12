import type Phaser from 'phaser';
import { COLOR, css, drawPanel, lighten, textStyle } from './theme';

// A code-drawn bevelled button with a real hit rectangle, hover and press feedback. Text has
// no opaque background so the rounded frame stays visible. Call setButtonEnabled to sync both.
const frames = new WeakMap<Phaser.GameObjects.Text, Phaser.GameObjects.Graphics>();
export const arcadeButton = (scene: Phaser.Scene, x: number, y: number, label: string,
  width: number, height: number, color: number = COLOR.control, size = 14, depth = 62): Phaser.GameObjects.Text => {
  const frame = scene.add.graphics().setDepth(depth - 1);
  const draw = (hover = false, press = false): void => {
    frame.clear();
    drawPanel(frame, x - width / 2, y - height / 2 + (press ? 2 : 0), width, height,
      { radius: 9, fill: hover ? lighten(color, .15) : color, rim: lighten(color, .38), rimWidth: 2 });
    frame.fillStyle(0x000000, .15);
    frame.fillRoundedRect(x - width / 2 + 3, y + height / 2 - 9, width - 6, 6, 3);
  };
  draw();
  const button = scene.add.text(x, y, label, { ...textStyle(size, COLOR.text, { font: 'display', align: 'center' }),
    fixedWidth: width, fixedHeight: height, padding: { top: (height - size) / 2 - 2 } })
    .setOrigin(.5).setDepth(depth).setInteractive({ useHandCursor: true });
  button.on('pointerover', () => draw(true));
  button.on('pointerout', () => draw());
  button.on('pointerdown', () => draw(true, true));
  button.on('pointerup', () => draw(true));
  frames.set(button, frame);
  return button;
};

export const setButtonEnabled = (button: Phaser.GameObjects.Text, enabled: boolean): void => {
  button.setAlpha(enabled ? 1 : .45);
  frames.get(button)?.setAlpha(enabled ? 1 : .45);
  if (enabled) button.setInteractive({ useHandCursor: true }); else button.disableInteractive();
};

export const setButtonLabel = (button: Phaser.GameObjects.Text, label: string, color: number = COLOR.text): void => {
  button.setText(label).setColor(css(color));
};
