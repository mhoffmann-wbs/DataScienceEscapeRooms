import type { PyodideAPI } from 'pyodide';

// Python execution shared by the worker and Node scripts/tests. Only type imports here.

export type PythonOutcome = { ok: true; stdout: string; check: string | null } | { ok: false; stdout: string; error: string };

const MAX_OUTPUT = 20_000;

// Runs inside a fresh namespace. input() would block the worker forever, so it raises.
const PRELUDE = `
def input(prompt=""):
    raise RuntimeError("input() is not available here. Put your values in variables instead.")
`;

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
    await py.runPythonAsync(code, { globals: ns });
    let check: string | null = null;
    if (checkExpr) {
      ns.set('__check_expr__', checkExpr);
      check = py.runPython('__import__("json").dumps(eval(__check_expr__), sort_keys=True, default=str)', { globals: ns }) as string;
    }
    return { ok: true, stdout: trim(stdout), check };
  } catch (e) {
    return { ok: false, stdout: trim(stdout), error: cleanTraceback(e instanceof Error ? e.message : String(e)) };
  } finally {
    ns.destroy();
  }
}

function trim(s: string): string {
  return s.length >= MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n… (output truncated)' : s.replace(/\n$/, '');
}

/** Drops Pyodide's internal frames so students see only their own code's error. */
function cleanTraceback(message: string): string {
  const lines = message.split('\n');
  const firstUser = lines.findIndex((l) => l.includes('File "<exec>"'));
  return firstUser > 0 ? ['Traceback (most recent call last):', ...lines.slice(firstUser)].join('\n') : message;
}
