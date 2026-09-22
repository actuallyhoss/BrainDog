/**
 * A script on the Cloud that filters on a secret field with a sentence, run the way `test/script.test.ts` runs a script:
 * `src/script.ts` bundled by esbuild, the script in a Dynamic Worker from `env.LOADER`, and `ctx.record.list` going
 * through `ScriptRecord` back into the record's object (`loop/research-batch-thirty-six-audit.md` finding 7).
 *
 * THE AUDIT DROVE THE SELF-HOST AND SAID THE CLOUD FOLLOWED "BY CONSTRUCTION". That was a reading, not a run, so this file
 * is the run. `ScriptRecord.list` parses the `where` the prelude stringified and hands it to `ScriptRuns.answer` as it
 * was written, and `answer` hands it to the reads `src/index.ts` builds with `scriptReads`, so a string reached the
 * record's `list`, which reads a string as a sentence. Measured before `scriptReads` refused one: all four runs below
 * answered with writes, and the record double was asked `token is set` and the other three.
 *
 * THE RECORD IS A DOUBLE, AND A NARROW ONE. It answers `register` with a list that has a `secret` field, and records every
 * `where` its `list` is asked, answering one row either way. What a real record would answer to each sentence is
 * `apps/selfhost/test/script-reads.test.ts`'s to say, against a real record; the question here is only whether the
 * sentence reaches the record from a Worker at all.
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

const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAG';

/** The record's side of a run, in an alarm, as `script.test.ts` has it, with `read` built by the shipped `scriptReads`. */
const ENTRY = `
import { DurableObject } from 'cloudflare:workers';
import { scriptReads } from '@braindog/host/script';
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
    const wheres = [];
    const record = {
      kernel: {
        register: (id) => (id === 'clients' ? { id, fields: [{ id: 'name', type: 'text' }, { id: 'token', type: 'secret' }] } : null),
      },
      list: async (q) => {
        wheres.push(q.where === undefined ? null : q.where);
        return { ok: true, value: { rows: [{ id: 'e_1', register: 'clients', fields: { name: 'Acme', token: '${GRANT}' } }], cursor: null, matched: 1 } };
      },
      get: async () => ({ ok: true, value: null }),
    };
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
          read: scriptReads(record)(scripted),
          now: () => Date.UTC(2026, 8, 22, 12),
        },
        scripted,
      );
    } catch (e) {
      answer = { threw: String(e && e.message ? e.message : e) };
    }
    await this.ctx.storage.put('out', { answer, wheres });
  }
}

export default {
  fetch(request, env) {
    return env.RECORD.get(env.RECORD.idFromName('one')).fetch(request);
  },
};
`;

type Answer = { writes?: unknown[]; refused?: { code: string | null; why: string }; log?: string; threw?: string };
type Out = { answer: Answer; wheres: unknown[]; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-reads-sentence.entry.js', loader: 'js' },
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

/** One leased `script.run` of a script reading `clients`, as `prepareScript` hands it to a host. */
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
      decl: { egress: [], keys: [], reads: ['clients'], writes: ['seen'], limits: { wall_ms: 5_000 }, source },
      record: { id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', tz: 'UTC' },
    },
  };
  const res = await mf.dispatchFetch('http://record/', { method: 'POST', body: JSON.stringify(scripted) });
  const out = (await res.json()) as Out;
  assert.notEqual(out.never, true, 'the alarm never wrote an answer');
  return out;
};

const SENTENCES: [string, string][] = [
  ['set', 'token is set'],
  ['empty', 'token is empty'],
  ['right', `token is ${GRANT}`],
  ['wrong', `token is ${GRANT.slice(0, -1)}0`],
];

for (const [name, where] of SENTENCES)
  test(`A SENTENCE ON A SECRET FIELD IS REFUSED ON THE CLOUD TOO, and never reaches the record: "${where}"`, async () => {
    const { answer, wheres } = await run(
      `sentence-${name}`,
      `export default async function run(ctx) {
  const rows = await ctx.record.list('clients', ${JSON.stringify(where)});
  ctx.write('seen', { said: JSON.stringify(rows.map((r) => r.fields.name)) });
}`,
    );
    assert.deepEqual(wheres, [], 'the sentence reached the record');
    assert.equal(answer.writes, undefined, JSON.stringify(answer));
    assert.match(answer.refused?.why ?? '', /filters with a predicate tree/, JSON.stringify(answer));
  });

test('A TREE THAT NAMES NO SECRET STILL READS ON THE CLOUD, so the refusal above is about the sentence and not every filter', async () => {
  const { answer, wheres } = await run(
    'tree-name',
    `export default async function run(ctx) {
  const rows = await ctx.record.list('clients', { field: 'name', is: 'Acme' });
  ctx.write('seen', { said: JSON.stringify(rows) });
}`,
  );
  assert.deepEqual(wheres, [{ field: 'name', is: 'Acme' }]);
  const [write] = (answer.writes ?? []) as { fields: { said: string } }[];
  assert.ok(write, JSON.stringify(answer));
  assert.doesNotMatch(write.fields.said, new RegExp(GRANT), 'the secret field was handed to the script');
});
