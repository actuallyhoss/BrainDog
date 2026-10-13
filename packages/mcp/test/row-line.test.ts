/**
 * A row on one line, as `list` says it: a project's one line cut at 90 characters, and a list of text said as how many.
 *
 * THE OWNER'S WORDS: "one line per project with the one-liner cut to 90 characters and the blocker COUNT". A line cut
 * a text at 48, which is half a one-liner, and said a list of text as its first three items, so a project with three
 * things in the way spent a line's worth of words on them where an agent wanted to know there are three.
 *
 * Nothing here names an add-on: the rule is a text field and a list-of-text field, on any list that declares them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLine, type Decl, type Look } from '../src/brief.ts';

const decl = {
  id: 'things',
  name: 'Projects',
  one: 'project',
  title: 'name',
  state: 'stage',
  mobile: ['name', 'stage', 'one_line', 'in_the_way'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'stage', type: 'enum', values: ['building', 'live'] },
    { id: 'one_line', type: 'text', label: 'One line' },
    { id: 'in_the_way', type: 'list', of: 'text', label: 'In the way' },
    { id: 'helpers', type: 'list', of: 'ref', to: 'people', label: 'Helpers' },
  ],
} as Decl;

const look: Look = { now: Date.UTC(2026, 9, 13), decl: () => decl, title: (spoken) => ({ 'people#1': 'Sam', 'people#2': 'Ada' })[spoken], actor: (by) => by, decider: 'Ada' };

const row = (fields: Record<string, unknown>) => ({ spoken: 'things#1', fields: { name: 'Crumb.gg', stage: 'building', ...fields } });

test('A TEXT IN THE CARD FIELDS IS CUT AT 90, AT A WORD, and one that fits is said whole', () => {
  const fits = 'A recipe site that bakes a shopping list from whatever a person pastes into it';
  assert.ok(fits.length > 48 && fits.length <= 90);
  assert.equal(rowLine(row({ one_line: fits }), 'things', look), `Crumb.gg (things#1) · building · ${fits}`);

  const long = 'A recipe site that bakes a shopping list from whatever a person pastes into it, and then keeps the pantry in step with what was cooked';
  const line = rowLine(row({ one_line: long }), 'things', look);
  const said = line.split(' · ')[2]!;
  assert.ok(said.length <= 90, `the one line ran to ${String(said.length)} characters`);
  assert.ok(said.length > 60, 'a one line cut well short of 90 is the old cut at 48');
  assert.ok(said.endsWith('...'), 'a cut text says it was cut');
  const kept = said.slice(0, -3);
  assert.ok(long.startsWith(kept), 'the cut is the start of the text');
  assert.equal(long[kept.length], ' ', 'the cut falls at a word');
});

test('A LIST OF TEXT IS SAID AS ITS LABEL AND ITS COUNT, never as its items', () => {
  const blockers = ['The domain is still with the old registrar', 'Stripe wants a second document', 'No answer from the baker'];
  const line = rowLine(row({ one_line: 'Recipes into shopping lists', in_the_way: blockers }), 'things', look);
  assert.equal(line, 'Crumb.gg (things#1) · building · Recipes into shopping lists · In the way 3');
  for (const b of blockers) assert.ok(!line.includes(b.slice(0, 12)), `the line said an item: ${b}`);
});

test('A COUNT IS GROUPED, counts only what is written, and an empty list says nothing', () => {
  assert.equal(rowLine(row({ in_the_way: ['One thing'] }), 'things', look), 'Crumb.gg (things#1) · building · In the way 1');
  assert.equal(rowLine(row({ in_the_way: [] }), 'things', look), 'Crumb.gg (things#1) · building');
  assert.equal(rowLine(row({ in_the_way: ['', '  ', 'One thing', null] }), 'things', look), 'Crumb.gg (things#1) · building · In the way 1');
  const many = Array.from({ length: 1200 }, (_, i) => `Thing ${String(i)}`);
  assert.equal(rowLine(row({ in_the_way: many }), 'things', look), 'Crumb.gg (things#1) · building · In the way 1,200');
});

test('A LIST OF ROWS STILL NAMES THEM: the count is for a list of text only', () => {
  const linked = { ...decl, mobile: ['name', 'stage', 'helpers'] } as Decl;
  const at: Look = { ...look, decl: () => linked };
  assert.equal(rowLine(row({ helpers: ['people#1', 'people#2'] }), 'things', at), 'Crumb.gg (things#1) · building · Sam (people#1), Ada (people#2)');
});
