/**
 * Home's and History's reads against the record: figures as tiles, what is new, marking it read, and the log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSING } from 'braindog-render';

import { copy } from '../copy.ts';
import { forget, readBoot, type Fetch } from './boot-live.ts';
import { METRICS } from './declared.ts';
import { HOME_FIGURES, LOG_PAGE, markAll, readHome, readLog, tileOf } from './news-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { url: string; method: string; body: string | null };

function host(answer: ((url: URL) => Response) | null): { io: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    if (!answer) throw new TypeError('fetch failed');
    return answer(new URL(String(url)));
  }) as Fetch;
  return { io, sent };
}

const line = (over: Record<string, unknown>) => ({
  rowid: 1,
  id: 'e1',
  ts: '2026-09-15T09:00:00.000Z',
  actor: 'p_1',
  kind: 'create',
  target: null,
  target_kind: null,
  field: null,
  from: null,
  to: null,
  note: null,
  register: null,
  seq: null,
  title: null,
  ...over,
});

test("a figure is the record's reading in the declaration's words, and one that cannot be read says so", () => {
  const id = HOME_FIGURES[0];
  const decl = METRICS[id]!;
  const tile = tileOf(id, { value: 1_250_000, unit: 'GBP', rows: 4, met: true, refusals: [] });
  assert.equal(tile.label, decl.name);
  assert.equal(tile.value, 'GBP 12,500.00');
  assert.equal(tile.tone, 'good');
  assert.ok(tile.href, 'a figure over rows is a door');

  const none = tileOf(id, { value: 0, unit: 'GBP', rows: 0, met: true, refusals: [] });
  assert.equal(none.tone, undefined, 'a tick over no rows');
  assert.equal(none.href, undefined);

  const broken = tileOf(id, { value: null, unit: null, rows: 0, met: null, refusals: ['x'] });
  assert.equal(broken.value, MISSING);
  assert.equal(broken.note, copy.figureUnavailable);
});

test('Home asks for what is new and its three figures together, and leaves out a figure it may not read', async () => {
  const { io, sent } = host((url) => {
    if (url.pathname === '/api/whatsNew')
      return json(200, { ok: true, value: { events: [line({ rowid: 5, register: 'obligations', seq: 2, title: 'Rent' })], upTo: 5, sinceCapped: false } });
    if (url.searchParams.get('metric') === 'overdue') return json(404, { ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'There is no metric called overdue.' } });
    return json(200, { ok: true, value: { value: 100, unit: 'GBP', rows: 1, met: true, refusals: [] } });
  });
  const out = await readHome(BASE, 'p_1', io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.tiles.map((t) => t.id), ['owed-to-you', 'due-30d']);
  assert.deepEqual(out.news.items.map((i) => [i.by, i.text]), [['you', 'Added Rent']]);
  assert.equal(out.news.upTo, 5);
  assert.equal(sent.length, 4);
});

test('Home with no record draws the sample, and a refusal is the record sentence', async () => {
  assert.deepEqual(await readHome(BASE, null, host(null).io), { from: 'sample' });
  const said = await readHome(BASE, null, host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } })).io);
  assert.deepEqual(said, { from: 'refused', fix: 'Ask the owner.' });
});

test("marking all read sends the newest line's number, and the shell asks boot again", async () => {
  forget();
  const { io, sent } = host((url) =>
    url.pathname === '/api/markRead'
      ? json(200, { ok: true, value: { upTo: 9, seen_at: '2026-09-15T09:00:00.000Z' } })
      : json(200, { ok: true, value: { registers: [], now: '2026-09-15T12:00:00.000Z' } }),
  );
  await readBoot(BASE, io);
  assert.equal(await markAll(BASE, 9, io), true);
  const mark = sent.find((s) => new URL(s.url).pathname === '/api/markRead')!;
  assert.equal(mark.method, 'POST');
  assert.deepEqual(JSON.parse(mark.body ?? '{}'), { upTo: 9 });
  await readBoot(BASE, io);
  assert.equal(sent.filter((s) => new URL(s.url).pathname === '/api/boot').length, 2, 'the kept feed outlived the mark');
  forget();
});

test("the log is the record's newest page, named by what the record called each thing", async () => {
  const { io, sent } = host(() =>
    json(200, {
      ok: true,
      value: {
        events: [
          line({ rowid: 12, kind: 'decide', actor: 'p_2', target: 'decision:D3', target_kind: 'decision', title: 'Renew the domain?' }),
          line({ rowid: 11, kind: 'suggest', actor: 'rule:renewal', target: 'SG4', target_kind: 'suggestion', title: 'Renew the domain?' }),
          line({ rowid: 10, kind: 'create', register: 'obligations', seq: 2, title: 'Rent', target: 'entry:x', target_kind: 'entry' }),
          line({ rowid: 9, kind: 'export', note: 'Nightly backup' }),
          line({ rowid: 8, kind: 'not-a-kind' }),
        ],
        cursor: 8,
      },
    }),
  );
  const out = await readLog(BASE, 'p_1', io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(
    out.events.map((e) => [e.seq, e.by, e.kind, e.target ?? null, e.note]),
    [
      [12, 'p_2', 'decide', 'decision:D3', ''],
      [11, 'rule.renewal', 'suggest', 'suggestion:SG4', ''],
      [10, 'you', 'create', 'obligations#2', 'created'],
      [9, 'p_1' === 'p_1' ? 'you' : '', 'export', null, 'Nightly backup'],
    ],
  );
  assert.equal(out.names.get('obligations#2'), 'Rent');
  assert.equal(out.names.get('suggestion:SG4'), 'Renew the domain?');
  assert.equal(out.more, true);
  assert.equal(out.cursor, 8);
  assert.equal(new URL(sent[0]!.url).searchParams.get('limit'), String(LOG_PAGE));
  assert.equal(new URL(sent[0]!.url).searchParams.get('cursor'), null, 'the first page asked for a page below something');

  assert.deepEqual(await readLog(BASE, null, host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } })).io), { from: 'sample' });
});

test('the page below is asked for with the cursor the page above answered, and the last page has none', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { events: [line({ rowid: 7, kind: 'export', note: 'Older' })], cursor: null } }));
  const out = await readLog(BASE, 'p_1', io, 8);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(new URL(sent[0]!.url).searchParams.get('cursor'), '8');
  assert.deepEqual([out.events.map((e) => e.seq), out.more, out.cursor], [[7], false, null]);
});
