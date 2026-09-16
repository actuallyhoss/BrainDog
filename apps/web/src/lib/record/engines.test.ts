/**
 * The two page engines, held against each other over the seed, on the blocks that say where a row applies.
 *
 * A project page reads its own rows and the ones it inherits. The kernel decides what a project row
 * hides through `inScope`, and this app decides it again in `api.ts`, so the two are asked the same
 * blocks over the same rows and must name the same rows in the same places. The agents pack's
 * registers, rows and pages are the demo's own, from `data.ts`, so what is held here is what the
 * demo draws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { isStale, openRecord, readBlock as kernelBlock, type Kernel, type PageBlock as KernelBlock, type PageDeps } from '@braindog/kernel';
import { AGENTS_PAGES, NOW, RUNS_ON, installSeed } from '@braindog/seed';

import { page, pages, readBlock as webBlock, ROWS } from './api.ts';
import { read as webRead, type MetricDecl as WebMetric } from './metrics.ts';
import type { PageBlock } from './schema.ts';

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

/** Both engines' answers, each row as `title @ where it applies`, sorted. */
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
      inherited: kernel.inherited,
      matched: kernel.matched,
      revs: kernel.rows.map((r) => `${String(r.fields[TITLES[register]!])}:${String(r.fields.rev)}`),
    },
    web: { rows: web.rows.map((r) => `${r.cells[0]} @ ${r.cells[1]}`).sort(), inherited: web.inherited, matched: web.total },
  };
}

test('KILN’S PAGE SHOWS KILN’S review-pr AND HIDES THE GLOBAL ONE, in both engines', async () => {
  const { kernel, web } = await both('skills', 'Kiln');
  assert.ok(kernel.rows.includes('review-pr @ Kiln'), kernel.rows.join(', '));
  assert.ok(!kernel.rows.includes('review-pr @ Everywhere'), kernel.rows.join(', '));
  assert.ok(kernel.revs.includes('review-pr:2') && !kernel.revs.includes('review-pr:3'), 'Kiln reads its own version 2, not the global 3');
  assert.deepEqual(web, { rows: kernel.rows, inherited: kernel.inherited, matched: kernel.matched });
});

test('PORTAGE’S PAGE SHOWS THE GLOBAL review-pr, in both engines', async () => {
  const { kernel, web } = await both('skills', 'Portage');
  assert.ok(kernel.rows.includes('review-pr @ Everywhere'), kernel.rows.join(', '));
  assert.ok(kernel.rows.includes('reconcile-invoice @ Portage'), kernel.rows.join(', '));
  assert.deepEqual(web, { rows: kernel.rows, inherited: kernel.inherited, matched: kernel.matched });
});

test('Kiln’s fenwick tool hides the global one, and keys and learnings add up, the same in both engines', async () => {
  const kilnTools = await both('tools', 'Kiln');
  assert.ok(kilnTools.kernel.rows.includes('fenwick @ Kiln') && !kilnTools.kernel.rows.includes('fenwick @ Everywhere'), kilnTools.kernel.rows.join(', '));
  for (const register of ['tools', 'credentials', 'learnings'])
    for (const project of ['Kiln', 'Portage']) {
      const { kernel, web } = await both(register, project);
      assert.deepEqual(web, { rows: kernel.rows, inherited: kernel.inherited, matched: kernel.matched }, `${register} on ${project}`);
    }
  const keys = await both('credentials', 'Kiln');
  assert.ok(keys.kernel.rows.includes('Nordhaven API @ Everywhere') && keys.kernel.rows.includes('Fenwick deploy key @ Kiln'), keys.kernel.rows.join(', '));
});

test('THE RUNS WORKING NOW are the same runs, in the same order, in both engines', async () => {
  const deps = await seeded;
  const block = {
    kind: 'cards',
    source: 'sessions.live',
    columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }],
    empty: 'No agent is working right now.',
  } as KernelBlock & PageBlock;
  const doing = (b: KernelBlock & PageBlock) => {
    const kernel = kernelBlock(deps, b);
    const web = webBlock(b);
    assert.deepEqual(kernel.refusals, [], JSON.stringify(kernel.refusals));
    assert.deepEqual(web.refusals, [], web.refusals.join('; '));
    assert.equal(web.total, kernel.matched);
    return { kernel: kernel.rows.map((r) => String(r.fields.doing)), web: web.entries.map((e) => String(e.fields.doing)) };
  };
  const all = doing(block);
  assert.equal(all.kernel.length, 3, 'the two finished runs are not live');
  assert.equal(all.kernel[0], 'Variable axis QA, instances 3 of 9', 'the run seen most recently leads');
  assert.deepEqual(all.web, all.kernel);
  const codex = doing({ ...block, where: 'agent is codex' });
  assert.deepEqual(codex.kernel, ['Drafting the specimen page copy']);
  assert.deepEqual(codex.web, codex.kernel);

  const ordered = { ...block, order: [{ field: 'doing', dir: 'asc' }] } as KernelBlock & PageBlock;
  assert.equal(kernelBlock(deps, ordered).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(webBlock(ordered).refusals.join('; '), /order:/);
});

test('“RUNS ON”, AS THE PROJECT TEMPLATE DECLARES IT, names the same rows in both engines', async () => {
  const deps = await seeded;
  for (const project of ['Kiln', 'Portage'])
    for (const declared of RUNS_ON.blocks) {
      if (declared.kind === 'section') continue;
      const block = JSON.parse(JSON.stringify(declared).split('{{name}}').join(project)) as KernelBlock & PageBlock;
      const title = block.columns![0]!.field;
      const kernel = kernelBlock(deps, block);
      const web = webBlock(block);
      const at = `${String(block.heading)} on ${project}`;
      assert.deepEqual(kernel.refusals, [], `${at}, the kernel: ${JSON.stringify(kernel.refusals)}`);
      assert.deepEqual(web.refusals, [], `${at}, the app: ${web.refusals.join('; ')}`);
      const rows = kernel.rows.map((r, i) => `${String(r.fields[title])} @ ${kernel.scopes?.[i] ?? 'Everywhere'}`);
      assert.deepEqual(web.rows.map((r) => `${r.cells[0]} @ ${r.cells[1]}`), rows, at);
      assert.deepEqual({ inherited: web.inherited, matched: web.total }, { inherited: kernel.inherited, matched: kernel.matched }, at);
      if (block.heading === 'Skills') assert.ok(!rows.some((r) => r.startsWith('chase-invoice')), `${at}: a retired skill is listed`);
    }
});

test('/p/AGENTS, AS THE PACK DECLARES IT, draws the same runs, learnings and skills in both engines', async () => {
  const deps = await seeded;
  const drawn = page('agents');
  assert.ok(drawn, 'the demo has no /p/agents');
  for (const [n, declared] of (AGENTS_PAGES.agents!.blocks as readonly Record<string, unknown>[]).entries()) {
    const block = declared as KernelBlock & PageBlock;
    const at = String(block.heading);
    const kernel = kernelBlock(deps, block);
    const web: NonNullable<ReturnType<typeof page>>['blocks'][number] = drawn.blocks[n]!;
    assert.deepEqual(kernel.refusals, [], `${at}, the kernel: ${JSON.stringify(kernel.refusals)}`);
    assert.deepEqual(web.refusals, [], `${at}, the demo: ${web.refusals.join('; ')}`);
    const title = block.columns![0]!.field;
    assert.ok(kernel.rows.length > 0, `${at} draws nothing on the seed`);
    assert.deepEqual(web.rows.map((r) => r.cells[0]), kernel.rows.map((r) => String(r.fields[title])), at);
    assert.equal(web.total, kernel.matched, at);
    if (block.source !== 'sessions.live') continue;

    const project = block.columns!.findIndex((c) => c.field === 'project');
    assert.deepEqual(web.rows.map((r) => r.cells[project]), kernel.scopes, `${at}: each run's project, by its name`);
    assert.deepEqual(kernel.scopes, ['Kiln', 'Kiln', 'Portage']);
    assert.deepEqual(
      web.quiet,
      kernel.rows.map((r) => isStale({ fields: r.fields, updated_at: r.updated_at }, NOW)),
      `${at}: the runs dimmed are the ones the kernel calls stale`,
    );
    assert.deepEqual(web.quiet, [false, false, true], 'the run seen two hours ago has gone quiet');
  }
});

test('A PAGE PER SKILL IN USE, and a key in the demo is an index row that holds no value', async () => {
  const deps = await seeded;
  const active = kernelBlock(deps, { kind: 'table', source: 'register.skills', where: 'state is active', columns: [{ field: 'name' }], empty: 'None.' } as KernelBlock);
  const skillPages = Object.values(pages()).filter((p) => p.identity?.register === 'skills');
  assert.equal(skillPages.length, active.matched, 'one page for each active skill, and none for the retired one');
  for (const p of skillPages) assert.deepEqual(page(p.page)?.blocks.flatMap((b) => b.refusals), [], p.page);

  assert.ok((ROWS.credentials ?? []).length > 0);
  for (const key of ROWS.credentials ?? []) assert.ok(!('value' in key.fields), `${String(key.fields.label)} carries a value`);
});

test('KILN AND PORTAGE DRAW "RUNS ON" in the demo, with no block refused', () => {
  for (const slug of ['kiln', 'portage']) {
    const drawn = page(slug);
    assert.ok(drawn, `the demo has no /p/${slug}`);
    const at = drawn.blocks.findIndex((b) => b.heading === 'Runs on');
    assert.ok(at >= 0, `/p/${slug} has no Runs on`);
    const after = drawn.blocks.slice(at + 1);
    assert.deepEqual(after.map((b) => b.heading), ['Keys', 'Tools', 'Skills'], slug);
    for (const b of after) {
      assert.deepEqual(b.refusals, [], `${String(b.heading)} on ${slug}`);
      assert.ok(b.rows.length > 0, `${String(b.heading)} on ${slug} draws nothing`);
    }
  }
});

test('an as: scope column on a field that does not say where a row applies is refused by both engines', async () => {
  const deps = await seeded;
  const block = { ...blockOver('skills', 'Kiln'), inherit: false, columns: [{ field: 'name', as: 'scope' }] } as KernelBlock & PageBlock;
  assert.equal(kernelBlock(deps, block).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(webBlock(block).refusals.join('; '), /as: scope/);
});

test('A FIGURE GROUPED BY MONTH, BY WEEK AND BY A WORD HAS THE SAME PARTS IN BOTH ENGINES', async () => {
  await seeded;
  const k = opened!;
  const base = { name: 'Grouped', source: 'register.obligations', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as const;
  const cases: WebMetric[] = [
    { ...base, metric: 'paid-in-by-month', where: 'state is paid, direction is owed to me', value: { sum: 'amount' }, group_by: 'settled', bucket: 'month' },
    { ...base, metric: 'paid-out-by-month', where: 'state is paid, direction is owed by me, settled after -12m', value: { sum: 'amount' }, group_by: 'settled', bucket: 'month' },
    { ...base, metric: 'due-by-week', where: 'state is open or part', value: { sum: 'amount' }, group_by: 'due', bucket: 'week' },
    { ...base, metric: 'due-by-quarter', where: 'state is open or part, direction is owed by me', value: { sum: 'amount' }, group_by: 'due', bucket: 'quarter' },
    { ...base, metric: 'count-by-day', format: 'int', where: 'state is paid', value: { count: 'id' }, group_by: 'settled', bucket: 'day' } as WebMetric,
    { ...base, metric: 'spent-by-category', where: 'direction is owed by me', value: { sum: 'amount' }, group_by: 'category' },
    {
      ...base,
      metric: 'monthly-by-category',
      where: 'state is not written off, direction is owed by me, repeats is monthly or quarterly or yearly',
      value: { sum: { product: ['amount', { lookup: 'per_month', by: 'repeats' }] } },
      lookups: { per_month: { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 } },
      group_by: 'category',
    },
  ];
  for (const decl of cases) {
    const kernel = k.metric(decl as never);
    assert.ok(kernel.ok, `${decl.metric}, the kernel: ${JSON.stringify(kernel)}`);
    const web = webRead(decl);
    assert.deepEqual(web.refusals, [], `${decl.metric}, the app: ${web.refusals.join('; ')}`);
    assert.ok((kernel.value.groups ?? []).length > 1, `${decl.metric} grouped into nothing`);
    assert.equal(web.value, kernel.value.value, `${decl.metric}: the whole`);
    assert.deepEqual(web.groups, kernel.value.groups, `${decl.metric}: the parts`);
    assert.equal(web.current, kernel.value.current, `${decl.metric}: the bucket the clock is in`);
  }
});
