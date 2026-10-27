/**
 * A question's cause: the key a body derives, exact after sorting and never looser.
 *
 * WHAT WAS MEASURED BEFORE THIS. A proposal had no key at all, so SG89 and SG90 on the owner's record, the same
 * question seven seconds apart, were two cards in "Needs you". These hold the derivation itself: the same ask in any
 * order is one cause, a different value is another, and what the record works out for itself never moves it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { CAUSE, causeFault, causeOf, fold, noop, sha256 } from '../src/cause.ts';

const rowset = (rows: unknown[]) => ({ register: 'tasks', rows });

test('SHA-256 IS THE STANDARD ONE, on its own vectors and across a block boundary', () => {
  assert.equal(sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é漢'.repeat(70)])
    assert.equal(sha256(new TextEncoder().encode(text)), createHash('sha256').update(text).digest('hex'));
});

test('A ROWSET IS ITS LIST AND ITS ROWS, in any order, and the version a row was read at is not part of it', () => {
  const a = causeOf('rowset', rowset([{ at: 'tasks#1', version: 1, patch: { state: 'done' } }, { at: 'tasks#2', version: 3, patch: { state: 'done' } }]));
  const b = causeOf('rowset', rowset([{ at: 'tasks#2', version: 4, patch: { state: 'done' } }, { at: 'tasks#1', version: 1, patch: { state: 'done' } }]));
  assert.match(a!, /^rowset#tasks#[0-9a-f]{24}$/);
  assert.equal(a, b);
  /* A different value, a different row, or another list is another question. */
  assert.notEqual(a, causeOf('rowset', rowset([{ at: 'tasks#1', version: 1, patch: { state: 'open' } }, { at: 'tasks#2', version: 3, patch: { state: 'done' } }])));
  assert.notEqual(a, causeOf('rowset', rowset([{ at: 'tasks#1', version: 1, patch: { state: 'done' } }])));
  assert.notEqual(a, causeOf('rowset', { ...rowset([{ at: 'tasks#1', patch: { state: 'done' } }, { at: 'tasks#2', patch: { state: 'done' } }]), register: 'bills' }));
  /* A new row is the row itself, its keys in any order. */
  assert.equal(causeOf('rowset', rowset([{ name: 'a', state: 'open' }])), causeOf('rowset', rowset([{ state: 'open', name: 'a' }])));
  assert.notEqual(causeOf('rowset', rowset([{ name: 'a' }])), causeOf('rowset', rowset([{ name: 'b' }])));
});

test('A CHANGE IS ITS DECLARATION AND WHAT IT ADDS, and the lines the record works out are not part of it', () => {
  const to = { add: [{ id: 'due', type: 'date' }] };
  const a = causeOf('change', { declaration_id: 'register.tasks', to, from_version: 2, egress: [], approve: ['x'] });
  assert.match(a!, /^change#register\.tasks#[0-9a-f]{24}$/);
  assert.equal(a, causeOf('change', { declaration_id: 'register.tasks', to }));
  assert.notEqual(a, causeOf('change', { declaration_id: 'register.notes', to }));
});

test('A PACK IS ITS VERB AND ITS PACK, which is the command line’s own cause for installing one', () => {
  assert.equal(causeOf('pack', { install: 'work' }), 'install#work');
  assert.equal(causeOf('pack', { disable: 'money' }), 'disable#money');
  assert.equal(causeOf('pack', {}), null);
});

test('OPTIONS ARE THE QUESTION’S WORDS FOLDED AND THE OPTION IDS, and need the words', () => {
  const body = { options: [{ id: 'a', label: 'A', because: 'x' }, { id: 'b', label: 'B', because: 'y' }] };
  const reordered = { options: [{ id: 'b', label: 'Bee', because: 'z' }, { id: 'a', label: 'A', because: 'x' }] };
  assert.equal(causeOf('options', body, 'Which café first?'), causeOf('options', reordered, '  which CAFE first '));
  assert.notEqual(causeOf('options', body, 'Which café first?'), causeOf('options', body, 'Which café last?'));
  assert.equal(causeOf('options', body), null);
  assert.equal(fold('Ça  va, Wren?'), 'ca va wren');
});

test('OPTIONS ABOUT TWO THINGS, OR PUT TO TWO MEMBERS, ARE TWO QUESTIONS, and the same thing asked again is one', () => {
  const yes = { options: [{ id: 'yes', label: 'Yes', because: 'x' }, { id: 'no', label: 'No', because: 'y' }] };
  const ask = (more: Record<string, unknown>) => causeOf('options', { ...yes, ...more }, 'Approve this?');
  /* Same words and ids: before this both derived one cause, and the second ask was joined away and never filed. */
  assert.notEqual(ask({ about: 'parts#2' }), ask({ about: 'parts#3' }));
  assert.notEqual(ask({ to: 'p_wren' }), ask({ to: 'p_sami' }));
  assert.notEqual(ask({ about: 'parts#2' }), ask({}));
  assert.notEqual(ask({ about: 'parts#2' }), ask({ to: 'parts#2' }));
  /* The same thing to the same member, whatever the labels say, still joins. */
  assert.equal(ask({ about: 'parts#2', to: 'p_wren' }), causeOf('options', { options: [...yes.options].reverse(), about: 'parts#2', to: 'p_wren' }, 'approve THIS'));
  /* An ask with neither derives the cause it always did, so an open question filed before this is still joined. */
  assert.equal(ask({}), causeOf('options', yes, 'Approve this?'));
  assert.match(ask({ about: 'parts#2' })!, /^options#[0-9a-f]{24}$/);
});

test('THE REST ARE THE WHOLE BODY AS ASKED, and a kind nobody knows derives none', () => {
  assert.equal(causeOf('settings', { pack: 'work', values: { a: 1 } }), causeOf('settings', { values: { a: 1 }, pack: 'work', cause: 'x' }));
  assert.equal(causeOf('query', {}), null);
});

test('THE SHAPE: one short key, never a sentence', () => {
  for (const ok of ['invoice-totals', 'write#tasks#S12#ab12', 'skills#tidy@user', 'install#work', 'rowset#tasks#0123456789abcdef01234567'])
    assert.ok(CAUSE.test(ok), ok);
  for (const bad of ['', ' lead', 'two words', '#starts', 'x'.repeat(201), 'semi;colon']) assert.ok(!CAUSE.test(bad), bad);
  assert.equal(causeFault('invoice-totals'), null);
  assert.match(causeFault('two words')!, /one short key/);
  assert.match(causeFault(7)!, /as text/);
});

test('A NO-OP IS A ROWSET EVERY ROW OF WHICH ALREADY HOLDS EVERY VALUE, and anything unknown is asked', () => {
  const rows: Record<string, Record<string, unknown>> = { 'tasks#1': { name: 'Ship', state: 'done' }, 'tasks#2': { name: 'Test', state: 'open' } };
  const holds = (_register: string, at: string) => rows[at] ?? null;
  assert.equal(noop(rowset([{ at: 'tasks#1', version: 1, patch: { state: 'done' } }]), holds), true);
  assert.equal(noop(rowset([{ at: 'tasks#1', version: 1, patch: { state: 'done', due: null } }]), holds), true);
  assert.equal(noop(rowset([{ at: 'tasks#1', patch: { state: 'done' } }, { at: 'tasks#2', patch: { state: 'done' } }]), holds), false);
  assert.equal(noop(rowset([{ at: 'tasks#9', patch: { state: 'done' } }]), holds), false);
  assert.equal(noop(rowset([{ name: 'New' }]), holds), false);
  assert.equal(noop(rowset([{ at: 'tasks#1', patch: { state: 'done' } }])), false);
});
