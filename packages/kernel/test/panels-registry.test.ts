/**
 * The host panels are one table (`kinds/words.ts` `PANEL_TABLE`), and what a panel is about decides where it stands.
 *
 * WHAT WAS WRONG BEFORE THIS FILE. Every panel was about one row, so `panelFault` refused any panel on a page about no
 * row, and an existing screen part about the whole record (the look editor, the model Slash uses) could not be placed
 * on a declared page at all. These cases hold the new rule: a panel that needs no row installs on a plain page, one
 * that needs a row is still refused there, and a name that is none of them is refused with all six named.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { PANEL_TABLE, PANELS, panelFault } from '../src/kinds/words.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

/* AN INVENTED PAGE ABOUT NO ROW: no `for:`, one section naming a panel. */
const plainPage = (panel: string): Declaration => ({
  id: 'page.studio',
  kind: 'page',
  body: { page: 'studio', title: 'Studio', blocks: [{ kind: 'section', heading: 'How it looks', panel }] } as never,
});

test('THE LOOK EDITOR INSTALLS ON A PLAIN PAGE, since it is about the record and no row', async () => {
  assert.equal(validateDeclaration(plainPage('look-editor')), null);
  assert.equal(validateDeclaration(plainPage('slash-model')), null);
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([plainPage('look-editor')]);
  assert.ok(out.ok, JSON.stringify(out));
});

test("ACTIONS ARE STILL REFUSED ON A PAGE ABOUT NO ROW, since they are one row's", () => {
  const astray = validateDeclaration(plainPage('actions'));
  assert.ok(astray, 'a panel about one row has no row to be about');
  assert.match(astray.fix, /about no row/);
  assert.equal(panelFault('seen', false)?.at, 'panel');
  assert.equal(panelFault('look-editor', false), null);
  assert.equal(panelFault('look-editor', true), null, 'a page per row may hold it too');
});

test('A NAME THAT IS NO PANEL IS REFUSED, naming all six', () => {
  const odd = panelFault('mood-board', null);
  assert.ok(odd);
  assert.equal(odd.code, 'DECLARATION_INVALID');
  assert.deepEqual([...(odd.allowed ?? [])], ['actions', 'reporting', 'run', 'seen', 'look-editor', 'slash-model']);
  for (const name of PANELS) assert.ok(odd.fix.includes(name), `the sentence names ${name}`);
  /* A KEY OF EVERY OBJECT IS NO PANEL. */
  assert.ok(panelFault('constructor', null));
});

test('EVERY PANEL SAYS WHAT IT IS ABOUT, WHO IT IS FOR AND WHAT IT IS', () => {
  assert.deepEqual([...PANELS], Object.keys(PANEL_TABLE));
  for (const name of PANELS) {
    const entry = PANEL_TABLE[name];
    assert.ok(entry.needs === 'row' || entry.needs === 'none', name);
    assert.ok(['read', 'write', 'owner'].includes(entry.level), name);
    assert.ok(entry.says.trim().length > 0 && !entry.says.includes('—'), `${name} says a plain line`);
  }
  assert.equal(PANEL_TABLE['look-editor'].level, 'owner');
  assert.equal(PANEL_TABLE.actions.needs, 'row');
});
