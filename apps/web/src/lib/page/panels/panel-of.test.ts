/**
 * A host panel is chosen by the name a section gives it, and the two old headings only where no name is given
 * (`panel-of.ts`, contracts §4.3).
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The page reader drew Resume and the report key under a section whose heading was the
 * exact English "Runs on", so renaming the section took both away with no word said. These cases hold the new rule:
 * the key wins, a key naming no panel draws none, and the heading is read only for a section that says nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../../copy.ts';
import { words as actionWords } from '../../record/actions.ts';
import { panelOf } from './panel-of.ts';

test('A SECTION THAT NAMES ITS PANEL GETS THAT PANEL, whatever its heading says', () => {
  assert.equal(panelOf({ kind: 'section', heading: 'What this project runs on', panel: 'actions' } as never), 'actions');
  assert.equal(panelOf({ kind: 'section', heading: 'Numbers', panel: 'reporting' } as never), 'reporting');
  /* RENAMED, AND THE PANEL STAYS: the defect this replaces. */
  assert.equal(panelOf({ kind: 'section', heading: 'Scheduled', panel: 'actions' } as never), 'actions');
});

test('A NAME THAT IS NO PANEL DRAWS NONE, and the heading is not read in its place', () => {
  assert.equal(panelOf({ kind: 'section', heading: actionWords.runsOn, panel: 'constructor' } as never), null);
  assert.equal(panelOf({ kind: 'section', heading: actionWords.runsOn, panel: 3 } as never), null);
});

test('A SECTION WRITTEN BEFORE THE KEY is read by its old heading, and any other section draws nothing', () => {
  assert.equal(panelOf({ kind: 'section', heading: actionWords.runsOn }), 'actions');
  assert.equal(panelOf({ kind: 'section', heading: copy.reportHeading }), 'reporting');
  assert.equal(panelOf({ kind: 'section', heading: 'Keys' }), null);
  assert.equal(panelOf({ kind: 'section' }), null);
});

test('ONLY A SECTION CARRIES A PANEL, so a table headed like one is still a table', () => {
  assert.equal(panelOf({ kind: 'table', heading: actionWords.runsOn }), null);
  assert.equal(panelOf({ kind: 'note', panel: 'actions' } as never), null);
});
