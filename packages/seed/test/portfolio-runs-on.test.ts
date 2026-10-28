/**
 * Runs on, said true (batch 89): six of a project's own a tile, who used each by the agent's name, and
 * under them how many more apply everywhere.
 *
 * HIS BRAINDOG PAGE READ "S731" AND A RAW TIME beside a key, three a tile, and every project page listed the same
 * three tools of everybody's as its own. The tiles read the project's own alone, six of each, with the agent that used
 * one by name ("Claude Code") where the run's handle stood; and And from everywhere lists five, with the rest counted
 * by the block's own count, so the host's line under it says how many more and says nothing at nought.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, declarations, ingestDeclarations, installAgentsPack, installSeed, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };

type Column = { field: string; as?: string; label?: string };
type Drawn = PageResult['blocks'][number] & { drawn?: boolean; inherited?: number };
type Declared = { kind: string; heading?: string; source?: string; where?: string; limit?: number; span?: number; columns?: Column[] };

const OWN = [
  ['Keys', 'key'],
  ['Tools and servers', 'tool'],
  ['Skills', 'skill'],
] as const;
const EVERYWHERE = 'And from everywhere';

const DECLARED = PORTFOLIO_PAGES.project!.blocks as unknown as Declared[];
const declared = (heading: string): Declared => {
  const found = DECLARED.filter((b) => b.source === 'runs_on' && b.heading === heading);
  assert.equal(found.length, 1, `${found.length} runs_on blocks are headed ${heading}`);
  return found[0]!;
};
const role = (b: { columns?: Column[] }, as: string): string[] => (b.columns ?? []).filter((c) => c.as === as).map((c) => c.field);

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

/** The lists and pages with nothing in them, so what applies everywhere is only what a test adds. */
async function bare(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const lists = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...ingestDeclarations()]);
  assert.ok(lists.ok, sayOf(lists));
  const agents = await installAgentsPack(k);
  assert.ok(agents.ok, sayOf(agents));
  return k;
}

const project = (k: Kernel, name: string): string => {
  const made = k.create('things', { name, lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: spoken, state: 'open' }, PERSON).ok);
  return spoken;
};

const opened = (k: Kernel, name: string): Drawn[] => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  const out = k.page(page.slug);
  assert.ok(out.ok, `${name}: ${sayOf(out)}`);
  const blocks = out.value.blocks as Drawn[];
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);
  return blocks;
};

const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.filter((b) => b.heading === heading);
  assert.equal(found.length, 1, `${found.length} blocks are headed ${heading}`);
  return found[0]!;
};

const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

/** A run of `agent`, as the seed plants one, answering its handle, `S12`. */
const run = (k: Kernel, agent: string, client: string): string => {
  const made = k.create('session', { doing: 'Wiring the deploy', agent, client, state: 'done' } as never, { actor: 'p_seed', stamp: { last_seen: ago(30), wrote: 1 } } as never);
  assert.ok(made.ok, sayOf(made));
  return `S${made.value.seq}`;
};

/** A tool of `spoken`'s own, seen by the actor that writes it. */
const tool = (k: Kernel, spoken: string | null, name: string, by: { actor: string } = PERSON, seen?: string): void => {
  const fields = { name, kind: 'cli', ...(spoken ? { project: spoken } : {}), ...(seen ? { seen } : {}) };
  const made = k.create('tools', fields as never, by);
  assert.ok(made.ok, `${name}: ${sayOf(made)}`);
};

test('THE THREE TILES READ THE PROJECT’S OWN, SIX OF EACH, at a third of the tile, and who used one by the agent’s name', () => {
  for (const [heading, kind] of OWN) {
    const b = declared(heading);
    assert.equal(b.limit, 6, `${heading} draws ${String(b.limit)}`);
    assert.equal(b.where, `kind is ${kind}, scope is project`);
    assert.equal(b.span, 4, `${heading} is not a third`);
  }
  /* A SKILL HAS NO USE THE RECORD COUNTS, so only keys and tools name who used one, and never by the run's handle. */
  for (const heading of ['Keys', 'Tools and servers']) {
    const who = role(declared(heading), 'who');
    assert.equal(who.length, 1, `${heading} names ${who.length} who`);
    assert.match(who[0]!, /^used_agents?$/u, `${heading} names who by ${who[0]!}`);
    assert.deepEqual(role(declared(heading), 'when'), ['used_at']);
  }
  assert.deepEqual(role(declared('Skills'), 'who'), []);
  const quiet = declared(EVERYWHERE);
  assert.equal(quiet.limit, 5);
  assert.equal(quiet.span, 12);
});

test('WHO IS THE NAME THE KERNEL ANSWERS: the most names it gives, never the run’s handle', async () => {
  const k = await bare();
  const spoken = project(k, 'Harbour');
  tool(k, spoken, 'harbour-cli', { actor: run(k, 'claude', 'claude-code') }, ago(90));
  /* A SECOND AGENT SEES IT LATER, so both are named, by name. */
  const seen = k.update('tools', 'tools#1', { seen: ago(60) } as never, { actor: run(k, 'codex', 'codex') });
  assert.ok(seen.ok, sayOf(seen));
  const tools = headed(opened(k, 'Harbour'), 'Tools and servers');
  assert.equal(tools.rows.length, 1);
  const row = tools.rows[0]!.fields;
  /* `used_agents` ONCE THE KERNEL ANSWERS IT, up to three names; `used_agent` until then. */
  const field = Object.hasOwn(row, 'used_agents') ? 'used_agents' : 'used_agent';
  assert.deepEqual(role(declared('Tools and servers'), 'who'), [field], `the kernel answers ${field} and the tile does not read it`);
  assert.deepEqual(role(declared('Keys'), 'who'), [field]);
  assert.deepEqual(role(declared(EVERYWHERE), 'who'), [field]);
  const said = String(row[field]);
  assert.doesNotMatch(said, /\bS[0-9]+\b/u, `who read ${said}`);
  if (field === 'used_agents') assert.deepEqual(said.split(', ').sort(), ['Claude Code', 'Codex'], `who read ${said}`);
  else assert.equal(said, 'Codex');
  assert.equal(row.used_at, ago(60));
});

test('SIX OF A PROJECT’S OWN A TILE, the rest counted, and none of everybody’s among them', async () => {
  const k = await bare();
  const spoken = project(k, 'Harbour');
  for (const n of [1, 2, 3, 4, 5, 6, 7]) tool(k, spoken, `harbour-tool-${n}`);
  tool(k, null, 'everybody-tool');
  const blocks = opened(k, 'Harbour');
  const tools = headed(blocks, 'Tools and servers');
  assert.equal(tools.rows.length, 6);
  assert.equal(tools.matched, 7, 'the seventh is not counted, so nothing says one more');
  assert.deepEqual([...new Set(tools.rows.map((r) => r.fields.scope))], ['project']);
  assert.ok(!tools.rows.some((r) => r.fields.name === 'everybody-tool'));
  assert.deepEqual(headed(blocks, EVERYWHERE).rows.map((r) => r.fields.name), ['everybody-tool']);
});

test('AND FROM EVERYWHERE LISTS FIVE AND COUNTS THE REST, so the line under it says how many more', async () => {
  const k = await seeded();
  project(k, 'Harbour');
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.ok(k.create('skills', { name: `everywhere-${n}`, trigger: `Before step ${n}.`, body: `# Step ${n}` } as never, PERSON).ok);
  const quiet = headed(opened(k, 'Harbour'), EVERYWHERE);
  assert.equal(quiet.rows.length, 5);
  /* THE COUNT IS EVERY ROW THAT APPLIES EVERYWHERE, before the cut to five: the host says `matched - 5` more. */
  const more = (quiet.matched as number) - quiet.rows.length;
  assert.ok(more >= 7, `the block counts ${more} more past five, with seven skills added`);
  if (typeof quiet.inherited === 'number') assert.equal(quiet.inherited, quiet.matched, 'the kernel’s inherited count and the block’s disagree');
});

test('NOTHING MORE TO SAY AT NOUGHT: with five or fewer from everywhere the count is the rows drawn', async () => {
  const k = await bare();
  project(k, 'Harbour');
  for (const n of [1, 2, 3]) tool(k, null, `everybody-${n}`);
  const quiet = headed(opened(k, 'Harbour'), EVERYWHERE);
  assert.equal(quiet.rows.length, 3);
  assert.equal(quiet.matched, 3, 'a line would say more than there are');
});

test('A PROJECT WITH NO KEY OF ITS OWN DRAWS NO KEYS TILE, while its own tools stand', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  tool(k, spoken, 'harbour-cli');
  const blocks = opened(k, 'Harbour');
  const keys = headed(blocks, 'Keys');
  assert.deepEqual(keys.rows, [], 'a key of everybody’s is drawn as Harbour’s');
  assert.equal(keys.drawn, false, 'a Keys tile is drawn over none of its own');
  assert.notEqual(headed(blocks, 'Tools and servers').drawn, false);
  assert.notEqual(headed(blocks, 'Runs on').drawn, false);
});
