/**
 * The invite-only page's one call and its words: an application goes to `/auth/apply` as JSON, and each answer the
 * host can give becomes the one thing the page says (`limit`, `check`, `other`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Io } from '../../lib/signup.ts';
import { sendApplication } from './apply.ts';
import { words } from './words.ts';

/** A host that answers one envelope, and remembers what it was sent. */
function host(answer: unknown, status = 200, headers: Record<string, string> = {}) {
  const sent: { url: string; init: RequestInit; body: Record<string, unknown> | null }[] = [];
  const io: Io = {
    fetch: async (url, init) => {
      sent.push({ url, init, body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null });
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json', ...headers } });
    },
  };
  return { io, sent };
}

test('AN APPLICATION IS SENT AS JSON TO /auth/apply, trimmed, with blank optional answers left out', async () => {
  const yes = host({ ok: true, value: {} });
  const out = await sendApplication(yes.io, { name: ' Maya Okafor ', email: ' maya@example.com ', use: 'My two shops', link: '  ', turnstile: 'tok' });
  assert.deepEqual(out, { ok: true });
  assert.equal(yes.sent.length, 1);
  assert.equal(yes.sent[0]?.url, '/auth/apply');
  assert.equal(yes.sent[0]?.init.method, 'POST');
  assert.equal((yes.sent[0]?.init.headers as Record<string, string>)['content-type'], 'application/json');
  assert.deepEqual(yes.sent[0]?.body, { name: 'Maya Okafor', email: 'maya@example.com', use: 'My two shops', turnstile: 'tok' });
  const bare = host({ ok: true, value: {} });
  await sendApplication(bare.io, { name: 'Maya', email: 'maya@example.com' });
  assert.deepEqual(bare.sent[0]?.body, { name: 'Maya', email: 'maya@example.com' }, 'nothing optional is sent when nothing was typed');
});

test('A FAILED CHECK IS check, A LIMIT IS limit WITH ITS WAIT, and anything else is other', async () => {
  const check = host({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'The check did not pass.', at: 'turnstile' } }, 403);
  assert.deepEqual(await sendApplication(check.io, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'check' });
  const limit = host({ ok: false, retryAfter: 300 }, 429);
  assert.deepEqual(await sendApplication(limit.io, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'limit', retryAfter: 300 });
  const header = host({}, 429, { 'retry-after': '61' });
  assert.deepEqual(await sendApplication(header.io, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'limit', retryAfter: 61 });
  const silent = host({}, 429);
  assert.deepEqual(await sendApplication(silent.io, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'limit', retryAfter: 900 });
  const other = host({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Say an email.', at: 'email' } }, 422);
  assert.deepEqual(await sendApplication(other.io, { name: 'Maya', email: 'x' }), { ok: false, why: 'other' });
  const broken = host('not json', 500);
  assert.deepEqual(await sendApplication(broken.io, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'other' });
});

test('A HOST NOBODY REACHED IS other, never a throw', async () => {
  const down: Io = {
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  };
  assert.deepEqual(await sendApplication(down, { name: 'Maya', email: 'maya@example.com' }), { ok: false, why: 'other' });
});

test('THE INVITE-ONLY WORDS: no dash, titles and buttons with no full stop, buttons a verb with its object', () => {
  const lines = [
    words.inviteTitle,
    words.inviteWhy,
    words.applyName,
    words.applyEmail,
    words.applyUse,
    words.applyLink,
    words.applyUseLike,
    words.applyNeedsName,
    words.applyNeedsEmail,
    words.nextTitle,
    ...words.nextLines,
    words.optional,
    words.applySend,
    words.applySending,
    words.applied,
    words.applyLimit(30),
    words.applyLimit(300),
    words.applyLimit(7200),
    words.applyCheck,
    words.applyFailed,
    words.haveOne,
  ];
  for (const line of lines) {
    assert.doesNotMatch(line, /[–—]/, `${line} carries a dash`);
    assert.doesNotMatch(line, /\b(row|rows|entity|list item|code)\b/i, `${line} names the machinery`);
  }
  /* INVITE ONLY, SAID PLAINLY (first F4): the title says it, and the line under it says what is free and how to get in. */
  assert.equal(words.inviteTitle, 'Early access, invite only');
  assert.equal(words.inviteWhy, "BrainDog is free while in early access. Ask for an invite and we'll email you when there's room. Already invited? Open the link in your email.");
  assert.equal(words.applied, 'Thanks. Your invite will come to this address.');
  for (const title of [words.inviteTitle, words.applySend, words.haveOne]) assert.doesNotMatch(title, /\.$/, `${title} ends with a full stop`);
  /* A VERB, THEN WHAT IT ACTS ON. */
  assert.match(words.applySend, /^Ask for an invite$/);
  /* WHEN TO COME BACK, said as a person says it. */
  assert.equal(words.applyLimit(30), 'Too many tries from here. Try again in a minute.');
  assert.equal(words.applyLimit(300), 'Too many tries from here. Try again in 5 minutes.');
  assert.equal(words.applyLimit(3600), 'Too many tries from here. Try again in an hour.');
  assert.equal(words.applyLimit(7200), 'Too many tries from here. Try again in 2 hours.');
  assert.match(words.applyCheck, /check again/);
  assert.match(words.applyFailed, /Try again in a minute\.$/);
});
