import { describe, expect, it } from 'vitest';
import { foldUnchanged, lineDiff } from './lineDiff';

describe('lineDiff', () => {
  it('finds no changes in the same text, ignoring a final newline', () => {
    expect(lineDiff('a\nb\n', 'a\nb').every((l) => l.kind === 'same')).toBe(true);
  });

  it('shows a changed line as removed then added, and keeps the rest', () => {
    expect(lineDiff('for x in xs\n    print(x)\n', 'for x in xs:\n    print(x)\n')).toEqual([
      { kind: 'removed', text: 'for x in xs' },
      { kind: 'added', text: 'for x in xs:' },
      { kind: 'same', text: '    print(x)' },
    ]);
  });

  it('finds inserted and deleted lines', () => {
    const kinds = lineDiff('a\nb\nc', 'a\nx\nc\nd').map((l) => `${l.kind[0]}${l.text}`);
    expect(kinds).toEqual(['sa', 'rb', 'ax', 'sc', 'ad']);
  });
});

describe('foldUnchanged', () => {
  it('folds long unchanged runs into gaps and keeps context around changes', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n');
    const after = before.replace('6', 'six');
    const folded = foldUnchanged(lineDiff(before, after), 1);
    expect(folded).toEqual([
      { kind: 'gap', count: 4 },
      { kind: 'same', text: '5' },
      { kind: 'removed', text: '6' },
      { kind: 'added', text: 'six' },
      { kind: 'same', text: '7' },
      { kind: 'gap', count: 1 },
    ]);
  });
});
