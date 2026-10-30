/**
 * A part that waits on what the record holds: `when: { holds: [people] }` on a declaration, a field, a
 * block, a column, a leg, a pairing clause or a role.
 *
 * BEFORE: only the seed's own `firstPartyDocument(id, { holds })` could cut a part per record, and a stranger's add-on
 * could not say "this field is there once the record has People". A field with `when:` was refused as a key that does
 * not exist, and a block's `when:` could only be a figure's test. Now the shape is checked where a part may say it, a
 * required field may not wait, and a batch that reaches the install with a part nobody planned is refused rather than
 * stored as a part that is always there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { holdingParts, isHolds, unplannedHolds, validate } from '../src/declare.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const list = (fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration =>
  ({
    id: 'register.clients',
    kind: 'register',
    body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, ...fields], ...more },
  }) as never;

const page = (block: Record<string, unknown>, more: Record<string, unknown> = {}): Declaration =>
  ({
    id: 'page.clients',
    kind: 'page',
    body: { page: 'clients', title: 'Clients', requires: ['register.clients'], blocks: [{ kind: 'table', source: 'register.clients', columns: [{ field: 'name' }], ...block }], ...more },
  }) as never;

const PEOPLE = { holds: ['people'] };

test('A FIELD, A BLOCK, A COLUMN AND A WHOLE DECLARATION MAY WAIT, and each is read as though it were there', () => {
  assert.equal(validate(list([{ id: 'contact', type: 'text', when: PEOPLE }])), null);
  assert.equal(validate(list([{ id: 'contact', type: 'text' }], { when: { holds: ['people', 'meets'] } })), null);
  assert.equal(validate(page({ when: PEOPLE })), null);
  assert.equal(validate(page({ columns: [{ field: 'name' }, { field: 'name', when: PEOPLE }] })), null);
  assert.equal(validate(page({}, { when: PEOPLE })), null);
});

test("A BLOCK'S OTHER when IS STILL A FIGURE'S TEST, checked as it was", () => {
  assert.equal(validate(page({ when: { metric: 'owed', gt: 0 } })), null);
  assert.equal(validate(page({ when: { field: 'x' } }))?.code, 'DECLARATION_INVALID');
});

test('EVERY PLACE A PART MAY WAIT is found: fields, the pairing clause, roles, blocks, columns and legs', () => {
  const at = (d: Declaration) => holdingParts(d.kind, d.body as never).map((p) => p.at);
  assert.deepEqual(at(list([], { pairs: { on: ['name'] }, meets: { name: 'name' } })), ['', 'fields[0]', 'pairs', 'meets']);
  assert.deepEqual(at(page({ legs: [{ register: 'x' }] })), ['', 'blocks[0]', 'blocks[0].columns[0]', 'blocks[0].legs[0]']);
  assert.deepEqual(at({ id: 'metric.cash', kind: 'metric', body: { legs: [{}, {}] } } as never), ['', 'legs[0]', 'legs[1]']);
  /* A RULE'S when IS WHAT IT FIRES ON, so the rule itself is no part. */
  assert.deepEqual(at({ id: 'rule.chase', kind: 'rule', body: { when: { field: 'x', is: 'y' } } } as never), []);
  assert.equal(isHolds(PEOPLE), true);
  assert.equal(isHolds({ metric: 'owed' }), false);
});

test('EACH WRONG SHAPE IS REFUSED IN ITS OWN SENTENCE, naming where it is', () => {
  const refused = (d: Declaration) => {
    const r = validate(d);
    assert.equal(r?.code, 'DECLARATION_INVALID', JSON.stringify(r));
    return `${r!.at}: ${r!.fix}`;
  };
  assert.match(refused(list([{ id: 'contact', type: 'text', when: { holds: [] } }])), /^fields\[1\]\.when: .*1 to 8 lists/u);
  assert.match(refused(list([{ id: 'contact', type: 'text', when: { holds: ['People'] } }])), /"People", which is not a list's id/u);
  assert.match(refused(list([{ id: 'contact', type: 'text', when: { holds: ['people'], metric: 'x' } }])), /says metric beside holds/u);
  assert.match(refused(list([{ id: 'contact', type: 'text', when: { holds: ['people', 'people'] } }])), /names one list twice/u);
  assert.match(refused(list([{ id: 'contact', type: 'text', when: { metric: 'owed' } }])), /when is \{ holds: \[people\] \}/u);
  assert.match(refused(page({ columns: [{ field: 'name', when: 'people' }] })), /^blocks\[0\]\.columns\[0\]\.when/u);
  assert.match(
    refused({ id: 'rule.chase', kind: 'rule', body: { rule: 'chase', register: 'clients', when: PEOPLE, then: [] } } as never),
    /a rule cannot wait for a list/u,
  );
});

test('A REQUIRED FIELD MAY NOT WAIT, because a field that comes and goes cannot be asked of every entry', () => {
  const r = validate(list([{ id: 'contact', type: 'text', required: true, when: PEOPLE }]));
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.match(r!.fix, /is required and waits for people/u);
  assert.equal(validate(list([{ id: 'contact', type: 'text', required_when: { field: 'name', is: 'x' }, when: PEOPLE }]))?.code, 'DECLARATION_INVALID');
});

test('A PART NOBODY PLANNED IS REFUSED AT THE INSTALL, and nothing is written', async () => {
  const waiting = list([{ id: 'contact', type: 'text', when: PEOPLE }]);
  assert.match(unplannedHolds([waiting])?.fix ?? '', /register\.clients\.fields\[1\] waits for what this BrainDog holds/u);
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([waiting]);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.at : null, 'register.clients.fields[1].when');
  /* THE SAME LIST WITH THE PART TAKEN OUT, as a plan leaves it, installs. */
  assert.ok((await k.install([list([{ id: 'contact', type: 'text' }])])).ok);
});

test("A LIST'S OWN ORDER names one of its fields that sorts, and which way it reads", () => {
  const dated = (order: unknown) => list([{ id: 'day', type: 'day' }, { id: 'paid', type: 'money' }], { order });
  assert.equal(validate(dated({ field: 'day', dir: 'desc' })), null);
  assert.equal(validate(dated({ field: 'name' })), null);
  for (const [order, at] of [
    [{ field: 'paid' }, /money|number, a day/u],
    [{ field: 'nosuch', dir: 'desc' }, /put in order by "nosuch"/u],
    [{ field: 'day', dir: 'down' }, /\{ field: date, dir: desc \}/u],
    ['day desc', /\{ field: date, dir: desc \}/u],
  ] as const) {
    const r = validate(dated(order));
    assert.equal(r?.code, 'DECLARATION_INVALID', JSON.stringify(order));
    assert.equal(r?.at, 'order');
    assert.match(r!.fix, at);
  }
});
