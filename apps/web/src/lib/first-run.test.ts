/**
 * What the first-run form asks for, and what the choice answers without asking.
 *
 * AGAINST THE SEED THE APP SHIPS, not a fixture, for the reason `start.test.ts` gives for the tiles:
 * the defect was two lists drifting apart, what a tile promises and what its register requires, and
 * a fixture repeating one of them would pass while the screen stayed wrong.
 *
 * WHAT IT WAS. The form asked for the title and every required field, so Money was five fields for
 * one row, each wearing `required`, and `Which way` opened on `owed by me` under "Your first
 * invoice": the default most people accept recorded their first invoice backwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Methods, Said } from './auth.ts';
import { copy } from './copy.ts';
import { firstAsks, firstRun, keptNothingCause } from './first-run.ts';
import { readableFields } from './record/api.ts';
import { REGISTERS } from './record/data.ts';
import type { FieldDecl } from './record/schema.ts';

const asks = (key: string): string[] =>
  firstAsks(readableFields(key), REGISTERS[key]?.title, firstRun.firstGiven[key]).map((f) => f.id);

test('EVERY TILE ENDS IN A ROW ITS REGISTER WOULD TAKE: each required field is asked or given, never both', () => {
  for (const c of firstRun.firstChoices) {
    const decl = REGISTERS[c.key];
    assert.ok(decl, `${c.label} opens ${c.key}, which the record does not declare`);
    const given = firstRun.firstGiven[c.key] ?? {};
    const asked = asks(c.key);
    assert.ok(asked.includes(decl.title), `${c.label} does not ask for its title, the one fact the person types`);
    for (const f of readableFields(c.key).filter((x) => x.required)) {
      const a = asked.includes(f.id);
      const g = given[f.id] !== undefined;
      assert.ok(a || g, `${c.label}: ${f.id} is required and is neither asked for nor given`);
      assert.ok(!(a && g), `${c.label}: ${f.id} is given, and then asked for anyway`);
    }
  }
});

test('A GIVEN VALUE IS ONE ITS FIELD DECLARES, and only a choice between declared values is ever given', () => {
  for (const [key, given] of Object.entries(firstRun.firstGiven)) {
    assert.ok(firstRun.firstChoices.some((c) => c.key === key), `${key} has answers, and no tile opens it`);
    const decl = REGISTERS[key];
    assert.ok(decl, `${key} is not a register`);
    for (const [id, value] of Object.entries(given)) {
      const f: FieldDecl | undefined = decl.fields.find((x) => x.id === id);
      assert.ok(f, `${key}.${id} is not a field of ${key}`);
      /* A DATE, AN AMOUNT OR A NAME IS A FACT ABOUT SOMEBODY'S BUSINESS, and one they did not type is
         one they did not state. What a tile can answer is which of a register's own words applies. */
      assert.equal(f.type, 'enum', `${key}.${id} is given, and it is not a choice between declared values`);
      assert.ok(f.values?.includes(value), `${key}.${id} is given ${value}, which is not one of ${f.values?.join(', ')}`);
    }
  }
});

test('AN INVOICE IS OWED TO YOU, and Money asks for what its question names', () => {
  assert.equal(firstRun.firstGiven.obligations?.direction, 'owed_to_me');
  assert.equal(firstRun.firstGiven.obligations?.state, 'open');
  /* "What is it, and how much?": the title, the amount, and the due date `19 §6` pre-fills for the
     person to overwrite. Not `Which way`, not `Status`. */
  assert.deepEqual(asks('obligations'), ['what', 'amount', 'due']);
});

test('A FIELD THE REGISTER DOES NOT REQUIRE IS NOT ON THE FIRST FORM, and the form fills only what it draws', () => {
  /* Tasks declares a due date and does not require it. The form used to fill it anyway, out of sight:
     the first task arrived with a date four weeks out that nobody was shown. */
  assert.deepEqual(asks('tasks'), ['what']);

  /* A SOURCE READ, for the half a unit test cannot drive: the form has to use this rule, seed only
     what it draws, and put the answers where a press would. */
  const form = readFileSync(fileURLToPath(new URL('./ui/RowForm.svelte', import.meta.url)), 'utf8');
  assert.match(form, /firstAsks\(readableFields\(register\), decl\?\.title, given\)/u, 'the form does not ask by this rule');
  assert.match(form, /for \(const f of fields\) \{\n\s+if \(first && f\.deadline/u, 'the form fills fields it does not draw');
  assert.match(form, /return first \? \{ \.\.\.out, \.\.\.given \} : out;/u, 'the answers never reach the row');
  const start = readFileSync(fileURLToPath(new URL('../routes/start/+page.svelte', import.meta.url)), 'utf8');
  assert.match(start, /given=\{firstRun\.firstGiven\[choice\.key\]\}/u, 'the first-run screen does not hand the form its answers');
});

test('THE OUTCOME STARTS WITH A CAPITAL AND NAMES THE ROW, for every tile', () => {
  /* The toast it replaced began "the first row in Money would be written", in lower case. */
  for (const c of firstRun.firstChoices) {
    const thing = firstRun.firstThing[c.key];
    assert.ok(thing, `${c.label} has no name for the row it makes`);
    assert.match(firstRun.rowIsThere(thing, 'Money', copy.markNotWritten), /^[A-Z].* is at the top of the Money list, marked Not saved\.$/u);
    assert.match(copy.notWritten(firstRun.rowChanged(thing, 'Money')), /^[A-Z].* on the Money list was changed, but nothing was saved yet\.$/u);

    /* AND THE SAME THREE ON A RECORD THAT TOOK THE ROW. The demo's sentences say it is waiting and
       marked; these say it is saved and where it lives, and neither set is drawn for the other. */
    assert.match(firstRun.rowSaved(thing, 'Money'), /^[A-Z].* is saved to your record, at the top of the Money list\.$/u);
    assert.match(firstRun.rowChangedSaved(thing, 'Money'), /^[A-Z].* on the Money list was changed\.$/u);
  }

  /* A REFUSAL IS THE RECORD'S OWN SENTENCE, PASSED THROUGH WHOLE. The screen names the row and then
     stops: what to do about it is a rule the record holds and this file does not. */
  assert.equal(
    firstRun.rowNotSaved('Your invoice', 'Amount cannot be left out.'),
    'Your invoice was not saved. Amount cannot be left out.',
  );
});

/**
 * WHY NOTHING WAS SAVED, SAID FOR THE HOST THAT IS ACTUALLY THERE.
 *
 * DRIVEN ON THE LIVE HOSTS. A stranger can finish `/start` on brain.dog and app.brain.dog and is told
 * "This record cannot be written to from the browser". It is the wrong cause. This same screen
 * writes the row from the browser whenever `boot` answers with a record; what the stranger lacks is
 * any way to sign in to one:
 * `/auth/methods` answered `{ passkey: true, magic: false, key: false, open: false, demo: false,
 * me: null, firstRun: true }`, `firstRun` means no passkey exists to assert with, `magic` is off
 * because `AUTH_MAIL_FROM` is empty, and `/auth/provision` is 404 without `PROVISION_KEY`, so no claim
 * link can be minted either.
 *
 * `shown` IS WHAT THE SCREEN DRAWS: the sentence for the host's state where one can be told, and the
 * sentence that is true of every state while `/auth/methods` has not answered.
 */

const shown = (said: Said<Methods> | null): string => {
  const cause = keptNothingCause(said);
  return cause === null ? firstRun.keptNothingWhy : firstRun.keptNothingFor[cause];
};

const host = (over: Partial<Methods>): Said<Methods> => ({
  ok: true,
  value: { passkey: true, magic: false, key: false, open: false, me: null, firstRun: true, ...over },
});

test('A HOST NOBODY CAN SIGN IN TO SAYS SO, and does not blame the browser', () => {
  /* The live hosts, as measured: no passkey yet, no sign-in email, no server key, no claim link. */
  const said = shown(host({}));
  assert.ok(!said.includes('from the browser'), `the cause shown on the live hosts is false: ${said}`);
  assert.match(said, /no way to sign in/u, `the cause shown on the live hosts does not name the missing way in: ${said}`);
  assert.match(said, /until this tab is closed or reloaded/u, 'it stopped saying how long the row lasts');
  /* The same state on a host with no passkey support at all. */
  assert.equal(shown(host({ passkey: false, firstRun: undefined })), said);
});

test('EVERY STATE THE SENTENCE IS REACHED IN GETS ITS OWN CAUSE, and none of them promises a way the host lacks', () => {
  const noDoor = shown(host({}));
  const signIn = [
    shown(host({ firstRun: false })),
    shown(host({ magic: true })),
    shown(host({ key: true, passkey: false, firstRun: undefined })),
  ];
  for (const s of signIn) {
    assert.notEqual(s, noDoor, 'a host somebody can sign in to is told nobody can');
    assert.match(s, /not signed in/u, `a host with a way in does not say the person is signed out: ${s}`);
  }
  const noHost = shown({ ok: false, kind: 'no-host' });
  assert.equal(shown({ ok: false, kind: 'unreachable' }), noHost);
  /* AN OPEN HOST LETS ANYBODY IN, so the sample over one is a `boot` that did not answer. Deleting
     the `open` branch sent it to "not signed in" on a host with nothing to sign in to, and no line
     here went red until this one. */
  assert.equal(shown(host({ open: true, firstRun: false })), noHost, 'an open host is told to sign in');
  assert.ok(!/sign in/u.test(noHost), `a page with no host behind it offers a sign-in there is nowhere to do: ${noHost}`);
  const noRecord = shown(host({ me: { person: 'p1', email: 'a@b.c', record: null, provedAt: 0 } }));
  assert.match(noRecord, /signed in/u);
  assert.ok(!noRecord.includes('not signed in'), `somebody signed in is told they are not: ${noRecord}`);

  /* WHILE THE HOST HAS NOT ANSWERED, THE SENTENCE IS ONE TRUE OF ALL OF THEM, and it is the one the
     screen draws today: `keptNothingWhy` names no cause it cannot yet know. */
  const waiting = shown(null);
  assert.ok(!waiting.includes('from the browser'), `the fallback still blames the browser: ${waiting}`);
  assert.equal(new Set([noDoor, ...signIn.slice(0, 1), noHost, noRecord, waiting]).size, 5, 'two states share one cause');
  for (const s of [noDoor, ...signIn, noHost, noRecord, waiting]) assert.match(s, /^[A-Z].*\.$/u, `not a sentence: ${s}`);
});
