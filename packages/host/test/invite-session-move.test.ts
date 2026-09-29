/**
 * Accepting an invitation while signed in, against a real Directory: which record the colleague's cookie opens after.
 *
 * THE COLLEAGUE OWNS A RECORD OF THEIR OWN. They are signed in on `books-co`, open a link to `the-studio`, and are
 * told "You are on the record." Path 1 of `serveInvite` answered `finish({ ...live, body: who })`, so the session row
 * still named `books-co` and `Open BrainDog` opened the wrong record. A fresh sign-in would not rescue them either:
 * `recordOf` orders an owned record first. The invited record was reachable only by typing its name at
 * `/auth/switch`, which no screen offers.
 *
 * THE WORRY THIS SUITE SETTLES IS THE ROTATION. `serveInvite` asks the `session` flow first, and a day-old cookie is
 * rotated there: the row takes a new id and the old one works for one more minute. The switch answers no cookie of
 * its own, so an answer built from it alone leaves the browser an id that dies a minute later, signed out. Dropping
 * the carried cookie turns the second test red; sending the old id instead does not, because inside its minute of
 * grace the Directory moves the row for either.
 * The second test ages the cookie past a day, accepts, then moves the clock past the minute of grace, and asks the
 * Directory what the cookie the browser was left holding opens.
 *
 * `accept` HERE ANSWERS AS THE WORKER'S DOES: it joins the Directory and answers `{ slug }` of the record joined. The
 * self-host holds one record, answers no slug, and the third test pins that nothing moves there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result, Who } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { createDirectory, type AuthConfig } from '@braindog/record/directory';

import { serveAuth, type AuthDoor } from '../src/auth.ts';
import type { InviteDoor } from '../src/invite.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 24 * 3_600_000;
const ORIGIN = 'https://studio.example';
const CONFIG: AuthConfig = { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: true };
const COLLEAGUE = 'bo@example.com';

function setup(o: { answersSlug: boolean }) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, CONFIG);
  assert.ok(d.person$('ada@example.com').ok && d.person$(COLLEAGUE).ok);
  const studio = d.provision({ slug: 'the-studio', email: 'ada@example.com' });
  const books = d.provision({ slug: 'books-co', email: COLLEAGUE });
  assert.ok(studio.ok && books.ok);
  const token = `${studio.value.record}.invite`;
  const invite: InviteDoor = {
    look: () => Promise.resolve(ok({ email: COLLEAGUE, expires_at: new Date(NOW + 7 * DAY).toISOString() })),
    accept: (_token, person) => {
      const joined = d.join(studio.value.record, person.id);
      if (!joined.ok) return Promise.resolve(joined as Result<unknown>);
      return Promise.resolve(ok(o.answersSlug ? { slug: studio.value.slug } : null) as Result<unknown>);
    },
    known: () => Promise.resolve(true),
    person: () => Promise.reject(new Error('path 1 makes nobody')),
  };
  const door: AuthDoor = { on: 'worker', origin: ORIGIN, auth: d.auth, ip: '203.0.113.9', invite };
  const signIn = async (): Promise<string> => {
    const claim = await d.auth({ flow: 'claim.mint', email: COLLEAGUE });
    assert.ok(claim.status === 200 && claim.mail && 'claimToken' in claim.mail);
    const out = await d.auth({ flow: 'magic.redeem', claimToken: claim.mail.claimToken, ip: '203.0.113.9' });
    assert.ok(out.status === 200 && out.session && out.session !== 'clear');
    return out.session.sid;
  };
  /** Accept with `sid`, and answer the cookie the browser holds afterwards: the one set, or the one it sent. */
  const accept = async (sid: string) => {
    const res = await serveAuth(
      new Request(`${ORIGIN}/auth/invite`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: `__Host-bd_s=${sid}` },
        body: JSON.stringify({ inviteToken: token, accept: true }),
      }),
      door,
    );
    const set = res.headers.getSetCookie()[0];
    const held = set === undefined ? sid : (/^__Host-bd_s=([^;]*)/.exec(set)?.[1] ?? '');
    return { status: res.status, body: (await res.json()) as { ok: boolean; value?: Who }, held };
  };
  const opens = async (sid: string) => {
    const out = await d.auth({ flow: 'session', sid });
    return out.status === 200 ? (out.body as Who).record : `refused ${out.status}`;
  };
  return { clock, accept, signIn, opens, studio: studio.value.record, books: books.value.record, close: () => sql.close() };
}

test('A COLLEAGUE WHO OWNS A RECORD: after accepting, the cookie opens the record they were invited to', async () => {
  const s = setup({ answersSlug: true });
  const sid = await s.signIn();
  assert.equal(await s.opens(sid), s.books, 'they start on their own record');
  const out = await s.accept(sid);
  assert.equal(out.status, 200);
  assert.equal(out.body.value?.record, s.studio, 'the answer names the record the page says they are on');
  assert.equal(await s.opens(out.held), s.studio);
  s.close();
});

test('A DAY-OLD COOKIE, ROTATED BY THE SESSION CHECK: the browser is left with the new id, on the invited record', async () => {
  const s = setup({ answersSlug: true });
  const sid = await s.signIn();
  s.clock.advance(DAY + 1);
  const out = await s.accept(sid);
  assert.equal(out.status, 200);
  assert.notEqual(out.held, sid, 'the rotation reached the cookie');
  /* PAST THE MINUTE OF GRACE, so an id the row no longer carries is refused rather than answered. */
  s.clock.advance(2 * 60_000);
  assert.equal(await s.opens(sid), 'refused 401', 'the old id is dead');
  assert.equal(await s.opens(out.held), s.studio);
  s.close();
});

test('AN ACCEPT THAT ANSWERS NO SLUG, AS THE SELF-HOST DOES: the session stays where it was', async () => {
  const s = setup({ answersSlug: false });
  const sid = await s.signIn();
  const out = await s.accept(sid);
  assert.equal(out.status, 200);
  assert.equal(await s.opens(out.held), s.books);
  s.close();
});
