/**
 * A service's NOTE: the prose about why a name is held, which the Services list had nowhere to put.
 *
 * WHY THIS FILE EXISTS. the old tool's domain register carries a note on most of its rows, and they are the most
 * valuable text in it: one is a standing conflict between two registers, one names the open task behind a site that
 * resolves nowhere, one runs to the whole clearance search behind a purchase. `services` declared nine fields and not
 * one of them held prose, so the importer (now `packs/legacy-import/adapter.ts`) left every note in the export and named the domain in a skip
 * line. Measured before this change, against the seeded record: `create('services', {..., note})` answered
 * `services has no field called note. (FIELD_UNKNOWN)`, so the row was refused whole rather than carried without it.
 *
 * `installments`, `holdings` and every Money list already declare `{ id: 'note', type: 'text' }`, so this is the same
 * field under the same id, which is what lets the importer write it without a second word for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { FIRST_PARTY_VERSIONS, NOW, firstPartyDocument, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
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

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

test('A SERVICE TAKES A NOTE, and the note it is given is the note it holds', async () => {
  const k = await seeded();
  const note = 'Held against the clearance search of 2026-08; the .gg is not bought and should not be yet.';
  const made = k.create('services', { name: 'brain.example', kind: 'domain', cycle: 'yearly', state: 'live', note }, { actor: 'p_1' });
  assert.ok(made.ok, sayOf(made));
  assert.equal(made.value.fields.note, note);
});

/**
 * AND THE VERSION MOVED WITH IT, because a record that installed Estate before this field existed has no `note` on its
 * Services list and is only ever told about one through an update. `holdings` on money-core is the precedent: declared
 * with the version left at 1.4.0, it could not be offered to a single record that already held Money.
 */
test('THE ESTATE DOCUMENT DECLARES THE NOTE, at a version later than the one that did not', () => {
  const doc = firstPartyDocument('estate', { seeds: [] }) as { version: string; declarations: { register?: string; fields?: { id: string; type: string }[] }[] };
  const services = doc.declarations.find((d) => d.register === 'services');
  assert.deepEqual(services?.fields?.find((f) => f.id === 'note'), { id: 'note', type: 'text' });
  assert.notEqual(FIRST_PARTY_VERSIONS.estate, '1.1.0', 'estate 1.1.0 is the version records already hold without a note');
  assert.equal(doc.version, FIRST_PARTY_VERSIONS.estate);
});
