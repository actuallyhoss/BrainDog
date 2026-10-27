/**
 * The model's half of a page's look (`src/compose-look.ts`): what each page is handed in the night's headline ask, how
 * its `{ headline, order, next }` answer is checked part by part, and how Slash's look is written as a version Undo puts
 * back, never over a look the person set.
 *
 * THE DECLARATIONS ARE A STAND-IN. The kernel's `look` kind is its own, so these hold the
 * versioned store the record writes through (`install`, `retire`, `declarations`, Slash's prefs) in a few lines, the
 * way the kernel keeps one live version a declaration id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blockKeyOf,
  composeLooks,
  keepLook,
  keptBy,
  liveLook,
  lookAnswerOf,
  lookBasis,
  lookHeld,
  lookInputOf,
  lookKept,
  lookUndoKey,
  nextFault,
  orderFault,
  questionsKept,
  undoLook,
  writeLook,
  type LookBody,
} from '../src/compose-look.ts';
import { lineOf, type HeadlinePage } from '../src/headlines.ts';
import { applyLook, validateDeclaration } from '../../kernel/src/index.ts';

type Row = { id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string };

/** One live version a declaration id, as the kernel keeps them, and every install compared against the version it expects. */
function store(start: Row[] = []) {
  let rows = [...start];
  const prefs: Record<string, unknown> = {};
  const installs: { id: string; actor: string | undefined }[] = [];
  const kernel = {
    declarations: () => rows,
    async install(given: { id: string; kind: string; body: unknown }[], expect?: { id: string; version: number }, by?: { actor: string }) {
      const [d] = given;
      const live = rows.find((r) => r.id === d!.id);
      if (expect && live?.version !== expect.version) return { ok: false, conflict: { code: 'VERSION_STALE' } };
      if (live && !expect) return { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Read it again.' } };
      const version = (live?.version ?? 0) + 1;
      rows = [...rows.filter((r) => r.id !== d!.id), { id: d!.id, version, kind: d!.kind, pack_id: null, body: JSON.stringify(d!.body), checksum: String(version) }];
      installs.push({ id: d!.id, actor: by?.actor });
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
  return { kernel: kernel as never, rows: () => rows, prefs, installs };
}

const PAGE: HeadlinePage = {
  page: 'work',
  title: 'Work',
  rules: '4 open tasks, 1 waiting on you',
  figures: [
    { id: 'open-tasks', value: '4' },
    { id: 'tasks-waiting', value: '1' },
  ],
  blocks: [
    { key: 'lead', kind: 'note', lead: true },
    { key: 'late', kind: 'table', heading: 'Late' },
    { key: 'board', kind: 'board', heading: 'Board' },
    { key: 'done', kind: 'table', heading: 'Done this week' },
  ],
  rows: [
    { row: 'tasks#4', title: 'Send the Kiln quote' },
    { row: 'tasks#9', title: 'Renew domain for 2027' },
  ],
};

test('a page is handed its drawn blocks by key, the lead note first, and a few rows by handle and title', () => {
  const blocks = [
    { kind: 'table', key: 'late', heading: 'Late', source: 'register.tasks', rows: [{ register: 'tasks', seq: 4, fields: { what: 'Send the Kiln quote' } }] },
    { kind: 'note', key: 'lead', lead: true, body: '{{open-tasks}} open', rows: [] },
    { kind: 'table', key: 'held', heading: 'Held', drawn: false, rows: [] },
    { kind: 'table', key: 'broken', heading: 'Broken', refusals: [{ code: 'FIELD_UNKNOWN', fix: 'x' }], rows: [] },
    { kind: 'table', heading: 'Done', source: 'register.tasks', rows: [{ register: 'tasks', seq: 2, fields: { what: '' } }, { register: 'tasks', seq: 4, fields: { what: 'Send the Kiln quote' } }, { register: 'tasks', seq: 7, fields: { what: 'Pay EDF' } }] },
  ];
  const got = lookInputOf(blocks, (list) => (list === 'tasks' ? 'what' : null));
  assert.deepEqual(
    got.blocks.map((b) => b.key),
    ['lead', 'late', blockKeyOf(blocks[4])],
    'the lead note leads, and a block not drawn or refused is not handed',
  );
  assert.equal(got.blocks[0]!.lead, true);
  assert.deepEqual(got.rows, [
    { row: 'tasks#4', title: 'Send the Kiln quote' },
    { row: 'tasks#7', title: 'Pay EDF' },
  ]);
  /* A BLOCK THE KERNEL ANSWERED NO KEY FOR is keyed by its kind, source and heading, the same on every read. */
  assert.equal(blockKeyOf({ kind: 'table', source: 'register.tasks', heading: 'Done' }), blockKeyOf({ kind: 'table', source: 'register.tasks', heading: 'Done', rows: [1] }));
  assert.notEqual(blockKeyOf({ kind: 'table', heading: 'Done' }), blockKeyOf({ kind: 'table', heading: 'Late' }));
});

test('NO ADDRESS, LINK OR KEY GOES TO THE MODEL: a title or heading holding one is handed without it', () => {
  const blocks = [
    {
      kind: 'table',
      key: 'people',
      heading: 'Mail from ops@studio.example',
      rows: [
        { register: 'people', seq: 1, fields: { name: 'ines.duarte@orchardline.example' } },
        { register: 'people', seq: 2, fields: { name: 'Ada Lovelace' } },
        { register: 'people', seq: 3, fields: { name: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' } },
        { register: 'people', seq: 4, fields: { name: 'Notes at https://example.com/private/doc' } },
      ],
    },
  ];
  const got = lookInputOf(blocks, () => 'name');
  assert.equal(got.blocks[0]!.heading, 'Mail from someone at studio.example');
  assert.deepEqual(got.rows, [
    { row: 'people#1', title: 'someone at orchardline.example' },
    { row: 'people#2', title: 'Ada Lovelace' },
    { row: 'people#4', title: 'Notes at a link' },
  ]);
  assert.doesNotMatch(JSON.stringify(got), /@|sk-ant|https?:/u);
});

test('an order names only the keys handed, each once, and never moves anything ahead of the lead line', () => {
  assert.deepEqual(orderFault(['board', 'late'], PAGE), { order: ['board', 'late'] });
  assert.deepEqual(orderFault(['lead', 'done', 'late'], PAGE), { order: ['done', 'late'] }, 'the lead at the head is where it is anyway');
  assert.deepEqual(orderFault(['late', 'board'], PAGE), { order: null }, 'the order the page already has arranges nothing');
  assert.match((orderFault(['late', 'lead'], PAGE) as { fault: string }).fault, /ahead of its lead line/u);
  assert.match((orderFault(['board', 'ghost'], PAGE) as { fault: string }).fault, /does not have/u);
  assert.match((orderFault(['board', 'board'], PAGE) as { fault: string }).fault, /twice/u);
  assert.match((orderFault('board', PAGE) as { fault: string }).fault, /did not name the parts/u);
});

test('a next names a row the page was handed, in one plain phrase with no number or word it was not given', () => {
  assert.equal(nextFault({ row: 'tasks#4', text: 'Send the Kiln quote today' }, PAGE), null);
  assert.equal(nextFault({ row: 'tasks#9', text: 'Renew the domain before 2027' }, PAGE), null, "a number in the row's own title may be said");
  assert.match(nextFault({ row: 'tasks#12', text: 'Do the thing' }, PAGE)!, /does not show/u);
  assert.match(nextFault({ row: 'tasks#4', text: 'Send 3 quotes' }, PAGE)!, /said 3/u);
  assert.match(nextFault({ row: 'tasks#4', text: 'Clear the rows on this list' }, PAGE)!, /system's words/u);
  assert.match(nextFault({ row: 'tasks#4', text: 'Send **now**' }, PAGE)!, /plain phrase/u);
  assert.match(nextFault({ row: 'tasks#4', text: 'x'.repeat(81) }, PAGE)!, /longer than 80/u);
  assert.match(nextFault('tasks#4', PAGE)!, /not a thing to do/u);
});

test('an answer is kept part by part: a bad order costs the order, not the line or the next', () => {
  const got = lookAnswerOf({ headline: '{{tasks-waiting}} task waits on you, and the Kiln quote is the one to send.', order: ['late', 'ghost'], next: { row: 'tasks#4', text: 'Send the Kiln quote' } }, PAGE);
  assert.equal(got.headline, '{{tasks-waiting}} task waits on you, and the Kiln quote is the one to send.');
  assert.equal(got.order, undefined);
  assert.deepEqual(got.next, { row: 'tasks#4', text: 'Send the Kiln quote' });
  assert.equal(got.faults.length, 1);
  assert.match(got.faults[0]!, /keeps its order/u);
  /* A BARE LINE IS A HEADLINE AND NOTHING ELSE, as it always was. */
  assert.deepEqual(lookAnswerOf('{{open-tasks}} open, and {{tasks-waiting}} waits on you.', PAGE), { faults: [], headline: '{{open-tasks}} open, and {{tasks-waiting}} waits on you.' });
  /* A LINE SAYING A NUMBER IT WAS NOT HANDED IS NOT KEPT, AND THE ORDER STILL IS. */
  const made = lookAnswerOf({ headline: '9 tasks are late.', order: ['board', 'late'] }, PAGE);
  assert.equal(made.headline, undefined);
  assert.deepEqual(made.order, ['board', 'late']);
  /* `lineOf` READS EITHER SHAPE for the headline step. */
  assert.equal(lineOf('a line'), 'a line');
  assert.equal(lineOf({ headline: 'a line', order: [] }), 'a line');
  assert.deepEqual(lineOf(['a line']), ['a line'], 'anything else is handed on, for `headlineFault` to refuse');
});

test("Slash's look is a new version over its last one, and Undo puts the one before back", async () => {
  const s = store();
  const first: LookBody = { look: 'work', basis: 'b1', by: 'slash', order: ['board', 'late'] };
  assert.deepEqual(await writeLook(s.kernel, 'work', 'Work', first), { ok: true, value: { written: true } });
  assert.deepEqual(s.prefs[lookUndoKey('work')], { version: 1, was: null });
  /* THE SAME LOOK AGAIN IS NO NEW VERSION. */
  assert.deepEqual(await writeLook(s.kernel, 'work', 'Work', first), { ok: true, value: { written: false } });
  const second: LookBody = { look: 'work', basis: 'b2', by: 'slash', order: ['done', 'late'], next: { row: 'tasks#4', text: 'Send the Kiln quote' } };
  assert.ok((await writeLook(s.kernel, 'work', 'Work', second)).ok);
  assert.equal(liveLook(s.kernel, 'work')!.version, 2);
  assert.deepEqual(s.installs.map((i) => i.actor), ['slash', 'slash']);

  const undone = await undoLook(s.kernel, 'work', 'Work', 'p_owner');
  assert.deepEqual(undone, { ok: true, value: { restored: 'previous' } });
  assert.deepEqual(liveLook(s.kernel, 'work')!.body, first, 'the look before is back');
  assert.equal(s.prefs[lookUndoKey('work')], undefined);
  /* AND NOTHING IS LEFT TO UNDO. */
  assert.equal((await undoLook(s.kernel, 'work', 'Work', 'p_owner')).ok, false);
});

test("Undo of Slash's first look gives the page back to the rules, and a look changed since is not put back over", async () => {
  const s = store();
  assert.ok((await writeLook(s.kernel, 'work', 'Work', { look: 'work', basis: 'b1', by: 'slash', order: ['board', 'late'] })).ok);
  assert.deepEqual(await undoLook(s.kernel, 'work', 'Work', 'p_owner'), { ok: true, value: { restored: 'rules' } });
  assert.equal(liveLook(s.kernel, 'work'), null);

  assert.ok((await writeLook(s.kernel, 'work', 'Work', { look: 'work', basis: 'b1', by: 'slash', order: ['board', 'late'] })).ok);
  /* THE PERSON ARRANGES IT IN THE MEANTIME. */
  await (s.kernel as { install: (...a: unknown[]) => Promise<unknown> }).install([{ id: 'look.work', kind: 'look', body: { look: 'work', basis: 'b1', by: 'owner', pinned: ['late'] } }], { id: 'look.work', version: 1 }, { actor: 'p_owner' });
  const undone = await undoLook(s.kernel, 'work', 'Work', 'p_owner');
  assert.equal(undone.ok, false);
  assert.match((undone as { refusal: { fix: string } }).refusal.fix, /arranged again since/u);
  assert.equal(liveLook(s.kernel, 'work')!.body.by, 'owner');
});

test("keeping Slash's look says who kept that version, and a look Slash wrote since is offered again", async () => {
  const s = store();
  /* NOTHING SLASH ARRANGED IS NOTHING TO KEEP. */
  assert.equal(keepLook(s.kernel, 'work', 'Work', 'p_owner').ok, false);
  assert.ok((await writeLook(s.kernel, 'work', 'Work', { look: 'work', basis: 'b1', by: 'slash', order: ['board', 'late'] })).ok);
  assert.equal(keptBy(s.kernel, 'work'), null);
  assert.deepEqual(keepLook(s.kernel, 'work', 'Work', 'p_owner'), { ok: true, value: { kept: true } });
  assert.equal(keptBy(s.kernel, 'work'), 'p_owner');
  assert.equal(s.installs.length, 1, 'keeping writes no new version of the look');
  /* A NEW ARRANGEMENT IS NOBODY'S YET. */
  assert.ok((await writeLook(s.kernel, 'work', 'Work', { look: 'work', basis: 'b2', by: 'slash', order: ['done', 'late'] })).ok);
  assert.equal(keptBy(s.kernel, 'work'), null);

  const owner = store([{ id: 'look.work', version: 1, kind: 'look', pack_id: null, body: JSON.stringify({ basis: 'x', by: 'owner' }), checksum: 'c' }]);
  assert.equal(keepLook(owner.kernel, 'work', 'Work', 'p_owner').ok, false);
  assert.equal(keptBy(owner.kernel, 'work'), null);
});

test("an owner's look and a pack's are never written over, whatever the model answered", async () => {
  const owner = store([{ id: 'look.work', version: 3, kind: 'look', pack_id: null, body: JSON.stringify({ basis: 'x', by: 'owner', headline: 'Mine.' }), checksum: 'c' }]);
  const put = await writeLook(owner.kernel, 'work', 'Work', { look: 'work', basis: 'b', by: 'slash', order: ['board', 'late'] });
  assert.equal(put.ok, false);
  assert.match((put as { refusal: { fix: string } }).refusal.fix, /the way you set it/u);
  assert.equal(owner.installs.length, 0);

  const pack = store([{ id: 'look.work', version: 1, kind: 'look', pack_id: 'work', body: JSON.stringify({ basis: 'x', by: 'slash' }), checksum: 'c' }]);
  assert.equal((await writeLook(pack.kernel, 'work', 'Work', { look: 'work', basis: 'b', by: 'slash', order: ['board', 'late'] })).ok, false);
  /* A LOOK THE KERNEL'S RULES WROTE IS SLASH'S TO IMPROVE ON. */
  const rule = store([{ id: 'look.work', version: 1, kind: 'look', pack_id: null, body: JSON.stringify({ basis: 'x', by: 'rule', lead: 'late' }), checksum: 'c' }]);
  assert.ok((await writeLook(rule.kernel, 'work', 'Work', { look: 'work', basis: 'b', by: 'slash', order: ['board', 'late'] })).ok);
  assert.deepEqual(rule.prefs[lookUndoKey('work')], { version: 2, was: { look: 'work', basis: 'x', by: 'rule', lead: 'late' } });
});

test('the look step writes the order and next that passed from the basis asked at, and leaves a bare line and an owner alone', async () => {
  const s = store([{ id: 'look.money', version: 1, kind: 'look', pack_id: null, body: JSON.stringify({ basis: 'm', by: 'owner' }), checksum: 'c' }]);
  const money: HeadlinePage = { ...PAGE, page: 'money', title: 'Money' };
  const notes: HeadlinePage = { ...PAGE, page: 'notes', title: 'Notes' };
  const got = await composeLooks(
    s.kernel,
    [
      { page: PAGE, basis: 'b1', facts: 'f1' },
      { page: money, basis: 'b2' },
      { page: notes, basis: 'b3' },
      { page: { page: 'home', title: 'Today', rules: '', figures: [] }, basis: 'h' },
    ],
    {
      work: { headline: '4 open, and the Kiln quote is the one to send.', order: ['board', 'late'], next: { row: 'tasks#4', text: 'Send the Kiln quote' } },
      money: { headline: 'Fine.', order: ['board', 'late'] },
      notes: 'A bare line.',
      home: { headline: 'x', order: ['a'] },
    },
  );
  assert.deepEqual(got.said, ['work']);
  assert.equal(got.dropped.length, 1);
  assert.match(got.dropped[0]!, /Money is arranged the way you set it/u);
  assert.deepEqual(liveLook(s.kernel, 'work')!.body, {
    look: 'work',
    basis: lookBasis('b1', 'f1'),
    by: 'slash',
    order: ['board', 'late'],
    next: { row: 'tasks#4', text: 'Send the Kiln quote' },
  });
  assert.equal(liveLook(s.kernel, 'notes'), null);
  /* WHAT SLASH WRITES IS A LOOK THE KERNEL ITSELF READS: it names its page, and every key is one a look has. */
  const written = s.rows().find((r) => r.id === 'look.work')!;
  assert.equal(validateDeclaration({ id: written.id, kind: 'look', body: JSON.parse(written.body) } as never), null);
});

test("a page read sends Slash's next step only while its basis holds and the row is still drawn, and an owner's headline wins", async () => {
  const s = store();
  await writeLook(s.kernel, 'work', 'Work', { look: 'work', basis: lookBasis('b1', 'f1'), by: 'slash', next: { row: 'tasks#4', text: 'Send the Kiln quote' } });
  const drawn = [{ kind: 'table', rows: [{ register: 'tasks', seq: 4, fields: {} }] }];
  let asked = 0;
  const facts = (said: string | undefined) => () => {
    asked++;
    return said;
  };
  assert.deepEqual(lookHeld(s.kernel, 'work', 'b1', facts('f1'), drawn), { ownerHeadline: false, next: { row: 'tasks#4', text: 'Send the Kiln quote' } });
  assert.equal(lookHeld(s.kernel, 'work', 'b1', facts('f2'), drawn).next, null, 'the named things moved');
  assert.equal(lookHeld(s.kernel, 'work', 'b9', facts('f1'), drawn).next, null, 'the figures moved');
  assert.equal(lookHeld(s.kernel, 'work', 'b1', facts('f1'), [{ kind: 'table', rows: [] }]).next, null, 'the row is done and gone');
  assert.equal(lookHeld(s.kernel, 'work', 'b1', facts('f1'), [{ kind: 'table', drawn: false, rows: [{ register: 'tasks', seq: 4 }] }]).next, null);
  const before = asked;
  lookHeld(s.kernel, 'work', 'b9', facts('f1'), drawn);
  assert.equal(asked, before, 'what is pressing is not read when the figures already moved');

  const owner = store([{ id: 'look.work', version: 1, kind: 'look', pack_id: null, body: JSON.stringify({ basis: 'x', by: 'owner', headline: 'Mine.' }), checksum: 'c' }]);
  assert.deepEqual(lookHeld(owner.kernel, 'work', 'b1', facts('f1'), drawn), { ownerHeadline: true, next: null });
  assert.deepEqual(lookHeld(store().kernel, 'work', 'b1', facts('f1'), drawn), { ownerHeadline: false, next: null });
});

/* A page about money that also draws the questions, as its read answers it and as the ask is handed it. */
const MONEY_READ = [
  { key: 'lead', kind: 'note', lead: true, rows: [], matched: 0, refusals: [] },
  { key: 'ahead', kind: 'forecast', heading: 'Cash ahead', rows: [], matched: 0, refusals: [] },
  { key: 'asked', kind: 'queue', source: 'governance.open', heading: 'Waiting on you', rows: [], matched: 1, refusals: [] },
  { key: 'accounts', kind: 'split', heading: 'Accounts', rows: [], matched: 0, refusals: [] },
  { key: 'bills', kind: 'table', source: 'register.bills', heading: 'Bills', rows: [], matched: 0, refusals: [] },
];
const MONEY: HeadlinePage = {
  ...PAGE,
  page: 'money',
  title: 'Money',
  blocks: MONEY_READ.map((b) => ({ key: b.key, kind: b.kind, ...(b.heading ? { heading: b.heading } : {}), ...(b.lead ? { lead: true as const } : {}) })),
};

test('THE QUESTIONS KEEP THEIR PLACE ON A PAGE ABOUT SOMETHING ELSE: a look names none of them there, and any of them on Today or Decide', () => {
  assert.deepEqual([...questionsKept(MONEY, MONEY_READ)], ['asked']);
  /* WITHOUT THE READ, the blocks the ask was handed say which is a queue by its kind. */
  assert.deepEqual([...questionsKept(MONEY)], ['asked']);
  for (const page of ['home', 'home-business', 'decide']) assert.deepEqual([...questionsKept({ ...MONEY, page }, MONEY_READ)], [], page);
  /* AND A PAGE OF NOTHING BUT QUESTIONS is Decide whatever it is called. */
  assert.deepEqual([...questionsKept({ ...MONEY, page: 'asks' }, [MONEY_READ[0], MONEY_READ[2]])], []);

  /* BUT NOT ONE THAT ONLY LOOKS IT TONIGHT: a list the rules' look hid for being empty is drawn again under Slash's look,
     which hides nothing, so the page is still about that list and the kernel would not move its questions. */
  const before = [MONEY_READ[4]!, MONEY_READ[2]!, { ...MONEY_READ[2]!, key: 'later', heading: 'Asked last week' }];
  const quiet = [{ ...before[0]!, drawn: false }, before[1]!, before[2]!];
  assert.deepEqual([...questionsKept({ ...MONEY, page: 'clients' }, quiet)], ['asked', 'later']);
  const swapped = lookKept({ look: 'clients', basis: 'b', by: 'slash', order: ['later', 'asked'] }, questionsKept({ ...MONEY, page: 'clients' }, quiet), ['asked', 'later']);
  assert.equal(swapped.order, undefined);
  assert.deepEqual(applyLook(before as never, swapped as never).look.order, swapped.order);

  const kept = questionsKept(MONEY, MONEY_READ);
  const now = MONEY.blocks!.map((b) => b.key);
  const look = (more: Partial<LookBody>): LookBody => ({ look: 'money', basis: 'b', by: 'slash', ...more });
  assert.deepEqual(lookKept(look({ lead: 'asked', order: ['asked', 'bills', 'ahead'] }), kept, now), look({ order: ['bills', 'ahead'] }));
  /* WHAT IS LEFT MUST STILL MOVE SOMETHING: one key, or the order the page already has, is no order. */
  assert.deepEqual(lookKept(look({ order: ['asked', 'ahead'] }), kept, now), look({}));
  assert.deepEqual(lookKept(look({ order: ['ahead', 'asked', 'accounts'] }), kept, now), look({}));
  /* AND A LOOK THAT NEVER TOUCHED THEM is the same look. */
  const untouched = look({ lead: 'bills', order: ['bills', 'ahead'] });
  assert.equal(lookKept(untouched, kept, now), untouched);
});

test("the look step stores Slash's order without the questions on a page about something else, so the stored look is the one a read draws", async () => {
  const s = store();
  const lines = {
    money: { headline: '4 open, 1 waiting.', order: ['asked', 'bills', 'ahead'], next: { row: 'tasks#4', text: 'Send the Kiln quote' } },
    'home-business': { headline: '4 open, 1 waiting.', order: ['asked', 'bills', 'ahead'] },
    work: { headline: '4 open, 1 waiting.', order: ['asked', 'ahead'] },
  };
  const got = await composeLooks(
    s.kernel,
    [
      { page: MONEY, basis: 'b1', read: MONEY_READ },
      { page: { ...MONEY, page: 'home-business', title: 'Today' }, basis: 'b2', read: MONEY_READ },
      { page: { ...MONEY, page: 'work', title: 'Work' }, basis: 'b3', read: MONEY_READ },
    ],
    lines,
  );
  assert.deepEqual(got.said, ['money', 'home-business']);
  const stored = liveLook(s.kernel, 'money')!.body;
  assert.deepEqual(stored, { look: 'money', basis: 'b1', by: 'slash', order: ['bills', 'ahead'], next: { row: 'tasks#4', text: 'Send the Kiln quote' } });
  /* THE KERNEL LAYS IT AS IT IS STORED: nothing it names is dropped on the way to the page. */
  const laid = applyLook(MONEY_READ as never, stored as never);
  assert.deepEqual(laid.look.order, stored.order);
  assert.deepEqual(laid.blocks.map((b) => b.key), ['lead', 'bills', 'asked', 'accounts', 'ahead']);
  /* TODAY MAY LEAD WITH THEM, so its order is stored as the model answered it. */
  assert.deepEqual(liveLook(s.kernel, 'home-business')!.body.order, ['asked', 'bills', 'ahead']);
  /* AND AN ORDER THAT ONLY MOVED THE QUESTIONS writes no look at all. */
  assert.equal(liveLook(s.kernel, 'work'), null);
  assert.deepEqual(got.dropped, [
    'The order for Money moved the questions waiting on you, which keep their place on that page. The rest of the order is kept.',
    'The order for Work moved the questions waiting on you, which keep their place on that page. The page keeps its order.',
  ]);
});
