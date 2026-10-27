/**
 * The Board page's add in place (work 1.19.0).
 *
 * The Board drew its sentence, the board and the list of everything open, and nowhere to write a task: a task thought
 * of while moving cards meant leaving for Work, typing it there and coming back. Work's own page has had the line since
 * 1.9.0, so the Board takes the same one, first after its sentence.
 *
 * WHAT THIS HOLDS, on a record with the five modules and none of the example tasks, so every card is one this file
 * wrote: the line is on the page, straight after the lead sentences and before the board; it is the same line as
 * Work's (the same prompt, the same list, nothing filled in for the person); the board under it is the board it was;
 * and a task written the way the line writes one, a description and nothing else, is a card in the To do column.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Kernel, PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';

import { FIRST_PARTY, NOW, PAGES, firstPartyDocument } from '../src/index.ts';

type Refusal = { code: string; fix: string; at?: string };
type Out<T> = { ok: boolean; value?: T; refusal?: Refusal };
const value = <T>(r: unknown, doing: string): T => {
  const x = r as Out<T>;
  assert.ok(x.ok, x.ok ? '' : `${doing}: ${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A fresh record: the five modules by the road an install takes from the app, with no example rows. */
async function fresh(): Promise<{ k: Kernel; close(): void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true });
  for (const id of FIRST_PARTY) {
    const doc = { ...(firstPartyDocument(id) as Record<string, unknown>), seeds: [] };
    const planned = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner), `planning ${id}`);
    value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner), `installing ${id}`);
  }
  return { k: api.kernel, close: () => sql.close() };
}

const board = (k: Kernel): PageResult => {
  const out = k.page('work-board');
  assert.ok(out.ok, sayOf(out));
  return out.value;
};

type Declared = { kind: string; lead?: boolean; heading?: string; icon?: string; span?: number; register?: string };
const declared = (page: string): Declared[] => (PAGES[page] as unknown as { blocks: Declared[] }).blocks;

test('THE BOARD DECLARES WORK’S OWN CAPTURE LINE, first after its sentences and before the board', () => {
  const blocks = declared('work-board');
  const at = blocks.findIndex((b) => b.kind === 'capture');
  assert.ok(at > 0, 'the Board page has no capture line');
  assert.equal(blocks.filter((b) => b.kind === 'capture').length, 1, 'the Board page has more than one capture line');
  /* EVERYTHING BEFORE IT IS A LEAD SENTENCE, and nothing after it is: a block put between them makes the line a tile. */
  assert.ok(blocks.slice(0, at).every((b) => b.kind === 'note' && b.lead === true), 'something other than the lead sentences is before the capture line');
  assert.ok(blocks.slice(at).every((b) => b.lead !== true), 'a lead sentence is after the capture line');
  assert.equal(blocks[at + 1]?.kind, 'board', 'the board is not straight after the capture line');
  /* THE BOARD IS THE PAGE'S LAST BLOCK: Everything open listed its tasks again. */
  assert.equal(blocks.length, at + 2, 'the Board page gained a block other than the capture line');

  /* THE SAME LINE AS WORK'S, word for word, so the two pages ask one question of one list. */
  const works = declared('work').find((b) => b.kind === 'capture');
  assert.ok(works, 'Work has no capture line to be the same as');
  assert.deepEqual(blocks[at], works);
  assert.equal(blocks[at]?.heading, 'What needs doing?');
  assert.equal(blocks[at]?.register, 'tasks');
});

test('ON A FRESH RECORD THE LINE IS DRAWN FIRST AFTER THE SENTENCE, AND A TASK TYPED INTO IT IS A CARD IN TO DO', async () => {
  const { k, close } = await fresh();
  try {
    const empty = board(k);
    for (const b of empty.blocks) assert.deepEqual(b.refusals, [], `${b.kind} refused on a fresh record`);
    const kinds = empty.blocks.map((b) => b.kind);
    const at = kinds.indexOf('capture');
    assert.ok(at > 0, `the Board page of a fresh record draws no capture line: ${kinds.join(', ')}`);
    assert.ok(kinds.slice(0, at).every((kind) => kind === 'note'), `before the capture line: ${kinds.slice(0, at).join(', ')}`);
    assert.ok(!kinds.slice(at + 1).includes('note'), 'a sentence is drawn after the capture line');
    const line = empty.blocks[at]!;
    assert.equal(line.heading, 'What needs doing?');
    /* NOTHING IS FILLED IN FOR THE PERSON: the line has no `where:`, so what is typed is the task and nothing else. */
    assert.deepEqual((line as { fills?: unknown }).fills ?? {}, {});
    const cards = empty.blocks.find((b) => b.kind === 'board');
    assert.ok(cards, 'the Board page draws no board');
    assert.equal(cards.rows.length, 0, 'a fresh record already has cards, so this does not show the typed one arriving');

    /* WHAT THE LINE WRITES: the words typed into the list's title, and nothing else (`captureSubmit` in render). */
    value(k.create('tasks', { what: 'Ring the plumber' }, { actor: 'p_1' }), 'adding the typed task');

    const after = board(k);
    const now = after.blocks.find((b) => b.kind === 'board');
    assert.ok(now, 'the Board page draws no board once a task is on it');
    assert.deepEqual(now.refusals, []);
    const typed = now.rows.filter((r) => r.fields.what === 'Ring the plumber');
    assert.equal(typed.length, 1, 'the typed task is not one card on the board');
    /* `open` IS THE TO DO COLUMN: the board's columns are the status's values, and a new task is To do unless somebody
       says Later (`state` in `modules/work.ts`). */
    assert.equal(typed[0]!.fields.state, 'open');
    /* AND THE LINE IS STILL THERE, still before the board, for the next one. */
    const then = after.blocks.map((b) => b.kind);
    assert.ok(then.indexOf('capture') > 0 && then.indexOf('capture') < then.indexOf('board'), `after a task: ${then.join(', ')}`);
  } finally {
    close();
  }
});
