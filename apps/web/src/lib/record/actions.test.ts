/**
 * Scheduled actions, as "Runs on" and `/usage` draw them.
 *
 * What is tested is what each screen draws after each answer: no record draws the sample, a record
 * without the read draws no list, any other refusal is the record's own sentence, a paused action says
 * why and offers Resume, a held one says the Directory's sentence and points at usage, and the usage
 * page reads the ledger first and the record's own events after a 404.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  forProject,
  monthRange,
  often,
  openActions,
  readUsage,
  sample,
  stateOf,
  usageFromLedger,
  weeksOf,
  whatOf,
  words,
  type AccountUsage,
  type ActionRow,
  type Fetch,
} from './actions.ts';
import { ACTION_SAMPLE } from './data.ts';
import { signInFor } from './packs.ts';

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

  const gone = stateOf(row({ state: 'paused', last: { at: '2026-09-15T06:11:00.000Z', outcome: 'paused', status: null, note: '' } }), NOW_MS);
  assert.match(gone.line, /not in the vault/);

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

test('no sentence this screen says carries an em dash', () => {
  const said = Object.values(words).flatMap((w) => (typeof w === 'function' ? [(w as (...a: unknown[]) => string)('x', 'y', 'z')] : typeof w === 'string' ? [w] : Object.values(w)));
  for (const s of said) assert.ok(!String(s).includes('—'), String(s));
});

/* ── the read ─────────────────────────────────────────────────────────── */

test('NO RECORD DRAWS THE SAMPLE: nothing listening, a static 404 page, or a 401', async () => {
  for (const answers of [{}, { '/api/actions': () => new Response('<html>not found</html>', { status: 404 }) }, { '/api/actions': () => new Response('', { status: 401 }) }]) {
    const { io } = host(answers);
    const opened = await openActions(io);
    assert.equal(opened.source.sample, true);
    assert.equal(opened.absent, false);
    assert.ok(opened.first.ok && opened.first.value.length > 0);
  }
});

test('A RECORD WITHOUT THE READ DRAWS NO LIST, and any other refusal is the record\'s own sentence', async () => {
  const absent = await openActions(host({ '/api/actions': () => json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called actions.' } }) }).io);
  assert.equal(absent.absent, true);
  assert.equal(absent.source.sample, false);

  const fix = 'This token reads projects, and actions are the owner\'s.';
  const refused = await openActions(host({ '/api/actions': () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }) }).io);
  assert.equal(refused.source.sample, false);
  assert.deepEqual(refused.first, { ok: false, refusal: { code: 'FORBIDDEN', fix } });
});

test('Resume sends resumeAction with the action, and a refusal that needs a browser session offers Sign in again', async () => {
  const { io, sent } = host({
    '/api/actions': () => json(200, { ok: true, value: [row({ state: 'paused' })] }),
    '/api/resumeAction': () => json(403, { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Resuming an action needs a sign-in from this browser.' } }),
  });
  const opened = await openActions(io);
  assert.equal(opened.source.sample, false);
  const out = await opened.source.resume('stripe-balance');
  const post = sent.at(-1);
  assert.equal(post?.url, '/api/resumeAction');
  assert.equal(post?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(post?.init?.body)), { ingest: 'stripe-balance' });
  assert.ok(!out.ok && signInFor(out.refusal));
});

test('THE DEMO HOLDS ONE PAUSED ACTION, and resuming it changes this tab only, once', async () => {
  const paused = ACTION_SAMPLE().filter((r) => r.state === 'paused');
  assert.equal(paused.length, 1);
  const source = sample(() => NOW_MS);
  const first = await source.resume(paused[0]!.ingest);
  assert.ok(first.ok);
  const again = await source.resume(paused[0]!.ingest);
  assert.ok(!again.ok && again.refusal.code === 'OUT_OF_BOUNDS');
  const rows = await source.actions();
  assert.ok(rows.ok && rows.value.every((r) => r.state !== 'paused'));
  assert.equal(ACTION_SAMPLE().filter((r) => r.state === 'paused').length, 1, 'a fresh sample is paused again');
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
  assert.equal(sent[0]?.url, '/account/usage?from=2026-09-01&to=2026-09-15');
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

test('no host at all draws the sample usage; a ledger refusal is its sentence; a record with neither read draws none', async () => {
  const none = await readUsage(host({}).io, NOW_MS, '', Date.parse('2026-09-03T12:00:00.000Z'));
  assert.ok(none.ok === true && none.view.from === 'sample' && none.view.totals.runs > 0 && none.view.records.length === 0);

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

test('a month is five weeks at most, from the first, and every day lands in one', () => {
  const weeks = weeksOf([{ day: '2026-09-01', runs: 1 }, { day: '2026-09-07', runs: 2 }, { day: '2026-09-08', runs: 4 }, { day: '2026-09-30', runs: 8 }, { day: '2026-08-31', runs: 100 }], '2026-09');
  assert.deepEqual(weeks.map((w) => w.runs), [3, 4, 0, 0, 8]);
  assert.equal(weeks[0]?.label, '1 Sep to 7 Sep');
  assert.equal(weeks[4]?.label, '29 Sep to 30 Sep');
  assert.deepEqual(monthRange(NOW_MS), { month: '2026-09', from: '2026-09-01', to: '2026-09-15' });
});
