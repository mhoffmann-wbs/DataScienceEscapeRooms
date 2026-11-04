import { beforeEach, describe, expect, it } from 'vitest';
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
  return { room, runs, scores: new Scores(room, runs, () => NOW) };
}

beforeEach(() => localStorage.clear());

describe('Scores', () => {
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
    expect(new Scores(createMemoryTransport(new MemoryHub(), 'x').join('lobby'), new Runs(createMemoryTransport(new MemoryHub(), 'y').join('lobby')), () => NOW).list()).toHaveLength(1);
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
