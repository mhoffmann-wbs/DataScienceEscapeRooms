import type { PythonOutcome, SqlOutcome, WorkerRequest, WorkerResponse } from './protocol';

type Request = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** Loading Pyodide can take a while on slow connections; running student code must not. */
const INIT_TIMEOUT_MS = 120_000;
export const RUN_TIMEOUT_MS = 10_000;

export class RunTimeout extends Error {}

/**
 * Talks to one runner worker. Workers are created on first use, so Pyodide is only
 * downloaded once a Python puzzle opens. A run that exceeds its timeout (e.g. an
 * endless loop) terminates the worker; the next run starts a fresh one.
 */
class WorkerRunner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(private readonly create: () => Worker) {}

  /** Starts loading the runtime in the background. */
  warmUp(): Promise<void> {
    if (!this.ready) {
      this.ready = this.send({ type: 'init' }, INIT_TIMEOUT_MS).then(() => undefined);
      this.ready.catch(() => (this.ready = null));
    }
    return this.ready;
  }

  async request<T>(req: Request): Promise<T> {
    await this.warmUp();
    return (await this.send(req, RUN_TIMEOUT_MS)) as T;
  }

  private send(req: Request, timeoutMs: number): Promise<unknown> {
    const worker = (this.worker ??= this.spawn());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reset(new RunTimeout(`timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  private spawn(): Worker {
    const worker = this.create();
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if ('crash' in e.data) p.reject(new Error(e.data.crash));
      else p.resolve(e.data.result);
    };
    worker.onerror = (e) => this.reset(new Error(e.message || 'runner crashed'));
    return worker;
  }

  private reset(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((p) => p.reject(error));
  }
}

const python = new WorkerRunner(() => new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' }));
const sql = new WorkerRunner(() => new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' }));

export const runners = {
  warmUp: (kind: 'python' | 'sql') => (kind === 'python' ? python : sql).warmUp(),
  python: (code: string, setup: string, checkExpr?: string) => python.request<PythonOutcome>({ type: 'python', code, setup, checkExpr }),
  sql: (setup: string, query: string) => sql.request<SqlOutcome>({ type: 'sql', setup, query }),
  sqlSchema: (setup: string) => sql.request<{ name: string; columns: string[] }[]>({ type: 'sql-schema', setup }),
};
