/**
 * `braindog import legacy`: the mapping of a synthetic export, and the import applied twice to a record kept in
 * memory, which must update and never add a second row. Every value is made up (`legacy-export.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { draftSetup, planLegacyTool, readLegacyTool, readSetup, spoken, type Plan, type Setup } from '../src/legacy.ts';
import { applyPlan, importCommand, said, type Door } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';
import { syntheticExport, syntheticSetup } from './legacy-export.ts';

const TODAY = '2026-09-17';
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

const ALL = ['things', 'people', 'tracks', 'tasks', 'datapoints', 'learnings', 'skills', 'tools', 'credentials', 'accounts', 'obligations', 'services', 'organisations', 'session'];

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

  assert.deepEqual(row(p, 'legacy:recurring:7')!.fields, { what: 'Hosting', direction: 'owed_by_me', amount: { amount: 4500, currency: 'USD' }, due: '2026-10-03', state: 'open', repeats: 'monthly', category: 'other' });
  const retainer = row(p, 'legacy:income:3')!.fields;
  assert.equal(retainer.direction, 'owed_to_me');
  assert.equal(retainer.due, '2026-09-28', 'a monthly series keeps its day of the month');
  assert.deepEqual(skippedItems(p, /weekly and fortnightly/u), ['Gym']);
  assert.deepEqual(skippedItems(p, /one-off that fell before/u), ['Old grant']);
  assert.deepEqual(row(p, 'legacy:instalment:flat:2026-10-01')!.fields.amount, { amount: 2500000, currency: 'EGP' });

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
  assert.deepEqual(order, ['things', 'people', 'tracks', 'tasks', 'datapoints', 'learnings', 'skills', 'tools', 'credentials', 'accounts', 'obligations', 'services', 'session']);
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
  assert.equal(say.at(-1), 'braindog import takes legacy <export.json> [--setup <setup.json>] [--host <host>] [--dry-run], or legacy <export.json> --draft-setup.');
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
