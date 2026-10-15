/**
 * `pagesCensus` (PGS-A01): one row a page the caller may open, read off the kernel's `censusOf`, with the dashes counted
 * by the page lint and nothing else, cut to what the caller may read, and writing nothing.
 *
 * THE METHOD FILE OVER A REAL KERNEL. The record's own guards are stood in for by two that refuse as they do: a shared
 * link reads no census, and a caller held to some lists reads only those.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, lintAnswer, type CallContext } from '../src/index.ts';
import { methods, type PagesCensus } from '../src/methods/pages-census.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installSeed } from '../../seed/src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['projects'] };
const link: CallContext = { principal: { kind: 'share', id: 'sh_1' } } as unknown as CallContext;

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const DECLS = [
  decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'note', type: 'text' }] }),
  decl('register', 'payroll', { id: 'payroll', name: 'Payroll', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  decl('page', 'project', {
    page: 'project',
    title: '{{name}}',
    for: { register: 'projects' },
    requires: ['register.projects'],
    blocks: [{ kind: 'note', document: true, heading: 'Notes', body: '{{note}}' }],
  }),
  decl('page', 'overview', {
    page: 'overview',
    title: 'Overview',
    requires: ['register.projects', 'register.payroll'],
    blocks: [
      { kind: 'note', heading: 'Lead', body: 'We hold {{projects.count}} projects and {{nothing.here}} and {{payroll.count}} people paid.' },
      { kind: 'stat', heading: 'Figures', cells: [{ metric: 'no-such-figure' }] },
      { kind: 'note', heading: 'Marked', icon: 'board', body: 'Plain words.' },
      { kind: 'table', heading: 'Pay', source: 'register.payroll' },
    ],
  }),
  decl('page', 'payday', { page: 'payday', title: 'Payday', requires: ['register.payroll'], blocks: [{ kind: 'table', heading: 'Pay', source: 'register.payroll' }] }),
];

async function census() {
  const sql = openSqlite();
  const first = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await first.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  /* A GLYPH NO HOST DRAWS, ON A PAGE STORED BEFORE THE INSTALL REFUSED ONE (`declare.ts` `glyphFault`): written into the
     stored body, and the record opened again over it, as a record carried from an older build is. */
  sql.exec("UPDATE declaration SET body = json_set(body, '$.blocks[2].icon', 'not-a-glyph-at-all') WHERE id = 'page.overview' AND superseded_at IS NULL");
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = (await api.create({ register: 'projects', fields: { name: 'Kiln', note: 'See {{kiln.budget}} for {{projects.count}} projects.' } }, owner)) as { ok: boolean };
  assert.ok(made.ok, JSON.stringify(made));
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const deps = {
    kernel: api.kernel,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('A link reads one page.') : null),
    readable: (ctx: CallContext, list: string) =>
      ctx.registers === undefined || ctx.registers === '*' || (ctx.registers as string[]).includes(list) ? null : refuse('Not one of yours.'),
    no,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return { sql, api, read: methods(deps) };
}

const value = (out: Result<PagesCensus>): PagesCensus => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('THE OWNER READS ONE ROW A PAGE: what each holds, each path that named nothing, each glyph and each dash', async () => {
  const { sql, read } = await census();
  const got = value(await read.pagesCensus({}, owner));
  const by = new Map(got.pages.map((p) => [p.slug, p]));
  assert.deepEqual([...by.keys()].sort(), ['kiln', 'overview', 'payday']);
  const overview = by.get('overview')!;
  assert.equal(overview.title, 'Overview');
  assert.equal(overview.held, 'stored');
  assert.equal(overview.blocks, 4);
  assert.equal(overview.drawn, 3, 'an empty table under its when is not drawn');
  assert.deepEqual(overview.unresolved, ['nothing.here']);
  assert.deepEqual(overview.glyphs_unknown, ['not-a-glyph-at-all']);
  assert.equal(overview.dashes, 1, 'the figure with no reading draws a dash');
  const kiln = by.get('kiln')!;
  assert.equal(kiln.held, 'generated');
  assert.equal(kiln.title, 'Kiln');
  assert.deepEqual(kiln.unresolved, ['kiln.budget'], 'a path in the note that names nothing, and never the row field it was filled from');
  assert.deepEqual(got.totals, { pages: 3, refused: 0, unresolved: 2, dashed: 1, dashes: 1, glyphs_unknown: 1, undrawn: [], unread: 0 });
  sql.close();
});

test('THE DASHES ARE THE PAGE LINT’S COUNT, never a second scanner', async () => {
  const { sql, api, read } = await census();
  const got = value(await read.pagesCensus({}, owner));
  for (const row of got.pages) {
    const answer = api.kernel.page(row.slug);
    assert.ok(answer.ok);
    const lint = lintAnswer(answer.value, null).filter((f) => f.rule === 'no-reading' || f.rule === 'only-a-dash').length;
    assert.equal(row.dashes, lint, `${row.title} counts what the lint counts`);
  }
  sql.close();
});

test('A CALLER HELD TO SOME LISTS reads only the pages they may open, and a held block names nothing', async () => {
  const { sql, read } = await census();
  const got = value(await read.pagesCensus({}, narrow));
  const slugs = got.pages.map((p) => p.slug).sort();
  /* PAYDAY READS ONLY PAYROLL, so it is not theirs to open. KILN'S ONE BLOCK PRINTS `{{kiln.budget}}`, which reads as a
     list called kiln that they may not read, so the page holds that block from them as `page` does, and a page whose
     every drawn block is held is not counted, as `whollyWithheld` keeps it off their pages. */
  assert.deepEqual(slugs, ['overview']);
  const overview = got.pages.find((p) => p.slug === 'overview')!;
  /* THE EMPTY PAY TABLE IS ON THEIR PAGE AS A REFUSAL, though the owner's `when:` leaves it undrawn: a held block is
     drawn as its shell, as `shellOf` drops `drawn`. */
  assert.deepEqual(overview.refused, [{ n: 0, code: 'FORBIDDEN' }, { n: 3, code: 'FORBIDDEN' }], 'the lead and the pay table read payroll, so both are held');
  assert.deepEqual(overview.unresolved, [], 'no path of a held block is named to them');
  assert.doesNotMatch(JSON.stringify(got), /payroll|Payday/u);
  assert.equal(got.totals.refused, 1);
  sql.close();
});

test('A SHARED LINK READS NO CENSUS, and a census writes nothing', async () => {
  const { sql, read } = await census();
  const out = await read.pagesCensus({}, link);
  assert.equal(out.ok, false);
  const changes = (): number => sql.one<{ n: number }>('SELECT total_changes() AS n')!.n;
  const before = changes();
  value(await read.pagesCensus({}, owner));
  assert.equal(changes(), before, 'not even the line an opened page keeps');
  sql.close();
});

test('THE WORDS A PERSON READS IN IT carry no em dash', async () => {
  const { sql, read } = await census();
  assert.doesNotMatch(JSON.stringify(value(await read.pagesCensus({}, narrow))), /—/u);
  sql.close();
});

/* ── over the seed, through the record's own guards ─────────────────────────────────────────────────────────── */

type Drawn = { blocks: { drawn?: boolean; refusals?: unknown[] }[] };

async function seeded() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(SEEDED) });
  assert.ok((await installSeed(api.kernel)).ok);
  const census = async (ctx: CallContext) => value((await api.pagesCensus({}, ctx)) as Result<PagesCensus>);
  const listed = async (ctx: CallContext) => {
    const out = await api.pages(ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as { slug: string }[]).map((p) => p.slug).sort();
  };
  /* What her page shows held: each block drawn with a refusal, as `page` hands it to her. */
  const heldOn = async (slug: string, ctx: CallContext) => {
    const out = await api.page({ slug }, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as unknown as Drawn).blocks.filter((b) => b.drawn !== false && (b.refusals ?? []).length > 0).length;
  };
  return { sql, census, listed, heldOn };
}

test('A CALLER WHO READS ACCOUNTS ALONE gets a census line for each page she may open and no other, each held as her page holds it', async () => {
  const { sql, census, listed, heldOn } = await seeded();
  const accounts: CallContext = { principal: { kind: 'person', id: 'p_9', level: 'read' }, registers: ['accounts'] };
  const got = await census(accounts);
  assert.deepEqual(got.pages.map((p) => p.slug).sort(), await listed(accounts), 'the census counts exactly the pages `pages` lists her');
  assert.ok(got.pages.length > 0 && got.pages.length < (await census(owner)).pages.length, 'some pages and not all');
  for (const p of got.pages) assert.equal(p.refused.length, await heldOn(p.slug, accounts), `${p.title}: what her page holds`);
  sql.close();
});

test('A MEMBER WHO HOLDS ONE LIST AT APPEND is held the questions, as `readsEveryList` holds them', async () => {
  const { sql, census, listed, heldOn } = await seeded();
  const member: CallContext = { principal: { kind: 'person', id: 'p_7', level: 'read' }, registers: '*', levels: { obligations: 'append' } };
  const got = await census(member);
  assert.deepEqual(got.pages.map((p) => p.slug).sort(), await listed(member));
  for (const p of got.pages) assert.equal(p.refused.length, await heldOn(p.slug, member), `${p.title}: what her page holds`);
  assert.ok(got.totals.refused > 0);
  sql.close();
});
