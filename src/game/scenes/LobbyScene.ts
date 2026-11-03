import Phaser from 'phaser';
import lobbyJson from '../../../content/lobby/map.json';
import type { Direction } from '../avatars';
import { Avatar } from '../entities/Avatar';
import { bus } from '../events';
import { getProfile } from '../registry';
import { containsPoint, parseMapObjects, tiledMapSchema, type Door } from '../tiled';

const SPEED = 160;
const ZOOM = 1.5;
// Screen pixels covered by the React top bar and status bar; the camera may scroll
// this far past the map edge so doors near the walls aren't hidden behind them.
const UI_INSET_TOP = 72;
const UI_INSET_BOTTOM = 64;

type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

/** True while the user is typing in an HTML field, so movement keys don't leak into the game. */
function isTypingInUi(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

export class LobbyScene extends Phaser.Scene {
  private player!: Avatar;
  private body!: Phaser.Physics.Arcade.Body;
  private keys!: MoveKeys;
  private doors: Door[] = [];
  private currentDoor: string | null = null;
  private facing: Direction = 'down';

  constructor() {
    super('Lobby');
  }

  create(): void {
    const profile = getProfile(this);
    const parsed = tiledMapSchema.parse(lobbyJson);
    const { spawn, doors } = parseMapObjects(parsed);
    this.doors = doors;
    this.currentDoor = null;

    const map = this.make.tilemap({ key: 'lobby' });
    const tileset = map.addTilesetImage('placeholder', 'tiles-placeholder');
    if (!tileset) throw new Error('Lobby tileset missing');
    map.createLayer('floor', tileset);
    const walls = map.createLayer('walls', tileset);
    if (!walls) throw new Error('Lobby map has no walls layer');
    walls.setCollisionByProperty({ collides: true });

    this.player = new Avatar(this, spawn.x, spawn.y, profile.avatar, profile.nickname);
    this.physics.add.existing(this.player.sprite);
    this.body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    // Collide with the feet, not the whole sprite, so avatars can walk up close to walls.
    this.body.setSize(16, 10).setOffset(8, 21);
    this.body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player.sprite, walls);

    const cam = this.cameras.main;
    const padTop = UI_INSET_TOP / ZOOM;
    const padBottom = UI_INSET_BOTTOM / ZOOM;
    cam.setBounds(0, -padTop, map.widthInPixels, map.heightInPixels + padTop + padBottom);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.setZoom(ZOOM);
    cam.setRoundPixels(true);

    // enableCapture=false: don't swallow keys that HTML inputs (chat, join form) need.
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys(
      { up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D },
      false,
    ) as MoveKeys;
    // Events rather than polling, so a quick tap between two frames isn't missed.
    const interact = () => {
      if (this.currentDoor && !isTypingInUi()) bus.emit('door:interact', { roomId: this.currentDoor });
    };
    this.input.keyboard!.on('keydown-E', interact);
    this.input.keyboard!.on('keydown-ENTER', interact);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bus.emit('door:changed', { roomId: null }));
    bus.emit('scene:ready', { scene: 'Lobby' });
  }

  update(): void {
    const typing = isTypingInUi();
    const k = this.keys;
    const dx = typing ? 0 : Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const dy = typing ? 0 : Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);

    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(SPEED);
    this.body.setVelocity(v.x, v.y);

    const moving = dx !== 0 || dy !== 0;
    if (moving) this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.player.setMotion(this.facing, moving);
    this.player.syncLabel();

    this.updateDoor();
  }

  private updateDoor(): void {
    // Use the feet position, which is what visually stands on the door.
    const feetY = this.body.bottom;
    const door = this.doors.find((d) => containsPoint(d, this.body.center.x, feetY))?.roomId ?? null;
    if (door !== this.currentDoor) {
      this.currentDoor = door;
      bus.emit('door:changed', { roomId: door });
    }
  }
}
