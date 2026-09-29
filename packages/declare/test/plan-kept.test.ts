/**
 * `plan` over a record whose owner changed a declaration a pack wrote first, asked of `plan` itself rather than through a
 * record (`packages/record/test/pack-update-kept.test.ts` drives the same rule end to end, from `setDeclaration`).
 *
 * A KEPT DECLARATION WAS CHECKED AGAINST WHAT THE UPDATE RETIRES AND NEVER AGAINST WHAT IT CHANGES. A review of
 * `9b0d8184` measured it: an owner edits `metric.spent-30d`, a later money-core drops the `transfer` field from
 * `register.transactions`, the plan says no conflicts and installs, and from then on the figure refuses every read with
 * `FIELD_UNKNOWN`, because its `where` still says `transfer is false`. The pack's own figures were rewritten by the same
 * update and are fine; the owner's is the one the update does not touch, so it is the one left reading a field that is
 * gone.
 *
 * SO A KEPT DECLARATION IS ASKED WHICH FIELDS IT READS on each list the update changes, and a field taken off or given
 * another type is a conflict in `conflictFault`'s sentence. A change that touches no field it reads is not, or every
 * update to a list would refuse every owner who ever renamed a figure over it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conflictFault, install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';

type Doc = { pack: string; version: string; summary: string; author: string; license: string; requires: { format: number; primitives: number; packs: Record<string, string> }; declarations: Record<string, unknown>[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const FIELDS = () => [
  { id: 'what', type: 'text', required: true },
  { id: 'amount', type: 'decimal' },
  { id: 'direction', label: 'Which way', type: 'enum', values: ['in', 'out'] },
  { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false },
  { id: 'note', type: 'text' },
  { id: 'day', type: 'day' },
];

const SPENT = { metric: 'spent-30d', name: 'Spent, 30 days', source: 'register.transactions', where: 'transfer is false, direction is out, day after -30d', value: { sum: 'amount' }, format: 'decimal', target: { lte: 1500 }, window: '30d', compare: 'previous' };
const CASH = { metric: 'cash-now', name: 'Cash now', source: 'register.transactions', value: { sum: 'amount' }, format: 'decimal', target: { gte: 0 }, window: '30d', compare: 'none' };
const PAGE = { page: 'money', title: 'Money', blocks: [{ kind: 'stat', heading: 'Now', cells: [{ metric: 'cash-now', label: 'Cash' }] }, { kind: 'table', heading: 'Moved', source: 'register.transactions', columns: [{ field: 'what' }, { field: 'amount' }] }] };
const RULE = { rule: 'flag-big', register: 'transactions', when: 'direction is out', once_per: ['entry'], then: [{ tag: 'big' }] };

/** money-mini at `version`: one list, two figures, a page and a rule, with `fields` as the list's fields. */
const DOC = (version: string, fields = FIELDS(), extra: Record<string, unknown>[] = [], drop: string[] = []): Doc => ({
  pack: 'money-mini',
  version,
  summary: 'What went out.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: ([{ register: 'transactions', name: 'Transactions', title: 'what', fields }, SPENT, CASH, PAGE, RULE, ...extra] as Record<string, unknown>[]).filter(
    (d) => !drop.includes(String(d.metric ?? d.page ?? d.rule ?? d.register)),
  ),
});

const packOf = async (doc: Doc): Promise<Pack> => value<Pack>(await normalise(doc));

/**
 * A record with 1.0.0 installed and `edits` applied as `setDeclaration` leaves them: the live row is the owner's with
 * `pack_id` null, and `detached` names the pack and the body the edit started from, which is what the kernel's
 * `detached()` answers.
 */
async function recordWith(edits: Record<string, (body: Record<string, unknown>) => Record<string, unknown>>): Promise<Installed> {
  const first = await packOf(DOC('1.0.0'));
  const detached: Record<string, { was: string; body: string }> = {};
  const declarations = first.declarations.map((d) => {
    const edit = edits[d.id];
    if (!edit) return { id: d.id, version: 1, kind: d.kind, pack_id: 'money-mini' as string | null, body: d.canonical, checksum: `c-${d.id}` };
    detached[d.id] = { was: 'money-mini', body: d.canonical };
    return { id: d.id, version: 2, kind: d.kind, pack_id: null, body: JSON.stringify(edit(JSON.parse(d.canonical) as Record<string, unknown>)), checksum: `e-${d.id}` };
  });
  return { format: 1, primitives: 1, record_version: 9, packs: [{ id: 'money-mini', version: '1.0.0' }], declarations, rows: { transactions: 40 }, detached };
}

const renamed = (b: Record<string, unknown>) => ({ ...b, name: 'Spent, last month' });
const without = (id: string) => FIELDS().filter((f) => f.id !== id);
const retyped = (id: string, type: string) => FIELDS().map((f) => (f.id === id ? { id, type } : f));

const host = (log: string[]): Host => ({
  count: () => 0,
  stage: async (batch) => (log.push(`stage:${batch.length}`), { ok: true, value: () => ({ ok: true, value: null }) }),
  transaction: (fn) => fn(),
  reload: () => log.push('reload'),
  retire: () => ({ ok: true, value: null }),
  seed: () => ({ ok: true, value: { id: 'x' } }),
  remember: (row) => log.push(`pack:${row.id}@${row.version}`),
  forget: () => undefined,
  claimed: () => [],
});

/** The plan refuses, in the sentence that keeps the edit, and `install` writes nothing. */
async function refusedWith(next: Pack, diff: Diff): Promise<string> {
  const said = conflictFault(diff);
  assert.ok(said, `no conflict the owner is told about: ${JSON.stringify(diff.conflicts)}`);
  assert.equal(said.code, 'PROVIDES_CONFLICT');
  const log: string[] = [];
  const put = await install(next, diff, host(log), diff.planHash);
  assert.equal(put.ok, false);
  assert.deepEqual(log, [], 'a refused update staged something');
  return said.fix;
}

/* ── the reviewed case, and its neighbours ──────────────────────────────── */

test('a kept figure whose where reads a field the update takes off its list is refused, in the sentence that keeps the edit', async () => {
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  const next = await packOf(DOC('1.1.0', without('transfer')));
  const diff = await plan(next, installed);

  assert.deepEqual(diff.conflicts, [{ id: 'metric.spent-30d', pack: '(this record)', reads: 'register.transactions', field: 'transfer' }]);
  assert.deepEqual(diff.kept, [{ id: 'metric.spent-30d' }]);
  const fix = await refusedWith(next, diff);
  assert.equal(
    fix,
    'money-mini 1.1.0 takes transfer off register.transactions, and metric.spent-30d, which you changed, reads it. Take transfer off metric.spent-30d first, or leave money-mini at 1.0.0.',
  );
});

test('a field given another type is refused the same way, read from the figure’s value and not only its where', async () => {
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  const next = await packOf(DOC('1.1.0', retyped('amount', 'text')));
  const diff = await plan(next, installed);
  /* THE TYPES TRAVEL IN THE CONFLICT, and this said `retyped: true`. `conflictFault` is handed the conflicts and nothing
     else, and the sentence below names both types, so a bare flag left it nothing to say them from. */
  assert.deepEqual(diff.conflicts, [{ id: 'metric.spent-30d', pack: '(this record)', reads: 'register.transactions', field: 'amount', retyped: { from: 'decimal', to: 'text' } }]);
  const fix = await refusedWith(next, diff);
  assert.match(fix, /^money-mini 1\.1\.0 makes amount on register\.transactions a text, and metric\.spent-30d, which you changed, reads it as a decimal\./u);
});

test('a where written in the list’s own labels is read by the label, as the record reads it', async () => {
  const installed = await recordWith({ 'metric.spent-30d': (b) => ({ ...b, where: 'between your own accounts is false, which way is out' }) });
  const diff = await plan(await packOf(DOC('1.1.0', without('transfer'))), installed);
  assert.deepEqual(diff.conflicts.map((c) => [c.id, c.field]), [['metric.spent-30d', 'transfer']]);
});

test('a kept page whose table shows a field the update takes off is refused, and so is a kept rule whose when reads one', async () => {
  const installed = await recordWith({ 'page.money': (b) => ({ ...b, title: 'My money' }), 'rule.flag-big': (b) => ({ ...b, priority: 5 }) });
  const next = await packOf(DOC('1.1.0', FIELDS().filter((f) => f.id !== 'amount' && f.id !== 'direction'), [], []));
  const diff = await plan(next, installed);
  assert.deepEqual(
    diff.conflicts.map((c) => [c.id, c.field]).sort(),
    [
      ['page.money', 'amount'],
      ['rule.flag-big', 'direction'],
    ],
  );
});

/* THE OTHER HALF, WHICH IS WHY THE RULE IS ABOUT FIELDS AND NOT ABOUT LISTS. Refusing whenever a list a kept figure reads
   changes would refuse almost every update of a pack to anybody who had renamed one of its figures. */
test('a kept figure over a list the update changes in fields it does not read is kept, and the update goes ahead', async () => {
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  const fields = [...without('note'), { id: 'category', type: 'text' }];
  const next = await packOf(DOC('1.1.0', fields));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.changes.map((c) => c.id), ['register.transactions']);
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.kept, [{ id: 'metric.spent-30d' }]);
  assert.equal(conflictFault(diff), null);
  const log: string[] = [];
  value(await install(next, diff, host(log), diff.planHash));
  assert.deepEqual(log.slice(0, 1), [`stage:${next.declarations.length - 1}`], 'the kept figure was staged over the owner’s');
});

/* A FIELD OF A LIST THE FIGURE DOES NOT READ IS NOT ITS FIELD. `note` on another list is not `note` on this one. */
test('a field of the same name taken off another list does not refuse a figure over this one', async () => {
  const other = { register: 'notes', name: 'Notes', title: 'note', fields: [{ id: 'note', type: 'text' }, { id: 'transfer', type: 'bool' }] };
  const first = await packOf(DOC('1.0.0', FIELDS(), [other]));
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  installed.declarations.push(...first.declarations.filter((d) => d.id === 'register.notes').map((d) => ({ id: d.id, version: 1, kind: d.kind, pack_id: 'money-mini', body: d.canonical, checksum: 'n' })));
  const next = await packOf(DOC('1.1.0', FIELDS(), [{ ...other, fields: [{ id: 'note', type: 'text' }] }]));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.changes.map((c) => c.id), ['register.notes']);
  assert.deepEqual(diff.conflicts, []);
});

/* ── the two cases `9b0d8184` proved through a record, asked of the plan ── */

test('a kept page reading a figure the update retires is refused, naming the figure', async () => {
  const installed = await recordWith({ 'page.money': (b) => ({ ...b, title: 'My money' }) });
  const next = await packOf(DOC('1.1.0', FIELDS(), [], ['cash-now']));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.retires.map((r) => r.id), ['metric.cash-now']);
  assert.deepEqual(diff.conflicts, [{ id: 'page.money', pack: '(this record)', reads: 'metric.cash-now' }]);
  assert.equal(
    await refusedWith(next, diff),
    'money-mini 1.1.0 no longer has metric.cash-now, and page.money, which you changed, reads it. Take metric.cash-now off page.money first, or leave money-mini at 1.0.0.',
  );
});

test('a kept list the update changes is refused, and one it leaves alone is kept', async () => {
  const installed = await recordWith({ 'register.transactions': (b) => ({ ...b, name: 'My transactions' }) });
  const changed = await packOf(DOC('1.1.0', [...FIELDS(), { id: 'spread', type: 'decimal' }]));
  const diff = await plan(changed, installed);
  assert.deepEqual(diff.conflicts, [{ id: 'register.transactions', pack: '(this record)', changed: true }]);
  assert.match(await refusedWith(changed, diff), /^money-mini 1\.1\.0 changes register\.transactions, which you changed/u);

  const same = await plan(await packOf(DOC('1.1.0')), installed);
  assert.deepEqual(same.conflicts, []);
  assert.deepEqual(same.kept, [{ id: 'register.transactions' }]);
});
