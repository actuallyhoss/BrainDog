/** A report key for the row a page is about, and the one line that uses it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOLD_WORDS, bindable, bindingOf, curlLine, dayOf, foldedLine, keyFor, organisationOf, setupFolded } from './reporting.ts';

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
  assert.deepEqual(bindable(DATAPOINTS, 'organisations'), { field: 'organisation', source: true, links: ['thing'] });
  assert.deepEqual(bindable(DATAPOINTS, 'things'), { field: 'thing', source: true, links: ['organisation'] });
  assert.equal(bindable(DATAPOINTS, 'people'), null, 'nothing points at people');
  assert.equal(bindable(DATAPOINTS.filter((f) => f.id !== 'at'), 'things'), null, 'a reading with no time is not one');
});

test('the key is bound to the row, to the organisation that lists a project, and to where the number came from', () => {
  assert.deepEqual(bindingOf('thing', 'things#3', { source: true, organisation: 'organisations#1' }), {
    fixed: { thing: 'things#3', organisation: 'organisations#1', source: 'reported' },
    stamp: 'at',
  });
  assert.deepEqual(bindingOf('organisation', 'organisations#2', { source: false }).fixed, { organisation: 'organisations#2' });
  /* A KEY POINTS AT NOTHING BUT ITS ROW: an organisation's key sent `thing: things#4`, another organisation's project,
     and the number landed on that project's page. */
  assert.deepEqual(bindingOf('organisation', 'organisations#2', { source: true, links: ['thing'] }).fixed, {
    thing: null,
    organisation: 'organisations#2',
    source: 'reported',
  });
  assert.deepEqual(bindingOf('thing', 'things#3', { source: false, organisation: null, links: ['organisation'] }).fixed, { organisation: null, thing: 'things#3' });
  assert.deepEqual(bindingOf('thing', 'things#3', { source: false, organisation: 'organisations#1', links: ['organisation'] }).fixed, {
    organisation: 'organisations#1',
    thing: 'things#3',
  });
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

test('setup folds on a lived row and stays open only on a row made today that holds nothing', () => {
  const today = '2026-10-14';
  assert.equal(setupFolded({ keys: 1, readings: 0, madeDay: today, today }), true, 'a live key');
  assert.equal(setupFolded({ keys: 0, readings: 3, madeDay: today, today }), true, 'a reading names it');
  assert.equal(setupFolded({ keys: 0, readings: 0, madeDay: '2026-10-13', today }), true, 'made yesterday');
  assert.equal(setupFolded({ keys: 0, readings: 0, madeDay: null, today }), true, 'a made day not known is lived');
  assert.equal(setupFolded({ keys: 0, readings: 0, madeDay: today, today }), false, 'made today with nothing: setting up is next');
  assert.equal(dayOf(new Date(2026, 9, 9, 23, 30)), '2026-10-09', 'the reader\'s own day');
  assert.equal(dayOf('not a time'), null);
  assert.equal(dayOf(null), null);
});

test('the folded line says what arrives here at one and at many, in words and never an id', () => {
  const now = new Date(2026, 9, 14, 12);
  const at = (d: number, h = 9) => new Date(2026, 9, d, h).toISOString();
  const lines = [
    foldedLine({ keys: 1, lastUsed: at(12), readings: 0, lastReading: null }, now),
    foldedLine({ keys: 2, lastUsed: at(13), readings: 5, lastReading: at(13) }, now),
    foldedLine({ keys: 1, lastUsed: at(14), readings: 0, lastReading: null }, now),
    foldedLine({ keys: 0, lastUsed: null, readings: 3, lastReading: at(9) }, now),
    foldedLine({ keys: 0, lastUsed: null, readings: 1, lastReading: at(9) }, now),
    foldedLine({ keys: 1, lastUsed: null, readings: 0, lastReading: null }, now),
    foldedLine({ keys: 3, lastUsed: null, readings: 0, lastReading: null }, now),
    foldedLine({ keys: 0, lastUsed: null, readings: 0, lastReading: null }, now),
  ];
  assert.deepEqual(lines, [
    'Numbers arrive here with 1 key, last used 2 days ago.',
    'Numbers arrive here with 2 keys, last used yesterday.',
    'Numbers arrive here with 1 key, last used today.',
    '3 numbers arrived here, the last on 9 Oct.',
    '1 number arrived here, on 9 Oct.',
    'A key is ready here and has not been used yet.',
    '3 keys are ready here and none has been used yet.',
    'No numbers are sent here yet.',
  ]);
  assert.equal(foldedLine({ keys: 0, lastUsed: null, readings: 2, lastReading: new Date(2025, 11, 30).toISOString() }, now), '2 numbers arrived here, the last on 30 Dec 2025.');
  assert.equal(foldedLine({ keys: 1, lastUsed: new Date(2026, 7, 1).toISOString(), readings: 0, lastReading: null }, now), 'Numbers arrive here with 1 key, last used on 1 Aug.');
  for (const line of [...lines, FOLD_WORDS.show, FOLD_WORDS.hide]) {
    assert.doesNotMatch(line, /#\d|[0-9A-HJKMNP-TV-Z]{26}|\u2014|\//u, `no id, path or em dash in "${line}"`);
  }
  assert.equal(FOLD_WORDS.show, 'Show how to send numbers');
  assert.equal(FOLD_WORDS.hide, 'Hide');
});
