import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { emptyRun, mergeRun, RunSync, runStateSchema, type RunState } from './run';

const a: RunState = { startedAt: 100, solved: { p1: 150 }, hints: { 'p1#0': 120 } };
const b: RunState = { startedAt: 90, solved: { p1: 160, p2: 200 }, hints: {} };
const c: RunState = { startedAt: null, solved: {}, hints: { 'p2#1': 210, 'p1#0': 110 } };

describe('mergeRun', () => {
  it('keeps the earliest timestamp per key', () => {
    expect(mergeRun(a, b)).toEqual({ startedAt: 90, solved: { p1: 150, p2: 200 }, hints: { 'p1#0': 120 } });
  });

  it('is commutative, associative and idempotent', () => {
    expect(mergeRun(a, b)).toEqual(mergeRun(b, a));
    expect(mergeRun(mergeRun(a, b), c)).toEqual(mergeRun(a, mergeRun(b, c)));
    expect(mergeRun(a, a)).toEqual(a);
  });

  it('rejects oversized or malformed states', () => {
    const solved = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`p${i}`, i]));
    expect(runStateSchema.safeParse({ ...emptyRun(), solved }).success).toBe(false);
    expect(runStateSchema.safeParse({ startedAt: 'now', solved: {}, hints: {} }).success).toBe(false);
  });
});

describe('RunSync', () => {
  const join = (hub: MemoryHub, id: string, initial = emptyRun(1000), t = 2000) =>
    new RunSync(createMemoryTransport(hub, id).join('room:x:t1'), initial, () => t);

  it('shares solved puzzles and hints with the team', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada');
    const bob = join(hub, 'bob');
    ada.markSolved('p1');
    bob.revealHint('p2', 0);
    expect(ada.state).toEqual(bob.state);
    expect(ada.state.solved).toEqual({ p1: 2000 });
    expect(ada.state.hints).toEqual({ 'p2#0': 2000 });
  });

  it('catches up a player who rejoins with a stale saved state', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada');
    ada.markSolved('p1');
    ada.markSolved('p2');
    // Bob refreshed the page; his saved copy only knows p1, with a later time.
    const bob = join(hub, 'bob', { startedAt: 1000, solved: { p1: 2500 }, hints: {} }, 3000);
    expect(bob.state.solved).toEqual({ p1: 2000, p2: 2000 });
  });

  it('merges progress made while the team was split', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada', { startedAt: 1000, solved: { p1: 1500 }, hints: {} });
    const bob = join(hub, 'bob', { startedAt: 1000, solved: { p2: 1600 }, hints: {} });
    expect(ada.state.solved).toEqual({ p1: 1500, p2: 1600 });
    expect(bob.state.solved).toEqual({ p1: 1500, p2: 1600 });
  });
});
