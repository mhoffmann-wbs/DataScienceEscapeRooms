import Phaser from 'phaser';
import lobbyMap from '../../../content/lobby/map.json';
import tilesetUrl from '../../../content/tilesets/placeholder.png';
import { AVATAR_COUNT, AVATAR_FRAME_SIZE, AVATAR_SHEET_URL, DIRECTIONS, frameIndex, walkAnimKey } from '../avatars';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('tiles-placeholder', tilesetUrl);
    this.load.spritesheet('avatars', AVATAR_SHEET_URL, { frameWidth: AVATAR_FRAME_SIZE, frameHeight: AVATAR_FRAME_SIZE });
    this.load.tilemapTiledJSON('lobby', lobbyMap);
  }

  create(): void {
    for (let a = 0; a < AVATAR_COUNT; a++) {
      for (const dir of DIRECTIONS) {
        this.anims.create({
          key: walkAnimKey(a, dir),
          frames: this.anims.generateFrameNumbers('avatars', { frames: [frameIndex(a, dir, 0), frameIndex(a, dir, 1)] }),
          frameRate: 6,
          repeat: -1,
        });
      }
    }
    this.scene.start('Lobby');
  }
}
