/**
 * What a `pattern` carries to install, held when it is proposed to being an ingest: its bare body, or a declaration of it.
 *
 * `checkBody` asked a pattern's `ingest` only to be an object, and the accept hands `body.ingest` to install exactly as it
 * hands a change's `body.to`. So any kind went in under the one body kind whose review screen, cost (`weigh.ts`: "a rule
 * that will add rows") and sample counts all read it as an ingest, and `record/test/accept-rule-level.test.ts` measured a
 * colleague filing a rule as a pattern's `ingest`, accepting it, and the rule installing.
 *
 * TWO SHAPES ARE AN INGEST, AND THE FIRST CHECK KNEW ONE. It refused every `ingest` without `id` and `kind`, and that
 * broke Slash: `slash/src/prompts.ts` asks the model for ONE ingest declaration BODY, and `slash/src/jobs.ts` once
 * filed it bare, and files the declaration now. Held to the declaration alone, every pattern Slash proposed was refused
 * at filing. So a bare body is an ingest unless it carries another kind's name or a rule's steps, and a declaration is
 * one when its `kind` says `ingest`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const RULE = {
  id: 'rule.chase',
  kind: 'rule',
  body: { rule: 'chase', register: 'obligations', when: 'state is open', once_per: ['entry'], then: [{ tag: 'chased' }] },
};

const INGEST = {
  id: 'ingest.receipts',
  kind: 'ingest',
  body: {
    ingest: 'receipts',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'alerts@bank.test' }] },
    extract: { what: { text: { after: 'Paid ' } } },
    writes: { register: 'obligations' },
  },
};

/** What `slash/src/jobs.ts` files, after it overwrites `confidence` and `on_conflict`: a body, with no id and no kind. */
const SLASH_BODY = {
  match: { from: { is: 'alerts@bank.test' } },
  extract: { what: { after: 'Paid ' } },
  writes: { register: 'obligations', confidence: 'needs-review' },
  on_conflict: 'skip',
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

const pattern = (ingest: unknown) => ({
  question: 'A pattern for the three messages nothing has parsed',
  body_kind: 'pattern' as const,
  body: { ingest, samples: ['inbox_raw#1', 'inbox_raw#2', 'inbox_raw#3'] },
});

const filed = (sql: NodeSql) => sql.all('SELECT 1 FROM suggestion').length;

test('A RULE FILED AS A PATTERN IS REFUSED WHEN IT IS FILED, and the refusal says what it is and to file it as a change', async () => {
  const { k, sql } = await record();
  const out = k.propose(pattern(RULE), 'p_1');
  assert.equal(out.ok, false, 'a rule was filed as a pattern, and accepting it installs a rule');
  if (out.ok || !('refusal' in out)) return;
  assert.equal(out.refusal.code, 'VALUE_MALFORMED');
  assert.equal(out.refusal.at, 'body.ingest');
  assert.match(out.refusal.fix, /\bis a rule\b/u, out.refusal.fix);
  assert.match(out.refusal.fix, /\bas a change\b/u, out.refusal.fix);
  assert.equal(filed(sql), 0);
  sql.close();
});

test('and so is every other kind, a bundle, and a bare body in any other shape than an ingest’s', async () => {
  const { k, sql } = await record();
  for (const [ingest, named] of [
    [{ id: 'script.post', kind: 'script', body: { script: 'post' } }, /\bis a script\b/u],
    [{ id: 'digest.out', kind: 'digest', body: { digest: 'out' } }, /\bis a digest\b/u],
    [OBLIGATIONS, /\bis a register\b/u],
    [{ declarations: [INGEST] }, /\bbundle\b/u],
    [[INGEST], /\bbundle\b/u],
    /* A RULE'S SHAPE WITH NO KIND ON IT is still a rule: bare, it names itself, or it carries steps. */
    [RULE.body, /\bis a rule\b/u],
    [{ on: { written: { register: 'obligations' } }, steps: [{ tag: 'x' }] }, /\bis a rule\b/u],
    [{ script: 'post', source: 'x' }, /\bis a script\b/u],
    [{ digest: 'out', sections: [] }, /\bis a digest\b/u],
    [{ id: 'ingest.receipts', kind: '', body: INGEST.body }, /\bno kind\b/u],
    [{ id: 'ingest.receipts', body: INGEST.body }, /\bno kind\b/u],
    [{ id: 'ingest.receipts', kind: 'ingest' }, /\bno body\b/u],
    [{ kind: 'ingest', body: INGEST.body }, /\bno id\b/u],
  ] as const) {
    const out = k.propose(pattern(ingest), 'p_1');
    assert.equal(out.ok, false, `${JSON.stringify(ingest)} was filed as a pattern`);
    if (out.ok || !('refusal' in out)) continue;
    assert.equal(out.refusal.code, 'VALUE_MALFORMED', JSON.stringify(ingest));
    assert.equal(out.refusal.at, 'body.ingest');
    assert.match(out.refusal.fix, named, out.refusal.fix);
  }
  assert.equal(filed(sql), 0, 'something that is not an ingest reached the queue as a pattern');
  sql.close();
});

test('SLASH’S BARE BODY IS STILL FILED, and so is an ingest declaration', async () => {
  const { k, sql } = await record();
  const bare = k.propose(pattern(SLASH_BODY), 'p_1');
  assert.ok(bare.ok, bare.ok ? '' : JSON.stringify(bare));
  const decl = k.propose(pattern(INGEST), 'p_1');
  assert.ok(decl.ok, decl.ok ? '' : JSON.stringify(decl));
  assert.equal(filed(sql), 2);
  sql.close();
});

test('AND A RULE ALREADY IN THE QUEUE AS A PATTERN IS REFUSED AT THE ACCEPT, with the question left open', async () => {
  /* A queue carried from an earlier build holds patterns filed before the check above existed, so the accept asks
     again, as it does for a change. Filed as an ingest and rewritten underneath, which is what such a row looks like. */
  const { k, sql } = await record();
  const made = k.propose(pattern(INGEST), 'p_1');
  assert.ok(made.ok, made.ok ? '' : JSON.stringify(made));
  sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify(pattern(RULE).body), made.value.id);

  const out = k.decide(made.value.id, { decide: { option: 'accept', reason: 'go on' } }, 'p_2');
  assert.equal(out.ok, false, 'a rule queued as a pattern was accepted and handed back to install');
  if (out.ok || !('refusal' in out)) return;
  assert.equal(out.refusal.at, 'body.ingest');
  assert.equal(k.governanceRow('suggestion', made.value.id)?.status, 'open');
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);
  sql.close();
});

/* A BARE BODY HAS NO ID TO INSTALL UNDER. Measured on this tree before the accept asked: Slash's body was accepted as
   D1, and `install([ingest])` threw `Cannot read properties of undefined (reading 'writes')`, which the record's `land`
   turns into a reopen saying "Propose it again as {"id":"register.<id>",...}", a register, after a decision nobody can
   take back. It is refused here instead, before anything is decided, in words about the ingest it is. */
test('A BARE BODY IS REFUSED AT THE ACCEPT, before a decision is written, saying what it needs to install', async () => {
  const { k, sql } = await record();
  const made = k.propose(pattern(SLASH_BODY), 'p_1');
  assert.ok(made.ok, made.ok ? '' : JSON.stringify(made));
  const out = k.decide(made.value.id, { decide: { option: 'accept', reason: 'it is the bank' } }, 'p_2');
  assert.equal(out.ok, false, 'a body with no id was handed back to install');
  if (out.ok || !('refusal' in out)) return;
  assert.equal(out.refusal.code, 'VALUE_MALFORMED');
  assert.equal(out.refusal.at, 'body.ingest');
  assert.match(out.refusal.fix, /"kind":"ingest"/u, out.refusal.fix);
  assert.equal(k.governanceRow('suggestion', made.value.id)?.status, 'open');
  assert.equal(sql.all('SELECT 1 FROM decision').length, 0);
  /* AND IT CAN STILL BE ANSWERED NO, which is a decision that installs nothing. */
  assert.ok(k.decide(made.value.id, { decide: { option: 'reject', reason: 'not the bank' } }, 'p_2').ok);
  sql.close();
});

test('and an ingest declaration is still filed, accepted and installed', async () => {
  const { k, sql } = await record();
  const made = k.propose(pattern(INGEST), 'p_1');
  assert.ok(made.ok, made.ok ? '' : JSON.stringify(made));
  const out = k.decide(made.value.id, { decide: { option: 'accept', reason: 'it is the bank' } }, 'p_2');
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  const put = await k.install([out.value.install as Declaration]);
  assert.ok(put.ok, put.ok ? '' : JSON.stringify(put));
  sql.close();
});
