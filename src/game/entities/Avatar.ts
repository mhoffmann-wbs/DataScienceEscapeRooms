import Phaser from 'phaser';
import { frameIndex, walkAnimKey, type Direction } from '../avatars';

/** A character sprite with a name label. Used for the local player and, later, remote peers. */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private facing: Direction = 'down';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly avatar: number,
    name: string,
  ) {
    this.sprite = scene.add.sprite(x, y, 'avatars', frameIndex(avatar, 'down'));
    this.label = scene.add
      .text(x, y, name, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.syncLabel();
  }

  /** Plays the walk animation, or shows the idle frame when `moving` is false. */
  setMotion(dir: Direction, moving: boolean): void {
    this.facing = dir;
    if (moving) this.sprite.anims.play(walkAnimKey(this.avatar, dir), true);
    else {
      this.sprite.anims.stop();
      this.sprite.setFrame(frameIndex(this.avatar, this.facing));
    }
  }

  syncLabel(): void {
    this.sprite.setDepth(this.sprite.y);
    this.label.setPosition(this.sprite.x, this.sprite.y - 16).setDepth(this.sprite.y + 10000);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
