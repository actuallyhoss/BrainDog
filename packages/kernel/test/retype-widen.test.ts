/**
 * Opening a closed list is not a retype: an `enum` becoming `text` over rows that hold values installs.
 *
 * MEASURED IN `loop/research-shell-seed-next.md` N2. One money-core step up with `holdings.kind` as `text` in place of the
 * four-value `enum` was refused `FIELD_TYPE_CHANGED` by the kernel as well as by `declare`, with the fix "Retire the field
 * and add a new one". For `enum` to `ref` that is right: a stored `"premises"` is not a row id. For `enum` to `text` it
 * is not: every stored value is already valid text, nothing is lost, and the fix would split one column into two. So
 * `updates.by` could not become open text on any record holding an update.
 *
 * THE REST STAY REFUSED, each for a value it would misread: `enum` to `ref` (a word is not a row id), `text` to `enum` (a
 * word outside the values), `text` to `int` (a word is not a number).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { widens } from '../src/widen.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const NAME = { id: 'name', type: 'text', required: true };
const KIND = { id: 'kind', type: 'enum', values: ['cash', 'gold', 'stock', 'other'] };
const MARKS = { id: 'marks', type: 'list', of: 'enum', values: ['kept', 'sold'] };
const SAID = { id: 'said', type: 'text' };

const holdings = (fields: Record<string, unknown>[]): Declaration => ({
  id: 'register.holdings',
  kind: 'register',
  body: { id: 'holdings', name: 'Holdings', title: 'name', fields } as never,
});

const OTHERS: Declaration = {
  id: 'register.categories',
  kind: 'register',
  body: { id: 'categories', name: 'Categories', title: 'name', fields: [NAME] } as never,
};

async function held(): Promise<{ k: Kernel; id: string }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([OTHERS, holdings([NAME, KIND, MARKS, SAID])])).ok);
  const out = k.create('holdings', { name: 'Bar', kind: 'gold', marks: ['kept'], said: 'seven' }, { actor: 'p_1' }) as {
    ok: boolean;
    value: { id: string };
  };
  assert.ok(out.ok);
  return { k, id: out.value.id };
}

test('enum TO text OVER A ROW THAT HOLDS A VALUE INSTALLS, and the value reads back unchanged', async () => {
  const { k, id } = await held();
  const out = await k.install([holdings([NAME, { id: 'kind', type: 'text' }, MARKS, SAID])]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(k.get(id)?.fields.kind, 'gold');
  /* AND IT IS OPEN NOW, which is what the change was for. */
  assert.ok(k.update('holdings', id, { kind: 'a word nobody listed' }, { actor: 'p_1' }).ok);
});

test('list of enum TO list of text IS THE SAME WIDENING, element by element', async () => {
  const { k, id } = await held();
  const out = await k.install([holdings([NAME, KIND, { id: 'marks', type: 'list', of: 'text' }, SAID])]);
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(k.get(id)?.fields.marks, ['kept']);
});

test('enum TO ref, text TO enum AND text TO int ARE STILL REFUSED over held values', async () => {
  const { k } = await held();
  const cases: Record<string, unknown>[][] = [
    [NAME, { id: 'kind', type: 'ref', to: 'categories' }, MARKS, SAID],
    [NAME, KIND, MARKS, { id: 'said', type: 'enum', values: ['seven'] }],
    [NAME, KIND, MARKS, { id: 'said', type: 'int' }],
  ];
  for (const fields of cases) assert.equal(codeOf(await k.install([holdings(fields)])), 'FIELD_TYPE_CHANGED', JSON.stringify(fields));
});

test('widens IS THE ONE ANSWER declare CAN IMPORT', () => {
  assert.equal(widens({ type: 'enum' }, { type: 'text' }), true);
  assert.equal(widens({ type: 'list', of: 'enum' }, { type: 'list', of: 'text' }), true);
  assert.equal(widens({ type: 'enum' }, { type: 'ref' }), false);
  assert.equal(widens({ type: 'text' }, { type: 'enum' }), false);
  assert.equal(widens({ type: 'text' }, { type: 'int' }), false);
  assert.equal(widens({ type: 'list', of: 'enum' }, { type: 'text' }), false);
  assert.equal(widens({ type: 'enum' }, { type: 'enum' }), false);
});
