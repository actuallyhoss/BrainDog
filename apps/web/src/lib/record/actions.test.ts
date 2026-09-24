/**
 * Scheduled actions, as "Runs on" and `/usage` draw them.
 *
 * What is tested is what each screen draws after each answer: no record draws the refusal that says so, a record
 * without the read draws no list, any other refusal is the record's own sentence, a paused action says
 * why and offers Resume, a held one says the Directory's sentence and points at usage, and the usage
 * page reads the ledger first and the record's own events after a 404.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  callLine,
  callsOutOf,
  estimateOf,
  installWords,
  live,
  everyMs,
  HOSTED_RUNS,
  runsAMonth,
  type CallOut,
  forProject,
  monthRange,
  often,
  openActions,
  countsOf,
  readUsage,
  stateOf,
  usageFromLedger,
  reconnectHref,
  weeksOf,
  whatOf,
  words,
  type AccountUsage,
  type ActionRow,
  type Fetch,
} from './actions.ts';
import { PACKS } from './data.ts';
import { packDiff } from './api.ts';
import { signInFor } from './packs.ts';
import { copy } from '../copy.ts';

const NOW_MS = Date.parse('2026-09-15T12:00:00.000Z');

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers by path, and remembers what it was sent. */
function host(answers: Record<string, () => Response>): { io: Fetch; sent: { url: string; init?: RequestInit | undefined }[] } {
  const sent: { url: string; init?: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    const path = url.split('?')[0] ?? url;
    const answer = answers[path];
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

const totals = { runs: 0, requests: 0, bytes: 0, failures: 0 };

const row = (over: Partial<ActionRow>): ActionRow => ({
  ingest: 'stripe-balance',
  channel: 'poll',
  project: 'Kiln',
  host: 'api.stripe.com',
  every: '1h',
  key: 'Stripe read',
  state: 'pending',
  next: '2026-09-15T13:00:00.000Z',
  last: { at: '2026-09-15T11:00:00.000Z', outcome: 'ok', status: 200, note: '' },
  month: { ...totals, runs: 300, held: 0 },
  days: [],
  ...over,
});

/* ── one row ──────────────────────────────────────────────────────────── */

test('how often is said in words, and a spelling it does not know is printed as declared', () => {
  assert.equal(often('15m'), 'every 15 minutes');
  assert.equal(often('1h'), 'every hour');
  assert.equal(often('6h'), 'every 6 hours');
  assert.equal(often('1d'), 'every day');
  assert.equal(often('fortnightly'), 'fortnightly');
});

test('A PAUSED ACTION SAYS WHY in one calm sentence, in warn and never in red, and offers Resume', () => {
  const refused = stateOf(row({ state: 'paused', last: { at: '2026-09-15T06:11:00.000Z', outcome: 'paused', status: 401, note: '' } }), NOW_MS);
  assert.equal(refused.tone, 'warn');
  assert.equal(refused.resume, true);
  assert.match(refused.line, /api\.stripe\.com did not accept the key "Stripe read"/);

  assert.deepEqual(refused.reconnect, { href: reconnectHref('Stripe read', 'stripe-balance'), label: 'Reconnect key' });
  const asked = new URL(refused.reconnect?.href ?? '', 'https://x.example');
  assert.deepEqual([asked.pathname, asked.searchParams.get('reconnect'), asked.searchParams.get('then')], ['/vault', 'Stripe read', 'stripe-balance']);

  const gone = stateOf(row({ state: 'paused', last: { at: '2026-09-15T06:11:00.000Z', outcome: 'paused', status: null, note: '' } }), NOW_MS);
  assert.match(gone.line, /not in the vault/);
  assert.equal(gone.reconnect?.label, 'Add the key');

  /* THE KERNEL PAUSES A ROW WHOSE KEY IS NOT IN THE VAULT AT FIRE TIME, before any run, so there is no paused run to read. */
  for (const last of [null, { at: '2026-09-14T06:11:00.000Z', outcome: 'ok' as const, status: 200, note: '' }]) {
    const fired = stateOf(row({ state: 'paused', last }), NOW_MS);
    assert.match(fired.line, /not in the vault/);
    assert.equal(fired.reconnect?.label, 'Add the key', 'a key missing when the action fired offered no way to add it');
  }

  const plain = stateOf(row({ state: 'paused', last: null, key: null }), NOW_MS);
  assert.equal(plain.reconnect, undefined, 'a pause with no key to blame offered to reconnect one');

  const live = stateOf(row({}), NOW_MS);
  assert.deepEqual([live.tone, live.resume, live.usage], [undefined, false, false]);
  assert.match(live.line, /^Last ran 1h ago\. Next run in 1h\.$/);
});

test('A HELD ACTION SAYS THE DIRECTORY\'S OWN SENTENCE and points at usage; a failing one says there is nothing to do', () => {
  const note = 'stripe-balance is waiting until 1 October. This record has used its 15,000 runs for September.';
  const held = stateOf(row({ last: { at: '2026-09-15T11:00:00.000Z', outcome: 'held', status: null, note } }), NOW_MS);
  assert.equal(held.line, note);
  assert.equal(held.usage, true);
  assert.equal(held.resume, false);

  const failing = stateOf(row({ last: { at: '2026-09-15T11:00:00.000Z', outcome: 'failed', status: 503, note: '' } }), NOW_MS);
  assert.match(failing.line, /nothing to do/);
  assert.equal(failing.tone, undefined);
});

test('a row names what it does, where, how often and its key by label', () => {
  assert.equal(whatOf(row({})), 'Watches api.stripe.com, every hour, with the key "Stripe read"');
});

test('a project gets its own actions, matched by name without case, and the global ones separately', () => {
  const rows = [row({ ingest: 'b', project: 'kiln' }), row({ ingest: 'a', project: 'Kiln' }), row({ ingest: 'g', project: null }), row({ ingest: 'p', project: 'Portage' })];
  const split = forProject(rows, 'Kiln');
  assert.deepEqual(split.own.map((r) => r.ingest), ['a', 'b']);
  assert.deepEqual(split.everywhere.map((r) => r.ingest), ['g']);
});

test('no project lists every action as its own, by name, with nothing faint', () => {
  const rows = [row({ ingest: 'b', project: 'kiln' }), row({ ingest: 'g', project: null }), row({ ingest: 'a', project: 'Portage' })];
  const split = forProject(rows, null);
  assert.deepEqual(split.own.map((r) => r.ingest), ['a', 'b', 'g']);
  assert.deepEqual(split.everywhere, []);
});

test('no sentence this screen says carries an em dash', () => {
  const said = Object.values(words).flatMap((w) => (typeof w === 'function' ? [(w as (...a: unknown[]) => string)('x', 'y', 'z')] : typeof w === 'string' ? [w] : Object.values(w)));
  for (const s of said) assert.ok(!String(s).includes('—'), String(s));
});

/* ── the read ─────────────────────────────────────────────────────────── */

/* NO RECORD DREW THE SAMPLE'S FIVE ACTIONS UNDER "Runs on", one of them paused with a Resume that changed the tab and
   said nothing was saved, on a project page nobody could read. Each of the three ways of there being no record is now
   the sentence for it (DIRECTION 26), and the one that said "the demo has no account" says the record was not reached. */
test('NO RECORD DRAWS WHY: nothing listening, a static 404 page, or a 401', async () => {
  const cases: [Record<string, () => Response>, { code: string; fix: string }][] = [
    [{}, { code: 'UNREACHABLE', fix: copy.recordNotReached }],
    [{ '/api/actions': () => new Response('<html>not found</html>', { status: 404 }) }, { code: 'UNREACHABLE', fix: copy.recordNotReached }],
    [{ '/api/actions': () => new Response('', { status: 401 }) }, { code: 'UNAUTHORIZED', fix: copy.signInAgain }],
  ];
  for (const [answers, refusal] of cases) {
    const opened = await openActions(host(answers).io);
    assert.equal(opened.absent, false);
    assert.deepEqual(opened.first.ok ? null : opened.first.refusal, refusal);
  }
  const actions: Record<string, unknown> = await import('./actions.ts');
  assert.equal('sample' in actions, false, 'the sample source is still exported');
});

test('A RECORD WITHOUT THE READ DRAWS NO LIST, and any other refusal is the record\'s own sentence', async () => {
  const absent = await openActions(host({ '/api/actions': () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called actions.' } }) }).io);
  assert.equal(absent.absent, true);

  const fix = 'This token reads projects, and actions are the owner\'s.';
  const refused = await openActions(host({ '/api/actions': () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }) }).io);
  assert.deepEqual(refused.first, { ok: false, refusal: { code: 'FORBIDDEN', fix } });
});

test('Resume sends resumeAction with the action, and a refusal that needs a browser session offers Sign in again', async () => {
  const { io, sent } = host({
    '/api/actions': () => json(200, { ok: true, value: [row({ state: 'paused' })] }),
    '/api/resumeAction': () => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Resuming an action needs a sign-in from this browser.' } }),
  });
  const opened = await openActions(io);
  const out = await opened.source.resume('stripe-balance');
  const post = sent.at(-1);
  assert.equal(post?.url, '/api/resumeAction');
  assert.equal(post?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(post?.init?.body)), { ingest: 'stripe-balance' });
  assert.ok(!out.ok && signInFor(out.refusal));
});

/* ── usage ────────────────────────────────────────────────────────────── */

const ledger = (held: number): AccountUsage => {
  const t = (runs: number) => ({ runs, requests: runs * 2, bytes: runs * 1_000, ms: runs * 10, failures: 1, held });
  return {
    from: '2026-09-01',
    to: '2026-09-15',
    totals: t(150),
    records: [
      {
        record: 'rec_1',
        slug: 'studio',
        plan: 'hosted',
        closed: false,
        month: { month: '2026-09', used: t(150), allowance: { runs: 15_000, requests: 150_000, bytes: 1_000_000_000, ms: 180_000_000 }, resets: '2026-10-01' },
        totals: t(150),
        projects: [{ scope: 'Kiln', ...t(100) }, { scope: 'global', ...t(50) }],
        actions: [{ scope: 'Kiln', action: 'stripe-balance', ...t(100) }, { scope: 'global', action: 'rates', ...t(50) }],
        days: [{ day: '2026-09-01', ...t(40) }, { day: '2026-09-09', ...t(110) }],
      },
    ],
  };
};

test('THE LEDGER FIRST: this month against the allowance, and waiting said when the plan held a run', async () => {
  const { io, sent } = host({ '/account/usage': () => json(200, { ok: true, value: ledger(0) }) });
  const read = await readUsage(io, NOW_MS);
  assert.ok(read.ok === true);
  assert.equal(read.view.from, 'ledger');
  assert.ok(sent.some((x) => x.url === '/account/usage?from=2026-09-01&to=2026-09-15'));
  assert.deepEqual(read.view.records, [{ name: 'studio', used: 150, allowance: 15_000, resets: '1 October', waiting: false }]);
  assert.deepEqual(read.view.projects.map((p) => [p.name, p.faint]), [['Kiln', false], [words.everywhere, true]]);

  assert.equal(usageFromLedger(ledger(3), '2026-09').records[0]?.waiting, true);
});

test('A LEDGER THAT ANSWERS 404 FALLS BACK TO THE RECORD\'S EVENTS, which say nothing about limits', async () => {
  const { io } = host({
    '/account/usage': () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no route here.' } }),
    '/api/actions': () => json(200, { ok: true, value: [row({ days: [{ day: '2026-09-02', ...totals, runs: 12 }] })] }),
  });
  const read = await readUsage(io, NOW_MS);
  assert.ok(read.ok === true);
  assert.equal(read.view.from, 'events');
  assert.deepEqual(read.view.records, []);
  assert.equal(read.view.weeks[0]?.runs, 12);
});

test("UNDER A SLUG THE RECORD'S EVENTS ARE THAT RECORD'S, and the ledger and sign-in stay the person's, at the root", async () => {
  const { io, sent } = host({
    '/account/usage': () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no route here.' } }),
    '/app/acme/api/actions': () => json(200, { ok: true, value: [row({ days: [{ day: '2026-09-02', ...totals, runs: 7 }] })] }),
  });
  const read = await readUsage(io, NOW_MS, '', '/app/acme');
  assert.ok(read.ok === true && read.view.from === 'events' && read.view.weeks[0]?.runs === 7);
  assert.deepEqual(sent.map((x) => x.url.split('?')[0]), ['/auth/methods', '/account/usage', '/app/acme/api/actions']);
});

test('no host at all says so; a ledger refusal is its sentence; a record with neither read draws none', async () => {
  /* IT DREW THE SAMPLE'S MONTH, 3 September's, with runs counted against projects nobody has. */
  const none = await readUsage(host({}).io, NOW_MS);
  assert.deepEqual(none, { ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });
  const out = await readUsage(host({ '/account/usage': () => new Response('', { status: 401 }), '/api/actions': () => new Response('', { status: 401 }) }).io, NOW_MS);
  assert.deepEqual(out, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: copy.signInAgain } }, 'nobody signed in was shown a month of runs');

  const refused = await readUsage(host({ '/account/usage': () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Usage is the owner\'s.' } }) }).io, NOW_MS);
  assert.deepEqual(refused, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Usage is the owner\'s.' } });

  const neither = await readUsage(
    host({
      '/account/usage': () => new Response('<html></html>', { status: 404 }),
      '/api/actions': () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called actions.' } }),
    }).io,
    NOW_MS,
  );
  assert.deepEqual(neither, { ok: 'none' });
});

test('NOBODY SIGNED IN, AS ON AN OPEN SELF-HOST, asks no ledger and reads the record’s events; a signed-in person is asked', async () => {
  const methods = (me: unknown) => () => json(200, { ok: true, value: { passkey: false, magic: false, key: false, open: me === null, demo: false, me } });
  const actions = () => json(200, { ok: true, value: [row({ days: [{ day: '2026-09-02', ...totals, runs: 5 }] })] });
  const open = host({ '/auth/methods': methods(null), '/api/actions': actions });
  const read = await readUsage(open.io, NOW_MS);
  assert.ok(read.ok === true && read.view.from === 'events');
  assert.ok(!open.sent.some((x) => x.url.startsWith('/account/usage')), 'the ledger was asked with nobody signed in');

  const signed = host({ '/auth/methods': methods({ person: 'p_1', email: 'owner@example.test', record: 'studio', provedAt: 0 }), '/account/usage': () => json(200, { ok: true, value: ledger(0) }) });
  const mine = await readUsage(signed.io, NOW_MS);
  assert.ok(mine.ok === true && mine.view.from === 'ledger');
});

test('a month is five weeks at most, from the first, and every day lands in one', () => {
  const weeks = weeksOf([{ day: '2026-09-01', runs: 1 }, { day: '2026-09-07', runs: 2 }, { day: '2026-09-08', runs: 4 }, { day: '2026-09-30', runs: 8 }, { day: '2026-08-31', runs: 100 }], '2026-09');
  assert.deepEqual(weeks.map((w) => w.runs), [3, 4, 0, 0, 8]);
  assert.equal(weeks[0]?.label, '1 Sep to 7 Sep');
  assert.equal(weeks[4]?.label, '29 Sep to 30 Sep');
  assert.deepEqual(monthRange(NOW_MS), { month: '2026-09', from: '2026-09-01', to: '2026-09-15' });
});

test('a week that has not started yet draws no bar, and the week today is in draws whole', () => {
  const days = [{ day: '2026-09-01', runs: 1 }, { day: '2026-09-15', runs: 2 }];
  assert.deepEqual(weeksOf(days, '2026-09', '2026-09-15').map((w) => [w.label, w.runs]), [['1 Sep to 7 Sep', 1], ['8 Sep to 14 Sep', 0], ['15 Sep to 21 Sep', 2]]);
  assert.equal(weeksOf(days, '2026-09', '2026-10-02').length, 5);
});

test('an interval is runs a month without the jitter, in the kernel\'s grammar where m is minutes', () => {
  assert.equal(runsAMonth('1h'), 730);
  assert.equal(runsAMonth('15m'), 2920);
  assert.equal(runsAMonth('1d'), 30);
  assert.equal(runsAMonth('6h'), 122);
  assert.equal(runsAMonth('1w'), 4);
  assert.equal(runsAMonth('hourly'), null);
  assert.equal(runsAMonth('0h'), null);
  assert.equal(everyMs(' 2h '), 7_200_000);
});

test('the install says each call on one line, and the runs a month they add against the allowance', () => {
  const calls = callsOutOf([
    { ingest: 'kiln-status', channel: 'poll', host: 'status.kiln.example', every: '1h', grant: 'Kiln read', line: 'CALLS OUT status.kiln.example' },
    { ingest: 'tell-kiln-shop', channel: 'call', host: 'hooks.kiln.example', every: '1h', grant: null, sends: ['invoices.seq', 'invoices.amount_due'] },
    { ingest: 'broken' },
    'nonsense',
  ]);
  assert.equal(calls.length, 2);
  assert.equal(callLine(calls[0]!), 'Watches status.kiln.example, every hour, with the key "Kiln read"');
  assert.equal(callLine(calls[1]!), 'Calls hooks.kiln.example, every hour, with no key, sends seq and amount due');
  assert.equal(estimateOf(calls, true), "About 1,460 runs a month, 10% of this record's 15,000.");
  assert.equal(estimateOf(calls, false), 'About 1,460 runs a month, with no monthly limit on this record.');
  assert.equal(callLine({ ...calls[0]!, host: null, sends: [] }), 'Watches a host it does not name, every hour, with the key "Kiln read", sends no fields');
});

test('an estimate says less than 1%, says when runs would wait, and is absent when nothing has an interval', () => {
  const one = (every: string): CallOut => ({ ingest: 'a', channel: 'pull', host: 'api.example', every, key: null, sends: null });
  assert.equal(estimateOf([one('1d')], true), "About 30 runs a month, less than 1% of this record's 15,000.");
  assert.equal(
    estimateOf(Array.from({ length: 6 }, () => one('15m')), true),
    "About 17,520 runs a month, more than this record's 15,000, so some runs would wait until the next month.",
  );
  assert.equal(estimateOf([one('when paid')], true), null);
  assert.equal(estimateOf([], true), null);
  assert.equal(HOSTED_RUNS, 15_000);
});

test('a catalogue entry that calls out draws its calls in the diff', () => {
  const pack = PACKS.find((p) => p.id === 'freelancer-uk');
  assert.ok(pack);
  const d = packDiff(pack);
  assert.equal(d.calls.length, 3);
  assert.equal(estimateOf(d.calls, true), "About 1,490 runs a month, 10% of this record's 15,000.");
});

test('a call only a rule runs keeps its line, its daily ceiling and the key note it is approved with', () => {
  const calls = callsOutOf([
    {
      ingest: 'made',
      channel: 'call',
      host: 'hooks.example.test',
      every: null,
      trigger: 'rule',
      per_day: 100,
      key: 'hook key',
      sends: ['skus.code'],
      key_line: 'made runs for the project studio and sends the key "hook key".',
    },
    { ingest: 'both', channel: 'call', host: 'hooks.example.test', every: '1h', trigger: 'both', per_day: 100, key: null, sends: [] },
    { ingest: 'nothing', channel: 'call', host: 'hooks.example.test', every: null },
  ]);
  assert.equal(calls.length, 2, 'a scheduled call with no interval was kept');
  assert.equal(callLine(calls[0]!), 'Calls hooks.example.test, when a rule runs it, at most 100 a day, with the key "hook key", sends code');
  assert.equal(calls[0]!.note, 'made runs for the project studio and sends the key "hook key".');
  assert.equal(callLine(calls[1]!), 'Calls hooks.example.test, every hour and when a rule runs it, at most 100 a day, with no key, sends no fields');
  assert.equal(estimateOf(calls.slice(0, 1), true), null, 'a rule-only call was counted as runs a month');
});

test('installing a pack that calls out says it asks once, and accepting a proposal says what the press does, with no "would" left', () => {
  for (const said of [installWords.asksOnce, installWords.acceptApproves]) assert.doesNotMatch(said, /—/u);
  assert.equal('wouldAsk' in installWords, false, 'the sample install sentence is still here');
});

test('A 401 CANCELS ITS BODY rather than leaving the request pending', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel: () => void (cancelled = true) });
  const io = (async () => new Response(body, { status: 401 })) as unknown as Fetch;
  const first = await live(io).actions();
  assert.equal(first.ok === false && first.refusal.code, 'UNAUTHORIZED');
  assert.equal(cancelled, true);
});

test('one run and one request are said in the singular', () => {
  assert.equal(countsOf({ runs: 1, requests: 1, bytes: 11, failures: 0 }).startsWith('1 run · 1 request · '), true);
});
