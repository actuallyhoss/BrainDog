/**
 * Who takes a page's address when two pages would slug alike (`resolvePages`). A template whose rows are many and come
 * and go, the runs' own list or one that says `fleeting: true`, claims after every steadier page, so a run named for a
 * skill never takes the skill's `/p/` address, and an address a steadier page holds never moves when a run arrives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { claimRank } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const OWNER = { actor: 'p_owner' };

const SKILLS: Declaration = {
  id: 'register.skills',
  kind: 'register',
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
    ],
  },
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};

const page = (id: string, body: Record<string, unknown>): Declaration => ({
  id: `page.${id}`,
  kind: 'page',
  body: { page: id, blocks: [{ kind: 'note', body: 'Here.' }], ...body },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const addresses = (k: Kernel): Record<string, string> =>
  Object.fromEntries(k.pages().map((p) => [p.slug, p.template ?? p.slug]));

test('A RUN NAMED FOR A SKILL NEVER TAKES THE SKILL’S ADDRESS: the run is the page that is numbered', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      SKILLS,
      page('skill', { title: '{{name}}', for: { register: 'skills', where: 'state is active' } }),
      page('run', { title: '{{doing}}', for: { register: 'session' } }),
    ]),
  );
  value(k.create('skills', { name: 'Review PR' }, OWNER));
  value(k.create('session', { doing: 'Review PR' }, OWNER));

  const at = addresses(k);
  assert.equal(at['review-pr'], 'skill', `the skill lost its address: ${JSON.stringify(at)}`);
  const runs = Object.entries(at).filter(([, t]) => t === 'run');
  assert.equal(runs.length, 1);
  assert.notEqual(runs[0]![0], 'review-pr');
  assert.match(runs[0]![0], /^review-pr-/u);

  /* AND A SECOND RUN OF THAT NAME MOVES NOTHING ELSE. */
  const before = addresses(k);
  value(k.create('session', { doing: 'Review PR' }, OWNER));
  const after = addresses(k);
  for (const [slug, template] of Object.entries(before)) assert.equal(after[slug], template, `${slug} moved`);
});

test('A TEMPLATE THAT SAYS ITS ROWS COME AND GO CLAIMS AFTER ONE THAT SAYS NOTHING, whatever their ids', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      SKILLS,
      NOTES,
      page('a-note', { title: '{{name}}', for: { register: 'notes', fleeting: true } }),
      page('b-skill', { title: '{{name}}', for: { register: 'skills' } }),
    ]),
  );
  value(k.create('notes', { name: 'Kiln' }, OWNER));
  value(k.create('skills', { name: 'Kiln' }, OWNER));
  const at = addresses(k);
  assert.equal(at.kiln, 'b-skill');
  assert.equal(Object.values(at).filter((t) => t === 'a-note').length, 1);
});

test('AN ADDRESS ALREADY HANDED OUT NEVER MOVES: a newer row of another template named alike is the one numbered', async () => {
  const clock = fixedClock(NOW);
  const k = await openRecord(openSqlite(), clock);
  value(
    await k.install([
      SKILLS,
      NOTES,
      page('a-note', { title: '{{name}}', for: { register: 'notes' } }),
      page('b-skill', { title: '{{name}}', for: { register: 'skills' } }),
    ]),
  );
  /* The skill came first, so it keeps `/p/kiln` though `a-note` sorts before `b-skill`. */
  value(k.create('skills', { name: 'Kiln' }, OWNER));
  clock.advance(60_000);
  const before = addresses(k);
  assert.equal(before.kiln, 'b-skill');
  value(k.create('notes', { name: 'Kiln' }, OWNER));
  const after = addresses(k);
  for (const [slug, template] of Object.entries(before)) assert.equal(after[slug], template, `${slug} moved`);
  const note = Object.entries(after).find(([, t]) => t === 'a-note');
  assert.ok(note);
  assert.match(note[0], /^kiln-/u);
});

test('THE ORDER OF CLAIMING: a page somebody wrote, then a steady template, then one over rows that come and go', () => {
  assert.equal(claimRank({ page: 'home', title: 'Home', blocks: [] }), 0);
  assert.equal(claimRank({ page: 'skill', title: '{{name}}', blocks: [], for: { register: 'skills' } }), 1);
  assert.equal(claimRank({ page: 'run', title: '{{doing}}', blocks: [], for: { register: 'session' } }), 2);
  assert.equal(claimRank({ page: 'call', title: '{{who}}', blocks: [], for: { register: 'calls', fleeting: true } }), 2);
});

test('A TEMPLATE THAT BROKE DOES NOT TAKE A ROW’S ADDRESS: its own page is the one numbered', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(
    await k.install([
      SKILLS,
      page('skill', { title: '{{name}}', for: { register: 'skills' } }),
      page('kiln', { title: '{{name}}', for: { register: 'skills', where: 'nothing is here' } }),
    ]),
  );
  value(k.create('skills', { name: 'Kiln' }, OWNER));
  const pages = k.pages();
  assert.equal(pages.find((p) => p.slug === 'kiln')?.template, 'skill', JSON.stringify(pages.map((p) => [p.slug, p.template])));
});
