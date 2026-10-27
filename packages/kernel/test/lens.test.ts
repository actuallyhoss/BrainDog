/**
 * The lens: what one caller holds, as pure functions over a catalog and their shares.
 *
 * The plan's three people are asserted as it writes them (Sam, Lee, Priya), then the rules `checkShare` keeps, the
 * clock, the ways `lensOf` fails closed, and P7 over random share sets: adding an allow never removes sight, and adding
 * a deny never adds any. The random sets come from a seeded mulberry32, so every run draws the same cases.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '@braindog/where';

import {
  activeAt,
  admits,
  CAPS,
  checkShare,
  compileLens,
  depthOf,
  fold,
  gateFields,
  lensOf,
  nextEdge,
  paramsOf,
  PARAMS_MAX,
  schemaOf,
  type Cap,
  type Catalog,
  type CatalogList,
  type HeldShare,
  type Lens,
  type LensSources,
  type Share,
  type Target,
  type Where,
} from '../src/lens.ts';
import { SHARE_TEMPLATES } from '../src/share-templates.ts';
import { openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12); // a Tuesday
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();

const KILN = 'r_kiln';
const MILL = 'r_mill';

const CATALOG: Catalog = {
  lists: [
    { id: 'things', name: 'Things', role: 'projects', fields: [{ id: 'name', type: 'text', title: true }] },
    {
      id: 'tasks',
      name: 'Tasks',
      state: 'state',
      fields: [
        { id: 'title', type: 'text', title: true },
        { id: 'thing', type: 'ref', to: 'things', scope: { widen: 'person' } },
        { id: 'state', type: 'enum', values: ['open', 'done'] },
        { id: 'due', type: 'day' },
        { id: 'owner', type: 'ref', to: 'people' },
        { id: 'old', type: 'text', retired: true },
        { id: 'total', type: 'number', derived: true },
      ],
    },
    {
      id: 'bills',
      name: 'Bills',
      fields: [
        { id: 'title', type: 'text', title: true },
        { id: 'amount', type: 'money' },
        { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      ],
    },
    { id: 'payroll', name: 'Payroll', fields: [{ id: 'title', type: 'text', title: true }, { id: 'salary', type: 'money' }] },
    { id: 'notes', name: 'Notes', fields: [{ id: 'body', type: 'text', title: true }] },
    { id: 'keys', name: 'Keys', role: 'keys', fields: [{ id: 'label', type: 'text', title: true }] },
    { id: 'people', name: 'People', role: 'meets', fields: [{ id: 'name', type: 'text', title: true }, { id: 'email', type: 'text' }] },
    { id: 'diary', name: 'Diary', ownerOnly: true, fields: [{ id: 'body', type: 'text', title: true }] },
  ],
};
const list = (id: string): CatalogList => CATALOG.lists.find((l) => l.id === id)!;

let n = 0;
const held = (s: Partial<Share> & Pick<Share, 'what'>, extra: Partial<HeldShare> = {}): HeldShare => ({
  id: `sh_${++n}`,
  effect: 'allow',
  who: { kind: 'person', id: 'p_guest' },
  can: 'view',
  ...s,
  ...extra,
});
const guest = (shares: HeldShare[], more: Partial<LensSources> = {}): LensSources => ({ person: 'p_guest', role: null, shares, ...more });
const lens = (src: LensSources): Lens => {
  const l = lensOf(src, CATALOG, NOW);
  assert.ok(l, 'the lens is none');
  return l;
};

test('fold takes TRUE and FALSE out, and keeps a condition only where one is left', () => {
  const a = { field: 'state', is: 'open' };
  const b = { field: 'thing', is: KILN };
  assert.equal(fold({ all: [true, true] }), true);
  assert.equal(fold({ all: [a, false] }), false);
  assert.deepEqual(fold({ all: [a, true] }), a);
  assert.equal(fold({ any: [a, true] }), true);
  assert.equal(fold({ any: [false, false] }), false);
  assert.equal(fold({ any: [] }), false);
  assert.equal(fold({ all: [] }), true);
  assert.equal(fold({ none: [] }), true);
  assert.equal(fold({ none: [true] }), false);
  assert.deepEqual(fold({ none: [false, a] }), { none: [a] });
  assert.deepEqual(fold({ any: [a, a, b] }), { any: [a, b] });
  assert.deepEqual(fold({ all: [{ any: [a] }, { none: [false] }, true] }), a);
});

test('SAM, A CONTRACTOR ON KILN: tasks in Kiln to edit, the Kiln row to view, and no deleting', () => {
  const l = lens(guest([held({ what: { project: KILN, lists: ['tasks'] }, can: 'edit', caps: { delete: false } })]));
  assert.equal(l.ctx.level, null);
  assert.deepEqual(l.ctx.registers, ['things', 'tasks']);
  assert.deepEqual(l.ctx.levels, { tasks: 'write', things: 'read' });
  assert.deepEqual(l.ctx.wheres, { tasks: { field: 'thing', is: KILN }, things: { field: 'id', is: KILN } });
  assert.deepEqual(l.ctx.writes, {});
  assert.deepEqual(l.ctx.nots, { tasks: ['delete'] });
  assert.equal(l.pred.write.things, false);
  assert.equal(l.pred.read.bills, false);
});

test('LEE, AN ASSISTANT: every list to edit, except money lists and keys, and no condition anywhere', () => {
  const l = lens(
    guest([
      held({ what: { record: true }, can: 'edit' }),
      held({ effect: 'deny', what: { lists: { has: 'money' } } }),
      held({ effect: 'deny', what: { lists: { role: 'keys' } } }),
    ]),
  );
  assert.equal(l.ctx.level, 'write');
  assert.deepEqual(l.ctx.registers, ['things', 'tasks', 'notes']);
  assert.deepEqual(l.ctx.wheres, {});
  assert.deepEqual(l.ctx.levels, {});
});

test('PRIYA, AN ACCOUNTANT: the money lists to view and nothing else', () => {
  const l = lens(guest([held({ what: { lists: { has: 'money' } } }), held({ effect: 'deny', what: { lists: { role: 'keys' } } })]));
  assert.equal(l.ctx.level, null);
  assert.deepEqual(l.ctx.registers, ['bills', 'payroll']);
  assert.deepEqual(l.ctx.levels, { bills: 'read', payroll: 'read' });
  assert.equal(l.pred.write.bills, false);
  assert.equal(l.pred.history.bills, true);
});

test('a project share on a list with links reads has, and keys are reached only when named', () => {
  const l = lens(guest([held({ what: { project: KILN } }), held({ what: { lists: ['keys'] } })]));
  assert.deepEqual(l.ctx.wheres.bills, { field: 'projects', has: KILN });
  assert.deepEqual(l.ctx.wheres.tasks, { field: 'thing', is: KILN });
  assert.equal(l.pred.read.keys, true);
  assert.equal(l.pred.read.people, false);
  assert.equal(l.pred.read.diary, false);
  assert.equal(lens(guest([held({ what: { record: true } })])).pred.read.keys, false);
});

test('A ROLE COVERS THE RECORD and registers is null, and a deny takes it back to a list', () => {
  const plain = lens({ person: 'p_m', role: 'write', shares: [] });
  assert.equal(plain.ctx.registers, null);
  assert.deepEqual(plain.ctx.levels, {});
  assert.equal(plain.pred.read.keys, true, 'a role reaches Keys as the ladder always has');
  const adds = lens({ person: 'p_x', role: 'append', shares: [] });
  assert.equal(adds.pred.append.keys, false, 'a record-wide Adds only stops at the owner lists');
  assert.equal(adds.pred.append.diary, false);
  assert.equal(adds.pred.append.notes, true);
  const admin = lens({ person: 'p_a', role: 'decide', shares: [] });
  assert.deepEqual(admin.ctx.levels, {}, 'an Admin carries no per-list level');
  const denied = lens({ person: 'p_m', role: 'write', shares: [held({ effect: 'deny', what: { lists: ['payroll'] } })] });
  assert.ok(denied.ctx.registers && !denied.ctx.registers.includes('payroll'));
  const viewer = lens({ person: 'p_v', role: 'read', shares: [held({ what: { lists: ['notes'] }, can: 'comment' })] });
  assert.equal(viewer.ctx.level, 'read');
  assert.deepEqual(viewer.ctx.levels, { notes: 'comment' });
});

test('a legacy per-list row replaces the role on its list, and a rule it cannot read reaches no row', () => {
  const rule = { field: 'state', is: 'open' };
  const l = lens({
    person: 'p_m',
    role: 'write',
    shares: [],
    lists: [
      { register: 'tasks', level: 'read', where: rule },
      { register: 'notes', level: 'write', where: 'a sentence' },
      { register: 'bills', level: 'write', where: null },
      { register: 'payroll', level: 'decide' },
    ],
  });
  assert.deepEqual(l.pred.read.tasks, rule);
  assert.equal(l.pred.write.tasks, false);
  /* A SENTENCE IS CARRIED AS IT WAS STORED, one leaf the reader compiles as it always has. */
  assert.equal(l.pred.read.notes, 'a sentence' as unknown as Where);
  assert.equal(l.pred.read.bills, false);
  assert.equal(l.ctx.levels.payroll, 'decide', 'a legacy level the predicates cannot say is kept');
  assert.deepEqual(l.ctx.registers, ['things', 'tasks', 'payroll', 'notes', 'keys', 'people', 'diary'], 'a rule nobody can read takes its list off');
  const one = lens({ person: 'p_m', role: 'read', shares: [held({ what: { lists: ['notes'] }, can: 'edit' })], lists: [{ register: 'tasks', level: 'write' }] });
  assert.equal(one.ctx.registers, null, 'a role that still reaches every list keeps the whole record as its ceiling');
  assert.deepEqual(one.ctx.levels, { tasks: 'write', notes: 'write' });
});

test('AN OWNER SEES EVERYTHING, and a narrowed key of theirs only what it is narrowed to', () => {
  const o = lens({ person: 'p_o', role: 'owner', shares: [] });
  assert.equal(o.owner, true);
  assert.equal(o.ctx.registers, null);
  assert.ok(CATALOG.lists.every((l) => CAPS.every((c) => o.pred[c][l.id] === true)));
  const k = lens({ person: 'p_o', role: 'owner', shares: [], token: { narrow: { project: KILN } } });
  assert.deepEqual(k.ctx.registers, ['things', 'tasks', 'bills']);
  assert.deepEqual(k.ctx.wheres.tasks, { field: 'thing', is: KILN });
});

test('A TOKEN: never more than its person, an allow with agents off stays behind, and a deny always comes', () => {
  const shares = [
    held({ what: { lists: ['notes'] }, caps: { agents: false } }),
    held({ what: { lists: ['tasks'] }, can: 'edit' }),
    held({ effect: 'deny', what: { list: 'tasks', where: { field: 'state', is: 'done' } }, caps: { agents: false } }),
  ];
  const person = lens(guest(shares));
  const agent = lens(guest(shares, { token: { narrow: null } }));
  assert.equal(person.pred.read.notes, true);
  assert.equal(agent.pred.read.notes, false);
  assert.deepEqual(agent.pred.read.tasks, { none: [{ field: 'state', is: 'done' }] });
  const narrowed = lens(guest(shares, { token: { narrow: { lists: ['notes'] } } }));
  assert.ok(CAPS.every((c) => CATALOG.lists.every((l) => narrowed.pred[c][l.id] === false)), 'a narrowing adds nothing its person lacks');
  const byShare = lens(guest(shares, { token: { narrow: { share: shares[1]!.id } } }));
  assert.deepEqual(byShare.ctx.registers, ['tasks']);
});

test('$me is the People rows of the grantee, and none of them matches nothing', () => {
  const s = held({ what: { list: 'tasks', where: { field: 'owner', is: '$me' } } });
  assert.deepEqual(lens(guest([s], { me: ['r_p1'] })).pred.read.tasks, { field: 'owner', is: 'r_p1' });
  assert.deepEqual(lens(guest([s], { me: ['r_p1', 'r_p2'] })).pred.read.tasks, { field: 'owner', in: ['r_p1', 'r_p2'] });
  assert.equal(lens(guest([s])).pred.read.tasks, false);
});

test('HIDES are the union over covering shares, money by type, and never the title', () => {
  const l = lens(
    guest([
      held({ what: { lists: { has: 'money' } }, hide: { types: ['money'] } }),
      held({ what: { lists: ['tasks'] }, hide: { tasks: ['due', 'title'] } }),
    ]),
  );
  assert.deepEqual(l.hides, { bills: ['amount'], payroll: ['salary'], tasks: ['due'] });
  assert.deepEqual(l.ctx.hides, l.hides);
});

test('A CONDITION THAT NO LONGER COMPILES reaches no row as an allow and every row as a deny', () => {
  const allow = held({ what: { list: 'tasks', where: { field: 'old', is: 'x' } } });
  const a = lens(guest([allow, held({ what: { lists: ['notes'] } })]));
  assert.equal(a.pred.read.tasks, false);
  assert.deepEqual(a.stale, [allow.id]);
  const deny = held({ effect: 'deny', what: { list: 'tasks', where: { field: 'old', is: 'x' } } });
  const d = lens(guest([held({ what: { lists: ['tasks'] } }), deny]));
  assert.equal(d.pred.read.tasks, false);
  assert.deepEqual(d.stale, [deny.id]);
});

test('LENSOF FAILS CLOSED: anything malformed is none, never a guess', () => {
  const good = held({ what: { lists: ['tasks'] } });
  const bad: unknown[] = [
    { ...good, effect: 'maybe' },
    { ...good, who: { kind: 'person' } },
    { ...good, can: 'own' },
    { ...good, what: { lists: [] } },
    { ...good, what: { record: false } },
    { ...good, what: { list: 'tasks', where: { field: 'title', matches: 'x' } } },
    { ...good, what: { list: 'tasks', where: { pointed: { register: 'bills', by: 'x' } } } },
    { ...good, what: { list: 'tasks', rows: Array.from({ length: 101 }, (_, i) => `r_${i}`) } },
    { ...good, caps: { delete: 'no' } },
    { ...good, caps: { sudo: true } },
    { ...good, when: { until: 'soon' } },
    { ...good, when: { hours: { days: [8], from: '09:00', to: '17:00' } } },
    { ...good, hide: { types: ['secret'] } },
    { ...good, id: '' },
    null,
    'share',
  ];
  for (const s of bad) assert.equal(lensOf(guest([good, s as HeldShare]), CATALOG, NOW), null, JSON.stringify(s));
  assert.equal(lensOf(guest([good], { suspended: true }), CATALOG, NOW), null);
  assert.equal(lensOf(guest([good], { token: { narrow: { lists: 7 } as unknown as Target } }), CATALOG, NOW), null);
  assert.equal(lensOf(guest([good]), CATALOG, NOW, 'Mars/Olympus'), null);
  assert.equal(lensOf(guest([good]), CATALOG, Number.NaN), null);
  assert.equal(lensOf({ ...guest([good]), role: 'king' as never }, CATALOG, NOW), null);
  assert.equal(lensOf(guest([good], { me: [3 as unknown as string] }), CATALOG, NOW), null);
  assert.ok(lensOf(guest([good]), CATALOG, NOW));
});

test('ACTIVE: not revoked, from <= now < until, inside its hours, and a once share for a day', () => {
  const s = (when: HeldShare['when'], extra: Partial<HeldShare> = {}) => held({ what: { record: true }, ...(when ? { when } : {}) }, extra);
  assert.equal(activeAt(s(undefined), NOW), true);
  assert.equal(activeAt(s(undefined, { revoked_at: at(NOW - 1) }), NOW), false);
  assert.equal(activeAt(s({ from: at(NOW + 1) }), NOW), false);
  assert.equal(activeAt(s({ from: at(NOW) }), NOW), true);
  assert.equal(activeAt(s({ until: at(NOW) }), NOW), false);
  assert.equal(activeAt(s({ once: true }), NOW), true, 'never used');
  assert.equal(activeAt(s({ once: true }, { first_used_at: at(NOW - DAY + 1) }), NOW), true);
  assert.equal(activeAt(s({ once: true }, { first_used_at: at(NOW - DAY) }), NOW), false);
  const weekdays = { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' };
  assert.equal(activeAt(s({ hours: weekdays }), NOW), true, 'Tuesday at noon UTC');
  assert.equal(activeAt(s({ hours: weekdays }), NOW, 'Pacific/Auckland'), false, 'one in the morning on Wednesday');
  assert.equal(activeAt(s({ hours: { days: [2], from: '22:00', to: '02:00' } }), Date.UTC(2026, 9, 21, 1)), true, 'past midnight');
  assert.equal(activeAt(s({ hours: { days: [6, 0], from: '09:00', to: '18:00' } }), NOW), false);
});

test('THE LENS IS GOOD UNTIL the next start, end, hours edge or once-end', () => {
  const ends = held({ what: { lists: ['tasks'] }, when: { until: at(NOW + 3 * DAY) } });
  const starts = held({ what: { lists: ['bills'] }, when: { from: at(NOW + DAY) } });
  const l = lens(guest([ends, starts]));
  assert.equal(l.until, at(NOW + DAY));
  assert.equal(l.pred.read.bills, false, 'not yet');
  const hours = held({ what: { record: true }, when: { hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } } });
  assert.equal(nextEdge(hours, NOW), Date.UTC(2026, 9, 20, 18));
  assert.equal(nextEdge(hours, NOW, 'Europe/London'), Date.UTC(2026, 9, 20, 17), 'BST in October');
  assert.equal(lens(guest([held({ what: { record: true } })])).until, null);
});

test('GATE FIELDS: what any active share condition names, and the scope field under a project share', () => {
  const shares = [
    held({ what: { list: 'tasks', where: { all: [{ field: 'state', is: 'open' }, { field: 'id', in: ['r_1'] }] } } }),
    held({ what: { project: KILN } }, { who: { kind: 'person', id: 'p_other' } }),
    held({ what: { list: 'tasks', where: { field: 'due', before: '2026-01-01' } } }, { revoked_at: at(NOW - 1) }),
  ];
  assert.deepEqual(gateFields(shares, CATALOG, 'tasks', NOW), ['state', 'thing']);
  assert.deepEqual(gateFields(shares, CATALOG, 'bills', NOW), ['projects']);
  assert.deepEqual(gateFields(shares, CATALOG, 'notes', NOW), []);
});

/* ------------------------------------------------------------------------------------------------------ checkShare */

const ok = (s: Share, opts = {}) => assert.equal(checkShare(s, CATALOG, opts), null, JSON.stringify(s));
const refused = (s: Share, code: string, at: RegExp, opts = {}) => {
  const r = checkShare(s, CATALOG, opts);
  assert.ok(r, `accepted: ${JSON.stringify(s)}`);
  assert.equal(r.code, code, r.fix);
  assert.match(r.at ?? '', at, r.fix);
  assert.doesNotMatch(r.fix, /\u2014/, 'an em dash');
};
const share = (what: Target, more: Partial<Share> = {}): Share => ({ effect: 'allow', who: { kind: 'person', id: 'p_guest' }, what, can: 'view', ...more });

test('CHECKSHARE keeps who a share can target', () => {
  ok(share({ record: true }, { can: 'edit' }));
  refused(share({ record: true }), 'FORBIDDEN', /^who$/, { owners: ['p_guest'] });
  refused(share({ record: true }, { can: 'manage' }), 'FORBIDDEN', /^can$/);
  ok(share({ lists: ['tasks'] }, { can: 'manage', caps: { onward: true } }));
  refused(share({ lists: ['tasks'] }, { can: 'edit', caps: { onward: true } }), 'VALUE_MALFORMED', /onward/);
  refused(share({ record: true }, { who: { kind: 'link', id: 'l_1' } }), 'FORBIDDEN', /^who$/);
  refused(share({ record: true }, { who: { kind: 'email', id: 'Ana@Example.com' } }), 'VALUE_MALFORMED', /^who$/);
  ok(share({ record: true }, { who: { kind: 'email', id: 'ana@example.com' } }));
  ok(share({ record: true }, { who: { kind: 'group', id: 'g_1' } }));
});

test('CHECKSHARE keeps what a share names to lists, rows and fields the record has', () => {
  refused(share({ lists: ['ghosts'] }), 'REGISTER_UNKNOWN', /what\.lists\.0/);
  refused(share({ list: 'ghosts', rows: ['r_1'] }), 'REGISTER_UNKNOWN', /what\.list/);
  refused(share({ list: 'tasks', rows: Array.from({ length: 101 }, (_, i) => `r_${i}`) }), 'VALUE_MALFORMED', /what/);
  ok(share({ list: 'tasks', rows: Array.from({ length: 100 }, (_, i) => `r_${i}`) }));
  refused(share({ project: KILN, lists: ['notes'] }), 'VALUE_MALFORMED', /what\.lists\.0/);
  ok(share({ project: KILN, lists: ['tasks', 'bills'] }));
  refused(share({ lists: ['tasks'] }, { hide: { tasks: ['title'] } }), 'VALUE_MALFORMED', /hide\.tasks/);
  refused(share({ lists: ['tasks'] }, { hide: { tasks: ['nope'] } }), 'FIELD_UNKNOWN', /hide\.tasks/);
  ok(share({ lists: ['tasks'] }, { hide: { tasks: ['due'] } }));
  ok(share({ lists: { has: 'money' } }, { hide: { types: ['money'] } }));
});

test('CHECKSHARE keeps conditions to the rules: fields, operators, values, size', () => {
  const on = (where: unknown) => share({ list: 'tasks', where: where as Where });
  ok(on({ all: [{ field: 'thing', is: KILN }, { field: 'state', not: 'done' }, { field: 'due', after: '-30d' }, { field: 'seq', gt: 3 }] }));
  ok(on({ field: 'owner', is: '$me' }));
  ok(on({ field: 'created_at', before: '2026-01-01' }));
  refused(on({ field: 'nope', is: 'x' }), 'FIELD_UNKNOWN', /what\.where/);
  refused(on({ field: 'old', is: 'x' }), 'FIELD_UNKNOWN', /what\.where/);
  refused(on({ field: 'total', gt: 1 }), 'FIELD_UNKNOWN', /what\.where/);
  refused(on({ field: 'title', matches: 'x' }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'title', near: 'x' }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'thing', via: 'name', is: 'Kiln' }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ pointed: { register: 'bills', by: 'projects' } }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'owner', not: '$me' }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'owner', is: '$you' }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'due', gt: { a: 1 } }), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'due', contains: 'x' }), 'MATCH_OP_UNSUPPORTED', /what\.where/);
  const deep = { all: [{ any: [{ none: [{ all: [{ field: 'state', is: 'open' }] }] }] }] };
  refused(on(deep), 'VALUE_MALFORMED', /^what$/);
  ok(on({ all: [{ any: [{ none: [{ field: 'state', is: 'open' }] }] }] }));
  const leaves = (k: number) => ({ any: Array.from({ length: k }, (_, i) => ({ field: 'title', is: `t${i}` })) });
  ok(on(leaves(20)));
  refused(on(leaves(21)), 'VALUE_MALFORMED', /^what$/);
  refused(on({ field: 'title', in: Array.from({ length: 800 }, (_, i) => `title ${i}`) }), 'VALUE_MALFORMED', /^what$/);
  const said = checkShare(on({ field: 'state', is: 'open' }), CATALOG, { readsRule: () => ({ code: 'VALUE_MALFORMED', fix: 'No.' }) });
  assert.equal(said?.at, 'what.where', 'the kernel reading of a rule is asked too');
});

test('THE PARAMETER BUDGET: at most 60 per list across one person, and the worst case compiles to 90 or fewer', () => {
  const twenty = (from: number): Where => ({ any: Array.from({ length: 20 }, (_, i) => ({ field: 'title', is: `t${from + i}` })) });
  const held3: Share[] = [];
  for (let i = 0; i < 3; i++) {
    const s = share({ list: 'tasks', where: twenty(i * 20) }, i === 2 ? { effect: 'deny' } : {});
    ok(s, { others: held3 });
    held3.push(s);
  }
  refused(share({ list: 'tasks', where: { field: 'title', is: 'one more' } }), 'OUT_OF_BOUNDS', /^what$/, { others: held3 });
  ok(share({ list: 'notes', where: { field: 'body', is: 'elsewhere' } }), { others: held3 });
  ok(share({ list: 'tasks', rows: Array.from({ length: 100 }, (_, i) => `r_${i}`) }), { others: held3.slice(0, 2) });
  /* THE WORST CASE A PERSON CAN HOLD: sixty from their shares, a narrowed key and their private-row clause on top. */
  const shares = held3.map((s) => held(s));
  const l = lens(guest(shares, { token: { narrow: { lists: ['tasks'] } } }));
  const where = l.ctx.wheres.tasks!;
  const total = paramsOf(where, list('tasks')) + 1;
  assert.equal(paramsOf(where, list('tasks')), PARAMS_MAX);
  assert.ok(total <= 90, `${total} parameters`);
  assert.equal(compileLens(where, schemaOf(list('tasks'))).params.length, PARAMS_MAX);
});

test('THE TEMPLATES, filled in, are shares checkShare takes', () => {
  const fill = (v: unknown): unknown =>
    v === '$project' ? KILN : v === '$list' ? 'tasks' : v === '$row' ? 'r_42' : v === '$where' ? { field: 'state', is: 'open' } : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  assert.equal(SHARE_TEMPLATES.length, 5);
  for (const t of SHARE_TEMPLATES) {
    const rows = t.rows.map((r) => ({ ...r, who: { kind: 'person', id: 'p_guest' }, what: fill(r.what), ...(t.days ? { when: { until: at(NOW + t.days * DAY) } } : {}) }) as Share);
    for (const r of rows) ok(r, { others: rows.filter((x) => x !== r) });
    assert.ok(lensOf(guest(rows.map((r) => held(r))), CATALOG, NOW), t.id);
  }
});

/* -------------------------------------------------------------------------------------------- P7, over random sets */

/** mulberry32: a seeded PRNG, so every run draws the same cases. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = Number(process.env.LEAK_FUZZ ?? 200);
const IDS = ['r_1', 'r_2', 'r_3', 'r_4', KILN, MILL];

function draw(rand: () => number) {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const leaf = (): Where =>
    pick([
      { field: 'state', is: pick(['open', 'done']) },
      { field: 'thing', is: pick([KILN, MILL]) },
      { field: 'title', contains: pick(['a', 'b']) },
      { field: 'id', in: [pick(IDS), pick(IDS)] },
      { field: 'due', before: pick(['2026-10-01', '2026-11-01']) },
    ]) as Where;
  const where = (): Where => pick([leaf, () => ({ any: [leaf(), leaf()] }), () => ({ all: [leaf(), leaf()] }), () => ({ none: [leaf()] })])() as Where;
  const target = (): Target =>
    pick<() => Target>([
      () => ({ record: true }),
      () => ({ lists: [pick(['tasks', 'bills', 'things', 'keys', 'notes'])] }),
      () => ({ lists: { has: 'money' } }),
      () => ({ lists: { role: 'keys' } }),
      () => ({ project: pick([KILN, MILL]) }),
      () => ({ project: pick([KILN, MILL]), lists: ['tasks'] }),
      () => ({ list: 'tasks', where: where() }),
      () => ({ list: 'tasks', rows: [pick(IDS), pick(IDS)] }),
      () => ({ list: 'things', rows: [pick(IDS)] }),
    ])();
  const one = (effect?: 'allow' | 'deny'): HeldShare => {
    const e = effect ?? (rand() < 0.7 ? 'allow' : 'deny');
    const s: HeldShare = held({ effect: e, what: target(), can: pick(['view', 'comment', 'edit', 'manage'] as const) });
    if (rand() < 0.3) s.caps = { history: rand() < 0.5, delete: rand() < 0.5, create: rand() < 0.5, agents: rand() < 0.5 };
    if (e === 'allow' && rand() < 0.2) s.hide = rand() < 0.5 ? { types: ['money'] } : { tasks: ['due'] };
    const w = rand();
    if (w < 0.1) s.when = { until: at(NOW - DAY) };
    else if (w < 0.2) s.when = { from: at(NOW + DAY) };
    else if (w < 0.3) s.when = { hours: { days: [pick([1, 2, 3])], from: '09:00', to: '17:00' } };
    return s;
  };
  const role = pick([null, null, 'read', 'append', 'write'] as const);
  const lists = rand() < 0.3 ? [{ register: 'tasks', level: pick(['read', 'write'] as const), where: where() as never }] : [];
  const shares = Array.from({ length: Math.floor(rand() * 5) }, () => one());
  const token = rand() < 0.3 ? { narrow: rand() < 0.5 ? null : target() } : null;
  return { pick, one, src: { person: 'p_guest', role, lists, shares, me: ['r_p1'], token } as LensSources };
}

function rowsFor(rand: () => number, l: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const id = IDS[Math.floor(rand() * IDS.length)]!;
    const fields: Record<string, unknown> =
      l === 'tasks'
        ? { title: rand() < 0.5 ? 'a task' : 'b task', thing: rand() < 0.5 ? KILN : MILL, state: rand() < 0.5 ? 'open' : 'done', due: rand() < 0.5 ? '2026-09-15' : '2026-10-15' }
        : l === 'bills'
          ? { title: 'bill', amount: { amount: 5, currency: 'GBP' }, projects: rand() < 0.5 ? [KILN] : [MILL] }
          : { title: 'x', name: 'x', body: 'x', label: 'x' };
    return { id, seq: i + 1, state: fields.state ?? null, created_at: at(NOW - DAY), updated_at: at(NOW), fields };
  });
}

const holds = (p: boolean | Where, row: ReturnType<typeof rowsFor>[number], l: CatalogList): boolean =>
  admits(p, row.fields, schemaOf(l), row);

test('P7: adding an allow never removes sight, and adding a deny never adds any', () => {
  const rand = mulberry32(0x5eed7);
  let compared = 0;
  for (let c = 0; c < CASES; c++) {
    const { one, src } = draw(rand);
    const before = lensOf(src, CATALOG, NOW);
    assert.ok(before, `case ${c}: the lens is none`);
    for (const effect of ['allow', 'deny'] as const) {
      const extra = one(effect);
      const after = lensOf({ ...src, shares: [...src.shares, extra] }, CATALOG, NOW);
      assert.ok(after, `case ${c}: the lens is none after ${JSON.stringify(extra)}`);
      const [small, big] = effect === 'allow' ? [before, after] : [after, before];
      for (const l of CATALOG.lists) {
        const rows = rowsFor(rand, l.id);
        for (const cap of CAPS as readonly Cap[]) {
          for (const row of rows) {
            compared++;
            if (holds(small.pred[cap][l.id]!, row, l))
              assert.ok(
                holds(big.pred[cap][l.id]!, row, l),
                `case ${c}: ${effect} ${JSON.stringify(extra)} changed ${cap} on ${l.id} for ${JSON.stringify(row)}\nwas ${JSON.stringify(before.pred[cap][l.id])}\nnow ${JSON.stringify(after.pred[cap][l.id])}`,
              );
          }
        }
        /* FIELDS: a deny never shows a hidden one; an allow that hides nothing never hides one on a list already seen. */
        const seen = (x: Lens) => CAPS.some((cap) => x.pred[cap][l.id] !== false);
        if (effect === 'deny' && seen(after)) for (const f of before.hides[l.id] ?? []) assert.ok((after.hides[l.id] ?? []).includes(f), `case ${c}: a deny showed ${f}`);
        if (effect === 'allow' && extra.hide === undefined && seen(before))
          for (const f of after.hides[l.id] ?? []) assert.ok((before.hides[l.id] ?? []).includes(f), `case ${c}: an allow hid ${f}`);
      }
      if (big.ctx.registers !== null) for (const r of small.ctx.registers ?? []) assert.ok(big.ctx.registers.includes(r), `case ${c}: ${r} left registers`);
    }
  }
  assert.ok(compared > CASES * 100, `${compared} comparisons`);
});

test('A COMPOSED LENS NESTS DEEPER THAN A FILTER MAY, and compileLens says in SQL what admits says in memory', () => {
  const two = { all: [{ field: 'state', is: 'open' }, { any: [{ field: 'thing', is: KILN }, { field: 'title', contains: 'a' }] }] };
  assert.deepEqual(fold({ all: [{ all: [two as Where, true] }, { any: [{ any: [{ field: 'seq', gt: 1 }] }] }] }), {
    all: [{ field: 'state', is: 'open' }, { any: [{ field: 'thing', is: KILN }, { field: 'title', contains: 'a' }] }, { field: 'seq', gt: 1 }],
  });
  const l = lens(guest([held({ what: { list: 'tasks', where: two as Where } }), held({ what: { list: 'tasks', where: { none: [two] } as Where } })]));
  const p = l.pred.read.tasks!;
  assert.ok(depthOf(p) > 3, `depth ${depthOf(p)}`);
  assert.equal(compile(p as Where, schemaOf(list('tasks'))).bad[0]?.code, 'PREDICATE_TOO_DEEP');
  assert.deepEqual(compileLens(p, schemaOf(list('tasks'))).bad, []);

  const sql = openSqlite();
  sql.exec('CREATE TABLE entry (id TEXT, seq INTEGER, state TEXT, created_at TEXT, updated_at TEXT, fields TEXT)');
  const rand = mulberry32(42);
  const rows = rowsFor(rand, 'tasks').concat(rowsFor(rand, 'tasks'));
  for (const r of rows)
    sql.exec(
      'INSERT INTO entry (id, seq, state, created_at, updated_at, fields) VALUES (?, ?, ?, ?, ?, ?)',
      r.id, r.seq, r.state as string, r.created_at, r.updated_at, JSON.stringify(r.fields),
    );
  let compared = 0;
  for (let c = 0; c < CASES; c++) {
    const got = lensOf(draw(rand).src, CATALOG, NOW);
    assert.ok(got);
    for (const cap of CAPS) {
      const pred: boolean | Where = got.pred[cap].tasks!;
      const compiled = compileLens(pred, schemaOf(list('tasks')));
      assert.deepEqual(compiled.bad, [], JSON.stringify(pred));
      const inSql = sql.all<{ n: number }>(`SELECT rowid AS n FROM entry WHERE ${compiled.sql} ORDER BY rowid`, ...compiled.params).map((r) => r.n);
      const inMemory: number[] = rows.flatMap((r, i): number[] => (admits(pred, r.fields, schemaOf(list('tasks')), r) ? [i + 1] : []));
      assert.deepEqual(inSql, inMemory, `case ${c}: ${cap} ${JSON.stringify(pred)}`);
      compared++;
    }
  }
  assert.ok(compared >= CASES);
  sql.close();
});
