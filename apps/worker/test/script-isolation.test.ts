/**
 * What the Cloud's loaded Worker must not keep, and whom a key may reach from it, run the way `test/script.test.ts` runs a script: `src/script.ts` bundled by esbuild and run in
 * workerd from a Durable Object's `alarm()`.
 *
 * ONE SCRIPT, TWO RUNTIMES, UNTIL THIS FILE. The self-host starts every run in a fresh QuickJS instance, and the Cloud
 * cached one Worker per version under `<record>:<script>:v<n>`, so every run of a version shared its `globalThis`: the
 * second run read "one,two" off what the first had left there. And a run that spun without awaiting could not
 * be ended by the raced deadline, because locally the loaded Worker runs on the object's thread, so a four-second loop
 * under `wall_ms: 500` answered clean with its log; the self-host refuses any run that answers past its deadline.
 *
 * THE VAULT HERE IS `grantNamed` OVER ROWS, the lookup `src/index.ts` passes, and not a stub that answers any label
 * with a grant: the rule under test is that a grant's `opens` decides where its key may go, so the rows have to carry
 * one. `openKey` answers each grant's bytes by label, and the provider double echoes the authorization header back in
 * the spelling its path names, as `apps/selfhost/test/script-key-egress.test.ts` does on the other host.
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

const GOLD = 'https://api.gold.test';
const COLLECTOR = 'https://collector.test';
/** A key with a `/` in it, so its JSON-escaped and URL-encoded spellings differ from the bytes. */
const KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { sendAction } from '@braindog/host/actions';
import { grantNamed } from '@braindog/host/script';
import { ScriptOutbound, ScriptRecord, ScriptRuns, runScript } from '../src/script.ts';

export { ScriptOutbound, ScriptRecord };

const at = '2026-09-22T00:00:00.000Z';
const VAULT = [
  { id: 'g_gold', label: 'goldapi', opens: 'api.gold.test', revoked_at: null, created_at: at },
  { id: 'g_slash', label: 'slash', opens: 'collector.test', revoked_at: null, created_at: at },
];
const BYTES = { goldapi: ${JSON.stringify(KEY)}, slash: 'SECRET-OF-slash' };

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
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const out = await this.ctx.storage.get('out');
      if (out) return Response.json(out);
    }
    return Response.json({ never: true });
  }

  async alarm() {
    const scripted = await this.ctx.storage.get('asked');
    const sent = [];
    const send = sendAction({
      origins: () => scripted.scripted.decl.egress,
      openKey: async (grant) => BYTES[grant.label] ?? null,
      send: async (url, init) => {
        const heard = init.headers.get('authorization') ?? '';
        sent.push({ host: url.host, auth: heard });
        const body =
          url.pathname === '/php' ? JSON.stringify({ heard }).replaceAll('/', '\\\\/')
          : url.pathname === '/b64' ? JSON.stringify({ heard: btoa(heard) })
          : url.pathname === '/url' ? JSON.stringify({ heard: encodeURIComponent(heard) })
          : JSON.stringify({ heard });
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
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
          grant: grantNamed(() => VAULT),
          now: () => Date.now(),
        },
        scripted,
      );
    } catch (e) {
      answer = { threw: String(e && e.message ? e.message : e) };
    }
    await this.ctx.storage.put('out', { answer, sent, open: this.runs.size });
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
type Out = { answer: Answer; sent: { host: string; auth: string }[]; open: number; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-isolation.entry.js', loader: 'js' },
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

/** One version per distinct source and declaration, as the kernel keeps them; the same pair twice is the same version. */
const versions = new Map<string, number>();
const versionOf = (key: string): number => {
  if (!versions.has(key)) versions.set(key, versions.size + 1);
  return versions.get(key)!;
};

const run = async (source: string, over: Record<string, unknown> = {}): Promise<Out> => {
  const version = versionOf(source + JSON.stringify(over));
  const scripted = {
    job: { id: 'job_relay_1', kind: 'script.run', payload: '{}', leasedUntil: null },
    host: 'api.gold.test',
    scripted: {
      script: 'relay',
      version,
      actor: `script:relay@v${version}`,
      input: null,
      decl: { egress: [GOLD, COLLECTOR], keys: ['goldapi'], reads: [], writes: ['seen'], limits: { wall_ms: 5_000 }, source, ...over },
      record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'UTC' },
    },
  };
  const res = await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify(scripted) });
  const out = (await res.json()) as Out;
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  return out;
};

test('EVERY RUN OF ONE VERSION STARTS FRESH: the second run does not see what the first left on globalThis', async () => {
  /* MEASURED BEFORE THIS: `run two -> {"writes":[],"log":"seen by run two: one,two"}`, where QuickJS would have said "one". */
  const source = `
export default async function run(ctx) {
  globalThis.seen = (globalThis.seen ?? 0) + 1;
  ctx.log('seen ' + globalThis.seen);
}`;
  const first = await run(source);
  const second = await run(source);
  assert.equal(first.answer.log, 'seen 1', JSON.stringify(first.answer));
  assert.equal(second.answer.log, 'seen 1', 'the second run of the same version read the first run\'s module state');
});

test('A RUN THAT ANSWERS PAST ITS wall_ms IS REFUSED, even when it never awaited and the raced deadline could not fire', async () => {
  /* MEASURED BEFORE THIS: a busy loop under `wall_ms: 500` answered `{"writes":[],"log":"spun",...,"wall_ms":4011}`. The
     loop is bounded by a count as well as the clock, so a runtime whose clock stood still inside it still ends. */
  const { answer } = await run(
    `
export default async function run(ctx) {
  const t = Date.now();
  for (let i = 0; i < 2e9 && Date.now() - t < 1200; i++) {}
  ctx.log('spun');
  ctx.write('seen', { said: 'spun' });
}`,
    { limits: { wall_ms: 300 } },
  );
  assert.equal(answer.refused?.code, 'OUT_OF_BOUNDS', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /ran past its wall_ms of 300/);
  assert.equal(answer.writes, undefined);
});

test('THROUGH THE GATEWAY, goldapi goes to api.gold.test and is refused for collector.test, and nothing is sent', async () => {
  const home = await run(`export default async function run(ctx) { await ctx.fetch('${GOLD}/rate', { key: 'goldapi' }); }`);
  assert.equal(home.answer.refused, undefined, JSON.stringify(home.answer));
  assert.deepEqual(home.sent.map((s) => s.host), ['api.gold.test']);

  const away = await run(`
export default async function run(ctx) {
  try { await ctx.fetch('${COLLECTOR}/in', { key: 'goldapi' }); } catch (e) { ctx.log('caught'); }
  await ctx.fetch('${COLLECTOR}/bare');
}`);
  assert.equal(away.answer.refused?.code, 'FORBIDDEN', JSON.stringify(away.answer));
  assert.match(away.answer.refused?.why ?? '', /The key "goldapi" opens api\.gold\.test, and relay fetched collector\.test with it/);
  assert.deepEqual(away.sent, [], 'a request left after the key was sent where it does not open');
});

test("THROUGH THE GATEWAY, a script naming the vault's `slash` key is refused before it runs, and nothing is sent", async () => {
  const { answer, sent } = await run(`export default async function run(ctx) { await ctx.fetch('${COLLECTOR}/in', { key: 'slash' }); }`, { egress: [COLLECTOR], keys: ['slash'] });
  assert.equal(answer.refused?.code, 'FORBIDDEN', JSON.stringify(answer));
  assert.match(answer.refused?.why ?? '', /slash/);
  assert.deepEqual(sent, []);
});

test('THROUGH THE GATEWAY, the key is scrubbed JSON-escaped, base64 and URL-encoded before the script reads the answer', async () => {
  const { answer, sent } = await run(`
export default async function run(ctx) {
  for (const path of ['/php', '/b64', '/url']) {
    const r = await ctx.fetch('${GOLD}' + path, { key: 'goldapi' });
    ctx.log(path + ' ' + (await r.text()));
  }
}`);
  assert.equal(answer.refused, undefined, JSON.stringify(answer));
  assert.equal(sent.length, 3);
  const log = answer.log ?? '';
  for (const [how, spelling] of [
    ['JSON-escaped', KEY.replaceAll('/', '\\/')],
    ['URL-encoded', encodeURIComponent(KEY)],
    ['base64', btoa(`Bearer ${KEY}`).slice(12, 44)],
  ] as const)
    assert.equal(log.includes(spelling), false, `the key reached the sandbox ${how}: ${log}`);
  assert.equal(log.split('--redacted--').length - 1, 3, log);
});
