/**
 * A person's name: what is a name and what is a form's placeholder nobody filled in (`api/person-name.ts`).
 *
 * SIGN-UP IS OPEN TO STRANGERS, so this refusal is what a stranger meets, and it has to be wrong in neither direction:
 * a name with a note in brackets is a name, and "First Last" is not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { personNameOf, placeholderName, PERSON_NAME_SUPPORT } from '../src/api/person-name.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** The refusal a result carries, failing the test when it was taken. */
const refusalOf = (r: { ok: boolean }, what: string) => {
  assert.equal(r.ok, false, `${what} was stored as a name`);
  assert.ok('refusal' in r, `${what} was not refused with a sentence`);
  return (r as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

/* The names the audit stored through sign-up, and the two it refused that are a name with a note. */
const NAMES = [
  '(Sam) [work]', '(ex-Acme) Sam (work)', 'Sam [admin]', 'Sam (work)', 'Zoë [Z] O’Brien', 'Bo {B} Tanner',
  '山田（太郎）', 'Ana María «Anita» López', 'Jean-Luc (JL) Picard', 'Kim (김민준)', '김민준 (Kim)', '(김민준) Kim',
  '李雷', 'Мария Иванова', 'محمد علي', 'שרה כהן', 'Nguyễn Văn An', '„Anita“ Weber',
  /* A WORD IN A NAME IS NOT THE NAME: never a single real word refused for holding a field word. */
  'Namelia', 'Owner-Smith', 'Todorov', 'Jane Doering', 'Firstbrook', 'Your', 'Doe', 'Jane', 'John', 'Sam',
  'Sam (owner)', 'Ana (first born)', 'Lee [Firstbrook]', 'First', 'Last', 'Nam',
];

/* The audit's thirty-one placeholder spellings that were all stored, "Your Name", and the bracketed fields. */
const PLACEHOLDERS = [
  'Name', 'Full Name', 'First Last', 'Firstname Lastname', 'Owner', 'NAME', 'your_name', 'YourName', 'your-name',
  'Your.Name', 'yourname', '"Name"', '“Name”', "'Name'", '»Name«', '›Name‹', '﹤Name﹥', '˂Name˃', 'ᐸNameᐳ', '＂Name＂',
  'Jane Doe', 'John Doe', 'y o u r n a m e', 'TODO', 'CHANGE ME', 'changeme', '$name', '${name}', '%NAME%', ':name',
  '$env:USERNAME', 'Your Name', 'your name', 'your　name', 'first last', 'JOHN DOE',
  '[NAME]', '[Sam]', '{Sam}', '(Sam)', '((Name))', '{{ owner }}', '【山田】', '[First] [Last]', '{{first_name}} {{last_name}}',
  '{first}', 'Sam {firstName}', 'Sam [your name]', 'Sam [Last_Name]', '*|FNAME|*', '%FIRST_NAME%', '${first} Smith',
  /* A FIELD'S LABEL RUN TOGETHER IS THE FIELD, in any bracket, and the two labels every form prints. */
  'Sam [yourname]', 'Sam [lastname]', 'Sam (your name)', '(First Name)', 'First Name', 'last name', 'Firstname',
];

test('A NAME WITH A NOTE IN BRACKETS IS A NAME, and so is every script the audit typed', () => {
  for (const typed of NAMES) {
    assert.equal(placeholderName(typed), false, `${typed} was read as a placeholder`);
    const out = personNameOf(typed);
    assert.ok(out.ok, `${typed} was refused`);
    assert.equal(out.value, typed);
  }
});

test('A FORM LEFT AS IT WAS IS NOT A NAME: every placeholder spelling, compared whole and without case', () => {
  for (const typed of PLACEHOLDERS) {
    assert.equal(placeholderName(typed), true, `${typed} was stored as a name`);
    const said = refusalOf(personNameOf(typed), typed);
    assert.equal(said.at, 'name');
    assert.equal(said.code, 'VALUE_MALFORMED');
  }
});

test('the refusal says how to reach a person, with no em dash and no id', () => {
  const { fix } = refusalOf(personNameOf('John Doe'), 'John Doe');
  assert.ok(fix.includes(PERSON_NAME_SUPPORT), 'a real John Doe is told where to write');
  assert.match(PERSON_NAME_SUPPORT, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  assert.doesNotMatch(fix, /—/);
  assert.doesNotMatch(fix, /\b(rec|p)_[0-9A-Z]/);
});

test('the rest of the rule holds: empty, too long, hidden characters', () => {
  assert.equal(personNameOf('   ').ok, false);
  assert.equal(personNameOf(7).ok, false);
  assert.equal(personNameOf('a'.repeat(81)).ok, false);
  assert.equal(personNameOf('Sam‮evil').ok, false);
  const spaced = personNameOf('  Sam   Smith ');
  assert.ok(spaced.ok);
  assert.equal(spaced.value, 'Sam Smith');
});

test('A RENAME TAKES "(Sam) [work]" AND REFUSES "First Last", through the record the person is in', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 9, 9, 12)));
  const made = k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'Africa/Cairo', locale: 'en-GB', owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' } });
  assert.ok(made.ok);

  const kept = k.renamePerson('p_1', '(Sam) [work]');
  assert.ok(kept.ok, JSON.stringify(kept));
  assert.equal(sql.one<{ name: string }>("SELECT name FROM person WHERE id = 'p_1'")?.name, '(Sam) [work]');

  const refused = k.renamePerson('p_1', 'First Last');
  assert.equal(refused.ok, false);
  assert.equal(sql.one<{ name: string }>("SELECT name FROM person WHERE id = 'p_1'")?.name, '(Sam) [work]', 'a refused rename moved the name');
  sql.close();
});
