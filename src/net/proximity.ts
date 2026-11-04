// Who counts as "near" for nearby chat and voice/video. One rule for both:
// inside a private area (a Tiled `area` object), near means "in the same area",
// whatever the distance; outside every area it means within a radius.

export interface Point {
  x: number;
  y: number;
}

export interface Area {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Peers already near stay near until this factor times the radius, so links don't flap at the edge. */
export const LEAVE_FACTOR = 1.25;

export class Proximity {
  constructor(
    readonly radius: number,
    readonly areas: readonly Area[] = [],
  ) {}

  /** The private area containing `p`, if any. */
  areaAt(p: Point): Area | undefined {
    return this.areas.find((a) => p.x >= a.x && p.x < a.x + a.width && p.y >= a.y && p.y < a.y + a.height);
  }

  /** Symmetric. `wasNear` applies the wider leave radius (hysteresis); areas have hard edges. */
  near(a: Point, b: Point, wasNear = false): boolean {
    const areaA = this.areaAt(a);
    const areaB = this.areaAt(b);
    if (areaA || areaB) return areaA === areaB;
    const r = wasNear ? this.radius * LEAVE_FACTOR : this.radius;
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;
  }
}
