/** A report key for the row a page is about, and the one line that uses it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindable, bindingOf, curlLine, keyFor, organisationOf } from './reporting.ts';

const DATAPOINTS = [
  { id: 'name', type: 'text' },
  { id: 'value', type: 'decimal' },
  { id: 'unit', type: 'text' },
  { id: 'thing', type: 'ref', to: 'things' },
  { id: 'organisation', type: 'ref', to: 'organisations' },
  { id: 'at', type: 'instant' },
  { id: 'source', type: 'enum', values: ['reported', 'polled', 'typed'] },
];

test('a list takes reported numbers when it has a name, a value and a time, and a field that points at the row', () => {
  assert.deepEqual(bindable(DATAPOINTS, 'organisations'), { field: 'organisation', source: true });
  assert.deepEqual(bindable(DATAPOINTS, 'things'), { field: 'thing', source: true });
  assert.equal(bindable(DATAPOINTS, 'people'), null, 'nothing points at people');
  assert.equal(bindable(DATAPOINTS.filter((f) => f.id !== 'at'), 'things'), null, 'a reading with no time is not one');
});

test('the key is bound to the row, to the organisation that lists a project, and to where the number came from', () => {
  assert.deepEqual(bindingOf('thing', 'things#3', { source: true, organisation: 'organisations#1' }), {
    fixed: { thing: 'things#3', organisation: 'organisations#1', source: 'reported' },
    stamp: 'at',
  });
  assert.deepEqual(bindingOf('organisation', 'organisations#2', { source: false }).fixed, { organisation: 'organisations#2' });
  assert.equal(keyFor({ organisation: 'organisations#2' }, 'organisation', 'organisations#2'), true);
  assert.equal(keyFor({ organisation: 'organisations#1' }, 'organisation', 'organisations#2'), false);
  const orgs = [
    { seq: 1, fields: { projects: ['t_a'] } },
    { seq: 2, fields: { projects: ['t_b', 't_c'] } },
    { seq: 3, fields: { projects: ['t_c'] } },
  ];
  assert.equal(organisationOf(orgs, 't_a'), 'organisations#1');
  assert.equal(organisationOf(orgs, 't_c'), null, 'two organisations list it, so neither is assumed');
});

test('the line is one line, with the key or a placeholder, and the body in single quotes', () => {
  const line = curlLine('https://brain.example', null, '<report key>');
  assert.equal(line, `curl -X POST https://brain.example/api/report -H "Authorization: Bearer <report key>" -H "Content-Type: application/json" -d '{"name":"Sign-ups","value":12}'`);
  assert.doesNotMatch(line, /\n/u);
  assert.match(curlLine('http://127.0.0.1:5931', 'rec_x.fake-secret', '<report key>'), /Bearer rec_x\.fake-secret/u);
});
