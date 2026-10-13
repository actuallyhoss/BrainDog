/**
 * A project page lists the keys and the skills that are the project's own (PGS-C31, the step after Tools and servers).
 *
 * HIS PAGES OFFERED EVERY KEY HE HOLDS UNDER EVERY PROJECT. `runs_on` answers a project's own first and the ones that
 * apply everywhere after them, so Keys and Skills on a project with none of its own filled with three of everybody's,
 * the same three on every project, as Tools and servers did before batch 60 narrowed it. The two tiles read the
 * project's own alone now, and a project with none draws neither.
 *
 * WHAT APPLIES EVERYWHERE IS NOT LOST: it stays in the record's own lists of keys and of skills, the lists Agents
 * stands over, and an agent working in the project is still handed it (`inScope`). It is said there, once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

type Drawn = PageResult['blocks'][number] & { scopes?: (string | null)[] };
type Held = { rows: { fields: Record<string, unknown> }[]; inherited: { fields: Record<string, unknown> }[] };

/** The page a project was given, found by its title. */
const opened = (k: Kernel, name: string): PageResult => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  const out = k.page(page.slug);
  assert.ok(out.ok, `${name}: ${sayOf(out)}`);
  return out.value;
};

/** The one tile under `heading` on a project's page, which refuses nothing. */
const card = (k: Kernel, name: string, heading: string): Drawn => {
  const [found, ...more] = opened(k, name).blocks.filter((b) => b.heading === heading) as Drawn[];
  assert.ok(found && more.length === 0, `${name} has ${more.length + (found ? 1 : 0)} tiles headed ${heading}`);
  assert.deepEqual(found.refusals, [], JSON.stringify(found.refusals));
  return found;
};

const said = (b: Drawn): string[] => b.rows.map((r) => String(r.fields.name));
const places = (b: Drawn): unknown[] => b.rows.map((r) => r.fields.scope);

/** A project made here, with one open task so its page has something on it, and the name a row is filed under it by. */
const project = (k: Kernel, name: string): string => {
  const made = k.create('things', { name, lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  assert.ok(k.create('tasks', { what: 'Ship the first build', thing: spoken, state: 'open' }, PERSON).ok);
  return spoken;
};

/** What a project holds of a list and what reaches it from everywhere, as an agent working there is handed it. */
const held = (k: Kernel, list: string, spoken: string): Held => {
  const out = (k as unknown as { inScope: (list: string, at: string) => { ok: boolean; value: Held } }).inScope(list, spoken);
  assert.ok(out.ok, `${list} cannot be read for ${spoken}`);
  return out.value;
};

test('A PROJECT WITH NO KEY OR SKILL OF ITS OWN DRAWS NEITHER CARD, whatever applies everywhere', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  /* THE SAMPLE HOLDS KEYS AND SKILLS THAT APPLY EVERYWHERE, or this would pass over a record with none to list. */
  for (const list of ['credentials', 'skills']) {
    const here = held(k, list, spoken);
    assert.deepEqual(here.rows, [], `Harbour already holds something in ${list}`);
    assert.ok(here.inherited.length > 0, `the sample has nothing in ${list} that applies everywhere`);
  }
  assert.deepEqual(said(card(k, 'Harbour', 'Keys')), [], 'a key that is not Harbour’s is listed on Harbour');
  assert.deepEqual(said(card(k, 'Harbour', 'Skills')), [], 'a skill that is not Harbour’s is listed on Harbour');
});

test('A PROJECT WITH A KEY AND A SKILL OF ITS OWN DRAWS ITS OWN ALONE, each marked with the project', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  const key = k.create('credentials', { label: 'Harbour deploy key', opens: 'Deploys to Harbour', kind: 'note', project: spoken } as never, PERSON);
  assert.ok(key.ok, sayOf(key));
  const skill = k.create('skills', { name: 'harbour-release', trigger: 'Before tagging a Harbour release.', body: '# Release Harbour', project: spoken } as never, PERSON);
  assert.ok(skill.ok, sayOf(skill));

  const keys = card(k, 'Harbour', 'Keys');
  assert.deepEqual(said(keys), ['Harbour deploy key']);
  assert.deepEqual(places(keys), ['project']);
  assert.deepEqual(keys.scopes, ['Harbour']);
  const skills = card(k, 'Harbour', 'Skills');
  assert.deepEqual(said(skills), ['harbour-release']);
  assert.deepEqual(places(skills), ['project']);
  assert.deepEqual(skills.scopes, ['Harbour']);
});

test('THE SAMPLE’S OWN PROJECT SAYS ITS OWN KEYS AND SKILLS, and none of everybody’s fills the room left', async () => {
  const k = await seeded();
  for (const [list, heading] of [['credentials', 'Keys'], ['skills', 'Skills']] as const) {
    const here = held(k, list, 'things#1');
    assert.ok(here.rows.length > 0 && here.rows.length < 3, `Kiln holds ${here.rows.length} in ${list}, so the card has no room to fill`);
    const drawn = card(k, 'Kiln', heading);
    assert.equal(drawn.rows.length, here.rows.length, `${heading}: ${said(drawn).join(', ')}`);
    assert.deepEqual([...new Set(places(drawn))], ['project'], `${heading}: ${said(drawn).join(', ')}`);
  }
});

test('WHAT APPLIES EVERYWHERE IS STILL IN THE LISTS AGENTS STANDS OVER, and still reaches an agent in the project', async () => {
  const k = await seeded();
  const spoken = project(k, 'Harbour');
  for (const [list, heading] of [['credentials', 'Keys'], ['skills', 'Skills']] as const) {
    const everywhere = k.list({ register: list, where: 'project is not set', limit: 50 } as never);
    assert.ok(everywhere.ok && everywhere.value.rows.length > 0, `${list} holds nothing that applies everywhere`);
    assert.equal(held(k, list, spoken).inherited.length > 0, true, `an agent in Harbour is handed nothing from ${list}`);
    assert.deepEqual(said(card(k, 'Harbour', heading)), []);
  }
});

test('THE THREE CARDS OVER WHAT A PROJECT RUNS ON ASK FOR THE PROJECT’S OWN, each in its own words', () => {
  const blocks = (PORTFOLIO_PAGES.project!.blocks as { source?: string; heading?: string; where?: string }[]).filter((b) => b.source === 'runs_on');
  assert.deepEqual(
    blocks.map((b) => [b.heading, b.where]),
    [
      ['Keys', 'kind is key, scope is project'],
      ['Tools and servers', 'kind is tool, scope is project'],
      ['Skills', 'kind is skill, scope is project'],
    ],
  );
});
