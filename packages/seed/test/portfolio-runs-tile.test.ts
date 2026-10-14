/**
 * A project page says who worked on it once, and what it runs on under one heading (AGT-C12 job d, AGT-D12 job 2).
 *
 * HIS PROJECT PAGES LISTED SIX CARDS ALL TITLED BY THE RECORD'S OWN NAME FOR A RUN. The Agents tile read every run
 * placed in the project, so a run and each helper it started were a card apiece, and so was a run that opened and
 * wrote nothing; and each card was titled by `doing`, which on a run nobody named is the same words on every card.
 * A card is one run of its own that wrote something now, titled by its agent, with what it said it is doing under it.
 *
 * AND WHAT IT RUNS ON HAD NO HEADING OF ITS OWN. Keys, Tools and servers, and Skills sat among the money tiles under
 * "More about" the project, and what reaches a project from everywhere was said nowhere on its page. They are one
 * section headed "Runs on" now: the project's own in the three tiles, and under them "And from everywhere", five at
 * most by name and kind, drawn faint. A project with neither draws no section.
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
type Drawn = PageResult['blocks'][number] & { drawn?: boolean; columns?: Column[]; scopes?: (string | null)[] };
type Declared = { kind: string; heading?: string; source?: string; where?: string; limit?: number; box?: boolean; empty?: string; columns?: Column[] };

/** The sample record: a project of its own, and keys, tools and skills that apply everywhere. */
async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

/** The same lists and pages with nothing in them: no key, tool or skill anywhere. */
async function bare(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const lists = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...ingestDeclarations()]);
  assert.ok(lists.ok, sayOf(lists));
  const agents = await installAgentsPack(k);
  assert.ok(agents.ok, sayOf(agents));
  return k;
}

/** The page a project was given, found by its title, with nothing on it refused. */
const opened = (k: Kernel, name: string): Drawn[] => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  const out = k.page(page.slug);
  assert.ok(out.ok, `${name}: ${sayOf(out)}`);
  const blocks = out.value.blocks as Drawn[];
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${String(b.heading)}: ${JSON.stringify(b.refusals)}`);
  return blocks;
};

/** The one block under `heading` on a project's page. */
const headed = (blocks: Drawn[], heading: string): Drawn => {
  const [found, ...more] = blocks.filter((b) => b.heading === heading);
  assert.ok(found && more.length === 0, `${more.length + (found ? 1 : 0)} blocks are headed ${heading}`);
  return found;
};

const role = (b: { columns?: Column[] }, as: string): string[] => (b.columns ?? []).filter((c) => c.as === as).map((c) => c.field);

/** A project made here, with one open task so its page has something on it, and the name a row is filed under it by. */
const project = (k: Kernel, name: string): string => {
  const made = k.create('things', { name, lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: spoken, state: 'open' }, PERSON).ok);
  return spoken;
};

const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

/** A run planted as the seed plants one, the fields only the record writes stamped. Answers its spoken id, `S12`. */
const run = (k: Kernel, fields: Record<string, unknown>, stamp: Record<string, unknown>): string => {
  const made = k.create('session', fields as never, { actor: 'p_seed', stamp } as never);
  assert.ok(made.ok, sayOf(made));
  return `S${made.value.seq}`;
};

/** The project template's blocks as they are declared. */
const DECLARED = PORTFOLIO_PAGES.project!.blocks as unknown as Declared[];

/** The headings a section holds, as declared: the blocks after it up to the next section. */
const under = (heading: string): Declared[] => {
  const at = DECLARED.findIndex((b) => b.kind === 'section' && b.heading === heading);
  assert.ok(at >= 0, `no section is headed ${heading}`);
  const rest = DECLARED.slice(at + 1);
  const end = rest.findIndex((b) => b.kind === 'section');
  return end < 0 ? rest : rest.slice(0, end);
};

test('ONE CARD FOR A RUN AND ITS HELPERS: a run that wrote something and four helpers of it draw one card, titled by the agent', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  const lead = run(k, { doing: 'Rebuilding the harbour pier', agent: 'claude', state: 'active' }, { project: spoken, last_seen: ago(4), wrote: 6 });
  for (const n of [1, 2, 3, 4])
    run(k, { doing: `Helper ${n} of the pier`, agent: 'claude', state: 'done' }, { project: spoken, last_seen: ago(4 + n), wrote: n, parent: lead });

  const tile = headed(opened(k, 'Harbour'), 'Agents');
  assert.notEqual(tile.drawn, false, 'the tile is not drawn over a run that wrote something');
  assert.equal(tile.rows.length, 1, `Harbour draws ${tile.rows.length} cards: ${tile.rows.map((r) => String(r.fields.doing)).join(', ')}`);
  assert.equal(tile.matched, 1);
  /* THE TITLE IS THE AGENT AND THE SENTENCE WHAT IT SAID, as a card on Agents is. */
  assert.deepEqual([role(tile, 'title'), role(tile, 'reply'), role(tile, 'when')], [['agent'], ['doing_said'], ['last_seen']]);
  assert.equal(tile.rows[0]!.fields.agent, 'claude');
  assert.equal(tile.rows[0]!.fields.doing_said, 'Rebuilding the harbour pier');
});

test('A RUN THAT WROTE NOTHING DRAWS NO CARD, and a tile over none is not drawn', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  run(k, { doing: 'Opened and left', agent: 'codex', state: 'done' }, { project: spoken, last_seen: ago(30), wrote: 0 });

  const tile = headed(opened(k, 'Harbour'), 'Agents');
  assert.deepEqual(tile.rows, [], 'a run that wrote nothing has a card');
  assert.equal(tile.drawn, false, 'a tile with no run in it is drawn');
});

test('A RUN OF ANOTHER PROJECT IS NOT ON THIS ONE, and the latest three of its own are, newest first', async () => {
  const k = await seeded();
  const harbour = project(k, 'Harbour');
  const quay = project(k, 'Quay');
  const said = ['Laying the first plank', 'Sanding the rail', 'Painting the bollards', 'Hanging the lamps'];
  said.forEach((doing, i) => run(k, { doing, agent: i % 2 ? 'codex' : 'claude', state: 'done' }, { project: harbour, last_seen: ago(60 * (i + 1)), wrote: 1 }));
  run(k, { doing: 'Dredging the quay', agent: 'claude', state: 'done' }, { project: quay, last_seen: ago(5), wrote: 2 });

  const tile = headed(opened(k, 'Harbour'), 'Agents');
  assert.deepEqual(tile.rows.map((r) => r.fields.doing_said), said.slice(0, 3));
  assert.equal(tile.matched, 4);
});

test('THE TILE ASKS FOR A RUN OF ITS OWN THAT WROTE SOMETHING, in the words the Agents page uses', () => {
  const tile = DECLARED.find((b) => b.kind === 'cards' && b.heading === 'Agents');
  assert.equal(tile?.source, 'register.session');
  assert.equal(tile?.where, 'project is {{spoken}}, parent is empty, wrote is not 0');
  assert.equal(tile?.limit, 3);
});

const OWN = ['Keys', 'Tools and servers', 'Skills'];
const EVERYWHERE = 'And from everywhere';

test('WHAT A PROJECT RUNS ON IS ONE SECTION HEADED Runs on: the three tiles of its own, then what reaches it from everywhere', () => {
  const held = under('Runs on');
  assert.deepEqual(held.map((b) => [b.kind, b.heading, b.source]), [...OWN, EVERYWHERE].map((heading) => ['cards', heading, 'runs_on']));
  /* ONE SURFACE, as "More about" is, and no tile of the four says it is empty: a part with nothing in it is not drawn. */
  assert.equal(DECLARED.find((b) => b.kind === 'section' && b.heading === 'Runs on')?.box, true);
  for (const b of held) assert.equal(b.empty, undefined, `${b.heading} says it is empty`);
  /* AND NOWHERE ELSE ON THE PAGE: the three left "More about" for it. */
  assert.equal(DECLARED.filter((b) => b.source === 'runs_on').length, 4);
  assert.deepEqual(under('More about {{name}}').filter((b) => b.source === 'runs_on'), []);

  const quiet = held.at(-1)!;
  assert.equal(quiet.limit, 5);
  assert.match(quiet.where ?? '', /(^|, )scope is global(,|$)/u);
  assert.deepEqual([role(quiet, 'title'), role(quiet, 'fact'), role(quiet, 'who'), role(quiet, 'when')], [['name'], ['kind'], ['used_agents'], ['used_at']]);
});

test('AND FROM EVERYWHERE LISTS FIVE AT MOST, by name and kind, drawn quiet, under the project’s own', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  assert.ok(k.create('credentials', { label: 'Harbour deploy key', opens: 'Deploys to Harbour', kind: 'note', project: spoken } as never, PERSON).ok);
  /* MORE THAN FIVE APPLY EVERYWHERE, or five at most is not what holds the block to five. */
  for (const n of [1, 2, 3, 4, 5, 6])
    assert.ok(k.create('skills', { name: `everywhere-${n}`, trigger: `Before step ${n}.`, body: `# Step ${n}` } as never, PERSON).ok);

  const blocks = opened(k, 'Harbour');
  const at = (heading: string): number => blocks.indexOf(headed(blocks, heading));
  /* THE SECTION, THEN THE PROJECT'S OWN, THEN EVERYBODY'S, in that order on the page as drawn. */
  assert.notEqual(headed(blocks, 'Runs on').drawn, false);
  assert.deepEqual([at('Runs on'), ...OWN.map(at), at(EVERYWHERE)].map((n, i, all) => (i === 0 ? true : n > all[i - 1]!)), [true, true, true, true, true]);
  const keys = headed(blocks, 'Keys');
  assert.deepEqual(keys.rows.map((r) => r.fields.name), ['Harbour deploy key']);
  assert.deepEqual(keys.rows.map((r) => r.fields.scope), ['project']);

  const quiet = headed(blocks, EVERYWHERE);
  assert.notEqual(quiet.drawn, false);
  assert.equal(quiet.rows.length, 5);
  assert.ok((quiet.matched as number) > 5, 'the sample holds five or fewer that apply everywhere');
  for (const r of quiet.rows) {
    assert.equal(r.fields.scope, 'global', `${String(r.fields.name)} is the project's own`);
    /* DRAWN QUIET: the word a host dims a card by (`runs-on.ts`), on every one of them. */
    assert.equal(r.fields.quiet, 'global');
    assert.ok(String(r.fields.name).trim() !== '', 'a card has no name');
    assert.ok(['key', 'tool', 'skill'].includes(String(r.fields.kind)), `${String(r.fields.name)} is a ${String(r.fields.kind)}`);
  }
  /* NONE OF THEM CARRIES THE PROJECT'S CHIP, which says a thing is the project's own. */
  assert.deepEqual(quiet.scopes, [null, null, null, null, null]);
  assert.ok(!quiet.rows.some((r) => r.fields.name === 'Harbour deploy key'));
});

test('WITH NOTHING THAT APPLIES EVERYWHERE THE BLOCK IS ABSENT, and the project’s own still stand under the heading', async () => {
  const k = await bare();
  const spoken = project(k, 'Harbour');
  assert.ok(k.create('credentials', { label: 'Harbour deploy key', opens: 'Deploys to Harbour', kind: 'note', project: spoken } as never, PERSON).ok);

  const blocks = opened(k, 'Harbour');
  assert.notEqual(headed(blocks, 'Runs on').drawn, false, 'the section went with a key of the project’s own under it');
  assert.deepEqual(headed(blocks, 'Keys').rows.map((r) => r.fields.name), ['Harbour deploy key']);
  assert.deepEqual(headed(blocks, EVERYWHERE).rows, []);
  assert.equal(headed(blocks, EVERYWHERE).drawn, false);
});

test('A PROJECT WITH NOTHING OF ITS OWN AND NOTHING INHERITED DRAWS NO SECTION', async () => {
  const k = await bare();
  project(k, 'Harbour');
  const blocks = opened(k, 'Harbour');
  for (const heading of [...OWN, EVERYWHERE]) assert.equal(headed(blocks, heading).drawn, false, `${heading} is drawn over nothing`);
  assert.equal(headed(blocks, 'Runs on').drawn, false, 'a heading over nothing is drawn');
});

test('A PROJECT WITH NOTHING OF ITS OWN STILL SAYS WHAT REACHES IT, under the heading', async () => {
  const k = await seeded();
  project(k, 'Harbour');
  const blocks = opened(k, 'Harbour');
  for (const heading of OWN) assert.equal(headed(blocks, heading).drawn, false, `${heading} is drawn with none of Harbour’s own`);
  assert.notEqual(headed(blocks, 'Runs on').drawn, false);
  const quiet = headed(blocks, EVERYWHERE);
  assert.ok(quiet.rows.length > 0 && quiet.rows.length <= 5);
  assert.deepEqual([...new Set(quiet.rows.map((r) => r.fields.scope))], ['global']);
});
