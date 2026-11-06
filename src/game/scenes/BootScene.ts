import Phaser from 'phaser';
import tilesetUrl from '../../../content/tilesets/tiles.png';
import { MAPS } from '../maps';
import { AVATAR_PARTS_URL } from '../avatars';
import { AVATAR_PARTS_KEY } from '../entities/Avatar';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('tiles', tilesetUrl);
    this.load.image(AVATAR_PARTS_KEY, AVATAR_PARTS_URL);
    for (const [key, map] of Object.entries(MAPS)) this.load.tilemapTiledJSON(key, map as object);
  }

  create(): void {
    this.scene.start('World');
  }
}
