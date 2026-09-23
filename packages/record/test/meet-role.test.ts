/**
 * `meet` through the record into a list that declares `meets:`, which is the kernel half of the roles brief proven end
 * to end for the callers the record already lets through.
 *
 * MEASURED BEFORE THE KERNEL HALF: the same calls were `DECLARATION_INVALID ... declares meets, and there is no such key`
 * at install, and without the key `meet` into `contacts` was `REGISTER_UNKNOWN`, and into a `people` list without
 * `projects` was `FIELD_UNKNOWN at projects`.
 *
 * THE RECORD'S OWN GUARD STILL NAMES `people`, and the last test holds that as the hole it is. `meet`'s guard in
 * `packages/record/src/index.ts` asks `propose` on the list called `people`, not on the list declaring `meets:`, and that
 * file is held by other work in this wave (`loop/research-shell-next.md` M5). So a token limited to `contacts` is
 * refused at `people`, a list the record may not even have. The follow-up that reads `kernel.meetsList()` there turns
 * that test round.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, Met } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

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

/** A list of people by another id and other field names, with no `projects`, as a record without Projects has it. */
const CONTACTS = {
  id: 'register.contacts',
  kind: 'register' as const,
  body: {
    id: 'contacts',
    name: 'Contacts',
    title: 'full_name',
    meets: { name: 'full_name', email: 'mail', handles: 'accounts', met: 'seen', merged_into: 'folded_into' },
    fields: [
      { id: 'full_name', type: 'text', required: true },
      { id: 'mail', type: 'email', unique: true, index: true },
      { id: 'accounts', type: 'list', of: 'text' },
      { id: 'seen', type: 'list', of: 'text' },
      { id: 'folded_into', type: 'ref', to: 'contacts' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const agent = (registers?: readonly string[]): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { host: 'dev-pc', repo: 'braindog', agent: 'claude', client_id: 'c-1' },
  ...(registers === undefined ? {} : { registers }),
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([THINGS, CONTACTS]));
  value<Entry>(await api.create({ register: 'things', fields: { name: 'BrainDog', repos: ['braindog'] } }, owner));
  return { api, sql };
}

test('THE OWNER MEETS SOMEBODY INTO contacts, the list that declares meets:, under its own field names', async () => {
  const { api, sql } = await record();
  const met = value<Met>(await api.meet({ name: 'Ada Lovelace', email: 'Ada@Example.com', handle: 'github:ada', where: 'a call about the site' }, owner));
  assert.deepEqual(met, { person: 'contacts#1', created: true, linked: false, merge: null });

  const rows = sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'contacts'");
  assert.deepEqual(
    rows.map((r) => JSON.parse(r.fields)),
    [{ full_name: 'Ada Lovelace', mail: 'ada@example.com', accounts: ['github:ada'], seen: ['2026-09-15 · a call about the site'] }],
  );
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'people'").length, 0);
  sql.close();
});

test('A RUN IN A PROJECT IS RECORDED AND LINKED TO NOTHING, because the list has no projects part', async () => {
  const { api, sql } = await record();
  const met = value<Met>(await api.meet({ name: 'Grace Hopper', email: 'grace@example.com', where: 'commit 1da177e in braindog' }, agent()));
  assert.deepEqual(met, { person: 'contacts#1', created: true, linked: false, merge: null });
  sql.close();
});

/*
 * THE GUARD ASKS ABOUT THE LIST THE KERNEL WRITES. It asked `propose` on `people` whatever list declared `meets:`, so a
 * token held to `contacts` was refused at a list the record does not have, and the checker of the roles brief measured
 * the other direction: a token held to `people` got `ok` and `contacts#1`, a row in a list outside its grant.
 */
test('A TOKEN THAT MAY PROPOSE ON contacts ALONE MEETS INTO contacts, the list declaring meets:', async () => {
  const { api, sql } = await record();
  const met = value<Met>(await api.meet({ name: 'Ada', where: 'commit 4464966 in braindog' }, agent(['contacts'])));
  assert.equal(met.person, 'contacts#1');
  sql.close();
});

test('A TOKEN HELD TO people IS REFUSED, and writes nothing into contacts, a list outside its grant', async () => {
  const { api, sql } = await record();
  const out = (await api.meet({ name: 'Ada', where: 'commit 4464966 in braindog' }, agent(['people']))) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false, 'a token scoped to people wrote into contacts');
  assert.equal(out.refusal?.code, 'FORBIDDEN');
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'contacts'").length, 0);
  sql.close();
});
