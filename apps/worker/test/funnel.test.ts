/**
 * `GET /account/ops/funnel` (`src/funnel.ts`): the operator's guard, the eight ISO weeks, the Directory's totals put in
 * their weeks whichever way a week is named, and the records asked for their firsts, twenty at a time and at most 500.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FUNNEL_CHUNK, FUNNEL_RECORDS_MOST, FUNNEL_WEEKS, funnelOf, mondayOf, msOf, opsFunnel, weekName, type FunnelDeps } from '../src/funnel.ts';

const KEY = 'operator-key-for-tests';
/* A Saturday, so this week's Monday is five days before it. */
const NOW = Date.parse('2026-10-17T12:00:00Z');
const at = (headers: Record<string, string> = { authorization: `Bearer ${KEY}` }, method = 'GET'): Request =>
  new Request('https://example.dog/account/ops/funnel', { method, headers });

const deps = (over: Partial<FunnelDeps> = {}): FunnelDeps & { since: number[] } => {
  const out = {
    since: [] as number[],
    key: KEY,
    readLimit: async () => null,
    unauthorized: () => new Response('{}', { status: 401 }),
    read: async (since: number) => {
      out.since.push(since);
      return { ok: true, value: { weeks: [] } };
    },
    records: async () => ({ ids: [] }),
    firsts: async () => ({ agent: null, brief: null }),
    now: () => NOW,
    ...over,
  };
  return out;
};

test('weeks are ISO weeks from Monday, named by their Monday either way', () => {
  assert.equal(new Date(mondayOf(NOW)).toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(new Date(mondayOf(Date.parse('2026-10-12T00:00:00Z'))).toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(new Date(mondayOf(Date.parse('2026-10-11T23:59:59Z'))).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(weekName('2026-10-15'), '2026-10-12');
  assert.equal(weekName('2026-W42'), '2026-10-12');
  assert.equal(weekName('2026-W01'), '2025-12-29');
  assert.equal(weekName('last week'), null);
  assert.equal(msOf('2026-10-12T00:00:00Z'), Date.parse('2026-10-12T00:00:00Z'));
  assert.equal(msOf(null), null);
});

test('the guard is the operator door\'s: 404 with no key or none sent, GET only, 401 on a wrong key, the read limit first', async () => {
  assert.equal((await opsFunnel(at(), deps({ key: '' }))).status, 404);
  assert.equal((await opsFunnel(at(undefined, 'POST'), deps())).status, 405);
  assert.equal((await opsFunnel(at({}), deps())).status, 404);
  assert.equal((await opsFunnel(at({}), deps({ operator: true }))).status, 200);
  assert.equal((await opsFunnel(at({ authorization: 'Bearer wrong' }), deps())).status, 401);
  assert.equal((await opsFunnel(at(), deps({ readLimit: async () => new Response(null, { status: 429 }) }))).status, 429);
  const out = await opsFunnel(at(), deps());
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
});

test('eight weeks, oldest first, asked from the Monday seven weeks back', async () => {
  const d = deps();
  const funnel = await funnelOf(d);
  assert.ok(funnel);
  assert.equal(funnel.weeks.length, FUNNEL_WEEKS);
  assert.equal(funnel.weeks[0]!.week, '2026-08-24');
  assert.equal(funnel.weeks[FUNNEL_WEEKS - 1]!.week, '2026-10-12');
  assert.deepEqual(d.since, [Date.parse('2026-08-24T00:00:00Z')]);
});

test('the Directory\'s totals land in their weeks, and one outside the eight is left out', async () => {
  const read = async () => ({
    weeks: [
      { week: '2026-10-12', seen: 40, applied: 3, invites_used: 2, signed_up: 2, records: 2 },
      { week: '2026-W41', seen: 12, applied: 1 },
      { week: '2025-01-06', seen: 999 },
      { week: '2026-10-13', seen: -5 },
    ],
  });
  const funnel = await funnelOf(deps({ read }));
  assert.ok(funnel);
  assert.deepEqual(funnel.weeks[7], { week: '2026-10-12', seen: 40, applied: 3, invites_used: 2, signed_up: 2, records: 2, agent: 0, brief: 0 });
  assert.deepEqual(funnel.weeks[6], { week: '2026-10-05', seen: 12, applied: 1, invites_used: 0, signed_up: 0, records: 0, agent: 0, brief: 0 });
  assert.equal(funnel.weeks.reduce((n, w) => n + w.seen, 0), 52);
});

test('a refusal from the Directory is a 503 that names nothing', async () => {
  const out = await opsFunnel(at(), deps({ read: async () => ({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'x' } }) }));
  assert.equal(out.status, 503);
});

test('each record\'s firsts count in their week, and a record that fails is counted as missed', async () => {
  const ids = Array.from({ length: 45 }, (_, i) => `r${String(i).padStart(3, '0')}`);
  let most = 0;
  let open = 0;
  const firsts = async (id: string) => {
    open += 1;
    most = Math.max(most, open);
    await new Promise((r) => setTimeout(r, 1));
    open -= 1;
    if (id === 'r007') throw new Error('gone');
    if (id === 'r008') return { agent: Date.parse('2025-01-01T00:00:00Z'), brief: null };
    return { agent: Date.parse('2026-10-13T09:00:00Z'), brief: id < 'r010' ? '2026-10-06T08:00:00Z' : null };
  };
  const funnel = await funnelOf(deps({ records: async () => ({ ids }), firsts }));
  assert.ok(funnel);
  assert.ok(most <= FUNNEL_CHUNK, `at most ${String(FUNNEL_CHUNK)} at once, saw ${String(most)}`);
  assert.equal(funnel.asked, 45);
  assert.equal(funnel.missed, 1);
  assert.equal(funnel.more, false);
  assert.equal(funnel.weeks[7]!.agent, 43);
  assert.equal(funnel.weeks[6]!.brief, 8);
});

test('the walk stops at 500 records and says there were more', async () => {
  let asked = 0;
  const records = async (cursor?: string) => {
    const from = cursor === undefined ? 0 : Number(cursor) + 1;
    const ids = Array.from({ length: 300 }, (_, i) => String(from + i));
    return { ids, cursor: ids[ids.length - 1]! };
  };
  const funnel = await funnelOf(deps({ records, firsts: async () => ((asked += 1), { agent: null, brief: null }) }));
  assert.ok(funnel);
  assert.equal(funnel.asked, FUNNEL_RECORDS_MOST);
  assert.equal(asked, FUNNEL_RECORDS_MOST);
  assert.equal(funnel.more, true);
});

test('the answer is counts and weeks, with no record named', async () => {
  const out = await opsFunnel(at(), deps({ records: async () => ({ ids: ['record-with-a-name'] }) }));
  const text = await out.text();
  assert.doesNotMatch(text, /record-with-a-name/);
});
