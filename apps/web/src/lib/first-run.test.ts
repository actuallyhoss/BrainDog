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

import { copy } from './copy.ts';
import { firstAsks, firstRun } from './first-run.ts';
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
  }
});
