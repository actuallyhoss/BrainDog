/**
 * An entry's own documents, read on the entry's own screen: `get` with `values: true` answers, for each
 * document field, what its `{{path}}`s read with the entry as `here`, and `unnamed` for a path that names nothing.
 *
 * WHAT WAS MEASURED BEFORE IT: on the owner's record a project's note said `{{blockers.count}}`, and the project's own
 * screen printed a hole for it on every read, because the screen's resolver answered nothing for every path and `get`
 * carried nothing it could answer from.
 *
 * THE FIRST TEST IS RED UNTIL TWO LINES LAND that this file's owner could not write: `get` taking `values` in the
 * record's `index.ts`, and the kernel's `block` handing `here` to the read. The others hold `docValues` over the kernel
 * as it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BlockResult } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { docValues, type EntryValues } from '../src/row-values.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const PROJECTS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'stage', type: 'text' },
      { id: 'price', type: 'money' },
      { id: 'blockers', type: 'list', of: 'text' },
      { id: 'note', type: 'document' },
      { id: 'plan', type: 'document' },
    ],
  } as never,
};

/* A FIGURE THAT SHARES A FIELD'S NAME: on the entry's own screen the field wins, as it does on its page. */
const PRICE = {
  id: 'metric.price',
  kind: 'metric' as const,
  body: { metric: 'price', name: 'Price', source: 'register.things', value: { count: 'name' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const NOTE = 'Stage: {{stage}}. {{blockers.count}} in the way. Sells at {{money:price}}. {{things.count}} projects. {{blokers.count}}';

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([PROJECTS, PRICE])).ok);
  const kiln = { name: 'Kiln', stage: 'Building', price: egp(135_000), blockers: ['Kiln permit', 'Clay supplier'], note: NOTE, plan: 'No values here.' };
  assert.ok((await api.create({ register: 'things', fields: kiln }, owner)).ok);
  assert.ok((await api.create({ register: 'things', fields: { name: 'Portage' } }, owner)).ok);
  return api;
}

test('A PROJECT’S NOTE ON ITS OWN SCREEN READS ITS STAGE AND ITS BLOCKERS, and a path that names nothing is said so', async () => {
  const api = await record();
  const ask = { register: 'things', seq: 1, values: true };
  const got = await api.get(ask, owner);
  assert.ok(got.ok, JSON.stringify(got));
  const docs = (got.value as EntryValues).docs;
  assert.deepEqual(docs?.note?.values, { stage: 'Building', 'blockers.count': 2, price: egp(135_000), 'things.count': 2 }, JSON.stringify(docs));
  assert.deepEqual(docs?.note?.unnamed, ['blokers.count']);
  assert.equal(docs?.plan, undefined, 'a document with no path in it is not read');
});

test('UNASKED, `get` ANSWERS THE ROW AS IT DID: no `docs` on the answer', async () => {
  const api = await record();
  const got = await api.get({ register: 'things', seq: 1 }, owner);
  assert.ok(got.ok && got.value !== null);
  assert.equal(Object.hasOwn(got.value, 'docs'), false);
});

test('A PATH THAT DOES NOT NEED THE ENTRY READS AS ON ANY PAGE, and a typo is unnamed, never a dash', async () => {
  const api = await record();
  const got = await api.get({ register: 'things', seq: 1 }, owner);
  const out = docValues(api.kernel, got);
  assert.ok(out.ok && out.value !== null);
  assert.equal(out.value.docs?.note?.values?.['things.count'], 2);
  assert.ok(out.value.docs?.note?.unnamed?.includes('blokers.count'), JSON.stringify(out.value.docs));
});

test('AN ENTRY WITH NO PATH IN ANY DOCUMENT, NO ENTRY AND A REFUSAL ARE HANDED BACK AS THEY CAME', async () => {
  const api = await record();
  const portage = await api.get({ register: 'things', seq: 2 }, owner);
  assert.equal(docValues(api.kernel, portage), portage);
  const none = await api.get({ register: 'things', seq: 9 }, owner);
  assert.equal(docValues(api.kernel, none), none);
  const refused = await api.get({}, owner);
  assert.equal(docValues(api.kernel, refused), refused);
});

test('A BLOCK HELD FROM THE CALLER ANSWERS NO VALUES: a document cannot be written to read a list she may not open', async () => {
  const api = await record();
  const got = await api.get({ register: 'things', seq: 1 }, owner);
  const held = docValues(api.kernel, got, ({ values: _v, unnamed: _u, ...b }) => b);
  assert.ok(held.ok && held.value !== null);
  assert.equal(held.value.docs?.note?.values?.['things.count'], undefined, 'a count of a list was answered past the hold');
  assert.equal(held.value.docs?.note?.unnamed, undefined, 'which lists exist was answered past the hold');
});

/* THE RECORD'S OWN SHELL (`shellOf` beside `heldBlock`) BLANKS `values` AND KEEPS `unnamed`, with a refusal of its own. Kept,
   `unnamed` would tell her a typo from a list she cannot open, and a path with no value would print its words and a dash. */
test('A DOCUMENT THE RECORD HOLDS FROM HER SAYS `held`, AND NEITHER WHAT ITS PATHS READ NOR WHICH OF THEM NAME NOTHING', async () => {
  const api = await record();
  const got = await api.get({ register: 'things', seq: 1 }, owner);
  const shell = (b: BlockResult): BlockResult => ({ ...b, values: {}, refusals: [{ code: 'FORBIDDEN', fix: 'You cannot open this list.', at: 'source' }] });
  const held = docValues(api.kernel, got, shell);
  assert.ok(held.ok && held.value !== null);
  const note = held.value.docs?.note;
  assert.equal(note?.held, true, JSON.stringify(note));
  assert.equal(note?.unnamed, undefined, 'which paths name nothing was answered past the hold');
  assert.equal(note?.values?.['things.count'], undefined, 'a count of a list was answered past the hold');
  assert.equal(held.value.docs?.plan, undefined);
  const open = docValues(api.kernel, got, (b) => b);
  assert.ok(open.ok && open.value !== null);
  assert.equal(open.value.docs?.note?.held, undefined, 'a block the hold hands back whole is not held');
});

test('WHAT THE ENTRY ITSELF ANSWERS OUTLIVES THE HOLD, and nothing else does, nor a figure that only shares a field’s name', async () => {
  const api = await record();
  const got = await api.get({ register: 'things', seq: 1 }, owner);
  /* THE READ AS A KERNEL HANDED THE ENTRY ANSWERS IT, and a hold that keeps nothing, which is what a member reading
     Projects alone was given for this note: `blockers` was judged as a list she cannot open. */
  const reads = (values: Record<string, unknown>) => ({
    register: (id: string) => api.kernel.register(id),
    block: () => ({ kind: 'note', rows: [], matched: 0, values }) as never,
  });
  const strip = ({ values: _held, ...b }: BlockResult): BlockResult => b;
  const kept = docValues(reads({ stage: 'Building', 'blockers.count': 2, price: egp(135_000), 'pay.count': 3 }), got, strip);
  assert.ok(kept.ok && kept.value !== null);
  assert.deepEqual(kept.value.docs?.note?.values, { stage: 'Building', 'blockers.count': 2, price: egp(135_000) });
  const figure = docValues(reads({ stage: 7, 'blockers.count': 9, price: egp(1) }), got, strip);
  assert.ok(figure.ok && figure.value !== null);
  assert.equal(Object.hasOwn(figure.value, 'docs'), false, JSON.stringify(figure.value));
});
