/**
 * SLASH'S LIMITS, HELD ON A REAL RECORD (ENG-B20 job 2's skill half; `src/slash.ts`).
 *
 * The rule: "F8 Slash scripts proposal-only no keychain keys". Three holds, each through the press the owner makes:
 *   - a script that would send one of his keys is dropped with `KEYED_SCRIPT`, and no question is filed;
 *   - a draft that reaches Slash's own prefs, its settings door or the ladder's thresholds is dropped (`ownLoopFault`);
 *   - a skill an add-on only names is offered only with steps quoted from three runs' handoffs, and with none, not at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, fromModel, type CallContext, type CatalogueEntry, type SlashModel } from '../src/index.ts';
import { KEYED_SCRIPT, OWN_LIMITS, ownLoopFault } from '../src/slash.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Filed = { by: string; filed: { id: string; question: string; by: string }[]; dropped: string[] };
type Seen = { drafts: { question: string; body_kind: string; body: Record<string, unknown> }[] };

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A model that answers `drafts` to every ask. */
const answering = (drafts: unknown[]): SlashModel => ({ name: 'test model', draft: async () => ({ drafts }) });

/** The catalogue with the agents add-on naming one skill and shipping no text for it. */
const naming = (): CatalogueEntry[] =>
  seedCatalogue().map((e) => (e.id === 'agents' ? { ...e, skills: [{ name: 'ledger-close', trigger: 'when a month ends' }] } : e)) as CatalogueEntry[];

/**
 * A record twenty days old, its owner's own use on five days so Slash advises it (HD.410), with Tasks, and with the
 * agents add-on on when `catalogue` is handed.
 */
async function record(opts: { model?: SlashModel; catalogue?: CatalogueEntry[] } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const api = await createRecordApi({ sql, clock, ...(opts.model ? { slashModel: opts.model } : {}), ...(opts.catalogue ? { catalogue: opts.catalogue } : {}) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'kiln-books', name: 'Kiln Books', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([TASKS])).ok);
  /* THE OWNER'S OWN AGENT KEY, whose runs' handoffs Slash learns skills from. */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('tok_kiln', 'p_owner', 'h', 'write', 'Kiln', '2026-01-01T00:00:00.000Z')");
  if (opts.catalogue) {
    const asked = value<{ id: string }>(await api.propose({ question: 'Turn on agents?', body_kind: 'pack', body: { install: 'agents' } }, OWNER));
    value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } }, OWNER));
  }
  for (const day of [0, 3, 6, 9, 12]) {
    clock.set(T0 + day * DAY);
    value(await api.create({ register: 'tasks', fields: { what: `Glaze batch ${day}` } }, OWNER));
  }
  clock.set(T0 + 20 * DAY);
  return { sql, clock, api };
}

const SCRIPT = (keys: string[]) => ({
  id: 'script.balance',
  kind: 'script',
  body: { script: 'balance', title: 'Balance', runs: { every: '1h' }, egress: ['https://api.kiln.example'], keys, reads: [], writes: ['tasks'], source: 'export default async function run(ctx) {}' },
});

test('A SCRIPT THAT WOULD SEND ONE OF HIS KEYS IS DROPPED WITH ITS SENTENCE, and the press files no question', async () => {
  const { api, sql } = await record({ model: answering([{ question: 'Fetch my balance every hour with my key?', body_kind: 'change', body: { to: SCRIPT(['kiln-bank']) } }]) });
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  assert.deepEqual(out.filed, []);
  assert.ok(out.dropped.includes(KEYED_SCRIPT), JSON.stringify(out.dropped));
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE opened_by = 'slash'").length, 0, 'a question was filed');
  sql.close();
});

test('THE SAME SCRIPT NAMING NO KEY IS STILL A DRAFT, and its question says no key; from a description too, the keyed one goes', () => {
  const plain = fromModel({ drafts: [{ question: 'Fetch the balance hourly?', body_kind: 'change', body: { to: SCRIPT([]) } }] }, 'test model');
  assert.deepEqual(plain.dropped, []);
  assert.equal(plain.drafts[0]?.question, 'Fetch the balance hourly? Accepting it lets the script "balance" fetch from api.kiln.example and write to Tasks every 1h on its own.');
  const described = fromModel({ drafts: [{ question: 'Fetch it?', body_kind: 'change', body: { to: SCRIPT(['kiln-bank']) } }] }, 'test model', 3, undefined, true);
  assert.deepEqual(described, { drafts: [], dropped: [KEYED_SCRIPT] });
});

test("A DRAFT RAISING SLASH'S OWN ASK CAP IS DROPPED, as is one at its prefs, its settings door or the ladder's thresholds", async () => {
  const own = [
    { question: 'Let Slash ask more often?', body_kind: 'settings', body: { pack: 'slash', values: { ask_cap: 500 } } },
    { question: 'Keep Slash reading?', body_kind: 'settings', body: { settings: [{ pack: 'notes', values: { 'slash.reads': true } }] } },
    { question: 'Look every hour?', body_kind: 'change', body: { to: { id: 'script.look', kind: 'script', body: { script: 'look', runs: { every: '1h' }, egress: [], keys: [], reads: [], writes: [], source: "await fetch('/api/slash/settings')" } } } },
    { question: 'Trust agents sooner?', body_kind: 'change', body: { to: { id: 'rule.trust', kind: 'rule', body: { rule: 'trust', register: 'tasks', then: [{ set: { field: 'what', to: 'offer_after 2' } }] } } } },
  ];
  const { api, sql } = await record({ model: answering(own) });
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  assert.deepEqual(out.filed, []);
  assert.deepEqual(out.dropped.filter((d) => d === OWN_LIMITS).length, 4, JSON.stringify(out.dropped));
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE opened_by = 'slash'").length, 0);
  /* A HOST THAT ONLY SPELLS ITS NAME is not its loop, and neither is a pack of another name. */
  assert.equal(ownLoopFault({ body_kind: 'change', body: { to: { id: 'ingest.feed', kind: 'ingest', body: { url: 'https://slash.example/feed' } } } }), null);
  assert.equal(ownLoopFault({ body_kind: 'settings', body: { pack: 'notes', values: { voice_since_away: 'Since you looked' } } }), null);
  sql.close();
});

test('A SKILL AN ADD-ON ONLY NAMES, WITH NO HANDOFFS, FILES NOTHING: no empty skill is offered', async () => {
  const { api, sql } = await record({ catalogue: naming() });
  const seen = value<Seen>(await api.slash({}, OWNER));
  assert.ok(!seen.drafts.some((d) => d.body_kind === 'rowset' && d.question.includes('ledger-close')), JSON.stringify(seen.drafts.map((d) => d.question)));
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  assert.ok(!out.filed.some((f) => f.question.includes('ledger-close')), JSON.stringify(out.filed));
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE body LIKE '%not written yet%'").length, 0);
  sql.close();
});

/** A run's call from its own session, by a key the owner minted. */
const run = (client_id: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_kiln', scope: 'write', person: 'p_owner', level: 'owner' },
  session: { client_id, host: 'kiln-mac', repo: 'kiln-books', agent: 'claude' },
});

test('THREE RUNS THAT LEFT THE SAME STEPS FOR IT earn the skill, each step quoted from a handoff, and a yes writes that text', async () => {
  const { api, sql, clock } = await record({ catalogue: naming() });
  const said: [string, string][] = [
    ['Closed the ledger for August.', 'Export first with `kiln export --month`.\nThen `kiln reconcile --strict` came out even.'],
    ['Ledger close for July.', 'Ran `kiln export --month`. After that, `kiln reconcile --strict` passed.'],
    ['Month close of the ledger.', '`kiln export --month`\n`kiln reconcile --strict`'],
  ];
  for (const [i, [doing, next]] of said.entries()) {
    clock.set(T0 + (13 + i) * DAY);
    value(await api.create({ register: 'tasks', fields: { what: `Close ${i}` } }, run(`c-${i}`)));
    value(await api.handoff({ doing, next, state: 'handoff' }, run(`c-${i}`)));
  }
  clock.set(T0 + 20 * DAY);
  const seen = value<Seen>(await api.slash({}, OWNER));
  const offer = seen.drafts.find((d) => d.body_kind === 'rowset' && d.question.includes('ledger-close'));
  assert.equal(offer?.question, 'Give your agents the skill ledger-close? The Agents plugin names it for when a month ends, and its 2 steps are quoted from what your agents left when they handed off.');
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  const id = out.filed.find((f) => f.question.includes('ledger-close'))?.id;
  assert.ok(id, JSON.stringify(out));
  value(await api.decide({ id: id!, decide: { option: 'accept', reason: 'yes' } }, OWNER));
  const body = sql.one<{ body: string }>("SELECT json_extract(fields, '$.body') AS body FROM entry WHERE register = 'skills' AND json_extract(fields, '$.name') = 'ledger-close'")?.body;
  assert.equal(body, 'Use this skill when a month ends.\n\n1. Export first with `kiln export --month`.\n2. Then `kiln reconcile --strict` came out even.\n');
  sql.close();
});

test('A COLLEAGUE\'S RUNS THAT LEFT THE SAME STEPS EARN NO SKILL, since Slash would quote them as your agents\' own', async () => {
  const { api, sql, clock } = await record({ catalogue: naming() });
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mal', 'mal@example.test', 'Mal')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_mal', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('tok_mal', 'p_mal', 'h', 'write', 'Mal', '2026-01-01T00:00:00.000Z')");
  const said: [string, string][] = [
    ['Closed the ledger for August.', 'Export first with `kiln export --month`.\nThen `kiln reconcile --strict` came out even.'],
    ['Ledger close for July.', 'Ran `kiln export --month`. After that, `kiln reconcile --strict` passed.'],
    ['Month close of the ledger.', '`kiln export --month`\n`kiln reconcile --strict`'],
  ];
  for (const [i, [doing, next]] of said.entries()) {
    const theirs: CallContext = { principal: { kind: 'token', id: 'tok_mal', scope: 'write', person: 'p_mal', level: 'write' }, session: { client_id: `m-${i}`, host: 'mal-box', repo: 'kiln-books', agent: 'claude' } };
    clock.set(T0 + (13 + i) * DAY);
    value(await api.create({ register: 'tasks', fields: { what: `Close ${i}` } }, theirs));
    value(await api.handoff({ doing, next, state: 'handoff' }, theirs));
  }
  clock.set(T0 + 20 * DAY);
  const seen = value<Seen>(await api.slash({}, OWNER));
  assert.ok(!seen.drafts.some((d) => d.body_kind === 'rowset' && d.question.includes('ledger-close') && d.question.includes('quoted')), JSON.stringify(seen.drafts.map((d) => d.question)));
  sql.close();
});
