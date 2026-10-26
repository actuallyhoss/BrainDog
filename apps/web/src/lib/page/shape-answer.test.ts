/**
 * A project's shape from its page's own answer (`shape-answer.ts`, scope 2026-10-24 A20): what the parts draw is turned
 * from the parts the record answered beside the page, and the record is asked no read of the shape's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../record/fixtures/fill.ts';
import { REGISTERS } from '../record/held.ts';
import { isShapeAnswer, shapeFrom, type ShapeAnswer } from './shape-answer.ts';

const BASE = 'https://record.test';
const json = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });

/** A fetch that answers every walk with no rows, and says which methods were asked. */
function io() {
  const sent: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    sent.push(method);
    return method === 'list' ? json({ rows: [], cursor: null, matched: 0 }) : json(null);
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

const projects = Object.keys(REGISTERS).find((id) => (REGISTERS[id] as { scopes?: unknown }).scopes !== undefined)!;
const title = REGISTERS[projects]!.title;
const work = Object.keys(REGISTERS).find((id) => (REGISTERS[id] as { hand?: unknown }).hand !== undefined && REGISTERS[id]!.fields.some((f) => f.type === 'ref' && (f as { to?: string }).to === projects))!;
const via = REGISTERS[work]!.fields.find((f) => f.type === 'ref' && (f as { to?: string }).to === projects)!.id;
const state = REGISTERS[work]!.state!;
const states = (REGISTERS[work]!.fields.find((f) => f.id === state) as { values: readonly string[] }).values;
const done = (REGISTERS[work] as { done?: readonly string[] }).done ?? [];
const open = states.find((v) => !done.includes(v))!;

const ANSWER: ShapeAnswer = {
  register: projects,
  seq: 1,
  row: { id: '01JPROJECT00000000000000001', seq: 1, fields: { [title]: 'Kiln' }, version: 3, created_at: '2026-01-04T09:00:00.000Z' },
  history: [],
  links: { from: [], cursor: null },
  work: {
    list: work,
    rows: [
      { id: 'a', seq: 11, fields: { [via]: `${projects}#1`, [state]: open }, version: 1, created_at: '2026-01-05T09:00:00.000Z' },
      { id: 'b', seq: 12, fields: { [via]: `${projects}#1`, [state]: done[0] ?? open }, version: 1, created_at: '2026-01-05T09:00:00.000Z' },
    ],
    cursor: null,
  },
  runs: { list: 'session', field: 'project', rows: [{ id: 'r', seq: 4, fields: { agent: 'claude', last_seen: '2026-01-06T09:00:00.000Z', project: `${projects}#1` } }] },
  kpis: [{ name: 'Signups', points: [], headline: true }],
  figures: {
    'project-in-month:Kiln': { value: 120_00, unit: 'GBP' },
    'project-owed:Kiln': { value: 0, unit: 'GBP' },
    'project-in-by-month:Kiln': { unit: 'GBP', groups: [{ key: '2025-12', value: 50_00 }, { key: '2026-01', value: 120_00 }] },
  },
};

test("THE PARTS ARE TURNED FROM THE PAGE'S ANSWER: its row, its work, its runs, its key number and its money", async () => {
  const { fetch, sent } = io();
  const read = await shapeFrom(BASE, ANSWER, fetch);
  assert.ok(read);
  assert.equal(read.key, `${projects}#1`);
  assert.equal(read.fields[title], 'Kiln');
  assert.deepEqual(read.row, { id: '01JPROJECT00000000000000001', created_at: '2026-01-04T09:00:00.000Z', version: 3 });
  assert.equal(read.work, work);
  assert.equal(read.via?.field, via);
  assert.deepEqual(read.rows.map((r) => r.seq), [11, 12]);
  assert.equal(read.open?.total, done.length > 0 ? 1 : 2, 'the open work is what is not finished');
  assert.ok(read.last && read.last.name !== '', 'the hero says who worked on it last');
  assert.equal(read.kpi?.name, 'Signups');
  assert.deepEqual(read.money.in, { value: 120_00, currency: 'GBP' });
  assert.equal(read.money.owed, null, 'nothing owed is no figure');
  assert.equal(read.inByMonth?.total, 170_00);
  /* NO READ OF ITS OWN: only the walks that name its refs, which a tab shares with the page beside it. */
  assert.deepEqual([...new Set(sent)].filter((m) => m !== 'list'), []);
});

test("WHAT IS NOT A PROJECT'S SHAPE IS NO SHAPE, and a refused row is none", async () => {
  const { fetch } = io();
  assert.equal(isShapeAnswer(null), false);
  assert.equal(isShapeAnswer({ register: 'x' }), false);
  assert.equal(await shapeFrom(BASE, null, fetch), null);
  assert.equal(await shapeFrom(BASE, { ...ANSWER, row: null }, fetch), null);
  const notProject = Object.keys(REGISTERS).find((id) => (REGISTERS[id] as { scopes?: unknown }).scopes === undefined)!;
  assert.equal(await shapeFrom(BASE, { ...ANSWER, register: notProject }, fetch), null);
});

test('A PART THE RECORD REFUSED IS DRAWN WITHOUT, and the rest still are', async () => {
  const { fetch } = io();
  const read = await shapeFrom(BASE, { ...ANSWER, work: null, runs: null, kpis: null, figures: {} }, fetch);
  assert.ok(read);
  assert.equal(read.work, null);
  assert.deepEqual(read.rows, []);
  assert.equal(read.last, null);
  assert.equal(read.kpi, null);
  assert.equal(read.money.in, null);
});

test('THE HOLD AND THE ROUTE ASK NOTHING FOR THE SHAPE: the hold takes the page’s answer, the route asks the page alone', () => {
  const hold = readFileSync(new URL('./shape-hold.svelte.ts', import.meta.url), 'utf8');
  assert.match(hold, /await shapeFrom\(apiBase\(\), said\)/u);
  assert.doesNotMatch(hold, /createClient|readShape|takeShape/u);
  const view = readFileSync(new URL('./PageView.svelte', import.meta.url), 'utf8');
  assert.match(view, /hold\.follow\(of\.register, of\.seq, said\)/u);
  const route = readFileSync(new URL('../../routes/p/[slug]/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /shapeAhead/u);
  assert.match(route, /await reader\.read\(asked, filtered\)/u);
});
