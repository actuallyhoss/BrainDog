/**
 * A host panel is chosen by the name a section gives it, and by nothing else (`panel-of.ts`).
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The page reader drew Resume and the report key under a section whose heading was the
 * exact English "Runs on", so renaming the section took both away with no word said. These cases hold the rule: the
 * key wins, a key naming no panel draws none, and a heading is never read, since every first-party section names its
 * panel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { panelOf } from './panel-of.ts';

/* THE TWO HEADINGS THE READER ONCE MATCHED, written out here so a case holds them to drawing nothing. */
const RUNS_ON = 'Runs on';
const SEND_NUMBERS = 'Send numbers here';

test('A SECTION THAT NAMES ITS PANEL GETS THAT PANEL, whatever its heading says', () => {
  assert.equal(panelOf({ kind: 'section', heading: 'What this project runs on', panel: 'actions' } as never), 'actions');
  assert.equal(panelOf({ kind: 'section', heading: 'Numbers', panel: 'reporting' } as never), 'reporting');
  /* RENAMED, AND THE PANEL STAYS: the defect this replaces. */
  assert.equal(panelOf({ kind: 'section', heading: 'Scheduled', panel: 'actions' } as never), 'actions');
});

test('A NAME THAT IS NO PANEL DRAWS NONE, and the heading is not read in its place', () => {
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON, panel: 'constructor' } as never), null);
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON, panel: 3 } as never), null);
});

test('A SECTION THAT NAMES NO PANEL DRAWS NONE, even under a heading the reader once matched', () => {
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON }), null);
  assert.equal(panelOf({ kind: 'section', heading: SEND_NUMBERS }), null);
  assert.equal(panelOf({ kind: 'section', heading: 'Keys' }), null);
  assert.equal(panelOf({ kind: 'section' }), null);
});

test('ONLY A SECTION CARRIES A PANEL, so a table headed like one is still a table', () => {
  assert.equal(panelOf({ kind: 'table', heading: RUNS_ON, panel: 'actions' } as never), null);
  assert.equal(panelOf({ kind: 'note', panel: 'actions' } as never), null);
});
