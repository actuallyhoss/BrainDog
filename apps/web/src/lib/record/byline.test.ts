/**
 * Who last changed a row, as the byline it wears: an agent, an app, a rule or Slash, for whom, whether the reader has
 * seen it, and the batch its Undo puts back. Names, never ids.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bylineOf } from './byline.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const AT = '2026-10-06T10:00:00.000Z';

test('an agent’s run is said by its agent and for whom, with the run beside it and never in the line', () => {
  const b = bylineOf({ by: 'agent', who: 'S42', agent: 'claude', app: 'Claude Code · MacBook', for: 'p_owner', at: AT, batch: 'b1' }, 'p_owner', new Map(), NOW);
  assert.equal(b?.said, 'Claude · 2h ago', 'for the reader goes unsaid');
  assert.equal(b?.for, 'you');
  assert.equal(b?.run, 'S42');
  assert.equal(b?.app, 'Claude Code · MacBook');
  assert.ok(!b?.said.includes('S42'));
  const named = bylineOf({ by: 'agent', who: 'S42', agent: 'claude', for: 'p_owner', at: AT }, null, new Map([['p_owner', 'Mara']]), NOW);
  assert.equal(named?.said, 'Claude for Mara · 2h ago');
});

test('a run whose agent the record does not name is An agent, and an id is never a name', () => {
  assert.equal(bylineOf({ who: 'S9', at: AT }, null, new Map(), NOW)?.name, 'An agent');
  assert.equal(bylineOf({ who: 'S9', agent: '01J8Z3K9Q2W4E6R8T0Y2V4X6Z8', at: AT }, null, new Map(), NOW)?.name, 'An agent');
  const b = bylineOf({ who: 'S9', for: 'p_01J8Z3K9', app: '/Users/mara/x', at: AT }, null, new Map(), NOW);
  assert.equal(b?.for, null, 'a person nobody named is left out');
  assert.equal(b?.app, null, 'a path is not where an agent ran');
});

test('Slash, a rule and an app each say their own name; a person, you and the sample carry no byline', () => {
  assert.deepEqual([bylineOf({ who: 'slash', at: AT })?.by, bylineOf({ who: 'slash', at: AT })?.name], ['slash', 'Slash']);
  assert.equal(bylineOf({ who: 'rule:late-reply', at: AT })?.by, 'rule');
  assert.deepEqual([bylineOf({ who: 'ingest:bank-texts', at: AT })?.by, bylineOf({ who: 'ingest:bank-texts', at: AT })?.name], ['app', 'Bank texts']);
  assert.equal(bylineOf({ who: 'p_owner', at: AT }, 'p_owner'), null);
  assert.equal(bylineOf({ who: 'p_member', at: AT }, 'p_owner'), null);
  assert.equal(bylineOf({ who: 'p_seed', at: AT }), null);
  assert.equal(bylineOf({ who: 'slash' }), null, 'a change with no time is not read');
  assert.equal(bylineOf(null), null);
});

test('new to the reader: the record’s word first, then the read mark, and never claimed with neither', () => {
  assert.equal(bylineOf({ who: 'slash', at: AT, unseen: true })?.unseen, true);
  assert.equal(bylineOf({ who: 'slash', at: AT, seen: true })?.unseen, false);
  assert.equal(bylineOf({ who: 'slash', at: AT }, null, new Map(), NOW, '2026-10-06T09:00:00.000Z')?.unseen, true);
  assert.equal(bylineOf({ who: 'slash', at: AT }, null, new Map(), NOW, '2026-10-06T11:00:00.000Z')?.unseen, false);
  assert.equal(bylineOf({ who: 'slash', at: AT })?.unseen, false);
});
