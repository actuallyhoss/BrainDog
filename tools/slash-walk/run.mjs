#!/usr/bin/env node
/**
 * A conversation with Slash on the seed, against the included model, asked through the Worker's own adapter.
 *
 *   SLASH_WALK_ACCOUNT=<account> SLASH_WALK_TOKEN=<token> node tools/slash-walk/run.mjs [--only 3,4] [--json out.json]
 *
 * WHY. Every Slash test drives the conversation over a canned model, so none says how the included model reads the
 * tools, how long a turn takes, or what a person is told. This asks a fixed set of questions on the seed (a record that
 * is nobody's, in memory) and prints each turn: its steps, its answer, its actions, its model calls and its time.
 *
 * THE MODEL IS ASKED AS THE WORKER ASKS IT: `includedInference` over `aiInference`, with an `AI` binding that is
 * Workers AI's REST run address. Nothing else is different, so the prompt, the schema and the effort are the shipped
 * ones. The token is read from the environment and never printed.
 *
 * WHAT IT SPENDS. About three model calls a question on the small model, a few hundred neurons for the set.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { createRecordApi } from '../../packages/record/src/index.ts';
import { installSeed } from '../../packages/seed/src/index.ts';
import { openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { createSlash } from '../../packages/slash/src/index.ts';
import { slashRecord } from '../../packages/host/src/slash.ts';
import { slashTools } from '../../packages/mcp/src/slash-tools.ts';
import { includedInference, includedModel } from '../../apps/worker/src/slash.ts';
import { QUESTIONS } from './questions.mjs';

const { values } = parseArgs({ options: { only: { type: 'string' }, json: { type: 'string' }, at: { type: 'string' } } });

const account = (process.env.SLASH_WALK_ACCOUNT ?? '').trim();
const token = (process.env.SLASH_WALK_TOKEN ?? '').trim();
if (account === '' || token === '') {
  console.error('Set SLASH_WALK_ACCOUNT and SLASH_WALK_TOKEN (a token that may run Workers AI).');
  process.exit(2);
}

/* ── the model, as the Worker binds it ─────────────────────────────────────────────────────────────────────────── */

let modelCalls = 0;
/* EACH CALL'S TIME AND TOKENS, the thinking apart, so a slow turn says whether the prompt or the thinking made it slow. */
let traced = [];
const binding = {
  async run(model, inputs) {
    modelCalls++;
    const t0 = performance.now();
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(inputs),
    });
    /* A STREAM ASKED FOR IS HANDED BACK AS THE BINDING HANDS IT BACK, its body, timed to its end as it is read. */
    if (inputs.stream === true && res.ok && (res.headers.get('content-type') ?? '').includes('event-stream')) {
      const call = { ms: 0, first: null, words: null, in: undefined, out: undefined, thought: undefined };
      traced.push(call);
      let tail = '';
      return res.body.pipeThrough(
        new TransformStream({
          transform(chunk, out) {
            /* THE FIRST CHUNK, AND THE FIRST THAT CARRIES WORDS: the gap between them is the model thinking. */
            const said = new TextDecoder().decode(chunk);
            call.first ??= Math.round(performance.now() - t0);
            if (call.words == null && /"content":\s*"[^"]/.test(said)) {
              call.words = Math.round(performance.now() - t0);
              call.wordsAt = performance.now();
            }
            tail = (tail + said).slice(-600);
            out.enqueue(chunk);
          },
          flush() {
            call.ms = Math.round(performance.now() - t0);
            /* THE LAST CHUNK'S COUNTS ARE THE CALL'S WHOLE ONES (`apps/worker/src/inference.ts`, `readStream`). */
            const last = tail.slice(Math.max(0, tail.lastIndexOf('"response"')));
            call.in = Number(/"prompt_tokens":\s*(\d+)/.exec(last)?.[1]) || undefined;
            call.out = Number(/"completion_tokens":\s*(\d+)/.exec(last)?.[1]) || undefined;
          },
        }),
      );
    }
    const body = await res.json().catch(() => null);
    const u = body?.result?.usage ?? {};
    traced.push({ ms: Math.round(performance.now() - t0), in: u.prompt_tokens, out: u.completion_tokens, thought: u.completion_tokens_details?.reasoning_tokens });
    if (process.env.SLASH_WALK_RAW) console.log(`    raw: ${JSON.stringify(body?.result?.choices?.[0]?.message ?? body).slice(0, 600)}`);
    if (!res.ok || body?.success === false) throw new Error(`rest ${res.status} ${JSON.stringify(body?.errors ?? '').slice(0, 200)}`);
    return body.result;
  },
};
const inference = includedInference({ AI: binding, SLASH_INCLUDED: 'yes' }, () => 2_000);

/* ── the record ────────────────────────────────────────────────────────────────────────────────────────────────── */

/* THE SEED'S OWN DAY, AND RUNNING FROM IT: its rows are dated around it, so "this month" and "late" mean something. */
const from = Date.parse(values.at ?? '2026-09-03T10:00:00Z');
const started = Date.now();
const clock = { now: () => from + (Date.now() - started) };
const sql = openSqlite(':memory:');
/* AND THE RECORD'S OWN MODEL, SO A DRAFT IS DRAFTED, as the Worker hands its record one. */
const api = await createRecordApi({ sql, clock, slashModel: includedModel({ AI: binding, SLASH_INCLUDED: 'yes' }) });
const named = api.kernel.createRecord({ id: 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3', slug: 'walk', name: 'The Studio', tz: 'Europe/London', locale: 'en-GB', owner: { id: 'p_seed' } });
if (!named.ok) throw new Error(named.refusal?.fix ?? 'could not name the record');
const seeded = await installSeed(api.kernel);
if (!seeded.ok) throw new Error(seeded.refusal?.fix ?? 'could not seed');

const slashSql = openSqlite(':memory:');
const slash = createSlash({ sql: slashSql, clock, inference, record: slashRecord(api) });
const ctx = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, credentialed: true };

/* ── the walk ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const only = values.only ? new Set(values.only.split(',').map((n) => Number(n))) : null;
const report = [];
const threads = new Map();
const actionsOf = new Map();

for (const [i, q] of QUESTIONS.entries()) {
  const n = i + 1;
  if (only !== null && !only.has(n)) continue;
  /* A FOLLOW-UP CONTINUES THE THREAD OF THE QUESTION IT FOLLOWS, which is asked first when it was not chosen. */
  let thread;
  if (q.after !== undefined) thread = threads.get(q.after);
  if (q.act !== undefined) {
    /* AN ACTION ANSWERED: the first held action of the turn it names, said yes to. */
    const held = (actionsOf.get(q.act) ?? []).find((a) => a.kind === 'ask');
    const t0 = performance.now();
    const out = held ? await slash.act(held.id, true, ctx, slashTools(api, ctx, { sql, person: 'p_seed' })) : { ok: false, refusal: { fix: 'nothing held' } };
    report.push({ n, said: q.say, act: true, out, ms: Math.round(performance.now() - t0) });
    console.log(`\n#${n} [yes to #${q.act}] ${held?.title ?? '(nothing held)'}\n  -> ${JSON.stringify(out)}`);
    continue;
  }
  const events = [];
  const calls0 = modelCalls;
  traced = [];
  const t0 = performance.now();
  let first = null;
  await slash.chat(
    { message: q.say, ...(thread ? { thread } : {}), ...(q.page ? { page: q.page } : {}) },
    ctx,
    slashTools(api, ctx, { sql, person: 'p_seed' }),
    (e) => {
      if (first === null && e.type === 'delta') first = Math.round(performance.now() - t0);
      events.push(e);
    },
  );
  const ms = Math.round(performance.now() - t0);
  const id = events.find((e) => e.type === 'thread')?.id;
  if (id) threads.set(n, id);
  const steps = events.filter((e) => e.type === 'step').map((e) => e.text);
  const answer = events.filter((e) => e.type === 'delta').map((e) => e.text).join('').trim();
  const errors = events.filter((e) => e.type === 'error').map((e) => e.text);
  const actions = events.filter((e) => e.type === 'action').map(({ type, ...a }) => a);
  actionsOf.set(n, actions);
  /* HOW LONG THE FIRST WORDS WAITED AFTER THE ANSWERING CALL'S OWN FIRST WORDS, which is what streaming can shorten. */
  const answering = traced.at(-1);
  const lag = first !== null && answering?.wordsAt != null ? Math.round(t0 + first - answering.wordsAt) : null;
  const row = { n, said: q.say, steps, answer, actions, errors, ms, firstWords: first, lag, modelCalls: modelCalls - calls0, calls: traced, want: q.want };
  report.push(row);
  console.log(`\n#${n} ${q.say}${q.after ? `  (after #${q.after})` : ''}`);
  console.log(`  steps: ${steps.join(' | ') || '-'}`);
  console.log(`  answer: ${answer || '-'}`);
  for (const a of actions) console.log(`  action: ${a.kind} ${a.title}${a.detail ? ` (${a.detail})` : ''}`);
  for (const e of errors) console.log(`  error: ${e}`);
  console.log(`  ${ms} ms, first words at ${first ?? '-'} ms${lag === null ? '' : ` (${lag} ms after the model's)`}, ${modelCalls - calls0} model calls: ${traced.map((c) => `${c.ms}ms${c.first == null ? '' : ` (first chunk ${c.first}ms, words ${c.words ?? '-'}ms)`} ${c.in}in/${c.out}out(${c.thought ?? '?'} thinking)`).join(', ')}${q.want ? `\n  want: ${q.want}` : ''}`);
}

/* THE LEDGER'S OWN COUNT OF WHAT WAS SPENT, from the rows the engine wrote. */
const spent = slashSql.one?.('SELECT SUM(tokens_in) AS tin, SUM(tokens_out) AS tout, COUNT(*) AS n FROM slash_call');
console.log(`\n${report.length} turns, ${modelCalls} model calls${spent ? `, ${spent.tin} tokens in, ${spent.tout} out` : ''}`);
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2));
