/**
 * `people.ts` `seenOf`: where a person was seen, said in words, with no id and no address left in them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keySaid, seenOf } from './people.ts';

test('A BANK TEXT OR AN IMPORT names no address: the address and the bracket it sat in are taken out', () => {
  const seen = seenOf(['2026-09-02 · paid by jo@kiln.example', '2026-09-03 · imported from contacts (jo.bell+work@kiln.example)', 'met at Kiln <jo@kiln.example>']);
  assert.deepEqual(
    seen.map((s) => s.where),
    ['Imported from contacts', 'Paid', 'Met at Kiln'],
  );
  for (const s of seen) assert.ok(!s.where.includes('@'), s.where);
});

test('A MAIL’S SUBJECT names no address either, and an id still goes as before', () => {
  const [mail] = seenOf(['2026-09-04 · mail: Invoice for jo@kiln.example']);
  assert.equal(mail?.kind, 'mail');
  assert.deepEqual(mail?.about, ['Invoice']);
  const [other] = seenOf(['asked about tasks#4 by mailto:jo@kiln.example']);
  assert.equal(other?.where, 'Asked');
});

test('ONLY BRACKETS THE STRIP EMPTIED GO: a subject’s own empty brackets stay as written', () => {
  const [mail] = seenOf(['2026-09-04 · mail: Fix parse() crash (jo@kiln.example)']);
  assert.deepEqual(mail?.about, ['Fix parse() crash']);
});

test('A HANDLE IN KNOWN BY KEEPS ITS ADDRESS: that is how the person is known there', () => {
  assert.deepEqual(keySaid('mastodon:jo@social.example'), { label: 'Mastodon', value: 'jo@social.example' });
  assert.deepEqual(keySaid('mastodon:@jo@social.example'), { label: 'Mastodon', value: '@jo@social.example' });
});
