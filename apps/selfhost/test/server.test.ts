/**
 * `/in/*` on a self-host: the door something arrives at from outside.
 *
 * THE ROUTE WAS BUILT AND NOTHING DISPATCHED IT. `packages/host/src/ingest.ts` had `serveIngest`,
 * its own tests and a header explaining every refusal, and no host called it: measured on
 * 2026-09-20 against this server, `POST /in/webhook/<a declared ingest>` answered 404
 * `ROUTE_UNKNOWN` from the `/api` fallback, and with a shell configured it would have answered
 * `index.html` and a 200, which a sender's retry logic reads as delivered. The whole extraction
 * pipeline was reachable by no message at all.
 *
 * WHAT IS ASSERTED HERE IS THE TWO RULES, AND THEY PULL AGAINST EACH OTHER. An arrival nobody
 * understands is still stored, so a wrong token is a row somebody can look at rather than a 403
 * nobody ever sees; and an arrival nothing vouched for never matches, so the row it leaves cannot
 * become a transaction in somebody's ledger. Every test below is one of the two.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Declaration } from '@braindog/kernel';

import { start } from '../src/server.ts';

/** Obviously not a real token. It stands in for what `init` writes to `<slug>/inbound.token`. */
const INBOUND = 'not-a-real-inbound-token-just-a-fixture';

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'last4', fields: [{ id: 'last4', type: 'text', required: true }] } as never,
};

const TRANSACTIONS: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

/** A mail pattern, so a forwarded message that passes DKIM writes a row and one that does not writes none. */
const HSBC: Declaration = {
  id: 'ingest.hsbc-sms',
  kind: 'ingest',
  body: {
    ingest: 'hsbc-sms',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@hsbc.example' }, { field: 'subject', contains: 'transaction' }] },
    extract: { merchant: { text: { between: ['at ', ' on'] } }, amount: { money: { after: 'EGP', currency: 'EGP' } } },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
};

/** A webhook pattern, which this build can declare and nothing can yet verify. */
const HOOK: Declaration = {
  id: 'ingest.till',
  kind: 'ingest',
  body: {
    ingest: 'till',
    channel: 'webhook',
    match: { field: 'body', contains: 'charge' },
    extract: { merchant: { text: { between: ['"merchant":"', '"'] } } },
    writes: { register: 'transactions', confidence: 'exact' },
  } as never,
};

/** A forwarded RFC 5322 message, as a provider hands one to a host with no MX (`49 §13` #3). */
const forwarded = (dkim: 'pass' | 'fail'): string =>
  message({ dkim, signer: 'hsbc.example', amount: '1,316.24', merchant: 'Halden Coffee' });

/**
 * One forwarded message, with the two things a forgery varies held apart.
 *
 * `signer` IS THE `header.d` AND IT IS NOT THE `From:`, which is the whole point of the parameter.
 * DKIM signs for whatever domain holds the key; alignment between that domain and the address a
 * person reads is a separate question, and the test below exists because this file did not ask it.
 */
const message = (of: { dkim: 'pass' | 'fail'; signer: string; amount: string; merchant: string }): string =>
  [
    `Authentication-Results: mx.forwarder.example; dkim=${of.dkim} header.d=${of.signer}; spf=fail`,
    'From: alerts@hsbc.example',
    'Subject: Your transaction alert',
    '',
    `Your card ending 4471 was debited EGP ${of.amount} at ${of.merchant} on 03/04/26.`,
  ].join('\r\n');

type Running = Awaited<ReturnType<typeof start>>;

/** A record with both patterns installed, its inbound token on disk before boot, and the port it listens on. */
async function host(): Promise<{ running: Running; port: number; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-in-'));
  /* WRITTEN BEFORE `start`, because the token is read once at boot: a file appearing later is a
     restart away from being served, which is the same rule the server key follows. */
  writeFileSync(join(dir, 'inbound.token'), INBOUND);
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0 });
  assert.ok((await running.api.kernel.install([ACCOUNTS, TRANSACTIONS, HSBC, HOOK])).ok);
  assert.ok(
    running.api.kernel.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_self' },
    }).ok,
  );
  return { running, port: (running.server.address() as { port: number }).port, dir };
}

const stop = async (made: { running: Running; dir: string }): Promise<void> => {
  await made.running.close();
  rmSync(made.dir, { recursive: true, force: true });
};

const send = (port: number, path: string, body: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body, ...init });

type Raw = { state: string; reason: string | null; body: string; channel: string };

const raws = (running: Running): Raw[] =>
  running.sql.all<Raw>('SELECT state, reason, body, channel FROM inbox_raw ORDER BY rowid');

const rows = (running: Running): number => running.sql.all('SELECT 1 FROM entry').length;

/* ── a webhook ───────────────────────────────────────────────────────────── */

test('A WEBHOOK ARRIVES, IS STORED, AND IS NOT MATCHED, because nothing verified it', async () => {
  const made = await host();
  try {
    const out = await send(made.port, '/in/webhook/till', '{"merchant":"Halden Coffee","charge":1316}');
    assert.equal(out.status, 202, 'the route is not dispatched');
    assert.equal(await out.text(), '', 'the answer told a stranger something');

    /* THE BYTES ARE IN THE RECORD. This is the rule the predecessor breaks by dropping an SMS no
       pattern matched, and no repair here may weaken it: the payload is readable in the inbox. */
    const [row] = raws(made.running);
    assert.equal(row?.channel, 'webhook');
    assert.equal(row?.body, '{"merchant":"Halden Coffee","charge":1316}');

    /* AND IT NEVER REACHED THE PATTERN. `12 §3`: an unverified payload is stored `untriaged` and
       never matched. The sentence on the row is the kernel's `UNVERIFIED`, which `@braindog/kernel`
       does not re-export, so what is pinned here is the property rather than the string. */
    assert.equal(row?.state, 'untriaged');
    assert.match(row?.reason ?? '', /verified/);
    assert.equal(rows(made.running), 0, 'an unverified payload wrote a row into a register');
  } finally {
    await stop(made);
  }
});

test('and an ingest nobody declared is 404, with nothing stored and nothing said', async () => {
  const made = await host();
  try {
    const out = await send(made.port, '/in/webhook/nobody-declared-this', 'charge');
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '');
    assert.equal(raws(made.running).length, 0, 'a guessed id cost a row');
  } finally {
    await stop(made);
  }
});

test('and a `pull` ingest is not a webhook, so its own id is 404 at this door', async () => {
  const made = await host();
  try {
    /* A connector's id is a thing the record fetches on a schedule. Accepting a POST at one would
       feed its register through a door meant for a bank, with none of the connector's checks. */
    assert.ok(
      (
        await made.running.api.kernel.install([
          {
            id: 'ingest.rates',
            kind: 'ingest',
            body: {
              ingest: 'rates',
              channel: 'pull',
              every: '1h',
              map: { merchant: { path: 'name', type: 'text' } },
              fetch: {
                base: 'https://rates.example',
                path: '/today',
                auth: { kind: 'none' },
                schedule: { every: '1h' },
                read: { rows: 'data' },
              },
              writes: { register: 'transactions' },
            } as never,
          },
        ])
      ).ok,
    );
    /* THE EMPTY BODY IS WHAT SAYS THE DOOR ANSWERED, and not the `/api` fallback behind it.
       Measured on 2026-09-20 by commenting the `/in/*` line out of `answer()`: this test and the
       two below it still passed, because the fallback's own 404 carries a `ROUTE_UNKNOWN` sentence
       and only the status was being read. `serveIngest` answers 404 with no body at all, so the
       two are one assertion apart. */
    const out = await send(made.port, '/in/webhook/rates', 'charge');
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '', 'the `/api` fallback answered, not the arrival door');
    assert.equal(raws(made.running).length, 0);
  } finally {
    await stop(made);
  }
});

test("and the Cloud's own webhook shape is declined here, rather than answered by half", async () => {
  const made = await host();
  try {
    /* `/in/webhook/<rec>/<ingest>/<token>` is a URL for a Worker serving every record. A self-host
       serving one record would either ignore the first segment, making two URLs one door, or
       compare it, which tells whoever holds the URL what this record's id is. */
    const out = await send(made.port, '/in/webhook/rec_01JZ8QK3F7R2M9V4XN6TCB5HAD/till/some-token', 'charge');
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '', 'the `/api` fallback answered, not the arrival door');
    assert.equal(raws(made.running).length, 0);
  } finally {
    await stop(made);
  }
});

test('and a GET is 405 with `allow: POST`, which is the one thing it says', async () => {
  const made = await host();
  try {
    const out = await fetch(`http://127.0.0.1:${made.port}/in/webhook/till`);
    assert.equal(out.status, 405);
    assert.equal(out.headers.get('allow'), 'POST');
    assert.equal(await out.text(), '');
  } finally {
    await stop(made);
  }
});

/* ── forwarded mail ──────────────────────────────────────────────────────── */

test('A FORWARDED MESSAGE THE MTA VOUCHED FOR IS MATCHED, and the pipeline is reachable at last', async () => {
  const made = await host();
  try {
    const out = await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'));
    assert.equal(out.status, 202);
    assert.equal(await out.text(), '');

    const [row] = raws(made.running);
    assert.equal(row?.channel, 'email');
    assert.equal(row?.state, 'matched', 'a message with dkim=pass was not eligible to match');
    assert.equal(row?.reason, null);

    /* THE HEAD WAS READ OUT OF THE BODY, which is what makes `from is "alerts@hsbc.example"` true
       for a message that arrived over HTTP rather than over SMTP. */
    const wrote = made.running.sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions'");
    assert.equal((JSON.parse(wrote?.fields ?? '{}') as { merchant?: string }).merchant, 'Halden Coffee');
  } finally {
    await stop(made);
  }
});

test('and one it did not vouch for is stored and left alone', async () => {
  const made = await host();
  try {
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, forwarded('fail'))).status, 202);
    const [row] = raws(made.running);
    assert.equal(row?.state, 'untriaged');
    assert.match(row?.reason ?? '', /verified/);
    assert.equal(rows(made.running), 0, 'a message no forwarder vouched for wrote a row');
  } finally {
    await stop(made);
  }
});

test('and a wrong inbound token is 404, whatever it carries', async () => {
  const made = await host();
  try {
    const out = await send(made.port, '/in/email/not-the-token', forwarded('pass'));
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '');
    assert.equal(raws(made.running).length, 0, 'a wrong token still reached the record');
  } finally {
    await stop(made);
  }
});

test('and a host with no token file takes no forwarded mail at all', async () => {
  /* A record made before `init` wrote the file. The surface is not there, rather than open. */
  const dir = mkdtempSync(join(tmpdir(), 'braindog-in-none-'));
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0 });
  const port = (running.server.address() as { port: number }).port;
  try {
    const out = await send(port, `/in/email/${INBOUND}`, forwarded('pass'));
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '', 'the `/api` fallback answered, not the arrival door');
  } finally {
    await stop({ running, dir });
  }
});

/* ── the budget ──────────────────────────────────────────────────────────── */

test('A FLOOD AT ONE INGEST IS RATIONED, and the answer says how long to wait', async () => {
  /* The flood that matters is the one aimed at a single ingest, because that is the one that fills
     a record. 120 a minute is the ceiling; the 121st is refused with `Retry-After`. */
  const made = await host();
  try {
    for (let i = 0; i < 120; i++) assert.equal((await send(made.port, '/in/webhook/till', `charge ${i}`)).status, 202);
    const out = await send(made.port, '/in/webhook/till', 'charge 121');
    assert.equal(out.status, 429);
    assert.match(out.headers.get('retry-after') ?? '', /^[0-9]+$/);
    const said = (await out.json()) as { refusal?: { code?: string } };
    assert.equal(said.refusal?.code, 'RATE_LIMITED');
    assert.equal(raws(made.running).length, 120, 'the refused arrival was stored anyway');
  } finally {
    await stop(made);
  }
});

test('and a thousand invented ingest ids do not close the door on the real ones', async () => {
  /**
   * THE KEY OF THE BUDGET IS A PATH A STRANGER TYPES, so the table it lives in is a table a stranger
   * fills. Measured on 2026-09-20 against the first cut: 1,000 POSTs to `/in/webhook/invented-<n>`,
   * which cost no credential and left no row, filled the map to its ceiling, and the next arrival at
   * a real ingest and the next forwarded message were both refused 429 until the window rolled. That
   * is the whole arrival surface closed by anybody who can reach the port, over and over, for free.
   */
  const made = await host();
  try {
    for (let i = 0; i < 1_000; i++) await send(made.port, `/in/webhook/invented-${i}`, 'x');
    assert.equal((await send(made.port, '/in/webhook/till', 'charge')).status, 202, 'a stranger closed the webhook door');
    assert.equal(
      (await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'))).status,
      202,
      'a stranger closed the mail door as well, which is the one a bank writes to',
    );
  } finally {
    await stop(made);
  }
});

/**
 * The status a POST answers when it declares `length` bytes and then sends a kilobyte of them.
 *
 * IT NEVER ENDS THE REQUEST, WHICH IS THE POINT. A host that refuses on the declared length answers
 * on the headers alone and never waits for the rest; one that does not wait for ever, so waiting is
 * reported as `0` rather than left to hang the runner.
 */
function declares(port: number, path: string, length: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: 'POST', path, headers: { 'content-length': String(length) } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    const waited = setTimeout(() => {
      req.destroy();
      resolve(0);
    }, 3_000);
    waited.unref();
    /* The server destroys the socket once it has answered, so a write after that is expected to fail. */
    req.on('error', (e) => (/EPIPE|ECONNRESET|ECANCELED/.test(e.message) ? undefined : reject(e)));
    req.write(Buffer.alloc(1024, 32));
  });
}

test('and a body this door will never take is refused before it is read', async () => {
  /**
   * `answer()` WEIGHS EVERY BODY BEFORE IT ROUTES, AND ITS CEILING IS A HUNDRED MEBIBYTES. That is
   * the right number for `/api/import`, which a signed-in owner calls. `/in/*` is the one path here
   * with no credential on it at any point, and measured on 2026-09-20 an 8 MiB POST to
   * `/in/webhook/till` from anybody who could reach the port was read whole into this process and
   * only then compared against the one mebibyte the channel allows. On a host bound to `0.0.0.0`,
   * which is the default once a token is set, that was a hundred megabytes per connection for free.
   */
  const made = await host();
  try {
    assert.equal(await declares(made.port, '/in/webhook/till', 8 * 1024 * 1024), 413, 'the host waited for a body it will never accept');

    /* AND EVERYTHING UNDER THAT STILL REACHES THE DOOR, which is why the reader's ceiling is above
       the largest channel ceiling and not equal to it: `serveIngest`'s 413 names the exact number a
       sender can act on, and the reader's names nothing. */
    const under = await send(made.port, '/in/webhook/till', 'x'.repeat(2 * 1024 * 1024));
    assert.equal(under.status, 413);
    const said = (await under.json()) as { refusal?: { code?: string } };
    assert.equal(said.refusal?.code, 'BODY_MALFORMED', 'a sender just over the channel ceiling was told nothing it could use');
  } finally {
    await stop(made);
  }
});

/* ── a redelivery, and a forgery ─────────────────────────────────────────── */

test('THE SAME MESSAGE TWICE IS ONE ARRIVAL, because a forwarder that retries is not a second payment', async () => {
  const made = await host();
  try {
    const twice = forwarded('pass');
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, twice)).status, 202);
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, twice)).status, 202, 'a retry was refused rather than absorbed');
    /* THE SECOND POST ANSWERS 202 AND WRITES NOTHING, which is what a retrying sender needs: a
       refusal would have it keep trying, and a second row would have the ledger say the card was
       debited twice. `kernel.arrive` is idempotent on the pair `(channel, sha256)`. */
    assert.equal(raws(made.running).length, 1, 'a redelivery was stored as a second arrival');
    assert.equal(rows(made.running), 1, 'a redelivery was paid for twice in the register');
  } finally {
    await stop(made);
  }
});

test('A STRANGER WHO SIGNS WITH THEIR OWN DOMAIN IS NOT THE BANK, however well their signature verifies', async () => {
  /**
   * THE FORGERY THIS CATCHES IS THE ONE AFTER THE `Authentication-Results` ONE. Reading only the top
   * hop stops a sender writing its own verdict; it does not stop a sender earning a real one. DKIM
   * says "the holder of the key for `header.d` signed these bytes" and says nothing whatever about
   * the `From:` line, so a stranger who owns `evil.example`, signs correctly with it, and puts
   * `From: alerts@hsbc.example` on the message collects a genuine `dkim=pass` from the forwarder.
   * Measured on 2026-09-20 against the first cut, which searched the top hop for the substring
   * `dkim=pass`: the message below was stored `matched`, extracted, and written into the register as
   * a EGP 9,999.00 debit at a merchant the attacker chose. SPF is worse, because a forwarder rewrites
   * the envelope sender and an `spf=pass` on forwarded mail is the forwarder vouching for itself.
   */
  const made = await host();
  try {
    const forgery = message({ dkim: 'pass', signer: 'evil.example', amount: '9,999.00', merchant: 'Evil Corp' });
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, forgery)).status, 202);

    /* STILL STORED, because that rule outranks this one: the owner can read the forgery in the inbox
       and see what somebody tried, which is more than a 403 would have told them. */
    const [row] = raws(made.running);
    assert.equal(row?.body, forgery);
    assert.equal(row?.state, 'untriaged', 'a signature from evil.example vouched for a message from hsbc.example');
    assert.match(row?.reason ?? '', /verified/);
    assert.equal(rows(made.running), 0, 'a forged bank alert was written into the ledger');
  } finally {
    await stop(made);
  }
});
