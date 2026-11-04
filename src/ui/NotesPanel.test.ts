import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH } from '../net/notebook';
import { plainNote } from './NotesPanel';

describe('plainNote', () => {
  it('flattens manifest text into one plain line', () => {
    expect(plainNote('Poster', 'AIR QUALITY\n\nabove 1000: **bad**\n\nuse `int()`')).toBe('Poster: AIR QUALITY · above 1000: bad · use int()');
  });

  it('fits into a note', () => {
    expect(plainNote('T', 'x'.repeat(1000))).toHaveLength(NOTE_MAX_LENGTH);
  });
});
