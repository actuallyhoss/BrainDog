/**
 * DECIDE AS A DECLARED PAGE: the body every record draws, how the page shapes what the record answers, and the read.
 *
 * THE READ GOES THROUGH A REAL KERNEL. This package does not depend on `@braindog/record`, so the stub does what its
 * `previewPage` does for an owner: the install's lint, then each block through `kernel.block`. The questions are filed,
 * put off and answered through the kernel's own `propose` and `decide`, so the blocks drawn here are the shapes a record
 * sends and not shapes typed out to match the drawing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openRecord, type QueueQuestion } from '@braindog/kernel';
import type { Fetch, LiveBlock } from '../../lib/record/page-live.ts';
import { blocksMineFirst, boardOf, callsRead, DECIDE_HOME, decideBlockOf, decideDrawn, decideHome, GROUP_KEY, mineFirst, aboutMoney, NEEDS_SHOWN, othersLine, readDecide, waitingOf, WORDS, type Call } from './views.ts';
import { words } from './words.ts';

const CLOCK = Date.UTC(2026, 9, 2, 12);
/** When a question is late, as the record says it (`boot`'s `lateDays`). */
const LATE = 14;
const DAY = 86_400_000;
const BASE = 'http://record.test';
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const OPTIONS = { options: [{ id: 'raise', label: 'Raise it', because: 'Covers the overrun', recommended: true }, { id: 'leave', label: 'Leave it', because: 'Keeps the quote' }] };

function sqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

const value = <T>(out: unknown): T => {
  const o = out as { ok: boolean; value?: T };
  assert.ok(o.ok, JSON.stringify(out));
  return o.value as T;
};

type Kernel = Awaited<ReturnType<typeof openRecord>>;

/** A record holding three open questions, one put off and one answered, and its `previewPage` as a host answers it. */
async function decideRecord(): Promise<{ k: Kernel; io: Fetch; ids: Record<string, string> }> {
  let now = CLOCK;
  const k = await openRecord(sqlite(), { now: () => now });
  const ask = (question: string) => value<{ id: string }>(k.propose({ question, body_kind: 'options', body: OPTIONS }, 'slash')).id;
  const decided = ask('Raise the retainer last time?');
  value(k.decide(decided, { decide: { option: 'leave', reason: 'The quote stood.' } }, 'p_1'));
  now += 60_000;
  const later = ask('Renew the studio lease?');
  value(k.decide(later, { defer: { until: new Date(CLOCK + 3 * DAY).toISOString(), why: 'after the quarter closes' } }, 'p_1'));
  const ids = { decided, later, first: ask('Raise the retainer?'), second: ask('Pay the kiln bill?'), third: ask('Hire a second potter?') };
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.slice('/api/'.length);
    if (method !== 'previewPage') return reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } });
    const { body: page } = JSON.parse(String(init?.body)) as { body: { page: string; blocks: unknown[] } };
    const fault = k.lint([{ id: `page.${page.page}`, kind: 'page', body: page } as never]);
    if (fault) return reply(400, { ok: false, refusal: fault });
    return reply(200, { ok: true, value: { ...page, read_at: new Date(now).toISOString(), blocks: page.blocks.map((b) => k.block(b as never)) } });
  }) as Fetch;
  return { k, io, ids };
}

/* ── the body ── */

test('the body is the line, Money and Quick side by side, then what was put off and decided, folded', () => {
  const body = decideHome();
  assert.equal(body.page, 'decide');
  assert.deepEqual(
    body.blocks.map((b) => [b.kind, b.source ?? '', b.lead === true, b.fold === true]),
    [
      ['note', '', true, false],
      ['queue', 'governance.open', false, false],
      ['queue', 'governance.open', false, false],
      ['section', '', false, true],
      ['queue', 'governance.apart', false, false],
      ['section', '', false, true],
      ['queue', 'governance.later', false, false],
      ['section', '', false, true],
      ['table', 'governance.decided', false, false],
    ],
  );
  /* THE TWO GROUPS ARE KEYED, so the board places each tile, and named as the person says them. */
  assert.deepEqual(body.blocks.slice(1, 3).map((b) => [b.key, b.heading]), [
    [GROUP_KEY.money, 'Money'],
    [GROUP_KEY.quick, 'Quick'],
  ]);
  /* EVERY HEADING HAS ITS ICON, and the words are the person's, never the system's. */
  for (const b of body.blocks.filter((x) => x.heading)) assert.ok(b.icon, `${b.heading} has no icon`);
  for (const b of body.blocks) assert.doesNotMatch(`${b.heading ?? ''} ${typeof b.body === 'string' ? b.body : ''}`, /\b(row|rows|list item|entity|register)\b/iu);
  /* NOTHING IN IT IS ANYBODY'S RECORD BY NAME: every block reads the record's own questions. */
  assert.ok(body.blocks.every((b) => b.source === undefined || b.source.startsWith('governance.')));
});

test('the body installs as any page would, every block read clean', async () => {
  const { k } = await decideRecord();
  assert.equal(k.lint([{ id: 'page.decide', kind: 'page', body: DECIDE_HOME } as never]), null);
  for (const b of DECIDE_HOME.blocks) assert.deepEqual(k.block(b as never).refusals, [], `${b.kind} over ${b.source ?? 'nothing'} is refused`);
});

/* ── the read ── */

test('the record draws the page: the first question whole, the rest after it once each, what was put off and decided', async () => {
  const { io, ids } = await decideRecord();
  const got = await readDecide(BASE, DECIDE_HOME, io);
  assert.equal(got?.from, 'live', JSON.stringify(got));
  if (got?.from !== 'live') return;
  const blocks = got.page.blocks;
  assert.ok(blocks.every((b) => b.cannot === undefined), JSON.stringify(blocks.map((b) => [b.source, b.cannot])));

  /* THE RECORD'S OWN COUNTS RIDE ON BOTH OPEN QUEUES to the page, which says them in place of counting what it drew. */
  for (const b of blocks.filter((x) => x.source === 'governance.open')) assert.deepEqual(waitingOf(b), { stale: 0, hardToUndo: 0 });

  const shaped = decideDrawn(blocks, got.now, (q) => (q.who === 'slash' ? 'Slash' : ''));
  const [note, money, quick, , , , later, , decided] = shaped.blocks;
  /* THE LINE WENT TO THE HEAD, and says how many wait and what the first suggests. */
  assert.equal(note?.drawn, false);
  assert.equal(shaped.open, 3);
  assert.equal(shaped.sentence.text, '3 need you · 3 quick');
  assert.equal(shaped.sentence.needs, '3 need you');
  /* EACH QUESTION ONCE, IN ITS GROUP: none of these moves money, so Money draws nothing and Quick holds all three. */
  const moneyIds = (money?.queue ?? []).map((q) => q.id);
  const quickIds = (quick?.queue ?? []).map((q) => q.id);
  assert.equal(money?.drawn, false);
  assert.deepEqual([...moneyIds, ...quickIds].sort(), [ids.first, ids.second, ids.third].sort());
  assert.equal(quick?.total, 3);
  assert.deepEqual(shaped.groups, { money: 0, quick: 3 });
  /* WHAT WAS PUT OFF IS A QUEUE LIKE THE OPEN ONE, and what was decided is a table with a door to each decision. */
  assert.deepEqual(later?.queue?.map((q) => q.id), [ids.later]);
  assert.equal(later?.source, 'governance.later');
  assert.equal(decided?.rows.length, 1);
  assert.deepEqual(decided?.rows[0]?.cells.slice(0, 3), ['Raise the retainer last time?', 'Leave it', 'The quote stood.']);
  /* THE DOOR IS THE DECISION'S OWN, which `/decide/<id>` reads as the receipt of what was asked and answered. */
  assert.match((decided?.rows[0] as { href?: string } | undefined)?.href ?? '', /^\/decide\/D\d+$/u);
  assert.deepEqual(decided?.columns.map((c) => c.label), [words.question, words.chosen, words.why, words.when]);
  assert.ok(shaped.drawsAny);
});

test('a host older than the method answers nothing to draw, and a refusal is the record’s sentence', async () => {
  const older = (async () => reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called previewPage.' } })) as unknown as Fetch;
  assert.equal(await readDecide(BASE, DECIDE_HOME, older), null);
  const refused = (async () => reply(400, { ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'That page cannot be drawn.' } })) as unknown as Fetch;
  assert.deepEqual(await readDecide(BASE, DECIDE_HOME, refused), { from: 'refused', fix: 'That page cannot be drawn.' });
});

/* ── the shaping ── */

const question = (id: string, cost: QueueQuestion['cost'] = 'call', recommended = false): QueueQuestion => ({
  id,
  who: 'slash',
  at: new Date(CLOCK).toISOString(),
  kind: 'options',
  question: `Question ${id}?`,
  why: '',
  cost,
  options: [{ key: 'a', label: 'Yes', because: '', recommended }, { key: 'b', label: 'No', because: '', recommended: false }],
});

const queueBlock = (queue: QueueQuestion[], total: number, lead = false): LiveBlock =>
  decideBlockOf({ kind: 'queue', source: 'governance.open', ...(lead ? { lead: true } : {}), queue, matched: total } as never, CLOCK);

/* ONE RUN'S CLEANUP FOLDS INTO ONE CARD, so the head says both numbers: the questions and the cards. */
test('the head says how many questions and, when alike ones fold, how many cards they are', () => {
  const ran = (id: string): QueueQuestion => ({ ...question(id), kind: 'rowset', body_kind: 'rowset', options: [], run: { id: 'S904', name: 'Tidy projects' } }) as QueueQuestion;
  const qs = [ran('r1'), ran('r2'), ran('r3'), ran('r4'), question('q1')];
  const shaped = decideDrawn([noteBlock(), queueBlock(qs.slice(0, 1), 5, true), queueBlock(qs, 5)], CLOCK);
  assert.equal(shaped.sentence.text, '5 need you · 2 cards · 5 quick');
  /* THE SWITCH COUNTS QUESTIONS, as the sentence does, and the cards are said in the sentence. */
  assert.equal(shaped.groups.quick, 5);
  /* A QUEUE THAT DREW SOME OF THEM says no cards, since a fold of some is not one of all. */
  assert.equal(decideDrawn([noteBlock(), queueBlock(qs.slice(0, 1), 9, true), queueBlock(qs, 9)], CLOCK).sentence.text, '9 need you · 9 quick');
});

/* "35 need you: 2 about money, ... and 33 quick ones" sat over
   "Quick 18" on the laptop and "Quick 5" on the phone. The record holds 35, the queue drew 20 (its ceiling), and 14 of
   them fold into one card. One count everywhere: the sentence's. */
test('the sentence, the switch and each column\'s head say one count of what waits (audit Z3)', () => {
  const paying = (id: string): QueueQuestion => ({ ...question(id), money: [{ amount: 480000, currency: 'GBP' }] });
  const tidy = (id: string): QueueQuestion => ({ ...question(id), kind: 'rowset', body_kind: 'rowset', options: [], run: { id: 'S904', name: 'Tidy projects' } }) as QueueQuestion;
  const qs = [paying('m1'), paying('m2'), ...Array.from({ length: 14 }, (_, n) => tidy(`t${n}`)), ...['a', 'b', 'c', 'd'].map((id) => question(id))];
  const waits = { questions: 35, late: 0, hard: 0, inbox: null };
  const shaped = decideDrawn([noteBlock(), queueBlock(qs, 35), queueBlock(qs, 35)], CLOCK, () => '', waits);
  assert.equal(shaped.sentence.text, '35 need you · 2 money · 33 quick');
  assert.deepEqual(shaped.groups, { money: 2, quick: 33 });
  const head = (b: LiveBlock | undefined): unknown => (b as { counted?: unknown } | undefined)?.counted;
  assert.equal(head(shaped.blocks[1]), 2);
  assert.equal(head(shaped.blocks[2]), 33);
});

/* ONE SHORT LINE: how many, how many are money and how many are quick. What the money comes to is on the cards. */
test('the line counts the money cards and adds up none of what they say, which each card says in its own currencies', () => {
  const tidy = { ...question('m1'), money: [{ amount: 5000000, currency: 'EGP' }, { amount: 907401, currency: 'USD' }, { amount: 2409216, currency: 'EGP' }] } as QueueQuestion;
  const parts = { ...question('m2'), money: [{ amount: 100000000, currency: 'EGP' }, { amount: 115558900, currency: 'EGP' }] } as QueueQuestion;
  const shaped = decideDrawn([noteBlock(), queueBlock([tidy, parts, question('q1')], 3), queueBlock([tidy, parts, question('q1')], 3)], CLOCK);
  assert.equal(shaped.sentence.text, '3 need you · 2 money · 1 quick');
});

/* A GOAL AND A CHARGE TO CHECK NAME AN AMOUNT, and the line names none. */
test('the line names no amount, a goal\'s and a charge\'s included', () => {
  const tidy = { ...question('m1'), money: [{ amount: 7409216, currency: 'EGP' }, { amount: 907401, currency: 'USD' }] } as QueueQuestion;
  const goal = { ...question('m2'), question: 'Track the shop\'s monthly revenue, aiming for USD 1,500.00 by Sep 2027?' };
  const charge = { ...question('m3'), question: 'A charge of EGP 1,750.00 at a shop came twice. Was the second one yours?' };
  const qs = [tidy, goal, charge, question('q1')];
  const shaped = decideDrawn([noteBlock(), queueBlock(qs, 4), queueBlock(qs, 4)], CLOCK);
  assert.equal(shaped.sentence.text, '4 need you · 3 money · 1 quick');
  assert.doesNotMatch(shaped.sentence.text, /1,500|1,750/u);
  const alone = decideDrawn([noteBlock(), queueBlock([tidy, question('q1')], 2), queueBlock([tidy, question('q1')], 2)], CLOCK);
  assert.equal(alone.sentence.text, '2 need you · 1 money · 1 quick');
});

const noteBlock = (): LiveBlock => decideBlockOf({ kind: 'note', lead: true, body: words.nothingWaiting } as never, CLOCK);

test('the head says how many need you, then the two groups in digits (today F12): money, then quick', () => {
  const qs = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id, n) => question(id, 'call', n === 0));
  const shaped = decideDrawn([noteBlock(), queueBlock(qs.slice(0, 1), 5, true), queueBlock(qs, 5)], CLOCK, () => 'Claude');
  assert.equal(shaped.sentence.text, '5 need you · 5 quick');
  assert.equal(shaped.sentence.needs, '5 need you');
  const bills = [
    { ...question('m1'), question: 'Invoice 2026-041: brand system was due 38 days ago, GBP 4,800.00. Chase it?' },
    { ...question('m2'), question: 'Invoice 2026-046: retainer, August was due 9 days ago, GBP 2,400.00. Chase it?' },
    { ...question('m3'), question: 'Ledger Post, sending plan was due 4 days ago, GBP 39.00. Did it go through?' },
  ];
  const mixed = decideDrawn([noteBlock(), queueBlock([...bills, ...qs], 8, true), queueBlock([...bills, ...qs], 8)], CLOCK);
  assert.equal(mixed.sentence.text, '8 need you · 3 money · 5 quick');
  assert.equal(mixed.sentence.needs, '8 need you');
  /* NONE MOVES MONEY, so Quick holds every one, once, and Money draws nothing. */
  assert.deepEqual(shaped.blocks[2]?.queue?.map((q) => q.id), ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.equal(shaped.blocks[2]?.total, 5);
  assert.equal(shaped.blocks[1]?.drawn, false);
  assert.equal(shaped.open, 5);

  const one = decideDrawn([noteBlock(), queueBlock([question('q1', 'undo')], 1, true), queueBlock([question('q1', 'undo')], 1)], CLOCK);
  assert.equal(one.sentence.text, '1 needs you · 1 quick');
  /* A GROUP THAT HOLDS NOTHING IS NOT DRAWN, the question is drawn once, and the indexes stay. */
  assert.equal(one.blocks.length, 3);
  assert.equal(one.blocks[1]?.drawn, false);
  assert.deepEqual(one.blocks[2]?.queue?.map((q) => q.id), ['q1']);
});

test('the head counts every open question by the record’s count, not the few drawn', () => {
  const withCounts = (b: LiveBlock, waiting: unknown): LiveBlock => ({ ...b, waiting }) as LiveBlock;
  const qs = ['q1', 'q2', 'q3'].map((id) => question(id));
  /* THE RECORD SAYS 12 OPEN, though three are drawn. */
  const lead = withCounts(queueBlock(qs.slice(0, 1), 12, true), { stale: 3, hardToUndo: 4 });
  const rest = withCounts(queueBlock(qs, 12), { stale: 3, hardToUndo: 4 });
  const shaped = decideDrawn([noteBlock(), lead, rest], CLOCK, undefined, null, LATE);
  assert.equal(shaped.sentence.text, '12 need you · 12 quick');
  assert.equal(shaped.open, 12);
});

test('with boot\'s waits the head says the record\'s one count, and the calm line only when nothing waits in the inbox either', () => {
  const qs = ['q1', 'q2', 'q3'].map((id) => question(id));
  /* THE BADGE'S NUMBER (`waits`), not the three the queue drew, and its late and hard counts. */
  const waits = { questions: 25, late: 10, hard: 2, inbox: 32 };
  const shaped = decideDrawn([noteBlock(), queueBlock(qs.slice(0, 1), 3, true), queueBlock(qs, 3)], CLOCK, () => '', waits, LATE);
  assert.equal(shaped.sentence.text, '25 need you · 25 quick');
  assert.equal(shaped.open, 25);
  /* NO QUESTION BUT 32 ARRIVALS: "Nothing waits on you" would be false. */
  const inbox = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0)], CLOCK, undefined, { questions: 0, late: 0, hard: 0, inbox: 32 }, LATE);
  assert.deepEqual(inbox.sentence, { text: words.noQuestion, needs: '' });
  const calm = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0)], CLOCK, undefined, { questions: 0, late: 0, hard: 0, inbox: 0 }, LATE);
  assert.deepEqual(calm.sentence, { text: words.nothingWaiting, needs: '' });
});

test('nothing waiting says the calm line, with when the last one was decided, and draws nothing that holds nothing', () => {
  const decided = decideBlockOf(
    {
      kind: 'table',
      source: 'governance.decided',
      columns: [{ field: 'question' }, { field: 'answer_label' }, { field: 'at' }],
      rows: [{ id: 'SG4', fields: { question: 'Pay the bill?', answer: 'accept', answer_label: null, at: new Date(CLOCK - 2 * DAY).toISOString() } }],
      matched: 1,
    } as never,
    CLOCK,
  );
  assert.deepEqual(decided.rows[0]?.cells.slice(0, 2), ['Pay the bill?', 'Accepted']);
  const shaped = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0), decided], CLOCK);
  assert.equal(shaped.open, 0);
  assert.match(shaped.sentence.text, /^Nothing needs you\. The last one was decided .+\.$/u);
  assert.deepEqual(shaped.blocks.map((b) => b.drawn), [false, false, false, true]);

  const empty = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0)], CLOCK);
  assert.deepEqual(empty.sentence, { text: words.nothingWaiting, needs: '' });
  assert.equal(empty.drawsAny, false);
});

test('a block the record refused keeps its sentence and is never reshaped', () => {
  const refused = decideBlockOf({ kind: 'queue', source: 'governance.later', refusals: [{ code: 'NOT_IN_THIS_BUILD', fix: 'Not here yet.' }] } as never, CLOCK);
  assert.equal(refused.refusals.length, 1);
  const shaped = decideDrawn([noteBlock(), refused], CLOCK);
  assert.equal(shaped.blocks[1]?.drawn, refused.drawn);
});

/* ── the calls ── */

test('how the calls went is one line over those already checked', () => {
  const call = (id: string, went: Call['went']): Call => ({ id, claim: `Claim ${id}`, went, at: '2026-09-01', about: null });
  assert.deepEqual(callsRead([call('a', 'met'), call('b', 'met'), call('c', 'missed'), call('d', 'due')]), { met: 2, missed: 1, unread: 0, said: '2 of 3 checked came true.' });
  assert.equal(callsRead([call('d', 'due')]).said, 'None has been checked yet.');
});

/* ── the screen ── */

const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('the screen draws the declared page through the one reader, and no old screen beside it', () => {
  assert.match(screen, /<PageView\n\s+slug="decide"\n\s+got=\{drawn\}\n\s+mode="home"\n\s+select\n\s+whole\n\s+\{reread\}\n\s+opens=\{handled \? handledColumn : undefined\}\n/u);
  assert.match(screen, /readDecide\(/u);
  assert.match(screen, /decideDrawn\(/u);
  /* `/decide?classic` IS AN ADDRESS SOMEBODY KEPT, and it draws this page: nothing reads the word. */
  assert.doesNotMatch(screen, /searchParams\.has\('classic'\)/u);
  assert.doesNotMatch(screen, /Classic\.svelte/u);
});

test('the head is calm: no group control, no waiting chart, no key hints, no counts', () => {
  for (const gone of ['decideSelect', 'decideGroup', '<Bars', 'waitedOf', '<Kbd', 'group-n', 'LEAD.switch'])
    assert.ok(!screen.includes(gone), `the page still draws ${gone}`);
});

/* ── the groups: Money, Quick and Handled ── */

test('money questions go to Money and the rest to Quick, each once, five showing before N more', () => {
  const paying = (id: string): QueueQuestion => ({ ...question(id), money: [{ amount: 480000, currency: 'GBP' }] });
  const qs = [paying('m1'), question('q1'), paying('m2'), question('q2')];
  const shaped = decideDrawn([noteBlock(), queueBlock(qs, 4), queueBlock(qs, 4)], CLOCK);
  const [, money, quick] = shaped.blocks;
  assert.deepEqual(money?.queue?.map((q) => q.id), ['m1', 'm2']);
  assert.deepEqual(quick?.queue?.map((q) => q.id), ['q1', 'q2']);
  assert.equal(money?.key, GROUP_KEY.money);
  assert.equal(quick?.key, GROUP_KEY.quick);
  assert.equal(money?.most, NEEDS_SHOWN);
  assert.equal(NEEDS_SHOWN, 5);
  assert.deepEqual(shaped.groups, { money: 2, quick: 2 });
  assert.ok(aboutMoney(paying('m3')) && !aboutMoney(question('q3')));
  /* A LATE INVOICE TO CHASE WRITES NO MONEY, AND IS STILL MONEY: the record's sentence of it names the amount. */
  assert.ok(aboutMoney({ ...question('q4'), question: 'Invoice 2026-041 was due 38 days ago, GBP 4,800.00. Chase it?' }));
  assert.ok(!aboutMoney({ ...question('q5'), question: 'Does Tallow get retired, or parked for another year?' }));
  assert.ok(!aboutMoney({ ...question('q6'), question: 'Follow ISO 4217 for the codes?' }), 'a standard is no amount');
  /* A KEPT PAGE WITH ONE OPEN QUEUE draws every question in it, five showing. */
  const one = decideDrawn([noteBlock(), queueBlock(qs, 4)], CLOCK);
  assert.deepEqual(one.blocks[1]?.queue?.map((q) => q.id), ['m1', 'q1', 'm2', 'q2']);
  assert.equal(one.blocks[1]?.most, NEEDS_SHOWN);
  /* A THIRD OPEN QUEUE DRAWS NOTHING: a question is drawn once. */
  const three = decideDrawn([noteBlock(), queueBlock(qs, 4), queueBlock(qs, 4), queueBlock(qs, 4)], CLOCK);
  assert.equal(three.blocks[3]?.drawn, false);
});

test('the board puts Money and Quick a half each or the row, and Handled across the row under them', () => {
  assert.deepEqual(boardOf({ money: true, quick: true, handled: true }), { money: '1 / span 6', quick: '7 / span 6', handled: '1 / -1' });
  assert.deepEqual(boardOf({ money: false, quick: true, handled: true }), { money: null, quick: '1 / span 12', handled: '1 / -1' });
  assert.deepEqual(boardOf({ money: true, quick: false, handled: false }), { money: '1 / span 12', quick: null, handled: null });
  assert.deepEqual(boardOf({ money: false, quick: false, handled: false }), { money: null, quick: null, handled: null });
});

test('the screen shows Handled as the third column and switches between the three on a phone', () => {
  assert.match(screen, /loadHandled\(apiBase\(\)\)/u);
  assert.match(screen, /<Handled found=\{handled\} heading=\{GROUP_WORDS\.handled\} head="strip" \/>/u);
  assert.match(screen, /<Segmented role="group" aria-label=\{WORDS\.columns\} full>/u);
  assert.match(screen, /\.block-slot\[data-key='decide-money'\]/u);
  assert.match(screen, /\.block-slot\[data-key='decide-quick'\]/u);
});

/* ── who decides, with invented people ── */

const ADA = 'p_ada';
const BEN = 'p_ben';
const named = (id: string): string | null => ({ [ADA]: 'Ada Quill', [BEN]: 'Ben Arlow' })[id] ?? null;
const handed = (id: string, decider: string | null) => ({ ...question(id), decider });

test('the questions named for the reader come first, under "Yours to decide", the rest in the record’s order', () => {
  const rows = [handed('q1', null), handed('q2', ADA), handed('q3', BEN), handed('q4', ADA), question('q5')];
  const ada = mineFirst(rows, ADA);
  assert.deepEqual(ada.rows.map((r) => r.id), ['q2', 'q4', 'q1', 'q3', 'q5']);
  assert.equal(ada.yours, 2);
  assert.equal(ada.heading, 'Yours to decide');
  /* NOBODY NAMED FOR THE READER: the order is the record's and there is no heading. */
  const cy = mineFirst(rows, 'p_cy');
  assert.deepEqual(cy.rows.map((r) => r.id), ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.equal(cy.heading, null);
  assert.equal(mineFirst(rows, null).heading, null);
});

test('somebody else’s card says who decides it; the reader’s own and a question naming nobody say nothing', () => {
  assert.equal(othersLine(handed('q2', ADA), BEN, named), 'Ada Quill decides this');
  assert.equal(othersLine(handed('q2', ADA), ADA, named), null);
  assert.equal(othersLine(handed('q1', null), BEN, named), null);
  assert.equal(othersLine(question('q5'), BEN, named), null);
});

test('every open queue on the page puts the reader’s first, and a page naming nobody comes back as it was', () => {
  const blocks = [noteBlock(), queueBlock([handed('q1', BEN), handed('q2', ADA)], 2, true), queueBlock([handed('q1', BEN), handed('q2', ADA), handed('q3', null)], 3)];
  const ada = blocksMineFirst(blocks, ADA);
  assert.equal(ada[0], blocks[0]);
  assert.deepEqual(ada[1]?.queue?.map((q) => q.id), ['q2', 'q1']);
  assert.deepEqual(ada[2]?.queue?.map((q) => q.id), ['q2', 'q1', 'q3']);
  const cy = blocksMineFirst(blocks, 'p_cy');
  cy.forEach((b, n) => assert.equal(b, blocks[n]));
});

test('nothing red in the head: noting a choice and Select wait in the "⋯", and the boxes wait behind Select', () => {
  assert.doesNotMatch(screen, /<Button weight="primary" onclick=\{\(\) => \(asking = true\)\}>/u, 'the head draws a red button again');
  assert.match(screen, /<Menu label=\{WORDS\.more\} align="end">/u);
  assert.match(screen, /role="menuitem" data-ask onclick=\{\(\) => \(asking = true\)\}><Icon name="ask" size="m" \/><span class="mi-name">\{WORDS\.ask\}/u);
  assert.match(screen, /role="menuitemcheckbox" aria-checked=\{selecting\} data-select/u);
  assert.match(screen, /\.page:not\(\[data-selecting\]\) :global\(\.qa:not\(\[data-picking\]\) \.qa-select\) \{\n\s+display: none;/u);
  assert.equal(WORDS.ask, 'Note a choice to make');
});
