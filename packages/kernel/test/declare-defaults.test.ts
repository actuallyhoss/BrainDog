/**
 * A DEFAULT IS CHECKED WHERE IT IS WRITTEN.
 *
 * `index.ts` runs every `f.default` through `coerce` when a row is created, so a declaration that
 * defaults a `money` field to a bare number refuses every create that leaves the field out. That is
 * the net, and it catches the value at the wrong moment: the person who has to fix it is the author
 * of the declaration, and they are not in the room when somebody else adds the first row.
 *
 * So the same question is asked at install, on the same `coerce`, and the refusal names the field
 * and says what is wrong with its default.
 *
 * Two things install cannot answer and does not pretend to: whether a `ref` default points at a row
 * that exists, and whether a `secret` default names a grant. The first is the create path's, and the
 * second is refused outright by the rule that says only the keychain door writes a secret.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration, type Declaration } from '../src/index.ts';

const register = (id: string, fields: unknown[], extra: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: (fields[0] as { id: string }).id, fields, ...extra } as never,
});

/** One field under test, on a register whose title is a plain text. */
const probe = (...fields: Record<string, unknown>[]): Declaration =>
  register('probe', [{ id: 'what', type: 'text' }, ...fields]);

/** A refusal's code and where it points, which is what a caller branches on and fixes. */
const linted = (decl: Declaration): string | null => {
  const x = validateDeclaration(decl);
  return x ? `${x.code} at ${String(x.at)}` : null;
};

const fix = (decl: Declaration): string => {
  const x = validateDeclaration(decl);
  assert.ok(x, 'the declaration installed');
  return x.fix;
};

const GRANT = 'g_01J8ZQ6N3R4V5W6X7Y8Z9A0B1C';
const ULID = '01J8ZQ6N3R4V5W6X7Y8Z9A0B1C';

test('A DEFAULT THE RECORD CANNOT STORE IS REFUSED AT INSTALL, and the sentence names the field', () => {
  /* The three the finding names, and the shape behind them: every type's own rule, asked of the one
     value the declaration supplies. */
  assert.equal(linted(probe({ id: 'fee', type: 'money', default: 4800 })), 'VALUE_MALFORMED at fee');
  assert.equal(linted(probe({ id: 'fee', type: 'money', default: { amount: 48.5, currency: 'GBP' } })), 'VALUE_MALFORMED at fee');
  assert.equal(linted(probe({ id: 'fee', type: 'money', default: { amount: 4800, currency: 'GPB' } })), 'CURRENCY_UNKNOWN at fee');
  assert.equal(linted(probe({ id: 'sizes', type: 'list', of: 'int', default: ['a', 'b'] })), 'VALUE_MALFORMED at sizes');

  /* And the rest of the types, because a default reaches all of them the same way. */
  assert.equal(linted(probe({ id: 'n', type: 'int', default: 'twelve' })), 'VALUE_MALFORMED at n');
  assert.equal(linted(probe({ id: 'n', type: 'int', default: 1.5 })), 'VALUE_MALFORMED at n');
  assert.equal(linted(probe({ id: 'flag', type: 'bool', default: 'yes' })), 'VALUE_MALFORMED at flag');
  assert.equal(linted(probe({ id: 'when', type: 'day', default: '2026-02-30' })), 'VALUE_MALFORMED at when');
  assert.equal(linted(probe({ id: 'at', type: 'instant', default: '2026-09-05T02:00:00' })), 'VALUE_MALFORMED at at');
  assert.equal(linted(probe({ id: 'site', type: 'url', default: 'javascript:alert(1)' })), 'VALUE_MALFORMED at site');
  assert.equal(linted(probe({ id: 'who', type: 'email', default: 'not an address' })), 'VALUE_MALFORMED at who');
  assert.equal(linted(probe({ id: 'size', type: 'quantity', default: { value: 3 } })), 'VALUE_MALFORMED at size');
  assert.equal(linted(probe({ id: 'doc', type: 'file', default: { mime: 'text/plain' } })), 'VALUE_MALFORMED at doc');
  assert.equal(linted(probe({ id: 'note', type: 'text', default: 12 })), 'VALUE_MALFORMED at note');
  assert.equal(linted(probe({ id: 'note', type: 'text', default: '"quoted"' })), 'TEXT_JSON_QUOTED at note');

  /* The sentence a person reads. It names the field, says a default is what is wrong, and then says
     what the record wanted. */
  const said = fix(probe({ id: 'fee', type: 'money', default: 4800 }));
  assert.match(said, /probe\.fee/, 'the field is named');
  assert.match(said, /default/, 'the default is named as the thing to fix');
  assert.match(said, /amount, currency/, "and coerce's own sentence is carried through");
});

test('AND A GOOD DEFAULT STILL INSTALLS, including every absence K2 calls one state', () => {
  assert.equal(linted(probe({ id: 'fee', type: 'money', default: { amount: 4800, currency: 'GBP' } })), null);
  /* `gbp` IS A REAL CURRENCY IN THE WRONG CASE, which `coerce` upper-cases rather than refusing. */
  assert.equal(linted(probe({ id: 'fee', type: 'money', default: { amount: 4800, currency: 'gbp' } })), null);
  assert.equal(linted(probe({ id: 'n', type: 'int', default: 12 })), null);
  assert.equal(linted(probe({ id: 'n', type: 'int', default: '12' })), null);
  assert.equal(linted(probe({ id: 'sizes', type: 'list', of: 'int', default: [1, 2] })), null);
  assert.equal(linted(probe({ id: 'flag', type: 'bool', default: false })), null);
  assert.equal(linted(probe({ id: 'when', type: 'day', default: '2026-09-05' })), null);
  assert.equal(linted(probe({ id: 'site', type: 'url', default: 'https://example.com/' })), null);
  assert.equal(linted(probe({ id: 'blob', type: 'json', default: { anything: true } })), null);
  assert.equal(linted(probe({ id: 'note', type: 'text' })), null, 'no default at all');

  /* K2: JSON null, the empty string and the empty list are one state, absent. A default that is
     absent is not a bad default; it is no default, and install says nothing about it. */
  assert.equal(linted(probe({ id: 'n', type: 'int', default: null })), null);
  assert.equal(linted(probe({ id: 'note', type: 'text', default: '' })), null);
  assert.equal(linted(probe({ id: 'sizes', type: 'list', of: 'int', default: [] })), null);
});

test('A REF DEFAULT IS CHECKED FOR SHAPE AND REGISTER, and never for a row install cannot see', () => {
  const to = (extra: Record<string, unknown>) =>
    register('probe', [{ id: 'what', type: 'text' }, { id: 'owner', type: 'ref', to: 'people', ...extra }]);

  /* A spoken id for the register the field points at is a declaration nobody can fault at install:
     the row may be written tomorrow, and refusing it here would refuse a legal declaration. */
  assert.equal(linted(to({ default: 'people#41' })), null);
  assert.equal(linted(to({ default: ULID })), null);
  assert.equal(linted(to({ default: 41 })), 'VALUE_MALFORMED at owner', 'a ref takes a row id or a spoken id');
  assert.equal(linted(to({ default: 'invoices#3' })), 'REF_REGISTER_MISMATCH at owner', 'the declared register is known here');
});

test('AND A SECRET DEFAULT IS STILL THE KEYCHAIN DOOR RULE, not a coercion', () => {
  assert.equal(linted(probe({ id: 'value', type: 'secret', default: GRANT })), 'DECLARATION_INVALID at value');
  assert.equal(linted(probe({ id: 'value', type: 'secret', default: 'not-a-grant' })), 'DECLARATION_INVALID at value');
});

test('AN ENUM DEFAULT IS ONE OF THE DECLARED VALUES, and coerce cannot ask that', () => {
  const state = (extra: Record<string, unknown>) =>
    probe({ id: 'state', type: 'enum', values: ['active', 'done'], ...extra });

  assert.equal(linted(state({ default: 'active' })), null);
  assert.equal(linted(state({})), null);
  assert.equal(linted(state({ default: 'archived' })), 'ENUM_VALUE_UNKNOWN at state');
  assert.equal(linted(probe({ id: 'tags', type: 'list', of: 'enum', values: ['a', 'b'], default: ['a', 'z'] })), 'ENUM_VALUE_UNKNOWN at tags');
});

test('A DERIVED FIELD WITH A DEFAULT IS TWO INSTRUCTIONS AND ONE OF THEM DOES NOTHING', () => {
  /* The record computes a derived field and refuses every write to it, so the default is read by
     nobody. The author wrote it meaning something; install says which half to delete. */
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true })), null);
  assert.equal(linted(probe({ id: 'n', type: 'int', default: 1 })), null);
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true, default: 1 })), 'DECLARATION_INVALID at n');

  const said = fix(probe({ id: 'n', type: 'int', derived: true, default: 1 }));
  assert.match(said, /probe\.n/, 'the field is named');
  assert.match(said, /derived/);

  /* AND THE DEFAULT IS NOT COERCED FIRST. A derived field with a bad default has one fault worth
     saying, and it is not the value. */
  assert.equal(linted(probe({ id: 'fee', type: 'money', derived: true, default: 4800 })), 'DECLARATION_INVALID at fee');

  /* K2 AGAIN: a derived field defaulted to an absence declared nothing, so there is nothing to
     refuse. */
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true, default: null })), null);
  assert.equal(linted(probe({ id: 'note', type: 'text', derived: true, default: '' })), null);
});

test('AND A DERIVED FIELD THAT IS ALSO REQUIRED IS THE SAME TWO INSTRUCTIONS', () => {
  /* The requirement is dead rather than fatal, which is why it outlived the default beside it:
     `index.ts`'s required sweep opens with `if (f.retired || f.derived) continue;`, so the key is
     skipped, every create succeeds, and nothing ever tells the author the rule they wrote is not
     a rule the record keeps. */
  assert.equal(linted(probe({ id: 'n', type: 'int', required: true })), null);
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true, required: true })), 'DECLARATION_INVALID at n');

  const said = fix(probe({ id: 'n', type: 'int', derived: true, required: true }));
  assert.match(said, /probe\.n/, 'the field is named');
  assert.match(said, /Drop the requirement, or drop derived/, 'and which half to delete');

  /* CONDITIONALLY DEAD IS STILL DEAD. The same sweep skips `required_when` for the same reason,
     so a derived field made required by another field's value is refused on the same grounds. */
  const when = { field: 'what', is: 'yes' };
  assert.equal(linted(probe({ id: 'n', type: 'int', required_when: when })), null, 'the condition is well formed');
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true, required_when: when })), 'DECLARATION_INVALID at n');
  assert.match(fix(probe({ id: 'n', type: 'int', derived: true, required_when: when })), /required_when/, 'the key written is the key named');

  /* AND `required: false` DECLARES NOTHING, so there is nothing beside derived to refuse. This is
     the same reading as K2 above: a key that says what the record already does is not a second
     instruction. */
  assert.equal(linted(probe({ id: 'n', type: 'int', derived: true, required: false })), null);
});
