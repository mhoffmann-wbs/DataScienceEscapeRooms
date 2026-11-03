import Phaser from 'phaser';
import type { Profile } from '../player/profile';
import { setProfile } from './registry';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';

export function createGame(parent: HTMLElement, profile: Profile): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1d2230',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, LobbyScene],
  });
  setProfile(game, profile);
  return game;
}
