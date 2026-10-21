/**
 * `ctx.propose` on the Cloud, run the way `test/script-fold.test.ts` runs `ctx.fold`: `src/script.ts` bundled by esbuild,
 * the script in a Dynamic Worker from `env.LOADER`, and the call going through `ScriptRecord` back into the record's
 * object, where the run's own proposals (`scriptProposals` on a real record, a stand-in here) answer it and keep the
 * queue the run hands back for `finishScript` to file.
 *
 * THE SAME SHAPE ON BOTH HOSTS. The self-host's path, the record's gate and all, is
 * `apps/selfhost/test/script-propose.test.ts`; this holds the Worker to handing the call through, answering what the
 * record said, carrying the queue on the answer, and handing no `ctx.propose` to a run whose wiring files nothing.
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


/** The record's side of a run, in an alarm, as `script.test.ts` has it, with a stand-in for the run's proposals. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
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
    for (let i = 0; i < 800; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const out = await this.ctx.storage.get('out');
      if (out) return Response.json(out);
    }
    return Response.json({ never: true });
  }

  async alarm() {
    const scripted = await this.ctx.storage.get('asked');
    const files = scripted.scripted.script !== 'files-nothing';
    const queue = [];
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
          read: undefined,
          /* THE RECORD'S ANSWER, STOOD IN: a rowset is queued, anything else refused in the record's usual shape. */
          propose: files
            ? () => ({
                propose: async (p) => {
                  if (p === null || p.body_kind !== 'rowset') return { ok: false, refusal: { code: 'ENUM_VALUE_UNKNOWN', fix: 'A script asks about rows.', at: 'body_kind' } };
                  queue.push(p);
                  return { ok: true, value: { queued: true } };
                },
                queued: () => [...queue],
              })
            : undefined,
          now: () => Date.now(),
        },
        scripted,
      );
    } catch (e) {
      answer = { threw: String(e && e.message ? e.message : e) };
    }
    await this.ctx.storage.put('out', { answer, open: this.runs.size });
  }
}

export default {
  fetch(request, env) {
    return env.RECORD.get(env.RECORD.idFromName('one')).fetch(request);
  },
};
`;

type Answer = { writes?: unknown[]; proposals?: unknown[]; refused?: { code: string | null; why: string }; log?: string; threw?: string };
type Out = { answer: Answer; open: number; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-propose.entry.js', loader: 'js' },
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

let version = 0;

/** One leased `script.run` of a script that reads nothing, as `prepareScript` hands it to a host. */
const run = async (name: string, source: string): Promise<Out> => {
  version += 1;
  const scripted = {
    job: { id: `job_${name}`, kind: 'script.run', payload: '{}', leasedUntil: null },
    host: null,
    scripted: {
      script: name,
      version,
      actor: `script:${name}@v${version}`,
      input: null,
      decl: { egress: [], keys: [], reads: [], writes: ['seen'], limits: { wall_ms: 15_000 }, source },
      record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'UTC' },
    },
  };
  const res = await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify(scripted) });
  const out = (await res.json()) as Out;
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  return out;
};

const saidOf = (answer: Answer): unknown => {
  const [write] = (answer.writes ?? []) as { fields: { said: string } }[];
  assert.ok(write, JSON.stringify(answer));
  return JSON.parse(write.fields.said);
};

const ROWSET = { question: 'Keep Players for Kiln?', body_kind: 'rowset', body: { register: 'kpis', rows: [{ name: 'Players', draft: true }] }, cause: 'kpi-backfill:kiln' };

test('A SCRIPT ON THE CLOUD IS HANDED ctx.propose: it reads the record\'s answer, and the run hands its queue back to be filed', async () => {
  const { answer, open } = await run(
    'proposes',
    `export default async function run(ctx) {
  const said = [await ctx.propose(${JSON.stringify(ROWSET)}), await ctx.propose({ question: 'Install?', body_kind: 'change', body: {} })];
  ctx.write('seen', { said: JSON.stringify({ has: typeof ctx.propose, said }) });
}`,
  );
  assert.equal(answer.refused, undefined, JSON.stringify(answer));
  assert.deepEqual(saidOf(answer), {
    has: 'function',
    said: [
      { ok: true, value: { queued: true } },
      { ok: false, refusal: { code: 'ENUM_VALUE_UNKNOWN', fix: 'A script asks about rows.', at: 'body_kind' } },
    ],
  });
  assert.deepEqual(answer.proposals, [ROWSET]);
  assert.equal(open, 0, 'the run was left open behind it');
});

test('A RUN WHOSE HOST FILES NOTHING IS HANDED NO ctx.propose, and hands nothing back', async () => {
  const { answer } = await run(
    'files-nothing',
    `export default async function run(ctx) {
  ctx.write('seen', { said: JSON.stringify(typeof ctx.propose) });
}`,
  );
  assert.equal(saidOf(answer), 'undefined');
  assert.equal(answer.proposals, undefined);
});
