/**
 * Sign-up codes: minted, held, spent and ended, against a real Directory and a fixed clock.
 *
 * WHAT MUST HOLD (LCH-A01, kept for when sign-up is by invitation again). A new address needs a code; the code is held
 * by the proof its start mailed, so the same code twice is refused the second time; it is spent, naming the person,
 * when the proof makes them; an ended code makes nobody; a known address needs none; only the hash is kept; and no copy
 * of the Directory carries a code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { LEFT_OUT, createDirectory, type InviteRow } from '../src/directory.ts';
import { codeHash } from '../src/identity.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 9);
const DAY = 86_400_000;

let seq = 0;
const nextIp = () => `198.51.100.${(++seq % 250) + 1}`;

function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const d = createDirectory(sql, clock, { mac: new Uint8Array(32).fill(7), magic: true });
  return { sql, clock, d };
}

type Mailed = { kind?: string; link?: string };
const mailOf = (r: AuthResult): Mailed | undefined => (r.status === 200 ? (r.mail as Mailed | undefined) : undefined);
const bodyOf = (r: AuthResult): unknown => (r.status === 200 ? r.body : null);

/** A start by invitation, from a fresh network address, with the bot check said to have run. */
const start = (d: ReturnType<typeof setup>['d'], email: string, slug: string, code?: string) =>
  d.auth({ flow: 'signup.start', email, slug, ip: nextIp(), checked: true, invite: true, ...(code === undefined ? {} : { code }) } as never) as Promise<AuthResult>;

/** Where a refusal points, or `null` for an answer that is not one. */
const atOf = (r: { ok: boolean }): string | null => (!r.ok && 'refusal' in r ? ((r as { refusal: { at?: string } }).refusal.at ?? null) : null);

async function minted(d: ReturnType<typeof setup>['d'], ask: { note?: string; days?: number; count?: number } = {}) {
  const out = await d.invites({ flow: 'invite.mint', ...ask });
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
}

test('A CODE IS 43 CHARACTERS, ANSWERED ONCE, AND ONLY ITS HASH IS KEPT', async () => {
  const { sql, d } = setup();
  const { codes, ends_at } = await minted(d, { note: 'the lane', count: 3 });
  assert.equal(codes.length, 3);
  for (const code of codes) assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new Set(codes).size, 3);
  assert.equal(ends_at, null, 'a code given no days never ends');
  const stored = sql.all<{ code_hash: string }>('SELECT code_hash FROM dir_invite ORDER BY code_hash').map((r) => r.code_hash);
  assert.deepEqual(stored, (await Promise.all(codes.map(codeHash))).sort());
  const dump = JSON.stringify(sql.all('SELECT * FROM dir_invite'));
  for (const code of codes) assert.ok(!dump.includes(code), 'a code was stored as itself');
  const list = await d.invites({ flow: 'invite.list' });
  assert.deepEqual(list.map((r: InviteRow) => [r.note, r.state, r.ref.length]), [['the lane', 'open', 12], ['the lane', 'open', 12], ['the lane', 'open', 12]]);
});

test('MINTING REFUSES WHAT IT CANNOT KEEP: fifty at most, a year at most, a note of 200 characters', async () => {
  const { d } = setup();
  for (const [ask, at] of [
    [{ count: 51 }, 'count'],
    [{ count: 0 }, 'count'],
    [{ days: 0 }, 'days'],
    [{ days: 366 }, 'days'],
    [{ days: 1.5 }, 'days'],
    [{ note: 'x'.repeat(201) }, 'note'],
  ] as const) {
    const out = await d.invites({ flow: 'invite.mint', ...ask });
    assert.equal(out.ok, false, JSON.stringify(ask));
    assert.equal(atOf(out), at);
  }
  assert.equal((await minted(d, { days: 30 })).ends_at, NOW + 30 * DAY);
});

test('A NEW ADDRESS NEEDS A CODE; ONE CODE IS HELD BY ONE PROOF, AND SPENT WHEN THE PROOF MAKES THE PERSON', async () => {
  const { sql, d } = setup();
  const [code] = (await minted(d, { note: 'Sami' })).codes;
  assert.ok(code);

  /* NO CODE, AND A CODE NOBODY MINTED: the same answer, and nothing written or mailed. */
  for (const tried of [undefined, 'Z'.repeat(43), 'short']) {
    const out = await start(d, 'sami@example.com', 'kiln', tried);
    assert.equal(out.status, 200);
    assert.deepEqual(bodyOf(out), { needs: 'code' });
    assert.equal(mailOf(out), undefined);
  }
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM dir_pending')?.n, 0);

  /* THE MINTED CODE: a proof is mailed and the code is held. */
  const first = await start(d, 'sami@example.com', 'kiln', code);
  assert.deepEqual(bodyOf(first), {});
  assert.equal(mailOf(first)?.kind, 'signup.verify');
  assert.equal((await d.invites({ flow: 'invite.list' }))[0]?.state, 'held');

  /* THE SAME CODE AGAIN, for another address: refused, since a proof already holds it. */
  const again = await start(d, 'bo@example.com', 'bo-studio', code);
  assert.deepEqual(bodyOf(again), { needs: 'code' });
  assert.equal(mailOf(again), undefined);

  /* THE PROOF SPENT: the person is made, and the code names them. */
  const made = await d.auth({ flow: 'signup.verify', token: mailOf(first)?.link ?? '', ip: nextIp() });
  assert.equal(made.status, 200);
  assert.deepEqual(Object.keys(bodyOf(made) as object).sort(), ['email', 'name', 'person', 'slug', 'tz'], 'the code never rides in the answer');
  const row = (await d.invites({ flow: 'invite.list' }))[0];
  assert.equal(row?.state, 'spent');
  assert.equal(row?.made, 'sami@example.com');
  assert.deepEqual(bodyOf(await start(d, 'bo@example.com', 'bo-studio', code)), { needs: 'code' }, 'a spent code makes nobody else');
});

test('A HOLD LASTS THE PROOF\'S DAY: after it, the code can be used again', async () => {
  const { clock, d } = setup();
  const [code] = (await minted(d)).codes;
  assert.ok(code);
  assert.deepEqual(bodyOf(await start(d, 'one@example.com', 'one-studio', code)), {});
  clock.advance(DAY - 1);
  assert.deepEqual(bodyOf(await start(d, 'two@example.com', 'two-studio', code)), { needs: 'code' });
  clock.advance(1);
  assert.deepEqual(bodyOf(await start(d, 'two@example.com', 'two-studio', code)), {});
});

test('AN ENDED CODE MAKES NOBODY NEW, but a proof it already sent still makes its person', async () => {
  const { clock, d } = setup();
  const [a, b] = (await minted(d, { count: 2, days: 7 })).codes;
  assert.ok(a && b);
  const sent = await start(d, 'ada@example.com', 'ada-studio', a);
  assert.equal(mailOf(sent)?.kind, 'signup.verify');

  /* ENDED BY THE CODE ITSELF, AND BY THE REF THE LIST SHOWS. */
  const byCode = await d.invites({ flow: 'invite.end', ref: a });
  assert.ok(byCode.ok);
  const ref = (await d.invites({ flow: 'invite.list' })).find((r: InviteRow) => r.state === 'open')?.ref ?? '';
  const byRef = await d.invites({ flow: 'invite.end', ref });
  assert.equal(byRef.ok ? byRef.value.state : null, 'ended');
  assert.deepEqual(bodyOf(await start(d, 'bo@example.com', 'bo-studio', b)), { needs: 'code' });
  const nothing = await d.invites({ flow: 'invite.end', ref: 'nothing-like-it' });
  assert.equal(atOf(nothing), 'ref');

  assert.equal((await d.auth({ flow: 'signup.verify', token: mailOf(sent)?.link ?? '', ip: nextIp() })).status, 200);

  /* AND A CODE PAST ITS DAYS IS ENDED WITHOUT ANYBODY ENDING IT. */
  const [c] = (await minted(d, { days: 1 })).codes;
  assert.ok(c);
  clock.advance(DAY);
  assert.deepEqual(bodyOf(await start(d, 'cy@example.com', 'cy-studio', c)), { needs: 'code' });
});

test('A KNOWN ADDRESS NEEDS NO CODE: it is mailed its sign-in link, and answered as a new one without a code is', async () => {
  const { d } = setup();
  assert.ok(d.person$('ada@example.com', 'Ada').ok);
  const out = await start(d, 'Ada@Example.com', 'whatever-name');
  assert.deepEqual(bodyOf(out), { needs: 'code' }, 'the same answer a new address without a code gets');
  assert.equal(mailOf(out)?.kind, 'signup.known');
  /* WITH A CODE, THE CODE IS NOT HELD: the person already exists, so it makes nobody. */
  const [code] = (await minted(d)).codes;
  assert.ok(code);
  const withCode = await start(d, 'ada@example.com', 'whatever-name', code);
  assert.deepEqual(bodyOf(withCode), {});
  assert.equal(mailOf(withCode)?.kind, 'signup.known');
  assert.equal((await d.invites({ flow: 'invite.list' }))[0]?.state, 'open');
});

test('OPEN SIGN-UP ASKS FOR NO CODE, and a code sent anyway is neither held nor spent', async () => {
  const { d } = setup();
  const [code] = (await minted(d)).codes;
  assert.ok(code);
  const out = (await d.auth({ flow: 'signup.start', email: 'new@example.com', slug: 'new-studio', ip: nextIp(), checked: true, code } as never)) as AuthResult;
  assert.deepEqual(bodyOf(out), {});
  assert.equal(mailOf(out)?.kind, 'signup.verify');
  assert.equal((await d.invites({ flow: 'invite.list' }))[0]?.state, 'open');
});

test('NO COPY OF THE DIRECTORY CARRIES A CODE', async () => {
  const { d } = setup();
  await minted(d, { note: 'kept out' });
  assert.ok((LEFT_OUT as readonly string[]).includes('dir_invite'));
  assert.ok(!d.dump().some((line) => line.includes('dir_invite') || line.includes('kept out')));
});
