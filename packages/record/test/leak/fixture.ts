/**
 * The leak matrix's record (sharing plan §4.1) and its grant shapes as they can be built today (§4.2, Slice 2).
 *
 * ONE RECORD, EVERY SHAPE ON IT. Lists `things` (projects), `tasks` (on a project, a stage, a money `rate`, notes and
 * an assignee), `money`, `people`, `credentials` and `notes`; a Kiln page and a Money page with a count and a sum;
 * comments and questions about rows inside and outside each grant, one of them decided; Sam's private rows; rows moved
 * into and out of Kiln; and an inbox arrival. Every row carries its own canary (`canary.ts`), and every shape says in
 * plain code which rows it may see (`sees`), so what the record answers is held to a truth the record did not compute.
 *
 * THE SHAPES ARE TODAY'S GRANTS: `member` rows with a level, per-list levels (`levels`), a ceiling (`registers`) and a
 * row rule (`row_where`, `wheres`), each made through `invite` and read back through `kernel.access` into the context a
 * host builds (`sessionContext` for a person; `bearerOf`'s shape for a token). The five templates of
 * `kernel/src/share-templates.ts` are emulated by those rows until Slice 5 wires shares (`templateRows`), and each shape
 * runs as the person, their write-scope token and their read-scope token. The shapes with `shares` are made through the
 * share API (Slice 7) on guests, and run as the owner seeing as them too (`seeAs`).
 *
 * HIDDEN FIELDS (Slice 6) ARE CANARIES ON ROWS IN SIGHT. A task's notes carry a `zh` word beside its own, and its rate
 * and a payment's amount are primes; a shape that hides a field (`hides`) must never be answered what the field holds
 * on any row it sees (`held`, read by `out`).
 */

import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../../src/index.ts';
import { seeAs, sessionContext, type HeldAccess } from '../../../host/src/auth.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../../kernel/test/sqlite.ts';
import { minter, mulberry32, primes, type Canary } from './canary.ts';

export const NOW = Date.UTC(2026, 9, 20, 12);
export const OWNER = 'p_ada';
export const SAM = 'p_sam';

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Level = 'read' | 'append' | 'write' | 'decide' | 'owner';

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });
const metric = (body: Record<string, unknown>) => ({ id: `metric.${body.metric as string}`, kind: 'metric' as const, body: body as never });

const text = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'text', search: true, ...extra });

/** The lists, each with the fields §4.1 names. */
export const LISTS = [
  register({ id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [text('name', { required: true }), text('notes'), { id: 'repos', type: 'list', of: 'text' }] }),
  register({
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
    fields: [text('name', { required: true }), { id: 'email', type: 'email', index: true }, { id: 'met', type: 'list', of: 'text' }, { id: 'merged_into', type: 'ref', to: 'people' }],
  }),
  register({
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    seq_prefix: 'TK',
    state: 'stage',
    fields: [
      text('name', { required: true }),
      { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true, scope: {} },
      { id: 'stage', type: 'enum', values: ['todo', 'review', 'done'], labels: { todo: 'To do', review: 'Review', done: 'Done' }, default: 'todo', index: true },
      { id: 'rate', label: 'Rate', type: 'money' },
      text('notes'),
      { id: 'assignee', type: 'ref', to: 'people' },
    ],
  }),
  register({
    id: 'money',
    name: 'Money',
    title: 'payee',
    seq_prefix: 'MO',
    fields: [text('payee', { required: true }), { id: 'amount', type: 'money' }, { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true, scope: {} }, text('notes')],
  }),
  register({ id: 'credentials', name: 'Keys', title: 'label', fields: [text('label', { required: true }), text('opens', { required: true })] }),
  register({ id: 'notes', name: 'Notes', title: 'what', fields: [text('what', { required: true }), { id: 'thing', type: 'ref', to: 'things', scope: {} }] }),
];

export const METRICS = [
  metric({ metric: 'tasks-count', name: 'Tasks', source: 'register.tasks', value: { count: 'name' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' }),
  metric({ metric: 'tasks-rate', name: 'Rates', source: 'register.tasks', value: { sum: 'rate' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' }),
  metric({ metric: 'money-sum', name: 'Spent', source: 'register.money', value: { sum: 'amount' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' }),
];

export const PAGES = [
  {
    page: 'kiln',
    title: 'Kiln',
    requires: ['register.tasks', 'register.things'],
    filters: [{ field: 'stage', control: 'segmented' }],
    blocks: [
      { kind: 'table', key: 'tasks', heading: 'Tasks', source: 'register.tasks', columns: [{ field: 'name' }, { field: 'rate' }, { field: 'notes' }] },
      { kind: 'stat', key: 'figures', cells: [{ metric: 'tasks-count' }, { metric: 'tasks-rate' }] },
      { kind: 'table', key: 'projects', heading: 'Projects', source: 'register.things', columns: [{ field: 'name' }] },
    ],
  },
  {
    page: 'spend',
    title: 'Money',
    requires: ['register.money'],
    blocks: [
      { kind: 'table', key: 'money', heading: 'Money', source: 'register.money', columns: [{ field: 'payee' }, { field: 'amount' }] },
      { kind: 'stat', key: 'spent', cells: [{ metric: 'money-sum' }] },
    ],
  },
];

/** One row of the fixture, as the truth beside the record: which list, which project, which stage, whose private row. */
export type RowInfo = {
  key: string;
  list: string;
  id: string;
  seq: number;
  thing: 'kiln' | 'loom' | null;
  stage?: 'todo' | 'review' | 'done';
  privateBy?: string;
  deleted?: boolean;
  /** Row ids this row's own fields hold (its project, its assignee): a reader of the row reads those ids with it. */
  refs: string[];
  canary: Canary;
  /** What each field a share may hide holds on this row: a task's notes (its `zh` word) and rate, a payment's amount. */
  held: { field: string; word?: string; amount?: number }[];
};

/** Something an answer can carry that is not a row: an inbox arrival, said by who may read it. */
export type Extra = { canary: Canary; sees: (caller: Caller) => boolean };

export type Shape = {
  id: string;
  name: string;
  /** The share template this emulates (`kernel/src/share-templates.ts`), when it is one. */
  template?: string;
  person: string;
  /** The `invite` that makes the grant, or nothing for the owner. */
  invite?: { level?: Level; registers?: Record<string, Level>; wheres?: (f: Built) => Record<string, unknown> };
  /** Which rows this grant may see, in plain code. Private rows are left to `visible`. */
  sees: (r: RowInfo, f: Built) => boolean;
  /** Whether this shape is narrowed by a row rule, which is where today's gaps are. */
  narrowed?: boolean;
  /**
   * The shares that make the grant, through the share API as the owner makes them (Slice 7), each lasting 30 days. The
   * person is a guest with no member row. `ended` is a share that has run out by the time the matrix asks.
   */
  shares?: (f: Built) => (Record<string, unknown> & { ended?: true })[];
  /** The shares go to a group the person is in, not to the person. */
  group?: true;
  /** The fields its shares hide, by list, in plain words (sharing plan §2.7): what it must never be answered on a row it sees. */
  hides?: Record<string, string[]>;
};

export type Variant = 'person' | 'write-token' | 'read-token' | 'see-as';
export type Caller = { shape: Shape; variant: Variant; ctx: CallContext; label: string };

type Built = { ids: { kiln: string; loom: string; one: string }; seqs: Record<string, number> };

export const SHAPES: readonly Shape[] = [
  { id: 'owner', name: 'Owner (non-interference control)', person: OWNER, sees: () => true },
  { id: 'whole', name: 'Whole-record view', person: 'p_vera', invite: { level: 'read' }, sees: () => true },
  {
    id: 'assistant',
    name: 'Assistant',
    template: 'assistant',
    person: 'p_ann',
    invite: { registers: { things: 'write', people: 'write', notes: 'write' } },
    sees: (r) => ['things', 'people', 'notes'].includes(r.list),
  },
  { id: 'accountant', name: 'Accountant', template: 'accountant', person: 'p_cal', invite: { registers: { tasks: 'read', money: 'read' } }, sees: (r) => ['tasks', 'money'].includes(r.list) },
  {
    id: 'contractor',
    name: 'Contractor on Kiln (a legacy row_where member row)',
    template: 'contractor',
    person: 'p_con',
    invite: { registers: { tasks: 'write' }, wheres: (f) => ({ tasks: { field: 'thing', is: f.ids.kiln } }) },
    sees: (r) => r.list === 'tasks' && r.thing === 'kiln',
    narrowed: true,
  },
  {
    id: 'kiln-reader',
    name: 'Reads the record, and only Kiln of the tasks',
    person: 'p_kim',
    invite: { level: 'read', registers: { tasks: 'read' }, wheres: (f) => ({ tasks: { field: 'thing', is: f.ids.kiln } }) },
    sees: (r) => r.list !== 'tasks' || r.thing === 'kiln',
    narrowed: true,
  },
  {
    id: 'condition',
    name: 'Condition (tasks where stage = Review)',
    template: 'reviewer',
    person: 'p_rev',
    invite: { registers: { tasks: 'read' }, wheres: () => ({ tasks: { field: 'stage', is: 'review' } }) },
    sees: (r) => r.list === 'tasks' && r.stage === 'review',
    narrowed: true,
  },
  {
    id: 'one-row',
    name: 'A single row',
    template: 'one-row',
    person: 'p_one',
    invite: { registers: { tasks: 'read' }, wheres: (f) => ({ tasks: { field: 'seq', is: f.seqs.one } }) },
    sees: (r, f) => r.list === 'tasks' && r.seq === f.seqs.one,
    narrowed: true,
  },
  { id: 'adds', name: 'Adds only on money', person: 'p_add', invite: { registers: { money: 'append' } }, sees: () => false },
  { id: 'maker', name: 'Sam, who keeps rows private', person: SAM, invite: { level: 'write' }, sees: () => true },

  /* THE SAME GRANTS AS SHARES (Slice 7), on guests with no member row. A whole-record share leaves out the lists only
     named shares reach: Keys and the people `meet` writes (sharing plan §2.3). */
  { id: 'sh-whole', name: 'Whole-record view, shared', person: 'p_wsh', shares: () => [{ what: { record: true }, can: 'view' }], sees: (r) => r.list !== 'people' },
  {
    id: 'sh-accountant',
    name: 'Accountant, shared',
    person: 'p_acs',
    shares: () => [
      { what: { lists: { has: 'money' } }, can: 'view' },
      { effect: 'deny', what: { lists: { role: 'keys' } }, can: 'view' },
    ],
    sees: (r) => r.list === 'tasks' || r.list === 'money',
  },
  {
    id: 'sh-contractor',
    name: 'Contractor on Kiln, shared',
    person: 'p_cos',
    shares: (f) => [{ what: { project: f.ids.kiln, lists: ['tasks'] }, can: 'edit', caps: { delete: false } }],
    sees: (r) => (r.list === 'tasks' && r.thing === 'kiln') || r.key === 'kiln',
    narrowed: true,
  },
  {
    id: 'sh-condition',
    name: 'Condition (tasks where stage = Review), shared',
    person: 'p_rvs',
    shares: () => [{ what: { list: 'tasks', where: { field: 'stage', is: 'review' } }, can: 'view' }],
    sees: (r) => r.list === 'tasks' && r.stage === 'review',
    narrowed: true,
  },
  {
    id: 'sh-one-row',
    name: 'A single row, shared',
    person: 'p_ors',
    shares: (f) => [{ what: { list: 'tasks', rows: [f.ids.one] }, can: 'view' }],
    sees: (r, f) => r.list === 'tasks' && r.seq === f.seqs.one,
    narrowed: true,
  },
  {
    id: 'deny',
    name: 'A deny on a row inside an allow',
    person: 'p_dny',
    shares: (f) => [
      { what: { lists: ['tasks'] }, can: 'view' },
      { effect: 'deny', what: { list: 'tasks', rows: [f.ids.one] }, can: 'view' },
    ],
    sees: (r, f) => r.list === 'tasks' && r.seq !== f.seqs.one,
    narrowed: true,
  },
  {
    id: 'expired',
    name: 'Expired, beside a share still live',
    person: 'p_exp',
    shares: () => [
      { what: { lists: ['notes'] }, can: 'view' },
      { what: { record: true }, can: 'view', ended: true },
    ],
    sees: (r) => r.list === 'notes',
  },
  { id: 'group', name: "A group's share", person: 'p_grp', group: true, shares: () => [{ what: { lists: ['money'] }, can: 'view' }], sees: (r) => r.list === 'money' },
  /* HIDDEN FIELDS (Slice 6): the rate and the notes of every task, and every amount ("Hide amounts"). */
  {
    id: 'hidden-field',
    name: 'Hidden fields (rate and notes on tasks)',
    person: 'p_hid',
    shares: () => [{ what: { lists: ['tasks'] }, can: 'view', hide: { tasks: ['rate', 'notes'] } }],
    sees: (r) => r.list === 'tasks',
    hides: { tasks: ['rate', 'notes'] },
  },
  {
    id: 'hide-amounts',
    name: 'Accountant who is not shown amounts',
    person: 'p_ham',
    shares: () => [{ what: { lists: { has: 'money' } }, can: 'view', hide: { types: ['money'] } }],
    sees: (r) => r.list === 'tasks' || r.list === 'money',
    hides: { tasks: ['rate'], money: ['amount'] },
  },
  {
    id: 'comment',
    name: 'Comment on Kiln',
    person: 'p_cmt',
    shares: (f) => [{ what: { project: f.ids.kiln }, can: 'comment' }],
    sees: (r) => r.key === 'kiln' || (['tasks', 'money', 'notes'].includes(r.list) && r.thing === 'kiln'),
    narrowed: true,
  },
];

export const VARIANTS: readonly Variant[] = ['person', 'write-token', 'read-token', 'see-as'];

/** The variants one shape runs as: See as only where somebody can be seen as, a grantee of shares. */
export const variantsOf = (shape: Shape): readonly Variant[] => (shape.shares ? VARIANTS : VARIANTS.filter((v) => v !== 'see-as'));

export type Fixture = Awaited<ReturnType<typeof build>>;

const okValue = <T>(r: unknown, what: string): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, `${what}: ${x.refusal?.code} ${x.refusal?.fix}`);
  return x.value as T;
};

/**
 * Build the record. `seed` picks the words and the order of nothing else, so two builds are the same record with
 * different ids. `file` keeps it on disk, as a `.brain` the drill (`tools/drill/leak-on-copy.mjs`) can open a copy of.
 */
export async function build(options: { seed?: number; shapes?: readonly Shape[]; file?: string } = {}) {
  const sql: NodeSql = openSqlite(options.file);
  const clock = fixedClock(NOW);
  const api: Api = await createRecordApi({ sql, clock, invitations: () => null });
  const mint = minter(options.seed ?? 0x5eed);
  const prime = primes();
  const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true };

  okValue(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: OWNER, email: 'ada@example.com' } }), 'createRecord');
  okValue(await api.kernel.install([...LISTS, ...METRICS]), 'install');

  const rows = new Map<string, RowInfo>();
  const shapes = options.shapes ?? SHAPES;

  /** Who made a row, as a context: the owner, or Sam for his own. */
  const sam = (): CallContext => personCtx(api, SAM);

  const add = async (
    key: string,
    list: string,
    fields: (word: string) => Record<string, unknown>,
    info: { thing?: 'kiln' | 'loom' | null; stage?: 'todo' | 'review' | 'done'; privateBy?: string; amount?: boolean } = {},
  ): Promise<RowInfo> => {
    const word = mint.word(info.privateBy ? 'zp' : 'zq');
    const amount = info.amount ? prime() : undefined;
    const thingId = info.thing ? rows.get(info.thing)?.id : undefined;
    const said = fields(word);
    /* A TASK'S NOTES CARRY A HIDDEN-FIELD CANARY BESIDE ITS WORD, read by a shape that hides notes. */
    const hidden = list === 'tasks' && typeof said.notes === 'string' ? mint.word('zh') : undefined;
    if (hidden !== undefined) said.notes = `${String(said.notes)} ${hidden}`;
    const body = {
      ...said,
      ...(info.thing && thingId ? { thing: thingId } : {}),
      ...(info.stage ? { stage: info.stage } : {}),
      ...(amount !== undefined ? { [list === 'money' ? 'amount' : 'rate']: { amount, currency: 'GBP' } } : {}),
    };
    const by = info.privateBy === SAM ? sam() : owner;
    const made = okValue<Entry>(await api.create({ register: list, fields: body as never }, by), `create ${key}`);
    if (info.privateBy) okValue(await api.makePrivate({ ref: `${list}#${made.seq}` }, by), `makePrivate ${key}`);
    const refs = Object.values(body).filter((v): v is string => typeof v === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/u.test(v));
    const row: RowInfo = {
      key,
      list,
      id: made.id,
      seq: made.seq!,
      thing: info.thing ?? null,
      ...(info.stage ? { stage: info.stage } : {}),
      ...(info.privateBy ? { privateBy: info.privateBy } : {}),
      refs,
      canary: { label: `${list}#${made.seq} (${key})`, word, id: made.id, ...(amount === undefined ? {} : { amount }) },
      held: [
        ...(hidden === undefined ? [] : [{ field: 'notes', word: hidden }]),
        ...(amount === undefined ? [] : [{ field: list === 'money' ? 'amount' : 'rate', amount }]),
      ],
    };
    rows.set(key, row);
    return row;
  };

  /* THE PEOPLE ON THE RECORD: Sam, who writes across it and keeps rows private, and one person per shape. */
  okValue(await api.invite({ person: SAM, name: 'Sam Reyes', level: 'write' }, owner), 'invite Sam');

  /* THE ROWS. */
  await add('kiln', 'things', (w) => ({ name: `Kiln ${w}`, notes: `The kiln project ${w}` }));
  await add('loom', 'things', (w) => ({ name: `Loom ${w}`, notes: `The loom project ${w}` }));
  await add('priya', 'people', (w) => ({ name: `Priya ${w}`, email: 'priya@example.com' }));
  await add('omar', 'people', (w) => ({ name: `Omar ${w}`, email: 'omar@example.com' }));
  const priya = rows.get('priya')!.id;
  const one = await add('t-kiln-todo', 'tasks', (w) => ({ name: `Glaze the bowls ${w}`, notes: `kiln todo ${w}`, assignee: priya }), { thing: 'kiln', stage: 'todo', amount: true });
  await add('t-kiln-review', 'tasks', (w) => ({ name: `Check the firing ${w}`, notes: `kiln review ${w}` }), { thing: 'kiln', stage: 'review', amount: true });
  await add('t-loom-review', 'tasks', (w) => ({ name: `Warp the loom ${w}`, notes: `loom review ${w}` }), { thing: 'loom', stage: 'review', amount: true });
  await add('t-loom-todo', 'tasks', (w) => ({ name: `Buy the yarn ${w}`, notes: `loom todo ${w}` }), { thing: 'loom', stage: 'todo', amount: true });
  await add('t-into-kiln', 'tasks', (w) => ({ name: `Move the shelves ${w}`, notes: `moved into kiln ${w}` }), { thing: 'loom', stage: 'todo', amount: true });
  await add('t-out-of-kiln', 'tasks', (w) => ({ name: `Sweep the floor ${w}`, notes: `moved out of kiln ${w}` }), { thing: 'kiln', stage: 'done', amount: true });
  await add('t-sam-kiln', 'tasks', (w) => ({ name: `Sam's kiln secret ${w}`, notes: `private ${w}` }), { thing: 'kiln', stage: 'review', amount: true, privateBy: SAM });
  await add('m-kiln', 'money', (w) => ({ payee: `Clay supplier ${w}`, notes: `kiln spend ${w}` }), { thing: 'kiln', amount: true });
  await add('m-loom', 'money', (w) => ({ payee: `Yarn shop ${w}`, notes: `loom spend ${w}` }), { thing: 'loom', amount: true });
  await add('m-sam', 'money', (w) => ({ payee: `Sam's own spend ${w}`, notes: `private ${w}` }), { amount: true, privateBy: SAM });
  await add('key', 'credentials', (w) => ({ label: `Kiln deploy key ${w}`, opens: `the kiln controller ${w}` }));
  await add('n-open', 'notes', (w) => ({ what: `A note on the loom ${w}` }), { thing: 'loom' });
  await add('n-sam', 'notes', (w) => ({ what: `Sam's private note ${w}` }), { privateBy: SAM });

  /* EDITS THAT MOVE ROWS INTO AND OUT OF KILN. */
  const move = async (key: string, to: 'kiln' | 'loom') => {
    const row = rows.get(key)!;
    okValue(await api.update({ register: row.list, seq: row.seq, patch: { thing: rows.get(to)!.id } as never }, owner), `move ${key}`);
    row.thing = to;
    row.refs = row.refs.filter((id) => id !== rows.get(to === 'kiln' ? 'loom' : 'kiln')!.id).concat(rows.get(to)!.id);
  };
  await move('t-into-kiln', 'kiln');
  await move('t-out-of-kiln', 'loom');

  const built: Built = { ids: { kiln: rows.get('kiln')!.id, loom: rows.get('loom')!.id, one: one.id }, seqs: { one: one.seq } };

  /* THE PAGES, THEIR FIGURES, AND THE GRANTS. */
  for (const page of PAGES) okValue(await api.setDeclaration({ body: page } as never, owner), `page ${page.page}`);
  for (const shape of shapes) {
    if (!shape.invite || shape.person === SAM) continue;
    const wheres = shape.invite.wheres?.(built);
    okValue(
      await api.kernel.invite(OWNER, {
        person: shape.person,
        name: shape.name,
        ...(shape.invite.level ? { level: shape.invite.level } : {}),
        ...(shape.invite.registers ? { registers: shape.invite.registers } : {}),
        ...(wheres ? { wheres: wheres as never } : {}),
      } as never),
      `invite ${shape.id}`,
    );
  }

  /* THE SHARES, through the share API as the owner makes them, to guests with nothing else on the record. */
  const until = new Date(NOW + 30 * 86_400_000).toISOString();
  for (const shape of shapes) {
    if (!shape.shares) continue;
    sql.exec('INSERT OR IGNORE INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', shape.person, `${shape.person}@example.test`, shape.name);
    let who = { kind: 'person', id: shape.person };
    if (shape.group) {
      /* THE GROUP THROUGH THE API, as the owner makes one: named, then the person put in it. */
      const made = okValue<{ id: string }>(await api.groupPut({ name: shape.name } as never, owner), `group ${shape.id}`);
      okValue(await api.groupMember({ group: made.id, person: shape.person, in: true } as never, owner), `group member ${shape.id}`);
      who = { kind: 'group', id: made.id };
    }
    for (const { ended, ...share } of shape.shares(built)) {
      const made = okValue<{ id: string }>(await api.share({ share: { effect: 'allow', ...share, who, when: { until } } } as never, owner), `share ${shape.id}`);
      if (ended) sql.exec('UPDATE share SET starts_at = ?, ends_at = ? WHERE id = ?', new Date(NOW - 30 * 86_400_000).toISOString(), new Date(NOW - 86_400_000).toISOString(), made.id);
    }
    api.kernel.accessChanged();
  }

  /* COMMENTS AND QUESTIONS ABOUT ROWS INSIDE AND OUTSIDE EACH GRANT, each carrying the word of the row it is about. */
  const spoken = (r: RowInfo) => api.kernel.nameOf(r.id)!;
  for (const key of ['t-kiln-todo', 't-loom-review', 'm-loom', 'n-open']) {
    const r = rows.get(key)!;
    okValue(await api.comment({ on: spoken(r), body: `About this one ${r.canary.word}` } as never, owner), `comment ${key}`);
  }
  const asked: string[] = [];
  for (const key of ['t-kiln-review', 't-loom-todo']) {
    const r = rows.get(key)!;
    const entry = okValue<Entry>(await api.get({ register: r.list, seq: r.seq } as never, owner), `get ${key}`);
    const filed = okValue<{ id: string }>(
      await api.propose(
        {
          question: `Price this one ${r.canary.word}?`,
          body_kind: 'rowset',
          body: { register: r.list, rows: [{ at: `${r.list}#${r.seq}`, version: entry.version, patch: { notes: `priced ${r.canary.word}` } }] },
        } as never,
        sam(),
      ),
      `propose ${key}`,
    );
    asked.push(filed.id);
  }
  okValue(await api.decide({ id: asked[0]!, decide: { option: 'reject', reason: 'Not yet.' } } as never, owner), 'decide');

  /* AN INBOX ARRIVAL, read by the owner alone. */
  const inboxWord = mint.word('zq');
  api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@bank.example' }, body: `Your statement ${inboxWord} is ready`, sha256: 'leak-arrival' } as never);
  const extras: Extra[] = [{ canary: { label: 'the inbox arrival', word: inboxWord }, sees: (c) => c.shape.id === 'owner' }];

  /* THE CALLERS: each shape as the person, a write-scope token and a read-scope token. */
  let tokens = 0;
  const callers: Caller[] = [];
  const ownerHeld = api.kernel.access(OWNER) as HeldAccess;
  for (const shape of shapes)
    for (const variant of variantsOf(shape)) {
      const base = personCtx(api, shape.person);
      let ctx: CallContext = base;
      if (variant === 'see-as') {
        const as = await seeAs(shape.person, { person: OWNER, email: 'ada@example.com', record: 'rec', provedAt: NOW } as never, ownerHeld, (p) => api.kernel.access(p) as HeldAccess | null);
        assert.ok(as !== null && 'ctx' in as, `the owner sees as ${shape.id}`);
        ctx = as.ctx as CallContext;
      } else if (variant !== 'person') {
        const id = `t_leak_${++tokens}`;
        const scope = variant === 'write-token' ? 'write' : 'read';
        sql.exec('INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, shape.person, `h_${id}`, scope, `${shape.id} ${scope}`, new Date(NOW).toISOString());
        const { principal, credentialed: _c, provedAt: _p, ...held } = base as CallContext & { provedAt?: number };
        ctx = { ...held, principal: { kind: 'token', id, scope, person: shape.person, level: (principal as { level: Level | null }).level } } as CallContext;
      }
      callers.push({ shape, variant, ctx, label: `${shape.id} as ${variant}` });
    }

  /** Whether a caller may see a row: the shape's rule, then the private rows, which only their maker sees. */
  const visible = (caller: Caller, r: RowInfo): boolean =>
    !r.deleted && (r.privateBy === undefined || (r.privateBy === caller.shape.person && caller.variant !== 'see-as')) && caller.shape.sees(r, built) && reaches(caller, r.list);

  /** A token reaches what its person does; an `append` grant reads nothing. */
  const reaches = (caller: Caller, list: string): boolean => {
    void list;
    return caller.shape.id !== 'adds';
  };

  /**
   * What a caller must never be answered: every row out of their sight, every extra they may not read, and on a row in
   * their sight, what a field hidden from them holds.
   */
  const out = (caller: Caller): Canary[] => {
    const seen = [...rows.values()].filter((r) => visible(caller, r));
    const named = new Set(seen.flatMap((r) => r.refs));
    const hides = caller.shape.hides ?? {};
    return [
      ...seen.flatMap((r) =>
        r.held
          .filter((h) => hides[r.list]?.includes(h.field))
          .map((h): Canary => ({ label: `${r.canary.label} hidden ${h.field}`, word: h.word ?? '', ...(h.amount === undefined ? {} : { amount: h.amount }) })),
      ),
      ...[...rows.values()]
        .filter((r) => !visible(caller, r))
        .map((r): Canary => {
          if (!named.has(r.id)) return r.canary;
          const { id: _id, ...rest } = r.canary;
          return rest;
        }),
      ...extras.filter((e) => !e.sees(caller)).map((e) => e.canary),
    ];
  };

  return { sql, api, clock, owner, rows, built, callers, shapes, visible, out, spoken, asked, extras, mint, prime, add, sam };
}

/** A person's context as a host builds it from the record's own `access` (`sessionContext`, `host/src/auth.ts`). */
export function personCtx(api: Api, person: string): CallContext {
  if (person === OWNER) return { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true };
  const held = api.kernel.access(person);
  assert.ok(held, `${person} is on the record`);
  return sessionContext({ person, provedAt: NOW } as never, held as never) as CallContext;
}

/**
 * The changes no caller of `shape` may see (§4.4 P2's Δ): creates, edits and deletes of rows outside its sight, and
 * Sam's private rows. Drawn from a seeded PRNG, each change applied to the record and to the truth beside it.
 */
export async function unseen(f: Fixture, shape: Shape, seed: number, most = 3): Promise<string[]> {
  const rng = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const caller = f.callers.find((c) => c.shape.id === shape.id && c.variant === 'person')!;
  const hidden = (r: RowInfo) => !f.visible(caller, r);
  const said: string[] = [];
  const owner = f.owner;

  type Op = { name: string; can: () => boolean; run: () => Promise<void> };
  const ops: Op[] = [
    {
      name: 'Sam keeps a new task on Kiln private',
      can: () => shape.person !== SAM,
      run: async () => void (await f.add(`t-sam-${said.length}-${seed}`, 'tasks', (w) => ({ name: `Sam again ${w}`, notes: `private ${w}` }), { thing: 'kiln', stage: 'review', amount: true, privateBy: SAM })),
    },
    {
      name: "Sam edits his private task",
      can: () => shape.person !== SAM,
      run: async () => {
        const r = f.rows.get('t-sam-kiln')!;
        assertOk(await f.api.update({ register: r.list, seq: r.seq, patch: { notes: `edited ${r.canary.word}`, rate: { amount: f.prime(), currency: 'GBP' } } as never }, f.sam()));
      },
    },
    {
      name: 'a task on Loom is made',
      can: () => !shape.sees(probe('tasks', 'loom', 'todo'), f.built),
      run: async () => void (await f.add(`t-loom-new-${said.length}-${seed}`, 'tasks', (w) => ({ name: `Loom chore ${w}`, notes: `new ${w}` }), { thing: 'loom', stage: 'todo', amount: true })),
    },
    {
      name: 'a Loom task is edited',
      can: () => hidden(f.rows.get('t-loom-todo')!),
      run: async () => {
        const r = f.rows.get('t-loom-todo')!;
        assertOk(await f.api.update({ register: r.list, seq: r.seq, patch: { notes: `edited again ${r.canary.word}`, rate: { amount: f.prime(), currency: 'GBP' } } as never }, owner));
      },
    },
    {
      name: 'a row out of sight is deleted',
      can: () => hidden(f.rows.get('t-out-of-kiln')!) && !f.rows.get('t-out-of-kiln')!.deleted,
      run: async () => {
        const r = f.rows.get('t-out-of-kiln')!;
        assertOk(await f.api.update({ register: r.list, seq: r.seq, patch: { deleted_at: new Date(NOW).toISOString() } as never }, owner));
        r.deleted = true;
      },
    },
    {
      name: 'money on Loom is spent',
      can: () => !shape.sees(probe('money', 'loom'), f.built),
      run: async () => void (await f.add(`m-loom-new-${said.length}-${seed}`, 'money', (w) => ({ payee: `Loom again ${w}`, notes: `new ${w}` }), { thing: 'loom', amount: true })),
    },
    {
      name: 'a note is written',
      can: () => !shape.sees(probe('notes', 'loom'), f.built),
      run: async () => void (await f.add(`n-new-${said.length}-${seed}`, 'notes', (w) => ({ what: `Another note ${w}` }), { thing: 'loom' })),
    },
    {
      name: 'a person is met',
      can: () => !shape.sees(probe('people', null), f.built),
      run: async () => void (await f.add(`p-new-${said.length}-${seed}`, 'people', (w) => ({ name: `Newcomer ${w}` }))),
    },
  ];
  const open = ops.filter((o) => o.can());
  const n = 1 + Math.floor(rng() * most);
  for (let i = 0; i < n && open.length > 0; i++) {
    const op = pick(open.filter((o) => o.can()));
    if (!op) break;
    await op.run();
    said.push(op.name);
  }
  return said;
}

/** A row that is not there, to ask a shape whether it would see one of its kind. */
const probe = (list: string, thing: 'kiln' | 'loom' | null, stage?: 'todo' | 'review' | 'done'): RowInfo => ({
  key: 'probe',
  list,
  id: '',
  seq: -1,
  thing,
  ...(stage ? { stage } : {}),
  refs: [],
  canary: { label: 'probe', word: '' },
  held: [],
});

const assertOk = (r: unknown) => assert.ok((r as { ok: boolean }).ok, JSON.stringify(r));
