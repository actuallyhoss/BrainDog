/**
 * The package's half of audit sixty's findings 4 and 5: whose neurons a tier spends is the host's to say, and one throw
 * from a model that was reached is settled the same way whichever path made the call.
 *
 * `loop/research-batch-sixty-audit.md` FINDING 4. `account` priced tier `a` alone, on `46 §4.1`'s "not our money". On the
 * Worker with no endpoint, tier `byo` goes to the included model, Workers AI on the operator's account, and the audit's S3
 * read `{ tier: byo, tokens_in: 700, tokens_out: 60, neurons: 0 }` for a call the platform billed. The package cannot know
 * which model a host's `byo` reaches, so the host names the tiers it pays for in neurons (`SlashOptions.priced`) and the
 * default stays tier `a`, which is what every other host still means.
 *
 * FINDING 5. A binding that threw after it was called is a model reached, and the Worker now marks the throw `reached`.
 * `read` kept the model's name on every throw, priced the prompt estimate and counted the ask; `answer` settled the same
 * throw under `-`, unpriced and uncounted, and the host's ladder asked it again up to the eighth rung with nobody counting.
 * Both paths now settle a marked throw under the model's name, priced by one rule and counted, so the ladder's rungs are
 * spent from `ask_cap` like any other call. An unmarked throw on `answer` still means "not reached" and keeps `-`, which
 * is audit forty-two's finding 6 (`slash-answered-counted.test.ts` case 4 holds it).
 *
 * RED BEFORE THE REPAIR, MEASURED ON 24 SEPTEMBER: 4 tests, 1 pass, 3 fail. Case 1 read `neurons: 0` for the `byo` row,
 * case 3 read `{ model: '-', neurons: 0 }` and `asks.used` 1 where the read beside it read 2, and case 4 read three
 * `UNREACHABLE` answers at `ask_cap: 2` where the third should have been `SLASH_BUDGET_SPENT`. Case 2 passed before and
 * after, which is its job: a host that names nothing keeps `46 §4.1`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { createSlash, MODELS, type Ask, type Inference, type SlashOptions } from '../src/index.ts';
import { fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const RATE: Ask = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' };
const FLASH = MODELS['glm-5.3-flash'];

/** A reply the included model would give, with the counts Workers AI reported in the audit's probe. */
const answering = (text: string): Inference => ({
  complete: async () => ({ text, usage: { in: 700, out: 60 }, model: 'glm-5.3-flash' }),
});

/** What the Worker's adapter throws when the binding was called and threw: the sentence, the mark and the routing name. */
const reachedError = (): Error => Object.assign(new Error('InferenceUpstreamError: 3043 internal server error'), { reached: true, model: 'glm-5.3-flash' });

const throwing = (e: () => Error): Inference & { calls(): number } => {
  let calls = 0;
  return {
    calls: () => calls,
    complete: async () => {
      calls++;
      throw e();
    },
  };
};

type Row = { kind: string; tier: string; model: string; tokens_in: number; tokens_out: number; neurons: number; code: string | null; question: string | null };

const build = (inference: Inference, options?: SlashOptions) => {
  const sql = openSqlite();
  /* THE SECOND ARGUMENT IS NEW, and the red run passed it to a `createSlash` that took one: ignored, as JavaScript does. */
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() }, options);
  const rows = () => sql.all<Row>('SELECT kind, tier, model, tokens_in, tokens_out, neurons, code, question FROM call ORDER BY ts, rowid').map((r) => ({ ...r }));
  return { sql, slash, rows };
};

/** The one pricing rule `account` applies, written out so a row can be checked against it rather than against a number. */
const priced = (r: Pick<Row, 'tokens_in' | 'tokens_out'>): number => Math.round((r.tokens_in * FLASH.in) / 1e6 + (r.tokens_out * FLASH.out) / 1e6);

test('(1) A HOST THAT PAYS FOR TIER byo IN NEURONS HAS ITS byo ROWS PRICED, at the same rate tier a is priced at', async () => {
  const { sql, slash, rows } = build(answering('{"registers":["obligations"],"where":null,"q":"rent"}'), { priced: ['a', 'b', 'byo'] });
  assert.ok(slash.configure({ tier: 'byo', model: 'glm-5.3-flash' }, OWNER).ok);
  const out = await slash.read('what rent is open', OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  const [row] = rows();
  assert.equal(row?.tier, 'byo');
  /* 700 in and 60 out at 13,636 and 45,455 a million is 12.3, which is 12. RED: 0. */
  assert.equal(row?.neurons, 12, `a byo call on the host's own neurons was priced ${row?.neurons}`);
  sql.close();
});

test("(2) A HOST THAT NAMES NOTHING KEEPS 46 §4.1: tier byo is priced at 0, because there it is not the host's money", async () => {
  const { sql, slash, rows } = build(answering('{"registers":["obligations"],"where":null,"q":"rent"}'));
  assert.ok(slash.configure({ tier: 'byo', model: 'glm-5.3-flash' }, OWNER).ok);
  assert.ok((await slash.read('what rent is open', OWNER)).ok);
  assert.equal(rows()[0]?.neurons, 0);
  sql.close();
});

test('(3) ONE REACHED THROW, ONE SETTLEMENT: a read and an answer both keep the model, price the estimate by one rule and count the ask', async () => {
  const model = throwing(reachedError);
  const { sql, slash, rows } = build(model);
  const read = await slash.read('what rent is open', OWNER);
  /* THE READ STILL ANSWERS: a predicate that did not come back costs the ask its filter, not its rows (`46 §10`). */
  assert.ok(read.ok, JSON.stringify(read));
  const answered = await slash.answer(RATE);
  assert.equal(codeOf(answered), 'UNREACHABLE', 'a reached throw is still one the ladder may ask again');
  assert.equal(model.calls(), 2);

  /* BOTH ROWS ARE `kind = 'read'` (`answer.ts` says why), so they are told apart by the question each carries. */
  const all = rows();
  assert.equal(all.length, 2);
  for (const row of all) {
    const path = row.question?.startsWith('rule.') === true ? 'answer' : 'read';
    assert.equal(row.model, 'glm-5.3-flash', `the ${path} row was settled under ${row.model}`);
    assert.equal(row.code, 'UNREACHABLE');
    assert.ok(row.tokens_in > 0, 'the prompt estimate is the only count a throw leaves');
    assert.equal(row.tokens_out, 0);
    assert.equal(row.neurons, priced(row), `the ${path} row was priced ${row.neurons} where the rule gives ${priced(row)}`);
  }
  /* BOTH ARE ASKS. RED: 1, the read alone. */
  assert.equal((slash.status() as { asks: { used: number } }).asks.used, 2);
  sql.close();
});

test("(4) THE LADDER'S RUNGS ARE SPENT FROM ask_cap: at a cap of two, the third reached throw is refused before the model", async () => {
  const model = throwing(reachedError);
  const { sql, slash } = build(model);
  assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push(codeOf(await slash.answer(RATE)));
  assert.deepEqual(codes, ['UNREACHABLE', 'UNREACHABLE', 'SLASH_BUDGET_SPENT']);
  assert.equal(model.calls(), 2, 'a rung past the cap reached the model');
  sql.close();
});
