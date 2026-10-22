/**
 * Moving many at once (`moveMany`): one gesture, one Undo. The client here is one that keeps what it was sent, so every
 * test reads the writes the record would have got, in the order it would have got them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from './held.ts';
import {
  afterMove,
  choiceOf,
  moveMany,
  movedSaid,
  movable,
  movesIn,
  opensMove,
  scopeFieldOf,
  scopeOf,
  words,
  type MoveClient,
  type MoveRow,
  type Place,
} from './scope-move.ts';
import type { Names } from './remote.ts';

REGISTERS['projects'] = { id: 'projects', name: 'Projects', one: 'project', title: 'name', seq_prefix: 'P', fields: [{ id: 'name', type: 'text' }] } as never;
REGISTERS['keys'] = {
  id: 'keys',
  name: 'Keys',
  one: 'key',
  title: 'label',
  fields: [
    { id: 'label', type: 'text' },
    { id: 'value', type: 'secret' },
    { id: 'project', type: 'ref', to: 'projects', scope: 'project' },
  ],
} as never;
REGISTERS['skills'] = {
  id: 'skills',
  name: 'Skills',
  one: 'skill',
  title: 'label',
  fields: [
    { id: 'label', type: 'text' },
    { id: 'project', type: 'ref', to: 'projects', scope: 'project' },
  ],
} as never;
REGISTERS['learnings'] = {
  id: 'learnings',
  name: 'Learnings',
  one: 'learning',
  title: 'label',
  fields: [
    { id: 'label', type: 'text' },
    { id: 'projects', type: 'refs', to: 'projects', scope: 'project' },
  ],
} as never;
REGISTERS['notes'] = { id: 'notes', name: 'Notes', one: 'note', title: 'label', fields: [{ id: 'label', type: 'text' }] } as never;

const kiln: Place = { id: 'e_kiln', ref: 'projects#1', spoken: 'P1', name: 'Kiln', mark: null, hue: null };
const driftwood: Place = { id: 'e_driftwood', ref: 'projects#2', spoken: 'P2', name: 'Driftwood', mark: null, hue: null };

type Sent = { register: string; seq: number; patch: Record<string, unknown>; version?: number; note?: string };

/** A client that keeps every update and answers each with the next version, or with what `answer` says for that row. */
function fake(answer: (sent: Sent) => unknown = () => undefined) {
  const sent: Sent[] = [];
  const client = {
    update: async (args: Sent) => {
      sent.push(args);
      return answer(args) ?? { ok: true, value: { version: (args.version ?? 0) + 1 } };
    },
  } as unknown as MoveClient;
  return { client, sent };
}

const row = (seq: number, project: unknown, version = 3): MoveRow => ({ seq, version, fields: { label: `Key ${seq}`, project }, name: `Key ${seq}` });

test('a list is moved from the bar only where its place is one project', () => {
  assert.equal(movable(scopeFieldOf('keys')), true);
  assert.equal(movable(scopeFieldOf('notes')), false);
});

test('every one picked is moved in one go, each against the version read, with the note a history line reads', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'skills', [row(1, null, 3), row(2, 2, 7), row(3, '', 1)], kiln);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.deepEqual(
    sent.map((s) => [s.seq, s.version, s.patch, s.note]),
    [
      [1, 3, { project: 'e_kiln' }, 'Moved to Kiln'],
      [2, 7, { project: 'e_kiln' }, 'Moved to Kiln'],
      [3, 1, { project: 'e_kiln' }, 'Moved to Kiln'],
    ],
  );
  assert.deepEqual(out.moved, [
    { seq: 1, version: 4 },
    { seq: 2, version: 8 },
    { seq: 3, version: 2 },
  ]);
  assert.equal(out.skipped, 0);
  assert.equal(out.failed, 0);
  assert.equal(movedSaid(out, kiln), 'Moved 3 to Kiln.');
});

test('one Undo puts every one of them back where it was, at the version the move answered', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'skills', [row(1, null, 3), row(2, 2, 7)], kiln);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.equal(typeof out.undo, 'function');
  sent.length = 0;
  const back = await out.undo?.();
  assert.deepEqual(
    sent.map((s) => [s.seq, s.version, s.patch, s.note]),
    [
      [1, 4, { project: null }, words.movedBack],
      [2, 8, { project: 'projects#2' }, words.movedBack],
    ],
  );
  assert.equal(back?.ask, false);
  if (!back || back.ask) return;
  assert.equal(back.moved.length, 2);
  /* THE WAY BACK IS NOT ITSELF UNDONE: the toast that put them back offers nothing more. */
  assert.equal(back.undo, null);
});

test('one already there is skipped and counted, and nothing is written for it', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'skills', [row(1, 1), row(2, 'e_kiln'), row(3, 'P1'), row(4, 'projects#1'), row(5, 2)], kiln);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.deepEqual(sent.map((s) => s.seq), [5]);
  assert.equal(out.skipped, 4);
  assert.equal(movedSaid(out, kiln), 'Moved 1 to Kiln. 4 were already there.');

  const everywhere = await moveMany(client, 'skills', [row(6, null), row(7, ''), row(8, [])], null);
  assert.equal(everywhere.ask, false);
  if (everywhere.ask) return;
  assert.equal(everywhere.skipped, 3);
  assert.equal(everywhere.undo, null);
  assert.equal(movedSaid(everywhere, null), 'All 3 were already at Everywhere.');
});

test('keys moved to Everywhere are asked about first, and nothing is written until the answer', async () => {
  const { client, sent } = fake();
  const rows = [row(1, 1), row(2, null), row(3, 2)];
  const asked = await moveMany(client, 'keys', rows, null);
  assert.deepEqual(asked, { ask: true, widening: 2 });
  assert.equal(sent.length, 0);

  const out = await moveMany(client, 'keys', rows, null, { confirmed: true });
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.deepEqual(sent.map((s) => [s.seq, s.patch]), [
    [1, { project: null }],
    [3, { project: null }],
  ]);
  assert.equal(out.skipped, 1);
  assert.equal(movedSaid(out, null), 'Moved 2 to Everywhere. 1 was already there.');
});

test('a list with no sealed value goes to Everywhere on the press', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'skills', [row(1, 1)], null);
  assert.equal(out.ask, false);
  assert.equal(sent.length, 1);
});

test('keys already at Everywhere ask nothing, since nothing would be opened', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'keys', [row(1, null)], null);
  assert.equal(out.ask, false);
  assert.equal(sent.length, 0);
});

test('an Undo that would open a key to every project is not offered', async () => {
  const { client } = fake();
  const out = await moveMany(client, 'keys', [row(1, null), row(2, 2)], kiln);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.equal(out.moved.length, 2);
  assert.equal(out.undo, null);

  const between = await moveMany(client, 'keys', [row(3, 2)], kiln);
  assert.equal(between.ask, false);
  if (between.ask) return;
  assert.equal(typeof between.undo, 'function');
});

test('one the record refused is counted with its reason, and the Undo leaves it alone', async () => {
  const { client, sent } = fake((s) =>
    s.seq === 2 && s.note !== words.movedBack ? { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Stale.' } } : undefined,
  );
  const out = await moveMany(client, 'skills', [row(1, null), row(2, null), row(3, null)], driftwood);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.deepEqual(out.moved.map((m) => m.seq), [1, 3]);
  assert.equal(out.failed, 1);
  assert.deepEqual(out.stale, [2]);
  assert.match(movedSaid(out, driftwood), /^Moved 2 to Driftwood\. 1 did not move\. Key 2 /u);
  sent.length = 0;
  await out.undo?.();
  assert.deepEqual(sent.map((s) => s.seq), [1, 3]);
});

test('a list whose things name no place is moved nowhere', async () => {
  const { client, sent } = fake();
  const out = await moveMany(client, 'notes', [row(1, null)], kiln);
  assert.equal(out.ask, false);
  if (out.ask) return;
  assert.equal(sent.length, 0);
  assert.equal(out.failed, 1);
});

/* ── ONE PRESS, WHEREVER THE CHIP IS ───────────────────────────────────────────────────────────────────────────────
   The row's page, a list's table and its cards open one sheet (`[seq]/ScopeMove.svelte`); what each decides is here. */

const names = Object.assign(new Map([['projects#1', 'Kiln']]), { marks: new Map() }) as Names;

test('the chip says where each row applies, by name, and what a press on it does', () => {
  const kilnSaid = scopeOf('skills', { project: 1 }, names);
  assert.equal(kilnSaid?.name, 'Kiln');
  assert.equal(kilnSaid?.spoken, 'P1');
  assert.equal(words.moveLabel(kilnSaid?.name ?? words.everywhere), 'Where it applies: Kiln. Move it');
  assert.equal(scopeOf('skills', { project: null }, names), null);
  assert.equal(words.moveLabel(words.everywhere), 'Where it applies: Everywhere. Move it');
  /* A PROJECT THIS TAB COULD NOT NAME IS STILL A PROJECT, and never its number. */
  assert.equal(scopeOf('skills', { project: 9 }, names)?.name, words.someProject);
  assert.equal(scopeOf('notes', { label: 'x' }, names), undefined);
});

test('a key going to Everywhere asks first, and every other press moves or closes', () => {
  const atKiln = scopeOf('keys', { project: 1 }, names) ?? null;
  assert.equal(choiceOf('keys', atKiln, null), 'ask');
  assert.equal(choiceOf('skills', atKiln, null), 'move');
  assert.equal(choiceOf('keys', atKiln, driftwood), 'move');
  assert.equal(choiceOf('keys', null, kiln), 'move');
  /* WHERE IT IS ALREADY, THE PRESS CLOSES THE SHEET AND WRITES NOTHING, Everywhere included. */
  assert.equal(choiceOf('keys', atKiln, kiln), 'here');
  assert.equal(choiceOf('keys', null, null), 'here');
});

test('a row on a list of several projects keeps its chip and cannot move', () => {
  assert.equal(movesIn('learnings', true), false);
  assert.equal(scopeOf('learnings', { projects: [1, 9] }, names)?.name, 'Kiln, A project');
  assert.equal(movesIn('keys', true), true);
  assert.equal(movesIn('skills', true), true);
  /* A READER WHO MAY NOT WRITE THE LIST, AND A LIST WHOSE ROWS NAME NO PLACE, get the words and no press. */
  assert.equal(movesIn('keys', false), false);
  assert.equal(movesIn('notes', true), false);
});

test('Enter and Space open the move from a grid cell, and a key with a modifier is the list’s', () => {
  assert.equal(opensMove({ key: 'Enter' }), true);
  assert.equal(opensMove({ key: ' ' }), true);
  assert.equal(opensMove({ key: 'e' }), false);
  assert.equal(opensMove({ key: 'Escape' }), false);
  assert.equal(opensMove({ key: 'Enter', metaKey: true }), false);
  assert.equal(opensMove({ key: ' ', ctrlKey: true }), false);
});

test('a move that landed stands in for the row until the list reads it again', () => {
  const was = scopeOf('skills', { project: 1 }, names);
  const landed = { seq: 4, version: 8, to: driftwood };
  /* BEFORE THE READ: the chip says Driftwood, and the next move goes against the version the move answered. */
  assert.deepEqual(afterMove({ seq: 4, version: 7 }, was, landed), { version: 8, scope: driftwood });
  /* THE READ ARRIVED, OR THE ROW CHANGED SOMEWHERE ELSE SINCE: the row as read wins. */
  assert.deepEqual(afterMove({ seq: 4, version: 8 }, was, landed), { version: 8, scope: was });
  assert.deepEqual(afterMove({ seq: 4, version: 11 }, was, landed), { version: 11, scope: was });
  /* ANOTHER ROW, OR NO MOVE AT ALL, is the row as read. */
  assert.deepEqual(afterMove({ seq: 5, version: 2 }, was, landed), { version: 2, scope: was });
  assert.deepEqual(afterMove({ seq: 4, version: 7 }, was, undefined), { version: 7, scope: was });
  /* A MOVE TO EVERYWHERE IS SAID AS EVERYWHERE, not as the place it left. */
  assert.deepEqual(afterMove({ seq: 4, version: 7 }, was, { ...landed, to: null }), { version: 8, scope: null });
});
