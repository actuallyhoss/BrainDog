/**
 * The sixteen types, and the refusals that are worth having.
 *
 * Most of what is asserted here is a value going in and the same value coming out, which is dull and
 * necessary. What is not dull is the refusals: each one below is a bug that SURVIVES A ROUND TRIP —
 * it looks right in a log, it stores without error, and it is wrong on a screen for ever.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coerce, hasEscapedNewline, isAbsent, isJsonQuoted, isRealDay, parseSpoken, spoken } from '../src/coerce.ts';
import type { FieldDecl } from '../src/coerce.ts';

const f = (type: FieldDecl['type'], extra: Partial<FieldDecl> = {}): FieldDecl => ({ id: 'x', type, ...extra });
const take = (field: FieldDecl, value: unknown, look = {}) => {
  const out = coerce(field, value, look);
  assert.ok(out.ok, out.ok ? '' : `${out.refusal.code}: ${out.refusal.fix}`);
  return out.value;
};
const refuse = (field: FieldDecl, value: unknown, look = {}) => {
  const out = coerce(field, value, look);
  assert.ok(!out.ok, `${JSON.stringify(value)} was accepted`);
  return out.refusal;
};

/* ── the two text refusals, which are the ones that matter ───────────────── */

test('A STRINGIFIED STRING IS REFUSED, not stored', () => {
  // A client that called JSON.stringify on a value it already had. The stored text is `"hello"`
  // WITH the quotes, it looks right in a log, and it is wrong on every screen for ever.
  const r = refuse(f('text'), '"hello"');
  assert.equal(r.code, 'TEXT_JSON_QUOTED');
  assert.match(r.fix, /Send the text itself/);
  assert.ok(isJsonQuoted('"hello"'));
  assert.ok(!isJsonQuoted('"unclosed'), 'a quote at each end is not the test');
  assert.ok(!isJsonQuoted('"a" and "b"'), 'a sentence with quotes in it is a sentence');
  assert.equal(take(f('text'), 'he said "hello"'), 'he said "hello"');
});

test('a backslash-n where a line break was meant is refused', () => {
  // Written once by an agent, read a hundred times by a person, and undetectable afterwards.
  const r = refuse(f('text'), 'first\\nsecond');
  assert.equal(r.code, 'TEXT_ESCAPED_NEWLINE');
  assert.ok(hasEscapedNewline('a\\nb'));
  assert.ok(!hasEscapedNewline('a\nb'), 'a real newline is not the bug');
  /* AND THE FALSE POSITIVE IT ACCEPTS, stated rather than hidden: a Windows path whose next
     character is `n` looks exactly like an escaped newline, because it IS the same two
     characters. The trade is deliberate — an agent sending `\n` for a line break is common and
     silent, and `C:\\next` in a text field is rare and visible — and the refusal names what it saw so
     the caller can tell which of the two happened. */
  assert.ok(hasEscapedNewline('C:\\next'), 'the rule is textual and this is the cost of it');
  assert.ok(!hasEscapedNewline('C:\\next\nand a real break'), 'a real newline anywhere clears it');
  assert.equal(take(f('text'), 'first\nsecond'), 'first\nsecond');
});

test('the quoted check runs first, because a quoted string has no newline either', () => {
  // Reporting the second would send the caller looking for a line break that was never the problem.
  assert.equal(refuse(f('text'), '"a\\nb"').code, 'TEXT_JSON_QUOTED');
});

test('a document is normalised to LF, and text is left exactly as it arrived', () => {
  // The dialect is line-based: a CRLF would put a stray carriage return in every fence.
  assert.equal(take(f('document'), 'a\r\nb'), 'a\nb');
  assert.equal(take(f('text'), 'a\r\nb'), 'a\r\nb');
});

/* ── money, which is the type the whole record is careful about ──────────── */

test('MONEY IS AN INTEGER IN MINOR UNITS, AND A FLOAT IS REFUSED RATHER THAN ROUNDED', () => {
  // Rounding is how a record ends up a penny out on a figure somebody is about to act on, and the
  // rounding is invisible at the moment it happens.
  assert.deepEqual(take(f('money'), { amount: 4800, currency: 'gbp' }), { amount: 4800, currency: 'GBP' });
  assert.deepEqual(take(f('money'), { amount: '4800', currency: 'GBP' }), { amount: 4800, currency: 'GBP' });
  const r = refuse(f('money'), { amount: 48.0_1, currency: 'GBP' });
  assert.equal(r.code, 'VALUE_MALFORMED');
  assert.match(r.fix, /48\.00 is 4800/);
});

test('a money value with no currency is refused, because two currencies do not add up', () => {
  assert.match(refuse(f('money'), { amount: 4800 }).fix, /three-letter code/);
  assert.match(refuse(f('money'), { amount: 4800, currency: 'POUNDS' }).fix, /three-letter code/);
});

test('the key is `amount`, and a value calling it `minor` is told so by name', () => {
  assert.match(refuse(f('money'), { minor: 4800, currency: 'GBP' }).fix, /called amount/);
});

test('an amount past 2^53 − 1 is refused, where a number stops being exactly itself', () => {
  assert.equal(refuse(f('money'), { amount: 2 ** 53, currency: 'GBP' }).code, 'INT_OUT_OF_RANGE');
  assert.equal(refuse(f('int'), 2 ** 53 + 2).code, 'INT_OUT_OF_RANGE');
});

/* ── days, which look right when they are wrong ──────────────────────────── */

test('AN IMPOSSIBLE DAY IS REFUSED, not normalised into a different one', () => {
  // `Date.UTC` rolls over, so 30 February would be stored as 2 March: a date that is not the one
  // that was sent, with nothing anywhere saying so.
  for (const bad of ['2026-02-30', '2026-13-01', '2026-04-31', '2025-02-29', '2026-00-10'])
    assert.match(refuse(f('day'), bad).fix, /not a day that exists/, `${bad} was accepted`);
  assert.equal(take(f('day'), '2028-02-29'), '2028-02-29', 'a leap day in a leap year is a day');
  assert.ok(isRealDay('2026-12-31') && !isRealDay('2026-02-30'));
});

test('a day is not an instant, and the refusal says which type was wanted', () => {
  assert.match(refuse(f('day'), '2026-09-05T00:00:00Z').fix, /YYYY-MM-DD/);
});

test('an instant keeps its moment and loses its offset', () => {
  assert.equal(take(f('instant'), '2026-09-05T12:00:00+02:00'), '2026-09-05T10:00:00.000Z');
  assert.equal(take(f('instant'), '2026-09-05T10:00:00Z'), '2026-09-05T10:00:00.000Z');
  assert.match(refuse(f('instant'), 'yesterday').fix, /names no timezone|not an instant/);
});

test('AND AN INSTANT WITH NO TIMEZONE IS REFUSED, rather than read as the host is set', () => {
  /* `2026-09-05T02:00:00` with no offset is read as LOCAL time by the ECMAScript grammar, and
     `instant()` then restamps it as UTC — so on a self-host at UTC+3 it was stored as
     `2026-09-04T23:00:00Z`: the PREVIOUS DAY for every reader that slices ten characters off it,
     every digest window and every `before today`. The same host in another timezone stored a
     different moment for the same string, which is the one thing a record that syncs cannot do. */
  for (const said of ['2026-09-05T02:00:00', '2026-09-05T02:00', 'Sep 5 2026 10:00', '2026-09-05 02:00:00'])
    assert.match(refuse(f('instant'), said).fix, /names no timezone/, said);

  /* And every spelling that DOES carry one still works, including a compact offset and a BARE DAY —
     which is not ambiguous: `Date.parse('2026-09-05')` is UTC midnight by the ECMAScript grammar, in
     every engine, and it is the form an extracted date arrives in. What is ambiguous is a date WITH
     a time and no offset. The hour-only offset ISO 8601 admits is refused by the ENGINE rather than
     by this check, with the sentence that says so, which is the honest answer: the record cannot
     read it. */
  assert.equal(take(f('instant'), '2026-09-05'), '2026-09-05T00:00:00.000Z');
  assert.equal(take(f('instant'), '2026-09-05T02:00:00+0300'), '2026-09-04T23:00:00.000Z');
  assert.match(refuse(f('instant'), '2026-09-05T02:00:00+03').fix, /not an instant/);
  assert.equal(take(f('instant'), '2026-09-05T02:00:00-05:00'), '2026-09-05T07:00:00.000Z');
  assert.equal(take(f('instant'), '2026-09-05T02:00:00z'), '2026-09-05T02:00:00.000Z');
});

/* ── the rest of the sixteen ─────────────────────────────────────────────── */

test('an integer takes a numeric string and refuses a fraction', () => {
  assert.equal(take(f('int'), '42'), 42);
  assert.equal(take(f('int'), 42), 42);
  assert.match(refuse(f('int'), 4.2).fix, /has a fraction/);
  assert.match(refuse(f('int'), 'forty-two').fix, /whole number/);
});

test('a decimal refuses more precision than a double can hold', () => {
  assert.equal(take(f('decimal'), '3.5'), 3.5);
  assert.match(refuse(f('decimal'), 1.234567890123456789).fix, /fifteen significant digits/);
  assert.match(refuse(f('decimal'), Number.POSITIVE_INFINITY).fix, /takes a number/);
});

test('a bool takes the two words and the two strings, and nothing else', () => {
  assert.equal(take(f('bool'), true), true);
  assert.equal(take(f('bool'), 'false'), false);
  assert.match(refuse(f('bool'), 'yes').fix, /true or false/);
  assert.match(refuse(f('bool'), 1).fix, /true or false/);
});

test('a url holds https and mailto, and says which scheme it refused', () => {
  assert.equal(take(f('url'), 'https://example.com/a'), 'https://example.com/a');
  assert.equal(take(f('url'), 'mailto:a@example.com'), 'mailto:a@example.com');
  assert.match(refuse(f('url'), 'javascript:alert(1)').fix, /javascript/);
  assert.match(refuse(f('url'), 'http://example.com').fix, /http;/);
});

test('an email is one address, and its domain is lower-cased', () => {
  assert.equal(take(f('email'), 'A.Person@Example.COM'), 'A.Person@example.com');
  for (const bad of ['a@b@c', 'no-at-sign', 'a b@c.com', '@c.com', 'a@'])
    assert.match(refuse(f('email'), bad).fix, /one address/, `${bad} was accepted`);
});

test('a quantity carries its unit, because a number without one is a number', () => {
  assert.deepEqual(take(f('quantity'), { value: 2.5, unit: 'days' }), { value: 2.5, unit: 'days' });
  assert.match(refuse(f('quantity'), { value: 2.5 }).fix, /names what the number counts/);
});

test('a file is its hash and its shape, and nothing about where it lives', () => {
  const file = { sha256: 'a'.repeat(64), mime: 'application/pdf', bytes: 1024, name: 'invoice.pdf' };
  assert.deepEqual(take(f('file'), file), file);
  assert.match(refuse(f('file'), { ...file, sha256: 'A'.repeat(64) }).fix, /lower-case hex/);
  assert.match(refuse(f('file'), { ...file, bytes: -1 }).fix, /whole number of bytes/);
});

/* ── the credential, which is the one with a rule of its own ─────────────── */

test('A SECRET HOLDS THE ID OF A GRANT AND NEVER A CREDENTIAL', () => {
  const id = `g_${'0123456789ABCDEFGHJKMNPQRS'}`;
  assert.equal(take(f('secret'), id, { grantExists: () => true }), id);
  assert.match(refuse(f('secret'), id, { grantExists: () => false }).fix, /does not exist/);
});

test('and its refusal carries no `found`, because the value might BE the credential', () => {
  // A refusal is logged. The one type where echoing the input back is how a secret leaves the record.
  const r = refuse(f('secret'), 'sk-live-9f2a-actual-api-key');
  assert.equal(r.code, 'VALUE_MALFORMED');
  assert.equal(r.allowed, undefined);
  assert.ok(!JSON.stringify(r).includes('sk-live'), 'the refusal repeated the value it refused');
});

/* ── refs and lists ──────────────────────────────────────────────────────── */

test('a ref takes a row id or a spoken one, and resolves the spoken one', () => {
  const rowId = 'Z'.repeat(26);
  assert.equal(take(f('ref', { to: 'people' }), rowId), rowId);
  assert.equal(take(f('ref', { to: 'people' }), 'people#41', { refId: () => rowId }), rowId);
  assert.match(refuse(f('ref', { to: 'people' }), 'people#41', { refId: () => null }).fix, /no such row/);
  assert.match(refuse(f('ref', { to: 'people' }), 'not an id').fix, /spoken id like people#41/);
  assert.deepEqual(parseSpoken('obligations#41'), { register: 'obligations', seq: 41 });
  assert.equal(parseSpoken('nope'), null);
  assert.equal(spoken('obligations', 41), 'obligations#41');
});

test('A REF INTO THE WRONG REGISTER IS REFUSED, and it used to resolve and store the row', () => {
  /* `field.to` was read in this case for one thing: building the sentence in the malformed branch.
     So `invoices#3` written into a field declared `to: contacts` resolved the INVOICES row and
     stored its id, and every read afterwards followed the reference into the wrong register and
     found a row that is a real row. Nothing malformed, nothing missing, nothing refused, and the
     answer wrong: which is why `30 §6` publishes a code for it, and why that code was emitted by
     nothing. */
  const rowId = 'Z'.repeat(26);
  const found = { refId: () => rowId };
  const said = refuse(f('ref', { to: 'people' }), 'invoices#3', found);
  assert.equal(said.code, 'REF_REGISTER_MISMATCH');
  assert.deepEqual(said.allowed, ['people'], 'the refusal does not say which register it takes');
  assert.match(said.fix, /points at people/u);

  /* `REF_UNKNOWN` IS THE OTHER ONE AND THE LINE BETWEEN THEM IS THE REPAIR. `30 §6` draws it in as
     many words: that one has nothing to point at, this one points at the wrong thing. Repoint this;
     write the missing row for that. */
  assert.match(refuse(f('ref', { to: 'people' }), 'people#41', { refId: () => null }).fix, /no such row/u);

  /* AND A `ref` WITH NO DECLARED TARGET TAKES ANY REGISTER, because that is what leaving `to:` off
     a declaration means. Inventing a refusal here would refuse a shape `declare` accepts. */
  assert.equal(take(f('ref', {}), 'invoices#3', found), rowId);
});

test('a list coerces every element, and a refusal names the one that failed', () => {
  assert.deepEqual(take(f('list', { of: 'int' }), ['1', 2, 3]), [1, 2, 3]);
  const r = refuse(f('list', { of: 'int' }), [1, 'two', 3]);
  assert.equal(r.at, 'x[1]', 'the refusal has to say WHICH element');
  assert.match(refuse(f('list', { of: 'int' }), 'not a list').fix, /takes a list/);
});

/* ── absent is one thing, not three ──────────────────────────────────────── */

test('null, the empty string and the empty list are all MISSING', () => {
  // Otherwise a field holding `""` and a field holding nothing are two states with one meaning, and
  // every reader has to know both.
  assert.ok(isAbsent(null) && isAbsent('') && isAbsent([]));
  assert.ok(!isAbsent(0), 'zero is a number somebody measured');
  assert.ok(!isAbsent(false), 'false is an answer');
  assert.ok(!isAbsent(' '), 'a space is a character somebody typed');
});
