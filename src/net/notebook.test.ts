import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { mergeNotes, Notebook, pinState, viewNotes, type Notes } from './notebook';

function pair() {
  const hub = new MemoryHub();
  const clock = { t: 1000 };
  const make = (id: string) => new Notebook(createMemoryTransport(hub, id).join('room:r:t'), {}, id, () => clock.t);
  return { ada: make('ada'), bob: make('bob'), clock };
}
const texts = (nb: Notebook) => nb.list().map((n) => (n.crossed ? `~${n.text}~` : n.text));

describe('Notebook', () => {
  it('shares added notes with the team, in order', () => {
    const { ada, bob, clock } = pair();
    ada.add('KEY = 7');
    clock.t++;
    bob.add('cat: Pixel');
    expect(texts(ada)).toEqual(['KEY = 7', 'cat: Pixel']);
    expect(texts(bob)).toEqual(texts(ada));
  });

  it('keeps concurrent changes to different fields of one note', () => {
    const { ada, bob, clock } = pair();
    ada.add('room 406');
    const id = ada.list()[0]!.id;
    clock.t += 10;
    ada.edit(id, 'room 406: Nora Quill');
    bob.setCrossed(id, true);
    expect(texts(ada)).toEqual(['~room 406: Nora Quill~']);
    expect(texts(bob)).toEqual(texts(ada));
  });

  it('applies two quick changes by the same player in order', () => {
    const { ada } = pair();
    ada.add('a');
    const id = ada.list()[0]!.id;
    ada.edit(id, 'b');
    ada.edit(id, 'c');
    expect(texts(ada)).toEqual(['c']);
  });

  it('moves notes and removes them for everyone', () => {
    const { ada, bob, clock } = pair();
    for (const t of ['one', 'two', 'three']) {
      ada.add(t);
      clock.t++;
    }
    const [one, , three] = ada.list();
    bob.move(three!.id, 0);
    expect(texts(ada)).toEqual(['three', 'one', 'two']);
    ada.remove(one!.id);
    expect(texts(bob)).toEqual(['three', 'two']);
    // Editing an empty text deletes too.
    bob.edit(three!.id, '   ');
    expect(texts(ada)).toEqual(['two']);
  });

  it('keeps deleted notes in a shared trash, to restore or delete for good', () => {
    const { ada, bob, clock } = pair();
    for (const t of ['one', 'two', 'three']) {
      ada.add(t);
      clock.t++;
    }
    const [one, two] = ada.list();
    ada.remove(one!.id);
    clock.t++;
    ada.remove(two!.id);
    expect(bob.trash().map((n) => n.text)).toEqual(['two', 'one']);
    bob.restore(one!.id);
    expect(texts(ada)).toEqual(['one', 'three']);
    expect(ada.trash().map((n) => n.text)).toEqual(['two']);
    bob.purge(two!.id);
    expect(ada.trash()).toEqual([]);
    // Only notes in the trash can be deleted for good.
    bob.purge(one!.id);
    expect(texts(ada)).toEqual(['one', 'three']);
  });

  it('pins a clue once, and brings it back from the trash instead of copying it', () => {
    const { ada, bob, clock } = pair();
    ada.pin('Photo: Pixel', 'clue:photo');
    clock.t++;
    expect(pinState(bob.state, 'clue:photo')).toBe('pinned');
    bob.pin('Photo: Pixel', 'clue:photo');
    expect(texts(ada)).toEqual(['Photo: Pixel']);
    const [note] = bob.list();
    bob.remove(note!.id);
    expect(pinState(ada.state, 'clue:photo')).toBe('trashed');
    clock.t++;
    ada.pin('Photo: Pixel', 'clue:photo');
    expect(texts(bob)).toEqual(['Photo: Pixel']);
    expect(bob.trash()).toEqual([]);
    // Deleted for good: pinning adds it again.
    bob.remove(note!.id);
    bob.purge(note!.id);
    expect(pinState(ada.state, 'clue:photo')).toBe(null);
    ada.pin('Photo: Pixel', 'clue:photo');
    expect(texts(bob)).toEqual(['Photo: Pixel']);
  });

  it('a note deleted for good stays gone, even after a concurrent restore', () => {
    const { ada, bob, clock } = pair();
    ada.add('x');
    const id = ada.list()[0]!.id;
    clock.t++;
    ada.remove(id);
    clock.t++;
    ada.purge(id);
    bob.restore(id);
    expect(texts(ada)).toEqual([]);
    expect(texts(bob)).toEqual([]);
    expect(bob.trash()).toEqual([]);
  });

  it('rejects empty notes and caps the length', () => {
    const { ada } = pair();
    expect(ada.add('   ')).toBe(false);
    ada.add('x'.repeat(1000));
    expect(ada.list()[0]!.text).toHaveLength(300);
  });

  it('pinned clues may be longer than typed notes, also after an edit', () => {
    const { ada } = pair();
    ada.pin('x'.repeat(1000), 'clue:poster');
    const id = ada.list()[0]!.id;
    expect(ada.list()[0]!.text).toHaveLength(1000);
    ada.edit(id, 'y'.repeat(1000));
    expect(ada.list()[0]!.text).toHaveLength(1000);
  });

  it('a late joiner receives the notes', () => {
    const hub = new MemoryHub();
    const ada = new Notebook(createMemoryTransport(hub, 'ada').join('s'), {}, 'ada');
    ada.add('found: 6');
    const cara = new Notebook(createMemoryTransport(hub, 'cara').join('s'), {}, 'cara');
    expect(texts(cara)).toEqual(['found: 6']);
  });
});

describe('mergeNotes', () => {
  const reg = <T>(v: T, t: number, by = 'p') => ({ v, t, by });
  const note = (text: string, t: number, by = 'p') => ({ text: reg(text, t, by), crossed: reg(false, t, by), deleted: reg(false, t, by), pos: reg(0, t, by) });
  const a: Notes = { n1: note('a', 1), n2: note('x', 5) };
  const b: Notes = { n1: note('b', 2), n3: note('y', 1) };
  const c: Notes = { n1: note('c', 2, 'q'), n2: { ...note('x', 5), crossed: reg(true, 6) } };

  it('is commutative, associative and idempotent', () => {
    const view = (n: Notes) => viewNotes(n);
    expect(view(mergeNotes(a, b))).toEqual(view(mergeNotes(b, a)));
    expect(view(mergeNotes(mergeNotes(a, b), c))).toEqual(view(mergeNotes(a, mergeNotes(b, c))));
    expect(mergeNotes(a, a)).toEqual(a);
  });

  it('breaks timestamp ties by peer id', () => {
    expect(viewNotes(mergeNotes(b, c)).find((n) => n.id === 'n1')!.text).toBe('c');
  });
});
