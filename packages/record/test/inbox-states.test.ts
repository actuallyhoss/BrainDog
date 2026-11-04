/**
 * The inbox by state, with a count for each.
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS. `inbox` read only `untriaged` and `review` and checked no key it was handed, so
 * `api.inbox({ state: 'skipped' }, owner)` on a record holding one skipped and two untriaged arrivals answered the two
 * untriaged ones, as if the question had been the default, and carried no counts. An arrival a pattern skipped could
 * not be read back by anybody, and a skip pattern that is too wide is only ever found by reading what it skipped.
 *
 * THE TOKEN HALF IS NOT HERE. Whether an agent's record-wide token reads the inbox is a grant of its own, and without it
 * the owner reads it and every token is refused, as `read.test.ts` asserts. The last test holds the new argument to the
 * same refusal, so asking for a state is not a way round it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext, type InboxPage } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 9);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'read', person: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown): { code: string; fix: string; at?: string; allowed?: string[] } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string; allowed?: string[] } };
  assert.equal(x.ok, false, JSON.stringify(x));
  return x.refusal!;
};

/**
 * One arrival in each state, oldest first, plus a second untriaged one. `arrive` stores every one `untriaged`, since no
 * ingest is declared, and the state is then set the way a pattern's `skip:` or a filing would have left it.
 */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const states = ['untriaged', 'skipped', 'review', 'matched', 'proposed', 'ignored', 'erased', 'untriaged'] as const;
  const ids: string[] = [];
  for (const [n, state] of states.entries()) {
    const out = value<{ raw: string }>(
      api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n + 1}, ${state}` }, body: `Body ${n + 1}`, sha256: `s${n + 1}` }),
    );
    sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', state, out.raw);
    ids.push(out.raw);
  }
  return { api, sql, ids };
}

const EVERY = { untriaged: 2, review: 1, skipped: 1, matched: 1, proposed: 1, ignored: 1 };

test('THE INBOX IS READ BY STATE: a skipped arrival is answered when skipped is asked for, with a count for every state', async () => {
  const { api, sql } = await record();
  const skipped = value<InboxPage>(await api.inbox({ state: 'skipped' }, owner));
  assert.deepEqual(skipped.arrivals.map((a) => [a.subject, a.state]), [['Text 2, skipped', 'skipped']]);
  assert.equal(skipped.cursor, null);
  assert.deepEqual(skipped.counts, EVERY, 'a count for each of the six states, whichever one was asked for');
  sql.close();
});

test("WITH NO STATE IT IS TODAY'S PAIR, newest first, and the count on the rail is still their sum", async () => {
  const { api, sql } = await record();
  const page = value<InboxPage>(await api.inbox({}, owner));
  assert.deepEqual(page.arrivals.map((a) => a.subject), ['Text 8, untriaged', 'Text 5, proposed', 'Text 3, review', 'Text 1, untriaged']);
  assert.deepEqual(value<InboxPage>(await api.inbox(undefined, owner)).arrivals, page.arrivals, 'no arguments at all is the same answer');
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, page.counts.untriaged + page.counts.review + page.counts.proposed);
  sql.close();
});

test('ALL IS EVERY STATE BUT ERASED, a page at a time, and the pages join to the whole', async () => {
  const { api, sql } = await record();
  const whole = value<InboxPage>(await api.inbox({ state: 'all', limit: 200 }, owner));
  assert.deepEqual(
    whole.arrivals.map((a) => a.state),
    ['untriaged', 'ignored', 'proposed', 'matched', 'review', 'skipped', 'untriaged'],
    'newest first, and the erased arrival, whose bytes are gone, left out',
  );
  assert.equal(whole.arrivals.length, Object.values(whole.counts).reduce((a, b) => a + b, 0), 'the counts add up to what all answers');

  const pages: string[][] = [];
  let cursor: number | null = null;
  do {
    const page: InboxPage = value<InboxPage>(await api.inbox({ state: 'all', limit: 3, ...(cursor === null ? {} : { cursor }) }, owner));
    pages.push(page.arrivals.map((a) => a.id));
    cursor = page.cursor;
  } while (cursor !== null);
  assert.deepEqual(pages.flat(), whole.arrivals.map((a) => a.id), 'pages of three join to the whole, no arrival twice');

  for (const state of ['matched', 'proposed', 'ignored', 'review'] as const)
    assert.deepEqual(
      value<InboxPage>(await api.inbox({ state }, owner)).arrivals.map((a) => a.state),
      [state],
      `${state} answers its own arrival and no other`,
    );
  sql.close();
});

test('A STATE THE INBOX DOES NOT SHOW IS REFUSED BY NAME, and so is a key it does not take', async () => {
  const { api, sql } = await record();
  for (const said of ['erased', 'Skipped', '', 3, null]) {
    const no = refusal(await api.inbox({ state: said } as never, owner));
    assert.equal(no.code, 'VALUE_MALFORMED', `state ${JSON.stringify(said)} was refused with ${no.code}`);
    assert.equal(no.at, 'state');
    assert.deepEqual(no.allowed, ['untriaged', 'review', 'skipped', 'matched', 'proposed', 'ignored', 'all']);
  }
  /* THE RECORD'S OWN WORD FOR A KEY NOBODY TAKES. `{ status: 'skipped' }` was answered as the default pair, which reads
     as "nothing was skipped" to whoever misspelt it. */
  const stray = refusal(await api.inbox({ status: 'skipped' } as never, owner));
  assert.equal(stray.code, 'FIELD_UNKNOWN');
  assert.equal(stray.at, 'status');
  assert.deepEqual(stray.allowed, ['state', 'cursor', 'limit', 'repeats', 'digest', 'id']);
  sql.close();
});

test('ASKING FOR A STATE IS NOT A WAY ROUND THE OWNER: a record-wide token is still refused, and told no count', async () => {
  const { api, sql } = await record();
  const plain = refusal(await api.inbox(undefined, token));
  for (const state of ['skipped', 'all'] as const) {
    const no = refusal(await api.inbox({ state }, token));
    assert.equal(no.code, 'FORBIDDEN');
    assert.equal(no.fix, plain.fix, 'the same sentence as a token asking for nothing');
    assert.doesNotMatch(JSON.stringify(no), /Text \d|"counts"/, 'the refusal said what the inbox holds');
  }
  /* AND REFUSED BEFORE ITS ARGUMENTS ARE READ, so a stray key does not tell a token which keys the inbox takes. */
  assert.equal(refusal(await api.inbox({ status: 'skipped' } as never, token)).code, 'FORBIDDEN');
  sql.close();
});
