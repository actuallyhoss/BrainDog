/**
 * The code-entry control, which `19 §2` names as one of `/settings/agents`' three things and the
 * screen had none of.
 *
 * Four documents make `${origin}/settings/agents` the address a machine prints (`33 §10`, `49 §5.9`,
 * `26 §2.3`, `53 §5`). Somebody who runs `braindog runner enroll`, reads six digits off their
 * terminal and follows the URL it printed arrived at a read-only list with zero `<input>` in
 * `<main>` — and the Approve button's own toast mentioned a six-digit code no control on the page
 * could accept.
 *
 * WHAT IS ACTUALLY BEING TESTED is the arithmetic of a wrong guess, because that is the part with
 * consequences: a try is spent on every waiting row, not on the one you meant, and the fifth denies
 * all of them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CODE_DIGITS, CODE_MINUTES, CODE_TRIES, approve, fingerprint, normalise, wellFormed } from './device.ts';
import { DEVICES, TOKENS } from './data.ts';
import { REACHES, SCOPES, type Device } from './schema.ts';
import { SCOPES as KERNEL_SCOPES } from '@braindog/kernel';
import { copy } from '../copy.ts';
import { NOW } from '@braindog/seed';

/** A pending grant, live, with a code this test knows and the record does not hold. */
const waiting = (id: string, code: string, over: Partial<Device> = {}): Device => ({
  id,
  name: `${id} on a laptop`,
  surface: 'cli',
  state: 'pending',
  reach: 'login',
  ua: null,
  tries: 0,
  codeHash: fingerprint(id, code),
  at: new Date(NOW - 60_000).toISOString(),
  lastSeen: null,
  ...over,
});

/* ── the shape, and why a bad one never reaches the record ────────────────── */

test('the field takes what the terminal printed, spaces and all', () => {
  /* `48 §5.2` step 3 prints `Open <uri> and enter  314 159` — as two groups, deliberately, because
     six digits in a row are hard to carry across a room. A field that refused the space would be
     refusing the exact string the product told the reader to type. `12 §3` names paste as the reason
     this field satisfies WCAG 2.2's accessible-authentication criterion for free. */
  assert.equal(normalise('314 159'), '314159');
  assert.equal(normalise('314-159'), '314159');
  assert.equal(normalise('  314159\n'), '314159');
  /* A non-breaking space, which is what a terminal or a chat client substitutes on the way. */
  assert.equal(normalise('314 159'), '314159');
  assert.ok(wellFormed(normalise('314 159')));
});

test('SEVEN DIGITS IS A MISTAKE, NOT A CODE WITH SOMETHING EXTRA ON THE END', () => {
  /* Truncating to `CODE_DIGITS` would approve whichever grant the first six happen to match, which
     is the one outcome nobody typing seven digits wanted. It is refused out loud. */
  assert.equal(normalise('3141599'), '3141599');
  assert.equal(wellFormed('3141599'), false);
  assert.equal(wellFormed('31415'), false);
  assert.equal(wellFormed(''), false);
  assert.equal(wellFormed('31415a'), false);
  assert.equal(wellFormed('314159'), true);
});

test('A MALFORMED ENTRY DOES NOT SPEND A TRY, AND THE REASON IS SOMEBODY ELSE', () => {
  /**
   * `49 §5.9` step 2.1 bumps `tries` on EVERY pending row before it looks at any of them. So if a
   * typo were sent to the record, five typos would deny a colleague's enrolment that this person
   * never saw. The wire has nothing to say about a string that cannot be a code, so the shape check
   * happens before the send and the rows come back untouched.
   */
  const rows = [waiting('dg_a', '314159'), waiting('dg_b', '271828')];
  const out = approve(rows, '31', NOW);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.ok === false && out.result.refusal.code, 'VALUE_MALFORMED');
  assert.equal(out.result.ok === false && out.result.refusal.at, 'user_code');
  assert.deepEqual(out.rows.map((d) => d.tries), [0, 0]);
  assert.deepEqual(out.rows.map((d) => d.state), ['pending', 'pending']);
});

/* ── a wrong guess, and who pays for it ───────────────────────────────────── */

test('EVERY WAITING ROW PAYS FOR ONE WRONG GUESS, NOT THE ONE YOU MEANT', () => {
  const rows = [waiting('dg_a', '314159'), waiting('dg_b', '271828')];
  const out = approve(rows, '000000', NOW);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.ok === false && out.result.refusal.code, 'FORBIDDEN');
  assert.deepEqual(out.rows.map((d) => d.tries), [1, 1], 'the try was charged to one row, not to all of them');
});

test('a wrong guess volunteers no count, because the record does not send one', () => {
  /* `49 §5.9` step 2.4: no match and under five is `404 bare`. A browser printing "two tries left"
     would be printing something the API never told it — and the fix line covers the outcome that
     matters. */
  const out = approve([waiting('dg_a', '314159')], '000000', NOW);
  const said = out.result.ok === false ? out.result.refusal.fix : '';
  assert.ok(said.length > 0);
  assert.ok(!/\d/u.test(said), `the miss leaked a number the wire does not carry: ${said}`);
});

test('THE FIFTH WRONG CODE DENIES EVERY PENDING ROW, AND KEEPS THEM', () => {
  let rows: Device[] = [waiting('dg_a', '314159'), waiting('dg_b', '271828')];
  let last = approve(rows, '000000', NOW);
  for (let i = 1; i < CODE_TRIES; i += 1) {
    rows = last.rows;
    assert.equal(last.result.ok === false && last.result.refusal.code, 'FORBIDDEN', `try ${i} ended early`);
    last = approve(rows, '000000', NOW);
  }
  assert.equal(last.result.ok === false && last.result.refusal.code, 'DEVICE_CODE_TRIES');
  /* `49 §5.9` step 2.4 gives the fix verbatim. */
  assert.equal(last.result.ok === false && last.result.refusal.fix, 'Ask the device to start again.');
  assert.deepEqual(last.rows.map((d) => d.state), ['denied', 'denied']);
  /* `12 §6.1`: a denied row is KEPT. "I said no to a request I did not make" is the single most
     important line this table can produce, and a row deleted at denial cannot produce it. */
  assert.equal(last.rows.length, 2);
});

test('and a sixth attempt after the denial finds nothing left to charge', () => {
  let out = approve([waiting('dg_a', '314159')], '000000', NOW);
  for (let i = 1; i < CODE_TRIES; i += 1) out = approve(out.rows, '000000', NOW);
  const after = approve(out.rows, '000000', NOW);
  assert.equal(after.result.ok === false && after.result.refusal.code, 'FORBIDDEN');
  assert.deepEqual(after.rows.map((d) => d.state), ['denied'], 'a denied row went round again');
});

/* ── the right code ───────────────────────────────────────────────────────── */

test('THE RIGHT CODE APPROVES ONE ROW AND CHARGES THE OTHERS NOTHING BACK', () => {
  const rows = [waiting('dg_a', '314159', { reach: 'runner', ua: 'codex-cli 0.9' }), waiting('dg_b', '271828')];
  const out = approve(rows, '314 159', NOW);
  assert.equal(out.result.ok, true);
  assert.deepEqual(out.result.ok && out.result.value, {
    id: 'dg_a',
    reach: 'runner',
    label: 'dg_a on a laptop',
    subject: 'codex-cli 0.9',
  });
  /* `12 §6.1`, "one row, two lives": the row is APPROVED here and becomes `active` when the DEVICE
     polls and exchanges it for a token — which happens on the other machine and may never happen.
     A screen that jumped straight to `connected` would be claiming a machine had picked up its key
     before it had. */
  assert.deepEqual(out.rows.map((d) => d.state), ['approved', 'pending']);
  /* The guess was right, so the try charged before the lookup stands — every pending row was bumped
     before any of them was compared, which is what stops a near miss being distinguishable. */
  assert.deepEqual(out.rows.map((d) => d.tries), [1, 1]);
});

test('THE SAME SIX DIGITS DO NOT OPEN A DIFFERENT REQUEST', () => {
  /* The poll id salts the hash — `sha256(id ‖ ':' ‖ user_code)` — so two grants that happen to be
     showing the same six digits are still two different rows. A hash of the code alone would make
     one code approve whichever of them was found first. */
  assert.notEqual(fingerprint('dg_a', '314159'), fingerprint('dg_b', '314159'));
  const rows = [waiting('dg_a', '314159'), waiting('dg_b', '314159')];
  const out = approve(rows, '314159', NOW);
  assert.equal(out.result.ok, true);
  assert.deepEqual(out.rows.map((d) => d.state), ['approved', 'pending']);
});

test('and the row does not contain the code', () => {
  /* The point of a fingerprint rather than the digits: no screen can be built that checks a code by
     reading one out of the row it is meant to be checking, and a dump of the table approves nothing. */
  for (const code of ['314159', '000000', '999999']) {
    const row = waiting('dg_a', code);
    assert.ok(!row.codeHash.includes(code), 'the row carries the code it is supposed to be hiding');
  }
});

/* ── ten minutes ──────────────────────────────────────────────────────────── */

test('A PENDING ROW PAST TEN MINUTES IS EXPIRED, AND TIME IS WHAT EXPIRES IT', () => {
  /* `49 §5.9` step 1: `now + 10 min`. Nobody presses a button to expire a grant — the row is found
     to be over on the next thing that touches it, which is this. And an expired row cannot be
     approved by the code it was showing, which is the whole of what the ten minutes buys. */
  const stale = waiting('dg_a', '314159', { at: new Date(NOW - (CODE_MINUTES + 1) * 60_000).toISOString() });
  const out = approve([stale], '314159', NOW);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.ok === false && out.result.refusal.code, 'FORBIDDEN');
  assert.deepEqual(out.rows.map((d) => d.state), ['expired']);
  assert.deepEqual(out.rows.map((d) => d.tries), [0], 'an expired row was charged for a guess it could not have answered');
});

test('a row inside its ten minutes is still live', () => {
  const fresh = waiting('dg_a', '314159', { at: new Date(NOW - (CODE_MINUTES - 1) * 60_000).toISOString() });
  assert.equal(approve([fresh], '314159', NOW).result.ok, true);
});

/* ── the seed, and the screen it draws ────────────────────────────────────── */

test('THE SHIPPED RECORD CANNOT BE APPROVED BY ANYBODY, WHICH IS THE REAL BEHAVIOUR', () => {
  /**
   * `12 §6.1`: *"Guessing it does not get you in."* The pending row's fingerprint was generated once
   * from a code that was then discarded, so the mock behaves exactly as the real thing does — the
   * six digits live on the machine that is asking, and no amount of reading this repository produces
   * them. A demo that accepted any well-formed code would be teaching the opposite of the one thing
   * this flow exists to establish.
   */
  const tried = ['000000', '123456', '111111', '314159'];
  for (const code of tried) {
    const out = approve(DEVICES, code, NOW);
    assert.equal(out.result.ok, false, `${code} approved a request in the shipped seed`);
  }
});

test('the pending row says what approving it would allow, and what it claims to be', () => {
  /* `49 §5.9` step 2.3: *"the screen said what it was about to grant before the click"*. The row
     carried a name, a surface and a time — everything about who was asking and nothing about what
     they would be able to do. */
  const pending = DEVICES.filter((d) => d.state === 'pending');
  assert.ok(pending.length > 0, 'the seed has no waiting request, so the approve path draws nothing');
  for (const d of pending) {
    assert.ok(copy.reachMeans[d.reach], `${d.id} asks for ${d.reach} and the screen has no sentence for it`);
    assert.ok(d.ua, `${d.id} is the row an approver reads and says nothing about itself`);
  }
});

test('EVERY REACH AND EVERY STATE THE RECORD CAN HOLD HAS A SENTENCE', () => {
  /* The failure this catches is the one the screen shipped with: `state` allowed six values and the
     copy named four, so `approved` — the state a row is in for the seconds after you press the
     button — rendered as nothing at all. */
  for (const reach of REACHES) assert.ok(copy.reachMeans[reach], `no sentence for the ${reach} reach`);
  for (const scope of SCOPES) assert.ok(copy.keyCan[scope], `no sentence for what a ${scope} key can do`);
  const states = ['pending', 'approved', 'active', 'expired', 'denied', 'revoked'] as const;
  for (const state of states) assert.ok(copy.deviceState[state], `no word for a ${state} request`);
});

test('and none of those sentences is a word from the schema', () => {
  /* `19 §9`: `scope` must never reach a user — "say what they can see". The three words on the
     ladder are the schema's, and a screen that printed one would be printing the column. */
  const said = [...Object.values(copy.reachMeans), ...Object.values(copy.keyCan)];
  for (const line of said) {
    assert.ok(!/\bscope\b/iu.test(line), `\`scope\` reaches a reader: ${line}`);
    /* And not the bare ladder words as the whole of an answer, which is the same leak wearing a
       different coat: "write" tells a person nothing about what a machine can do to their record. */
    assert.ok(line.split(/\s+/u).length > 2, `a one-word answer is the column, not a sentence: ${line}`);
  }
});

test('the closed lists agree with the kernel that owns them', () => {
  /* Written in `schema.ts` rather than imported, because that file is the record as the BROWSER sees
     it. The cost of a second copy is that it can drift, and this is the check that catches it — a
     seventh reach or a fourth level added on one side and not the other. */
  assert.deepEqual([...SCOPES], [...KERNEL_SCOPES]);
  assert.equal(REACHES.length, 6);
  assert.equal(new Set(REACHES).size, REACHES.length);
});

test('THE KEYS LIST HOLDS WHAT A KEY OPENS AND NEVER THE KEY', () => {
  /**
   * `12 §3` and this product's first promise. The record keeps `sha256(secret)`; the secret is shown
   * once, on the machine that made it. A list that could show it would make the database a keyring.
   *
   * The shape check is the honest one available to a test: nothing on the row is long enough or
   * random enough to be a bearer, and every field is something a person would recognise.
   */
  assert.ok(TOKENS.length > 0);
  for (const t of TOKENS) {
    const values = Object.values(t).filter((v) => typeof v === 'string') as string[];
    for (const v of values)
      assert.ok(v.length < 40, `${t.id} carries a ${v.length}-character string, which is the shape of a secret`);
    assert.ok((SCOPES as readonly string[]).includes(t.scope), `${t.id} holds ${t.scope}, which is not on the ladder`);
    /* `12 §3`: *"Every token records `last_used_at` and the surface it was used from"* — both, and
       `null` is a real answer to the first. The second is never absent. */
    assert.ok(t.surface, `${t.id} does not say where it was used from`);
    assert.ok(t.expires, `${t.id} never stops working, which is a credential nobody remembers to revoke`);
  }
});

test('one key in the list has never been used, because that is the row worth listing', () => {
  /* `12 §3`'s argument for the list: *"A credential you cannot see being used is a credential you
     cannot know is stolen."* Its inverse is a live key nothing has ever presented — the one to
     revoke, and the one a list of three identical-looking rows hides. */
  assert.ok(TOKENS.some((t) => t.lastUsed === null));
  assert.ok(TOKENS.some((t) => t.lastUsed !== null), 'every key is unused, so the state is the default rather than a signal');
});

test('the six digits are six', () => {
  /* Six is a million (`12 §6.1`), which is only safe alongside five tries and ten minutes — so the
     three constants are one decision and a change to any of them is a change to the argument. */
  assert.equal(CODE_DIGITS, 6);
  assert.equal(CODE_TRIES, 5);
  assert.equal(CODE_MINUTES, 10);
});
