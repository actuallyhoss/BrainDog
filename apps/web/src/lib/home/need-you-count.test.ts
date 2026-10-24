/**
 * One count of what needs you (SF4, today F2): the rail's badge, the phone tab's badge, Today's header sentence and the
 * Needs you tile's count all read `boot`'s open questions (`waits.questions`, less what was just pressed), so they say one
 * number before an answer and the same smaller one in the frame after it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { lessPending, pressed, takenBack, type Pending } from './answers-pending.ts';
import { homeDrawn, type HomeWaits } from './default-home.ts';
import { needYouCount } from './today-tiles.ts';
import type { LiveBlock } from '../record/page-live.ts';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const NOW = Date.parse('2026-09-03T09:00:00');

/** The seed's morning: eight open questions, the first three about money, as the record answers Today's queue. */
const QUESTIONS = [
  { id: 'q1', at: '2026-07-16T09:00:00Z', question: 'Invoice 2026-041: brand system was due 38 days ago, GBP 4,800.00. Chase it?' },
  { id: 'q2', at: '2026-07-16T09:00:00Z', question: 'Update Kiln’s note and move Portage to earning?' },
  { id: 'q3', at: '2026-07-16T09:01:00Z', question: 'Invoice 2026-046: retainer, August was due 9 days ago, GBP 2,400.00. Chase it?' },
  { id: 'q4', at: '2026-07-16T09:02:00Z', question: 'Does Tallow get retired, or parked for another year?' },
  { id: 'q5', at: '2026-07-16T09:03:00Z', question: 'Ledger Post, sending plan was due 4 days ago, GBP 39.00. Did it go through?' },
  { id: 'q6', at: '2026-07-16T09:04:00Z', question: 'Does Portage keep sending from portagemail.example, or move to the apex?' },
  { id: 'q7', at: '2026-07-16T09:05:00Z', question: 'Does Kiln licence per-seat, per-product, or one flat studio price?' },
  { id: 'q8', at: '2026-07-16T09:06:00Z', question: 'Is “Fenwick” one supplier or two?' },
];

const queue = (): LiveBlock =>
  ({
    kind: 'queue',
    key: 'needs-you',
    heading: 'Needs you',
    source: 'governance.open',
    queue: QUESTIONS.map((q) => ({ ...q, who: 'rule:chase', kind: 'question', why: '', cost: 'call', options: [] })),
    rows: [],
    columns: [],
    entries: [],
    matched: [],
    refusals: [],
    shown: QUESTIONS.length,
    total: QUESTIONS.length,
    drawn: true,
    stale_at: '',
  }) as unknown as LiveBlock;

/** What each of the four places says, from one `boot` answer and what was pressed since. */
function said(questions: number, pending: Pending) {
  const open = lessPending(questions, pending);
  const waits: HomeWaits = { questions: open, inbox: 0, working: 2, seqs: [] };
  const out = homeDrawn([queue()], NOW, undefined, undefined, waits);
  const tile = out.blocks.find((b) => b.key === 'needs-you')!;
  return { badge: needYouCount(waits, 0), tile: tile.total, header: out.sentence!.text, needs: out.sentence!.needs };
}

test('the header, the Needs you tile and the badge say one number, before and after one answer', () => {
  const before = said(8, new Map());
  assert.equal(before.badge, 8);
  assert.equal(before.tile, 8);
  assert.match(before.header, /^8 need you\b/u);
  assert.equal(before.needs, '8 need you');
  assert.doesNotMatch(before.header, /Twelve|Seven|Eight/u, 'digits, never words, and never a bigger number');

  /* ONE ANSWER PRESSED: all three drop in the same frame, before the write lands. */
  const after = said(8, pressed(new Map(), 'q1'));
  assert.deepEqual([after.badge, after.tile], [7, 7]);
  assert.match(after.header, /^7 need you\b/u);

  /* UNDO PUTS IT BACK in all three. */
  const back = said(8, takenBack(pressed(new Map(), 'q1'), 'q1'));
  assert.deepEqual([back.badge, back.tile], [8, 8]);
});

test('at nought the header says "Nothing needs you"', () => {
  const none = said(1, pressed(new Map(), 'q1'));
  assert.equal(none.badge, 0);
  assert.equal(none.tile, 0);
  assert.match(none.header, /^Nothing needs you\./u);
});

test('the money leads Today’s Needs you, oldest first in each group (today F3)', () => {
  const out = homeDrawn([queue()], NOW, undefined, undefined, { questions: 8, inbox: 0, working: 0, seqs: [] });
  const ids = out.blocks.find((b) => b.key === 'needs-you')!.queue!.map((q) => q.id);
  assert.deepEqual(ids, ['q1', 'q3', 'q5', 'q2', 'q4', 'q6', 'q7', 'q8']);
});

test('the rail, the tab and Today all read the one count', () => {
  /* The rail and the phone tab both take `open` from the shell. */
  assert.match(read('../../routes/+layout.svelte'), /const open = \$derived\(needYouCount\(/u);
  /* Today hands `boot`'s waits, less what was pressed, to the page it draws. */
  assert.match(read('./Home.svelte'), /const w = waitsNow\(\);/u);
  assert.match(read('./Home.svelte'), /homeDrawn\(live\.page\.blocks, live\.now, voice, one, waits/u);
});

test('an agent asking him back, of what he told it, counts in the badge, the header and the tile’s head', () => {
  const waits: HomeWaits = { questions: 8, inbox: 0, working: 2, seqs: [], told: 1 };
  const out = homeDrawn([queue()], NOW, undefined, undefined, waits);
  const tile = out.blocks.find((b) => b.key === 'needs-you')! as unknown as { total: number; counted?: number };
  assert.equal(needYouCount(waits, 0, waits.told), 9);
  assert.match(out.sentence!.text, /^9 need you\b/u);
  assert.equal(tile.counted, 9, 'the head says the one count');
  assert.equal(tile.total, 8, '"N more" stays the questions the Needs you page lists after these');
  assert.equal(needYouCount(null, 3, 2), 5, 'without waits, the reader’s own count and what came back');
  assert.equal(needYouCount(waits, 0), 8, 'with nothing told, the questions alone');
});
