/**
 * The name on an invitation, against a real Directory: where it lands, and the one row it must never touch.
 *
 * SOMEBODY INVITED BY ADDRESS ALONE HAD NO NAME. `dir_person.name` was NULL for exactly these people, because
 * `/auth/invite` called the Directory's `person$` with the address and nothing else, and every screen that
 * wants a name then draws the address instead. The fix is one optional field on the accepting request, so a
 * name typed at the moment the person is made is the name the row is made with.
 *
 * THE DIRECTORY HERE IS THE REAL ONE, and `person` is wired straight to `person$`, so what these tests watch
 * is a row in `dir_person` and not a spy's argument list. THE LIVE HOSTS DO NOT CARRY THE NAME THAT FAR YET:
 * `Directory$.invitee` (`apps/worker/src/index.ts:843`) calls `person$(email)` with one argument and the
 * self-host's adapter (`apps/selfhost/src/server.ts:1189`) does the same, so this suite pins the host's half
 * of the seam and the two adapters are still to be forwarded. `known` runs the Worker's own `KNOWN_ADDRESS`
 * query for the same fidelity: a person who has named themselves but has neither a passkey nor a record is
 * not "known", which is the only way a second invitation for a named person reaches `person$` at all.
 *
 * THE THIRD TEST IS THE ONE THAT MATTERS. `person$` returns the row it finds before it looks at the name it
 * was handed, so a second invitation cannot rename anybody; that is a property of the Directory, and this
 * pins it from the side the host stands on, where breaking it would be a colleague renamed by a stranger's
 * typing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { createDirectory, type AuthConfig } from '@braindog/record/directory';

import { serveInvite, type InviteDoor } from '../src/invite.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const EXPIRES = new Date(NOW + 24 * 3_600_000).toISOString();
const CONFIG: AuthConfig = { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: 'https://studio.example' }, magic: true };

/** The Worker's own rule for an address that can already sign in (`apps/worker/src/index.ts:58`). */
const KNOWN_ADDRESS = `SELECT 1 AS x FROM dir_person p WHERE lower(p.email) = lower(?)
  AND (EXISTS (SELECT 1 FROM dir_passkey k WHERE k.person = p.id) OR EXISTS (SELECT 1 FROM dir_member m WHERE m.person = p.id))`;

function setup() {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW), CONFIG);

  /* ONE TOKEN PER ADDRESS, and the fake holds the pairing the record would hold. Nothing here tests the
     token: `apps/selfhost/test/invite.test.ts` spends real ones over a socket. */
  const links = new Map<string, string>();
  const accepted: { token: string; person: { id: string; email: string } }[] = [];
  const invite: InviteDoor = {
    look: (token) => Promise.resolve(links.has(token) ? ok({ email: links.get(token)!, expires_at: EXPIRES }) : ok({ email: '', expires_at: EXPIRES })),
    accept: (token, person) => {
      accepted.push({ token, person });
      return Promise.resolve(ok(null) as Result<unknown>);
    },
    known: (email) => Promise.resolve(Boolean(sql.one(KNOWN_ADDRESS, email))),
    person: (email, name) => Promise.resolve(d.person$(email, name)),
  };

  /* A WORKER, so the self-host's "the owner needs a passkey first" rule is not what these tests hit. */
  const door = { on: 'worker' as const, ip: '203.0.113.9', auth: d.auth, invite };
  /* `serveAuth`'s own answer, reduced to the two things these tests read: the status, and whatever it carried. */
  const finish = (out: AuthResult) => new Response(JSON.stringify('body' in out ? out.body : null), { status: out.status });

  return {
    accepted,
    /** Open an invitation for `email` and accept it, with whatever name the page sent. */
    accept: async (email: string, body: Record<string, unknown> = {}) => {
      const token = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.${email}`;
      links.set(token, email);
      return serveInvite({ inviteToken: token, accept: true, ...body }, undefined, door, finish);
    },
    /** The name on the Directory's row, which is what a screen draws. */
    nameOf: (email: string) => sql.one<{ name: string | null }>('SELECT name FROM dir_person WHERE lower(email) = lower(?)', email)?.name ?? null,
    /* SET BY HAND, BECAUSE THE DIRECTORY HAS NO VERB FOR IT YET. `person$` is the only writer of
       `dir_person.name` in the tree today, so "they named themselves later" can only be staged as the
       row it leaves behind, and the row is what the test is about. */
    named: (email: string, name: string) => sql.exec('UPDATE dir_person SET name = ? WHERE lower(email) = lower(?)', name, email),
    close: () => sql.close(),
  };
}

test('AN INVITATION THAT CARRIES A NAME makes the person with it', async () => {
  const s = setup();
  try {
    const out = await s.accept('bo@example.com', { name: '  Bo Tanner  ' });
    assert.equal(out.status, 200, await out.text());
    assert.equal(s.nameOf('bo@example.com'), 'Bo Tanner', 'the name the page sent is not on the row');
    assert.equal(s.accepted.length, 1, 'the link was not spent');
  } finally {
    s.close();
  }
});

test('an invitation with no name leaves the column NULL, and never the address', async () => {
  const s = setup();
  try {
    assert.equal((await s.accept('cy@example.com')).status, 200);
    /* NULL AND NOT `''`. A screen asks "is there a name", and an empty string answers yes. */
    assert.equal(s.nameOf('cy@example.com'), null);

    /* A name that is only spaces is no name, for the same reason. */
    assert.equal((await s.accept('di@example.com', { name: '   ' })).status, 200);
    assert.equal(s.nameOf('di@example.com'), null);

    /* And a name that is not a string is a page sending the wrong shape, not a name. */
    assert.equal((await s.accept('ed@example.com', { name: 42 })).status, 200);
    assert.equal(s.nameOf('ed@example.com'), null);
  } finally {
    s.close();
  }
});

test('A SECOND INVITATION DOES NOT RENAME ANYBODY who has since named themselves', async () => {
  const s = setup();
  try {
    assert.equal((await s.accept('fi@example.com')).status, 200);
    assert.equal(s.nameOf('fi@example.com'), null);
    /* They name themselves, the way anybody would once they are on the record. */
    s.named('fi@example.com', 'Fi Okonjo');

    /* A second invitation for the same address, carrying somebody else's idea of their name. */
    assert.equal((await s.accept('fi@example.com', { name: 'fi (contractor)' })).status, 200);
    assert.equal(s.nameOf('fi@example.com'), 'Fi Okonjo', 'a second invitation renamed somebody');

    /* And one carrying no name at all does not blank it. */
    assert.equal((await s.accept('fi@example.com')).status, 200);
    assert.equal(s.nameOf('fi@example.com'), 'Fi Okonjo', 'a second invitation blanked a name');
  } finally {
    s.close();
  }
});
