/**
 * THE DECLARATION KEYS THE APP READS, AND THE KERNEL DOES NOT, SURVIVE AN INSTALL AND A READ.
 *
 * `label`, `index`, `search` and `deadline` on a field, and
 * `icon`, `one`, `holds`, `mobile` and `identity` on a register, are drawn by the browser and are in
 * neither the kernel's `RegisterDecl` nor its `FieldDecl`. They survived only because `declare.ts`
 * never rejects a key it does not know, which is a property nothing asserted. The moment the app
 * reads its registers through `schema` instead of from its own constants, a key the install drops is
 * a grid with no column names and a phone card with no fields, and no test anywhere would go red.
 *
 * `kernel.register()` is what the record's `schema` route returns, so this is the read the app makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openRecord, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';
import { AGENTS_REGISTERS, NOW, REGISTERS, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
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
}

async function seeded(): Promise<{ k: Kernel; sql: Sql & { close(): void } }> {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return { k, sql };
}

const REGISTER_KEYS = ['icon', 'one', 'holds', 'mobile', 'identity'] as const;
const FIELD_KEYS = ['label', 'index', 'search', 'deadline'] as const;

test('every browser-only declaration key comes back from the record exactly as the seed wrote it', async () => {
  const { k, sql } = await seeded();
  try {
    let checked = 0;
    // The agents pack's registers too: they arrive through the pack path, and the keys must survive it.
    for (const [id, seed] of Object.entries({ ...REGISTERS, ...AGENTS_REGISTERS })) {
      const read = k.register(id) as unknown as Record<string, unknown> | undefined;
      assert.ok(read, `${id} did not come back at all`);
      const wrote = seed as unknown as Record<string, unknown>;
      for (const key of REGISTER_KEYS)
        if (key in wrote) {
          assert.deepEqual(read[key], wrote[key], `${id}.${key} changed on the way through`);
          checked++;
        }
      const fields = new Map(((read.fields ?? []) as Record<string, unknown>[]).map((f) => [f.id, f]));
      for (const field of (wrote.fields ?? []) as Record<string, unknown>[]) {
        const back = fields.get(field.id);
        assert.ok(back, `${id}.${String(field.id)} did not come back`);
        for (const key of FIELD_KEYS)
          if (key in field) {
            assert.deepEqual(back[key], field[key], `${id}.${String(field.id)}.${key} changed on the way through`);
            checked++;
          }
      }
    }
    /* A floor, so the test cannot pass by comparing nothing: if the seed stops declaring these keys,
       the round trip is no longer being asserted and this says so. */
    assert.ok(checked > 40, `only ${checked} keys were compared, so the seed stopped declaring them`);
  } finally {
    sql.close();
  }
});
