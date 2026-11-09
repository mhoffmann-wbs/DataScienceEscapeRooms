import { describe, expect, it } from 'vitest';
import { PINNED_NOTE_MAX_LENGTH } from '../net/notebook';
import { plainNote } from './NotesPanel';

describe('plainNote', () => {
  it('flattens manifest text into one plain line', () => {
    expect(plainNote('Poster', 'AIR QUALITY\n\nabove 1000: **bad**\n\nuse `int()`')).toBe('Poster: AIR QUALITY · above 1000: bad · use int()');
  });

  it('fits into a note', () => {
    expect(plainNote('T', 'x'.repeat(5000))).toHaveLength(PINNED_NOTE_MAX_LENGTH);
  });
});
