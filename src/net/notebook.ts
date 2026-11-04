import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// A team's shared notes. Converges without a leader: every field of every note is a
// last-write-wins register (newest timestamp, ties broken by peer id), so merging is
// commutative, associative and idempotent, and peers exchange full states like RunSync.

export const NOTE_MAX_LENGTH = 300;
export const MAX_NOTES = 150;

const register = <T extends z.ZodType>(value: T) => z.object({ v: value, t: z.number().finite(), by: z.string().max(64) });

const noteSchema = z.object({
  text: register(z.string().max(NOTE_MAX_LENGTH)),
  crossed: register(z.boolean()),
  /** Deleted notes stay as tombstones, so a delete can't be undone by an older copy. */
  deleted: register(z.boolean()),
  /** Sort key; moving a note picks a value between its new neighbours. */
  pos: register(z.number().finite()),
});

export const notesSchema = z
  .record(z.string().regex(/^[a-z0-9]{1,24}$/), noteSchema)
  .refine((r) => Object.keys(r).length <= MAX_NOTES, 'too many notes');
export type Notes = z.infer<typeof notesSchema>;
type Note = z.infer<typeof noteSchema>;
type Register<T> = { v: T; t: number; by: string };

/** What the UI shows: live notes in order. */
export interface NoteView {
  id: string;
  text: string;
  crossed: boolean;
}

function newer<T>(a: Register<T>, b: Register<T>): Register<T> {
  if (a.t !== b.t) return a.t > b.t ? a : b;
  return a.by >= b.by ? a : b;
}

export function mergeNotes(a: Notes, b: Notes): Notes {
  const out: Notes = { ...a };
  for (const [id, nb] of Object.entries(b)) {
    const na = out[id];
    out[id] = na
      ? { text: newer(na.text, nb.text), crossed: newer(na.crossed, nb.crossed), deleted: newer(na.deleted, nb.deleted), pos: newer(na.pos, nb.pos) }
      : nb;
  }
  return out;
}

const sameRegister = <T>(a: Register<T>, b: Register<T>) => a.v === b.v && a.t === b.t && a.by === b.by;

export function sameNotes(a: Notes, b: Notes): boolean {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => {
    const x = a[id]!;
    const y = b[id];
    return !!y && sameRegister(x.text, y.text) && sameRegister(x.crossed, y.crossed) && sameRegister(x.deleted, y.deleted) && sameRegister(x.pos, y.pos);
  });
}

/** Live notes in display order. */
export function viewNotes(notes: Notes): NoteView[] {
  return Object.entries(notes)
    .filter(([, n]) => !n.deleted.v)
    .sort(([ia, a], [ib, b]) => a.pos.v - b.pos.v || (ia < ib ? -1 : 1))
    .map(([id, n]) => ({ id, text: n.text.v, crossed: n.crossed.v }));
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('');

/** Keeps a team's notes in sync across its NetRoom. */
export class Notebook {
  readonly events = new Emitter<{ notes: Notes }>();
  private current: Notes;
  private view: NoteView[];
  private readonly channel;
  private readonly offs: (() => void)[];

  constructor(
    room: NetRoom,
    initial: Notes,
    private readonly selfId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.current = initial;
    this.view = viewNotes(initial);
    this.channel = room.channel<Notes>('notes');
    this.offs = [
      room.onPeerJoin((id) => this.channel.send(this.current, [id])),
      this.channel.subscribe((data) => {
        const parsed = notesSchema.safeParse(data);
        if (parsed.success) this.apply(parsed.data, false);
      }),
    ];
  }

  get state(): Notes {
    return this.current;
  }

  /** Stable snapshot that only changes when the notes do (for React). */
  list(): readonly NoteView[] {
    return this.view;
  }

  /** Adds a note at the end. Returns false if it is empty or the notebook is full. */
  add(text: string): boolean {
    const clean = text.trim().slice(0, NOTE_MAX_LENGTH);
    if (!clean || Object.keys(this.current).length >= MAX_NOTES) return false;
    const last = this.view.at(-1);
    const pos = last ? this.current[last.id]!.pos.v + 1 : 0;
    const r = <T>(v: T) => this.reg(v);
    this.apply({ [newId()]: { text: r(clean), crossed: r(false), deleted: r(false), pos: r(pos) } }, true);
    return true;
  }

  edit(id: string, text: string): void {
    const clean = text.trim().slice(0, NOTE_MAX_LENGTH);
    if (clean) this.change(id, { text: this.reg(clean) });
    else this.remove(id);
  }

  setCrossed(id: string, crossed: boolean): void {
    this.change(id, { crossed: this.reg(crossed) });
  }

  remove(id: string): void {
    this.change(id, { deleted: this.reg(true), text: this.reg('') });
  }

  /** Moves a note to `index` in the displayed order. */
  move(id: string, index: number): void {
    const others = this.view.filter((n) => n.id !== id);
    const posOf = (n: NoteView | undefined) => (n ? this.current[n.id]!.pos.v : undefined);
    const before = posOf(others[index - 1]);
    const after = posOf(others[index]);
    const pos = before !== undefined && after !== undefined ? (before + after) / 2 : before !== undefined ? before + 1 : after !== undefined ? after - 1 : 0;
    this.change(id, { pos: this.reg(pos) });
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private reg<T>(v: T): Register<T> {
    return { v, t: this.now(), by: this.selfId };
  }

  private change(id: string, fields: Partial<Note>): void {
    const note = this.current[id];
    if (!note) return;
    const next = { ...note };
    for (const key of Object.keys(fields) as (keyof Note)[]) {
      const field = fields[key]!;
      // Strictly newer than what it replaces, even within the same millisecond.
      (next[key] as Register<unknown>) = { ...field, t: Math.max(field.t, note[key].t + 1) };
    }
    this.apply({ [id]: next }, true);
  }

  private apply(incoming: Notes, local: boolean): void {
    const merged = mergeNotes(this.current, incoming);
    if (sameNotes(merged, this.current)) return;
    this.current = merged;
    this.view = viewNotes(merged);
    this.events.emit('notes', merged);
    if (local) this.channel.send(merged);
  }
}
