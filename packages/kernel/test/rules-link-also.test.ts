/**
 * A `link` that writes the row it found as well as what it took from it, in one step: both, or neither.
 *
 * WHAT WAS WRONG. A ledger row is filed under a filing rule's category (`take`), and it names the filing rule that
 * filed it. Those were two steps and two lookups, and only the first asked whether the category is still there: a rule
 * whose category was retired or deleted filed no category and was still written as the rule that filed the row.
 * `link.to.also` names a second field of the row being linked, and the row found is written there only when what is
 * taken from it is linked.
 *
 * THE DRY RUN IS ASKED BESIDE THE PASS in each test, since the two make one read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type DryRun, type Entry, type Kernel, type RuleDecl } from '../src/index.ts';
import { alsoFault } from '../src/rules.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const list = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields, ...more } as never,
});

const CATEGORIES = list('categories', 'Categories', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'state', type: 'enum', values: ['live', 'retired'], default: 'live' },
], { state: 'state', done: ['retired'] });

const FILING = list('filing', 'Filing rules', 'match', [
  { id: 'match', type: 'text', required: true },
  { id: 'match_by', type: 'enum', values: ['exact', 'starts', 'contains'], default: 'exact' },
  { id: 'category', type: 'ref', to: 'categories' },
  { id: 'state', type: 'enum', values: ['on', 'off'], default: 'on' },
]);

const LEDGER = list('ledger', 'Ledger', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'category', type: 'ref', to: 'categories' },
  { id: 'filed_by', type: 'ref', to: 'filing' },
  { id: 'memo', type: 'text' },
]);

/** The lists as `alsoFault` is handed them: each field by its id. */
const schemaOf = (register: string) => {
  const decl = [CATEGORIES, FILING, LEDGER].find((d) => d.id === `register.${register}`);
  if (!decl) return null;
  const fields = (decl.body as unknown as { fields: { id: string; type: string }[] }).fields;
  return { register, fields: Object.fromEntries(fields.map((f) => [f.id, f])) } as never;
};

type To = { register: string; by: string; value: string; where?: unknown; take?: string; also?: unknown };
const body = (to: To, field = 'category'): RuleDecl => ({ rule: 'file', register: 'ledger', then: [{ link: { field, to } }] }) as never;
const rule = (to: To): Declaration => ({ id: 'rule.file', kind: 'rule', body: body(to) as never });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(to: To): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([CATEGORIES, FILING, LEDGER, rule(to)]));
  return { k, sql };
}

const make = (k: Kernel, register: string, fields: Record<string, unknown>): Entry => value<Entry>(k.create(register, fields, { actor: 'p_1' }));
const would = (k: Kernel, to: To): string[] => value<DryRun>(k.dryRun(body(to), 50)).sample.map((s) => s.would.join('; '));

/** What the seed's filing rule asks, in one step: the rule's category, and the rule itself beside it. */
const FILE = { register: 'filing', by: 'match', value: '{{what}}', where: { field: 'state', is: 'on' }, take: 'category', also: 'filed_by' };

test('ONE STEP WRITES THE CATEGORY AND THE RULE THAT FILED IT, and the preview names both', async () => {
  const { k, sql } = await record(FILE);
  const outing = make(k, 'categories', { name: 'Outing' });
  const talabat = make(k, 'filing', { match: 'TALABAT', match_by: 'starts', category: outing.id });

  const exact = make(k, 'ledger', { what: 'TALABAT' });
  assert.equal(exact.fields.category, outing.id);
  assert.equal(exact.fields.filed_by, talabat.id);
  const lower = make(k, 'ledger', { what: 'Talabat Cairo' });
  assert.equal(lower.fields.category, outing.id);
  assert.equal(lower.fields.filed_by, talabat.id);

  const said = would(k, FILE);
  assert.ok(said.includes('link category and filed_by'), said.join(' | '));
  assert.ok(said.includes('link category and filed_by, matched by how it starts'), said.join(' | '));
  sql.close();
});

test('A RULE WHOSE CATEGORY IS RETIRED OR DELETED WRITES NEITHER, and the preview says why once', async () => {
  const { k, sql } = await record(FILE);
  const outing = make(k, 'categories', { name: 'Outing' });
  const gone = make(k, 'categories', { name: 'Gone' });
  make(k, 'filing', { match: 'TALABAT', category: outing.id });
  make(k, 'filing', { match: 'VANISHED', category: gone.id });
  make(k, 'filing', { match: 'NOWHERE' });

  value(k.update('categories', outing.id, { state: 'retired' }, { actor: 'p_1' }));
  const retired = make(k, 'ledger', { what: 'TALABAT' });
  assert.equal(retired.fields.category, undefined);
  assert.equal(retired.fields.filed_by, undefined, 'a rule whose category is retired was written as the rule that filed the row');

  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), gone.id);
  const deleted = make(k, 'ledger', { what: 'VANISHED' });
  assert.equal(deleted.fields.category, undefined);
  assert.equal(deleted.fields.filed_by, undefined, 'a rule whose category is deleted was written as the rule that filed the row');

  const bare = make(k, 'ledger', { what: 'NOWHERE' });
  assert.equal(bare.fields.category, undefined);
  assert.equal(bare.fields.filed_by, undefined, 'a rule with no category was written as the rule that filed the row');
  assert.equal(make(k, 'ledger', { what: 'NOBODY' }).fields.filed_by, undefined);

  const said = would(k, FILE);
  assert.ok(said.includes('link category and filed_by: the category of the one found is retired'), said.join(' | '));
  assert.ok(said.includes('link category and filed_by: the category of the one found is gone'), said.join(' | '));
  assert.ok(said.includes('link category and filed_by: the one found has no category'), said.join(' | '));
  assert.ok(said.includes('link category and filed_by: nothing bears that name'), said.join(' | '));
  sql.close();
});

test('A LINK WITH NO `also` WRITES ONE FIELD AS IT DID', async () => {
  const to = { ...FILE, also: undefined };
  delete (to as { also?: unknown }).also;
  const { k, sql } = await record(to);
  const outing = make(k, 'categories', { name: 'Outing' });
  make(k, 'filing', { match: 'TALABAT', category: outing.id });
  const row = make(k, 'ledger', { what: 'TALABAT' });
  assert.equal(row.fields.category, outing.id);
  assert.equal(row.fields.filed_by, undefined);
  assert.ok(would(k, to).includes('link category'), would(k, to).join(' | '));
  sql.close();
});

test('AN `also` THAT IS NOT A REF TO THE LINKED LIST IS REFUSED, and a stored one files nothing', async () => {
  const cases: [To, string, string, RegExp][] = [
    [{ ...FILE, also: 'colour' }, 'category', 'FIELD_UNKNOWN', /then\[0\]\.link\.to\.also.*ledger has no field called colour/],
    [{ ...FILE, also: 'memo' }, 'category', 'DECLARATION_INVALID', /memo is not a ref to filing/],
    /* A ref, to another list: the rule found would be written where a category is read. */
    [{ ...FILE, also: 'category' }, 'filed_by', 'DECLARATION_INVALID', /category is not a ref to filing/],
    [{ ...FILE, also: 'category' }, 'category', 'DECLARATION_INVALID', /the field this link already writes/],
    [{ register: 'filing', by: 'match', value: '{{what}}', also: 'filed_by' }, 'category', 'DECLARATION_INVALID', /this link takes nothing/],
    [{ ...FILE, also: 7 }, 'category', 'DECLARATION_INVALID', /names a field/],
  ];
  for (const [to, field, code, fix] of cases) {
    const fault = alsoFault((register) => schemaOf(register), body(to, field));
    assert.equal(fault?.code, code);
    assert.equal(fault?.at, 'then[0].link.to.also');
    assert.match(`${fault?.at}: ${fault?.fix}`, fix);
  }
  assert.equal(alsoFault((register) => schemaOf(register), body(FILE)), null);
  /* A list that is not installed is not this check's to refuse, as with a filter over one. */
  assert.equal(alsoFault(() => null, body({ ...FILE, also: 'colour' })), null);

  /* THE PREVIEW REFUSES IT, and a rule stored past the check files nothing rather than half of it. */
  const bad = { ...FILE, also: 'memo' };
  const sql = openSqlite();
  value(await (await openRecord(sql, fixedClock(NOW))).install([CATEGORIES, FILING, LEDGER, rule(FILE)]));
  sql.exec(`UPDATE declaration SET body = ? WHERE id = 'rule.file' AND superseded_at IS NULL`, JSON.stringify(body(bad)));
  const k = await openRecord(sql, fixedClock(NOW));
  const dry = k.dryRun(body(bad), 50) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(dry.ok, false);
  assert.equal(dry.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(dry.refusal?.at, 'then[0].link.to.also');
  const outing = make(k, 'categories', { name: 'Outing' });
  make(k, 'filing', { match: 'TALABAT', category: outing.id });
  const row = make(k, 'ledger', { what: 'TALABAT' });
  assert.equal(row.fields.category, undefined);
  assert.equal(row.fields.memo, undefined);
  sql.close();
});

test('THE INSTALL REFUSES A BAD `also` AS THE RULE LANDS, and takes a good one', async () => {
  const landing = async (to: To) => (await (await openRecord(openSqlite(), fixedClock(NOW))).install([CATEGORIES, FILING, LEDGER, rule(to)])) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal((await landing(FILE)).ok, true);
  const memo = await landing({ ...FILE, also: 'memo' });
  assert.equal(memo.ok, false);
  assert.equal(memo.refusal?.code, 'DECLARATION_INVALID');
  assert.match(memo.refusal?.fix ?? '', /memo is not a ref to filing/);
  const colour = await landing({ ...FILE, also: 'colour' });
  assert.equal(colour.refusal?.code, 'FIELD_UNKNOWN');
});
