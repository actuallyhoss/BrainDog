/**
 * Where a row applies, as the record answers it over the seed and a page draws it: the blocks of a project page.
 *
 * A project page reads its own rows and the ones it inherits, and the kernel decides what a project row hides through
 * `inScope`. Each case asks the kernel's `readBlock` directly and holds its answer, and then holds the page's drawing
 * of the same answer (`fixtures/readers.ts`, which draws the record's block through `page-live.ts`'s `blockOf`) to
 * the same rows in the same places.
 *
 * THIS WAS TWO ENGINES HELD EQUAL, the kernel's and a second one in this app, and the second is gone.
 * What is kept is the cases about where a row applies, which test the record;
 * the cases that held the browser's figures, walks and pages to the kernel's went with the browser's copy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { costOf, fill, openRecord, readBlock as kernelBlock, type Kernel, type PageBlock as KernelBlock, type PageDeps } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { page, readBlock as webBlock } from './fixtures/readers.ts';
import { rowNameSaid } from './names.ts';
import { tileOf } from './news-live.ts';
import { tileOf as pageTile } from './page-live.ts';
import type { PageBlock } from './schema.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
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
  };
  return sql as unknown as Sql;
}

/** The deps a host wires, from the kernel's public reads. */
function depsOf(k: Kernel): PageDeps {
  const schemaOf: PageDeps['schemaOf'] = (register) => {
    const decl = k.register(register);
    if (!decl) return null;
    return { register, ...(decl.state === undefined ? {} : { state: decl.state }), fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) };
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => ({ ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'This test reads no figures.' } }),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) });
      return out.ok ? { ok: true, value: { rows: out.value.rows, matched: out.value.matched } } : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: {
      nowMs: NOW,
      schemaOf,
      refByTitle: (register, title) => {
        const named = k.register(register)?.title;
        const out = named === undefined ? null : k.list({ register, limit: 200 });
        return out?.ok ? (out.value.rows.find((r) => r.fields[named!] === title)?.id ?? null) : null;
      },
    },
    scopeOf: (register) => {
      const f = k.register(register)?.fields.find((x) => x.scope !== undefined && !x.retired);
      return f?.to ? { field: f.id, to: f.to } : null;
    },
    inScope: (register, project, opts) => k.inScope(register, project, opts),
    /* THE RECORD'S OWN OPEN QUESTIONS, wired the way `pageDeps()` wires them, so these deps are the host's
       whole set and a block is never refused here for a wire the host has. A freshly seeded record has
       opened none, which is the answer, not a gap. */
    openQuestions: (limit) => {
      const said = k.openSuggestions();
      const rows = said.ok ? said.value : [];
      return {
        questions: rows.slice(0, limit).map((r) => ({
          id: String(r.id),
          who: String(r.opened_by ?? ''),
          at: String(r.opened_at ?? ''),
          kind: String(r.body_kind ?? ''),
          question: k.question(String(r.id)) ?? '',
          why: '',
          cost: costOf(String(r.body_kind ?? ''), r.body),
          options: [],
        })),
        open: rows.length,
      };
    },
    /* EVERY EVENT ABOUT ONE ROW, as `pageDeps()` wires it, which is half of what `working: true` asks:
       the other half is `sessionsLive` below, and a record wired for one of them refuses the block. */
    history: (register, row) => {
      const found = k.get(row);
      return found && found.register === register
        ? { ok: true, value: k.history(found.id) }
        : { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: `${row} is not a row of ${register}.`, at: 'row' } };
    },
    sessionsLive: () => {
      const done = k.register('session')?.done ?? [];
      const out = k.list({ register: 'session', where: { none: [{ field: 'state', in: [...done] }] }, order: [{ field: 'last_seen', dir: 'desc' }], limit: 200 });
      return out.ok ? out.value.rows : [];
    },
  };
}

let opened: Kernel | null = null;

const seeded = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  opened = k;
  return depsOf(k);
})();

const TITLES: Record<string, string> = { skills: 'name', tools: 'name', credentials: 'label', learnings: 'lesson' };

const blockOver = (register: string, project: string): KernelBlock & PageBlock => ({
  kind: 'table',
  source: `register.${register}`,
  where: `project is ${project}`,
  inherit: true,
  columns: [{ field: TITLES[register]!, label: 'Name' }, { field: 'project', label: 'Where it applies', as: 'scope' }] as never,
  empty: 'Nothing applies here.',
});

/** The record's answer and the page's drawing of it, each row as `title @ where it applies`, sorted. */
async function both(register: string, project: string) {
  const deps = await seeded;
  const block = blockOver(register, project);
  const kernel = kernelBlock(deps, block);
  const web = webBlock(block);
  assert.deepEqual(kernel.refusals, [], `${register} on ${project}, the kernel: ${JSON.stringify(kernel.refusals)}`);
  assert.deepEqual(web.refusals, [], `${register} on ${project}, the app: ${web.refusals.join('; ')}`);
  return {
    kernel: {
      rows: kernel.rows.map((r, i) => `${String(r.fields[TITLES[register]!])} @ ${kernel.scopes?.[i] ?? 'Everywhere'}`).sort(),
      /* THE SAME ROWS AS THE PAGE SAYS THEM: a tool or a skill by its name, not the handle it is filed under (8a47e508a). */
      said: kernel.rows.map((r, i) => `${rowNameSaid(register, String(r.fields[TITLES[register]!]))} @ ${kernel.scopes?.[i] ?? 'Everywhere'}`).sort(),
      inherited: kernel.inherited,
      matched: kernel.matched,
      revs: kernel.rows.map((r) => `${String(r.fields[TITLES[register]!])}:${String(r.fields.rev)}`),
    },
    web: { rows: web.rows.map((r) => `${r.cells[0]} @ ${r.cells[1]}`).sort(), inherited: web.inherited, matched: web.total },
  };
}

test('KILN’S PAGE SHOWS KILN’S review-pr AND HIDES THE GLOBAL ONE, and draws what the record answered', async () => {
  const { kernel, web } = await both('skills', 'Kiln');
  assert.ok(kernel.rows.includes('review-pr @ Kiln'), kernel.rows.join(', '));
  assert.ok(!kernel.rows.includes('review-pr @ Everywhere'), kernel.rows.join(', '));
  assert.ok(kernel.revs.includes('review-pr:2') && !kernel.revs.includes('review-pr:3'), 'Kiln reads its own version 2, not the global 3');
  assert.deepEqual(web, { rows: kernel.said, inherited: kernel.inherited, matched: kernel.matched });
});

test('PORTAGE’S PAGE SHOWS THE GLOBAL review-pr, and draws what the record answered', async () => {
  const { kernel, web } = await both('skills', 'Portage');
  assert.ok(kernel.rows.includes('review-pr @ Everywhere'), kernel.rows.join(', '));
  assert.ok(kernel.rows.includes('reconcile-invoice @ Portage'), kernel.rows.join(', '));
  assert.deepEqual(web, { rows: kernel.said, inherited: kernel.inherited, matched: kernel.matched });
});

test('Kiln’s fenwick tool hides the global one, and keys and learnings add up, drawn as the record answered', async () => {
  const kilnTools = await both('tools', 'Kiln');
  assert.ok(kilnTools.kernel.rows.includes('fenwick @ Kiln') && !kilnTools.kernel.rows.includes('fenwick @ Everywhere'), kilnTools.kernel.rows.join(', '));
  for (const register of ['tools', 'credentials', 'learnings'])
    for (const project of ['Kiln', 'Portage']) {
      const { kernel, web } = await both(register, project);
      assert.deepEqual(web, { rows: kernel.said, inherited: kernel.inherited, matched: kernel.matched }, `${register} on ${project}`);
    }
  const keys = await both('credentials', 'Kiln');
  assert.ok(keys.kernel.rows.includes('Nordhaven API @ Everywhere') && keys.kernel.rows.includes('Fenwick deploy key @ Kiln'), keys.kernel.rows.join(', '));
});

test('KILN AND PORTAGE DRAW WHAT THEY RUN ON under More about, with no block refused', () => {
  for (const [slug, name] of [['kiln', 'Kiln'], ['portage', 'Portage']] as const) {
    const drawn = page(slug);
    assert.ok(drawn, `the demo has no /p/${slug}`);
    const at = drawn.blocks.findIndex((b) => b.heading === `More about ${name}`);
    assert.ok(at >= 0, `/p/${slug} has no More about ${name}`);
    const after = drawn.blocks.slice(at + 1).filter((b) => ['Keys', 'Tools and servers', 'Skills'].includes(String(b.heading)));
    assert.deepEqual(after.map((b) => b.heading), ['Keys', 'Tools and servers', 'Skills'], slug);
    for (const b of after) {
      assert.deepEqual(b.refusals, [], `${String(b.heading)} on ${slug}`);
      assert.ok(b.rows.length > 0, `${String(b.heading)} on ${slug} draws nothing`);
    }
  }
});

test('an as: scope column on a field that does not say where a row applies is refused, and the page says why', async () => {
  const deps = await seeded;
  const block = { ...blockOver('skills', 'Kiln'), inherit: false, columns: [{ field: 'name', as: 'scope' }] } as KernelBlock & PageBlock;
  const refusal = kernelBlock(deps, block).refusals[0];
  assert.ok(refusal, 'the record drew a scope column no field says');
  assert.equal(refusal.code, 'DECLARATION_INVALID');
  assert.ok(webBlock(block).refusals.includes(refusal.fix), 'the page did not draw the record’s sentence');
});

test('A CARD SAYS "Everywhere" FOR A ROW OF NO PROJECT: a scope column on a card is a fact, as the record names it', async () => {
  const deps = await seeded;
  const block = {
    kind: 'cards',
    source: 'register.skills',
    columns: [{ field: 'name', as: 'title' }, { field: 'project', label: 'Where it applies', as: 'scope' }] as never,
    empty: 'No skills yet.',
  } as KernelBlock & PageBlock;
  const kernel = kernelBlock(deps, block);
  const web = webBlock(block);
  assert.deepEqual(kernel.refusals, []);
  assert.deepEqual(web.refusals, []);
  assert.equal((web.columns as { as?: string }[])[1]?.as, 'fact');
  const global = kernel.rows.findIndex((r) => r.fields.name === 'review-pr' && !r.fields.project);
  assert.ok(global >= 0 && kernel.scopes?.[global] === null, 'the seed has no global review-pr');
  assert.ok(web.rows.some((r) => r.cells[0] === 'Review PR' && r.cells[1] === 'Everywhere'), JSON.stringify(web.rows.map((r) => r.cells)));
});

test('THE LIVE HOME TILE KEYS ITS VERDICT OFF WHAT THE LIST HOLDS, because the record answers that beside what the predicate matched', async () => {
  /* THE TILE IS HANDED A KERNEL READING WHOLE, over the wire, which is why it is held to a real one
     here and not to a literal a test wrote. Measured on the seed: nothing has been written off, so this predicate matches
     nobody over a list that holds every obligation the seed writes. `rows: 0` over a full list is an answer, and `rows: 0,
     held: 0` is an empty list, which is not. Keying the tile off `rows` collapsed the two, so an
     hour-old record drew a green tick on a figure computed from no data at all, and a record with
     dozens of invoices and nothing overdue was denied the good news and the door to the filter. */
  await seeded;
  const decl = { metric: 'overdue', name: 'Overdue to pay', source: 'register.obligations', where: 'state is written off', value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 0 }, window: '30d', compare: 'none' };
  const none = opened!.metric(decl as never);
  assert.ok(none.ok, JSON.stringify(none));
  assert.equal(none.value.rows, 0);
  /* HELD IS EVERY ROW THE LIST HOLDS, counted by the record's own list, so the seed may grow or shrink (money-core 3.0.0
     wrote fewer) without this reading a different case. */
  const all = opened!.list({ register: 'obligations', limit: 500 });
  assert.ok(all.ok, JSON.stringify(all));
  assert.ok(all.value.rows.length > 0 && all.value.cursor === null, 'the seed holds no obligations, or more than one call reaches');
  assert.equal(none.value.held, all.value.rows.length, 'held is not what the list holds, so this reads a different case');
  assert.equal(none.value.met, true);

  const answered = tileOf('overdue', none.value as never);
  assert.equal(answered.tone, 'good', 'nothing overdue over a list of invoices is the good news the figure exists to deliver');
  assert.ok(answered.href, 'the filter that produced the zero is a door, and the tile shut it');

  const empty = tileOf('overdue', { ...none.value, held: 0 } as never);
  assert.equal(empty.tone, undefined, 'a tick over a list nobody has written to');
  assert.equal(empty.href, undefined, 'a door into a list with nothing behind it');

  /* AND THE OTHER LIVE RENDERER IS HANDED THE SAME READING, because there are two of them and the
     pages use the one that was not changed. `news-live.ts` draws Home and `page-live.ts` draws
     `/p/<slug>`, and both are handed a kernel reading whole over the wire. Measured on this reading
     before this assertion existed: Home answered `tone: "good"` with an href and the page answered
     `tone: undefined` with none, so a record full of invoices and nothing overdue was given the
     good news on one screen and denied it on the other, including on the project page the kernel's
     own `held` narrowing was written for. Two screens, one figure, one answer or one of them is
     lying. */
  const onPage = pageTile({ metric: 'overdue', reading: none.value as never });
  assert.equal(onPage.tone, answered.tone, 'Home and a live page disagree about the verdict on one reading');
  assert.equal(Boolean(onPage.href), Boolean(answered.href), 'Home and a live page disagree about the door on one reading');

  const emptyOnPage = pageTile({ metric: 'overdue', reading: { ...none.value, held: 0 } as never });
  assert.equal(emptyOnPage.tone, undefined, 'a page tile ticked a list nobody has written to');
  assert.equal(emptyOnPage.href, undefined, 'a page tile opened a door into a list with nothing behind it');
});

test('A FIGURE WITH A PARAMETER COUNTS `held` INSIDE ITS PROJECT, not over the whole list', async () => {
  /* THE CASE A PROJECT PAGE DRAWS. `project-owed:Kiln` is filled by the kernel's `fill`, which writes `within`, so
     `held` counts Kiln's obligations and not the record's. Counted over the whole register, a project with nothing
     in it reads as settled, because nothing matched over rows that exist is the good-news zero.

     `held` UNDER THE WHOLE REGISTER IS THE POINT, so each case asserts the narrowing happened: a figure answering
     the whole list would be the defect. */
  await seeded;
  const k = opened!;
  const cases: { id: string; it: string; register: string }[] = [
    { id: 'project-owed', it: 'Kiln', register: 'obligations' },
    { id: 'project-owed', it: 'Tallow', register: 'obligations' },
    { id: 'project-open', it: 'Kiln', register: 'tasks' },
    { id: 'project-cost', it: 'Kiln', register: 'services' },
  ];
  for (const { id, it, register } of cases) {
    const template = k.metricDecl(id);
    assert.ok(template, `the seed no longer declares ${id}, so this case reads nothing`);
    const kernel = k.metric(fill(template, null, it) as never);
    assert.ok(kernel.ok, `${id}:${it}, the kernel: ${JSON.stringify(kernel)}`);
    const listed = k.list({ register, limit: 1 });
    const whole = listed.ok ? listed.value.matched : 0;
    assert.ok(whole > 0, `the seed holds no ${register}, so this case reads nothing`);
    assert.ok(
      kernel.value.held < whole,
      `${id}:${it} counts all ${whole} rows of ${register} as its scope, so a project with nothing in it reads as settled`,
    );
  }
});
