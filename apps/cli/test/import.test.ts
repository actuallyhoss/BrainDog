/**
 * `braindog import legacy`: the mapping of a synthetic export, and the import applied twice to a record kept in
 * memory, which must update and never add a second row. Every value is made up (`legacy-export.ts`).
 *
 * WHAT `memoryRecord` CANNOT HOLD, SAID HERE SO NOBODY READS THESE AS THE WHOLE STORY. It accepts any field on any
 * register, so the mapping is checked against the real declarations by `tools/gates/import.mjs` and not here; and its
 * `list` and `governance` answer every row in one page whatever limit or cursor they are given, so neither of the two
 * paging failures found on 2026-09-20 could fail a test in this file. Those are measured against the kernel in
 * `import-at-scale.test.ts`. What is left here is the planner, the report and the command's own refusals, which is
 * what a fake door can honestly be asked about.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { draftSetup, KEY_PREFIX, ORDER, planLegacyTool, readLegacyTool, readSetup, spoken, type Plan, type Setup } from '../src/legacy.ts';
import { applyPlan, importCommand, runOf, said, sinceSaid, type Door, type Report } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';
import { syntheticExport, syntheticSetup } from './legacy-export.ts';

const TODAY = '2026-09-17';
const USAGE_SAID =
  'braindog import takes legacy <export.json> [--setup <setup.json>] [--host <host>] [--dry-run], or legacy <export.json> --draft-setup, or legacy --since <day or last>.';
const plan = (o?: Parameters<typeof syntheticExport>[0]): Plan => planLegacyTool(syntheticExport(o), TODAY);
const row = (p: Plan, key: string) => p.rows.find((r) => r.key === key);
const skippedItems = (p: Plan, reason: RegExp) => p.skipped.filter((s) => reason.test(s.reason)).flatMap((s) => s.items);

type Stored = { id: string; register: string; seq: number; version: number; fields: Record<string, unknown> };

/** A record in memory: the lists it holds, every write it took, and the questions asked. */
function memoryRecord(registers: string[]) {
  const rows: Stored[] = [];
  const asked: { id: string; body: Record<string, unknown>; question: string }[] = [];
  const writes: string[] = [];
  let n = 0;
  const door: Door = {
    schema: async (register) => (registers.includes(register) ? { ok: true, value: { register } } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } }),
    list: async ({ register }) => ({ ok: true, value: { rows: rows.filter((r) => r.register === register).map((r) => structuredClone(r)), cursor: null } }),
    create: async ({ register, fields }) => {
      if (register === 'learnings' && typeof fields.lesson === 'string' && fields.lesson.length < 12) return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Too short.' } };
      const seq = rows.filter((r) => r.register === register).length + 1;
      const made = { id: `e_${String(++n)}`, register, seq, version: 1, fields: structuredClone(fields) };
      rows.push(made);
      writes.push(`create ${register}`);
      return { ok: true, value: structuredClone(made) };
    },
    update: async ({ register, seq, patch, version }) => {
      const at = rows.find((r) => r.register === register && r.seq === seq);
      if (!at) return { ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'No such row.' } };
      if (version !== undefined && version !== at.version) return { ok: false, conflict: { current: at } as never };
      Object.assign(at.fields, structuredClone(patch));
      at.version++;
      writes.push(`update ${register} ${Object.keys(patch).join(',')}`);
      return { ok: true, value: structuredClone(at) };
    },
    governance: async () => ({ ok: true, value: asked.map((a) => ({ id: a.id, status: 'open', body: a.body })) }),
    propose: async ({ question, body }) => {
      const id = `SG${String(asked.length + 1)}`;
      asked.push({ id, question, body });
      writes.push('propose');
      return { ok: true, value: { id } };
    },
  };
  return { door, rows, asked, writes };
}

/* EVERY LIST `ORDER` NAMES, the four money-core 1.2.0 added among them: a record short of those four is the case
   `a record without the founder and agents lists` and the Estate test set up on purpose, not the ordinary one. */
const ALL = [
  'things',
  'people',
  'tracks',
  'tasks',
  'datapoints',
  'learnings',
  'skills',
  'tools',
  'credentials',
  'accounts',
  'categories',
  'obligations',
  'transactions',
  'recurring',
  'installments',
  'services',
  'organisations',
  'session',
];

test('an export is read only when it has a db with projects', () => {
  assert.equal(readLegacyTool('not json').ok, false);
  assert.equal(readLegacyTool('{"tasks":[]}').ok, false);
  assert.equal(readLegacyTool(JSON.stringify(syntheticExport())).ok, true);
});

test('projects keep their lane, mark, repos, plan and their own decisions, and their numbers become readings in whole dollars', () => {
  const p = plan();
  const lanternly = row(p, 'legacy:project:lanternly')!;
  assert.equal(lanternly.register, 'things');
  assert.deepEqual({ ...lanternly.fields, note: undefined }, { name: 'Lanternly', lane: 'earning', hue: 212, mark: '◆', repos: ['example/lanternly-app', 'lanternly-app'], note: undefined });
  /* THE BARE NAME A SESSION WORKED IN is carried on the project whose repository ends in it, so the record places the run. */
  const note = String(lanternly.fields.note);
  for (const part of ['A reading-light subscription', '## Plan', '- Ship the annual plan', '## Blockers', '### D3: Monthly or annual first?', 'Why: It lifts cash']) assert.ok(note.includes(part), part);
  assert.ok(!note.includes('D4'), 'a decision on no project is not put on a project page');
  assert.equal(row(p, 'legacy:project:tidepool')!.fields.lane, 'building');
  assert.equal(row(p, 'legacy:project:quill')!.fields.lane, 'earning');
  assert.equal(row(p, 'legacy:project:moth')!.fields.lane, 'parked');
  assert.equal(row(p, 'legacy:project:oldsite')!.fields.lane, 'retired');

  const mrr = row(p, 'legacy:datapoint:lanternly:Monthly revenue:2026-09-15')!;
  assert.deepEqual(mrr.fields, { name: 'Monthly revenue, Lanternly', value: 1840, unit: 'USD', thing: { $ref: 'legacy:project:lanternly' }, at: '2026-09-15T03:20:00.000Z', source: 'typed' });
  assert.equal(row(p, 'legacy:datapoint:quill:Monthly revenue:2026-09-15')!.fields.value, 2500, 'a revenue written "2,500" is read as a number');
  assert.equal(row(p, 'legacy:datapoint:quill:Monthly revenue:2026-09-15')!.fields.name, 'Monthly revenue, Quill Consulting', 'two projects never share one tile on the Dashboard');
  assert.equal(row(p, 'legacy:datapoint:tidepool:Monthly revenue:2026-09-15')!.fields.value, 0);
  assert.equal(row(p, 'legacy:datapoint:lanternly:Revenue, next twelve months:2026-09-15')!.fields.value, 24000);
  assert.equal(row(p, 'legacy:datapoint:lanternly:subscribers:2026-09-15')!.fields.value, 312);
  /* A METRIC'S KEY IS SAID IN WORDS, and a percentage keeps its unit. */
  assert.equal(row(p, 'legacy:datapoint:lanternly:subscribers:2026-09-15')!.fields.name, 'Subscribers, Lanternly');
  assert.deepEqual({ name: row(p, 'legacy:datapoint:lanternly:churn_pct:2026-09-15')!.fields.name, unit: row(p, 'legacy:datapoint:lanternly:churn_pct:2026-09-15')!.fields.unit }, { name: 'Churn, Lanternly', unit: '%' });
  assert.deepEqual(spoken('activeUsers'), { name: 'Active users', unit: '' });
  assert.deepEqual(spoken('pct'), { name: 'Pct', unit: '' });
  assert.equal(row(p, 'legacy:datapoint:lanternly:subscribers:2026-09-15')!.fields.unit, undefined, 'no unit is left out, not sent empty, so a second import reads it unchanged');
  assert.deepEqual(skippedItems(p, /not a single number/u), ['lanternly: plans']);
});

test('threads, tasks and people keep their links, lanes and references', () => {
  const p = plan();
  assert.deepEqual(row(p, 'legacy:track:lanternly:annual')!.fields, { name: 'Annual plan', state: 'open', thing: { $ref: 'legacy:project:lanternly' }, note: 'Twelve months for the price of ten.\n\nTarget: 2026-10-01.' });
  assert.equal(row(p, 'legacy:track:lanternly:widgets')!.fields.state, 'holding');
  assert.equal(row(p, 'legacy:track:tidepool:beta')!.fields.state, 'done');

  const t101 = row(p, 'legacy:task:101')!.fields;
  assert.equal(t101.what, 'Write the annual plan copy');
  assert.equal(t101.by, '2026-09-25');
  assert.deepEqual(t101.track, { $ref: 'legacy:track:lanternly:annual' });
  assert.equal(t101.note, 'Was #101 in the old tool. High priority, because it blocks the launch.\n\nKeep it short.');
  assert.equal(t101.priority, 'high');
  assert.equal(t101.agent, undefined, "his lane is a task nobody else holds, which Work reads as his");
  /* THE AGENT LANE IS A TASK AN AGENT TOOK, a medium tier is Normal, and a follow-up is a step of the task it follows. */
  const t102 = row(p, 'legacy:task:102')!.fields;
  assert.deepEqual({ note: t102.note, priority: t102.priority, agent: t102.agent, parent: t102.parent }, { note: 'Was #102 in the old tool.', priority: 'normal', agent: 'claude', parent: { $ref: 'legacy:task:101' } });
  assert.equal(row(p, 'legacy:task:103')!.fields.state, 'done');
  assert.equal(row(p, 'legacy:task:103')!.fields.done_on, '2026-09-12', 'the day it was done there, not the day of the import');
  assert.equal(row(p, 'legacy:task:105')!.fields.thing, undefined, 'a task on no project is global');
  assert.equal(row(p, 'legacy:task:104'), undefined);
  assert.deepEqual(skippedItems(p, /^Deleted/u), ['#104']);

  assert.deepEqual(row(p, 'legacy:person:rivka')!.fields, { name: 'Rivka Example', role: 'collaborator', projects: [{ $ref: 'legacy:project:tidepool' }], note: 'Deal: 10% of Tidepool revenue.\n\nDraws the tiles.' });
  assert.deepEqual(row(p, 'legacy:person:sam')!.fields, { name: 'Sam Placeholder', role: 'accountant', email: 'sam@example.com' });
});

test('open questions are asked on Decide once, and decided, dismissed, put off and one-option ones are said as left out', () => {
  const p = plan();
  assert.equal(p.asks.length, 1);
  const [ask] = p.asks;
  assert.equal(ask!.question, 'Which store should Tidepool launch on first?');
  assert.deepEqual(ask!.body, {
    options: [
      { id: 'A', label: 'The desktop store', because: 'Where the beta players already are.', recommended: true },
      { id: 'B', label: 'The console store', because: 'A bigger audience later.' },
    ],
    from: 'legacy:suggestion:SG7',
    context: 'The beta players are mostly on one store.',
    project: 'tidepool',
  });
  assert.deepEqual(skippedItems(p, /^Already decided/u), ['SG4 as D3']);
  assert.deepEqual(skippedItems(p, /^Dismissed/u), ['SG5']);
  assert.deepEqual(skippedItems(p, /^Put off/u), ['SG8 (until 2099-01-01)']);
  assert.deepEqual(skippedItems(p, /two options/u), ['SG9']);
  assert.deepEqual(skippedItems(p, /decision already made on no project/u), ['D4']);
});

test('the agents pack: learnings with what replaced them, skills kept by hand, an MCP server as a tool, and no hook', () => {
  const p = plan();
  const ln1 = row(p, 'legacy:learning:1')!.fields;
  assert.equal(ln1.state, 'superseded');
  assert.equal(ln1.why, 'Replaced by LN2, which names the exact sandbox account.');
  assert.deepEqual(row(p, 'legacy:learning:2')!.fields.supersedes, { $ref: 'legacy:learning:1' });
  assert.deepEqual(skippedItems(p, /12 to 400/u), ['LN3']);
  assert.deepEqual(skippedItems(p, /^Proposed/u), ['LN4']);

  const notes = row(p, 'legacy:skill:release-notes')!.fields;
  assert.equal(notes.managed, false, 'a skill kept in a file is never overwritten by skills sync');
  assert.equal(notes.kind, 'skill');
  assert.match(String(notes.body), /Kept at ~\/\.claude\/skills\/release-notes\/SKILL\.md \(user install\)\./u);
  const store = row(p, 'legacy:skill:store-check')!.fields;
  assert.equal(store.kind, 'command');
  assert.equal(store.state, 'active');
  assert.deepEqual(store.project, { $ref: 'legacy:project:tidepool' });

  assert.deepEqual(row(p, 'legacy:tool:example-mcp')!.fields, {
    name: 'example-mcp',
    kind: 'mcp',
    transport: 'stdio',
    command: 'node',
    args: ['C:/Code/tools/example-mcp.mjs', '--stdio'],
    trigger: 'When the game data is needed.',
    origin: 'the old tool skill register',
    state: 'active',
  });
  assert.equal(row(p, 'legacy:skill:pre-commit'), undefined);
  assert.deepEqual(skippedItems(p, /hook/u), ['pre-commit']);
});

test('keys are indexed by what they open, a row holding a key-shaped value is left out whole, and the vault is never read', () => {
  const p = plan();
  assert.deepEqual(row(p, 'legacy:credential:store-api')!.fields, {
    label: 'Store API token',
    opens: 'The app store publishing API for Lanternly.',
    kind: 'api_token',
    origin: 'the old tool credential register',
    state: 'live',
    provider: 'Example Store',
    where: '.env.local',
    verified: '2026-09-01',
    expires: '2027-03-01',
    project: { $ref: 'legacy:project:lanternly' },
  });
  assert.equal(row(p, 'legacy:credential:game-ssh')!.fields.state, 'missing');
  assert.equal(row(p, 'legacy:credential:pasted'), undefined);
  assert.deepEqual(skippedItems(p, /looked like a key/u), ['pasted']);
  assert.deepEqual(skippedItems(p, /Sealed key values/u), ['the vault section']);
  for (const r of p.rows.filter((x) => x.register === 'credentials')) assert.equal(r.fields.value, undefined, `${r.key} carries no value`);
  const everything = JSON.stringify(p);
  assert.ok(!everything.includes('FAKEFAKE'), 'the key-shaped string is in nothing the plan holds');
  assert.ok(!everything.includes('AAAA'), 'nothing of the vault section is in the plan');
});

test('money: accounts with their balances, bills and income due from the export day, instalments, and what BrainDog cannot hold yet', () => {
  const p = plan();
  assert.deepEqual(row(p, 'legacy:account:main')!.fields, { name: 'Main current account', kind: 'bank', balance: { amount: 4250000, currency: 'EGP' }, as_of: '2026-09-15', liquid: true });
  assert.deepEqual(row(p, 'legacy:company:mercury:ops:checking')!.fields.balance, { amount: 1250000, currency: 'USD' });
  assert.deepEqual(skippedItems(p, /gold, certificates/u), ['Gold']);
  assert.deepEqual(skippedItems(p, /pending balances/u), ['Stripe pending']);

  /* NOTHING IN THE EXPORT SAYS WHICH WAY HOSTING GOES, so it is read from the sign and the row says as much. */
  assert.deepEqual(row(p, 'legacy:recurring:7')!.fields, {
    what: 'Hosting',
    direction: 'owed_by_me',
    amount: { amount: 4500, currency: 'USD' },
    due: '2026-10-03',
    state: 'open',
    repeats: 'monthly',
    category: 'other',
    note: 'the old tool did not say which way this goes, so it was read from the sign of the amount and carried as Money out. Check it.',
  });
  const retainer = row(p, 'legacy:income:3')!.fields;
  assert.equal(retainer.direction, 'owed_to_me');
  assert.equal(retainer.due, '2026-09-28', 'a monthly series keeps its day of the month');
  assert.deepEqual(skippedItems(p, /weekly and fortnightly/u), ['Gym']);
  assert.deepEqual(skippedItems(p, /one-off that fell before/u), ['Old grant']);
  /* `schedule:`, NOT `instalment:`: a part of the wall is an `installments` row now, and the key moved with it. */
  assert.equal(row(p, 'legacy:schedule:flat:2026-10-01')!.register, 'installments');
  assert.deepEqual(row(p, 'legacy:schedule:flat:2026-10-01')!.fields.amount, { amount: 2500000, currency: 'EGP' });

  const noMoney = syntheticExport();
  delete noMoney.money;
  assert.deepEqual(skippedItems(planLegacyTool(noMoney, TODAY), /no money section/u), ['money']);
});

test('agent runs keep their handoff, and what the founder use case has no place for is said', () => {
  const p = plan();
  assert.deepEqual(row(p, 'legacy:session:S40')!.fields, {
    client_id: 'legacy:session:S40',
    agent: 'claude',
    doing: 'Annual plan checkout',
    state: 'handoff',
    repo: 'lanternly-app',
    cwd: 'C:/Code/lanternly-app',
    host: 'EXAMPLE-PC',
    branch: 'annual',
    next: 'Run the store sandbox purchase.',
    tried: ['Mocked the receipt', 'Skipped the sandbox'],
    notes: ['Checkout is wired; the receipt check is not.'],
  });
  assert.deepEqual(skippedItems(p, /^History/u), ['1 history line']);
  assert.ok(skippedItems(p, /no organisations/u).length === 1);
});

test('rows are written in an order where a row is there before a row that points at it', () => {
  const order = [...new Set(plan().rows.map((r) => r.register))];
  assert.deepEqual(order, ['things', 'people', 'tracks', 'tasks', 'datapoints', 'learnings', 'skills', 'tools', 'credentials', 'accounts', 'obligations', 'recurring', 'installments', 'services', 'session']);
});

test('applied to a record, refs become ids; applied again it adds nothing, asks nothing, and updates only what changed', async () => {
  const mem = memoryRecord(ALL);
  const first = await applyPlan(plan(), mem.door, { dryRun: false });
  assert.deepEqual(first.missing, []);
  assert.deepEqual(first.refused, []);
  const count = mem.rows.length;
  assert.equal(count, plan().rows.length);
  assert.equal(first.tally.things!.added, 5);
  assert.equal(first.asked, 1);

  const byTag = (key: string) => mem.rows.find((r) => (r.fields.tags as string[] | undefined)?.includes(key) || r.fields.client_id === key)!;
  assert.equal(byTag('legacy:task:101').fields.thing, byTag('legacy:project:lanternly').id);
  assert.equal(byTag('legacy:task:101').fields.track, byTag('legacy:track:lanternly:annual').id);
  assert.deepEqual(byTag('legacy:person:rivka').fields.projects, [byTag('legacy:project:tidepool').id]);
  assert.equal(byTag('legacy:learning:2').fields.supersedes, byTag('legacy:learning:1').id);
  assert.deepEqual(byTag('legacy:task:101').fields.tags, ['legacy:task:101']);
  assert.equal(byTag('legacy:session:S40').fields.tags, undefined, 'a run has no tags; its client_id is its key');

  mem.writes.length = 0;
  const again = await applyPlan(plan(), mem.door, { dryRun: false });
  assert.equal(mem.rows.length, count, 'no second row');
  assert.deepEqual(mem.writes, [], 'nothing written when nothing changed');
  assert.equal(again.tally.things!.unchanged, 5);
  assert.equal(again.asked, 0);
  assert.equal(again.alreadyAsked, 1);

  /* A LATER EXPORT: new revenue and a finished task. The same day's reading is updated, a new day's is added. */
  const later = planLegacyTool(syntheticExport({ mrr: 2100 }), TODAY);
  const t = later.rows.find((r) => r.key === 'legacy:task:101')!;
  t.fields.state = 'done';
  mem.writes.length = 0;
  const third = await applyPlan(later, mem.door, { dryRun: false });
  assert.deepEqual(mem.writes.sort(), ['update datapoints value', 'update tasks state']);
  assert.equal(third.tally.tasks!.updated, 1);
  assert.equal(mem.rows.length, count);
  const nextDay = await applyPlan(planLegacyTool(syntheticExport({ takenAt: '2026-09-16T03:20:00.000Z' }), TODAY), mem.door, { dryRun: false });
  assert.ok(nextDay.tally.datapoints!.added > 0, "a later day's readings are new readings");
  assert.equal(nextDay.tally.things!.added, 0);
});

test('a setup file names the organisations with their accounts and projects, and polls; what it names wrongly is said', () => {
  const setup = readSetup(JSON.stringify(syntheticSetup()));
  assert.ok(setup.ok);
  const p = planLegacyTool(syntheticExport(), TODAY, (setup as { value: Setup }).value);
  assert.deepEqual(row(p, 'legacy:organisation:studio')!.fields, {
    name: 'Example Studio LLC',
    kind: 'company',
    country: 'US',
    currency: 'USD',
    /* By the label an account is shown with; a pending balance is not carried, so it is not named either. */
    accounts: [{ $ref: 'legacy:company:mercury:ops:checking' }],
    projects: [{ $ref: 'legacy:project:lanternly' }, { $ref: 'legacy:project:tidepool' }],
    note: 'The company the apps are sold through.',
  });
  const quill = row(p, 'legacy:organisation:quill-consulting')!.fields;
  assert.deepEqual(quill.accounts, [{ $ref: 'legacy:account:main' }, { $ref: 'legacy:account:wallet' }]);
  assert.equal(quill.kind, undefined);
  assert.ok(p.changed.some((c) => c.includes('sole_proprietorship')));
  assert.deepEqual(skippedItems(p, /names an account/u), ['Example Studio LLC: Stripe pending']);
  assert.deepEqual(skippedItems(p, /names a project/u), ['Quill Consulting: nowhere']);
  assert.deepEqual(skippedItems(p, /no organisations/u), [], 'with a setup the organisations are not said to be missing');

  assert.deepEqual(p.polls, [
    {
      key: 'legacy:poll:lanternly',
      label: 'lanternly',
      id: 'lanternly',
      url: 'https://stats.lanternly.example/api/numbers',
      every: '1h',
      grant: 'lanternly-stats',
      project: 'legacy:project:lanternly',
      organisation: 'legacy:organisation:studio',
      measures: [
        { name: 'Monthly revenue, Lanternly', path: 'data.mrr', unit: 'USD' },
        { name: 'Subscribers, Lanternly', path: 'data.subscribers', type: 'int' },
      ],
    },
  ]);
  assert.deepEqual(skippedItems(p, /lower case letters/u), ['Bad Id']);
  assert.deepEqual(skippedItems(p, /https address/u), ['plain']);
  const order = [...new Set(p.rows.map((r) => r.register))];
  assert.ok(order.indexOf('organisations') > order.indexOf('accounts') && order.indexOf('organisations') > order.indexOf('things'));

  assert.equal(readSetup('[]').ok, false);
  assert.match((readSetup('{"orgs":[]}') as { fix: string }).fix, /orgs is neither/u);
  assert.match((readSetup(JSON.stringify({ polls: [{ id: 'x', url: `https://x.example/?k=${['sk', 'live', 'FAKEFAKEFAKEFAKEFAKEFAKE0000'].join('_')}` }] })) as { fix: string }).fix, /shaped like a key/u);
});

test('a draft setup holds one organisation with every company account and every project that earns or is being built', () => {
  assert.deepEqual(draftSetup(syntheticExport()), {
    organisations: [{ id: 'company', name: 'Your company', kind: 'company', country: '', currency: 'USD', accounts: ['Company operating'], projects: ['lanternly', 'tidepool', 'quill'], note: '' }],
    polls: [],
  });
});

test('applied with a setup, organisations point at the rows, a poll is filed once as a pack to install, and a re-run adds nothing', async () => {
  const setup = syntheticSetup() as unknown as Setup;
  const mem = memoryRecord(ALL);
  const first = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), mem.door, { dryRun: false });
  assert.deepEqual(first.refused, []);
  assert.equal(first.tally.organisations!.added, 2);
  assert.deepEqual(first.polls, { filed: 1, before: 0 });
  const byTag = (key: string) => mem.rows.find((r) => (r.fields.tags as string[] | undefined)?.includes(key))!;
  const studio = byTag('legacy:organisation:studio');
  assert.deepEqual(studio.fields.projects, [byTag('legacy:project:lanternly').id, byTag('legacy:project:tidepool').id]);
  const poll = mem.asked.find((a) => a.body.install === 'poll-lanternly')!;
  assert.equal(poll.question, 'Poll stats.lanternly.example every 1h for Monthly revenue, Lanternly and Subscribers, Lanternly?');
  const decl = ((poll.body.doc as { declarations: Record<string, unknown>[] }).declarations)[0]!;
  assert.equal(decl.project, byTag('legacy:project:lanternly').id);
  assert.equal(decl.grant, 'lanternly-stats');
  assert.deepEqual((decl.map as Record<string, unknown>[])[0]!.organisation, { value: studio.id });

  mem.writes.length = 0;
  const again = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), mem.door, { dryRun: false });
  assert.deepEqual(mem.writes, []);
  assert.deepEqual(again.polls, { filed: 0, before: 1 });
  assert.equal(again.tally.organisations!.unchanged, 2);
});

/**
 * THE POLL HALF OF THE GUARD THAT STOPS A SECOND RUN ASKING AGAIN, WHICH NOTHING HELD UNTIL THIS TEST.
 *
 * `src/import.ts` says of a Decide read that refuses that "the run stops asking, files no poll, and says which read
 * failed". `import-at-scale.test.ts` drives the first and the third of those three. Measured on 2026-09-21: dropping
 * `decide === null ? [] :` from the loop over `plan.polls` fails this test and nothing else in the package, and before
 * this test was written it failed nothing at all, which is 231 green in the audit's run and 233 in this tree. What it
 * does instead is file a pack he had already approved a second time, because a refused read leaves `installs` empty and
 * `installs.has(pack)` is then false for every poll in the plan. The duplicate lands under the one condition that makes
 * a duplicate worst, which is that he has already answered the first copy.
 */
test('A DECIDE READ THAT REFUSES FILES NO POLL, as well as asking nothing, and says which read it could not make', async () => {
  const setup = syntheticSetup() as unknown as Setup;
  const mem = memoryRecord(ALL);
  const first = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), mem.door, { dryRun: false });
  assert.deepEqual(first.polls, { filed: 1, before: 0 });
  assert.equal(first.asked, 1);
  assert.equal(mem.asked.length, 2, 'the question and the pack, each filed once');

  /* THE SAME CREDENTIAL GOING STALE ONE READ LATER, which is the ordinary way this happens: the rows are written by
     then, so the refusal cannot be thrown, and carrying on with two empty sets is the bug being held shut here. */
  const blind: Door = { ...mem.door, governance: async () => ({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' } }) };
  mem.writes.length = 0;
  const again = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), blind, { dryRun: false });
  assert.deepEqual(again.polls, { filed: 0, before: 0 }, 'a poll was filed on a run that never read what it had filed before');
  assert.equal(again.asked, 0);
  assert.equal(again.alreadyAsked, 0, 'nothing was read, so nothing may be reported as found');
  assert.deepEqual(mem.writes.filter((w) => w === 'propose'), [], 'the run proposed something with no idea what it had proposed before');
  assert.equal(mem.asked.length, 2, 'a pack he has already been offered was offered again');
  assert.deepEqual(again.refused, [{ label: 'What this record has already been asked', register: 'Decide', fix: 'This record does not know that credential. (UNAUTHORIZED)' }]);

  /* AND THE LINE HE READS SAYS NOTHING WAS FILED, rather than leaving the poll count out of a report that still names
     the list: the plan has a poll in it either way, so the sentence is printed either way. */
  const lines = said(again, { dryRun: false, file: 'export.json' });
  assert.ok(lines.includes('Polls: 0 filed on Decide for you to approve, 0 filed before.'), lines.join('\n'));
});

/**
 * THE RECORD'S OWN ANSWER TO A PACK IT ALREADY HOLDS IS NOT A REFUSAL HE NEEDS TO READ, and neither arm of the
 * condition that sorts those apart had a test. `TRANSITION_ILLEGAL` back from `propose` means the pack is installed and
 * nothing newer was offered, which is a poll filed before; any other code is something he can act on and has to be said
 * with the poll named. Measured on 2026-09-21: deleting the `TRANSITION_ILLEGAL` arm fails this test and nothing else in
 * the package, printing a poll that was already running as a refusal, and deleting the `else` beside it fails this test
 * and nothing else either, leaving a refusal a person can act on printed nowhere at all.
 */
test('A POLL THE RECORD SAYS IS ALREADY INSTALLED IS COUNTED AS FILED BEFORE, and any other refusal is said with the poll named', async () => {
  const setup = syntheticSetup() as unknown as Setup;
  /* ONLY THE PACK IS REFUSED, so the ordinary question beside it still goes through and this measures one thing. */
  const packRefusal = (code: string, fix: string) => {
    const mem = memoryRecord(ALL);
    const door: Door = { ...mem.door, propose: async (args) => (args.body_kind === 'pack' ? { ok: false, refusal: { code, fix } } : mem.door.propose(args)) };
    return { mem, door };
  };

  const held = packRefusal('TRANSITION_ILLEGAL', 'That pack is already installed at this version or newer.');
  const already = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), held.door, { dryRun: false });
  assert.deepEqual(already.polls, { filed: 0, before: 1 });
  assert.deepEqual(already.refused, [], 'the record answering that it already holds the pack was read to him as a refusal');
  assert.equal(already.asked, 1, 'the question beside the pack was not filed');

  const wrong = packRefusal('OUT_OF_BOUNDS', 'A pack declares at most eight readings.');
  const spelled = await applyPlan(planLegacyTool(syntheticExport(), TODAY, setup), wrong.door, { dryRun: false });
  assert.deepEqual(spelled.polls, { filed: 0, before: 0 }, 'a poll the record would not take was counted as one it already had');
  assert.deepEqual(spelled.refused, [{ label: 'lanternly', register: 'Decide', fix: 'A pack declares at most eight readings. (OUT_OF_BOUNDS)' }]);
});

/**
 * A CATEGORY HE MADE HIMSELF IS NOT AN EXAMPLE ROW, AND THE FIX MUST NOT SEND HIM TO A BUTTON THAT CANNOT HELP.
 *
 * `legacy.test.ts` measures the planted arm, against a row tagged `example`, and this is the other one. Pressing
 * Clear the examples on Home deletes only the examples nobody has changed, so telling him to press it about a category
 * he wrote himself leaves the ledger rows uncategorised with no way forward at all. Measured on 2026-09-21: collapsing
 * the ternary to its planted arm leaves this the only test in the package that notices.
 *
 * THE PLAN IS BUILT HERE AND NOT READ FROM THE EXPORT, because `legacy-export.ts` carries no money categories at
 * all: `planLegacyTool(syntheticExport(), TODAY)` plans zero `categories` rows, so a clash cannot be staged from it.
 */
test('A CATEGORY OF HIS OWN UNDER THE SAME NAME IS SAID AS A RENAME, not as examples to clear', async () => {
  const clashing: Plan = {
    taken: '2026-09-15',
    rev: 1,
    rows: [
      { register: 'categories', key: `${KEY_PREFIX}category:1`, label: 'Groceries', fields: { name: 'Groceries', direction: 'out', state: 'live' } },
      {
        register: 'transactions',
        key: `${KEY_PREFIX}txn:1`,
        label: 'MARKET STREET GROCER',
        fields: { what: 'MARKET STREET GROCER', amount: { amount: -4210, currency: 'USD' }, at: '2026-09-14', direction: 'out', category: { $ref: `${KEY_PREFIX}category:1` } },
      },
    ],
    asks: [],
    polls: [],
    skipped: [],
    changed: [],
  };

  const his = memoryRecord(ALL);
  const mine = await his.door.create({ register: 'categories', fields: { name: 'Groceries', direction: 'out', state: 'live' } });
  assert.equal(mine.ok, true, 'the category standing in his record would not write');
  const report = await applyPlan(clashing, his.door, { dryRun: false });
  assert.deepEqual(
    report.clashes.map((c) => [c.label, c.rows]),
    [['Groceries', 1]],
  );
  assert.match(report.clashes[0]!.fix, /Rename one of the two/u);
  assert.doesNotMatch(report.clashes[0]!.fix, /Clear the examples/u, 'he was sent to a button that deletes only the examples nobody has changed');

  /* AND THE SAME NAME TAGGED `example` IS THE OTHER ARM, held here too so the two cannot drift into one sentence. */
  const planted = memoryRecord(ALL);
  await planted.door.create({ register: 'categories', fields: { name: 'Groceries', direction: 'out', state: 'live', tags: ['example'] } });
  const again = await applyPlan(clashing, planted.door, { dryRun: false });
  assert.match(again.clashes[0]!.fix, /Clear the examples/u);

  /* THE LEDGER ROW STILL ARRIVES, uncategorised: money that moved is worth more than the slice it belongs in. */
  const moved = his.rows.find((r) => r.register === 'transactions')!;
  assert.equal(moved.fields.what, 'MARKET STREET GROCER');
  assert.equal(moved.fields.category, undefined);
});

test('a dry run says each row that would change and the fields that would', async () => {
  const mem = memoryRecord(ALL);
  await applyPlan(plan(), mem.door, { dryRun: false });
  const report = await applyPlan(plan({ mrr: 2100 }), mem.door, { dryRun: true });
  assert.deepEqual(report.changes, [{ register: 'datapoints', label: 'lanternly Monthly revenue', fields: ['value'] }]);
  const lines = said(report, { dryRun: true, file: 'export.json' });
  assert.ok(lines.includes('What would change:'));
  assert.ok(lines.includes('- Datapoints, lanternly Monthly revenue: value.'));
});

test('a dry run reads and reports, and writes nothing', async () => {
  const mem = memoryRecord(ALL);
  const report = await applyPlan(plan(), mem.door, { dryRun: true });
  assert.deepEqual(mem.writes, []);
  assert.equal(report.tally.tasks!.added, 5, 'four tasks and one date');
  assert.equal(report.asked, 1);
  const lines = said(report, { dryRun: true, file: 'export.json' });
  assert.equal(lines[0], 'Read, and wrote nothing: export.json, exported 2026-09-15.');
  assert.ok(lines.includes('Tasks: 5 would be added, 0 would be updated, 0 unchanged.'));
});

test('a record without the founder and agents lists is told what to install, and nothing is written', async () => {
  const mem = memoryRecord(['things', 'people', 'tracks', 'tasks', 'accounts', 'obligations', 'session']);
  const report = await applyPlan(plan(), mem.door, { dryRun: false });
  assert.deepEqual(report.missing, ['datapoints', 'learnings', 'skills', 'tools', 'credentials']);
  assert.deepEqual(mem.writes, []);
  const lines = said(report, { dryRun: false, file: 'export.json' });
  assert.equal(lines[0], 'Read, and wrote nothing: export.json, exported 2026-09-15.');
  assert.match(lines[1]!, /^This BrainDog has no Datapoints, Learnings, Skills, Tools and Keys \(the index only\) lists, so nothing was written\. Install Solo founder and Agents on this BrainDog first, then run the import again\.$/u);
});

/**
 * A HOST THAT STOPPED ANSWERING IS NOT A RECORD SHORT OF ITS LISTS, AND NINE PLACES IN `applyPlan` TURN ON THAT.
 *
 * Measured on 2026-09-21, by making `unreachable()` answer false for everything: not one test in this package failed,
 * 233 passing and 3 skipped over 236, so every one of those nine arms was carried by nothing. The one above is where it costs
 * the most. A host that stops answering refuses every `schema` read, and without the throw that reads as a record
 * holding none of the lists, so the run prints the sentence the test above pins, telling him to install Solo founder
 * and Agents into a record that already has them, and exits 1 instead of the 3 that means run the import again.
 *
 * THIS HOLDS TWO OF THE NINE, the schema read and the first write. The seven left are the page read inside `readAll`,
 * the row update, the second pass, the retire update, the Decide read, and the two `propose` calls, and reaching those
 * means a door that answers for a while and then stops, which belongs beside `refuseListAfter` in
 * `import-at-scale.test.ts` rather than on a door that answers everything in one page.
 */
test('A HOST THAT STOPS ANSWERING IS THROWN, not reported as a record short of its lists', async () => {
  const gone = { ok: false as const, refusal: { code: 'UNREACHABLE', fix: 'nowhere did not answer.' } };

  /**
   * WHICH CLASS THREW IS THE WHOLE ASSERTION, because `run` in `src/import.ts` branches on exactly that: only
   * `e instanceof Unreachable` becomes the line saying to run the import again and the exit 3 that means so, and any
   * other error is rethrown and the command dies with a stack trace. `Unreachable` carries no message, so there is
   * nothing for a regex to match the way `import-at-scale.test.ts` matches `PartlyRead`, and the class is not exported.
   * Measured on 2026-09-21: with `Error` as the expected class here, replacing the throw at the schema read with
   * `new TypeError(...)` left this test green over all 28 in the file, and the behaviour the test is named for was gone.
   */
  const stopped = (e: unknown) => e instanceof Error && e.constructor.name === 'Unreachable';

  const shut = memoryRecord(ALL);
  const dead: Door = { ...shut.door, schema: async () => gone };
  await assert.rejects(() => applyPlan(plan(), dead, { dryRun: false }), stopped, 'a host that stopped answering was reported as a record with no lists');
  assert.deepEqual(shut.writes, []);

  /* AND ONE THAT STOPS AT THE FIRST WRITE, where `missing` is not the wrong answer but a refusal line for every row is:
     the report would name five projects the record refused, and the record refused nothing. */
  const half = memoryRecord(ALL);
  const mid: Door = { ...half.door, create: async () => gone };
  await assert.rejects(() => applyPlan(plan(), mid, { dryRun: false }), stopped, 'a write to a host that had stopped answering was reported as the record refusing the row');
});

test('A RECORD STILL ON money-core 1.1.0 KEEPS ITS INSTALMENT WALL, having no Instalments list for it to have moved to', async () => {
  /**
   * THE BRANCH THAT COSTS THE MOST IF IT IS WRONG, AND THE GREEN CASE CANNOT REACH IT. Retiring the rows an earlier
   * import left under `legacy:instalment:` is conditional on the record having the list they moved to. Dropping
   * that condition and running the tests here was green, measured just now, so the condition was carrying the whole
   * wall with nothing watching it: on a record short of `installments` the two parts below would have been written
   * off in `obligations` with nothing put anywhere in their place.
   */
  const old = ALL.filter((r) => !['categories', 'transactions', 'recurring', 'installments'].includes(r));
  const mem = memoryRecord(old);
  /* WHAT THE IMPORTER THAT SHIPPED BEFORE THIS WEEK LEFT IN THE RECORD: each part of the wall as an obligation, under
     the key that build filed them by. */
  for (const due of ['2026-10-01', '2027-01-01'])
    await mem.door.create({
      register: 'obligations',
      fields: { what: 'Instalment, flat', direction: 'owed_by_me', amount: { amount: 2_500_000, currency: 'EGP' }, due, state: 'open', tags: [`${KEY_PREFIX}instalment:flat:${due}`] },
    });

  const report = await applyPlan(plan(), mem.door, { dryRun: false });
  assert.deepEqual(report.retired, [], 'the wall was written off on a record with nowhere for it to have gone');
  assert.deepEqual(
    mem.rows.filter((r) => r.register === 'obligations' && String(r.fields.what).startsWith('Instalment')).map((r) => r.fields.state),
    ['open', 'open'],
  );
  assert.deepEqual(
    mem.writes.filter((w) => w.startsWith('update obligations')),
    [],
  );

  /* AND A LIST ASKED ABOUT ONLY SO SOMETHING COULD BE RETIRED IS NOT A SENTENCE WITH NOTHING AFTER IT: an export whose
     wall is paid off plans no `installments` rows at all, so the record being short of that list is nothing to say. */
  const paid = syntheticExport();
  (paid.money as { obligations: { schedule: unknown[] } }).obligations = { schedule: [] };
  const done = await applyPlan(planLegacyTool(paid, TODAY), memoryRecord(old).door, { dryRun: false });
  assert.deepEqual(
    done.plan.skipped.filter((s) => s.items.length === 0),
    [],
    'the report names a list with no rows behind it',
  );
});

test('A LIST ASKED ABOUT ONLY SO SOMETHING COULD BE RETIRED CANNOT STOP AN IMPORT THAT WAS NEVER GOING TO WRITE TO IT', async () => {
  /**
   * A RECORD WITH NO MONEY PACK AT ALL, which is not the same case as one on the old money-core. `obligations` is not
   * optional, so asking about it because a row might be retired out of it turned a record that simply has not got it
   * into `missing` and returned before one row was written. Measured on the export below, whose money step answered
   * nothing but its day: the projects were written before the retire pass existed, and were not written after.
   */
  const thin = syntheticExport();
  thin.money = { asOf: '2026-09-15' };
  const noMoney = ALL.filter((r) => !['accounts', 'categories', 'obligations', 'transactions', 'recurring', 'installments'].includes(r));
  const mem = memoryRecord(noMoney);
  const report = await applyPlan(planLegacyTool(thin, TODAY), mem.door, { dryRun: false });
  assert.deepEqual(report.missing, [], 'a list nothing was planned for stopped the whole import');
  assert.equal(report.tally.things?.added, 5);
  assert.deepEqual(report.retired, []);
});

test('the report says every list, the questions, what was left out and that no key value was read, with no em dash', async () => {
  const mem = memoryRecord(ALL);
  const lines = said(await applyPlan(plan(), mem.door, { dryRun: false }), { dryRun: false, file: 'export.json' });
  const text = lines.join('\n');
  assert.ok(text.includes('Projects: 5 added, 0 updated, 0 unchanged.'));
  assert.ok(text.includes('Decide: 1 asked, 0 asked before.'));
  assert.ok(text.includes('Left out, and why:'));
  assert.ok(text.includes('No key value was read or sent.'));
  assert.ok(!text.includes('\u2014'));
  assert.ok(!text.includes('FAKEFAKE'));
});

test('THE MONEY LISTS ARE NAMED IN WORDS IN THE MAIN TALLY, not by the id an API uses', () => {
  const one = { added: 1, updated: 0, unchanged: 0 };
  const report: Report = {
    missing: [],
    tally: { fx: one, accounts: one, categories: one, transactions: one, recurring: one, installments: one },
    asked: 0,
    alreadyAsked: 0,
    polls: { filed: 0, before: 0 },
    changes: [],
    refused: [],
    retired: [],
    clashes: [],
    examples: 0,
    outcomes: {},
    plan: { taken: null, rev: null, rows: [], asks: [], polls: [], skipped: [], changed: [] },
  };
  assert.deepEqual(
    said(report, { dryRun: false, file: 'export.json' }).filter((l) => l.includes('1 added')),
    [
      /* THE WORDS money-core PUTS OVER THE RATES LIST, pinned rather than left to the both-directions check below: that
         check only proves a line does not begin with the register's id, so `fx: 'FX'` would pass it while putting two
         letters nobody has seen in the product beside `Accounts`. */
      'Exchange rates: 1 added, 0 updated, 0 unchanged.',
      'Accounts: 1 added, 0 updated, 0 unchanged.',
      'Categories: 1 added, 0 updated, 0 unchanged.',
      'Ledger: 1 added, 0 updated, 0 unchanged.',
      'Repeating: 1 added, 0 updated, 0 unchanged.',
      'Instalments: 1 added, 0 updated, 0 unchanged.',
    ],
  );

  /* AND EVERY OTHER LIST TOO, so a register added later cannot print its id in the main tally unnoticed. `src/import.ts`
     now also holds `NAMES` to `ORDER` with `satisfies`, which fails the typecheck rather than a run, and this stays
     because it is the printed line that a person actually reads. */
  const every = said({ ...report, tally: Object.fromEntries(ORDER.map((r) => [r, one])) }, { dryRun: false, file: 'export.json' }).filter((l) => l.includes('1 added'));
  assert.equal(every.length, ORDER.length);
  assert.deepEqual(
    every.filter((l) => ORDER.some((r) => l.startsWith(`${r}:`))),
    [],
    'a list is named in the report by the id the API uses',
  );
});

test('the command reads the file, talks to the host over the API, and exits 0; a missing file or a wrong source is one sentence', async (t) => {
  const seen: string[] = [];
  const server: Server = createServer((req, res) => {
    const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
    seen.push(method);
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const value = method === 'list' ? { rows: [], cursor: null } : method === 'governance' ? [] : method === 'create' ? { id: `e_${String(seen.length)}`, seq: seen.length, version: 1, fields: {} } : method === 'propose' ? { id: 'SG1' } : {};
      res.end(JSON.stringify({ ok: true, value }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(syntheticExport()));
  const out: string[] = [];
  const say: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => say.push(l), headers: async () => ({}) };

  assert.equal(await importCommand(['legacy', 'export.json'], io, TODAY), 0);
  assert.ok(seen.includes('schema') && seen.includes('create') && seen.includes('propose'));
  assert.ok(out.some((l) => l.startsWith('Tasks: 5 added')));

  assert.equal(await importCommand(['legacy', 'nope.json'], io, TODAY), 1);
  assert.equal(say.at(-1), 'nope.json could not be read.');
  assert.equal(await importCommand(['notion', 'export.json'], io, TODAY), 1);
  assert.equal(say.at(-1), USAGE_SAID);
});

test('example rows setting up planted, found beside the import, are said with where to clear them; none, and nothing is said', async () => {
  const mem = memoryRecord(ALL);
  await mem.door.create({ register: 'things', fields: { name: 'Northwind app', tags: ['example'] } });
  await mem.door.create({ register: 'tasks', fields: { what: 'Write the pricing page copy', tags: ['example'] } });
  const report = await applyPlan(plan(), mem.door, { dryRun: true });
  assert.equal(report.examples, 2);
  assert.ok(said(report, { dryRun: true, file: 'export.json' }).includes('This BrainDog still holds 2 example rows from setting up, beside your own. Open Home and press Clear the examples: it deletes only the examples nobody has changed.'));
  const clean = await applyPlan(plan(), memoryRecord(ALL).door, { dryRun: true });
  assert.equal(clean.examples, 0);
  assert.ok(!said(clean, { dryRun: true, file: 'export.json' }).some((l) => l.includes('example rows')));
});

test('dates become tasks due that day on their project, domains and services go onto Estate with what is not known left blank, and readings are named with their service', () => {
  const p = plan();
  assert.deepEqual(row(p, 'legacy:date:EV1'), {
    register: 'tasks',
    key: 'legacy:date:EV1',
    label: 'Store review window on 2026-09-30',
    fields: { what: 'Store review window', state: 'open', by: '2026-09-30', note: 'Was EV1 in the old tool, a date (deadline).', thing: { $ref: 'legacy:project:lanternly' } },
  });
  assert.deepEqual(row(p, 'legacy:domain:lanternly.example')!.fields, { name: 'lanternly.example', kind: 'domain', cycle: 'yearly', state: 'live', renews: '2027-01-01', thing: { $ref: 'legacy:project:lanternly' } });
  assert.deepEqual(row(p, 'legacy:service:vm-1')!.fields, { name: 'Game server', kind: 'hosting', cycle: 'monthly', state: 'live', provider: 'example', cost: { amount: 1200, currency: 'USD' } });
  const reading = p.rows.find((r) => r.key.startsWith('legacy:servicereading:vm-1:disk:'))!;
  assert.equal(reading.fields.name, 'Disk, Game server');
  assert.equal(reading.fields.value, 12);
  assert.equal(reading.fields.unit, 'GB');
  for (const reason of [/Dates have no list/u, /^Domains/u, /^Services/u, /^Service readings/u]) assert.deepEqual(skippedItems(p, reason), []);

  /* A DATE ALREADY PAST is done on its day. */
  const past = planLegacyTool(syntheticExport(), '2026-10-01');
  assert.equal(row(past, 'legacy:date:EV1')!.fields.state, 'done');
  assert.equal(row(past, 'legacy:date:EV1')!.fields.done_on, '2026-09-30');
});

test('the dry run lists each date, domain and service; a re-run changes none; a record without Estate gets everything else and is told what installing it adds', async () => {
  const mem = memoryRecord(ALL);
  const dry = said(await applyPlan(plan(), mem.door, { dryRun: true }), { dryRun: true, file: 'export.json' });
  const at = dry.indexOf('Dates, domains and services:');
  assert.ok(at > 0);
  assert.deepEqual(dry.slice(at + 1, at + 4), [
    '- Date: Store review window on 2026-09-30, would be added (Tasks).',
    '- Domain: lanternly.example renewing 2027-01-01, would be added (Services).',
    '- Service: Game server, would be added (Services).',
  ]);
  await applyPlan(plan(), mem.door, { dryRun: false });
  const count = mem.rows.length;
  const again = said(await applyPlan(plan(), mem.door, { dryRun: false }), { dryRun: false, file: 'export.json' });
  assert.equal(mem.rows.length, count, 'idempotent');
  assert.ok(again.includes('- Service: Game server, unchanged (Services).'));

  const founder = memoryRecord(ALL.filter((r) => r !== 'services'));
  const report = await applyPlan(plan(), founder.door, { dryRun: false });
  assert.deepEqual(report.missing, []);
  assert.equal(founder.rows.filter((r) => r.register === 'services').length, 0);
  assert.ok(founder.rows.some((r) => (r.fields.tags as string[] | undefined)?.includes('legacy:date:EV1')));
  const lines = said(report, { dryRun: false, file: 'export.json' });
  assert.ok(lines.includes('- This BrainDog has no Services list. Install Estate beside Solo founder, then run the import again to bring these in: lanternly.example renewing 2027-01-01, Game server.'));
  assert.ok(!lines.join(' ').includes('—'));
});

/* THE SHADOW WEEK (`loop/research-switch-matrix.md`, what to build next, item 4). The importer is run each night against a
   fresh export, and the morning question is what moved in the old tool since the night before and whether it arrived.
   EVERY `--since` HERE IS READ AT A ZONE IT NAMES, because the day a run falls on is the machine's local day and this
   machine is at +03:00: a test that left the zone to the machine would pass here and fail on a runner at UTC. */
const UTC = () => 0;

test('A RUN IS REMEMBERED AS WHAT IT CARRIED, and --since last says the newest run by name: created, updated with the fields, refused, and newly left out', async () => {
  const mem = memoryRecord(ALL);
  const first = plan();
  const one = runOf(await applyPlan(first, mem.door, { dryRun: false }), { at: '2026-09-20T03:00:00.000Z', host: 'app.brain.dog', file: 'export.json' });
  assert.equal(one.updated.length, 0);
  assert.ok(one.created.length > 20, 'the first night carries everything');

  const later = planLegacyTool(syntheticExport({ mrr: 2100 }), TODAY);
  later.rows.find((r) => r.key === 'legacy:task:101')!.fields.state = 'done';
  later.rows.push({ register: 'learnings', key: 'legacy:learning:99', label: 'L99', fields: { lesson: 'Too short' } });
  later.skipped.push({ reason: 'A thing BrainDog has no place for', items: ['New widget'] });
  const two = runOf(await applyPlan(later, mem.door, { dryRun: false }), { at: '2026-09-21T03:05:00.000Z', host: 'app.brain.dog', file: 'export.json' });

  const got = sinceSaid([one, two], 'last', UTC);
  assert.equal(got.found, 1);
  assert.deepEqual(got.lines, [
    '2026-09-21 03:05 UTC into app.brain.dog, export of 2026-09-15:',
    '- Updated in Tasks: #101 (state).',
    '- Updated in Datapoints: lanternly Monthly revenue (value).',
    '- Not carried, Learnings: L99. Too short. (OUT_OF_BOUNDS)',
    '- Newly left out: New widget. A thing BrainDog has no place for.',
  ]);
  for (const line of got.lines) assert.ok(line.length <= 100, `a line a phone shows whole: ${line}`);
  assert.ok(!got.lines.join(' ').includes('—'));
});

test('--since a date says every run from that day on, oldest first; a run that moved nothing says so; none in range is one sentence', async () => {
  const mem = memoryRecord(ALL);
  const one = runOf(await applyPlan(plan(), mem.door, { dryRun: false }), { at: '2026-09-19T03:00:00.000Z', host: 'h', file: 'e.json' });
  const two = runOf(await applyPlan(plan(), mem.door, { dryRun: false }), { at: '2026-09-20T03:00:00.000Z', host: 'h', file: 'e.json' });
  const three = runOf(await applyPlan(plan(), mem.door, { dryRun: false }), { at: '2026-09-21T03:00:00.000Z', host: 'h', file: 'e.json' });
  const got = sinceSaid([one, two, three], '2026-09-20', UTC);
  assert.equal(got.found, 2);
  assert.deepEqual(got.lines, [
    '2026-09-20 03:00 UTC into h, export of 2026-09-15:',
    '- Nothing moved in the old tool since the run before.',
    '',
    '2026-09-21 03:00 UTC into h, export of 2026-09-15:',
    '- Nothing moved in the old tool since the run before.',
  ]);
  /* WHAT WAS LEFT OUT ON BOTH NIGHTS IS NOT NEWS, so only the first run remembered says the whole of it. */
  assert.ok(sinceSaid([one], 'last', UTC).lines.some((l) => l.startsWith('- Newly left out:')));
  assert.deepEqual(sinceSaid([one, two, three], '2026-09-22', UTC), { found: 0, lines: ['No import run is remembered on this machine since 2026-09-22.'] });
  assert.deepEqual(sinceSaid([], 'last', UTC), { found: 0, lines: ['No import run is remembered on this machine yet.'] });
});

test('the command remembers each run it writes in, not a dry run, and --since reads them back with no export and no host', async (t) => {
  const server: Server = createServer((req, res) => {
    const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const value = method === 'list' ? { rows: [], cursor: null } : method === 'governance' ? [] : method === 'create' ? { id: 'e_1', seq: 1, version: 1, fields: {} } : method === 'propose' ? { id: 'SG1' } : {};
      res.end(JSON.stringify({ ok: true, value }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-since-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(syntheticExport()));
  const out: string[] = [];
  const say: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => say.push(l), headers: async () => ({}) };
  const at = (iso: string) => () => new Date(iso);

  assert.equal(await importCommand(['legacy', '--since', 'last'], io, TODAY), 1, 'nothing remembered yet');
  assert.equal(say.at(-1), 'No import run is remembered on this machine yet.');

  assert.equal(await importCommand(['legacy', 'export.json'], io, TODAY, at('2026-09-20T03:00:00.000Z')), 0);
  assert.equal(await importCommand(['legacy', 'export.json', '--dry-run'], io, TODAY, at('2026-09-21T03:00:00.000Z')), 0);
  out.length = 0;
  assert.equal(await importCommand(['legacy', '--since', '2026-09-01'], io, TODAY, undefined, UTC), 0);
  assert.equal(out.filter((l) => / UTC into /u.test(l)).length, 1, 'a dry run wrote nothing, so it is not a run to report');
  assert.ok(out[0]!.startsWith('2026-09-20 03:00 UTC into http://127.0.0.1:'), out[0]);
  assert.ok(out.some((l) => l.startsWith('- Created in Tasks: ')));

  assert.equal(await importCommand(['legacy', '--since', 'yesterday'], io, TODAY), 1);
  assert.equal(say.at(-1), '--since takes a day as 2026-09-21, or last.');
  assert.equal(await importCommand(['legacy', 'export.json', '--since', 'last'], io, TODAY), 1);
  assert.equal(say.at(-1), USAGE_SAID);
});

test('an update the record turned down is said once, as not carried; a clash is said; what was left out is compared with the same host only', async () => {
  const mem = memoryRecord(ALL);
  await applyPlan(plan(), mem.door, { dryRun: false });
  const later = plan();
  later.rows.find((r) => r.key === 'legacy:task:101')!.fields.state = 'done';
  const door: Door = { ...mem.door, update: async (a) => (a.register === 'tasks' ? { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Not today.' } } : mem.door.update(a)) };
  const report = await applyPlan(later, door, { dryRun: false });
  const run = runOf({ ...report, clashes: [{ label: 'Client work', rows: 1, fix: 'Rename it.' }] }, { at: '2026-09-21T03:00:00.000Z', host: 'a', file: 'e.json' });
  assert.deepEqual(run.updated, [], 'the change was recorded before the write, and the write was refused');
  assert.deepEqual(sinceSaid([run], 'last', UTC).lines.filter((l) => l.startsWith('- Not carried')), ['- Not carried, Tasks: #101. Not today. (OUT_OF_BOUNDS)', '- Not carried, Categories: Client work. Rename it.']);

  /* A NIGHT INTO ANOTHER HOST IS NOT "THE RUN BEFORE": the first run into `b` says the whole of what it left out. */
  const onA = runOf(report, { at: '2026-09-20T03:00:00.000Z', host: 'a', file: 'e.json' });
  const onB = runOf(report, { at: '2026-09-21T03:00:00.000Z', host: 'b', file: 'e.json' });
  assert.ok(sinceSaid([onA, onB], 'last', UTC).lines.some((l) => l.startsWith('- Newly left out:')));
});

test('the runs file keeps the newest sixty, and a line it cannot read, or one missing a list, is passed over and not fatal', async (t) => {
  const server: Server = createServer((req, res) => {
    const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const value = method === 'list' ? { rows: [], cursor: null } : method === 'governance' ? [] : method === 'create' ? { id: 'e_1', seq: 1, version: 1, fields: {} } : method === 'propose' ? { id: 'SG1' } : {};
      res.end(JSON.stringify({ ok: true, value }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-runs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(syntheticExport()));
  const old = (d: number) => JSON.stringify({ at: `2026-07-${String(d).padStart(2, '0')}T03:00:00.000Z`, host: 'h', file: 'e.json', taken: null, created: [], updated: [], refused: [], skipped: [] });
  mkdirSync(join(dir, '.braindog'));
  const lines = [...Array.from({ length: 30 }, (_, i) => old(i + 1)), 'cut off {"at', '{"at":"2026-08-01T03:00:00.000Z","host":"h","created":[]}', ...Array.from({ length: 30 }, (_, i) => old(i + 1))];
  writeFileSync(join(dir, '.braindog', 'imports.jsonl'), `${lines.join('\n')}\n`);
  const out: string[] = [];
  const say: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => say.push(l), headers: async () => ({}) };

  assert.equal(await importCommand(['legacy', '--since', '2026-07-01'], io, TODAY, undefined, UTC), 0, say.join(' '));
  assert.equal(out.filter((l) => / UTC into /u.test(l)).length, 60);
  const file = join(dir, '.braindog', 'imports.jsonl');
  assert.deepEqual(say, [31, 32].map((n) => `Line ${String(n)} of ${file} is not a run as this command writes one, so it was passed over.`));
  say.length = 0;
  assert.equal(await importCommand(['legacy', 'export.json'], io, TODAY, () => new Date('2026-09-20T03:00:00.000Z')), 0);
  assert.deepEqual(say, [31, 32].map((n) => `Line ${String(n)} of ${file} was not a run as this command writes one, and was let go when this run was remembered.`));
  const kept = readFileSync(join(dir, '.braindog', 'imports.jsonl'), 'utf8').trim().split('\n');
  assert.equal(kept.length, 60);
  assert.ok(kept.at(-1)!.startsWith('{"at":"2026-09-20T03:00:00.000Z"'));
  assert.equal(kept[0], old(2), 'the oldest run is the one let go');
});

/* THE DAY `--since` TAKES IS THE OWNER'S DAY, not the UTC date of the run (`loop/research-batch-twenty-four-audit.md`
   §6). Measured before the fix: a run at 02:30 on the 22nd at +03:00 is 23:30 UTC on the 21st, and `--since
   2026-09-22`, typed that morning, answered that no run was remembered since the 22nd. */
test('--SINCE A DAY IS THE LOCAL DAY: a run at 02:30 on the 22nd at +03:00 is found by --since 2026-09-22, and said at its own clock', async () => {
  const mem = memoryRecord(ALL);
  const night = runOf(await applyPlan(plan(), mem.door, { dryRun: false }), { at: '2026-09-21T23:30:00.000Z', host: 'h', file: 'e.json' });
  const east = sinceSaid([night], '2026-09-22', () => 180);
  assert.equal(east.found, 1, east.lines.join(' '));
  assert.equal(east.lines[0], '2026-09-22 02:30 +03:00 into h, export of 2026-09-15:');
  /* AND THE EDGE MOVES THE OTHER WAY WEST OF UTC: 03:00 UTC on the 22nd is still the evening of the 21st at -05:00. */
  const early = runOf(await applyPlan(plan(), mem.door, { dryRun: false }), { at: '2026-09-22T03:00:00.000Z', host: 'h', file: 'e.json' });
  assert.equal(sinceSaid([early], '2026-09-22', () => -300).found, 0);
  assert.equal(sinceSaid([early], '2026-09-21', () => -300).lines[0], '2026-09-21 22:00 -05:00 into h, export of 2026-09-15:');
  assert.equal(sinceSaid([night], '2026-09-21', UTC).lines[0], '2026-09-21 23:30 UTC into h, export of 2026-09-15:');
});

test('--SINCE WITH NO ZONE GIVEN READS THE ZONE THE MACHINE IS SET TO, measured in a child told TZ=Asia/Tokyo', () => {
  /* A CHILD, BECAUSE THE DEFAULT IS THE THING UNDER TEST and this process's own zone is whatever the machine is. Tokyo
     keeps no summer time, so +09:00 holds on every date: 18:30 UTC on the 21st is 03:30 on the 22nd there. */
  const run = { at: '2026-09-21T18:30:00.000Z', host: 'h', file: 'e.json', taken: null, created: [{ register: 'tasks', label: '#1' }], updated: [], refused: [], skipped: [] };
  const script = `import { sinceSaid } from ${JSON.stringify(new URL('../src/import.ts', import.meta.url).href)}; console.log(JSON.stringify(sinceSaid([${JSON.stringify(run)}], '2026-09-22')));`;
  const got = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script], { env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8', windowsHide: true })) as { found: number; lines: string[] };
  assert.deepEqual(got, { found: 1, lines: ['2026-09-22 03:30 +09:00 into h:', '- Created in Tasks: #1.'] });
});

/* ONE BAD LINE IS ONE NIGHT LOST, NOT EVERY NIGHT (`loop/research-batch-twenty-four-audit.md` §7). Measured before the
   fix: a good night on the 19th, then a line whose `updated` item had no `fields`, and `--since` threw "Cannot read
   properties of undefined (reading 'join')" with nothing said. The lists were checked and their items were not. */
test('A REMEMBERED LINE WHOSE ITEMS ARE THE WRONG SHAPE IS PASSED OVER WITH A NOTE NAMING IT, and the good nights are still read', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-shape-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const night = (at: string, o: Record<string, unknown> = {}) => JSON.stringify({ at, host: 'h', file: 'e.json', taken: null, created: [{ register: 'tasks', label: '#1' }], updated: [], refused: [], skipped: [], ...o });
  mkdirSync(join(dir, '.braindog'));
  const file = join(dir, '.braindog', 'imports.jsonl');
  const lines = [
    night('2026-09-19T03:00:00.000Z'),
    night('2026-09-20T03:00:00.000Z', { updated: [{ register: 'tasks', label: '#1' }] }),
    night('2026-09-20T04:00:00.000Z', { skipped: [{ reason: 'No place', items: 'Widget' }] }),
    night('2026-09-20T05:00:00.000Z', { refused: [{ register: 'tasks', label: 7, fix: 'No.' }] }),
    night('2026-09-20T06:00:00.000Z', { taken: 20260915 }),
    night('not a time'),
    night('2026-09-21T03:00:00.000Z'),
  ];
  writeFileSync(file, `${lines.join('\n')}\n`);
  const out: string[] = [];
  const say: string[] = [];
  const io: AgentIo = { env: {} as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => say.push(l), headers: async () => ({}) };
  assert.equal(await importCommand(['legacy', '--since', '2026-09-01'], io, TODAY, undefined, UTC), 0, say.join(' '));
  assert.deepEqual(out.filter((l) => / into /u.test(l)), ['2026-09-19 03:00 UTC into h:', '2026-09-21 03:00 UTC into h:']);
  assert.deepEqual(
    say,
    [2, 3, 4, 5, 6].map((n) => `Line ${String(n)} of ${file} is not a run as this command writes one, so it was passed over.`),
  );
});
