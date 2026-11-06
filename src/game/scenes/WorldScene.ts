import Phaser from 'phaser';
import i18n from '../../i18n';
import { loc } from '../../rooms';
import { getDoor } from '../../rooms/doors';
import type { Presence } from '../../net/presence';
import type { Direction } from '../avatars';
import { Avatar } from '../entities/Avatar';
import { RemoteAvatars } from '../entities/RemoteAvatars';
import { bus, type Interactable } from '../events';
import { NEARBY_RADIUS } from '../../net/session';
import { LOBBY, MAPS } from '../maps';
import { getArriveAt, getMapKey, getPresence, getProfile } from '../registry';
import { containsPoint, inFrontOf, parseMapObjects, pickSpawnPoint, tiledMapSchema, type AreaSpot, type Door, type Rect } from '../tiled';

const SPEED = 160;
const ZOOM = 1.5;
// Screen pixels covered by the React top bar and status bar; the camera may scroll
// this far past the map edge so objects near the walls aren't hidden behind them.
const UI_INSET_TOP = 72;
const UI_INSET_BOTTOM = 64;
/** How long 'player:goto' waits for the peer to show up on this map (ms), e.g. after entering a room. */
const GOTO_WAIT_MS = 15_000;
/** The feet sit this far below the sprite's centre; walls are checked there. */
const FEET_OFFSET_Y = 10;

type MoveKeys = Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

interface Spot {
  rect: Rect;
  target: Interactable;
}

function keyOf(t: Interactable | null): string | null {
  if (t === null) return null;
  return t.kind === 'door' ? `door:${t.doorTo}` : t.kind === 'puzzle' ? `puzzle:${t.puzzleId}` : `clue:${t.clueId}`;
}

/** True while the user is typing in an HTML field, so movement keys don't leak into the game. */
function isTypingInUi(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

/** The walkable world: the lobby or a room, depending on the map key in the registry. */
export class WorldScene extends Phaser.Scene {
  private player!: Avatar;
  private body!: Phaser.Physics.Arcade.Body;
  private keys!: MoveKeys;
  private spots: Spot[] = [];
  private current: Interactable | null = null;
  private facing: Direction = 'down';
  private presence!: Presence;
  private remotes!: RemoteAvatars;
  private solvedMarks = new Map<string, Phaser.GameObjects.Text>();
  private areas: AreaSpot[] = [];
  private areaGraphics!: Phaser.GameObjects.Graphics;
  private currentArea: AreaSpot | undefined;
  /** Shows who can hear you in the lobby; hidden inside private areas, where the area itself lights up. */
  private ring: Phaser.GameObjects.Arc | null = null;
  private walls!: Phaser.Tilemaps.TilemapLayer;
  /** A peer to jump next to as soon as its position is known (see 'player:goto'). */
  private goto: { peerId: string; until: number } | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    const profile = getProfile(this);
    this.presence = getPresence(this);
    const mapKey = getMapKey(this);
    const { spawn, doors, puzzles, clues, areas } = parseMapObjects(tiledMapSchema.parse(MAPS[mapKey]));
    this.areas = areas;
    this.currentArea = undefined;
    this.spots = [
      ...doors.map((d) => ({ rect: d, target: { kind: 'door', doorTo: d.doorTo } as const })),
      ...puzzles.map((p) => ({ rect: p, target: { kind: 'puzzle', puzzleId: p.puzzleId } as const })),
      ...clues.map((c) => ({ rect: c, target: { kind: 'clue', clueId: c.clueId } as const })),
    ];
    this.current = null;
    this.solvedMarks.clear();

    const map = this.make.tilemap({ key: mapKey });
    const tileset = map.addTilesetImage('placeholder', 'tiles-placeholder');
    if (!tileset) throw new Error(`Tileset missing for map ${mapKey}`);
    map.createLayer('floor', tileset);
    const walls = map.createLayer('walls', tileset);
    // Without the gpu flag createLayer makes a plain TilemapLayer; the check narrows the type.
    if (!(walls instanceof Phaser.Tilemaps.TilemapLayer)) throw new Error(`Map ${mapKey} has no walls layer`);
    walls.setCollisionByProperty({ collides: true });
    this.walls = walls;
    this.goto = null;

    this.areaGraphics = this.add.graphics().setDepth(1);
    this.drawAreas();
    const offLanguage = mapKey === LOBBY ? this.addDoorSigns(doors) : () => {};

    const arriveDoor = doors.find((d) => d.doorTo === getArriveAt(this));
    const start = pickSpawnPoint(arriveDoor ? inFrontOf(arriveDoor, map.tileHeight) : spawn);
    this.player = new Avatar(this, start.x, start.y, profile.avatar, profile.nickname);
    this.physics.add.existing(this.player.sprite);
    this.body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    // Collide with the feet, not the whole sprite, so avatars can walk up close to walls.
    this.body.setSize(16, 10).setOffset(8, 21);
    this.body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player.sprite, walls);
    // Inside a room the whole team hears each other, so the ring only makes sense in the lobby.
    this.ring =
      mapKey === LOBBY
        ? this.add.circle(start.x, start.y, NEARBY_RADIUS).setFillStyle(0xffffff, 0.07).setDepth(2)
        : null;

    const cam = this.cameras.main;
    const padTop = UI_INSET_TOP / ZOOM;
    const padBottom = UI_INSET_BOTTOM / ZOOM;
    cam.setBounds(0, -padTop, map.widthInPixels, map.heightInPixels + padTop + padBottom);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.setZoom(ZOOM);
    cam.setRoundPixels(true);

    // enableCapture=false: don't swallow keys that HTML inputs (chat, editors) need.
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }, false) as MoveKeys;
    // Events rather than polling, so a quick tap between two frames isn't missed.
    // (Enter is reserved for opening the chat.)
    this.input.keyboard!.on('keydown-E', () => {
      if (this.current && !isTypingInUi()) bus.emit('interact:use', { target: this.current });
    });

    this.remotes = new RemoteAvatars(this, this.presence);
    const offSolved = bus.on('puzzles:solved', ({ ids }) => this.markSolved(ids));
    const offBubble = bus.on('chat:bubble', ({ peerId, self, text }) => (self ? this.player : this.remotes.get(peerId))?.say(text));
    const offGoto = bus.on('player:goto', ({ peerId }) => (this.goto = { peerId, until: this.time.now + GOTO_WAIT_MS }));
    const offInstructors = bus.on('instructors:changed', ({ ids, self }) => {
      this.player.setInstructor(self);
      this.remotes.setInstructors(ids);
    });
    // Leaving a place destroys the whole game, which fires DESTROY but not SHUTDOWN. Without
    // this, a destroyed scene stays subscribed and throws on the next bus event.
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      offSolved();
      offBubble();
      offGoto();
      offInstructors();
      offLanguage();
      this.remotes.destroy();
      bus.emit('interact:changed', { target: null });
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    bus.emit('scene:ready', { scene: mapKey });
  }

  update(time: number, delta: number): void {
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
    if (this.goto) this.followGoto(time);
    this.presence.updateSelf({ x: this.player.sprite.x, y: this.player.sprite.y, dir: this.facing, moving }, time);
    this.remotes.update(delta);

    this.updateTarget();
    this.updateProximityVisuals();
  }

  /** Jumps next to the peer in `goto` once it is on this map; gives up after GOTO_WAIT_MS. */
  private followGoto(time: number): void {
    const target = this.presence.get(this.goto!.peerId);
    if (!target || target.away) {
      if (time > this.goto!.until) this.goto = null;
      return;
    }
    this.goto = null;
    const step = this.walls.tilemap.tileWidth;
    const around = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
    const free = (x: number, y: number) =>
      this.physics.world.bounds.contains(x, y + FEET_OFFSET_Y) && !this.walls.getTileAtWorldXY(x, y + FEET_OFFSET_Y)?.collides;
    const spot = around.map(([dx, dy]) => ({ x: target.x + dx * step, y: target.y + dy * step })).find((p) => free(p.x, p.y)) ?? target;
    this.body.reset(spot.x, spot.y);
    this.facing = spot.y > target.y ? 'up' : spot.y < target.y ? 'down' : spot.x > target.x ? 'left' : 'right';
  }

  private updateProximityVisuals(): void {
    const feet = { x: this.body.center.x, y: this.body.bottom };
    const area = this.areas.find((a) => containsPoint(a, feet.x, feet.y));
    if (area !== this.currentArea) {
      this.currentArea = area;
      this.drawAreas();
    }
    this.ring?.setPosition(this.player.sprite.x, this.player.sprite.y).setVisible(!area);
  }

  private drawAreas(): void {
    // The map marks areas itself (e.g. a rug); here they only brighten while you are inside.
    const g = this.areaGraphics.clear();
    const a = this.currentArea;
    if (a) g.fillStyle(0xffffff, 0.07).fillRect(a.x, a.y, a.width, a.height);
  }

  /** A sign above each lobby door naming its room type; returns a function that stops following language changes. */
  private addDoorSigns(doors: readonly Door[]): () => void {
    const signs = doors.flatMap((d) => {
      const info = getDoor(d.doorTo);
      if (!info) return [];
      const text = this.add
        .text(d.x + d.width / 2, d.y - 2, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          color: '#f3f4f6',
          backgroundColor: '#1b1f2bdd',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(5);
      return [{ text, info }];
    });
    const label = () => signs.forEach(({ text, info }) => text.setText(`${info.icon} ${loc(info.title, i18n.language)}`));
    label();
    i18n.on('languageChanged', label);
    return () => i18n.off('languageChanged', label);
  }

  private updateTarget(): void {
    // Use the feet position, which is what visually stands on the spot.
    const target = this.spots.find((s) => containsPoint(s.rect, this.body.center.x, this.body.bottom))?.target ?? null;
    if (keyOf(target) !== keyOf(this.current)) {
      this.current = target;
      bus.emit('interact:changed', { target });
    }
  }

  private markSolved(ids: readonly string[]): void {
    for (const { rect, target } of this.spots) {
      if (target.kind !== 'puzzle' || !ids.includes(target.puzzleId) || this.solvedMarks.has(target.puzzleId)) continue;
      const mark = this.add
        .text(rect.x + rect.width - 2, rect.y + 2, '✓', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#6ee7b7', stroke: '#10231c', strokeThickness: 3 })
        .setOrigin(1, 0)
        .setResolution(2)
        .setDepth(20000);
      this.solvedMarks.set(target.puzzleId, mark);
    }
  }
}
