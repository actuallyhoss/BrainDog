/**
 * The fourth rung of a `link`: a row of the linked list that says `pattern` holds a regular expression.
 *
 * A BANK WRITES ONE SHOP TWO WAYS that share no beginning and no middle, `TALABAT CAIRO 4471` and `TLBT*ORDER`, and
 * the three rungs above file one of them at most. A pattern files both. It is the last rung, so a row found by the
 * whole text, by how it starts or anywhere in it is still found that way, and the same tie rule holds: the longest
 * pattern wins and two of one length link nothing.
 *
 * A PATTERN IS RUN INSIDE A WRITE, so one that can take for ever is refused (`linkPatternFault`), and one stored past
 * the refusal is never run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type DryRun, type Entry, type Kernel, type RuleDecl } from '../src/index.ts';
import { linkPatternFault } from '../src/rules.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const list = (id: string, name: string, title: string, fields: unknown[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields } as never,
});

const CATEGORIES = list('categories', 'Categories', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'match', type: 'text', index: true },
  { id: 'match_by', type: 'enum', values: ['exact', 'starts', 'contains', 'pattern'], default: 'exact' },
  { id: 'state', type: 'enum', values: ['live', 'retired'], default: 'live' },
]);

const LEDGER = list('ledger', 'Ledger', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'category', type: 'ref', to: 'categories' },
]);

const TO = { register: 'categories', by: 'match', value: '{{what}}', where: { field: 'state', not: 'retired' } };
const BODY = { rule: 'file', register: 'ledger', then: [{ link: { field: 'category', to: TO } }] } as never as RuleDecl;
const RULE: Declaration = { id: 'rule.file', kind: 'rule', body: BODY as never };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([CATEGORIES, LEDGER, RULE]));
  return { k, sql };
}

const make = (k: Kernel, register: string, fields: Record<string, unknown>): Entry => value<Entry>(k.create(register, fields, { actor: 'p_1' }));
const filed = (k: Kernel, what: string): unknown => make(k, 'ledger', { what }).fields.category;
const would = (k: Kernel): string[] => value<DryRun>(k.dryRun(BODY, 50)).sample.map((s) => s.would.join('; '));

test('TWO SPELLINGS OF ONE SHOP FILE UNDER ONE CATEGORY, by a pattern, whatever the case', async () => {
  const { k, sql } = await record();
  const outing = make(k, 'categories', { name: 'Outing', match: '^(talabat|tlbt)\\b', match_by: 'pattern' });
  assert.equal(filed(k, 'TALABAT CAIRO 4471'), outing.id);
  assert.equal(filed(k, 'TLBT*ORDER 99'), outing.id);
  assert.equal(filed(k, 'METALABAT'), undefined, 'a pattern anchored to the start matched the middle');
  assert.ok(would(k).includes('link category, matched by a pattern'), would(k).join(' | '));
  sql.close();
});

test('A PATTERN IS THE LAST RUNG, and on it the longest wins and two of one length link nothing', async () => {
  const { k, sql } = await record();
  const broad = make(k, 'categories', { name: 'Food', match: 'talabat', match_by: 'pattern' });
  assert.equal(filed(k, 'TALABAT MART'), broad.id);

  /* ANYWHERE IN IT IS ASKED FIRST, though the pattern is the longer text. */
  const mart = make(k, 'categories', { name: 'Groceries', match: 'MART', match_by: 'contains' });
  assert.equal(filed(k, 'TALABAT MART'), mart.id);
  assert.ok(would(k).includes('link category, matched anywhere in it'), would(k).join(' | '));

  /* THE LONGER PATTERN IS THE MORE PARTICULAR CLAIM. */
  const pro = make(k, 'categories', { name: 'Subscriptions', match: 'talabat pro', match_by: 'pattern' });
  assert.equal(filed(k, 'TALABAT PRO MONTHLY'), pro.id);

  /* TWO OF ONE LENGTH TIE, and a retired one is not counted. */
  make(k, 'categories', { name: 'Old food', match: 'talaba.', match_by: 'pattern', state: 'retired' });
  assert.equal(filed(k, 'TALABAT CAIRO'), broad.id);
  make(k, 'categories', { name: 'Also food', match: 'talaba.', match_by: 'pattern' });
  assert.equal(filed(k, 'TALABAT CAIRO'), undefined, 'a rule picked one of two patterns that match equally well');
  assert.ok(would(k).includes('link category: two rows match it equally well'), would(k).join(' | '));
  sql.close();
});

test('A PATTERN IS TRIED AGAINST THE FIRST 512 CHARACTERS OF THE TEXT', async () => {
  const { k, sql } = await record();
  const end = make(k, 'categories', { name: 'Tail', match: 'zebra', match_by: 'pattern' });
  assert.equal(filed(k, `${'a'.repeat(507)}zebra`), end.id);
  assert.equal(filed(k, `${'a'.repeat(508)}zebra`), undefined);
  sql.close();
});

test('AN UNSAFE PATTERN IS REFUSED BY THE CHECK THE WRITE ASKS, and one stored anyway is never run', async () => {
  for (const [pattern, why] of [
    ['(a+)+$', /repeats a group that already holds a repeat/],
    ['(\\w*\\s?)*x', /repeats a group that already holds a repeat/],
    ['((ab)+c){2,}', /repeats a group that already holds a repeat/],
    /* NOTHING NESTED, AND STILL NEVER DONE: an either-or or an optional part under a repeat, and repeats in a row.
       `.*.*.*x` took twenty seconds on 512 characters before it was refused. */
    ['(a|aa)+$', /repeats a group that holds an either-or or an optional part/],
    ['(?:a?a){2,}$', /repeats a group that holds an either-or or an optional part/],
    ['.*.*.*x', /too many repeats and choices/],
    ['\\d+\\d+\\d+z', /too many repeats and choices/],
    [`${'a?'.repeat(24)}${'a'.repeat(24)}`, /too many repeats and choices/],
    ['(unclosed', /cannot be read as a pattern/],
    ['a'.repeat(121), /is 121 characters, and a pattern is at most 120/],
  ] as const)
    assert.match(linkPatternFault(pattern) ?? 'kept', why, pattern);
  for (const pattern of ['^(talabat|tlbt)\\b', 'uber( eats)?', '[(+*]+x', 'a{2,4}b*', '\\(a+\\)+', '(ab)?c+', 'amzn.*mktp( us)?', '^POS \\d+ TALABAT.*$', '(?<shop>amzn|amazon) mktp+?', 'a|b|c|d|e|f|g|h|i|j|k|l|m|n|o', 'a'.repeat(120)])
    assert.equal(linkPatternFault(pattern), null, pattern);

  /* THE WRITE REFUSES ONE, naming the field the pattern is in. */
  const { k, sql } = await record();
  const refused = k.create('categories', { name: 'Trap', match: '(a+)+$', match_by: 'pattern' }, { actor: 'p_1' }) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(refused.ok, false);
  assert.match(`${refused.refusal?.at}: ${refused.refusal?.fix}`, /^match: The pattern repeats a group that already holds a repeat/);

  /* STORED PAST THE CHECK, as a row written before the write asked: kept as a plain text and turned underneath. The
     text below is the one such a pattern never finishes on; the write comes back at once, files nothing, and the
     preview says a pattern was not tried. */
  for (const [name, match] of [['Trap', '(a+)+$'], ['Broken', '(unclosed']] as const) {
    const kept = make(k, 'categories', { name, match, match_by: 'contains' });
    sql.exec(`UPDATE entry SET fields = json_set(fields, '$.match_by', 'pattern') WHERE id = ?`, kept.id);
  }
  assert.equal(filed(k, `${'a'.repeat(60)}!`), undefined);
  assert.ok(would(k).includes('link category: a pattern that might match it is not safe to run, so it was not tried'), would(k).join(' | '));

  /* AND A SAFE ONE BESIDE THEM STILL FILES. */
  const safe = make(k, 'categories', { name: 'Letters', match: '^a+!$', match_by: 'pattern' });
  assert.equal(filed(k, `${'a'.repeat(60)}!`), safe.id);
  sql.close();
});
