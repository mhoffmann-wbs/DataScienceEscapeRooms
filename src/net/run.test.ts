import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { emptyRun, mergeRun, RunSync, runStateSchema, type RunState } from './run';

const a: RunState = { epoch: 0, startedAt: 100, solved: { p1: 150 }, hints: { 'p1#0': 120 }, unlocked: { p2: 130 }, attempts: { 'p1|ada': 2 }, players: { Ada: 100 }, endedAt: null };
const b: RunState = { epoch: 0, startedAt: 90, solved: { p1: 160, p2: 200 }, hints: {}, unlocked: { p2: 125 }, attempts: { 'p1|ada': 1, 'p1|bob': 3 }, players: { Ada: 95, Bob: 90 }, endedAt: 300 };
const c: RunState = { epoch: 0, startedAt: null, solved: {}, hints: { 'p2#1': 210, 'p1#0': 110 }, unlocked: {}, attempts: {}, players: {}, endedAt: 250 };
const reset: RunState = { epoch: 500, startedAt: 500, solved: {}, hints: {}, unlocked: {}, attempts: {}, players: {}, endedAt: null };

describe('mergeRun', () => {
  it('keeps the earliest timestamp per key', () => {
    expect(mergeRun(a, b)).toEqual({ epoch: 0, startedAt: 90, solved: { p1: 150, p2: 200 }, hints: { 'p1#0': 120 }, unlocked: { p2: 125 }, attempts: { 'p1|ada': 2, 'p1|bob': 3 }, players: { Ada: 95, Bob: 90 }, endedAt: 300 });
  });

  it('is commutative, associative and idempotent, also across epochs', () => {
    for (const [x, y, z] of [
      [a, b, c],
      [a, reset, b],
      [reset, c, a],
    ] as const) {
      expect(mergeRun(x, y)).toEqual(mergeRun(y, x));
      expect(mergeRun(mergeRun(x, y), z)).toEqual(mergeRun(x, mergeRun(y, z)));
      expect(mergeRun(x, x)).toEqual(x);
    }
  });

  it('lets a newer epoch (an instructor reset) replace older progress', () => {
    expect(mergeRun(mergeRun(a, b), reset)).toEqual(reset);
  });

  it('still loads states saved before epochs and attempts existed', () => {
    expect(runStateSchema.parse({ ...emptyRun(1), solved: {} })).toEqual({ epoch: 0, startedAt: 1, solved: {}, hints: {}, unlocked: {}, attempts: {}, players: {}, endedAt: null });
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

  it('shares opened code locks with the team', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada');
    const bob = join(hub, 'bob');
    bob.unlock('p3');
    expect(ada.state.unlocked).toEqual({ p3: 2000 });
  });

  it('catches up a player who rejoins with a stale saved state', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada');
    ada.markSolved('p1');
    ada.markSolved('p2');
    // Bob refreshed the page; his saved copy only knows p1, with a later time.
    const bob = join(hub, 'bob', { ...emptyRun(1000), solved: { p1: 2500 } }, 3000);
    expect(bob.state.solved).toEqual({ p1: 2000, p2: 2000 });
  });

  it('merges progress made while the team was split', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada', { ...emptyRun(1000), solved: { p1: 1500 } });
    const bob = join(hub, 'bob', { ...emptyRun(1000), solved: { p2: 1600 } });
    expect(ada.state.solved).toEqual({ p1: 1500, p2: 1600 });
    expect(bob.state.solved).toEqual({ p1: 1500, p2: 1600 });
  });
});

describe('RunSync attempts and resets', () => {
  const join = (hub: MemoryHub, id: string, t = { now: 2000 }) => new RunSync(createMemoryTransport(hub, id).join('room:x:t1'), emptyRun(1000), () => t.now);

  it('counts each player\'s failed checks and shares them', () => {
    const hub = new MemoryHub();
    const ada = join(hub, 'ada');
    const bob = join(hub, 'bob');
    ada.recordAttempt('p1');
    ada.recordAttempt('p1');
    bob.recordAttempt('p1');
    expect(bob.state.attempts).toEqual({ 'p1|ada': 2, 'p1|bob': 1 });
  });

  it('a reset clears progress for the whole team, and a late joiner with old progress adopts it', () => {
    const hub = new MemoryHub();
    const t = { now: 2000 };
    const ada = join(hub, 'ada', t);
    const bob = join(hub, 'bob', t);
    ada.markSolved('p1');
    ada.recordAttempt('p2');
    t.now = 5000;
    bob.reset(5000);
    expect(ada.state).toEqual({ epoch: 5000, startedAt: 5000, solved: {}, hints: {}, unlocked: {}, attempts: {}, players: {}, endedAt: null });
    bob.reset(4000); // an older reset is ignored
    expect(bob.state.epoch).toBe(5000);
    const cara = new RunSync(createMemoryTransport(hub, 'cara').join('room:x:t1'), { ...emptyRun(1000), solved: { p1: 1500 } }, () => t.now);
    expect(cara.state.solved).toEqual({});
  });

  it('ending the run reaches the whole team, also a member who comes back later', () => {
    const hub = new MemoryHub();
    const t = { now: 2000 };
    const ada = join(hub, 'ada', t);
    const bob = join(hub, 'bob', t);
    t.now = 3000;
    ada.end();
    expect(bob.state.endedAt).toBe(3000);
    const cara = new RunSync(createMemoryTransport(hub, 'cara').join('room:x:t1'), emptyRun(1000), () => t.now);
    expect(cara.state.endedAt).toBe(3000);
  });

  it('remembers everyone who joined, with the earliest time, also after they leave', () => {
    const hub = new MemoryHub();
    const t = { now: 2000 };
    const ada = join(hub, 'ada', t);
    ada.join('Ada');
    t.now = 3000;
    const bob = join(hub, 'bob', t);
    bob.join('Bob');
    bob.join('Bob');
    bob.destroy();
    t.now = 4000;
    ada.join('Ada');
    expect(ada.state.players).toEqual({ Ada: 2000, Bob: 3000 });
  });
});
