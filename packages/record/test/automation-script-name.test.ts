/**
 * What an automation that only starts a script is called (audit B of 25 October, Y11).
 *
 * MEASURED BEFORE THIS: a rule with no name of its own was listed by its id, so Automations said "Close follow ups" of
 * the one script Scripts calls "Close the follow-ups of a finished task": one thing, two names, on two screens. A rule
 * whose one step starts a script is that script to the person reading, so it takes the script's title, and says which
 * script it starts. A rule that names itself keeps its name, since several may start one script (Money's four rules
 * that file a thing in its account's book share one), and four rows of one name would say less.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 25, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const KILNS = {
  id: 'register.kilns',
  kind: 'register' as const,
  body: { id: 'kilns', name: 'Kilns', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'heat', type: 'text' }] } as never,
};
const SCRIPT = {
  id: 'script.cool_the_kiln',
  kind: 'script' as const,
  body: {
    script: 'cool_the_kiln',
    title: 'Cool a kiln once its firing is done',
    runs: { rule: true },
    egress: [],
    keys: [],
    reads: ['kilns'],
    writes: ['kilns'],
    source: 'export default async function run() {}',
  } as never,
};
const rule = (id: string, extra: Record<string, unknown>) => ({
  id: `rule.${id}`,
  kind: 'rule' as const,
  body: { rule: id, on: { written: { register: 'kilns', op: ['update'], fields: ['heat'] } }, steps: [{ script: { id: 'cool_the_kiln', as: 'cooling' } }], ...extra } as never,
});

type Row = { rule: string; name: string; script: { id: string; title: string } | null };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, JSON.stringify(r));
  return x.value;
};

test('A RULE WITH NO NAME THAT ONLY STARTS A SCRIPT IS CALLED BY THE SCRIPT, and one that names itself keeps its name', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([KILNS, SCRIPT, rule('cool_kiln', {}), rule('cool_big_kiln', { name: 'Cool the big kiln' })]));
  const rows = new Map(value<Row[]>(await api.automations(undefined, owner)).map((r) => [r.rule, r]));

  const bare = rows.get('cool_kiln')!;
  assert.equal(bare.name, 'Cool a kiln once its firing is done', 'listed by its id where the script has a title');
  assert.deepEqual(bare.script, { id: 'cool_the_kiln', title: 'Cool a kiln once its firing is done' });
  const named = rows.get('cool_big_kiln')!;
  assert.equal(named.name, 'Cool the big kiln');
  assert.deepEqual(named.script, { id: 'cool_the_kiln', title: 'Cool a kiln once its firing is done' }, 'says which script it starts');
  /* THE ONE READ BY NAME SAYS THE SAME. */
  assert.equal(value<Row>(await api.automations({ rule: 'cool_kiln' }, owner)).name, 'Cool a kiln once its firing is done');
  sql.close();
});

test('A RULE THAT DOES MORE THAN START ONE SCRIPT IS NOT CALLED BY IT', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const more = rule('cool_and_log', {});
  (more.body as unknown as { steps: unknown[] }).steps.push({ script: { id: 'cool_the_kiln', as: 'again' } });
  value(await api.kernel.install([KILNS, SCRIPT, more]));
  const row = value<Row[]>(await api.automations(undefined, owner)).find((r) => r.rule === 'cool_and_log')!;
  assert.equal(row.name, 'cool_and_log');
  assert.equal(row.script, null);
  sql.close();
});
