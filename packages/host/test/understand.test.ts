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
  mentionsKept,
  NOTES_EVERY_MS,
  RESOLVE_PAIRS_MOST,
  scrubbed,
  serveNotes,
  understandingOver,
  type MentionsInput,
  type NotesKernel,
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
    hash: 'h-rohan',
    a: { name: 'Rohan Mehta', kind: 'person', domain: 'encore.example', masked: 's••••••••••a@encore.example', seen: ['6 commits in Encore', `token ${FAKE_KEY}`] },
    b: { name: 'rohanmehta', kind: 'person', domain: 'gmail.com', masked: '12', seen: ['mail from rohan.mehta@gmail.com'] },
  },
  { hash: 'h-priya', a: { name: 'Priya Raman', kind: 'person', seen: ['Prism'] }, b: { name: 'Priya B', kind: 'person', seen: ['Encore'] } },
  { hash: 'h-org', a: { name: 'Talabat', kind: 'organisation', seen: ['bank text'] }, b: { name: 'Talabat Ahmed', kind: 'person', seen: [] } },
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
  assert.ok(!sent.includes('h-rohan') && !sent.includes('h-priya'), "the record's hashes went to the model");
  const [p1, p2] = asked[0]!.pairs;
  assert.deepEqual(p1!.a, { name: 'Rohan Mehta', kind: 'person', domain: 'encore.example', local: 12, seen: ['6 commits in Encore', 'token [hidden]'] });
  assert.deepEqual(p1!.b, { name: 'rohanmehta', kind: 'person', local: 12, seen: ['mail from [address]'] });
  assert.equal(p2!.a.name, 'Priya Raman');
  /* A PERSON BESIDE AN ORGANISATION IS NEVER ASKED ABOUT. */
  assert.equal(asked[0]!.pairs.length, 2);

  assert.equal(acked.length, 1);
  assert.equal(acked[0]!.state, 'done');
  assert.deepEqual(acked[0]!.result, {
    verdicts: [
      { hash: 'h-org', same: false, confidence: 0 },
      { hash: 'h-rohan', same: true, confidence: 0.94 },
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
      { hash: 'h-rohan', same: true, confidence: 0.94 },
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

test(`UNDERSTANDING SPENDS ITS OWN ${UNDERSTAND_ASKS_MONTH} AND NO MORE, counted inside the work's month and never the headlines'`, async () => {
  const { sql, meter: record } = ledger();
  const understanding = understandingOver({ resolve: async () => ({ verdicts: {} }), mentions: async () => ({ mentions: [] }) }, record);
  for (let i = 0; i < UNDERSTAND_ASKS_MONTH; i++) assert.ok((await understanding.resolve({ pairs: [] })).ok);
  const refused = await understanding.mentions({ notes: [] });
  assert.ok(!refused.ok);
  assert.equal('refusal' in refused && refused.refusal.code, 'SLASH_BUDGET_SPENT');

  const work = backgroundMeter(sql);
  assert.equal(work.understand?.cap, UNDERSTAND_ASKS_MONTH);
  assert.equal(work.understand?.spent(MONTH), UNDERSTAND_ASKS_MONTH);
  assert.equal(work.spent(MONTH), UNDERSTAND_ASKS_MONTH);
  assert.equal(backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').spent(MONTH), 0);
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
  assert.ok(!out.ok && 'refusal' in out && out.refusal.code === 'SLASH_REFUSED');
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
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', projects: 'projects' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
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

const BAKE_NOTE = 'Ahmed runs our deliveries every weekend. I read an interview with Adam Mosseri about creators. Jo Okonkwo drew the new menu. Lina once mentioned a cafe.';

async function record() {
  let now = T0 - 3_600_000;
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now } });
  const installed = await api.kernel.install([PROJECTS, PEOPLE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const bake = await api.create({ register: 'projects', fields: { name: 'Bake', note: BAKE_NOTE } }, OWNER);
  assert.ok(bake.ok, JSON.stringify(bake));
  const jo = await api.create({ register: 'people', fields: { name: 'Jo Okonkwo', email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly.' } }, OWNER);
  assert.ok(jo.ok, JSON.stringify(jo));
  const filed: { question: string; body: Record<string, unknown> }[] = [];
  const kernel: NotesKernel = {
    registers: () => api.kernel.registers(),
    list: (q) => api.kernel.list(q),
    meetsList: () => api.kernel.meetsList(),
    propose: (p, w, d) => {
      const out = api.kernel.propose(p, w, d);
      if (out.ok) filed.push({ question: p.question, body: p.body });
      return out;
    },
  };
  return { api, kernel, filed, bake: bake.value, at: (ms: number) => (now = ms) };
}

/** What the model says about the Bake note: one relation, one public figure, one already in People, one only mentioned, one invented. */
function reader(log: MentionsInput[]) {
  return async (input: MentionsInput) => {
    log.push(input);
    const bake = input.notes.find((n) => n.about === 'Bake');
    if (!bake) return { ok: true as const, value: { mentions: [] } };
    return {
      ok: true as const,
      value: {
        mentions: [
          { note: bake.id, name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries every weekend.', relation: true },
          { note: bake.id, name: 'Adam Mosseri', type: 'public_figure', sentence: 'I read an interview with Adam Mosseri about creators.', relation: true },
          { note: bake.id, name: 'Jo Okonkwo', type: 'person', sentence: 'Jo Okonkwo drew the new menu.', relation: true },
          { note: bake.id, name: 'Lina', type: 'person', sentence: 'Lina once mentioned a cafe.', relation: false },
          { note: bake.id, name: 'Marcus Wright', type: 'person', sentence: 'Marcus Wright bakes the bread.', relation: true },
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
  assert.deepEqual(asked[0]!.notes.map((n) => [n.about, n.kind]).sort(), [['Bake', 'project'], ['Jo Okonkwo', 'person']]);
  assert.ok(!JSON.stringify(asked[0]).includes('@'), 'an address went to the model');

  assert.equal(r.filed.length, 1);
  assert.equal(r.filed[0]!.question, 'Add Ahmed to People? Your note on Bake names them.');
  assert.ok(!r.filed[0]!.question.includes('—'));
  assert.deepEqual(r.filed[0]!.body, {
    register: 'people',
    rows: [{ name: 'Ahmed', met: ['2026-10-06 · note on Bake: "Ahmed runs our deliveries every weekend."'], projects: [r.bake.id] }],
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

  /* THE BAKE NOTE CHANGES: it is read again, and Ahmed, already asked about, is not asked about again. */
  r.at(T0 + NOTES_EVERY_MS + 120_000);
  const moved = await r.api.update({ register: 'projects', seq: r.bake.seq!, patch: { note: `${BAKE_NOTE} We open on Sundays now.` }, version: r.bake.version }, OWNER);
  assert.ok(moved.ok, JSON.stringify(moved));
  now = T0 + 2 * NOTES_EVERY_MS + 180_000;
  const out = await serveNotes(r.kernel, deps);
  assert.equal(asked.length, 2);
  assert.deepEqual(asked[1]!.notes.map((n) => n.about), ['Bake']);
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
  const handed = new Map([['n1', { about: 'Bake', text: 'Ahmed runs our deliveries. Bake opens at eight.' }]]);
  const kept = mentionsKept(
    {
      mentions: [
        { note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true },
        { note: 'n1', name: 'Ahmed', type: 'person', sentence: 'Ahmed runs our deliveries.', relation: true },
        { note: 'n1', name: 'Bake', type: 'project', sentence: 'Bake opens at eight.', relation: true },
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
  const open = r.api.kernel.governance('suggestion', {});
  assert.ok(open.ok);
  assert.equal(open.value.length, 1, 'the one question about Ahmed is on Decide');
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
