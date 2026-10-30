/**
 * The conformance suite on the Cloud: every case of `packages/host/test/conformance/cases.ts`, each in a fresh Durable
 * Object on workerd, over this Worker's own port and its own alarm.
 *
 * REAL, AS `kernel-in-do.test.ts` IS. Miniflare starts workerd at `wrangler.jsonc`'s compatibility date; esbuild bundles
 * the cases with the real kernel into a Durable Object class; the port is `storageSql` and `guardedSql` cut out of
 * `src/index.ts` as text, so a change to the adapter is a change to what runs here; the alarm is `alarmScheduler` from
 * `src/alarm.ts`. Both tools are reached through `wrangler`'s own dependencies (miniflare and esbuild), which are in the
 * lockfile already, so this needs nothing installed and runs offline. `@cloudflare/vitest-pool-workers` is not in the
 * tree, and this package's tests are `node --test`.
 *
 * NOT A `*.test.ts`, so `pnpm test` and CI's required set do not run it. Run it with
 * `pnpm --filter @braindog/worker conformance`, or the whole suite with `pnpm conformance` at the root. It writes
 * `packages/host/test/conformance/_results/durable-object.json` for `compare.run.ts`.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CASES, todoOn, type Outcome } from '../../../packages/host/test/conformance/cases.ts';
import { writeResults } from '../../../packages/host/test/conformance/results.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = fileURLToPath(new URL('../src/', import.meta.url));
const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as {
  build(o: object): Promise<{ outputFiles: { text: string }[] }>;
};
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { dispatchFetch(url: string, init?: RequestInit): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

/**
 * `storageSql` through `guardedSql` out of `src/index.ts`: the Worker's port as `Record$` builds it, from the first
 * function's signature to the brace that closes the second at column zero, with the `TRANSACTION` pattern between them.
 * Loud if the shape moves, because a slice that quietly caught nothing would test nothing.
 */
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const from = source.indexOf('function storageSql(');
const last = source.indexOf('function guardedSql(', from);
const end = source.indexOf('\n}\n', last);
assert.ok(from > 0 && last > from && end > last, 'storageSql and guardedSql are no longer adjacent top-level functions in src/index.ts');
const ADAPTER = `import { guarded } from '@braindog/ports';\n${source.slice(from, end + 2)}\nexport { storageSql, guardedSql };\n`;
assert.ok(ADAPTER.includes('const TRANSACTION ='), 'the TRANSACTION pattern is no longer between storageSql and guardedSql');

/** The compatibility date production runs at, so the cases run where a record runs. */
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const compatibilityDate = /"compatibility_date"\s*:\s*"([^"]+)"/.exec(wrangler)?.[1];
assert.ok(compatibilityDate, 'wrangler.jsonc names no compatibility_date');

/** The object every case runs in. One request is one case, on an object no other case has touched. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { CASES, runCase } from '../../../packages/host/test/conformance/cases.ts';
import { guardedSql } from 'adapter:worker';
import { alarmScheduler } from '../src/alarm.ts';

export class Conformance extends DurableObject {
  async fetch(request) {
    const id = decodeURIComponent(new URL(request.url).pathname.slice(1));
    if (id === '__sqlite') return Response.json({ sqlite: this.ctx.storage.sql.exec('SELECT sqlite_version() AS v').toArray()[0].v });
    const c = CASES.find((x) => x.id === id);
    if (!c) return new Response('no such case: ' + id, { status: 404 });
    let wakes = 0;
    const host = {
      name: 'durable-object',
      sql: guardedSql(this.ctx.storage),
      scheduler: alarmScheduler(this.ctx.storage, async () => { wakes++; }),
      wakes: () => wakes,
    };
    return Response.json(await runCase(c, host));
  }
  /* EVERY ALARM A CASE ARMS IS IN 2031, so this never runs; it is here so an object with an alarm has a handler. */
  async alarm() {}
}

let n = 0;
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return env.CASES.get(env.CASES.idFromName(url.pathname + ':' + ++n)).fetch(request);
  },
};
`;

let mf: InstanceType<typeof Miniflare>;
let sqlite = '';
const outcomes: Outcome[] = [];

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'conformance.entry.js', loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'adapter',
        setup(b: { onResolve: Function; onLoad: Function }) {
          b.onResolve({ filter: /^adapter:worker$/ }, (a: { path: string }) => ({ path: a.path, namespace: 'adapter' }));
          /* RESOLVED FROM `src/`, so `@braindog/ports` is the one this Worker depends on. */
          b.onLoad({ filter: /.*/, namespace: 'adapter' }, () => ({ contents: ADAPTER, loader: 'ts', resolveDir: src }));
        },
      },
    ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so a `wrangler dev` or another test already listening is never in the way. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      compatibilityDate,
      durableObjects: { CASES: { className: 'Conformance', useSQLite: true } },
    }),
  );
  sqlite = ((await (await mf.dispatchFetch('http://conformance.test/__sqlite')).json()) as { sqlite: string }).sqlite;
});

after(async () => {
  await mf?.dispose();
  const file = writeResults({
    host: 'durable-object',
    sqlite,
    runtime: `workerd through miniflare, compatibility_date ${compatibilityDate}`,
    at: new Date().toISOString(),
    outcomes,
  });
  console.log(`conformance: ${outcomes.filter((o) => o.status === 'pass').length} of ${outcomes.length} passed on durable-object; results in ${file}`);
});

for (const c of CASES) {
  const todo = todoOn(c, 'durable-object');
  test(`${c.id}: ${c.says}`, todo === undefined ? {} : { todo }, async () => {
    const res = await mf.dispatchFetch(`http://conformance.test/${encodeURIComponent(c.id)}`);
    if (!res.ok) {
      const text = await res.text();
      outcomes.push({ id: c.id, status: 'fail', trace: null, message: `the object answered ${res.status}: ${text.slice(0, 400)}` });
      assert.fail(`the object answered ${res.status}: ${text.slice(0, 400)}`);
    }
    const out = (await res.json()) as Outcome;
    outcomes.push(out);
    if (out.status === 'fail') assert.fail(out.message ?? 'failed');
  });
}
