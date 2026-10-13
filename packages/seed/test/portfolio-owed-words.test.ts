/**
 * A project page says the money on its way in the words the rest of the product says it in.
 *
 * HIS WORDS: "i want the headlines to be the money i have, not the money im due/owed". Today's tile and Shop's list
 * were renamed Still to come in (audit 69 finding 4), and a project's own figure went on saying Owed to you, under a
 * tile labelled the same. The figure's name is what heads the list the tile opens, so the two are one phrase said
 * twice, and they are held equal here rather than by hand.
 *
 * The ids and what is counted do not move: `project-owed` still sums the open obligations owed to the person on one
 * project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PORTFOLIO_PAGES, PROJECT_METRICS, projectTemplate } from '../src/modules/portfolio.ts';
import { SHOP } from '../src/usecases/shop.ts';

const OLD = 'Owed to you';
const FIGURE = 'project-owed';

type Cell = { metric: string; label: string };
type Block = { heading?: string; cells?: Cell[] };

/** The label a page's At a glance tile gives the figure, and that it gives it once. */
const labelOn = (blocks: unknown): string => {
  const glance = (blocks as Block[]).filter((b) => b.heading === 'At a glance');
  assert.equal(glance.length, 1, 'a project page has one At a glance tile');
  const cells = (glance[0]!.cells ?? []).filter((c) => c.metric.split(':')[0] === FIGURE);
  assert.equal(cells.length, 1, 'the tile reads what is still to come in once');
  return cells[0]!.label;
};

/** Every heading a declaration holds, however deep. */
const headingsIn = (at: unknown, found: string[] = []): string[] => {
  if (Array.isArray(at)) for (const one of at) headingsIn(one, found);
  else if (at !== null && typeof at === 'object')
    for (const [key, value] of Object.entries(at)) {
      if (key === 'heading' && typeof value === 'string') found.push(value);
      else headingsIn(value, found);
    }
  return found;
};

test('THE FIGURE AND THE TILE SAY THE SAME WORDS, and neither says Owed to you', () => {
  const name = PROJECT_METRICS[FIGURE]!.name;
  const label = labelOn(PORTFOLIO_PAGES.project!.blocks);
  assert.equal(label, name, 'the tile is labelled one thing and the list it opens is headed another');
  assert.notEqual(name, OLD);
  assert.notEqual(label, OLD);
  /* A RECORD WITH BILLS AND NO SERVICES keeps the figure, and with it the same words. */
  assert.equal(labelOn(projectTemplate(['things', 'tasks', 'obligations', 'transactions']).blocks), name);
});

test('THEY ARE THE WORDS SHOP HEADS ITS OWN LIST WITH, so the money on its way has one name', () => {
  const name = PROJECT_METRICS[FIGURE]!.name;
  assert.equal(name, 'Still to come in');
  assert.ok(headingsIn(SHOP).includes(name), 'Shop heads its list of unpaid orders with other words');
});

test('WHAT COUNTS DID NOT MOVE: the same id, the same bills, the same line it is held to', () => {
  const figure = PROJECT_METRICS[FIGURE]!;
  assert.equal(figure.metric, FIGURE);
  assert.equal(figure.source, 'register.obligations');
  assert.match(String(figure.where), /direction is owed to me, thing is \{\{it\}\}$/u);
  assert.deepEqual(figure.value, { sum: 'amount' });
  assert.deepEqual(figure.target, { setting: 'most_owed_to_you' });
});

test("ON A PROJECT'S PAGE THE TILE'S LABEL IS THE HEADING OF THE LIST IT OPENS", async () => {
  const k: Kernel = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  const page = k.page('kiln');
  assert.ok(page.ok, sayOf(page));
  const glance = page.value.blocks.find((b) => b.heading === 'At a glance') as unknown as {
    readings: { label: string; metric: string; reading: { value: number; unit: string | null; rows: number } }[];
  };
  const read = glance.readings.find((r) => r.metric === `${FIGURE}:Kiln`);
  assert.ok(read, 'Kiln no longer reads what is still to come in');
  /* THE LIST A TILE OPENS IS HEADED BY ITS FIGURE'S NAME, as the record holds it once the pack is installed. */
  const held = k.metricDecl(FIGURE);
  assert.ok(held, 'the record holds no such figure');
  assert.equal(read.label, held.name);
  assert.notEqual(read.label, OLD);
  /* AND IT IS THE SAME MONEY: Kiln's two unpaid invoices, in the one currency they are in. */
  assert.deepEqual([read.reading.value, read.reading.unit, read.reading.rows], [405000, 'GBP', 2]);
});
