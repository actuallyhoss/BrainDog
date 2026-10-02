/**
 * People's pages on a real record, since People 2.4.0: one line said from People's own figures, the days people were
 * last in touch as a chart, everyone with the one you spoke to last first, and a glyph on every tile's heading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, PEOPLE, firstPartyManifest, installSeed } from '../src/index.ts';

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

const opened = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, `${slug}: ${sayOf(out)}`);
  return out.value;
};

const on = (offset: number): string => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const after = (offset: number) => (p: (typeof PEOPLE)[number]) => typeof p.in_touch === 'string' && p.in_touch > on(offset);

test('PEOPLE OPENS ON ONE LINE SAID FROM ITS OWN FIGURES, and the figures count the sample’s people', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], String(b.heading));

  /* TWO LINES ON ONE FIGURE, SO EXACTLY ONE IS DRAWN: who has gone quiet, by name, while anybody has, and otherwise the
     counts (People 2.7.0). */
  const leads = page.blocks.filter((b) => b.kind === 'note' && (b as { lead?: boolean }).lead === true);
  assert.equal(leads.length, 2);
  const [counts, quiet] = leads as (typeof leads[number] & { body?: string; drawn?: boolean })[];
  const body = String(counts!.body);
  for (const id of ['people-in-touch-30d', 'people-count']) assert.ok(body.includes(`{{${id}}}`), `the line does not say ${id}`);
  /* HOW MANY IS A CLAUSE OF ITS OWN, and each other clause holds one figure, so a record with no Last in touch days
     (whoever `meet` added) reads "12 contacts" and never "0 of your 12 contacts were in touch". */
  const clauses = body.split(/,\s+/u);
  assert.match(clauses[0]!, /^\{\{people-count\}\} contact\(s\)$/u);
  for (const clause of clauses.slice(1)) assert.equal(clause.match(/\{\{/gu)?.length, 1, clause);
  /* THE SAMPLE HAS SOMEBODY QUIET, so the named line is the one drawn, and it names the one quiet longest, from the rows. */
  assert.equal(counts!.drawn, false);
  assert.notEqual(quiet!.drawn, false);
  assert.match(String(quiet!.body), /^\{\{people-quiet\.first\}\} has been quiet since \{\{people-quiet\.since\}\}/u);
  const longest = [...PEOPLE].filter((p) => typeof p.in_touch === 'string' && p.in_touch < on(-90)).sort((a, b) => String(a.in_touch).localeCompare(String(b.in_touch)));
  const values = (quiet as { values?: Record<string, unknown> }).values ?? {};
  assert.equal(values['people-quiet.first'], longest[0]!.name);
  assert.equal(values['people-quiet.since'], longest[0]!.in_touch);
  assert.equal(values['people-quiet.more'], longest.length - 1);

  const read = (id: string) => {
    const out = k.metric(METRICS[id] as never);
    assert.ok(out.ok, sayOf(out));
    return out.value.value;
  };
  assert.equal(read('people-count'), PEOPLE.length);
  assert.equal(read('people-in-touch-30d'), PEOPLE.filter(after(-31)).length);
  assert.equal(read('people-in-touch-12w'), PEOPLE.filter(after(-84)).length);
  assert.equal(read('people-quiet'), PEOPLE.filter((p) => typeof p.in_touch === 'string' && p.in_touch < on(-90)).length);
  assert.ok(Number(read('people-quiet')) > 0 && Number(read('people-in-touch-30d')) > 0, 'the sample has somebody quiet and somebody in touch, so the line says both');
});

test('THE CHART MARKS EACH PERSON ON THE LAST DAY THEY WERE IN TOUCH, and everyone is listed the latest first', async () => {
  const k = await seeded();
  const page = opened(k, 'people');
  const chart = page.blocks.find((b) => b.kind === 'heat');
  assert.ok(chart, 'People draws no chart');
  assert.equal(chart.rows.length, PEOPLE.filter(after(-84)).length);
  /* A LINE A PERSON, SINCE People 2.5.0 (`who:` since 2.6.0): the day then who, so each dot is drawn beside a name. */
  assert.equal((chart as { who?: unknown }).who, true, 'the chart is not drawn a line a person');
  assert.deepEqual(chart.columns?.map((c) => c.field), ['in_touch', 'name']);
  assert.ok(chart.rows.every((r) => typeof r.fields.name === 'string' && r.fields.name !== ''), 'a mark on the chart names nobody');

  const cards = page.blocks.find((b) => b.kind === 'cards');
  assert.ok(cards);
  const days = cards.rows.map((r) => r.fields.in_touch).filter((d): d is string => typeof d === 'string');
  assert.deepEqual(days, [...days].sort().reverse(), 'Everyone is not in the order people were last in touch');
  assert.equal(cards.rows[0]?.fields.name, 'S. Marchetti');
  assert.equal(cards.rows.length, PEOPLE.length, 'somebody nobody has been in touch with is left off Everyone');

  /* EVERY TILE WITH A HEADING WEARS A GLYPH, on the person's own page too. */
  /* A PERSON'S OWN PAGE IS AT THEIR NAME. */
  for (const p of [page, opened(k, 's-marchetti')]) {
    const bare = p.blocks.filter((b) => typeof b.heading === 'string' && typeof (b as { icon?: unknown }).icon !== 'string').map((b) => b.heading);
    assert.deepEqual(bare, [], `${p.slug ?? 'a page'}: a heading with no glyph`);
  }
});

test('A RECORD WHERE NOBODY WAS IN TOUCH DRAWS NO CHART, and still says how many people it keeps', async () => {
  const k = await seeded();
  const listed = k.list({ register: 'people', limit: 50 });
  assert.ok(listed.ok, sayOf(listed));
  /* NOT DELETED, which a person other rows name refuses: every day taken off, so nobody was ever in touch. */
  for (const r of listed.value.rows) assert.ok(k.update('people', `people#${r.seq}`, { in_touch: null }, { actor: 'p_1' }).ok);
  const page = opened(k, 'people');
  assert.equal(page.blocks.find((b) => b.kind === 'heat')?.drawn, false, 'the chart is drawn over nobody');
  assert.notEqual(page.blocks[0]?.drawn, false, 'the line is left off while there are people to name');
});

test('PEOPLE STILL NEEDS NO OTHER LIST: its figures read People alone', () => {
  assert.deepEqual(firstPartyManifest('people').requires, []);
  for (const id of ['people-count', 'people-in-touch-30d', 'people-in-touch-12w', 'people-quiet'])
    assert.equal((METRICS[id] as { source: string }).source, 'register.people', id);
});

test('MEETING SOMEONE MOVES THEIR LAST IN TOUCH TO TODAY, so the page stays current without anyone typing a day', async () => {
  const k = await seeded();
  const quiet = PEOPLE.find((p) => p.name === 'Pell & Vine')!;
  const met = k.meet({ email: String(quiet.email), where: 'mail about the year-end pack' }, { actor: 'agent:claude' });
  assert.ok(met.ok, sayOf(met));
  const listed = k.list({ register: 'people', limit: 50 });
  assert.ok(listed.ok, sayOf(listed));
  assert.equal(listed.value.rows.find((r) => r.fields.name === quiet.name)?.fields.in_touch, on(0));
});
