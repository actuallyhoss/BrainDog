/**
 * The poll form's proposal (`poll-form.ts`): one pack, one poll of the address, a map a number, bound to the
 * organisation, with a key only when one was named.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pollFault, pollIdOf, pollProposal, type PollDraft } from './poll-form.ts';

const DRAFT: PollDraft = {
  url: ' https://stats.northwind.example/v1/numbers.json ',
  every: '1h',
  grant: '',
  rows: [
    { path: 'data.mrr', name: 'Monthly recurring revenue', unit: 'GBP' },
    { path: 'data.users', name: 'Active users', unit: '' },
    { path: '', name: '', unit: '' },
  ],
};

test('THE FORM FILES ONE PACK WITH ONE POLL OF THE ADDRESS, a map a number, for the organisation, and no key when none is named', () => {
  assert.equal(pollFault(DRAFT), null);
  const p = pollProposal(DRAFT, { title: 'Northwind Labs Ltd', seq: 2 });
  assert.equal(p.body_kind, 'pack');
  assert.equal(p.body.install, 'poll-northwind-labs-ltd-stats-northwind-examp');
  const decls = (p.body.doc as { declarations: Record<string, unknown>[] }).declarations;
  assert.equal(decls.length, 1);
  assert.equal('grant' in decls[0]!, false);
  assert.equal(decls[0]!.url, 'https://stats.northwind.example/v1/numbers.json');
  const maps = decls[0]!.map as Record<string, { value?: unknown; path?: unknown }>[];
  assert.deepEqual(maps.map((m) => [m.name?.value, m.value?.path, m.organisation?.value, m.unit?.value]), [
    ['Monthly recurring revenue', 'data.mrr', 'organisations#2', 'GBP'],
    ['Active users', 'data.users', 'organisations#2', undefined],
  ]);
  assert.match(p.question, /^Poll stats\.northwind\.example every hour for Northwind Labs Ltd’s numbers: Monthly recurring revenue, Active users\?$/u);

  const keyed = pollProposal({ ...DRAFT, grant: ' northwind stats ' }, { title: 'Northwind', seq: 1 });
  assert.equal((keyed.body.doc as { declarations: Record<string, unknown>[] }).declarations[0]!.grant, 'northwind stats');
});

test('WHAT CANNOT BE FILED IS SAID BY THE FIELD IT IS ABOUT', () => {
  assert.equal(pollFault({ ...DRAFT, url: 'http://stats.example/x' })?.at, 'url');
  assert.equal(pollFault({ ...DRAFT, url: 'stats.example' })?.at, 'url');
  assert.equal(pollFault({ ...DRAFT, rows: [] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, rows: [{ path: 'data..mrr', name: 'x', unit: '' }] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, rows: [{ path: 'data.mrr', name: ' ', unit: '' }] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, grant: 'x'.repeat(41) })?.at, 'grant');
  assert.equal(pollFault({ ...DRAFT, rows: [{ path: 'plans[0].count', name: 'Plans', unit: '' }] }), null);
  assert.equal(pollIdOf('', 'nonsense'), 'numbers');
});
