/**
 * A drawn view's write as the frame asks it (add-ons phase 4): `drawnAsk` admits a create or an update only in shape, and
 * an update only of a row the host handed in. What it may write is the record's question (`drawnAct`); this is the door.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAWN_ACT_MOST, drawnAsk, drawnDocument } from './drawn.ts';

const refs = new Set(['films#1']);

test('A CREATE AND AN UPDATE OF A ROW IT WAS HANDED ARE ADMITTED, AS PLAIN JSON', () => {
  assert.deepEqual(drawnAsk({ braindog: 'create', id: 'a1', list: 'films', fields: { name: 'Dune' } }, refs), { act: { id: 'a1', create: { list: 'films', fields: { name: 'Dune' } } } });
  assert.deepEqual(drawnAsk({ braindog: 'update', id: 'a2', ref: 'films#1', patch: { name: 'Dune 2' } }, refs), { act: { id: 'a2', update: { ref: 'films#1', patch: { name: 'Dune 2' } } } });
});

test('EVERY OTHER SHAPE IS DROPPED', () => {
  /* A ROW IT WAS NOT HANDED. */
  assert.equal(drawnAsk({ braindog: 'update', id: 'a1', ref: 'films#9', patch: {} }, refs), null);
  /* NO ID, OR ONE THE BRIDGE DOES NOT MINT. */
  assert.equal(drawnAsk({ braindog: 'create', list: 'films', fields: {} }, refs), null);
  assert.equal(drawnAsk({ braindog: 'create', id: 'x', list: 'films', fields: {} }, refs), null);
  /* A LIST THAT IS NO LIST ID, FIELDS THAT ARE NO MAP, AND A BODY PAST THE MOST. */
  assert.equal(drawnAsk({ braindog: 'create', id: 'a1', list: 'Films; drop', fields: {} }, refs), null);
  assert.equal(drawnAsk({ braindog: 'create', id: 'a1', list: 'films', fields: ['x'] }, refs), null);
  assert.equal(drawnAsk({ braindog: 'create', id: 'a1', list: 'films', fields: { name: 'x'.repeat(DRAWN_ACT_MOST) } }, refs), null);
});

test('THE BRIDGE GIVES THE VIEW braindog.create AND braindog.update, AND THE FRAME STAYS WITHOUT NETWORK', () => {
  const doc = drawnDocument('<p>hi</p>', { data: { list: 'films', columns: [], rows: [] }, theme: { mode: 'light', tokens: {} } });
  assert.match(doc, /create: function \(list, fields\)/u);
  assert.match(doc, /update: function \(ref, patch\)/u);
  assert.match(doc, /connect-src 'none'|default-src 'none'/u);
});
