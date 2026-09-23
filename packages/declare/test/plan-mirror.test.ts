/**
 * The four ways past `03df6e3d`'s check that its checker and `loop/research-batch-twenty-audit.md` finding 2 found: an
 * update that installs clean and then fails on every read of something the owner kept.
 *
 * THE MIRROR FIRST. `03df6e3d` asks an owner's kept figure about the fields the update takes off a list; it never asks
 * the update's own figures about the fields the OWNER took off a kept list. The audit's probe retired `fx.source` in the
 * app, offered a money-core that added `{ count: 'source' }` over `register.fx`, and heard a plan with no conflicts, an
 * accept that answered `ok`, and `FIELD_UNKNOWN: fx has no field called source` on every read after.
 *
 * THEN THREE THINGS A KEPT DECLARATION READS THAT THE FIELD WALK DID NOT SEE: the fields a kept ingest WRITES, which are
 * the keys of its `extract` and not any value in it; a field named in a `where` by a label the update changes, because
 * `parseWhere` matches labels at read time (`packages/where/src/sentence.ts`, the longest-name match); and an enum value
 * a `where` names that the update takes out of the field's values, which `resolve` refuses as `ENUM_VALUE_UNKNOWN`.
 *
 * EACH HAS ITS NEGATIVE BESIDE IT, because a check that refused every relabel or every removed value would refuse
 * updates nobody's declaration is hurt by.
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

const FIELDS = (): Record<string, unknown>[] => [
  { id: 'what', type: 'text', required: true },
  { id: 'amount', type: 'decimal' },
  { id: 'direction', label: 'Which way', type: 'enum', values: ['in', 'out'] },
  { id: 'transfer', label: 'Between your own accounts', type: 'bool', default: false },
  { id: 'note', label: 'Note', type: 'text' },
  { id: 'day', type: 'day' },
];

const SPENT = { metric: 'spent-30d', name: 'Spent, 30 days', source: 'register.transactions', where: 'transfer is false, direction is out, day after -30d', value: { sum: 'amount' }, format: 'decimal', window: '30d', compare: 'previous' };
const CASH = { metric: 'cash-now', name: 'Cash now', source: 'register.transactions', value: { sum: 'amount' }, format: 'decimal', window: '30d', compare: 'none' };
/* AN INGEST IN THE SHAPE money-core's bank patterns take: the fields it writes are the keys of `extract`, and an enum it
   fills is a `map` whose values are the list's values. */
const INGEST = {
  ingest: 'bank-note',
  channel: 'email',
  match: { field: 'body', contains: 'debited' },
  extract: { what: { after: 'at ' }, note: { after: 'ref ' }, direction: { enum: { map: { debited: 'out' } } } },
  writes: { register: 'transactions', confidence: 'exact' },
};

/** money-mini at `version`: one list, two figures and an ingest, with `fields` as the list's fields. */
const DOC = (version: string, fields = FIELDS(), extra: Record<string, unknown>[] = [], swap: Record<string, Record<string, unknown>> = {}): Doc => ({
  pack: 'money-mini',
  version,
  summary: 'What went out.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'transactions', name: 'Transactions', title: 'what', fields }, SPENT, CASH, INGEST, ...extra].map(
    (d) => swap[String((d as Record<string, unknown>).metric ?? (d as Record<string, unknown>).ingest ?? '')] ?? d,
  ) as Record<string, unknown>[],
});

const packOf = async (doc: Doc): Promise<Pack> => value<Pack>(await normalise(doc));

/** A record with 1.0.0 installed and `edits` applied the way `setDeclaration` leaves them (see `plan-kept.test.ts`). */
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

const renamed = (b: Record<string, unknown>) => ({ ...b, name: 'Mine now' });
const fieldsMapped = (b: Record<string, unknown>, fn: (fields: Record<string, unknown>[]) => Record<string, unknown>[]) => ({ ...b, fields: fn(b.fields as Record<string, unknown>[]) });
const retired = (id: string) => (b: Record<string, unknown>) => fieldsMapped(b, (fs) => fs.filter((f) => f.id !== id));
const with_ = (id: string, change: Record<string, unknown>) => FIELDS().map((f) => (f.id === id ? { ...f, ...change } : f));

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

/** The plan refuses in `conflictFault`'s sentence, and `install` writes nothing. */
async function refusedWith(next: Pack, diff: Diff): Promise<string> {
  const said = conflictFault(diff);
  assert.ok(said, `no conflict the owner is told about: ${JSON.stringify(diff.conflicts)}`);
  assert.equal(said.code, 'PROVIDES_CONFLICT');
  const log: string[] = [];
  assert.equal((await install(next, diff, host(log), diff.planHash)).ok, false);
  assert.deepEqual(log, [], 'a refused update staged something');
  return said.fix;
}

/** The plan has no conflict, and the install stages. */
async function takes(next: Pack, diff: Diff): Promise<void> {
  assert.deepEqual(diff.conflicts, []);
  assert.equal(conflictFault(diff), null);
  const log: string[] = [];
  value(await install(next, diff, host(log), diff.planHash));
  assert.ok(log[0]?.startsWith('stage:'), 'the update staged nothing');
}

/* ── (a) the mirror: the owner took a field off a kept list, and the update reads it ── */

test('an update adding a figure over a field the owner took off a kept list is refused, naming the figure and the field', async () => {
  const installed = await recordWith({ 'register.transactions': retired('note') });
  const noted = { metric: 'noted', name: 'With a note', source: 'register.transactions', value: { count: 'note' }, format: 'int', window: '30d', compare: 'none' };
  const next = await packOf(DOC('1.1.0', FIELDS(), [noted]));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.kept, [{ id: 'register.transactions' }]);
  assert.deepEqual(diff.conflicts, [{ id: 'register.transactions', pack: '(this record)', field: 'note', by: 'metric.noted' }]);
  assert.equal(
    await refusedWith(next, diff),
    'You changed register.transactions, and money-mini 1.1.0’s metric.noted reads note, which your list no longer has. Put note back on register.transactions first, or leave money-mini at 1.0.0.',
  );
});

test('an update changing a figure to read a field the owner retyped on a kept list is refused, naming both types', async () => {
  const installed = await recordWith({ 'register.transactions': (b) => fieldsMapped(b, (fs) => fs.map((f) => (f.id === 'note' ? { id: 'note', label: 'Note', type: 'int' } : f))) });
  const next = await packOf(DOC('1.1.0', FIELDS(), [], { 'cash-now': { ...CASH, where: 'note is set', value: { sum: 'amount' } } }));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.changes.map((c) => c.id), ['metric.cash-now']);
  assert.deepEqual(diff.conflicts, [{ id: 'register.transactions', pack: '(this record)', field: 'note', by: 'metric.cash-now', retyped: { from: 'text', to: 'int' } }]);
  assert.equal(
    await refusedWith(next, diff),
    'You changed register.transactions, and money-mini 1.1.0’s metric.cash-now reads note as a text, which your list now has as an int. Make note a text again on register.transactions first, or leave money-mini at 1.0.0.',
  );
});

test('the owner’s retired field that nothing the update stages reads is kept, and the update goes ahead', async () => {
  const installed = await recordWith({ 'register.transactions': retired('note') });
  const counted = { metric: 'counted', name: 'Moves', source: 'register.transactions', value: { count: 'what' }, format: 'int', window: '30d', compare: 'none' };
  const next = await packOf(DOC('1.1.0', FIELDS(), [counted]));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.kept, [{ id: 'register.transactions' }]);
  await takes(next, diff);
});

/* ── (b) a kept ingest writes the fields its extract names ────────────────── */

test('a kept ingest whose extract writes a field the update takes off its list is refused, and the sentence says writes', async () => {
  const installed = await recordWith({ 'ingest.bank-note': (b) => ({ ...b, channel: 'email', match: { field: 'body', contains: 'charged' } }) });
  const next = await packOf(DOC('1.1.0', FIELDS().filter((f) => f.id !== 'note')));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, [{ id: 'ingest.bank-note', pack: '(this record)', reads: 'register.transactions', field: 'note' }]);
  assert.equal(
    await refusedWith(next, diff),
    'money-mini 1.1.0 takes note off register.transactions, and ingest.bank-note, which you changed, writes it. Take note off ingest.bank-note first, or leave money-mini at 1.0.0.',
  );
});

test('a kept ingest is not refused for a field it does not write', async () => {
  const installed = await recordWith({ 'ingest.bank-note': (b) => ({ ...b, match: { field: 'body', contains: 'charged' } }) });
  const next = await packOf(DOC('1.1.0', FIELDS().filter((f) => f.id !== 'transfer')));
  await takes(next, await plan(next, installed));
});

/* ── (c) a relabelled field under a where written in labels ───────────── */

test('a kept where that names a field by the label the update changes is refused, naming both labels', async () => {
  const installed = await recordWith({ 'metric.spent-30d': (b) => ({ ...b, where: 'between your own accounts is false, direction is out' }) });
  const next = await packOf(DOC('1.1.0', with_('transfer', { label: 'Internal' })));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, [
    { id: 'metric.spent-30d', pack: '(this record)', reads: 'register.transactions', field: 'transfer', relabelled: { from: 'Between your own accounts', to: 'Internal' } },
  ]);
  assert.equal(
    await refusedWith(next, diff),
    'money-mini 1.1.0 renames transfer on register.transactions from "Between your own accounts" to "Internal", and metric.spent-30d, which you changed, calls it "Between your own accounts". Write transfer in metric.spent-30d by its id or its new name first, or leave money-mini at 1.0.0.',
  );
});

test('a relabel under a kept where that names the field by its id is kept, and the update goes ahead', async () => {
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  const next = await packOf(DOC('1.1.0', with_('transfer', { label: 'Internal' })));
  await takes(next, await plan(next, installed));
});

/* ── (d) an enum value a kept where names, taken out of the field's values ── */

test('a kept where that names an enum value the update removes is refused, naming the value', async () => {
  const installed = { ...(await recordWith({ 'metric.spent-30d': renamed })), rows: { transactions: 0 } };
  const next = await packOf(DOC('1.1.0', with_('direction', { values: ['in', 'outgoing'] }), [], { 'bank-note': { ...INGEST, extract: { ...INGEST.extract, direction: { enum: { map: { debited: 'outgoing' } } } } } }));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, [{ id: 'metric.spent-30d', pack: '(this record)', reads: 'register.transactions', field: 'direction', value: 'out' }]);
  assert.equal(
    await refusedWith(next, diff),
    'money-mini 1.1.0 takes out off the values of direction on register.transactions, and metric.spent-30d, which you changed, asks for it. Change what metric.spent-30d asks of direction first, or leave money-mini at 1.0.0.',
  );
});

test('a value named by its label and a value in a kept ingest’s enum map are both asked', async () => {
  const labelled = FIELDS().map((f) => (f.id === 'direction' ? { ...f, labels: { out: 'money out' } } : f));
  const first = await packOf(DOC('1.0.0', labelled));
  const installed = { ...(await recordWith({})), rows: { transactions: 0 } };
  installed.declarations = installed.declarations.map((d) => (d.id === 'register.transactions' ? { ...d, body: first.declarations[0]!.canonical } : d));
  installed.declarations = installed.declarations.map((d) =>
    d.id === 'metric.spent-30d' ? { ...d, pack_id: null, body: JSON.stringify({ ...JSON.parse(d.body), where: 'which way is money out' }) } : d,
  );
  installed.detached = { 'metric.spent-30d': { was: 'money-mini', body: installed.declarations.find((d) => d.id === 'metric.spent-30d')!.body } };
  const next = await packOf(DOC('1.1.0', labelled.map((f) => (f.id === 'direction' ? { ...f, values: ['in'], labels: {} } : f))));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts.map((c) => [c.id, c.field, c.value]), [['metric.spent-30d', 'direction', 'out']]);

  const ingest = { ...(await recordWith({ 'ingest.bank-note': (b) => ({ ...b, match: { field: 'body', contains: 'charged' } }) })), rows: { transactions: 0 } };
  const fewer = await plan(await packOf(DOC('1.1.0', with_('direction', { values: ['in'] }))), ingest);
  assert.deepEqual(fewer.conflicts.map((c) => [c.id, c.field, c.value]), [['ingest.bank-note', 'direction', 'out']]);
  assert.match(conflictFault(fewer)?.fix ?? '', /ingest\.bank-note, which you changed, writes it\. Change what ingest\.bank-note writes to direction first/u);
});

test('a removed value no kept where names is kept, and the update goes ahead', async () => {
  const installed = await recordWith({ 'metric.spent-30d': renamed });
  const next = await packOf(DOC('1.1.0', with_('direction', { values: ['out', 'refund'] })));
  await takes(next, await plan(next, installed));
});

/* ── what the checker of this file found ────────────────────────────────── */

test('the mirror says writes when what the update stages is an ingest', async () => {
  const installed = await recordWith({ 'register.transactions': retired('note') });
  const next = await packOf(DOC('1.1.0', FIELDS(), [], { 'bank-note': { ...INGEST, match: { field: 'body', contains: 'charged' } } }));
  const diff = await plan(next, installed);
  assert.deepEqual(diff.conflicts, [{ id: 'register.transactions', pack: '(this record)', field: 'note', by: 'ingest.bank-note' }]);
  assert.equal(
    await refusedWith(next, diff),
    'You changed register.transactions, and money-mini 1.1.0’s ingest.bank-note writes note, which your list no longer has. Put note back on register.transactions first, or leave money-mini at 1.0.0.',
  );

  const fewer = await recordWith({ 'register.transactions': (b) => fieldsMapped(b, (fs) => fs.map((f) => (f.id === 'direction' ? { ...f, values: ['in', 'outgoing'] } : f))) });
  const valued = await plan(next, fewer);
  assert.equal(
    conflictFault(valued)?.fix,
    'You changed register.transactions, and money-mini 1.1.0’s ingest.bank-note writes out to direction, which your list no longer allows. Put out back on direction in register.transactions first, or leave money-mini at 1.0.0.',
  );
});

test('a relabel under a kept where that names the field by its id in the words a screen shows is kept', async () => {
  /* `which way is out` FINDS `which_way` BY ITS ID, folded, before and after the label moves, because `parseWhere` tries
     every field's id in the same longest-name match as its label. The label happening to fold to the id is not the
     clause naming the field by its label. */
  const fields = () => FIELDS().map((f) => (f.id === 'direction' ? { ...f, id: 'which_way' } : f));
  const spent = { ...SPENT, where: 'which way is out' };
  const first = await packOf(DOC('1.0.0', fields(), [], { 'spent-30d': spent }));
  const installed = await recordWith({});
  installed.declarations = installed.declarations.map((d) => {
    const body = first.declarations.find((x) => x.id === d.id)?.canonical ?? d.body;
    return d.id === 'metric.spent-30d' ? { ...d, pack_id: null, body: JSON.stringify({ ...JSON.parse(body), name: 'Mine now' }) } : { ...d, body };
  });
  installed.detached = { 'metric.spent-30d': { was: 'money-mini', body: first.declarations.find((d) => d.id === 'metric.spent-30d')!.canonical } };
  const next = await packOf(DOC('1.1.0', fields().map((f) => (f.id === 'which_way' ? { ...f, label: 'Direction' } : f)), [], { 'spent-30d': spent }));
  await takes(next, await plan(next, installed));
});
