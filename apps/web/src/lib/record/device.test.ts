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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CODE_DIGITS, CODE_MINUTES, CODE_TRIES, approve, fingerprint, normalise, wellFormed } from './device.ts';
import { DEVICES, TOKENS } from './data.ts';
import { REACHES, SCOPES, type Device } from './schema.ts';
import { SCOPES as KERNEL_SCOPES } from '@braindog/kernel';
import { copy } from '../copy.ts';
import { NOW } from '@braindog/seed';
import { since } from 'braindog-render';

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

test('SEVEN DIGITS THROUGH `approve` APPROVES NOTHING, WHICH IS WHERE IT MATTERS', () => {
  /**
   * `normalise` was pinned in isolation and the composition was not, so moving the truncation one
   * call out — `normalise(typed).slice(0, CODE_DIGITS)` inside `approve` — left every test green
   * while producing verbatim the behaviour the file says it refuses: *"approves whichever grant the
   * first six happen to match"*. A property asserted about a helper is not asserted about the
   * function that uses it.
   */
  const rows = [waiting('dg_a', '314159')];
  const out = approve(rows, '3141599', NOW);
  assert.equal(out.result.ok, false, 'a seven-digit entry was trimmed to six and approved a grant');
  assert.equal(out.result.ok === false && out.result.refusal.code, 'VALUE_MALFORMED');
  assert.deepEqual(out.rows.map((d) => d.state), ['pending']);
  assert.deepEqual(out.rows.map((d) => d.tries), [0], 'a malformed entry spent a try');
  /* And a leading zero is not somewhere to trim from either. */
  assert.equal(approve([waiting('dg_a', '031415')], '0314159', NOW).result.ok, false);
});

test('AND WHAT IS NOT A SEPARATOR IS NOT DISCARDED', () => {
  /**
   * `normalise` stripped every non-digit, so `314x159` was silently accepted as `314159` — under a
   * refusal sentence reading *"Spaces are fine; nothing else is"*. That is not a cosmetic
   * disagreement: an accepted entry spends a try on every waiting row, so a paste that dragged a
   * word along with it cost somebody else's enrolment one of its five.
   */
  const rows = [waiting('dg_a', '314159')];
  for (const typed of ['314x159', '314 159 and enter', 'http://x/settings/agents 314159', '3141q59'])
    assert.equal(approve(rows, typed, NOW).result.ok, false, `\`${typed}\` was accepted as a code`);
  /* The separators a code is actually printed with still are. `48 §5.2` prints two groups. */
  for (const typed of ['314 159', '314-159', '314\u00a0159', '  314159  ', '314\u2013159'])
    assert.equal(approve(rows, typed, NOW).result.ok, true, `\`${typed}\` is how the code is printed and was refused`);
});

test('and the refusal says which of the three ways it was wrong', () => {
  /* One sentence for every malformed entry is a sentence that stops being read — and, on a
     `role="status"`, a second identical attempt is not a change and announces nothing at all. */
  const rows = [waiting('dg_a', '314159')];
  const said = ['', '31415', '3141599', '314x159'].map((typed) => {
    const out = approve(rows, typed, NOW);
    assert.equal(out.result.ok, false);
    return out.result.ok === false ? out.result.refusal.fix : '';
  });
  assert.equal(new Set(said).size, said.length, `four different mistakes got ${new Set(said).size} sentences`);
  for (const line of said) assert.ok(line.length > 0);
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

test('and the boundary itself is decided, rather than left to whichever comparison was typed', () => {
  /* Ten minutes exactly. `>` and `>=` are one character apart and both look right; the difference is
     a grant that is alive at the instant it dies. It expires AT ten minutes, because `49 §5.9` gives
     the row `expires = now + 10 min` and a row is over when it reaches its expiry. */
  const at = (ms: number) => waiting('dg_a', '314159', { at: new Date(NOW - ms).toISOString() });
  assert.equal(approve([at(CODE_MINUTES * 60_000 - 1)], '314159', NOW).result.ok, true, 'a millisecond early and it was already dead');
  assert.equal(approve([at(CODE_MINUTES * 60_000)], '314159', NOW).result.ok, false, 'it was still alive at its own expiry');
});

test('the expired rows are not swept into the denial', () => {
  /* The fifth wrong code denies every PENDING row. A row that had already run out of time is not
     pending and never was denied by anybody — `12 §6.1` keeps a denied row because it is the line
     *"I said no to a request I did not make"*, and a row nobody said no to must not carry it. */
  let out = approve([waiting('dg_a', '314159'), waiting('dg_b', '271828', { at: new Date(NOW - 20 * 60_000).toISOString() })], '000000', NOW);
  for (let i = 1; i < CODE_TRIES; i += 1) out = approve(out.rows, '000000', NOW);
  assert.equal(out.result.ok === false && out.result.refusal.code, 'DEVICE_CODE_TRIES');
  assert.deepEqual(out.rows.map((d) => d.state), ['denied', 'expired']);
});

test('every refusal says where it is about, which is the field somebody is looking at', () => {
  /* `at` is what puts a refusal beside the control that caused it (`30 §6`). Only `VALUE_MALFORMED`
     was asserted, so the other two could point anywhere and the screen would still render them —
     somewhere else. */
  const rows = [waiting('dg_a', '314159')];
  let out = approve(rows, '000000', NOW);
  assert.equal(out.result.ok === false && out.result.refusal.at, 'user_code');
  for (let i = 1; i < CODE_TRIES; i += 1) out = approve(out.rows, '000000', NOW);
  assert.equal(out.result.ok === false && out.result.refusal.code, 'DEVICE_CODE_TRIES');
  assert.equal(out.result.ok === false && out.result.refusal.at, 'user_code');
});

test('a refusal hands back its own array, not the caller\u2019s', () => {
  /* The rows go into a `$state` array on the screen. Handing the same reference back makes the
     assignment a no-op in one direction and an alias in the other, which is the shape of a bug that
     only appears once something else mutates in place. */
  const rows = [waiting('dg_a', '314159')];
  assert.notEqual(approve(rows, '12', NOW).rows, rows, 'the malformed path aliased the caller\u2019s array');
  assert.notEqual(approve(rows, '000000', NOW).rows, rows);
  assert.notEqual(approve(rows, '314159', NOW).rows, rows);
});

/* ── the seed, and the screen it draws ────────────────────────────────────── */

test('THE SHIPPED RECORD CANNOT BE APPROVED BY ANY CODE AT ALL, AND FOUR GUESSES DID NOT PROVE IT', () => {
  /**
   * This test used to try `000000`, `123456`, `111111` and `314159` and call that a proof. The
   * search space is a million and the mock's hash is djb2 folded to 32 bits, so a review enumerated
   * the whole space in under a second and found the one code that opened the shipped row: the four
   * guesses were four samples of a set somebody could simply build.
   *
   * The seed carries no fingerprint now, which is a property rather than a hope — `fingerprint`
   * cannot return the empty string, so nothing matches. **And this asserts it over the entire
   * domain**, because that is what the claim actually says and it is cheap enough to say properly.
   */
  for (const d of DEVICES) if (d.state === 'pending') assert.equal(d.codeHash, '', `${d.id} ships a fingerprint somebody can enumerate`);

  let opened = 0;
  for (let n = 0; n < 1_000_000; n += 1)
    if (approve(DEVICES, String(n).padStart(CODE_DIGITS, '0'), NOW).result.ok) opened += 1;
  assert.equal(opened, 0, `${opened} of a million codes approved a request in the shipped seed`);
});

test('the fingerprint is a fixed function, not whatever djb2 happens to be today', () => {
  /* Every constant in it — the 5381 seed, the multiply by 33, the order of `id` and `code`, base 36 —
     could be changed without a test noticing, because nothing pinned the output. It is not a
     security control, and it is still a stored format: a row written by one spelling and checked by
     another matches nothing, silently. */
  /* A VECTOR, because every property short of one survives the change that would break it. Seed
     5381 → 5382, ×33 → ×31, `id:code` → `code:id`, base 36 → base 16: all four leave determinism,
     the charset, the asymmetry and the difference intact, and all four silently stop matching rows
     written by the previous spelling. This is the assertion that fails on any of them. */
  assert.equal(fingerprint('dg_a', '314159'), '2ygtk9');
  assert.equal(fingerprint('dg_b', '314159'), 'sdsv2i');
  assert.equal(fingerprint('dg_a', '314159'), fingerprint('dg_a', '314159'), 'it is not deterministic');
  assert.match(fingerprint('dg_a', '314159'), /^[0-9a-z]+$/u);
  assert.notEqual(fingerprint('dg_a', '314159'), fingerprint('314159', 'dg_a'), 'the id and the code are interchangeable');
  assert.notEqual(fingerprint('dg_a', '314159'), fingerprint('dg_a', '314158'));
  /* And it can never be the empty string, which is what makes an empty `codeHash` unmatchable. */
  for (const [id, code] of [['', ''], ['dg_a', ''], ['', '000000']] as const) assert.ok(fingerprint(id, code).length > 0);
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

test('THE WAITING REQUEST IS INSIDE ITS OWN TEN MINUTES', () => {
  /**
   * The defect the whole seed change was for, and it had no test: `at` was `day(0)`, which parses to
   * midnight, against a seed clock of noon — so the one pending row was twelve hours dead while the
   * screen drew it as waiting for you, and the code field could never have approved it. Putting
   * `day(0)` back left every test green.
   *
   * It asserts the PROPERTY rather than the literal, so it survives the seed being re-timed and
   * fails the moment the row stops being answerable.
   */
  const pending = DEVICES.filter((d) => d.state === 'pending');
  assert.ok(pending.length > 0, 'the seed has no waiting request at all');
  for (const d of pending) {
    const age = NOW - Date.parse(d.at);
    assert.ok(Number.isFinite(age), `${d.id}'s \`at\` is not an instant`);
    assert.ok(age >= 0, `${d.id} was asked in the future`);
    assert.ok(age < CODE_MINUTES * 60_000, `${d.id} ran out of time ${Math.round(age / 60_000)} minutes ago and still says it is waiting for you`);
  }
  /* And the expired row is genuinely past it, or the state is decoration. */
  for (const d of DEVICES.filter((x) => x.state === 'expired'))
    assert.ok(NOW - Date.parse(d.at) >= CODE_MINUTES * 60_000, `${d.id} says it ran out of time and has not`);
});

test('AND THE SCREEN CAN SAY THE TIME IN THE UNIT THE DECISION TURNS ON', () => {
  /**
   * `relative()` takes a DAY — it is anchored on `YYYY-MM-DD` and hands back its argument when the
   * pattern misses — so an instant rendered as `2026-09-03T11:57:00.000Z` on screen. Truncating to
   * the day, which is what every other caller does, makes a three-minute-old request and an
   * eleven-hour-old one both read *today*, on the table whose whole decision is ten minutes.
   */
  for (const d of DEVICES) {
    for (const iso of [d.at, d.lastSeen]) {
      if (iso === null) continue;
      const shown = since(iso, NOW);
      assert.ok(!shown.includes('T') && !shown.includes('Z'), `${d.id} renders a raw instant: ${shown}`);
      assert.ok(shown.length < 20, `${d.id} renders something that is not a band: ${shown}`);
    }
  }
  const pending = DEVICES.find((d) => d.state === 'pending')!;
  assert.match(since(pending.at, NOW), /just now|min ago/u, 'a request made minutes ago does not say so');

  /* AND THE COLUMN IS AN INSTANT, which is the thing that broke. A day string renders perfectly well
     through `since` — it hands a day to `relative` — so "nothing prints a raw ISO" is satisfied by
     going back to `day()`, which is exactly the regression. A day cannot express ten minutes, so the
     shape is the assertion. */
  for (const d of DEVICES)
    for (const [what, iso] of [['at', d.at], ['lastSeen', d.lastSeen]] as const) {
      if (iso === null) continue;
      assert.match(iso, /^\d{4}-\d{2}-\d{2}T/u, `${d.id}.${what} is stored to the day on a table that decides by the minute`);
    }
});

test('the seed shows every state a person cannot reach by pressing something', () => {
  /**
   * A state with a word nobody can see is a word nobody wrote for anybody. Four of the six are only
   * reachable by being SEEDED — nothing on the screen can make a machine connect, run out of time or
   * be refused — so if the seed drops one, the copy and the tone map beside it become decoration and
   * nothing notices. Deleting the `expired` row left every test green.
   *
   * The other two are reachable and deliberately absent: `approved` happens when you type a code, and
   * `revoked` when you press Disconnect — which is one of the twenty inert controls, so `revoked` is
   * the one state in this table that still cannot be drawn. That is in the backlog rather than here.
   */
  const seeded = new Set(DEVICES.map((d) => d.state));
  for (const state of ['pending', 'active', 'expired', 'denied'] as const)
    assert.ok(seeded.has(state), `no row is ${state}, so its word and its mark are unreachable`);
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

test('AND EACH SENTENCE IS ITS OWN, NOT A NEIGHBOUR\u2019S', () => {
  /**
   * The check above asserts the map has a KEY for every member, which a copied sentence satisfies:
   * giving the read-only key the write sentence — *"can read and change rows"* — left it green, on
   * the one screen whose subject is what a machine is allowed to do to your record.
   *
   * `20 §1`'s ladder is `read ⊂ propose ⊂ write`, so `read`'s sentence has to be the narrowest and
   * cannot be the widest. Same for the reaches: the four operation grants are ten minutes and
   * single-use, and `login` and `runner` are ninety days, so a sentence that says the wrong life is
   * a sentence about a different grant.
   */
  const can = SCOPES.map((s) => copy.keyCan[s]!);
  assert.equal(new Set(can).size, can.length, 'two rungs of the ladder read the same');
  assert.match(copy.keyCan.read!, /change nothing/u, 'the read-only key does not say it changes nothing');
  assert.doesNotMatch(copy.keyCan.read!, /change rows/u);
  assert.match(copy.keyCan.write!, /change rows/u);

  const means = REACHES.map((r) => copy.reachMeans[r]!);
  assert.equal(new Set(means).size, means.length, 'two reaches read the same');
  for (const r of ['login', 'runner'] as const) assert.match(copy.reachMeans[r]!, /ninety days/u, `${r} does not say how long it lasts`);
  for (const r of ['export', 'import', 'pack', 'token'] as const)
    assert.match(copy.reachMeans[r]!, /once, in the next ten minutes/u, `${r} is an operation grant and does not say so`);
});

test('EVERY SENTENCE THIS SCREEN SAYS IS A SENTENCE', () => {
  /**
   * Emptying `codeLabel`, or making `approvedNow` return a constant that ignores both its arguments,
   * left the suite green — on a control whose entire job is to tell somebody what they just
   * authorised. A test that only asks whether a key EXISTS is satisfied by the empty string.
   */
  const said: [string, string][] = [
    ['enterCode', copy.enterCode],
    ['enterCodeHow', copy.enterCodeHow],
    ['codeLabel', copy.codeLabel],
    ['codeGo', copy.codeGo],
    ['keys', copy.keys],
    ['keysHow', copy.keysHow],
    ['noKeys', copy.noKeys],
    ['noKeysWhy', copy.noKeysWhy],
    ['revokeKey', copy.revokeKey],
  ];
  for (const [key, line] of said) {
    assert.equal(typeof line, 'string', `${key} is not a sentence`);
    assert.ok(line.trim().length > 2, `${key} is empty or nearly so`);
  }

  /* AND THE ONES BUILT FROM ARGUMENTS CARRY THEM. `approvedNow` is the whole of what a person is told
     after the one irreversible thing this screen does; a version that drops the label and the reach
     tells them a machine was approved without saying which, or to do what. */
  const line = copy.approvedNow('Codex, unknown machine', 'claim jobs and run code as you, for ninety days');
  assert.ok(line.includes('Codex, unknown machine'), 'the approval does not say what was approved');
  assert.ok(line.includes('claim jobs and run code as you'), 'the approval does not say what it granted');
  assert.notEqual(line, copy.approvedNow('Something else', 'do something else'));

  for (const said2 of [copy.saysItIs('codex-cli 0.9'), copy.aboutWhat('the whole record'), copy.usedWhen('3 min ago'), copy.madeWhen('4w ago'), copy.endsWhen('in 8w')])
    assert.ok(said2.length > 6 && /[a-z]/u.test(said2));
  assert.ok(copy.saysItIs('codex-cli 0.9').includes('codex-cli 0.9'));
  assert.ok(copy.aboutWhat('the whole record').includes('the whole record'));
});

test('the closed lists agree with the ones that own them', () => {
  /* Written in `schema.ts` rather than imported, because that file is the record as the BROWSER sees
     it. The cost of a second copy is that it can drift, and this is the check that catches it. */
  assert.deepEqual([...SCOPES], [...KERNEL_SCOPES]);

  /**
   * AND THE REACHES AGAINST THE DDL, WHICH IS WHERE THEY ACTUALLY LIVE.
   *
   * This asserted `REACHES.length === 6` and that they were unique, and `schema.ts` claimed beside
   * it that the test "would actually catch a seventh reach" — which six-and-unique does not, and a
   * RENAMED reach satisfies outright. There is no exported list to import: `30 §1`'s
   * `CHECK (reach IN (…))` is SQL text in the migration, and `closed-lists.mjs` says in its own
   * header that the `as const` half of that comparison "is not here yet". So this reads the text.
   */
  const ddl = readFileSync(fileURLToPath(new URL('../../../../../packages/kernel/src/migrations/0001_kernel.ts', import.meta.url)), 'utf8');
  const check = /CHECK \(reach IN \(([^)]*)\)\)/u.exec(ddl);
  assert.ok(check, 'the migration no longer constrains `reach`, which is a bigger problem than this test');
  const declared = [...check[1]!.matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  assert.deepEqual([...REACHES].sort(), declared.sort(), 'the browser and the database disagree about what a grant can reach');
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
