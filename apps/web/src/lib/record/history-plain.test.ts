/**
 * A person's Activity in plain words: a list of links said by the names it gained and
 * lost, never as the ids it is held as; a list of lines said by what was added; a date said as a day; an edit with no
 * field said as a change.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { linesOf, namedLines, noteOf, type Event } from './history-live.ts';
import type { Names } from './remote.ts';

const at = '2026-10-24T09:00:00.000Z';
const LARKSPUR = '01M3MVSXEM13C7ZD1FWSKZRBHG';
const TIDEWELL = '01M4TWCACV44YMPP2E22RZBVJK';

/** The names a row read hands the page, with the walk's ids: Larkspur is things #4 and Tidewell things #5. */
function walked(): Names {
  const m = new Map([
    ['things#4', 'Larkspur'],
    ['things#5', 'Tidewell'],
  ]);
  Object.defineProperty(m, 'ids', { value: new Map([[`things ${LARKSPUR}`, 4], [`things ${TIDEWELL}`, 5]]), enumerable: false });
  return m as Names;
}

const edit = (field: string, from: unknown, to: unknown): Event => ({ ts: at, actor: 'p_1', kind: 'edit', field, from, to });

/** No id, no raw day, no commit hash, no "set to" of a raw date. */
function plain(line: string): void {
  assert.doesNotMatch(line, /[0-9A-HJKMNP-TV-Z]{26}/u, `an id is printed: ${line}`);
  assert.doesNotMatch(line, /\d{4}-\d{2}-\d{2}/u, `a raw date is printed: ${line}`);
  assert.doesNotMatch(line, /\b[0-9a-f]{7,40}\b/u, `a commit id is printed: ${line}`);
}

test('A LIST OF LINKS THAT GAINED ONE SAYS WHERE IT WAS ADDED, by name: "added this to Tidewell"', () => {
  const line = noteOf('people', edit('projects', [LARKSPUR], [LARKSPUR, TIDEWELL]), walked());
  assert.equal(line, 'added this to Tidewell');
  assert.equal(noteOf('people', edit('projects', [LARKSPUR, TIDEWELL], [LARKSPUR]), walked()), 'took this off Tidewell');
  assert.equal(noteOf('people', edit('projects', [LARKSPUR], [TIDEWELL]), walked()), 'added this to Tidewell and took it off Larkspur');
  assert.equal(noteOf('people', edit('projects', null, [LARKSPUR, TIDEWELL]), walked()), 'added this to Larkspur and Tidewell');
});

test('A LIST OF LINKS NOBODY HAS NAMED YET SAYS HOW MANY, and never the ids: the history is read beside the row', () => {
  for (const register of ['people', 'crewmates']) {
    const one = noteOf(register, edit('projects', [LARKSPUR], [LARKSPUR, TIDEWELL]));
    plain(one);
    assert.match(one, /^added this to /u);
    const two = noteOf(register, edit('projects', [], [LARKSPUR, TIDEWELL]));
    plain(two);
    assert.match(two, /\b2\b/u, 'two links added are counted');
  }
});

test('A LIST OF LINES SAYS WHAT WAS ADDED, the day as a day and a commit as a commit: never "met set to 2026-10-24"', () => {
  const was = ['2026-10-13 · mail from tidewell.example'];
  const line = noteOf('people', edit('met', was, [...was, '2026-10-24 · commit 891072f in larkspur']));
  plain(line);
  assert.doesNotMatch(line, /set to/u);
  assert.match(line, /^added to met: 24 Oct, a commit in larkspur$/u);
  /* Undeclared, the same. */
  const bare = noteOf('crewmates', edit('met', null, ['2026-10-24 · commit 891072f in larkspur']));
  assert.equal(bare, 'added to met: 24 Oct, a commit in larkspur');
  assert.equal(noteOf('people', edit('handles', ['github:wren-hollis'], ['github:wren-hollis', 'vercel:wren-8812'])), 'added to handles: vercel:wren-8812');
  assert.equal(noteOf('people', edit('handles', ['github:wren-hollis', 'vercel:wren-8812'], ['github:wren-hollis'])), 'took off handles: vercel:wren-8812');
});

test('A DAY IS SAID AS A DAY, declared or not', () => {
  for (const register of ['people', 'crewmates']) {
    const set = noteOf(register, edit('in_touch', null, '2026-10-22'));
    const moved = noteOf(register, edit('in_touch', '2026-10-22', '2026-10-24'));
    plain(set);
    plain(moved);
    assert.match(moved, /22 Oct.*24 Oct/u);
  }
});

test('AN EDIT THAT NAMES NO FIELD SAYS IT CHANGED THIS, never the bare word "edit"', () => {
  assert.equal(noteOf('people', { ts: at, actor: 'agent:claude', kind: 'edit', field: null }), 'changed this');
});

test('THE PAGE WORDS ITS LINES AGAIN ONCE THE ROW HAS NAMED ITS LINKS, and a line with its own note keeps it', () => {
  const events: Event[] = [
    edit('projects', [LARKSPUR], [LARKSPUR, TIDEWELL]),
    { ts: at, actor: 'agent:claude', kind: 'note', field: null, note: 'Imported again from Kiln Notes.' },
  ];
  const lines = linesOf('people', events);
  const named = namedLines('people', lines, walked());
  assert.equal(named[1]!.note, 'added this to Tidewell');
  assert.equal(named[0]!.note, 'Imported again from Kiln Notes.');
  assert.deepEqual(namedLines('people', lines, undefined), lines, 'without names, the lines are the lines');
});
