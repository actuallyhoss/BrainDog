/**
 * The lens goes live (sharing plan slice 5): share rows written straight into the tables come back out of `access` as
 * the context every reader already honours, the owner is untouched by any of it, and the lens is quick.
 *
 * The shares are inserted by SQL, as the share methods (slice 7) will write them, and the access epoch is moved by hand
 * as those methods will move it. Each grant shape is the plan's (§4.2), on a record with projects (Things), Tasks in
 * them with a money rate, Money and Notes. Each is asserted as `kernel.access` answers it, and the contractor and the
 * commenter are then driven through `list`, `boot` and `version` with the context a host builds from that answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { access as memberAccess } from '../../kernel/src/members.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...more } as never,
});

const DECLS = [
  reg('things', 'Things', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
  ], { scopes: { repos: 'repos' } }),
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
    { id: 'stage', type: 'enum', values: ['Doing', 'Review', 'Done'] },
    { id: 'rate', type: 'money' },
  ]),
  reg('money', 'Money', 'payee', [
    { id: 'payee', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
  ]),
  reg('notes', 'Notes', 'body', [{ id: 'body', type: 'text', required: true }]),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner));
  const mill = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Mill' } }, owner));
  const glaze = value<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id, stage: 'Review', rate: { amount: 4_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Fire the kiln', thing: kiln.id, stage: 'Doing' } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Oil the mill', thing: mill.id, stage: 'Review' } }, owner));
  value(await api.create({ register: 'money', fields: { payee: 'Clay Co', amount: { amount: 12_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'Kiln temperatures' } }, owner));
  /* THE PEOPLE THE SHARES ARE FOR, as the record mirrors them. Guests hold no member row; Ann is a member who adds to Money only. */
  const people: [string, string][] = [['p_sam', 'Sam'], ['p_lee', 'Lee'], ['p_pri', 'Priya'], ['p_ana', 'Ana'], ['p_omar', 'Omar'], ['p_vic', 'Vic'], ['p_cat', 'Cat'], ['p_ann', 'Ann'], ['p_gus', 'Gus']];
  for (const [id, name] of people)
    sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', id, `${name.toLowerCase()}@example.test`, name);
  value(await api.invite({ person: 'p_ann', name: 'Ann', registers: { money: 'append' } }, owner));
  return { api, sql, clock, kiln: kiln.id, mill: mill.id, glaze: glaze.id };
}

let n = 0;
/** One share row, as the share methods will write it. */
function share(
  sql: NodeSql,
  who: string,
  what: unknown,
  can: string,
  more: { effect?: 'allow' | 'deny'; caps?: unknown; hide?: unknown; ends?: string; kind?: 'person' | 'group' } = {},
): string {
  const id = `sh_${String(++n).padStart(3, '0')}`;
  sql.exec(
    `INSERT INTO share (id, effect, who_kind, who, what, can, caps, hide, ends_at, made_by, made_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'p_1', ?)`,
    id,
    more.effect ?? 'allow',
    more.kind ?? 'person',
    who,
    JSON.stringify(what),
    can,
    more.caps === undefined ? null : JSON.stringify(more.caps),
    more.hide === undefined ? null : JSON.stringify(more.hide),
    more.ends ?? null,
    at(NOW),
  );
  return id;
}

/** The context a host builds from the answer (`heldContext`, `packages/host/src/auth.ts`), for a person. */
function contextOf(api: Api, person: string): CallContext {
  const held = api.kernel.access(person);
  assert.ok(held, `${person} holds nothing`);
  const says = (o: object | undefined) => o !== undefined && Object.keys(o).length > 0;
  return {
    principal: { kind: 'person', id: person, level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    ...(says(held.levels) ? { levels: held.levels } : {}),
    ...(says(held.wheres) ? { wheres: held.wheres! } : {}),
    ...(says(held.writes) ? { writes: held.writes! } : {}),
    ...(says(held.hides) ? { hides: held.hides! } : {}),
    ...(says(held.nots) ? { nots: held.nots! } : {}),
    ...(held.grant === undefined ? {} : { grant: held.grant }),
  } as CallContext;
}

test('THE PLAN’S GRANT SHAPES, written as share rows, come out of access as the context every reader honours', async () => {
  const { api, sql, kiln, glaze } = await record();
  const tasksIn = (thing: string) => ({ field: 'thing', is: thing });

  share(sql, 'p_vic', { record: true }, 'view'); // G1 whole-record view
  share(sql, 'p_lee', { record: true }, 'edit'); // G2 Assistant
  share(sql, 'p_lee', { lists: { has: 'money' } }, 'view', { effect: 'deny' });
  share(sql, 'p_lee', { lists: { role: 'keys' } }, 'view', { effect: 'deny' });
  const accountant = share(sql, 'p_pri', { lists: { has: 'money' } }, 'view', { ends: at(NOW + 90 * DAY) }); // G3 Accountant
  share(sql, 'p_pri', { lists: { role: 'keys' } }, 'view', { effect: 'deny' });
  share(sql, 'p_sam', { project: kiln, lists: ['tasks'] }, 'edit', { caps: { delete: false } }); // G4 Contractor on Kiln
  share(sql, 'p_ana', { list: 'tasks', where: { field: 'stage', is: 'Review' } }, 'comment'); // G5 a condition
  share(sql, 'p_omar', { list: 'tasks', rows: [glaze] }, 'view'); // G6 a single row
  share(sql, 'p_cat', { lists: ['tasks'] }, 'view', { hide: { tasks: ['rate'] } }); // G7 a hidden field
  share(sql, 'p_gus', { project: kiln, lists: ['tasks'] }, 'comment'); // G8 Comment on Kiln
  share(sql, 'p_ann', { lists: ['notes'] }, 'view'); // G9 Adds only on Money, a member, with a share beside it
  api.kernel.accessChanged();
  const epoch = api.kernel.accessEpoch();
  const grant = (via: string[], until: string | null = null) => ({ epoch, until, via, agents: true });
  const ids = (who: string) => sql.all<{ id: string }>("SELECT id FROM share WHERE who = ? AND effect = 'allow' ORDER BY id", who).map((r) => r.id);
  const all = (who: string) => sql.all<{ id: string }>('SELECT id FROM share WHERE who = ? ORDER BY id', who).map((r) => r.id);

  /* `session` and `instructions` are the kernel's own lists of agent runs and of what he told them: HIS, so a whole-record
     share leaves them out as it leaves out Keys and People, and only a share that names them reaches them. */
  assert.deepEqual(api.kernel.access('p_vic'), { level: 'read', registers: ['things', 'tasks', 'money', 'notes'], levels: {}, grant: grant(ids('p_vic')) }, 'G1');
  /* Tasks holds a money rate, so "everything but money" keeps it from Lee too. Keys are denied though the record has none. */
  assert.deepEqual(api.kernel.access('p_lee'), { level: 'write', registers: ['things', 'notes'], levels: {}, grant: grant(all('p_lee').filter((id) => id !== all('p_lee')[2])) }, 'G2');
  assert.deepEqual(
    api.kernel.access('p_pri'),
    { level: null, registers: ['tasks', 'money'], levels: { tasks: 'read', money: 'read' }, grant: grant([accountant], at(NOW + 90 * DAY)) },
    'G3',
  );
  assert.deepEqual(
    api.kernel.access('p_sam'),
    {
      level: null,
      registers: ['things', 'tasks'],
      levels: { things: 'read', tasks: 'write' },
      wheres: { things: { field: 'id', is: kiln }, tasks: tasksIn(kiln) },
      nots: { tasks: ['delete'] },
      grant: grant(ids('p_sam')),
    },
    'G4',
  );
  assert.deepEqual(
    api.kernel.access('p_ana'),
    { level: null, registers: ['tasks'], levels: { tasks: 'comment' }, wheres: { tasks: { field: 'stage', is: 'Review' } }, grant: grant(ids('p_ana')) },
    'G5',
  );
  assert.deepEqual(
    api.kernel.access('p_omar'),
    { level: null, registers: ['tasks'], levels: { tasks: 'read' }, wheres: { tasks: { field: 'id', in: [glaze] } }, grant: grant(ids('p_omar')) },
    'G6',
  );
  assert.deepEqual(
    api.kernel.access('p_cat'),
    { level: null, registers: ['tasks'], levels: { tasks: 'read' }, hides: { tasks: ['rate'] }, grant: grant(ids('p_cat')) },
    'G7',
  );
  assert.deepEqual(
    api.kernel.access('p_gus'),
    { level: null, registers: ['things', 'tasks'], levels: { things: 'read', tasks: 'comment' }, wheres: { things: { field: 'id', is: kiln }, tasks: tasksIn(kiln) }, grant: grant(ids('p_gus')) },
    'G8',
  );
  assert.deepEqual(
    api.kernel.access('p_ann'),
    { level: null, registers: ['money', 'notes'], levels: { money: 'append', notes: 'read' }, grant: grant(ids('p_ann')) },
    'G9: a legacy Adds only row keeps its level beside a share',
  );
});

test('WRITES: what a caller may change, where it is narrower than what they read, and denies inside allows', async () => {
  const { api, sql, kiln, mill, glaze } = await record();
  /* Reads every task, edits only those in Review: `wheres` is absent, `writes` holds the condition. */
  share(sql, 'p_ana', { lists: ['tasks'] }, 'view');
  share(sql, 'p_ana', { list: 'tasks', where: { field: 'stage', is: 'Review' } }, 'edit');
  /* Edits Kiln's tasks, with one row denied: the deny is inside both. */
  share(sql, 'p_sam', { project: kiln, lists: ['tasks'] }, 'edit');
  share(sql, 'p_sam', { list: 'tasks', rows: [glaze] }, 'view', { effect: 'deny' });
  /* A group's share reaches its member. */
  sql.exec("INSERT INTO share_group (id, name, made_by, made_at) VALUES ('gr_mill', 'Mill crew', 'p_1', ?)", at(NOW));
  sql.exec("INSERT INTO share_group_member (group_id, person_id, added_by, added_at) VALUES ('gr_mill', 'p_gus', 'p_1', ?)", at(NOW));
  share(sql, 'gr_mill', { project: mill, lists: ['tasks'] }, 'view', { kind: 'group' });
  api.kernel.accessChanged();

  const ana = api.kernel.access('p_ana')!;
  assert.deepEqual(ana.levels, { tasks: 'write' });
  assert.equal(ana.wheres, undefined);
  assert.deepEqual(ana.writes, { tasks: { field: 'stage', is: 'Review' } });

  const sam = api.kernel.access('p_sam')!;
  const inKiln = { all: [{ field: 'thing', is: kiln }, { none: [{ field: 'id', in: [glaze] }] }] };
  assert.deepEqual(sam.wheres?.tasks, inKiln);
  assert.equal(sam.writes, undefined, 'writes are left off where they are the reads');

  assert.deepEqual(api.kernel.access('p_gus')?.wheres?.tasks, { field: 'thing', is: mill }, 'G10: a group’s share');

  /* AND THE READERS HONOUR IT: Sam lists Kiln's tasks less the denied one, through the ordinary `list`. */
  const rows = value<{ rows: { fields: { what: string } }[]; matched: number }>(await api.list({ register: 'tasks' }, contextOf(api, 'p_sam')));
  assert.deepEqual(rows.rows.map((r) => r.fields.what), ['Fire the kiln']);
  assert.equal(rows.matched, 1);
  /* A list outside the grant is refused at the ceiling. */
  const notes = (await api.list({ register: 'notes' }, contextOf(api, 'p_sam'))) as { ok: boolean };
  assert.equal(notes.ok, false);
});

test('TIME, REVOKING AND THE EPOCH: a share that ended or was revoked reaches nothing, and the cache never outlives it', async () => {
  const { api, sql, clock, kiln } = await record();
  const ends = share(sql, 'p_sam', { project: kiln, lists: ['tasks'] }, 'edit', { ends: at(NOW + DAY) });
  api.kernel.accessChanged();
  const before = api.kernel.access('p_sam');
  assert.equal(before?.grant?.until, at(NOW + DAY));
  assert.equal(api.kernel.access('p_sam'), before, 'the second call is the cached answer');
  clock.advance(DAY);
  assert.equal(api.kernel.access('p_sam'), null, 'G11: an ended share is the stranger’s answer, cache or not');

  const kept = share(sql, 'p_omar', { lists: ['notes'] }, 'view');
  api.kernel.accessChanged();
  assert.ok(api.kernel.access('p_omar'));
  sql.exec('UPDATE share SET revoked_at = ? WHERE id = ?', at(clock.now()), kept);
  assert.ok(api.kernel.access('p_omar'), 'a revoke that has not moved the epoch is not seen yet');
  api.kernel.accessChanged();
  assert.equal(api.kernel.access('p_omar'), null, 'revoked, and the epoch moved');
  assert.ok(ends);

  /* A member row moves the answer whatever the epoch, since the member rows are read on every call. */
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_omar', 'notes', 'read')");
  assert.deepEqual(api.kernel.access('p_omar'), { level: null, registers: ['notes'], levels: { notes: 'read' } });

  /* A suspended guest holds nothing. */
  share(sql, 'p_cat', { lists: ['notes'] }, 'view');
  api.kernel.accessChanged();
  assert.ok(api.kernel.access('p_cat'));
  value(api.kernel.suspendMember('p_1', 'p_cat', true));
  assert.equal(api.kernel.access('p_cat'), null);

  /* A share row nobody can read is nobody's lens: fails closed rather than dropping it. */
  share(sql, 'p_lee', { lists: ['notes'] }, 'view');
  sql.exec("INSERT INTO share (id, who_kind, who, what, can, made_by, made_at) VALUES ('sh_bad', 'person', 'p_lee', '{\"lists\":7}', 'view', 'p_1', ?)", at(NOW));
  api.kernel.accessChanged();
  assert.equal(api.kernel.access('p_lee'), null);
});

test('THE COMMENT RUNG reads and proposes, and boot and version carry the grant the app keys its copy on', async () => {
  const { api, sql, kiln } = await record();
  const via = share(sql, 'p_gus', { project: kiln, lists: ['tasks'] }, 'comment');
  api.kernel.accessChanged();
  const gus = contextOf(api, 'p_gus');
  const boot = value<{ me: { level: unknown; levels: Record<string, string>; grant?: { epoch: number; via: string[] } } }>(await api.boot(gus));
  assert.deepEqual(boot.me.levels, { things: 'read', tasks: 'comment' });
  assert.deepEqual(boot.me.grant?.via, [via]);
  assert.equal(boot.me.grant?.epoch, api.kernel.accessEpoch());
  const version = value<{ grant?: { epoch: number } }>(await api.version(gus));
  assert.equal(version.grant?.epoch, api.kernel.accessEpoch());

  const listed = value<{ rows: { id: string; fields: { what: string } }[] }>(await api.list({ register: 'tasks' }, gus));
  assert.deepEqual(listed.rows.map((r) => r.fields.what).sort(), ['Fire the kiln', 'Glaze test']);
  /* Comment reaches propose and not write. */
  const edit = (await api.update({ register: 'tasks', seq: 1, patch: { what: 'Renamed' } }, gus)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(edit.ok, false);
  assert.equal(edit.refusal?.code, 'LEVEL_REQUIRED');
});

test('THE KERNEL’S LISTS ARE THE OWNER’S: no role, broad share or Admin reaches the runs or what he told them, and a grant naming one does', async () => {
  const { api, sql, kiln } = await record();
  const told = value<{ id: string }>(await api.instruct({ said: 'Fire the test tiles first' }, owner));
  const words = (r: unknown) => JSON.stringify(r).includes('Fire the test tiles first');
  const lists = ['session', 'instructions'];
  /* BY THEIR DECLARATION: the kernel's pack, not a name. */
  assert.deepEqual([...api.kernel.kernelLists()].sort(), [...lists].sort());
  assert.equal(api.kernel.catalog().lists.filter((l) => l.kernel === true).length, 2);

  for (const [person, level] of [['p_vic', 'read'], ['p_lee', 'write'], ['p_cat', 'decide']] as const) value(await api.invite({ person, name: person, level }, owner));
  share(sql, 'p_pri', { record: true }, 'view');
  share(sql, 'p_omar', { project: kiln }, 'edit');
  share(sql, 'p_ana', { lists: ['instructions'] }, 'view');
  share(sql, 'p_gus', { lists: ['instructions'] }, 'view'); // a share naming it, beside a Viewer's role
  value(await api.invite({ person: 'p_gus', name: 'Gus', level: 'read' }, owner));
  value(await api.invite({ person: 'p_sam', name: 'Sam', level: 'read', registers: { instructions: 'read' } }, owner)); // a member row naming it
  api.kernel.accessChanged();

  for (const p of ['p_vic', 'p_lee', 'p_cat', 'p_pri', 'p_omar']) {
    const ctx = contextOf(api, p);
    for (const register of lists) {
      const got = (await api.list({ register }, ctx)) as { ok: boolean; refusal?: { code: string; fix: string } };
      assert.equal(got.ok, false, `${p} reads ${register}`);
      assert.match(got.refusal!.fix, /is kept for the owner/u);
    }
    assert.equal(words(await api.get({ spoken: told.id } as never, ctx)), false, `${p} reads the instruction`);
    assert.equal(words(await api.search({ q: 'tiles' }, ctx)), false, `${p} finds the instruction`);
    const boot = value<{ registers: { id: string }[] }>(await api.boot(ctx));
    assert.deepEqual(boot.registers.filter((r) => lists.includes(r.id)), [], `${p} is shown a kernel list on the rail`);
  }
  /* A GRANT THAT NAMES IT IS THE OWNER SAYING SO. */
  for (const p of ['p_ana', 'p_gus', 'p_sam']) {
    const ctx = contextOf(api, p);
    assert.equal(api.kernel.access(p)?.levels.instructions, 'read', p);
    assert.ok(words(await api.list({ register: 'instructions' }, ctx)), `${p} is not shown what the share names`);
    assert.equal(((await api.list({ register: 'session' }, ctx)) as { ok: boolean }).ok, false, `${p} reads the runs`);
  }
  /* AND THE OWNER AND HIS AGENTS READ BOTH. */
  assert.ok(words(await api.list({ register: 'instructions' }, owner)));
});

test('OWNER NON-INTERFERENCE: the owner’s access, context and boot are the same bytes with shares on the record and without', async () => {
  const bare = await record();
  const shared = await record();
  const ownerHeld = (api: Api) => JSON.stringify(api.kernel.access('p_1'));
  /* LESS `names`: the owner's bell names who they share with (`namesOf`), which is the one thing shares may add to it. */
  const ownerBoot = async (api: Api) => {
    const { names: _names, ...boot } = value<Record<string, unknown>>(await api.boot(owner));
    return JSON.stringify(boot);
  };

  const was = ownerHeld(shared.api);
  const booted = await ownerBoot(shared.api);
  assert.equal(was, JSON.stringify({ level: 'owner', registers: null, levels: {} }));
  assert.equal(was, JSON.stringify(memberAccess(shared.sql, 'p_1')), 'the lens adds nothing for an owner');

  share(shared.sql, 'p_sam', { project: shared.kiln, lists: ['tasks'] }, 'edit');
  share(shared.sql, 'p_pri', { lists: { has: 'money' } }, 'view', { hide: { types: ['money'] } });
  share(shared.sql, 'p_1', { lists: ['notes'] }, 'view', { effect: 'deny' }); // a share naming the owner is never read
  shared.api.kernel.accessChanged();

  assert.equal(ownerHeld(shared.api), was);
  assert.equal(ownerHeld(shared.api), ownerHeld(bare.api));
  assert.equal(await ownerBoot(shared.api), booted);
  const v = value<Record<string, unknown>>(await shared.api.version(owner));
  assert.equal(Object.hasOwn(v, 'grant'), false, 'an owner’s version carries no grant');
});

test('LENS SPEED (§2.13): 20 shares and 3 groups, cold at most 3 ms and cached at most 0.05 ms, median of 200', async (t) => {
  const { api, sql, kiln, mill } = await record();
  for (const g of ['gr_a', 'gr_b', 'gr_c']) {
    sql.exec('INSERT INTO share_group (id, name, made_by, made_at) VALUES (?, ?, ?, ?)', g, g, 'p_1', at(NOW));
    sql.exec('INSERT INTO share_group_member (group_id, person_id, added_by, added_at) VALUES (?, ?, ?, ?)', g, 'p_pri', 'p_1', at(NOW));
  }
  const shapes: [unknown, string, Parameters<typeof share>[4]][] = [
    [{ lists: { has: 'money' } }, 'view', { ends: at(NOW + 90 * DAY) }],
    [{ lists: { role: 'keys' } }, 'view', { effect: 'deny' }],
    [{ project: kiln, lists: ['tasks'] }, 'edit', { caps: { delete: false } }],
    [{ project: mill }, 'comment', {}],
    [{ list: 'tasks', where: { all: [{ field: 'stage', is: 'Review' }, { field: 'what', contains: 'glaze' }] } }, 'comment', {}],
    [{ list: 'notes', where: { field: 'body', contains: 'Kiln' } }, 'view', { hide: { notes: ['body'] } }],
    [{ list: 'money', where: { field: 'payee', is: 'Clay Co' } }, 'edit', {}],
    [{ list: 'tasks', rows: ['r_1', 'r_2', 'r_3'] }, 'view', { effect: 'deny' }],
  ];
  for (let i = 0; i < 20; i++) {
    const [what, can, more] = shapes[i % shapes.length]!;
    share(sql, i < 14 ? 'p_pri' : (['gr_a', 'gr_b', 'gr_c'][i % 3] as string), what, can, { ...more, ...(i < 14 ? {} : { kind: 'group' as const }) });
  }
  api.kernel.accessChanged();
  assert.ok(api.kernel.access('p_pri'), 'Priya holds something');

  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const time = (fn: () => unknown): number => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };
  /* COLD: no cache, so each call reads the rows and folds the lens, against the catalog the kernel holds. */
  const lens = { catalog: () => api.kernel.catalog(), nowMs: NOW, tz: () => 'UTC', people: () => null };
  for (let i = 0; i < 20; i++) memberAccess(sql, 'p_pri', null, lens);
  const cold = median(Array.from({ length: 200 }, () => time(() => memberAccess(sql, 'p_pri', null, lens))));
  for (let i = 0; i < 20; i++) api.kernel.access('p_pri');
  const cached = median(Array.from({ length: 200 }, () => time(() => api.kernel.access('p_pri'))));
  t.diagnostic(`lens cold ${cold.toFixed(3)} ms, cached ${cached.toFixed(4)} ms`);
  assert.ok(cold <= 3, `cold ${cold.toFixed(3)} ms`);
  assert.ok(cached <= 0.05, `cached ${cached.toFixed(4)} ms`);
});

/* ── Slice 6: hidden fields, the two switches a share turns off, and the doors' firewall ── */

test('HIDDEN FIELDS (§2.7): a hidden field is in none of her schema, rows, history or filters, and a patch naming it names a field the list lacks', async () => {
  const { api, sql } = await record();
  share(sql, 'p_vic', { lists: ['tasks'] }, 'edit', { hide: { tasks: ['rate'] } });
  api.kernel.accessChanged();
  const vic = contextOf(api, 'p_vic');
  assert.deepEqual(vic.hides, { tasks: ['rate'] });

  const schema = value<{ fields: { id: string }[] }>(await api.schema({ register: 'tasks' }, vic));
  assert.deepEqual(schema.fields.map((f) => f.id), ['what', 'thing', 'stage']);
  const listed = value<{ rows: { fields: Record<string, unknown> }[] }>(await api.list({ register: 'tasks' }, vic));
  assert.equal(listed.rows.length, 3);
  assert.ok(listed.rows.every((r) => !Object.hasOwn(r.fields, 'rate')));
  const got = value<{ fields: Record<string, unknown> }>(await api.get({ register: 'tasks', seq: 1 }, vic));
  assert.equal(got.fields.what, 'Glaze test');
  assert.equal(Object.hasOwn(got.fields, 'rate'), false);
  const past = value<{ kind: string; field: string | null; to: unknown }[]>(await api.history({ register: 'tasks', seq: 1 }, vic));
  assert.ok(past.length > 0 && !JSON.stringify(past).includes('4000'), JSON.stringify(past));

  /* HER FILTER AND HER ORDER ARE READ AS IF THE FIELD WERE NOT THERE. */
  for (const asked of [{ where: { field: 'rate', present: true } }, { order: [{ field: 'rate', dir: 'desc' as const }] }]) {
    const out = (await api.list({ register: 'tasks', ...asked }, vic)) as { ok: boolean; refusal?: { code: string } };
    assert.equal(out.refusal?.code, 'FIELD_UNKNOWN', JSON.stringify(asked));
  }

  /* A PATCH OR A NEW ROW NAMING IT IS REFUSED, AND THE ROW KEEPS WHAT IT HELD. */
  const patched = (await api.update({ register: 'tasks', seq: 1, patch: { rate: { amount: 1, currency: 'GBP' } } }, vic)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.deepEqual([patched.refusal?.code, patched.refusal?.at], ['FIELD_UNKNOWN', 'rate']);
  const made = (await api.create({ register: 'tasks', fields: { what: 'New', rate: { amount: 1, currency: 'GBP' } } }, vic)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(made.refusal?.code, 'FIELD_UNKNOWN');
  value(await api.update({ register: 'tasks', seq: 1, patch: { what: 'Glaze test, again' } }, vic));
  assert.deepEqual(value<{ fields: { rate: unknown } }>(await api.get({ register: 'tasks', seq: 1 }, owner)).fields.rate, { amount: 4_000, currency: 'GBP' });
});

test('NOTS: history off shows the row and not its past, and delete off changes rows and never deletes or restores one', async () => {
  const { api, sql } = await record();
  share(sql, 'p_sam', { lists: ['tasks'] }, 'edit', { caps: { history: false, delete: false } });
  api.kernel.accessChanged();
  const sam = contextOf(api, 'p_sam');
  assert.deepEqual(sam.nots, { tasks: ['history', 'delete'] });

  const past = (await api.history({ register: 'tasks', seq: 1 }, sam)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.deepEqual([past.ok, past.refusal?.fix], [false, 'You can see this row, not its past.']);
  /* A ROW NOBODY HOLDS IS STILL ANSWERED AS ONE. */
  assert.deepEqual(value(await api.history({ register: 'tasks', seq: 999 }, sam)), []);

  const gone = (await api.update({ register: 'tasks', seq: 1, patch: { deleted_at: at(NOW) } }, sam)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.deepEqual([gone.ok, gone.refusal?.code, gone.refusal?.at], [false, 'FORBIDDEN', 'deleted_at']);
  assert.equal(api.kernel.get('tasks#1')?.deleted_at, null);
  value(await api.update({ register: 'tasks', seq: 1, patch: { stage: 'Done' } }, sam));
  /* AND THE OWNER, WHO HOLDS EVERY CAPABILITY, STILL DELETES. */
  value(await api.update({ register: 'tasks', seq: 1, patch: { deleted_at: at(NOW) } }, owner));
});

test('THE FIREWALL (§2.5 item 6): a hidden field left on a row at either door is taken off, and raised as fault lens.firewall naming the method', async () => {
  const { handlersFor, serveApi } = await import('../../host/src/index.ts');
  const { serveMcp } = await import('../../mcp/src/http.ts');
  const { api, sql } = await record();
  share(sql, 'p_vic', { lists: ['tasks'] }, 'view', { hide: { tasks: ['rate'] } });
  api.kernel.accessChanged();
  const vic = contextOf(api, 'p_vic');
  const raw = api.kernel.get('tasks#1')!;
  assert.deepEqual(raw.fields.rate, { amount: 4_000, currency: 'GBP' });
  const opened = () => value<{ faults: { cause: string; kind: string }[] }>(api.kernel.faults()).faults.filter((f) => f.kind === 'lens.firewall').map((f) => f.cause);

  /* A MASKED PATH RAISES NOTHING. */
  const handlers = handlersFor(api as never);
  const fine = (await (await serveApi(new Request('https://brain.dog/api/get?register=tasks&seq=1'), handlers, vic)).json()) as { value: { fields: Record<string, unknown> } };
  assert.equal(Object.hasOwn(fine.value.fields, 'rate'), false);
  assert.deepEqual(opened(), []);

  /* A PATH THAT FORGOT TO MASK: the row leaves without the field, and the fault names the method. */
  handlers.get = async () => ({ ok: true, value: raw });
  const walled = (await (await serveApi(new Request('https://brain.dog/api/get?register=tasks&seq=1'), handlers, vic)).json()) as { value: { fields: Record<string, unknown> } };
  assert.equal(walled.value.fields.what, 'Glaze test');
  assert.equal(Object.hasOwn(walled.value.fields, 'rate'), false);
  assert.deepEqual(opened(), ['lens.firewall#get']);

  /* AND AT THE MCP DOOR, on the structured half, which names the row by its spoken id. A text half written in words is
     past any key to take off; the fault is what finds the path. */
  const leaky = { ...api, get: async () => ({ ok: true, value: raw }) };
  const request = new Request('https://brain.dog/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get', arguments: { spoken: 'tasks#1', format: 'json' } } }),
  });
  const reply = (await (await serveMcp(request, leaky as never, vic)).json()) as { result: { structuredContent: { fields: Record<string, unknown> } } };
  assert.equal(reply.result.structuredContent.fields.what, 'Glaze test');
  assert.equal(Object.hasOwn(reply.result.structuredContent.fields, 'rate'), false);
  assert.deepEqual(opened().sort(), ['lens.firewall#get', 'lens.firewall#mcp get']);

  /* AN OWNER HAS NOTHING HIDDEN, SO NOTHING IS TAKEN OFF HER ANSWER. */
  const mine = (await (await serveApi(new Request('https://brain.dog/api/get?register=tasks&seq=1'), handlers, owner)).json()) as { value: { fields: Record<string, unknown> } };
  assert.deepEqual(mine.value.fields.rate, { amount: 4_000, currency: 'GBP' });
});
