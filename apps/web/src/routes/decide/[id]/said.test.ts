/**
 * What a question changes, in sentences: each group of what appears is one sentence of its own, where it was
 * a heading over a grid of labels ("Pages / Lists / Measures"), and what has more to show than words stays the preview's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appearsSaid } from './arranged.ts';

test('EACH GROUP OF WHAT APPEARS IS ONE SENTENCE, and what has more to show than words stays the preview’s', () => {
  const group = {
    kind: 'Adds',
    title: '',
    lines: [
      { label: 'Pages', value: 'Profiles' },
      { label: 'Lists', value: 'Profiles, Places' },
      { label: 'Measures', value: 'Profiles out of step, Profiles near limit' },
    ],
  };
  assert.deepEqual(appearsSaid(group), [
    'Adds a page, Profiles.',
    'Adds 2 lists, Profiles and Places.',
    'Adds 2 measures, Profiles out of step and Profiles near limit.',
  ]);
  assert.deepEqual(appearsSaid({ kind: 'Also adds', title: '', lines: [{ label: 'Rules', value: 'Place quiet' }] }), ['Adds a rule, Place quiet.']);
  assert.deepEqual(appearsSaid({ kind: 'Adds to a list', title: 'Profiles adds 1 field to Skills: Profiles', lines: [] }), ['Profiles adds 1 field to Skills: Profiles.']);
  assert.equal(appearsSaid({ kind: 'New page', title: 'Profiles', lines: [{ label: 'Shows', value: 'A table' }], page: {} }), null);
  assert.equal(appearsSaid({ kind: 'Look', title: 'Dusk', lines: [], accent: '#123456' }), null);
  for (const line of appearsSaid(group) ?? []) assert.doesNotMatch(line, /—/u);
});

test('THE QUESTION’S OWN PAGE SAYS THEM, and hands the preview only what it could not say', () => {
  const arranged = readFileSync(new URL('./Arranged.svelte', import.meta.url), 'utf8');
  assert.match(arranged, /\{@const said = p\.appears\.map\(appearsSaid\)\}/u);
  assert.match(arranged, /appears: p\.appears\.filter\(\(_, i\) => said\[i\] === null\)/u);
});
