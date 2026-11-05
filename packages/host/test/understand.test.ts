/**
 * Understanding who is who on the host's side (`src/understand.ts`, `src/model-jobs.ts`): the doubtful pairs of
 * `infer.resolve` answered on the understanding share, with only names, kinds, an organisation's domain and the length of
 * an address's local part shown to the model, and the nightly read of the notes kept on people and projects, whose
 * candidates go to Decide and never into a list on their own.
 *
 * THE ENGINE IS A STUB, and the queue is a stub where the kernel does not list `infer.resolve` yet: what is under test is
 * what the pass hands the model, what it keeps of the answer, and what it acks. The notes pass runs over a real record.
 * The ledger is the real engine's, built by a relative import as `slash-headline.test.ts` builds it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OutboxRow } from '@braindog/kernel';
import { createRecordApi, type CallContext } from '@braindog/record';

import { backgroundMeter, BACKGROUND_JOBS_MONTH, serveModelJobs, UNDERSTAND_ASKS_MONTH, type ModelJobMeter, type ModelJobsApi } from '../src/model-jobs.ts';
import { slashRecordMeter } from '../src/slash-ask.ts';
import { SLASH_HEADLINE_INSTRUCTIONS } from '../src/slash.ts';
import {
  addressesTheirs,
  keysWritten,
  mentionsKept,
  NOTES_EVERY_MS,
  OFFERS_PER_PASS,
  RESOLVE_PAIRS_MOST,
  scrubbed,
  serveNotes,
  serveOffers,
  SLASH_MENTIONS_INSTRUCTIONS,
  understandingOver,
  type MentionsInput,
  type NotesKernel,
  type OffersKernel,
  type ResolveInput,
} from '../src/understand.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 6, 2, 30);
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const FAKE_KEY = 'sk-ant-api03-Zq8vT2mWx9LkP4rN7bY3cJ6hF1dS5gA0eU8iO2pQ';

type Acked = { id: string; state: string; result?: unknown; error?: string };

/** A queue holding `jobs`, which records what was leased and what was acked. */
function queue(jobs: OutboxRow[]) {
  const leased: string[][] = [];
  const acked: Acked[] = [];
  const kernel = {
    leaseOutbox: (kinds: readonly string[], n?: number) => {
      leased.push([...kinds]);
      const out = jobs.filter((j) => kinds.includes(j.kind)).slice(0, n ?? 10);
      for (const j of out) jobs.splice(jobs.indexOf(j), 1);
      return out;
    },
    ackOutbox: (a: Acked) => (acked.push(a), { ok: true as const, value: undefined }),
    tail: async () => {},
  };
  return { api: { kernel, inbox: async () => ({ ok: true, value: { arrivals: [], cursor: null } }) } as unknown as ModelJobsApi, leased, acked };
}

const job = (id: string, payload: unknown): OutboxRow => ({ id, kind: 'infer.resolve' as OutboxRow['kind'], payload: JSON.stringify(payload), attempts: 0, leasedUntil: '2026-10-06T03:00:00.000Z' });

/** A meter with room, and an understanding share with `left` of its ten. */
function meter(left = UNDERSTAND_ASKS_MONTH): ModelJobMeter {
  return { cap: 30, spent: () => 0, understand: { cap: UNDERSTAND_ASKS_MONTH, spent: () => UNDERSTAND_ASKS_MONTH - left } };
}

const PAIRS = [
  {
    hash: 'h-mara',
    a: { name: 'Mara Okafor', kind: 'person', domain: 'brightwell.example', masked: 'm•••••••••r@brightwell.example', seen: ['6 commits in Lanternfish', `token ${FAKE_KEY}`] },
    b: { name: 'maraokafor', kind: 'person', domain: 'gmail.com', masked: '11', seen: ['mail from mara.okafor@gmail.com'] },
  },
  { hash: 'h-priya', a: { name: 'Priya Raman', kind: 'person', seen: ['Copperleaf'] }, b: { name: 'Priya R', kind: 'person', seen: ['Lanternfish'] } },
  { hash: 'h-org', a: { name: 'Orchardline', kind: 'organisation', seen: ['bank text'] }, b: { name: 'Orchardline Duarte', kind: 'person', seen: [] } },
];

test('A DOUBTFUL PAIR IS SHOWN BY NAME ALONE: no address, no public mail domain, no key, and the answer speaks only of what it was handed', async () => {
  const { api, acked } = queue([job('J1', { pairs: PAIRS })]);
  const asked: ResolveInput[] = [];
  const store = openSqlite();
  await serveModelJobs(api, {
    inference: {
      draft: async () => assert.fail('no draft'),
      prose: async () => assert.fail('no prose'),
      resolve: async (input) => (asked.push(input), { ok: true, value: { verdicts: { p1: 0.94, p2: 0.31, p9: 1, 'h-org': 1 } } }),
    },
    meter: meter(),
    now: () => T0,
    store,
    log: () => {},
  });

  assert.equal(asked.length, 1);
  const sent = JSON.stringify(asked[0]);
  assert.ok(!sent.includes('@'), `an address went to the model: ${sent}`);
  assert.ok(!sent.includes('gmail'), 'a public mail domain went to the model');
  assert.ok(!sent.includes(FAKE_KEY), 'a key went to the model');
  assert.ok(!sent.includes('h-mara') && !sent.includes('h-priya'), "the record's hashes went to the model");
  const [p1, p2] = asked[0]!.pairs;
  assert.deepEqual(p1!.a, { name: 'Mara Okafor', kind: 'person', domain: 'brightwell.example', local: 11, seen: ['6 commits in Lanternfish', 'token [hidden]'] });
  assert.deepEqual(p1!.b, { name: 'maraokafor', kind: 'person', local: 11, seen: ['mail from [address]'] });
  assert.equal(p2!.a.name, 'Priya Raman');
  /* A PERSON BESIDE AN ORGANISATION IS NEVER ASKED ABOUT. */
  assert.equal(asked[0]!.pairs.length, 2);

  assert.equal(acked.length, 1);
  assert.equal(acked[0]!.state, 'done');
  assert.deepEqual(acked[0]!.result, {
    verdicts: [
      { hash: 'h-org', same: false, confidence: 0 },
      { hash: 'h-mara', same: true, confidence: 0.94 },
      { hash: 'h-priya', same: false, confidence: 0.31 },
    ],
  });
});

test('WHAT WAS SAID IS KEPT: the same pairs again are answered from the cache, "not the same" included, with no ask', async () => {
  const store = openSqlite();
  let asks = 0;
  const inference = {
    draft: async () => assert.fail('no draft'),
    prose: async () => assert.fail('no prose'),
    resolve: async () => (asks++, { ok: true as const, value: { verdicts: { p1: 0.94, p2: 0.12 } } }),
  };
  const first = queue([job('J1', { pairs: PAIRS.slice(0, 2) })]);
  await serveModelJobs(first.api, { inference, meter: meter(), now: () => T0, store, log: () => {} });
  const again = queue([job('J2', { pairs: PAIRS.slice(0, 2) })]);
  await serveModelJobs(again.api, { inference, meter: meter(), now: () => T0 + 86_400_000, store, log: () => {} });
  assert.equal(asks, 1);
  assert.deepEqual(again.acked[0]!.result, {
    verdicts: [
      { hash: 'h-mara', same: true, confidence: 0.94 },
      { hash: 'h-priya', same: false, confidence: 0.12 },
    ],
  });
});

test(`AT MOST ${RESOLVE_PAIRS_MOST} PAIRS GO IN ONE ASK, and a pair the answer is silent about gets no verdict`, async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ hash: `h${i}`, a: { name: `Ada Lovelace ${i}`, kind: 'person', seen: [] }, b: { name: `A. Lovelace ${i}`, kind: 'person', seen: [] } }));
  const { api, acked } = queue([job('J1', { pairs: many })]);
  const asked: ResolveInput[] = [];
  await serveModelJobs(api, {
    inference: { draft: async () => assert.fail(), prose: async () => assert.fail(), resolve: async (input) => (asked.push(input), { ok: true, value: { verdicts: { p1: 0.7 } } }) },
    meter: meter(),
    now: () => T0,
    log: () => {},
  });
  assert.equal(asked[0]!.pairs.length, RESOLVE_PAIRS_MOST);
  assert.deepEqual(acked[0]!.result, { verdicts: [{ hash: 'h0', same: true, confidence: 0.7 }] });
});

test('A SPENT MONTH FOR UNDERSTANDING LEAVES THE PAIRS PENDING: nothing is leased, so nothing walks the retry ladder', async () => {
  const { api, leased, acked } = queue([job('J1', { pairs: PAIRS })]);
  await serveModelJobs(api, {
    inference: { draft: async () => assert.fail(), prose: async () => assert.fail(), resolve: async () => assert.fail('asked on a spent month') },
    meter: meter(0),
    now: () => T0,
    log: () => {},
  });
  assert.ok(!leased.some((kinds) => kinds.includes('infer.resolve')), 'infer.resolve was leased on a spent month');
  assert.equal(acked.length, 0);

  /* AND A HOST WITH NO MODEL TO JUDGE WITH LEASES NONE EITHER. */
  const none = queue([job('J2', { pairs: PAIRS })]);
  await serveModelJobs(none.api, { inference: { draft: async () => assert.fail(), prose: async () => assert.fail() }, meter: meter(), now: () => T0, log: () => {} });
  assert.ok(!none.leased.some((kinds) => kinds.includes('infer.resolve')));
});

test('A MODEL NOT REACHED IS A FAILED ACK THAT WALKS THE LADDER, and nothing is cached from it', async () => {
  const store = openSqlite();
  const { api, acked } = queue([job('J1', { pairs: PAIRS.slice(0, 1) })]);
  await serveModelJobs(api, {
    inference: { draft: async () => assert.fail(), prose: async () => assert.fail(), resolve: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'The model did not answer.' } }) },
    meter: meter(),
    now: () => T0,
    store,
    log: () => {},
  });
  assert.equal(acked[0]!.state, 'failed');
  assert.equal(store.one<{ n: number }>('SELECT COUNT(*) AS n FROM understand_verdict')?.n, 0);
});

test('THE SCRUBBER takes out addresses, links and keys, and refuses a text that is still a key', () => {
  assert.equal(scrubbed('Ask ada@halden.example or see https://halden.example/x about it'), 'Ask [address] or see [link] about it');
  assert.equal(scrubbed(`the key is ${FAKE_KEY}`), 'the key is [hidden]');
  assert.equal(scrubbed('   '), null);
});

/* ── the ledger: understanding's ten, inside the work's month ─────────────────────────────────────────────────────── */

function ledger() {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const engine = createSlash({
    sql,
    clock,
    inference: { complete: async () => ({ text: '{}', usage: { in: 1, out: 1 } }) },
    record: new Proxy({}, { get: () => { throw new Error('the record was read by the package'); } }) as never,
  });
  assert.ok(engine.configure({ ask_cap: 20 }, OWNER).ok);
  return { sql, meter: slashRecordMeter({ sql, clock, engine: async () => engine, model: 'glm-5.3-flash' }) };
}

const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();

test("UNDERSTANDING SPENDS ITS OWN SHARE OF THE ONE POOL AND NO MORE, counted inside the work's month and never the headlines' floor", async () => {
  const { sql, meter: record } = ledger();
  const understanding = understandingOver({ resolve: async () => ({ verdicts: {} }), mentions: async () => ({ mentions: [] }) }, record);
  /* THE MOST IT MAY SPEND IS THE MONTH LESS EVERYBODY ELSE'S FLOORS (`budget-plan.ts`), 340 of 600: no wall of ten. */
  const most = backgroundMeter(sql).understand!.cap;
  assert.equal(most, BACKGROUND_JOBS_MONTH - 260);
  for (let i = 0; i < most; i++) assert.ok((await understanding.resolve({ pairs: [] })).ok);
  const refused = await understanding.mentions({ notes: [] });
  assert.ok(!refused.ok);
  assert.equal('refusal' in refused && refused.refusal.code, 'SLASH_BUDGET_SPENT');

  const work = backgroundMeter(sql);
  assert.equal(work.understand?.cap, most);
  assert.equal(work.understand?.spent(MONTH), most);
  assert.equal(work.spent(MONTH), most);
  /* THE HEADLINES STILL HAVE THEIR FLOOR, all of it. */
  const headline = backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline');
  assert.equal(headline.cap - headline.spent(MONTH), 100);
  /* AND A SKILL DRAFT STILL HAS THE REST OF THE WORK'S MONTH. */
  const skill = await record.background('skill');
  assert.ok(skill.ok);
  skill.value.release();
});

test('A STATUS THE PROVIDER WILL GIVE AGAIN IS NOT RETRIED, and costs nothing', async () => {
  const { sql, meter: record } = ledger();
  const refused = understandingOver(
    { resolve: async () => { throw Object.assign(new Error('The Slash endpoint answered 401.'), { refused: 401, key: 'your own key for Slash' }); }, mentions: async () => ({}) },
    record,
  );
  const out = await refused.resolve({ pairs: [] });
  assert.ok(!out.ok && 'refusal' in out && out.refusal.code === 'PULL_REQUEST_REFUSED');
  assert.equal(backgroundMeter(sql).understand?.spent(MONTH), 0);
});

test('A MODEL THAT IS NOT REACHED COSTS NOTHING, and one that answered unreadably is counted', async () => {
  const { sql, meter: record } = ledger();
  const down = understandingOver({ resolve: async () => { throw new Error('connection reset'); }, mentions: async () => ({}) }, record);
  const out = await down.resolve({ pairs: [] });
  assert.ok(!out.ok && 'refusal' in out && out.refusal.code === 'UNREACHABLE');
  assert.equal(backgroundMeter(sql).understand?.spent(MONTH), 0);

  const garbled = understandingOver(
    { resolve: async () => { throw Object.assign(new Error('The model answered something that is not JSON.'), { answered: true }); }, mentions: async () => ({}) },
    record,
  );
  const said = await garbled.resolve({ pairs: [] });
  assert.ok(!said.ok && 'refusal' in said && said.refusal.code === 'PROPOSAL_SCHEMA');
  assert.equal(backgroundMeter(sql).understand?.spent(MONTH), 1);
});

/* ── the nightly notes pass ───────────────────────────────────────────────────────────────────────────────────────── */

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', projects: 'projects', handles: 'handles' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'note', type: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
      { id: 'projects', type: 'list', of: 'ref', to: 'projects' },
    ],
  } as never,
};

const PROJECTS = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
      { id: 'note', type: 'document' },
    ],
  } as never,
};

const ORGS = {
  id: 'register.orgs',
  kind: 'register' as const,
  body: {
    id: 'orgs',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'keys', type: 'list', of: 'text' },
    ],
  } as never,
};

const OXBOW_NOTE = 'Ahmed runs our deliveries every weekend. I read an interview with Adam Mosseri about creators. Jo Okonkwo drew the new menu. Lina once mentioned a cafe.';

async function record() {
  let now = T0 - 3_600_000;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  /* AN OWNER WHO SIGNS IN AS ada@kiln.example: their notes are "your note", and their address is never offered. */
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'oxbow', name: 'Oxbow', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@kiln.example', name: 'Ada' } }).ok);
  const installed = await api.kernel.install([PROJECTS, PEOPLE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const oxbow = await api.create({ register: 'projects', fields: { name: 'Oxbow', note: OXBOW_NOTE } }, OWNER);
  assert.ok(oxbow.ok && !('asked' in oxbow.value), JSON.stringify(oxbow));
  const jo = await api.create({ register: 'people', fields: { name: 'Jo Okonkwo', email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly.' } }, OWNER);
  assert.ok(jo.ok && !('asked' in jo.value), JSON.stringify(jo));
  const filed: { question: string; body: Record<string, unknown> }[] = [];
  const kernel: NotesKernel & OffersKernel = {
    registers: () => api.kernel.registers(),
    list: (q) => api.kernel.list(q),
    meetsList: () => api.kernel.meetsList(),
    history: (id) => api.kernel.history(id),
    members: () => api.kernel.members(),
    orgsList: () => api.kernel.orgsList(),
    openSuggestions: () => api.kernel.openSuggestions(),
    identity: () => api.kernel.identity(),
    propose: (p, w, d) => {
      const out = api.kernel.propose(p, w, d);
      if (out.ok) filed.push({ question: p.question, body: p.body });
      return out;
    },
  };
  return { api, kernel, filed, oxbow: oxbow.value, jo: jo.value, at: (ms: number) => (now = ms) };
}

/** What the model says about the Oxbow note: one relation, one public figure, one already in People, one only mentioned, one invented. */
function reader(log: MentionsInput[]) {
  return async (input: MentionsInput) => {
    log.push(input);
    const oxbow = input.notes.find((n) => n.about === 'Oxbow');
    if (!oxbow) return { ok: true as const, value: { mentions: [] } };
    return {
      ok: true as const,
      value: {
        mentions: [
          { note: oxbow.id, name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries every weekend.', relation: true },
          { note: oxbow.id, name: 'Adam Mosseri', type: 'public_figure', sentence: 'I read an interview with Adam Mosseri about creators.', relation: true },
          { note: oxbow.id, name: 'Jo Okonkwo', type: 'person', sentence: 'Jo Okonkwo drew the new menu.', relation: true },
          { note: oxbow.id, name: 'Lina', type: 'person', sentence: 'Lina once mentioned a cafe.', relation: false },
          { note: oxbow.id, name: 'Marcus Wright', type: 'person', sentence: 'Marcus Wright OXBOWS_THE_BREAD.', relation: true },
          { note: 'n99', name: 'Sara', type: 'person', sentence: 'Sara is our accountant.', relation: true },
        ],
      },
    };
  };
}

test('THE NOTES PASS ASKS, NEVER WRITES: one question for the one relation, with its sentence as evidence, and no public figure', async () => {
  const r = await record();
  const store = openSqlite();
  const asked: MentionsInput[] = [];
  const deps = { mentions: reader(asked), meter: meter().understand!, store, now: () => T0, log: () => {} };
  const out = await serveNotes(r.kernel, deps);

  assert.deepEqual(out, { ran: true, read: 2, asked: 1 });
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0]!.notes.map((n) => [n.about, n.kind]).sort(), [['Jo Okonkwo', 'person'], ['Oxbow', 'project']]);
  assert.ok(!JSON.stringify(asked[0]).includes('@'), 'an address went to the model');

  assert.equal(r.filed.length, 1);
  assert.equal(r.filed[0]!.question, 'Add Ahmed to People? The note on Oxbow names them.');
  assert.ok(!r.filed[0]!.question.includes('—'));
  assert.deepEqual(r.filed[0]!.body, {
    register: 'people',
    rows: [{ name: 'Ahmed', met: ['2026-10-06 · note on Oxbow: "Ahmed runs our deliveries every weekend."'], projects: [r.oxbow.id] }],
    lapses: '2026-10-20',
  });
  /* NOTHING WAS WRITTEN: People still holds Jo alone until the owner says yes on Decide. */
  const people = r.api.kernel.list({ register: 'people' });
  assert.ok(people.ok);
  assert.deepEqual(people.value.rows.map((p) => p.fields.name), ['Jo Okonkwo']);
});

test('NIGHTLY, AND ONLY WHAT CHANGED: the same night does nothing, an unchanged night asks nothing, and a name is never asked twice', async () => {
  const r = await record();
  const store = openSqlite();
  const asked: MentionsInput[] = [];
  let now = T0;
  const deps = { mentions: reader(asked), meter: meter().understand!, store, now: () => now, log: () => {} };
  await serveNotes(r.kernel, deps);
  assert.equal(asked.length, 1);

  now = T0 + 3_600_000;
  assert.deepEqual(await serveNotes(r.kernel, deps), { ran: false, read: 0, asked: 0, why: 'not yet' });

  now = T0 + NOTES_EVERY_MS + 60_000;
  assert.deepEqual(await serveNotes(r.kernel, deps), { ran: true, read: 0, asked: 0 });
  assert.equal(asked.length, 1, 'notes that did not change were read again');

  /* THE OXBOW NOTE CHANGES: it is read again, and Ahmed, already asked about, is not asked about again. */
  r.at(T0 + NOTES_EVERY_MS + 120_000);
  const moved = await r.api.update({ register: 'projects', seq: r.oxbow.seq!, patch: { note: `${OXBOW_NOTE} We open on Sundays now.` }, version: r.oxbow.version }, OWNER);
  assert.ok(moved.ok, JSON.stringify(moved));
  now = T0 + 2 * NOTES_EVERY_MS + 180_000;
  const out = await serveNotes(r.kernel, deps);
  assert.equal(asked.length, 2);
  assert.deepEqual(asked[1]!.notes.map((n) => n.about), ['Oxbow']);
  assert.equal(out.asked, 0);
  assert.equal(r.filed.length, 1);
});

test('A SPENT MONTH LEAVES THE NOTES UNREAD and the mark unmoved, so the next month reads them', async () => {
  const r = await record();
  const store = openSqlite();
  const asked: MentionsInput[] = [];
  const spent = { cap: UNDERSTAND_ASKS_MONTH, spent: () => UNDERSTAND_ASKS_MONTH };
  assert.deepEqual(await serveNotes(r.kernel, { mentions: reader(asked), meter: spent, store, now: () => T0, log: () => {} }), { ran: false, read: 0, asked: 0, why: 'spent' });
  assert.equal(asked.length, 0);
  const out = await serveNotes(r.kernel, { mentions: reader(asked), meter: meter().understand!, store, now: () => T0 + 60_000, log: () => {} });
  assert.equal(out.asked, 1);
});

test('A REFUSAL THAT NEVER REACHED A MODEL LEAVES THE NOTES UNREAD, and they are read the next night', async () => {
  const r = await record();
  const store = openSqlite();
  const asked: MentionsInput[] = [];
  const read = reader(asked);
  let refuse = true;
  const deps = {
    mentions: async (input: MentionsInput) =>
      refuse ? { ok: false as const, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Slash has no ledger on this host to count the draft in.' } } : read(input),
    meter: meter().understand!,
    store,
    now: () => T0,
    log: () => {},
  };
  assert.equal((await serveNotes(r.kernel, deps)).asked, 0);
  refuse = false;
  const out = await serveNotes(r.kernel, { ...deps, now: () => T0 + NOTES_EVERY_MS + 60_000 });
  assert.equal(out.read, 2, 'the notes were marked read by a pass that never reached a model');
  assert.equal(out.asked, 1);
});

test('A MENTION IS KEPT ONLY IN THE WORDS OF THE NOTE IT WAS READ FROM', () => {
  const handed = new Map([['n1', { about: 'Oxbow', text: 'Ahmed runs our deliveries. Oxbow opens at eight.' }]]);
  const kept = mentionsKept(
    {
      mentions: [
        { note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true },
        { note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true },
        { note: 'n1', name: 'Oxbow', type: 'project', sentence: 'Oxbow opens at eight.', relation: true },
        { note: 'n1', name: 'Ahmed', type: 'robot', sentence: 'Ahmed runs our deliveries.', relation: true },
        { note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed owns the company.', relation: true },
        { note: 'n2', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true },
      ],
    },
    handed,
  );
  assert.deepEqual(kept, [{ note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true }]);
});

/* ── the look's order and next, in the headline ask ───────────────────────────────────────────────────────────────── */

test("THE HEADLINE ASK SAYS HOW TO ARRANGE A PAGE: an order of the keys handed, lead first, and a next naming a row handed", () => {
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /\{"lines":\{"<page id>":"<the line>"\}\}/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /\{"headline":"<the line>","order":\["<key>"\],"next":\{"row":"<handle>","text":"<the phrase>"\}\}/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /each key once, only keys it was handed, and the lead line first/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /the handle of one of its rows exactly as handed/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /at most 80 characters/u);
  assert.ok(!SLASH_HEADLINE_INSTRUCTIONS.includes('—') && !SLASH_HEADLINE_INSTRUCTIONS.includes('–'));
});

test('THE MODEL-JOBS PASS READS THE NOTES ONCE ITS NIGHT HAS COME, on a host that hands a store and a model that reads them', async () => {
  const r = await record();
  const store = openSqlite();
  const asked: MentionsInput[] = [];
  const deps = {
    inference: { draft: async () => assert.fail('no draft'), prose: async () => assert.fail('no prose'), mentions: reader(asked) },
    meter: meter(),
    now: () => T0,
    store,
    log: () => {},
  };
  await serveModelJobs(r.api, deps);
  assert.equal(asked.length, 1);
  const open = r.api.kernel.governance('suggestion', { apart: 'with' });
  assert.ok(open.ok);
  /* THE ONE QUESTION ABOUT AHMED, AND THE OFFER THE SAME NOTE MAKES WITH NO MODEL: Jo Okonkwo, held, named in full. */
  /* THE LINK FOR JO ONLY ARRANGES A ROW THE OWNER HOLDS, so it settles itself (the Handled list) and Decide holds the one about Ahmed. */
  assert.equal(open.value.length, 1, 'the question about Ahmed is on Decide, and the link for Jo is not');
  const linked = r.api.kernel.list({ register: 'people', where: 'name is "Jo Okonkwo"' });
  assert.ok(linked.ok);
  assert.deepEqual(linked.value.rows[0]?.fields.projects, [r.oxbow.id], 'the link for Jo was not made');
  /* AND NOT AGAIN ON THE NEXT ALARM. */
  await serveModelJobs(r.api, deps);
  assert.equal(asked.length, 1);

  /* A WORK MONTH SPENT LEAVES THEM WHATEVER UNDERSTANDING HAS LEFT. */
  const fresh = await record();
  const none: MentionsInput[] = [];
  await serveModelJobs(fresh.api, { ...deps, inference: { ...deps.inference, mentions: reader(none) }, store: openSqlite(), meter: { cap: 30, spent: () => 29, understand: meter().understand } });
  assert.equal(none.length, 1, 'one ask of the work month was left, and the notes may spend it');
  const spent = await record();
  const nothing: MentionsInput[] = [];
  await serveModelJobs(spent.api, { ...deps, inference: { ...deps.inference, mentions: reader(nothing) }, store: openSqlite(), meter: { cap: 30, spent: () => 30, understand: meter().understand } });
  assert.equal(nothing.length, 0);
});

/* ── what a person wrote word for word: the offers (judge change 4) ───────────────────────────────────────────────── */

test('AN ADDRESS OR A LOGIN IS READ ONLY AS THE NOTE SPELLS IT, after the service it is on, and a repository is not a login', () => {
  assert.deepEqual(
    keysWritten('Art for Tidewar. Git: Quill.Pixels@gmail.com, GitHub @quillpx. Discord: quill_px. Pin node@24.13.0, see github.com/tidewar/app, ping @quill'),
    [
      { key: 'email:quillpixels@gmail.com', said: 'Quill.Pixels@gmail.com' },
      { key: 'github:quillpx', said: 'quillpx' },
      { key: 'discord:quill_px', said: 'quill_px' },
    ],
  );
  assert.deepEqual(keysWritten('The GitHub repo is private.'), []);
});

test('WHAT A PERSON WROTE WORD FOR WORD IS OFFERED, ONCE, TO THE ONE IT IS ABOUT: one question each, saying what kind and never the thing', async () => {
  const r = await record();
  const store = openSqlite();
  const quill = await r.api.create({ register: 'people', fields: { name: 'Quill', handles: ['discord:quillart'], note: 'Art for Oxbow. Her email is quill.pixels@gmail.com, GitHub @quillpx' } }, OWNER);
  assert.ok(quill.ok && !('asked' in quill.value), JSON.stringify(quill));
  /* A KEY ANOTHER PERSON HOLDS IS NOT OFFERED, and neither is anything in a note an agent wrote. */
  assert.ok((await r.api.create({ register: 'people', fields: { name: 'Sam Reyes', note: 'Copies jo@okonkwo.example on every invoice.' } }, OWNER)).ok);
  assert.ok(r.api.kernel.create('people', { name: 'Pixie', note: 'Pixie writes from pixie@reef.example, GitHub: pixiedev' }, { actor: 'agent:claude' }).ok);

  const out = serveOffers(r.kernel, { store, now: () => T0, log: () => {} });
  assert.deepEqual(out, { ran: true, asked: 2 });
  assert.deepEqual(
    r.filed.map((f) => f.question),
    ['Add an address at gmail.com and a GitHub login to Quill? The note on Quill says so.', 'Link Jo Okonkwo to Oxbow? The note on Oxbow says so.'],
  );
  for (const f of r.filed) assert.ok(!f.question.includes('@') && !f.question.includes('—'), f.question);
  /* THE KERNEL'S OWN SHAPE FOR AN OFFER: the row as a person says it, and the keys, so a later meeting brings it up to date. */
  assert.deepEqual(r.filed[0]!.body, {
    register: 'people',
    rows: [{ at: `people#${quill.value.seq}`, version: quill.value.version, patch: { email: 'quill.pixels@gmail.com', handles: ['discord:quillart', 'github:quillpx'] } }],
    offer: { keys: ['email:quillpixels@gmail.com', 'github:quillpx'] },
    lapses: '2026-10-20',
  });
  assert.deepEqual(r.filed[1]!.body, { register: 'people', rows: [{ at: `people#${r.jo.seq}`, version: r.jo.version, patch: { projects: [r.oxbow.id] } }], lapses: '2026-10-20' });

  /* NOTHING WAS WRITTEN until the owner says yes, and nothing is offered again. Quill's link to Oxbow, which the offer's
     update would not carry, is its own question the night after. */
  const held = r.api.kernel.get(quill.value.id);
  assert.equal(held?.fields.email ?? null, null);
  assert.deepEqual(serveOffers(r.kernel, { store, now: () => T0 + 60_000, log: () => {} }), { ran: false, asked: 0, why: 'not yet' });
  assert.deepEqual(serveOffers(r.kernel, { store, now: () => T0 + NOTES_EVERY_MS + 60_000, log: () => {} }), { ran: true, asked: 1 });
  assert.equal(r.filed[2]!.question, 'Link Quill to Oxbow? The note on Quill says so.');
  assert.deepEqual(serveOffers(r.kernel, { store, now: () => T0 + 2 * NOTES_EVERY_MS + 120_000, log: () => {} }), { ran: true, asked: 0 });

  /* MET AGAIN BEFORE THE OWNER ANSWERS, the offer is brought up to Quill as they are now, and still accepted. */
  assert.ok(r.api.kernel.meet({ name: 'Quill', handle: 'Discord:quillart', where: 'a message in the art channel' }, { actor: 'p_owner' }).ok);
  assert.notEqual(r.api.kernel.get(quill.value.id)?.version, quill.value.version);

  /* YES WRITES IT: Quill now answers to the address the note gave. */
  const open = r.api.kernel.governance('suggestion', { apart: 'with' });
  assert.ok(open.ok);
  const mine = open.value.find((s) => 'offer' in (s.body as object));
  assert.ok(mine, 'the offer to Quill is on Decide');
  assert.equal((mine.body as { rows: { version: number }[] }).rows[0]!.version, r.api.kernel.get(quill.value.id)?.version);
  const said = await r.api.decide({ id: mine.id, decide: { option: 'accept', reason: 'Yes.' } } as never, OWNER);
  assert.ok(said.ok, JSON.stringify(said));
  /* THE ADDRESS AS ITS KEY READS IT once the kernel has brought the offer up to date: Gmail's dots are not part of it. */
  assert.match(String(r.api.kernel.get(quill.value.id)?.fields.email), /^quill\.?pixels@gmail\.com$/u);
  assert.deepEqual(r.api.kernel.get(quill.value.id)?.fields.handles, ['discord:quillart', 'github:quillpx']);
});

test('AN ADDRESS IS THEIRS ONLY WHEN THE NOTE SAYS SO: their word or their own name just before it, and nothing that makes it someone else\'s', () => {
  const theirs = (text: string) => [...addressesTheirs(text, 'Ann Lee')];
  assert.deepEqual(theirs('Her email is ann@kiln.example.'), ['email:ann@kiln.example']);
  assert.deepEqual(theirs('Reach Ann at ann@kiln.example'), ['email:ann@kiln.example']);
  assert.deepEqual(theirs("Ann's work address: ann@kiln.example"), ['email:ann@kiln.example']);
  assert.deepEqual(theirs('Their emails are ann@kiln.example and ann.lee@gmail.com'), ['email:ann@kiln.example', 'email:annlee@gmail.com']);
  /* SOMEONE ELSE'S, OR ONLY PASSED THROUGH THEM. */
  assert.deepEqual(theirs('Ask her manager mgr@kiln.example about quotes.'), []);
  assert.deepEqual(theirs('Cc admin@brain.dog on every invoice.'), []);
  assert.deepEqual(theirs('Forward her mail to ops@kiln.example'), []);
  assert.deepEqual(theirs('Ann, mgr@kiln.example (her manager)'), []);
  assert.deepEqual(theirs('Ann works with Bob, bob@kiln.example'), []);
  assert.deepEqual(theirs('My email is ada@kiln.example, tell her.'), []);
  assert.deepEqual(theirs("They cc'd mgr@kiln.example on it."), []);
  assert.deepEqual(theirs('She works with tom@kiln.example'), []);
  assert.deepEqual(theirs('Ann introduced tom@kiln.example'), []);
  assert.deepEqual(theirs('Tell him to email bob@kiln.example'), []);
  assert.deepEqual(theirs('Send her invoices to billing@kiln.example'), []);
  assert.deepEqual(theirs('She can be reached at ann@kiln.example'), ['email:ann@kiln.example']);
  /* AND AN ADDRESS NOBODY IS SAID TO OWN IS NOBODY'S. */
  assert.deepEqual(theirs('Git: ann@kiln.example'), []);
  assert.deepEqual(theirs('Her email is ann@kiln.example. Cc ann@kiln.example on quotes.'), []);
});

test("NEVER THE OWNER'S ADDRESS, AN ORGANISATION'S KEY OR A SHARED INBOX, and only from the owner's own notes", async () => {
  const r = await record();
  const store = openSqlite();
  assert.ok((await r.api.kernel.install([ORGS])).ok);
  assert.ok((await r.api.create({ register: 'orgs', fields: { name: 'Kiln', keys: ['email:studio@kiln.example'] } }, OWNER)).ok);
  const ann = await r.api.create({
    register: 'people',
    fields: {
      name: 'Ann Lee',
      note: [
        'Met Ann at the fair. Her email is ann@kiln.example.',
        'Cc her manager mgr@kiln.example on quotes. Ask Bob at bob@kiln.example.',
        'Her other address is ada@kiln.example. Her old address is studio@kiln.example. Her address is also accounts@kiln.example.',
      ].join(' '),
    },
  }, OWNER);
  assert.ok(ann.ok && !('asked' in ann.value), JSON.stringify(ann));
  /* A NOTE SOMEONE ELSE ON THE RECORD WROTE IS THEIRS, not the owner's, and is not offered from. */
  assert.ok(r.api.kernel.create('people', { name: 'Cleo', note: 'Her email is cleo@kiln.example' }, { actor: 'p_member' }).ok);

  assert.deepEqual(serveOffers(r.kernel, { store, now: () => T0, log: () => {} }), { ran: true, asked: 2 });
  assert.equal(r.filed[0]!.question, 'Add an address at kiln.example to Ann Lee? The note on Ann Lee says so.');
  assert.deepEqual(r.filed[0]!.body.offer, { keys: ['email:ann@kiln.example'] });
  assert.ok(!r.filed.some((f) => f.question.includes('Cleo')), 'a member\'s note was offered from');
});

test(`AT MOST ${OFFERS_PER_PASS} OFFERS A NIGHT, and the rest are offered the nights that follow`, async () => {
  const r = await record();
  const store = openSqlite();
  for (const name of ['Ana', 'Ben', 'Cy', 'Dee', 'Eli']) assert.ok((await r.api.create({ register: 'people', fields: { name, note: `${name} writes from ${name.toLowerCase()}@studio.example` } }, OWNER)).ok);
  const first = serveOffers(r.kernel, { store, now: () => T0, log: () => {} });
  assert.equal(first.asked, OFFERS_PER_PASS);
  /* AS MANY WAIT AS MAY (`WHO_WAITING_MOST`), so the next night asks nothing until the owner answers them. */
  const second = serveOffers(r.kernel, { store, now: () => T0 + NOTES_EVERY_MS + 60_000, log: () => {} });
  assert.equal(second.asked, 0);
  const waiting = r.api.kernel.openSuggestions();
  assert.ok(waiting.ok);
  for (const open of waiting.value)
    assert.ok((await r.api.decide({ id: open.id as string, decide: { option: 'reject', reason: 'Not now.' } } as never, OWNER)).ok);
  const third = serveOffers(r.kernel, { store, now: () => T0 + 2 * NOTES_EVERY_MS + 120_000, log: () => {} });
  /* FIVE ADDRESSES AND JO'S LINK TO OXBOW: six questions over the nights, each asked once. */
  assert.equal(first.asked + second.asked + third.asked, 6);
  assert.equal(new Set(r.filed.map((f) => f.question)).size, 6);
});

test("A RUN'S HANDOFF IS READ FOR NAMES: one is a question linked to the run's project, never a row, and a run's first title is not read", async () => {
  const r = await record();
  const store = openSqlite();
  assert.ok(r.api.kernel.create('session', { doing: 'Menu proofs', next: 'Send the proofs to Mateo once he signs off.', agent: 'claude', state: 'active' }, { actor: 'p_owner', stamp: { project: 'projects#1' } }).ok);
  assert.ok(r.api.kernel.create('session', { doing: 'Claude Code in Oxbow', agent: 'claude', state: 'active' }, { actor: 'p_owner', stamp: { project: 'projects#1' } }).ok);
  const asked: MentionsInput[] = [];
  const oxbow = reader(asked);
  const mentions = async (input: MentionsInput) => {
    const said = await oxbow(input);
    const run = input.notes.find((n) => n.kind === 'run');
    const more = run ? [{ note: run.id, name: 'Mateo', type: 'person', sentence: 'Send the proofs to Mateo once he signs off.', relation: true }] : [];
    return { ok: true as const, value: { mentions: [...(said.value.mentions as unknown[]), ...more] } };
  };
  const out = await serveNotes(r.kernel, { mentions, meter: meter().understand!, store, now: () => T0, log: () => {} });

  assert.deepEqual(out, { ran: true, read: 3, asked: 1 });
  const runs = asked[0]!.notes.filter((n) => n.kind === 'run');
  assert.deepEqual(runs.map((n) => [n.about, n.text]), [['Oxbow', 'Menu proofs Send the proofs to Mateo once he signs off.']]);
  assert.equal(r.filed[0]!.question, 'Add 2 names to People? Ahmed and Mateo, named in the note on Oxbow and a run on Oxbow.');
  assert.deepEqual((r.filed[0]!.body.rows as unknown[])[1], {
    name: 'Mateo',
    met: ['2026-10-06 · a run on Oxbow: "Send the proofs to Mateo once he signs off."'],
    projects: [r.oxbow.id],
  });
  const people = r.api.kernel.list({ register: 'people' });
  assert.ok(people.ok);
  assert.ok(!people.value.rows.some((p) => p.fields.name === 'Mateo'), 'a name in a handoff became a row');
  assert.match(SLASH_MENTIONS_INSTRUCTIONS, /A note of kind run is what an agent said it was doing and its next step/u);
});

test('THE OFFERS NEED NO MODEL: a host with none still offers what the notes spell out, and leases nothing', async () => {
  const r = await record();
  await serveModelJobs(r.api, { inference: undefined, meter: meter(), now: () => T0, store: openSqlite(), log: () => {} });
  const open = r.api.kernel.governance('suggestion', { apart: 'with' });
  assert.ok(open.ok);
  /* SETTLED AS IT IS FILED, since it only arranges the owner's own row (the Handled list): nothing waits on Decide, and Jo is linked. */
  assert.equal(open.value.length, 0, 'the link for Jo waits on Decide');
  const linked = r.api.kernel.list({ register: 'people', where: 'name is "Jo Okonkwo"' });
  assert.ok(linked.ok);
  assert.deepEqual(linked.value.rows[0]?.fields.projects, [r.oxbow.id], 'the link for Jo was not made');
});
