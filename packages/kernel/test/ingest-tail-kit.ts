/**
 * What the tail tests share: a record with Accounts and a Ledger, one bank door that reads card texts, and the seam the
 * record hands an answered question through (`answerAsked`). It registers no test of its own; it is named inside the
 * ingest tests' glob so it travels with them.
 *
 * EVERY VALUE IS INVENTED. The wording is the bank's card text as the bank add-on reads it, with made-up shops, amounts and
 * digits.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { answerAsked, type IngestDecl, type IngestDeps } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

export const NOW = Date.UTC(2026, 9, 8, 12);
export const OWNER = { actor: 'p_1' };

export const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    one: 'account',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', label: 'Type', type: 'enum', values: ['bank', 'card'], required: true },
      { id: 'balance', type: 'money', required: true },
      { id: 'last4', label: 'Digits the bank prints', type: 'text' },
    ],
  } as never,
};

export const LEDGER: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    one: 'transaction',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'on', type: 'day' },
      { id: 'account', type: 'ref', to: 'accounts', required: true },
    ],
  } as never,
};

/** The door's own pattern: card texts, the account read by the digits behind the stars, a card's only. */
export const CARD = (over: Record<string, unknown> = {}, lookup: Record<string, unknown> = {}): Declaration => ({
  id: 'ingest.bank-sms',
  kind: 'ingest',
  body: {
    ingest: 'bank-sms',
    channel: 'webhook',
    verify: { kind: 'path' },
    description: 'Bank texts',
    match: { all: [{ field: 'body', contains: 'has been used' }] },
    extract: {
      what: { text: { between: [' at ', '.'] } },
      amount: { money: { after: 'used for ', currency: 'EGP' } },
      on: { date: { format: 'DD/MM/YYYY', after: ' on ' } },
      account: { lookup: defined({ register: 'accounts', by: 'last4', between: ['*** ', ' has been'], says: 'card', where: 'kind is card', ...lookup }) },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: ['what', 'amount', 'on', 'account'],
    on_conflict: 'skip',
    ...over,
  } as never,
});

/** An object without the keys a caller set to `undefined`, so a test can take a key off the lookup. */
const defined = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A second pattern at the same door: cash out of the account, the same digits printed the same way. */
export const CASH: Declaration = {
  id: 'ingest.bank-cash',
  kind: 'ingest',
  body: {
    ingest: 'bank-cash',
    channel: 'webhook',
    door: 'bank-sms',
    match: { all: [{ field: 'body', contains: 'cash withdrawal' }] },
    extract: {
      what: { text: { between: [' at ', '.'] } },
      amount: { money: { after: 'withdrawal of ', currency: 'EGP' } },
      on: { date: { format: 'DD/MM/YYYY', after: ' on ' } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['*** ', ' cash'], says: 'card' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: ['what', 'amount', 'on', 'account'],
    on_conflict: 'skip',
  } as never,
};

export const used = (digits: string, shop: string, amount: string, day = '05/10/2026'): string =>
  `Your Credit Card ending with *** ${digits} has been used for EGP ${amount} on ${day} at ${shop}.`;

export const cash = (digits: string, amount: string, day = '06/10/2026'): string =>
  `Your Credit Card ending with *** ${digits} cash withdrawal of EGP ${amount} on ${day} at NILE ATM.`;

export type Rec = { k: Kernel; sql: NodeSql; card: string; current: string; clock: ReturnType<typeof fixedClock> };

/** A record with a card and a current account, neither holding digits, and the bank's patterns. */
export async function record(...decls: Declaration[]): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const installed = await k.install([ACCOUNTS, LEDGER, ...(decls.length ? decls : [CARD()])]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (fields: Record<string, unknown>): string => {
    const got = k.create('accounts', fields, OWNER);
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.id;
  };
  const current = made({ name: 'Current account', kind: 'bank', balance: { amount: 100_000, currency: 'EGP' } });
  const card = made({ name: 'Credit Card', kind: 'card', balance: { amount: 0, currency: 'EGP' } });
  /* THE ACCOUNTS WERE MADE BEFORE TODAY, as his were: past the minutes in which an edit by their maker folds into the
     making, which would put the digits in the account's own first line and out of reach of an Undo of the answer. */
  clock.advance(60 * 60_000);
  return { k, sql, clock, current, card };
}

let sent = 0;

/** One text posted to the bank's door, as a verified arrival named for it. */
export function text(k: Kernel, body: string): Arrived {
  sent += 1;
  const r = k.arrive({ channel: 'webhook', ingest: 'bank-sms', body, sha256: `tail-${sent}-${randomUUID()}`, verified: true });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
}

/** The seam `index.ts` hands an answered question through, built from the record's own parts as `ingestDeps` builds it. */
export function depsOf(k: Kernel, sql: NodeSql, nowMs = NOW): IngestDeps {
  return {
    sql,
    ingests: () =>
      sql
        .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
        .map((r) => JSON.parse(r.body) as IngestDecl),
    schemaOf: (id) => {
      const decl = k.register(id);
      return decl ? ({ register: id, fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } as never) : null;
    },
    write: (list, spoken, patch, actor) => k.write(list, spoken, patch as never, { actor }),
    rows: (list, by) =>
      sql
        .all<{ id: string; value: unknown }>(`SELECT id, json_extract(fields, '$.${by}') AS value FROM entry WHERE register = ? AND deleted_at IS NULL`, list)
        .flatMap((r) => (r.value === null ? [] : [{ id: r.id, value: String(r.value) }])),
    mint: () => randomUUID(),
    allocate: (name) => {
      sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1)', name);
      return sql.one<{ n: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 AS n', name)!.n;
    },
    nowMs,
  };
}

/** A press on Decide, carried out as the record carries it: the decision, then the inbox's half in the same transaction. */
export function answer(r: Rec, id: string, option: string, actor = 'p_1'): { said: string | null; batch: string | null; decision: string | null } {
  return r.k.transaction(() => {
    const out = r.k.decide(id, { decide: { option, reason: 'that one' } }, actor);
    assert.ok(out.ok, JSON.stringify(out));
    const batch = (out.value as { batch?: string }).batch ?? null;
    /* `decide` carries the answer out itself now (index.ts); a second hand-through finds it done and answers null, so the
       closing line is read off the question where it was kept. */
    const said = answerAsked(depsOf(r.k, r.sql, r.clock.now()), { id, option, actor, batch });
    assert.ok(said.ok, JSON.stringify(said));
    const kept = bodyOf(r.sql, id).said;
    return { said: said.value ?? (typeof kept === 'string' ? kept : null), batch, decision: out.value.decision };
  });
}

/** A question's body as it is stored. */
export function bodyOf(sql: NodeSql, id: string): Record<string, unknown> {
  return JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
}

/** The questions still open, by kind. */
export const openQuestions = (sql: NodeSql, kind?: string): { id: string; body_kind: string }[] =>
  sql.all<{ id: string; body_kind: string }>(
    `SELECT id, body_kind FROM suggestion WHERE status = 'open'${kind === undefined ? '' : ' AND body_kind = ?'} ORDER BY rowid`,
    ...(kind === undefined ? [] : [kind]),
  );
