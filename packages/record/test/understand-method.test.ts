/**
 * The walk over what the record already holds, asked for by hand (DIRECTION §38): `understand({ dry: true })` says what the
 * next slice would do, in names, and keeps nothing; `understand({})` does it, files what it would not do on its own, and
 * hands back what `understand({ undo })` takes back. An owner in a browser, and never a token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Understanding } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const agent: CallContext = { principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' }, credentialed: true };

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });

const PROJECTS = register({
  id: 'things',
  name: 'Projects',
  title: 'name',
  scopes: { repos: 'repos' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
    { id: 'domains', type: 'list', of: 'text' },
  ],
});

const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
  ],
});

const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'party', type: 'ref', to: 'organisations' },
    { id: 'counterparty_text', type: 'text' },
    { id: 'note', type: 'text' },
  ],
});

const SERVICES = register({
  id: 'services',
  name: 'Services',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'points_at', type: 'text' },
    { id: 'thing', type: 'ref', to: 'things' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record whose two old payments name a company it already knows, and whose one service two projects could hold. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([PROJECTS, ORGS, LEDGER, SERVICES]));
  const k = api.kernel;
  value<Entry>(k.create('things', { name: 'Tallow', domains: ['tallow.example'] }, OWNER));
  value<Entry>(k.create('things', { name: 'Tallow Site', domains: ['tallow.example'] }, OWNER));
  const lowry = value<Entry>(k.create('organisations', { name: 'Lowry St Studios' }, OWNER));
  for (const what of ['LOWRY ST STUDIOS RENT AUG', 'LOWRY ST STUDIOS RENT SEP']) value(k.create('transactions', { what, amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  value<Entry>(k.create('services', { name: 'Sending domain', points_at: 'mail.tallow.example' }, OWNER));
  return { api, sql, lowry };
}

const parties = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ p: string | null }>("SELECT json_extract(fields, '$.party') AS p FROM entry WHERE register = 'transactions' ORDER BY rowid").map((r) => r.p);
const open = (sql: ReturnType<typeof openSqlite>) => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")?.n ?? 0;

test('DRY SAYS WHAT THE NEXT SLICE WOULD DO, IN NAMES, and keeps nothing of it', async () => {
  const { api, sql } = await record();
  const seen = value<Understanding>(await api.understand({ dry: true }, owner));
  assert.equal(seen.dry, true);
  assert.deepEqual(
    seen.kinds.find((k) => k.kind === 'payments'),
    { kind: 'payments', looked: 2, linked: 2, refused: 0, organisations: 0 },
  );
  assert.deepEqual(seen.writes, ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Link LOWRY ST STUDIOS RENT SEP to Lowry St Studios']);
  assert.deepEqual(seen.questions, ['Which project is Sending domain for: Tallow or Tallow Site?']);
  assert.equal(seen.asks['service-project'], 1);
  assert.equal(seen.undo, undefined);
  /* NOTHING WRITTEN, NOTHING FILED, AND THE NIGHT STARTS WHERE IT WOULD HAVE. */
  assert.deepEqual(parties(sql), [null, null]);
  assert.equal(open(sql), 0);
  assert.equal(api.kernel.prefsOf('slash')['understand.next'], undefined);
  /* NO ID IN WHAT A PERSON READS. */
  assert.doesNotMatch(JSON.stringify(seen), /[0-9A-HJKMNP-TV-Z]{26}|#\d/u);
  sql.close();
});

test('NOT DRY DOES THE SLICE, FILES WHAT IT WOULD NOT DO, and undo puts it back', async () => {
  const { api, sql, lowry } = await record();
  const done = value<Understanding>(await api.understand({}, owner));
  assert.equal(done.dry, false);
  assert.deepEqual(done.writes, ['Linked LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Linked LOWRY ST STUDIOS RENT SEP to Lowry St Studios']);
  assert.deepEqual(parties(sql), [lowry.id, lowry.id]);
  assert.deepEqual(done.filed?.map((f) => f.question), ['Which project is Sending domain for: Tallow or Tallow Site?']);
  assert.equal(done.undo?.length, 1);
  /* A SECOND LOOK FINDS THE FIRST ONE'S WORK, and writes nothing. */
  assert.deepEqual(value<Understanding>(await api.understand({ dry: true }, owner)).writes, []);
  const back = value<{ undone: number; said: string }>(await api.understand({ undo: done.undo }, owner));
  /* THE TWO LINKS, AND THE KEY THE COMPANY WAS GIVEN TO KNOW THE PAYEE BY, which no line names. */
  assert.ok(back.undone >= 2);
  assert.equal(back.said, `Put back ${back.undone} changes.`);
  assert.deepEqual(parties(sql), [null, null]);
  sql.close();
});

test('AN AGENT CANNOT START IT, LOOK AT IT OR UNDO IT', async () => {
  const { api, sql } = await record();
  for (const args of [{ dry: true }, {}, { undo: 'x' }]) {
    const out = (await api.understand(args, agent)) as { ok: boolean; refusal?: { code: string } };
    assert.equal(out.ok, false);
    assert.equal(out.refusal?.code, 'NEEDS_BROWSER_SESSION');
  }
  const bad = (await api.understand({ dry: 'yes' }, owner)) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(bad.refusal?.at, 'dry');
  sql.close();
});
