/**
 * `<id>.test.json`, a pack's own test, read and run in a scratch record:
 *
 *   { "rows":   [ { "list": "items", "fields": { "name": "Paint the fence" } } ],
 *     "expect": [ { "list": "items", "count": 3 },
 *                 { "figure": "open-items", "value": 3 },
 *                 { "row": 1, "field": "state", "is": "open" } ] }
 *
 * ROWS ARE WRITTEN AS A PERSON WRITES THEM, through the record's write path with its rules running, after the pack and
 * its example rows are installed. So a count counts the pack's example rows too, and a field a rule fills or a default
 * sets is read back as the record kept it.
 *
 * `row` IS COUNTED FROM ONE, the way a person counts the rows they wrote: `"row": 1` is the first row in `rows`.
 *
 * EVERY EXPECTATION IS SAID, passed or failed, rather than stopping at the first failure, because the author fixing one
 * wants to see the others in the same run. A row the record refuses is said with its code and stops the run: every
 * expectation after it would be about a record the test did not describe.
 */

import { isDeepStrictEqual } from 'node:util';

import type { Json } from '@braindog/kernel';
import { no, ok, type Result } from '@braindog/ports';

import { oneLine } from './clip.ts';
import { readFigure, type Scratch } from './scratch.ts';

export type TestRow = { list: string; fields: Record<string, Json> };

export type Expectation = { list: string; count: number } | { figure: string; value: number | null } | { row: number; field: string; is: Json };

export type PackTest = { rows: TestRow[]; expect: Expectation[] };

/** The file beside a pack that holds its test: `<id>.test.json`. */
export const testFileName = (id: string): string => `${id}.test.json`;

/** The most rows and expectations one test file holds, so a test is a test and not a second import. */
export const TEST_ROWS_MOST = 500;
export const TEST_EXPECT_MOST = 200;

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A test file read for its shape, or the first thing wrong with it and where. */
export function readPackTest(doc: unknown): Result<PackTest> {
  if (!isMap(doc)) return no('PACK_MALFORMED', 'A pack test is a JSON object with rows and expect in it.', { at: 'test' });
  const stray = Object.keys(doc).find((k) => k !== 'rows' && k !== 'expect');
  if (stray !== undefined) return no('FIELD_UNKNOWN', `A pack test has no ${stray}. It says rows and expect.`, { at: stray, allowed: ['rows', 'expect'] });
  const rows = doc.rows ?? [];
  if (!Array.isArray(rows) || rows.length > TEST_ROWS_MOST) return no('VALUE_MALFORMED', `rows is a list of at most ${TEST_ROWS_MOST} rows, each { list, fields }.`, { at: 'rows' });
  const out: PackTest = { rows: [], expect: [] };
  for (const [i, r] of rows.entries()) {
    if (!isMap(r) || typeof r.list !== 'string' || !isMap(r.fields)) return no('VALUE_MALFORMED', 'Each row is { list, fields }: the list id and the fields to write.', { at: `rows[${i}]` });
    out.rows.push({ list: r.list, fields: r.fields as Record<string, Json> });
  }
  const expect = doc.expect;
  if (!Array.isArray(expect) || expect.length === 0 || expect.length > TEST_EXPECT_MOST)
    return no('VALUE_MALFORMED', `expect is a list of between 1 and ${TEST_EXPECT_MOST} expectations.`, { at: 'expect' });
  for (const [i, e] of expect.entries()) {
    const at = `expect[${i}]`;
    if (isMap(e) && typeof e.list === 'string' && 'count' in e) {
      if (!Number.isInteger(e.count) || (e.count as number) < 0) return no('VALUE_MALFORMED', 'count is a whole number of rows, 0 or more.', { at: `${at}.count` });
      out.expect.push({ list: e.list, count: e.count as number });
    } else if (isMap(e) && typeof e.figure === 'string' && 'value' in e) {
      if (e.value !== null && (typeof e.value !== 'number' || !Number.isFinite(e.value))) return no('VALUE_MALFORMED', 'value is the number the figure reads, or null when it reads none.', { at: `${at}.value` });
      out.expect.push({ figure: e.figure, value: e.value as number | null });
    } else if (isMap(e) && 'row' in e && typeof e.field === 'string' && 'is' in e) {
      if (!Number.isInteger(e.row) || (e.row as number) < 1 || (e.row as number) > out.rows.length)
        return no('VALUE_MALFORMED', `row counts the rows above from 1, so it is between 1 and ${out.rows.length}.`, { at: `${at}.row` });
      out.expect.push({ row: e.row as number, field: e.field, is: e.is as Json });
    } else return no('VALUE_MALFORMED', 'Each expectation is { list, count }, { figure, value } or { row, field, is }.', { at });
  }
  return ok(out);
}

/** One line per expectation, and whether every one passed; or the row the record refused, which ends the run. */
export type TestRun = { passed: boolean; lines: string[] };

const shown = (v: unknown): string => oneLine(JSON.stringify(v) ?? 'nothing');

/** Figures are compared to within a millionth, because a rate or an average is a float and its last digit is not the test. */
const near = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));

/** Write the test's rows into `scratch`, then say each expectation as passed or failed. */
export function runPackTest(scratch: Scratch, test: PackTest): TestRun {
  const lines: string[] = [];
  const ids: string[] = [];
  for (const [i, row] of test.rows.entries()) {
    const put = scratch.kernel.create(row.list, row.fields, { actor: 'p_scratch', note: 'Written by braindog addon test.' });
    if (!put.ok) {
      const r = 'refusal' in put ? put.refusal : null;
      lines.push(`  FAILED  row ${i + 1} into ${oneLine(row.list)} was refused: ${r ? oneLine(`${r.fix} (${r.code})`) : 'the record did not write it.'}`);
      return { passed: false, lines };
    }
    ids.push(put.value.id);
  }
  let passed = true;
  const say = (good: boolean, line: string) => {
    if (!good) passed = false;
    lines.push(`  ${good ? 'passed' : 'FAILED'}  ${line}`);
  };
  for (const e of test.expect) {
    if ('count' in e) {
      const n = scratch.kernel.count(e.list);
      say(n === e.count, `${oneLine(e.list)} holds ${e.count} rows${n === e.count ? '' : `; it holds ${n}`}.`);
    } else if ('figure' in e) {
      const read = readFigure(scratch, e.figure);
      if (read === null) say(false, `the figure ${oneLine(e.figure)} reads ${shown(e.value)}; this pack declares no figure called that.`);
      else if (!read.ok) say(false, `the figure ${oneLine(e.figure)} reads ${shown(e.value)}; the record refused it: ${'refusal' in read ? oneLine(`${read.refusal.fix} (${read.refusal.code})`) : 'it did not read.'}`);
      else say(near(read.value.value, e.value), `the figure ${oneLine(e.figure)} reads ${shown(e.value)}${near(read.value.value, e.value) ? '' : `; it reads ${shown(read.value.value)}`}.`);
    } else {
      /* READ AGAIN NOW, not kept from the write, so a field a later row's rule changed is read as the record holds it. */
      const got = scratch.fieldsOf(ids[e.row - 1] ?? '')?.[e.field];
      const same = isDeepStrictEqual(got ?? null, e.is);
      say(same, `row ${e.row}'s ${oneLine(e.field)} is ${shown(e.is)}${same ? '' : `; it is ${shown(got ?? null)}`}.`);
    }
  }
  return { passed, lines };
}
