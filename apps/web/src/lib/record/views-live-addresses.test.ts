/**
 * A saved view this record does not hold, and the addresses the refusal hands the reader.
 *
 * THE HEADER OF `views-live.ts` PROMISED MORE THAN THE RECORD ANSWERS. It said `VIEW_UNKNOWN` is "a
 * view this record does not hold, carrying the addresses it does hold, so the answer ends the search
 * instead of starting one". Measured against the record: `view` builds `allowed` from
 * `kernel.views(args.register)` (`packages/record/src/index.ts:3242`), and `kernel.views` with a
 * register named is `FROM view WHERE register = ?` (`packages/kernel/src/index.ts:5237`). So the
 * addresses are that ONE register's, and a key naming a register with no views — a list that has
 * been retired, a rail entry that outlived what it pointed at, a typed address — came back with an
 * empty set, which `/v/[view]` prints as "This record has no saved views yet." over a record holding
 * several. That is the shape of a usability finding: a stale entry
 * leading to a refusal whose helpful half is not only unusable but untrue.
 *
 * AND THE SECOND READ IS PAID FOR ONLY WHERE IT BUYS SOMETHING. A register that does hold views has
 * already answered the question, so nothing more is asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { viewReader, type Fetch } from './views-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (url: URL) => Response): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    return answer(at);
  }) as Fetch;
  return { io, sent };
}

/** One saved view as `views` lists one, and only the keys this route reads off the list. */
const LISTED = [
  { register: 'services', id: 'lapsing', name: 'Winding down' },
  { register: 'invoices', id: 'overdue', name: 'Overdue' },
];

/** The record's answer to `view` for a register that holds none: its own sentence, and nothing to offer. */
const noneHere = (register: string, id: string): Response =>
  json(404, { ok: false, refusal: { code: 'VIEW_UNKNOWN', fix: `${register} has no view called ${id}.`, at: 'id', allowed: [] } });

test('A REGISTER WITH NO VIEWS ASKS THE RECORD WHAT IT DOES HOLD, rather than answering nobody', async () => {
  const { io, sent } = host((url) =>
    url.pathname === '/api/view'
      ? noneHere('ghost', 'overdue')
      : url.pathname === '/api/views'
        ? json(200, { ok: true, value: LISTED })
        : json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } }),
  );
  assert.deepEqual(await viewReader(BASE, io).read('ghost.overdue'), {
    from: 'missing',
    /* THE RECORD'S OWN SENTENCE IS UNTOUCHED. Only the half that lists addresses is filled in. */
    said: 'ghost has no view called overdue.',
    addresses: ['services.lapsing', 'invoices.overdue'],
  });
  assert.equal(sent.filter((u) => u.pathname === '/api/views').length, 1, 'the record was asked more than once, or not at all');
});

test('and a record that really holds none still says so', async () => {
  /* THE TWO NOTHINGS ARE DIFFERENT FACTS, and this is the one where the screen's sentence is right:
     an empty list back from `views` is a record with nothing saved anywhere. */
  const { io } = host((url) => (url.pathname === '/api/view' ? noneHere('services', 'overdue') : json(200, { ok: true, value: [] })));
  assert.deepEqual(await viewReader(BASE, io).read('services.overdue'), {
    from: 'missing',
    said: 'services has no view called overdue.',
    addresses: [],
  });
});

test('a register that holds views has already answered, and is not asked twice', async () => {
  const { io, sent } = host((url) =>
    url.pathname === '/api/view'
      ? json(404, { ok: false, refusal: { code: 'VIEW_UNKNOWN', fix: 'services has no view called overdue.', at: 'id', allowed: ['lapsing', 'renewing'] } })
      : json(200, { ok: true, value: LISTED }),
  );
  assert.deepEqual(await viewReader(BASE, io).read('services.overdue'), {
    from: 'missing',
    said: 'services has no view called overdue.',
    addresses: ['services.lapsing', 'services.renewing'],
  });
  assert.deepEqual(sent.filter((u) => u.pathname === '/api/views'), [], 'a miss that already named the addresses cost a second read');
});

test('and a record that would not list its views leaves the sentence alone', async () => {
  /* A SECOND READ THAT IS REFUSED IS NOT A SECOND REFUSAL ON THE SCREEN. The reader came for the
     first sentence, and it is still the true one; the addresses are simply not there to offer. */
  const { io } = host((url) =>
    url.pathname === '/api/view'
      ? noneHere('ghost', 'overdue')
      : json(403, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'Only an owner can read the saved views.' } }),
  );
  assert.deepEqual(await viewReader(BASE, io).read('ghost.overdue'), {
    from: 'missing',
    said: 'ghost has no view called overdue.',
    addresses: [],
  });
});
