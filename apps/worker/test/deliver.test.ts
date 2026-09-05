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

test('AN EMAIL IS SENT WITH WHAT THE ROW SAYS, and nothing else', async () => {
  const sent: unknown[] = [];
  const deliver = makeDeliver({ email: async (m) => void sent.push(m) });

  await deliver(job('notify.email', { to: 'ada@example.com', subject: 'Monday', text: '2 overdue' }));
  assert.deepEqual(sent, [{ to: 'ada@example.com', subject: 'Monday', text: '2 overdue' }]);

  // A row with no recipient is a dead letter, not an email to nobody.
  assert.match(await threw(() => deliver(job('notify.email', { subject: 'Monday' }))), /recipient and a subject/);
  assert.equal(sent.length, 1);
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
  /* Silently acking would make the outbox claim the work happened. The ladder's ceiling opens a
     suggestion, and the sentence in it names the kind. */
  const deliver = makeDeliver({ email: async () => {}, post: async () => ({ ok: true, status: 200 }) });
  assert.match(await threw(() => deliver(job('infer.prose', {}))), /nothing in this deployment delivers a infer.prose/);
  assert.match(await threw(() => deliver(job('pull.fetch', { ingest: 'x' }))), /delivers a pull.fetch/);

  // And the list this host leases is the list it can actually deliver.
  assert.deepEqual(DELIVERS, ['notify.email', 'notify.webhook']);
});

test('and a payload nobody can read, or a transport nobody configured, fails rather than throws past', async () => {
  const none: Transports = {};
  assert.match(await threw(() => makeDeliver(none)(job('notify.email', { to: 'a@b.c', subject: 'x' }))), /no email transport/);
  assert.match(await threw(() => makeDeliver(none)(job('notify.webhook', { url: 'https://x.example' }))), /no outbound http/);

  const deliver = makeDeliver({ email: async () => {} });
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
    'file:///etc/passwd',
    'not a url',
  ])
    assert.equal(postable(url), null, `${url} was allowed`);

  // And the ones that look private and are not, because a refusal that is wrong is a feature broken.
  assert.ok(postable('https://172.32.0.1/x'));
  assert.ok(postable('https://11.0.0.1/x'));

  const deliver = makeDeliver({ post: async () => ({ ok: true, status: 200 }) });
  assert.match(
    await threw(() => deliver(job('notify.webhook', { url: 'http://169.254.169.254/' }))),
    /https address on a public host/,
  );
});
