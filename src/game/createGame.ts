import Phaser from 'phaser';
import { setGameContext, type GameContext } from './registry';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

export function createGame(parent: HTMLElement, ctx: GameContext): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1d2230',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, WorldScene],
  });
  setGameContext(game, ctx);
  return game;
}
