import { beforeEach, describe, expect, it } from 'vitest';
import { createInstructorConfig, InstructorChannel, unlockInstructor } from './instructor';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { Runs, type RunSummary } from './runs';
import { Scores } from './scores';

const NOW = 10_000_000_000;
const finished = (teamId: string, minutes: number, extra: Partial<RunSummary> = {}): RunSummary => ({
  teamId,
  roomId: 'python-lab',
  leader: teamId,
  group: null,
  members: [teamId],
  epoch: 0,
  startedAt: NOW - minutes * 60_000,
  solved: {},
  hints: { a: 1, b: 2 },
  attempts: {},
  escapedAt: NOW,
  at: NOW,
  ...extra,
});

function peer(hub: MemoryHub, id: string) {
  const room = createMemoryTransport(hub, id).join('lobby');
  const runs = new Runs(room);
  return { room, runs, scores: new Scores(room, runs, null, () => NOW) };
}

beforeEach(() => localStorage.clear());

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('Scores', () => {
  it('keeps players who left before the escape in the result', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    ada.runs.publish(finished('t1', 30, { members: ['Ada'], left: ['Bob'] }));
    ada.runs.publish(finished('t2', 31));
    expect(ada.scores.list().map((r) => [r.teamId, r.left])).toEqual([
      ['t1', ['Bob']],
      ['t2', undefined],
    ]);
  });

  it('records finished runs from the live summaries, fastest first', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    const viewer = peer(hub, 'viewer');
    ada.runs.publish(finished('slow', 40));
    ada.runs.publish(finished('fast', 25));
    ada.runs.publish({ ...finished('busy', 10), escapedAt: null });
    expect(viewer.scores.list().map((r) => [r.teamId, r.hints])).toEqual([
      ['fast', 3],
      ['slow', 3],
    ]);
  });

  it('hands stored results to newcomers and keeps them across visits', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    ada.runs.publish(finished('t1', 30));
    ada.runs.withdraw();
    localStorage.clear(); // the newcomer has its own, empty browser
    const late = peer(hub, 'late');
    expect(late.scores.list().map((r) => r.teamId)).toEqual(['t1']);
    // Stored in the newcomer's browser too.
    expect(new Scores(createMemoryTransport(new MemoryHub(), 'x').join('lobby'), new Runs(createMemoryTransport(new MemoryHub(), 'y').join('lobby')), null, () => NOW).list()).toHaveLength(1);
  });

  it('drops implausible or malformed results', () => {
    const hub = new MemoryHub();
    const eve = peer(hub, 'eve');
    const viewer = peer(hub, 'viewer');
    eve.runs.publish(finished('instant', 0.1));
    eve.room.channel('scores').send([{ teamId: 'x' }]);
    expect(viewer.scores.list()).toEqual([]);
  });
});

describe('removing results', () => {
  it('removes a result for everyone, for good, also for browsers that missed the removal', async () => {
    const config = await createInstructorConfig('correct horse battery', 100_000);
    const key = (await unlockInstructor(config, 'correct horse battery'))!;
    const hub = new MemoryHub();
    const make = (id: string) => {
      const room = createMemoryTransport(hub, id).join('lobby');
      const runs = new Runs(room);
      const instructor = new InstructorChannel(room, config);
      return { room, runs, instructor, scores: new Scores(room, runs, instructor, () => NOW) };
    };
    const ada = make('ada');
    const teacher = make('teacher');
    ada.runs.publish(finished('cheat', 20));
    ada.runs.publish(finished('fair', 30));
    expect(teacher.scores.list()).toHaveLength(2);

    // A stale copy of the cheating result, held by someone offline during the removal.
    const stale = [...ada.scores.list()];
    await teacher.instructor.send(key, { type: 'removeScore', id: 'cheat@0' });
    await settle();
    expect(ada.scores.list().map((r) => r.teamId)).toEqual(['fair']);
    expect(teacher.scores.list().map((r) => r.teamId)).toEqual(['fair']);

    // A newcomer gets the removal relayed (signed), so the stale copy doesn't bring it back.
    localStorage.setItem('dser.scores', '[]');
    localStorage.setItem('dser.scores.removed', '[]');
    const late = make('late');
    await settle();
    late.room.channel('scores').send(stale);
    createMemoryTransport(hub, 'offline').join('lobby').channel('scores').send(stale);
    await settle();
    expect(late.scores.list().map((r) => r.teamId)).toEqual(['fair']);
    expect(ada.scores.list().map((r) => r.teamId)).toEqual(['fair']);
  });

  it('ignores removals not signed by the instructor', async () => {
    const config = await createInstructorConfig('correct horse battery', 100_000);
    const forger = (await unlockInstructor(await createInstructorConfig('someone else', 100_000), 'someone else'))!;
    const hub = new MemoryHub();
    const room = createMemoryTransport(hub, 'ada').join('lobby');
    const runs = new Runs(room);
    const scores = new Scores(room, runs, new InstructorChannel(room, config), () => NOW);
    runs.publish(finished('fair', 30));
    const eve = new InstructorChannel(createMemoryTransport(hub, 'eve').join('lobby'), config);
    await eve.send(forger, { type: 'removeScore', id: 'fair@0' });
    await settle();
    expect(scores.list()).toHaveLength(1);
  });
});
