/**
 * Applications: asked for while sign-up is by invitation, invited or declined by the operator, against a real
 * Directory and a fixed clock.
 *
 * WHAT MUST HOLD. One application per address; a second updates a waiting one and changes nothing of a decided one;
 * every submit is answered the same, so the door says nothing about who has asked; the limits strike in `dir_fail`;
 * an invitation mints one code a sign-up by invitation accepts; and every copy of the Directory carries the table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { CARRIED, createDirectory, type ApplyAnswers, type ApplyCall, type ApplyRow } from '../src/directory.ts';
import { codeHash } from '../src/identity.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 17, 9);
const DAY = 86_400_000;

let seq = 0;
const nextIp = () => `198.51.100.${(++seq % 250) + 1}`;

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  return { sql, clock, d };
}

type D = ReturnType<typeof setup>['d'];

/** A submit as the public door sends it, with fields of any type, since the door hands them on as they came. */
const submit = (d: D, ask: { name?: unknown; email?: unknown; use?: unknown; link?: unknown }, ip = nextIp(), checked = true): Promise<ApplyAnswers['apply.submit']> =>
  d.applications({ flow: 'apply.submit', ip, checked, ...ask } as Extract<ApplyCall, { flow: 'apply.submit' }>);

const atOf = (r: { ok: boolean }): string | null => (!r.ok && 'refusal' in r ? ((r as { refusal: { at?: string } }).refusal.at ?? null) : null);
const codeOf = (r: { ok: boolean }): string | null => (!r.ok && 'refusal' in r ? (r as { refusal: { code: string } }).refusal.code : null);

const list = (d: D): Promise<ApplyRow[]> => d.applications({ flow: 'apply.list' });

test('AN APPLICATION IS KEPT ONCE PER ADDRESS, LOWER-CASED, AND A SECOND ONE WHILE WAITING UPDATES IT', async () => {
  const { sql, clock, d } = setup();
  const first = await submit(d, { name: ' Maya Okafor ', email: ' Maya@Example.com ', use: 'Running Tidepool', link: 'https://example.com/maya' });
  assert.deepEqual(first, { ok: true, value: {} });
  const [row] = await list(d);
  assert.equal(row?.email, 'maya@example.com');
  assert.equal(row?.name, 'Maya Okafor');
  assert.equal(row?.state, 'waiting');
  assert.equal(row?.made_at, NOW);

  clock.advance(60_000);
  const second = await submit(d, { name: 'Maya O.', email: 'maya@example.com', use: 'Tidepool and Northbound' });
  assert.deepEqual(second, first, 'an update is answered as a new one');
  const rows = await list(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, 'Maya O.');
  assert.equal(rows[0]?.use, 'Tidepool and Northbound');
  assert.equal(rows[0]?.link, '');
  assert.equal(rows[0]?.made_at, NOW);
  assert.equal(rows[0]?.updated_at, NOW + 60_000);
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_apply')?.n, 1);
});

test('A DECIDED APPLICATION IS UNCHANGED BY ANOTHER, AND THE ANSWER IS THE SAME', async () => {
  const { d } = setup();
  await submit(d, { name: 'Dana Reyes', email: 'dana@example.com' });
  await submit(d, { name: 'Sam Patel', email: 'sam@example.com' });
  const [sam, dana] = await list(d);
  assert.ok(sam && dana);
  assert.ok((await d.applications({ flow: 'apply.decide', id: dana.id, decision: 'decline' })).ok);
  assert.ok((await d.applications({ flow: 'apply.decide', id: sam.id, decision: 'invite' })).ok);
  const before = await list(d);
  for (const email of ['dana@example.com', 'sam@example.com']) {
    const again = await submit(d, { name: 'Somebody Else', email, use: 'changed' });
    assert.deepEqual(again, { ok: true, value: {} });
  }
  assert.deepEqual(await list(d), before);
});

test('THE FIELDS ARE BOUNDED, AND A REFUSAL NAMES ITS FIELD', async () => {
  const { sql, d } = setup();
  for (const [ask, at] of [
    [{ name: '', email: 'a@example.com' }, 'name'],
    [{ name: '   ', email: 'a@example.com' }, 'name'],
    [{ name: 'x'.repeat(121), email: 'a@example.com' }, 'name'],
    [{ name: 'Leo', email: 'not an address' }, 'email'],
    [{ name: 'Leo', email: 'a@example.com', use: 'x'.repeat(301) }, 'use'],
    [{ name: 'Leo', email: 'a@example.com', link: 'x'.repeat(201) }, 'link'],
    [{ name: 7, email: 'a@example.com' }, 'name'],
  ] as const) {
    const out = await submit(d, ask);
    assert.equal(codeOf(out), 'VALUE_MALFORMED', JSON.stringify(ask));
    assert.equal(atOf(out), at);
  }
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_apply')?.n, 0);
  assert.ok((await submit(d, { name: 'x'.repeat(120), email: 'a@example.com', use: 'x'.repeat(300), link: 'x'.repeat(200) })).ok);
});

test('THE LIMITS STRIKE BY ADDRESS AND BY MAILBOX, TIGHTER WITH NO BOT CHECK', async () => {
  const { sql, clock, d } = setup();
  /* UNCHECKED: three an hour from one place, and the fourth is refused with a wait. */
  for (let i = 0; i < 3; i++) assert.ok((await submit(d, { name: 'Leo', email: `leo${String(i)}@example.com` }, '203.0.113.9', false)).ok);
  const held = await submit(d, { name: 'Leo', email: 'leo9@example.com' }, '203.0.113.9', false);
  assert.equal(codeOf(held), 'RATE_LIMITED');
  assert.ok(!held.ok && 'refusal' in held && (held.refusal.retry_after ?? 0) > 0);
  assert.ok(sql.one("SELECT 1 AS n FROM dir_fail WHERE key = 'apply:203.0.113.9'"));
  assert.ok(sql.one("SELECT 1 AS n FROM dir_fail WHERE key = 'apply-email:leo0@example.com'"));

  /* CHECKED: ten from one place before the brake. */
  for (let i = 0; i < 10; i++) assert.ok((await submit(d, { name: 'Leo', email: `ok${String(i)}@example.com` }, '203.0.113.20', true)).ok);
  assert.equal(codeOf(await submit(d, { name: 'Leo', email: 'ok10@example.com' }, '203.0.113.20', true)), 'RATE_LIMITED');

  /* ONE MAILBOX FROM MANY PLACES, however it is spelled. */
  for (let i = 0; i < 3; i++) assert.ok((await submit(d, { name: 'Pat', email: 'pat@example.com' }, nextIp(), false)).ok);
  assert.equal(codeOf(await submit(d, { name: 'Pat', email: 'PAT@example.com' }, nextIp(), false)), 'RATE_LIMITED');

  clock.advance(2 * 60 * 60_000);
  assert.ok((await submit(d, { name: 'Leo', email: 'leo9@example.com' }, '203.0.113.9', false)).ok, 'the brake lifts');
});

test('THE LIST IS NEWEST FIRST', async () => {
  const { clock, d } = setup();
  for (const n of ['Dana Reyes', 'Sam Patel', 'Leo Brandt']) {
    await submit(d, { name: n, email: `${n.split(' ')[0]?.toLowerCase() ?? ''}@example.com` });
    clock.advance(1000);
  }
  assert.deepEqual((await list(d)).map((r) => r.name), ['Leo Brandt', 'Sam Patel', 'Dana Reyes']);
});

test('AN INVITATION MINTS ONE CODE THAT SIGNS THEM UP, AND ONLY ITS HASH IS KEPT', async () => {
  const { sql, d } = setup();
  await submit(d, { name: 'Dana Reyes', email: 'dana@example.com' });
  const [row] = await list(d);
  assert.ok(row);
  const out = await d.applications({ flow: 'apply.decide', id: row.id, decision: 'invite' });
  assert.ok(out.ok && 'code' in out.value, JSON.stringify(out));
  const { code, email, name, ends_at } = out.value as { code: string; email: string; name: string; ends_at: number };
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([email, name, ends_at], ['dana@example.com', 'Dana Reyes', NOW + 30 * DAY]);

  const hash = await codeHash(code);
  const [after] = await list(d);
  assert.equal(after?.state, 'invited');
  assert.equal(after?.decided_at, NOW);
  assert.equal(after?.invite_ref, hash.slice(0, 12));
  const invites = await d.invites({ flow: 'invite.list' });
  assert.equal(invites.length, 1, 'one code, not more');
  assert.equal(invites[0]?.note, 'application: dana@example.com');
  assert.ok(!JSON.stringify(sql.all('SELECT * FROM dir_invite')).includes(code));
  assert.ok(!JSON.stringify(sql.all('SELECT * FROM dir_apply')).includes(code));

  /* DECIDED ONCE: a second decision on it is out of bounds. */
  assert.equal(codeOf(await d.applications({ flow: 'apply.decide', id: row.id, decision: 'invite' })), 'OUT_OF_BOUNDS');
  assert.equal(codeOf(await d.applications({ flow: 'apply.decide', id: 'nothing', decision: 'decline' })), 'OUT_OF_BOUNDS');
  assert.equal((await d.invites({ flow: 'invite.list' })).length, 1);

  /* SPENT THROUGH SIGN-UP BY INVITATION, as directory-invite.test.ts does. */
  const start = (await d.auth({ flow: 'signup.start', email, slug: 'dana-studio', ip: nextIp(), checked: true, invite: true, code } as never)) as AuthResult;
  assert.equal(start.status, 200);
  /* THE CODE WAS MAILED TO THIS ADDRESS, SO IT PROVES IT: no second mail, the proof comes back to spend. */
  assert.equal(start.status === 200 ? start.mail : 'none', undefined);
  const link = start.status === 200 ? (start.body as { proof?: string }).proof : undefined;
  assert.ok(link);
  assert.equal((await d.auth({ flow: 'signup.verify', token: link, ip: nextIp() })).status, 200);
  assert.equal((await d.invites({ flow: 'invite.list' }))[0]?.state, 'spent');
});

test('AN INVITATION TAKES DAYS, AND REFUSES DAYS IT CANNOT KEEP', async () => {
  const { d } = setup();
  await submit(d, { name: 'Sam Patel', email: 'sam@example.com' });
  const [row] = await list(d);
  assert.ok(row);
  assert.equal(atOf(await d.applications({ flow: 'apply.decide', id: row.id, decision: 'invite', days: 0 })), 'days');
  assert.equal((await list(d))[0]?.state, 'waiting');
  const out = await d.applications({ flow: 'apply.decide', id: row.id, decision: 'invite', days: 7 });
  assert.ok(out.ok && 'ends_at' in out.value && out.value.ends_at === NOW + 7 * DAY);
});

test('A DECLINE MARKS IT AND MINTS NOTHING', async () => {
  const { d } = setup();
  await submit(d, { name: 'Leo Brandt', email: 'leo@example.com' });
  const [row] = await list(d);
  assert.ok(row);
  assert.deepEqual(await d.applications({ flow: 'apply.decide', id: row.id, decision: 'decline' }), { ok: true, value: { declined: true } });
  const [after] = await list(d);
  assert.equal(after?.state, 'declined');
  assert.equal(after?.decided_at, NOW);
  assert.equal(after?.invite_ref, null);
  assert.equal((await d.invites({ flow: 'invite.list' })).length, 0);
});

test('A DIRECT INVITATION MARKS A WAITING APPLICATION OF THAT ADDRESS, AND NO OTHER', async () => {
  const { d } = setup();
  await submit(d, { name: 'Dana Reyes', email: 'dana@example.com' });
  assert.deepEqual(await d.applications({ flow: 'apply.invited', email: ' Dana@Example.com ', ref: 'abcdef012345' }), { ok: true, value: { marked: true } });
  const [row] = await list(d);
  assert.equal(row?.state, 'invited');
  assert.equal(row?.invite_ref, 'abcdef012345');
  assert.deepEqual(await d.applications({ flow: 'apply.invited', email: 'dana@example.com', ref: '999999999999' }), { ok: true, value: { marked: false } });
  assert.equal((await list(d))[0]?.invite_ref, 'abcdef012345');
  assert.deepEqual(await d.applications({ flow: 'apply.invited', email: 'nobody@example.com', ref: 'abcdef012345' }), { ok: true, value: { marked: false } });
  assert.equal(atOf(await d.applications({ flow: 'apply.invited', email: 'dana@example.com', ref: 'not-a-ref' })), 'ref');
});

test('EVERY COPY OF THE DIRECTORY CARRIES THE APPLICATIONS', async () => {
  const from = setup();
  await submit(from.d, { name: 'Maya Okafor', email: 'maya@example.com', use: 'Tidepool' });
  assert.ok((CARRIED as readonly string[]).includes('dir_apply'));
  const lines = from.d.dump();
  assert.ok(lines.includes('#table dir_apply'));
  const to = setup();
  assert.ok(to.d.load(lines).ok);
  assert.deepEqual(await list(to.d), await list(from.d));
});

test('A COPY MADE BEFORE APPLICATIONS EXISTED STILL LOADS, and is not taken for one cut short', async () => {
  const from = setup();
  const lines = from.d.dump();
  const at = lines.indexOf('#table dir_apply');
  assert.ok(at > 0);
  let end = lines.findIndex((l, i) => i > at && l.startsWith('#table '));
  if (end < 0) end = lines.length;
  const older = [...lines.slice(0, at), ...lines.slice(end)];
  assert.ok(setup().d.load(older).ok);
  const cut = lines.filter((l, i) => !(i >= lines.indexOf('#table dir_credit') && l.startsWith('#table dir_credit')));
  assert.equal(setup().d.load(cut).ok, false);
});

test('A CODE USED FROM ANOTHER ADDRESS IS STILL PROVED BY MAIL', async () => {
  const { d } = setup();
  await submit(d, { name: 'Dana Reyes', email: 'dana@example.com' });
  const [row] = await list(d);
  assert.ok(row);
  const decided = await d.applications({ flow: 'apply.decide', id: row.id, decision: 'invite' });
  const code = decided.ok && 'code' in decided.value ? decided.value.code : '';
  assert.ok(code);
  const start = (await d.auth({ flow: 'signup.start', email: 'other@example.com', slug: 'other-studio', ip: nextIp(), checked: true, invite: true, code } as never)) as AuthResult;
  assert.equal(start.status, 200);
  assert.ok(start.status === 200 && (start.mail as { link?: string } | undefined)?.link);
  assert.equal(start.status === 200 ? (start.body as { proof?: string }).proof : 'x', undefined);
});
