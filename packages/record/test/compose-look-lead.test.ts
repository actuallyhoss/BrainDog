/**
 * What leads a page and what is left out of it, as the model may choose them (`src/compose-look.ts`, `leadFault` and
 * `hideFault`), and the look the person put back, which is remembered by what it was written from (`undoneFor`).
 *
 * THE DECLARATIONS ARE A STAND-IN, as in `compose-look.test.ts`: one live version a declaration id, and Slash's prefs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeLooks, hideFault, leadFault, liveLook, lookAnswerOf, lookBasis, lookUndoneKey, undoLook, undoneFor, writeLook } from '../src/compose-look.ts';
import type { HeadlinePage } from '../src/headlines.ts';
import { applyLook, validateDeclaration } from '../../kernel/src/index.ts';

type Row = { id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string };

function store(start: Row[] = []) {
  let rows = [...start];
  const prefs: Record<string, unknown> = {};
  const kernel = {
    declarations: () => rows,
    async install(given: { id: string; kind: string; body: unknown }[], expect?: { id: string; version: number }) {
      const [d] = given;
      const live = rows.find((r) => r.id === d!.id);
      if (expect && live?.version !== expect.version) return { ok: false, conflict: { code: 'VERSION_STALE' } };
      if (live && !expect) return { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Read it again.' } };
      const version = (live?.version ?? 0) + 1;
      rows = [...rows.filter((r) => r.id !== d!.id), { id: d!.id, version, kind: d!.kind, pack_id: null, body: JSON.stringify(d!.body), checksum: String(version) }];
      return { ok: true, value: [{ id: d!.id, version, changed: true }] };
    },
    retire(ids: string[]) {
      rows = rows.filter((r) => !ids.includes(r.id));
      return { ok: true, value: ids };
    },
    prefsOf: () => ({ ...prefs }),
    setPref: (_: string, key: string, value: unknown) => {
      if (value === null) delete prefs[key];
      else prefs[key] = value;
    },
  };
  return { kernel: kernel as never, rows: () => rows, prefs };
}

const PAGE: HeadlinePage = {
  page: 'work',
  title: 'Work',
  rules: '4 open tasks, 1 waiting on you',
  figures: [
    { id: 'open-tasks', value: '4' },
    { id: 'tasks-waiting', value: '1' },
  ],
  blocks: [
    { key: 'lead', kind: 'note', lead: true },
    { key: 'late', kind: 'table', heading: 'Late' },
    { key: 'board', kind: 'board', heading: 'Board' },
    { key: 'done', kind: 'table', heading: 'Done this week' },
  ],
  rows: [{ row: 'tasks#4', title: 'Send the Kiln quote' }],
};

/** The page as its read answered it: the four parts handed, one that could not be drawn, and one beside the main column. */
const READ = [
  { key: 'lead', kind: 'note', lead: true, rows: [], refusals: [] },
  { key: 'late', kind: 'table', heading: 'Late', rows: [{ register: 'tasks', seq: 4, fields: {} }], matched: 1, refusals: [] },
  { key: 'board', kind: 'board', heading: 'Board', rows: [], matched: 0, refusals: [] },
  { key: 'done', kind: 'table', heading: 'Done this week', rows: [], matched: 0, refusals: [] },
  { key: 'broken', kind: 'table', heading: 'Broken', rows: [], matched: 0, refusals: [{ code: 'FIELD_UNKNOWN', fix: 'x' }] },
  { key: 'aside', kind: 'table', heading: 'Lately', area: 'rail', rows: [], matched: 0, refusals: [] },
];

const LINE = '4 open, and 1 waits on you.';

test('an answer naming a handed part as what leads is kept', () => {
  assert.deepEqual(leadFault('board', PAGE), { lead: 'board' });
  const got = lookAnswerOf({ headline: LINE, lead: 'board' }, PAGE);
  assert.equal(got.lead, 'board');
  assert.deepEqual(got.faults, []);
  /* WHAT ALREADY LEADS IS NO CHOICE: the lead line itself, and the part first under it. */
  assert.deepEqual(leadFault('lead', PAGE), { lead: null });
  assert.deepEqual(leadFault('late', PAGE), { lead: null });
  assert.equal(lookAnswerOf({ headline: LINE, lead: 'late' }, PAGE).lead, undefined);
});

test('a lead naming a part the page lacks is a fault, and the page keeps its lead', () => {
  assert.match((leadFault('ghost', PAGE) as { fault: string }).fault, /^The lead for Work named a part the page does not have\.$/u);
  assert.match((leadFault(['board'], PAGE) as { fault: string }).fault, /did not name a part of the page/u);
  const got = lookAnswerOf({ headline: LINE, lead: 'ghost', order: ['board', 'late'] }, PAGE);
  assert.equal(got.lead, undefined);
  assert.deepEqual(got.order, ['board', 'late'], 'a bad lead costs the lead and nothing else');
  assert.deepEqual(got.faults, ['The lead for Work named a part the page does not have. The page keeps its lead.']);
  /* A PART BESIDE THE MAIN COLUMN, AND A HEADING, CANNOT LEAD. */
  const wide: HeadlinePage = { ...PAGE, blocks: [...PAGE.blocks!, { key: 'aside', kind: 'table', heading: 'Lately' }, { key: 'head', kind: 'section', heading: 'Later' }] };
  assert.match((leadFault('aside', wide, READ) as { fault: string }).fault, /beside the main column/u);
  assert.match((leadFault('head', wide) as { fault: string }).fault, /keeps its place/u);
});

test('leaving out a pinned part, one that could not be drawn, what leads, or the last part shown is a fault and nothing is hidden', () => {
  const fault = (raw: unknown, pinned: string[] = [], at: { lead?: string; read?: readonly unknown[] } = {}): string => (hideFault(raw, PAGE, pinned, at) as { fault: string }).fault;
  assert.match(fault(['done'], ['done']), /you pinned/u);
  assert.match(fault(['broken'], [], { read: READ }), /could not be drawn/u);
  assert.match(fault(['broken']), /does not have/u, 'without the read, a part not handed is one the page lacks');
  assert.match(fault(['lead']), /what leads/u);
  assert.match(fault(['board'], [], { lead: 'board' }), /what leads/u);
  assert.match(fault(['late', 'board', 'done']), /nothing/u);
  assert.match(fault(['late', 'board', 'done'], [], { read: READ }), /nothing/u, 'a part beside the main column does not keep the page from being empty');
  assert.match(fault(['done', 'done']), /twice/u);
  assert.match(fault('done'), /did not name the parts/u);
  for (const f of [fault(['done'], ['done']), fault(['lead']), fault(['late', 'board', 'done'])]) assert.match(f, /^What to leave out of Work /u);

  /* ONE BAD NAME AND NOTHING IS HIDDEN, the good names with it. */
  const got = lookAnswerOf({ headline: LINE, lead: 'board', hide: ['done', 'board'] }, PAGE);
  assert.equal(got.hide, undefined);
  assert.equal(got.lead, 'board');
  assert.equal(got.faults.length, 1);
  assert.match(got.faults[0]!, /Nothing is left out\.$/u);
  assert.equal(lookAnswerOf({ headline: LINE, hide: ['done'] }, PAGE, { pinned: ['done'] }).hide, undefined);
  assert.equal(lookAnswerOf({ headline: LINE, hide: ['broken'] }, PAGE, { read: READ }).hide, undefined);
  /* THE QUESTIONS WAITING ARE NEVER LEFT OUT, and a heading goes only when everything under it does. */
  const asks: HeadlinePage = { ...PAGE, blocks: [...PAGE.blocks!, { key: 'asks', kind: 'queue', heading: 'Waiting on you' }, { key: 'head', kind: 'section', heading: 'Later' }] };
  assert.match((hideFault(['asks'], asks, []) as { fault: string }).fault, /questions/u);
  assert.match((hideFault(['head'], asks, []) as { fault: string }).fault, /heading/u);
});

test('leaving out a handed part nobody pinned is kept', () => {
  assert.deepEqual(hideFault(['done'], PAGE, []), { hide: ['done'] });
  assert.deepEqual(hideFault(['done', 'board'], PAGE, ['late'], { read: READ }), { hide: ['done', 'board'] });
  assert.deepEqual(hideFault([], PAGE, []), { hide: null }, 'naming nothing leaves nothing out');
  const got = lookAnswerOf({ headline: LINE, lead: 'board', hide: ['done'] }, PAGE, { read: READ });
  /* THE LINE IS THE HEADLINE STEP'S TO JUDGE (`headlineFault`), so only what this file checks is read here. */
  assert.deepEqual({ lead: got.lead, hide: got.hide, order: got.order, next: got.next, faults: got.faults }, { lead: 'board', hide: ['done'], order: undefined, next: undefined, faults: [] });
});

test('the look step stores what leads and what is left out, and the kernel lays them over the page', async () => {
  const s = store();
  const got = await composeLooks(s.kernel, [{ page: PAGE, basis: 'b1', read: READ }], { work: { headline: LINE, lead: 'board', hide: ['done'] } });
  assert.deepEqual(got, { said: ['work'], dropped: [] });
  const body = liveLook(s.kernel, 'work')!.body;
  assert.deepEqual(body, { look: 'work', basis: 'b1', by: 'slash', lead: 'board', hide: ['done'] });
  const written = s.rows().find((r) => r.id === 'look.work')!;
  assert.equal(validateDeclaration({ id: written.id, kind: 'look', body: JSON.parse(written.body) } as never), null);
  const laid = applyLook(READ as never, body as never);
  assert.deepEqual(laid.blocks.filter((b) => b.drawn !== false).map((b) => b.key), ['lead', 'board', 'late', 'broken', 'aside']);
  assert.equal(laid.look.lead, 'board');

  /* A BAD HIDE IS SAID AND THE LEAD STILL WRITTEN; the questions never lead a page about something else. */
  const money: HeadlinePage = { ...PAGE, page: 'money', title: 'Money', blocks: [...PAGE.blocks!, { key: 'asks', kind: 'queue', heading: 'Waiting on you' }] };
  const next = await composeLooks(s.kernel, [{ page: money, basis: 'm1' }], { money: { headline: LINE, lead: 'asks', hide: ['ghost'] } });
  assert.deepEqual(next.said, []);
  assert.equal(next.dropped.length, 2);
  assert.match(next.dropped[0]!, /Nothing is left out\.$/u);
  assert.match(next.dropped[1]!, /^The lead for Money was the questions waiting on you.* The page keeps its lead\.$/u);
  assert.equal(liveLook(s.kernel, 'money'), null);
});

test('a look he put back is remembered by what it was written from, and is not written again until that moves', async () => {
  const s = store();
  const answer = { work: { headline: LINE, lead: 'board', hide: ['done'] } };
  assert.deepEqual((await composeLooks(s.kernel, [{ page: PAGE, basis: 'b1', facts: 'f1' }], answer)).said, ['work']);
  assert.equal(undoneFor(s.kernel, 'work', lookBasis('b1', 'f1')), false);
  assert.deepEqual(await undoLook(s.kernel, 'work', 'Work', 'p_owner'), { ok: true, value: { restored: 'rules' } });
  assert.deepEqual(s.prefs[lookUndoneKey('work')], { basis: lookBasis('b1', 'f1') });
  assert.equal(undoneFor(s.kernel, 'work', lookBasis('b1', 'f1')), true);
  assert.equal(undoneFor(s.kernel, 'work', lookBasis('b2', 'f1')), false);
  assert.equal(undoneFor(s.kernel, 'money', lookBasis('b1', 'f1')), false);

  /* THE SAME NIGHT'S ANSWER AGAIN, FROM THE SAME BASIS, IS NOT WRITTEN: he said no to it. */
  const again = await composeLooks(s.kernel, [{ page: PAGE, basis: 'b1', facts: 'f1' }], answer);
  assert.deepEqual(again.said, []);
  assert.equal(again.dropped.length, 1);
  assert.match(again.dropped[0]!, /^You put Work back/u);
  assert.equal(liveLook(s.kernel, 'work'), null);

  /* ONCE WHAT THE PAGE SHOWS MOVES, Slash may arrange it again, and the old no is forgotten. */
  assert.deepEqual((await composeLooks(s.kernel, [{ page: PAGE, basis: 'b2', facts: 'f1' }], answer)).said, ['work']);
  assert.equal(s.prefs[lookUndoneKey('work')], undefined);
  assert.equal(liveLook(s.kernel, 'work')!.body.basis, lookBasis('b2', 'f1'));

  /* AN UNDO THAT DID NOT HAPPEN REMEMBERS NOTHING. */
  assert.ok((await writeLook(s.kernel, 'notes', 'Notes', { look: 'notes', basis: 'n1', by: 'slash', order: ['a', 'b'] })).ok);
  await (s.kernel as { install: (...a: unknown[]) => Promise<unknown> }).install([{ id: 'look.notes', kind: 'look', body: { look: 'notes', basis: 'n1', by: 'owner' } }], { id: 'look.notes', version: 1 });
  assert.equal((await undoLook(s.kernel, 'notes', 'Notes', 'p_owner')).ok, false);
  assert.equal(undoneFor(s.kernel, 'notes', 'n1'), false);
});
