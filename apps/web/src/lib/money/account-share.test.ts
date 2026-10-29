import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accountShares, holdersOf, PAYEES_MOST } from './account-share.ts';

const who = { kind: 'person' as const, id: 'p_2' };
const lists = new Set(['accounts', 'transactions', 'categories', 'books', 'organisations']);

test('AN ACCOUNT IS SHARED WITH ITS LINES AND THE NAMES THEY NEED, the account first and never deletable', () => {
  const shares = accountShares({ who, account: 'acc_1', can: 'edit', book: 'bk_1', payees: ['org_1', 'org_1', ''], lists });
  assert.deepEqual(
    shares.map((s) => [s.what, s.can]),
    [
      [{ list: 'accounts', rows: ['acc_1'] }, 'edit'],
      [{ list: 'transactions', where: { field: 'account', is: 'acc_1' } }, 'edit'],
      [{ lists: ['categories'] }, 'view'],
      [{ list: 'books', rows: ['bk_1'] }, 'view'],
      [{ list: 'organisations', rows: ['org_1'] }, 'view'],
    ],
  );
  assert.deepEqual(shares[0]!.caps, { delete: false });
  assert.deepEqual(shares[2]!.hide, { categories: ['budget', 'carried'] }, 'a budget is not shown');
});

test('NO BOOK, NO PAYEES AND A LIST THE RECORD LACKS share nothing for them; payees are capped', () => {
  const bare = accountShares({ who, account: 'acc_1', can: 'view', book: null, payees: [], lists: new Set(['accounts', 'transactions']) });
  assert.equal(bare.length, 2);
  assert.equal(bare[0]!.caps, undefined);
  const many = accountShares({ who, account: 'acc_1', can: 'view', book: null, payees: Array.from({ length: 300 }, (_, i) => `org_${i}`), lists });
  assert.equal((many.at(-1)!.what as { rows: string[] }).rows.length, PAYEES_MOST);
});

test('WHO HOLDS AN ACCOUNT is each live bundle whose head is that one account, with every share to stop', () => {
  const kept = [
    { id: 's1', effect: 'allow', who, who_name: 'Sam', what: { list: 'accounts', rows: ['acc_1'] }, can: 'view', bundle: 'b1', ended_at: null },
    { id: 's2', effect: 'allow', who, who_name: 'Sam', what: { list: 'transactions', where: { field: 'account', is: 'acc_1' } }, can: 'view', bundle: 'b1', ended_at: null },
    { id: 's3', effect: 'allow', who, who_name: 'Sam', what: { list: 'accounts', rows: ['acc_2'] }, can: 'edit', bundle: 'b2', ended_at: null },
    { id: 's4', effect: 'allow', who, who_name: 'Lee', what: { list: 'accounts', rows: ['acc_1'] }, can: 'edit', bundle: null, ended_at: '2026-10-01T00:00:00Z' },
  ];
  assert.deepEqual(holdersOf(kept, 'acc_1'), [{ who: 'Sam', edit: false, ids: ['s1', 's2'] }]);
});
