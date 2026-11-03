// Answer normalization and hashing. Shared by the app, the tests and
// scripts/hash-answer.ts, so it must stay free of imports (Node runs it as-is).

export type AnswerMode = 'caseless' | 'exact' | 'number';

/** How a typed answer is compared: whitespace is always trimmed and collapsed. */
export function normalizeAnswer(input: string, mode: AnswerMode): string {
  const s = input.trim().replace(/\s+/g, ' ');
  if (mode === 'exact') return s;
  if (mode === 'caseless') return s.toLowerCase();
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : s.toLowerCase();
}

export type SqlValue = number | string | null | Uint8Array;

/**
 * Canonical form of a query result: column names are ignored (aliases vary),
 * floats are rounded to 6 decimals, and unordered results are sorted.
 */
export function canonicalRows(rows: SqlValue[][], ordered: boolean): string {
  const cells = rows.map((row) =>
    row.map((v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v instanceof Uint8Array ? `blob:${v.length}` : v)),
  );
  const lines = cells.map((row) => JSON.stringify(row));
  if (!ordered) lines.sort();
  return `[${lines.join(',')}]`;
}

// PBKDF2 rather than a bare SHA-256 so brute-forcing short codes from the bundle
// is at least slow. It can't be made impossible in a static client-side app.
const ITERATIONS = 60_000;

export async function hashAnswer(salt: string, puzzleId: string, normalized: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(normalized), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`dser1|${salt}|${puzzleId}`), iterations: ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
