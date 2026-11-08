import type { SqlJsStatic } from 'sql.js';

// SQL execution shared by the worker and Node scripts/tests. Only type imports here.

export interface SqlTable {
  columns: string[];
  rows: (number | string | null | Uint8Array)[][];
}

/** A table of the setup database: columns with their declared types, the primary key and declared foreign keys. */
export interface SqlTableInfo {
  name: string;
  columns: string[];
  types: string[];
  pk: string[];
  refs: { from: string; table: string; to: string }[];
}

export type SqlOutcome = { ok: true; result: SqlTable | null; tables: SqlTableInfo[] } | { ok: false; error: string };

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

/** The tables of the setup database, for the schema panel and diagram. */
export function describeSetup(SQL: SqlJsStatic, setup: string): SqlTableInfo[] {
  const db = new SQL.Database();
  try {
    db.exec(setup);
    return describe(db);
  } finally {
    db.close();
  }
}

function describe(db: InstanceType<SqlJsStatic['Database']>): SqlTableInfo[] {
  const names = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values ?? [];
  return names.map(([name]) => {
    const quoted = `"${String(name).replace(/"/g, '""')}"`;
    // table_info: cid, name, type, notnull, dflt_value, pk (1-based position in the key, 0 if not in it)
    const cols = db.exec(`PRAGMA table_info(${quoted})`)[0]?.values ?? [];
    // foreign_key_list: id, seq, table, from, to, …; `to` is null when the key names no column (the parent's primary key)
    const fks = db.exec(`PRAGMA foreign_key_list(${quoted})`)[0]?.values ?? [];
    return {
      name: String(name),
      columns: cols.map((c) => String(c[1])),
      types: cols.map((c) => String(c[2] ?? '')),
      pk: cols.filter((c) => Number(c[5]) > 0).sort((a, b) => Number(a[5]) - Number(b[5])).map((c) => String(c[1])),
      refs: fks.map((f) => ({ from: String(f[3]), table: String(f[2]), to: f[4] == null ? '' : String(f[4]) })),
    };
  });
}
