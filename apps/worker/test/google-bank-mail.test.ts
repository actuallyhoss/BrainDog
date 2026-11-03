/**
 * A bank's alert read by Connect Google is filed in Money as a forwarded one is.
 *
 * Connect Google handed each mail to the Gmail add-on's door as a summary with a snippet, so a bank pattern that reads
 * an alert's whole text on the mail channel never saw one, and an alert in Gmail landed in Mail and nowhere else. Now a
 * mail one of the record's mail patterns may read (by its sender, subject or first lines) is read whole and handed to
 * the mail door under that pattern's name, where the pattern files it on the account whose digits it prints.
 *
 * Run against a record with the first-party packs and the HSBC Egypt file installed through the planner, through the
 * writer the alarm uses (`googleWriter`), with Gmail answered by a fake. Every digit, amount and reference is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext } from '@braindog/record';
import { FIRST_PARTY, firstPartyDocument } from '@braindog/seed';

import { googleWriter, syncOnce, type Connection, type Send } from '../src/google-connect.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 10, 3, 12);
const TODAY = '2026-11-03';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const ME = 'owner@gmail.com';

type Api = Awaited<ReturnType<typeof createRecordApi>>;
const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/* ── the bank's own wording, every value invented ────────────────────────── */

const ALERT =
  'Your HSBC Account ********0918 was debited with IPN outward transfer for EGP 3,250.00 on 02-11-2026 16:42 to MARLOW JOINERY with reference 9c4e1f7a. For further details, please contact HSBC';
/* GMAIL'S OWN VERDICT ON TOP, as its servers write it. */
const PASSED = 'mx.google.com; dkim=pass header.i=@hsbc.example header.s=s1 header.b=AbCd; spf=pass smtp.mailfrom=alerts@hsbc.example; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=hsbc.example';
/* A SPOOF: Gmail found nothing, and the sender wrote its own pass further down. */
const FAILED = 'mx.google.com; dkim=none; spf=softfail smtp.mailfrom=bank@spoof.example; dmarc=fail (p=NONE) header.from=hsbc.example';
const FORGED_BELOW = 'mx.google.com; dkim=pass header.i=@hsbc.example; dmarc=pass header.from=hsbc.example';

type FakeMail = { id: string; from: string; subject: string; text: string; results?: string[]; html?: boolean };

const MAILS: FakeMail[] = [
  { id: 'alert', from: 'HSBC <alerts@hsbc.example>', subject: 'HSBC InstaPay', text: ALERT, results: [PASSED] },
  { id: 'offer', from: 'HSBC Premier <offers@hsbc.example>', subject: 'Your Premier benefits this month', text: 'Discover dining offers with your Premier card.', results: [PASSED], html: true },
  { id: 'friend', from: 'Nadia Farid <nadia@studio.example>', subject: 'Lunch on Thursday?', text: 'Are you free?' },
];

const b64url = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

function gmail(mails: readonly FakeMail[]): { send: Send; whole: string[] } {
  const whole: string[] = [];
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const send: Send = (input) => {
    const url = new URL(input);
    const path = url.pathname;
    if (path.endsWith('/users/me/profile')) return Promise.resolve(json({ historyId: '100' }));
    if (path.endsWith('/users/me/messages')) return Promise.resolve(json({ messages: mails.map((m) => ({ id: m.id, threadId: `t-${m.id}` })) }));
    const one = /\/users\/me\/messages\/([^/]+)$/.exec(path);
    if (one) {
      const m = mails.find((x) => x.id === one[1])!;
      const heads = [
        ...(m.results ?? []).map((value) => ({ name: 'Authentication-Results', value })),
        { name: 'From', value: m.from },
        { name: 'To', value: ME },
        { name: 'Subject', value: m.subject },
        { name: 'Date', value: 'Mon, 2 Nov 2026 16:43:10 +0200' },
        { name: 'Message-ID', value: `<${m.id}@mail.example>` },
      ];
      const base = { id: m.id, threadId: `t-${m.id}`, labelIds: ['INBOX'], internalDate: String(NOW - 86_400_000), snippet: m.text.slice(0, 150) };
      if (url.searchParams.get('format') !== 'full') return Promise.resolve(json({ ...base, payload: { headers: heads } }));
      whole.push(m.id);
      const parts = m.html
        ? [{ mimeType: 'text/html', filename: '', body: { data: b64url(`<div><p>${m.text}</p></div>`) } }]
        : [
            { mimeType: 'text/plain', filename: '', body: { data: b64url(m.text) } },
            { mimeType: 'text/html', filename: '', body: { data: b64url(`<p>${m.text}</p>`) } },
          ];
      return Promise.resolve(json({ ...base, payload: { mimeType: 'multipart/alternative', headers: heads, parts } }));
    }
    const thread = /\/users\/me\/threads\/t-([^/]+)$/.exec(path);
    if (thread) return Promise.resolve(json({ messages: [{ id: thread[1], payload: { headers: [{ name: 'From', value: mails.find((x) => x.id === thread[1])!.from }] } }] }));
    if (path.endsWith('/settings/sendAs')) return Promise.resolve(json({ sendAs: [{ sendAsEmail: ME }] }));
    if (path.endsWith('/people/me/connections')) return Promise.resolve(json({ connections: [], nextSyncToken: 'c1' }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  return { send, whole };
}

/* ── the record ──────────────────────────────────────────────────────────── */

async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id));
  await put(api, JSON.parse(readFileSync(new URL('../../../packs/bank-hsbc-eg/bank-hsbc-eg.pack.json', import.meta.url), 'utf8')));
  const made = (fields: Record<string, unknown>): string => said<{ id: string }>(api.kernel.create('accounts', fields as never, { actor: 'p_1' })).id;
  const accounts = {
    current: made({ name: 'Current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: true, last4: '0918,918' }),
    dollars: made({ name: 'Dollar account', kind: 'bank', balance: { amount: 0, currency: 'USD' }, as_of: TODAY, liquid: true, last4: '4407' }),
    card: made({ name: 'Credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: TODAY, liquid: false, last4: '2291' }),
  };
  /* THE MAIL'S SUMMARY GOES TO THE GMAIL ADD-ON'S DOOR, which is not what is measured here. */
  const w = { ...googleWriter(api), mail: true, arrive: () => Promise.resolve(true) };
  const conn: Connection = { v: 1, email: ME, scopes: [], token: { nonce: '', box: '' }, since: NOW, due: NOW };
  return { api, sql, w, conn, accounts };
}

type Txn = { account?: string; amount?: { amount: number; currency: string }; hsbc_reference?: string };
const transactions = (sql: NodeSql): Txn[] =>
  sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY seq").map((r) => JSON.parse(r.fields) as Txn);
/** Who People holds: the record's own sample person is there from the first-party packs. */
const people = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people' AND deleted_at IS NULL")?.n);
const mailArrivals = (sql: NodeSql) => sql.all<{ state: string; reason: string | null; body: string }>("SELECT state, reason, body FROM inbox_raw WHERE channel = 'email' ORDER BY ts, rowid");

/* ── what happens ────────────────────────────────────────────────────────── */

test("A BANK'S ALERT IN GMAIL LANDS IN MONEY, on the account whose digits it prints, and only a mail a pattern may read is fetched whole", async () => {
  const { sql, w, conn, accounts } = await record();
  const before = people(sql);
  assert.ok(w.hints.includes('hsbc'), `the pack's name is not among what its patterns look for: ${w.hints.join(', ')}`);
  const { send, whole } = gmail(MAILS);
  await syncOnce(conn, 'access', w, send, NOW);

  const filed = transactions(sql);
  assert.equal(filed.length, 1, 'the alert was not filed, or was filed twice');
  assert.equal(filed[0]?.account, accounts.current, 'the alert was filed on an account whose digits it does not print');
  assert.deepEqual([filed[0]?.amount?.amount, filed[0]?.amount?.currency], [325000, 'EGP'], 'EGP 3,250.00, in piastres');
  assert.equal(filed[0]?.hsbc_reference, '9c4e1f7a');

  assert.deepEqual(whole.sort(), ['alert', 'offer'], 'a mail no pattern could read was fetched whole, or one it could was not');
  const arrived = mailArrivals(sql);
  assert.equal(arrived.length, 1, 'the bank offer no pattern reads reached the mail door');
  assert.equal(arrived[0]?.state, 'matched');
  assert.match(arrived[0]?.body ?? '', /^From: HSBC <alerts@hsbc\.example>\r\n/u);
  assert.match(conn.last?.said ?? '', /3 mails, 1 also read by a pattern/u);
  /* AND THE BANK'S SENDER IS NOBODY IN PEOPLE: a machine's address is an organisation speaking. */
  assert.equal(people(sql), before, 'the bank alert added a person');
  sql.close();
});

test('READ AGAIN, OR FORWARDED BY HAND AS WELL, THE ALERT IS FILED ONCE', async () => {
  const { api, sql, w, conn } = await record();
  const first = gmail(MAILS);
  await syncOnce(conn, 'access', w, first.send, NOW);

  /* GMAIL'S HISTORY IS GONE (404), so the window is read again from the start: the alert is not fetched whole again. */
  const again = gmail(MAILS);
  await syncOnce(conn, 'access', w, again.send, NOW + 15 * 60_000);
  assert.deepEqual(again.whole, [], 'a mail already handed whole was fetched again');
  /* AND HANDED AGAIN ALL THE SAME, it is the same arrival: its hash is its Gmail id's. */
  conn.gmail = { ...conn.gmail, whole: [] };
  await syncOnce(conn, 'access', w, gmail(MAILS).send, NOW + 30 * 60_000);
  assert.equal(transactions(sql).length, 1, 'the alert read again was filed again');
  assert.equal(mailArrivals(sql).length, 1);

  /* THE SAME ALERT FORWARDED BY HAND is other bytes, and the pattern's own repeat rule sets it aside. */
  const forwarded = said<{ state: string }>(
    await api.arrive({
      channel: 'email',
      headers: { from: `Owner <${ME}>`, subject: 'Fwd: HSBC InstaPay' },
      body: `From: Owner <${ME}>\r\nSubject: Fwd: HSBC InstaPay\r\n\r\n---------- Forwarded message ---------\nFrom: HSBC <alerts@hsbc.example>\n\n${ALERT}`,
      sha256: 'forwarded-by-hand',
      verified: true,
    }),
  );
  assert.equal(forwarded.state, 'skipped');
  assert.equal(transactions(sql).length, 1, 'the copy forwarded by hand was filed a second time');
  sql.close();
});

test('AN ALERT GMAIL DID NOT FIND FROM THE BANK IS KEPT AND NEVER FILED, whatever a line further down says', async () => {
  const { sql, w, conn } = await record();
  const spoof: FakeMail = { id: 'spoof', from: 'HSBC <alerts@hsbc.example>', subject: 'HSBC InstaPay', text: ALERT, results: [FAILED, FORGED_BELOW] };
  await syncOnce(conn, 'access', w, gmail([spoof]).send, NOW);

  assert.equal(transactions(sql).length, 0, 'a mail Gmail did not find from the bank moved money');
  const arrived = mailArrivals(sql);
  assert.equal(arrived.length, 1);
  assert.deepEqual([arrived[0]?.state, arrived[0]?.reason !== null], ['untriaged', true], 'it is not kept as unverified');
  sql.close();
});
