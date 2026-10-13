/**
 * A link's `where` and `take` are checked as the rule is installed, and a pattern as its row is written (REC-B10).
 *
 * THE CHECKS LIVED ONLY IN THE DRY RUN. A rule filtering the linked list by a field it does not declare installed, and
 * the pass left the step out for ever; a pattern that can take for ever was stored and then never run. Both are now
 * refused where they are typed (`declare.ts`, the row write in `index.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkFault, linkPatternFault, openRecord, type Declaration, type LinkTo } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const list = (id: string, name: string, title: string, fields: unknown[]): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } as never });

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
const rule = (to: Partial<LinkTo> & Record<string, unknown>): Declaration => ({
  id: 'rule.file',
  kind: 'rule',
  body: { rule: 'file', register: 'ledger', then: [{ link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}', ...to } } }] } as never,
});

test('A LINK FILTERING OR TAKING A FIELD THE LINKED LIST DOES NOT DECLARE IS REFUSED AT INSTALL, and a true one goes in', async () => {
  assert.equal(typeof linkFault, 'function');
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([CATEGORIES, LEDGER])).ok);

  const where = await k.install([rule({ where: { field: 'status', not: 'retired' } as never })]);
  assert.equal(where.ok, false);
  assert.match(JSON.stringify(where), /categories has no field called status/);

  const take = await k.install([rule({ take: 'bucket' })]);
  assert.equal(take.ok, false);
  assert.match(JSON.stringify(take), /categories has no field called bucket/);

  const good = await k.install([rule({ where: { field: 'state', not: 'retired' } as never })]);
  assert.ok(good.ok, JSON.stringify(good));
  sql.close();
});

test('A PATTERN THAT CAN TAKE FOR EVER IS REFUSED AS ITS ROW IS WRITTEN, on a create and on an edit of either field', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([CATEGORIES, LEDGER])).ok);
  assert.notEqual(linkPatternFault('(a+)+$'), null);

  const bad = k.create('categories', { name: 'Loops', match: '(a+)+$', match_by: 'pattern' }, { actor: 'p_1' });
  assert.equal(bad.ok, false);
  const why = (bad as { refusal?: { code: string; fix: string; at?: string } }).refusal;
  assert.equal(why?.code, 'VALUE_MALFORMED');
  assert.match(why?.fix ?? '', /^The pattern repeats a group/);
  assert.equal(why?.at, 'match');

  /* THE SAME TEXT IS ONLY A TEXT while the row matches some other way. */
  const plain = k.create('categories', { name: 'Odd name', match: '(a+)+$', match_by: 'contains' }, { actor: 'p_1' });
  assert.ok(plain.ok);
  const turned = k.update('categories', (plain as { value: { id: string } }).value.id, { match_by: 'pattern' }, { actor: 'p_1' });
  assert.equal(turned.ok, false);

  const safe = k.create('categories', { name: 'Uber', match: '^UBER \\d+', match_by: 'pattern' }, { actor: 'p_1' });
  assert.ok(safe.ok, JSON.stringify(safe));
  const worse = k.update('categories', (safe as { value: { id: string } }).value.id, { match: '(a|ab)+$' }, { actor: 'p_1' });
  assert.equal(worse.ok, false);
  sql.close();
});
