/**
 * A page over the log is filtered by its own three questions (PGS-C24 job 3): who wrote a line, what kind of change it
 * was and which list it was on. Each is answered from the last 30 days of the log with names and counts, never an id;
 * a choice narrows the feed; the page's own order of filters is kept. Invented agents, people and lists throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { readPage, type ActivityEvent, type PageDeps, type PageFilter } from '../src/pages.ts';
import type { Entry } from '../src/index.ts';
import type { Reading } from '../src/metrics.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const PERSON = PEOPLE[2]!;

const run = (seq: number, fields: Entry['fields']): Entry => ({
  id: `r${seq}`,
  register: 'session',
  seq,
  fields,
  state: 'active',
  version: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  deleted_at: null,
});
/* TWO RUNS OF ONE AGENT ARE ONE AGENT: S1 and S3 are both Claude, S2 is Gemini. */
const RUNS: Readonly<Record<string, Entry>> = { S1: run(1, { agent: 'claude' }), S2: run(2, { agent: 'gemini' }), S3: run(3, { agent: 'claude' }) };

const line = (day: string, actor: string, target: string, kind = 'edit'): ActivityEvent => ({ ts: `2026-${day}:00.000Z`, actor, kind, target, note: null, thing: target });

/** Newest first, as the record reads them. The last is 40 days old, and is in the feed but in no count. */
const EVENTS: ActivityEvent[] = [
  line('10-15T11:00', 'S1', 'crates#1'),
  line('10-15T10:00', 'S2', 'barrels#1', 'create'),
  line('10-14T10:00', 'S3', 'crates#2', 'create'),
  line('10-13T10:00', 'p_1', 'crates#3'),
  line('10-12T10:00', 'S2', 'crates#4', 'state'),
  line('10-11T10:00', 'S1', 'barrels#2'),
  line('09-05T10:00', 'S1', 'crates#9', 'delete'),
];

const PAGE = {
  page: 'activity',
  title: 'Activity',
  /* THE PAGE'S OWN ORDER, which is not the order the log is asked in. */
  filters: [
    { field: 'list', control: 'chips' },
    { field: 'who', control: 'chips' },
    { field: 'kind', control: 'segmented' },
  ],
  blocks: [{ kind: 'feed', source: 'activity' }],
};

const KIND_WORDS: Record<string, string> = { edit: 'Changed', create: 'Created', state: 'Moved' };
const LISTS: Record<string, string> = { crates: 'Crates', barrels: 'Barrels' };

function deps(more: Partial<PageDeps> = {}): PageDeps {
  return {
    pages: () => [PAGE as never],
    metric: () => null,
    /* THE FIGURE "WHAT CHANGED" NAMES EACH KIND, and the filter says a kind in its words. */
    read: (decl) =>
      decl.metric === 'activity-by-kind'
        ? ok({ value: 0, groups: Object.entries(KIND_WORDS).map(([key, label]) => ({ key, label, value: 0, rows: 0, state: 'full' })) } as unknown as Reading)
        : no('METRIC_UNKNOWN', 'This test reads no other figure.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    listName: (id) => LISTS[id] ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    activity: (limit) => ({ events: EVENTS.slice(0, limit), seen: null }),
    runOf: (name) => RUNS[name] ?? null,
    actorName: (actor) => (actor === 'p_1' ? PERSON.name : null),
    ...more,
  };
}

type Read = { filters: PageFilter[]; blocks: { matched: number; feed?: { who: string | null; target: string | null }[] }[] };
const read = (filter?: Record<string, string>, more?: Partial<PageDeps>): Read => {
  const got = readPage(deps(more), 'activity', filter);
  assert.ok(got.ok, JSON.stringify(got));
  return got.value as unknown as Read;
};
const values = (r: Read, field: string): string[] => r.filters.find((f) => f.field === field)!.values.map((v) => `${v.label} ${v.count}`);

test('THE THREE FILTERS ARE ANSWERED FROM THE LAST 30 DAYS OF THE LOG, by name and count, in the page\'s own order', () => {
  const r = read();
  assert.deepEqual(
    r.filters.map((f) => [f.field, f.label, f.control]),
    [
      ['list', 'List', 'chips'],
      ['who', 'Who', 'chips'],
      ['kind', 'What changed', 'segmented'],
    ],
  );
  /* The delete 40 days ago by S1 on crates is in no count. */
  assert.deepEqual(values(r, 'who'), ['Claude 3', 'Gemini 2', `${PERSON.name} 1`]);
  assert.deepEqual(values(r, 'kind'), ['Changed 3', 'Created 2', 'Moved 1']);
  assert.deepEqual(values(r, 'list'), ['Crates 4', 'Barrels 2']);
  /* NEVER AN ID: no run's handle, no person's id is offered or labelled. */
  for (const f of r.filters) for (const v of f.values) assert.ok(!/^S\d+$|^p_/u.test(v.value) && !/^S\d+$|^p_/u.test(v.label), `${f.field} offered ${v.value}`);
  assert.deepEqual(r.filters.find((f) => f.field === 'who')!.reads, ['*']);
  assert.equal(r.blocks[0]!.matched, EVENTS.length);
});

test('CHOOSING ONE AGENT NARROWS THE FEED, and the other counts are that agent\'s', () => {
  const r = read({ who: 'claude' });
  const who = r.filters.find((f) => f.field === 'who')!;
  assert.equal(who.chosen, 'claude');
  /* Its own counts are still everybody's, as a strip of chips is read. */
  assert.deepEqual(values(r, 'who'), ['Claude 3', 'Gemini 2', `${PERSON.name} 1`]);
  assert.deepEqual(values(r, 'kind'), ['Changed 2', 'Created 1']);
  assert.deepEqual(values(r, 'list'), ['Crates 2', 'Barrels 1']);
  /* The feed holds Claude's lines only, the old one among them, whichever run wrote each. */
  assert.equal(r.blocks[0]!.matched, 4);
  assert.ok((r.blocks[0]!.feed ?? []).every((row) => row.who === 'S1' || row.who === 'S3'));
});

test('A CHOICE OF KIND AND LIST NARROW TOGETHER, and a person is chosen by a word of their name', () => {
  const r = read({ kind: 'create', list: 'crates' });
  assert.equal(r.blocks[0]!.matched, 1);
  const named = read({ who: PERSON.name.toLowerCase().replace(/ /gu, '-') });
  assert.equal(named.blocks[0]!.matched, 1);
});

test('A PERSON THE RECORD NAMES NOBODY FOR IS OFFERED AS PEOPLE, and a list the reader may not read is not offered', () => {
  const r = read(undefined, { actorName: () => null, ctx: { nowMs: NOW, schemaOf: () => null, reads: (id) => id !== 'barrels' } });
  assert.deepEqual(values(r, 'who'), ['Claude 3', 'Gemini 2', 'People 1']);
  assert.deepEqual(values(r, 'list'), ['Crates 4']);
});

test('A CHOICE NOBODY HOLDS IS STILL OFFERED, at nought, so it can be taken off', () => {
  const r = read({ who: 'codex' });
  assert.equal(r.blocks[0]!.matched, 0);
  const who = r.filters.find((f) => f.field === 'who')!;
  assert.deepEqual(who.values.at(-1), { value: 'codex', label: 'Codex', count: 0 });
});
