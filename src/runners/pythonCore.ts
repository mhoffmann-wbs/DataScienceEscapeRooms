import type { PyodideAPI } from 'pyodide';

// Python execution shared by the worker and Node scripts/tests. Only type imports here.

/**
 * A chart drawn by `show_plot`, `show_hist`, `show_bars`, `plot_acf` or `plot_pacf` (see PRELUDE),
 * rendered by the output panel. `bar` is a correlogram (x = lags), `columns` a histogram or bar chart.
 */
export interface Plot {
  title: string | null;
  kind: 'line' | 'bar' | 'columns';
  x: (string | number)[];
  series: { name: string; values: (number | null)[] }[];
  /** Bar charts of autocorrelations: the ±band of the 95 % significance limit. */
  band: number | null;
}

export type PythonOutcome = { ok: true; stdout: string; check: string | null; plots: Plot[] } | { ok: false; stdout: string; error: string; plots: Plot[] };

/** Modules imported once after loading a package, so the first student run doesn't pay for it (statsmodels takes seconds). */
const PRELOAD: Record<string, string[]> = { statsmodels: ['statsmodels.api'], scipy: ['scipy.optimize', 'scipy.stats'] };

/** Loads Pyodide packages (wheels from pyodide-lock.json) and pre-imports their heavy modules. Idempotent. */
export async function loadPackages(py: PyodideAPI, packages: readonly string[]): Promise<void> {
  if (!packages.length) return;
  await py.loadPackage([...packages], { messageCallback: () => {} });
  for (const p of packages) for (const mod of PRELOAD[p] ?? [p]) py.runPython(`import ${mod}`);
}

const MAX_OUTPUT = 20_000;

// Runs inside a fresh namespace. input() would block the worker forever, so it raises.
// The plot helpers collect chart data in __plots__; the output panel draws it.
const PRELUDE = `
def input(prompt=""):
    raise RuntimeError("input() is not available here. Put your values in variables instead.")

__plots__ = []

def _plot_values(s):
    if hasattr(s, "index") and hasattr(s, "tolist"):
        labels = [str(i)[:10] if hasattr(i, "strftime") else (i.item() if hasattr(i, "item") else i) for i in s.index]
    else:
        labels = None
    values = []
    for v in (s.tolist() if hasattr(s, "tolist") else list(s)):
        try:
            f = float(v)
        except (TypeError, ValueError):
            f = None
        values.append(None if f is None or f != f or f in (float("inf"), float("-inf")) else round(f, 6))
    return labels, values

def _add_plot(plot):
    if len(__plots__) >= 8:
        raise RuntimeError("At most 8 plots per run.")
    if len(plot["x"]) > 5000:
        raise ValueError("Too many points to plot (at most 5000).")
    __plots__.append(plot)

def show_plot(*series, labels=None, title=None):
    """Draws one or more series as lines below your output.
    Takes lists, numpy arrays or pandas Series. A Series index (e.g. dates) becomes the x axis,
    so a training series and a forecast line up. labels=["a", "b"] names the lines."""
    if not series:
        raise ValueError("show_plot needs at least one series")
    parsed = [_plot_values(s) for s in series]
    if all(l is not None for l, _ in parsed):
        xs = sorted({x for l, _ in parsed for x in l}, key=lambda v: (isinstance(v, str), v))
        pos = {x: i for i, x in enumerate(xs)}
        cols = []
        for l, v in parsed:
            col = [None] * len(xs)
            for x, y in zip(l, v):
                col[pos[x]] = y
            cols.append(col)
    else:
        n = max(len(v) for _, v in parsed)
        xs = list(range(n))
        cols = [v + [None] * (n - len(v)) for _, v in parsed]
    names = list(labels) if labels else [getattr(s, "name", None) or f"series {i + 1}" for i, s in enumerate(series)]
    _add_plot({"title": title, "kind": "line", "x": xs, "series": [{"name": str(n), "values": c} for n, c in zip(names, cols)], "band": None})

def _num(v):
    return f"{v:.4g}" if isinstance(v, float) else str(v)

def show_hist(*samples, bins=20, labels=None, title=None):
    """Draws a histogram of one or more samples below your output: how many values fall into each bin.
    Takes lists, numpy arrays or pandas Series; several samples share the same bins, so they can be compared.
    bins sets the number of bins; labels=["a", "b"] names the samples."""
    if not samples:
        raise ValueError("show_hist needs at least one sample")
    data = [[v for v in _plot_values(s)[1] if v is not None] for s in samples]
    values = [v for d in data for v in d]
    if not values:
        raise ValueError("show_hist got no numbers to count")
    bins = max(1, min(int(bins), 200))
    lo, hi = min(values), max(values)
    width = (hi - lo) / bins or 1
    counts = []
    for d in data:
        c = [0] * bins
        for v in d:
            c[min(int((v - lo) / width), bins - 1)] += 1
        counts.append(c)
    xs = [f"{_num(round(lo + i * width, 6))}–{_num(round(lo + (i + 1) * width, 6))}" for i in range(bins)]
    names = list(labels) if labels else [getattr(s, "name", None) or f"sample {i + 1}" for i, s in enumerate(samples)]
    _add_plot({"title": title, "kind": "columns", "x": xs, "series": [{"name": str(n), "values": c} for n, c in zip(names, counts)], "band": None})

def show_bars(*series, x=None, labels=None, title=None):
    """Draws one or more series as bars below your output, e.g. probabilities per outcome.
    A pandas Series' index (or a dict's keys) labels the bars; otherwise pass x=[...].
    labels=["a", "b"] names the series."""
    if not series:
        raise ValueError("show_bars needs at least one series")
    parsed = [(list(s.keys()), _plot_values(list(s.values()))[1]) if isinstance(s, dict) else _plot_values(s) for s in series]
    xs = list(x) if x is not None else (parsed[0][0] if parsed[0][0] is not None else list(range(len(parsed[0][1]))))
    if any(len(v) != len(xs) for _, v in parsed):
        raise ValueError("show_bars: every series needs one value per bar")
    names = list(labels) if labels else [getattr(s, "name", None) or f"series {i + 1}" for i, s in enumerate(series)]
    xs = [v.item() if hasattr(v, "item") else v for v in xs]
    _add_plot({"title": title, "kind": "columns", "x": [v if isinstance(v, (int, float)) else str(v) for v in xs],
               "series": [{"name": str(n), "values": v} for n, (_, v) in zip(names, parsed)], "band": None})

def _correlogram(series, lags, title, partial):
    try:
        from statsmodels.tsa.stattools import acf, pacf
    except ImportError:
        raise RuntimeError("plot_acf and plot_pacf need statsmodels, which only the time series rooms load.")
    values = [v for v in _plot_values(series)[1] if v is not None]
    r = (pacf if partial else acf)(values, nlags=lags)
    _add_plot({"title": title or ("PACF" if partial else "ACF"), "kind": "bar", "x": list(range(1, lags + 1)),
               "series": [{"name": "PACF" if partial else "ACF", "values": [round(float(v), 4) for v in r[1:]]}],
               "band": round(1.96 / len(values) ** 0.5, 4)})

def plot_acf(series, lags=24, title=None):
    """Bar chart of the autocorrelation at lags 1..lags, with the 95 % significance band. Missing values are skipped."""
    _correlogram(series, lags, title, False)

def plot_pacf(series, lags=24, title=None):
    """Bar chart of the partial autocorrelation at lags 1..lags, with the 95 % significance band."""
    _correlogram(series, lags, title, True)
`;

// After the setup: the public functions of the prelude and the room's data files also become
// the module \`helpers\`, so starter code can say where a helper comes from
// (\`from helpers import unshift\`). They stay global too, for code written without the import.
const HELPERS = `
import sys as __sys, types as __types
__sys.modules["helpers"] = __types.ModuleType("helpers", "Helper functions for this room.")
for __name, __value in list(globals().items()):
    if isinstance(__value, __types.FunctionType) and not __name.startswith("_") and __name != "input":
        setattr(__sys.modules["helpers"], __name, __value)
del __sys, __types, __name, __value
`;

/**
 * Setup code that makes the given modules (name → Python source, from content/python/)
 * importable, e.g. `from prophet import Prophet`. Goes before a puzzle's data file.
 * Tracebacks name the module's file, so errors raised inside it read like a library's.
 */
export function moduleSetup(modules: Record<string, string>): string {
  return Object.entries(modules)
    .map(
      ([name, source]) => `
import sys as __sys, types as __types
__module = __types.ModuleType(${JSON.stringify(name)})
__module.__file__ = ${JSON.stringify(`${name}.py`)}
__sys.modules[${JSON.stringify(name)}] = __module
exec(compile(${JSON.stringify(source)}, ${JSON.stringify(`${name}.py`)}, "exec"), __module.__dict__)
del __sys, __types, __module
`,
    )
    .join('');
}

/** File name the student's code runs under. A real name (not `<exec>`) makes tracebacks show the failing source line. */
const STUDENT_FILE = 'script.py';

/**
 * Runs `setup` then the student's `code` in a fresh namespace and, if given, evaluates
 * `checkExpr` there, returning it as canonical JSON (sorted keys) for answer hashing.
 */
export async function runPython(py: PyodideAPI, code: string, setup = '', checkExpr?: string): Promise<PythonOutcome> {
  let stdout = '';
  const write = (s: string) => {
    if (stdout.length < MAX_OUTPUT) stdout += s + '\n';
  };
  py.setStdout({ batched: write });
  py.setStderr({ batched: write });
  const ns = py.globals.get('dict')();
  try {
    py.runPython(PRELUDE, { globals: ns });
    if (setup) py.runPython(setup, { globals: ns });
    py.runPython(HELPERS, { globals: ns });
    await py.runPythonAsync(code, { globals: ns, filename: STUDENT_FILE });
    let check: string | null = null;
    if (checkExpr) {
      ns.set('__check_expr__', checkExpr);
      check = py.runPython('__import__("json").dumps(eval(__check_expr__), sort_keys=True, default=str)', { globals: ns }) as string;
    }
    return { ok: true, stdout: trim(stdout), check, plots: plotsOf(py, ns) };
  } catch (e) {
    return { ok: false, stdout: trim(stdout), error: cleanTraceback(e instanceof Error ? e.message : String(e)), plots: plotsOf(py, ns) };
  } finally {
    ns.destroy();
  }
}

/** Charts drawn so far, even if the run failed later. Anything malformed is dropped. */
function plotsOf(py: PyodideAPI, ns: ReturnType<PyodideAPI['globals']['get']>): Plot[] {
  try {
    return JSON.parse(py.runPython('__import__("json").dumps(__plots__ if isinstance(__plots__, list) else [])', { globals: ns }) as string) as Plot[];
  } catch {
    return [];
  }
}

function trim(s: string): string {
  return s.length >= MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n… (output truncated)' : s.replace(/\n$/, '');
}

/** Drops Pyodide's internal frames so students see only their own code's error (or a data file's, which run as `<exec>`). */
function cleanTraceback(message: string): string {
  const lines = message.split('\n');
  const firstUser = lines.findIndex((l) => l.includes(`File "${STUDENT_FILE}"`) || l.includes('File "<exec>"'));
  return firstUser > 0 ? ['Traceback (most recent call last):', ...lines.slice(firstUser)].join('\n') : message;
}
