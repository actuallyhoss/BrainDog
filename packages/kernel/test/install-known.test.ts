/**
 * A FIGURE IS ASKED WHETHER ITS LIST HAS ITS FIELDS ON EVERY PATH, AND FROM BOTH SIDES OF THE EDGE.
 *
 * `ef1f268f` made an install refuse a figure over a field its list does not declare, and
 * `loop/research-batch-twenty-audit.md` measured two ways round it. §1: `stageInstall`, which every
 * pack install and every accepted pack proposal goes through, called `stageDeclarations` with no
 * record to check against, so a pack shipping `value: { sum: 'nosuch' }` planned ok, installed ok and
 * read `FIELD_UNKNOWN` on every page. §3: the check ran when the figure arrived and never when the list
 * changed under it, so the owner retiring `category` on Transactions through `setDeclaration` was taken
 * and left the seed's `txn-uncategorised` failing on every read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

type Field = { id: string; type: string; required?: boolean; values?: string[]; retired?: boolean };
const FIELDS: Field[] = [
  { id: 'what', type: 'text', required: true },
  { id: 'amount', type: 'int' },
  { id: 'party', type: 'text' },
  { id: 'kind', type: 'enum', values: ['in', 'out'] },
];

const ledger = (fields: Field[] = FIELDS, id = 'ledger'): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: 'Ledger', title: 'what', fields } }) as never;

/* Every field but `id`, retired in place or dropped outright. */
const retiring = (field: string) => ledger(FIELDS.map((f) => (f.id === field ? { ...f, retired: true } : f)));
const dropping = (field: string) => ledger(FIELDS.filter((f) => f.id !== field));

const metric = (extra: Record<string, unknown> = {}, id = 'total'): Declaration =>
  ({
    id: `metric.${id}`,
    kind: 'metric',
    body: { metric: id, name: 'Money in the ledger', source: 'register.ledger', value: { sum: 'amount' }, format: 'int', target: { gte: 0 }, window: '30d', ...extra },
  }) as never;

type Said = { code: string; fix: string; at?: string };
const refusal = (r: unknown): Said | null => {
  const x = r as { ok: boolean; refusal?: Said };
  return x.ok ? null : x.refusal!;
};
const answer = (r: unknown): string => {
  const said = refusal(r);
  return said === null ? 'installed' : `${said.code} at ${String(said.at)}`;
};

async function record(...with_: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([ledger(), ...with_]);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

/* ── §1: a pack's path ──────────────────────────────────────────────────── */

test("A PACK'S FIGURE OVER A FIELD ITS LIST DOES NOT DECLARE IS REFUSED AT STAGE, as the same figure through install is", async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* The audit's pack: a third party's list with `what` and `amount`, and a figure summing `nosuch`. */
  const pack = [
    { ...ledger(FIELDS.slice(0, 2)), pack: 'third' },
    { ...metric({ value: { sum: 'nosuch' } }), pack: 'third' },
  ] as Declaration[];
  const staged = await k.stageInstall(pack);
  assert.equal(answer(staged), 'FIELD_UNKNOWN at value');
  assert.equal(answer(await k.install(pack)), 'FIELD_UNKNOWN at value', 'and install says the same thing in the same words');
  sql.close();
});

test("A PACK'S FIGURE OVER A LIST THE RECORD ALREADY HOLDS IS ASKED AGAINST THAT LIST", async () => {
  const { k, sql } = await record();
  assert.equal(answer(await k.stageInstall([{ ...metric({ group_by: 'nosuch' }), pack: 'third' }] as Declaration[])), 'FIELD_UNKNOWN at group_by');
  sql.close();
});

test('A PACK WHOSE FIGURE READS WHAT ITS LIST DECLARES STILL STAGES, and lands when the write runs', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const staged = await k.stageInstall([{ ...ledger(), pack: 'third' }, { ...metric({ group_by: 'party' }), pack: 'third' }] as Declaration[]);
  assert.equal(answer(staged), 'installed');
  const write = (staged as { value: () => unknown }).value;
  assert.equal(answer(write()), 'installed');
  sql.close();
});

/* ── §3: the list changes under a figure already installed ─────────────── */

test('A LIST CHANGE THAT RETIRES OR DROPS A FIELD AN INSTALLED FIGURE SUMS IS REFUSED, naming the figure', async () => {
  const { k, sql } = await record(metric());
  for (const change of [retiring('amount'), dropping('amount')]) {
    const said = refusal(await k.install([change]));
    assert.ok(said, 'refused');
    assert.equal(said.code, 'FIELD_UNKNOWN');
    assert.equal(said.at, 'metric.total');
    assert.match(said.fix, /Money in the ledger/, 'names the figure by the name a person reads');
    assert.match(said.fix, /amount/, 'names the field');
    assert.match(said.fix, /first/, 'and says what to do before the list can change');
  }
  sql.close();
});

test('A GROUPING AND A PREDICATE ARE FIELDS A FIGURE READS TOO', async () => {
  {
    const { k, sql } = await record(metric({ group_by: 'party' }));
    assert.equal(answer(await k.install([retiring('party')])), 'FIELD_UNKNOWN at metric.total');
    sql.close();
  }
  {
    const { k, sql } = await record(metric({ where: 'party is set' }));
    assert.equal(answer(await k.install([retiring('party')])), 'FIELD_UNKNOWN at metric.total');
    sql.close();
  }
});

test("A RULE'S `when` AND A PAGE BLOCK'S `where` ARE HELD TO THE SAME CHANGE", async () => {
  const rule = {
    id: 'rule.chase',
    kind: 'rule',
    body: { rule: 'chase', register: 'ledger', on: 'create', when: 'kind is out', once_per: ['id'], then: [{ schedule: { in: '14d', note: 'chase {{what}}' } }] },
  } as never as Declaration;
  const page = {
    id: 'page.ledger',
    kind: 'page',
    body: { page: 'ledger', title: 'Ledger', blocks: [{ kind: 'table', source: 'register.ledger', where: 'party is set', empty: 'Nothing yet.' }] },
  } as never as Declaration;
  {
    const { k, sql } = await record(rule);
    assert.equal(answer(await k.install([retiring('kind')])), 'FIELD_UNKNOWN at rule.chase');
    sql.close();
  }
  {
    const { k, sql } = await record(page);
    assert.equal(answer(await k.install([dropping('party')])), 'FIELD_UNKNOWN at page.ledger');
    sql.close();
  }
});

/* MEASURED ON THE FIRST VERSION OF THIS CHECK by `packages/record/test/context.test.ts`, whose fixture replaces Skills
   and Learnings in one batch: the seed's Agents page filters Learnings on `state`, and the refusal said "Taking what and
   kind and body and rev ... out of Skills", the first list in the batch and every field it lost, because the reader was
   asked against the whole batch and the field was found by substring. */
test('WHEN TWO LISTS CHANGE IN ONE BATCH, THE REFUSAL NAMES THE ONE THAT TOOK THE FIELD, and only that field', async () => {
  const page = {
    id: 'page.both',
    kind: 'page',
    body: {
      page: 'both',
      title: 'Both',
      blocks: [
        { kind: 'table', source: 'register.ledger', where: 'kind is out', empty: 'Nothing yet.' },
        { kind: 'table', source: 'register.notes', where: 'state is active', empty: 'Nothing yet.' },
      ],
    },
  } as never as Declaration;
  const notes = (fields: Field[]): Declaration =>
    ({ id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields } }) as never;
  const NOTES: Field[] = [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['active', 'done'] },
  ];
  const { k, sql } = await record(notes(NOTES), page);
  const said = refusal(await k.install([dropping('party'), notes(NOTES.filter((f) => f.id !== 'state'))]));
  assert.ok(said, 'refused');
  assert.equal(said.at, 'page.both');
  assert.match(said.fix, /^Taking state out of Notes /);
  sql.close();
});

/* NEITHER OF THESE WAS HELD BY A TEST when the check was first checked: the field filter reduced to every field the list
   lost, and the skip over a reader already failing removed, both left this file green. */
test('WHEN A CHANGE TAKES TWO FIELDS AND THE FIGURE READS ONE, THE REFUSAL NAMES THAT ONE', async () => {
  const { k, sql } = await record(metric());
  const said = refusal(await k.install([ledger(FIELDS.filter((f) => f.id !== 'amount' && f.id !== 'party'))]));
  assert.ok(said, 'refused');
  assert.match(said.fix, /^Taking amount out of Ledger /);
  assert.match(said.fix, /or keep amount\.$/);
  assert.doesNotMatch(said.fix, /party/, 'the field nothing reads is not the reason');
  sql.close();
});

test('A FIGURE ALREADY FAILING BEFORE THE CHANGE DOES NOT HOLD UP A CHANGE THAT BREAKS NOTHING MORE', async () => {
  /* This record reached that state by the one path this check did not guard, a pack upgrade through `stageInstall`
     that drops a field an owner's figure sums. `stageInstall` runs `stranded` now and refuses it, so the state is
     written into the table as an earlier build left it. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const land = async (batch: Declaration[]) => {
    const staged = await k.stageInstall(batch.map((d) => ({ ...d, pack: 'third' })) as Declaration[]);
    if (!staged.ok) return answer(staged);
    const out = answer((staged as { value: () => unknown }).value());
    k.reload();
    return out;
  };
  assert.equal(await land([ledger()]), 'installed');
  assert.equal(answer(await k.install([metric()])), 'installed');
  assert.equal(await land([dropping('amount')]), 'FIELD_UNKNOWN at metric.total');
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'register.ledger' AND superseded_at IS NULL", JSON.stringify(dropping('amount').body));
  k.reload();
  assert.equal(answer(await k.install([ledger(FIELDS.filter((f) => f.id !== 'amount' && f.id !== 'party'))])), 'installed');
  sql.close();
});

test('WHAT THE CHANGE DOES NOT STRAND STILL INSTALLS', async () => {
  const { k, sql } = await record(metric());
  /* A field nothing reads. */
  assert.equal(answer(await k.install([retiring('party')])), 'installed');
  /* The figure moved off the field in the same change. */
  assert.equal(answer(await k.install([dropping('amount'), metric({ value: { count: 'id' } })])), 'installed');
  sql.close();

  /* The figure retired first, then the list. */
  const second = await record(metric());
  assert.ok((second.k.retire(['metric.total']) as { ok: boolean }).ok);
  assert.equal(answer(await second.k.install([retiring('amount')])), 'installed');
  second.sql.close();

  /* A figure over ANOTHER list with a field of the same name is not this change's business. */
  const third = await record();
  assert.equal(answer(await third.k.install([ledger(FIELDS, 'other'), metric({ source: 'register.other' }, 'elsewhere')])), 'installed');
  assert.equal(answer(await third.k.install([retiring('amount')])), 'installed');
  third.sql.close();
});
