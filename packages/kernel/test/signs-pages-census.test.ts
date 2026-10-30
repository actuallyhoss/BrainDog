/**
 * The sign `pages-clean` with the pages census beside it: the kernel files the four counts with the
 * reading and reads them back, through `signRead` as the record files it, and refuses a count that is not a whole
 * number, or one the sign does not count, with a sentence that names what it does count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { fileSignReading, readSigns, ruleOf, signOf, SIGN_COUNTS } from '../src/signs.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const TZ = 'UTC';
const NOW = Date.UTC(2026, 9, 14, 3);

const RED = {
  state: 'red',
  value: 2,
  said: '1 page shows a block that could not be read: Usage. 1 page prints a path that names nothing: Plan.',
  facts: ['Usage: a block could not be read.', 'Plan prints {{revenue.monthly}}, naming nothing.'],
  counts: { refused_pages: 1, unnamed_pages: 1, missing_pages: 0, suggested_waiting: 2 },
} as const;

test('THE KERNEL FILES THE WIDER READING and reads the four counts back beside its lines', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const filed = k.signRead('pages-clean', RED as never);
  assert.ok(filed.ok, JSON.stringify(filed));
  const page = readSigns(sql, NOW, TZ).find((s) => s.sign === 'pages-clean')!;
  assert.deepEqual([page.state, page.value, page.said, page.facts], ['red', 2, RED.said, [...RED.facts]]);
  assert.deepEqual(page.counts, RED.counts);
  /* The counts live in the row's own list, the one entry that is not a line, so the table needs no new column. */
  const kept = JSON.parse(sql.one<{ facts: string }>("SELECT facts FROM sign_reading WHERE sign = 'pages-clean'")!.facts) as unknown[];
  assert.deepEqual(kept.at(-1), { counts: RED.counts });
  /* Through the kernel's own `signs` too, as Health reads it. */
  const read = k.signs();
  assert.ok(read.ok);
  assert.deepEqual(read.value.signs.find((s) => s.sign === 'pages-clean')?.counts, RED.counts);
  sql.close();
});

test('A READING WITHOUT COUNTS reads as it always did, with no counts on it', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  assert.ok(fileSignReading(sql, 'pages-clean', { state: 'green', value: 0, said: 'All 4 pages read print clean: headings and notes.' }, NOW, TZ).ok);
  const page = readSigns(sql, NOW, TZ).find((s) => s.sign === 'pages-clean')!;
  assert.equal(page.state, 'green');
  assert.deepEqual(page.facts, []);
  assert.equal('counts' in page, false);
  assert.equal(sql.one<{ facts: string }>("SELECT facts FROM sign_reading WHERE sign = 'pages-clean'")!.facts, '[]');
  sql.close();
});

test('A MALFORMED COUNT IS REFUSED with a sentence, and nothing is filed', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const file = (counts: unknown) => fileSignReading(sql, 'pages-clean', { ...RED, counts } as never, NOW, TZ);
  const fix = (r: ReturnType<typeof file>) => (r.ok ? 'ok' : 'refusal' in r ? `${r.refusal.code} ${r.refusal.fix}` : 'conflict');
  assert.equal(fix(file({ ...RED.counts, refused_pages: 1.5 })), 'VALUE_MALFORMED How many pages show a block that could not be read is a whole number of nought or more.');
  assert.equal(fix(file({ ...RED.counts, unnamed_pages: -1 })), 'VALUE_MALFORMED How many pages print a path that names nothing is a whole number of nought or more.');
  assert.equal(fix(file({ ...RED.counts, missing_pages: '2' })), 'VALUE_MALFORMED How many pages this BrainDog does not hold is a whole number of nought or more.');
  assert.match(fix(file({ dashes: 3 })), /^VALUE_MALFORMED "dashes" is not something Pages draw without errors counts\. It counts refused_pages/);
  assert.match(fix(file([1, 2, 3, 4])), /^VALUE_MALFORMED Pages draw without errors counts are whole numbers by name/);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM sign_reading WHERE sign = 'pages-clean'")?.n, 0, 'a refused filing was kept');
  /* A sign with no counts of its own takes none. */
  const other = fileSignReading(sql, 'model-answers', { state: 'green', value: 0, said: 'The model answered.', counts: { refused_pages: 0 } }, NOW, TZ);
  assert.equal(other.ok ? 'ok' : 'refusal' in other ? other.refusal.code : 'conflict', 'VALUE_MALFORMED');
  /* A count may be left out when nobody counted it. */
  assert.equal(fix(file({ refused_pages: 0, unnamed_pages: 0, missing_pages: 0 })), 'ok');
  sql.close();
});

test('THE COUNTS ARE A CLOSED LIST, and the rule of the sign moved with them', () => {
  assert.deepEqual(Object.keys(SIGN_COUNTS), ['pages-clean']);
  assert.deepEqual(Object.keys(SIGN_COUNTS['pages-clean']!), ['refused_pages', 'unnamed_pages', 'missing_pages', 'suggested_waiting']);
  const s = signOf('pages-clean')!;
  assert.equal(s.version, 2);
  assert.notEqual(ruleOf(s), ruleOf({ ...s, version: 1 }));
});
