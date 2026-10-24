/**
 * The watch on his Mac (`tools/watch/mac.mjs`): the launchd job it writes, and what a run's notice says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LABEL, noticeOf, plistText } from './mac.mjs';

test('THE JOB RUNS THIS CHECKOUT EVERY HOUR AND ONCE AT LOAD, with this node', () => {
  const xml = plistText({ node: '/n/node', root: '/r & co' });
  assert.ok(xml.includes(`<string>${LABEL}</string>`));
  assert.ok(xml.includes('<string>/n/node</string>\n    <string>/r &amp; co/tools/watch/mac.mjs</string>\n    <string>run</string>'), xml);
  assert.ok(xml.includes('<key>StartInterval</key>\n  <integer>3600</integer>'));
  assert.ok(xml.includes('<key>RunAtLoad</key>\n  <true/>'));
});

const lines = (miss) => [
  '',
  '  watch: brain.dog, from outside, read-only',
  ...(miss ? ['  MISS  2  https://brain.dog/healthz is 200 with ok', '           answered 503'] : ['  ok    2  https://brain.dog/healthz is 200 with ok']),
  '  this is the first watch on this Mac',
  `  watch: brain.dog, ${miss ? 1 : 0} missed`,
];

test('A MISS IS A NOTICE WITH THE FIRST MISS IN IT; A CALM HOUR SAYS NOTHING, AND THE HOUR AFTER A MISS SAYS IT IS BACK', () => {
  assert.deepEqual(noticeOf(lines(true), 1, null), { title: 'brain.dog: 1 missed', body: '2  https://brain.dog/healthz is 200 with ok: answered 503' });
  assert.equal(noticeOf(lines(false), 0, null), null);
  assert.equal(noticeOf(lines(false), 0, { missed: false }), null);
  assert.equal(noticeOf(lines(false), 0, { missed: true }).title, 'brain.dog is back');
  assert.equal(noticeOf(['  watch: no PUBLIC_HOST'], 1, null).body, 'the watch could not run');
});
