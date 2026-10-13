/**
 * A `link` that filters the rows it may find, and may link what the row found points at.
 *
 * WHAT WAS WRONG. `linkOf` climbed its ladder over every live row of the linked list and read nothing else about them,
 * so a category for money in was put on money going out, and a retired category still filed. `link.to.where` is a
 * filter on the rows the ladder may find, filled from the row being filed, and it is applied on every rung before ties
 * are counted: a row it leaves out neither wins nor blocks the one row that passes.
 *
 * `link.to.take` NAMES A FIELD OF THE ROW FOUND, and what that field holds is linked in the row's place. A list of
 * filing rules is found by its text, and the ledger row is given the rule's category.
 *
 * THE DRY RUN IS ASKED BESIDE THE PASS in each test, since the two make one read and a preview that disagrees with the
 * pass is the preview being wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type DryRun, type Entry, type Kernel, type RuleDecl } from '../src/index.ts';
import { linkFault } from '../src/rules.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const list = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields, ...more } as never,
});

const CATEGORIES = list('categories', 'Categories', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'match', type: 'text', index: true },
  { id: 'match_by', type: 'enum', values: ['exact', 'starts', 'contains'], default: 'exact' },
  { id: 'direction', type: 'enum', values: ['in', 'out', 'either'], default: 'either' },
  { id: 'state', type: 'enum', values: ['live', 'retired'], default: 'live' },
], { state: 'state', done: ['retired'] });

const FILING = list('filing', 'Filing rules', 'match', [
  { id: 'match', type: 'text', required: true },
  { id: 'category', type: 'ref', to: 'categories' },
  { id: 'state', type: 'enum', values: ['on', 'off'], default: 'on' },
]);

/** The lists as `linkFault` is handed them: each field by its id. */
const schemaOf = (register: string) => {
  const decl = [CATEGORIES, FILING, LEDGER].find((d) => d.id === `register.${register}`);
  if (!decl) return null;
  const fields = (decl.body as unknown as { fields: { id: string; type: string }[] }).fields;
  return { register, fields: Object.fromEntries(fields.map((f) => [f.id, f])) } as never;
};

const LEDGER = list('ledger', 'Ledger', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'] },
  { id: 'category', type: 'ref', to: 'categories' },
]);

type To = { register: string; by: string; value: string; where?: unknown; take?: string };
const body = (to: To): RuleDecl => ({ rule: 'file', register: 'ledger', then: [{ link: { field: 'category', to } }] }) as never;
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
/** What the dry run says it would do, one line a ledger row it walked. */
const would = (k: Kernel, to: To): string[] => value<DryRun>(k.dryRun(body(to), 50)).sample.map((s) => s.would.join('; '));

const BY_MATCH = { register: 'categories', by: 'match', value: '{{what}}' };
/** The right direction or either, and a live category: what the seed's filing rule asks. */
const FITS = { all: [{ field: 'direction', in: ['{{direction}}', 'either'] }, { field: 'state', not: 'retired' }] };

test('A CATEGORY FOR MONEY IN IS NOT PUT ON MONEY GOING OUT, and the preview says why', async () => {
  const to = { ...BY_MATCH, where: FITS };
  const { k, sql } = await record(to);
  const salary = make(k, 'categories', { name: 'Salary', match: 'ACME', direction: 'in' });

  const paid = make(k, 'ledger', { what: 'ACME', direction: 'in' });
  assert.equal(paid.fields.category, salary.id);
  const spent = make(k, 'ledger', { what: 'ACME', direction: 'out' });
  assert.equal(spent.fields.category, undefined, 'a category for money in filed money going out');

  const said = would(k, to);
  assert.ok(said.includes('link category'), said.join(' | '));
  assert.ok(
    said.some((s) => /^link category: .*left out by this link's where \(direction, state\)$/.test(s)),
    said.join(' | '),
  );
  sql.close();
});

test('A RETIRED CATEGORY FILES NOTHING, and neither wins nor blocks the live one of the same text', async () => {
  const to = { ...BY_MATCH, where: { field: 'state', not: 'retired' } };
  const { k, sql } = await record(to);
  make(k, 'categories', { name: 'Old outing', match: 'TALABAT', state: 'retired' });
  const alone = make(k, 'ledger', { what: 'TALABAT', direction: 'out' });
  assert.equal(alone.fields.category, undefined, 'a retired category filed a row');

  /* TWO ROWS BEAR THE NAME AND ONE PASSES: without the filter that is a tie, and with it the live one is linked. */
  const live = make(k, 'categories', { name: 'Outing', match: 'TALABAT' });
  const next = make(k, 'ledger', { what: 'TALABAT', direction: 'out' });
  assert.equal(next.fields.category, live.id);

  /* AND ON THE LOWER RUNGS: the longer retired one does not win, and does not tie with anything. */
  make(k, 'categories', { name: 'Old cloud', match: 'FENWICK CLOUD', match_by: 'starts', state: 'retired' });
  const cloud = make(k, 'categories', { name: 'Software', match: 'FENWICK', match_by: 'starts' });
  make(k, 'categories', { name: 'Old software', match: 'fenwick', match_by: 'starts', state: 'retired' });
  const row = make(k, 'ledger', { what: 'FENWICK CLOUD LTD 4471', direction: 'out' });
  assert.equal(row.fields.category, cloud.id);
  assert.ok(would(k, to).includes('link category, matched by how it starts'), would(k, to).join(' | '));
  sql.close();
});

test('AN UNCHANGED RULE LINKS AS IT DID: no where, and a retired row still ties', async () => {
  const { k, sql } = await record(BY_MATCH);
  const one = make(k, 'categories', { name: 'Outing', match: 'TALABAT', direction: 'in' });
  assert.equal(make(k, 'ledger', { what: 'TALABAT', direction: 'out' }).fields.category, one.id);
  make(k, 'categories', { name: 'Old outing', match: 'TALABAT', state: 'retired' });
  assert.equal(make(k, 'ledger', { what: 'TALABAT', direction: 'out' }).fields.category, undefined);
  assert.ok(would(k, BY_MATCH).every((w) => w === 'link category: two rows bear that name'), would(k, BY_MATCH).join(' | '));
  sql.close();
});

test('`take` LINKS WHAT THE ROW FOUND POINTS AT, so a filing rule files under its category', async () => {
  const to = { register: 'filing', by: 'match', value: '{{what}}', where: { field: 'state', is: 'on' }, take: 'category' };
  const { k, sql } = await record(to);
  const outing = make(k, 'categories', { name: 'Outing' });
  make(k, 'filing', { match: 'TALABAT', category: outing.id });
  make(k, 'filing', { match: 'NOWHERE' });
  make(k, 'filing', { match: 'SWITCHED OFF', category: outing.id, state: 'off' });

  assert.equal(make(k, 'ledger', { what: 'TALABAT' }).fields.category, outing.id);
  assert.equal(make(k, 'ledger', { what: 'NOWHERE' }).fields.category, undefined, 'a rule with no category filed a row');
  assert.equal(make(k, 'ledger', { what: 'SWITCHED OFF' }).fields.category, undefined);
  const said = would(k, to);
  assert.ok(said.includes('link category'), said.join(' | '));
  assert.ok(said.includes('link category: the one found has no category'), said.join(' | '));

  /* A DELETED CATEGORY IS NOT FILED UNDER, though the filing rule that points at it is still on. */
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), outing.id);
  assert.equal(make(k, 'ledger', { what: 'TALABAT' }).fields.category, undefined, 'a deleted category filed a row');
  assert.ok(would(k, to).includes('link category: the category of the one found is gone'), would(k, to).join(' | '));
  sql.close();
});

test('`take` LINKS NOTHING THE ROW\'S OWN LIST CALLS DONE, so a retired category is not filed under', async () => {
  const to = { register: 'filing', by: 'match', value: '{{what}}', where: { field: 'state', is: 'on' }, take: 'category' };
  const { k, sql } = await record(to);
  const outing = make(k, 'categories', { name: 'Outing' });
  make(k, 'filing', { match: 'TALABAT', category: outing.id });
  assert.equal(make(k, 'ledger', { what: 'TALABAT' }).fields.category, outing.id);
  value(k.update('categories', outing.id, { state: 'retired' }, { actor: 'p_1' }));
  assert.equal(make(k, 'ledger', { what: 'TALABAT' }).fields.category, undefined, 'a retired category filed a row');
  assert.ok(would(k, to).includes('link category: the category of the one found is retired'), would(k, to).join(' | '));
  sql.close();
});

test('A `where` OR A `take` NAMING A FIELD THE LINKED LIST DOES NOT DECLARE IS REFUSED, and files nothing', async () => {
  const cases: [To, RegExp][] = [
    [{ ...BY_MATCH, where: { field: 'colour', is: 'red' } }, /then\[0\]\.link\.to\.where.*categories has no field called colour/],
    [{ ...BY_MATCH, take: 'colour' }, /then\[0\]\.link\.to\.take.*categories has no field called colour/],
  ];
  for (const [to, fix] of cases) {
    const fault = linkFault((register) => schemaOf(register), body(to));
    assert.equal(fault?.code, 'FIELD_UNKNOWN');
    assert.match(`${fault?.at}: ${fault?.fix}`, fix);

    /* THE INSTALL REFUSES IT beside the list it links to. */
    const fresh = openSqlite();
    const refused = (await (await openRecord(fresh, fixedClock(NOW))).install([CATEGORIES, FILING, LEDGER, rule(to)])) as { ok: boolean; refusal?: { code: string } };
    assert.equal(refused.ok, false);
    assert.equal(refused.refusal?.code, 'FIELD_UNKNOWN');
    fresh.close();

    /* THE PREVIEW REFUSES IT, and a rule stored past the check (kept by a build from before the install asked, so
       written here under the record and read again) files nothing rather than filing unfiltered. */
    const sql = openSqlite();
    value(await (await openRecord(sql, fixedClock(NOW))).install([CATEGORIES, FILING, LEDGER, rule({ ...BY_MATCH, where: FITS })]));
    sql.exec(`UPDATE declaration SET body = ? WHERE id = 'rule.file' AND superseded_at IS NULL`, JSON.stringify(body(to)));
    const k = await openRecord(sql, fixedClock(NOW));
    const dry = k.dryRun(body(to), 50) as { ok: boolean; refusal?: { code: string } };
    assert.equal(dry.ok, false);
    assert.equal(dry.refusal?.code, 'FIELD_UNKNOWN');
    make(k, 'categories', { name: 'Outing', match: 'TALABAT' });
    assert.equal(make(k, 'ledger', { what: 'TALABAT' }).fields.category, undefined);
    sql.close();
  }
  assert.equal(linkFault((register) => schemaOf(register), body({ ...BY_MATCH, where: FITS })), null);
});
