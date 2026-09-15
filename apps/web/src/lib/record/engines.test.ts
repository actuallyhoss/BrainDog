/**
 * The two page engines, held against each other over the seed, on the blocks that say where a row applies.
 *
 * A project page reads its own rows and the ones it inherits. The kernel decides what a project row
 * hides through `inScope`, and this app decides it again in `api.ts`, so the two are asked the same
 * blocks over the same rows and must name the same rows in the same places. The agents registers are
 * not in the demo's data yet, so they are added here, the way `data.ts` maps every other register.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, readBlock as kernelBlock, type Kernel, type PageBlock as KernelBlock, type PageDeps } from '@braindog/kernel';
import { AGENTS_REGISTERS, LOOKUPS, NOW, ROWS as SEED_ROWS, installSeed, stamp } from '@braindog/seed';

import { readBlock as webBlock, REGISTERS, ROWS } from './api.ts';
import type { Entry, Fields, PageBlock, RegisterDecl } from './schema.ts';

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

/* The agents registers and rows, as `data.ts`'s `entriesOf` maps the rest: a ref stays its seq. */
for (const [id, decl] of Object.entries(AGENTS_REGISTERS)) {
  REGISTERS[id] = decl as unknown as RegisterDecl;
  ROWS[id] = (SEED_ROWS[id] ?? []).map((raw, i): Entry => {
    const seq = i + 1;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) if (value !== undefined) fields[key] = value;
    return { seq, fields: fields as Fields, version: 1 + (seq % 4), created: stamp(-seq * 37), by: 'you' };
  });
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
  };
}

const seeded = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW }, { lookups: LOOKUPS });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
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

test('an as: scope column on a field that does not say where a row applies is refused by both engines', async () => {
  const deps = await seeded;
  const block = { ...blockOver('skills', 'Kiln'), inherit: false, columns: [{ field: 'name', as: 'scope' }] } as KernelBlock & PageBlock;
  assert.equal(kernelBlock(deps, block).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(webBlock(block).refusals.join('; '), /as: scope/);
});
