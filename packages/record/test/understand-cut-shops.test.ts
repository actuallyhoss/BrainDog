/**
 * Shops already met by a name a card text cut short, as one question in Needs you: the
 * nightly walk files it once, nothing is folded or retired before he answers, and his yes folds the one a whole name
 * begins with into that shop and retires the rest, deleting nothing.
 *
 * THE SHOP NAMES ARE INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 25, 2);
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });
const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into', retired: 'retired_on' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
    { id: 'retired_on', type: 'day' },
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

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const open = (sql: NodeSql) =>
  sql.all<{ id: string; body_kind: string; body: string; q: string }>(
    "SELECT s.id AS id, s.body_kind AS body_kind, s.body AS body, e.to_v AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' WHERE s.status = 'open' ORDER BY s.rowid",
  );

test('the cut shops are one question, nothing changes before his yes, and his yes folds one and retires the other', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([ORGS, LEDGER]));
  const k = api.kernel;
  const shop = (name: string, keys: string[]) => value<Entry>(k.create('organisations', { name, keys }, { actor: 'rule:backfill' })).id;
  const line = (what: string, party: string, more: Record<string, unknown> = {}) => value(k.create('transactions', { what, party, amount: { amount: -900, currency: 'EGP' }, ...more }, OWNER));
  const whole = shop('Harrow Market', ['bank:harrowmarket']);
  const marke = shop('Marke', ['bank:harrow2marke']);
  const bake = shop('Quillmoor Bake', ['bank:quillmoorbake']);
  line('Harrow Market', whole, { note: 'Payee: Harrow Market.' });
  line('FAWRY*HARROW2 MARKE', marke);
  line('FAWRY*QUILLMOOR BAKE', bake);

  await api.understand({}, owner);
  const question = "2 shops are names a card text cut short: Marke and Quillmoor Bake. Fold Marke into Harrow Market, and retire Quillmoor Bake? Their payments keep the bank's words, and nothing is deleted.";
  const asked = open(sql).filter((q) => q.q.replace(/^"|"$/gu, '') === question);
  assert.equal(asked.length, 1, open(sql).map((q) => q.q).join(' / '));
  assert.equal(asked[0]!.body_kind, 'rowset');
  assert.deepEqual([k.get(marke)?.fields.merged_into, k.get(bake)?.fields.retired_on], [undefined, undefined], 'asking changed nothing');

  /* A SECOND NIGHT FILES IT NO MORE. */
  await api.understand({}, owner);
  assert.equal(open(sql).filter((q) => q.q.replace(/^"|"$/gu, '') === question).length, 1);

  value(await api.decide({ id: asked[0]!.id, decide: { option: 'accept', reason: '' } }, owner));
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'organisations'")!.n, 3, 'no shop was taken out of the file');
  assert.equal(k.get(bake)?.fields.retired_on, '2026-10-25');
  assert.equal(k.get(bake)?.deleted_at ?? null, null, 'the retired shop is kept');
  const folded = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', marke)!;
  assert.equal(JSON.parse(folded.fields).merged_into, whole);
  sql.close();
});
