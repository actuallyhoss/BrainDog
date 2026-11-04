/**
 * The starter use cases and the arranger: each carried pack installs on
 * an empty record once its modules are in, the voice lands in the record as settings, and sentences a
 * person could type land on the use case they describe, the same way every time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, install, labelsOf, normalise, plan, voiceOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { MODULE_ORDER, USE_CASES, alongside, arrange, listsOf, modulesFor, pagesOf, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { dayOf } from '../src/usecases/dates.ts';

/** The record's own day: an example's `+3d` is counted from it, never from the machine's, which turns over at midnight. */
const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

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

async function put(k: Kernel, doc: unknown): Promise<{ ok: boolean }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return install(pack, diff, hostFor(k), diff.planHash) as Promise<{ ok: boolean }>;
}

test('THE MODULES A USE CASE MAY NAME ARE THE FIRST-PARTY PACKS, in install order', () => {
  assert.deepEqual([...MODULES], [...MODULE_ORDER]);
  assert.deepEqual(MODULE_ORDER.filter((id) => id !== 'agents'), FIRST_PARTY.filter((id) => id !== 'core'));
});

test('EACH CARRIED PACK INSTALLS ON AN EMPTY RECORD after its modules, with its example rows and its voice', async () => {
  for (const u of USE_CASES) {
    const doc = useCaseDocument(u.usecase, TODAY);
    if (!doc) {
      assert.equal(u.pack, null);
      continue;
    }
    const { k, sql } = await record();
    /* EACH MODULE FITTED TO THE LISTS THE RECORD HOLDS ONCE IT IS IN, as onboarding fits it (`moduleDocument`): Shop
       stands on People alone, and People's link to Projects refused it. */
    const holds = new Set<string>();
    for (const id of modulesFor(u, u.modules)) {
      if (id === 'agents') continue;
      for (const p of firstPartyManifest(id as never)?.provides ?? []) if (p.startsWith('register.')) holds.add(p.slice(9));
      value(await put(k, firstPartyDocument(id, { holds: [...holds] })));
    }
    value(await put(k, doc));
    /* PERSONAL AND STUDENT CARRY NO EXAMPLE ROW, so only a pack that seeds is counted. */
    const seeded = new Set(((doc.seeds ?? []) as { register: string }[]).map((s) => s.register));
    for (const list of listsOf(u)) if (seeded.has(list.id)) assert.ok(k.count(list.id) >= 1, `${u.usecase}: ${list.id} has its example row`);
    const settings = value<{ values: Record<string, unknown>; config: Record<string, { label?: string }> }>(k.packConfig(`usecase-${u.usecase}`));
    assert.deepEqual(voiceOf(settings.values), u.voice, `${u.usecase}: the record holds the voice`);
    /* EVERY LIST CARRIES ITS WORDS (Settings > Words), defaulting to what the record already shows; the use case's own
       words are among them. */
    const declared = doc.config as Record<string, { default?: unknown; label?: string }>;
    const held = labelsOf(Object.fromEntries(Object.entries(declared).map(([k, c]) => [k, c.default])), declared);
    assert.deepEqual(labelsOf(settings.values, settings.config), held, `${u.usecase}: the record holds the labels`);
    for (const [key, word] of Object.entries(u.labels)) assert.equal(held[key], word, `${u.usecase}: ${key} keeps the use case's own word`);
    sql.close();
  }
});

test('A CARRIED PACK WITHOUT ITS MODULES IS REFUSED, naming what to install', async () => {
  const founder = useCase('founder')!;
  const { k, sql } = await record();
  const out = (await put(k, useCaseDocument('founder', TODAY))) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.ok(founder.modules.includes('portfolio'));
  sql.close();
});

test('THE PROPOSAL SAYS WHICH PAGES AND SECTIONS IT MAKES', () => {
  assert.deepEqual(pagesOf(useCase('student')!), [{ page: 'studies', title: 'Studies', section: 'Studies' }]);
  assert.deepEqual(pagesOf(useCase('founder')!), [{ page: 'dashboard', title: 'Dashboard', section: 'Dashboard' }]);
  assert.deepEqual(pagesOf(useCase('team')!), [
    { page: 'cycles', title: 'Sprints', section: 'Sprints' },
    { page: 'agent-work', title: 'Agent work', section: 'Agents' },
  ]);
  assert.deepEqual(pagesOf(useCase('guide')!), [{ page: 'guide', title: 'Guide', section: 'Guide' }]);
  assert.deepEqual(pagesOf(useCase('personal')!), [{ page: 'goals', title: 'Goals', section: 'Goals' }]);
  /* AND PRODUCTS, ITS OWN PLACE ON THE RAIL SINCE shop 1.5.0 (1fdbdf110). */
  assert.deepEqual(pagesOf(useCase('shop')!), [{ page: 'orders', title: 'Orders', section: 'Orders' }, { page: 'products', title: 'Products', section: 'Products' }]);
  assert.deepEqual(pagesOf(useCase('business')!), []);
  assert.deepEqual(modulesFor(useCase('student')!, ['people']), ['core', 'people']);
  assert.deepEqual(modulesFor(useCase('founder')!, ['estate']), ['core', 'portfolio', 'money-core', 'estate']);
});

const SENTENCES: [string, string | null][] = [
  ["I'm a student at Leeds, studying biology", 'student'],
  ['homework and exams', 'student'],
  ['I need to keep track of my coursework and deadlines for uni', 'student'],
  ['Revising for my GCSEs', 'student'],
  ['Writing my dissertation this semester', 'student'],
  ['my PhD thesis and the lectures I teach', 'student'],
  ['college assignments', 'student'],
  ['A levels, three subjects, and a tutor on Tuesdays', 'student'],
  ['I study part time while working', 'student'],
  ['school', 'student'],
  ["I'm a solo founder running two companies", 'founder'],
  ['I run BrainDog and a couple of side projects, and I want dashboards for their MRR', 'founder'],
  ['startup metrics and runway', 'founder'],
  ['my apps report signups and churn', 'founder'],
  ['bootstrapped SaaS, three products', 'founder'],
  ['indie hacker with several businesses', 'founder'],
  ['I want analytics across my organisations and their balances', 'founder'],
  ['co-founder of a startup', 'founder'],
  ['revenue and users for each of my products', 'founder'],
  ['I launched two apps this year', 'founder'],
  ['I run a design studio', 'business'],
  ['I freelance and send invoices to clients', 'business'],
  ['a small business with domains and hosting', 'business'],
  ['consulting, with a retainer and an accountant', 'business'],
  /* SHOP SINCE BUSINESS 1.7.0, which gave "shop" to Shop: the VAT is Small business's, and it goes beside. */
  ['I run a shop and pay VAT', 'shop'],
  ['I sell handmade candles at a market stall', 'shop'],
  ['my online shop and its orders', 'shop'],
  ['agency work for customers', 'business'],
  ['bookkeeping for my business', 'business'],
  ['a type foundry', 'business'],
  ['freelancer', 'business'],
  ['subscriptions and contractors', 'business'],
  ['', null],
  ['hello', null],
  ['a garden', null],
  ['my cat', null],
  ['Je suis étudiant', null],
  ['classes', 'student'],
  ['Dashboard', 'founder'],
  ['STUDENT', 'student'],
  ['side-projects', null],
  ['my running club', 'personal'],
  ['I run the product team at a 200-person company and our agents take tickets', 'team'],
  ['a product manager with a backlog and two-week sprints', 'team'],
  ['our engineering team lives in Jira and wants agents on the tickets', 'team'],
  ['Tasks for a small team', 'team'],
  ['kanban for my squad', 'team'],
  ['standups and a roadmap for the department', 'team'],
  ['agentic task list for an enterprise', 'team'],
  ['my team', 'team'],
  ['issues and assignees', 'team'],
  ['we plan in cycles', 'team'],
  ["I want to start a podcast and don't know where to begin", 'guide'],
  ['A new project', 'guide'],
  ['starting a newsletter from scratch', 'guide'],
  ['I have an idea for a YouTube channel', 'guide'],
  ['writing my first novel, step by step', 'guide'],
  ['getting started with a charity event', 'guide'],
  ['I want a checklist and milestones for my passion project', 'guide'],
  ['a band', 'guide'],
  ['where to start with a blog', 'guide'],
  ["I'm starting something new", 'guide'],
  ['I want to get my money under control and keep track of my side projects and running', 'personal'],
  ['personal finance and a monthly budget', 'personal'],
  ['saving up for a trip and paying my bills on time', 'personal'],
  ['my habits and goals for the year', 'personal'],
  ['training for a marathon', 'personal'],
  ['a couple of side projects and my spending', 'personal'],
  ['life admin: rent, groceries and the gym', 'personal'],
  ['household budget for the family', 'personal'],
  ['hobbies', 'personal'],
  ['getting out of debt', 'personal'],
];

test('SEVENTY SENTENCES LAND ON THE USE CASE THEY DESCRIBE', () => {
  for (const [said, want] of SENTENCES) assert.equal(arrange(said).pick?.usecase ?? null, want, JSON.stringify(said));
});

test('THE SAME WORDS ALWAYS RANK THE SAME, and each reason is a phrase of what was typed', () => {
  for (const [said] of SENTENCES) {
    const a = arrange(said);
    assert.deepEqual(arrange(said), a);
    for (const r of a.ranked) for (const w of r.why) assert.equal(said.slice(w.at, w.at + w.text.length), w.text);
  }
  const mixed = arrange('a student who freelances for clients on the side');
  assert.deepEqual(
    mixed.ranked.map((r) => [r.usecase.usecase, r.score]),
    [['student', 1], ['business', 1], ['personal', 0], ['founder', 0], ['team', 0], ['guide', 0], ['shop', 0]].sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][],
  );
});

test('EVERY LABEL NAMES A LIST, FIELD OR VALUE THAT THE USE CASE INSTALLS', () => {
  let some = 0;
  for (const u of USE_CASES) {
    const declared = [...modulesFor(u, u.modules).filter((id) => id !== 'agents').map((id) => firstPartyDocument(id)), useCaseDocument(u.usecase, TODAY)]
      .flatMap((doc) => ((doc?.declarations ?? []) as Record<string, unknown>[]))
      .filter((d) => typeof d.register === 'string' && Array.isArray(d.fields));
    for (const key of Object.keys(u.labels)) {
      some++;
      /* `people:holds` and `tickets:one` name the list before the colon. */
      const [list, field, val] = key.split(':')[0]!.split('.');
      const decl = declared.find((d) => d.register === list);
      assert.ok(decl, `${u.usecase}: ${key} names a list it installs`);
      if (field === undefined) continue;
      const f = (decl.fields as { id: string; values?: string[] }[]).find((x) => x.id === field);
      assert.ok(f, `${u.usecase}: ${key} names a field of ${list}`);
      if (val !== undefined) assert.ok(f.values?.includes(val), `${u.usecase}: ${key} names a value of ${list}.${field}`);
    }
  }
  assert.ok(some > 0);
});

test('STUDIES COME BESIDE A PERSONAL RECORD WHEN THE SENTENCE MENTIONS THEM, and only for an individual', () => {
  const said = 'my budget, my running and my uni coursework';
  const a = arrange(said);
  const personal = useCase('personal')!;
  const student = useCase('student')!;
  assert.deepEqual(alongside(a, personal).map((u) => u.usecase), ['student']);
  assert.equal(a.pick?.usecase, 'personal', 'as much about a budget as coursework is a person with studies beside');
  /* WHICHEVER WAY THE IDS SORT: Personal sorts before Student and still goes beside it, because the voice is written down. */
  assert.deepEqual(alongside(a, student).map((x) => x.usecase), ['personal'], 'a use case whose id sorts first was kept from going beside');
  assert.deepEqual(alongside(arrange('I want to get my money under control and keep track of my side projects and running'), personal), []);
  assert.deepEqual(alongside(arrange('a founder who is also a student'), useCase('founder')!), [], 'a founder is not an individual record');
  assert.deepEqual(alongside(a, null), []);
});

/**
 * USE CASE 6 OF THE VISION, Mariam's sentence word for word: the candle shop is Shop, which
 * carries Orders and Products, and the freelance design is Small business beside it. Before Shop, "shop" was one of
 * Small business's words and the sentence was proposed a business with no list to write an order in.
 */
test('A SMALL CANDLE SHOP IS A SHOP, and freelancing as a designer puts Small business beside it', () => {
  const said = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";
  const a = arrange(said);
  assert.equal(a.pick?.usecase, 'shop');
  assert.deepEqual(a.ranked.filter((r) => r.score > 0).map((r) => r.usecase.usecase), ['shop', 'business']);
  assert.deepEqual(a.ranked[0]!.why.map((w) => w.text), ['shop', 'orders']);
  assert.deepEqual(alongside(a, a.pick).map((u) => u.usecase), ['business'], 'neither declares a list or page of the other, so both install');
  assert.deepEqual(listsOf(useCase('shop')!).map((l) => l.name), ['Orders', 'Products']);
  /* ONE SHOP WORD AND ONE BUSINESS WORD is still both: whichever is proposed, the other goes beside. */
  const short = arrange('I run a small candle shop and freelance as a designer');
  assert.deepEqual(alongside(short, short.pick).map((u) => u.usecase), ['shop']);
  /* A SHOP NOT STARTED YET IS STILL THE GUIDE'S, by the longer phrase. */
  assert.equal(arrange('I want to start an Etsy shop and have no idea where to begin').pick?.usecase, 'guide');
});
