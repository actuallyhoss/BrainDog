/**
 * A pack update that opens a closed list to text, planned over a figure whose words only the closed list could read.
 *
 * THE BACKLOG SAID THE KERNEL REFUSES THIS AT INSTALL AND ONLY THE PLAN WAS SILENT. Measured, the pack path refuses
 * nothing either. `stranded` (`837b01c7`) parses each reader's sentence against the list as it stands and again with
 * only the opened fields changed, and refuses a word that moves (`loop/research-batch-thirty-four-audit.md` §1), but
 * only `install` and a filed change ask it: `installPack` stages through `stageInstall`, which runs `unreadable` and
 * `lintBatch` and stops there. `mini` 1.0.0 to 1.1.0 through the record's own `planPack` and `installPack`, three
 * projects one per lane: the plan named no retype and no conflict, the install answered ok, and `lane is earning money`
 * read 1 before and 0 after. So the plan names it and `declare`'s `install` refuses it, in the kernel's own sentence.
 *
 * `declare` CANNOT PARSE A SENTENCE: it depends on the kernel and the ports and nothing else, and the kernel does not
 * export its compiler. So the plan asks through `Installed.sentence`, as it asks `nameOf` for a row's title, and these
 * tests hand it `where`'s own `parseWhere`, which is what the kernel's `predicateOf` reads a sentence with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
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

const counting = (metric: string, where: string) => ({
  metric,
  name: metric,
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

/** `where`'s parser as the kernel reads a sentence: a title no row holds yet is the same either way, so it still reads. */
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
  for (const [name, lane] of [['Kiln', 'earning_money'], ['Loom', 'building'], ['Shed', 'parked']])
    said(api.kernel.create('projects', { name, lane }, { actor: 'p_1' }));
  return { sql, api };
}

/** The record's declaration state, as `planPack` builds it, with the parser beside it. */
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

test('THE PLAN NAMES THE FIGURE whose words only the closed list could read, before the install is asked', async () => {
  const { sql, api } = await record(counting('by-words', 'lane is earning money'), counting('by-value', 'lane is earning_money'));
  const next = await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', 'lane is earning money'), counting('by-value', 'lane is earning_money')));
  const diff = await plan(next, stateOf(api));
  assert.deepEqual(diff.misreads, [
    { id: 'register.projects', field: 'lane', reader: 'metric.by-words', name: 'by-words', at: 'where', where: 'lane is earning money', written: 'earning money', stored: 'earning_money' },
  ]);
  sql.close();
});

test('AND THE OWNER\'S OWN READERS: a page by the label and a rule by the case, neither of them the pack\'s', async () => {
  const { sql, api } = await record();
  const k = api.kernel;
  said(
    await k.install([
      {
        id: 'page.earning',
        kind: 'page',
        body: { page: 'earning', title: 'Earning', blocks: [{ kind: 'table', source: 'register.projects', where: 'lane is Earning', columns: [{ field: 'name' }], empty: 'None.' }] } as never,
      },
      { id: 'rule.building', kind: 'rule', body: { rule: 'building', register: 'projects', when: 'lane is Building', then: [{ tag: 'busy' }] } as never },
    ]),
  );
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT)), stateOf(api));
  assert.deepEqual(
    diff.misreads.map((m) => [m.reader, m.at, m.written, m.stored]),
    [
      ['page.earning', 'blocks[0].where', 'Earning', 'earning_money'],
      ['rule.building', 'when', 'Building', 'building'],
    ],
  );
  sql.close();
});

test('A READER THAT WROTE THE STORED VALUE, or a list that stays closed, plans clean', async () => {
  const { sql, api } = await record(counting('by-value', 'lane is earning_money'));
  const opened = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-value', 'lane is earning_money'))), stateOf(api));
  assert.deepEqual(opened.misreads, []);
  const closed = await plan(await packOf(DOC('1.0.1', LANE, counting('by-words', 'lane is earning money'))), stateOf(api));
  assert.deepEqual(closed.misreads, []);
  sql.close();
});

test('A READER THE UPDATE REWRITES is the update\'s, and is not asked about its old words', async () => {
  const { sql, api } = await record(counting('by-words', 'lane is earning money'));
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', 'lane is earning_money'))), stateOf(api));
  assert.deepEqual(diff.misreads, []);
  sql.close();
});

test('WITHOUT A PARSER the plan cannot ask, and says nothing rather than guessing', async () => {
  const { sql, api } = await record(counting('by-words', 'lane is earning money'));
  const { sentence: _unused, ...bare } = stateOf(api);
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', 'lane is earning money'))), bare);
  assert.deepEqual(diff.misreads, []);
  sql.close();
});

test('INSTALL REFUSES WHAT THE PLAN NAMED, with the reader, the word and the stored value, before anything is staged', async () => {
  const { sql, api } = await record(counting('by-words', 'lane is earning money'));
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', 'lane is earning money'))), stateOf(api));
  let staged = false;
  const host: Host = {
    count: () => 0,
    stage: async () => {
      staged = true;
      return { ok: true, value: () => ({ ok: true, value: null }) };
    },
    transaction: (fn: () => unknown) => fn(),
  } as unknown as Host;
  const out = (await install(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', 'lane is earning money'))), diff, host, diff.planHash, diff.approve)) as Out;
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'FIELD_TYPE_CHANGED');
  assert.equal(out.refusal?.at, 'metric.by-words');
  assert.match(out.refusal!.fix, /"lane is earning money" says earning money/);
  assert.match(out.refusal!.fix, /Write earning_money there first, then open lane\./);
  assert.equal(staged, false, 'the batch was staged before the refusal');
  sql.close();
});

/*
 * A SENTENCE THAT ALSO READS `tags` WAS PASSED OVER. The kernel gives every list a `tags` field it never declared
 * (`withTags`), so `tags has late, lane is earning money` reads there, and `install` refused this update over it. The
 * plan built its schema from the declared fields alone, the parser said `FIELD_UNKNOWN`, the sentence was skipped as
 * unreadable, and the plan named no misread for a figure the kernel refuses: measured, `misreads` was `[]`.
 */
test('A SENTENCE THAT ALSO READS TAGS is asked, as the kernel reads it with the tags every list has', async () => {
  const w = 'tags has late, lane is earning money';
  const { sql, api } = await record(counting('by-words', w));
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT, counting('by-words', w))), stateOf(api));
  assert.deepEqual(
    diff.misreads.map((m) => [m.reader, m.written, m.stored]),
    [['metric.by-words', 'earning money', 'earning_money']],
  );
  sql.close();
});

test('A READER THE UPDATE RETIRES reads nothing afterwards, and is not asked', async () => {
  const { sql, api } = await record(counting('by-words', 'lane is earning money'));
  const diff = await plan(await packOf(DOC('1.1.0', LANE_TEXT)), stateOf(api));
  assert.deepEqual(diff.retires.map((r) => r.id), ['metric.by-words']);
  assert.deepEqual(diff.misreads, []);
  sql.close();
});
