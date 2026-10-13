/**
 * A bill's add and edit form offers the account it is paid from (REC-A09 step 1, audit 73 finding 4).
 *
 * `bill-takes-book` reads `account` on Bills and invoices, and a rule that reads a field nobody can fill never runs.
 * The form draws every field its list declares, in the order declared, leaving out a secret and the two a list keeps
 * for its own mark and colour (`readableFields`, `apps/web/src/lib/record/api.ts`), and the form that edits is the
 * form that adds. So the list is where the offer is made, and these hold it there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_CEILING } from '../../kernel/src/observe.ts';

import { OBLIGATIONS_REGISTER } from '../src/modules/money/lists/obligations.ts';
import { CHASING } from '../src/modules/money/pages/parts/chasing.ts';

type Field = { id: string; type: string; to?: string; label?: string; required?: boolean; index?: boolean };
type Identity = { mark?: string; accent?: string };

const declared = OBLIGATIONS_REGISTER.fields as readonly Field[];
/** What the form draws, by the form's own rule. */
const offered = (() => {
  const identity = (OBLIGATIONS_REGISTER as { identity?: Identity }).identity;
  const kept = new Set([identity?.mark, identity?.accent].filter(Boolean));
  return declared.filter((f) => f.type !== 'secret' && !kept.has(f.id));
})();
const at = (id: string) => offered.findIndex((f) => f.id === id);

test('a bill being added or edited is offered its account, picked from Accounts', () => {
  const account = offered.find((f) => f.id === 'account');
  assert.ok(account, 'Bills and invoices offers no account');
  assert.equal(account.type, 'ref');
  assert.equal(account.to, 'accounts');
});

test('the account is never asked for: a bill nobody has put on an account still saves', () => {
  assert.notEqual(offered.find((f) => f.id === 'account')?.required, true);
});

test('the account sits beside the book it decides, above the note and above what the record writes itself', () => {
  assert.equal(at('account'), at('book') + 1);
  for (const later of ['note', 'settled', 'paid_so_far', 'chased', 'chase_draft']) {
    assert.ok(at(later) > at('account'), `${later} comes before the account`);
  }
});

test('offering it took no new index: the list holds its ceiling and the account is one of them', () => {
  const indexed = declared.filter((f) => f.index === true).map((f) => f.id);
  assert.equal(indexed.length, INDEX_CEILING);
  assert.ok(indexed.includes('account'));
});

test('an invoice opened from Being chased is a row of the list that holds the account', () => {
  assert.equal(CHASING.length, 1);
  assert.equal(CHASING[0]!.source, `register.${OBLIGATIONS_REGISTER.id}`);
});
