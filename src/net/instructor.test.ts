import { beforeAll, describe, expect, it } from 'vitest';
import { createInstructorConfig, InstructorChannel, unlockInstructor, type InstructorConfig, type InstructorMessage } from './instructor';
import { createMemoryTransport, MemoryHub } from './memoryTransport';

let config: InstructorConfig;
let key: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  config = await createInstructorConfig('correct horse battery', 100_000);
  key = (await unlockInstructor(config, 'correct horse battery'))!;
  const other = await createInstructorConfig('someone else entirely', 100_000);
  otherKey = (await unlockInstructor(other, 'someone else entirely'))!;
});

function setup(clock = { now: 1_000_000 }) {
  const hub = new MemoryHub();
  const make = (id: string) => {
    const channel = new InstructorChannel(createMemoryTransport(hub, id).join('lobby'), config, () => clock.now);
    const got: InstructorMessage[] = [];
    channel.events.on('announce', (m) => got.push(m));
    channel.events.on('reset', (m) => got.push(m));
    return { channel, got };
  };
  return { teacher: make('teacher'), student: make('student'), hub, clock };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('instructor messages', () => {
  it('unlocks only with the right passphrase', async () => {
    expect(key).toBeTruthy();
    expect(await unlockInstructor(config, 'wrong')).toBeNull();
  });

  it('delivers signed announcements and resets to everyone', async () => {
    const { teacher, student } = setup();
    await teacher.channel.send(key, { type: 'announce', text: '5 minutes left!', group: null });
    await teacher.channel.send(key, { type: 'reset', teamId: 't1', epoch: 1_000_000 });
    await settle();
    expect(student.got.map((m) => m.type)).toEqual(['announce', 'reset']);
    expect(teacher.got).toHaveLength(2);
  });

  it('rejects messages signed with another key, tampered or replayed', async () => {
    const { teacher, student, hub } = setup();
    await teacher.channel.send(otherKey, { type: 'announce', text: 'forged', group: null });
    // Capture a valid message and replay it, once tampered and once unchanged.
    const sniffer = createMemoryTransport(hub, 'eve').join('lobby');
    const captured: { payload: string; signature: string }[] = [];
    sniffer.channel<{ payload: string; signature: string }>('instructor').subscribe((d) => captured.push(d as { payload: string; signature: string }));
    await teacher.channel.send(key, { type: 'announce', text: 'real', group: null });
    await settle();
    const real = captured.at(-1)!;
    sniffer.channel('instructor').send({ payload: real.payload.replace('real', 'fake'), signature: real.signature });
    sniffer.channel('instructor').send(real);
    sniffer.channel('instructor').send({ payload: real.payload, signature: '%%% not base64' });
    await settle();
    expect(student.got.map((m) => (m.type === 'announce' ? m.text : m.type))).toEqual(['real']);
  });

  it('rejects stale messages', async () => {
    const { student, hub, clock } = setup();
    // A teacher whose message is an hour older than the student's clock.
    const lagging = new InstructorChannel(createMemoryTransport(hub, 'late-teacher').join('lobby'), config, () => clock.now - 3_600_000);
    await lagging.send(key, { type: 'announce', text: 'an hour ago', group: null });
    await settle();
    expect(student.got).toEqual([]);
  });

  it('ignores everything without an instructor config', async () => {
    const hub = new MemoryHub();
    const signer = new InstructorChannel(createMemoryTransport(hub, 'teacher').join('lobby'), config);
    const plain = new InstructorChannel(createMemoryTransport(hub, 'student').join('lobby'), null);
    const got: unknown[] = [];
    plain.events.on('announce', (m) => got.push(m));
    await signer.send(key, { type: 'announce', text: 'hi', group: null });
    await settle();
    expect(got).toEqual([]);
  });
});

describe('instructor presence', () => {
  it('tells everyone, including later arrivals, which peer is an instructor', async () => {
    const hub = new MemoryHub();
    const teacher = new InstructorChannel(createMemoryTransport(hub, 'teacher').join('lobby'), config);
    const early = new InstructorChannel(createMemoryTransport(hub, 'early').join('lobby'), config);
    await teacher.showPresence(key);
    await settle();
    const late = new InstructorChannel(createMemoryTransport(hub, 'late').join('lobby'), config);
    await settle();
    expect(teacher.instructors()).toEqual(['teacher']);
    expect(early.instructors()).toEqual(['teacher']);
    expect(late.instructors()).toEqual(['teacher']);
  });

  it("can't be claimed without the key", async () => {
    const hub = new MemoryHub();
    const student = new InstructorChannel(createMemoryTransport(hub, 'student').join('lobby'), config);
    const other = new InstructorChannel(createMemoryTransport(hub, 'other').join('lobby'), config);
    await student.showPresence(otherKey);
    await settle();
    expect(other.instructors()).toEqual([]);
  });
});
