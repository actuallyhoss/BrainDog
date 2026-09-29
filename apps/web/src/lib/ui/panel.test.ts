import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formOf, step } from './panel.ts';

test('a narrow window gets a bottom sheet, and a wide one the docked panel', () => {
  assert.equal(formOf(true), 'sheet');
  assert.equal(formOf(false), 'docked');
});

test('opening shows the docked panel without a modal, and the sheet with one', () => {
  assert.equal(step({ open: true, form: 'docked' }, { open: false, modal: false }), 'show');
  assert.equal(step({ open: true, form: 'sheet' }, { open: false, modal: false }), 'showModal');
});

test('an open panel in the form asked for is left alone', () => {
  assert.equal(step({ open: true, form: 'docked' }, { open: true, modal: false }), null);
  assert.equal(step({ open: true, form: 'sheet' }, { open: true, modal: true }), null);
});

test('crossing 900px while open reopens it in the other form rather than closing it', () => {
  assert.equal(step({ open: true, form: 'sheet' }, { open: true, modal: false }), 'reopen');
  assert.equal(step({ open: true, form: 'docked' }, { open: true, modal: true }), 'reopen');
});

test('closing closes whichever form is open, and a closed panel stays closed', () => {
  assert.equal(step({ open: false, form: 'docked' }, { open: true, modal: false }), 'close');
  assert.equal(step({ open: false, form: 'sheet' }, { open: true, modal: true }), 'close');
  assert.equal(step({ open: false, form: 'sheet' }, { open: false, modal: false }), null);
});
