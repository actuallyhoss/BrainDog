/**
 * Projects' pages in the two engines: the record's, over the sample installed into a real kernel, and this app's sample
 * engine, which draws the demo. The Overview and each project's page must name the same projects, figures and parts in
 * both, or the demo shows a portfolio no real record would.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { page } from './api.ts';
import { toSegments } from './blocks.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
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
  } as unknown as Sql;
}

const kernel = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

/** A figure as its digits, because the sample says it in its unit and the record hands back the number. */
const digits = (v: unknown) => String(v ?? '').replace(/[^0-9-]/gu, '');

for (const slug of ['portfolio', 'kiln', 'marlow-co', 'portage'])
  test(`/p/${slug} DRAWS THE SAME PROJECTS, FIGURES AND PARTS IN BOTH ENGINES`, async () => {
    const k = await kernel;
    const record = k.page(slug);
    assert.ok(record.ok, JSON.stringify(record));
    const demo = page(slug);
    assert.ok(demo, `the demo has no /p/${slug}`);
    assert.equal(demo.blocks.length, record.value.blocks.length);
    record.value.blocks.forEach((kb, i) => {
      const wb = demo.blocks[i]!;
      const at = `${slug}: ${String(kb.heading)}`;
      assert.equal(wb.heading, kb.heading, at);
      assert.deepEqual(kb.refusals, [], `${at}, the record: ${JSON.stringify(kb.refusals)}`);
      assert.deepEqual(wb.refusals, [], `${at}, the demo: ${wb.refusals.join('; ')}`);
      if (kb.kind === 'stat') {
        assert.deepEqual(wb.metrics?.map((m) => digits(m.value)), (kb.readings ?? []).map((r) => digits(r.reading?.value)), at);
        return;
      }
      if (kb.kind === 'split' && kb.source?.startsWith('metric.')) {
        const parts = (g: readonly { key: unknown; value: unknown }[] | undefined) => (g ?? []).map((p) => `${String(p.key)} ${Number(p.value)}`).sort();
        assert.deepEqual(parts(wb.parts?.groups), parts(kb.readings?.[0]?.reading?.groups as never), at);
        return;
      }
      if (kb.kind === 'note' || kb.kind === 'code') return;
      assert.equal(wb.total, kb.matched, `${at}: how many matched`);
      const said = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.name ?? r.fields.what ?? r.fields.doing ?? r.fields.label ?? ''));
      if (kb.kind === 'section') return;
      assert.deepEqual(said(wb.entries), said(kb.rows), `${at}: the rows, in order`);
    });
  });

test('THE OVERVIEW’S QUEUE IS THE PROJECTS SOMEBODY SAID ARE NOT GOING WELL, and each says who changed it last', () => {
  const overview = page('portfolio')!;
  const queue = overview.blocks.find((b) => b.heading === 'Needs you')!;
  assert.deepEqual(queue.entries.map((e) => e.fields.name), ['Kiln', 'Portage']);
  const said = JSON.stringify(queue.rows);
  assert.match(said, /At risk/u);
  assert.match(said, /Off track/u);
  const changed = queue.rows.map((r) => r.cells.at(-1));
  assert.ok(String(changed[0]).startsWith('Claude, '), `the agent on Kiln said it is at risk: ${changed[0]}`);
  assert.ok(String(changed[1]).startsWith('You, '), `nobody but you changed Portage: ${changed[1]}`);
  const held = overview.blocks.find((b) => b.heading === 'With an agent')!;
  assert.deepEqual(held.rows.map((r) => String(r.cells.at(-1)).split(',')[0]), ['Claude', 'Cursor'], 'each project an agent holds names that agent');
  const cards = overview.blocks.find((b) => b.heading === 'In play')!;
  assert.match(JSON.stringify(toSegments(cards)), /60%/u, 'how far along is a proportion a ring can draw');
});

test('HOW THEY ARE GOING DRAWS EACH PART IN ITS INTENT, and a part nobody has said about stays neutral', () => {
  const split = page('portfolio')!.blocks.find((b) => b.heading === 'How they are going')!;
  const said = JSON.stringify(toSegments(split));
  for (const tone of ['good', 'warn', 'bad']) assert.ok(said.includes(`"tone":"${tone}"`), `no part is drawn ${tone}: ${said}`);
});
