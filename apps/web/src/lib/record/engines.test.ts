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

import { costOf, fill, isStale, openRecord, ratesFrom, readBlock as kernelBlock, type Kernel, type PageBlock as KernelBlock, type PageDeps } from '@braindog/kernel';
import { AGENTS_PAGES, NOW, RUNS_ON, installSeed } from '@braindog/seed';

import { page, pages, readBlock as webBlock, ROWS } from './api.ts';
import { METRICS } from './declared.ts';
import { read as webRead, withFx, withParam, type MetricDecl as WebMetric } from './metrics.ts';
import { tileOf } from './news-live.ts';
import { tileOf as pageTile } from './page-live.ts';
import type { PageBlock } from './schema.ts';
import { copy } from '../copy.ts';

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
    /* THE RECORD'S OWN OPEN QUESTIONS, wired the way `pageDeps()` wires them, so a `queue` block on the
       agents page is answered here rather than refused as unwired. A freshly seeded record has opened
       none, which is the answer, not a gap. */
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
    /* A QUEUE IS NOT A REGISTER'S ROWS, so the two are held on what they answered rather than on cells.
       They cannot hold the same questions: the demo draws the sample's decide queue and a freshly
       seeded record has opened none. What must agree is that both read the source, neither refused,
       and each question the demo drew is one a person could actually answer. */
    if (block.source === 'governance.open') {
      assert.ok(Array.isArray(kernel.queue), `${at}: the record did not read its open questions`);
      assert.ok(Array.isArray(web.queue) && web.queue.length > 0, `${at}: the demo drew no questions`);
      assert.equal(web.queue!.length, Math.min(3, web.total), `${at}: the demo drew a different number than it counted`);
      for (const q of web.queue!) {
        assert.ok(q.question.trim() !== '', `${at}: a question with nothing to read`);
        assert.ok(q.options.length >= 2, `${at}: ${q.id} offers fewer than two ways to answer`);
        assert.ok(q.options.every((o) => o.key !== '' && o.label !== ''), `${at}: ${q.id} has a nameless option`);
      }
      continue;
    }
    const title = block.columns![0]!.field;
    assert.ok(kernel.rows.length > 0, `${at} draws nothing on the seed`);
    assert.deepEqual(web.rows.map((r) => r.cells[0]), kernel.rows.map((r) => String(r.fields[title])), at);
    assert.equal(web.total, kernel.matched, at);
    if (block.source !== 'sessions.live') continue;

    const project = block.columns!.findIndex((c) => c.field === 'project');
    assert.deepEqual(web.rows.map((r) => r.cells[project]), kernel.scopes, `${at}: each run's project, by its name`);
    const working = at === 'Working now';
    assert.deepEqual(kernel.scopes, working ? ['Kiln', 'Kiln'] : ['Portage'], at);
    assert.deepEqual(
      web.quiet,
      kernel.rows.map((r) => isStale({ fields: r.fields, updated_at: r.updated_at }, NOW)),
      `${at}: the runs dimmed are the ones the kernel calls stale`,
    );
    assert.deepEqual(web.quiet, working ? [false, false] : [true], `${at}: the run seen two hours ago has gone quiet`);
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
    /* AND HOW MANY ROWS THE LIST HOLDS, which is the one field on a reading that nothing here held
       the two engines to. It is what tells a zero that is an answer from a zero that is an empty
       list, so an engine drifting on it does not draw a wrong number: it draws a tick on a record
       with nothing in it. It is counted before the predicate runs, so a grouped figure's is the
       same count as a plain one's, and both engines say so or one of them is wrong. */
    assert.equal(web.held, kernel.value.held, `${decl.metric}: how many rows the list holds`);
  }
});

test('THE MONEY PAGE’S BARS BY MONTH are the same buckets and the same figures in both engines', async () => {
  await seeded;
  const kernel = opened!.page('money');
  assert.ok(kernel.ok, JSON.stringify(kernel));
  const k = kernel.value.blocks.find((b) => b.kind === 'series');
  const w = page('money')?.blocks.find((b) => b.kind === 'series');
  assert.ok(k && w, 'the Money page has no series');
  assert.deepEqual(k.refusals, [], JSON.stringify(k.refusals));
  assert.deepEqual(w.refusals, []);
  assert.ok(k.bars && k.bars.keys.length >= 6, `the kernel drew ${k.bars?.keys.length} buckets`);
  assert.deepEqual(w.bars, k.bars);
  assert.deepEqual(k.bars.states.slice(-4), ['due', 'ahead', 'ahead', 'ahead'], 'this month so far with what is still due in it, then three months due');
  assert.ok(k.bars.values.every((line) => line.some((v) => v !== null)), 'a line with nothing in it');
  /* WHAT REPEATS IS IN EVERY MONTH AHEAD: the sample repeats costs, so no month ahead is left blank beside one that is not. */
  const ahead = k.bars.states.flatMap((s, i) => (s === 'ahead' ? [i] : []));
  for (const line of k.bars.values) assert.ok(ahead.every((i) => line[i] !== null), `a month ahead without what repeats: ${JSON.stringify(line)}`);
});

test('MONEY IN EGP AND USD READS THE SAME IN BOTH ENGINES: parts with no home currency, the pair it lacks, and converted', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  const today = new Date(NOW).toISOString().slice(0, 10);
  const added = [
    { name: 'CIB', kind: 'bank', balance: { amount: 5_200_055, currency: 'EGP' }, as_of: today, liquid: true },
    { name: 'Mercury', kind: 'bank', balance: { amount: 340_001, currency: 'USD' }, as_of: today, liquid: true },
  ];
  for (const fields of added) assert.ok(k.create('accounts', fields, { actor: 'p_1' }).ok);
  const model = ROWS.accounts![0]!;
  const accounts = ROWS.accounts!;
  const rates = ROWS.fx ?? [];
  ROWS.accounts = [...accounts, ...added.map((fields, i) => ({ ...model, id: `acct_fx_${i}`, seq: accounts.length + i + 1, fields }))];
  const decls: WebMetric[] = [
    { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', where: 'liquid is true', value: { sum: 'balance' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
    { metric: 'cash-by-kind', name: 'Cash by kind', source: 'register.accounts', value: { sum: 'balance' }, group_by: 'kind', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
    /* GROUPED SO THAT EVERY GROUP IS IN ONE CURRENCY AND THE GROUPS DISAGREE, which `cash-by-kind`
       cannot be: the two accounts added above are both banks, so its `bank` group holds three
       currencies and comes back in parts of its own. One account a group is the shape that broke.
       With no home currency chosen, no group is in parts and each is a bare number, and `largestFirst`
       then ranks E£52,000.55 over $3,400.01 on the raw minor units. */
    { metric: 'cash-by-name', name: 'Cash by account', source: 'register.accounts', value: { sum: 'balance' }, group_by: 'name', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
    /* AN AVERAGE, A LEAST, A MOST, A DIFF AND A RATIO: each currency's own with no rate, of converted amounts with one. */
    { metric: 'cash-avg', name: 'Average balance', source: 'register.accounts', where: 'liquid is true', value: { avg: 'balance' }, format: 'money.GBP', target: { gte: 5_000_000 }, window: '30d', compare: 'none' },
    { metric: 'cash-min', name: 'Smallest balance', source: 'register.accounts', where: 'liquid is true', value: { min: 'balance' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
    { metric: 'cash-max', name: 'Largest balance', source: 'register.accounts', where: 'liquid is true', value: { max: 'balance' }, format: 'money.GBP', target: { lte: 100_000_000 }, window: '30d', compare: 'none' },
    { metric: 'cash-spread', name: 'Spread', source: 'register.accounts', where: 'liquid is true', value: { diff: { of: { max: 'balance' }, per: { min: 'balance' } } }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
    { metric: 'cash-each', name: 'Per account', source: 'register.accounts', where: 'liquid is true', value: { ratio: { of: { sum: 'balance' }, per: { count: 'id' } } }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
  ];
  const same = (label: string) => {
    for (const decl of decls) {
      const kernel = k.metric(decl as never);
      assert.ok(kernel.ok, JSON.stringify(kernel));
      const web = webRead(decl);
      assert.deepEqual(web.refusals, [], web.refusals.join('; '));
      assert.equal(web.value, kernel.value.value, `${label}, ${decl.metric}: the value`);
      assert.deepEqual(web.parts, kernel.value.parts, `${label}, ${decl.metric}: the parts`);
      assert.deepEqual(web.fx, kernel.value.fx, `${label}, ${decl.metric}: how it was read`);
      assert.deepEqual(web.groups, kernel.value.groups, `${label}, ${decl.metric}: the groups`);
      assert.deepEqual(web.targetIn, kernel.value.targetIn, `${label}, ${decl.metric}: the target, converted`);
    }
    return k.metric(decls[0] as never);
  };
  let home: string | null = null;
  const put = withFx(() => ({ home, rates: ratesFrom((ROWS.fx ?? []).map((e) => e.fields)) }));
  try {
    const bare = same('no home currency');
    assert.ok(bare.ok && bare.value.parts && bare.value.parts.length === 3, 'sterling, dollars and pounds');
    /* AND NO BAR IS A BARE NUMBER WHILE THE BARS BESIDE IT ARE IN ANOTHER CURRENCY. The tile above a
       chart refuses to add three currencies; the chart under it drew them as plain minor units, in one
       ranking, with nothing saying which currency any bar was in. Held on the reading both engines
       answer, because `same` above has already compared the two. */
    const byName = k.metric(decls.find((d) => d.metric === 'cash-by-name')! as never);
    assert.ok(byName.ok && byName.value.groups?.length, 'no groups to hold');
    for (const g of byName.value.groups!) {
      assert.equal(g.value, null, `${g.key} is a bare number beside another currency's`);
      assert.equal(g.parts?.length, 1, `${g.key} does not say which currency it is in`);
    }
    assert.deepEqual(
      new Set(byName.value.groups!.flatMap((g) => g.parts!.map((p) => p.currency))),
      new Set(['GBP', 'EGP', 'USD']),
      'each account is drawn in its own currency',
    );
    for (const id of ['cash-avg', 'cash-min', 'cash-max', 'cash-spread', 'cash-each']) {
      const r = webRead(decls.find((d) => d.metric === id)!);
      assert.equal(r.parts?.length, 3, `${id} with no home currency is one amount per currency`);
    }

    home = 'EGP';
    assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
    const lacking = same('a home currency and no rates');
    assert.ok(lacking.ok);
    assert.deepEqual(lacking.value.fx?.missing, ['GBP to EGP', 'USD to EGP']);

    /* TWO RATES AGAINST DOLLARS, so sterling goes through them, and amounts that round in minor units. */
    const quotes = [
      { currency: 'USD', base: 'EGP', rate: 48.6123, as_of: today },
      { currency: 'USD', base: 'GBP', rate: 0.7391, as_of: today },
    ];
    for (const fields of quotes) assert.ok(k.create('fx', fields, { actor: 'p_1' }).ok);
    ROWS.fx = quotes.map((fields, i) => ({ ...model, id: `fx_${i}`, seq: i + 1, fields }));
    const converted = same('converted');
    assert.ok(converted.ok);
    assert.equal(converted.value.unit, 'EGP');
    assert.equal(typeof converted.value.value, 'number');
    assert.equal(Number.isInteger(converted.value.value), true, 'minor units are whole');
    for (const id of ['cash-avg', 'cash-min', 'cash-max', 'cash-spread', 'cash-each']) {
      const r = webRead(decls.find((d) => d.metric === id)!);
      assert.equal(r.parts, undefined, `${id} converted is one amount`);
      assert.equal(typeof r.value, 'number', `${id} converted is a number`);
      assert.equal(r.unit, 'EGP', `${id} converted is in pounds, never under the sterling format`);
      assert.ok(r.targetIn?.currency === 'EGP', `${id}: its sterling target is converted into pounds`);
    }
  } finally {
    put();
    ROWS.accounts = accounts;
    ROWS.fx = rates;
  }
});

test('A WALK WHOSE OPENING CONVERTS AND A BILL WITH NO RATE is the same walks in both engines: the home walk and the bill’s own', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  const today = new Date(NOW).toISOString().slice(0, 10);
  const soon = new Date(NOW + 10 * 86_400_000).toISOString().slice(0, 10);
  const account = { name: 'CIB', kind: 'bank', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: today, liquid: true };
  const bill = { what: 'Tokyo hosting', direction: 'owed_by_me', amount: { amount: 12_000, currency: 'JPY' }, due: soon, state: 'open' };
  const quotes = [
    { currency: 'USD', base: 'EGP', rate: 48.5, as_of: today },
    { currency: 'GBP', base: 'EGP', rate: 64.2, as_of: today },
  ];
  assert.ok(k.create('accounts', account, { actor: 'p_1' }).ok);
  assert.ok(k.create('obligations', bill, { actor: 'p_1' }).ok);
  for (const fields of quotes) assert.ok(k.create('fx', fields, { actor: 'p_1' }).ok);
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const accounts = ROWS.accounts!;
  const obligations = ROWS.obligations!;
  const rates = ROWS.fx ?? [];
  const model = accounts[0]!;
  ROWS.accounts = [...accounts, { ...model, seq: accounts.length + 1, fields: account }];
  ROWS.obligations = [...obligations, { ...obligations[0]!, seq: obligations.length + 1, fields: bill }];
  ROWS.fx = quotes.map((fields, i) => ({ ...model, id: `fx_${i}`, seq: i + 1, fields }));
  const put = withFx(() => ({ home: 'EGP', rates: ratesFrom((ROWS.fx ?? []).map((e) => e.fields)) }));
  try {
    const kernel = k.page('money');
    assert.ok(kernel.ok, JSON.stringify(kernel));
    const kb = kernel.value.blocks.find((b) => b.heading === 'Cash ahead');
    const wb = page('money')?.blocks.find((b) => b.heading === 'Cash ahead');
    assert.ok(kb && wb, 'the Cash ahead forecast is gone; this test is about it');
    const shape = (walks: readonly { currency: string | null; from: number; steps: readonly { day: string; label: string; delta: number; balance: number }[] }[] | undefined) =>
      walks?.map((w) => ({ currency: w.currency, from: w.from, steps: w.steps.map((s) => [s.day, s.label, s.delta, s.balance]) }));
    assert.deepEqual(kb.refusals, [], JSON.stringify(kb.refusals));
    assert.deepEqual(wb.refusals, []);
    assert.deepEqual(kb.walks?.map((w) => w.currency), ['EGP', 'JPY'], 'the home walk, then the bill with no rate');
    assert.deepEqual(kb.walks?.[1]?.steps.map((s) => s.label), ['Tokyo hosting']);
    assert.deepEqual(shape(wb.walks), shape(kb.walks));
    assert.deepEqual(kb.walkFx, { home: 'EGP', missing: ['JPY to EGP'] });
    assert.equal(wb.walkNote, copy.figureNoRate('JPY to EGP'));
  } finally {
    put();
    ROWS.accounts = accounts;
    ROWS.obligations = obligations;
    ROWS.fx = rates;
  }
});

test('A CARD SAYS "Everywhere" FOR A ROW OF NO PROJECT: a scope column on a card is a fact, named in both engines', async () => {
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
  assert.ok(web.rows.some((r) => r.cells[0] === 'review-pr' && r.cells[1] === 'Everywhere'), JSON.stringify(web.rows.map((r) => r.cells)));
});

test('WORKING: TRUE IS ANSWERED BY BOTH ENGINES, aligned with the rows and only when the block asks', async () => {
  const deps = await seeded;
  const block = {
    kind: 'todo',
    source: 'register.skills',
    columns: [{ field: 'name' }],
    working: true,
    empty: 'No skills apply here.',
  } as KernelBlock & PageBlock;

  const kernel = kernelBlock(deps, block);
  const web = webBlock(block);
  assert.deepEqual(kernel.refusals, [], JSON.stringify(kernel.refusals));
  assert.deepEqual(web.refusals, [], web.refusals.join('; '));

  /* THAT THE KEY IS THERE AT ALL IS THE POINT. `working: true` used to be read by neither engine —
     it was not in either `READS`, so a declaration carrying it was refused as a key this build does
     not read, and the dot the renderers draw was a thing no page could ever turn on. */
  assert.ok(Array.isArray(kernel.working_now), 'the record does not answer working: true');
  assert.ok(Array.isArray(web.working_now), 'the app does not answer working: true');
  assert.equal(kernel.working_now!.length, kernel.rows.length, 'the record’s answer is not aligned with its rows');
  assert.equal(web.working_now!.length, web.entries.length, 'the app’s answer is not aligned with its rows');
  assert.ok(kernel.working_now!.every((v) => typeof v === 'boolean'));
  assert.ok(web.working_now!.every((v) => typeof v === 'boolean'));

  /* AND NOBODY IS ON A SEEDED ROW, in either engine: the seed's writes are the installer's and its
     runs were last heard from long before the fixed clock. A pass here that read `true` anywhere
     would mean one of the two had invented work nobody is doing. */
  assert.deepEqual(web.working_now, kernel.working_now, 'the two engines disagree about who is working');
  assert.ok(!kernel.working_now!.includes(true), 'the seed has somebody working on a row at the fixed clock');

  const { working: _off, ...unasked } = block;
  assert.equal(kernelBlock(deps, unasked as KernelBlock & PageBlock).working_now, undefined);
  assert.equal(webBlock(unasked as KernelBlock & PageBlock).working_now, undefined);
});

test('THE LIVE HOME TILE KEYS ITS VERDICT OFF WHAT THE LIST HOLDS, because the record answers that beside what the predicate matched', async () => {
  /* HOME IS THE ONE SCREEN THAT READS A KERNEL READING WHOLE, over the wire, rather than the app's
     own copy of the evaluator, which is why the tile is held to a real one here and not to a literal
     a test wrote. Measured on the seed: nothing has been written off, so this predicate matches
     nobody over a list of forty obligations. `rows: 0, held: 40` is an answer, and `rows: 0,
     held: 0` is an empty list, which is not. Keying the tile off `rows` collapsed the two, so an
     hour-old record drew a green tick on a figure computed from no data at all, and a record with
     forty invoices and nothing overdue was denied the good news and the door to the filter. */
  await seeded;
  const decl = { metric: 'overdue', name: 'Overdue to pay', source: 'register.obligations', where: 'state is written off', value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 0 }, window: '30d', compare: 'none' };
  const none = opened!.metric(decl as never);
  assert.ok(none.ok, JSON.stringify(none));
  assert.equal(none.value.rows, 0);
  assert.equal(none.value.held, 40, 'the seed no longer holds forty obligations, so this reads a different case');
  assert.equal(none.value.met, true);

  const answered = tileOf('overdue', none.value as never);
  assert.equal(answered.tone, 'good', 'nothing overdue over forty invoices is the good news the figure exists to deliver');
  assert.ok(answered.href, 'the filter that produced the zero is a door, and the tile shut it');

  const empty = tileOf('overdue', { ...none.value, held: 0 } as never);
  assert.equal(empty.tone, undefined, 'a tick over a list nobody has written to');
  assert.equal(empty.href, undefined, 'a door into a list with nothing behind it');

  /* AND THE OTHER LIVE RENDERER IS HANDED THE SAME READING, because there are two of them and the
     pages use the one that was not changed. `news-live.ts` draws Home and `page-live.ts` draws
     `/p/<slug>`, and both are handed a kernel reading whole over the wire. Measured on this reading
     before this assertion existed: Home answered `tone: "good"` with an href and the page answered
     `tone: undefined` with none, so a record with forty invoices and nothing overdue was given the
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

test('A FIGURE WITH A PARAMETER HOLDS THE SAME `held` IN BOTH ENGINES, which is the half the grouped loop cannot reach', async () => {
  /* THE LOOP ABOVE PINS `held` OVER FIGURES THE TWO ENGINES NEVER DIFFERED ON. Every case in it is
     unparameterised, and the case they differed on is the one a project page draws: `project-owed:Kiln`
     came back `held: 10` from the kernel and `held: 40` from the browser, the whole obligations
     register, because the browser counted `ROWS[register].length` with no scope input at all. Ten
     against forty, on every project page, with an assertion in place that said the two were pinned.
     So the parameter is filled here by each engine's own rule — the kernel's `fill`, which writes
     `within`, and the browser's `withParam` — rather than by a `where:` this test substituted, which
     is what makes this measure the scope derivation and not the arithmetic after it.

     `held` UNDER THE WHOLE REGISTER IS THE POINT, so each case asserts the narrowing happened as well
     as that the two agree: two engines both answering forty would satisfy an equality and still be
     the defect. */
  await seeded;
  const k = opened!;
  const cases: { id: string; it: string; register: string }[] = [
    { id: 'project-owed', it: 'Kiln', register: 'obligations' },
    { id: 'project-owed', it: 'Tallow', register: 'obligations' },
    { id: 'project-open', it: 'Kiln', register: 'tasks' },
    { id: 'project-cost', it: 'Kiln', register: 'services' },
  ];
  for (const { id, it, register } of cases) {
    const template = METRICS[id]!;
    const kernel = k.metric(fill(template, null, it) as never);
    assert.ok(kernel.ok, `${id}:${it}, the kernel: ${JSON.stringify(kernel)}`);
    const web = webRead(withParam(template as WebMetric, it));
    assert.deepEqual(web.refusals, [], `${id}:${it}, the app: ${web.refusals.join('; ')}`);
    assert.equal(web.rows, kernel.value.rows, `${id}:${it}: what the predicate matched`);
    assert.equal(web.value, kernel.value.value, `${id}:${it}: the figure`);
    assert.equal(web.held, kernel.value.held, `${id}:${it}: how many rows the list holds`);
    const whole = (ROWS[register] ?? []).length;
    assert.ok(whole > 0, `the demo holds no ${register}, so this case reads nothing`);
    assert.ok(
      kernel.value.held < whole,
      `${id}:${it} counts all ${whole} rows of ${register} as its scope, so a project with nothing in it reads as settled`,
    );
  }
});
