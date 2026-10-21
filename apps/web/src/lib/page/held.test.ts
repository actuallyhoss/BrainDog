/**
 * A guest's Today draws no "drew nothing" tiles (the owner's call of 21 October): every block the record refused a reader
 * who does not hold the whole record is left out for them, and the owner's page is drawn as it always was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emptyHidden, type Why } from '@braindog/kernel';

import { heldOut, holdsWhole } from './held.ts';

const WHOLE = 'This belongs to the whole record, and you were invited to Projects and Tasks, and to nothing else.';
type Block = { kind: string; refusals: string[]; rows: unknown[]; matched: number; drawn?: boolean; why?: Why };
const block = (kind: string, refusals: string[] = [], rows: unknown[] = [{ id: 'r1' }]): Block => ({ kind, refusals, rows, matched: rows.length });

test('A READER HELD TO SOME LISTS IS DRAWN NO REFUSED TILE; the owner and a reader of the whole record see every one', () => {
  const today = [block('note'), block('queue', ['The questions asked across this BrainDog are shown to people who can read all of it.'], []), block('stat', [WHOLE], []), block('table'), block('calendar', [WHOLE], [])];
  const drawn = (bs: readonly { drawn?: boolean }[]) => bs.map((b) => b.drawn !== false);

  assert.equal(holdsWhole({ lists: ['things', 'tasks'] }), false);
  const guest = emptyHidden(heldOut(today, holdsWhole({ lists: ['things', 'tasks'] })) as Block[]) as Block[];
  assert.deepEqual(drawn(guest), [true, false, false, true, false]);
  assert.deepEqual(
    guest.filter((b) => b.drawn === false).map((b) => b.why),
    ['held', 'held', 'held'],
  );
  /* THE SENTENCE STAYS ON THE BLOCK for anything that reads why. */
  assert.deepEqual(guest[2]!.refusals, [WHOLE]);

  /* THE OWNER, A VIEWER OF THE WHOLE RECORD, AND NO SHELL YET: unchanged, each refusal drawn. */
  for (const me of [{ lists: null }, null, undefined]) {
    assert.equal(holdsWhole(me), true);
    assert.equal(heldOut(today, holdsWhole(me)), today, 'the whole record was handed something else');
  }
});
