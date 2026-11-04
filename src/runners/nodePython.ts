import { loadPyodide, type PyodideAPI } from 'pyodide';
// Explicit .ts extension: also runs directly under Node (scripts/). Node only, never bundled.
import { loadPackages } from './pythonCore.ts';

// Typed by hand: the app's tsconfig has no Node types, and this file only runs under Node.
const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();

/** Where `npm run fetch-packages` puts Pyodide package wheels (the site serves them too). Tests and scripts run from the repo root. */
export const PACKAGE_DIR = `${cwd}/vendor/pyodide`;

/** Pyodide for Node (tests and scripts), with the given packages loaded from vendor/pyodide/. */
export async function nodePyodide(packages: readonly string[] = []): Promise<PyodideAPI> {
  const py = await loadPyodide({ packageCacheDir: PACKAGE_DIR });
  await loadPackages(py, packages);
  return py;
}
