/**
 * What a run reported about itself is its agent's to write, and a person's patch naming it is refused.
 *
 * `RUN_FACTS` (`session.ts`) names the plumbing an agent reports: the folder a run worked in, its commit, its machine.
 * The write path refuses a person naming one, `IMMUTABLE_FIELD` at the field, and lets a token's write through, so the
 * ladder still finds the run by what its agent said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RUN_FACTS, openRecord, type Entry, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const person: WriteContext = { actor: 'p_owner', principal: { kind: 'person' } };
const token: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { spoken: 'S1' } };

test("A PERSON'S PATCH NAMING A RUN FACT is IMMUTABLE_FIELD at the field, and the same patch from its agent is written", async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* ITS AGENT IS A KEY OF THE PERSON WHO MADE THE RUN: nobody else's key works as it (`othersRun`). */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_1', 'p_owner', 'h1', 'write', 'One', '2026-09-01T00:00:00.000Z')");
  const run = value<Entry>(k.create('session', { doing: 'Tidy the folder' }, { actor: 'p_owner' }));
  assert.ok(RUN_FACTS.includes('cwd'));

  const refused = k.update('session', run.id, { cwd: '/x' }, person) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(refused.ok, false, 'a person wrote a run fact');
  assert.equal(refused.refusal?.code, 'IMMUTABLE_FIELD');
  assert.equal(refused.refusal?.at, 'cwd');
  assert.match(refused.refusal!.fix, /only its agent sets it\.$/u);

  const written = value<Entry>(k.update('session', run.id, { cwd: '/x' }, token));
  assert.equal(written.fields.cwd, '/x');

  /* A person's own field on the run stays theirs. */
  value(k.update('session', run.id, { next: 'Read the queue' }, person));
  sql.close();
});
