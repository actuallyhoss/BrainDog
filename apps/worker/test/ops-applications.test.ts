/**
 * The operator's half of asking for an invitation, on the Worker as it ships, on the listening Cloud (`cloud-serve.ts`):
 * `/account/ops/applications` lists, invites and declines, and `/account/ops/invite` with an `email` mails one code.
 *
 * WHAT MUST HOLD. Both doors take the provision key: 404 with none set, 401 on a wrong one. An invitation mails one
 * letter (`invite.ready`) whose link signs up through `/auth/signup/start` by invitation, and the link is answered too,
 * with whether the mail went. A decline mails nothing. A direct invitation by address marks a waiting application.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATOR, startCloud } from './cloud-serve.ts';

type Out = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } };
type Row = { id: string; name: string; email: string; state: string; invite_ref: string | null };
type Letter = { to?: unknown; subject?: unknown; text?: unknown; from?: unknown };

let seq = 0;

async function door(env: Record<string, unknown> = {}) {
  const c = await startCloud({ env: { SIGNUP: 'invite', ...env } });
  const call = async (path: string, body?: unknown, bearer: string | undefined = OPERATOR) => {
    const res = await c.ask(path, body === undefined ? { ...(bearer === undefined ? {} : { bearer }) } : { method: 'POST', body: JSON.stringify(body), ...(bearer === undefined ? {} : { bearer }) });
    return { status: res.status, out: (await res.json()) as Out };
  };
  const apply = async (name: string, email: string) => {
    const res = await c.ask('/auth/apply', { method: 'POST', body: JSON.stringify({ name, email }), headers: { 'cf-connecting-ip': `198.51.100.${String((++seq % 250) + 1)}` } });
    assert.equal(res.status, 200);
  };
  const listed = async (): Promise<Row[]> => {
    const { status, out } = await call('/account/ops/applications');
    assert.equal(status, 200, JSON.stringify(out));
    return out.value?.['applications'] as Row[];
  };
  const letters = () => c.letters as Letter[];
  return { ...c, call, apply, listed, letters };
}

const codeIn = (link: string): string => link.slice(link.indexOf('#code=') + '#code='.length);

test('THE OPERATOR DOORS NEED THE KEY: 404 with none set or none sent, 401 on a wrong one', async () => {
  const off = await door({ PROVISION_KEY: '' });
  try {
    assert.equal((await off.call('/account/ops/applications')).status, 404);
    assert.equal((await off.call('/account/ops/applications', { decline: 'x' })).status, 404);
  } finally {
    await off.close();
  }
  const c = await door();
  try {
    assert.equal((await c.call('/account/ops/applications', undefined, 'wrong')).status, 401);
    assert.equal((await c.call('/account/ops/applications', undefined, '')).status, 404);
    assert.equal((await c.call('/account/ops/applications', { decline: 'x' }, 'wrong')).status, 401);
    const said = (await c.call('/account/ops/applications', undefined, 'wrong')).out;
    assert.deepEqual(said, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'unauthorized' } });
  } finally {
    await c.close();
  }
});

test('AN INVITATION MAILS ONE LETTER WHOSE LINK SIGNS UP BY INVITATION', async () => {
  const c = await door();
  try {
    await c.apply('Dana Reyes', 'dana@example.test');
    const [row] = await c.listed();
    assert.equal(row?.state, 'waiting');

    const { status, out } = await c.call('/account/ops/applications', { invite: row?.id });
    assert.equal(status, 200, JSON.stringify(out));
    assert.equal(out.value?.['mailed'], true);
    const link = String(out.value?.['link']);
    assert.match(link, /^https:\/\/[^/]+\/signup#code=[A-Za-z0-9_-]{43}$/);

    assert.equal(c.letters().length, 1);
    const letter = c.letters()[0];
    assert.equal(letter?.to, 'dana@example.test');
    assert.equal(letter?.subject, 'Your BrainDog invite');
    assert.match(String(letter?.text), /^Hi Dana Reyes,/);
    assert.ok(String(letter?.text).includes(link));
    assert.ok(String(letter?.text).includes('It works once, and it ends in 30 days.'));
    assert.equal((await c.listed())[0]?.state, 'invited');

    /* THE LINK'S CODE, SPENT AS THE SIGN-UP PAGE SPENDS IT. */
    const start = await c.ask('/auth/signup/start', {
      method: 'POST',
      body: JSON.stringify({ email: 'dana@example.test', slug: 'dana-books', code: codeIn(link) }),
      headers: { 'cf-connecting-ip': '198.51.100.250' },
    });
    assert.equal(start.status, 200, await start.clone().text());
    /* THE CODE WAS MAILED TO THIS ADDRESS, SO IT PROVES IT: one inbox trip, no second letter, the proof comes back. */
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(c.letters().length, 1);
    assert.match(String((JSON.parse(await start.clone().text()) as { value?: { proof?: string } }).value?.proof), /^[A-Za-z0-9_-]{43}$/);

    /* DECIDED ONCE. */
    assert.equal((await c.call('/account/ops/applications', { invite: row?.id })).status, 422);
  } finally {
    await c.close();
  }
});

test('A DECLINE MARKS IT AND MAILS NOTHING', async () => {
  const c = await door();
  try {
    await c.apply('Sam Patel', 'sam@example.test');
    const [row] = await c.listed();
    const { status, out } = await c.call('/account/ops/applications', { decline: row?.id });
    assert.equal(status, 200, JSON.stringify(out));
    assert.deepEqual(out.value, { declined: true });
    assert.equal((await c.listed())[0]?.state, 'declined');
    assert.equal(c.letters().length, 0);
    assert.equal((await c.call('/account/ops/applications', { invite: 'a', decline: 'b' })).status, 400);
  } finally {
    await c.close();
  }
});

test('A DIRECT INVITATION BY ADDRESS MAILS ONE CODE AND MARKS A WAITING APPLICATION', async () => {
  const c = await door();
  try {
    await c.apply('Leo Brandt', 'leo@example.test');
    const { status, out } = await c.call('/account/ops/invite', { email: 'Leo@Example.test' });
    assert.equal(status, 200, JSON.stringify(out));
    const links = out.value?.['links'] as string[];
    assert.equal(links.length, 1);
    assert.equal(out.value?.['mailed'], true);
    assert.equal(typeof out.value?.['ends_at'], 'number');
    assert.equal(c.letters().length, 1);
    assert.equal(c.letters()[0]?.to, 'leo@example.test');
    assert.ok(String(c.letters()[0]?.text).includes(links[0] ?? '-'));
    /* The letter greets the name the application gave, not "Hi there". */
    assert.ok(String(c.letters()[0]?.text).startsWith('Hi Leo Brandt,'), String(c.letters()[0]?.text));
    const [row] = await c.listed();
    assert.equal(row?.state, 'invited');
    const codes = (await c.call('/account/ops/invite')).out.value?.['codes'] as { ref: string; note: string }[];
    assert.equal(row?.invite_ref, codes[0]?.ref);
    assert.equal(codes[0]?.note, 'invite: leo@example.test');

    /* ONE ADDRESS IS ONE CODE; AND WITHOUT AN ADDRESS THE DOOR MINTS AS IT ALWAYS HAS, MAILING NOBODY. */
    assert.equal((await c.call('/account/ops/invite', { email: 'leo@example.test', count: 2 })).status, 422);
    const plain = await c.call('/account/ops/invite', { note: 'the lane', count: 2 });
    assert.equal((plain.out.value?.['links'] as string[]).length, 2);
    assert.equal(plain.out.value?.['mailed'], undefined);
    assert.equal(c.letters().length, 1);
  } finally {
    await c.close();
  }
});

test('A LETTER THAT COULD NOT GO STILL ANSWERS THE LINK, with mailed false', async () => {
  const c = await door({ EMAIL: { send: async () => { throw new Error('down'); } } });
  try {
    await c.apply('Dana Reyes', 'dana@example.test');
    const [row] = await c.listed();
    const { status, out } = await c.call('/account/ops/applications', { invite: row?.id });
    assert.equal(status, 200, JSON.stringify(out));
    assert.equal(out.value?.['mailed'], false);
    assert.match(String(out.value?.['link']), /#code=/);

    /* THE LINK THE OPERATOR WAS SHOWN PROVES NO MAILBOX: whoever it is handed to gets no proof back to spend. */
    const start = await c.ask('/auth/signup/start', {
      method: 'POST',
      body: JSON.stringify({ email: 'dana@example.test', slug: 'dana-books', code: codeIn(String(out.value?.['link'])) }),
      headers: { 'cf-connecting-ip': '198.51.100.249' },
    });
    assert.equal(start.status, 200, await start.clone().text());
    assert.equal((JSON.parse(await start.clone().text()) as { value?: { proof?: string } }).value?.proof, undefined, 'an unmailed code proved the mailbox');
  } finally {
    await c.close();
  }
});
