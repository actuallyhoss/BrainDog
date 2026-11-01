/**
 * Rates that are out of date are said once a page, at its foot, with the way to keep them current.
 *
 * The sentence used to be printed under every converted tile and had nothing to press. A tile still says which day's
 * rates it was converted at; that they are out of date, and what to do, is the page's one note (`footed`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { money } from 'braindog-render';

import { copy } from '../copy.ts';
import { ratesPreset } from './action-draft.ts';
import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf, footWords, footed, learnRates, onceATile, pageReader, ratesActionOf, tileOf, type Fetch, type LiveBlock } from './page-live.ts';

/* THE PRESET'S NAME IS LEARNT BY `import()` (`learnRates`), as the reader learns it before it draws a foot. */
await learnRates();

const NOW = Date.parse('2026-10-13T09:00:00Z');

const fx = (more: Record<string, unknown> = {}) => ({ into: 'EGP', home: 'EGP', asOf: '2026-09-28', forward: false, stale: true, missing: [], ...more });

const reading = (more: Record<string, unknown> = {}) => ({ value: 4200000, unit: 'EGP', rows: 3, held: 3, met: null, refusals: [], ...more });

/** A block of tiles as the record answers one. */
const tiles = (...readings: unknown[]) =>
  ({ kind: 'stat', heading: 'Money', cells: readings.map(() => ({ metric: 'overdue' })), readings: readings.map((r) => ({ metric: 'overdue', label: 'Owed', reading: r })), rows: [], matched: 0, refusals: [] }) as never;

/** A page's blocks as the reader draws them: each block, then the foot, on a record that holds no action at all. */
const page = (...answered: never[]): LiveBlock[] => pageWith([], ...answered);

/** The same, on a record whose scheduled actions are `actions`, or `null` where they could not be read. */
const pageWith = (actions: { ingest: string }[] | null, ...answered: never[]): LiveBlock[] =>
  footed(answered, answered.map((b) => blockOf(b, new Map(), NOW)), NOW, actions);

/** The name the rates action is filed under, as the sheet's own preset files it. */
const RATES = ratesPreset({ currencies: ['USD', 'EGP'], home: 'EGP' })!.filled!.ingest;

const STALE = copy.figureConvertedStale('28 Sep 2026');

test('out of date rates are said once, at the foot, with the way to keep them current, and under no tile', () => {
  const blocks = page(tiles(reading({ fx: fx() }), reading({ fx: fx() })), tiles(reading({ fx: fx({ asOf: '2026-09-30' }) })));
  assert.equal(blocks.length, 3, 'two blocks of tiles and one note');
  const foot = blocks[2]!;
  assert.equal(foot.kind, 'note');
  assert.equal(foot.drawn, true);
  assert.equal(foot.body, footWords.ratesStale('28 Sep 2026', 'none', 15), 'the oldest day is the one named');
  assert.match(foot.body ?? '', /out of date/u);
  assert.match(foot.body ?? '', /\[Keep rates current\]\(\/addons\/money-core#keep-rates\)/u);
  assert.doesNotMatch(foot.body ?? '', /—/u);
  const notes = blocks.slice(0, 2).flatMap((b) => (b.metrics ?? []).map((m) => m.note));
  assert.equal(notes.length, 3);
  /* AND THE FOOT IS WHERE THEY ARE SAID, SINCE THE LOOK OF 27 OCTOBER: a tile converted at them says nothing of them, where
     each of three tiles said its day over a foot that said it again. The foot is amber and says how old they are. */
  for (const note of notes) {
    assert.doesNotMatch(note ?? '', /out of date/u);
    assert.notEqual(note, STALE);
    assert.doesNotMatch(note ?? '', /Converted at rates/u);
  }
  assert.equal(foot.tone, 'warn');
  assert.match(foot.body ?? '', /15 days old/u);
});

test('the foot says the rate itself where the record sends it, one a currency, and the larger way round', () => {
  const pairs = [{ from: 'USD', rate: 50.5 }];
  /* ONE OF A CURRENCY IS WRITTEN AS EVERY AMOUNT IS, with no pennies: `$1` or `USD 1` as the record's home says it. */
  const unit = (currency: string): string => money(100, currency).replace(/\.0+$/u, '');
  const one = page(tiles(reading({ fx: fx({ pairs }) })))[1]!;
  assert.equal(one.body, footWords.ratesStale('28 Sep 2026', 'none', 15, `${unit('USD')} = ${money(5050, 'EGP')}`));
  assert.ok(
    (one.body ?? '').startsWith(`${unit('USD')} = ${money(5050, 'EGP')}, the rate from 28 Sep 2026, is 15 days old, so figures on this page converted at it are out of date. [Keep rates current]`),
    one.body,
  );
  const two = page(tiles(reading({ fx: fx({ into: 'GBP', home: 'GBP', pairs: [{ from: 'EGP', rate: 0.0155 }, { from: 'USD', rate: 0.74 }] }) })))[1]!;
  assert.ok(
    (two.body ?? '').startsWith(`${unit('GBP')} = ${money(6452, 'EGP')} and ${unit('GBP')} = ${money(135, 'USD')}, the rates from 28 Sep 2026, are 15 days old, so figures on this page converted at them are out of date.`),
    two.body,
  );
});

test('a tile converted at current rates says their day once, under the last figure that was', () => {
  const current = fx({ stale: false });
  const [block] = page(tiles(reading({ fx: current }), reading({ fx: current }), reading()));
  const notes = (block!.metrics ?? []).map((m) => m.note ?? '');
  assert.deepEqual(notes.map((n) => /Converted at rates as of 28 Sep 2026\.$/u.test(n)), [false, true, false]);
});

test('a tile whose other figure already names the rate says its day under none', () => {
  const said = copy.figureConverted('28 Sep 2026');
  const tile = (note: string) => ({ id: 'x', label: 'X', value: '1', note });
  const got = onceATile([tile("EGP 5,000 and $100 USD at 28 Sep's rate, 1 day old"), tile(`Bills due · ${said}`)]);
  assert.deepEqual(got.map((m) => m.note), ["EGP 5,000 and $100 USD at 28 Sep's rate, 1 day old", 'Bills due']);
});

test('a page with no out of date rate gains nothing', () => {
  const answered = [tiles(reading({ fx: fx({ stale: false }) }), reading())];
  const drawn = answered.map((b) => blockOf(b, new Map(), NOW));
  const blocks = footed(answered, drawn, NOW, []);
  assert.equal(blocks, drawn, 'the same blocks, untouched');
  assert.equal(blocks.some((b) => b.synthetic), false, 'and nothing on the page is marked as the page\'s own');
  assert.equal(blocks[0]!.metrics![0]!.note?.endsWith(copy.figureConverted('28 Sep 2026')), true);
  assert.doesNotMatch(blocks[0]!.metrics![1]!.note ?? '', /Converted/u);
  assert.deepEqual(footed([], [], NOW, []), []);
});

test('a tile with a missing rate keeps its own sentence, and is not what the foot is about', () => {
  const parts = [{ amount: 100000, currency: 'EGP' }, { amount: 5000, currency: 'USD' }];
  const missing = reading({ value: null, unit: null, parts, fx: fx({ missing: ['USD to EGP'] }) });
  const alone = page(tiles(missing));
  assert.equal(alone.length, 1, 'a rate that is missing is not a rate out of date');
  assert.equal(alone[0]!.metrics![0]!.note, copy.figureNoRate('USD to EGP'));

  const both = page(tiles(missing, reading({ fx: fx() })));
  assert.equal(both.length, 2);
  assert.equal(both[0]!.metrics![0]!.note, copy.figureNoRate('USD to EGP'));
  assert.equal(both[1]!.body, footWords.ratesStale('28 Sep 2026', 'none', 15));
});

test('a tile drawn off a page, with no foot under it, still says its rates are out of date', () => {
  assert.equal(tileOf({ metric: 'overdue', reading: reading({ fx: fx() }) } as never).note?.endsWith(STALE), true);
});

test('a block that is not drawn does not ask for the foot', () => {
  const hidden = { ...(tiles(reading({ fx: fx() })) as object), drawn: false } as never;
  assert.equal(page(hidden).length, 1);
});

/* THE FOOT IS THE PAGE'S OWN AND NO BLOCK OF THE DECLARATION. Arrange and Change this page count the
   blocks a person declared, and a save is refused when the count is off by the one the reader added. */
test('the foot says it is not one of the blocks the page declares', () => {
  const blocks = page(tiles(reading({ fx: fx() })));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1]!.synthetic, true);
  assert.equal(blocks[0]!.synthetic, undefined, 'a declared block carries no mark');
  assert.equal(blocks.filter((b) => !b.synthetic).length, 1, 'which leaves the count a save is held to');
});

/* AND IT OFFERS THE NEW ACTION ONLY WHERE THERE IS NONE (claim 2): a record that already fetches rates, paused or
   failing, was offered a second copy when what it needed was the one it has. */
test('a record with no rates action is offered one', () => {
  for (const actions of [[], [{ ingest: 'site-stats' }]]) {
    const body = pageWith(actions, tiles(reading({ fx: fx() })))[1]!.body ?? '';
    assert.match(body, /\[Keep rates current\]\(\/addons\/money-core#keep-rates\)$/u);
  }
});

test('a record that holds a rates action is sent to it, and is not offered a second', () => {
  assert.equal(ratesActionOf([{ ingest: 'site-stats' }, { ingest: RATES }])?.ingest, RATES);
  assert.equal(ratesActionOf([{ ingest: 'site-stats' }]), null);
  /* One name whatever the record holds, which is why opening the preset again replaces the action and joins nothing. */
  assert.equal(ratesPreset({ currencies: ['GBP', 'EUR', 'JPY'], home: 'USD' })!.filled!.ingest, RATES);

  const body = pageWith([{ ingest: 'site-stats' }, { ingest: RATES }], tiles(reading({ fx: fx() })))[1]!.body ?? '';
  assert.equal(body, footWords.ratesStale('28 Sep 2026', 'held', 15));
  assert.doesNotMatch(body, /Keep rates current|preset=rates|new=action/u);
  assert.match(body, /\]\(\/automations\?tab=scheduled\)$/u, 'where the action is listed, with its state and its way back on');
  assert.doesNotMatch(body, new RegExp(RATES, 'u'), 'and its filing name is not read out');
  assert.doesNotMatch(body, /—/u);
});

test('where the actions could not be read, the foot says its sentence and offers nothing', () => {
  const foot = pageWith(null, tiles(reading({ fx: fx() })))[1]!;
  assert.equal(foot.body, footWords.ratesStale('28 Sep 2026', 'unread', 15));
  assert.doesNotMatch(foot.body ?? '', /\]\(/u);
  assert.match(foot.body ?? '', /out of date\.$/u);
  assert.equal(foot.synthetic, true);
});

/* A FIGURE IS OUT OF DATE WHEREVER IT IS DRAWN: only tiles asked for the foot, so a page whose one
   converted figure was a bar, a split or a sentence said nothing at all about the rates under it. */
const charted = (kind: 'bar' | 'split', r: unknown) =>
  ({ kind, heading: 'Owed by client', source: 'metric.overdue', readings: [{ metric: 'overdue', reading: r }], rows: [], matched: 2, refusals: [] }) as never;

const GROUPS = [
  { key: 'kiln', label: 'Kiln', value: 3000000 },
  { key: 'oak', label: 'Oak', value: 1200000 },
];

/** A note with one figure in its sentence, and how the record says that figure was converted. */
const note = (how: unknown) =>
  ({ kind: 'note', body: 'You are owed {{overdue}}.', values: { overdue: { amount: 4200000, currency: 'EGP' } }, ...(how === undefined ? {} : { values_fx: how }), rows: [], matched: 0, refusals: [] }) as never;

test('a bar and a split over a figure converted at out of date rates ask for the foot', () => {
  for (const kind of ['bar', 'split'] as const) {
    const out = page(charted(kind, reading({ fx: fx(), groups: GROUPS })));
    assert.equal(out.length, 2, kind);
    assert.ok(out[0]!.parts, 'drawn as its parts, and no tile');
    assert.equal(out[0]!.metrics, undefined);
    assert.equal(out[1]!.body, footWords.ratesStale('28 Sep 2026', 'none', 15));
    assert.equal(out[1]!.synthetic, true);

    assert.equal(page(charted(kind, reading({ fx: fx({ stale: false }), groups: GROUPS }))).length, 1, 'current rates ask nothing');
    assert.equal(page(charted(kind, null)).length, 1, 'and neither does a figure the record could not read');
  }
});

test('a note whose figure was converted at out of date rates asks for the foot', () => {
  const out = page(note({ overdue: fx() }));
  assert.equal(out.length, 2);
  assert.equal(out[0]!.kind, 'note');
  assert.equal(out[1]!.body, footWords.ratesStale('28 Sep 2026', 'none', 15));

  assert.equal(page(note(undefined)).length, 1, 'a record that says nothing of the rates asks nothing');
  assert.equal(page(note({ overdue: fx({ stale: false }) })).length, 1);
  /* NARROWED, NEVER TRUSTED: a day that is no day, a path the note does not hold, and a shape that is no map. */
  assert.equal(page(note({ overdue: fx({ asOf: 'last week' }) })).length, 1);
  assert.equal(page(note({ 'cash-now': fx() })).length, 1);
  assert.equal(page(note([fx()])).length, 1);
  /* A note that is not drawn says no figure, so it has none out of date. */
  assert.equal(page({ ...(note({ overdue: fx() }) as object), drawn: false } as never).length, 1);
});

test('the foot names the oldest day across tiles, bars and notes, and is said once', () => {
  const out = page(
    tiles(reading({ fx: fx({ asOf: '2026-09-28' }) })),
    charted('bar', reading({ fx: fx({ asOf: '2026-09-11' }), groups: GROUPS })),
    note({ overdue: fx({ asOf: '2026-09-20' }) }),
  );
  assert.equal(out.length, 4);
  assert.equal(out[3]!.body, footWords.ratesStale('11 Sep 2026', 'none', 32));
});

/* AN ACTION SOMEBODY DRAFTED BY HAND IS A RATES ACTION BY WHAT IT DOES: it writes the list the preset writes. Found by
   its filing name alone it read as none, and the foot offered a second copy beside the one already fetching. */
test('a rates action drafted by hand under a name of its own is known by the list it writes', () => {
  const list = ratesPreset({ currencies: ['USD', 'EGP'], home: 'EGP' })!.filled!.register;
  assert.notEqual(list, '');
  const mine = { ingest: 'rates_by_hand', writes: list };
  assert.equal(ratesActionOf([{ ingest: 'site-stats', writes: 'readings' }, mine]), mine);
  assert.equal(ratesActionOf([{ ingest: 'site-stats', writes: 'readings' }, { ingest: 'older', writes: null }]), null);
  assert.equal(ratesActionOf([{ ingest: 'nameless', writes: '' }]), null, 'an action that writes no list is not one');
  /* The preset's own, when both are held, since that is the one the sheet would open again. */
  assert.equal(ratesActionOf([mine, { ingest: RATES }])?.ingest, RATES);

  const body = pageWith([mine], tiles(reading({ fx: fx() })))[1]!.body ?? '';
  assert.equal(body, footWords.ratesStale('28 Sep 2026', 'held', 15));
  assert.doesNotMatch(body, /Keep rates current|rates_by_hand/u);
});

/* THE READER ASKS FOR THE ACTIONS ONLY WHEN IT HAS A FOOT TO SAY, so a page with current rates costs no second read. */
const BASE = 'http://record.test';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(blocks: unknown[], actions: Response | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    sent.push(method);
    if (method === 'page') return json(200, { ok: true, value: { page: 'money', title: 'Money', blocks } });
    if (method === 'actions' && actions) return actions;
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, sent };
}

const read = async (io: Fetch): Promise<LiveBlock[]> => {
  const out = await pageReader(BASE, io, () => NOW).read('money');
  assert.equal(out.from, 'live');
  return out.from === 'live' ? out.page.blocks : [];
};

test('the reader looks for a rates action when rates are out of date, and only then', async () => {
  const stale = [tiles(reading({ fx: fx() }))];

  const none = host(stale, json(200, { ok: true, value: [] }));
  const offered = await read(none.io);
  assert.equal(none.sent.filter((m) => m === 'actions').length, 1);
  assert.equal(offered.at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'none', 15));
  assert.equal(offered.at(-1)!.synthetic, true);

  const held = host(stale, json(200, { ok: true, value: [{ ingest: RATES, channel: 'poll', state: 'paused' }] }));
  assert.equal((await read(held.io)).at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'held', 15));

  const refused = host(stale, json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read that.' } }));
  assert.equal((await read(refused.io)).at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'unread', 15));

  /* A BAR ALONE IS ENOUGH TO ASK, and an action drafted by hand answers it. */
  const byHand = host([charted('bar', reading({ fx: fx(), groups: GROUPS }))], json(200, { ok: true, value: [{ ingest: 'rates_by_hand', writes: ratesPreset({ currencies: ['USD', 'EGP'], home: 'EGP' })!.filled!.register, channel: 'poll', state: 'pending' }] }));
  assert.equal((await read(byHand.io)).at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'held', 15));
  assert.equal(byHand.sent.filter((m) => m === 'actions').length, 1);

  const current = host([tiles(reading({ fx: fx({ stale: false }) }))], json(200, { ok: true, value: [] }));
  const plain = await read(current.io);
  assert.equal(plain.length, 1);
  assert.equal(current.sent.includes('actions'), false, 'a page with nothing out of date asks nothing more');
});

/* A BAR OR A SPLIT OVER A LIST'S OWN MONEY IS CONVERTED HERE, NOT BY THE RECORD: it carries no
   reading and no `values_fx`, so it asked for no foot however old the rates it was drawn with. */
const HOLDINGS = { id: 'holdings', name: 'Holdings', one: 'holding', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'balance', type: 'money' }] };

/** A bar or split over a list of holdings, as the record answers one: its entries, and the home currency and rates beside them. */
const held = (kind: 'bar' | 'split', asOf: string | null, money: [string, number, string][] = [['Till', 250_000, 'GBP'], ['Harbour', 100_000, 'USD']]) => {
  REGISTERS.holdings = HOLDINGS as never;
  return {
    kind,
    heading: 'Held',
    source: 'register.holdings',
    columns: [{ field: 'name' }, { field: 'balance' }],
    rows: money.map(([name, amount, currency], i) => ({ id: `h${i + 1}`, seq: i + 1, fields: { name, balance: { amount, currency } }, version: 1, created_at: '2026-09-01T09:00:00.000Z' })),
    matched: money.length,
    refusals: [],
    fx: { home: 'GBP', rates: asOf === null ? [] : [{ currency: 'USD', base: 'GBP', rate: 0.8, as_of: asOf }] },
  } as never;
};

test('a bar and a split over a list holding pounds and dollars ask for the foot when the rates are a month old', () => {
  for (const kind of ['bar', 'split'] as const) {
    const out = page(held(kind, '2026-09-13'));
    assert.equal(out.length, 2, kind);
    assert.equal(out[0]!.parts, undefined, 'over the list itself, and no figure');
    assert.equal(out[1]!.body, footWords.ratesStale('13 Sep 2026', 'none', 30));
    assert.equal(out[1]!.synthetic, true);
    /* The bar is drawn as it was: converted into pounds, with the day of its rates under it. */
    const said = JSON.stringify(toSegments(out[0]!));
    assert.match(said, /converted from USD/u);
    assert.match(said, /13 Sep/u);
  }
});

test('the same bar with rates a day old, or all in the home currency, asks for nothing', () => {
  for (const kind of ['bar', 'split'] as const) {
    assert.equal(page(held(kind, '2026-10-12')).length, 1, `${kind}, a day old`);
    const home = held(kind, '2026-09-13', [['Till', 250_000, 'GBP'], ['Safe', 90_000, 'GBP']]);
    assert.equal(page(home).length, 1, `${kind}, all in pounds, however old the rates beside it`);
    assert.equal(page(held(kind, null)).length, 1, `${kind}, no rate at all: drawn once a currency, and nothing converted`);
  }
});

test('two bars over lists say the foot once, with the oldest day, and a bar that is not drawn asks nothing', () => {
  const out = page(held('bar', '2026-09-13'), held('split', '2026-08-30'), tiles(reading({ fx: fx() })));
  assert.equal(out.length, 4);
  assert.equal(out[3]!.body, footWords.ratesStale('30 Aug 2026', 'none', 44));
  assert.equal(out.filter((b) => b.synthetic).length, 1);

  const answered = [held('bar', '2026-09-13')];
  const drawn = answered.map((b) => blockOf(b, new Map(), NOW));
  assert.equal(footed(answered, drawn.map((b) => ({ ...b, drawn: false })), NOW, []).length, 1);
  assert.equal(footed(answered, drawn.map((b) => ({ ...b, cannot: 'This cannot be drawn yet.' })), NOW, []).length, 1);
});

test('the reader looks for a rates action for a bar over a list too', async () => {
  const stale = host([held('bar', '2026-09-13')], json(200, { ok: true, value: [{ ingest: RATES, channel: 'poll', state: 'pending' }] }));
  assert.equal((await read(stale.io)).at(-1)!.body, footWords.ratesStale('13 Sep 2026', 'held', 30));
  assert.equal(stale.sent.filter((m) => m === 'actions').length, 1);

  const current = host([held('bar', '2026-10-12')], json(200, { ok: true, value: [] }));
  assert.equal((await read(current.io)).length, 1);
  assert.equal(current.sent.includes('actions'), false);
});
