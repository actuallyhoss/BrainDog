/**
 * The palette's "what it is" rows (`about.ts`): a name typed in the box, answered with what it is and where it was
 * seen, from the record's `about` read.
 *
 * WHAT IS HELD: one thing is one row that opens its address; a name two things share is two rows and neither is
 * picked; an answer of nothing draws nothing, not even a line saying so; and a text under three characters is never
 * asked. The last test holds the panel to the same rules, since a `.svelte` file cannot be imported here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { About } from '@braindog/client';

import { ABOUT_MIN, aboutRows, aboutWords, asksAbout, sentence } from './about.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const TWO_DAYS = '2026-10-12T09:00:00Z';

const northbank: About = {
  is: { kind: 'project', name: 'Northbank', also: [], links: [], seen: [{ at: TWO_DAYS, where: 'Notes: Kickoff' }], register: 'ventures', seq: 3 },
  candidates: [],
};

test('one thing is one row: its name, what it is, where it was seen last and when, opening its address', () => {
  const rows = aboutRows(northbank, 'Northbank', NOW);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row!.title, 'Northbank');
  assert.equal(row!.detail, 'A project. Seen in Notes: Kickoff, 2d ago');
  assert.equal(sentence(row!), 'Northbank, a project. Seen in Notes: Kickoff, 2d ago');
  assert.equal(row!.href, '/r/ventures/3');
  assert.equal(row!.group, aboutWords.group);
});

test('the newest place is the one said, whatever order the answer lists them in', () => {
  const answer: About = {
    is: { ...northbank.is!, seen: [{ at: '2026-09-01T09:00:00Z', where: 'Tasks: Renew the lease' }, { at: TWO_DAYS, where: 'Notes: Kickoff' }] },
    candidates: [],
  };
  assert.equal(aboutRows(answer, 'northbank', NOW)[0]!.detail, 'A project. Seen in Notes: Kickoff, 2d ago');
});

test('a thing seen nowhere says only what it is, and each kind is said in a plain word', () => {
  const of = (kind: 'person' | 'org' | 'project' | 'thing') =>
    aboutRows({ is: { kind, name: 'Vance', also: [], links: [], seen: [], register: 'contacts', seq: 1 }, candidates: [] }, 'Vance', NOW)[0]!.detail;
  assert.equal(of('person'), 'A person');
  assert.equal(of('org'), 'An organisation');
  assert.equal(of('project'), 'A project');
  assert.equal(of('thing'), 'A thing');
});

test('a thing found by another name it goes by says that name, so the row explains why it answered', () => {
  const answer: About = { is: { ...northbank.is!, also: ['NB Tower', 'The bank job'] }, candidates: [] };
  assert.equal(aboutRows(answer, 'nb tower', NOW)[0]!.detail, 'A project, also called NB Tower. Seen in Notes: Kickoff, 2d ago');
  /* TYPED AS ITS OWN NAME, the other names are not recited. */
  assert.equal(aboutRows(answer, 'north', NOW)[0]!.detail, 'A project. Seen in Notes: Kickoff, 2d ago');
});

test('a name two things share is two rows, in the order answered, and neither is picked', () => {
  const answer: About = {
    is: null,
    candidates: [
      { kind: 'person', name: 'Teodor Vance', also: [], seen: ['Notes: Call with Teodor'], register: 'contacts', seq: 4 },
      { kind: 'org', name: 'Vance', also: [], seen: [], register: 'firms', seq: 9 },
    ],
  };
  const rows = aboutRows(answer, 'Vance', NOW);
  assert.deepEqual(
    rows.map((r) => [r.title, r.detail, r.href]),
    [
      ['Teodor Vance', 'A person. Seen in Notes: Call with Teodor', '/r/contacts/4'],
      ['Vance', 'An organisation', '/r/firms/9'],
    ],
  );
  assert.notEqual(rows[0]!.id, rows[1]!.id);
});

test('with one thing meant, the rows that only mention the word are left to the search', () => {
  const answer: About = { ...northbank, candidates: [{ kind: 'thing', name: 'Northbank lease', also: [], seen: [], register: 'holdings', seq: 2 }] };
  assert.deepEqual(aboutRows(answer, 'Northbank', NOW).map((r) => r.title), ['Northbank']);
});

test('many candidates are cut to three: past that it is a search, and the search is already in the panel', () => {
  const candidates = [1, 2, 3, 4, 5].map((seq) => ({ kind: 'project' as const, name: `Site ${seq}`, also: [], seen: [], register: 'ventures', seq }));
  assert.equal(aboutRows({ is: null, candidates }, 'Site', NOW).length, 3);
});

test('an answer of nothing draws no row and no empty state, and so does no answer at all', () => {
  assert.deepEqual(aboutRows({ is: null, candidates: [] }, 'Northbank', NOW), []);
  assert.deepEqual(aboutRows(null, 'Northbank', NOW), []);
  assert.deepEqual(aboutRows(undefined, 'Northbank', NOW), []);
  for (const said of Object.values(aboutWords)) assert.doesNotMatch(said, /nothing|no match|not found/iu, 'the about group has no empty state to say');
});

test('a thing with no number in its list is still said, and opens nothing', () => {
  const answer: About = { is: { ...northbank.is!, seq: null }, candidates: [] };
  assert.equal(aboutRows(answer, 'Northbank', NOW)[0]!.href, null);
});

test('no id, address or dash a person should not read reaches the row', () => {
  const row = aboutRows(northbank, 'Northbank', NOW)[0]!;
  for (const said of [row.title, row.detail, sentence(row)]) {
    assert.doesNotMatch(said, /—/u, 'an em dash');
    assert.doesNotMatch(said, /ventures|#\d/u, "a list's id or a number in it");
  }
});

test('typed text under three characters asks nothing', () => {
  assert.equal(ABOUT_MIN, 3);
  assert.equal(asksAbout({ prefix: null, text: '' }), null);
  assert.equal(asksAbout({ prefix: null, text: 'No' }), null);
  assert.equal(asksAbout({ prefix: null, text: '  No  ' }), null);
  assert.equal(asksAbout({ prefix: null, text: 'Nor' }), 'Nor');
  assert.equal(asksAbout({ prefix: null, text: '  Northbank ' }), 'Northbank');
});

test('only a name is asked about: not a command, a page, a number, a question, a sentence to act on or a pasted page', () => {
  assert.equal(asksAbout({ prefix: '@', text: 'Vance' }), 'Vance');
  assert.equal(asksAbout({ prefix: '>', text: 'Northbank' }), null);
  assert.equal(asksAbout({ prefix: '/', text: 'Northbank' }), null);
  assert.equal(asksAbout({ prefix: '#', text: 'Northbank' }), null);
  assert.equal(asksAbout({ prefix: null, text: 'Which invoices are late?' }), null);
  assert.equal(asksAbout({ prefix: null, text: 'Add to Tasks: buy milk', acting: true }), null);
  assert.equal(asksAbout({ prefix: null, text: 'x'.repeat(201) }), null);
});

test('the panel asks through the rule, after the typing settles, and draws through the mapper', () => {
  const code = readFileSync(new URL('./Palette.svelte', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.match(code, /asksAbout\(/u, 'the panel asks without the rule');
  assert.match(code, /aboutRows\(/u, 'the panel draws without the mapper');
  /* THE READ WAITS FOR A PAUSE, and is dropped when the box moves on (`latest`). */
  assert.match(code, /latest\(\s*\(name: string\)[\s\S]{0,200}\.about\(\{ name \}\)[\s\S]{0,200}ABOUT_WAIT,?\s*\)/u);
  /* THE CLIENT IS LOADED ON THE ASK, never with the panel. */
  assert.doesNotMatch(code, /import \{[^}]*\} from '@braindog\/client'/u);
});

test('a question seen as a place says its money as Needs you does, never the stored code and pence', () => {
  const asked: About = {
    is: { ...northbank.is!, seen: [{ at: TWO_DAYS, where: 'Waiting on you: kiln.example renews in 12 days for GBP 14.00. Keep it?' }] },
    candidates: [],
  };
  const [row] = aboutRows(asked, 'Northbank', NOW);
  assert.doesNotMatch(row!.detail, /GBP 14\.00/u);
  assert.match(row!.detail, /14\. Keep it\?, 2d ago$/u);
});
