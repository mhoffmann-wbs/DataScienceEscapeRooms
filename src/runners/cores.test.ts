import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalRows, hashAnswer, normalizeAnswer } from '../rooms/answers';
import { nodePyodide } from './nodePython';
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
    expect(out).toEqual({ ok: true, stdout: 'total is 30', check: '{"a": [1, 2], "t": 30}', plots: [] });
  });

  it('uses a fresh namespace per run', async () => {
    await runPython(py, 'leak = 1');
    expect(await runPython(py, 'print(leak)')).toMatchObject({ ok: false, error: expect.stringContaining("NameError: name 'leak' is not defined") });
  });

  it('offers the prelude and data-file functions as the helpers module', async () => {
    const setup = 'def unshift(letter, n):\n    return letter\n\ndef _secret():\n    pass\n\nnotes = [1]';
    const out = await runPython(py, 'from helpers import unshift, show_plot\nimport helpers\nprint(unshift("a", 1), hasattr(helpers, "_secret"), hasattr(helpers, "notes"), hasattr(helpers, "input"))', setup);
    expect(out).toMatchObject({ ok: true, stdout: 'a False False False' });
    expect(await runPython(py, 'from helpers import unshift')).toMatchObject({ ok: false, error: expect.stringContaining('ImportError') });
  });

  it('shows only the student-facing traceback, with source lines, and blocks input()', async () => {
    const out = await runPython(py, 'x = 1\nx = x + "a"');
    expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/^Traceback[\s\S]*line 2[\s\S]*TypeError/) });
    expect(out.ok || out.error).not.toContain('_pyodide');
    expect(out.ok || out.error).toContain('x = x + "a"');
    const syntax = await runPython(py, 'vals = [1, 2,\ny = 2');
    expect(syntax).toMatchObject({ ok: false, error: expect.stringMatching(/^Traceback[\s\S]*line 1\n {4}vals = \[1, 2,[\s\S]*SyntaxError/) });
    expect(await runPython(py, 'input()')).toMatchObject({ ok: false, error: expect.stringContaining('input() is not available') });
  });
});

describe('python plots', () => {
  let py: Awaited<ReturnType<typeof loadPyodide>>;
  beforeAll(async () => {
    py = await loadPyodide();
  }, 60_000);

  it('collects line charts, aligning unequal lists and dropping NaN', async () => {
    const out = await runPython(py, 'show_plot([1, 2, float("nan")], [5], labels=["a", "b"], title="T")\nprint("done")');
    expect(out).toMatchObject({ ok: true, stdout: 'done' });
    expect(out.plots).toEqual([{ title: 'T', kind: 'line', x: [0, 1, 2], series: [{ name: 'a', values: [1, 2, null] }, { name: 'b', values: [5, null, null] }], band: null }]);
  });

  it('counts samples into shared histogram bins', async () => {
    const out = await runPython(py, 'show_hist([0, 1, 1, 2, 4], [4, 4], bins=2, labels=["a", "b"])');
    expect(out.ok).toBe(true);
    expect(out.plots).toEqual([{ title: null, kind: 'columns', x: ['0–2', '2–4'], series: [{ name: 'a', values: [3, 2] }, { name: 'b', values: [0, 2] }], band: null }]);
  });

  it('draws bars labelled by dict keys or by x', async () => {
    const out = await runPython(py, 'show_bars({"heads": 0.5, "tails": 0.5}, title="Coin")\nshow_bars([1, 2], x=["a", "b"])');
    expect(out.ok).toBe(true);
    expect(out.plots.map((p) => [p.kind, p.x, p.series[0]!.values])).toEqual([
      ['columns', ['heads', 'tails'], [0.5, 0.5]],
      ['columns', ['a', 'b'], [1, 2]],
    ]);
  });

  it('keeps charts drawn before an error, and explains when statsmodels is missing', async () => {
    const out = await runPython(py, 'show_plot([1, 2])\nplot_acf([1, 2, 3])');
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('need statsmodels') });
    expect(out.plots).toHaveLength(1);
  });
});

describe('python packages', () => {
  let py: Awaited<ReturnType<typeof loadPyodide>>;
  beforeAll(async () => {
    py = await nodePyodide(['statsmodels']);
  }, 180_000);

  it('aligns dated series by their index and draws correlograms with a significance band', async () => {
    const code = [
      'import numpy as np, pandas as pd',
      "s = pd.Series(np.sin(np.arange(48) * np.pi / 6), index=pd.date_range('2020-01-01', periods=48, freq='MS'))",
      "show_plot(s[:36], s[36:], labels=['train', 'test'])",
      'plot_acf(s, lags=12)',
    ].join('\n');
    const out = await runPython(py, code);
    expect(out.ok).toBe(true);
    const [line, acf] = out.plots;
    expect(line!.x).toHaveLength(48);
    expect(line!.x[0]).toBe('2020-01-01');
    expect(line!.series[0]!.values[36]).toBeNull();
    expect(acf).toMatchObject({ kind: 'bar', title: 'ACF', band: expect.closeTo(1.96 / Math.sqrt(48), 3) });
    // A 12-month sine correlates fully with itself at lag 12.
    expect(acf!.series[0]!.values[11]).toBeGreaterThan(0.5);
  }, 60_000);
});
