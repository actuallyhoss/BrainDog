/**
 * The plan names the same readers of a widening the kernel's `stranded` refuses, including the two it once passed over.
 *
 * `loop/research-batch-thirty-six-audit.md` §1 found three readers the refusal never asked: a figure resent with only its
 * `name` changed, a run-path rule whose steps are written as `then:`, and an automation started by arrivals at a door
 * writing the list. `misreadsOf` asks with `sentencesOver` as the kernel does, so the `then:` walk reaches both, and it
 * made the other two choices the kernel made: a reader the update sends with other bytes was "the update's own" and
 * skipped, and a rule's list was `register` or `on.written` alone. Left so, a pack update the kernel now refuses at
 * staging planned clean, and the owner met the refusal after pressing install rather than reading it in the plan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, plan, type Diff, type Installed, type Pack } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { parseWhere } from '../../where/src/index.ts';

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

const counting = (name: string, where: string) => ({
  metric: 'earning',
  name,
  source: 'register.projects',
  value: { count: 'id' },
  where,
  format: 'int',
  target: { gte: 0 },
  window: '30d',
});

const DOC = (version: string, lane: Record<string, unknown>, ...readers: Record<string, unknown>[]) => ({
  pack: 'mini',
  version,
  summary: 'Projects.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'projects', name: 'Projects', title: 'name', fields: [NAME, lane] }, ...readers],
});

const sentence: NonNullable<Installed['sentence']> = (where, schema) => {
  const read = parseWhere(where, schema, { nowMs: NOW });
  return read.bad.every((b) => b.code === 'REF_UNKNOWN') ? (read.predicate ?? null) : null;
};

async function record(...readers: Record<string, unknown>[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const doc = DOC('1.0.0', LANE, ...readers);
  const planned = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  return { sql, api };
}

const stateOf = (api: Awaited<ReturnType<typeof createRecordApi>>): Installed => ({
  format: 1,
  primitives: 1,
  record_version: api.kernel.version(),
  packs: api.kernel.packs(),
  declarations: api.kernel.declarations() as Installed['declarations'],
  rows: api.kernel.census(),
  sentence,
});

const packOf = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

test('A FIGURE THE UPDATE RENAMES AND LEAVES ITS WORDS ALONE is named, as the kernel refuses it', async () => {
  const { sql, api } = await record(counting('Earning', 'lane is earning money'));
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('Earning projects', 'lane is earning money'))), stateOf(api));
  assert.deepEqual(
    diff.misreads.map((m) => [m.reader, m.name, m.written, m.stored]),
    [['metric.earning', 'Earning projects', 'earning money', 'earning_money']],
  );
  /* AND ONE WHOSE WORDS THE UPDATE REWROTE TO THE STORED VALUE still plans clean. */
  const fixed = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('Earning projects', 'lane is earning_money'))), stateOf(api));
  assert.deepEqual(fixed.misreads, []);
  sql.close();
});

test("AN OWNER'S AUTOMATION ON ARRIVALS AT A DOOR WRITING THE LIST is named, though it names only the door", async () => {
  const { sql, api } = await record();
  said(
    await api.kernel.install([
      {
        id: 'ingest.intake',
        kind: 'ingest',
        body: {
          ingest: 'intake',
          channel: 'webhook',
          match: { all: [{ field: 'body', contains: 'project' }] },
          extract: { name: { text: { after: 'project ' } }, lane: { enum: { map: { parked: 'parked' }, after: 'lane ' } } },
          writes: { register: 'projects', confidence: 'exact' },
          on_conflict: 'skip',
        } as never,
      },
      {
        id: 'rule.on-intake',
        kind: 'rule',
        body: { rule: 'on-intake', on: { arrival: { ingest: 'intake' } }, steps: [{ if: 'lane is Parked', then: [{ note: 'parked' }] }] } as never,
      },
    ]),
  );
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT)), stateOf(api));
  assert.deepEqual(
    diff.misreads.map((m) => [m.reader, m.at, m.written, m.stored]),
    [['rule.on-intake', 'steps[0].if', 'Parked', 'parked']],
  );
  sql.close();
});
