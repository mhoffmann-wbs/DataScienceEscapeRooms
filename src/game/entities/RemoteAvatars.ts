import type Phaser from 'phaser';
import type { PeerInfo, Presence } from '../../net/presence';
import { Avatar } from './Avatar';

/** Distance (px) beyond which a remote avatar teleports instead of gliding. */
const SNAP_DISTANCE = 256;
/** Smoothing time constant (ms): higher is smoother but lags more. */
const SMOOTHING_MS = 70;

interface Remote {
  avatar: Avatar;
  peer: PeerInfo;
}

/** Renders the peers of a Presence and glides them toward their last reported position. */
export class RemoteAvatars {
  private readonly remotes = new Map<string, Remote>();
  private instructors = new Set<string>();
  private readonly offs: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    presence: Presence,
  ) {
    presence.list().forEach((p) => this.add(p));
    this.offs = [
      presence.events.on('peer:join', (p) => this.add(p)),
      presence.events.on('peer:update', (p) => {
        const remote = this.remotes.get(p.id);
        if (p.away) this.remove(p.id);
        else if (remote) remote.peer = p;
        else this.add(p);
      }),
      presence.events.on('peer:leave', (p) => this.remove(p.id)),
    ];
  }

  update(deltaMs: number): void {
    const t = 1 - Math.exp(-deltaMs / SMOOTHING_MS);
    for (const { avatar, peer } of this.remotes.values()) {
      const s = avatar.sprite;
      const dx = peer.x - s.x;
      const dy = peer.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SNAP_DISTANCE) s.setPosition(peer.x, peer.y);
      else s.setPosition(s.x + dx * t, s.y + dy * t);
      avatar.setMotion(peer.dir, peer.moving || dist > 2);
      avatar.syncLabel();
    }
  }

  /** Labels these peers as instructors (and no others). */
  setInstructors(ids: readonly string[]): void {
    this.instructors = new Set(ids);
    for (const [id, { avatar }] of this.remotes) avatar.setInstructor(this.instructors.has(id));
  }

  /** The avatar of a peer, if it is on the map. */
  get(peerId: string): Avatar | undefined {
    return this.remotes.get(peerId)?.avatar;
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.remotes.forEach((r) => r.avatar.destroy());
    this.remotes.clear();
  }

  private remove(peerId: string): void {
    this.remotes.get(peerId)?.avatar.destroy();
    this.remotes.delete(peerId);
  }

  /** Players away in a room stay connected but aren't drawn on the map. */
  private add(peer: PeerInfo): void {
    if (this.remotes.has(peer.id) || peer.away) return;
    const avatar = new Avatar(this.scene, peer.x, peer.y, peer.look, peer.nickname);
    avatar.setInstructor(this.instructors.has(peer.id));
    this.remotes.set(peer.id, { avatar, peer });
  }
}
