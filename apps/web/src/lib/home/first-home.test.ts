/**
 * A first Today (use case 6, steps 5 and 6; planner-45, the onboarding target): a fresh shop record opens on the card
 * to tell it one real thing and draws no empty tile; after the Nadia sentence its line and its first two blocks read
 * what was added; Hide holds; and a record with entries typed by hand, or kept for months, reads its Today as it did.
 *
 * The pure parts are run (`default-home.ts`, `first-today.ts`); what `Home.svelte` mounts is read from its source, as
 * `news-live.test.ts` reads it, since a component does not load under `node --test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { useCase } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';

import { DEFAULT_HOME, FIRST_TODAY_MOST, MONEY_WEEK, OWED, OWED_TO_YOU, TELL_LINE, WEEK_IN_SAID, amountSpoken, drawsAny, homeDrawn, todayHome, weekOf, type WeekDecl } from './default-home.ts';
import { addedByHand, showTell } from './first-today.ts';
import { wantMore } from './want-more.ts';
import { playedBy } from '../start/parts.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { PageBlock } from '../record/schema.ts';

/** Tuesday 6 October 2026: the Friday the order is due is three days on. */
const NOW = Date.parse('2026-10-06T09:00:00');
const FRIDAY = '2026-10-09';

const people = playedBy('meets');

type Raw = Record<string, unknown>;
const asDecl = (d: Raw): WeekDecl => ({
  id: String(d.register),
  name: String(d.name),
  one: String(d.one),
  title: String(d.title),
  fields: d.fields as WeekDecl['fields'],
  ...(typeof d.state === 'string' ? { state: d.state } : {}),
  ...(Array.isArray(d.done) ? { done: d.done as string[] } : {}),
});
const declsIn = (doc: { declarations?: unknown } | null): WeekDecl[] =>
  ((doc?.declarations ?? []) as Raw[]).filter((d) => typeof d.register === 'string' && Array.isArray(d.fields)).map(asDecl);

/** A record's lists as it declares them: the modules', then the use case's own. */
function declsOf(modules: readonly string[], usecase?: string): WeekDecl[] {
  const out = modules.flatMap((id) => declsIn(moduleDocument(null, id, { today: '2026-10-01' })));
  const u = usecase ? useCase(usecase) : undefined;
  return u ? [...out, ...declsIn(u.pack as { declarations?: unknown })] : out;
}

/** A fresh shop record: People, and the shop's Orders and Products. */
const SHOP = declsOf(['people'], 'shop');
/** The same shop that keeps its books too. */
const SHOP_BOOKS = declsOf(['people', 'money-core'], 'shop');

/** `boot`'s lists, each with how many entries it holds. */
const bootOf = (decls: readonly WeekDecl[], counts: Record<string, number> = {}) => ({
  registers: decls.map((d) => ({ id: d.id, name: d.name, count: counts[d.id] ?? 0 })),
});

/** A block as the record answers it, its rows one for one with its entries, each row's cells as the reader draws them. */
function answer(b: PageBlock, rows: { fields: Raw; cells: string[] }[] = []): LiveBlock {
  const entries = rows.map((r, n) => ({ seq: n + 1, fields: r.fields, version: 1, created: '', by: '' }));
  const columns = ((b as unknown as { columns?: { field: string }[] }).columns ?? []).map((c) => ({ field: c.field, label: '', width: '' }));
  return {
    ...b,
    register: typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : undefined,
    rows: rows.map((r, n) => ({ key: String(n), cells: r.cells })),
    columns,
    entries,
    matched: entries,
    refusals: [],
    shown: rows.length,
    total: rows.length,
    drawn: true,
    stale_at: '',
  } as unknown as LiveBlock;
}

/** A tile of figures as the record answers it, each figure as the reader wrote it ("EGP 900.00"). */
const tile = (b: PageBlock, cells: Record<string, string>): LiveBlock => ({
  ...answer(b),
  metrics: Object.entries(cells).map(([id, value]) => ({ id, label: id === OWED ? OWED_TO_YOU : (WEEK_IN_SAID as Record<string, string>)[id]!, value, note: '' })),
});

const HOME = new URL('./Home.svelte', import.meta.url);
/** Home's source, its comments taken out, so what it does is read and not what its comments say. */
const homeSource = (): string =>
  readFileSync(HOME, 'utf8')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '');

/* ── the week a shop keeps ─────────────────────────────────────────────── */

test("A SHOP'S WEEK IS ITS ORDERS, found by their shape and never by a name, with what each says was paid", () => {
  const week = weekOf(SHOP, people);
  assert.ok(week, 'a shop keeps a week');
  assert.equal(week.due.register, 'orders');
  assert.deepEqual([week.due.day, week.due.who, week.due.open], ['due', 'who', 'state is not paid']);
  /* A LIST DONE IN TWO STATES leaves out both, one clause each: the grammar reads no "is not a or b". */
  const twice = SHOP.map((d) => (d.id === 'orders' ? { ...d, done: ['paid', 'cancelled'] } : d));
  assert.equal(weekOf(twice, people)?.due.open, 'state is not paid, state is not cancelled');
  /* WHAT AN ORDER SAYS WAS PAID, which only names who paid: never its total, which is what it comes to. */
  assert.equal(week.due.paid, 'paid');
  /* WITH ITS BOOKS the week is still the orders: what came in is Money's own figures, read the same on every record. */
  const books = weekOf(SHOP_BOOKS, people);
  assert.equal(books?.due.register, 'orders', 'a bill owes a required amount and is never the week');
  assert.equal(books?.due.paid, 'paid');
});

test('A RECORD THAT KEEPS NO WEEK reads its Today as it did: bills, tasks and money are never taken for one', () => {
  assert.equal(weekOf(declsOf(['people', 'money-core', 'work']), people), undefined);
  assert.equal(weekOf(SHOP, null), undefined, 'no People, nobody an order could be for');
  assert.deepEqual(todayHome({ tasks: true, adds: true, money: true, week: undefined }), DEFAULT_HOME);
});

/** Where a shop's two week blocks stand in a body: what is due this week, and the money in beside it. */
const weekAt = (blocks: readonly { heading?: string }[]): [number, number] => [blocks.findIndex((b) => b.heading === 'Orders due this week'), blocks.findIndex((b) => b.heading === MONEY_WEEK)];

test("ON A SHOP, TODAY'S WEEK is what is due this week and the money in, after what needs you and what is late", () => {
  const body = todayHome({ tasks: false, adds: false, money: false, week: weekOf(SHOP, people)! });
  /* NEEDS YOU LEADS THE BOARD ON EVERY WIDTH (audit Q18), Late after it, then the week, side by side. */
  const order = body.blocks.map((b) => b.heading ?? b.kind);
  assert.deepEqual(order.slice(0, 5), ['note', 'Needs you', 'Late', 'Orders due this week', MONEY_WEEK]);
  const rest = body.blocks.slice(5).map((b) => b.source);
  assert.deepEqual(rest, ['kpis', 'deadlines', 'activity']);
  const [due, money] = weekAt(body.blocks);
  /* THEIR OWN WORDS name their own things, never an id or a list's place. */
  for (const b of [body.blocks[due]!, body.blocks[money]!]) {
    assert.doesNotMatch(`${b.heading} ${b.empty ?? ''}`, /\brow\b|—|#/u);
    assert.ok(b.icon);
  }
  assert.equal(body.blocks[due]!.where, 'state is not paid, due after -1d, due before +8d');
  /* THE MONEY IS MONEY'S OWN FIGURES, never a list read for it (`money-week.test.ts` holds them). */
  assert.equal(body.blocks[money]!.kind, 'stat');
  assert.equal(body.blocks[money]!.source, undefined);
});

/* ── a fresh shop record ───────────────────────────────────────────────── */

test('A FRESH SHOP RECORD OPENS ON THE CARD under its line, with no next step yet and no empty tile', () => {
  const fresh = bootOf(SHOP, { [people!]: 1 });
  assert.equal(showTell(fresh), true);
  assert.deepEqual(wantMore(fresh, {}), [], 'the card is the first act, alone');
  /* EVERY BLOCK OF TODAY'S BODY ANSWERED EMPTY: nothing is drawn, so the card is all there is under the line. */
  const week = weekOf(SHOP, people)!;
  const body = todayHome({ tasks: false, adds: false, money: false, week });
  const drawn = homeDrawn(body.blocks.map((b) => answer(b)), NOW, undefined, undefined, null, week);
  assert.equal(drawsAny(drawn.blocks), false, 'no empty tile');
  /* HOME MOUNTS THE CARD while `showTell` says so, says its line, and keeps the examples' offer where it was. */
  const src = homeSource();
  assert.match(src, /const tell = \$derived\([^;]*showTell\(/u);
  assert.match(src, /\{#if tell\}<TellOne options=\{tellOptions\} onadded=\{toldOne\} \/>\{\/if\}/u);
  /* NO HEAD SENTENCE OVER THE CARD (T7): the made screen just said it, and the card's title and foot say the rest. */
  assert.match(src, /sentence=\{tell \? undefined :/u);
  assert.equal(TELL_LINE, 'Your BrainDog is ready. Start with something from today, and watch where it goes.');
  assert.ok(!TELL_LINE.startsWith('Tell it one real thing'), 'the line does not say the card\'s title again');
  assert.ok(src.indexOf('<ClearExamples />') < src.indexOf('<TellOne'), 'the examples offer stays first');
  assert.ok(src.indexOf('<PageView') < src.indexOf('<WantMore'), 'the next steps sit under Today’s blocks');
  /* A RECORD WITH NO ENTRY YET IS NOT "EMPTY": it holds lists, and the card is drawn rather than Start here. */
  assert.match(src, /const empty = \$derived\([^;]*data\.lists\.length === 0/u);
});

/* ── after the Nadia sentence ──────────────────────────────────────────── */

/** The order "Nadia wants 3 vanilla jars for Friday, paid 900 on InstaPay" adds, as the record answers it. */
const NADIA = { who: 'people#2', what: '3 vanilla jars', how_many: 3, due: FRIDAY, paid: { amount: 90_000, currency: 'EGP' }, state: 'new' };

test('AFTER A CAPTURE OF THREE ENTRIES the line and the first two blocks read them: "1 order is due Friday. Nadia paid EGP 900."', () => {
  /* A CLIENT, AN ORDER AND WHAT SHE PAID: the card goes, and the next steps take its place. */
  const told = bootOf(SHOP, { [people!]: 2, orders: 1 });
  assert.equal(showTell(told), false);
  assert.ok(wantMore(told, {}).length > 0);
  assert.ok(addedByHand(told) <= FIRST_TODAY_MOST, 'still a first Today');
  const week = weekOf(SHOP, people)!;
  const body = todayHome({ tasks: false, adds: false, money: false, week });
  const [dueAt, moneyAt] = weekAt(body.blocks);
  /* HER PAYMENT IS A PAID INVOICE (no account yet), so `settled-in-7d` reads it; the ledger and what is owed read nought. */
  const live = body.blocks.map((b, n) =>
    n === dueAt
      ? answer(b, [{ fields: NADIA, cells: ['Nadia', '3 vanilla jars', 'Fri'] }])
      : n === moneyAt
        ? tile(b, { 'settled-in-7d': 'EGP 900.00', 'received-7d': '0', 'owed-to-you': 'EGP 0.00' })
        : answer(b),
  );
  const drawn = homeDrawn(live, NOW, undefined, undefined, null, week);
  assert.deepEqual(drawn.sentence, { text: '1 order is due Friday. Nadia paid EGP 900.', needs: '' });
  assert.deepEqual(
    drawn.blocks.filter((b) => b.drawn).map((b) => b.heading),
    ['Orders due this week', MONEY_WEEK],
  );
  /* THE TILE READS "Paid EGP 900" and nothing else: a nought is no figure. */
  const money = drawn.blocks.find((b) => b.heading === MONEY_WEEK)!;
  assert.deepEqual(money.metrics?.map((m) => [m.label, m.value]), [['Came in', 'EGP 900.00']]);
  /* WITHOUT THE WEEK, as on a page the record declares, the house line stands. */
  assert.notEqual(homeDrawn(live, NOW, undefined, undefined, null).sentence?.text, drawn.sentence?.text);
});

test('ON A SHOP THAT KEEPS ITS BOOKS the line reads the tile: one payment by who paid, else the amounts side by side, never added', () => {
  const week = weekOf(SHOP_BOOKS, people)!;
  const body = todayHome({ tasks: false, adds: false, money: true, week });
  const [dueAt, at] = weekAt(body.blocks);
  const lineOf = (cells: Record<string, string>, orders: { fields: Record<string, unknown>; cells: string[] }[] = []) =>
    homeDrawn(body.blocks.map((b, n) => (n === at ? tile(b, cells) : n === dueAt ? answer(b, orders) : answer(b))), NOW, undefined, undefined, null, week).sentence?.text;
  const order = { fields: NADIA, cells: ['Nadia', '3 vanilla jars', 'Fri'] };
  /* WHO PAID ONLY WHERE AN ORDER DUE THIS WEEK WAS PAID THAT VERY AMOUNT: a ledger payment of another amount is just money in. */
  assert.equal(lineOf({ 'received-7d': 'EGP 900.00' }, [order]), '1 order is due Friday. Nadia paid EGP 900.');
  assert.equal(lineOf({ 'received-7d': 'EGP 1,200.50' }, [order]), '1 order is due Friday. EGP 1,200.50 came in this week.');
  assert.equal(lineOf({ 'received-7d': 'EGP 900.00' }), 'EGP 900 came in this week.');
  /* TWO CURRENCIES, AND THE TWO FIGURES, are said side by side and never added, each figure by the tile's name for it. */
  assert.equal(lineOf({ 'received-7d': 'EGP 900.00 · USD 40.00' }), 'EGP 900 and USD 40 came in this week.');
  assert.equal(lineOf({ 'settled-in-7d': 'EGP 900.00', 'received-7d': 'EGP 150.00' }, [order]), '1 order is due Friday. EGP 900 came in, and EGP 150 reached your accounts this week.');
  /* NOTHING IN: the house line stands, with no "0 came in". */
  assert.doesNotMatch(lineOf({ 'settled-in-7d': 'EGP 0.00', 'received-7d': '0' }) ?? '', /came in|paid/u);
  assert.equal(amountSpoken(90_000, 'EGP'), 'EGP 900');
  assert.equal(amountSpoken(1_500, 'JPY'), 'JPY 1,500');
});

test('A LATE ORDER IS SAID FIRST, in red with its word, as its own count, and drawn once: under Late, never in what is due this week', () => {
  const week = weekOf(SHOP, people)!;
  const body = todayHome({ tasks: false, adds: false, money: false, week });
  const late = { ...NADIA, due: '2026-10-05', paid: undefined };
  const due = { ...NADIA, what: '2 cedar candles' };
  const [dueAt] = weekAt(body.blocks);
  const live = body.blocks.map((b, n) => {
    /* THE TILE COUNTS FROM TODAY (`due after -1d`), so the record answers it with the one not yet past its day. */
    if (n === dueAt) return { ...answer(b, [{ fields: due, cells: ['Nadia', '2 cedar candles', 'Fri'] }]), entries: [{ seq: 2, fields: due, version: 1, created: '', by: '' }] } as LiveBlock;
    /* THE RECORD'S DEADLINES NAME THE LATE ORDER BY ITS LIST AND NUMBER, and Late draws it. */
    if (b.source === 'deadlines' && b.where === 'day before today') return answer(b, [{ fields: { row: 'orders#1', title: '3 vanilla jars', day: '2026-10-05' }, cells: ['3 vanilla jars', '', ''] }]);
    return answer(b);
  });
  const drawn = homeDrawn(live, NOW, undefined, undefined, null, week);
  assert.match(String(body.blocks[dueAt]!.where), /due after -1d, due before \+8d$/u);
  assert.deepEqual(drawn.sentence, { text: '1 order is late. 1 more is due Friday.', needs: '1 order is late' });
  assert.ok(drawn.sentence!.text.includes(drawn.sentence!.needs), 'the red phrase is in the line, with its word');
  assert.doesNotMatch(drawn.sentence!.text, /thing/u, 'and it is said once: the house line does not count it again');
  assert.deepEqual(drawn.blocks.filter((b) => b.drawn).map((b) => [b.heading, b.entries.length]), [['Late', 1], ['Orders due this week', 1]]);
  /* A HOME KEPT FROM AN OLDER TODAY, whose tile still reads the late one, says the same line and draws it once. */
  const older = live.map((b, n) => (n === dueAt ? answer(b, [{ fields: late, cells: ['Nadia', '3 vanilla jars', 'Yesterday'] }, { fields: due, cells: ['Nadia', '2 cedar candles', 'Fri'] }]) : b));
  const kept = homeDrawn(older, NOW, undefined, undefined, null, week);
  assert.deepEqual(kept.sentence, drawn.sentence);
  assert.deepEqual(kept.blocks.filter((b) => b.drawn).map((b) => b.heading), ['Orders due this week']);
});

/* ── Hide, and a record that is not a first one ────────────────────────── */

test('HIDE HOLDS: hidden next steps are none, on this visit and the next, and Home reads the preference again on Hide', () => {
  const told = bootOf(SHOP, { [people!]: 2, orders: 1 });
  assert.deepEqual(wantMore(told, { nextStepsHidden: true }), []);
  const src = homeSource();
  assert.match(src, /prefs\.nextStepsHidden === true/u);
  assert.match(src, /<WantMore \{steps\} onhide=\{\(\) => \(prefs = readPref\(\)\)\} \/>/u);
});

test('A RECORD WITH ENTRIES TYPED BY HAND draws no card, and one kept for months is offered no next steps: its Today is as it was', () => {
  const typed = bootOf(SHOP, { [people!]: 3, orders: 4, products: 6 });
  assert.equal(showTell(typed), false);
  /* A RECORD KEPT FOR MONTHS holds far more than one sentence becomes. */
  const kept = bootOf(declsOf(['people', 'money-core', 'work']), { [people!]: 40, tasks: 300 });
  assert.equal(showTell(kept), false);
  assert.ok(addedByHand(kept) > FIRST_TODAY_MOST);
  assert.match(homeSource(), /added > FIRST_TODAY_MOST\) return \[\]/u);
  /* AND A PAGE THE RECORD DECLARES IS HANDED NO WEEK: its line and its blocks are its own. */
  assert.match(homeSource(), /homeDrawn\([^)]*declares === null \? holds\.week : undefined\)/u);
});

test('ADD, THEN UNDO, TAKES TODAY BACK TO THE CARD: the counts are read again from the record after the press, each time it moves', () => {
  /* WHAT THE RECORD COUNTS AFTER THE UNDO is a fresh shop again, and the card is the first act once more. */
  const told = bootOf(SHOP, { [people!]: 2, orders: 1 });
  const undone = bootOf(SHOP, { [people!]: 1 });
  assert.equal(showTell(told), false);
  assert.equal(showTell(undone), true);
  assert.deepEqual(wantMore(undone, {}), []);
  /* HOME COUNTS FROM `boot` READ AGAIN, never only from the shell it was loaded with, and the press holds the card off
     only until that read answers. */
  const src = homeSource();
  assert.match(src, /if \(!pressed\) return;\s*void moving\.version;/u);
  assert.match(src, /rereadBoot\(base\)/u);
  assert.match(src, /count: counted \? \(counted\.get\(l\.id\) \?\? 0\)/u);
  assert.match(src, /const told = \$derived\(pressed && counted === null\)/u);
  assert.match(src, /const tell = \$derived\(first && !told && showTell\(kept, prefs\)\)/u);
});

test("A COLLEAGUE OR A READER IS NOT ONBOARDED on somebody else's record: no card and no next steps", () => {
  const src = homeSource();
  assert.match(src, /const first = \$derived\([^;]*landing\(data\) === null && may\(data, 'append'\)\)/u);
  assert.match(src, /if \(!first \|\| prefs\.nextStepsHidden === true/u);
});
