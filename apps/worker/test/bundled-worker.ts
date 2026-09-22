/**
 * `src/index.ts` as it ships, loadable under `node --test`, and a Durable Object's `storage` for its `Record$`.
 *
 * THE SAME TWO HELPERS `spark.test.ts` DEFINES FOR ITSELF, and there for the reason it gives: `src/index.ts` imports
 * `cloudflare:workers`, which Node cannot load, and reading the file as text cannot tell a refusal that runs from one
 * written after the `return` that forwards. So the file is bundled by `wrangler`'s own esbuild with that one import
 * answered by a two-line base class, which is all `Record$` and `Directory$` take from it. They are a module here so the
 * suites written after `spark.test.ts` share one copy; that file keeps its own until somebody who owns it moves it over.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Handler = { fetch(request: Request, env: object, ctx: object): Promise<Response> };
export type RecordObject = { fetch(request: Request): Promise<Response>; create(args: object): Promise<unknown> };
/** The Directory's methods a test calls, loosely: their real signatures are `src/index.ts`'s, which Node cannot typecheck. */
export type DirectoryObject = {
  auth(call: object): Promise<{ status: number; body?: unknown; session?: { sid: string } | 'clear'; mail?: { claimToken?: string } }>;
  prepare(slug: string, email: string, name: string | null): { person?: { id: string }; refusal?: unknown };
  nameRecord(slug: string, email: string, record: string): unknown;
};
export type Bundle = {
  default: Handler;
  Record$: new (ctx: object, env: object) => RecordObject;
  Directory$: new (ctx: object, env: object) => DirectoryObject;
};

/** `src/index.ts` as one module, bundled the way `wrangler` would bundle it, with `cloudflare:workers` a bare base class. */
export const bundled = async (): Promise<Bundle> => {
  const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
  const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'cloudflare-workers',
        setup(b: { onResolve: Function; onLoad: Function }) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cf', namespace: 'cf' }));
          b.onLoad({ filter: /.*/, namespace: 'cf' }, () => ({
            contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
            loader: 'js',
          }));
        },
      },
    ],
  });
  /* OUTSIDE THE TREE AND GONE AGAIN before the tests run: a bundle left beside the source is a second copy of the Worker. */
  const dir = mkdtempSync(join(tmpdir(), 'braindog-worker-'));
  try {
    const file = join(dir, 'index.mjs');
    writeFileSync(file, built.outputFiles[0]!.text);
    return (await import(pathToFileURL(file).href)) as Bundle;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * A Durable Object's `storage` over `node:sqlite`: `sql.exec`, `transactionSync` and the alarm, which is all `Record$` calls.
 *
 * `prepare` ON A SCRIPT RUNS ITS FIRST STATEMENT AND DROPS THE REST without a word, measured on Node 24.13 in
 * `spark.test.ts`, so a statement that reads nothing and takes no parameters goes through `exec`, which runs all of it.
 */
export const objectStorage = () => {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  let alarm: number | null = null;
  const cursor = (rows: unknown[]) => ({ toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() });
  return {
    sql: {
      exec(text: string, ...params: never[]) {
        const statement = db.prepare(text);
        if (statement.columns().length > 0) return cursor(statement.all(...params));
        if (params.length === 0) db.exec(text);
        else statement.run(...params);
        return cursor([]);
      },
    },
    transactionSync<T>(fn: () => T): T {
      const point = `sp${depth++}`;
      db.exec(`SAVEPOINT ${point}`);
      try {
        const value = fn();
        db.exec(`RELEASE ${point}`);
        return value;
      } catch (e) {
        db.exec(`ROLLBACK TO ${point}`);
        db.exec(`RELEASE ${point}`);
        throw e;
      } finally {
        depth--;
      }
    },
    getAlarm: async () => alarm,
    setAlarm: async (at: number | Date) => void (alarm = Number(at)),
    deleteAlarm: async () => void (alarm = null),
  };
};
