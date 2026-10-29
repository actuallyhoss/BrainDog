import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accountShares, holdersOf, PAYEES_MOST, shareListsOf, type ShareLists } from './account-share.ts';
import { REGISTERS } from '../record/fixtures/sample.ts';
import type { RegisterDecl } from '../record/schema.ts';

const who = { kind: 'person' as const, id: 'p_2' };
const lists: ShareLists = {
  account: 'accounts',
  ledger: 'transactions',
  on: 'account',
  categories: { list: 'categories', hide: ['budget', 'carried'] },
  book: { list: 'books', field: 'book' },
  payees: { list: 'organisations', field: 'party' },
};

test("THE LISTS ARE READ OFF THE SEED'S DECLARATIONS: the ledger, its account, its categories with their amounts hidden, the book and the payees", () => {
  assert.deepEqual(shareListsOf(Object.values(REGISTERS) as RegisterDecl[]), lists);
});

test('THE SAME SHAPE UNDER OTHER NAMES IS READ THE SAME, and a payee list that declares no `org:` is not shared by row', () => {
  const renamed = (Object.values(REGISTERS) as RegisterDecl[]).map((d) => {
    const map: Record<string, string> = { accounts: 'purses', transactions: 'lines', categories: 'kinds', books: 'ledgers', organisations: 'firms' };
    const to = (id: string | undefined) => (id !== undefined && map[id] ? map[id] : id);
    const { org: _org, ...rest } = d as RegisterDecl & { org?: unknown };
    return { ...rest, id: to(d.id)!, fields: d.fields.map((f) => (f.to ? { ...f, to: to(f.to) } : f)) } as RegisterDecl;
  });
  const got = shareListsOf(renamed)!;
  assert.equal(got.account, 'purses');
  assert.equal(got.ledger, 'lines');
  assert.equal(got.categories?.list, 'kinds');
  assert.deepEqual(got.book, { list: 'ledgers', field: 'book' });
  assert.equal(got.payees, null);
});

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
  const bare = accountShares({ who, account: 'acc_1', can: 'view', book: null, payees: [], lists: { ...lists, categories: null, book: null, payees: null } });
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
  assert.deepEqual(holdersOf(kept, 'accounts', 'acc_1'), [{ who: 'Sam', edit: false, ids: ['s1', 's2'] }]);
});
