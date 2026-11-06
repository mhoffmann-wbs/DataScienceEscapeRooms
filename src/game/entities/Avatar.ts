import Phaser from 'phaser';
import { AVATAR_FRAME_SIZE, AVATAR_SHEET_COLUMNS, DIRECTIONS, WALK_FRAMES, frameIndex, lookKey, renderLook, walkAnimKey, type Direction, type Look } from '../avatars';

/** How long a speech bubble stays, plus a little per character so longer messages can be read. */
const BUBBLE_MS = 4000;
const BUBBLE_MS_PER_CHAR = 40;
const BUBBLE_MAX_CHARS = 80;
/** Marks instructors' names; nobody else may show it, so it's removed from nicknames. */
export const INSTRUCTOR_MARK = '🎓';
/** Texture key of the avatar parts sheet, loaded by the Boot scene. */
export const AVATAR_PARTS_KEY = 'avatar-parts';

/** The texture of a look, with its walk animations; made from the parts sheet the first time it is needed. */
function lookTexture(scene: Phaser.Scene, look: Look): string {
  const key = `avatar-${lookKey(look)}`;
  if (scene.textures.exists(key)) return key;
  const parts = scene.textures.get(AVATAR_PARTS_KEY).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.addCanvas(key, renderLook(parts, look))!;
  for (let i = 0; i < AVATAR_SHEET_COLUMNS; i++) texture.add(i, 0, i * AVATAR_FRAME_SIZE, 0, AVATAR_FRAME_SIZE, AVATAR_FRAME_SIZE);
  for (const dir of DIRECTIONS) {
    if (scene.anims.exists(walkAnimKey(key, dir))) continue;
    scene.anims.create({ key: walkAnimKey(key, dir), frames: WALK_FRAMES.map((f) => ({ key, frame: frameIndex(dir, f) })), frameRate: 8, repeat: -1 });
  }
  return key;
}

/** A character sprite with a name label and an optional speech bubble. Used for the local player and remote peers. */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  private facing: Direction = 'down';
  private readonly name: string;
  private instructor = false;
  private readonly texture: string;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    look: Look,
    name: string,
  ) {
    this.name = name.replaceAll(INSTRUCTOR_MARK, '').trim();
    this.texture = lookTexture(scene, look);
    this.sprite = scene.add.sprite(x, y, this.texture, frameIndex('down'));
    this.label = scene.add
      .text(x, y, this.name, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.syncLabel();
  }

  /** Plays the walk animation, or shows the idle frame when `moving` is false. */
  setMotion(dir: Direction, moving: boolean): void {
    this.facing = dir;
    if (moving) this.sprite.anims.play(walkAnimKey(this.texture, dir), true);
    else {
      this.sprite.anims.stop();
      this.sprite.setFrame(frameIndex(this.facing));
    }
  }

  /** Labels the avatar as an instructor's. */
  setInstructor(on: boolean): void {
    if (on === this.instructor) return;
    this.instructor = on;
    this.label.setText(on ? `${INSTRUCTOR_MARK} ${this.name}` : this.name);
  }

  /** Shows `text` above the head for a few seconds, replacing any current bubble. */
  say(text: string): void {
    this.clearBubble();
    const shown = text.length > BUBBLE_MAX_CHARS ? `${text.slice(0, BUBBLE_MAX_CHARS - 1)}…` : text;
    this.bubble = this.scene.add
      .text(0, 0, shown, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#111827',
        backgroundColor: '#f8fafc',
        padding: { x: 5, y: 3 },
        wordWrap: { width: 140 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.bubbleTimer = this.scene.time.delayedCall(BUBBLE_MS + shown.length * BUBBLE_MS_PER_CHAR, () => this.clearBubble());
    this.syncLabel();
  }

  syncLabel(): void {
    this.sprite.setDepth(this.sprite.y);
    this.label.setPosition(this.sprite.x, this.sprite.y - 16).setDepth(this.sprite.y + 10000);
    this.bubble?.setPosition(this.sprite.x, this.label.y - this.label.height - 3).setDepth(this.sprite.y + 15000);
  }

  destroy(): void {
    this.clearBubble();
    this.sprite.destroy();
    this.label.destroy();
  }

  private clearBubble(): void {
    this.bubbleTimer?.remove();
    this.bubbleTimer = null;
    this.bubble?.destroy();
    this.bubble = null;
  }
}
