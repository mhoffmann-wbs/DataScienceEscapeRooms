import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HelpDesk, VISIT_TIMEOUT_MS } from './help';
import { createInstructorConfig, InstructorChannel, unlockInstructor, type InstructorConfig } from './instructor';
import { instructorMessageSchema } from './instructorCrypto';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { emptyRun } from './run';
import type { RunInfo } from './session';

let config: InstructorConfig;
let key: CryptoKey;

beforeAll(async () => {
  config = await createInstructorConfig('correct horse battery', 100_000);
  key = (await unlockInstructor(config, 'correct horse battery'))!;
});

afterEach(() => vi.useRealTimers());

const settle = () => new Promise((r) => setTimeout(r, 30));

const run = (teamId: string, password?: string): RunInfo => ({ roomId: 'python-quarantine', teamId, password, leader: 'Ada', group: 'DS-1', state: emptyRun(1) });

function setup() {
  const hub = new MemoryHub();
  const make = (id: string) => {
    const room = createMemoryTransport(hub, id).join('lobby');
    const desk = new HelpDesk(room, new InstructorChannel(room, config));
    return { room, desk, calls: () => desk.list() };
  };
  return { make };
}

describe('calling the instructor', () => {
  it('lists one call per team, also for an instructor who arrives later, until cancelled', async () => {
    const { make } = setup();
    const ada = make('ada');
    const bo = make('bo');
    ada.desk.setPlaying(run('t1'));
    bo.desk.setPlaying(run('t1'));
    ada.desk.call();
    await settle();
    bo.desk.call();
    const teacher = make('teacher');
    await settle();
    expect(teacher.calls().map((c) => c.teamId)).toEqual(['t1']);
    ada.desk.cancel();
    await settle();
    expect(teacher.calls()).toHaveLength(1);
    bo.room.leave();
    await settle();
    expect(teacher.calls()).toEqual([]);
  });

  it('drops a call when the player leaves the room', async () => {
    const { make } = setup();
    const ada = make('ada');
    const teacher = make('teacher');
    ada.desk.setPlaying(run('t1'));
    ada.desk.call();
    await settle();
    expect(teacher.calls()).toHaveLength(1);
    ada.desk.setPlaying(null);
    await settle();
    expect(teacher.calls()).toEqual([]);
    expect(ada.desk.calling()).toBe(false);
  });
});

describe('instructor visits', () => {
  it('gets an invite with the password, sent only to the instructor, and answers the call', async () => {
    const { make } = setup();
    const ada = make('ada');
    const eve = make('eve');
    const teacher = make('teacher');
    ada.desk.setPlaying(run('t1', 'secret'));
    ada.desk.call();
    const sniffed: unknown[] = [];
    eve.room.channel('help').subscribe((d) => sniffed.push(d));
    await settle();

    const invite = await teacher.desk.visit(key, 't1');
    expect(invite).toMatchObject({ teamId: 't1', roomId: 'python-quarantine', password: 'secret', leader: 'Ada', group: 'DS-1' });
    expect(JSON.stringify(sniffed)).not.toContain('secret');
    await settle();
    expect(teacher.calls()).toEqual([]);
    expect(ada.desk.calling()).toBe(false);
    expect(ada.desk.isVisitor('teacher')).toBe(true);
    expect(ada.desk.isVisitor('eve')).toBe(false);
  });

  it('ignores unsigned visit requests', async () => {
    const { make } = setup();
    const ada = make('ada');
    const eve = make('eve');
    ada.desk.setPlaying(run('t1', 'secret'));
    const got: unknown[] = [];
    eve.room.channel('help').subscribe((d) => got.push(d));
    const at = Date.now();
    eve.room.channel('instructor').send({ payload: JSON.stringify({ type: 'visit', teamId: 't1', peerId: 'eve', at, nonce: 'abcdefghij' }), signature: 'AAAA' });
    await settle();
    expect(got).toEqual([]);
  });

  it('gives up when nobody from the team answers', async () => {
    const { make } = setup();
    const teacher = make('teacher');
    vi.useFakeTimers();
    const invite = teacher.desk.visit(key, 'gone');
    await vi.advanceTimersByTimeAsync(VISIT_TIMEOUT_MS);
    expect(await invite).toBeNull();
  });
});

describe('team messages', () => {
  it('announcements without a team target go to everyone', () => {
    const base = { type: 'announce', text: 'hi', group: null, at: 1, nonce: 'abcdefghij' };
    expect(instructorMessageSchema.parse(base)).toMatchObject({ teamId: null });
    expect(instructorMessageSchema.parse({ ...base, teamId: 't1' })).toMatchObject({ teamId: 't1' });
  });
});
