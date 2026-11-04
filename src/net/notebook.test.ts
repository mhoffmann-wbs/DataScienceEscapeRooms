import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { mergeNotes, Notebook, viewNotes, type Notes } from './notebook';

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

  it('rejects empty notes and caps the length', () => {
    const { ada } = pair();
    expect(ada.add('   ')).toBe(false);
    ada.add('x'.repeat(1000));
    expect(ada.list()[0]!.text).toHaveLength(300);
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
