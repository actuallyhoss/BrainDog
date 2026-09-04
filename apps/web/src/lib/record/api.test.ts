/**
 * `display()`, which decides how every value in the product reaches a person's eye.
 *
 * `money()` itself is tested in the render package. What is NOT tested there, and is the thing that
 * would actually break, is the DISPATCH: `display()` reads a field's declared type and picks a
 * formatter, and the failure mode is silent. A type that falls through to the `default` branch does
 * not throw and does not look broken — it prints `480000` where `GBP 4,800.00` belongs, and the
 * number is wrong by two orders of magnitude on a screen somebody is about to act on. That is the
 * one formatting bug this product cannot ship, so it is the first thing here.
 *
 * The second is `secret`. Nothing in the app is allowed to render a credential, and the test that
 * matters is not "it returns dots" but "the value never appears in the output".
 *
 * And `isProse`, because bidirectional text is decided from the declared type and getting it
 * backwards is invisible until somebody types Arabic into a record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CURRENCY, dirOf, display, isProse, labelOf } from './api.ts';
import { REGISTERS, ROWS, VAULT } from './data.ts';

/* ── money ───────────────────────────────────────────────────────────────── */

test('money is divided out of minor units, with its code', () => {
  assert.equal(display('obligations', 'amount', 480_000), 'GBP 4,800.00');
  assert.equal(display('obligations', 'amount', 1), 'GBP 0.01');
  assert.equal(display('obligations', 'amount', 100), 'GBP 1.00');
});

test('a money field never renders the raw integer', () => {
  for (const minor of [1, 99, 100, 480_000, 1_910_000]) {
    const out = display('obligations', 'amount', minor);
    assert.ok(out, 'a value was given, so a string is owed');
    assert.notEqual(out, String(minor), `${minor} reached the screen as minor units`);
    assert.ok(out.startsWith(`${CURRENCY} `), `${out} lost its currency code`);
  }
});

test('zero is a number, not nothing', () => {
  // `0` is falsy and the guard at the top of `display` tests for null/undefined/'' precisely so
  // that a real zero — a service that costs nothing — still prints.
  assert.equal(display('obligations', 'amount', 0), 'GBP 0.00');
});

test('null, undefined and empty are absent rather than zero', () => {
  assert.equal(display('obligations', 'amount', null), null);
  assert.equal(display('obligations', 'amount', undefined), null);
  assert.equal(display('obligations', 'amount', ''), null);
});

/* ── the other types ─────────────────────────────────────────────────────── */

test('a day is spelled, so no reader has to know the local order', () => {
  // Months as words is the point: 03/09 is two different days either side of an ocean.
  assert.equal(display('obligations', 'due', '2026-07-27'), '27 Jul 2026');
});

test('an enum reads as words, not as an identifier', () => {
  assert.equal(display('obligations', 'direction', 'owed_to_me'), 'owed to me');
  assert.equal(display('tasks', 'state', 'done'), 'done');
});

test('an int is grouped', () => {
  assert.equal(display('sessions', 'wrote', 12_400), '12,400');
});

test('a duration carries its declared unit', () => {
  assert.equal(display('tasks', 'effort', 3), '3 d');
});

test('a ref reads as the title of the row it points at', () => {
  // "a person says Halden, not people#1" — the whole reason this branch exists.
  const titleField = REGISTERS.people?.title ?? '';
  const target = ROWS.people?.find((r) => r.seq === 1);
  assert.ok(target, 'the seed needs a people#1 for this to mean anything');
  assert.equal(display('obligations', 'party', 1), String(target.fields[titleField]));
});

test('a ref that points at nothing degrades to the spoken id, not to a bare number', () => {
  const out = display('obligations', 'party', 999_999);
  assert.equal(out, 'people#999999');
});

test('an undeclared field is stringified rather than dropped', () => {
  assert.equal(display('obligations', 'not_a_field', 'whatever'), 'whatever');
});

/* ── the credential ──────────────────────────────────────────────────────── */

test('no register declares a secret, so there is nothing for display to leak', () => {
  // The strongest form of this guarantee is structural, not behavioural: the vault indexes what a
  // key OPENS and the value is never a field on a row, so no rendering path can reach one. If a
  // register ever grows a `secret` field, this fails and the masking below becomes the live test.
  const declared = Object.entries(REGISTERS).flatMap(([id, reg]) =>
    reg.fields.filter((f) => f.type === 'secret').map((f) => `${id}.${f.id}`),
  );
  assert.deepEqual(declared, [], 'a secret reached the record');
});

test('a vault row carries no value, only what the key opens', () => {
  const SECRETISH = /^(value|secret|token|key|password|credential)$/i;
  for (const row of VAULT) {
    const leaked = Object.keys(row).filter((k) => SECRETISH.test(k));
    assert.deepEqual(leaked, [], `${row.id} carries ${leaked.join(', ')}`);
  }
});

test('and if one ever is declared, display masks it', () => {
  // Through the same switch the app uses, with a whole register added here rather than a field
  // pushed into an existing one — `fields` is `readonly` on purpose and a test is not a reason to
  // cast that away. The seed staying clean is the previous test's job; this is the branch's.
  const secret = 'sk-live-2f9a41c7d8b3e6';
  REGISTERS.probe = {
    id: 'probe',
    name: 'Probe',
    one: 'probe',
    holds: 'nothing, outside this test',
    title: 'label',
    mobile: ['label', 'label', 'label'],
    fields: [
      { id: 'label', type: 'text' },
      { id: 'token', type: 'secret' },
    ],
  };
  try {
    const out = display('probe', 'token', secret);
    assert.ok(out && !out.includes(secret), 'the credential reached the string');
    assert.equal(out, '••••••••');
    // And it is masked in the metadata too, not just the glyphs.
    assert.equal(out.length, 8);
  } finally {
    delete REGISTERS.probe;
  }
});

/* ── labels ──────────────────────────────────────────────────────────────── */

test('a label is the id with underscores as spaces, capitalised', () => {
  assert.equal(labelOf({ id: 'last_seen', type: 'instant' }), 'Last seen');
  assert.equal(labelOf({ id: 'amount', type: 'money' }), 'Amount');
});

test('a declared label wins over the derived one', () => {
  assert.equal(labelOf({ id: 'what', type: 'text', label: 'Thing owed' }), 'Thing owed');
});

/* ── bidirectional text ──────────────────────────────────────────────────── */

test('prose takes its direction from the text, machine-built strings do not', () => {
  // Prose: somebody typed it, so the first strong character decides.
  assert.equal(isProse('obligations', 'what'), true, 'text');
  assert.equal(isProse('tasks', 'note'), true, 'document');
  assert.equal(isProse('obligations', 'party'), true, 'a ref renders a title, which is prose');

  // Assembled here from a number: the direction is the app's.
  assert.equal(isProse('obligations', 'amount'), false, 'money');
  assert.equal(isProse('obligations', 'due'), false, 'day');
  assert.equal(isProse('obligations', 'direction'), false, 'enum');
  assert.equal(isProse('sessions', 'wrote'), false, 'int');
});

test('an unknown field is treated as prose, because that failure is the safe one', () => {
  // Guessing wrong this way yields a correctly ordered string. The other way yields a broken one.
  assert.equal(isProse('obligations', 'not_a_field'), true);
});

test('dirOf emits the attribute only where it is wanted', () => {
  assert.equal(dirOf('obligations', 'what'), 'auto');
  assert.equal(dirOf('obligations', 'amount'), undefined);
});
