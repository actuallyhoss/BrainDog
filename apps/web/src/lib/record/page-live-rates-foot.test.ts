/**
 * Rates that are out of date are said once a page, at its foot, with the way to keep them current.
 *
 * The sentence used to be printed under every converted tile and had nothing to press. A tile still says which day's
 * rates it was converted at; that they are out of date, and what to do, is the page's one note (`footed`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { ratesPreset } from './action-draft.ts';
import { blockOf, footWords, footed, pageReader, ratesActionOf, tileOf, type Fetch, type LiveBlock } from './page-live.ts';

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
  assert.equal(foot.body, footWords.ratesStale('28 Sep 2026', 'none'), 'the oldest day is the one named');
  assert.match(foot.body ?? '', /out of date/u);
  assert.match(foot.body ?? '', /\[Keep rates current\]\(\/automations\?new=action&preset=rates\)/u);
  assert.doesNotMatch(foot.body ?? '', /—/u);
  const notes = blocks.slice(0, 2).flatMap((b) => (b.metrics ?? []).map((m) => m.note));
  assert.equal(notes.length, 3);
  for (const note of notes) {
    assert.doesNotMatch(note ?? '', /out of date/u);
    assert.notEqual(note, STALE);
    assert.match(note ?? '', /(^| · )Converted at rates as of (28|30) Sep 2026\.$/u, 'a tile still says which day its rates are from');
  }
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
  assert.equal(both[1]!.body, footWords.ratesStale('28 Sep 2026', 'none'));
});

test('a tile drawn off a page, with no foot under it, still says its rates are out of date', () => {
  assert.equal(tileOf({ metric: 'overdue', reading: reading({ fx: fx() }) } as never).note?.endsWith(STALE), true);
});

test('a block that is not drawn does not ask for the foot', () => {
  const hidden = { ...(tiles(reading({ fx: fx() })) as object), drawn: false } as never;
  assert.equal(page(hidden).length, 1);
});

/* THE FOOT IS THE PAGE'S OWN AND NO BLOCK OF THE DECLARATION (audit 74, claim 1). Arrange and Change this page count the
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
    assert.match(body, /\[Keep rates current\]\(\/automations\?new=action&preset=rates\)$/u);
  }
});

test('a record that holds a rates action is sent to it, and is not offered a second', () => {
  assert.equal(ratesActionOf([{ ingest: 'site-stats' }, { ingest: RATES }])?.ingest, RATES);
  assert.equal(ratesActionOf([{ ingest: 'site-stats' }]), null);
  /* One name whatever the record holds, which is why opening the preset again replaces the action and joins nothing. */
  assert.equal(ratesPreset({ currencies: ['GBP', 'EUR', 'JPY'], home: 'USD' })!.filled!.ingest, RATES);

  const body = pageWith([{ ingest: 'site-stats' }, { ingest: RATES }], tiles(reading({ fx: fx() })))[1]!.body ?? '';
  assert.equal(body, footWords.ratesStale('28 Sep 2026', 'held'));
  assert.doesNotMatch(body, /Keep rates current|preset=rates|new=action/u);
  assert.match(body, /\]\(\/automations\?tab=scheduled\)$/u, 'where the action is listed, with its state and its way back on');
  assert.doesNotMatch(body, new RegExp(RATES, 'u'), 'and its filing name is not read out');
  assert.doesNotMatch(body, /—/u);
});

test('where the actions could not be read, the foot says its sentence and offers nothing', () => {
  const foot = pageWith(null, tiles(reading({ fx: fx() })))[1]!;
  assert.equal(foot.body, footWords.ratesStale('28 Sep 2026', 'unread'));
  assert.doesNotMatch(foot.body ?? '', /\]\(/u);
  assert.match(foot.body ?? '', /out of date\.$/u);
  assert.equal(foot.synthetic, true);
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
  assert.equal(offered.at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'none'));
  assert.equal(offered.at(-1)!.synthetic, true);

  const held = host(stale, json(200, { ok: true, value: [{ ingest: RATES, channel: 'poll', state: 'paused' }] }));
  assert.equal((await read(held.io)).at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'held'));

  const refused = host(stale, json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read that.' } }));
  assert.equal((await read(refused.io)).at(-1)!.body, footWords.ratesStale('28 Sep 2026', 'unread'));

  const current = host([tiles(reading({ fx: fx({ stale: false }) }))], json(200, { ok: true, value: [] }));
  const plain = await read(current.io);
  assert.equal(plain.length, 1);
  assert.equal(current.sent.includes('actions'), false, 'a page with nothing out of date asks nothing more');
});
