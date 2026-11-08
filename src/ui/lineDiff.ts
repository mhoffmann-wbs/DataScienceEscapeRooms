/** One line of a diff: kept from both versions, only in the old one, or only in the new one. */
export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string };

/** A run of unchanged lines left out of the view, standing in for `count` lines. */
export type DiffGap = { kind: 'gap'; count: number };

/** Line diff of two texts (longest common subsequence), removed lines before added ones in each change. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\n$/, '').split('\n');
  const b = after.replace(/\n$/, '').split('\n');
  // lcs[i][j]: length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) out.push({ kind: 'removed', text: a[i++]! });
    else out.push({ kind: 'added', text: b[j++]! });
  }
  return out;
}

/** Keeps `context` unchanged lines around each change and folds longer unchanged runs into gaps. */
export function foldUnchanged(lines: DiffLine[], context = 2): (DiffLine | DiffGap)[] {
  const near = lines.map((_, i) => lines.slice(Math.max(0, i - context), i + context + 1).some((l) => l.kind !== 'same'));
  const out: (DiffLine | DiffGap)[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (near[i]) out.push(lines[i]!);
    else {
      const last = out[out.length - 1];
      if (last?.kind === 'gap') last.count++;
      else out.push({ kind: 'gap', count: 1 });
    }
  }
  return out;
}
