/**
 * Projects' pages in the two engines: the record's, over the sample installed into a real kernel, and this app's sample
 * engine, which draws the demo. The Overview and each project's page must name the same projects, figures and parts in
 * both, or the demo shows a portfolio no real record would.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { money } from 'braindog-render';
import { NOW, installSeed } from '@braindog/seed';

import { page, readBlock } from './fixtures/readers.ts';
import { toSegments } from './blocks.ts';
import { wholeMoneyIn } from './page-live.ts';
import { drawerOf } from '../page/kinds/index.ts';
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
      /* A BLOCK ITS `when` HIDES (portfolio 1.16.0's Where it stands: the card or the stat, never both) is hidden in both
         engines, and a hidden block reads no figure to compare. */
      if ((kb as { drawn?: boolean }).drawn === false) {
        assert.equal((wb as { drawn?: boolean }).drawn, false, `${at}: drawn in the demo and not on the record`);
        return;
      }
      if (kb.kind === 'stat') {
        /* A TILE SAYS MONEY BY THE ONE RULE FOR CENTS (`wholeMoneyIn`, dd6b3b9bf), so the record's minor units go through the
           same words, or a figure out by a hundred would pass. */
        const said = (r: { value?: unknown; unit?: unknown } | undefined) =>
          typeof r?.value === 'number' && typeof r.unit === 'string' && r.unit !== '' ? digits(wholeMoneyIn(money(Math.round(r.value), r.unit))) : digits(r?.value);
        assert.deepEqual(wb.metrics?.map((m) => digits(m.value)), (kb.readings ?? []).map((r) => said(r.reading as never)), at);
        return;
      }
      if (kb.kind === 'split' && kb.source?.startsWith('metric.')) {
        const parts = (g: readonly { key: unknown; value: unknown }[] | undefined) => (g ?? []).map((p) => `${String(p.key)} ${Number(p.value)}`).sort();
        assert.deepEqual(parts(wb.parts?.groups), parts(kb.readings?.[0]?.reading?.groups as never), at);
        return;
      }
      if (kb.kind === 'note' || kb.kind === 'code') return;
      /* A KIND WITH ITS OWN DRAWER (a calendar) keeps the record's answer whole and fills no `entries`: its rows are there. */
      if (drawerOf(kb.kind)) {
        const rows = (wb.answer as { rows?: { fields: Record<string, unknown> }[] } | undefined)?.rows ?? [];
        const name = (r: { fields: Record<string, unknown> }) => String(r.fields.name ?? r.fields.what ?? r.fields.doing ?? r.fields.label ?? '');
        assert.deepEqual(rows.map(name), (kb.rows ?? []).map(name), `${at}: the rows, in order`);
        return;
      }
      assert.equal(wb.total, kb.matched, `${at}: how many matched`);
      const said = (rows: readonly { fields: Record<string, unknown> }[]) => rows.map((r) => String(r.fields.name ?? r.fields.what ?? r.fields.doing ?? r.fields.label ?? ''));
      if (kb.kind === 'section') return;
      assert.deepEqual(said(wb.entries), said(kb.rows), `${at}: the rows, in order`);
    });
  });

test('THE CARDS IN PLAY SAY WHICH PROJECTS ARE NOT GOING WELL, with no table saying it again, and an agent\'s are named', () => {
  /* NEEDS YOU WENT IN portfolio 1.11.0: every card in play carries its health and next step, and the line counts them. */
  const overview = page('portfolio')!;
  assert.ok(!overview.blocks.some((b) => b.heading === 'Needs you'), 'a table says again what the cards say');
  const playing = overview.blocks.find((b) => b.heading === 'In play')!;
  const said = JSON.stringify(playing.rows);
  assert.match(said, /At risk/u);
  assert.match(said, /Off track/u);
  /* WITH AN AGENT WENT (proj F1): each card names the agent that holds it, so a table
     saying it again under the cards was the same fact twice. */
  assert.ok(!overview.blocks.some((b) => b.heading === 'With an agent'), 'a table says again which agent holds which project');
  for (const agent of ['Claude', 'Cursor']) assert.match(said, new RegExp(agent, 'u'), `no card names ${agent}, which holds a project`);
  const cards = overview.blocks.find((b) => b.heading === 'In play')!;
  assert.match(JSON.stringify(toSegments(cards)), /60%/u, 'how far along is a proportion a ring can draw');
});

test('HOW THEY ARE GOING DRAWS EACH PART IN ITS INTENT, and a part nobody has said about stays neutral', () => {
  /* PROJECTS' OWN PAGE DREW THIS UNTIL portfolio 1.31.2 (fdc1b185b), and the figure stays declared for a page somebody
     makes, so the block is written here as such a page would. */
  const split = readBlock({ kind: 'split', heading: 'How they are going', source: 'metric.projects-by-health', unset: 'Not said yet', tones: { on_track: 'good', at_risk: 'warn', off_track: 'bad' } } as never);
  const said = JSON.stringify(toSegments(split));
  for (const tone of ['good', 'warn', 'bad']) assert.ok(said.includes(`"tone":"${tone}"`), `no part is drawn ${tone}: ${said}`);
});
