/**
 * The walk: "Rules are the fallback, not the engine."
 *
 * WHEN THE FIRST MODEL DOES NOT ANSWER, THE NEXT ONE THE HOST HANDED IS ASKED, before a caller's rules speak. Each attempt
 * is one ledger row priced by its own model, the answer carries the model that gave it, and the ask is counted once.
 * What ends the walk is asserted as hard: a budget refusal, a reply that broke the schema, a throw the host marked
 * `answered`, a route of one, and his own key. No route is the one call `core.run` always made. Every model is canned.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { core, openStore } from '../src/call.ts';
import { palette } from '../src/propose.ts';
import { MODELS } from '../src/prompts.ts';
import type { SlashCandidate, SlashPurpose } from '../src/types.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });
const QUESTION = 'What is still open?';
const SLOTS = { '%INDEX%': 'obligations', '%FIGURES%': 'none', '%QUESTION%': QUESTION };

type Line = { kind: string; model: string; status: string; code: string | null; spends: string; candidate: string | null; neurons: number; tokens_in: number };

const build = (route?: (purpose: SlashPurpose) => readonly SlashCandidate[], tier: 'a' | 'b' = 'a') => {
  const sql = openSqlite();
  openStore(sql);
  sql.exec("INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, NULL, NULL, 80, '2026-11-14')", tier);
  const fallback = canned();
  const c = core(sql, fixedClock(NOW), fallback, ['a'], ['a', 'b', 'byo'], route);
  const rows = () =>
    sql.all<Line>('SELECT kind, model, status, code, spends, candidate, neurons, tokens_in FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { sql, c, fallback, rows, read: () => palette(c, fakeRecord(), fallback).read(QUESTION, OWNER) };
};

const priced = (model: keyof typeof MODELS, usage: { in: number; out: number }): number =>
  Math.round((usage.in * MODELS[model].in) / 1e6 + (usage.out * MODELS[model].out) / 1e6);

test('THE FIRST CANDIDATE NOT SERVED, THE SECOND ANSWERS: its answer, two rows each priced by its own model, one ask', async () => {
  const first = canned();
  const second = canned();
  first.say(new Error('model not served'));
  second.say(PREDICATE, { in: 300, out: 40 });
  const asked: SlashPurpose[] = [];
  const { c, fallback, rows, read } = build((purpose) => {
    asked.push(purpose);
    return [
      { id: 'flash', model: 'glm-5.3-flash', inference: first },
      { id: 'small', model: 'llama-3.2-1b', inference: second },
    ];
  });
  const out = await read();
  assert.ok(out.ok, 'the read answered from the second candidate');
  assert.deepEqual(out.value.predicate, { all: [{ field: 'state', is: 'open' }] });
  assert.deepEqual(asked, ['ask'], "the route is asked once, for the template's purpose");
  assert.equal(first.seen.length, 1);
  assert.equal(second.seen.length, 1);
  assert.equal(second.seen[0]?.model, 'llama-3.2-1b');
  assert.equal(fallback.seen.length, 0, "the caller's own adapter is not asked when a candidate brings its own");
  const [passed, answered] = rows();
  assert.equal(rows().length, 2);
  assert.deepEqual(
    { kind: passed?.kind, model: passed?.model, status: passed?.status, code: passed?.code, spends: passed?.spends, candidate: passed?.candidate },
    { kind: 'read', model: 'glm-5.3-flash', status: 'error', code: 'UNREACHABLE', spends: 'none', candidate: 'flash' },
  );
  assert.equal(passed?.neurons, priced('glm-5.3-flash', { in: passed?.tokens_in ?? 0, out: 0 }));
  assert.equal(answered?.model, 'llama-3.2-1b', 'the row says the model that answered');
  assert.equal(answered?.candidate, 'small', "the caller's row names the candidate that answered (slash-purpose-93#3)");
  assert.equal(answered?.status, 'ok');
  assert.equal(answered?.spends, 'person');
  assert.equal(answered?.neurons, priced('llama-3.2-1b', { in: 300, out: 40 }));
  assert.equal(c.asksUsed(), 1, 'one question is one ask, whatever it took');
});

test("A CANDIDATE WITH NO WIRE OF ITS OWN IS ASKED ON THE CALLER'S, under its own name; a throw that sent nothing is under -", async () => {
  const { c, fallback, rows } = build(() => [{ id: 'flash', model: 'glm-5.3-flash' }, { id: 'second', model: 'glm-5.3-flash-b' }]);
  fallback.say(Object.assign(new Error('nothing was sent'), { sent: false }));
  fallback.say(PREDICATE);
  const ran = await c.run({ id: 'predicate', slots: SLOTS, inference: fallback });
  assert.ok(ran.out.ok);
  assert.equal(ran.model, 'glm-5.3-flash-b', 'the answer carries the model that gave it');
  assert.equal(ran.candidate, 'second');
  assert.deepEqual(fallback.seen.map((s) => s.model), ['glm-5.3-flash', 'glm-5.3-flash-b']);
  assert.deepEqual(rows().map((r) => [r.model, r.code, r.spends, r.candidate]), [['-', 'UNREACHABLE', 'none', 'flash']]);
});

test('A BUDGET REFUSAL DOES NOT FALL THROUGH: it is true of the next candidate too', async () => {
  const first = canned();
  const second = canned();
  first.say(Object.assign(new Error('out of asks'), { code: 'SLASH_BUDGET_SPENT', sent: false }));
  second.say(PREDICATE);
  const { c, rows, read } = build(() => [
    { id: 'flash', model: 'glm-5.3-flash', inference: first },
    { id: 'small', model: 'llama-3.2-1b', inference: second },
  ]);
  await read();
  assert.equal(second.seen.length, 0, 'the second candidate was never asked');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0]?.code, 'UNREACHABLE');
  assert.equal(rows()[0]?.spends, 'none');
  assert.equal(c.asksUsed(), 0);
});

test('A REPLY THAT BROKE THE SCHEMA, OR A THROW MARKED answered, ENDS THE WALK: it was served and counts once', async () => {
  for (const said of ['not json', Object.assign(new Error('the body broke off'), { answered: true })]) {
    const first = canned();
    const second = canned();
    first.say(said);
    second.say(PREDICATE);
    const { c } = build(() => [
      { id: 'flash', model: 'glm-5.3-flash', inference: first },
      { id: 'small', model: 'llama-3.2-1b', inference: second },
    ]);
    const ran = await c.run({ id: 'predicate', slots: SLOTS, inference: canned() });
    assert.equal(ran.out.ok, false);
    assert.equal(ran.served, true);
    assert.equal(ran.candidate, 'flash');
    assert.equal(second.seen.length, 0);
  }
});

test('NO ROUTE IS ONE ROW AS TODAY: the template model on the caller adapter, no candidate named', async () => {
  const { c, fallback, rows, read } = build();
  fallback.say(PREDICATE);
  assert.ok((await read()).ok);
  assert.deepEqual(fallback.seen.map((s) => s.model), ['glm-5.3-flash']);
  assert.deepEqual(rows().map((r) => [r.model, r.status, r.spends, r.candidate]), [['glm-5.3-flash', 'ok', 'person', null]]);
  assert.equal(c.asksUsed(), 1);
  const ran = await (async () => {
    fallback.say(new Error('down'));
    return c.run({ id: 'predicate', slots: SLOTS, inference: fallback });
  })();
  assert.equal('candidate' in ran, false, 'a Ran with no route carries no candidate field at all');
});

test('A ROUTE OF ONE NEVER FALLS: his own key not answering is the one row, and nothing else is asked', async () => {
  const key = canned();
  key.say(new Error('his provider did not answer'));
  const { fallback, rows, read } = build(() => [{ id: 'key', model: 'glm-5.3-flash', inference: key }]);
  /* THE READ STILL ANSWERS, BY ITS RULES (a search of the words asked), which is the fallback and not the engine. */
  await read();
  assert.equal(key.seen.length, 1);
  assert.equal(fallback.seen.length, 0);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0]?.code, 'UNREACHABLE');
});

test('ON HIS OWN KEY, OR A MODEL HE NAMED, THE ROUTE IS NOT WALKED: his choice is never a fallback', async () => {
  const first = canned();
  const { c, fallback } = build(() => [{ id: 'flash', model: 'glm-5.3-flash', inference: first }], 'b');
  fallback.say(PREDICATE);
  assert.ok((await c.run({ id: 'predicate', slots: SLOTS, inference: fallback })).out.ok);
  assert.equal(first.seen.length, 0);
  const named = build(() => [{ id: 'flash', model: 'glm-5.3-flash', inference: first }]);
  named.fallback.say(PREDICATE);
  assert.ok((await named.c.run({ id: 'predicate', slots: SLOTS, inference: named.fallback, model: 'his-model' })).out.ok);
  assert.deepEqual(named.fallback.seen.map((s) => s.model), ['his-model']);
  assert.equal(first.seen.length, 0);
});
