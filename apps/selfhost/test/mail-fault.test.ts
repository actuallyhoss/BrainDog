/**
 * RH14 (review of 31 Oct h): THE MAIL FAULT ON HEALTH COVERED ONLY THE SIGN-IN MAILS. A summary (`notify.email`) that
 * failed raised nothing, and one that went out did not clear a standing fault, so Health could say "could not send a
 * mail" for days after the summaries went out fine. And the stored error was the mail server's raw text, which can name
 * the recipient.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OutboxRow } from '@braindog/kernel';

import { addressRefused, authMail, mailedNotices, withoutAddresses, type MailFault } from '../src/smtp.ts';

const job = (payload: unknown): OutboxRow => ({ id: 1, kind: 'notify.email', payload: JSON.stringify(payload) }) as unknown as OutboxRow;

const watched = () => {
  const said: string[] = [];
  const fault: MailFault = { failed: (e) => said.push(`failed: ${e}`), sent: () => said.push('sent') };
  return { said, fault };
};

test('RH14: A SUMMARY THAT FAILS RAISES THE MAIL FAULT, WITHOUT THE ADDRESS, AND ONE THAT GOES OUT CLEARS IT', async () => {
  const { said, fault } = watched();
  let fail = true;
  const notices = mailedNotices(async () => {
    if (fail) throw new Error('421 <someone@example.com> service not available, closing the channel');
  }, fault);
  await assert.rejects(notices(job({ to: 'someone@example.com', subject: 'Your week' })), (e: Error) => !e.message.includes('@'));
  assert.equal(said.length, 1);
  assert.match(said[0]!, /^failed: a summary mail was not sent/u);
  assert.ok(!said[0]!.includes('someone@example.com'), 'the address was kept on Health');
  fail = false;
  await notices(job({ to: 'someone@example.com', subject: 'Your week' }));
  assert.deepEqual(said.slice(1), ['sent'], 'a summary that went out did not clear the fault');
});

test('RJ7: ONE MEMBER WHOSE ADDRESS BOUNCES NEITHER RAISES NOR CLEARS THE MAIL FAULT', async () => {
  const { said, fault } = watched();
  const notices = mailedNotices(async ({ to }) => {
    if (to.includes('gone@example.com')) throw new Error('the mail server answered 550 at RCPT TO, so the mail was not sent');
  }, fault);
  await assert.rejects(notices(job({ to: 'gone@example.com', subject: 'Your week' })));
  assert.deepEqual(said, [], 'a mailbox that bounces was put on Health as the server');
  await notices(job({ to: 'owner@example.com', subject: 'Your week' }));
  assert.deepEqual(said, ['sent']);
  assert.equal(addressRefused('the mail server answered 550 at RCPT TO, so the mail was not sent'), true);
  assert.equal(addressRefused('the mail server answered 451 at RCPT TO, so the mail was not sent'), false, 'a server busy is the server');
  assert.equal(addressRefused('the mail server answered 554 at DATA, so the mail was not sent'), false);
  assert.equal(addressRefused('the mail server stopped answering'), false);
});

test('RH14: A PAYLOAD THIS HOST CANNOT READ IS NOT A MAIL SERVER FAULT', async () => {
  const { said, fault } = watched();
  const notices = mailedNotices(async () => undefined, fault);
  await assert.rejects(notices(job({ subject: 'nobody' })));
  assert.deepEqual(said, []);
});

test('RH14: A SIGN-IN MAIL THAT FAILS KEEPS NO ADDRESS EITHER', async () => {
  const { said, fault } = watched();
  const lines: string[] = [];
  authMail(async () => {
    throw new Error('550 5.1.1 <a.person@example.org>: Recipient address rejected');
  }, (line) => lines.push(line), fault)('a.person@example.org', 'https://x/link');
  await new Promise((done) => setImmediate(done));
  assert.equal(said.length, 1);
  assert.ok(![...said, ...lines].some((s) => s.includes('@')), 'an address was kept');
});

test('RH14: withoutAddresses takes out every address, bracketed or bare', () => {
  assert.equal(withoutAddresses('550 <a@b.co> and c.d@e.org refused'), '550 an address and an address refused');
  assert.equal(withoutAddresses('could not connect'), 'could not connect');
});
