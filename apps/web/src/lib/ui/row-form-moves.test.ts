/**
 * A row's panel offers the moves its state can make, and not the ones the record will refuse.
 *
 * IT OFFERED EVERY VALUE. `RowForm.svelte` drew each of a state's values in both arms (the segments and the select), so
 * a thread that was Holding could be pressed to any of six states and the record then answered `TRANSITION_ILLEGAL`.
 * The component does not mount under `node --test`, so these cases hold `row-form-moves.ts`, the module both arms read
 * what to offer from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { FieldDecl } from '../record/schema.ts';
/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load. */
import * as moves from './row-form-moves.ts';

const STATE: FieldDecl = {
  id: 'state',
  type: 'enum',
  values: ['open', 'waiting', 'holding', 'done', 'dropped', 'archived'],
  transitions: {
    open: { to: ['waiting', 'holding', 'done', 'dropped'] },
    waiting: { to: ['open', 'done'] },
    holding: { to: ['open', 'done'], requires: ['note'] },
    done: { to: ['open'], by: 'decide' },
    dropped: { to: [] },
  },
};

test('A ROW THAT IS THERE IS OFFERED WHAT IT HOLDS AND THE MOVES OUT OF IT, in the order the list declares them', () => {
  assert.equal(typeof moves.movesFrom, 'function', 'row-form-moves.ts exports no movesFrom');
  assert.deepEqual(moves.movesFrom(STATE, 'waiting'), ['open', 'waiting', 'done']);
  assert.deepEqual(moves.movesFrom(STATE, 'open'), ['open', 'waiting', 'holding', 'done', 'dropped']);
  /* A move that asks for a note, or that only a decision makes, is still a move: the record says what it needs. */
  assert.deepEqual(moves.movesFrom(STATE, 'holding'), ['open', 'holding', 'done']);
  assert.deepEqual(moves.movesFrom(STATE, 'done'), ['open', 'done']);
});

test('A STATE NOTHING LEAVES IS OFFERED ALONE', () => {
  assert.deepEqual(moves.movesFrom(STATE, 'dropped'), ['dropped']);
});

test('A NEW ROW MAY START ANYWHERE, so with nothing stored every value is offered', () => {
  assert.deepEqual(moves.movesFrom(STATE, undefined), STATE.values);
  assert.deepEqual(moves.movesFrom(STATE, null), STATE.values);
  /* A state somebody cleared holds nothing, and the record declares no move out of nothing. */
  assert.deepEqual(moves.movesFrom(STATE, ''), STATE.values);
});

test('A FIELD THAT DECLARES NO MOVES OFFERS EVERY VALUE, whatever the row holds', () => {
  const plain: FieldDecl = { id: 'kind', type: 'enum', values: ['a', 'b', 'c'] };
  assert.deepEqual(moves.movesFrom(plain, 'b'), ['a', 'b', 'c']);
  assert.deepEqual(moves.movesFrom(plain, undefined), ['a', 'b', 'c']);
  assert.deepEqual(moves.movesFrom({ id: 'kind', type: 'enum' } as FieldDecl, 'b'), []);
  /* Moves that are not a map of states are no moves, as the record reads them. */
  assert.deepEqual(moves.movesFrom({ ...plain, transitions: null as never }, 'b'), ['a', 'b', 'c']);
});

test('A STATE THE MOVES DO NOT NAME IS LEFT FREE, because the record checks only the states it declares a move out of', () => {
  /* `archived` has no entry above. The record lets such a row go anywhere, so offering it alone would lock a row the
     record does not. */
  assert.deepEqual(moves.movesFrom(STATE, 'archived'), STATE.values);
});

test('WHAT THE ROW HOLDS IS ALWAYS ON OFFER, even a value the list no longer declares', () => {
  const narrowed: FieldDecl = { ...STATE, values: ['open', 'done'], transitions: { parked: { to: ['open', 'gone'] } } };
  /* First, since it has no place in the declared order, and `gone` is not a value so it is not a move. */
  assert.deepEqual(moves.movesFrom(narrowed, 'parked'), ['parked', 'open']);
});

test('THE STORED VALUE IS THE ONE READ, so pressing a move does not change what is offered', () => {
  /* The form hands in what the row held when it opened, never what is typed: from Waiting the offer stays
     Open, Waiting, Done after Done is pressed, so the press can be taken back. */
  const offered = moves.movesFrom(STATE, 'waiting');
  assert.ok(offered.includes('waiting') && offered.includes('done'));
  assert.deepEqual(moves.movesFrom(STATE, 'waiting'), offered);
});
