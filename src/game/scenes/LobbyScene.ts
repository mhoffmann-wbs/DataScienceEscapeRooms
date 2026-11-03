import Phaser from 'phaser';
import { bus } from '../events';

// Placeholder until the Tiled lobby map and avatar movement land (step 2).
export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, 64, 64, 0x6ee7b7);
    bus.emit('scene:ready', { scene: 'Lobby' });
  }
}
