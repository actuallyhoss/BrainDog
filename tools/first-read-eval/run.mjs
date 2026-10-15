/**
 * Whether the first reading is right: the read set's sentences asked of the real model through the one door sign-up
 * reads with (`readSetup`, `packages/slash/src/propose.ts`), with the offer the first run makes (`offerOf`,
 * `apps/web/src/lib/start/offer.ts`), and scored (USE-B05 job 9).
 *
 *   node tools/first-read-eval/run.mjs --spend               the real model; needs MODEL_CHECK_TOKEN and MODEL_CHECK_ACCOUNT
 *   node tools/first-read-eval/run.mjs --fake <file>         a canned file answers in the model's place; spends nothing
 *   --set <file>                                             another set of the read set's shape (a test's scratch set)
 *
 * THE BAR. A reading is a sentence typed with no answer after it (forty in `tools/people/sets/read-set.json`), and it is
 * right when the model names the use case expected of it: the person file's `expects` where the sentence is a person's
 * (Salma's Arabic is a shop to a model, though the rules read nothing), else the set's own. Nine in ten of them right,
 * 36 of 40, and none of the traps wrong. A trap is judged on what the first run makes of the model's answer
 * (`fromModel`, then the one question and any answer given to it), on every key the set writes beside it.
 *
 * IT SPENDS MONEY, SO IT IS OFF BY DEFAULT. The real model is asked only with the key in the environment, read under the
 * names and sent to the address `tools/model-checks` uses (Workers AI's chat completions on the account, with the
 * engine's included model), AND the flag `--spend`. Without both it says what it needs and exits 2 having called
 * nothing. The key goes to that address and nowhere else: never printed, never logged, cut out of any fault it said.
 *
 * WHAT IT PRINTS is one line a sentence and a total, and no text beyond the set's own: never the model's summary, draft
 * or questions. Exit 0 at the bar, 1 under it, 2 when it may not run, 3 when `readSetup` is not in the tree.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as lib from '../model-checks/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** Nine readings in ten, as 36 of 40. */
export const SHARE = 0.9;
export const barOf = (readings) => Math.ceil(readings * SHARE - 1e-9);

/** The included model's routing name, as `tools/model-checks/run.mjs` asks it. */
const INCLUDED = 'glm-5.3-flash';

/** The flags, read plainly. An unknown flag is an error, so a typo never runs the expensive default. */
export function parseArgs(argv) {
  const out = { spend: false, fake: null, set: join(root, 'tools', 'people', 'sets', 'read-set.json') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a file`);
      return resolve(v);
    };
    if (a === '--spend') out.spend = true;
    else if (a === '--fake') out.fake = next();
    else if (a === '--set') out.set = next();
    else throw new Error(`unknown flag ${a}`);
  }
  return out;
}

/** Each person file's id and the use case it expects, so a sentence of theirs is held to what a model should read. */
export function expectsOf(dir = join(root, 'tools', 'people')) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (typeof p.id === 'string' && typeof p.expects === 'string') out.set(p.id, p.expects);
  }
  return out;
}

/** The sentence a setup ask carries, read back out of its fence (`fenced` in `packages/slash/src/prompts.ts`). */
const saidIn = (content) => {
  const m = /<untrusted id="said">([\s\S]*?)<\/untrusted>/u.exec(content);
  return m ? JSON.parse(m[1]) : null;
};

/**
 * The canned model: each answer the file gives for a sentence, sent back as the model's text. A reply that is a string
 * is sent as it stands (a model that broke its JSON); a sentence with none is a model that did not answer.
 */
export function fakeInference(file) {
  const canned = JSON.parse(readFileSync(file, 'utf8'));
  const by = new Map((canned.answers ?? []).map((a) => [a.said, a.reply]));
  const spent = { calls: 0, in: 0, out: 0 };
  return {
    spent,
    inference: {
      complete: async (call) => {
        spent.calls++;
        const said = saidIn(call.messages.find((m) => m.role === 'user')?.content ?? '');
        if (!by.has(said)) throw new Error('the canned file has no answer for this sentence');
        const reply = by.get(said);
        return { text: typeof reply === 'string' ? reply : JSON.stringify(reply), usage: { in: 0, out: 0 } };
      },
    },
  };
}

/**
 * The real model, at the address and under the names `tools/model-checks` uses: Workers AI's chat completions on the
 * account, strict JSON schema, temperature 0. An ask with no answer (a timeout, a 5xx, a 429) is tried twice more with a
 * growing wait (`tried`); one that answered is final. A fault is said with the key and the account cut out.
 */
export function realInference({ token, account, base, model, send, timeoutMs = 30_000, sleep }) {
  const secrets = [token, account];
  const spent = { calls: 0, in: 0, out: 0 };
  const url = `${base}/accounts/${account}/ai/v1/chat/completions`;
  const once = async (call) => {
    spent.calls++;
    const res = await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: call.maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: call.jsonSchema, strict: true } },
        messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(lib.scrub(`${res.status}: ${text}`, secrets));
    const got = JSON.parse(text);
    const content = got?.choices?.[0]?.message?.content;
    const usage = { in: got?.usage?.prompt_tokens ?? 0, out: got?.usage?.completion_tokens ?? 0 };
    spent.in += usage.in;
    spent.out += usage.out;
    return { text: typeof content === 'string' ? content.replace(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u, '$1') : '', usage };
  };
  return {
    spent,
    inference: {
      complete: async (call) => {
        const got = await lib.tried(async () => ({ answered: true, reply: await once(call) }), sleep ? { sleep } : {});
        if (got.reply) return got.reply;
        throw new Error(lib.scrub(got.said, secrets));
      },
    },
  };
}

/** Where the reading differs from the one the set writes, one phrase each; empty when it reads right. */
const differs = (want, got) => {
  const out = [];
  for (const key of ['usecase', 'name', 'currency', 'question']) if (key in want && want[key] !== got[key]) out.push(`${key} ${JSON.stringify(got[key])}, not ${JSON.stringify(want[key])}`);
  if (want.modules !== undefined && JSON.stringify([...want.modules].sort()) !== JSON.stringify(got.modules)) out.push(`modules ${got.modules.join(', ') || 'none'}, not ${want.modules.join(', ') || 'none'}`);
  return out;
};

/**
 * Each sentence's verdict, from the model's outcome for it. `web` is the first run's own readers (`fromModel`,
 * `propose`, `oneQuestion`, `answer`), handed in so a test can hold this without a model. A use case the offer does not
 * hold is said as such, never as the model wrote it.
 */
export function judge(set, expects, outcomes, web, offered) {
  return set.sentences.map((s, i) => {
    const out = outcomes[i];
    const expected = (s.who && expects.get(s.who)) ?? s.reads.usecase;
    const raw = out.ok ? (out.value.usecase ?? 'none') : null;
    const read = raw === null ? `no reading (${out.refusal.code})` : raw === 'none' || offered.has(raw) ? raw : 'a use case not on offer';
    const verdict = { n: i + 1, said: s.said, reading: s.answer === undefined, expected, read, right: read === expected };
    if (s.trap === undefined) return verdict;
    if (!out.ok) return { ...verdict, trap: s.trap, held: false, wrong: [`no reading (${out.refusal.code})`] };
    let p = web.fromModel(out.value, s.said, set.ctx, web.propose(s.said, set.ctx));
    const asked = web.oneQuestion(p, s.said);
    if (s.answer) p = web.answer(p, s.answer.about, s.answer.value, s.said);
    const got = { usecase: p.usecase ?? 'none', modules: [...p.modules].sort(), name: p.name, currency: p.currency, question: asked?.about ?? null };
    const wrong = differs(s.reads, got);
    return { ...verdict, trap: s.trap, held: wrong.length === 0, wrong };
  });
}

/** The lines it prints and whether the run is at the bar. */
export function report(verdicts, spent) {
  const readings = verdicts.filter((v) => v.reading);
  const right = readings.filter((v) => v.right).length;
  const traps = verdicts.filter((v) => v.trap !== undefined);
  const held = traps.filter((v) => v.held).length;
  const bar = barOf(readings.length);
  const at = right >= bar && held === traps.length;
  const lines = verdicts.map((v) => {
    const mark = v.reading ? (v.right ? 'right' : 'wrong') : 'after';
    const what = v.right ? v.expected : `${v.expected}, read ${v.read}`;
    const trap = v.trap === undefined ? '' : v.held ? `  trap held: ${v.trap}` : `  TRAP TAKEN: ${v.trap}: ${v.wrong.join('; ')}`;
    const said = v.said.length > 60 ? `${v.said.slice(0, 57)}...` : v.said;
    return `${String(v.n).padStart(2, '0')} ${mark}  ${what}${trap}  "${said}"`;
  });
  lines.push(`${right} of ${readings.length} readings right (the bar is ${bar}), ${held} of ${traps.length} traps held, ${spent.calls} asks. ${at ? 'At the bar.' : 'Under the bar.'}`);
  return { lines, at, right, bar, held, traps: traps.length };
}

/**
 * The run. `env`, `send` and `print` are handed in so a test can hold it with a stub that counts the calls. Exit 2 is
 * decided before anything is imported or asked: no key or no `--spend` calls nothing.
 */
export async function main({ argv = process.argv.slice(2), env = process.env, send = (...a) => globalThis.fetch(...a), print = console.log, sleep } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    print(`first read eval: ${e.message}`);
    return 2;
  }
  const token = (env.MODEL_CHECK_TOKEN ?? '').trim();
  const account = (env.MODEL_CHECK_ACCOUNT ?? '').trim();
  if (args.fake !== null && args.spend) {
    print('first read eval: --fake answers from a file and --spend asks the real model; give one.');
    return 2;
  }
  if (args.fake === null) {
    const needs = [token === '' ? 'MODEL_CHECK_TOKEN' : null, account === '' ? 'MODEL_CHECK_ACCOUNT' : null].filter((n) => n !== null);
    if (needs.length > 0 || !args.spend) {
      const why = [needs.length > 0 ? `${needs.join(' and ')} in the environment` : null, args.spend ? null : 'the flag --spend'].filter((n) => n !== null);
      print(`first read eval: this asks the real model and costs money, so it needs ${why.join(' and ')}. Nothing was asked. Without a model, give --fake <file>.`);
      return 2;
    }
  }

  let readSetup;
  try {
    ({ readSetup } = await import('../../packages/slash/src/propose.ts'));
  } catch (e) {
    print(`first read eval: packages/slash/src/propose.ts did not load (${lib.scrub(e?.message ?? e)}).`);
    return 3;
  }
  if (typeof readSetup !== 'function') {
    print('first read eval: readSetup is not in packages/slash/src/propose.ts yet (USE-B05 job 1). Nothing was asked.');
    return 3;
  }
  const { offerOf } = await import('../../apps/web/src/lib/start/offer.ts');
  const { fromModel, propose } = await import('../../apps/web/src/lib/start/propose.ts');
  const { answer, oneQuestion } = await import('../../apps/web/src/lib/start/question.ts');

  /* A FILE THAT CANNOT BE READ IS A RUN THAT MAY NOT GO (2), never a score under the bar (1). Both are read before any ask. */
  let set;
  let door;
  try {
    set = JSON.parse(readFileSync(args.set, 'utf8'));
    if (args.fake !== null) door = fakeInference(args.fake);
  } catch (e) {
    print(`first read eval: a file could not be read (${lib.scrub(e?.message ?? e)}). Nothing was asked.`);
    return 2;
  }
  if (args.fake === null) {
    const { ROUTED } = await import('../../apps/worker/src/inference.ts');
    const route = ROUTED.find((r) => r.name === INCLUDED) ?? ROUTED[0];
    const base = (env.MODEL_CHECK_BASE ?? '').replace(/\/+$/u, '') || 'https://api.cloudflare.com/client/v4';
    const timeoutMs = Number(env.MODEL_CHECK_TIMEOUT_MS) > 0 ? Number(env.MODEL_CHECK_TIMEOUT_MS) : 30_000;
    door = realInference({ token, account, base, model: route.provider, send, timeoutMs, sleep });
    door.route = route;
  }

  const offer = offerOf();
  const today = new Date().toISOString().slice(0, 10);
  const outcomes = [];
  for (const s of set.sentences) outcomes.push(await readSetup({ said: s.said, offer, today }, door.inference));
  const verdicts = judge(set, expectsOf(), outcomes, { fromModel, propose, oneQuestion, answer }, new Set(offer.usecases.map((u) => u.id)));
  const out = report(verdicts, door.spent);
  for (const line of out.lines) print(line);
  if (door.route) print(`spent about ${lib.neurons(door.route, door.spent)} neurons.`);
  return out.at ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
