/**
 * The kernel inside a real Durable Object, on workerd, with the Worker's own `Sql` adapter.
 *
 * NOTHING ELSE IN THIS TREE RUNS THE KERNEL WHERE THE CLOUD RUNS IT, and that is how a raw `SAVEPOINT`
 * in `packages/kernel/src/tx.ts` shipped: `/api/keys/put` and `/api/invite` answered 500 with the
 * Durable Object's sentence ("please use the state.storage.transaction() or
 * state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements")
 * while this package's 179 tests and the kernel's 1001 were green, because every one of them was
 * `node:sqlite` or read `src/index.ts` as text (`loop/research-provision-day.md`, "Reason two").
 *
 * REAL, NOT A FAKE. Miniflare starts workerd, the DO class below is bundled with the real kernel by
 * esbuild, and `storageSql` is not a copy: it is cut out of `src/index.ts` as text at test time, the
 * way the other tests here read that file, so a change to the adapter is a change to what runs here.
 * Both tools are reached through `wrangler`'s own dependencies, which is why `package.json` gains
 * nothing: wrangler 4.129.0 already brings miniflare 5.20260903.0-alpha, workerd 1.20260903.1 and
 * esbuild 0.28.1, and a second copy pinned beside it could only disagree with the one that deploys.
 *
 * SLOW BY THE STANDARDS OF THIS SUITE, about two seconds, nearly all of it workerd starting once.
 *
 * THE VAULT CASES AT THE END WERE RED ON 23 SEPTEMBER against the adapter that handed the kernel each BLOB as the
 * object's `ArrayBuffer`: the export's grant line read `...,"api_token",1,{},{},...`, and the old file imported into a
 * second object answered `ok` holding `["[object String]","[object Object]"]` where the ciphertext had been.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as {
  build(o: object): Promise<{ outputFiles: { text: string }[] }>;
};
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { dispatchFetch(url: string, init?: RequestInit): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

/**
 * `storageSql` out of `src/index.ts`, from its signature to the brace that closes it at column zero.
 * Loud if the shape moves, because a slice that quietly caught nothing would test nothing.
 */
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const at = source.indexOf('function storageSql(');
const end = source.indexOf('\n}\n', at);
assert.ok(at > 0 && end > at, 'storageSql is no longer a top-level function in src/index.ts, and this test cuts it out by that shape');
const ADAPTER = `${source.slice(at, end + 2)}\nexport { storageSql };\n`;

/**
 * The same adapter with its nesting guard handing nested calls to the Durable Object instead of
 * calling `fn()` directly: the one-line change this test's `todo` is waiting on, run here so the
 * claim that it is enough is a measurement.
 */
const GUARD = 'if (depth > 0) return fn();';
const FIXED = 'if (depth > 0) return storage.transactionSync(fn);';
assert.ok(ADAPTER.includes(GUARD) || ADAPTER.includes(FIXED), 'the nesting guard in storageSql changed; update the delegating variant below');
/* Since 22 September the adapter delegates itself, so this variant is the adapter as shipped, and the
   test that runs "the adapter as it stands" is the one that stops it going back to `fn()`. */
const DELEGATING = ADAPTER.replace(GUARD, FIXED);

/**
 * The adapter as it was before it wrapped each BLOB, handing the kernel the `ArrayBuffer` a Durable Object returns: the
 * Worker that wrote every export and nightly copy with `{}` for each sealed column. Run here so the claim that such a
 * copy is refused at import is a measurement on workerd, not only on `node:sqlite`. Loud if the wrap moves, because an
 * unwrapped variant that matched nothing would be the repaired adapter under the old one's name.
 */
const WRAP = '.toArray().map(bytesIn)';
assert.equal(ADAPTER.split(WRAP).length - 1, 2, 'storageSql no longer wraps its BLOBs in all and one by this text; update the unwrapped variant below');
const UNWRAPPED = ADAPTER.replaceAll(WRAP, '.toArray()');

const NOW = Date.UTC(2026, 8, 22, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** The object under test. Each request is one scenario on a fresh object, answered as JSON. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { openRecord } from '@braindog/kernel';
import { attempt } from '../../../packages/kernel/src/tx.ts';
import { storageSql as real } from 'adapter:real';
import { storageSql as delegating } from 'adapter:delegating';
import { storageSql as unwrapped } from 'adapter:unwrapped';
import { testSigner } from '../../../packages/kernel/test/signer.ts';

const NOPE = { ok: false, refusal: { code: 'NOPE', fix: 'no' } };
const GRANT = () => ({ label: 'stats read', opens: 'stats.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 9]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' });
/* WHAT THE KERNEL READ BACK, by its own tag and its bytes, so an ArrayBuffer and a Uint8Array are told apart. */
const held = (v) =>
  v == null ? null
  : v instanceof ArrayBuffer ? [Object.prototype.toString.call(v), Array.from(new Uint8Array(v))]
  : ArrayBuffer.isView(v) ? [Object.prototype.toString.call(v), Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))]
  : [Object.prototype.toString.call(v), v];

class Rec extends DurableObject {
  adapter = real;
  async fetch(request) {
    const scenario = new URL(request.url).pathname.slice(1);
    const sql = this.adapter(this.ctx.storage);
    /* A SIGNER ONLY WHERE A FILE IS IMPORTED, because an unsigned file is refused before a row is read. Made inside
       the request, because workerd refuses to generate a key in the global scope. */
    const k = await openRecord(sql, { now: () => ${NOW} }, scenario.startsWith('vault-') ? { sign: testSigner() } : {});
    const outcome = (r) => (r.ok ? 'ok' : r.refusal.code);
    if (scenario === 'vault-import') {
      /* INTO AN EMPTY RECORD, so no createRecord here: the file brings the record with it. */
      const out = await k.import(await request.json());
      const again = out.ok ? await k.export() : null;
      return Response.json({
        out: outcome(out),
        fix: out.ok ? null : out.refusal.fix,
        at: out.ok ? null : (out.refusal.at ?? null),
        held: held(sql.one('SELECT ciphertext FROM grant')?.ciphertext),
        lines: again && again.ok ? again.value : null,
      });
    }
    const made = k.createRecord({ id: '${REC}', slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } });
    if (!made.ok) return Response.json({ threw: made.refusal.fix });
    sql.exec('CREATE TABLE probe (x TEXT)');
    const rows = () => sql.all('SELECT x FROM probe ORDER BY rowid').map((r) => r.x);
    try {
      switch (scenario) {
        case 'vault-export': {
          const bound = k.bindGrant(GRANT(), 'p_1');
          const out = await k.export();
          return Response.json({ out: outcome(bound), held: held(sql.one('SELECT ciphertext FROM grant')?.ciphertext), lines: out.ok ? out.value : null });
        }
        case 'bind':
          return Response.json({ out: outcome(k.bindGrant(GRANT(), 'p_1')), grants: k.grants().length });
        case 'invite':
          return Response.json({ out: outcome(await k.createInvitation('p_1', { email: 'bea@example.test', level: 'write' })) });
        case 'refuse-top': {
          const out = attempt(sql, k.transaction, () => (sql.exec("INSERT INTO probe VALUES ('half')"), NOPE));
          return Response.json({ out: outcome(out), rows: rows() });
        }
        case 'bind-nested':
          return Response.json({ out: outcome(k.transaction(() => k.bindGrant(GRANT(), 'p_1'))), grants: k.grants().length });
        case 'refuse-nested': {
          const out = k.transaction(() => {
            sql.exec("INSERT INTO probe VALUES ('outer')");
            const r = attempt(sql, k.transaction, () => (sql.exec("INSERT INTO probe VALUES ('inner')"), NOPE));
            sql.exec("INSERT INTO probe VALUES ('after')");
            return r;
          });
          return Response.json({ out: outcome(out), rows: rows() });
        }
        case 'throw': {
          let threw = null;
          try {
            k.transaction(() => attempt(sql, k.transaction, () => { sql.exec("INSERT INTO probe VALUES ('thrown')"); throw new TypeError('a real error'); }));
          } catch (e) {
            threw = e.message;
          }
          return Response.json({ threw, rows: rows() });
        }
      }
      return new Response('no such scenario', { status: 404 });
    } catch (e) {
      return Response.json({ threw: String(e && e.message) });
    }
  }
}

export class RealRecord extends Rec {}
export class DelegatingRecord extends Rec {
  adapter = delegating;
}
export class UnwrappedRecord extends Rec {
  adapter = unwrapped;
}

let n = 0;
export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const which = url.searchParams.get('adapter');
    const ns = which === 'delegating' ? env.DELEGATING : which === 'unwrapped' ? env.UNWRAPPED : env.REAL;
    return ns.get(ns.idFromName(url.pathname + ':' + ++n)).fetch(request);
  },
};
`;

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'kernel-in-do.entry.js', loader: 'js' },
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
          b.onResolve({ filter: /^adapter:/ }, (a: { path: string }) => ({ path: a.path, namespace: 'adapter' }));
          b.onLoad({ filter: /.*/, namespace: 'adapter' }, (a: { path: string }) => ({
            contents: a.path === 'adapter:real' ? ADAPTER : a.path === 'adapter:unwrapped' ? UNWRAPPED : DELEGATING,
            loader: 'ts',
          }));
        },
      },
    ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so the system picks a free one: a fixed port would collide with `wrangler dev` or a
         gate run that is already listening, and this test must be safe to run beside either. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      compatibilityDate: '2025-09-01',
      durableObjects: {
        REAL: { className: 'RealRecord', useSQLite: true },
        DELEGATING: { className: 'DelegatingRecord', useSQLite: true },
        UNWRAPPED: { className: 'UnwrappedRecord', useSQLite: true },
      },
    }),
  );
});

after(async () => {
  await mf?.dispose();
});

type Answer = {
  out?: string;
  rows?: string[];
  grants?: number;
  threw?: string | null;
  fix?: string | null;
  at?: string | null;
  held?: [string, number[]] | null;
  lines?: string[] | null;
};

const run = async (scenario: string, adapter: 'real' | 'delegating' | 'unwrapped' = 'real', body?: unknown) =>
  (await (
    await mf.dispatchFetch(
      `http://record.test/${scenario}?adapter=${adapter}`,
      body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) },
    )
  ).json()) as Answer;

test('THE VAULT DEPOSIT ON A DURABLE OBJECT: bindGrant seals and binds, where it answered 500', async () => {
  assert.deepEqual(await run('bind'), { out: 'ok', grants: 1 });
});

test('AN INVITATION ON A DURABLE OBJECT: the second door the research drove to the same 500', async () => {
  assert.deepEqual(await run('invite'), { out: 'ok' });
});

test('A TOP-LEVEL REFUSAL ON A DURABLE OBJECT WRITES NOTHING, and comes back as a refusal rather than a throw', async () => {
  assert.deepEqual(await run('refuse-top'), { out: 'NOPE', rows: [] });
});

test('A SEALING WRITE INSIDE SOMEBODY ELSE\'S TRANSACTION COMMITS WITH IT on a Durable Object', async () => {
  assert.deepEqual(await run('bind-nested'), { out: 'ok', grants: 1 });
});

test('A REAL THROW ON A DURABLE OBJECT STILL ROLLS BACK AND GOES UP as itself', async () => {
  assert.deepEqual(await run('throw'), { threw: 'a real error', rows: [] });
});

test(
  'A NESTED REFUSAL ON A DURABLE OBJECT ROLLS BACK ONLY ITS OWN WRITES, through the adapter as it stands',
  async () => {
    assert.deepEqual(await run('refuse-nested'), { out: 'NOPE', rows: ['outer', 'after'] });
  },
);

test('A NESTED REFUSAL ROLLS BACK ONLY ITS OWN WRITES once the adapter hands nested calls to storage.transactionSync', async () => {
  assert.deepEqual(await run('refuse-nested', 'delegating'), { out: 'NOPE', rows: ['outer', 'after'] });
  /* And the delegating adapter changes nothing else the kernel relies on. */
  assert.deepEqual(await run('bind', 'delegating'), { out: 'ok', grants: 1 });
  assert.deepEqual(await run('bind-nested', 'delegating'), { out: 'ok', grants: 1 });
  assert.deepEqual(await run('throw', 'delegating'), { threw: 'a real error', rows: [] });
});

/* ── the vault, through export and import ─────────────────────────────────────────────────────────────────────────── */

/* THE EXPORT WROTE EVERY BLOB AS `{}` ON A DURABLE OBJECT, `loop/research-batch-forty-five-audit.md` §1. The object hands a
   BLOB back as an `ArrayBuffer`, `encode` in `packages/kernel/src/brainl.ts` writes `{ b64 }` only for a `Uint8Array`,
   and `JSON.stringify` writes an `ArrayBuffer` as `{}`. So the owner's export and the nightly copy (`snapshots.ts`, the
   same call) held every row and none of the vault, signed over the `{}` and looking whole, and a restore into another
   object answered `ok` with the text `[object Object]` where each sealed column had been. Every R2 copy made before this
   repair carries no vault. [1, 2, 3] is `AQID`. */
const grantLine = (lines: string[] | null | undefined) => (lines ?? []).find((l) => l.includes('stats.example.test'));

test('A SEALED ROW SURVIVES EXPORT AND IMPORT ON A DURABLE OBJECT, written as b64 and read back as the same bytes', async () => {
  const exported = await run('vault-export');
  assert.equal(exported.out, 'ok');
  const line = grantLine(exported.lines);
  assert.ok(line, 'the export holds no grant line');
  assert.match(line, /\{"b64":"AQID"\}/, `the grant's ciphertext is not in the export: ${line}`);
  /* THE KERNEL READS A Uint8Array, the shape `node:sqlite` hands the self-host, so no reader of a BLOB meets two shapes. */
  assert.deepEqual(exported.held, ['[object Uint8Array]', [1, 2, 3]]);

  const imported = await run('vault-import', 'real', exported.lines);
  assert.equal(imported.out, 'ok', imported.fix ?? '');
  assert.deepEqual(imported.held, ['[object Uint8Array]', [1, 2, 3]], 'the restored grant does not hold the bytes that were sealed');
  /* AND THE SECOND OBJECT'S EXPORT SAYS THE SAME, which is the only evidence the round trip lost nothing. */
  assert.equal(grantLine(imported.lines), line);
});

test('A COPY WRITTEN BEFORE THE REPAIR IS REFUSED ON A DURABLE OBJECT, at the column it lost, and not restored as text', async () => {
  const old = await run('vault-export', 'unwrapped');
  const line = grantLine(old.lines);
  assert.ok(line && !line.includes('"b64"'), `the unwrapped adapter no longer writes the old file, so this tests nothing: ${line}`);
  const imported = await run('vault-import', 'real', old.lines);
  assert.equal(imported.out, 'FILE_MALFORMED', `a file with no vault in it was restored: ${JSON.stringify(imported)}`);
  assert.equal(imported.at, 'grant.ciphertext');
  assert.equal(imported.held, null, 'a refused import left a grant behind');
});
