/**
 * THE `signs` PAGE SOURCE: each vital sign as a row, its id, name, state, number and its own sentence,
 * read through `PageDeps.signs`, which the record wires to `readSigns`. Health is drawn from it.
 *
 * A sign with nothing to read is `none`, never green: one the record reads `none` stays `none`, and a state out of shape
 * from a host is read as `none` with no number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

/* `pages.ts` FIRST: read through `index.ts` first, the kernel's modules meet `flow-lint.ts` before it is ready today. */
import { readBlock, readPage, registersOfBlock, WHOLE_RECORD, type PageBlock, type PageDeps } from '../src/pages.ts';
import { openRecord } from '../src/index.ts';
import type { VitalSign } from '../src/signs.ts';
import { foldUnfiled, NEVER_FILED } from '../src/sources/signs.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 7);

const sign = (id: string, name: string, state: VitalSign['state'], value: number | null, said: string): VitalSign => ({
  sign: id,
  name,
  state,
  value,
  said,
  facts: [],
  days: [],
});

const RED = sign('arrivals-filed', 'Arrivals file by themselves', 'red', 7, '7 bank texts have waited more than a day.');
const GREEN = sign('oldest-question', 'No question waits too long', 'green', 3, 'The oldest question has waited 3 days.');
const NONE = sign('model-answers', 'The model answers', 'none', null, 'Nothing has been filed for this sign yet.');

function depsWith(signs: readonly VitalSign[] | null): PageDeps {
  return {
    pages: () => [{ page: 'health', title: 'Health', blocks: [{ kind: 'table', source: 'signs', columns: [{ field: 'name' }, { field: 'state' }, { field: 'said' }] }] }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    ...(signs ? { signs: () => signs } : {}),
  };
}

const TABLE: PageBlock = { kind: 'table', source: 'signs', columns: [{ field: 'name' }, { field: 'state' }, { field: 'value' }, { field: 'said' }] };

test('A RED, A GREEN AND A NONE SIGN EACH READ AS THEMSELVES, in the order of the closed list, with their own sentences', () => {
  const read = readBlock(depsWith([RED, GREEN, NONE]), TABLE);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.matched, 3);
  assert.deepEqual(
    read.rows.map((r) => r.fields),
    [
      { sign: 'arrivals-filed', name: 'Arrivals file by themselves', state: 'red', value: 7, said: '7 bank texts have waited more than a day.' },
      { sign: 'oldest-question', name: 'No question waits too long', state: 'green', value: 3, said: 'The oldest question has waited 3 days.' },
      { sign: 'model-answers', name: 'The model answers', state: 'none', value: null, said: 'Nothing has been filed for this sign yet.' },
    ],
  );
  assert.deepEqual(read.rows.map((r) => r.state), ['red', 'green', 'none'], 'the state is the row’s own, as an action’s is');
  assert.deepEqual(read.rows.map((r) => r.seq), [null, null, null], 'a sign is no list’s row');
});

test('A SIGN WITH NOTHING TO READ IS NONE, NEVER GREEN: a state out of shape reads none, and so loses its number', () => {
  const odd = { ...GREEN, sign: 'runs-true', state: 'amber' as never, value: 4 };
  const read = readBlock(depsWith([odd]), TABLE);
  assert.equal(read.rows[0]?.fields.state, 'none');
  assert.equal(read.rows[0]?.fields.value, null);
});

test('WHERE NARROWS BY STATE, and the count is of what matched', () => {
  const read = readBlock(depsWith([RED, GREEN, NONE, { ...RED, sign: 'pages-clean', name: 'Pages draw without errors' }]), { ...TABLE, where: 'state is red', limit: 1 });
  assert.deepEqual(read.refusals, []);
  assert.deepEqual(read.rows.map((r) => r.fields.name), ['Arrivals file by themselves']);
  assert.equal(read.matched, 2, 'two red, one drawn under the limit');
});

test('A COLUMN A SIGN DOES NOT HAVE, AN ORDER, AND A HOST THAT READS NO SIGNS ARE EACH SAID, not drawn empty', () => {
  const bad = readBlock(depsWith([RED]), { ...TABLE, columns: [{ field: 'colour' }] });
  assert.equal(bad.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.deepEqual(bad.refusals[0]?.allowed, ['sign', 'name', 'state', 'value', 'said', 'to']);
  const ordered = readBlock(depsWith([RED]), { ...TABLE, order: [{ field: 'state' }] });
  assert.equal(ordered.refusals[0]?.code, 'DECLARATION_INVALID');
  const unwired = readBlock(depsWith(null), TABLE);
  assert.equal(unwired.refusals[0]?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(unwired.refusals[0]?.fix ?? '', /—/);
});

test('A PAGE DRAWN FROM SIGNS SAYS EACH ONE, and the block reads across the whole record', () => {
  const page = readPage(depsWith([RED, GREEN, NONE]), 'health');
  assert.ok(page.ok, JSON.stringify(page));
  const block = page.value.blocks[0]!;
  assert.notEqual(block.drawn, false);
  assert.deepEqual(block.rows.map((r) => r.fields.state), ['red', 'green', 'none']);
  assert.deepEqual(registersOfBlock({ kind: 'table', source: 'signs' }), [WHOLE_RECORD], 'a member held from the record is held from its signs');
});

test('THROUGH A REAL RECORD: the record’s own signs read through the source, each with a name and a sentence', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const signs = k.signs();
  assert.ok(signs.ok, JSON.stringify(signs));
  const read = readBlock(depsWith(signs.value.signs), TABLE);
  assert.deepEqual(read.refusals, []);
  /* THE SIGNS NOTHING WAS EVER FILED FOR ARE ONE ROW (recheck of 30 October): every other sign is its own. */
  const never = signs.value.signs.filter((s) => s.state === 'none' && s.said === NEVER_FILED);
  assert.equal(read.rows.length, signs.value.signs.length - (never.length > 1 ? never.length - 1 : 0));
  for (const r of read.rows) {
    assert.ok(['green', 'red', 'none'].includes(String(r.fields.state)));
    assert.ok(String(r.fields.name).trim() !== '', 'a person reads a name');
    assert.ok(String(r.fields.said).trim() !== '', 'and the sign’s own sentence');
  }
  /* A RECORD NOBODY HAS FILED FOR: the signs the record and the host file read none, never green, said once together. */
  const folded = read.rows.find((r) => r.fields.sign === 'never-filed');
  assert.equal(folded?.fields.state, 'none');
  assert.match(String(folded?.fields.name), /^\d+ checks with nothing filed yet$/u);
  assert.match(String(folded?.fields.said), /The model answers/u);
  assert.equal(read.rows.filter((r) => r.fields.said === NEVER_FILED).length, 0, 'the sentence is never said once a sign');
  sql.close();
});

test('TWO OR MORE SIGNS NOTHING WAS FILED FOR FOLD INTO ONE LINE, where the first stood; one alone keeps its own', () => {
  const other = { ...NONE, sign: 'tools-listed', name: 'Agents get the tool list' };
  const read = readBlock(depsWith([RED, NONE, GREEN, other]), TABLE);
  assert.deepEqual(read.rows.map((r) => r.fields.sign), ['arrivals-filed', 'never-filed', 'oldest-question']);
  assert.equal(read.rows[1]!.fields.name, '2 checks with nothing filed yet');
  assert.equal(read.rows[1]!.fields.said, 'Nothing has been filed yet for The model answers and Agents get the tool list.');
  assert.deepEqual(foldUnfiled(readBlock(depsWith([NONE]), TABLE).rows).map((r) => r.fields.sign), ['model-answers']);
});
