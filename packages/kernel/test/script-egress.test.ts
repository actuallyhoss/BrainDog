/**
 * A script's egress reaches a person: in a proposal's approval lines, and in what turning its pack back on would call out.
 *
 * `egressOf` read a script's `CALLS OUT` line and every caller threw it away, because each kept only `kind = 'ingest'`.
 * So a script an agent proposed, reaching an origin with a vault key, was filed with no approval lines at all, and a
 * pack of scripts turned back on said nothing about where they fetch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const SERIES: Declaration = {
  id: 'register.gold_egp',
  kind: 'register',
  body: { id: 'gold_egp', name: 'Gold, EGP', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};

const GOLD = (over: Record<string, unknown> = {}): Declaration =>
  ({
    id: 'script.gold-rate',
    kind: 'script',
    body: {
      script: 'gold-rate',
      title: 'Gold price, 24k, per gram in EGP',
      runs: { every: '1h' },
      egress: ['https://api.goldapi.io'],
      keys: ['goldapi'],
      reads: [],
      writes: ['gold_egp'],
      source: "export default async function run(ctx) { ctx.log('ok'); }",
      ...over,
    },
  }) as unknown as Declaration;

const LINE = 'CALLS OUT api.goldapi.io · every 1h · key "goldapi" to the host its vault entry opens';

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([SERIES])).ok);
  return { k, sql };
}

const approveOf = (sql: NodeSql, id: string): string[] | undefined =>
  (JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as { approve?: string[] }).approve;

const propose = (k: Kernel, to: Declaration) => {
  const out = k.propose({ question: 'Fetch the gold price?', body_kind: 'change', body: { declaration_id: to.id, to } }, 'p_1');
  assert.ok(out.ok, fixOf(out));
  return (out.value as { id: string }).id;
};

test('A PROPOSED SCRIPT CARRIES ITS CALLS OUT LINE FOR THE OWNER TO APPROVE, and only a changed one asks again', async () => {
  const { k, sql } = await record();
  const first = approveOf(sql, propose(k, GOLD()));
  assert.ok(first, 'a script that fetches with a key was filed with nothing to approve');
  assert.ok(first.includes(LINE), `the approval lines were ${JSON.stringify(first)}`);

  assert.ok((await k.install([GOLD()])).ok);
  assert.equal(approveOf(sql, propose(k, GOLD({ title: 'Gold, 24k' }))), undefined, 'the same egress asks nothing again');

  /* A SECOND ORIGIN LEAVES `host` AS IT WAS, and it is still a place the owner has not approved. */
  const wider = approveOf(sql, propose(k, GOLD({ egress: ['https://api.goldapi.io', 'https://metals.example.org'] })));
  assert.ok(wider?.some((l) => l.includes('metals.example.org')), `a new origin asked nothing: ${JSON.stringify(wider)}`);
});

test("TURNING A PACK BACK ON SAYS WHERE ITS SCRIPTS CALL OUT, as it says an action's", async () => {
  const { k } = await record();
  const put = await k.install([GOLD({ pack: 'gold-feed' })]);
  assert.ok(put.ok, fixOf(put));
  const off = k.disablePack('gold-feed');
  assert.ok(off.ok, fixOf(off));
  assert.ok(k.callsWhenEnabled('gold-feed').includes(LINE), JSON.stringify(k.callsWhenEnabled('gold-feed')));
});

test('A SCRIPT IS ARMED ON ITS CLOCK WHEN IT IS INSTALLED, and its row leaves with its pack', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([GOLD({ pack: 'gold-feed' })])).ok);
  const row = sql.one<{ due_at: string; state: string }>("SELECT due_at, state FROM schedule WHERE kind = 'script' AND key = 'gold-rate'");
  assert.equal(row?.state, 'pending');
  assert.ok(Date.parse(row!.due_at) > NOW, 'first run is one interval out, spread');
  /* A PACK THE DECLARE PATH INSTALLED OWNS ITS ROWS BY `pack_id`, which is what `forgetPack` reads. */
  sql.exec("UPDATE declaration SET pack_id = 'gold-feed' WHERE id = 'script.gold-rate'");
  k.forgetPack('gold-feed');
  assert.equal(sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'script'"), undefined, 'a script pack left its clock behind');
});

test('A NON-STRING every: IS REFUSED IN A SCRIPT\'S OWN WORDS', async () => {
  const { k } = await record();
  const out = await k.install([GOLD({ runs: { every: 3600 } })]);
  assert.equal(out.ok, false);
  const r = (out as { refusal: { fix: string; at?: string } }).refusal;
  assert.equal(r.at, 'runs.every');
  assert.doesNotMatch(r.fix, /how to fetch/);
});
