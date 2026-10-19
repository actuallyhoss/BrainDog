/**
 * The written brief (`src/written-brief.ts`): what the model's sentences must pass to be kept, how they are kept as
 * parts and filled from the record as it is, and when the model is asked (a changed basis that stood still, once, within
 * the day's cap, and not again soon after a failure). Pure: a Map is the store and the ask is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { BriefFact } from '../src/briefing.ts';
import {
  WRITTEN_ASKS_DAY,
  WRITTEN_KEPT,
  WRITTEN_NEEDS_MOST,
  WRITTEN_QUIET_MS,
  WRITTEN_RETRY_MS,
  WRITTEN_STATE,
  needsOf,
  writtenFailed,
  writtenOf,
  writtenShown,
  writtenTick,
  type WrittenAsk,
  type WrittenInput,
} from '../src/written-brief.ts';

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
  fact('f1', 'late', 'Water bill', { figures: { days: '3 days', amount: 'EGP 420.00' }, row: 'bills#4' }),
  fact('f2', 'asked', 'Which card pays the rent?', { cause: 'match:rent', row: 'suggestion:s7' }),
  fact('f3', 'due', 'Car insurance', { figures: { days: '5', when: 'on Friday' }, row: 'bills#9' }),
];

const GOOD = { sentences: ['Water bill is {{f1.days}} late, {{f1.amount}} owed, and Car insurance falls due {{f3.when}}.'] };

test('a sentence is kept as parts: plain words, figures of a row and names of a row', () => {
  const got = writtenOf(GOOD, FACTS);
  assert.equal(got.fault, null);
  assert.deepEqual(got.sentences[0]!.parts, [
    { text: 'Water bill', row: 'bills#4' },
    { text: ' is ' },
    { text: '3 days', row: 'bills#4', figure: 'days' },
    { text: ' late, ' },
    { text: 'EGP 420.00', row: 'bills#4', figure: 'amount' },
    { text: ' owed, and ' },
    { text: 'Car insurance', row: 'bills#9' },
    { text: ' falls due ' },
    { text: 'on Friday', row: 'bills#9', figure: 'when' },
    { text: '.' },
  ]);
});

test('a typed number, a number in words, markup, a system word or an unhanded figure drops the sentence', () => {
  for (const bad of [
    'Water bill is 3 days late.',
    'Water bill is two days late.',
    'Water bill is <b>late</b>.',
    'Water bill sits in a list somewhere.',
    'Water bill is {{f1.nothing}} late.',
    'Water bill is {{f9.days}} late.',
    'Something is vaguely off.',
    '',
  ]) {
    const got = writtenOf({ sentences: [bad, GOOD.sentences[0]] }, FACTS);
    assert.equal(got.sentences.length, 1, bad);
    assert.ok(got.fault !== null, bad);
  }
  assert.equal(writtenOf({ sentences: [] }, FACTS).sentences.length, 0);
  assert.equal(writtenOf('text', FACTS).fault, 'The model wrote no brief.');
});

test('days is said with its unit, so a sentence never needs to type one', () => {
  const facts = [fact('f1', 'late', 'Water bill', { figures: { days: '1' }, row: 'bills#4' }), fact('f2', 'late', 'Rent', { figures: { days: '12' }, row: 'bills#5' })];
  const got = writtenOf({ sentences: ['Water bill is {{f1.days}} late and Rent is {{f2.days}} late.'] }, facts);
  const kept = { basis: 'b', at: 'x', sentences: got.sentences };
  assert.equal(writtenShown(kept, facts)!.sentences[0]!.parts.map((p) => p.text).join(''), 'Water bill is 1 day late and Rent is 12 days late.');
});

test('a digit inside a name the model was handed is the person\'s own and stands', () => {
  const facts = [fact('f1', 'late', 'Q3 return', { figures: { days: '2 days' }, row: 'tasks#2' })];
  assert.equal(writtenOf({ sentences: ['Q3 return is {{f1.days}} late.'] }, facts).sentences.length, 1);
});

test('three sentences at most, and one said twice is kept once', () => {
  const line = 'Water bill is {{f1.days}} late.';
  const got = writtenOf({ sentences: [line, line, 'Car insurance is due {{f3.when}}.', 'Car insurance is due in {{f3.days}}.', 'Water bill needs a look.'] }, FACTS);
  assert.equal(got.sentences.length, 3);
});

test('the read fills a kept sentence from the record as it is now', () => {
  const kept = { basis: 'b', at: '2026-10-20T08:00:00.000Z', sentences: writtenOf(GOOD, FACTS).sentences };
  const later = FACTS.map((f) => (f.h === 'f1' ? { ...f, figures: { ...f.figures, days: '4 days' } } : f));
  const shown = writtenShown(kept, later)!;
  assert.equal(shown.sentences[0]!.parts.map((p) => p.text).join(''), 'Water bill is 4 days late, EGP 420.00 owed, and Car insurance falls due on Friday.');
  assert.equal(shown.sentences[0]!.parts[2]!.row, 'bills#4');
});

test('a kept brief is void once a row it names is gone or a name moved, and for a caller not handed the row', () => {
  const kept = { basis: 'b', at: 'x', sentences: writtenOf(GOOD, FACTS).sentences };
  assert.equal(writtenShown(kept, FACTS.filter((f) => f.h !== 'f1')), null);
  assert.equal(writtenShown(kept, FACTS.map((f) => (f.h === 'f3' ? { ...f, title: 'Home insurance' } : f))), null);
  assert.equal(writtenShown('junk', FACTS), null);
  assert.equal(writtenShown({ ...kept, sentences: [] }, FACTS), null);
});

test('what needs the owner is the questions, what stopped and the steps left, five at most, alike questions as one', () => {
  const many: BriefFact[] = [
    ...Array.from({ length: 4 }, (_, n) => fact(`q${n}`, 'asked', 'Which card pays the rent?', { cause: 'match:rent', row: `suggestion:q${n}` })),
    ...Array.from({ length: 6 }, (_, n) => fact(`s${n}`, 'step', `Run ${String(n)} work`, { figures: { next: 'Send it' }, row: `session#${String(n)}` })),
    ...FACTS.filter((f) => f.kind === 'late'),
  ];
  const needs = needsOf(many);
  assert.ok(needs.length <= WRITTEN_NEEDS_MOST);
  assert.equal(needs.filter((c) => c.row.startsWith('suggestion:')).length, 1);
  assert.ok(needs.every((c) => !c.row.startsWith('bills#')));
});

/** A bench: a Map for the store, a counted stand-in model, and a clock the test moves. */
function bench(answer: (input: WrittenInput) => Awaited<ReturnType<WrittenAsk>> | Promise<never> = () => ({ raw: GOOD })) {
  const store = new Map<string, unknown>();
  const asks: WrittenInput[] = [];
  let facts = FACTS;
  const tick = (now: number, version: number) =>
    writtenTick({
      version,
      facts: () => facts,
      now,
      zone: 'UTC',
      read: (k) => store.get(k),
      write: (k, v) => void store.set(k, structuredClone(v)),
      ask: async (input) => {
        asks.push(input);
        return answer(input);
      },
    });
  return { store, asks, tick, set: (next: BriefFact[]) => void (facts = next) };
}

const T0 = Date.UTC(2026, 9, 20, 9);

test('a changed brief is asked only once it has stood still, and then kept', async () => {
  const b = bench();
  assert.equal((await b.tick(T0, 1)).asked, false);
  assert.equal((await b.tick(T0 + WRITTEN_QUIET_MS - 1, 2)).asked, false);
  const out = await b.tick(T0 + WRITTEN_QUIET_MS, 3);
  assert.equal(out.asked, true);
  assert.equal(b.asks.length, 1);
  assert.equal(b.asks[0]!.sentences, 3);
  assert.ok(writtenShown(b.store.get(WRITTEN_KEPT), FACTS) !== null);
  assert.equal(writtenFailed(b.store.get(WRITTEN_STATE)), false);
});

test('the model is handed names and handles, never a row', async () => {
  const b = bench();
  await b.tick(T0, 1);
  await b.tick(T0 + WRITTEN_QUIET_MS, 2);
  assert.ok(!JSON.stringify(b.asks[0]).includes('bills#4'));
  assert.ok(JSON.stringify(b.asks[0]).includes('Water bill'));
});

test('an unmoved version on the same day gathers nothing and asks nothing', async () => {
  const b = bench();
  await b.tick(T0, 1);
  await b.tick(T0 + WRITTEN_QUIET_MS, 1);
  let gathered = 0;
  const again = await writtenTick({
    version: 1,
    facts: () => (gathered++, FACTS),
    now: T0 + 2 * WRITTEN_QUIET_MS,
    zone: 'UTC',
    read: (k) => b.store.get(k),
    write: (k, v) => void b.store.set(k, v),
    ask: async () => ({ raw: GOOD }),
  });
  assert.equal(again.asked, false);
  assert.equal(gathered, 0);
});

test('facts that change again restart the wait, and a kept brief for the same facts is not rewritten', async () => {
  const b = bench();
  await b.tick(T0, 1);
  b.set(FACTS.map((f) => (f.h === 'f3' ? { ...f, figures: { ...f.figures, days: '4' } } : f)));
  assert.equal((await b.tick(T0 + WRITTEN_QUIET_MS, 2)).asked, false);
  assert.equal((await b.tick(T0 + 2 * WRITTEN_QUIET_MS, 3)).asked, true);
  assert.equal((await b.tick(T0 + 5 * WRITTEN_QUIET_MS, 4)).asked, false);
  assert.equal(b.asks.length, 1);
});

test('a model that fails, or a meter that is spent, leaves the paused mark and is not asked again soon', async () => {
  let spent = true;
  const b = bench(() => (spent ? { spent: 'The month is spent.' } : { raw: GOOD }));
  await b.tick(T0, 1);
  const out = await b.tick(T0 + WRITTEN_QUIET_MS, 2);
  assert.equal(out.asked, true);
  assert.match(out.dropped ?? '', /The month is spent\./);
  assert.equal(writtenFailed(b.store.get(WRITTEN_STATE)), true);
  assert.equal(b.store.get(WRITTEN_KEPT), undefined);
  assert.equal((await b.tick(T0 + WRITTEN_QUIET_MS + 1000, 3)).asked, false);
  spent = false;
  assert.equal((await b.tick(T0 + WRITTEN_QUIET_MS + WRITTEN_RETRY_MS, 4)).asked, true);
  assert.equal(writtenFailed(b.store.get(WRITTEN_STATE)), false);
});

test('a throw and an answer with nothing usable both count as a failure', async () => {
  const thrown = bench(() => Promise.reject(new Error('down')) as Promise<never>);
  await thrown.tick(T0, 1);
  assert.equal((await thrown.tick(T0 + WRITTEN_QUIET_MS, 2)).asked, true);
  assert.equal(writtenFailed(thrown.store.get(WRITTEN_STATE)), true);
  const junk = bench(() => ({ raw: { sentences: ['Water bill is 3 days late.'] } }));
  await junk.tick(T0, 1);
  await junk.tick(T0 + WRITTEN_QUIET_MS, 2);
  assert.equal(junk.store.get(WRITTEN_KEPT), undefined);
  assert.equal(writtenFailed(junk.store.get(WRITTEN_STATE)), true);
});

test('a day holds a cap on asks however much changes', async () => {
  const b = bench();
  let now = T0;
  for (let n = 0; n < WRITTEN_ASKS_DAY + 3; n++) {
    b.set(FACTS.map((f) => (f.h === 'f3' ? { ...f, title: `Car insurance ${String(n)}` } : f)));
    await b.tick(now, n * 2 + 1);
    now += WRITTEN_QUIET_MS;
    await b.tick(now, n * 2 + 2);
    now += WRITTEN_QUIET_MS;
  }
  assert.equal(b.asks.length, WRITTEN_ASKS_DAY);
});

test('nothing to say asks nothing', async () => {
  const b = bench();
  b.set([]);
  await b.tick(T0, 1);
  assert.equal((await b.tick(T0 + WRITTEN_QUIET_MS, 2)).asked, false);
  assert.equal(b.asks.length, 0);
});
