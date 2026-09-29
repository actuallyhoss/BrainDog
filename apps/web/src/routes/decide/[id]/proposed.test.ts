/**
 * What a `change` or a `pattern` proposal previews on Decide: each page, list, rule or look it would put
 * on the screen, in a person's words, and for an automation what starts it and what it would do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DatabaseSync } from 'node:sqlite';

import { egressOf, openRecord } from '@braindog/kernel';

import '../../../lib/record/fixtures/fill.ts';
import { sayStep, sayTrigger, words } from '../../../lib/flow/flow.ts';
import { REGISTERS } from '../../../lib/record/api.ts';
import type { Fetch } from '../../../lib/record/page-live.ts';
import { drawnOf, previewOf, proposedOf } from './proposed.ts';

test('a page says where it lands in the sidebar and what it shows', () => {
  const out = proposedOf('change', {
    declaration_id: 'page.reading',
    to: {
      id: 'page.reading',
      kind: 'page',
      body: { title: 'Reading list', nav: { section: 'Studies', order: 20 }, requires: ['register.books'], blocks: [{ kind: 'table', heading: 'Still to read' }, { kind: 'stat' }] },
    },
  });
  assert.equal(out?.appears.length, 1);
  const [page] = out!.appears;
  assert.equal(page?.kind, 'Page');
  assert.equal(page?.title, 'Reading list');
  assert.deepEqual(page?.lines, [
    { label: 'In the sidebar', value: 'Under Studies' },
    { label: 'Shows', value: 'Still to read, Stat' },
    { label: 'Reads from', value: 'Books' },
  ]);
});

test('a module is every declaration it installs, and a look carries its accent', () => {
  const out = proposedOf('change', {
    declaration_id: 'register.assignments',
    to: {
      declarations: [
        { id: 'register.assignments', kind: 'register', body: { title: 'Assignments', fields: [{ id: 'due', label: 'Due' }, { id: 'course_name' }] } },
        { id: 'theme.calm', kind: 'theme', body: { seed: { accent: 'oklch(0.62 0.12 160)' }, scheme: 'both' } },
      ],
    },
  });
  assert.deepEqual(out?.appears.map((a) => [a.kind, a.title]), [['List', 'Assignments'], ['Look', 'Calm']]);
  assert.deepEqual(out?.appears[0]?.lines, [{ label: 'Fields', value: 'Due, Course name' }]);
  assert.equal(out?.appears[1]?.accent, 'oklch(0.62 0.12 160)');
});

test('a pattern is the rule it would install, with how many arrivals it was drawn from', () => {
  const out = proposedOf('pattern', { ingest: { ingest: 'card_receipts', channel: 'email', writes: { register: 'obligations' } }, samples: ['r1', 'r2', 'r3'] });
  assert.equal(out?.samples, 3);
  assert.deepEqual(out?.appears[0]?.lines, [
    { label: 'Comes from', value: 'email' },
    { label: 'Files into', value: 'Obligations' },
  ]);
});

/* THE CANVAS'S OWN SENTENCES, called here and not typed out, because the promise is that Decide and the canvas say one
   rule in one set of words. It was typed out at first, and while this was being written the canvas renamed its branch
   from "Only if" with arms "Then" and "Otherwise" to "If" with "If so" and "If not": the literal failed, and Decide,
   which imports the words, had already followed. */
test('a rule is what starts it and each step as a sentence, with a branch read as its two arms', () => {
  const steps = [
    { tag: 'late' },
    { if: { field: 'amount', gt: 70 }, then: [{ notify: { say: 'A big one is late' } }], else: [{ note: 'Small, left alone' }] },
    { call: { ingest: 'dunning', as: 'sent' } },
    { script: { id: 'tidy', as: 'queued' } },
    { script: { id: 'tidy' } },
  ];
  const on = { written: { register: 'invoices', op: ['update' as const], fields: ['state'] } };
  const out = proposedOf('change', {
    declaration_id: 'rule.chase',
    to: { id: 'rule.chase', kind: 'rule', body: { rule: 'chase', name: 'Chase late invoices', on, when: 'state is late', steps } },
  });
  const [rule] = out?.appears ?? [];
  assert.deepEqual([rule?.kind, rule?.title], ['Rule', 'Chase late invoices']);
  assert.deepEqual(rule?.lines, [
    { label: 'Starts', value: sayTrigger(on) },
    { label: 'Only when', value: 'state is late' },
    { label: 'How it runs', value: words.asRun },
    { label: 'Step 1', value: sayStep(steps[0]!) },
    { label: 'Step 2', value: sayStep(steps[1]!) },
    { label: `Step 2, ${words.then.toLowerCase()} 1`, value: 'Tell you: A big one is late' },
    { label: `Step 2, ${words.otherwise.toLowerCase()} 1`, value: 'Add a note: Small, left alone' },
    /* A CALL RUNS: the run waits for its answer and goes on, so the step says what it calls and nothing more. */
    { label: 'Step 3', value: sayStep(steps[2]!) },
    /* A SCRIPT STEP RUNS SINCE `e6010208`, and this screen still ended it "Not in this build: a run stops here", as it
       once ended a call, where the record's dry run says the run goes on. Measured red first on that sentence. What the owner
       reads instead is the dry run's: the run does not wait, and the things that stop it.
       WHAT `as:` KEEPS IS SAID ONCE, BY THE CANVAS. Decide carried a second sentence, "What is kept as queued is the id
       of its queued run, not what the script answers", because the canvas's line before it said "keeping the answer
       as queued". The canvas says the id now (`flow-script-as.test.ts`), and the line read both. */
    {
      label: 'Step 4',
      value: `Run the script tidy, keeping the id of its queued run as queued. The run goes on without waiting for it: what the script writes lands when this host runs it. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused, or if its input hands on what a secret or file field holds.`,
    },
    {
      label: 'Step 5',
      value: `${sayStep(steps[4]!)}. The run goes on without waiting for it: what the script writes lands when this host runs it. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused, or if its input hands on what a secret or file field holds.`,
    },
  ]);
});

test('a rule with no trigger of its own starts on its list and runs inside the write', () => {
  const out = proposedOf('change', { to: { id: 'rule.flag', kind: 'rule', body: { rule: 'flag', register: 'invoices', then: [{ tag: 'new' }] } } });
  assert.deepEqual(out?.appears[0]?.title, 'Flag');
  assert.deepEqual(out?.appears[0]?.lines, [
    { label: 'Starts', value: 'When a row in invoices is added or changed' },
    { label: 'How it runs', value: words.inline },
    { label: 'Step 1', value: 'Tag it: new' },
  ]);
});

test('a script says where it calls out, what it may send, and carries its source to be read', () => {
  const body = {
    script: 'fx',
    title: 'Exchange rates',
    runs: { every: '1h' },
    egress: ['https://api.rates.example'],
    keys: ['Rates'],
    reads: ['holdings'],
    writes: ['series.fx'],
    source: 'export default async (ctx) => {\n  return ctx.fetch("https://api.rates.example/today");\n}',
  };
  const out = proposedOf('change', { to: { id: 'script.fx', kind: 'script', body } });
  const [script] = out?.appears ?? [];
  assert.deepEqual([script?.kind, script?.title], ['Script', 'Exchange rates']);
  /* THE RECORD'S OWN EGRESS LINE, the one the owner arms on accept (`approvalLines`), less the shouted lead the label says.
     Asked of the kernel and not typed out, for the canvas's reason above: its wording grew a clause about the vault
     while this test was being written. */
  const egress = egressOf(body)!;
  assert.match(egress.line, /^CALLS OUT api\.rates\.example · every 1h · key "Rates"/u);
  assert.deepEqual(script?.lines, [
    { label: 'Calls out', value: egress.line.slice('CALLS OUT '.length) },
    { label: 'May send', value: egress.key_line },
  ]);
  assert.equal(script?.source, body.source);
  const quiet = proposedOf('change', { to: { id: 'script.tidy', kind: 'script', body: { script: 'tidy', runs: { rule: true }, egress: [], keys: [], reads: [], writes: ['notes'], source: 'x' } } });
  assert.deepEqual(quiet?.appears[0]?.lines, [{ label: 'Calls out', value: 'Nothing outside this record' }]);
});

/* THE RECORD FILES THE LINE WITH THE VAULT IN HAND (`egressOf(d.body, titleOfRow, opensOf)` where a change is filed), and
   this screen cannot reach the vault: worked out again here it said `key "Rates" to the host its vault entry opens`
   where the record had filed `to api.rates.example`, so the one pairing the owner approves was said vaguer on the
   screen than on the proposal. */
test('a script the record filed an egress line for is said in that line, with the host each key goes to', () => {
  const body = { script: 'fx', runs: { every: '1h' }, egress: ['https://api.rates.example'], keys: ['Rates'], reads: [], source: 'x' };
  const line = 'CALLS OUT api.rates.example · every 1h · key "Rates" to api.rates.example';
  const filed = { to: { id: 'script.fx', kind: 'script', body }, egress: [{ ingest: 'fx', channel: 'script', line, key_line: null }] };
  assert.deepEqual(proposedOf('change', filed)?.appears[0]?.lines, [{ label: 'Calls out', value: line.slice('CALLS OUT '.length) }]);
  /* ANOTHER SCRIPT'S LINE IS NOT THIS ONE'S, and an action's is not a script's: those are worked out from the body. */
  const other = { ...filed, egress: [{ ingest: 'rates', channel: 'pull', line, key_line: null }, { ingest: 'fy', channel: 'script', line, key_line: null }] };
  assert.deepEqual(proposedOf('change', other)?.appears[0]?.lines, [{ label: 'Calls out', value: egressOf(body)!.line.slice('CALLS OUT '.length) }]);
});

test('a choice and a rowset have drawings of their own, and a change with nothing in it previews nothing', () => {
  assert.equal(proposedOf('options', { options: [] }), null);
  assert.equal(proposedOf('rowset', { register: 'things', rows: [] }), null);
  assert.equal(proposedOf('change', { declaration_id: 'x', to: {} }), null);
});

/* ── what a digest and a pattern send out ───────────────────────────── */

const POLL_BODY = { ingest: 'gold', channel: 'poll', url: 'https://api.goldapi.io/v1/xau', every: '1h', grant: 'goldapi', extract: { what: { after: 'rate ' } }, writes: { register: 'notes' } };
const HOOK_BODY = {
  digest: 'out',
  name: 'Weekly out',
  schedule: { day: 'mon', at: '08:00' },
  channels: ['webhook'],
  webhook: { url: 'https://collector.example.com/in' },
  sections: [{ heading: 'Rows', source: 'register.notes', as: 'table' }],
};

/* A DIGEST WAS A TITLE AND NOTHING ELSE. `appearsOf` drew every kind it did not know as `{ kind, title, lines: [] }`, so
   the owner accepting a weekly summary read "Summary · Out" and nothing of the address it posts his rows to. */
test('a digest that posts out says where, when and what, in the line the record filed', () => {
  const line = egressOf(HOOK_BODY)!.line;
  const filed = { to: { id: 'digest.out', kind: 'digest', body: HOOK_BODY }, egress: [{ ingest: 'out', channel: 'digest', line, key_line: null }] };
  const [digest] = proposedOf('change', filed)?.appears ?? [];
  assert.deepEqual([digest?.kind, digest?.title], ['Summary', 'Weekly out']);
  assert.deepEqual(digest?.lines, [{ label: 'Calls out', value: line.slice('CALLS OUT '.length) }]);
  assert.match(line, /collector\.example\.com/u);
  /* AND ONE THAT STAYS WITH THE OWNER SAYS SO, as a script that fetches nothing does. */
  const quiet = proposedOf('change', { to: { id: 'digest.in', kind: 'digest', body: { ...HOOK_BODY, channels: ['email'], webhook: undefined } } });
  assert.deepEqual(quiet?.appears[0]?.lines, [{ label: 'Calls out', value: 'Nothing outside this record' }]);
});

/* A PATTERN'S INGEST COMES IN TWO SHAPES, and Decide drew one. `slash/src/jobs.ts` files the bare body; an agent files the
   declaration, and drawn as a body the declaration read its `ingest`, `channel` and `writes` off the wrapper, where there
   are none, so a pattern's poll was a title-less "Rule for what comes in" with no host and no key. */
test('a pattern draws its ingest as a bare body or as a declaration, with the line the record filed and its key', () => {
  /* FOR A PROJECT'S POLL, so the line the record filed and this screen's own reading differ: the record names the project
     and the screen can only say its row id. Filed with no project, the two were the same string, and drawing the body's
     reading with the filed lines ignored altogether still passed. */
  const body = { ...POLL_BODY, project: 'prj_7' };
  const filed = egressOf(body, () => 'Lanternly')!;
  const egress = [{ ingest: 'gold', channel: 'poll', line: filed.line, key_line: filed.key_line }];
  const want = [
    { label: 'Comes from', value: 'api.goldapi.io' },
    { label: 'How often', value: '1h' },
    { label: 'Calls out', value: filed.line.slice('CALLS OUT '.length) },
    { label: 'May send', value: 'gold runs for the project Lanternly and sends the key "goldapi".' },
    { label: 'Files into', value: 'Notes' },
  ];
  const declared = proposedOf('pattern', { ingest: { id: 'ingest.gold', kind: 'ingest', body }, samples: ['r1'], egress });
  assert.deepEqual([declared?.appears[0]?.title, declared?.appears[0]?.lines], ['Gold', want]);
  assert.match(filed.line, /grant "goldapi"/u);
  const bare = proposedOf('pattern', { ingest: body, samples: ['r1'], egress });
  assert.deepEqual([bare?.appears[0]?.title, bare?.appears[0]?.lines], ['Gold', want]);
});

/* A PATTERN QUEUED BEFORE THE KERNEL HELD IT TO AN INGEST can still hold a rule, and the accept refuses it; drawn as an
   ingest it would say nothing true, so it is drawn as what it is. */
test('a pattern that holds another kind is drawn as that kind', () => {
  const out = proposedOf('pattern', { ingest: { id: 'rule.flag', kind: 'rule', body: { rule: 'flag', register: 'invoices', then: [{ tag: 'new' }] } }, samples: ['r1'] });
  assert.equal(out?.appears[0]?.kind, 'Rule');
});

/* ── the page itself, drawn by the record before anybody accepts it ──────────────────────── */

const CLOCK = Date.UTC(2026, 8, 24, 9);
const BASE = 'http://record.test';
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function sqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

/**
 * THE RECORD'S `previewPage`, OVER A REAL KERNEL. This package does not depend on `@braindog/record`, so the stub does
 * what that method does for an owner who reads every list: the install's lint, then each block through `kernel.block`.
 * The blocks drawn here are therefore the shapes a record sends, not shapes typed out to match the drawing.
 */
async function drawing(): Promise<{ io: Fetch; asked: { method: string; verb: string; args: Record<string, unknown> }[] }> {
  const k = await openRecord(sqlite(), { now: () => CLOCK });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(REGISTERS.things)) as Record<string, unknown>;
  const fields = (body.fields as { id: string }[]).filter((f) => f.id !== 'repos' && f.id !== 'folders');
  const put = await k.install([{ id: 'register.things', kind: 'register', body: { ...body, fields } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const name of ['Kiln', 'Portage', 'Ledger']) assert.ok(k.create('things', { name, lane: 'building' }, { actor: 'p_1' }).ok);
  const asked: { method: string; verb: string; args: Record<string, unknown> }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    asked.push({ method, verb: init?.method ?? 'GET', args });
    if (method === 'schema') {
      const decl = k.register(String(args.register));
      return reply(decl ? 200 : 404, decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No such list.' } });
    }
    if (method === 'list') return reply(200, k.list({ register: String(args.register), limit: Number(args.limit ?? 50) } as never));
    if (method === 'previewPage') {
      const page = args.body as { page: string; blocks: unknown[] };
      const fault = k.lint([{ id: `page.${page.page}`, kind: 'page', body: page } as never]);
      if (fault) return reply(400, { ok: false, refusal: fault });
      return reply(200, { ok: true, value: { ...page, read_at: new Date(CLOCK).toISOString(), blocks: page.blocks.map((b) => k.block(b as never)) } });
    }
    return reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } });
  }) as Fetch;
  return { io, asked };
}

const PAGE = { page: 'building', title: 'Building', nav: { section: 'Work', order: 5 }, blocks: [{ kind: 'table', source: 'register.things', heading: 'Being built' }] };

test('A PROPOSED PAGE CARRIES ITS BODY, so the screen can ask the record to draw it and not only to name it', () => {
  const out = proposedOf('change', { declaration_id: 'page.building', to: { id: 'page.building', kind: 'page', body: PAGE } });
  assert.deepEqual(out?.appears[0]?.page, PAGE);
  /* AND ONLY A PAGE DOES: a list or a rule has no drawing of its own to ask for. */
  const list = proposedOf('change', { declaration_id: 'register.books', to: { id: 'register.books', kind: 'register', body: { title: 'Books', fields: [] } } });
  assert.equal(list?.appears[0]?.page, undefined);
});

test('THE RECORD DRAWS THE PROPOSED PAGE: a table over three things arrives as three rows, asked once, as a POST', async () => {
  const { io, asked } = await drawing();
  const drawn = await drawnOf(PAGE, BASE, io);
  assert.equal(drawn.from, 'live', JSON.stringify(drawn));
  if (drawn.from !== 'live') return;
  assert.equal(drawn.blocks.length, 1);
  const [table] = drawn.blocks;
  assert.equal(table?.cannot, undefined);
  assert.deepEqual(table?.refusals, []);
  assert.equal(table?.rows.length, 3);
  assert.equal(drawn.now, CLOCK);
  const previews = asked.filter((a) => a.method === 'previewPage');
  assert.deepEqual(
    previews.map((a) => [a.verb, a.args]),
    [['POST', { body: PAGE }]],
  );
});

test("A BODY THE RECORD REFUSES IS SAID IN THE RECORD'S SENTENCE, and a host older than the method draws the lines alone", async () => {
  const { io } = await drawing();
  const refused = await drawnOf({ ...PAGE, blocks: [{ kind: 'nosuch' }] }, BASE, io);
  assert.equal(refused.from, 'refused');
  assert.match(refused.from === 'refused' ? refused.fix : '', /nosuch/u);
  /* A HOST THAT DOES NOT ROUTE IT is not a refusal of this page: the lines above say what they always said. */
  const older = (async () => reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called previewPage.' } })) as unknown as Fetch;
  assert.deepEqual(await drawnOf(PAGE, BASE, older), { from: 'none' });
});

test('A BLOCK THE RECORD HELD BACK IS DRAWN AS ITS REFUSAL, never filled from the sample', async () => {
  const held = (async () =>
    reply(200, {
      ok: true,
      value: { ...PAGE, read_at: new Date(CLOCK).toISOString(), blocks: [{ kind: 'table', heading: 'Being built', rows: [], matched: 0, refusals: [{ code: 'FORBIDDEN', fix: 'You cannot read Things.', at: 'source' }] }] },
    })) as unknown as Fetch;
  const drawn = await drawnOf(PAGE, BASE, held);
  assert.equal(drawn.from, 'live');
  if (drawn.from !== 'live') return;
  assert.deepEqual(drawn.blocks[0]?.rows, []);
  /* THE RECORD'S SENTENCE, which is what the page's drawing reads off a refused block (`blockOf` keeps each `fix`). */
  assert.deepEqual(drawn.blocks[0]?.refusals, ['You cannot read Things.']);
});

test('A CHANGE CARRIES WHAT previewChange IS ASKED WITH, and a pattern carries none', () => {
  const to = { id: 'page.building', kind: 'page', body: PAGE };
  const out = proposedOf('change', { declaration_id: 'page.building', to, about: 'things#1' });
  assert.deepEqual(out?.change, { to, about: 'things#1' });
  assert.equal(out?.appears[0]?.id, 'page.building');
  const pattern = proposedOf('pattern', { ingest: { ingest: 'card_receipts', channel: 'email' }, samples: [] });
  assert.equal(pattern?.change, undefined);
});

test('THE WHOLE CHANGE IS DRAWN AS IT WOULD STAND, beside the page as it is, and a host without the method says none', async () => {
  const table = (rows: number) => ({ kind: 'table', heading: 'Being built', rows: [], matched: rows, refusals: [] });
  const asked: unknown[] = [];
  const io = (async (_url: string | URL | Request, init?: RequestInit) => {
    asked.push(JSON.parse(String(init?.body ?? '{}')));
    return reply(200, {
      ok: true,
      value: {
        pages: [
          { id: 'page.building', slug: 'building', title: 'Building', nav: null, layout: { rail: 4 }, icon: null, about: null, blocks: [table(3)], was: [table(1)] },
          { id: 'page.fresh', slug: 'fresh', title: 'Fresh', nav: null, layout: null, icon: null, about: null, blocks: [], was: null },
        ],
      },
    });
  }) as unknown as Fetch;
  const change = { to: { declarations: [{ id: 'page.building', kind: 'page', body: PAGE }] } };
  const out = await previewOf(change, BASE, io);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(asked[0], change);
  const [built, fresh] = out.pages;
  assert.equal(built?.got.page.page.title, 'Building');
  /* THE RAIL COMES WITH IT, because a page judged without its rail is judged wrong. */
  assert.deepEqual(built?.got.page.page.layout, { rail: 4 });
  assert.equal(built?.was?.length, 1);
  assert.equal(fresh?.was, null);
  const older = (async () => reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called previewChange.' } })) as unknown as Fetch;
  assert.deepEqual(await previewOf(change, BASE, older), { from: 'none' });
});
