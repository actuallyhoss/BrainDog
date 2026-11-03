/**
 * The owner themselves, what they call their lists, and a setting named by its key alone, in an arrangement.
 *
 * THESE WERE A SCRIPT IN THE BROWSER (`apps/web/src/routes/start/accept.ts`): meet the person and mark the row as them,
 * rename each module's lists in its declaration, and ask every module whether it keeps `home_currency`. A closed tab
 * left some of it done. They are the arranger's now, read against the record as the add-ons leave it and written by
 * the one call that installs those add-ons.
 *
 * WHAT IS HELD: `me` is the owner's own setup's and no proposal's; the row is marked as them only when this call made
 * it or found it by their address; with People off the name goes to their account and to no list; a name is a label of
 * the use case that speaks and rewrites no declaration; a bare key finds the add-on that declares it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack, type Host, type Installed } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';

import { arranger, type CatalogueEntry } from '../src/arrange.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const OWNER = 'p_owner';
const OWN = { own: true };

const made = (pack: string, summary: string, more: Record<string, unknown>) => ({ pack, version: '1.0.0', summary, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, ...more });

/** A list that plays `meets`, with the part that says a row is the owner and a note. */
const PEOPLE = made('people', 'Who you work with.', {
  declarations: [
    {
      register: 'people',
      name: 'People',
      title: 'name',
      meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', self: 'self' },
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'email', type: 'email', unique: true, index: true },
        { id: 'met', type: 'list', of: 'text' },
        { id: 'merged_into', type: 'ref', to: 'people' },
        { id: 'self', type: 'bool' },
        { id: 'note', type: 'text' },
      ],
    },
  ],
});
const WORK = made('work', 'Tasks.', { declarations: [{ register: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }] });
/** The add-on that keeps the currency, which nothing outside it is told. */
const MONEY = made('money', 'Accounts.', {
  config: { home_currency: { type: 'text', default: 'USD', label: 'Home currency' } },
  declarations: [{ register: 'accounts', name: 'Accounts', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
});
const STUDY = (() => {
  const u = normaliseUseCase({
    usecase: 'study',
    version: '1.0.0',
    title: 'Study',
    summary: 'Courses and what is due.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: ['homework'],
    modules: ['work'],
    voice: { home: 'Today' },
    labels: { tasks: 'Homework' },
    pack: made('usecase-study', 'Courses.', { declarations: [{ register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }] }),
  });
  assert.ok(u.ok, JSON.stringify(u));
  return useCasePack(u.value)!;
})();

const CATALOGUE: CatalogueEntry[] = [
  { id: 'people', kind: 'pack', title: 'People', summary: 'Who you work with.', modules: [], doc: () => PEOPLE },
  { id: 'work', kind: 'pack', title: 'Work', summary: 'Tasks.', modules: [], doc: () => WORK },
  { id: 'money', kind: 'pack', title: 'Money', summary: 'Accounts.', modules: [], doc: () => MONEY },
  { id: 'usecase-study', kind: 'usecase', title: 'Study', summary: 'Courses and what is due.', modules: ['work'], doc: () => STUDY },
];

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal!;
};
type Filed = Record<string, unknown>;

async function record() {
  const sql = openSqlite();
  const k: Kernel = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: OWNER, email: 'sam@example.com' } }).ok);
  const host = (actor: string): Host => ({
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, fields as never, { actor, cascade: false }) as never,
    remember: (row) => k.rememberPack({ ...row, by: actor } as never),
    forget: (id) => k.forgetPack(id),
    claimed: (pack) => k.packClaims(pack),
  });
  const installed = (): Installed => ({ format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() });
  const a = arranger({ kernel: k, catalogue: CATALOGUE, installed, host });
  /** Read as the owner's own setup and applied, as `setup` does a piece. */
  const own = async (body: Filed) => value<Record<string, string[]>>(await a.apply('arrange', value<Filed>(await a.prepare('arrange', body, OWN)), OWNER, OWN));
  const people = () => sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq").map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  return { k, a, sql, own, people };
}

test('THE OWNER IS THE FIRST PERSON IN THE LIST THE SAME ARRANGEMENT INSTALLS, met by their address and marked as them', async () => {
  const { own, people, sql } = await record();
  const done = await own({ why: ['A first run.'], packs: { install: ['people'] }, me: { name: 'Sam Reed', email: 'Sam@Example.com', note: 'I run a small studio.' } });
  assert.deepEqual(done.installed, ['people']);
  assert.deepEqual(done.me, ['people#1']);
  const [row, ...rest] = people();
  assert.equal(rest.length, 0);
  assert.equal(row?.name, 'Sam Reed');
  assert.equal(row?.email, 'sam@example.com');
  assert.equal(row?.self, true);
  assert.equal(row?.note, 'I run a small studio.');
  assert.match(String((row?.met as string[])[0]), /onboarding/);
  sql.close();
});

test('A SECOND PRESS FINDS THEM BY THE ADDRESS AND ADDS NOBODY, and keeps the note they have', async () => {
  const { own, people, sql } = await record();
  await own({ why: ['A first run.'], packs: { install: ['people'] }, me: { name: 'Sam Reed', email: 'sam@example.com', note: 'I run a small studio.' } });
  const again = await own({ why: ['Pressed again.'], me: { name: 'Sam Reed', email: 'sam@example.com', note: 'Another line.' } });
  assert.deepEqual(again.me, ['people#1']);
  assert.equal(people().length, 1);
  assert.equal(people()[0]?.note, 'I run a small studio.');
  sql.close();
});

test('A NAME WITH NO ADDRESS IS WRITTEN AS A PLAIN ENTRY MARKED AS THEM, once however often it is pressed', async () => {
  const { own, people, sql } = await record();
  const done = await own({ why: ['A first run.'], packs: { install: ['people'] }, me: { name: 'Layla', note: 'A student.' } });
  assert.deepEqual(done.me, ['people#1']);
  assert.deepEqual(people(), [{ name: 'Layla', note: 'A student.', self: true }]);
  const again = await own({ why: ['Pressed again.'], me: { name: 'Layla' } });
  assert.deepEqual(again.me, ['people#1']);
  assert.equal(people().length, 1);
  sql.close();
});

test('SOMEBODY OF THE SAME NAME IS NOT MARKED AS THE OWNER: only a row this call made, or one found by the address', async () => {
  const { k, own, people, sql } = await record();
  await own({ why: ['People first.'], packs: { install: ['people'] } });
  assert.ok(k.create('people', { name: 'Sam Reed', email: 'other.sam@example.net' } as never, { actor: OWNER }).ok);
  await own({ why: ['A first run.'], me: { name: 'Sam Reed', email: 'sam@example.com' } });
  const rows = people();
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.email === 'other.sam@example.net')?.self, undefined);
  assert.equal(rows.find((r) => r.email === 'sam@example.com')?.self, true);
  sql.close();
});

test('WITH PEOPLE OFF THE NAME IS KEPT ON THEIR ACCOUNT AND IN NO LIST, and People stays off', async () => {
  const { k, own, people, sql } = await record();
  await own({ why: ['People first.'], packs: { install: ['people'] } });
  assert.ok(k.disablePack('people', { actor: OWNER }).ok);
  const done = await own({ why: ['A first run.'], packs: { install: ['work'] }, me: { name: 'Sam Reed', email: 'sam@example.com' } });
  assert.deepEqual(done.me, ['account']);
  assert.equal(people().length, 0);
  assert.equal(k.members().find((m) => m.person_id === OWNER)?.name, 'Sam Reed');
  assert.notEqual(k.packStates().find((s) => s.id === 'people')?.disabled_at, null);
  sql.close();
});

test('me IS THE OWNER’S OWN SETUP’S: a proposal that carries it is refused, and a name that is no name says why', async () => {
  const { a, sql } = await record();
  const proposed = refusal(await a.prepare('arrange', { why: ['x'], packs: { install: ['people'] }, me: { name: 'Sam Reed' } }));
  assert.equal(proposed.code, 'FORBIDDEN');
  assert.equal(proposed.at, 'body.me');
  const blank = refusal(await a.prepare('arrange', { why: ['x'], me: { name: '  ' } }, OWN));
  assert.equal(blank.at, 'body.me.name');
  const form = refusal(await a.prepare('arrange', { why: ['x'], me: { name: 'Your Name' } }, OWN));
  assert.equal(form.code, 'VALUE_MALFORMED');
  assert.equal(refusal(await a.prepare('arrange', { why: ['x'], me: 'Sam' }, OWN)).at, 'body.me');
  /* And a `me` slipped into an applied body is not read without the owner's own setup. */
  const quiet = value<Record<string, string[]>>(await a.apply('arrange', { packs: { install: ['people'] }, plan: [], me: { name: 'Sam Reed' } }, OWNER));
  assert.equal(quiet.me, undefined);
  sql.close();
});

test('WHAT THEY CALL A LIST IS THE LABEL OF THE USE CASE THAT SPEAKS, filed as its setting, and no declaration is rewritten', async () => {
  const { k, a, own, sql } = await record();
  const body = { why: ['They call their courses modules.'], usecase: 'study', names: { courses: 'Modules', 'courses:one': 'Module', tasks: 'Reading' } };
  const filed = value<{ settings: { pack: string; values: Record<string, string> }[]; names: Record<string, string>; packs: { install: string[] } }>(await a.prepare('arrange', body));
  assert.deepEqual(filed.packs.install, ['work', 'usecase-study']);
  assert.deepEqual(filed.settings, [{ pack: 'usecase-study', values: { label_courses: 'Modules', one_courses: 'Module', label_tasks: 'Reading' }, before: { label_courses: 'Courses', one_courses: null, label_tasks: 'Homework' } }]);
  /* Decide and each part say the list by that word, as the rail will. */
  assert.equal(filed.names['register.courses'], 'Modules');
  assert.equal(filed.names['register.tasks'], 'Reading');

  const done = await own(body);
  assert.deepEqual(done.settings, ['usecase-study']);
  const kept = value<{ values: Record<string, unknown> }>(k.packConfig('usecase-study')).values;
  assert.equal(kept.label_courses, 'Modules');
  assert.equal(kept.label_tasks, 'Reading');
  /* The lists keep the names their add-ons gave them. */
  assert.equal(k.register('courses')?.name, 'Courses');
  assert.equal(k.register('tasks')?.name, 'Tasks');
  sql.close();
});

test('A NAME WITH NOWHERE TO GO IS REFUSED TO A PROPOSAL AND SAID TO THE OWNER, who cannot know which lists a use case names', async () => {
  const { a, sql } = await record();
  const stray = { why: ['x'], usecase: 'study', names: { invoices: 'Bills' } };
  const proposed = refusal(await a.prepare('arrange', stray));
  assert.equal(proposed.code, 'FIELD_UNKNOWN');
  assert.equal(proposed.at, 'body.names.invoices');
  assert.match(proposed.fix, /^Study keeps no name for a list called invoices/);
  const owned = value<{ skipped: { part: string; why: string }[]; settings?: unknown[] }>(await a.prepare('arrange', stray, OWN));
  assert.deepEqual(owned.skipped, [{ part: 'name:invoices', why: 'Study keeps no name for a list called invoices, so Bills was not kept.' }]);
  assert.equal(owned.settings, undefined);

  /* With no use case there is nobody to keep a name. */
  const voiceless = refusal(await a.prepare('arrange', { why: ['x'], packs: { install: ['work'] }, names: { tasks: 'Bakes' } }));
  assert.equal(voiceless.code, 'REQUIRED_MISSING');
  const said = value<{ skipped: { part: string; why: string }[] }>(await a.prepare('arrange', { why: ['x'], packs: { install: ['work'] }, names: { tasks: 'Bakes' } }, OWN));
  assert.match(said.skipped[0]!.why, /none is on, so Bakes was not kept/);
  assert.equal(refusal(await a.prepare('arrange', { why: ['x'], usecase: 'study', names: { courses: ' ' } })).at, 'body.names.courses');
  assert.equal(refusal(await a.prepare('arrange', { why: ['x'], usecase: 'study', names: ['Modules'] })).at, 'body.names');
  sql.close();
});

test('A SETTING NAMED BY ITS KEY ALONE GOES TO THE ADD-ON THAT DECLARES IT: one this installs is filled with it, one that is on is set', async () => {
  const { k, a, own, sql } = await record();
  const body = { why: ['They are paid in pounds.'], packs: { install: ['money', 'work'] }, settings: [{ values: { home_currency: 'GBP' } }] };
  const filed = value<{ settings: { pack: string; values: Record<string, string>; before: Record<string, string> }[] }>(await a.prepare('arrange', body));
  assert.deepEqual(filed.settings, [{ pack: 'money', values: { home_currency: 'GBP' }, before: { home_currency: 'USD' } }]);
  const done = await own(body);
  assert.deepEqual(done.installed, ['money', 'work']);
  assert.deepEqual(done.settings, ['money']);
  assert.equal(value<{ values: Record<string, unknown> }>(k.packConfig('money')).values.home_currency, 'GBP');

  /* On now, and named the same way. */
  const later = await own({ why: ['Egypt now.'], settings: [{ values: { home_currency: 'EGP' } }] });
  assert.deepEqual(later.settings, ['money']);
  assert.equal(value<{ values: Record<string, unknown> }>(k.packConfig('money')).values.home_currency, 'EGP');

  /* A key nothing declares: refused to a proposal by its key, and said to the owner with the rest still written. */
  const mixed = { why: ['x'], settings: [{ values: { home_currency: 'USD', week_starts: 'sat' } }] };
  const proposed = refusal(await a.prepare('arrange', mixed));
  assert.equal(proposed.code, 'FIELD_UNKNOWN');
  assert.equal(proposed.at, 'body.settings[0].values.week_starts');
  const owned = value<{ skipped: { part: string; why: string }[]; settings: { pack: string }[] }>(await a.prepare('arrange', mixed, OWN));
  assert.deepEqual(owned.skipped, [{ part: 'setting:week_starts', why: 'No plugin here keeps a setting called week_starts, so it was not set.' }]);
  assert.deepEqual(owned.settings.map((s) => s.pack), ['money']);
  /* A value the add-on refuses is still refused, at the key. */
  assert.equal(refusal(await a.prepare('arrange', { why: ['x'], settings: [{ values: { home_currency: 7 } }] }, OWN)).at, 'body.settings[0].values.home_currency');
  sql.close();
});
