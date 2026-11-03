/**
 * People and Services each carry what waits on you about their own rows: a queue of the open questions
 * whose row is on the page's list, a first clause in the page's line that counts them, and Services' types in words.
 *
 * WHY THIS FILE EXISTS. On the owner's record Decide's badge said 25 while People and Services said nothing waits:
 * neither page drew a question about its own rows, and Services' line had no clause for them. Services drew the month
 * by type as "vm" and "edge", the words an import stored, where a person reads names.
 *
 * WHAT IS HELD. Each page's queue: where it reads and when it is drawn. The clause: its own clause, first, read as
 * nought on a record with nothing asked and as three with three asked, so the writer (`leadOf` in apps/web) leaves it
 * out at nought. The fold: at most six tiles before it at 1440, in the order the note names. And every type Services
 * declares has a name, with every stored value where it was. Every name in the questions here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { NOW, PAGES, installSeed } from '../src/index.ts';
import { ESTATE_REGISTERS, SERVICE_NUMBERS } from '../src/modules/estate.ts';

type When = { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number };
type Block = { kind: string; heading?: string; lead?: boolean; fold?: boolean; box?: boolean; area?: string; when?: When; body?: string; source?: string; where?: string; limit?: number };
type Answered = Block & { drawn?: boolean; matched?: number; values?: Record<string, unknown>; queue?: { question: string; list?: string | null }[] };

/** Each page, the list its questions are about, and the figure that counts them. */
const PAGE_LIST = { people: 'people', estate: 'services' } as const;
const figureOf = (list: string): string => `questions-open-in:${list}`;
const blocksOf = (page: keyof typeof PAGE_LIST): Block[] => (PAGES[page] as unknown as { blocks: Block[] }).blocks;

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

/** One question about `about`, signed by the record's own agent, as an automation's would be. */
function ask(k: Kernel, question: string, about: string): void {
  const out = k.propose({ question, body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'It is due.' }, { id: 'no', label: 'No', because: 'It can wait.' }], about } } as never, 'slash');
  assert.ok((out as { ok: boolean }).ok, sayOf(out as never));
}

const answered = (k: Kernel, page: string): Answered[] => {
  const out = k.page(page) as { ok: boolean; value?: { blocks: Answered[] } };
  assert.ok(out.ok, sayOf(out as never));
  return out.value!.blocks;
};

test('EACH PAGE DECLARES WAITING ON YOU over its own list, three drawn, only while one is asked about it', () => {
  for (const [page, list] of Object.entries(PAGE_LIST) as [keyof typeof PAGE_LIST, string][]) {
    const queues = blocksOf(page).filter((b) => b.kind === 'queue');
    assert.equal(queues.length, 1, `${page} carries one queue`);
    const q = queues[0]!;
    assert.deepEqual(
      [q.heading, q.source, q.where, q.limit, q.when],
      ['Waiting on you', 'governance.open', `list is ${list}`, 3, { metric: figureOf(list), gt: 0 }],
      `${page}'s queue reads its own list and is drawn only while its figure is more than nought`,
    );
  }
});

test('NO LINE COUNTS WHAT WAITS, SINCE People 4.7.0 and estate 2.8.1: Waiting on you says it, and only while something does', () => {
  for (const page of Object.keys(PAGE_LIST) as (keyof typeof PAGE_LIST)[]) {
    for (const lead of blocksOf(page).filter((b) => b.kind === 'note' && b.lead === true)) {
      assert.doesNotMatch(String(lead.body), /questions-open-in|question\(s\) for you/u, `${page}: a line counts the questions again`);
      assert.doesNotMatch(String(lead.body), /—/u, 'an em dash in words a person reads');
    }
  }
});

test('AT NOUGHT NO QUEUE IS DRAWN; AT THREE THE QUEUE DRAWS THREE, AND NO LINE COUNTS THEM', async () => {
  const k = await seeded();
  /* A question about something else, so a page never counts the whole record's questions as its own. */
  ask(k, 'Move the kiln firing to Friday?', 'things#1');
  for (const [page, list] of Object.entries(PAGE_LIST)) {
    const blocks = answered(k, page);
    const queue = blocks.find((b) => b.kind === 'queue')!;
    assert.equal(queue.drawn, false, `${page} draws Waiting on you with nothing asked about its ${list}`);
    /* NO LINE COUNTS THE QUESTIONS, SINCE People 4.7.0 and estate 2.8.1 ("i dont like those briefs at all"): the queue is
       where they are said, drawn only while one is asked. */
    for (const b of blocks.filter((x) => x.kind === 'note' && x.lead === true && x.drawn !== false))
      assert.doesNotMatch(String(b.body), /questions-open-in|for you/u, `${page}: a line counts the questions again`);
  }

  for (const [n, name] of ['Ask Wren Halloway about the March invoice?', 'Merge Orrin Bask into Orrin Basker?', 'Thank Tamsin Vale for the referral?'].entries()) ask(k, name, `people#${n + 1}`);
  for (const [n, name] of ['Keep the staging box another month?', 'Move the newsletter domain?', 'Cancel the old design suite?'].entries()) ask(k, name, `services#${n + 1}`);
  for (const [page, list] of Object.entries(PAGE_LIST)) {
    const blocks = answered(k, page);
    const queue = blocks.find((b) => b.kind === 'queue')!;
    assert.notEqual(queue.drawn, false, `${page} draws Waiting on you`);
    assert.equal(queue.queue?.length, 3, `${page} draws three`);
    assert.ok(queue.queue!.every((q) => q.list === list), `${page} draws only questions about its ${list}`);
    for (const b of blocks.filter((x) => x.kind === 'note' && x.lead === true && x.drawn !== false))
      assert.doesNotMatch(String(b.body), /questions-open-in|for you/u, `${page}: a line counts the questions again`);
  }
});

/** Tiles before the fold, as `calm-pages.test.ts` counts them: no line, no note drawn in place of a twin, a boxed run as one. */
function aboveTheFold(blocks: readonly Block[]): string[] {
  const leads = blocks.filter((b) => b.lead && b.when !== undefined).map((b) => b.when!);
  const standsIn = (b: Block): boolean =>
    b.when !== undefined && (b.when.lt !== undefined || leads.some((w) => w.metric === b.when!.metric && w.lt !== undefined && b.when!.gte === w.lt));
  const main = blocks.filter((b) => b.area !== 'rail');
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  let boxed = false;
  return (fold < 0 ? main : main.slice(0, fold))
    .filter((b) => {
      if (b.kind === 'section') return (boxed = b.box === true);
      return !boxed && !b.lead && !standsIn(b);
    })
    .map((b) => b.heading ?? b.kind);
}

test('AT MOST SIX TILES BEFORE EACH FOLD AT 1440, in the order each page names', () => {
  /* NO ORGANISATIONS TABLE SINCE People 4.1.0: the organisations are their own list, and People says how many in a line. */
  assert.deepEqual(aboveTheFold(blocksOf('people')), ['Waiting on you', 'note', 'Everyone', 'note', 'What agents did']);
  assert.deepEqual(aboveTheFold(blocksOf('estate')), ['Points at nothing', 'Lapsing', 'Waiting on you', 'Each month, by type', 'Next ninety days']);
  /* AND WITH THE SERVER AND PROVIDER NUMBERS A FOUNDER'S RECORD LAYS UNDER WHAT RENEWS, the sixth and not a seventh. */
  const estate = [...blocksOf('estate')];
  estate.splice(estate.findIndex((b) => b.heading === SERVICE_NUMBERS.after) + 1, 0, SERVICE_NUMBERS.block as unknown as Block);
  assert.equal(aboveTheFold(estate).length, 6);
});

test('EVERY TYPE SERVICES DECLARES HAS A NAME, and every stored value stays where it was', () => {
  const kind = ESTATE_REGISTERS.services!.fields.find((f) => f.id === 'kind') as unknown as { values: string[]; labels: Record<string, string> };
  /* The twelve the record already holds rows of, in their places: none is renamed or moved. */
  const held = ['domain', 'hosting', 'saas', 'certificate', 'subscription', 'membership', 'insurance', 'utility', 'server', 'database', 'storage', 'network'];
  assert.deepEqual(kind.values.slice(0, held.length), held);
  for (const v of kind.values) assert.ok(typeof kind.labels[v] === 'string' && kind.labels[v] !== v && /^[A-Z]/u.test(kind.labels[v]!), `${v} has no name a person reads`);
  assert.deepEqual([kind.labels.vm, kind.labels.edge, kind.labels.object], ['Virtual machine', 'Edge network', 'Object storage']);
  assert.deepEqual(Object.keys(kind.labels).sort(), [...kind.values].sort(), 'a name for a type the list does not declare');
});
