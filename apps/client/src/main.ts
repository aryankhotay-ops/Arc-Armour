import Phaser from 'phaser';

import { VIEW_BOUNDS } from './rendering/BattlefieldLayout';

import { BattlefieldScene } from './scenes/BattlefieldScene';
import { DraftScene } from './scenes/DraftScene';
import { MenuScene } from './scenes/MenuScene';
import './styles.css';

// The main menu is the default. Keep explicit deep links for tests and practice sessions.
const draft = new URLSearchParams(window.location.search).get('draft');

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: 'app',
  width: VIEW_BOUNDS.width,
  height: VIEW_BOUNDS.height,
  backgroundColor: '#09131f',
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_BOUNDS.width,
    height: VIEW_BOUNDS.height,
    expandParent: true,
  },
  // The first scene in the list starts automatically.
  scene:
    draft === 'off'
      ? [BattlefieldScene, DraftScene, MenuScene]
      : draft === 'on'
        ? [DraftScene, BattlefieldScene, MenuScene]
        : [MenuScene, DraftScene, BattlefieldScene],
};

// Phaser owns the render loop. Authoritative gameplay lives in @artillery/simulation.
new Phaser.Game(gameConfig);
