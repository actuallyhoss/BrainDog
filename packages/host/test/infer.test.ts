/**
 * The router (ENG-A06): `routeFor` over a host's facts, and `infer` walking the list over Slash's real ledger.
 *
 * WHY THIS FILE EXISTS. One model answered every ask and nothing tried a second: when it failed the rules spoke, or a job
 * asked the same model eight times. Each case here hands `infer` candidates that fail one way and reads what the ledger
 * `@braindog/slash` built says afterwards, because the rows are what the meters and the engine's health are read from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Result } from '@braindog/ports';
import * as hostPause from '../src/infer.ts';
import { PURPOSES, infer, lastRows, routeFor, type Candidate, type InferCall, type InferDeps, type LastRow, type RouteFacts } from '../src/infer.ts';
import { core, openStore } from '../../slash/src/call.ts';
import * as slashPause from '../../slash/src/paused.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 6, 9);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const FLASH: Candidate = { id: 'flash', model: 'flash-chat', tier: 'a', source: 'included' };
const SECOND: Candidate = { id: 'second', model: 'second-chat', tier: 'a', source: 'included' };
const SMALL: Candidate = { id: 'small', model: 'small-chat', tier: 'a', source: 'included' };
const LARGE: Candidate = { id: 'large', model: 'large-chat', tier: 'a', source: 'included', large: true };
const PROVIDER: Candidate = { id: 'provider', model: 'other-chat', tier: 'a', source: 'included' };
const MACHINE: Candidate = { id: 'machine', model: 'his-machine', tier: 'a', source: 'machine' };
const EMBED: Candidate = { id: 'embed', model: 'embedder', tier: 'a', source: 'included' };
const KEY: Candidate = { id: 'key', model: 'his-model', tier: 'b', source: 'key' };

/** A Cloud host with everything set, on the included model, the larger model not yet allowed. */
const CLOUD: RouteFacts = {
  form: 'included',
  models: { flash: FLASH, second: SECOND, small: SMALL, large: LARGE, provider: PROVIDER, machine: MACHINE, embed: EMBED, key: KEY },
  large: false,
  machine: false,
};

const ids = (purpose: keyof typeof PURPOSES, facts: RouteFacts): string[] => routeFor(purpose, facts).candidates.map((c) => c.id);

type Reply = { text: string; model: string; usage: { in: number; out: number } };
const reply = (c: Candidate): Result<Reply> => ok({ text: 'yes', model: c.model, usage: { in: 12, out: 3 } });
const NOT_SERVED = no<Reply>('NOT_IN_THIS_BUILD', "No model answered for 'flash-chat': the provider does not serve it.", { at: 'model' });
const NO_ANSWER = no<Reply>('NOT_IN_THIS_BUILD', "No model answered for 'flash-chat': the provider did not answer.", { at: 'model' });
const BUDGET = no<Reply>('SLASH_BUDGET_SPENT', 'This call would cost 300 neurons and may spend 260.', { at: 'budget' });
const SCHEMA = no<Reply>('PROPOSAL_SCHEMA', "The answer from 'flash-chat' is not the JSON this call pinned.", { at: 'schema' });

type Row = { model: string; status: string; code: string | null; purpose: string; spends: string; route: string | null; candidate: string | null; raw: string | null };

/** The package's own ledger, a clock to move, and a call that answers each candidate as `said` says and notes who was asked. */
const bench = (facts: RouteFacts = CLOUD) => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  openStore(sql);
  const ledger = core(sql, clock, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
  const asked: string[] = [];
  const mailed: string[] = [];
  const deps: InferDeps = {
    facts,
    clock,
    ledger: { reserve: ledger.reserve, account: ledger.account, release: ledger.release, last: (candidate) => lastRows(sql, candidate) },
    notServed: (c) => void mailed.push(c.id),
  };
  const call = (said: Record<string, (n: number) => Result<Reply> | Error>): InferCall<Reply> => ({
    hold: 'read',
    kind: 'read',
    question: 'What is late?',
    run: (c) => {
      asked.push(c.id);
      const out = (said[c.id] ?? (() => reply(c)))(asked.filter((id) => id === c.id).length);
      return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
    },
  });
  const rows = (): Row[] =>
    sql.all<Row>('SELECT model, status, code, purpose, spends, route, candidate, raw FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { sql, clock, ledger, deps, call, asked, mailed, rows };
};

test('EVERY PURPOSE SAYS WHO PAYS AND ITS CLASS, as the scope tables them', () => {
  assert.deepEqual(PURPOSES.ask, { spends: 'person', class: 'answer' });
  assert.deepEqual(PURPOSES.automation, { spends: 'person', class: 'answer' });
  assert.deepEqual(PURPOSES.look, { spends: 'background', class: 'compose' });
  assert.deepEqual(PURPOSES.understand, { spends: 'background', class: 'small' });
  assert.deepEqual(PURPOSES.embed, { spends: 'background', class: 'embed' });
  assert.deepEqual(PURPOSES.probe, { spends: 'none', class: 'answer' });
  assert.equal(Object.keys(PURPOSES).length, 12);
});

test('THE INCLUDED ROUTES ARE IN THE ORDER THE SCOPE GIVES', () => {
  assert.deepEqual(ids('ask', CLOUD), ['flash', 'second', 'provider']);
  assert.deepEqual(ids('look', CLOUD), ['flash', 'second']);
  assert.deepEqual(ids('understand', CLOUD), ['flash', 'second']);
  assert.deepEqual(ids('prose', CLOUD), ['small', 'flash', 'second']);
  assert.deepEqual(ids('embed', CLOUD), ['embed']);
  const bare: RouteFacts = { form: 'included', models: { flash: FLASH }, large: false, machine: false };
  assert.deepEqual(ids('ask', bare), ['flash']);
  assert.deepEqual(ids('embed', bare), []);
});

test('A LARGE CANDIDATE IS SKIPPED UNLESS HE SAID YES, and his machine unless it is allowed', () => {
  assert.deepEqual(ids('compose', CLOUD), ['flash', 'second']);
  assert.deepEqual(ids('compose', { ...CLOUD, large: true }), ['large', 'flash', 'second']);
  assert.deepEqual(ids('compose', { ...CLOUD, large: true, machine: true }), ['machine', 'large', 'flash', 'second']);
  /* A YES IS FOR COMPOSING. It puts the larger model on no other class's route. */
  assert.deepEqual(ids('ask', { ...CLOUD, large: true }), ['flash', 'second', 'provider']);
  /* AND A CANDIDATE MARKED LARGE IS LARGE WHEREVER IT SITS: a host that hands it in as its flash model gets no route by it. */
  assert.deepEqual(ids('ask', { ...CLOUD, models: { flash: LARGE, second: SECOND } }), ['second']);
});

test('HIS OWN KEY IS A CHOICE AND NEVER A FALLBACK: alone on its route, and on no included one', () => {
  const keyed: RouteFacts = { ...CLOUD, form: 'key', large: true, machine: true };
  for (const purpose of ['ask', 'plan', 'automation', 'look', 'compose', 'understand', 'prose', 'probe'] as const)
    assert.deepEqual(ids(purpose, keyed), ['key'], purpose);
  assert.deepEqual(ids('embed', keyed), ['embed']);
  for (const purpose of Object.keys(PURPOSES) as (keyof typeof PURPOSES)[]) assert.ok(!ids(purpose, CLOUD).includes('key'), purpose);
});

test('A SELF-HOST ASKS ITS ENDPOINT, then its fallback endpoint if one is set', () => {
  const endpoint: Candidate = { id: 'endpoint', model: 'local', tier: 'byo', source: 'included' };
  const fallback: Candidate = { id: 'fallback', model: 'local-2', tier: 'byo', source: 'included' };
  assert.deepEqual(ids('ask', { form: 'selfhost', models: { endpoint }, large: false, machine: false }), ['endpoint']);
  assert.deepEqual(ids('compose', { form: 'selfhost', models: { endpoint, fallback }, large: true, machine: false }), ['endpoint', 'fallback']);
  assert.deepEqual(ids('embed', { form: 'selfhost', models: { endpoint, fallback }, large: false, machine: false }), []);
});

test('CANDIDATES ARE TRIED IN ORDER, and the first that answers is the one named', async () => {
  const b = bench();
  const got = await infer('ask', b.call({}), b.deps);
  assert.ok(got.out.ok);
  assert.deepEqual(b.asked, ['flash']);
  assert.equal(got.model, 'flash-chat');
  assert.equal(got.candidate?.id, 'flash');
  assert.deepEqual(b.rows(), [
    { model: 'flash-chat', status: 'ok', code: null, purpose: 'ask', spends: 'person', route: 'answer.included', candidate: 'flash', raw: null },
  ]);
  assert.equal(b.ledger.asksUsed(), 1);
});

test('A CANDIDATE NOT SERVED IS MARKED DOWN FOR A DAY AND THE NEXT ANSWERS: two rows, one ask', async () => {
  const b = bench();
  const got = await infer('ask', b.call({ flash: () => NOT_SERVED }), b.deps);
  assert.ok(got.out.ok);
  assert.deepEqual(b.asked, ['flash', 'second']);
  assert.equal(got.model, 'second-chat');
  assert.deepEqual(b.mailed, ['flash']);
  const rows = b.rows();
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0]?.candidate, rows[0]?.status, rows[0]?.spends], ['flash', 'error', 'none']);
  assert.deepEqual([rows[1]?.candidate, rows[1]?.status, rows[1]?.spends, rows[1]?.model], ['second', 'ok', 'person', 'second-chat']);
  assert.equal(b.ledger.asksUsed(), 1);

  /* AN HOUR LATER IT IS STILL DOWN: the first candidate is not asked, and nobody is mailed a second time. */
  b.clock.advance(HOUR);
  await infer('ask', b.call({ flash: () => NOT_SERVED }), b.deps);
  assert.deepEqual(b.asked, ['flash', 'second', 'second']);
  assert.deepEqual(b.mailed, ['flash']);

  /* AND AFTER A DAY IT IS TRIED AGAIN. */
  b.clock.advance(24 * HOUR);
  const later = await infer('ask', b.call({}), b.deps);
  assert.equal(later.model, 'flash-chat');
});

test('A BUDGET REFUSAL STOPS THE WALK: nothing is asked past it, and the refusal is the answer', async () => {
  const b = bench();
  const got = await infer('ask', b.call({ flash: () => BUDGET }), b.deps);
  assert.deepEqual(b.asked, ['flash']);
  assert.ok(!got.out.ok && 'refusal' in got.out);
  assert.equal(got.out.refusal.code, 'SLASH_BUDGET_SPENT');
  assert.equal(got.model, null);
  assert.equal(b.ledger.asksUsed(), 0);
  assert.equal(b.rows().length, 1);
  assert.equal(b.rows()[0]?.spends, 'none');
});

test('A 5XX OR NO ANSWER FALLS TO THE NEXT, a thrown call and a refusal alike', async () => {
  const b = bench();
  const got = await infer('ask', b.call({ flash: () => new Error('The Slash endpoint answered 503.'), second: () => NO_ANSWER }), b.deps);
  assert.ok(got.out.ok);
  assert.deepEqual(b.asked, ['flash', 'second', 'provider']);
  assert.equal(got.model, 'other-chat');
  assert.deepEqual(b.mailed, []);
  assert.deepEqual(
    b.rows().map((r) => [r.candidate, r.code, r.spends]),
    [
      ['flash', 'UNREACHABLE', 'none'],
      ['second', 'UNREACHABLE', 'none'],
      ['provider', null, 'person'],
    ],
  );
  assert.equal(b.rows()[0]?.raw, 'The Slash endpoint answered 503.');
});

test('WHEN THE LIST IS USED UP THE CALL ENDS UNREACHABLE, the operator\'s to fix, with a row an attempt', async () => {
  const b = bench();
  const down = () => NO_ANSWER;
  const got = await infer('look', b.call({ flash: down, second: down }), b.deps);
  assert.ok(!got.out.ok && 'refusal' in got.out);
  assert.equal(got.out.refusal.code, 'UNREACHABLE');
  assert.equal(got.whose, 'operator');
  assert.equal(got.model, null);
  assert.equal(b.rows().length, 2);
  assert.ok(b.rows().every((r) => r.spends === 'none' && r.purpose === 'look' && r.route === 'compose.included'));
  assert.equal(b.ledger.backgroundUsed(), 0);
  assert.doesNotMatch(got.out.refusal.fix, /flash|second|—/u);
});

test('THREE FAILURES IN TEN MINUTES PAUSE A CANDIDATE FOR TEN', async () => {
  const b = bench();
  const flash = () => NO_ANSWER;
  for (let i = 0; i < 3; i++) {
    await infer('ask', b.call({ flash }), b.deps);
    b.clock.advance(MINUTE);
  }
  assert.deepEqual(b.asked, ['flash', 'second', 'flash', 'second', 'flash', 'second']);
  await infer('ask', b.call({ flash }), b.deps);
  assert.deepEqual(b.asked.slice(6), ['second']);
  b.clock.advance(10 * MINUTE);
  await infer('ask', b.call({}), b.deps);
  assert.deepEqual(b.asked.slice(7), ['flash']);
});

test('A REPLY THAT BREAKS ITS SCHEMA IS ASKED FOR ONCE MORE, then the next candidate, and the ask counts once', async () => {
  const b = bench();
  const once = await infer('ask', b.call({ flash: (n) => (n === 1 ? SCHEMA : reply(FLASH)) }), b.deps);
  assert.deepEqual(b.asked, ['flash', 'flash']);
  assert.equal(once.model, 'flash-chat');
  assert.deepEqual(b.rows().map((r) => [r.code, r.spends]), [['PROPOSAL_SCHEMA', 'person'], [null, 'none']]);
  assert.equal(b.ledger.asksUsed(), 1);

  const c = bench();
  const twice = await infer('ask', c.call({ flash: () => SCHEMA }), c.deps);
  assert.deepEqual(c.asked, ['flash', 'flash', 'second']);
  assert.equal(twice.model, 'second-chat');
  assert.equal(c.ledger.asksUsed(), 1);
});

test('HIS OWN KEY IS NEVER FALLEN FROM: it fails and no included model is asked', async () => {
  const b = bench({ ...CLOUD, form: 'key' });
  const got = await infer('ask', b.call({ key: () => new Error('The Slash endpoint answered 503.') }), b.deps);
  assert.deepEqual(b.asked, ['key']);
  assert.ok(!got.out.ok && 'refusal' in got.out);
  assert.equal(got.out.refusal.code, 'UNREACHABLE');
  assert.equal(got.whose, 'owner');
  assert.deepEqual(b.rows().map((r) => [r.candidate, r.route, r.spends]), [['key', 'answer.key', 'none']]);
});

test('A KEY THAT WILL NOT OPEN STOPS THE WALK with the host\'s own error, and leaves no row and no hold', async () => {
  const b = bench({ ...CLOUD, form: 'key' });
  const closed = Object.assign(new Error('Your own key for Slash would not open, so nothing was sent.'), { name: 'SlashKeyClosedError' });
  await assert.rejects(infer('ask', b.call({ key: () => closed }), b.deps), /would not open/u);
  assert.deepEqual(b.asked, ['key']);
  assert.deepEqual(b.rows(), []);
});

test('A THROW AFTER THE MODEL RAN COUNTS ONCE, and the next candidate\'s answer spends nothing more', async () => {
  const b = bench();
  const late = Object.assign(new Error('The reply broke off.'), { answered: true });
  const got = await infer('headline', b.call({ flash: () => late }), b.deps);
  assert.equal(got.model, 'second-chat');
  assert.deepEqual(b.rows().map((r) => [r.candidate, r.spends]), [['flash', 'background'], ['second', 'none']]);
  assert.equal(b.ledger.backgroundUsed(), 1);
});

test('A PROBE SPENDS NOTHING, and a host with no model for a purpose says so without a row', async () => {
  const b = bench();
  const got = await infer('probe', b.call({}), b.deps);
  assert.equal(got.model, 'flash-chat');
  assert.equal(b.rows()[0]?.spends, 'none');

  const none = bench({ form: 'included', models: { flash: FLASH }, large: false, machine: false });
  const out = await infer('embed', none.call({}), none.deps);
  assert.ok(!out.out.ok && 'refusal' in out.out);
  assert.equal(out.out.refusal.code, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(none.rows(), []);
});

test("THE PAUSE RESTATED HERE IS SLASH'S, case for case: the constants and every answer agree (paused.ts)", () => {
  for (const name of ['NOT_SERVED', 'NOT_SERVED_PAUSE', 'FAILED_PAUSE', 'FAILS_TO_PAUSE', 'LAST_ROWS', 'RAW_MAX'] as const)
    assert.equal(hostPause[name], slashPause[name], `${name} differs between the host and Slash`);
  const at = (min: number) => new Date(T0 + min * MINUTE).toISOString();
  const fail = (min: number, raw: string | null = null): LastRow => ({ ts: at(min), status: 'error', code: 'UNREACHABLE', raw });
  const answered: LastRow = { ts: at(1), status: 'ok', code: null, raw: null };
  const served = `${hostPause.NOT_SERVED}: gone`;
  const cases: [readonly LastRow[], number][] = [
    [[], 0],
    [[fail(2), fail(1), fail(0)], 3],
    [[fail(2), fail(1), fail(0)], 12],
    [[fail(2), fail(1)], 3],
    [[fail(2), answered, fail(0), fail(-1)], 3],
    [[fail(20), fail(5), fail(0)], 21],
    [[fail(0, served)], 60],
    [[fail(0, served)], 24 * 60],
    [[{ ts: at(0), status: 'refused', code: 'SLASH_BUDGET_SPENT', raw: null }, fail(-1), fail(-2), fail(-3)], 1],
  ];
  for (const [rows, min] of cases) {
    const now = T0 + min * MINUTE;
    assert.equal(hostPause.pausedFor(rows, now), slashPause.pausedFor(rows, now), `the two disagree at minute ${min}`);
    assert.equal(hostPause.paused(rows, now), slashPause.paused(rows, now));
  }
  assert.equal(slashPause.pausedFor([fail(2), fail(1), fail(0)], T0 + 3 * MINUTE), 'failed', 'the table holds a pause, not only agreement');
});
