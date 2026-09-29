/**
 * A pack update that opens a closed list to text, through the record's own `planPack`, `installPack` and the kernel's
 * `stageInstall`, with nothing handed in by the test.
 *
 * `declare`'s `plan-widen.test.ts` hands `plan` a parser of its own, and measured there the plan names the figure whose
 * words only the closed list could read. The record handed it none, so `diff.misreads` was `[]` on every real plan and
 * `declare`'s install refusal never fired outside those tests. And the kernel's `stageInstall`, which every pack
 * install stages through, ran `unreadable` and `lintBatch` and not `stranded`, so a batch that reached it past the plan
 * widened the list with the figure's answer moving from 1 to 0.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 22, 12);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const NAME = { id: 'name', type: 'text', required: true };
const LANE = { id: 'lane', type: 'enum', values: ['building', 'earning_money', 'parked'], labels: { earning_money: 'Earning' } };
const LANE_TEXT = { id: 'lane', type: 'text' };
const WORDS = {
  metric: 'by-words',
  name: 'by-words',
  source: 'register.projects',
  value: { count: 'id' },
  where: 'lane is earning money',
  format: 'int',
  target: { gte: 0 },
  window: '30d',
};
const DOC = (version: string, lane: Record<string, unknown>) => ({
  pack: 'mini',
  version,
  summary: 'Projects.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'projects', name: 'Projects', title: 'name', fields: [NAME, lane] }, WORDS],
});

type Planned = { diff: { planHash: string; approve: string[]; misreads: { reader: string; written: string; stored: string }[] } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const doc = DOC('1.0.0', LANE);
  const planned = said<Planned>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  for (const [name, lane] of [['Kiln', 'earning_money'], ['Loom', 'building'], ['Shed', 'parked']])
    said(api.kernel.create('projects', { name, lane }, { actor: 'p_1' }));
  return { sql, api };
}

test('THE RECORD\'S OWN PLAN NAMES THE FIGURE the widening would change, and its install is refused over it', async () => {
  const { sql, api } = await record();
  const doc = DOC('1.1.0', LANE_TEXT);
  const planned = said<Planned>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  assert.deepEqual(
    planned.diff.misreads.map((m) => [m.reader, m.written, m.stored]),
    [['metric.by-words', 'earning money', 'earning_money']],
  );
  const out = (await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner)) as Out;
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'FIELD_TYPE_CHANGED');
  assert.equal(out.refusal?.at, 'metric.by-words');
  sql.close();
});

test('AND THE KERNEL\'S PACK PATH REFUSES IT TOO, for a batch that reaches stageInstall past the plan', async () => {
  const { sql, api } = await record();
  const live = (id: string) => api.kernel.declarations().find((d) => d.id === id)!;
  const list = live('register.projects');
  const figure = live('metric.by-words');
  const body = JSON.parse(list.body) as { fields: { id: string }[] };
  /* THE FIGURE IS SENT AGAIN WITH THE SAME BYTES, as a pack update sends every declaration it holds. */
  const batch = [
    { id: list.id, kind: 'register' as const, pack: 'mini', body: { ...body, fields: body.fields.map((f) => (f.id === 'lane' ? LANE_TEXT : f)) } },
    { id: figure.id, kind: 'metric' as const, pack: 'mini', body: JSON.parse(figure.body) as unknown },
  ];
  const staged = (await api.kernel.stageInstall(batch as never)) as Out;
  assert.equal(staged.ok, false, 'the widening staged');
  assert.equal(staged.refusal?.code, 'FIELD_TYPE_CHANGED');
  assert.equal(staged.refusal?.at, 'metric.by-words');
  sql.close();
});
