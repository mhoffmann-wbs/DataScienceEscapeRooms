/// <reference lib="webworker" />
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { describeSetup, runSql } from './sqlCore';

let sql: Promise<SqlJsStatic> | null = null;
const getSql = () => (sql ??= initSqlJs({ locateFile: () => wasmUrl }));

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  let res: WorkerResponse;
  try {
    if (req.type === 'init') res = { id: req.id, result: (await getSql(), true) };
    else if (req.type === 'sql') res = { id: req.id, result: runSql(await getSql(), req.setup, req.query) };
    else if (req.type === 'sql-schema') res = { id: req.id, result: describeSetup(await getSql(), req.setup) };
    else res = { id: req.id, crash: `sql worker cannot handle ${req.type}` };
  } catch (err) {
    res = { id: req.id, crash: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(res);
};
