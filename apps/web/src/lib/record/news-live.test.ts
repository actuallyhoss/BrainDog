/**
 * Home's and History's reads against the record: what is new, marking it read, and the log; and a figure as a tile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSING, money } from 'braindog-render';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { figureTile } from './fixtures/readers.ts';
import { forget, readBoot, type Fetch } from './boot-live.ts';
import { METRICS } from './declared.ts';
import { hrefFor } from './metrics.ts';
import { LOG_PAGE, markAll, readLog, tileOf } from './news-live.ts';
import { liveWords, tileOf as pageTile, wholeMoneyIn } from './page-live.ts';
import { readToday, sinceOf, tasksOf } from './today-live.ts';

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
  const id = 'owed-to-you';
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

test('A LIMIT BROKEN IS SAID IN THE FIGURE’S CURRENCY, never as the minor units it is kept in ("720000 over your limit")', () => {
  const id = 'over-limit-test';
  METRICS[id] = { metric: id, name: 'Owed past the line', source: 'register.obligations', value: { sum: 'amount' }, format: 'money', target: { lte: 2_000_000 }, window: '30d', compare: 'none' } as never;
  try {
    const tile = tileOf(id, { value: 2_720_000, unit: 'EGP', rows: 3, met: false, refusals: [] });
    assert.equal(tile.value, money(2_720_000, 'EGP'));
    assert.equal(tile.note, 'EGP 7,200 over your limit');
    assert.doesNotMatch(tile.note, /720000/u);
  } finally {
    delete METRICS[id];
  }
});

/**
 * THE THIRD STATE OF A FIGURE, ON ALL THREE ENGINES AT ONCE.
 *
 * `a7d9e5c8` gave `page-live.ts` a state between "the list is empty" and "the list answered": a
 * REDUCING figure whose own predicate requires the field it reduces over to be set, matching no rows,
 * has no verdict to give, because a sum of no values is zero and `target: { gte: 0 }` is met by every
 * value such a sum can take. It wrote that on one of the three renderers of the same tile. The other
 * two, the sample engine (`api.ts`) and Home (`news-live.ts`), kept the old two-state reading, so the
 * same reading of the same declaration came out `tone: "good"` with a door on two screens and no tone
 * and no door on the third. Measured before the repair, over `projects-earning` at `rows: 0` held
 * over 27:
 *
 *     home   tone good  href /r/things?f=lane:in:building,earning&f=revenue:is:set  note never below zero
 *     sample tone good  href /r/things?f=lane:in:building,earning&f=revenue:is:set  note never below zero
 *     page   tone —     href —                                                     note No row has filled this in yet.
 *
 * `50 §1` IS THE BILL FOR THE SAME RULE WRITTEN TWICE, and this test is what stops a third copy
 * drifting: one reading goes through all three, and the three answers are held to each other rather
 * than each to a literal of its own. The rule itself is one function now, `unsaidFigure` in `api.ts`,
 * which Home reads; `page-live.ts` still holds its own copy of it, because that file belonged to
 * another agent on the run that wrote this, and this test is what will catch the day the two differ.
 *
 * THE READING IS THE ONE HIS RECORD PRODUCES, not one invented for a test: 27 projects imported,
 * 14 in play, `revenue` unset on every row because the importer files a monthly figure as a reading
 * and has no year to write, so `projects-earning` with `revenue is set` on it matches nothing.
 */
test('ONE READING OF ONE FIGURE, THREE ENGINES, ONE ANSWER: no row has filled the summed field in', () => {
  const id = 'projects-earning';
  const decl = METRICS[id]!;
  const shape = { value: 0, unit: 'GBP', rows: 0, held: 27, met: true, refusals: [] as string[] };

  const home = tileOf(id, shape);
  const page = pageTile({ metric: id, reading: shape } as never);
  /* THE SAMPLE ENGINE BUILDS THE REST OF ITS READING ITSELF, so only the keys it cannot derive from
     the declaration are written here: the figure, its unit, and the two counts the state turns on. */
  const sample = figureTile(id, decl, { ...shape, shown: money(0, 'GBP'), delta: null, why: '', unmeasured: null, href: hrefFor(decl)! });

  /* THE FIGURE AS IT IS DRAWN: a page's tile writes the one rule for cents itself (dd6b3b9bf), and the palette, the one
     reader of Home's tile left, writes it where it draws the row (`figureOf`), so the stored form is held to that. */
  const answers = [home, page, sample].map((t) => [wholeMoneyIn(t.value), t.tone ?? null, t.href ?? null, t.note]);
  assert.equal(home.value, money(0, 'GBP'));
  assert.deepEqual(answers[1], answers[0], 'Home and the page answered one reading differently');
  assert.deepEqual(answers[2], answers[0], 'the sample engine and Home answered one reading differently');
  assert.deepEqual(answers[0], ['GBP 0', null, null, liveWords.unsaid], 'a total of nothing is still zero, and carries no verdict and no door');
});

/**
 * AND THE RULE STAYS NARROW, on the two engines this run owns.
 *
 * `out-30d` sums `amount` where the obligation is open and due inside a month, a predicate that says
 * nothing about `amount`: nothing matched over forty obligations is GBP 0.00 owed, which is the
 * answer that figure exists to give, so it keeps its verdict and its door. A figure over rows that
 * DID say keeps both as well. Without these two the repair above would be a way of hiding every
 * zero on the product.
 */
test('a zero the predicate does say something about keeps its verdict and its door', () => {
  const matched = { value: 0, unit: 'GBP', rows: 0, held: 40, met: true, refusals: [] as string[] };
  const bill = tileOf('out-30d', matched);
  assert.equal(bill.tone, 'good', 'nothing owed inside a month is the answer, not the absence of one');
  assert.ok(bill.href, 'and its door opens the filter that produced it');

  const said = tileOf('projects-earning', { ...matched, rows: 3, held: 27 });
  assert.equal(said.tone, undefined, 'a floor of nought met is no mark (`markOf`)');
  assert.ok(said.href, 'rows that said keep their door');

  const nothing = tileOf('projects-earning', { ...matched, rows: 0, held: 0 });
  assert.equal(nothing.tone, undefined, 'and an empty list is still the other zero');
  assert.equal(nothing.href, undefined);
  assert.notEqual(nothing.note, liveWords.unsaid, 'a list holding nothing is not a field nobody filled in');
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

test('A MEMBER HELD TO ONE LIST MARKS WITH THE CURSOR SHE WAS HANDED, and it goes back exactly as it came', async () => {
  /* She is sent `upTo: 'e.<id>'` and no rowid, and the record refuses her a number.
     `markAll` typed `upTo` as a number, so the one thing it could send her back was a number, which is now a refusal. */
  forget();
  const upTo = 'e.01M1RQ3130J6MBME97EKYKKWZ2';
  const { io, sent } = host((url) =>
    url.pathname === '/api/markRead'
      ? json(200, { ok: true, value: { upTo, seen_at: '2026-09-15T09:00:00.000Z' } })
      : json(200, { ok: true, value: { registers: [], now: '2026-09-15T12:00:00.000Z' } }),
  );
  assert.equal(await markAll(BASE, upTo, io), true);
  const mark = sent.find((s) => new URL(s.url).pathname === '/api/markRead')!;
  assert.deepEqual(JSON.parse(mark.body ?? '{}'), { upTo });
  forget();
});

test('HER LOG HAS NO VERSION TO SAY, and the page below is asked for with her cursor as it came', async () => {
  const strip = (l: ReturnType<typeof line>) => {
    const { rowid: _rowid, ...rest } = l;
    return rest;
  };
  const cursor = 'e.01M1RQ3130J6MBME97EKYKKWZ1';
  const { io, sent } = host(() => json(200, { ok: true, value: { events: [strip(line({ kind: 'export', note: 'Hers' }))], cursor } }));
  const out = await readLog(BASE, 'p_9', io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.events.map((e) => [e.seq, e.version]), [[0, 0]], 'a line with no rowid was drawn with a version');
  assert.equal(out.cursor, cursor);
  await readLog(BASE, 'p_9', io, out.cursor);
  assert.equal(new URL(sent[1]!.url).searchParams.get('cursor'), cursor);
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

  assert.deepEqual(await readLog(BASE, null, host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } })).io), { from: 'refused', fix: 'Sign in.' });
});

test('the page below is asked for with the cursor the page above answered, and the last page has none', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { events: [line({ rowid: 7, kind: 'export', note: 'Older' })], cursor: null } }));
  const out = await readLog(BASE, 'p_1', io, 8);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(new URL(sent[0]!.url).searchParams.get('cursor'), '8');
  assert.deepEqual([out.events.map((e) => e.seq), out.more, out.cursor], [[7], false, null]);
});

/* HOME DREW THE SAMPLE WHEREVER THE SHELL WAS NOT LIVE: the studio's figures through `metric`, its obligations due this
   week and its lapsing services out of `ROWS` against the frozen `NOW`, and its feed filtered by a mark kept on this
   device. With no sample a shell is a record or a refusal, and Home draws the record's answers or the
   refusal's sentence. */
test("Home reads the record's answers and nothing of the sample", () => {
  /* HOME IS ONE DECLARED PAGE NOW (`lib/home/Home.svelte`), and `/?overview` and `/?classic` open the same page.
     Neither reads the sample. */
  for (const at of ['../../routes/+page.svelte', '../home/Home.svelte']) {
    /* What the page does, not what its comments say: a comment that says "the same page now" reads nothing. */
    const page = readFileSync(new URL(at, import.meta.url), 'utf8')
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    const script = page.slice(0, page.indexOf('</script>'));
    for (const [said, why] of [
      [/\bROWS\b/u, 'the sample rows'],
      [/\bNOW\b/u, "the sample's frozen day"],
      [/\bmetric\(/u, "the sample's figures"],
      [/pref\.read\(\)\.seen/u, "a read mark kept for the sample's feed"],
    ] as const)
      assert.doesNotMatch(script, said, `${at} reads ${why} again`);
    assert.doesNotMatch(page, /\bROWS\b|\bNOW\b/u, `${at}'s markup reads the sample again`);
  }
});

/* ── Today ─────────────────────────────────────────────────────────────── */

test('SINCE YOU WERE LAST HERE COUNTS BY KIND: a row`s changes by its list, anything else by what it was, an agent`s heartbeat not at all', () => {
  const lists = new Map([['tasks', 'Tasks']]);
  const rows = sinceOf(
    [
      { kind: 'edit', register: 'tasks' },
      { kind: 'create', register: 'tasks' },
      { kind: 'state', register: 'tasks' },
      { kind: 'decide', register: null },
      { kind: 'suggest', register: null },
      { kind: 'propose', register: null },
      { kind: 'edit', register: 'session' },
    ],
    lists,
  );
  assert.deepEqual(
    rows.map((r) => [r.label, r.count, r.href]),
    [
      ['Tasks', 3, '/audit?list=tasks'],
      ['Questions asked', 2, '/audit?kind=suggest'],
      ['Decisions made', 1, '/audit?kind=decide'],
    ],
  );
});

test('WHAT NEEDS YOU IS LATE, THEN DUE TODAY, THEN URGENT, each task once and named by its project', () => {
  const row = (seq: number, fields: Record<string, unknown>) => ({ id: `t${seq}`, seq, fields });
  const due = [row(1, { what: 'Pay the VAT', by: '2026-09-28', thing: 'p1' }), row(2, { what: 'Ship the fix', by: '2026-09-29' })];
  const urgent = [row(2, { what: 'Ship the fix', by: '2026-09-29' }), row(3, { what: 'Call the bank', agent: 'claude' })];
  const out = tasksOf(due, urgent, '2026-09-29', new Map([['p1', 'Northwind app']]));
  assert.deepEqual(
    out.map((t) => [t.seq, t.why, t.project, t.agent]),
    [
      [1, 'late', 'Northwind app', null],
      [2, 'today', null, null],
      [3, 'urgent', null, 'claude'],
    ],
  );
});

test('TODAY READS THE RECORD`S OWN ANSWERS, leaves out what it does not hold, and is refused only when boot is', async () => {
  const { io, sent } = host((url) => {
    const method = url.pathname.split('/').pop();
    if (method === 'boot')
      return json(200, {
        ok: true,
        value: {
          registers: [{ id: 'tasks', name: 'Tasks', count: 2 }],
          now: '2026-09-29T09:00:00.000Z',
          counts: { decide: 5, inbox: null },
          whatsNew: { events: [line({ kind: 'edit', register: 'tasks', seq: 1 })], upTo: 9, sinceCapped: false },
        },
      });
    if (method === 'previewPage')
      return json(200, {
        ok: true,
        value: {
          blocks: [
            {
              kind: 'queue',
              rows: [],
              queue: [{ id: 'SG1', who: 'claude', at: '2026-09-29T08:00:00.000Z', kind: 'options', question: 'Ship on Friday?', why: '', cost: 'call', options: [{ key: 'yes', label: 'Yes', because: '', recommended: true }] }],
            },
            { kind: 'table', rows: [{ id: 's1', seq: 4, fields: { agent: 'claude', doing: 'Writing tests', last_seen: '2026-09-29T08:59:00.000Z' } }], scopes: ['Northwind app'] },
          ],
        },
      });
    if (method === 'list') return json(200, { ok: true, value: { rows: [{ id: 't1', seq: 1, fields: { what: 'Pay the VAT', by: '2026-09-28' } }], cursor: null, matched: 1 } });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such thing.' } });
  });
  const out = await readToday(BASE, io, Date.parse('2026-09-29T12:00:00'));
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.deepEqual(out.value.needs?.map((t) => [t.what, t.why]), [['Pay the VAT', 'late']]);
  assert.deepEqual([out.value.questions.map((q) => q.id), out.value.open], [['SG1'], 5]);
  assert.deepEqual(out.value.runs, [{ seq: 4, agent: 'claude', doing: 'Writing tests', project: 'Northwind app', seen: '2026-09-29T08:59:00.000Z' }]);
  assert.deepEqual([out.value.since.total, out.value.upTo], [1, 9]);
  /* NO MONEY LIST, NO MONEY SECTION, and nothing about money was asked. */
  assert.equal(out.value.money, null);
  assert.ok(!sent.some((s) => new URL(s.url).pathname.endsWith('/metric')));
  /* AND NO MARK MOVED ON THE READ: the mark is the leaving's. */
  assert.ok(!sent.some((s) => new URL(s.url).pathname.endsWith('/markRead')));

  const refused = host(() => json(403, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'Ask an owner to raise your access.' } }));
  assert.deepEqual(await readToday(BASE, refused.io), { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'Ask an owner to raise your access.' } });
});

test('A WALK THAT NEVER WENT UNDER READS THE SAME ON TODAY AND ON A PAGE: the day the money lasts past, and no warning', () => {
  const walked = { value: null, unit: null, rows: 3, held: 3, met: null, refusals: [], beyond: { day: '2027-10-07', days: 365 } };
  const home = tileOf('runs-out-on', walked);
  const page = pageTile({ metric: 'runs-out-on', reading: walked } as never);
  assert.equal(home.value, copy.lastsPast('7 Oct 2027'));
  assert.equal(home.value, page.value);
  assert.equal(home.tone, page.tone);
  assert.equal(home.note, page.note);
  const none = tileOf('runs-out-on', { ...walked, beyond: undefined });
  assert.equal(none.value, MISSING);
  assert.equal(none.tone, 'warn');
  assert.equal(tileOf('runs-out-on', { ...walked, refusals: ['x'] }).value, MISSING, 'a refused figure is not money that lasts');
});

test('A BEYOND THAT IS NOT A DAY AND A WHOLE COUNT IS NOT TRUSTED ON TODAY EITHER: the dash and the warning, as a page draws it', () => {
  const walked = { value: null, unit: null, rows: 3, held: 3, met: null, refusals: [] };
  for (const beyond of [null, 'soon', { day: 20271007, days: 365 }, { day: '2027-10-07', days: 1.5 }, { day: 'next year', days: 365 }, { day: '2027-13-45', days: 365 }, { day: '2027-10-07' }]) {
    const home = tileOf('runs-out-on', { ...walked, beyond });
    const page = pageTile({ metric: 'runs-out-on', reading: { ...walked, beyond } } as never);
    assert.equal(home.value, MISSING, JSON.stringify(beyond));
    assert.equal(home.tone, 'warn', JSON.stringify(beyond));
    assert.deepEqual([home.value, home.tone, home.note], [page.value, page.tone, page.note], JSON.stringify(beyond));
  }
  /* AND A FIGURE WITH A VALUE IS DRAWN AS IT WAS, beyond or not. */
  const counted = tileOf('tasks-done-7d', { value: 4, unit: null, rows: 4, held: 9, met: null, refusals: [], beyond: { day: '2027-10-07', days: 365 } });
  assert.notEqual(counted.value, copy.lastsPast('7 Oct 2027'));
  assert.notEqual(counted.value, MISSING);
});
