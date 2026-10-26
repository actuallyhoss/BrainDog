/**
 * Money's own scripts run on the Cloud as the deployed Worker carries them: their `source` taken by `toString()` inside
 * a bundle built with esbuild's `keepNames`, as `wrangler` builds it, and run in a Dynamic Worker from `env.LOADER`.
 *
 * WHAT WAS MEASURED. With the deployed bundle's text, `book_from_account`, `match_payment` and `settle_matched_line`
 * were each refused "threw: __name is not defined" in 13 to 29 ms, three runs in a row, and paused, and the rules that
 * start them failed while they were paused. `script-fold.test.ts` holds the helper with a cut-down text; this holds it
 * with the three scripts themselves, so a bundler helper they gain later is caught here and not on a person's record.
 *
 * THE ROWS ARE INVENTED, and the record's reads are a map: `list` hands every row of a list and the scripts judge
 * them, as each one's decision does whatever a read hands it.
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

/** The record's side of a run, in an alarm, as `script-fold.test.ts` has it, with reads over the rows it is handed. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { ScriptOutbound, ScriptRecord, ScriptRuns, runScript } from '../src/script.ts';
import { MONEY_AUTOMATIONS } from '../../../packages/seed/src/modules/money/rules.ts';

export { ScriptOutbound, ScriptRecord };

const SCRIPTS = Object.fromEntries(MONEY_AUTOMATIONS.filter((d) => typeof d.script === 'string').map((d) => [d.script, d]));

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
    for (let i = 0; i < 800; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const out = await this.ctx.storage.get('out');
      if (out) return Response.json(out);
    }
    return Response.json({ never: true });
  }

  async alarm() {
    const { script, input, rows } = await this.ctx.storage.get('asked');
    const d = SCRIPTS[script];
    const byId = {};
    for (const r of rows) byId[r.id] = byId[r.register + '#' + r.seq] = r;
    let answer;
    try {
      answer = await runScript(
        {
          loader: this.env.LOADER,
          exports: this.ctx.exports,
          object: this.ctx.id.toString(),
          runs: this.runs,
          send: () => async () => ({ refused: { code: 'FORBIDDEN', fix: 'nothing is sent here' } }),
          grant: () => null,
          read: { list: async (register) => rows.filter((r) => r.register === register), get: async (spoken) => byId[spoken] ?? null },
          now: () => Date.now(),
        },
        {
          job: { id: 'job_' + script, kind: 'script.run', payload: '{}', leasedUntil: null },
          host: null,
          scripted: {
            script,
            version: 1,
            actor: 'script:' + script + '@v1',
            input,
            decl: { egress: d.egress, keys: d.keys, reads: d.reads, writes: d.writes, limits: d.limits, source: d.source },
            record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'UTC' },
          },
        },
      );
    } catch (e) {
      answer = { threw: String(e && e.message ? e.message : e) };
    }
    await this.ctx.storage.put('out', { answer, open: this.runs.size, names: (d.source.match(/__name\\(/g) ?? []).length });
  }
}

export default {
  fetch(request, env) {
    return env.RECORD.get(env.RECORD.idFromName('one')).fetch(request);
  },
};
`;

type Write = { op: string; spoken?: string; patch?: Record<string, unknown> };
type Answer = { writes?: Write[]; refused?: { code: string | null; why: string }; log?: string; threw?: string };
type Out = { answer: Answer; open: number; names: number; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-money-bundled.entry.js', loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    /* AS `wrangler` BUNDLES THE WORKER, which is what puts `__name` into a script's `toString()`. */
    keepNames: true,
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

const run = async (script: string, input: unknown, rows: unknown[]): Promise<Out> => {
  const res = await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify({ script, input, rows }) });
  const out = (await res.json()) as Out;
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  assert.ok(out.names > 0, `${script}'s text holds no __name, so this bundle is not the one the Worker deploys`);
  assert.equal(out.answer.refused, undefined, JSON.stringify(out.answer));
  assert.equal(out.answer.threw, undefined, JSON.stringify(out.answer));
  assert.equal(out.open, 0, 'the run was left open behind it');
  return out;
};

const EGP = (amount: number) => ({ amount, currency: 'EGP' });
const BOOK = { id: 'BK1', register: 'books', seq: 1, version: 1, fields: { name: 'Home' } };
const CARD = { id: 'AC1', register: 'accounts', seq: 1, version: 1, fields: { name: 'Everyday card', book: 'BK1' } };
const payment = (fields: Record<string, unknown>) => ({
  id: 'TX9',
  register: 'transactions',
  seq: 9,
  version: 2,
  fields: { what: 'Corner Grocer', direction: 'out', state: 'cleared', on: '2026-10-25', amount: EGP(67500), account: 'AC1', ...fields },
});

test('BOOK_FROM_ACCOUNT, AS THE WORKER CARRIES IT, FILES A NEW ENTRY IN ITS ACCOUNT\'S BOOK', async () => {
  const { answer } = await run('book_from_account', { register: 'transactions', seq: 9 }, [BOOK, CARD, payment({})]);
  assert.deepEqual(answer.writes, [{ op: 'update', spoken: 'transactions#9', patch: { book: 'BK1' }, version: 2 }]);
});

test('MATCH_PAYMENT, AS THE WORKER CARRIES IT, LINKS A PAYMENT TO THE ONE OPEN BILL IT PAID', async () => {
  const bill = { id: 'OB4', register: 'obligations', seq: 4, version: 1, fields: { what: 'Corner Grocer', direction: 'owed_by_me', state: 'open', due: '2026-10-24', amount: EGP(67500) } };
  const { answer } = await run('match_payment', { payment: 'TX9', asks: 'linked' }, [payment({}), bill]);
  assert.deepEqual(answer.writes, [{ op: 'update', spoken: 'transactions#9', patch: { settles: 'OB4' }, version: 2 }]);
});

test('MATCH_PAYMENT, AS THE WORKER CARRIES IT, LEAVES A PAYMENT NOTHING OPEN FITS, AND SAYS SO', async () => {
  const other = { id: 'OB5', register: 'obligations', seq: 5, version: 1, fields: { what: 'Corner Grocer', direction: 'owed_by_me', state: 'open', due: '2026-10-24', amount: { amount: 3000, currency: 'USD' } } };
  const { answer } = await run('match_payment', { payment: 'TX9', asks: 'linked' }, [payment({}), other]);
  assert.deepEqual(answer.writes, []);
  assert.match(answer.log ?? '', /Nothing open to Corner Grocer falls within ten days of 25 October/);
});

test('SETTLE_MATCHED_LINE, AS THE WORKER CARRIES IT, MOVES ON THE REPEATING LINE A PAYMENT PAID', async () => {
  const line = {
    id: 'RC2',
    register: 'recurring',
    seq: 2,
    version: 3,
    fields: { what: 'Corner Grocer', direction: 'out', state: 'live', every: 'monthly', next_due: '2026-10-25', amount: EGP(67500) },
  };
  const { answer } = await run('settle_matched_line', { payment: 'TX9' }, [payment({}), line]);
  const moved = (answer.writes ?? []).find((w) => w.spoken === 'recurring#2');
  assert.ok(moved, JSON.stringify(answer));
  assert.equal(moved.patch?.['next_due'], '2026-11-25');
  assert.equal(moved.patch?.['last_paid'], '2026-10-25');
});
