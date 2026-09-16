/**
 * What a `change` or a `pattern` proposal previews on Decide: each page, list, rule or look it would put
 * on the screen, in a person's words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { proposedOf } from './proposed.ts';

test('a page says where it lands in the sidebar and what it shows', () => {
  const out = proposedOf('change', {
    declaration_id: 'page.reading',
    to: {
      id: 'page.reading',
      kind: 'page',
      body: { title: 'Reading list', nav: { section: 'Studies', order: 20 }, requires: ['register.books'], blocks: [{ kind: 'table', heading: 'Still to read' }, { kind: 'stat' }] },
    },
  });
  assert.equal(out?.appears.length, 1);
  const [page] = out!.appears;
  assert.equal(page?.kind, 'Page');
  assert.equal(page?.title, 'Reading list');
  assert.deepEqual(page?.lines, [
    { label: 'In the sidebar', value: 'Under Studies' },
    { label: 'Shows', value: 'Still to read, Stat' },
    { label: 'Reads from', value: 'Books' },
  ]);
});

test('a module is every declaration it installs, and a look carries its accent', () => {
  const out = proposedOf('change', {
    declaration_id: 'register.assignments',
    to: {
      declarations: [
        { id: 'register.assignments', kind: 'register', body: { title: 'Assignments', fields: [{ id: 'due', label: 'Due' }, { id: 'course_name' }] } },
        { id: 'theme.calm', kind: 'theme', body: { seed: { accent: 'oklch(0.62 0.12 160)' }, scheme: 'both' } },
      ],
    },
  });
  assert.deepEqual(out?.appears.map((a) => [a.kind, a.title]), [['List', 'Assignments'], ['Look', 'Calm']]);
  assert.deepEqual(out?.appears[0]?.lines, [{ label: 'Fields', value: 'Due, Course name' }]);
  assert.equal(out?.appears[1]?.accent, 'oklch(0.62 0.12 160)');
});

test('a pattern is the rule it would install, with how many arrivals it was drawn from', () => {
  const out = proposedOf('pattern', { ingest: { ingest: 'card_receipts', channel: 'email', writes: { register: 'obligations' } }, samples: ['r1', 'r2', 'r3'] });
  assert.equal(out?.samples, 3);
  assert.deepEqual(out?.appears[0]?.lines, [
    { label: 'Comes from', value: 'email' },
    { label: 'Files into', value: 'Obligations' },
  ]);
});

test('a choice and a rowset have drawings of their own, and a change with nothing in it previews nothing', () => {
  assert.equal(proposedOf('options', { options: [] }), null);
  assert.equal(proposedOf('rowset', { register: 'things', rows: [] }), null);
  assert.equal(proposedOf('change', { declaration_id: 'x', to: {} }), null);
});
