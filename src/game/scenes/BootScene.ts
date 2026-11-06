import Phaser from 'phaser';
import tilesetUrl from '../../../content/tilesets/tiles.png';
import { MAPS } from '../maps';
import { AVATAR_COUNT, AVATAR_FRAME_SIZE, AVATAR_SHEET_URL, DIRECTIONS, WALK_FRAMES, frameIndex, walkAnimKey } from '../avatars';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('tiles', tilesetUrl);
    this.load.spritesheet('avatars', AVATAR_SHEET_URL, { frameWidth: AVATAR_FRAME_SIZE, frameHeight: AVATAR_FRAME_SIZE });
    for (const [key, map] of Object.entries(MAPS)) this.load.tilemapTiledJSON(key, map as object);
  }

  create(): void {
    for (let a = 0; a < AVATAR_COUNT; a++) {
      for (const dir of DIRECTIONS) {
        this.anims.create({
          key: walkAnimKey(a, dir),
          frames: this.anims.generateFrameNumbers('avatars', { frames: WALK_FRAMES.map((f) => frameIndex(a, dir, f)) }),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
    this.scene.start('World');
  }
}
