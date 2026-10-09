/**
 * The one question a script may end its run by asking (N6) survives the Cloud's runner: what the source returns as
 * `{ ask }` comes back from `runScript` beside the writes, for `finishScript` to check and file.
 *
 * BEFORE THIS THE RETURN VALUE WAS THROWN AWAY (`await source.default(ctx)` and nothing kept), so Money's month-end
 * script asked its question to nobody. The first case runs that script itself, `last-day.js` as the seed ships it, in a
 * Dynamic Worker from an alarm, the way `script.test.ts` runs every script, over two Repeating lines on 30 September.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { dispatchFetch(url: string, init?: object): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const LAST_DAY = readFileSync(new URL('../../../packages/seed/src/modules/money/scripts/last-day.js', import.meta.url), 'utf8');

/** Two monthly lines on a 30th, as `ctx.record.list('recurring', ...)` hands them to the script. */
const LINES = [
  { seq: 1, version: 3, fields: { what: 'Rent', every: 'monthly', state: 'live', next_due: '2026-09-30' } },
  { seq: 2, version: 1, fields: { what: 'Salary', every: 'monthly', state: 'live', next_due: '2026-09-30' } },
];

/** `script.test.ts`'s record, cut to what a run with no fetch needs: the run happens in `alarm()`. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { ScriptOutbound, ScriptRecord, ScriptRuns, runScript } from '../src/script.ts';

export { ScriptOutbound, ScriptRecord };

export class Rec extends DurableObject {
  runs = new ScriptRuns();
  async script(run, call) { return this.runs.answer(run, call); }
  async fetch(request) {
    await this.ctx.storage.delete('out');
    await this.ctx.storage.put('asked', await request.json());
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
    const answer = await runScript({
      loader: this.env.LOADER,
      exports: this.ctx.exports,
      object: this.ctx.id.toString(),
      runs: this.runs,
      send: () => async () => { throw new Error('nothing is sent'); },
      grant: () => null,
      read: { list: async () => ${JSON.stringify(LINES)}, get: async () => null },
      now: () => Date.UTC(2026, 9, 9, 6),
    }, scripted);
    await this.ctx.storage.put('out', { answer });
  }
}

export default { fetch: (request, env) => env.RECORD.get(env.RECORD.idFromName('one')).fetch(request) };
`;

type Answer = { writes?: unknown[]; log?: string; refused?: { why: string }; ask?: Record<string, unknown> };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-ask.entry.js', loader: 'js' },
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

let n = 0;
const run = async (source: string, writes = ['recurring']): Promise<Answer> => {
  n += 1;
  const scripted = {
    job: { id: `job_ask_${n}`, kind: 'script.run', payload: '{}', leasedUntil: null },
    host: null,
    scripted: {
      script: 'last_day',
      version: n,
      actor: `script:last_day@v${n}`,
      input: null,
      decl: { egress: [], keys: [], reads: ['recurring'], writes, limits: { wall_ms: 5_000 }, source },
      record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'Africa/Cairo' },
    },
  };
  const out = (await (await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify(scripted) })).json()) as { answer: Answer; never?: true };
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  return out.answer;
};

test("MONEY'S MONTH-END SCRIPT ASKS ITS ONE QUESTION, and the Cloud's runner hands it back whole", async () => {
  const answer = await run(LAST_DAY);
  assert.equal(answer.refused, undefined, answer.refused?.why);
  assert.deepEqual(answer.writes, []);
  const ask = answer.ask as { cause: string; question: string; about: string[]; options: { label: string; patches: unknown[] }[] };
  assert.equal(ask.cause, 'money.last-day');
  assert.equal(ask.question, '2 repeating lines fall on the last day of their month. Is each the last day, or that date?');
  assert.deepEqual(ask.about, ['Rent, 30 September', 'Salary, 30 September']);
  assert.deepEqual(
    ask.options.map((o) => o.label),
    ['The last day', 'That date'],
  );
  assert.deepEqual(ask.options[1]!.patches, [
    { id: 'recurring#1', version: 3, fields: { day_of_month: '30' } },
    { id: 'recurring#2', version: 1, fields: { day_of_month: '30' } },
  ]);
});

test('THE ASK RIDES BESIDE THE WRITES as data: what JSON cannot carry is dropped, and the run is not', async () => {
  const answer = await run(`export default async function run(ctx) {
    ctx.write('recurring', { what: 'Water' });
    return { ask: { question: 'Which?', options: [{ label: 'One', said: () => 1 }, { label: 'Two' }] } };
  }`);
  assert.deepEqual(answer.writes, [{ op: 'create', register: 'recurring', fields: { what: 'Water' } }]);
  assert.deepEqual(answer.ask, { question: 'Which?', options: [{ label: 'One' }, { label: 'Two' }] });
});

test('A RUN THAT RETURNS NO ASK ANSWERS NONE, and one whose ask cannot be carried is the script throwing', async () => {
  const none = await run('export default async function run(ctx) { return { filled: 2 }; }');
  assert.equal('ask' in none, false);
  assert.deepEqual(none.writes, []);
  const looped = await run('export default async function run(ctx) { const ask = { question: "Which?" }; ask.again = ask; return { ask }; }');
  assert.match(looped.refused?.why ?? '', /threw/u);
  assert.equal(looped.ask, undefined);
});
