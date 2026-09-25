/**
 * An enum's values are checked for key shapes, in every version of a declaration (`loop/research-audit-2026-09-25-import.md` S1).
 *
 * A closed list grows at run time, and the import proposed a person's role and a service's kind from the old tool as new
 * values. The audit measured `register.people v2` holding a GitHub token as a role, resolved by rule on the owner's key.
 * A declaration is versioned history, so a value that lands there stays after any fix. The importer now leaves such a
 * word out, and this is the kernel's half: no door can put one in a declaration at all.
 *
 * EVERY VALUE IS MADE UP, AND THE KEY IS NOT ONE.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const KEYISH = ['gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('');
const OWNER = { actor: 'p_1' };

const people = (roles: string[], of: 'enum' | 'list' = 'enum'): Declaration => ({
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      of === 'enum' ? { id: 'role', type: 'enum', values: roles } : { id: 'role', type: 'list', of: 'enum', values: roles },
    ],
  } as never,
});

test('A REGISTER WHOSE ENUM LISTS A KEY-SHAPED VALUE IS REFUSED, and the refusal never repeats the value', () => {
  for (const decl of [people(['client', 'collaborator', KEYISH]), people(['client', KEYISH], 'list')]) {
    const out = validateDeclaration(decl);
    assert.equal(out?.code, 'DECLARATION_INVALID', JSON.stringify(out));
    assert.equal(out?.at, 'role');
    assert.match(out?.fix ?? '', /looks like a key/u);
    assert.equal(JSON.stringify(out).includes(KEYISH), false, 'the refusal repeats the key-shaped value');
  }
  /* The same list with ordinary words, a slug and a hex id among them, is a declaration like any other. */
  assert.equal(validateDeclaration(people(['client', 'investor', 'co-founder', 'vendor_2026', 'e3b0c44298fc1c149afbf4c8996fb924'])), null);
});

test('ON A RECORD, NEITHER A FIRST INSTALL NOR A LATER VERSION CAN ADD ONE', async () => {
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 8, 25, 12)));
  const first = await k.install([people(['client', KEYISH])]);
  assert.equal(first.ok, false, 'a key-shaped value installed');

  const ok = await k.install([people(['client', 'collaborator'])]);
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.ok(k.create('people', { name: 'Nadia Ferris', role: 'client' }, OWNER).ok);

  /* THE AUDIT'S PATH: version two of the same list with the word added. */
  const grown = await k.install([people(['client', 'collaborator', KEYISH])]);
  assert.equal(grown.ok, false, 'a later version added a key-shaped value');
  assert.equal(JSON.stringify(grown).includes(KEYISH), false, 'the refusal repeats the key-shaped value');
  assert.equal(JSON.stringify(k.register('people')).includes(KEYISH), false, 'the declaration holds the key-shaped value');
});
