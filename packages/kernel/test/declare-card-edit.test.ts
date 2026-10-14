/**
 * `edit: true` on a card's column (PGS-C15): the line is typed on in place where the page can write. Checked where the
 * page is installed: a card's, naming one field, on a line drawn as words, and refused otherwise in a sentence that says
 * what to change.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate, type Declaration, type Known } from '../src/declare.ts';
import type { Json } from '../src/coerce.ts';

const page = (columns: Record<string, unknown>[], kind = 'cards'): Declaration => ({
  id: 'page.work',
  kind: 'page',
  body: { page: 'work', title: 'Work', blocks: [{ kind, source: 'register.projects', columns }] } as never,
});

const KNOWN: Known = new Map<string, Record<string, Json>>([
  [
    'register.projects',
    {
      id: 'projects',
      fields: [
        { id: 'name', type: 'text' },
        { id: 'about', type: 'text', max: 120 },
        { id: 'earned', type: 'int' },
      ],
    },
  ],
]);

const at = (d: Declaration, known?: Known) => {
  const r = validate(d, known);
  return r && [r.code, r.at];
};

test("EDIT ON A CARD'S TEXT LINE INSTALLS, as the reply under the name, a fact, the title or the next step", () => {
  assert.equal(validate(page([{ field: 'name', as: 'title' }, { field: 'about', as: 'reply', edit: true }]), KNOWN), null);
  assert.equal(validate(page([{ field: 'name', as: 'title', edit: true }, { field: 'about', edit: true }]), KNOWN), null, 'a column with no role is a fact');
  assert.equal(validate(page([{ field: 'about', as: 'fact', edit: true }, { field: 'name', as: 'next', edit: true }])), null, 'with no record to ask, the shape is all that is checked');
  assert.equal(validate(page([{ field: 'about', edit: false }], 'table'), KNOWN), null, 'edit: false says nothing, on any kind');
});

test('EDIT ON A TABLE IS REFUSED, since only a card reads it', () => {
  const d = page([{ field: 'name' }, { field: 'about', edit: true }], 'table');
  assert.deepEqual(at(d, KNOWN), ['DECLARATION_INVALID', 'blocks[0]']);
  assert.match(validate(d, KNOWN)!.fix, /only a card's line reads\. Take edit: off, or draw the block as cards\./u);
});

test('EDIT ON A TREND IS REFUSED, whether it reads a figure or a field', () => {
  const metric = page([{ field: 'name', as: 'title' }, { metric: 'project-done-by-week:{{name}}', as: 'trend', edit: true }]);
  assert.deepEqual(at(metric, KNOWN), ['DECLARATION_INVALID', 'blocks[0]']);
  assert.match(validate(metric, KNOWN)!.fix, /a trend is a figure the record works out, never typed\. Take edit: off the trend\./u);
  const field = page([{ field: 'name', as: 'title' }, { field: 'earned', as: 'trend', edit: true }]);
  assert.deepEqual(at(field, KNOWN), ['DECLARATION_INVALID', 'blocks[0]']);
  assert.match(validate(field, KNOWN)!.fix, /only a line drawn as words is typed on: title, fact, reply, next\./u);
  assert.deepEqual(validate(field, KNOWN)!.allowed, ['title', 'fact', 'reply', 'next']);
});

test("EDIT ON A CARD'S FIGURE, AND ON THE OTHER LINES NOT DRAWN AS WORDS, IS REFUSED", () => {
  for (const as of ['figure', 'ring', 'hue', 'picture', 'mark', 'who', 'when', 'scope']) {
    const d = page([{ field: 'name', as: 'title' }, { field: 'earned', as, edit: true }]);
    assert.deepEqual(at(d, KNOWN), ['DECLARATION_INVALID', 'blocks[0]'], as);
    assert.match(validate(d, KNOWN)!.fix, new RegExp(`as "${as}" edit: true`, 'u'), as);
  }
});

test('EDIT WITH A SECOND FIELD, WITH NO FIELD, OR SAID AS ANYTHING BUT YES OR NO IS REFUSED', () => {
  const or = validate(page([{ field: 'about', or: 'name', as: 'reply', edit: true }]), KNOWN)!;
  assert.equal(or.code, 'DECLARATION_INVALID');
  assert.match(or.fix, /could be either field\. Take the or: off, or edit: off\./u);
  const none = validate(page([{ as: 'reply', edit: true }]), KNOWN)!;
  assert.equal(none.code, 'DECLARATION_INVALID');
  assert.match(none.fix, /Name the field with field:\./u);
  const said = validate(page([{ field: 'about', as: 'reply', edit: 'yes' }]), KNOWN)!;
  assert.equal(said.code, 'DECLARATION_INVALID');
  assert.match(said.fix, /edit is true or false\. Write edit: true\./u);
});
