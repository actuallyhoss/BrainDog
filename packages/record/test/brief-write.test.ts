/**
 * The model's half of the briefing (ENG-B12, `brief-write.ts`): what the model is handed, the one answer kept under a
 * pref, when it is asked again (a new slot of the day, a basis that moved), the day's cap, and what is kept when the
 * model is not there to answer. Pure: a stand-in ask and a Map as the store.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { briefBasis, briefCandidates, briefFrom, briefInput, type BriefFact, type BriefInput } from '../src/briefing.ts';
import { BRIEF_ASKED, BRIEF_ASKS_DAY, BRIEF_HOURS, BRIEF_KEPT, BRIEF_NO_ANSWER, briefSlot, briefTick, keptBrief, type BriefAsk } from '../src/brief-write.ts';

const fact = (h: string, kind: BriefFact['kind'], title: string, more: Partial<BriefFact> = {}): BriefFact => ({
  h,
  kind,
  title,
  figures: {},
  row: `things#${h.slice(1)}`,
  cause: null,
  rank: kind === 'late' ? 4 : kind === 'asked' ? 3 : 2,
  ...more,
});

const FACTS: BriefFact[] = [
  fact('f1', 'late', 'Water bill', { figures: { days: '3', amount: 'EGP 420.00' }, row: 'bills#4' }),
  fact('f2', 'asked', 'Which card pays the rent?', { cause: 'match:rent', row: 'ask:rent' }),
  fact('f3', 'step', 'Sort the receipts', { figures: { next: 'Send the March ones' }, row: 'runs#9' }),
];

const GOOD = {
  cards: [
    { h: 'f1', line: 'Water bill is {{days}} days late, and {{amount}} is owed.' },
    { h: 'f3', line: 'Sort the receipts left you a step: {{next}}.' },
    { h: 'f2', line: 'Your word is needed on which card pays the rent.' },
  ],
};

/** A fixed zone four hours ahead with no summer time, so an hour here is an hour there all year. */
const ZONE = 'Asia/Dubai';
const at = (iso: string): number => Date.parse(iso);
/** 09:00 in the zone on October 14th. */
const MORNING = at('2026-10-14T05:00:00Z');

function bench(answer: (input: BriefInput) => Awaited<ReturnType<BriefAsk>> | Promise<never>) {
  const store = new Map<string, unknown>();
  const asks: BriefInput[] = [];
  const ask: BriefAsk = async (input) => {
    asks.push(input);
    return answer(input);
  };
  const tick = (now: number, facts: readonly BriefFact[] = FACTS, zone = ZONE) =>
    briefTick({ facts, now, zone, read: (k) => store.get(k), write: (k, v) => void store.set(k, structuredClone(v)), ask });
  return { store, asks, tick };
}

test('the model is handed handles and names, never a row, a cause or a rank', () => {
  const input = briefInput(FACTS, '2026-10-14');
  assert.deepEqual(input, {
    today: '2026-10-14',
    most: 7,
    facts: [
      { h: 'f1', kind: 'late', title: 'Water bill', figures: { days: '3', amount: 'EGP 420.00' } },
      { h: 'f2', kind: 'asked', title: 'Which card pays the rent?', figures: { count: '1' } },
      { h: 'f3', kind: 'step', title: 'Sort the receipts', figures: { next: 'Send the March ones' } },
    ],
  });
  const text = JSON.stringify(input);
  for (const f of FACTS) assert.ok(!text.includes(f.row), `${f.row} is not handed`);
  assert.ok(!text.includes('match:rent') && !text.includes('rank') && !text.includes('cause'));
});

test('three good cards are kept as the model wrote them, with the day, the slot and the basis', async () => {
  const b = bench(() => ({ raw: GOOD }));
  const done = await b.tick(MORNING);
  assert.equal(done.asked, true);
  assert.equal(done.dropped, null);
  assert.deepEqual(b.store.get(BRIEF_KEPT), {
    day: '2026-10-14',
    slot: 1,
    basis: briefBasis(FACTS),
    at: '2026-10-14T05:00:00.000Z',
    cards: GOOD.cards,
    said: null,
  });
  assert.deepEqual(b.asks, [briefInput(FACTS, '2026-10-14')]);
  /* WHAT IS KEPT IS READ BACK AS THE BRIEFING: holes filled from the record, each card opening its own thing. */
  const kept = keptBrief(b.store.get(BRIEF_KEPT), FACTS)!;
  const brief = briefFrom({ cards: kept.cards }, FACTS, kept.at, kept.said);
  assert.deepEqual(
    brief.cards.map((c) => [c.line, c.row, c.by]),
    [
      ['Water bill is 3 days late, and EGP 420.00 is owed.', 'bills#4', 'slash'],
      ['Sort the receipts left you a step: Send the March ones.', 'runs#9', 'slash'],
      ['Your word is needed on which card pays the rent.', 'ask:rent', 'slash'],
    ],
  );
  assert.equal(brief.said, null);
  assert.ok(!('said' in briefFrom(null, FACTS, kept.at)), 'said is absent when not handed');
});

test('the same basis in the same slot asks nothing again', async () => {
  const b = bench(() => ({ raw: GOOD }));
  await b.tick(MORNING);
  const kept = structuredClone(b.store.get(BRIEF_KEPT));
  const again = await b.tick(MORNING + 20 * 60_000, [...FACTS].reverse());
  assert.equal(again.asked, false);
  assert.equal(b.asks.length, 1);
  assert.deepEqual(b.store.get(BRIEF_KEPT), kept);
});

test('a moved basis asks again, and the day holds no more than its asks, answered or not', async () => {
  let fail = false;
  const b = bench(() => (fail ? Promise.reject(new Error('down')) : { raw: GOOD }));
  const moved = (n: number): BriefFact[] => [...FACTS.slice(1), fact('f1', 'late', 'Water bill', { figures: { days: String(n) }, row: 'bills#4' })];
  await b.tick(MORNING);
  assert.equal((await b.tick(MORNING + 60_000, moved(4))).asked, true);
  assert.equal((b.store.get(BRIEF_KEPT) as { basis: string }).basis, briefBasis(moved(4)));
  fail = true;
  for (let n = 5; n < 12; n++) await b.tick(MORNING + n * 60_000, moved(n));
  assert.equal(BRIEF_ASKS_DAY, 4);
  assert.equal(b.asks.length, BRIEF_ASKS_DAY);
  assert.equal((b.store.get(BRIEF_ASKED) as { asks: number }).asks, BRIEF_ASKS_DAY);
  /* THE NEXT DAY STARTS AGAIN. */
  fail = false;
  assert.equal((await b.tick(MORNING + 24 * 3_600_000, moved(11))).asked, true);
  assert.equal((b.store.get(BRIEF_ASKED) as { asks: number; day: string }).asks, 1);
});

test('the count is written before the model is asked, so a tick that comes in meanwhile asks nothing', async () => {
  const store = new Map<string, unknown>();
  let asks = 0;
  let answer!: (v: { raw: unknown }) => void;
  const args = {
    facts: FACTS,
    now: MORNING,
    zone: ZONE,
    read: (k: string) => store.get(k),
    write: (k: string, v: unknown) => void store.set(k, v),
    ask: () => {
      asks++;
      return new Promise<{ raw: unknown }>((r) => (answer = r));
    },
  };
  const first = briefTick(args);
  assert.deepEqual(store.get(BRIEF_ASKED), { day: '2026-10-14', asks: 1, slot: 1, basis: briefBasis(FACTS) });
  assert.equal((await briefTick(args)).asked, false);
  answer({ raw: GOOD });
  await first;
  assert.equal(asks, 1);
});

test('the slots are before 08:00, 08:00 to 17:00 and after 17:00 in the zone, and a new slot asks once', async () => {
  assert.deepEqual(BRIEF_HOURS, [8, 17]);
  assert.deepEqual(briefSlot(at('2026-10-14T03:59:00Z'), ZONE), { day: '2026-10-14', slot: 0 });
  assert.deepEqual(briefSlot(at('2026-10-14T04:00:00Z'), ZONE), { day: '2026-10-14', slot: 1 });
  assert.deepEqual(briefSlot(at('2026-10-14T12:59:00Z'), ZONE), { day: '2026-10-14', slot: 1 });
  assert.deepEqual(briefSlot(at('2026-10-14T13:00:00Z'), ZONE), { day: '2026-10-14', slot: 2 });
  /* THE DAY IS THE ZONE'S: 21:00 in London on the 13th is 01:00 on the 14th four hours east. */
  assert.deepEqual(briefSlot(at('2026-10-13T21:00:00Z'), ZONE), { day: '2026-10-14', slot: 0 });
  assert.deepEqual(briefSlot(at('2026-10-13T21:00:00Z'), 'UTC'), { day: '2026-10-13', slot: 2 });
  /* A ZONE NOBODY KNOWS IS READ AS UTC rather than thrown on. */
  assert.deepEqual(briefSlot(at('2026-10-14T09:00:00Z'), 'Nowhere/At_All'), { day: '2026-10-14', slot: 1 });

  const b = bench(() => ({ raw: GOOD }));
  await b.tick(at('2026-10-14T03:00:00Z'));
  await b.tick(at('2026-10-14T03:30:00Z'));
  assert.equal(b.asks.length, 1);
  await b.tick(at('2026-10-14T04:00:00Z'));
  await b.tick(at('2026-10-14T09:00:00Z'));
  assert.equal(b.asks.length, 2);
  await b.tick(at('2026-10-14T13:00:00Z'));
  await b.tick(at('2026-10-14T16:00:00Z'));
  assert.equal(b.asks.length, 3);
  assert.equal((b.store.get(BRIEF_KEPT) as { slot: number }).slot, 2);
});

test('a refusal to spend keeps no cards and its sentence', async () => {
  const b = bench(() => ({ spent: "This month's included use is spent." }));
  const done = await b.tick(MORNING);
  assert.equal(done.asked, true);
  const kept = b.store.get(BRIEF_KEPT) as { cards: unknown[]; said: string };
  assert.deepEqual(kept.cards, []);
  assert.equal(kept.said, "This month's included use is spent.");
  /* THE RULES WRITE IT, and the sentence goes out beside them. */
  const brief = briefFrom({ cards: kept.cards }, FACTS, 'now', kept.said);
  assert.ok(brief.cards.length === 3 && brief.cards.every((c) => c.by === 'rule'));
  assert.equal(brief.said, kept.said);
});

test('a model that throws keeps no cards and says the rules wrote this', async () => {
  const b = bench(() => Promise.reject(new Error('socket hang up')));
  const done = await b.tick(MORNING);
  assert.equal(done.asked, true);
  assert.deepEqual(b.store.get(BRIEF_KEPT), { day: '2026-10-14', slot: 1, basis: briefBasis(FACTS), at: '2026-10-14T05:00:00.000Z', cards: [], said: BRIEF_NO_ANSWER });
  assert.equal(BRIEF_NO_ANSWER, 'The model did not answer, so the rules wrote this.');
  assert.ok(!JSON.stringify(done).includes('socket'), 'what the model threw is never said');
});

test('a model that fails in a later slot leaves the cards written from the same facts standing', async () => {
  let how: 'good' | 'down' | 'spent' = 'good';
  const b = bench(() => (how === 'down' ? Promise.reject(new Error('down')) : how === 'spent' ? { spent: 'Spent.' } : { raw: GOOD }));
  await b.tick(MORNING);
  const stood = structuredClone(b.store.get(BRIEF_KEPT));
  how = 'down';
  const evening = await b.tick(at('2026-10-14T13:00:00Z'));
  assert.deepEqual([evening.asked, evening.kept, evening.dropped], [true, null, BRIEF_NO_ANSWER]);
  assert.deepEqual(b.store.get(BRIEF_KEPT), stood);
  how = 'spent';
  await b.tick(at('2026-10-15T05:00:00Z'));
  assert.deepEqual(b.store.get(BRIEF_KEPT), stood);
  assert.equal(b.asks.length, 3);
  /* FACTS THAT MOVED ARE ANOTHER MATTER: the old cards are about something else, so the sentence is kept. */
  await b.tick(at('2026-10-15T05:01:00Z'), FACTS.slice(1));
  assert.deepEqual((b.store.get(BRIEF_KEPT) as { cards: unknown[]; said: string }).cards, []);
  assert.equal((b.store.get(BRIEF_KEPT) as { said: string }).said, 'Spent.');
});

test('an answer at fault keeps its cards that pass, and none when none passes', async () => {
  const mixed = { cards: [{ h: 'f1', line: 'Water bill is 3 days late.' }, GOOD.cards[1], { h: 'f9', line: 'Something else matters.' }] };
  const some = bench(() => ({ raw: mixed }));
  const done = await some.tick(MORNING);
  assert.match(done.dropped ?? '', /typed a number/u);
  assert.deepEqual(some.store.get(BRIEF_KEPT), { day: '2026-10-14', slot: 1, basis: briefBasis(FACTS), at: '2026-10-14T05:00:00.000Z', cards: [GOOD.cards[1]], said: null });

  for (const raw of [{ cards: [{ h: 'f1', line: 'Fix the rows for 2 days.' }] }, 'no', null, { cards: [] }]) {
    const none = bench(() => ({ raw }));
    const got = await none.tick(MORNING);
    assert.ok(got.dropped, 'why it was dropped is said for the log');
    const kept = none.store.get(BRIEF_KEPT) as { cards: unknown[]; said: string };
    assert.deepEqual(kept.cards, []);
    assert.equal(kept.said, BRIEF_NO_ANSWER);
  }
});

test('nothing to say asks no model and keeps nothing', async () => {
  const b = bench(() => ({ raw: GOOD }));
  const done = await b.tick(MORNING, []);
  assert.deepEqual(done, { asked: false, kept: null, dropped: null });
  assert.equal(b.asks.length, 0);
  assert.equal(b.store.size, 0);
});

test('the kept answer stands only while the facts are what it was written from', async () => {
  const b = bench(() => ({ raw: GOOD }));
  await b.tick(MORNING);
  const kept = b.store.get(BRIEF_KEPT);
  assert.equal(briefBasis(briefCandidates(FACTS)), briefBasis(FACTS));
  assert.deepEqual(keptBrief(kept, FACTS), kept);
  assert.deepEqual(keptBrief(kept, [...FACTS].reverse()), kept, 'the order they were gathered in moves nothing');
  assert.equal(keptBrief(kept, FACTS.slice(1)), null);
  assert.equal(keptBrief(kept, [fact('f1', 'late', 'Water bill', { figures: { days: '4' }, row: 'bills#4' }), ...FACTS.slice(1)]), null);
  /* WHAT IS NOT A KEPT BRIEFING IS NONE: nothing kept yet, a bent value, cards that are not cards. */
  for (const bent of [undefined, null, 'x', [], {}, { ...(kept as object), cards: 'x' }, { ...(kept as object), cards: [{ h: 1, line: 'x' }] }, { ...(kept as object), said: 4 }]) {
    assert.equal(keptBrief(bent, FACTS), null);
  }
});
