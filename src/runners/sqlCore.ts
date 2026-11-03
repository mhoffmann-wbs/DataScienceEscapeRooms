import type { SqlJsStatic } from 'sql.js';

// SQL execution shared by the worker and Node scripts/tests. Only type imports here.

export interface SqlTable {
  columns: string[];
  rows: (number | string | null | Uint8Array)[][];
}

export type SqlOutcome = { ok: true; result: SqlTable | null; tables: { name: string; columns: string[] }[] } | { ok: false; error: string };

/** Runs `query` against a fresh database built from `setup`; returns the last statement's result. */
export function runSql(SQL: SqlJsStatic, setup: string, query: string): SqlOutcome {
  const db = new SQL.Database();
  try {
    db.exec(setup);
    const tables = describe(db);
    const results = db.exec(query);
    const last = results.at(-1);
    return { ok: true, result: last ? { columns: last.columns, rows: last.values } : null, tables };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    db.close();
  }
}

/** Table names and columns of the setup database, for the schema panel. */
export function describeSetup(SQL: SqlJsStatic, setup: string): { name: string; columns: string[] }[] {
  const db = new SQL.Database();
  try {
    db.exec(setup);
    return describe(db);
  } finally {
    db.close();
  }
}

function describe(db: InstanceType<SqlJsStatic['Database']>): { name: string; columns: string[] }[] {
  const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values ?? [];
  return names.map(([name]) => ({
    name: String(name),
    columns: (db.exec(`PRAGMA table_info("${String(name).replace(/"/g, '""')}")`)[0]?.values ?? []).map((c) => String(c[1])),
  }));
}
