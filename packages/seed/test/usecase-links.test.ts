/**
 * A use case's examples point at each other once they are in (`links.ts`): a seed carries no link (42 §5.2), so the
 * installer links them by title, only example rows whose field is still empty, and never fails for a refused write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { USE_CASES, modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument, moduleExamples } from '../src/usecases/install.ts';
import { GENERAL_GUIDE, planFor } from '../src/usecases/guide-kinds.ts';
import { carryForward, exampleLinks, linkExamples, titleFieldOf, type CarryIo, type LinkIo, type LinkRow } from '../src/usecases/links.ts';

const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Body = Record<string, unknown>;
const packOf = (id: string) => (useCase(id)!.pack ?? {}) as { declarations?: Body[]; seeds?: { register: string; fields: Body }[] };

test('EVERY LINK NAMES A REF FIELD AND TWO EXAMPLE ROWS THE USE CASE REALLY SEEDS', () => {
  let counted = 0;
  for (const u of USE_CASES) {
    const pack = packOf(u.usecase);
    for (const l of exampleLinks(u.usecase)) {
      counted += 1;
      /* A LIST A MODULE HOLDS COUNTS TOO: a team's tickets are Work's tasks. */
      const decl = [...(pack.declarations ?? []), ...u.modules.flatMap((m) => (firstPartyDocument(m)?.declarations ?? []) as Body[])].find((d) => d.register === l.register && d.page === undefined);
      /* AND A FIELD THE USE CASE LAYS ON A MODULE'S LIST (`extends`): the founder's organisation on Projects' Numbers, since 3.0.0. */
      const laid = ((pack as { extends?: Record<string, { fields?: Body[] }> }).extends?.[`register.${l.register}`]?.fields ?? []) as Body[];
      const field = [...((decl?.fields as Body[] | undefined) ?? []), ...laid].find((f) => f.id === l.field);
      if (l.list) assert.equal(`${String(field?.type)} of ${String(field?.of)}`, 'list of ref', `${u.usecase}: ${l.register}.${l.field}`);
      else assert.equal(field?.type, 'ref', `${u.usecase}: ${l.register}.${l.field}`);
      assert.equal(field?.to, l.to, `${u.usecase}: ${l.register}.${l.field} points at ${String(field?.to)}`);
      const seeded = (register: string, title: string) =>
        /* A MODULE'S EXAMPLES COUNT TOO, so a person's step can point at a project Projects was given for this use case. */
        [...(pack.seeds ?? []), ...(moduleExamples(u) as { register: string; fields: Body }[])].some(
          (s) => s.register === register && s.fields[titleFieldOf(u.usecase, register) ?? ''] === title,
        );
      assert.ok(seeded(l.register, l.title), `${u.usecase}: no example ${l.register} titled ${l.title}`);
      assert.ok(seeded(l.to, l.target), `${u.usecase}: no example ${l.to} titled ${l.target}`);
    }
  }
  assert.ok(counted > 0);
  assert.deepEqual(exampleLinks('usecase-guide'), exampleLinks('guide'));
  assert.deepEqual(exampleLinks('business'), []);
  /* PERSONAL AND STUDENT CARRY NO EXAMPLE ROW SINCE PERSONAL 2.0.0 AND STUDENT 1.3.0, so nothing of theirs links. */
  assert.deepEqual(exampleLinks('personal'), []);
  assert.deepEqual(exampleLinks('student'), []);
});

test('ONLY AN EXAMPLE WITH THE FIELD EMPTY IS LINKED, AND A REFUSED WRITE IS SKIPPED', async () => {
  /* THE GUIDE'S LINKS ARE ITS FORMED PLAN'S since personal-and-guide-99, handed to linkExamples as a host does. */
  const GENERAL = { links: planFor(GENERAL_GUIDE).links };
  const STEP = 'Write one sentence about what this is and who it is for';
  const rows: Record<string, LinkRow[]> = {
    milestones: [{ seq: 4, fields: { what: 'Say what it is and who it is for', tags: ['example'] } }],
    steps: [{ seq: 1, fields: { what: STEP, tags: ['example'] } }],
  };
  const writes: string[] = [];
  const io: LinkIo = {
    rows: async (r) => rows[r] ?? null,
    link: async (register, seq, field, spoken) => {
      writes.push(`${register}#${seq}.${field}=${spoken}`);
      return true;
    },
  };
  assert.equal(await linkExamples(io, 'guide', GENERAL), 1);
  assert.deepEqual(writes, ['steps#1.milestone=milestones#4']);

  /* A ROW SOMEBODY WROTE, WITH THE SAME TITLE, IS NOT AN EXAMPLE AND IS LEFT ALONE; a refusal counts nothing. */
  writes.length = 0;
  rows.steps = [{ seq: 1, fields: { what: STEP, tags: [] } }];
  assert.equal(await linkExamples(io, 'guide', GENERAL), 0);
  assert.deepEqual(writes, []);
  rows.steps = [{ seq: 1, fields: { what: STEP, tags: ['example'] } }];
  assert.equal(await linkExamples({ ...io, link: async () => false }, 'guide', GENERAL), 0);
  assert.equal(await linkExamples({ rows: async () => { throw new Error('down'); }, link: io.link }, 'guide', GENERAL), 0);
});

test('ON A REAL RECORD, A TEAM OPENS WITH ITS EXAMPLES LINKED (the guide\'s formed plan is linked in guide.test.ts)', async () => {
  for (const id of ['team']) {
    const u = useCase(id)!;
    const sql = openSqlite();
    const k: Kernel = await openRecord(sql, fixedClock(NOW));
    const host: Host = {
      count: (register) => k.count(register),
      stage: (batch) => k.stageInstall(batch as never),
      transaction: (fn) => k.transaction(fn),
      reload: () => k.reload(),
      retire: (ids) => k.retire(ids),
      seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
      remember: (row) => k.rememberPack(row),
      forget: (x) => k.forgetPack(x),
      claimed: (pack) => k.packClaims(pack),
    };
    const held = () => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice(9));
    const put = async (doc: unknown) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
      const diff = await plan(pack, state);
      value(await install(pack, diff, host, diff.planHash));
    };
    for (const m of modulesFor(u, ['people'])) {
      if (m === 'agents') continue;
      const holds = new Set([...held(), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
      await put(moduleDocument(u, m, { today: TODAY, holds, examples: true }));
    }
    await put(carriedDocument(u, TODAY, null, { examples: true }));

    const io: LinkIo = {
      rows: async (register) => {
        const read = k.list({ register, limit: 200 });
        return read.ok ? read.value.rows : null;
      },
      link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner', cascade: false }).ok,
    };
    const links = exampleLinks(id);
    assert.equal(await linkExamples(io, id), links.length, id);
    assert.equal(await linkExamples(io, id), 0, `${id}: a second pass links nothing again`);
    for (const l of links) {
      const row = value<{ rows: LinkRow[] }>(k.list({ register: l.register, limit: 50 })).rows.find((r) => r.fields[titleFieldOf(id, l.register)!] === l.title);
      assert.ok(row?.fields[l.field], `${id}: ${l.register} ${l.title} has no ${l.field}`);
    }
    sql.close();
  }
});

test('A FILE UNDER ITS OWN ID LINKS ITS EXAMPLES BY THE LINKS IT DECLARES, reading title fields from its declarations', async () => {
  const rows: Record<string, LinkRow[]> = {
    books: [{ seq: 3, fields: { name: 'Middlemarch', tags: ['example'] } }],
    meetings: [{ seq: 1, fields: { what: 'First meeting', tags: ['example'] } }],
    accounts: [{ seq: 7, fields: { name: 'Club kitty', tags: ['example'] } }],
    dues: [{ seq: 2, fields: { what: 'Autumn dues', tags: ['example'] } }],
  };
  const made: [string, number, string, string | readonly string[]][] = [];
  const io: LinkIo = { rows: async (r) => rows[r] ?? null, link: async (r, seq, field, spoken) => (made.push([r, seq, field, spoken]), true) };
  const declarations = [
    { register: 'books', title: 'name' },
    { register: 'meetings', title: 'what' },
    { register: 'dues', title: 'what' },
  ];
  assert.equal(await linkExamples(io, 'reading-club'), 0, 'an id this build does not know has no links of its own');
  const links = [
    { register: 'meetings', title: 'First meeting', field: 'book', to: 'books', target: 'Middlemarch' },
    /* A MODULE'S LIST THE FILE DOES NOT DECLARE is read by its first-party title field. */
    { register: 'dues', title: 'Autumn dues', field: 'account', to: 'accounts', target: 'Club kitty' },
  ];
  assert.equal(await linkExamples(io, 'reading-club', { links, declarations }), 2);
  assert.deepEqual(made, [
    ['meetings', 1, 'book', 'books#3'],
    ['dues', 2, 'account', 'accounts#7'],
  ]);
});

test('A PERSONAL RECORD FROM BEFORE THE LOG KEEPS ITS PROGRESS: each typed amount becomes one row toward its goal on update', async () => {
  const u = useCase('personal')!;
  const sql = openSqlite();
  const k: Kernel = await openRecord(sql, fixedClock(NOW));
  const host: Host = {
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
    remember: (row) => k.rememberPack(row),
    forget: (x) => k.forgetPack(x),
    claimed: (pack) => k.packClaims(pack),
  };
  const held = () => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice(9));
  const put = async (doc: unknown) => {
    const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, host, diff.planHash));
  };
  /* A RECORD THIS OLD WAS GIVEN PROJECTS WITH PERSONAL, UNTIL 2.11.0 (2cb750068). */
  for (const m of modulesFor(u, ['people', 'portfolio'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(carriedDocument(u, TODAY, null, { examples: true }));
  /* WHAT 1.0.0 LEFT: a goal and a savings goal with their progress typed on them, and one with none. */
  const actor = { actor: 'p_owner', cascade: false };
  value(k.create('goals', { what: 'Swim 20 lengths', kind: 'goal', target: 20, done: 12, state: 'active' }, actor));
  value(k.create('goals', { what: 'Learn to juggle', kind: 'goal', target: 1, state: 'active' }, actor));
  value(k.create('savings_goals', { name: 'New bike', target: { amount: 60_000, currency: 'GBP' }, saved: { amount: 21_500, currency: 'GBP' }, state: 'saving' }, actor));

  const io: CarryIo = {
    rows: async (register) => {
      const read = k.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async () => false,
    create: async (register, fields) => k.create(register, fields, actor).ok,
    clear: async (register, seq, field) => k.update(register, `${register}#${seq}`, { [field]: null }, actor).ok,
  };
  assert.equal(await carryForward(io, 'personal', '1.2.0', TODAY), 0, 'a record already on the log moves nothing');
  assert.equal(await carryForward(io, 'student', '1.0.0', TODAY), 0, 'a use case with nothing to carry moves nothing');
  assert.equal(await carryForward(io, 'personal', '1.0.0', TODAY), 2);
  const rows = (register: string) => value<{ rows: LinkRow[] }>(k.list({ register, limit: 200 })).rows;
  const swim = rows('goals').find((r) => r.fields.what === 'Swim 20 lengths')!;
  const logged = rows('goal_log').filter((r) => !((r.fields.tags as string[] | undefined) ?? []).includes('example'));
  assert.equal(logged.length, 1);
  assert.equal(logged[0]?.fields.amount, 12);
  assert.equal(logged[0]?.fields.on, TODAY);
  assert.equal(k.get(String(logged[0]?.fields.goal))?.fields.what, 'Swim 20 lengths', 'the row counts toward its goal');
  assert.equal(swim.fields.done ?? null, null, 'the typed number is emptied, so it is never counted twice');
  const put_by = rows('put_by').filter((r) => !((r.fields.tags as string[] | undefined) ?? []).includes('example'));
  assert.deepEqual(put_by.map((r) => r.fields.amount), [{ amount: 21_500, currency: 'GBP' }]);
  assert.equal(await carryForward(io, 'personal', '1.0.0', TODAY), 0, 'a second update moves nothing again');
  sql.close();
});
