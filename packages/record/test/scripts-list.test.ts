/**
 * `scripts`, the READ+ list of installed scripts with their last run, their refused runs in a row and whether that
 * paused them (`loop/BACKLOG.md`: "`braindog scripts list` needs a READ+ record method").
 *
 * MEASURED BEFORE IT: no method in the host's route table read a script. `actions` filters to `pull`, `call` and `poll`,
 * so the only place a paused script's id could be found was the event that paused it, and the terminal refused
 * `scripts list` for want of anything to print. The runs below are made the real way, by the kernel's pass leasing
 * `script.run` and a host's sandbox answering, as `resume-script.test.ts` makes them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFUSED_IN_A_ROW } from '@braindog/kernel';

import { createRecordApi, type CallContext, type ScriptRow } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

const GOLD_EGP = {
  id: 'register.gold_egp',
  kind: 'register' as const,
  body: { id: 'gold_egp', name: 'Gold, EGP', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};
const MONEY = {
  id: 'register.money',
  kind: 'register' as const,
  body: { id: 'money', name: 'Money', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'amount', type: 'int' }] } as never,
};
const GOLD = {
  id: 'script.gold-rate',
  kind: 'script' as const,
  body: { script: 'gold-rate', title: 'Gold rate', runs: { every: '1h' }, egress: ['https://api.goldapi.io'], keys: ['goldapi'], reads: [], writes: ['gold_egp'], source: 'export default async function run(ctx) {}' } as never,
};
/** Reads Money, so its log may quote a salary: shown only to a caller who reads Money. */
const TALLY = {
  id: 'script.tally',
  kind: 'script' as const,
  body: { script: 'tally', runs: { door: 'bank-in' }, egress: [], keys: [], reads: ['money'], writes: ['gold_egp'], source: 'export default async function run(ctx) {}' } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** The owner's agent key: READ+ is any token's. */
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' } };
/** A member at `write` held to `append` on Money, refused `list money`. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, levels: { money: 'append' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const listed = async (api: { scripts: (a: undefined, c: CallContext) => Promise<unknown> }, ctx: CallContext): Promise<ScriptRow[]> => {
  const out = (await api.scripts(undefined, ctx)) as Out;
  assert.ok(out.ok, out.refusal?.fix);
  return out.value as ScriptRow[];
};

const refused = async () => ({ refused: { code: null, why: 'TypeError: price_gram_24k is undefined' }, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } });
const wrote = async () => ({ writes: [{ op: 'create' as const, register: 'gold_egp', fields: { at: 'noon' } }], log: '', usage: { fetches: 1, bytes: 10, wall_ms: 1, cpu_ms: 1 } });

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const installed = await api.kernel.install([GOLD_EGP, MONEY, GOLD, TALLY]);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* One turn of the pass under a sandbox that answers `answer`, two hours on, so the gold clock is due. */
  const turn = async (answer: typeof refused | typeof wrote) => {
    clock.advance(2 * HOUR);
    await api.kernel.runActions(async () => assert.fail('a script sends no action request'), { script: answer as never });
  };
  return { sql, api, turn };
}

test('scripts LISTS EVERY INSTALLED SCRIPT, with what it may touch and how its runs went, and counts refusals to the pause', async () => {
  const { sql, api, turn } = await record();
  const gold = async () => (await listed(api, owner)).find((s) => s.script === 'gold-rate')!;

  const first = await listed(api, owner);
  assert.deepEqual(first.map((s) => s.id), ['script.gold-rate', 'script.tally']);
  const g = first[0]!;
  assert.deepEqual(
    [g.title, g.version, g.runs, g.reads, g.writes, g.egress, g.keys, g.status, g.last, g.refused, g.month],
    ['Gold rate', 1, { every: '1h', door: null, rule: false }, [], ['gold_egp'], ['https://api.goldapi.io'], ['goldapi'], 'on', null, { in_a_row: 0, pauses_at: REFUSED_IN_A_ROW }, { runs: 0, ok: 0, refused: 0 }],
  );
  assert.equal(typeof g.next, 'string', 'an armed clock says when it runs next');
  assert.deepEqual(first[1]!.runs, { every: null, door: 'bank-in', rule: false });

  await turn(wrote);
  let now = await gold();
  assert.deepEqual([now.last?.outcome, now.last?.version, now.refused.in_a_row, now.month], ['ok', 1, 0, { runs: 1, ok: 1, refused: 0 }]);
  assert.match(now.last!.say, /gold-rate ran and wrote one row/);

  await turn(refused);
  await turn(refused);
  now = await gold();
  assert.deepEqual([now.status, now.last?.outcome, now.refused.in_a_row], ['on', 'refused', 2]);
  /* THE SAY IS THE RECORD'S SENTENCE AND NOT THE LOG: the why quotes what the script chose, and stays on the event. */
  assert.equal(now.last!.say.includes('price_gram_24k'), false, now.last!.say);

  await turn(refused);
  now = await gold();
  assert.deepEqual([now.status, now.refused.in_a_row, now.next, now.month], ['paused', REFUSED_IN_A_ROW, null, { runs: 4, ok: 1, refused: 3 }]);

  const resumed = (await api.resumeScript({ script: 'gold-rate' }, owner)) as Out;
  assert.ok(resumed.ok, resumed.refusal?.fix);
  now = await gold();
  assert.deepEqual([now.status, now.refused.in_a_row], ['on', 0], 'a resume ends the streak, as it does for the pause');
  sql.close();
});

test('scripts IS HELD TO THE LISTS THE CALLER READS, answers a token, and takes no argument', async () => {
  const { sql, api } = await record();
  assert.deepEqual((await listed(api, token)).map((s) => s.script), ['gold-rate', 'tally']);
  /* She may not read Money, so which script reads it is not hers to know; the one on Gold is. */
  assert.deepEqual((await listed(api, member)).map((s) => s.script), ['gold-rate']);

  const stray = (await api.scripts({ script: 'tally' } as never, owner)) as Out;
  assert.deepEqual([stray.ok, stray.refusal?.code, stray.refusal?.at], [false, 'FIELD_UNKNOWN', 'script']);
  sql.close();
});
