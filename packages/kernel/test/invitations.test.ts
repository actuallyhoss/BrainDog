/**
 * Invitations: a link that works once, for one address, for 24 hours, and is kept only as its hash.
 *
 * Every test here is about a link doing LESS than somebody holding it would like: a second use, a late use, a
 * withdrawn link, the wrong person, another record's link, and a copy of the database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const made = k.createRecord({
    id: REC,
    slug: 'studio',
    name: 'Studio',
    tz: 'Europe/London',
    locale: 'en-GB',
    owner: { id: 'p_ada', email: 'ada@example.com', name: 'Ada' },
  });
  assert.ok(made.ok, 'the record this invitation belongs to was not created');
  assert.ok((await k.install([NOTES])).ok);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const bea = { person: 'p_bea', email: 'Bea@Example.com', name: 'Bea' };

test('A LINK WORKS ONCE: the person goes on at the level it names, and the second use is refused', async () => {
  const { k } = await record();
  const { invitation, token } = value<{ invitation: { id: string }; token: string }>(
    await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'write' }),
  );
  assert.ok(token.startsWith(`${REC}.`), 'the token names its record');

  assert.equal(value<{ email: string }>(await k.lookInvitation(token)).email, 'bea@example.com');
  value(await k.acceptInvitation(token, bea));
  assert.equal(k.access('p_bea')?.level, 'write');
  assert.equal(k.members().find((m) => m.person_id === 'p_bea')?.level, 'write');

  assert.equal(refusal(await k.acceptInvitation(token, bea)).code, 'UNAUTHORIZED');
  assert.equal(refusal(await k.lookInvitation(token)).code, 'UNAUTHORIZED');
  assert.deepEqual(k.listInvitations(), [], 'a spent invitation is still listed as waiting');
  assert.match(refusal(k.revokeInvitation(invitation.id)).fix, /already accepted/);
});

test('THE GRANT IS WRITTEN BY system, and the ledger names the invitation', async () => {
  const { k, sql } = await record();
  const { invitation, token } = value<{ invitation: { id: string }; token: string }>(
    await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }),
  );
  value(await k.acceptInvitation(token, bea));
  const grants = sql.all<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE kind = 'access.grant' AND target = 'p_bea'");
  assert.ok(grants.length >= 1);
  for (const g of grants) {
    assert.equal(g.actor, 'system');
    assert.ok(g.note?.includes(invitation.id), `note: ${g.note}`);
  }
});

test('IT RUNS OUT after 24 hours', async () => {
  const { k, clock } = await record();
  const { token } = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }));
  clock.advance(24 * 3_600_000 - 1);
  assert.equal(k.listInvitations().length, 1);
  clock.advance(1);
  assert.equal(refusal(await k.lookInvitation(token)).code, 'UNAUTHORIZED');
  assert.equal(refusal(await k.acceptInvitation(token, bea)).code, 'UNAUTHORIZED');
  assert.equal(k.access('p_bea'), null);
  assert.deepEqual(k.listInvitations(), []);
});

test('A WITHDRAWN LINK IS DEAD, and withdrawing twice answers the same', async () => {
  const { k } = await record();
  const { invitation, token } = value<{ invitation: { id: string }; token: string }>(
    await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }),
  );
  const first = value<{ revoked_at: string }>(k.revokeInvitation(invitation.id));
  assert.deepEqual(value(k.revokeInvitation(invitation.id)), { id: invitation.id, revoked_at: first.revoked_at });
  assert.equal(refusal(await k.acceptInvitation(token, bea)).code, 'UNAUTHORIZED');
  assert.equal(k.access('p_bea'), null);
  assert.equal(refusal(k.revokeInvitation('i_nothing')).code, 'OUT_OF_BOUNDS');
});

test('A SECOND LINK FOR ONE ADDRESS withdraws the first', async () => {
  const { k } = await record();
  const one = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }));
  const two = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'BEA@example.com', level: 'write' }));
  assert.equal(k.listInvitations().length, 1);
  assert.equal(refusal(await k.lookInvitation(one.token)).code, 'UNAUTHORIZED');
  value(await k.acceptInvitation(two.token, bea));
  assert.equal(k.access('p_bea')?.level, 'write');
});

test('THE HASH IS KEPT AND THE SECRET IS NOT, in the row or in any event', async () => {
  const { k, sql } = await record();
  const { token } = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }));
  const secret = token.slice(token.indexOf('.') + 1);
  assert.ok(secret.length >= 43, 'thirty-two bytes, in base64url');

  const rows = sql.all<Record<string, unknown>>('SELECT * FROM invitation');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.hash, createHash('sha256').update(secret).digest('hex'));
  const everything = JSON.stringify([rows, sql.all('SELECT * FROM event')]);
  assert.ok(!everything.includes(secret), 'the secret is stored somewhere');
  value(await k.acceptInvitation(token, bea));
  assert.ok(!JSON.stringify([sql.all('SELECT * FROM invitation'), sql.all('SELECT * FROM event')]).includes(secret));
  assert.ok(!('hash' in (k.listInvitations()[0] ?? {})), 'the listing carries the hash');
});

test('THE WRONG ADDRESS SPENDS NOTHING, and a link for another record or of the wrong shape is dead', async () => {
  const { k } = await record();
  const { token } = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'read' }));
  assert.equal(refusal(await k.acceptInvitation(token, { person: 'p_cy', email: 'cy@example.com' })).code, 'FORBIDDEN');
  assert.equal(k.access('p_cy'), null);
  value(await k.lookInvitation(token));

  const secret = token.slice(token.indexOf('.') + 1);
  assert.equal(refusal(await k.lookInvitation(`rec_01JZ8QK3F7R2M9V4XN6TCB5HAE.${secret}`)).code, 'UNAUTHORIZED');
  for (const bad of ['', 'nonsense', `${REC}.`, `${REC}.short`])
    assert.equal(refusal(await k.lookInvitation(bad)).code, 'UNAUTHORIZED', bad);
  value(await k.acceptInvitation(token, bea));
});

test('WHAT AN INVITATION MAY SAY: an address, a level, and nobody already on the record', async () => {
  const { k } = await record();
  assert.equal(refusal(await k.createInvitation('p_ada', { email: '', level: 'read' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await k.createInvitation('p_ada', { email: 'not an address', level: 'read' })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await k.createInvitation('p_ada', { email: 'bea@example.com', level: 'boss' as never })).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(await k.createInvitation('p_ada', { email: 'bea@example.com' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await k.createInvitation('p_ada', { email: 'bea@example.com', registers: { nope: 'read' } })).code, 'REGISTER_UNKNOWN');
  assert.equal(refusal(await k.createInvitation('p_ada', { email: 'ADA@example.com', level: 'read' })).code, 'ALREADY_KNOWN');
  assert.deepEqual(k.listInvitations(), [], 'a refused invitation left a row');

  const scoped = value<{ token: string }>(await k.createInvitation('p_ada', { email: 'bea@example.com', registers: { notes: 'append' } }));
  value(await k.acceptInvitation(scoped.token, bea));
  assert.deepEqual(k.access('p_bea')?.registers, ['notes']);
});
