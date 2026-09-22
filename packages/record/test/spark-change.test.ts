/**
 * Spark filing a `change` (`loop/research-shell-mcp.md` §4 Brief D, `loop/DIRECTION.md` §22).
 *
 * THE OWNER'S OWN EXAMPLE IS A GOLD RATE ON A SCHEDULE, and that is an `ingest`: a declaration, not a pack. Before this, a
 * model that drafted one had it dropped with "Spark files only pack, settings and arrange", so the record's Spark could
 * rearrange what was installed and could not build the one thing a use case needed. The record is real and the model is a
 * stub, because what is under test is what the record does with an answer, not what a model would say.
 *
 * WHAT IT SENDS OUT IS THE RECORD'S READING, NEVER THE MODEL'S. The stub writes its own `egress` naming a friendlier host;
 * the suggestion filed must carry the lines `kernel.propose`'s review works out from the declaration instead, exactly as
 * it does for an agent's change, and nothing is armed until the owner accepts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SparkModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 22, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Filed = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[] };

const RATES = {
  id: 'register.rates',
  kind: 'register' as const,
  body: {
    id: 'rates',
    name: 'Rates',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'price', type: 'decimal' },
    ],
  } as never,
};

/** The gold rate, polled every hour into Rates. */
const GOLD = {
  id: 'ingest.gold',
  kind: 'ingest',
  body: {
    ingest: 'gold',
    channel: 'poll',
    url: 'https://api.gold.example.test/v1/xau',
    every: '1h',
    extract: { what: { after: 'rate ' } },
    writes: { register: 'rates' },
  },
};

/** A record past Spark's fortnight of watching, so it is advised and the model is asked. */
async function record(model: SparkModel) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * DAY);
  const api = await createRecordApi({ sql, clock, sparkModel: model });
  const installed = await api.kernel.install([RATES]);
  assert.ok(installed.ok, JSON.stringify(installed));
  value(api.kernel.create('rates', { what: 'Gold, by hand', price: 2400 }, { actor: 'p_owner' }));
  clock.set(NOW);
  return { api, sql };
}

test('A MODEL THAT DRAFTS AN INGEST HAS IT FILED AS A CHANGE, carrying the egress the record worked out and not the one it wrote', async () => {
  const model: SparkModel = {
    name: 'test model',
    draft: async () => ({
      drafts: [
        {
          question: 'Fetch the gold rate every hour into Rates? You have been typing it in by hand.',
          body_kind: 'change',
          body: { to: GOLD, egress: [{ host: 'friendly.example.test' }], approve: ['Sends nothing.'] },
        },
        { question: 'Change the theme?', body_kind: 'change', body: { to: { id: 'theme.dark', kind: 'theme', body: {} } } },
      ],
    }),
  };
  const { api, sql } = await record(model);

  const out = value<Filed>(await api.sparkPropose({}, owner));
  assert.deepEqual(out.dropped, ['Proposal 2 was a change to a theme, and Spark changes only a register, an ingest, a rule or a page.']);
  assert.equal(out.by, 'test model');
  assert.deepEqual(out.filed.map((f) => [f.question, f.by]), [['Fetch the gold rate every hour into Rates? You have been typing it in by hand.', 'test model']]);

  const row = sql.one<{ body_kind: string; body: string; status: string; opened_by: string }>('SELECT body_kind, body, status, opened_by FROM suggestion WHERE id = ?', out.filed[0]!.id)!;
  assert.deepEqual([row.body_kind, row.status, row.opened_by], ['change', 'open', 'spark']);
  const body = JSON.parse(row.body) as { declaration_id: string; egress: { ingest: string; host: string; every: string | null }[]; approve: string[] };
  assert.equal(body.declaration_id, 'ingest.gold');
  assert.deepEqual(body.egress.map((e) => [e.ingest, e.host, e.every]), [['gold', 'api.gold.example.test', '1h']]);
  assert.ok(body.approve.some((l) => l.startsWith('CALLS OUT api.gold.example.test')), JSON.stringify(body.approve));
  assert.ok(!row.body.includes('friendly.example.test') && !row.body.includes('Sends nothing.'), 'the model wrote its own egress into the question');

  /* NOTHING IS ARMED BY ASKING, and a model's answer is still only ever a suggestion. */
  assert.equal(api.kernel.declarations().some((d) => d.id === 'ingest.gold'), false);
  assert.deepEqual(sql.all<{ kind: string }>("SELECT DISTINCT kind FROM event WHERE actor = 'spark'").map((e) => e.kind), ['suggest']);

  /* ASKED ONCE: the same draft again is recognised, and not put on Decide a second time. */
  const again = value<Filed>(await api.sparkPropose({}, owner));
  assert.deepEqual(again.filed, []);
  assert.deepEqual(again.skipped.map((s) => s.why), ['Spark has asked this before.']);
  sql.close();
});

test('SPARK_OPEN_CAP HOLDS FOR CHANGES: four doors drafted, three asked, and the fourth said to be past the cap', async () => {
  const door = (n: number) => ({ ...GOLD, id: `ingest.gold${n}`, body: { ...GOLD.body, ingest: `gold${n}`, url: `https://api.gold.example.test/v1/xau/${n}` } });
  const model: SparkModel = {
    name: 'test model',
    draft: async () => [1, 2, 3, 4].map((n) => ({ question: `Fetch gold rate ${n} every hour?`, body_kind: 'change', body: { to: door(n) } })),
  };
  const { api, sql } = await record(model);
  const out = value<Filed>(await api.sparkPropose({}, owner));
  assert.equal(out.filed.length, 3);
  assert.deepEqual(out.dropped, ['Proposal 4 was past the 3 Spark files at once.']);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE opened_by = 'spark' AND status = 'open'")!.n, 3);
  sql.close();
});

test('A CHANGE IS KEYED BY THE WHOLE DECLARATION: the same door at a different pace is a new question, not one asked before', async () => {
  /* THE DIFFERENCE SITS PAST THE FIRST 120 CHARACTERS OF THE BODY ON PURPOSE. Without the `change:` key, `stableKey`
     falls back to that prefix of the JSON, and the hourly and the daily gold rate share it; this failed with the second
     reported as "Spark has asked this before." when that branch was taken out. */
  let every = '1h';
  const model: SparkModel = {
    name: 'test model',
    draft: async () => [{ question: `Fetch the gold rate every ${every}?`, body_kind: 'change', body: { to: { ...GOLD, body: { ...GOLD.body, every } } } }],
  };
  const { api, sql } = await record(model);
  assert.equal(value<Filed>(await api.sparkPropose({}, owner)).filed.length, 1);
  every = '1d';
  const daily = value<Filed>(await api.sparkPropose({}, owner));
  assert.deepEqual(daily.skipped, []);
  assert.deepEqual(daily.filed.map((f) => f.question), ['Fetch the gold rate every 1d?']);
  sql.close();
});
