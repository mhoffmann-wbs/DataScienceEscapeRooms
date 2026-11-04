/// <reference lib="webworker" />
import { loadPyodide, type PyodideAPI } from 'pyodide';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { loadPackages, runPython } from './pythonCore';

// Pyodide's files are served from our own site (see the pyodide plugin in vite.config.ts).
const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
let pyodide: Promise<PyodideAPI> | null = null;
const getPyodide = () => (pyodide ??= loadPyodide({ indexURL }));

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  let res: WorkerResponse;
  try {
    if (req.type === 'init') res = { id: req.id, result: (await loadPackages(await getPyodide(), req.packages ?? []), true) };
    else if (req.type === 'python') res = { id: req.id, result: await runPython(await getPyodide(), req.code, req.setup, req.checkExpr) };
    else res = { id: req.id, crash: `python worker cannot handle ${req.type}` };
  } catch (err) {
    res = { id: req.id, crash: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(res);
};
