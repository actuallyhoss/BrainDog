/**
 * A project page says nothing about what the project does not have (the Pinwheel picture, `loop/research-prepare-59.json`).
 *
 * ITS PAGE LISTED THREE TOOLS THAT WERE NOT PINWHEEL'S. `runs_on` answers a project's own first and the ones that apply
 * everywhere after them, so a project with no tool of its own filled Tools and servers with three of everybody's. The
 * tile reads the project's own alone now, and a project with none draws no card.
 *
 * AND IT SAID "COSTS A YEAR 0" FOR A LIVE PRODUCT. Nothing was recorded, which is not the same as costing nothing. A
 * stat cell has no key that hides it (a cell is `metric`, `label`, `trend` and `note`), and needs none: the record
 * already leaves out a figure that adds up a field no row has filled in, once the figure's own `where` asks for the
 * field (`unsaid` in the kernel's `metrics.ts`). So `project-cost` reads only what says a cost.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PROJECT_METRICS } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

type Drawn = PageResult['blocks'][number] & { readings?: { metric: string; label?: string; reading: { value: unknown } | null }[]; scopes?: (string | null)[] };

/** The page a project was given, found by its title. */
const opened = (k: Kernel, name: string): PageResult => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  const out = k.page(page.slug);
  assert.ok(out.ok, `${name}: ${sayOf(out)}`);
  return out.value;
};

/** Every block under `heading`, drawn or not, so a test can say which one of a pair the record drew. */
const headed = (p: PageResult, heading: string): Drawn[] => p.blocks.filter((b) => b.heading === heading) as Drawn[];

/** A project made here, with one open task so its page has something on it, and the name a row is filed under it by. */
const project = (k: Kernel, name: string): string => {
  const made = k.create('things', { name, lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: spoken, state: 'open' }, PERSON).ok);
  return spoken;
};

const toolsOf = (k: Kernel, name: string): Drawn => {
  const [tools, ...more] = headed(opened(k, name), 'Tools and servers');
  assert.ok(tools && more.length === 0, `${name} has ${more.length + (tools ? 1 : 0)} tiles headed Tools and servers`);
  assert.deepEqual(tools.refusals, [], JSON.stringify(tools.refusals));
  return tools;
};

test('A PROJECT WITH NO TOOL OF ITS OWN DRAWS NO TOOLS CARD, whatever applies everywhere', async () => {
  const k = await seeded();
  /* THE SAMPLE HOLDS A TOOL THAT APPLIES EVERYWHERE, or this would pass over a record with none to list. */
  const everywhere = k.list({ register: 'tools', where: 'project is not set', limit: 5 } as never);
  assert.ok(everywhere.ok && everywhere.value.rows.length > 0, 'the sample has no tool that applies everywhere');
  project(k, 'Harbour');
  const tools = toolsOf(k, 'Harbour');
  assert.deepEqual(tools.rows.map((r) => r.fields.name), [], 'a tool that is not Harbour’s is listed on Harbour');
});

test('A PROJECT WITH A TOOL OF ITS OWN DRAWS ITS OWN FIRST, and none that is everybody’s', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  const made = k.create('tools', { name: 'harbour-logs', kind: 'mcp', transport: 'http', endpoint: 'https://mcp.harbour.example/v1', trigger: 'To read Harbour’s logs.', project: spoken, state: 'active' } as never, PERSON);
  assert.ok(made.ok, sayOf(made));
  const tools = toolsOf(k, 'Harbour');
  assert.equal(tools.rows[0]?.fields.name, 'harbour-logs');
  assert.deepEqual(tools.rows.map((r) => r.fields.scope), ['project'], tools.rows.map((r) => `${String(r.fields.name)} (${String(r.fields.scope)})`).join(', '));
  assert.deepEqual(tools.scopes, ['Harbour']);
});

/** At a glance as the record drew it, and the same tile as a person reads it: its idle figures taken out. */
const glanceOf = (k: Kernel, name: string): Drawn => {
  const [glance, ...more] = headed(opened(k, name), 'At a glance');
  assert.ok(glance && more.length === 0, `${name} has ${more.length + (glance ? 1 : 0)} tiles headed At a glance`);
  assert.deepEqual(glance.refusals, [], JSON.stringify(glance.refusals));
  assert.notEqual(glance.drawn, false, `${name} draws no At a glance`);
  return glance;
};

const labels = (b: Drawn): unknown[] => (b.readings ?? []).map((r) => r.label);
const cost = (b: Drawn): unknown => b.readings?.find((r) => r.metric.startsWith('project-cost'))?.reading?.value;

/** A service on a project, with what it costs or with nothing said about that. */
const service = (k: Kernel, thing: string, name: string, amount?: number): void => {
  const fields = { name, provider: 'Cove Domains', kind: 'domain', cycle: 'monthly', state: 'live', thing, ...(amount === undefined ? {} : { cost: { amount, currency: 'GBP' } }) };
  const made = k.create('services', fields as never, PERSON);
  assert.ok(made.ok, sayOf(made));
};

test('A LIVE PRODUCT WITH NO COST RECORDED DRAWS NO COSTS A YEAR, where it read 0', async () => {
  const k = await seeded();
  /* WHAT PINWHEEL WAS: a domain it runs on, imported with no cost. */
  service(k, project(k, 'Harbour'), 'harbour.example');
  assert.ok(!labels(glanceOf(k, 'Harbour')).includes('Costs a year'), labels(glanceOf(k, 'Harbour')).join(', '));
  /* AND A PROJECT WITH NOTHING IT RUNS ON, which never drew one. */
  project(k, 'Jetty');
  assert.ok(!labels(glanceOf(k, 'Jetty')).includes('Costs a year'), labels(glanceOf(k, 'Jetty')).join(', '));
  /* THE FIGURE ASKS FOR THE FIELD, which is the one thing that lets the record call its nought unsaid. */
  assert.match(String(PROJECT_METRICS['project-cost']!.where), /(?:^|, )cost is set(?:,|$)/u);
});

test('A PROJECT WITH A COST RECORDED SAYS WHAT IT COSTS A YEAR, and one that costs nothing says 0', async () => {
  const k = await seeded();
  const harbour = project(k, 'Harbour');
  service(k, harbour, 'harbour.example');
  service(k, harbour, 'harbour-mail.example', 1_400);
  const glance = glanceOf(k, 'Harbour');
  assert.ok(labels(glance).includes('Costs a year'), labels(glance).join(', '));
  assert.equal(cost(glance), 16_800, 'twelve months of the one service that says a cost');
  /* A COST TYPED AS 0 IS A COST: free is something somebody said. */
  service(k, project(k, 'Jetty'), 'jetty.example', 0);
  assert.equal(cost(glanceOf(k, 'Jetty')), 0);
  /* AND THE SAMPLE'S OWN IS WHAT IT WAS: the figure as it was declared before, read beside it. A service with no cost
     added nothing then and is not read now. */
  const before = JSON.parse(JSON.stringify(PROJECT_METRICS['project-cost']).replaceAll('{{it}}', 'Kiln').replace(', cost is set', '')) as never;
  const was = k.metric(before);
  assert.ok(was.ok, sayOf(was));
  assert.ok(typeof was.value.value === 'number' && was.value.value > 0, 'the sample says no cost on Kiln');
  assert.equal(cost(glanceOf(k, 'Kiln')), was.value.value);
});
