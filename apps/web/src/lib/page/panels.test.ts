/**
 * A boxed section whose panel is the project's scheduled actions stays when the project has some (`panels.ts`).
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The page is judged before the panel reads its actions, and nothing told the rule the
 * project had any, so a project with scheduled actions and nothing else under "More about Kiln" lost the panel and its
 * heading. These cases hold the lending (`withActions`), the judging with it (`judgedWith`), and the one read a page
 * makes (`readHeld`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ActionRow } from '../record/actions.ts';
import { emptyHidden, type Why } from './home.ts';
import { asksActions, heldFor, judgedWith, readHeld, withActions } from './panels.ts';

type B = { kind: string; rows: unknown[]; refusals: unknown[]; drawn?: boolean; why?: Why; [key: string]: unknown };

/* A block as the page read sends one, with the two keys the rule cannot do without. */
const block = (over: Partial<B> & { kind: string }): B => ({ rows: [], refusals: [], ...over });

const action = (ingest: string, project: string | null, row?: string): ActionRow =>
  ({ ingest, project, project_row: row ? { id: 'x', spoken: row, title: 'Kiln' } : null }) as unknown as ActionRow;

const KILN = { spoken: 'things#1', title: 'Kiln' };
const HELD = [action('nightly', 'kiln', 'things#1')];

/* The project page's foot: a boxed section naming the panel, over one block that holds nothing. */
const page = (section: Partial<B> = {}): B[] => [
  block({ kind: 'note', body: 'Kiln ships on Friday.' }),
  block({ kind: 'section', heading: 'More about Kiln', panel: 'actions', box: true, ...section }),
  block({ kind: 'table', shown: 0, total: 0 }),
];

test('A BOXED ACTIONS SECTION IS HANDED THE ACTIONS THE PROJECT HAS', () => {
  const blocks = page();
  const lent = withActions(blocks, HELD);
  assert.deepEqual(lent[1]!.actions, HELD);
  assert.equal(lent[0], blocks[0], 'every other block is the same block');
  assert.equal(lent[2], blocks[2]);
  assert.equal(blocks[1]!.actions, undefined, 'and the page it was handed is not written on');
});

test('NOT COUNTED, THE PAGE COMES BACK AS IT WAS; counted and none, the section is handed the list of none', () => {
  const blocks = page();
  assert.equal(withActions(blocks, null), blocks);
  const none = withActions(blocks, []);
  assert.deepEqual(none[1]!.actions, []);
  assert.equal(none[0], blocks[0]);
});

test('A BLOCK THAT IS NOT THAT PANEL IS UNTOUCHED, and a page with none comes back as the same array', () => {
  const other: B[] = [
    block({ kind: 'section', heading: 'Numbers', panel: 'reporting', box: true }),
    block({ kind: 'section', heading: 'Runs on', panel: 'actions' }),
    block({ kind: 'section', heading: 'Keys', box: true }),
    block({ kind: 'table', panel: 'actions', box: true }),
  ];
  assert.equal(withActions(other, HELD), other);
  assert.equal(withActions(other, []), other);
  assert.equal(asksActions(other), false);
  assert.equal(asksActions(page()), true);
});

test('A SECTION THAT ALREADY CARRIES ITS ACTIONS KEEPS THEM, and one a `when:` turned off stays off', () => {
  const own = [action('weekly', 'kiln')];
  const carried = page({ actions: own });
  assert.equal(withActions(carried, HELD), carried);
  const off = page({ drawn: false, why: 'when' });
  assert.equal(withActions(off, HELD), off);
  assert.equal(asksActions(off), false, 'so no read is made for it');
});

test('THE SECTION THE RECORD SHUT FOR HOLDING NOTHING IS OPENED AGAIN, since the record cannot see the panel', () => {
  const shut = page({ drawn: false, why: 'empty' });
  assert.equal(asksActions(shut), true);
  const lent = withActions(shut, HELD);
  assert.equal(lent[1]!.drawn, true, 'said, not left out: the box is drawn when one of its blocks says it is');
  assert.equal(lent[1]!.why, undefined);
  assert.deepEqual(lent[1]!.actions, HELD);
});

test('JUDGED WITH ITS ACTIONS THE SECTION STAYS; counted and found to be none, it goes with its blocks', () => {
  const blocks = page();
  const judge = (bs: readonly B[]) => emptyHidden(bs, true);
  /* THE FAULT: a project with a scheduled action and nothing else under the box lost the heading, and the panel with it. */
  const kept = judgedWith(blocks, HELD, judge);
  assert.notEqual(kept[1]!.drawn, false);
  assert.equal(kept[2]!.drawn, false, 'the empty table under it still goes');
  /* TAKEN BACK OFF ONCE JUDGED: the panel draws the actions, and a block carrying `actions` draws them as rows too. */
  assert.equal('actions' in kept[1]!, false);
  const gone = judgedWith(blocks, [], judge);
  assert.equal(gone[1]!.drawn, false, 'a project with none draws no tile holding only its heading');
  assert.equal(gone[1]!.why, 'empty');
  assert.equal('actions' in gone[1]!, false);
  assert.deepEqual(judgedWith(blocks, null, judge), judge(blocks), 'and until it is counted the rule alone decides');
});

test('A SECTION THE RECORD SENT SHUT IS JUDGED AGAIN WITH THE COUNT: open with some, still shut with none', () => {
  const judge = (bs: readonly B[]) => emptyHidden(bs, true);
  const shut = page({ drawn: false, why: 'empty' });
  assert.equal(judgedWith(shut, HELD, judge)[1]!.drawn, true);
  assert.equal(judgedWith(shut, [], judge)[1]!.drawn, false);
  assert.equal(judgedWith(shut, null, judge)[1]!.drawn, false);
  /* SOMETHING UNDER IT IS DRAWN, so it never needed its actions to stay, and it stays with none. */
  const full = [...page(), block({ kind: 'table', rows: [{ key: 'a', cells: ['a'] }], shown: 1, total: 1 })];
  full.splice(2, 1);
  assert.notEqual(judgedWith(full, [], judge)[1]!.drawn, false);
});

test('WHAT THE PANEL WOULD DRAW FOR A PROJECT: its own actions and the ones for every project, no other project’s', () => {
  const rows = [action('nightly', 'kiln', 'things#1'), action('other', 'loom', 'things#2'), action('all', null)];
  assert.deepEqual(heldFor(rows, KILN).map((r) => r.ingest), ['nightly', 'all']);
  assert.deepEqual(heldFor([action('other', 'loom', 'things#2')], KILN), []);
});

test('ONE READ A PAGE, AND NONE WHERE NO SECTION NAMES THE PANEL', async () => {
  let reads = 0;
  const io = async (url: string): Promise<Response> => {
    reads += 1;
    assert.ok(url.endsWith('/api/actions'));
    return new Response(JSON.stringify({ ok: true, value: [action('nightly', 'kiln', 'things#1')] }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal(await readHeld(io, '', [block({ kind: 'note', body: 'x' })], KILN), null);
  assert.equal(await readHeld(io, '', page(), null), null, 'a page drawn for no row has no project to ask about');
  assert.equal(reads, 0);
  const held = await readHeld(io, '', page(), KILN);
  assert.equal(reads, 1);
  assert.deepEqual(held?.map((r) => r.ingest), ['nightly']);
});

test('A READ THE RECORD REFUSES COUNTS NOTHING, and the page is judged as it was', async () => {
  const io = async (): Promise<Response> => new Response(JSON.stringify({ ok: false, refusal: { code: 'NOPE', fix: 'Sign in.' } }), { status: 403 });
  assert.equal(await readHeld(io, '', page(), KILN), null);
});
