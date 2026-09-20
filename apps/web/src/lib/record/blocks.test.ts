/**
 * THE MINUS ON THE BRIDGE'S OUT ROW AND THE TILE BESIDE IT THAT DOES NOT WEAR ONE, held together.
 *
 * `/p/money` draws `Going out GBP −42,741.00` two blocks under a tile reading `Owed by you, 30 days
 * GBP 38,880.00`, one negative and one positive over money leaving the same record inside the same
 * thirty days, and that was filed as one screen contradicting itself. It is a disagreement on
 * purpose: `bridgeRows` in `blocks.ts` carries the measurements, both of what the renderer does when
 * the minus is taken off and of why a tile saying `Owed by you` must not have one.
 *
 * WHAT THIS FILE ADDS IS THE PAIR, because a sign that is right on its own terms in two places can
 * still drift into two answers, which is what 491e7e05 measured on these very blocks. So the two
 * figures are read off the DRAWN page together and pinned against each other. Neither can move
 * alone: take the minus off the bridge and the renderer's own reading of the four cells fails here,
 * give the tile a minus or hand it the bridge's words back and the same test fails.
 *
 * THAT THE FOUR ROWS SUM TO THE END IS ALREADY HELD, in `api.test.ts`'s "THE BRIDGE ADDS UP BY
 * CONSTRUCTION", so it is not asserted again below. What is new here is the renderer's verdict on
 * those same cells, `bridgePlan`'s warning line and the direction `moveOf` floats the bar, which is
 * the half a reader actually sees.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bridgePlan, moveOf, signedOf, type Row } from 'braindog-render';
import { page } from './api.ts';
import { toSegments } from './blocks.ts';
import { copy } from '../copy.ts';

/** The rows a block DRAWS, through the one conversion every surface uses, because a sign is a drawing. */
const drawnRows = (block: Parameters<typeof toSegments>[0]): Row[] =>
  toSegments(block).flatMap((seg) => ('rows' in seg ? seg.rows : []));

const blockOf = (slug: string, kind: string, source?: string) => {
  const block = page(slug)?.blocks.find((b) => b.kind === kind && (source === undefined || b.source === source));
  assert.ok(block, `/p/${slug} draws no ${kind}, so this test is about a block that is gone`);
  return block;
};

/** A figure as a reader sees it, sign and all: `signedOf` reads `GBP −42,741.00` back as a number. */
const figure = (row: Row | undefined): number => signedOf(row?.cells[1] ?? '');

test('THE BRIDGE’S OUT ROW AND THE `Owed by you` TILE ARE ONE MONEY IN TWO READINGS, and neither may take the other’s sign', () => {
  const bridge = blockOf('money', 'bridge', 'forecast.runway');
  const rows = drawnRows(bridge);
  assert.deepEqual(
    rows.map((r) => r.cells[0]),
    [copy.bridgeStart, copy.bridgeIn, copy.bridgeOut, copy.bridgeEnd(bridge.horizon ?? 180)],
    'the bridge draws start, in, out and end in that order, and everything below reads those positions',
  );
  const values = rows.map((r) => figure(r));
  assert.ok(
    values.every((v) => Number.isFinite(v)),
    `a row came back unreadable, so the checks below would pass over nothing: ${JSON.stringify(rows.map((r) => r.cells[1]))}`,
  );
  const out = values[2]!;
  assert.ok(out < 0, `what leaves is subtracted on a bridge, and the out row drew ${rows[2]?.cells[1]}`);

  /* THE RENDERER'S OWN READING OF THOSE FOUR CELLS, which is what a person sees rather than what the
     walk meant. Measured with the minus taken off: `bridgePlan` answers "These rows do not add up:
     the start and the movements come to 88,081, and the end says 2,599" and the bars come back
     `start up up end`, so the money leaving floats the same way as the money arriving. */
  const plan = bridgePlan(values);
  assert.equal(plan.warn, null, `the drawn bridge warns its reader: ${plan.warn}`);
  assert.deepEqual(
    plan.bars?.map((b) => b.move),
    ['start', 'up', 'down', 'end'],
    'the bar for what leaves no longer floats downwards',
  );
  assert.equal(moveOf(2, values.length, out), 'down');

  /* THE TILE IS FOUND BY THE FIGURE IT READS AND NOT BY ITS WORDS, because its words are one of the
     things under test: looking it up by label would make a rename invisible to this test. */
  const hero = blockOf('money', 'stat');
  const declared = hero.metrics?.find((m) => m.id === 'out-30d');
  assert.ok(declared, 'the hero no longer draws `out-30d`, which is the tile this pair is about');
  const tile = figure(drawnRows(hero).find((r) => r.cells[0] === declared.label));
  assert.ok(
    tile > 0,
    `a tile labelled ${JSON.stringify(declared.label)} states a debt rather than a term in a sum, and it drew ${declared.value}`,
  );

  /* AND IT IS A PART OF THAT LEG, NEVER A RIVAL TOTAL. The walk reads three lists that hold a dated
     amount where the tile reads one of them, so the tile can only be the smaller of the two: on the
     shipped record GBP 38,880.00 of the GBP 42,741.00 leaving, the difference being the parts of a
     plan and GBP 111.00 of subscriptions. A tile larger than the leg it is part of means one of the
     two has quietly started answering a different question. */
  assert.ok(
    tile <= -out,
    `the tile says ${tile} leaves where the bridge's own leg says ${-out}, so the tile is no longer a part of it`,
  );
  /* THE WORDS ARE REFUSED AT THEIR OPENING AND NOT ONLY WHOLE, because the label 491e7e05 took off
     this tile was `Going out, 30 days` and `copy.bridgeOut` is `Going out`: written as a notEqual,
     this line passed against the very label it names, measured on the two strings. A tile that opens
     with the bridge's words is the failure, whatever it appends. */
  assert.ok(
    !declared.label.startsWith(copy.bridgeOut),
    `the tile has taken the bridge’s words back as ${JSON.stringify(declared.label)}, and 491e7e05 measured those words over two different figures on one page`,
  );
});
