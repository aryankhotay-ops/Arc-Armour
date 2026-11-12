import Phaser from 'phaser';

import { CONTENT_VERSION, GAME_SUBTITLE, GAME_TITLE } from '@artillery/content';
import { PROTOCOL_VERSION } from '@artillery/protocol';
import { SIMULATION_HZ, WORLD_BOUNDS } from '@artillery/simulation';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: 'BootScene' });
  }

  public create(): void {
    this.drawBackdrop();
    this.drawTankSilhouettes();
    this.drawInterface();

    document.body.dataset.gameReady = 'true';
  }

  private drawBackdrop(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x09131f, 1);
    graphics.fillRect(0, 0, WORLD_BOUNDS.width, WORLD_BOUNDS.height);

    graphics.fillStyle(0x102638, 1);
    graphics.fillCircle(1060, 112, 190);
    graphics.fillStyle(0x16364a, 0.7);
    graphics.fillCircle(1040, 100, 120);

    graphics.fillStyle(0x1b4c52, 1);
    graphics.beginPath();
    graphics.moveTo(0, 510);
    graphics.lineTo(130, 462);
    graphics.lineTo(270, 492);
    graphics.lineTo(415, 430);
    graphics.lineTo(585, 474);
    graphics.lineTo(730, 420);
    graphics.lineTo(890, 470);
    graphics.lineTo(1045, 438);
    graphics.lineTo(1280, 500);
    graphics.lineTo(1280, 720);
    graphics.lineTo(0, 720);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0x12363c, 1);
    graphics.fillRect(0, 585, WORLD_BOUNDS.width, 135);
  }

  private drawTankSilhouettes(): void {
    this.drawTank(218, 478, 0xe8b85a, false);
    this.drawTank(1062, 466, 0xe56d5f, true);
  }

  private drawTank(x: number, y: number, color: number, facesLeft: boolean): void {
    const tank = this.add.graphics();
    const direction = facesLeft ? -1 : 1;

    tank.fillStyle(0x071017, 0.35);
    tank.fillEllipse(x, y + 37, 142, 32);

    tank.fillStyle(color, 1);
    tank.fillRoundedRect(x - 62, y, 124, 32, 12);
    tank.fillCircle(x, y - 6, 27);
    tank.lineStyle(9, color, 1);
    tank.beginPath();
    tank.moveTo(x + direction * 9, y - 20);
    tank.lineTo(x + direction * 69, y - 52);
    tank.strokePath();

    tank.fillStyle(0x0b1821, 1);
    for (let offset = -42; offset <= 42; offset += 28) {
      tank.fillCircle(x + offset, y + 30, 10);
    }
  }

  private drawInterface(): void {
    this.add
      .text(WORLD_BOUNDS.width / 2, 102, GAME_TITLE, {
        color: '#f7f3e8',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '76px',
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    this.add
      .text(WORLD_BOUNDS.width / 2, 165, GAME_SUBTITLE, {
        color: '#9fc9c4',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
      })
      .setOrigin(0.5);

    const panel = this.add.graphics();
    panel.fillStyle(0x071017, 0.84);
    panel.fillRoundedRect(330, 228, 620, 150, 18);
    panel.lineStyle(2, 0x9fc9c4, 0.22);
    panel.strokeRoundedRect(330, 228, 620, 150, 18);

    this.add
      .text(WORLD_BOUNDS.width / 2, 264, 'PROJECT FOUNDATION READY', {
        color: '#f2c96d',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const features = [
      'Phaser 3 responsive canvas',
      'Shared TypeScript workspaces',
      `${SIMULATION_HZ} Hz deterministic simulation contract`,
    ];

    this.add
      .text(WORLD_BOUNDS.width / 2, 310, features.join('   •   '), {
        align: 'center',
        color: '#d9e8df',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        wordWrap: { width: 550 },
      })
      .setOrigin(0.5);

    this.add
      .text(
        WORLD_BOUNDS.width / 2,
        666,
        `Content v${CONTENT_VERSION}  •  Protocol v${PROTOCOL_VERSION}  •  Milestone 0`,
        {
          color: '#779394',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '15px',
        },
      )
      .setOrigin(0.5);
  }
}
