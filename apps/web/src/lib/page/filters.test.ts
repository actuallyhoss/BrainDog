/**
 * A declared page's filters, the host's half (`filters.ts`): the strip's choices read off the record's answer, and the
 * choice kept in the address.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterOf, filterQuery, filtersOf, sameFilter } from './filters.ts';

test('THE STRIP IS READ OFF THE ANSWER, a row number spelt as its digits, none kept as a choice, and a shape it cannot read draws nothing', () => {
  const page = {
    page: 'work',
    filters: [
      {
        field: 'thing',
        label: 'Project',
        control: 'chips',
        chosen: null,
        values: [
          { value: 12, label: 'Kiln', count: 4 },
          { value: 'none', label: '', count: 1 },
          { value: '', label: 'No project', count: 2 },
          { value: '', label: '' },
          { value: null, label: 'nothing to match' },
        ],
      },
      { field: '', values: [] },
      'not a filter',
    ],
  };
  assert.deepEqual(filtersOf(page), [
    {
      field: 'thing',
      label: 'Project',
      control: 'chips',
      values: [
        { value: '12', label: 'Kiln', count: 4 },
        { value: 'none', label: 'none', count: 1 },
        { value: '', label: 'No project', count: 2 },
      ],
    },
  ]);
  assert.deepEqual(filtersOf({ filters: 'all of them' }), []);
  assert.deepEqual(filtersOf(null), []);
});

test('THE ADDRESS HOLDS THE CHOICE, one key a field, and everything else it says is kept', () => {
  const at = new URLSearchParams('src=0&f.thing=12&f.state=');
  assert.deepEqual(filterOf(at), { thing: '12', state: '' }, 'an empty value is the choice of none, as the kernel reads it');
  assert.equal(filterQuery(at, 'thing', '7'), 'src=0&f.thing=7&f.state=');
  assert.equal(filterQuery(new URLSearchParams('f.thing=12'), 'thing', null), '', 'letting the only choice go leaves a bare address');
  assert.equal(filterQuery(new URLSearchParams('src=0'), 'tier', 'top'), 'src=0&f.tier=top');
  assert.deepEqual(filterOf(new URLSearchParams(filterQuery(new URLSearchParams(), 'thing', ''))), { thing: '' }, '"No project" survives the address');
});

test('A CHOICE IS THE SAME CHOICE whatever order its fields were set in', () => {
  assert.equal(sameFilter({ a: '1', b: '2' }, { b: '2', a: '1' }), true);
  assert.equal(sameFilter({ a: '1' }, { a: '1', b: '2' }), false);
  assert.equal(sameFilter({}, {}), true);
});
