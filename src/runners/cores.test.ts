import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalRows, hashAnswer, normalizeAnswer } from '../rooms/answers';
import { runPython } from './pythonCore';
import { runSql } from './sqlCore';

describe('answers', () => {
  it('normalizes per mode', () => {
    expect(normalizeAnswer('  Room   404 ', 'caseless')).toBe('room 404');
    expect(normalizeAnswer(' Room 404', 'exact')).toBe('Room 404');
    expect(normalizeAnswer(' 3,50 ', 'number')).toBe('3.5');
  });

  it('canonicalizes query results', () => {
    expect(canonicalRows([['b', 2], ['a', 1.00000004]], false)).toBe('[["a",1],["b",2]]');
    expect(canonicalRows([['b', 2], ['a', 1]], true)).toBe('[["b",2],["a",1]]');
  });

  it('hashes deterministically and per puzzle', async () => {
    const a = await hashAnswer('salt', 'p1', '42');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAnswer('salt', 'p1', '42')).toBe(a);
    expect(await hashAnswer('salt', 'p2', '42')).not.toBe(a);
  });
});

describe('sql runner', () => {
  const setup = `CREATE TABLE guests (id INTEGER, name TEXT, room INTEGER);
    INSERT INTO guests VALUES (1, 'Ada', 404), (2, 'Bob', 101);`;

  it('returns the last result and the schema', async () => {
    const SQL = await initSqlJs();
    const out = runSql(SQL, setup, "SELECT 1; SELECT name FROM guests WHERE room = 404");
    expect(out).toEqual({ ok: true, result: { columns: ['name'], rows: [['Ada']] }, tables: [{ name: 'guests', columns: ['id', 'name', 'room'] }] });
  });

  it('isolates runs: a DROP does not leak into the next run', async () => {
    const SQL = await initSqlJs();
    runSql(SQL, setup, 'DROP TABLE guests');
    expect(runSql(SQL, setup, 'SELECT count(*) FROM guests')).toMatchObject({ ok: true, result: { rows: [[2]] } });
  });

  it('reports errors', async () => {
    const SQL = await initSqlJs();
    expect(runSql(SQL, setup, 'SELEC name FROM guests')).toMatchObject({ ok: false, error: expect.stringContaining('syntax error') });
  });
});

describe('python runner', () => {
  let py: Awaited<ReturnType<typeof loadPyodide>>;
  beforeAll(async () => {
    py = await loadPyodide();
  }, 60_000);

  it('captures output and evaluates the check expression as canonical JSON', async () => {
    const out = await runPython(py, 'total = sum(readings)\nprint("total is", total)', 'readings = [3, 8, 15, 4]', '{"t": total, "a": [1, 2]}');
    expect(out).toEqual({ ok: true, stdout: 'total is 30', check: '{"a": [1, 2], "t": 30}' });
  });

  it('uses a fresh namespace per run', async () => {
    await runPython(py, 'leak = 1');
    expect(await runPython(py, 'print(leak)')).toMatchObject({ ok: false, error: expect.stringContaining("NameError: name 'leak' is not defined") });
  });

  it('shows only the student-facing traceback and blocks input()', async () => {
    const out = await runPython(py, 'x = 1\nx = x + "a"');
    expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/^Traceback[\s\S]*line 2[\s\S]*TypeError/) });
    expect(out.ok || out.error).not.toContain('_pyodide');
    expect(await runPython(py, 'input()')).toMatchObject({ ok: false, error: expect.stringContaining('input() is not available') });
  });
});
