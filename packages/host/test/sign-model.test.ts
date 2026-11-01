/**
 * `model-answers`: filed by the host from Slash's ledger and the dead model jobs, read back through the
 * kernel's own `signs`. A green week, a red week whose newest ask failed, a red week of a dead job saying the fault's
 * own sentence and never its error, the 9-in-10 line, a hold in flight counted as nothing, the same count Settings reads,
 * a spent month read red until it turns and never as "No one asked", the other dead work in the facts, and an empty
 * ledger reading none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { ok } from '@braindog/ports';

import { fileModelSign, LEDGER_ANSWERED, LEDGER_BUDGET, LEDGER_FAILED, readModelSign, type ModelFault, type ModelSignKernel } from '../src/sign-model.ts';
import * as slashHealth from '../../slash/src/health.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOUR = 3_600_000;

/** Slash's ledger as `packages/slash/src/call.ts` builds it, the columns this sign reads. */
const ledger = (sql: NodeSql) =>
  sql.exec(`CREATE TABLE IF NOT EXISTS slash_call (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
    status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT)`);

let n = 0;
const ask = (sql: NodeSql, hoursAgo: number, status: 'ok' | 'nothing' | 'refused' | 'error', code: string | null = null, model = '@cf/meta/llama-3.1-8b') =>
  sql.exec(
    "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, 'read', 'a', ?, 0, 0, 0, 0, ?, ?)",
    `c${++n}`,
    new Date(NOW - hoursAgo * HOUR).toISOString(),
    model,
    status,
    code,
  );

const fresh = async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  ledger(sql);
  return { sql, k };
};

const signOf = (k: Kernel) => {
  const all = k.signs();
  assert.ok(all.ok);
  return all.value.signs.find((s) => s.sign === 'model-answers')!;
};

/** The kernel with a `faults()` that answers these, as kernel-wire's verb does. */
const withFaults = (k: Kernel, faults: ModelFault[]): ModelSignKernel => ({ signRead: k.signRead, identity: k.identity, faults: () => ok({ faults }) });

const NO_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b|@cf\/|llama|tools#\d|\bc\d+\b/u;

test('AN EMPTY LEDGER READS NONE, never green, and so does a record with no ledger at all', async () => {
  const { sql, k } = await fresh();
  assert.equal(signOf(k).state, 'none', 'unfiled');
  assert.ok(fileModelSign(k, sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'none');
  assert.match(s.said, /No one asked/u);

  const bare = openSqlite();
  const k2 = await openRecord(bare, fixedClock(NOW));
  assert.equal(readModelSign(k2, bare, NOW).state, 'none', 'a record whose Slash never ran');
});

test('GREEN: every ask of the week answered, a refused draft counts as an answer, a hold in flight counts as nothing', async () => {
  const { sql, k } = await fresh();
  for (const h of [2, 20, 50, 90, 140]) ask(sql, h, 'ok');
  ask(sql, 30, 'refused', 'PROPOSAL_UNCITED');
  ask(sql, 1, 'error', 'SLASH_PENDING');
  ask(sql, 3, 'ok', null, '-');
  ask(sql, 8 * 24, 'error', 'UNREACHABLE');
  assert.ok(fileModelSign(k, sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'green', s.said);
  assert.equal(s.value, 6);
  assert.equal(s.said, 'The model answered all 6 asks this week.');
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
});

test('RED: the newest ask failed, and the reading says how many and when the model last answered', async () => {
  const { sql, k } = await fresh();
  for (const h of [30, 50, 70, 90, 110, 130, 150, 160, 165]) ask(sql, h, 'ok');
  ask(sql, 2, 'error', 'UNREACHABLE');
  const raw = "No model answered for '@cf/meta/llama-3.1-8b': 5007 model unavailable, api_key: sk-live-abcdef123456";
  assert.ok(fileModelSign(k, sql, NOW, { lastFail: { raw, at: NOW - 2 * HOUR } }).ok);
  const s = signOf(k);
  assert.equal(s.state, 'red', 'nine of ten is not below nine in ten, but the newest failed');
  assert.equal(s.said, 'The model did not answer 1 of 10 asks this week.');
  assert.doesNotMatch([s.said, ...s.facts].join(' '), /5007|unavailable|sk-live|api_key/u, 'the host\'s last failure is never quoted');
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
  assert.ok(s.facts.some((f) => /last answered on 8 October/u.test(f)), s.facts.join(' | '));
  assert.doesNotMatch(s.said, /UNREACHABLE/u, 'a code is not a sentence');
});

test('THE 9-IN-10 LINE: 8 of 10 is red with the newest answered, 9 of 10 is green, 4 asks are too few to judge by share', async () => {
  const { sql, k } = await fresh();
  for (const h of [1, 10, 20, 30, 40, 50, 60, 70]) ask(sql, h, 'ok');
  ask(sql, 80, 'error', 'UNREACHABLE');
  ask(sql, 90, 'error', 'UNREACHABLE');
  assert.equal(readModelSign(k, sql, NOW).state, 'red');
  sql.exec("UPDATE slash_call SET status = 'ok' WHERE ts = ?", new Date(NOW - 80 * HOUR).toISOString());
  assert.equal(readModelSign(k, sql, NOW).state, 'green');

  const few = await fresh();
  for (const h of [1, 10]) ask(few.sql, h, 'ok');
  for (const h of [20, 30]) ask(few.sql, h, 'error', 'UNREACHABLE');
  assert.equal(readModelSign(few.k, few.sql, NOW).state, 'green', 'two of four with the newest answered');
});

test('RED: a dead model job with no ask at all says the fault\'s own sentence, and never its kept error', async () => {
  const { sql, k } = await fresh();
  const at = new Date(NOW - 5 * HOUR).toISOString();
  /* THE KERNEL'S FAULT AS IT IS KEPT, its error and all: the sign must read past the error, not scrub it. */
  const dead = {
    kind: 'infer.resolve',
    said: 'BrainDog could not check for people who are here twice. It tries again tonight.',
    last_at: at,
    error: "No model answered for '@cf/meta/llama-3.1-8b': the provider did not answer (api_key: sk-live-abcdef123456 at gateway.ai.cloudflare.com/v1/acct/run)",
  };
  const notify = { kind: 'notify.email', said: 'BrainDog could not send a notification. It tries again when the next one is due.', last_at: at, error: 'smtp down' };
  const faults: ModelFault[] = [notify, dead];
  assert.ok(fileModelSign(withFaults(k, faults), sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'red');
  assert.equal(s.said, `A model job stopped after every retry. ${dead.said}`);
  const read = [s.said, ...s.facts].join(' ');
  assert.doesNotMatch(read, /sk-live|abcdef123456|cloudflare|\/v1\/|api_key|provider did not answer|smtp/u);
  assert.doesNotMatch(read, NO_ID);
  assert.ok(!s.facts.includes(dead.said), 'the sentence the reading ends on is not said again in the facts');
  assert.ok(s.facts.includes(notify.said), 'the other dead work is said in the facts, in its own sentence');
  assert.doesNotMatch(read, /—/u);
});

test('RED: asks in the last day and none answered, even with the week above the line', () => {
  const sql = openSqlite();
  ledger(sql);
  for (let h = 30; h < 160; h += 10) ask(sql, h, 'ok');
  ask(sql, 3, 'error', 'UNREACHABLE');
  ask(sql, 2, 'error', 'UNREACHABLE');
  const kernel: ModelSignKernel = { signRead: () => ok({ sign: 'model-answers', day: '2026-10-09' }) };
  const r = readModelSign(kernel, sql, NOW);
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The model did not answer 2 of 15 asks this week.');
});

test('THROUGH THE KERNEL’S OWN FAULTS: a dead resolve job raised on the record turns the sign red, and clearing it turns it back', async () => {
  const { raiseFault, clearFault } = await import('../../kernel/src/fault.ts');
  const { sql, k } = await fresh();
  for (const h of [2, 20, 50, 90, 140]) ask(sql, h, 'ok');
  assert.equal(readModelSign(k, sql, NOW).state, 'green');
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'the provider did not answer, token=abc123def456', NOW - HOUR);
  const r = readModelSign(k, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.equal(
    r.said,
    'The model answered 5 of 5 asks this week, but a model job stopped after every retry. BrainDog could not check for people who are here twice. It tries again tonight.',
  );
  assert.doesNotMatch([r.said, ...(r.facts ?? [])].join(' '), /token|abc123|provider did not answer/u);
  clearFault(sql, 'outbox#infer.resolve', NOW);
  assert.equal(readModelSign(k, sql, NOW).state, 'green');
});

test('ONE COUNT: the three clauses are Slash health\'s own, character for character', () => {
  assert.equal(LEDGER_ANSWERED, slashHealth.LEDGER_ANSWERED);
  assert.equal(LEDGER_FAILED, slashHealth.LEDGER_FAILED);
  assert.equal(LEDGER_BUDGET, slashHealth.LEDGER_BUDGET);
});

test('AT THE 600 CAP THE ANSWERS ARE SETTINGS\' COUNT: a build without the model and a hold are no asks, and the spent month is red', async () => {
  const { sql, k } = await fresh();
  const clock = { now: () => NOW };
  for (const h of [30, 60, 90, 120, 150]) ask(sql, h, 'ok');
  ask(sql, 40, 'error', 'PROPOSAL_SCHEMA');
  /* THE NIGHT AT THE CAP: every ask after the 600th refused before anything was sent, under the model's name. */
  for (let h = 1; h <= 20; h++) ask(sql, h, 'refused', 'SLASH_BUDGET_SPENT', '-');
  ask(sql, 2, 'error', 'NOT_IN_THIS_BUILD');
  ask(sql, 1, 'error', 'SLASH_PENDING');
  const r = readModelSign(k, sql, NOW);
  const h = slashHealth.health(sql, clock, { model: true });
  /* THE NEWEST ASK WAS TURNED AWAY (5): red, with the day the asks come back. Settings says the meter beside
     its own sentence, so its health still reads the last answer, and both count the same six. */
  assert.equal(r.state, 'red', r.said);
  assert.equal(r.value, 6);
  assert.equal(r.said, "The month's Slash questions are used: 20 questions since 8 October did not reach the model. They come back on 1 November.");
  assert.equal(h.state, 'answering');
  assert.equal(Date.parse(h.last_ok!), NOW - 30 * HOUR, 'Settings\' last answer is the sign\'s');
  assert.ok((r.facts ?? []).includes('6 asks this week, 6 answered.'), (r.facts ?? []).join(' | '));
  assert.ok((r.facts ?? []).some((f) => /last answered on 8 October/u.test(f)), (r.facts ?? []).join(' | '));

  /* AN ANSWER AFTER THE REFUSALS (his own key, or a raised limit) is green again. */
  ask(sql, 0.5, 'ok');
  const back = readModelSign(k, sql, NOW);
  assert.equal(back.state, 'green', back.said);
  assert.equal(back.said, 'The model answered all 7 asks this week.');

  /* AND THEY TURN TOGETHER: three fresh failures after the last answer are red here and not answering there. */
  for (const m of [3, 2, 1]) ask(sql, m / 10, 'error', 'UNREACHABLE');
  assert.equal(readModelSign(k, sql, NOW).state, 'red');
  assert.equal(slashHealth.health(sql, clock, { model: true }).state, 'not_answering');
});

test('THE OTHER DEAD WORK, by its kind in words: in the facts of a green week and of a quiet one, never turning it red', async () => {
  const { raiseFault } = await import('../../kernel/src/fault.ts');
  const { SAID } = await import('../../kernel/src/fault.ts');
  const { sql, k } = await fresh();
  raiseFault(sql, 'outbox#export.copy', 'export.copy', 'R2 put failed: secret=hunter2hunter2', NOW - 10 * 24 * HOUR);
  const quiet = readModelSign(k, sql, NOW);
  assert.equal(quiet.state, 'none');
  assert.deepEqual(quiet.facts, [SAID.export], 'an open fault is still dead after the week');
  for (const h of [2, 20, 50]) ask(sql, h, 'ok');
  raiseFault(sql, 'outbox#notify.email', 'notify.email', 'smtp 550', NOW - HOUR);
  raiseFault(sql, 'outbox#notify.push', 'notify.push', 'push 410', NOW - HOUR);
  const r = readModelSign(k, sql, NOW);
  assert.equal(r.state, 'green', r.said);
  assert.ok((r.facts ?? []).includes(SAID.notify) && (r.facts ?? []).includes(SAID.export), (r.facts ?? []).join(' | '));
  assert.equal((r.facts ?? []).filter((f) => f === SAID.notify).length, 1, 'two causes of one kind are one sentence');
  assert.doesNotMatch((r.facts ?? []).join(' '), /hunter2|smtp|550|R2/u);
});

test('A SPENT MONTH IS RED, NEVER "answered all" (5): five answers and then fifty refusals', async () => {
  const { sql, k } = await fresh();
  for (const h of [100, 110, 120, 130, 140]) ask(sql, h, 'ok');
  for (let i = 0; i < 50; i++) ask(sql, 1 + i, 'refused', 'SLASH_BUDGET_SPENT', '-');
  assert.ok(fileModelSign(k, sql, NOW).ok);
  const s = signOf(k);
  assert.equal(s.state, 'red', s.said);
  assert.equal(s.value, 5);
  assert.doesNotMatch(s.said, /answered all/u);
  assert.match(s.said, /month's Slash questions are used: 50 questions since 7 October did not reach the model\. They come back on 1 November\./u);
  const r = readModelSign(k, sql, NOW);
  /* SAID ONCE, by the headline, and not again among the facts. */
  assert.ok(!(r.facts ?? []).some((f) => /turned away/u.test(f)), (r.facts ?? []).join(' | '));
  assert.doesNotMatch([r.said, ...(r.facts ?? [])].join(' '), NO_ID);
  assert.doesNotMatch([r.said, ...(r.facts ?? [])].join(' '), /—|\brow\b/u);
});

test('ONLY REFUSALS NEVER READ "No one asked": red while the month is spent, and once it turns, said as asks turned away', async () => {
  const { sql, k } = await fresh();
  /* The old name, from a ledger `call.ts` has not migrated yet, counts the same. */
  for (let i = 0; i < 50; i++) ask(sql, 1 + i, 'refused', i % 2 === 0 ? 'SLASH_BUDGET_SPENT' : 'SPARK_BUDGET_SPENT', '-');
  const r = readModelSign(k, sql, NOW);
  assert.equal(r.state, 'red', r.said);
  assert.doesNotMatch(r.said, /No one asked/u);
  assert.match(r.said, /They come back on 1 November\./u);
  /* The headline says the fifty; the facts do not say them again. */
  assert.ok(!(r.facts ?? []).some((f) => /turned away/u.test(f)), (r.facts ?? []).join(' | '));

  /* THE MONTH TURNED: fifty refusals at the end of September, read on 5 October with nothing asked since. */
  const { sql: sql2, k: k2 } = await fresh();
  for (let i = 0; i < 50; i++) ask(sql2, 8 * 24 + 13 + i, 'refused', 'SLASH_BUDGET_SPENT', '-');
  const turned = readModelSign(k2, sql2, NOW - 4 * 24 * HOUR);
  assert.equal(turned.state, 'none', turned.said);
  assert.doesNotMatch(turned.said, /No one asked/u);
  assert.equal(turned.said, "No ask reached the model this week: the month's asks were spent for all 50. They were back on 1 October.");
});

test('AN ANSWER AFTER A REFUSAL IS GREEN, and the refusal stays a fact', async () => {
  const { sql, k } = await fresh();
  for (const h of [30, 60, 90]) ask(sql, h, 'ok');
  ask(sql, 5, 'refused', 'SLASH_BUDGET_SPENT', '-');
  ask(sql, 2, 'ok');
  const r = readModelSign(k, sql, NOW);
  assert.equal(r.state, 'green', r.said);
  assert.equal(r.said, 'The model answered all 4 asks this week.');
  assert.ok((r.facts ?? []).includes("1 ask this week was turned away because the month's asks were spent."), (r.facts ?? []).join(' | '));
});

test('A CALL REFUSED FOR ITS SIZE IS NOT THE MONTH SPENT (model-sign-49): the per-call neuron ceiling writes under the model\'s name', async () => {
  const { k, sql } = await fresh();
  for (let h = 30; h > 25; h--) ask(sql, h, 'ok');
  /* The worker's `budgetSpent`: one call that would spend more neurons than its ceiling, refused under the model. */
  ask(sql, 1, 'refused', 'SLASH_BUDGET_SPENT');
  const read = readModelSign(k, sql, NOW);
  assert.notEqual(read.state, 'red', read.said);
  assert.doesNotMatch(read.said, /month's Slash questions are used/u);
});

test('THE FACTS SAY HOW MANY PAGES THE MODEL WROTE NOW, from the count the lint round keeps, and nothing from a stale count', async () => {
  const { sql, k } = await fresh();
  for (const h of [2, 20]) ask(sql, h, 'ok');
  k.setPref('slash', 'headlines.held', { day: '2026-10-09', written: 9, pages: 14 });
  const green = readModelSign(k, sql, NOW);
  assert.equal(green.state, 'green');
  assert.equal(green.facts?.[0], 'Page headlines: 9 of 14 pages written by the model now.');
  /* ON A WEEK NOBODY ASKED, still said: the lines on the pages are the model's or not whatever this week asked. */
  const bare = await fresh();
  bare.k.setPref('slash', 'headlines.held', { day: '2026-10-08', written: 0, pages: 1 });
  assert.deepEqual(readModelSign(bare.k, bare.sql, NOW).facts, ['Page headlines: 0 of 1 page written by the model now.']);
  /* A COUNT FROM THREE DAYS AGO IS NOT "NOW", and a kernel with no prefs says nothing of the pages. */
  k.setPref('slash', 'headlines.held', { day: '2026-10-06', written: 9, pages: 14 });
  assert.ok(!(readModelSign(k, sql, NOW).facts ?? []).some((f) => f.startsWith('Page headlines')));
  assert.ok(!(readModelSign({ signRead: k.signRead }, sql, NOW).facts ?? []).some((f) => f.startsWith('Page headlines')));
});
