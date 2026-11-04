/**
 * A new Personal Home offers something to press (Personal 2.5.0).
 *
 * BEFORE: a fresh Personal record opened on a line of zeros, "Nothing falls due in the next two weeks" and nothing to
 * press, where Student leads with "Add homework" and the founder with "Bring your money in". Now Home declares three
 * first acts, each with a `when:` the kernel reads: the way money comes in while no account counts as cash, a line
 * naming a savings goal while none is kept, and a line naming a project while none is live. This file holds that a
 * fresh record draws all three and that each goes once the thing it starts exists, read as the kernel reads them
 * (`k.page`, which marks a block whose `when:` does not hold `drawn: false`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { firstPartyModules } from '../src/module-info.ts';
import { MODULE_ORDER, modulesFor, signalsIn, standsOn, useCase, useCaseDocument, type UseCase } from '../src/usecases/index.ts';
import { carriedDocument, claimedBy, dayOf, fitted, homePageOf, moduleDocument } from '../src/usecases/install.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const MONEY_IN = 'Bring your money in';
const SAVING = 'Name something you are saving for';
const MAKING = 'Name something you are making';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/**
 * A Personal record made the way a first run makes one for a person who names someone, so People comes too: its modules
 * and its pack, and no example row in any list. `version` makes it a record on an earlier version of the same pack.
 */
async function personal(version?: string): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('personal')!;
  /* PROJECTS COMES WHEN A PROJECT IS SAID, SINCE 2.11.0 (2cb750068), so this is a person who said one too: what they are making has a list to go in. */
  for (const m of modulesFor(u, ['people', 'portfolio'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  const carried = carriedDocument(u, TODAY, null);
  /* AN OLDER VERSION IS THE ONE PUBLISHED: 2.5.0 has none of the figure 2.7.0 added and 2.8.0 took away (`log-streak`). */
  const older = (doc: NonNullable<typeof carried>) => ({ ...doc, version, declarations: (doc.declarations as { metric?: string }[]).filter((d) => d.metric !== 'log-streak') });
  if (carried) await put(k, version === undefined ? carried : older(carried));
  return k;
}

type Block = { kind: string; heading?: string; register?: string; where?: string; when?: unknown; authored?: { cells: string[] }[] };
type Drawn = { kind: string; heading?: string; drawn?: boolean; why?: string; refusals?: { code: string }[]; fills?: Record<string, string> };

/** The blocks `home-personal` declares, read off the use case. */
const declared = (): Block[] => {
  const decls = (useCase('personal')!.pack?.declarations ?? []) as { page?: string; blocks?: Block[] }[];
  const home = decls.find((d) => d.page === 'home-personal');
  assert.ok(home, 'Personal declares its own Home');
  return home.blocks ?? [];
};

const drawnOn = (k: Kernel): Drawn[] => value<{ blocks: Drawn[] }>(k.page(homePageOf('personal'))).blocks;
const headed = <B extends { heading?: string }>(blocks: readonly B[], heading: string): B => {
  const b = blocks.find((x) => x.heading === heading);
  assert.ok(b, `no ${heading} among ${blocks.map((x) => x.heading).join(', ')}`);
  return b;
};

test('PERSONAL HOME DECLARES THREE FIRST ACTS, each with the condition it waits on', () => {
  const blocks = declared();
  const money = headed(blocks, MONEY_IN) as Block;
  assert.equal(money.kind, 'link');
  assert.deepEqual(money.when, { metric: 'cash-accounts', lt: 1 });
  assert.deepEqual(money.authored?.map((r) => r.cells[0]), ['Add an account', 'Forward a bank message', 'Find a plugin for your bank']);
  for (const r of money.authored ?? []) assert.match(r.cells[1] ?? '', /^\/[a-z]/u, `${r.cells[0]} leads to a page of this record`);

  const saving = headed(blocks, SAVING) as Block;
  assert.deepEqual([saving.kind, saving.register, saving.when], ['capture', 'savings_goals', { metric: 'savings-held', lt: 1 }]);
  const making = headed(blocks, MAKING) as Block;
  assert.deepEqual([making.kind, making.register, making.where, making.when], ['capture', 'things', 'lane is building', { metric: 'projects-live', lt: 1 }]);
  /* UNDER THE LINE AND WHAT NEEDS YOU, AHEAD OF WHAT IS COMING UP: on a new record they are the first things drawn. */
  const at = (h: string) => blocks.findIndex((b) => b.heading === h);
  assert.ok(at(MONEY_IN) < at(SAVING) && at(SAVING) < at(MAKING) && at(MAKING) < at('Coming up'));
  for (const b of blocks.filter((x) => [MONEY_IN, SAVING, MAKING].includes(x.heading ?? '')))
    for (const text of [b.heading ?? '', ...(b.authored ?? []).flatMap((r) => [r.cells[0] ?? '', r.cells[2] ?? ''])]) assert.doesNotMatch(text, /[–—]/u, `no dash in ${text}`);
});

test('A FRESH PERSONAL HOME DRAWS ALL THREE, and the line for a project files it as one on the go', async () => {
  const k = await personal();
  const home = drawnOn(k);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  for (const h of [MONEY_IN, SAVING, MAKING]) assert.notEqual(headed(home, h).drawn, false, `${h} is not drawn on a fresh record`);
  /* WHAT THE PRESS WRITES: a project in the Building lane, which is what My projects and `projects-live` count. */
  assert.deepEqual((headed(home, MAKING) as Drawn).fills, { lane: 'building' });
  assert.deepEqual((headed(home, SAVING) as Drawn).fills, {});
  /* NOTHING IS WRITTEN UNTIL THE PERSON PRESSES. */
  for (const r of ['accounts', 'savings_goals', 'things']) assert.equal(k.count(r), 0, `${r} holds a row nobody wrote`);
});

test('EACH FIRST ACT GOES ONCE ITS THING EXISTS: an account counted as cash, a savings goal, a live project', async () => {
  const k = await personal();
  value(k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 120_000, currency: 'GBP' }, as_of: TODAY, liquid: true }, OWNER));
  let home = drawnOn(k);
  assert.equal(headed(home, MONEY_IN).drawn, false, 'the way money comes in stays once an account counts as cash');
  assert.equal((headed(home, MONEY_IN) as Drawn).why, 'when');
  assert.notEqual(headed(home, SAVING).drawn, false);
  assert.notEqual(headed(home, MAKING).drawn, false);

  value(k.create('savings_goals', { name: 'A week by the sea', target: { amount: 80_000, currency: 'GBP' } }, OWNER));
  /* A PROJECT PARKED IS NOT ONE ON THE GO, so the line still asks for one. */
  value(k.create('things', { name: 'Garden bench', lane: 'parked' }, OWNER));
  home = drawnOn(k);
  assert.equal(headed(home, SAVING).drawn, false, 'a kept goal ends the line that names one');
  assert.notEqual(headed(home, MAKING).drawn, false, 'a parked project is not live');

  value(k.create('things', { name: 'Kitchen shelves', lane: 'building' }, OWNER));
  home = drawnOn(k);
  assert.equal(headed(home, MAKING).drawn, false, 'a live project ends the line that names one');
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
});

/* ── a person's first day holds what the words point at (Personal 2.6.0) ───────────────────── */

/**
 * THE MODULES A SENTENCE POINTS AT, as the first run hears them (`modulesOf` in `apps/web/src/lib/start/propose.ts`,
 * which this package cannot import): a module's own words heard outside what the use case claims for itself, then what
 * the use case stands on (`modulesFor`) and what each of those leans on (`closeOver`). The first run adds People for a
 * name it hears too; here People is pointed at by its own words.
 */
function pointedAt(u: UseCase, said: string): string[] {
  const claimed = claimedBy(u, said);
  const heard = firstPartyModules().filter((m) => signalsIn(said, m.signals).some((span) => !claimed(span))).map((m) => m.id);
  const want = new Set(modulesFor(u, heard));
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...want])
      for (const leans of firstPartyModules().find((m) => m.id === id)?.leans ?? [])
        if (!want.has(leans)) (want.add(leans), (grew = true));
  }
  return MODULE_ORDER.filter((m) => want.has(m));
}

const listsOf = (m: string): string[] => firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []));
const OWN = ['savings_goals', 'put_by', 'goals', 'goal_log', 'project_steps'];

/** A Personal record a stranger's first run makes from one sentence: what it points at, then the pack cut to those lists. */
async function fresh(said: string): Promise<{ k: Kernel; modules: string[]; lists: string[] }> {
  const bare = held(await openRecord(openSqlite(), fixedClock(NOW)));
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('personal')!;
  const modules = pointedAt(u, said);
  for (const m of modules) await put(k, moduleDocument(u, m, { today: TODAY, holds: new Set([...held(k), ...listsOf(m)]) }));
  const carried = carriedDocument(u, TODAY, said, { holds: new Set(held(k)) });
  assert.ok(carried, 'Personal carries a pack');
  await put(k, carried);
  /* WHAT AN EMPTY RECORD HOLDS OF ITS OWN (the kernel's lists) is left out: it is there whatever was said. */
  return { k, modules, lists: held(k).filter((l) => !bare.includes(l)).sort() };
}

/** Every list the record's copy of Home names: what it requires, a block's source and a list a line writes into. */
const namedLists = (k: Kernel): string[] => {
  const decl = k.declarations().find((d) => d.id === `page.${homePageOf('personal')}`);
  assert.ok(decl, 'the record holds Home');
  const body = String(decl.body);
  return [...new Set([...body.matchAll(/"register\.([a-z_]+)"/gu), ...body.matchAll(/"register":"([a-z_]+)"/gu)].map((m) => m[1]!))].sort();
};

const SAID = 'I want my bills and my savings under control';

/* A HOUSEHOLD IS NOT GIVEN PROJECTS SINCE 2.11.0 (2cb750068), AND STANDS ON PEOPLE: its roles are laid on People's list, and every sign-up asks a name.
   Until a project is said the install cuts Project steps' link to it (`fitted`), and the list stands by itself. */
test("FROM THE SENTENCE ALONE A PERSON'S FIRST DAY HOLDS MONEY, PEOPLE AND PERSONAL'S OWN LISTS, and no other", async () => {
  const u = useCase('personal')!;
  assert.deepEqual(standsOn(u), ['people', 'money-core'], 'Money, and the People its roles are laid on');
  const { k, modules, lists } = await fresh(SAID);
  assert.deepEqual(modules, ['people', 'money-core']);
  assert.deepEqual(k.packs().map((p) => p.id).sort(), ['money-core', 'people', 'usecase-personal']);
  assert.deepEqual(lists, [...listsOf('people'), ...listsOf('money-core'), ...OWN].sort());
  assert.ok(!lists.includes('things'), 'nobody said a project, so Projects is offered later and not installed');
});

test("ITS HOME NAMES ONLY THE LISTS IT HOLDS, opens on the money, and draws the first acts it has a list for with nothing refused", async () => {
  const { k, lists } = await fresh(SAID);
  assert.deepEqual(namedLists(k).filter((l) => !lists.includes(l)), [], 'Home names a list the record does not hold');
  const home = drawnOn(k);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* THE FIRST TILE IS THE LINE SAID FROM MONEY'S FIGURES. */
  const first = home.find((b) => b.drawn !== false);
  assert.ok(first && first.kind === 'note' && first.heading === undefined, `Home opens on ${first?.kind} ${first?.heading}`);
  for (const h of [MONEY_IN, SAVING]) assert.notEqual(headed(home, h).drawn, false, `${h} is not drawn on a fresh record`);
  /* WITH NO PROJECTS THERE IS NOWHERE FOR A THING BEING MADE TO GO, so the line for it leaves with the list. */
  assert.ok(!home.some((b) => b.heading === MAKING), 'Home offers a project on a record with no Projects');
});

test("A PROJECT SAID BRINGS PROJECTS, and Home gains the line for it", async () => {
  const { k, modules } = await fresh('I want my bills under control and I have a project on the go');
  assert.deepEqual(modules, ['portfolio', 'people', 'money-core']);
  const home = drawnOn(k);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.notEqual(headed(home, MAKING).drawn, false, 'a person who said a project is not offered the line for it');
});

test("WORDS THAT POINT AT PEOPLE BRING PEOPLE, with Personal's own roles laid on it", async () => {
  const said = `I want my bills under control, and my accountant ${PEOPLE[3]!.name} to see them`;
  const { k, modules, lists } = await fresh(said);
  assert.deepEqual(modules, ['people', 'money-core']);
  assert.ok(lists.includes('people'));
  const people = k.declarations().find((d) => d.id === 'register.people');
  assert.ok(people && String(people.body).includes('"family"'), "Personal's roles are laid on People");
  for (const b of drawnOn(k)) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
});

/**
 * A RECORD MADE BEFORE KEEPS EVERYTHING IT HOLDS. A record on the published 2.5.0 (the frozen file in the catalogue) takes
 * today's version, planned in the order the record plans an update (`planFile` in `packages/record/src/usecase.ts`): what it
 * stands on and lacks, then its pack cut to what the record holds. WHAT CHANGED SINCE IS WORDS AND THE LINES ON GOALS (2.9.1,
 * 2.10.0, 2.12.0), so no list and no page goes, where until 2.8.0 this could say word for word nothing had changed.
 */
test('A RECORD ON 2.5.0 TAKES TODAY\'S VERSION AND LOSES NOTHING, in the order the record plans an update', async () => {
  const frozen = JSON.parse(readFileSync(join(import.meta.dirname, '../../../apps/web/static/catalogue/usecases/personal/2.5.0.usecase.json'), 'utf8')) as { version: string; pack: { declarations: unknown[]; extends?: unknown } };
  const u = useCase('personal')!;
  const next = carriedDocument(u, TODAY, null)!;
  assert.equal(frozen.version, '2.5.0');
  /* 2.7.0 ADDED ONE FIGURE, days in a row logged, and 2.8.0 TOOK IT AWAY AGAIN (audit 6g, AG12: no game score). */
  assert.ok(!(next.declarations as { metric?: string }[]).some((d) => d.metric === 'log-streak'), 'today\'s version still counts a streak');
  assert.equal(useCaseDocument('personal', TODAY)?.version, next.version);

  const k = await personal('2.5.0');
  const lists = held(k).sort();
  const pages = k.declarations().filter((d) => d.kind === 'page').map((d) => d.id).sort();
  value(k.create('savings_goals', { name: 'A week by the sea', target: { amount: 80_000, currency: 'GBP' } }, OWNER));

  assert.deepEqual(standsOn(u).filter((m) => !k.packs().some((p) => p.id === m)), [], 'nothing it stands on is missing');
  const doc = fitted(next, new Set(held(k)));
  assert.deepEqual(doc, next, 'the record holds every list the pack reads, so nothing is cut');
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  assert.equal(diff.installed_version, '2.5.0');
  assert.deepEqual({ retires: diff.retires.length, conflicts: diff.conflicts.length }, { retires: 0, conflicts: 0 });
  value(await install(pack, diff, hostFor(k), diff.planHash));

  assert.equal(k.packs().find((p) => p.id === 'usecase-personal')?.version, next.version);
  assert.deepEqual(held(k).sort(), lists, 'every list is still held');
  assert.deepEqual(k.declarations().filter((d) => d.kind === 'page').map((d) => d.id).sort(), pages, 'every page is still there');
  assert.equal(k.count('savings_goals'), 1, 'the goal is still there');
});
