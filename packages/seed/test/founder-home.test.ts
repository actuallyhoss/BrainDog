/**
 * A founder's Home says what is due this week and what is lapsing.
 *
 * A FOUNDER'S HOME HAD NEITHER LIST. A live record draws `home-<use case>` when it
 * declares one and Money's `home` only when it does not, so the "Due this week" table Money declares was drawn on no
 * founder record at all, and no Home anywhere had a lapsing list, although Estate has been one of a founder's modules
 * since 1.4.0 and `services` carries a `lapsing` state. A probe printed the three headings the page had:
 * `{{config:voice_right_now}}`, `Latest numbers`, `Organisations`. This file is that probe kept as a test.
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
import { DUE_THIS_WEEK } from '../src/modules/money.ts';
import { MODULE_ORDER, modulesFor, signalsIn, standsOn, useCase, useCaseDocument, type UseCase } from '../src/usecases/index.ts';
import { carriedDocument, claimedBy, dayOf, fitted, moduleDocument } from '../src/usecases/install.ts';
import { DOMAINS, PROJECTS } from '../../../fixtures/names.ts';

const TODAY = dayOf(NOW);

/** A day as the record writes one, `n` days from the fixed today. */
const day = (n: number): string => dayOf(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000);

type Block = { kind: string; heading?: string; source?: string; where?: string; columns?: unknown; order?: unknown; limit?: number; empty?: string };

/** The blocks `home-founder` declares, read off the use case the way the probe read them. */
const declared = (): Block[] => {
  const decls = (useCase('founder')!.pack?.declarations ?? []) as { page?: string; blocks?: Block[] }[];
  const home = decls.find((d) => d.page === 'home-founder');
  assert.ok(home, 'the founder use case declares its own Home');
  return home.blocks ?? [];
};

test("A FOUNDER'S HOME DECLARES WHAT IS DUE THIS WEEK AND WHAT IS LAPSING, beside the numbers it already drew", () => {
  const headings = declared().map((b) => b.heading);
  assert.ok(headings.includes('Due this week'), `home-founder's headings are ${headings.join(' ; ')}`);
  assert.ok(headings.includes('Lapsing'), `home-founder's headings are ${headings.join(' ; ')}`);
});

/**
 * THE SAME TABLE AS MONEY'S, NOT ONE LIKE IT. Money exports its "Due this week" by name (`DUE_THIS_WEEK`) since
 * money-core 3.0.0 retired its own Home, and two tables under one heading that disagree about the window or the columns
 * would be a question about which one is right. Held equal here so the pair moves together.
 */
test("ITS DUE THIS WEEK IS MONEY'S OWN: the same list, window, columns, order and limit", () => {
  const ours = declared().find((b) => b.heading === 'Due this week');
  const money = DUE_THIS_WEEK as Block;
  assert.ok(ours && money);
  const { kind, source, where, columns, order, limit, empty } = money;
  assert.deepEqual({ kind: ours.kind, source: ours.source, where: ours.where, columns: ours.columns, order: ours.order, limit: ours.limit, empty: ours.empty }, { kind, source, where, columns, order, limit, empty });
});

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
 * A FOUNDER RECORD MADE BEFORE 2.7.0, holding every module the use case names, as `founder-estate.test.ts` makes it.
 * Since 2.7.0 a fresh one holds only what it needs and what the words point at (`fresh` below).
 */
async function founder(version?: string): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  const doc = carriedDocument(u, TODAY, null, { examples: true })!;
  await put(k, version === undefined ? doc : { ...doc, version });
  return k;
}

type Drawn = { kind: string; heading?: string; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string }[] };
const OWNER = { actor: 'p_1' };

/**
 * AND BOTH `where:`s COMPILE AGAINST A FOUNDER RECORD AND PICK THE RIGHT ROWS. A block whose predicate names a field the
 * record does not hold is drawn with a refusal and no rows, which a heading check alone would pass. The example bill is
 * due in nine days, one past the week, so it is the row that proves the window has an end.
 *
 * THREE LAPSING DOMAINS, WRITTEN SO THAT NO OTHER ORDER GIVES THE SOONEST-FIRST ONE: not by name either way and not by
 * when they were written either way. With one lapsing row, flipping `order` to `desc` passed this test, and with two,
 * deleting `order` passed it, because the default happened to agree; both were measured, which left "soonest first"
 * unheld until this.
 */
test("ON A FOUNDER'S RECORD, THE WEEK HOLDS WHAT IS DUE INSIDE IT AND LAPSING HOLDS ONLY WHAT IS LAPSING", async () => {
  const k = await founder();
  value(k.create('obligations', { what: 'Domain transfer fee', direction: 'owed_by_me', amount: { amount: 1_200, currency: 'GBP' }, due: day(3), state: 'open' }, OWNER));
  value(k.create('obligations', { what: 'Paid last week', direction: 'owed_by_me', amount: { amount: 900, currency: 'GBP' }, due: day(2), state: 'paid' }, OWNER));
  value(k.create('services', { name: 'northwind.dev', provider: 'Cove Domains', kind: 'domain', renews: day(20), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.example', provider: 'Cove Domains', kind: 'domain', renews: day(5), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.io', provider: 'Cove Domains', kind: 'domain', renews: day(12), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.app', provider: 'Cove Domains', kind: 'domain', renews: day(40), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'live' }, OWNER));

  const blocks = value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  const refused = blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading}: ${b.refusals!.map((r) => r.code).join(', ')}`);
  assert.deepEqual(refused, [], 'home-founder refused a block');

  const week = blocks.find((b) => b.heading === 'Due this week');
  assert.ok(week, `no Due this week among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(week.rows?.map((r) => r.fields.what), ['Domain transfer fee'], 'the open bill in three days, and not the paid one or the example due in nine');

  const lapsing = blocks.find((b) => b.heading === 'Lapsing');
  assert.ok(lapsing, `no Lapsing among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(lapsing.rows?.map((r) => r.fields.name), ['northwind.example', 'northwind.io', 'northwind.dev'], 'the three lapsing domains, soonest renewal first, and not the live one');
});

/* ── a founder's first day holds what the words point at (founder 2.7.0) ───────────────────── */

/**
 * THE MODULES A SENTENCE POINTS AT, as the first run hears them (`modulesOf` in `apps/web/src/lib/start/propose.ts`,
 * which this package cannot import): a module's own words heard outside what the use case claims for itself, then what
 * the use case stands on (`modulesFor`) and what each of those leans on (`closeOver`). No sentence here says a name, so
 * People never comes for one.
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

/** A founder record a stranger's first run makes from one sentence: what it points at, then the pack cut to those lists. */
async function fresh(said: string): Promise<{ k: Kernel; modules: string[] }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  const modules = pointedAt(u, said);
  for (const m of modules) await put(k, moduleDocument(u, m, { today: TODAY, holds: new Set([...held(k), ...listsOf(m)]) }));
  const carried = carriedDocument(u, TODAY, said, { holds: new Set(held(k)) });
  assert.ok(carried, 'the founder carries a pack');
  await put(k, carried);
  return { k, modules };
}

/** Every list the record's copy of a page names: what it requires, a block's source and a list a line writes into. */
const namedLists = (k: Kernel, page: string): string[] => {
  const decl = k.declarations().find((d) => d.id === `page.${page}`);
  assert.ok(decl, `the record holds page.${page}`);
  const body = String(decl.body);
  return [...new Set([...body.matchAll(/"register\.([a-z_]+)"/gu), ...body.matchAll(/"register":"([a-z_]+)"/gu)].map((m) => m[1]!))].sort();
};

const SAID = `I'm a founder running ${PROJECTS[0]} and ${PROJECTS[3]}, two SaaS apps, and I want to see my runway`;

test("FROM THE SENTENCE ALONE A FOUNDER'S FIRST DAY HOLDS PROJECTS, MONEY AND ITS OWN NUMBERS, and no other list", async () => {
  const u = useCase('founder')!;
  assert.deepEqual(standsOn(u), ['portfolio', 'money-core'], 'what a founder cannot stand without');
  /* "SaaS" IS ONE OF SERVICES' WORDS, AND THE FOUNDER CLAIMS IT: a founder's SaaS is the project, not a subscription. */
  const { k, modules } = await fresh(SAID);
  assert.deepEqual(modules, ['portfolio', 'money-core']);
  assert.deepEqual(k.packs().map((p) => p.id).sort(), ['money-core', 'portfolio', 'usecase-founder']);
  /* WHAT AN EMPTY RECORD HOLDS OF ITS OWN (the kernel's lists) is left out: it is there whatever was said. */
  const bare = held(await openRecord(openSqlite(), fixedClock(NOW)));
  const lists = held(k).filter((l) => !bare.includes(l));
  /* NUMBERS IS PROJECTS' OWN SINCE portfolio 1.19.0, and its key numbers with it. */
  assert.deepEqual(lists.sort(), [...listsOf('portfolio'), ...listsOf('money-core')].sort());
  for (const list of ['services', 'tasks', 'people', 'organisations']) assert.ok(!lists.includes(list), `day 0 holds ${list}, and nothing said points at it`);
  assert.ok(lists.length < 18, `day 0 opens on ${lists.length} lists`);
});

test("ITS TODAY NAMES ONLY THE LISTS IT HOLDS, opens on the money, and draws with nothing refused", async () => {
  const { k } = await fresh(SAID);
  const holds = held(k);
  assert.deepEqual(namedLists(k, 'home-founder').filter((l) => !holds.includes(l)), [], 'Today names a list the record does not hold');
  const own = [...listsOf('portfolio'), ...listsOf('money-core')];
  assert.deepEqual(namedLists(k, 'home-founder').filter((l) => !own.includes(l)), [], 'Today reads a list that is not the use case\'s own or one it needs');
  const blocks = value<{ blocks: (Drawn & { drawn?: boolean })[] }>(k.page('home-founder')).blocks;
  assert.deepEqual(blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => b.heading), [], 'a block on Today was refused');
  assert.ok(!blocks.some((b) => b.heading === 'Lapsing'), 'Lapsing reads Services, which this record does not hold');
  /* THE FIRST TILE IS THE MONEY: the line of what there is, or, while no account counts as cash, the way to bring it in. */
  const first = blocks.find((b) => b.drawn !== false);
  assert.ok(first && (first.heading === undefined || first.heading === 'Bring your money in'), `Today opens on ${first?.kind} ${first?.heading}`);
});

test('WORDS THAT NAME DOMAINS BRING SERVICES ON THE FIRST DAY, and Today keeps Lapsing over it', async () => {
  const said = `I'm a founder running ${PROJECTS[1]}, and its domains ${DOMAINS[1]} and ${DOMAINS[3]} renew every spring`;
  const { k, modules } = await fresh(said);
  assert.deepEqual(modules, ['portfolio', 'money-core', 'estate']);
  assert.ok(held(k).includes('services') && !held(k).includes('tasks'), `the record holds ${held(k).join(', ')}`);
  assert.ok(namedLists(k, 'home-founder').includes('services'), 'Today reads the services it now holds');
  value(k.create('services', { name: DOMAINS[1], kind: 'domain', renews: day(6), cycle: 'yearly', state: 'lapsing' }, OWNER));
  const blocks = value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  assert.deepEqual(blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => b.heading), []);
  assert.deepEqual(blocks.find((b) => b.heading === 'Lapsing')?.rows?.map((r) => r.fields.name), [DOMAINS[1]]);
});

/**
 * WHAT A RECORD MADE BEFORE HOLDS IS WHAT 3.0.0 DECLARES, LESS NUMBERS. 2.7.0 declared what the published 2.6.0 declares,
 * word for word (the frozen file in the catalogue). 3.0.0 declares the same, but for Numbers, which it hands to Portfolio
 * 1.19.0 (`hands`) under the same id, laying back on it the organisation and the service a reading is about (`extends`),
 * so every field 2.6.0 declared is still on the list. A record on 2.7.0 taking the update with every reading kept is
 * `portfolio-kpis.test.ts`'s.
 */
test('WHAT 2.6.0 DECLARED, 3.0.0 DECLARES, BUT NUMBERS, which it hands to Portfolio with its two links laid back', () => {
  /* BOTH AS PUBLISHED, SINCE THE SEED HAS GONE ON TEN VERSIONS: this rebuilt 3.0.0 from today's source by undoing each later change by hand, and
     each one since 3.8.2 left it red (a sentence, a nav place, the Dashboard's first acts). The catalogue holds both frozen, and `usecase-versions.test.ts`
     holds every version since. */
  type List = { register?: string; fields?: { id: string }[] };
  type Page = { page?: string; blocks?: { kind?: string }[] };
  type Published = { version: string; pack: { declarations: (List & Page)[] } };
  const published = (v: string): Published => JSON.parse(readFileSync(join(import.meta.dirname, `../../../apps/web/static/catalogue/usecases/founder/${v}.usecase.json`), 'utf8')) as Published;
  const frozen = published('2.6.0');
  const three = published('3.0.0');
  const next = useCaseDocument('founder', TODAY)! as { declarations: List[]; hands: Record<string, string>; extends: Record<string, { fields: { id: string }[] }> };
  assert.equal(frozen.version, '2.6.0');
  assert.equal(three.version, '3.0.0');
  /* AND A PROJECT'S KEY NUMBERS ON ITS PAGE, folded into the unreleased 3.0.0 (the KPI plan of 21 October, K3-C): the
     one block it adds, under the questions, and nothing else of the page moved. */
  const project = three.pack.declarations.find((d) => d.page === 'project')!;
  assert.deepEqual(project.blocks!.filter((b) => b.kind === 'kpis'), [{ kind: 'kpis', heading: 'Key numbers', icon: 'chart-line', span: 12, key: 'kpis', source: 'kpis', for: 'project' }]);
  const less = three.pack.declarations.map((d) => (d.page === 'project' ? { ...d, blocks: d.blocks!.filter((b) => b.kind !== 'kpis') } : d));
  const was26 = frozen.pack.declarations.filter((d) => d.register !== 'datapoints');
  assert.deepEqual(less, was26, '3.0.0 declares what the published 2.6.0 declares, but Numbers and the Key numbers block');
  /* AND TODAY'S STILL HOLDS EVERY LIST 2.6.0 DECLARED, SO NO RECORD LOST ONE. */
  const lists = (doc: readonly List[]) => doc.flatMap((d) => (d.register === undefined ? [] : [d.register]));
  assert.deepEqual(lists(was26).filter((l) => !lists(next.declarations).includes(l)), [], 'a list 2.6.0 declared has gone');
  assert.equal(next.hands['register.datapoints'], 'portfolio');
  const was = frozen.pack.declarations.find((d) => d.register === 'datapoints')!.fields!;
  const laid = next.extends['register.datapoints']!.fields;
  const own = (moduleDocument(null, 'portfolio', { today: TODAY })!.declarations as List[]).find((d) => d.register === 'datapoints')!.fields!;
  assert.deepEqual([...own, ...laid].map((f) => f.id).sort(), was.map((f) => f.id).sort(), 'every field 2.6.0 declared on Numbers is still on it');
});
