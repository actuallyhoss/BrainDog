/**
 * How the model may group a long list (`src/compose-look.ts`, `groupFault`), and the look that carries it.
 *
 * THE RULES GROUP BY A LIST'S STATE (the kernel's `composeLook`). A model may name a better field, and it is checked
 * against the page as its read answered it and the list as it is declared: a choice, a link or the state, with two to
 * eight values among the things shown. One bad name and nothing is grouped.
 *
 * THE DECLARATIONS ARE A STAND-IN, as in `compose-look.test.ts`: one live version a declaration id, and Slash's prefs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as mine from '../src/compose-look.ts';
import { GROUP_KINDS, composeLooks, groupChoices, groupFault, groupListsOf, liveLook, lookAnswerOf, lookBodyOf, lookInputOf, undoLook, type GroupLists } from '../src/compose-look.ts';
import type { HeadlinePage } from '../src/headlines.ts';
import { applyLook, lookOf, validateDeclaration } from '../../kernel/src/index.ts';
import { GROUPED_BY_FIELD, GROUP_VALUES_LEAST, GROUP_VALUES_MOST, LOOK_GROUPS_MOST } from '../../kernel/src/compose.ts';

type Row = { id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string };

const TASKS = {
  register: 'tasks',
  title: 'what',
  state: 'stage',
  fields: [
    { id: 'what', type: 'text' },
    { id: 'stage', type: 'enum', values: ['open', 'doing', 'done'] },
    { id: 'kind', type: 'enum', values: ['bill', 'licence', 'cover'] },
    { id: 'project', type: 'ref', to: 'projects' },
    { id: 'notes', type: 'text' },
    { id: 'due', type: 'day' },
    { id: 'old', type: 'enum', values: ['a', 'b'], retired: true },
  ],
};

const decl = (id: string, kind: string, body: unknown): Row => ({ id, version: 1, kind, pack_id: null, body: JSON.stringify(body), checksum: '1' });

function store(start: Row[] = [decl('register.tasks', 'register', TASKS)]) {
  let rows = [...start];
  const prefs: Record<string, unknown> = {};
  const kernel = {
    declarations: () => rows,
    async install(given: { id: string; kind: string; body: unknown }[], expect?: { id: string; version: number }) {
      const [d] = given;
      const live = rows.find((r) => r.id === d!.id);
      if (expect && live?.version !== expect.version) return { ok: false, conflict: { code: 'VERSION_STALE' } };
      if (live && !expect) return { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Read it again.' } };
      const version = (live?.version ?? 0) + 1;
      rows = [...rows.filter((r) => r.id !== d!.id), { id: d!.id, version, kind: d!.kind, pack_id: null, body: JSON.stringify(d!.body), checksum: String(version) }];
      return { ok: true, value: [{ id: d!.id, version, changed: true }] };
    },
    retire(ids: string[]) {
      rows = rows.filter((r) => !ids.includes(r.id));
      return { ok: true, value: ids };
    },
    prefsOf: () => ({ ...prefs }),
    setPref: (_: string, key: string, value: unknown) => {
      if (value === null) delete prefs[key];
      else prefs[key] = value;
    },
  };
  return { kernel: kernel as never, rows: () => rows, prefs };
}

const PAGE: HeadlinePage = {
  page: 'renewals',
  title: 'Renewals',
  rules: '35 to renew',
  figures: [{ id: 'renewals', value: '35' }],
  blocks: [
    { key: 'lead', kind: 'note', lead: true },
    { key: 'all', kind: 'cards', heading: 'Everything' },
    { key: 'soon', kind: 'table', heading: 'Soon' },
    { key: 'own', kind: 'cards', heading: 'By project' },
    { key: 'dates', kind: 'cards', heading: 'Dates' },
  ],
  rows: [{ row: 'tasks#1', title: 'Thing 1' }],
};

const KINDS = ['bill', 'licence', 'cover'];
const thing = (seq: number, more: Record<string, unknown> = {}) => ({
  register: 'tasks',
  seq,
  fields: { what: `Thing ${seq}`, stage: ['open', 'doing', 'done'][seq % 3], kind: KINDS[seq % 3], project: `01KPROJECT${seq % 4}`, notes: `Note ${seq}`, due: '2026-11-01', ...more },
});
const things = (n: number, more: (seq: number) => Record<string, unknown> = () => ({})) => Array.from({ length: n }, (_, i) => thing(i + 1, more(i + 1)));

/** The page as its read answered it: 35 things as cards, the same as a table, cards that name their own group, and cards over no list. */
const read = (rows: unknown[] = things(35)): unknown[] => [
  { key: 'lead', kind: 'note', lead: true, rows: [], refusals: [] },
  { key: 'all', kind: 'cards', source: 'register.tasks', heading: 'Everything', rows, matched: rows.length, refusals: [] },
  { key: 'soon', kind: 'table', source: 'register.tasks', heading: 'Soon', rows, matched: rows.length, refusals: [] },
  { key: 'own', kind: 'cards', source: 'register.tasks', heading: 'By project', group: 'project', rows, matched: rows.length, refusals: [] },
  { key: 'dates', kind: 'cards', source: 'deadlines', heading: 'Dates', rows: [], matched: 0, refusals: [] },
];

const LISTS: GroupLists = groupListsOf(store().kernel);
const fault = (raw: unknown, blocks: readonly unknown[] | null = read(), lists: GroupLists | null = LISTS): string => {
  const got = groupFault(raw, PAGE, blocks ?? undefined, lists ?? undefined);
  assert.ok('fault' in got, `expected a fault, got ${JSON.stringify(got)}`);
  return got.fault;
};

test('the kinds a look may group are the ones the kernel draws in groups by a field of their list', () => {
  assert.deepEqual([...GROUP_KINDS].sort(), [...GROUPED_BY_FIELD].sort());
  assert.deepEqual([mine.GROUPS_MOST, mine.GROUP_VALUES_LEAST, mine.GROUP_VALUES_MOST], [LOOK_GROUPS_MOST, GROUP_VALUES_LEAST, GROUP_VALUES_MOST]);
});

test('a list says its state and its fields from its own declaration, and one never declared says nothing', () => {
  assert.equal(LISTS('tasks')?.state, 'stage');
  assert.deepEqual(LISTS('tasks')?.fields.map((f) => f.id), ['what', 'stage', 'kind', 'project', 'notes', 'due'], 'a retired field is no field of the list');
  assert.equal(LISTS('ghosts'), null);
  assert.equal(groupListsOf(store([decl('register.bare', 'register', { register: 'bare', fields: [{ id: 'what', type: 'text' }] })]).kernel)('bare')?.state, null);
  assert.equal(groupListsOf(store([{ ...decl('register.torn', 'register', {}), body: '{' }]).kernel)('torn'), null);
});

test('a choice, a link and the state are each accepted, with two to eight values among the things shown', () => {
  assert.deepEqual(groupFault({ all: 'kind' }, PAGE, read(), LISTS), { group: { all: 'kind' } });
  assert.deepEqual(groupFault({ all: 'project' }, PAGE, read(), LISTS), { group: { all: 'project' } });
  assert.deepEqual(groupFault({ all: 'stage' }, PAGE, read(), LISTS), { group: { all: 'stage' } });
  const eight = things(35, (seq) => ({ kind: `k${seq % 8}` }));
  assert.deepEqual(groupFault({ all: 'kind' }, PAGE, read(eight), LISTS), { group: { all: 'kind' } });
  const two = things(35, (seq) => ({ kind: seq % 2 ? 'bill' : 'cover' }));
  assert.deepEqual(groupFault({ all: 'kind' }, PAGE, read(two), LISTS), { group: { all: 'kind' } });
  /* A SHORT LIST MAY BE GROUPED BY A MODEL THAT SEES A REASON TO: thirteen is the rules' own line. */
  assert.deepEqual(groupFault({ all: 'kind' }, PAGE, read(things(5)), LISTS), { group: { all: 'kind' } });
  /* NOTHING NAMED groups nothing and is no fault. */
  assert.deepEqual(groupFault({}, PAGE, read(), LISTS), { group: null });
});

test('each refusal is one sentence that names the page', () => {
  const said = {
    'a part the page does not have': fault({ ghost: 'kind' }),
    'a kind that draws no groups': fault({ soon: 'kind' }),
    'a field the list does not have': fault({ all: 'colour' }),
    'a retired field': fault({ all: 'old' }),
    'words': fault({ all: 'notes' }),
    'a day': fault({ all: 'due' }),
    'one value': fault({ all: 'kind' }, read(things(35, () => ({ kind: 'bill' })))),
    'nine values': fault({ all: 'kind' }, read(things(35, (seq) => ({ kind: `k${seq % 9}` })))),
    'not a map': fault(['all', 'kind']),
    'not text': fault({ all: 7 }),
    'over no list': fault({ dates: 'day' }),
    'more than a look holds': fault(Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`part-${i}`, 'kind']))),
    'no read': fault({ all: 'kind' }, null),
    'no lists': fault({ all: 'kind' }, read(), null),
  };
  assert.match(said['a part the page does not have'], /a part the page does not have/u);
  assert.match(said['a kind that draws no groups'], /not drawn in groups/u);
  assert.match(said['a field the list does not have'], /does not have/u);
  assert.equal(said['a retired field'], said['a field the list does not have']);
  assert.match(said.words, /not a choice, a link or the state/u);
  assert.equal(said['a day'], said.words);
  assert.match(said['one value'], /one heading/u);
  assert.match(said['nine values'], /more than 8/u);
  assert.match(said['not a map'], /did not say/u);
  assert.equal(said['not text'], said['not a map']);
  assert.match(said['over no list'], /not drawn in groups/u);
  assert.match(said['more than a look holds'], /more than 12/u);
  assert.match(said['no read'], /could not be checked/u);
  assert.equal(said['no lists'], said['no read']);
  for (const [why, f] of Object.entries(said)) {
    assert.match(f, /^How to group Renewals [^.]+\.$/u, why);
    assert.doesNotMatch(f, /—|#|register|\bid\b/u, why);
  }
});

test('one bad name and nothing is grouped, and a part that names its own group is passed over without a word', () => {
  assert.match(fault({ all: 'kind', soon: 'kind' }), /not drawn in groups/u);
  assert.deepEqual(groupFault({ own: 'kind' }, PAGE, read(), LISTS), { group: null }, 'what the page says of itself stands, and the model was never told');
  assert.deepEqual(groupFault({ own: 'kind', all: 'stage' }, PAGE, read(), LISTS), { group: { all: 'stage' } });
  /* A PART THAT COULD NOT BE DRAWN shows nothing to group. */
  const broken = read().map((b) => ((b as { key: string }).key === 'all' ? { ...(b as object), refusals: [{ code: 'FIELD_UNKNOWN', fix: 'x' }] } : b));
  assert.match(fault({ all: 'kind' }, broken), /could not be drawn/u);
});

test('lookAnswerOf carries group when it is clean, and a fault when it is not', () => {
  const at = { read: read(), lists: LISTS };
  const clean = lookAnswerOf({ headline: '{{renewals}} to renew.', group: { all: 'kind' } }, PAGE, at);
  assert.deepEqual(clean.group, { all: 'kind' });
  assert.deepEqual(clean.faults, []);
  const bad = lookAnswerOf({ headline: '{{renewals}} to renew.', group: { all: 'notes' }, order: ['soon', 'all'] }, PAGE, at);
  assert.equal(bad.group, undefined);
  assert.deepEqual(bad.order, ['soon', 'all'], 'a bad grouping costs the grouping and nothing else');
  assert.equal(bad.faults.length, 1);
  assert.match(bad.faults[0]!, /^How to group Renewals [^.]+\. The page keeps its lists as they are\.$/u);
  /* NONE ASKED FOR, none carried and none refused. */
  assert.equal(lookAnswerOf({ headline: 'x', group: null }, PAGE, at).group, undefined);
  assert.deepEqual(lookAnswerOf({ headline: 'x', group: null }, PAGE, at).faults, []);
  assert.equal(lookAnswerOf('35 to renew.', PAGE, at).group, undefined);
});

test('what a part may be grouped by is said from the list and the things shown, for whoever asks the model', () => {
  assert.deepEqual(groupChoices(read(), LISTS), { all: ['stage', 'kind', 'project'] });
  assert.deepEqual(groupChoices(read(things(35, () => ({ kind: 'bill', project: null }))), LISTS), { all: ['stage'] });
  assert.deepEqual(groupChoices(read(things(35, () => ({ kind: 'bill', project: null, stage: 'open' }))), LISTS), {});
  /* AND THE MODEL IS HANDED THEM ON THE PART, and on no other; with no lists handed, nothing is said. */
  const handed = lookInputOf(read(), () => null, LISTS).blocks;
  assert.deepEqual(handed.find((b) => b.key === 'all')?.group, ['stage', 'kind', 'project']);
  assert.deepEqual(handed.filter((b) => b.group !== undefined).map((b) => b.key), ['all']);
  assert.ok(lookInputOf(read(), () => null).blocks.every((b) => b.group === undefined));
});

test('a grouping alone is a look Slash writes, the kernel installs and lays, and Undo puts back', async () => {
  const s = store();
  const due = [{ page: PAGE, basis: 'b1', read: read() }];
  const out = await composeLooks(s.kernel, due, { renewals: { headline: '{{renewals}} to renew.', group: { all: 'kind' } } });
  assert.deepEqual(out, { said: ['renewals'], dropped: [] });
  const live = liveLook(s.kernel, 'renewals')!;
  assert.deepEqual(live.body, { look: 'renewals', basis: 'b1', by: 'slash', group: { all: 'kind' } });
  /* THE KERNEL TAKES IT: the declaration installs, a read reads the map, and the cards say their group. */
  assert.equal(validateDeclaration({ id: 'look.renewals', kind: 'look', body: live.body } as never), null);
  const laid = applyLook(read() as never, lookOf(live.body)!);
  assert.equal(laid.blocks.find((b) => b.key === 'all')!.group, 'kind');
  assert.equal(laid.blocks.find((b) => b.key === 'soon')!.group, undefined);
  /* THE SAME ANSWER AGAIN writes no second version, and a different field does. */
  assert.deepEqual((await composeLooks(s.kernel, due, { renewals: { group: { all: 'kind' } } })).said, []);
  assert.deepEqual((await composeLooks(s.kernel, due, { renewals: { group: { all: 'project' } } })).said, ['renewals']);
  assert.deepEqual(liveLook(s.kernel, 'renewals')!.body.group, { all: 'project' });
  /* UNDO PUTS BACK THE ONE BEFORE, its grouping with it. */
  assert.equal((await undoLook(s.kernel, 'renewals', 'Renewals', 'owner')).ok, true);
  assert.deepEqual(liveLook(s.kernel, 'renewals')!.body.group, { all: 'kind' });
});

test('a grouping that fails is said in the log and writes nothing, and a stored look these rules read keeps its map', async () => {
  const s = store();
  const out = await composeLooks(s.kernel, [{ page: PAGE, basis: 'b1', read: read() }], { renewals: { group: { all: 'notes' } } });
  assert.deepEqual(out.said, []);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0]!, /^How to group Renewals /u);
  assert.equal(liveLook(s.kernel, 'renewals'), null);
  assert.deepEqual(lookBodyOf({ basis: 'x', by: 'slash', group: { all: 'kind' } }, 'renewals')?.group, { all: 'kind' });
  assert.equal(lookBodyOf({ basis: 'x', by: 'slash', group: { all: 7 } }, 'renewals')?.group, undefined);
  assert.equal(lookBodyOf({ basis: 'x', by: 'slash', group: ['all'] }, 'renewals')?.group, undefined);
});
