/**
 * "What's late" in Slash (`today` in `src/slash-tools.ts`): every late row the person may read, the worst first, with how
 * many there are in all, over the real record on the seed.
 *
 * MEASURED 24 NOVEMBER (the Slash audit, finding 6): the tool read the briefing's five cards, which put the least late
 * first, so on the seed Slash named five things two to nine days late and left out Legal review, June (64 days late) and
 * Invoice 2026-041 (38 days late), both on Today's Needs you behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';
import { slashTools } from '../src/slash-tools.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };
const run = { askOnly: false, asked: false, said: "what's late?", outside: null };

async function seeded() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const done = await installSeed(api.kernel);
  assert.ok(done.ok);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'o@example.test', 'Olive')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  return { sql, api, clock };
}

test('WHAT IS LATE IS EVERY LATE ROW, THE WORST FIRST: the 64- and 38-day items lead, with how many are late in all', async () => {
  const { sql, api, clock } = await seeded();
  const late = (await (api as unknown as { lateRows(a: unknown, c: CallContext): Promise<{ ok: boolean; value: { rows: { row: string; title: string; days: number }[]; total: number } }> }).lateRows({ limit: 50 }, owner));
  assert.ok(late.ok);
  const days = late.value.rows.map((r) => r.days);
  assert.deepEqual(days, [...days].sort((a, b) => b - a), 'the worst first');
  assert.ok(late.value.total >= late.value.rows.length);
  const tools = slashTools(api as never, owner, { sql, person: 'p_seed', now: clock.now });
  const said = (await tools.call('today', {}, run)).text;
  const lines = said.split('\n');
  const legal = lines.findIndex((l) => /Legal review, June/u.test(l));
  const invoice = lines.findIndex((l) => /Invoice 2026-041/u.test(l));
  assert.ok(legal > 0 && invoice > legal, said);
  assert.match(lines[legal]!, /64 days late/u);
  assert.match(lines[invoice]!, /38 days late/u);
  assert.match(lines[invoice]!, /4,800/u);
  assert.match(said, new RegExp(`Late, the worst first, ${String(late.value.total)} in all:`, 'u'));
  /* THE LATE CARDS OF THE BRIEFING ARE NOT SAID TWICE: each late row once. */
  assert.equal(lines.filter((l) => /Legal review, June/u.test(l)).length, 1, said);
  sql.close();
});

test('MORE LATE THAN IT NAMES IS SAID AS A COUNT, and a caller held to no list hears nothing late', async () => {
  const { sql, api, clock } = await seeded();
  const all = await (api as unknown as { lateRows(a: unknown, c: CallContext): Promise<{ ok: boolean; value: { rows: unknown[]; total: number } }> }).lateRows({ limit: 2 }, owner);
  assert.ok(all.ok);
  assert.equal(all.value.rows.length, 2);
  assert.ok(all.value.total > 2, 'the seed holds more than two late rows');
  const shut: CallContext = { principal: { kind: 'person', id: 'p_shut', level: 'read' }, registers: ['nothing-here'] } as CallContext;
  const none = await (api as unknown as { lateRows(a: unknown, c: CallContext): Promise<{ ok: boolean; value: { rows: unknown[]; total: number } }> }).lateRows({}, shut);
  assert.ok(!none.ok || none.value.total === 0, JSON.stringify(none));
  void clock;
  sql.close();
});
