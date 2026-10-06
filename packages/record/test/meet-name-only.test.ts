/**
 * `meet` answers in a name, never an address (research-audit-21 item 11): a person kept with only an address as their
 * name comes back as the part before its `@`, as the kernel names one it met by an address alone, and a name with an
 * address beside it comes back as the name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Meeting } from '../src/index.ts';
import { nameOnly, spokenName } from '../src/scrub.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('A PERSON KEPT BY AN ADDRESS IS ANSWERED BY NAME, NEVER THE ADDRESS', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 7, 12)) });
  value(await api.kernel.install([THINGS, PEOPLE]));
  value<Entry>(api.kernel.create('people', { name: 'rohan.mehta@encore.example', email: 'rohan.mehta@encore.example' }, { actor: 'p_1' }));
  const met = value<Meeting>(await api.meet({ email: 'rohan.mehta@encore.example', source: 'note from Sam' }, owner));
  assert.equal(met.row?.name, 'rohan.mehta');
  assert.doesNotMatch(JSON.stringify(met), /@/u);
  sql.close();
});

test('nameOnly KEEPS THE NAME BESIDE AN ADDRESS, AND NAMES NOBODY FOR AN ADDRESS ALONE', () => {
  assert.equal(nameOnly('Jo Park <jo@kiln.example>'), 'Jo Park');
  assert.equal(nameOnly('Jo Park (jo@kiln.example)'), 'Jo Park');
  assert.equal(nameOnly('jo@kiln.example'), null);
  assert.equal(nameOnly('Ada Vine'), 'Ada Vine');
  assert.equal(spokenName('jo@kiln.example'), 'jo');
  assert.equal(spokenName('Jo Park <jo@kiln.example>'), 'Jo Park');
});
