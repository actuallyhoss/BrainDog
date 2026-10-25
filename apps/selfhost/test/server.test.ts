/**
 * `/in/*` on a self-host: the door something arrives at from outside.
 *
 * THE ROUTE WAS BUILT AND NOTHING DISPATCHED IT. `packages/host/src/ingest.ts` had `serveIngest`,
 * its own tests and a header explaining every refusal, and no host called it: measured
 * against this server, `POST /in/webhook/<a declared ingest>` answered 404
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
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Declaration } from '@braindog/kernel';
import type { CallContext } from '@braindog/record';

import { IN_TOKEN_MS, start } from '../src/server.ts';

/**
 * The token `init` would have written, minted here and never anywhere else.
 *
 * MADE AT RUN TIME BECAUSE A TOKEN IN THE TREE IS A TOKEN THAT OUTLIVES ITS FILE. A real one is
 * `randomBytes(32).toString('base64url')` written 0600 into the data directory
 * (`apps/selfhost/src/main.ts:333`), and the only safe copy of that shape in a repository is none:
 * a checked-in fixture gets copied into a deployment's data directory by whoever is reading the
 * test to find out what the file should look like. These live in a temp directory for the length
 * of one run and are deleted with it.
 *
 * AND THE DOOR MUST NOT CARE WHAT IS IN THEM, which is the second thing a fresh pair proves: the
 * comparison is against a digest, so a token with no fixed value cannot be what any assertion here
 * is really passing on.
 */
const token = (): string => randomBytes(32).toString('base64url');
const INBOUND = token();

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

/** A record with both patterns installed, its inbound token on disk, and the port it listens on. */
async function host(now?: () => number): Promise<{ running: Running; port: number; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-in-'));
  writeFileSync(join(dir, 'inbound.token'), INBOUND);
  const running = await start({ file: join(dir, 'record.brain'), port: 0, pollMs: 0, ...(now === undefined ? {} : { now }) });
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
       Measured by commenting the `/in/*` line out of `answer()`: this test and the
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

test("and the Cloud's own webhook shape is declined for an ingest that reads no token", async () => {
  const made = await host();
  try {
    /* THIS RECORD'S OWN ID IS IN THE URL AND IT IS STILL A 404, because `till` declares no `verify:` and
       so has nothing that would read the last segment. The self-host does compare the first segment now
       (`arrivalDoor` in `src/server.ts` says why the oracle it was once said to open is
       not one); what it will not do is let a second URL reach an ingest whose one URL has no token in it,
       which would make two URLs one door. `shortcut-arrival.test.ts` is the ingest that does read one. */
    const out = await send(made.port, '/in/webhook/rec_01JZ8QK3F7R2M9V4XN6TCB5HAD/till/some-token', 'charge');
    assert.equal(out.status, 404);
    assert.equal(await out.text(), '', 'the `/api` fallback answered, not the arrival door');
    assert.equal(raws(made.running).length, 0);
  } finally {
    await stop(made);
  }
});

/** A webhook that reads a path token, matching every `charge` the way `till` does. */
const TOKENED = (ingest: string): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: { ...(HOOK.body as object), ingest, verify: { kind: 'path' } } as never,
});

test('A TOKEN MINTED FOR ONE INGEST IS MATCHED BY THAT INGEST, though two declared before it match the same text', async () => {
  const made = await host();
  try {
    /* THE URL NAMED `till-b` AND THE RECORD TRIED `till` FIRST. Measured before the arrival carried the
       ingest: this POST came back `matched` with `till` on the receipt, because the door dropped every part
       of the URL but the flag and the kernel offered a verified webhook to each webhook pattern in
       declaration order. `till` and `till-a` both match `charge` and neither sender holds this token. */
    assert.ok((await made.running.api.kernel.install([TOKENED('till-a'), TOKENED('till-b')])).ok);
    const owner: CallContext = { principal: { kind: 'person', id: 'p_self', level: 'owner' } };
    const mint = await made.running.api.ingestMint({ ingest: 'till-b' }, owner);
    assert.ok(mint.ok, JSON.stringify(mint));

    const out = await send(made.port, `/in/webhook/rec_01JZ8QK3F7R2M9V4XN6TCB5HAD/till-b/${mint.value.token}`, '{"merchant":"Halden Coffee","charge":1316}');
    assert.equal(out.status, 202);
    assert.equal(raws(made.running)[0]?.state, 'matched');
    const receipt = made.running.sql.one<{ ingest_id: string }>('SELECT ingest_id FROM ingest_receipt');
    assert.equal(receipt?.ingest_id, 'till-b', 'the arrival was matched by an ingest its token was not minted for');
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
   * fills. Measured against the first cut: 1,000 POSTs to `/in/webhook/invented-<n>`,
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
   * with no credential on it at any point, and, measured, an 8 MiB POST to
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
   * Measured against the first cut, which searched the top hop for the substring
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

/* ── rotation, which is the way out of a credential ──────────────────────── */

/**
 * `<slug>/inbound.token` is the whole of the door, so replacing the file has to be the whole of the
 * rotation.
 *
 * WHAT WAS WRONG IS THAT THERE WAS NO WAY OUT. The file is written once by `init`
 * (`apps/selfhost/src/main.ts:333`) and was read once at boot, so the token a person pasted into
 * their bank's forwarding settings was the token that record had for as long as the process lived.
 * A forwarding address is handed to a third party by definition: it goes into a mail provider's
 * rule, a bank's alert settings, sometimes an email to support. Every one of those is a place it
 * can leak from, and the answer to a leaked credential is a new one, not a restart scheduled for
 * whenever somebody next notices.
 *
 * THE CLOCK IS MOVED RATHER THAN WAITED ON, because the door reads the file at most once every
 * `IN_TOKEN_MS`, and `now` is the same injected clock the keychain's fifteen minutes are tested with.
 */
test('A TOKEN IS ROTATED BY REPLACING THE FILE, and the old one stops opening the door', async () => {
  let at = Date.now();
  const made = await host(() => at);
  const rotated = token();
  try {
    /* THE OLD ONE WORKS FIRST, so what the rest of this test measures is the rotation and not a
       door that never opened. */
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'))).status, 202);

    /* WRITTEN WITH THE NEWLINE AN EDITOR ADDS, because that is what a rotation done by hand leaves
       on disk and the reader trims for exactly that reason. An operator who rotated with `nano` and
       met an untrimmed reader would have been left with a door that opened for nobody: the two tests
       below say that in their own names, and this line is only where it first mattered. */
    writeFileSync(join(made.dir, 'inbound.token'), `${rotated}\n`);
    at += IN_TOKEN_MS;

    const old = await send(made.port, `/in/email/${INBOUND}`, message({ dkim: 'pass', signer: 'hsbc.example', amount: '2.00', merchant: 'After' }));
    assert.equal(old.status, 404, 'the rotated-out token still opened the door');
    assert.equal(await old.text(), '', 'the `/api` fallback answered, not the arrival door');

    const fresh = await send(made.port, `/in/email/${rotated}`, message({ dkim: 'pass', signer: 'hsbc.example', amount: '3.00', merchant: 'Fresh' }));
    assert.equal(fresh.status, 202, 'the token now on disk did not open the door');

    /* TWO ARRIVALS AND NOT THREE: the first, and the one the new token carried. */
    const seen = raws(made.running);
    assert.equal(seen.length, 2, 'the message sent with the old token was stored anyway');
    assert.match(seen[1]?.body ?? '', /Fresh/u);
  } finally {
    await stop(made);
  }
});

test('and deleting the file shuts the door, which is a revocation with nothing to replace it', async () => {
  /* THE OPERATOR WHOSE TOKEN LEAKED AND WHO IS NOT READY WITH ANOTHER needs the surface gone now,
     not open until they think of a replacement. `rm` is that, and it needs no new command. */
  let at = Date.now();
  const made = await host(() => at);
  try {
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'))).status, 202);
    rmSync(join(made.dir, 'inbound.token'));
    at += IN_TOKEN_MS;

    const out = await send(made.port, `/in/email/${INBOUND}`, message({ dkim: 'pass', signer: 'hsbc.example', amount: '4.00', merchant: 'Revoked' }));
    assert.equal(out.status, 404, 'a deleted token file left the door open');
    assert.equal(await out.text(), '');
    assert.equal(raws(made.running).length, 1, 'a revoked token still reached the record');
  } finally {
    await stop(made);
  }
});

test('and four messages arriving together are four arrivals, not one read and three refusals', async () => {
  /**
   * A FORWARDER'S QUEUE DRAINING IS SEVERAL MESSAGES IN ONE TICK, and the window that keeps the
   * door off the disk must not turn that into 404s. The first cut of `inboundDigest` stamped the
   * window before it awaited the digest and kept the ANSWER rather than the read, so callers two,
   * three and four found the window already closed and were handed the value from before the read,
   * which is `null`: measured, three of four callers in one tick. A message refused
   * 404 is one a forwarder may not send again.
   */
  const made = await host();
  try {
    const out = await Promise.all(
      ['One', 'Two', 'Three', 'Four'].map((merchant) =>
        send(made.port, `/in/email/${INBOUND}`, message({ dkim: 'pass', signer: 'hsbc.example', amount: '5.00', merchant })),
      ),
    );
    assert.deepEqual(
      out.map((r) => r.status),
      [202, 202, 202, 202],
      'a message was refused because another was reading the token file',
    );
    assert.equal(raws(made.running).length, 4);
  } finally {
    await stop(made);
  }
});

test('and a file caught half-written opens nothing, rather than opening on the empty string', async () => {
  /**
   * A REPLACEMENT IS NOT ATOMIC AND THE WINDOW IS A REAL FILE STATE. `writeFileSync` truncates and
   * then writes, so a reader that lands between the two sees zero bytes; an operator using
   * `> inbound.token` leaves exactly that state for as long as their editor takes. The digest of
   * the empty string is a perfectly good digest, so a door that took it would be a door whose
   * secret is knowable, and the only reason nothing can spend it today is that `servesIngest`
   * happens to refuse an empty path segment. Relying on that is relying on a second file.
   */
  let at = Date.now();
  const made = await host(() => at);
  try {
    writeFileSync(join(made.dir, 'inbound.token'), '   \n');
    at += IN_TOKEN_MS;

    const out = await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'));
    assert.equal(out.status, 404, 'a token file holding whitespace still served the old token');
    assert.equal(raws(made.running).length, 0);
  } finally {
    await stop(made);
  }
});

/**
 * The two halves of the `.trim()` in `load()` (`apps/selfhost/src/server.ts:465`), each named for the
 * half it holds, because until 2026-09-21 neither had a test of its own.
 *
 * WHAT HELD THE TRIM BEFORE THIS WAS A TRAILING BYTE IN THE ROTATION TEST ABOVE, where the newline is
 * incidental to what that test is about. Remove the trim and the rotation test does go red, but its
 * message is "the token now on disk did not open the door", which sends the next reader looking at the
 * window, the digest or the rotation, and not at the one character that changed.
 *
 * MEASURED BY DELETING THE `.trim()` AND RUNNING THIS FILE: 23 tests, 20 pass, 3 fail.
 * The three are the rotation test and the two below. With the trim back: 23 pass, 0 fail.
 */
test('and a token file ending in the newline an editor leaves still opens the door', async () => {
  /* THE SHAPE A ROTATION DONE BY HAND LEAVES. `nano`, `vi` and `echo >` all end the line, so this is
     the common case and not an edge one. Without the trim this answers 404 rather than 202, which is
     an operator who rotated correctly and is left with a door that opens for nobody. */
  let at = Date.now();
  const made = await host(() => at);
  const rotated = token();
  try {
    writeFileSync(join(made.dir, 'inbound.token'), `${rotated}\n`);
    at += IN_TOKEN_MS;

    const out = await send(made.port, `/in/email/${rotated}`, message({ dkim: 'pass', signer: 'hsbc.example', amount: '5.00', merchant: 'Nano' }));
    assert.equal(out.status, 202, 'a trailing newline closed the door');
    assert.equal(raws(made.running).length, 1, 'the message the newline-terminated token carried was not stored');
  } finally {
    await stop(made);
  }
});

test('and a file holding nothing but whitespace is no token, rather than a token a stranger can type', async () => {
  /**
   * THIS IS THE HALF THE HALF-WRITTEN TEST ABOVE CANNOT SEE. That one writes `'   \n'` and then sends
   * the OLD token, which is 404 with the trim and 404 without it, because whitespace digests to
   * neither token either way. What actually changes is what the whitespace itself becomes: with no
   * trim, `load()` returns the digest of `'   \n'`, so the file's own contents are a live credential
   * and `/in/email/%20%20%20%0A` opens the record to anybody who thinks of it. Measured
   * with the `.trim()` deleted: 202 and one row in `inbox_raw`. With it: 404 and none.
   */
  let at = Date.now();
  const made = await host(() => at);
  try {
    writeFileSync(join(made.dir, 'inbound.token'), '   \n');
    at += IN_TOKEN_MS;

    const guessed = await send(
      made.port,
      `/in/email/${encodeURIComponent('   \n')}`,
      message({ dkim: 'pass', signer: 'hsbc.example', amount: '6.00', merchant: 'Guessed' }),
    );
    assert.equal(guessed.status, 404, 'a file holding only whitespace was itself a token a stranger could send');
    assert.equal(await guessed.text(), '', 'the `/api` fallback answered, not the arrival door');
    assert.equal(raws(made.running).length, 0, 'the guessed whitespace token reached the record');
  } finally {
    await stop(made);
  }
});

/* ── what the door refuses, and what it keeps ────────────────────────────── */

test('and a forwarded message past the five mebibytes this channel takes is refused with the number', async () => {
  /* `serveIngest`'s email ceiling is five mebibytes against a webhook's one, because an RFC 5322
     message carries its attachments inline. Nothing exercised the larger of the two, so nothing
     would have noticed the day a message was measured against the webhook's. */
  const made = await host();
  try {
    const out = await send(made.port, `/in/email/${INBOUND}`, 'x'.repeat(5 * 1024 * 1024 + 1));
    assert.equal(out.status, 413);
    const said = (await out.json()) as { refusal?: { code?: string } };
    assert.equal(said.refusal?.code, 'BODY_MALFORMED', 'a sender just over the channel ceiling was told nothing it could use');
    assert.equal(raws(made.running).length, 0);

    /* AND THE SAME BODY AT A TOKEN NOBODY MINTED IS 404 AND NOT 413, which is the order the door
       asks its questions in and the reason it cannot be used to sort real addresses from guesses:
       a 413 here would tell a stranger that the token they tried is live. */
    const guessed = await send(made.port, '/in/email/not-the-token', 'x'.repeat(5 * 1024 * 1024 + 1));
    assert.equal(guessed.status, 404, 'the size refusal told a stranger their guessed token exists');
    assert.equal(await guessed.text(), '');
  } finally {
    await stop(made);
  }
});

test('and a two-mebibyte message, over a webhook ceiling and under this one, is taken', async () => {
  /**
   * THE REFUSAL ABOVE CANNOT SAY WHICH CEILING REFUSED IT, which is what this one is for. A body of
   * `5 MiB + 1` is over the webhook's one mebibyte as well, so `mail` measured against
   * `WEBHOOK_LIMIT` answers it 413 too and every assertion up there still holds: swapped on
   * 2026-09-20 in `packages/host/src/ingest.ts` and the whole file stayed green. Two mebibytes is
   * over one and under five, so it separates them, and it is an ordinary size for a forwarded
   * statement with a PDF inline.
   */
  const made = await host();
  try {
    const out = await send(made.port, `/in/email/${INBOUND}`, `${forwarded('pass')}\r\n${'x'.repeat(2 * 1024 * 1024)}`);
    assert.equal(out.status, 202, 'a message inside this channel ceiling was measured against the webhook one');
    const seen = raws(made.running);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.body?.length, forwarded('pass').length + 2 + 2 * 1024 * 1024, 'the bytes stored are not the bytes sent');
  } finally {
    await stop(made);
  }
});

test('and the raw token is in nothing this process writes down', async () => {
  /**
   * THE TOKEN IS THE URL, AND A URL IS THE MOST COPIED THING THERE IS. It reaches this process in
   * the path of a request a stranger made, and everything on this side of `serveIngest` sees only
   * its SHA-256: the budget is keyed on the digest, the door compares digests, and the row the
   * record keeps holds the message and not the address it came to. What this pins is the absence,
   * because an absence is what a later "just log the path while we debug this" would end.
   */
  const made = await host();
  const said: string[] = [];
  const wasError = console.error;
  const wasLog = console.log;
  console.error = (...a: unknown[]): void => void said.push(a.map(String).join(' '));
  console.log = (...a: unknown[]): void => void said.push(a.map(String).join(' '));
  try {
    assert.equal((await send(made.port, `/in/email/${INBOUND}`, forwarded('pass'))).status, 202);
    /* AND A TOKEN THAT OPENS NOTHING IS ALSO NOT WRITTEN DOWN, which is the case a log line would
       most plausibly be added for. */
    assert.equal((await send(made.port, '/in/email/not-the-token', forwarded('pass'))).status, 404);
  } finally {
    console.error = wasError;
    console.log = wasLog;
    /* CLOSED BEFORE THE FILES ARE READ, so what is scanned is everything this record left on disk
       and not whatever had happened to be flushed by then. */
    await made.running.close();
  }
  const dir = made.dir;
  try {
    assert.equal(
      said.filter((line) => line.includes(INBOUND)).length,
      0,
      'the raw inbound token was written to the console',
    );
    /* EVERY FILE THIS RECORD LEFT BEHIND EXCEPT THE ONE WHOSE WHOLE JOB IS TO HOLD IT. Read as
       latin1 so a match is a byte match and no decoder can quietly drop the bytes being looked for.
       The WAL counts: a value can sit there unmerged for the life of the process. */
    for (const name of readdirSync(dir)) {
      if (name === 'inbound.token') continue;
      assert.ok(!readFileSync(join(dir, name), 'latin1').includes(INBOUND), `the raw inbound token is in ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
