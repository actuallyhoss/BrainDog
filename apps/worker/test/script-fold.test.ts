/**
 * `ctx.fold` on the Cloud, run the way `test/script.test.ts` runs a script: `src/script.ts` bundled by esbuild, the
 * script in a Dynamic Worker from `env.LOADER`, and the call going through `ScriptRecord` back into the record's object,
 * where the run's own `scriptFold` answers it.
 *
 * THE SAME ANSWER ON BOTH HOSTS. The self-host hands `scriptFold` through `scriptRunner` and QuickJS; the Worker builds
 * its own runner, so it hands the same function from the run's turn. Each spelling below is folded here in a loaded
 * Worker and compared with the kernel's `bankKey` worked out in this process, which is what the self-host answers
 * (`packages/host/test/script-fold.test.ts`).
 *
 * AND THE SAME TWO LIMITS: a text past `FOLD_CHARS` is no payee, and a run past `FOLD_CALLS` has the rest refused as a
 * failed call the script may catch, with no rule broken.
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

import { bankKey } from '@braindog/kernel';
import { FOLD_CALLS, FOLD_CHARS } from '@braindog/host/script';

/** The record's side of a run, in an alarm, as `script.test.ts` has it. The script reads nothing, so no `read`. */
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

type Answer = { writes?: unknown[]; refused?: { code: string | null; why: string }; log?: string; threw?: string };
type Out = { answer: Answer; open: number; never?: true };

let mf: InstanceType<typeof Miniflare>;

before(async () => {
  const built = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: here, sourcefile: 'script-fold.entry.js', loader: 'js' },
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

const SPELLINGS = ['GEIDEA*CHILLOUT 0423 CAIRO EG', 'Chill Out', 'CHILLOUT', 'UBER *TRIP HELP.UBER.COM', 'CAFE 22', 'Pharmacy Giza', '', '   ', '0423'];

test('A SCRIPT ON THE CLOUD IS HANDED ctx.fold, AND IT ANSWERS THE KERNEL KEY FOR EVERY SPELLING, as the self-host does', async () => {
  const { answer, open } = await run(
    'folds',
    `export default async function run(ctx) {
  const keys = [];
  for (const text of ${JSON.stringify(SPELLINGS)}) keys.push(await ctx.fold(text));
  ctx.write('seen', { said: JSON.stringify({ has: typeof ctx.fold, keys }) });
}`,
  );
  assert.deepEqual(saidOf(answer), { has: 'function', keys: SPELLINGS.map((text) => bankKey(text)) });
  assert.equal(bankKey('GEIDEA*CHILLOUT 0423 CAIRO EG'), bankKey('Chill Out'));
  assert.equal(open, 0, 'the run was left open behind it');
});

test('A TEXT LONGER THAN THE LIMIT IS NO PAYEE ON THE CLOUD EITHER, and is not folded in part', async () => {
  const { answer } = await run(
    'folds-long',
    `export default async function run(ctx) {
  ctx.write('seen', { said: JSON.stringify([await ctx.fold('a'.repeat(${FOLD_CHARS})), await ctx.fold('Chill Out ' + 'a'.repeat(${FOLD_CHARS}))]) });
}`,
  );
  const [whole, over] = saidOf(answer) as [string | null, string | null];
  assert.equal(whole, bankKey('a'.repeat(FOLD_CHARS)));
  assert.equal(over, null);
});

test('A RUN THAT ASKS PAST THE COUNT HAS THE REST REFUSED AS A FAILED CALL IT MAY CATCH, and no rule is broken', async () => {
  const { answer } = await run(
    'folds-many',
    `export default async function run(ctx) {
  let answered = 0;
  let said = null;
  for (let i = 0; i < ${FOLD_CALLS} + 2; i++) {
    try {
      await ctx.fold('Shop ' + i);
      answered += 1;
    } catch (e) {
      said = String(e.message);
    }
  }
  ctx.write('seen', { said: JSON.stringify({ answered, said }) });
}`,
  );
  assert.equal(answer.refused, undefined, JSON.stringify(answer));
  assert.deepEqual(saidOf(answer), { answered: FOLD_CALLS, said: `folds-many asked for more than ${FOLD_CALLS} payee keys in one run, so no more were answered.` });
});
