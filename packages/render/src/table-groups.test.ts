/**
 * A table's rows in groups (ENG-B10): each group under its own heading, its name once and its count, in both renderers.
 *
 * THE ROWS CARRY THEIR GROUP BY NAME, `group` on the row, as a host builds them from the record's `PageRow.group`
 * (`apps/web/src/lib/record/page-live.ts`). The kernel's read that puts a state's group on a table's rows was being
 * built beside this in the same batch, so these rows are this file's own fixture.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { toHTML } from './index.ts';
import { tableLines } from './html.ts';
import type { Block, Row } from './parse.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. No `window`, so the
   grid arm is the one drawn, as `parity.test.ts` reads it. */
const { default: Table } = (await import(new URL('../svelte/p/Table.svelte', import.meta.url).href)) as {
  default: Component<{ columns: unknown[]; rows: unknown[]; total?: number }>;
};

/* SEVEN TASKS IN THREE STATES, in the order the record read them (newest first), so the states are interleaved. */
const TASKS: [string, string | null][] = [
  ['Send the renewal', 'Open'],
  ['Book the venue', 'Doing'],
  ['Pay the deposit', 'Open'],
  ['File the return', 'Done'],
  ['Call the bank', 'Doing'],
  ['Write the brief', 'Open'],
  ['Order paper', 'Done'],
];

const block = (rows: [string, string | null][]): Block => ({
  type: 'block',
  kind: 'comparison',
  rows: [{ cells: ['Task', 'State'] }, ...rows.map(([what, state]): Row => Object.assign({ cells: [what, state ?? ''] }, state ? { group: state } : {}))],
  raw: '',
  start: 0,
  end: 0,
});

const columns = [
  { field: 'what', label: 'Task', width: 'minmax(0,1fr)' },
  { field: 'state', label: 'State', width: 'minmax(0,1fr)' },
];
const tableRows = (rows: [string, string | null][]) => rows.map(([what, state], i) => ({ key: String(i + 1), cells: [what, state], ...(state ? { group: state } : {}) }));

/** What a drawn table says, line by line: a heading as `# name count`, a row as its first cell, each with its row index. */
function said(drawn: string): string[] {
  /* WITHOUT SVELTE'S HYDRATION MARKS, which the server render leaves between a tag and its text. */
  const html = drawn.replace(/<!--.*?-->/gsu, '');
  return [...html.matchAll(/<div class="tr( tr-group)?[^"]*" role="row" aria-rowindex="(\d+)"[^>]*>(.*?)<\/div>/gu)]
    .filter((m) => m[2] !== '1')
    .map((m) => {
      if (m[1]) {
        const name = /class="group-name">([^<]*)</u.exec(m[3]!)?.[1];
        const count = /class="group-count">(\d+)</u.exec(m[3]!)?.[1];
        return `${m[2]} # ${name}${count ? ` ${count}` : ''}`;
      }
      const first = /role="gridcell"[^>]*>([^<]*)</u.exec(m[3]!)?.[1];
      return `${m[2]} ${first}`;
    });
}

const GROUPED = [
  '2 # Open 3',
  '3 Send the renewal',
  '4 Pay the deposit',
  '5 Write the brief',
  '6 # Doing 2',
  '7 Book the venue',
  '8 Call the bank',
  '9 # Done 2',
  '10 File the return',
  '11 Order paper',
];

test('THREE STATES DRAW THREE HEADINGS WITH COUNTS in the string table, each name once, before its rows', () => {
  const html = toHTML([block(TASKS)]);
  assert.deepEqual(said(html), GROUPED);
  for (const state of ['Open', 'Doing', 'Done']) assert.equal(html.split(`<span class="group-name">${state}</span>`).length - 1, 1, `${state} is said once`);
  assert.match(html, /aria-rowcount="11"/u, 'the header, three headings and seven rows');
  assert.match(html, /<span class="td" role="gridcell" aria-colspan="2" style="grid-column:1\/-1">/u, 'a heading is one cell across the columns');
});

test('AND THE SAME IN THE APP\'S TABLE: the same headings, counts and row indexes as the string table', () => {
  const html = render(Table, { props: { columns, rows: tableRows(TASKS), total: TASKS.length } }).body;
  assert.deepEqual(said(html), GROUPED);
  assert.match(html, /aria-rowcount="11"/u);
  assert.match(html, /aria-colspan="2" style="grid-column:1\/-1"/u, 'the heading spans the columns here too');
});

test('A TABLE DRAWN FROM A SLICE HEADS ITS GROUPS BY NAME ALONE, since a count would be the slice\'s', () => {
  const html = render(Table, { props: { columns, rows: tableRows(TASKS), total: 30 } }).body;
  assert.deepEqual(
    said(html).filter((l) => l.includes('#')),
    ['2 # Open', '6 # Doing', '9 # Done'],
  );
});

test('A ROW IN NO GROUP STANDS BEFORE THE FIRST HEADING, under none, in the order it was read', () => {
  const rows: [string, string | null][] = [['Send the renewal', 'Open'], ['Loose one', null], ['Book the venue', 'Doing'], ['Loose two', null]];
  assert.deepEqual(said(toHTML([block(rows)])), ['2 Loose one', '3 Loose two', '4 # Open 1', '5 Send the renewal', '6 # Doing 1', '7 Book the venue']);
  assert.deepEqual(said(render(Table, { props: { columns, rows: tableRows(rows), total: rows.length } }).body), said(toHTML([block(rows)])));
});

test('NO GROUP ON ANY ROW, and nothing extra is printed: the table is the one it always was', () => {
  const rows: [string, string | null][] = TASKS.map(([what]) => [what, null]);
  const html = toHTML([block(rows)]);
  assert.doesNotMatch(html, /tr-group|group-name|group-count/u);
  assert.deepEqual(said(html), rows.map(([what], i) => `${i + 2} ${what}`));
  const app = render(Table, { props: { columns, rows: tableRows(rows), total: rows.length } }).body;
  assert.doesNotMatch(app, /tr-group|group-name|group-count/u);
});

test('THE LINES THEMSELVES: groups in first-seen order, a group of one still headed, the caret counting rows only', () => {
  const lines = tableLines(['a', 'b', 'a', 'c'], (r) => (r === 'c' ? null : r.toUpperCase()));
  assert.deepEqual(lines, [
    { kind: 'row', row: 'c', at: 0 },
    { kind: 'group', name: 'A', count: 2 },
    { kind: 'row', row: 'a', at: 1 },
    { kind: 'row', row: 'a', at: 2 },
    { kind: 'group', name: 'B', count: 1 },
    { kind: 'row', row: 'b', at: 3 },
  ]);
  assert.deepEqual(tableLines(['x', 'y'], () => '  '), [{ kind: 'row', row: 'x', at: 0 }, { kind: 'row', row: 'y', at: 1 }], 'a blank name is no group');
});
