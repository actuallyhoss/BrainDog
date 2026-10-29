/**
 * A block kind registered in `src/kinds/index.ts` installs, checks its own keys and reads its own answer, and a kind
 * that is not registered reads exactly as it did.
 *
 * THE STUB IS REGISTERED BEFORE THE KERNEL LOADS, which is the only order that means anything: `declare.ts` and
 * `block-keys.ts` build their lists from the registry and its keys table when they load, so the kernel is imported below, after the
 * line that registers the stub. Each test file runs in a process of its own, so the stub is seen by no other file.
 *
 * EACH TEST DRIVES A REAL RECORD over `node:sqlite`, as `pages.test.ts` does, so the install check, the key closure
 * and the read are the kernel's own and not a stub of them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '../src/index.ts';
import { BLOCK_KIND_MODULES, type KindModule } from '../src/kinds/index.ts';
import { KIND_KEYS } from '../src/kinds/keys.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/** What the stub says it read, so a test can tell its answer from the one `pages.ts` would have given. */
const READ_BY_STUB = (n: number) => `${n} read by the stub`;

/* A KIND WITH ONE KEY OF ITS OWN AND ONE IT SHARES: `shade` only it reads, and `back` the series, stat and lines read
   too. Its read counts the rows of the list its source names. */
const STUB: KindModule = {
  keys: ['shade', 'back'],
  validate: (block) =>
    block.shade === undefined || block.shade === 'warm' || block.shade === 'cool'
      ? null
      : { code: 'DECLARATION_INVALID', fix: 'A shade is warm or cool.', at: 'shade', allowed: ['warm', 'cool'] },
  read: (deps, block, base) => {
    const register = block.source?.startsWith('register.') ? block.source.slice('register.'.length) : null;
    if (register === null) return base;
    const got = deps.list({ register });
    return got.ok ? { ...base, rows: got.value.rows, matched: got.value.matched, heading: READ_BY_STUB(got.value.matched) } : base;
  },
};
BLOCK_KIND_MODULES.stub = STUB;
/* THE KEYS TABLE IS WHAT `block-keys.ts` READS (`kinds/keys.ts`), so the stub's keys go in it as well. */
(KIND_KEYS as Record<string, readonly string[]>).stub = STUB.keys;

const { openRecord } = await import('../src/index.ts');

const NOW = Date.UTC(2026, 8, 9, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.obligations'], blocks } as never,
});

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  for (const what of ['One', 'Two', 'Three']) assert.ok(k.create('obligations', { what }, { actor: 'p_1' }).ok);
  return { k, sql };
}

/** The refusal an install answered, or `null` when it installed. */
const refusalOf = (out: { ok: boolean }) => (!out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string } }).refusal : null);

test('a registered kind installs, and its page is read through its module', async () => {
  const { k, sql } = await record();
  const out = await k.install([
    pageOf(
      { kind: 'stub', heading: 'Counted', source: 'register.obligations', shade: 'warm', back: 2 },
      { kind: 'table', heading: 'Every row', source: 'register.obligations', columns: [{ field: 'what' }] },
    ),
  ]);
  assert.equal(refusalOf(out), null, 'a page naming a registered kind was refused at install');

  const page = k.page('desk');
  assert.ok(page.ok);
  const [stub, table] = page.value.blocks;
  assert.equal(stub?.heading, READ_BY_STUB(3), 'the registered kind was not read by its module');
  assert.equal(stub?.rows.length, 3);
  assert.deepEqual(stub?.refusals, []);
  /* AND A KIND THAT IS NOT REGISTERED IS READ AS IT ALWAYS WAS, by `pages.ts`'s own arm. */
  assert.equal(table?.heading, 'Every row');
  assert.equal(table?.rows.length, 3);
  sql.close();
});

test("a registered kind's own check refuses at install, naming the page, the block and the key", async () => {
  const { k, sql } = await record();
  const said = refusalOf(await k.install([pageOf({ kind: 'stub', heading: 'Loud', shade: 'loud' })]));
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.match(said?.at ?? '', /blocks\[0\]\.shade$/u);
  assert.match(said?.fix ?? '', /blocks\[0\]: A shade is warm or cool\.$/u);
  sql.close();
});

test('a key only the registered kind reads is refused on every other kind, and a shared key stays shared', async () => {
  const { k, sql } = await record();
  const said = refusalOf(await k.install([pageOf({ kind: 'note', heading: 'Words', body: 'x', shade: 'warm' })]));
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.match(said?.fix ?? '', /shade: is read by stub blocks/u);
  /* `back` IS STILL THE SERIES' KEY, and the stub's too: a series carrying it installs as it did. */
  assert.equal(refusalOf(await k.install([pageOf({ kind: 'series', heading: 'Months', back: 2 })])), null);
  sql.close();
});

test('at read, the module checks again, a key nobody reads is still said, and a `when:` that says no never reaches it', async () => {
  const { k, sql } = await record();
  const loud = k.block({ kind: 'stub', shade: 'loud' } as never);
  assert.ok(loud.refusals.some((r) => r.fix === 'A shade is warm or cool.'), 'the module was not asked at read');
  assert.equal(loud.rows.length, 0);

  const misspelt = k.block({ kind: 'stub', source: 'register.obligations', width: 2 } as never);
  assert.ok(misspelt.refusals.some((r) => r.at === 'width'), 'a key nobody reads went unsaid on a registered kind');
  assert.equal(misspelt.heading, READ_BY_STUB(3), 'the refusals the read already had stopped the module');

  const unmet = k.block({ kind: 'stub', source: 'register.obligations', when: { metric: 'no-such-figure', gt: 0 } } as never);
  assert.equal(unmet.drawn, false);
  assert.notEqual(unmet.heading, READ_BY_STUB(3), 'a block whose condition was not met was read anyway');
  sql.close();
});
