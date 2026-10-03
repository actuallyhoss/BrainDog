/**
 * A page answers what it draws, and not every word its rows hold.
 *
 * MEASURED ON THE OWNER'S RECORD: Projects answered 760 KB, and 723 KB of it was notes nothing drew. "In play", the
 * "Parked and finished" heading and "Not in play" each shipped every project's whole `note`, up to 71 KB a row, under
 * columns that never read it, and the page reads itself again on every write (`loop/research-real-record.md`,
 * Projects). So a page's rows carry each long text cut at 280 characters, as `list` cuts it for an agent, with
 * `clipped` on the row; a section, drawn as its count, sends no row at all; and everything else a host acts on a row
 * with is kept, because the docked panel, a tick's Undo and a row's tone read fields no column draws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { ROW_TEXT_MOST, type PageResult, type PageRow } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    identity: { mark: 'mark', accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'about', type: 'text' },
      { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked', 'retired'], labels: { retired: 'Finished' }, required: true },
      { id: 'health', type: 'enum', values: ['on_track', 'at_risk', 'off_track'] },
      { id: 'next', type: 'text' },
      { id: 'revenue', type: 'money' },
      { id: 'aim', type: 'day' },
      { id: 'mark', type: 'text' },
      { id: 'hue', type: 'int' },
      { id: 'note', type: 'document' },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const LIVE = 'lane is building or earning';
const PARKED = 'lane is parked or retired';

/** Projects as the owner's Projects page draws them, the three blocks that shipped the notes. */
const PORTFOLIO: Declaration = {
  id: 'page.portfolio',
  kind: 'page',
  body: {
    page: 'portfolio',
    title: 'Projects',
    blocks: [
      {
        kind: 'cards',
        heading: 'In play',
        source: 'register.things',
        where: LIVE,
        columns: [{ field: 'name', as: 'title' }, { field: 'mark', as: 'mark' }, { field: 'hue', as: 'hue' }, { field: 'about', as: 'reply' }, { field: 'health', as: 'fact' }, { field: 'next', as: 'fact' }],
        order: [{ field: 'name', dir: 'asc' }],
      },
      { kind: 'section', heading: 'Parked and finished', fold: true, source: 'register.things', where: PARKED },
      {
        kind: 'table',
        heading: 'Not in play',
        source: 'register.things',
        where: PARKED,
        columns: [{ field: 'name' }, { field: 'lane' }, { field: 'next' }],
        order: [{ field: 'name', dir: 'asc' }],
      },
    ],
  } as never,
};

/** A project's own page, a template, whose notes block draws the note whole. */
const PROJECT: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: { page: 'project', title: '{{name}}', for: { register: 'things' }, blocks: [{ kind: 'note', document: true, heading: 'Notes', body: '{{note}}' }] } as never,
};

/* A write-up the size the owner's import kept, with a heading every few hundred words: synthetic, invented here. */
const NOTE_CHARS = 17_000;
const noteOf = (name: string): string => {
  const line = `## ${name}\n\nWhat was decided, what blocks it and what is next, written out in full for whoever picks it up. `;
  return line.repeat(Math.ceil(NOTE_CHARS / line.length)).slice(0, NOTE_CHARS);
};

async function record(live = 11, parked = 16): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS, PORTFOLIO, PROJECT]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (let i = 1; i <= live + parked; i++) {
    const name = `Project ${String(i).padStart(2, '0')}`;
    const made = k.create(
      'things',
      {
        name,
        about: 'A small studio product',
        lane: i <= live ? (i % 2 ? 'building' : 'earning') : i % 2 ? 'parked' : 'retired',
        health: 'on_track',
        next: 'Ship the next cut',
        revenue: { amount: 1_000_00 * i, currency: 'GBP' },
        aim: '2026-12-01',
        mark: 'P',
        hue: i * 10,
        note: noteOf(name),
        repos: [`studio/${name.toLowerCase().replace(' ', '-')}`],
      },
      OWNER,
    );
    assert.ok(made.ok, JSON.stringify(made));
  }
  return { k, sql };
}

const page = (k: Kernel, slug: string): PageResult => {
  const out = k.page(slug);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('THE PROJECTS PAGE ANSWERS A SMALL FRACTION OF ITS NOTES, and every project it draws is still there', async () => {
  const { k, sql } = await record();
  const answer = page(k, 'portfolio');
  const [cards, section, table] = answer.blocks as [PageResult['blocks'][number], PageResult['blocks'][number], PageResult['blocks'][number]];
  assert.deepEqual([cards.refusals, section.refusals, table.refusals], [[], [], []]);
  assert.deepEqual([cards.rows.length, cards.matched, table.rows.length, table.matched], [11, 11, 16, 16]);

  /* WHAT THE THREE BLOCKS SHIPPED WHOLE: 43 rows, each with its note, the section's sixteen among them. */
  const whole = 43 * NOTE_CHARS;
  const bytes = JSON.stringify(answer).length;
  assert.ok(bytes < whole / 20, `${bytes} bytes answered, against ${whole} in the notes alone`);
  sql.close();
});

test('A LONG TEXT IS CUT AT 280 CHARACTERS, as list cuts it, and the row says clipped; every other field is kept', async () => {
  const { k, sql } = await record(2, 0);
  const [cards] = page(k, 'portfolio').blocks as [PageResult['blocks'][number]];
  const row = cards.rows[0] as PageRow;
  assert.equal(row.clipped, true);
  assert.equal([...String(row.fields.note)].length, ROW_TEXT_MOST);
  assert.ok(noteOf('Project 01').startsWith(String(row.fields.note)), 'the cut is the start of the note');

  /* THE FIELDS A HOST ACTS ON A ROW WITH, drawn or not: the panel opens on every field, a tick's Undo puts back what the
     row held, and a row's tone is read from its state and its days. */
  const { note: _note, ...rest } = row.fields;
  const held = k.get('things#1')!;
  const { note: whole, ...heldRest } = held.fields;
  assert.deepEqual(rest, heldRest);
  assert.deepEqual([row.id, row.seq, row.version, row.register], [held.id, held.seq, held.version, held.register]);

  /* AND THE ROW ITSELF STILL ANSWERS WHOLE, by `get` and on its own page, whose notes block draws it as a value. */
  assert.equal(String(whole).length, NOTE_CHARS);
  const own = page(k, 'project-01');
  assert.equal((own.blocks[0] as { body?: string }).body, noteOf('Project 01'), 'the project page drew its note cut short');
  sql.close();
});

test('THE CUT COUNTS CHARACTERS, NOT UNITS, so an emoji is one and is never split; a short text is left as it was', async () => {
  const { k, sql } = await record(0, 0);
  const smiles = '🙂'.repeat(300);
  assert.ok(k.create('things', { name: 'Wide', lane: 'building', about: smiles, repos: ['a'.repeat(400), 'short'] }, OWNER).ok);
  assert.ok(k.create('things', { name: 'Brief', lane: 'building', about: 'A short line', note: 'Short.' }, OWNER).ok);
  const [cards] = page(k, 'portfolio').blocks as [PageResult['blocks'][number]];
  const [brief, wide] = cards.rows as [PageRow, PageRow];
  assert.equal(brief.fields.name, 'Brief');
  assert.equal('clipped' in brief, false, 'a row with nothing long says nothing');
  assert.deepEqual(brief.fields, k.get('things#2')!.fields);

  assert.equal(wide.clipped, true);
  assert.equal(wide.fields.about, '🙂'.repeat(ROW_TEXT_MOST));
  /* A LIST OF TEXTS IS CUT TEXT BY TEXT, and keeps every one of them. */
  assert.deepEqual(wide.fields.repos, ['a'.repeat(ROW_TEXT_MOST), 'short']);
  sql.close();
});

test('A SECTION IS ITS COUNT: it sends no row and nothing aligned to one, and says how many are under it', async () => {
  const { k, sql } = await record(1, 3);
  const section = page(k, 'portfolio').blocks[1]!;
  assert.equal(section.kind, 'section');
  assert.deepEqual(section.rows, []);
  assert.equal(section.matched, 3, 'the heading counts every parked and finished project');

  /* A SECTION THAT ASKED FOR WHERE ITS ROWS APPLY, OR WHO IS ON THEM, STILL SENDS NONE OF IT. */
  const asked = k.block({ kind: 'section', heading: 'Parked', source: 'register.things', where: PARKED, columns: [{ field: 'name' }, { field: 'changed' }] } as never);
  assert.deepEqual(asked.refusals, []);
  assert.deepEqual([asked.rows, asked.matched, 'changes' in asked], [[], 3, false]);
  /* A LIMIT OF NOUGHT IS STILL NOUGHT, as on every other kind. */
  assert.equal(k.block({ kind: 'section', heading: 'Parked', source: 'register.things', where: PARKED, limit: 0 } as never).matched, 0);
  /* AND A SECTION OVER NOTHING IS A HEADING, answered as it was. */
  const bare = k.block({ kind: 'section', heading: 'Later' } as never);
  assert.deepEqual([bare.rows, bare.matched, bare.refusals], [[], 0, []]);
  sql.close();
});

test('AN INPUTS BLOCK IS A FORM OVER ITS ROW, SO ITS TEXTS GO WHOLE: a box opened on 280 characters would save them over the rest', async () => {
  const { k, sql } = await record(0, 0);
  const long = 'A line about the project that runs on. '.repeat(20);
  assert.ok(k.create('things', { name: 'Wide', lane: 'building', about: long }, OWNER).ok);
  const form = k.block({ kind: 'inputs', register: 'things', row: 'things#1', columns: [{ field: 'name' }, { field: 'about' }] } as never);
  assert.deepEqual(form.refusals, []);
  const [row] = form.rows as [PageRow];
  assert.equal(row.fields.about, long);
  assert.equal('clipped' in row, false);
  sql.close();
});
