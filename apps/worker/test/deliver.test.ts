/**
 * The other end of the outbox.
 *
 * WHAT IS ASSERTED HERE IS THAT A FAILURE IS A FAILURE. The one thing a deliverer must never do is
 * report a job as done that did not happen: the row goes `done` for ever, nothing on the other end
 * received it, and the only symptom is a person who did not get their invoice reminder. Everything
 * below is a way that could happen — a 500 read as success, a payload nobody can parse, a kind
 * nothing handles, a transport this deployment does not have.
 *
 * AND THE URL CHECK, which is not a nicety. A webhook address comes out of a declaration, and a
 * declaration is data: an `http://169.254.169.254/` in one asks this Worker to fetch the platform's
 * own metadata service and post the answer wherever the customer likes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDeliver, postable, DELIVERS, type Transports } from '../src/deliver.ts';

const job = (kind: string, payload: unknown) => ({
  id: '01ABCDEFGHJKMNPQRSTVWXYZ01',
  kind: kind as never,
  payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  attempts: 0,
  leasedUntil: '2026-09-05T12:01:00.000Z',
});

const threw = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  assert.fail('this was supposed to fail');
};

/* ── it delivers ─────────────────────────────────────────────────────────── */

test('AN EMAIL IS SENT WITH WHAT THE ROW SAYS, from the sender this deployment names, and nothing else', async () => {
  const sent: unknown[] = [];
  const deliver = makeDeliver({ email: async (m) => void sent.push(m), from: 'notify@brain.example' });

  await deliver(job('notify.email', { to: 'ada@example.com', subject: 'Monday', text: '2 overdue' }));
  assert.equal(sent.length, 1);
  const mail = sent[0] as Record<string, string>;
  assert.deepEqual(Object.keys(mail).sort(), ['from', 'html', 'subject', 'text', 'to']);
  assert.equal(mail.from, 'notify@brain.example');
  assert.equal(mail.to, 'ada@example.com');
  assert.equal(mail.subject, 'Monday');
  // The record's words first, then the footer that says what the mail is and who sent it.
  assert.ok(mail.text!.startsWith('2 overdue\n\nThis mail is from BrainDog, sent '), mail.text);
  assert.match(mail.text!, /because a BrainDog you own has something that needs you now\.$/u);
  assert.doesNotMatch(`${mail.text!}${mail.html!}`, /Quartz Apps/u, 'no footer names the company any more');
  assert.match(mail.html!, /<h1[^>]*>Monday<\/h1>/u);
  assert.match(mail.html!, />2 overdue<\/p>/u);

  // A row with no recipient is a dead letter, not an email to nobody.
  assert.match(await threw(() => deliver(job('notify.email', { subject: 'Monday' }))), /recipient and a subject/);
  assert.equal(sent.length, 1);
});

test('A RECORD NAMES ITS OWNERS AS A LIST, and the list is who the mail goes to', async () => {
  /* MEASURED AT afb3b1b2: `digest.ts` queues `to: deps.owners()`, which is `string[]`, and so does an urgent notice.
     This file read `payload.to` as a string, got `''` for the array, and threw "a notify.email needs a recipient and a
     subject". So every digest and every urgent email the kernel has ever queued dead-lettered here, from and all. */
  const sent: { to: unknown }[] = [];
  const deliver = makeDeliver({ email: async (m) => void sent.push(m), from: 'notify@brain.example' });
  await deliver(job('notify.email', { to: ['ada@example.com', 'bo@example.com'], subject: 'Monday', text: '2 overdue' }));
  assert.deepEqual(sent.map((m) => m.to), [['ada@example.com', 'bo@example.com']]);

  // An empty list, or one with a blank or a non-string in it, is nobody, and nobody is a dead letter.
  for (const to of [[], [''], ['ada@example.com', 7]])
    assert.match(await threw(() => deliver(job('notify.email', { to, subject: 'Monday' }))), /recipient and a subject/, JSON.stringify(to));
  assert.equal(sent.length, 1);
});

test('WITHOUT A SENDER NO MAIL IS SENT, and the dead letter names the setting', async () => {
  /* MEASURED AT afb3b1b2: `drainOutbox` called `env.EMAIL.send({ to, subject, text })` with no `from`, which Email
     Service refuses as `E_FIELD_MISSING`. A message nobody can deliver is not sent; the ladder walks with a sentence
     that says what to set. A blank sender is the same as none. */
  for (const from of [undefined, '', '   ']) {
    const sent: unknown[] = [];
    const deliver = makeDeliver({ email: async (m) => void sent.push(m), from });
    assert.match(await threw(() => deliver(job('notify.email', { to: 'ada@example.com', subject: 'Monday' }))), /MAIL_FROM/);
    assert.deepEqual(sent, [], `a message with no sender was handed to the transport (from: ${JSON.stringify(from)})`);
  }
});

test('AND A WEBHOOK THAT ANSWERED 500 IS NOT DELIVERED', async () => {
  /* Treating a 5xx as success acks a job that never arrived, and the row is `done` for ever with
     nothing on the other end. This is the failure the whole retry ladder exists for. */
  let status = 202;
  const posted: { url: string; body: string }[] = [];
  const deliver = makeDeliver({
    post: async (url, body) => (posted.push({ url, body }), { ok: status < 400, status }),
  });

  await deliver(job('notify.webhook', { url: 'https://hooks.example.com/x', body: '{"digest":"monday"}' }));
  assert.deepEqual(posted, [{ url: 'https://hooks.example.com/x', body: '{"digest":"monday"}' }]);

  status = 500;
  assert.match(await threw(() => deliver(job('notify.webhook', { url: 'https://hooks.example.com/x' }))), /answered 500/);
});

/* ── and refuses to pretend ──────────────────────────────────────────────── */

test('A KIND NOTHING HERE DELIVERS IS SAID OUT LOUD, and never acked as done', async () => {
  /* Silently acking would make the outbox claim the work happened. The ladder's ceiling raises a
     fault, and the sentence in it names the kind. */
  const deliver = makeDeliver({ email: async () => {}, post: async () => ({ ok: true, status: 200 }) });
  assert.match(await threw(() => deliver(job('infer.prose', {}))), /nothing in this deployment delivers a infer.prose/);
  assert.match(await threw(() => deliver(job('pull.fetch', { ingest: 'x' }))), /delivers a pull.fetch/);

  // And the list this host leases is the list it can actually deliver.
  assert.deepEqual(DELIVERS, ['notify.email', 'notify.webhook', 'erase.r2']);
});

test('AN ERASURE DELETES THE FILE IT NAMES BY ITS HASH, and a key that is not one never reaches the bucket', async () => {
  const deleted: string[] = [];
  const deliver = makeDeliver({ erase: async (sha) => void deleted.push(sha) });
  const sha = 'c'.repeat(64);
  assert.equal(await deliver(job('erase.r2', { erase: 'e1', key: sha })), undefined);
  assert.deepEqual(deleted, [sha]);
  assert.match(await threw(() => deliver(job('erase.r2', { erase: 'e1', key: '../snapshots/latest' }))), /SHA-256/);
  assert.match(await threw(() => makeDeliver({})(job('erase.r2', { erase: 'e1', key: sha }))), /no bucket/);
  assert.deepEqual(deleted, [sha]);
});

test('AN ERASED VISUAL PAGE IS DELETED AS A PAGE, not looked for among the files', async () => {
  const deleted: [string, boolean | undefined][] = [];
  const deliver = makeDeliver({ erase: async (sha, page) => void deleted.push([sha, page]) });
  const sha = 'd'.repeat(64);
  await deliver(job('erase.r2', { erase: 'e1', key: sha, page: true }));
  await deliver(job('erase.r2', { erase: 'e1', key: sha }));
  assert.deepEqual(deleted, [
    [sha, true],
    [sha, false],
  ]);
});

test('and a payload nobody can read, or a transport nobody configured, fails rather than throws past', async () => {
  const none: Transports = {};
  assert.match(await threw(() => makeDeliver(none)(job('notify.email', { to: 'a@b.c', subject: 'x' }))), /no email transport/);
  assert.match(await threw(() => makeDeliver(none)(job('notify.webhook', { url: 'https://x.example' }))), /no outbound http/);

  const deliver = makeDeliver({ email: async () => {}, from: 'notify@brain.example' });
  assert.match(await threw(() => deliver(job('notify.email', 'not json'))), /payload this host cannot read/);
  assert.match(await threw(() => deliver(job('notify.email', '"a string"'))), /payload this host cannot read/);
});

test('A WEBHOOK GOES TO AN HTTPS ADDRESS ON A PUBLIC HOST, and the check is here', async () => {
  /* The URL comes out of a declaration, and a declaration is data. `http://` sends a customer's
     digest in the clear; the link-local address is the platform's own metadata service. */
  assert.equal(postable('https://hooks.example.com/x'), 'https://hooks.example.com/x');
  for (const url of [
    'http://hooks.example.com/x',
    'https://localhost/x',
    'https://api.localhost/x',
    'https://thing.internal/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://172.16.0.1/x',
    'https://172.31.255.255/x',
    'https://[::1]/x',
    // The fully qualified forms of the two names this check exists to block.
    'https://localhost./',
    'https://metadata.google.internal./',
    // And the IPv6 literals that reach loopback without being the string `[::1]`.
    'https://[::ffff:127.0.0.1]/',
    'https://[0:0:0:0:0:ffff:7f00:1]/',
    'https://[::]/',
    'https://[fe80::1]/',
    'https://[febf::1]/',
    'https://[fec0::1]/',
    'file:///etc/passwd',
    'not a url',
  ])
    assert.equal(postable(url), null, `${url} was allowed`);

  // And the ones that look private and are not, because a refusal that is wrong is a feature broken.
  /* EACH OF THESE PASSED THE COPY THIS FILE KEPT OF THE LIST. */
  for (const url of ['https://100.100.100.200/latest', 'https://[64:ff9b::a9fe:a9fe]/', 'https://[2002:a9fe:a9fe::]/', 'https://[::a9fe:a9fe]/', 'https://224.0.0.1/', 'https://198.18.0.1/'])
    assert.equal(postable(url), null, `${url} was allowed`);
  assert.ok(postable('https://172.32.0.1/x'));
  assert.ok(postable('https://11.0.0.1/x'));

  const deliver = makeDeliver({ post: async () => ({ ok: true, status: 200 }) });
  assert.match(
    await threw(() => deliver(job('notify.webhook', { url: 'http://169.254.169.254/' }))),
    /https address on a public host/,
  );
});
