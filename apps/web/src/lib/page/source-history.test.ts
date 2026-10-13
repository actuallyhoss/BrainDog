/**
 * A page's history, as the source view lists it: who changed the page and how long ago, newest first, each with a
 * Put back and a Save as a file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { historyWords, versionLines, versionsOf, type PageVersion } from './source-history.ts';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const ME = 'p_01JABCDEFGHJKMNPQRSTVWXYZ0';

const three: PageVersion[] = [
  { version: 1, at: '2026-10-10T09:00:00Z', by: 'system' },
  { version: 3, at: '2026-10-13T10:00:00Z', by: ME, live: true },
  { version: 2, at: '2026-10-12T12:00:00Z', by: 'agent:claude' },
];

test('NEWEST FIRST, each line who and how long ago', () => {
  const lines = versionLines(three, NOW, ME);
  assert.deepEqual(
    lines.map((l) => l.version),
    [3, 2, 1],
  );
  assert.equal(lines[0]?.said, 'You, 2h ago');
  assert.equal(lines[1]?.said, 'Claude, 1d ago');
  assert.equal(lines[2]?.said, 'BrainDog, 3d ago');
});

test('NO ID AND NO RAW TIMESTAMP in anything a line says', () => {
  const lines = versionLines(
    [
      { version: 2, at: '2026-10-13T11:00:00Z', by: '01JABCDEFGHJKMNPQRSTVWXYZ0', live: true },
      { version: 1, at: '2026-10-13T08:00:00Z', by: 'jo@kiln.example' },
    ],
    NOW,
    ME,
  );
  for (const l of lines) {
    const read = [l.said, l.state ?? '', l.putBack ?? '', l.save].join(' ');
    assert.doesNotMatch(read, /[0-9A-HJKMNP-TV-Z]{26}/u, read);
    assert.doesNotMatch(read, /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|@/u, read);
    assert.doesNotMatch(read, /—/u, read);
  }
  assert.equal(lines[0]?.said, 'Someone on this record, 1h ago');
});

test('THE PAGE AS IT IS NOW says so and has no Put back; every earlier one has both', () => {
  const [now, earlier, first] = versionLines(three, NOW, ME);
  assert.equal(now?.state, historyWords.now);
  assert.equal(now?.putBack, null);
  assert.equal(now?.save, 'Save the page as it is now as a file');
  assert.equal(earlier?.state, null);
  assert.equal(earlier?.putBack, 'Put the page back as Claude left it 1d ago');
  assert.equal(earlier?.save, 'Save the page as Claude left it 1d ago as a file');
  assert.equal(first?.putBack, 'Put the page back as BrainDog left it 3d ago');
});

test('A RECORD THAT MARKS NONE LIVE takes the newest as the page now', () => {
  const lines = versionLines([{ version: 1, at: '2026-10-13T08:00:00Z', by: ME }, { version: 2, at: '2026-10-13T09:00:00Z', by: ME }], NOW, ME);
  assert.deepEqual(
    lines.map((l) => l.putBack === null),
    [true, false],
  );
});

test('A NAME THE CALLER HOLDS IS SAID, and nobody is Someone on this record', () => {
  const names = new Map([['p_mara', 'Mara']]);
  const lines = versionLines(
    [
      { version: 2, at: '2026-10-13T11:30:00Z', by: 'p_mara' },
      { version: 1, at: '2026-10-13T11:00:00Z', by: null },
    ],
    NOW,
    ME,
    names,
  );
  assert.equal(lines[0]?.said, 'Mara, 30 min ago');
  assert.equal(lines[1]?.said, 'Someone on this record, 1h ago');
});

test('A TIME THAT DOES NOT READ is left out, never printed as it came', () => {
  const [line] = versionLines([{ version: 1, at: 'not-a-time', by: ME }], NOW, ME);
  assert.equal(line?.said, 'You');
  assert.equal(line?.save, 'Save the page as it is now as a file');
});

test('THE RECORD’S ANSWER IS READ LOOSELY, and what is not a version is dropped', () => {
  assert.deepEqual(versionsOf({ versions: [{ version: 2, at: '2026-10-13T11:00:00Z', who: 'Mara', live: true }, { at: 'x' }, 'no'] }), [
    { version: 2, at: '2026-10-13T11:00:00Z', by: 'Mara', live: true },
  ]);
  assert.deepEqual(versionsOf([{ version: 1, at: '2026-10-13T11:00:00Z', by: null }]), [{ version: 1, at: '2026-10-13T11:00:00Z', by: null }]);
  assert.deepEqual(versionsOf(null), []);
});

test('ONE VERSION IS A PAGE NOBODY HAS CHANGED, and the heading counts the rest', () => {
  assert.equal(historyWords.summary(1), 'This page has not been changed since it was made.');
  assert.equal(historyWords.summary(3), 'Changed 2 times. Put back returns the page to how it was then.');
  assert.equal(historyWords.summary(2), 'Changed once. Put back returns the page to how it was then.');
});

test('WHAT THE RECORD’S OWN READ ANSWERS IS DRAWN AS IT IS: names it wrote out, the reader by the name they go by', () => {
  const body = { title: 'Money' };
  const read = versionsOf({
    page: 'money',
    title: 'Money',
    versions: [
      { version: 3, at: '2026-10-13T10:00:00Z', live: true, by: 'Ada', body },
      { version: 2, at: '2026-10-12T12:00:00Z', live: false, by: 'An agent', body },
      { version: 1, at: '2026-10-10T09:00:00Z', live: false, by: 'An add-on', body },
    ],
  });
  assert.equal(read[0]?.body, body, 'the text is kept for the caller, who saves it and puts it back');
  const lines = versionLines(read, NOW, 'Ada');
  assert.deepEqual(
    lines.map((l) => l.said),
    ['You, 2h ago', 'An agent, 1d ago', 'An add-on, 3d ago'],
  );
  assert.equal(lines[1]?.putBack, 'Put the page back as an agent left it 1d ago');
  assert.equal(lines[2]?.save, 'Save the page as an add-on left it 3d ago as a file');
});
