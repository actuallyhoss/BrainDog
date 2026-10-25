/**
 * The engine's health, read from Slash's own ledger (ENG-A02).
 *
 * WHY THIS FILE EXISTS. Settings said "All healthy" on the day a model job died eight times on the owner's record, because
 * nothing read whether a model answered. `health` reads the `slash_call` rows the engine already writes, so each state is
 * asserted here over a real ledger: the store `openStore` builds, rows written the way `core` writes them, and one ledger
 * written by real asks through `createSlash` to a model that throws.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { core, openStore } from '../src/call.ts';
import { ANSWER_STALE_DAYS, LEDGER_ANSWERED, LEDGER_BUDGET, LEDGER_FAILED } from '../src/health.ts';
import { createSlash, engineHealth, engineSaid, FAILS_DOWN, type EngineHealth } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const HOUR = 3_600_000;
const at = (ms: number): string => new Date(ms).toISOString();

const ledger = () => {
  const sql = openSqlite();
  openStore(sql);
  let n = 0;
  const row = (ms: number, status: string, code: string | null, model = '@cf/model', tier = 'a'): void =>
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code)
       VALUES (?, ?, 'read', ?, ?, 0, 0, 0, 0, ?, ?)`,
      `r${String(++n).padStart(4, '0')}`,
      at(ms),
      tier,
      model,
      status,
      code,
    );
  return { sql, row };
};

const MODEL = { model: true };

/** The three fields the state is, without what the ledger says beside it, which the tests at the end hold. */
const base = (h: EngineHealth): Pick<EngineHealth, 'state' | 'last_ok' | 'since'> => ({ state: h.state, last_ok: h.last_ok, since: h.since });

test('NO ROWS IS never_asked, and no model is off before the ledger is read', () => {
  const { sql } = ledger();
  const clock = fixedClock(NOW);
  assert.deepEqual(base(engineHealth(sql, clock, MODEL)), { state: 'never_asked', last_ok: null, since: null });
  assert.equal(engineSaid(engineHealth(sql, clock, MODEL), NOW).text, 'Slash has not needed its model yet.');
  const off = engineHealth(sql, clock, { model: false });
  assert.equal(off.state, 'off');
  assert.equal(engineSaid(off, NOW).whose, null);
  /* A STORE NEVER OPENED IS READ AS EMPTY, and the read creates nothing. */
  const bare = openSqlite();
  assert.equal(engineHealth(bare, clock, MODEL).state, 'never_asked');
  assert.equal(bare.one("SELECT name FROM sqlite_master WHERE name = 'slash_call'"), undefined);
});

test('AN ANSWER IS answering, and two failures after it are still answering', () => {
  const { sql, row } = ledger();
  row(NOW - 3 * HOUR, 'ok', null);
  row(NOW - 2 * HOUR, 'error', 'UNREACHABLE');
  row(NOW - HOUR, 'error', 'UNREACHABLE', '-');
  const h = engineHealth(sql, fixedClock(NOW), MODEL);
  assert.deepEqual(base(h), { state: 'answering', last_ok: at(NOW - 3 * HOUR), since: null });
  assert.deepEqual(engineSaid(h, NOW), { text: "Slash's model answered 3 hours ago.", whose: null });
  /* A reply that broke its schema was still a model answering. */
  row(NOW - 30 * 60_000, 'error', 'PROPOSAL_SCHEMA');
  assert.equal(engineSaid(engineHealth(sql, fixedClock(NOW), MODEL), NOW).text, "Slash's model answered 30 minutes ago.");
});

test('THREE FAILURES AFTER THE LAST ANSWER, the newest under a day old, is not_answering since the first of them', () => {
  const { sql, row } = ledger();
  const first = Date.UTC(2026, 9, 6, 2);
  row(first - DAYS(2), 'ok', null);
  row(first, 'error', 'UNREACHABLE');
  row(first + HOUR, 'error', 'PULL_REQUEST_REFUSED');
  row(first + 2 * HOUR, 'error', 'ANSWER_UNREADABLE');
  /* A hold in flight and a budget refusal say nothing about the model. */
  row(first + 3 * HOUR, 'error', 'SLASH_PENDING');
  row(first + 4 * HOUR, 'refused', 'SLASH_BUDGET_SPENT');
  row(first + 5 * HOUR, 'nothing', null, '-');
  const clock = fixedClock(first + 6 * HOUR);
  const h = engineHealth(sql, clock, MODEL);
  assert.deepEqual(base(h), { state: 'not_answering', last_ok: at(first - DAYS(2)), since: at(first) });
  const s = engineSaid(h, clock.now());
  assert.deepEqual(s, {
    text: "Slash's model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules.",
    whose: 'ours',
  });
  assert.doesNotMatch(s.text, /@cf|UNREACHABLE|infer\./);
  /* A day later with nobody asking, the last answer is still true and the alarm is not kept up. */
  clock.set(first + 2 * HOUR + DAYS(1) + 1);
  assert.equal(engineHealth(sql, clock, MODEL).state, 'answering');
  /* And the next answer ends it. */
  row(first + 7 * HOUR, 'ok', null);
  clock.set(first + 8 * HOUR);
  assert.deepEqual(base(engineHealth(sql, clock, MODEL)), { state: 'answering', last_ok: at(first + 7 * HOUR), since: null });
});

test('HIS OWN KEY TURNED AWAY, or a host that says it will not open, is key_closed and his to fix', () => {
  const { sql, row } = ledger();
  const first = Date.UTC(2026, 9, 6, 9);
  row(first - HOUR, 'ok', null, 'claude', 'b');
  row(first, 'error', 'PULL_REQUEST_REFUSED', '-', 'b');
  const clock = fixedClock(first + HOUR);
  const h: EngineHealth = engineHealth(sql, clock, { model: true, own_key: true });
  assert.deepEqual(base(h), { state: 'key_closed', last_ok: at(first - HOUR), since: at(first) });
  assert.deepEqual(engineSaid(h, clock.now()), {
    text: 'Your own key for Slash has not opened since 6 October. Open it in the keychain, or switch to the included model.',
    whose: 'yours',
  });
  /* The same row on the included model is not his key's. */
  assert.equal(engineHealth(sql, clock, MODEL).state, 'answering');
  /* A key the keychain will not open leaves no row, so the host says it. */
  const empty = ledger();
  const shut = engineHealth(empty.sql, clock, { model: true, own_key: true, key_open: false });
  assert.equal(shut.state, 'key_closed');
  assert.equal(engineSaid(shut, clock.now()).text, 'Your own key for Slash will not open. Open it in the keychain, or switch to the included model.');
});

test('HOLDS IN FLIGHT ARE NEITHER, and a refusal on the included model is never his key', () => {
  const { sql, row } = ledger();
  const clock = fixedClock(NOW);
  /* Holds alone are a ledger nobody has been answered from yet, and never a failure. */
  for (let i = 3; i > 0; i--) row(NOW - i * HOUR, 'error', 'SLASH_PENDING');
  assert.equal(engineHealth(sql, clock, MODEL).state, 'never_asked');
  /* After an answer, three holds do not make three failures. */
  row(NOW - 4 * HOUR, 'ok', null);
  assert.deepEqual(base(engineHealth(sql, clock, MODEL)), { state: 'answering', last_ok: at(NOW - 4 * HOUR), since: null });
  /* The included model turned away while he has his own key set: ours, not his. */
  for (let i = 1; i <= FAILS_DOWN; i++) row(NOW - i * 60_000, 'error', 'PULL_REQUEST_REFUSED', '-', 'a');
  const h = engineHealth(sql, clock, { model: true, own_key: true });
  assert.equal(h.state, 'not_answering');
  /* And no sentence names a model, a job or a code. */
  for (const state of ['answering', 'not_answering', 'never_asked', 'off', 'key_closed'] as const)
    assert.doesNotMatch(engineSaid({ state, last_ok: at(NOW - HOUR), since: at(NOW - HOUR) }, NOW).text, /@cf|claude|gpt|[A-Z]{2,}_[A-Z]|infer\.|rule\.|—/);
});

test('A REAL LEDGER: three asks to a model that throws, written by the engine itself, read as not_answering', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  assert.equal(engineHealth(sql, clock, MODEL).state, 'never_asked');
  for (let i = 0; i < FAILS_DOWN; i++) {
    inference.say(new Error('5016: account not allowed'));
    /* The read answers the person in its own words; what matters here is the row it settled. */
    await slash.read('what is still open', OWNER);
    clock.advance(60_000);
  }
  /* A hold written and not yet settled is passed over. */
  core(sql, clock, inference).reserve('read', 'a', '@cf/model', { purpose: 'ask', spends: 'person' });
  const h = engineHealth(sql, clock, MODEL);
  assert.equal(h.state, 'not_answering', JSON.stringify(sql.all('SELECT ts, kind, model, status, code FROM slash_call')));
  assert.equal(h.since, at(NOW));
  assert.equal(h.last_ok, null);
  assert.equal(engineSaid(h, clock.now()).whose, 'ours');
});

function DAYS(n: number): number {
  return n * 24 * HOUR;
}

test('AN ANSWER 20 DAYS OLD AND TWO FRESH FAILURES IS not_answering: a stale answer earns no blip (audit 36-37, 7)', () => {
  const { sql, row } = ledger();
  row(NOW - DAYS(20), 'ok', null);
  row(NOW - 3 * HOUR, 'error', 'UNREACHABLE');
  row(NOW - HOUR, 'error', 'UNREACHABLE');
  const h = engineHealth(sql, fixedClock(NOW), MODEL);
  assert.deepEqual(base(h), { state: 'not_answering', last_ok: at(NOW - DAYS(20)), since: at(NOW - 3 * HOUR) });
  assert.match(engineSaid(h, NOW).text, /^Slash's model has not answered since /u);
  assert.doesNotMatch(engineSaid(h, NOW).text, /20 days ago/u);

  /* ONE FRESH FAILURE IS ENOUGH past the line, and none older than a day is: nobody asked since, so the answer stands. */
  const one = ledger();
  one.row(NOW - DAYS(ANSWER_STALE_DAYS) - HOUR, 'ok', null);
  one.row(NOW - HOUR, 'error', 'ANSWER_UNREADABLE');
  assert.equal(engineHealth(one.sql, fixedClock(NOW), MODEL).state, 'not_answering');
  const old = ledger();
  old.row(NOW - DAYS(20), 'ok', null);
  old.row(NOW - DAYS(2), 'error', 'UNREACHABLE');
  assert.equal(engineHealth(old.sql, fixedClock(NOW), MODEL).state, 'answering');

  /* AND A RECENT ANSWER KEEPS FAILS_DOWN: two fresh failures six days after it are still the blip the retry mends. */
  const recent = ledger();
  recent.row(NOW - DAYS(6), 'ok', null);
  recent.row(NOW - 2 * HOUR, 'error', 'UNREACHABLE');
  recent.row(NOW - HOUR, 'error', 'UNREACHABLE');
  assert.equal(engineHealth(recent.sql, fixedClock(NOW), MODEL).state, 'answering');
});

test('A SPENT MONTH IS ITS OWN CLAUSE (audit 40-42, 5): never an answer, never a failure, and every refusal counted', () => {
  /* What the vital sign reads from these three clauses (`packages/host/src/sign-model.ts`); Settings says the meter. */
  const counts = (sql: ReturnType<typeof ledger>['sql']) =>
    sql.one<{ yes: number; no: number; spent: number }>(
      `SELECT SUM(CASE WHEN ${LEDGER_ANSWERED} THEN 1 ELSE 0 END) AS yes, SUM(CASE WHEN ${LEDGER_FAILED} THEN 1 ELSE 0 END) AS no,
              SUM(CASE WHEN ${LEDGER_BUDGET} THEN 1 ELSE 0 END) AS spent FROM slash_call`,
    );
  const clock = fixedClock(NOW);

  /* Five answers, then fifty refusals: the refusals are newest, and none of them is read as an answer. */
  const a = ledger();
  for (let i = 0; i < 5; i++) a.row(NOW - (100 + i) * HOUR, 'ok', null);
  /* EACH AS SLASH WRITES IT (`TURNED_AWAY_SQL`): under `-`. One more under the model's own name is a call refused for
     its size (the worker's per-call neuron ceiling), never the month spent. */
  for (let i = 0; i < 50; i++) a.row(NOW - (1 + i) * HOUR, 'refused', 'SLASH_BUDGET_SPENT', '-');
  a.row(NOW - 60 * HOUR, 'refused', 'SLASH_BUDGET_SPENT');
  assert.deepEqual({ ...counts(a.sql) }, { yes: 5, no: 0, spent: 50 });
  assert.equal(a.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM slash_call WHERE (${LEDGER_ANSWERED}) AND (${LEDGER_BUDGET})`)?.n, 0);
  assert.equal(engineHealth(a.sql, clock, MODEL).last_ok, at(NOW - 100 * HOUR), 'the last answer is the last answer, not a refusal');

  /* No answer and fifty refusals, under either name: fifty, not an empty ledger, and not fifty failures. */
  const b = ledger();
  for (let i = 0; i < 50; i++) b.row(NOW - (1 + i) * HOUR, 'error', i % 2 === 0 ? 'SLASH_BUDGET_SPENT' : 'SPARK_BUDGET_SPENT', '-');
  assert.deepEqual({ ...counts(b.sql) }, { yes: 0, no: 0, spent: 50 });

  /* An answer after a refusal: still one answer more, and the refusal still counted. */
  const c = ledger();
  c.row(NOW - 5 * HOUR, 'refused', 'SLASH_BUDGET_SPENT', '-');
  c.row(NOW - 2 * HOUR, 'ok', null);
  assert.deepEqual({ ...counts(c.sql) }, { yes: 1, no: 0, spent: 1 });
  assert.deepEqual(base(engineHealth(c.sql, clock, MODEL)), { state: 'answering', last_ok: at(NOW - 2 * HOUR), since: null });
});

/* ── What the ledger says beside the state (ENG-A05, ENG-A06: "health shown") ─────────────────────────────────────── */

type Planted = { ms: number; status: string; kind?: string; code?: string | null; model?: string; tier?: string; spends?: string; route?: string | null; candidate?: string | null; raw?: string | null };

/** A ledger at version 3, its rows planted with the columns a router writes, in the order they were settled. */
const routed = () => {
  const sql = openSqlite();
  openStore(sql);
  let n = 0;
  const row = (r: Planted): void =>
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, spends, route, candidate, raw)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?)`,
      `p${String(++n).padStart(4, '0')}`,
      at(r.ms),
      r.kind ?? 'read',
      r.tier ?? 'a',
      r.model ?? 'glm-5.3-flash',
      r.status,
      r.code ?? null,
      r.spends ?? 'person',
      r.route ?? null,
      r.candidate ?? null,
      r.raw ?? null,
    );
  return { sql, row };
};

test('WHO ANSWERED LAST is the newest answering row, by the model on it, and none is said before one answers', () => {
  const { sql, row } = routed();
  const clock = fixedClock(NOW);
  assert.equal(engineHealth(sql, clock, MODEL).answeredBy, undefined, 'an empty ledger names nobody');
  row({ ms: NOW - 5 * HOUR, status: 'ok', model: 'llama-3.2-1b', route: 'answer.included', candidate: 'small' });
  row({ ms: NOW - 2 * HOUR, status: 'ok', model: 'glm-5.3-flash', route: 'answer.included', candidate: 'flash' });
  /* A failure after it, and a hold in flight, answer nothing. */
  row({ ms: NOW - HOUR, status: 'error', code: 'UNREACHABLE', model: 'glm-5.3', spends: 'none', route: 'answer.included', candidate: 'second' });
  core(sql, clock, canned()).reserve('read', 'a', 'glm-5.3', { purpose: 'ask', spends: 'person' });
  assert.deepEqual(engineHealth(sql, clock, MODEL).answeredBy, { model: 'glm-5.3-flash', at: at(NOW - 2 * HOUR) });
});

test("A FAILURE'S OWN WORDS are carried, cut at 200, and anything shaped like a key is cut out of them", () => {
  const { sql, row } = routed();
  const clock = fixedClock(NOW);
  row({ ms: NOW - 3 * HOUR, status: 'ok' });
  row({ ms: NOW - 2 * HOUR, status: 'error', code: 'UNREACHABLE', spends: 'none', candidate: 'flash', raw: 'An older failure.' });
  row({
    ms: NOW - HOUR,
    status: 'error',
    code: 'UNREACHABLE',
    spends: 'none',
    candidate: 'flash',
    raw: `Rate limited for this account. Authorization: Bearer sk-live-Q7d9Xk2Lm4 api_key=zz-1234567890 ${'and then some '.repeat(30)}`,
  });
  const words = engineHealth(sql, clock, MODEL).lastWords;
  assert.ok(words !== undefined && words.startsWith('Rate limited for this account.'), 'the newest failure speaks');
  assert.ok(!words.includes('sk-live') && !words.includes('Q7d9Xk2Lm4') && !words.includes('1234567890'), 'no key survives');
  assert.ok(words.includes('[cut]'));
  assert.ok(words.length <= 200);
  /* An old row with no words on it says none: never the older row's words in its place. */
  row({ ms: NOW - HOUR / 2, status: 'error', code: 'UNREACHABLE', spends: 'none', candidate: 'flash' });
  assert.equal(engineHealth(sql, clock, MODEL).lastWords, undefined);
});

test('THE EMBEDDING IS NEVER AN ANSWER, NOR A FAILURE: health speaks for the model that writes (22 October)', () => {
  const { sql, row } = routed();
  const clock = fixedClock(NOW);
  const GATEWAY = "Today's look failed: 2001: Please configure AI Gateway in the Cloudflare dashboard";
  /* The model that writes answered two days ago and has failed three times since; the embedding answered every hour. */
  row({ ms: NOW - DAYS(2), status: 'ok', model: 'glm-5.3-flash' });
  for (let i = 0; i < 3; i++) row({ ms: NOW - (20 - i) * HOUR, status: 'error', code: 'UNREACHABLE', spends: 'none', raw: GATEWAY });
  for (let i = 0; i < 12; i++) row({ ms: NOW - (12 - i) * HOUR, kind: 'embed', status: 'ok', model: '@cf/baai/bge-m3', spends: 'background' });
  const h = engineHealth(sql, clock, MODEL);
  assert.deepEqual(base(h), { state: 'not_answering', last_ok: at(NOW - DAYS(2)), since: at(NOW - 20 * HOUR) });
  assert.deepEqual(h.answeredBy, { model: 'glm-5.3-flash', at: at(NOW - DAYS(2)) }, 'who answered last is not the embedding');
  assert.equal(h.lastWords, GATEWAY);
  assert.match(engineSaid(h, NOW).text, /^Slash's model has not answered since /);
  assert.doesNotMatch(engineSaid(h, NOW).text, /bge|embed|2001/);

  /* An embedding that does not answer is no failure of the model that writes, however many there are. */
  const b = routed();
  b.row({ ms: NOW - 3 * HOUR, status: 'ok', model: 'glm-5.3-flash' });
  for (let i = 0; i < 6; i++) b.row({ ms: NOW - (2 * HOUR - i * 60_000), kind: 'embed', status: 'error', code: 'UNREACHABLE', spends: 'none', raw: 'No embedding today.' });
  const w = engineHealth(b.sql, clock, MODEL);
  assert.deepEqual(base(w), { state: 'answering', last_ok: at(NOW - 3 * HOUR), since: null });
  assert.equal(w.lastWords, undefined);

  /* A ledger of embeddings alone has asked the model that writes nothing. */
  const c = routed();
  c.row({ ms: NOW - HOUR, kind: 'embed', status: 'ok', model: '@cf/baai/bge-m3', spends: 'background' });
  assert.deepEqual(base(engineHealth(c.sql, clock, MODEL)), { state: 'never_asked', last_ok: null, since: null });
});

test('THE LAST WORDS CARRY NO ID, NO ACCOUNT NUMBER AND NO PROMPT, and keep the code a person can search for', () => {
  const { sql, row } = routed();
  row({ ms: NOW - 3 * HOUR, status: 'ok' });
  row({
    ms: NOW - HOUR,
    status: 'error',
    code: 'UNREACHABLE',
    spends: 'none',
    raw: 'AiError 2001: Please configure AI Gateway, account 123456789012, record rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3, request 4f9c2a7e81b3d605, prompt: "what did Mara owe"',
  });
  const words = engineHealth(sql, fixedClock(NOW), MODEL).lastWords ?? '';
  assert.match(words, /2001: Please configure AI Gateway/);
  assert.ok(!/123456789012|01J8Z3N4W5X6Y7Z8A9B0C1D2E3|4f9c2a7e81b3d605|Mara/.test(words), words);
  assert.equal(words.split('[cut]').length - 1, 4, words);
});

test('TWO ATTEMPTS FOR ONE ASK, AND ONE FOR ANOTHER, is a second model for one ask of two', () => {
  const { sql, row } = routed();
  const clock = fixedClock(NOW);
  /* The first ask: the flash model does not answer, the second model does, on the same route. */
  row({ ms: NOW - 4 * HOUR, status: 'error', code: 'UNREACHABLE', spends: 'none', route: 'answer.included', candidate: 'flash' });
  row({ ms: NOW - 4 * HOUR, status: 'ok', model: 'glm-5.3', route: 'answer.included', candidate: 'second' });
  /* The second ask answers first time. */
  row({ ms: NOW - 2 * HOUR, status: 'ok', route: 'answer.included', candidate: 'flash' });
  const h = engineHealth(sql, clock, MODEL);
  assert.equal(h.doubleShare, 0.5);
  assert.deepEqual(h.doubleOf, { twice: 1, asks: 2 });
  /* A reply that broke its schema, asked again of the same model, is one model asked twice, never a second model. */
  row({ ms: NOW - HOUR, status: 'refused', code: 'PROPOSAL_SCHEMA', spends: 'person', route: 'answer.included', candidate: 'flash' });
  row({ ms: NOW - HOUR, status: 'ok', spends: 'none', route: 'answer.included', candidate: 'flash' });
  assert.deepEqual(engineHealth(sql, clock, MODEL).doubleOf, { twice: 1, asks: 4 });
});

test("THE WALK AS core WRITES IT reads as a second model, and old rows with no route or candidate read as one model", async () => {
  const sql = openSqlite();
  openStore(sql);
  sql.exec("INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, 'a', NULL, NULL, 80, '2026-11-14')");
  const first = canned();
  const second = canned();
  first.say(new Error('model not served'));
  second.say(JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null }), { in: 300, out: 40 });
  const c = core(sql, fixedClock(NOW), canned(), ['a'], ['a', 'b', 'byo'], () => [
    { id: 'flash', model: 'glm-5.3-flash', inference: first },
    { id: 'small', model: 'llama-3.2-1b', inference: second },
  ]);
  const out = await c.run({ id: 'predicate', slots: { '%INDEX%': 'obligations', '%FIGURES%': 'none', '%QUESTION%': 'What is still open?' } });
  assert.ok(out.out.ok);
  c.account({ id: c.mint(), kind: 'read', tier: 'a', model: out.model, usage: out.usage, ms: out.ms, status: 'ok', purpose: 'ask', spends: 'person', served: true, candidate: out.candidate });
  /* An old row from before version 3: no route, no candidate, no words. */
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES ('old1', ?, 'read', 'a', 'glm-5.3-flash', 0, 0, 0, 0, 'ok', NULL)`,
    at(NOW - DAYS(3)),
  );
  const h = engineHealth(sql, fixedClock(NOW), MODEL);
  assert.deepEqual(h.doubleOf, { twice: 1, asks: 2 });
  assert.deepEqual(h.answeredBy, { model: 'llama-3.2-1b', at: at(NOW) });
});

test("THIS MONTH'S ASKS SPLIT BY WHOSE ALLOWANCE, counted as the meter counts them", () => {
  const { sql, row } = routed();
  const clock = fixedClock(NOW);
  const c = core(sql, clock, canned());
  row({ ms: NOW - HOUR, status: 'ok', spends: 'person' });
  row({ ms: NOW - 2 * HOUR, status: 'ok', spends: 'person' });
  row({ ms: NOW - 3 * HOUR, status: 'ok', spends: 'background' });
  /* An attempt nobody answered, an ask on his own key (listed, not his allowance) and last month's ask spend nothing here. */
  row({ ms: NOW - 4 * HOUR, status: 'error', code: 'UNREACHABLE', spends: 'none' });
  row({ ms: NOW - 5 * HOUR, status: 'ok', spends: 'person', tier: 'b' });
  row({ ms: Date.UTC(2026, 9, 30), status: 'ok', spends: 'person' });
  const h = engineHealth(sql, clock, MODEL);
  assert.deepEqual(h.spent, { person: 2, background: 1 });
  assert.deepEqual(h.spent, { person: c.asksUsed(), background: c.backgroundUsed() }, "the meter's own two counts");
});

test('A LEDGER WITH NOTHING BESIDE THE STATE SAYS NOTHING BESIDE IT: no field, never a zero or a null', () => {
  const { sql, row } = ledger();
  for (let i = 0; i < 3; i++) row(NOW - (3 - i) * HOUR, 'error', 'UNREACHABLE', '-');
  assert.deepEqual(engineHealth(sql, fixedClock(NOW), MODEL), { state: 'not_answering', last_ok: null, since: at(NOW - 3 * HOUR) });
  assert.equal(engineHealth(sql, fixedClock(NOW), { model: false }).answeredBy, undefined);
});
