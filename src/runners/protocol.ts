import type { PythonOutcome } from './pythonCore';
import type { SqlOutcome, SqlTable } from './sqlCore';

// Messages between the UI and the runner workers.

export type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'python'; code: string; setup: string; checkExpr?: string }
  | { id: number; type: 'sql'; setup: string; query: string }
  | { id: number; type: 'sql-schema'; setup: string };

export type WorkerResponse = { id: number; result: unknown } | { id: number; crash: string };

export type { PythonOutcome, SqlOutcome, SqlTable };
