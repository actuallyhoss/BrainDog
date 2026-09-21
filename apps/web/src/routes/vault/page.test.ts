/**
 * `/vault`'s reads, and what the screen is allowed to draw from each answer.
 *
 * DRIVEN BEFORE IT WAS WRITTEN, against two provisioned self-hosts and a colleague invited at `read`.
 * Every body quoted below is one this record actually sent on 21 September 2026:
 *
 *   fresh record, owner, 390 and 1440
 *     422 GET /api/list?register=things       {"code":"REGISTER_UNKNOWN","fix":"There is no register called things."}
 *     422 GET /api/list?register=credentials  {"code":"REGISTER_UNKNOWN","fix":"There is no register called credentials."}
 *     and the screen drew "No keys yet." over both of them, with a working Add a key button:
 *     44 words, one control, and neither refusal on the screen.
 *
 *   the same record with the Agents add-on in, a colleague at `read`, 390 and 1440
 *     403 POST /api/listDevices  {"code":"LEVEL_REQUIRED","fix":"This needs owner, and you have read access. Ask an owner to raise your access."}
 *     and the screen drew that one sentence and nothing else: 19 words, one control, and the Keys
 *     index was never asked for, although the rail said `Keys 2` to that same person and
 *     `/r/credentials` drew both rows to them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countSaid, machinesTellOf, mayAct, saidOf, tellOf, words } from './said.ts';

const REGISTER_UNKNOWN = {
  ok: false as const,
  refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no register called credentials.', allowed: ['session'] },
};
const LEVEL_REQUIRED = {
  ok: false as const,
  refusal: { code: 'LEVEL_REQUIRED', fix: 'This needs owner, and you have read access. Ask an owner to raise your access.', allowed: ['read'] },
};
const NEEDS_BROWSER_SESSION = {
  ok: false as const,
  refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot reach the vault.', at: 'principal' },
};

test('A LIST THE RECORD DOES NOT HOLD is read as absent, and the record’s own sentence is kept', () => {
  assert.deepEqual(saidOf(REGISTER_UNKNOWN), { kind: 'absent', fix: 'There is no register called credentials.' });
});

test('A REFUSAL ABOUT WHO IS ASKING is read as refused, with the sentence the record sent, word for word', () => {
  assert.deepEqual(saidOf(LEVEL_REQUIRED), {
    kind: 'refused',
    fix: 'This needs owner, and you have read access. Ask an owner to raise your access.',
  });
  assert.deepEqual(saidOf(NEEDS_BROWSER_SESSION), { kind: 'refused', fix: 'Open this from the app; a token cannot reach the vault.' });
});

test('AN ANSWER IS AN ANSWER, and a conflict is read as a refusal rather than drawn blank', () => {
  assert.deepEqual(saidOf({ ok: true, value: [] }), { kind: 'held' });
  assert.deepEqual(saidOf({ ok: false, conflict: { version: 2 } }), { kind: 'refused', fix: words.noAnswer });
});

test('THE KEYS PANEL SAYS WHAT THE RECORD SAID, and where the record holds no such list it names the thing to change', () => {
  const absent = tellOf(saidOf(REGISTER_UNKNOWN));
  assert.equal(absent?.kind, 'no-data-yet');
  assert.equal(absent?.title, words.noList);
  /* The record's own sentence, and then the one thing a person can do about it. */
  assert.match(absent?.body ?? '', /There is no register called credentials\./u);
  assert.match(absent?.body ?? '', /Agents add-on/u);
});

test('A REFUSAL ABOUT ACCESS IS DRAWN AS ONE, not as an empty list', () => {
  const refused = tellOf(saidOf(LEVEL_REQUIRED));
  assert.equal(refused?.kind, 'no-permission');
  assert.equal(refused?.body, 'This needs owner, and you have read access. Ask an owner to raise your access.');
});

test('A LIST THAT ANSWERED HAS NOTHING TO SAY, so the screen draws its rows and its own designed empty', () => {
  assert.equal(tellOf(saidOf({ ok: true, value: [] })), null);
});

/**
 * THE ACTS AND THE INDEX ARE TWO DIFFERENT QUESTIONS, and the screen used to answer both with the
 * first refusal it got. `listDevices` is ADMIN and `putKey`, `openKey` and `revokeGrant` are VAULT,
 * and `packages/record/src/index.ts:3772` says in its own comment that the two are the same
 * predicate: every token, then anybody below owner. So the devices answering IS the acts being
 * this person's, and the index is a separate read that a reader may have.
 */
test('THE ACTS BELONG TO WHOEVER THE RECORD LET LIST THE MACHINES, and to nobody else', () => {
  assert.equal(mayAct(saidOf({ ok: true, value: [] })), true);
  assert.equal(mayAct(saidOf(LEVEL_REQUIRED)), false);
  assert.equal(mayAct(saidOf(NEEDS_BROWSER_SESSION)), false);
});

/**
 * THE MACHINES HALF IS THE ONE THIS CHANGE IS ABOUT, AND IT WENT IN UNCOVERED. Blanking
 * `machinesTellOf` to `return null` left all seven tests above green, which is the screen back where
 * it started: `403 LEVEL_REQUIRED` on `listDevices` swallowed, and the section drawn as "No machines"
 * to somebody the record refused rather than as the sentence the record sent.
 */
test('THE MACHINES SECTION SAYS THE RECORD’S OWN REFUSAL, and says nothing when the record answered', () => {
  const refused = machinesTellOf(saidOf(LEVEL_REQUIRED));
  assert.equal(refused?.kind, 'no-permission');
  assert.equal(refused?.title, words.machinesNotYours);
  assert.equal(refused?.body, 'This needs owner, and you have read access. Ask an owner to raise your access.');
  /* A token is refused by a different gate and with a different sentence, and that one travels too. */
  assert.equal(machinesTellOf(saidOf(NEEDS_BROWSER_SESSION))?.body, 'Open this from the app; a token cannot reach the vault.');
  assert.equal(machinesTellOf(saidOf({ ok: true, value: [] })), null);
});


test('A COUNT THE RECORD REFUSED SAYS WHAT THE RECORD SAID, and never that it is not yours', () => {
  /**
   * `listGrants` IS THE VAULT GATE: an owner plus a sign-in under fifteen minutes old. `authed_at`
   * is set at sign-in and never refreshed, so an owner who signed in an hour ago and opens this
   * screen gets the machines (admin, no freshness) and a refused count. The line used to say "how
   * often it was opened is not yours to see" to that owner, which is false: it is theirs, and what
   * they need is a fresh sign-in, which is what the record's own sentence tells them.
   */
  const fresh = { kind: 'refused', fix: 'Sign in again to open the vault.' } as const;
  assert.equal(countSaid(fresh), 'Sign in again to open the vault.');
  assert.equal(countSaid({ kind: 'absent', fix: 'There is no register called grant.' }), 'There is no register called grant.');
  assert.equal(countSaid({ kind: 'held' }), '', 'a count that came back is drawn as the count');
});
