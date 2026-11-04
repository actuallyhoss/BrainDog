/**
 * BRAINDOG'S OWN UPDATES GO IN ON THEIR OWN WHEN NOTHING THE PERSON CHANGED WOULD BE LOST, and ask once otherwise
 * (`packs/quiet.ts`).
 *
 * THE RECORD HERE IS SHAPED AS THE OWNER'S WAS ON OCTOBER 6TH: People 2.x with no organisations and no
 * `self`, six people with him twice, Projects, Money and Work beside it. Nothing in it is his by name; any record in that
 * shape takes the same road.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { handedOf, install, normalise, normaliseUseCase, plan, useCasePack, type Diff, type Host, type Installed, type Pack, type UseCase } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { losses, shippedVersion, updateFirstParty, type QuietPort, type QuietQuestion } from '@braindog/seed/packs/quiet';
import type { Result } from '@braindog/ports';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';

import { AGENTS_PACK, CORE_PAGES, FIRST_PARTY_VERSIONS, NOW, agentsPackDocument, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { keptLists, modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { peopleBefore3 } from './people-before-3.ts';
import { useCaseThingsUndone } from './things-before.ts';

import { CHASING } from '../src/modules/money/pages/parts/chasing.ts';
import { NEXT_30 } from '../src/modules/money/pages/parts/next30.ts';
import { ADDON_LEG_LISTS, withoutLegs } from '../src/modules/held-legs.ts';
import { DUE_30D } from '../src/modules/money/pages/shared.ts';
import { QUEUE } from '../src/modules/money/pages/parts/queue.ts';
import { AGES } from '../src/modules/money/pages/parts/ages.ts';
import { BUDGET } from '../src/modules/money/pages/parts/budget.ts';

type Body = Record<string, unknown>;
const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };

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

const stateOf = (k: Kernel, sql: NodeSql): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
  detached: Object.fromEntries(k.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
  handed: handedOf(sql.all<{ manifest: string }>('SELECT manifest FROM pack').map((r) => r.manifest)),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

const fieldsOf = (k: Kernel, list: string): string[] => {
  const d = (k.declarations() as { id: string; body: unknown }[]).find((x) => x.id === `register.${list}`);
  const body = (typeof d?.body === 'string' ? JSON.parse(d.body) : d?.body) as { fields: { id: string }[] };
  return body.fields.map((f) => f.id);
};

async function put(k: Kernel, sql: NodeSql, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k, sql));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A module as it would go into this record now: the lists it holds and the ones the module brings, no example rows. */
const documentFor = (k: Kernel, id: string): Body | null =>
  moduleDocument(null, id, { today: TODAY, holds: new Set([...held(k), ...firstPartyManifest(id as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]) });

/** A record in the owner's shape: People 2.x before organisations, the other modules as this build ships them. */
async function onPeople2(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    const doc = documentFor(k, m)!;
    await put(k, sql, m === 'people' ? peopleBefore3(doc) : doc);
  }
  for (const [name, email] of [
    ['Wren', 'admin@person.example'],
    ['wren', 'wren@laptop.example'],
    ['Mara Lindqvist', 'mara@halden.example'],
    ['Tom Ashby', 'tom@ravensworth.example'],
    ['Ada Vine', 'ada@pellvine.example'],
    ['Lars Holm', 'lars@nordhaven.example'],
  ])
    value(k.create('people', { name, email }, OWNER));
  return { k, sql };
}

/** The port as a record lends it: its own plan and install, and Decide. */
function portOf(k: Kernel, sql: NodeSql): QuietPort & { asked: QuietQuestion[] } {
  const asked: QuietQuestion[] = [];
  return {
    asked,
    held: () => k.packs().map((p) => ({ id: p.id, version: p.version, on: true })),
    document: (id) => documentFor(k, id),
    plan: async (doc): Promise<Result<Diff>> => {
      const pack = await normalise(doc, { kind: 'local' });
      if (!pack.ok) return pack as never;
      return { ok: true, value: await plan(pack.value, stateOf(k, sql)) };
    },
    install: async (doc, planHash) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      return install(pack, await plan(pack, stateOf(k, sql)), hostFor(k), planHash);
    },
    /* FROM THE RECORD'S OWN OPEN QUESTIONS, so a question filed by an earlier run is found as well. */
    asking: (id) => value<{ body_kind: string; body: { install?: unknown } }[]>(k.openSuggestions()).some((q) => q.body_kind === 'pack' && q.body.install === id),
    nameOf: (id) => {
      const d = (k.declarations() as { id: string; body: unknown }[]).find((x) => x.id === id);
      const body = (typeof d?.body === 'string' ? JSON.parse(d.body) : (d?.body ?? {})) as { name?: unknown; title?: unknown };
      return typeof body.name === 'string' ? body.name : typeof body.title === 'string' ? body.title : null;
    },
    propose: (q) => {
      asked.push(q);
      return k.propose(q, 'p_1');
    },
  };
}

test('A RECORD ON PEOPLE 2.x IS UPDATED TO THE PEOPLE THIS BUILD SHIPS ON ITS OWN, and gains organisations, keys and who is you', async () => {
  const { k, sql } = await onPeople2();
  assert.ok(!held(k).includes('organisations'), 'the record starts with no organisations');
  assert.ok(!fieldsOf(k, 'people').includes('self'));
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  const people = steps.find((s) => s.pack === 'people' && s.from !== s.to);
  assert.deepEqual(people, { pack: 'people', from: '2.7.0', to: FIRST_PARTY_VERSIONS.people, did: 'updated' }, JSON.stringify(steps));
  assert.deepEqual(port.asked, [], 'nothing was lost, so nothing was asked');

  assert.equal(k.packs().find((p) => p.id === 'people')?.version, FIRST_PARTY_VERSIONS.people);
  assert.ok(held(k).includes('organisations'), 'organisations are a list of the record now');
  for (const f of ['keys', 'org', 'self', 'aliases']) assert.ok(fieldsOf(k, 'people').includes(f), `a person has ${f}`);
  assert.equal(k.count('people'), 6, 'every person is still there');
  assert.equal(k.count('organisations'), 0, 'and no example organisation was written');

  /* THE LINKS THAT CAME AFTER: Money's ledger names an organisation once People holds them. */
  assert.ok(fieldsOf(k, 'transactions').includes('party'), 'the ledger can say who a payment was with');
  assert.ok(steps.some((s) => s.pack === 'money-core' && s.did === 'updated'), JSON.stringify(steps));

  /* AND ONCE IN, THE NEXT RUN HAS NOTHING TO DO: no update and no relink every night. */
  assert.deepEqual(await updateFirstParty(port), []);
  sql.close();
});

test('A PERSON MADE THEIR OWN ORGANISATIONS: the update would take it over, which no yes could install, so nothing is asked and nothing goes in', async () => {
  const { k, sql } = await onPeople2();
  value(
    await k.install([
      {
        id: 'register.organisations',
        kind: 'register',
        body: { id: 'organisations', name: 'Companies', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
      },
    ]),
  );
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  const people = steps.find((s) => s.pack === 'people');
  assert.equal(people?.did, 'refused', JSON.stringify(steps));
  assert.deepEqual(people?.lose, ['take over Companies, which you made yourself']);
  /* THE RECORD FILES A PACK QUESTION ONLY WHEN ITS ACCEPT WOULD INSTALL (`planAll`), and this one's would be refused. */
  assert.deepEqual(port.asked, [], 'no question a yes could not answer');
  assert.equal(k.packs().find((p) => p.id === 'people')?.version, '2.7.0', 'nothing went in');
  sql.close();
});

test('AN UPDATE THAT WOULD BRING BACK WHAT THE PERSON TOOK OFF is asked once, in names, and nothing goes in until then', async () => {
  const { k, sql } = await onPeople2();
  value(k.retire(['page.someone'], { actor: 'p_1' }));
  const port = { ...portOf(k, sql), tookOff: () => ['page.someone'] };
  const asked = port.asked;

  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'people')?.did, 'asked', JSON.stringify(steps));
  assert.equal(asked.length, 1, 'one question');
  const q = asked[0]!;
  assert.deepEqual(q.body, { install: 'people' }, 'the record installs its own document, so the question sends none');
  assert.equal(q.question, 'People has a newer version. Updating it would bring back Someone, which you took off. Update People?');
  assert.doesNotMatch(q.question, /page\.|register\.|\d+\.\d+\.\d+|\u2014/u, 'names, not ids or versions, and no dash');
  assert.equal(k.packs().find((p) => p.id === 'people')?.version, '2.7.0', 'nothing went in');

  const again = await updateFirstParty(port);
  assert.equal(again.find((s) => s.pack === 'people')?.did, 'waiting');
  assert.equal(asked.length, 1, 'and it is not asked a second time');
  sql.close();
});

test('WHAT THE PERSON TOOK OFF A MODULE AT THIS VERSION STAYS OFF: the relink after an update never adds', async () => {
  const { k, sql } = await onPeople2();
  const port = portOf(k, sql);
  await updateFirstParty(port);
  const off = ['metric.organisations-count', 'rule.meet-payees'];
  value(k.retire(off, { actor: 'p_1' }));

  assert.deepEqual(await updateFirstParty(port), []);
  const live = (k.declarations() as { id: string }[]).map((d) => d.id);
  for (const id of off) assert.ok(!live.includes(id), `${id} stays off`);
  sql.close();
});

/**
 * A MODULE WHOSE NEW VERSION ONLY LAYS ITS PAGES OUT AGAIN, AND ADDS A FIGURE TO DRAW ON, REACHES A RECORD ON ITS OWN.
 * Money 3.11.0 and Work 1.15.0 move their tiles and Work gains `tasks-this-week-yours`; Money 3.12.0
 * gains `runs-out-on` and draws it on Runs out; nothing is taken away, so a record holding the version before is
 * updated with no question. The version before is made here from this
 * build's document, its pages laid out differently and the new figure left out, which is the shape of the change.
 */
test('AN UPDATE THAT ONLY REARRANGES A PAGE GOES IN ON ITS OWN, and asks nothing', async () => {
  const before = (version: string): string => {
    const [major, minor] = version.split('.').map(Number);
    return `${major}.${minor! - 1}.0`;
  };
  const earlier = (doc: Body, id: string): Body => {
    const decls = (doc.declarations as Body[])
      .filter((d) => d.metric !== 'tasks-this-week-yours' && d.metric !== 'runs-out-on')
      .map((d) => {
        if (typeof d.page !== 'string') return d;
        const { layout: _layout, ...page } = d;
        const blocks = (page.blocks as Body[])
          .filter((b) => (b.when as { metric?: string } | undefined)?.metric !== 'tasks-this-week-yours')
          /* AND THE LIST DRAWN ON IT AND ON WHAT IS LATE (Late and this week). */
          .filter((b) => !((b.when as { any?: { metric?: string }[] } | undefined)?.any ?? []).some((w) => w.metric === 'tasks-this-week-yours'))
          /* AND RUNS OUT AS IT WAS BEFORE money-core 3.12.0: the count of days, with no day to draw and no line under it. */
          .map((b) => (Array.isArray(b.cells) ? { ...b, cells: (b.cells as Body[]).map((c) => (c.metric === 'runs-out-on' ? { metric: 'runway-days', label: c.label } : c)) } : b))
          .map(({ area: _area, ...b }) => ({ ...b, span: 12 }));
        return { ...page, blocks: [blocks[0]!, ...blocks.slice(1).reverse()] };
      });
    return { ...doc, version: before(FIRST_PARTY_VERSIONS[id as 'work']), declarations: decls };
  };
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    const doc = documentFor(k, m)!;
    await put(k, sql, m === 'money-core' || m === 'work' ? earlier(doc, m) : doc);
  }
  assert.equal(k.packs().find((p) => p.id === 'work')?.version, before(FIRST_PARTY_VERSIONS.work));
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  for (const id of ['money-core', 'work'] as const)
    assert.deepEqual(
      steps.find((s) => s.pack === id),
      { pack: id, from: before(FIRST_PARTY_VERSIONS[id]), to: FIRST_PARTY_VERSIONS[id], did: 'updated' },
      JSON.stringify(steps),
    );
  assert.deepEqual(port.asked, [], 'nothing was lost, so nothing was asked');
  /* AND THE PAGES ARE THIS BUILD'S: Money's one column, and This week drawn on the new figure. */
  const page = value<{ layout?: unknown; blocks: { heading?: string; when?: { metric?: string } }[] }>(k.page('money'));
  /* NO SIDE COLUMN SINCE money-core 3.29.0: the home is one column of tiles, and its pages carry what the rail held. */
  assert.equal(page.layout, undefined);
  const work = value<{ blocks: { heading?: string; when?: { metric?: string } }[] }>(k.page('work'));
  /* THIS WEEK IS ITS OWN BAND AGAIN, SINCE the screens scope of 24 October, named Your work this week since work 1.20.1. */
  assert.equal(work.blocks.find((b) => b.heading === 'Your work this week')?.when?.metric, 'tasks-this-week-yours');
  /* AND LASTS SAYS THE DAY, over the figure the update brought with it (money-core 3.12.0): in the sentence under how long
     the money lasts with nothing coming in since 3.27.0, where it was a figure of its own, and since 3.29.0 a cell of the
     hero, beside the day it runs out on. Since 3.29.1 the day is that cell's alone, and the sentence under how long it
     lasts with nothing coming in says only the day that ends on. */
  /* SINCE 3.33.0 (41fc3ea51) IT IS ONE LINE UNDER CASH NOW, and the cells are the two thirty days. */
  const hero = (page.blocks as { lead?: boolean; cells?: { metric: string; note?: string }[] }[]).find((b) => b.lead === true && Array.isArray(b.cells));
  const cash = hero?.cells?.find((c) => c.metric === 'cash-now');
  assert.match(cash?.note ?? '', /\{\{runs-out-on\}\}/u, 'the hero says no day the money runs out on');
  assert.equal((cash?.note ?? '').match(/\{\{runs-out-on\}\}/gu)?.length, 1, 'the day the money runs out is said twice on one tile');
  assert.ok(k.packClaims('money-core').includes('metric.runs-out-on'), 'the day the money runs out did not reach the record');
  sql.close();
});

/**
 * A USE CASE WHOSE NEW VERSION ONLY COLOURS A TILE THAT IS ALREADY THERE LOSES NOTHING EITHER. Founder 2.2.0 and Team
 * 2.17.0 take the project template's `tones:` on Where it stands and nothing else, so over a record holding the version
 * before, the plan is one page changed, nothing a person would be asked about, and it goes in. The version before is
 * made from this build's document with the tones left off, which is the whole of the change.
 */
test("A USE CASE'S UPDATE THAT ONLY TONES A TILE LOSES NOTHING, and goes in over the version before", async () => {
  const stands = (doc: Body): Body => ((doc.declarations as Body[]).find((d) => d.page === 'project')!.blocks as Body[]).find((b) => b.heading === 'Where it stands')!;
  for (const id of ['founder', 'team']) {
    const u = useCase(id)!;
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    for (const m of modulesFor(u, ['people', ...u.modules])) if (m !== 'agents') await put(k, sql, documentFor(k, m)!);

    const now = carriedDocument(u, TODAY)!;
    assert.deepEqual(stands(now).tones, { at_risk: 'warn', off_track: 'bad' }, `${id}: on track wears no mark`);
    const [major, minor] = u.version.split('.').map(Number);
    /* A MAJOR STEP'S VERSION BEFORE IS THE LAST MAJOR'S, founder 3.0.0's a 2.x. */
    const before = minor! > 0 ? `${major}.${minor! - 1}.0` : `${major! - 1}.99.0`;
    const earlier: Body = {
      ...now,
      version: before,
      declarations: (now.declarations as Body[]).map((d) =>
        d.page === 'project' ? { ...d, blocks: (d.blocks as Body[]).map((b) => (b.heading === 'Where it stands' ? (({ tones: _tones, ...rest }) => rest)(b) : b)) } : d,
      ),
    };
    await put(k, sql, earlier);
    const pack = `usecase-${id}`;
    assert.equal(k.packs().find((p) => p.id === pack)?.version, before);

    const next = value<Pack>(await normalise(now, { kind: 'local' }));
    const diff = await plan(next, stateOf(k, sql));
    assert.deepEqual(losses(diff), [], `${id}: nothing would be lost`);
    assert.deepEqual([diff.adds.length, diff.retires.length, diff.conflicts.length], [0, 0, 0], `${id}: only a page changed`);
    value(await install(next, diff, hostFor(k), diff.planHash));
    assert.equal(k.packs().find((p) => p.id === pack)?.version, u.version);
    const held = (k.declarations() as { id: string; body: unknown }[]).find((d) => d.id === 'page.project')!;
    const body = (typeof held.body === 'string' ? JSON.parse(held.body) : held.body) as { blocks: Body[] };
    assert.deepEqual(body.blocks.find((b) => b.heading === 'Where it stands')?.tones, { at_risk: 'warn', off_track: 'bad' }, `${id}: the page is this build's`);
    sql.close();
  }
});

/* ── the second design review's fixes, over the versions before them ───────────────────────────────────────────────── */

/** What a record on a version holds, hashed as `pack-versions.test.ts` and `usecase-versions.test.ts` hash it. */
const fingerprintOf = (d: Body): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/** A document with one page's blocks rewritten, and optionally some of its declarations left out. */
const withPage = (doc: Body, page: string, blocks: (now: Body[]) => Body[], keep: (d: Body) => boolean = () => true): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).filter(keep).map((d) => (d.page === page ? { ...d, blocks: blocks(d.blocks as Body[]) } : d)),
});

/** A block with a heading and a glyph put back straight after its kind, where every block here writes them. */
const headed = ({ kind, ...rest }: Body, heading: string, icon: string): Body => ({ kind, heading, icon, ...rest });

const SIGNS_ADDED = new Set(['ledger-rows-7d', 'ledger-newest-days', 'currencies-held', 'uncategorised-share-30d', 'statement-oldest-days', 'nights-missed-30d', 'repeating-overdue']);

/**
 * A VERSION BEFORE 3.16.0 WITHOUT `cash-stale`, for the tests below that measure page fixes going in on their own: 3.16.0
 * takes the rule away, which is a loss a record is asked about once (`TAKING CASH STALE AWAY IS ASKED`), and those tests
 * measure the pages, not that question.
 */
/**
 * AND 3.16.0'S CATEGORIES GOING THE OTHER WAY (hop-figures-50) AND THE LEDGER'S OWN ORDER (list-order-50), folded into
 * the same unreleased step: `categories-against-direction` and its line under Heads up go, and the Ledger declares no order.
 */
const withoutDirection = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.metric !== 'categories-against-direction')
    .map((d) => {
      if (d.register === 'transactions' && d.order !== undefined) return (({ order: _order, ...rest }) => rest)(d);
      if (Array.isArray(d.blocks))
        return { ...d, blocks: (d.blocks as Body[]).filter((b) => (b.when as Body | undefined)?.metric !== 'categories-against-direction') };
      return d;
    }),
});
/**
 * AND 3.17.0'S FILING RULES AND CLOSED ACCOUNTS (filing-list-56, account-state-56), folded into the same unreleased step:
 * the list Filing rules and the Ledger's `filed_by` go, a category's How it matches loses `pattern`, `txn-categorise`
 * links a category by its Matches alone, Accounts loses its Status, and nothing leaves a closed account out.
 */
const NOT_CLOSED = ', state is not closed';
const open = (b: Body): Body => (typeof b.where === 'string' && b.where.includes(NOT_CLOSED) ? { ...b, where: b.where.replace(NOT_CLOSED, '') } : b);
/**
 * AND 3.17.0'S PLANS (plans-list-66), folded into the same unreleased step: the list Plans goes,
 * an instalment loses Part of and Left after, and the script that makes and counts plans goes with the rule that starts it.
 * AND BATCH 68'S, folded into the same unreleased step: the rule a new plan starts the script by (plans-calm-67-68), the
 * page of one plan with its eight figures (plan-page-68), and the day a category passed its budget (budget-passed-on-68).
 */
const PLAN_FIELDS: ReadonlySet<string> = new Set(['plan_row', 'left_after']);
const PLAN_FIGURES_68: ReadonlySet<string> = new Set(['plan-parts-paid', 'plan-parts', 'plan-paid', 'plan-left', 'plan-next-due', 'plan-last-due', 'installments-paid-by-plan', 'installments-total-by-plan', 'budget-passed-on']);
/** AND BATCH 70'S (instalments-tile-70): Money's Instalments tile counts the list's own parts again, as it did before it read the two figures by plan. */
const INSTALMENTS_BY_PARTS: Body = {
  kind: 'progress',
  heading: 'Instalments',
  icon: 'credit-card',
  span: 12,
  source: 'register.installments',
  where: 'direction is out, state is not cancelled',
  columns: [{ field: 'plan' }, { field: 'state' }],
  limit: 6,
  when: { metric: 'installments-left', gt: 0 },
  empty: 'Nothing is being paid in parts.',
};
/**
 * AND BATCH 70'S (money-wire-70): This month's spending and Budgets leave Money, Being chased
 * stands straight after Instalments again, and the folded History heading is back over In and out, by month.
 */
const HISTORY_FOLD: Body = { kind: 'section', heading: 'History', icon: 'history', span: 12, fold: true, when: { metric: 'cash-accounts', gt: 0 } };
const moneyBeforeSpending = (blocks: Body[]): Body[] =>
  blocks
    .filter((b) => b.heading !== "This month's spending" && b.heading !== 'Budgets')
    .flatMap((b) => (b.heading === 'Instalments' ? [b, CHASING[0] as Body] : b.heading === 'In and out, by month' ? [HISTORY_FOLD, b] : [b]));
const withoutCashStale = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).filter((d) => d.rule !== 'cash-stale') });
/**
 * AND BATCH 75'S, folded into the same unreleased step and undone first: an invoice's Draft to send goes from Bills and
 * invoices, and the step that writes it goes from the rule that answers Chase it (money-chase-draft-75).
 */
const withoutBatch75 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) =>
    d.register === 'obligations' && Array.isArray(d.fields)
      ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'chase_draft') }
      : d.rule === 'invoice-chased' && Array.isArray(d.steps)
        ? { ...d, steps: (d.steps as Body[]).filter((step) => (step.if as Body | undefined)?.field !== 'chase_draft') }
        : d,
  ),
});
/**
 * AND BATCH 76'S, folded into the same unreleased step and undone first: the day one book's money runs out,
 * `book-lasts-until`, goes, and with it the cell Money lasts until on a book's What is due (book-lasts-until-76, REC-A09
 * step 2); it is left out as `runs-out-on` is above. The starter categories batch 76 gave Money (ruling 341) are seeds,
 * which no fingerprint reads.
 */
const withoutBatch76 = (doc: Body): Body =>
  withPage(
    doc,
    'money-book',
    (now) => now.map((b) => (Array.isArray(b.cells) ? { ...b, cells: (b.cells as Body[]).filter((c) => c.metric !== 'book-lasts-until:{{name}}') } : b)),
    (d) => d.metric !== 'book-lasts-until',
  );
/**
 * AND BATCH 77'S, folded into the same unreleased step and undone first: the rule that answers Chase it holds one draft
 * step again, batch 75's, written wherever Draft to send is empty. The step for an invoice paid in part goes, and the
 * other loses the half of its condition that left such an invoice to it (chase-part-paid-77).
 */
const DRAFT_EMPTY = (c: unknown): boolean => (c as Body | undefined)?.field === 'chase_draft' && (c as Body).empty === true;
const withoutBatch77 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => {
    if (d.rule !== 'invoice-chased' || !Array.isArray(d.steps)) return d;
    const steps: Body[] = [];
    for (const step of d.steps as Body[]) {
      const all = (step.if as Body | undefined)?.all;
      if (!Array.isArray(all) || !all.some(DRAFT_EMPTY)) {
        steps.push(step);
        continue;
      }
      /* The step for every other invoice is the one that says which invoices it is not for (`none`). */
      if (all.some((c) => Array.isArray((c as Body).none))) steps.push({ ...step, if: all.find(DRAFT_EMPTY) as Body });
    }
    return { ...d, steps };
  }),
});
/**
 * AND BATCH 78'S, folded into the same unreleased step and undone first. Money's line of what there is draws again on
 * one book alone, and the same line ending on the year goes (money-lasts-line-78); the Heads up line on
 * categories that Money gave up for it was never in a released version and is taken off by `withoutDirection`, so it
 * is not put back. A book's line that its money lasts the year goes (book-lasts-year-78). And the
 * search for what a payment paid goes whole: its script, the rule that starts it and the rule that marks an
 * instalment paid by the payment it names (match-payment-78). `repeating-overdue`, whose `where` and
 * count batch 78 changed, is dropped whole with the other signs (`SIGNS_ADDED`).
 *
 * AND BATCH 80'S SECOND STEP OF THAT RULE, with the script it starts (repeating-settle-79-80): the rule goes whole
 * already, so the script that marks a repeating line paid is the one thing more to drop.
 */
const BEYOND = (c: unknown): boolean => (c as Body | undefined)?.metric === 'runway-days' && typeof (c as Body).beyond === 'boolean';
const withoutBatch78 = (doc: Body): Body => {
  const lasts = (b: Body): Body[] => {
    const all = (b.when as Body | undefined)?.all;
    if (b.kind !== 'note' || !Array.isArray(all) || !all.some(BEYOND)) return [b];
    /* The line of what there is carries `beyond: false` and goes back to its one condition; the other is the new line. */
    return all.some((c) => (c as Body).beyond === true) ? [] : [{ ...b, when: all.find((c) => !BEYOND(c)) as Body }];
  };
  const money = withPage(doc, 'money', (now) => now.flatMap(lasts));
  const book = withPage(money, 'money-book', (now) => now.filter((b) => !(b.kind === 'note' && (b.when as Body | undefined)?.metric === 'book-lasts-until:{{name}}')));
  return { ...book, declarations: (book.declarations as Body[]).filter((d) => d.script !== 'match_payment' && d.rule !== 'payment-matches' && d.rule !== 'instalment-settles' && d.script !== 'file_back' && d.script !== 'learn_category' && d.rule !== 'rule-files-back' && d.rule !== 'category-teaches' && d.rule !== 'category-taught' && d.script !== 'settle_matched_line' && d.rule !== 'recurring-went-through') };
};
/** AND BATCH 92'S, folded into the same unreleased step and undone first (money-every-month-92): the walk of the next thirty days stands under Coming and going again, Every month goes, and the chart reads twelve months back. And a deleted payment no longer reopens its bill (unsettle-92): `payment-unsettles` and its script go. The walk put back walks no add-on's list, which it did not then (Certificates came in money-core 3.29.0). */
const NEXT_30_BRIDGE = withoutLegs(NEXT_30.find((x) => x.kind === 'bridge') as Body, (register) => !ADDON_LEG_LISTS.has(register));
const withoutBatch92 = (doc: Body): Body => {
  const money = withPage(doc, 'money', (now) => now.filter((b) => b.heading !== 'Every month').flatMap((b) => (b.heading === 'Coming and going' ? [b, NEXT_30_BRIDGE] : [b])).map((b) => (b.heading === 'In and out, by month' ? { ...b, back: 12 } : b)));
  return { ...money, declarations: (money.declarations as Body[]).filter((d) => d.script !== 'unsettle' && d.rule !== 'payment-unsettles') };
};
/**
 * AND BATCH 95'S, folded into the same unreleased step and undone first (money-board-place-95, REC-B23 step 7;
 * money-lasts-no-income-95). Waiting on you stands under Accounts in the side column again and the
 * costs by category leave Money; and the line loses how long the cash lasts with no income, its figure with it, each of
 * the three lead notes ending where it ended before. On a document without the second job both find nothing.
 */
const NO_INCOME_95: readonly (readonly [string, string])[] = [
  [', and it lasts {{lasts-no-income}} day(s) with no income.', '.'],
  [', or {{lasts-no-income}} day(s) with no income.', '.'],
];
const withoutBatch95 = (doc: Body): Body =>
  withPage(
    doc,
    'money',
    (now) =>
      now
        .filter((b) => b.heading !== 'Every month, by category')
        .flatMap((b) => (b.heading === 'Accounts' && b.area === 'rail' ? [b, QUEUE[0] as Body] : [b]))
        .map((b) => (b.kind === 'note' && b.lead === true && typeof b.body === 'string' ? { ...b, body: NO_INCOME_95.reduce((body, [ends, was]) => (body.endsWith(ends) ? body.slice(0, -ends.length) + was : body), b.body) } : b)),
    (d) => d.metric !== 'lasts-no-income',
  );
/**
 * AND BATCH 100'S, folded into the same unreleased step and undone first. The side column's tile is Runs out again,
 * drawn in the danger colour whenever the walk goes under, where it is Lasts, calm (money-lasts-tile-100). Cash ahead
 * opens on three months on Money and on a year on a book's page, with no ten weeks and no `axis`, and a book's empty
 * line says the next twelve months (money-ten-weeks-100). Where it went comes off the end of Money, and This month's
 * spending and Budgets stand after Instalments again, with Last confirmed under Heads up (money-where-it-went-100).
 * The two ids of money-next-moves-100 go with `withoutBatch78`, and `settle`, whose text it changed, goes whole below.
 */
const RUNS_OUT_99: Body = {
  kind: 'stat',
  heading: 'Runs out',
  icon: 'alert',
  span: 12,
  area: 'rail',
  tone: 'bad',
  cells: [{ metric: 'runs-out-on', label: 'On what is due', note: 'In {{runway-days}}' }],
  when: { metric: 'runway-days', gte: 0 },
};
/**
 * AND THE UI PASS OF 20 OCTOBER'S, folded into the same unreleased 3.17.0 and undone first (money F3): Heads up's two
 * late lines say "late", where they said "past their due date" and "still". The Lasts tile's second cell and its new
 * label go with the tile itself (`withoutBatch100` puts Runs out back), and the lead lines lost only the clause batch
 * 95 had added, which `withoutBatch95` finds nothing of.
 */
const LATE_WORDS_UI: readonly (readonly [string, string])[] = [
  ['Invoices {{bad:late}}: {{late-in}} to come in.', 'Invoices {{bad:past their due date}}: {{late-in}} still to come in.'],
  ['Bills {{bad:late}}: {{overdue}} to pay.', 'Bills {{bad:past their due date}}: {{overdue}} still to pay.'],
];
/**
 * AND THE SAME PASS'S F5, undone with it: Instalments says what is next under each bar from three figures after its two
 * counts, and Coming and going's calendar of what falls due names a third column, the amount. Both go, and so do the
 * three figures, the last of the pack's.
 */
const NEXT_PART: ReadonlySet<string> = new Set(['installments-next-due-by-plan', 'installments-left-by-plan', 'installments-after-next-by-plan']);
const withoutUiPass = (doc: Body): Body => {
  const page = withPage(doc, 'money', (now) =>
    now.map((b) => {
      if (b.heading === 'Instalments' && Array.isArray(b.cells)) return { ...b, cells: (b.cells as Body[]).filter((c) => !NEXT_PART.has(String(c.metric))) };
      if (b.heading === 'Due in the next 30 days' && Array.isArray(b.columns)) return { ...b, columns: (b.columns as Body[]).slice(0, 2) };
      return typeof b.body === 'string' ? { ...b, body: LATE_WORDS_UI.reduce((body, [is, was]) => (body === is ? was : body), b.body) } : b;
    }),
  );
  return { ...page, declarations: (page.declarations as Body[]).filter((d) => !NEXT_PART.has(String(d.metric))) };
};
/**
 * AND THE SAME PASS'S LAST ROUND (P20), undone before it: Heads up stands in the side column with each line
 * ending on its one way to act, and the box that took today's balance is off Money, so Runs out stands beside Lasts in
 * the room it left. The line says how far the cash moved in words (`.moved`), where it said a signed percent.
 */
const STALE_LINE = "The oldest balance in Cash now was last confirmed on {{cash-as-of}}. Say what an account holds today and this page starts from today's money.";
const ACTS = / \[(?:See them|Update balances)\]\([^)]*\)$/u;
/* And Bills and invoices said one of it as `item`, before P25 named it `bill or invoice`. */
const itemAgain = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).map((d) => (d.one === 'bill or invoice' ? { ...d, one: 'item' } : d)) });
/**
 * MONEY 3.18.0 COMES OFF FIRST: no figure of the parts late, the lines with no sentence of
 * the part after the money and the line for two books its two counts again, and Heads up's line of bills late alone.
 */
const LATE_PART_18 = ' {{installments-late.first}} is {{bad:late}}: {{installments-late.first_amount}}, due {{ago:installments-late.first_due}}.';
const BILLS_LATE_17 = 'Bills {{bad:late}}: {{overdue}} to pay. [See them](/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today)';
const withoutLatePart = (doc: Body): Body =>
  withPage(
    doc,
    'money',
    (now) =>
      now.map((b) => {
        if (b.lead === true && typeof b.body === 'string')
          return { ...b, body: b.body.startsWith('You have') ? 'Your money is kept in {{books-held}} books, across {{cash-accounts}} account(s).' : b.body.replace(LATE_PART_18, '') };
        if (Array.isArray(b.says)) return { kind: b.kind, tone: b.tone, span: b.span, area: b.area, body: BILLS_LATE_17, when: { metric: 'overdue', gt: 0 } };
        return b;
      }),
    (d) => d.metric !== 'installments-late',
  );
/**
 * PEOPLE 3.9.0 COMES OFF BEFORE IT: no figure for the shops a card text named nor
 * the line that says them, organisations of every kind counted and listed, and Everyone's role and organisation.
 */
const withoutCardTexts39 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.metric !== 'organisations-from-card-texts')
    .map((d) => {
      const unkinded = (where: unknown) => (typeof where === 'string' ? where.replace(', kind is set', '') : where);
      if (d.metric === 'organisations-count') return { ...d, where: unkinded(d.where) };
      if (d.page === 'people' && Array.isArray(d.blocks))
        return {
          ...d,
          blocks: (d.blocks as Body[])
            .filter((b) => (b.when as Body | undefined)?.metric !== 'organisations-from-card-texts')
            .map((b) =>
              b.source === 'register.organisations' && b.kind === 'table'
                ? { ...b, where: unkinded(b.where) }
                : b.heading === 'Everyone'
                  ? {
                      ...b,
                      columns: [
                        { field: 'name', label: 'Name', as: 'who' },
                        { field: 'role', label: 'Role', as: 'fact' },
                        { field: 'org', label: 'With', as: 'fact' },
                        { field: 'in_touch', label: 'Last spoke', as: 'when' },
                      ],
                    }
                  : b,
            ),
        };
      return d;
    }),
});
/**
 * PEOPLE 3.8.0 COMES OFF FIRST: no Retired on for an organisation, nor a `retired` part in
 * its `org:`, and its list and count read every organisation not folded into another.
 */
const withoutRetired38 = (raw: Body): Body => ((doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => {
    if (d.register === 'organisations' && Array.isArray(d.fields)) {
      const { retired: _retired, ...org } = d.org as Body;
      return { ...d, org, fields: (d.fields as Body[]).filter((f) => f.id !== 'retired_on') };
    }
    if (d.metric === 'organisations-count') return { ...d, where: 'merged_into is empty' };
    if (d.page === 'people' && Array.isArray(d.blocks))
      return { ...d, blocks: (d.blocks as Body[]).map((b) => (b.source === 'register.organisations' && b.kind === 'table' ? { ...b, where: 'merged_into is empty' } : b)) };
    return d;
  }),
}))(withoutCardTexts39(raw));
/**
 * MONEY 3.22.0 COMES OFF FIRST: no "Made one with" on Plans, no rule that moves a plan's
 * parts once it is made one with another, and the plans script as 3.21.0 released it, matching names letter for letter.
 */
/**
 * MONEY 3.23.0 COMES OFF BEFORE ALL (the look of 25 October): the Lasts tile's two cells say what 3.22.0 released, "With
 * what is due" and "If nothing comes in".
 */
/**
 * MONEY 3.27.0 COMES OFF BEFORE ALL: no figures of what the walk moves in each month ahead, In and out, by month reads
 * bills due once and what repeats at its monthly share again, Cash ahead opens on ten weeks, Lasts draws its two
 * figures again with no sentence under them, the first line says one Cash now, and Every month is its two repeating
 * figures alone.
 */
const AHEAD_27 = new Set(['in-ahead-by-month', 'out-ahead-by-month']);
/* And the first line said one Cash now, over every account counted as cash. */
const CASH_APART_27 = "{{cash-now.apart}}, about {{cash-now.converted}} at {{cash-now.rate_on}}'s rate, across {{cash-by-account.groups}} account(s)";
const tenWeeks = (b: Body): Body => (b.kind === 'forecast' && b.horizon === 84 ? { ...b, horizon: 70, horizons: [70, 90, 180, 365, 730, 1825, 'last'] } : b);
const withoutAhead27 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => !AHEAD_27.has(d.metric as string))
    .map((d) =>
      d.page === 'money' || d.page === 'money-book'
        ? {
            ...d,
            blocks: (d.blocks as Body[]).map((b) =>
              Array.isArray(b.series) && b.heading === 'In and out, by month'
                ? {
                    ...b,
                    series: [
                      { metric: 'in-by-month', then: 'in-due-by-month', each: 'every-month-in', label: 'Money in' },
                      { metric: 'out-by-month', then: 'out-due-by-month', each: 'every-month-out', label: 'Money out', dir: 'out' },
                    ],
                  }
                : b.lead === true && typeof b.body === 'string'
                  ? { ...b, body: b.body.replace(CASH_APART_27, '{{cash-now}} across {{cash-accounts}} account(s)') }
                  : b.heading === 'Every month' && b.kind === 'stat'
                  ? { ...b, cells: [{ metric: 'every-month-in', label: 'Coming in' }, { metric: 'every-month-out', label: 'Going out' }] }
                  : b.heading === 'Lasts' && b.kind === 'stat'
                  ? { ...b, cells: [{ metric: 'runs-out-on', label: 'With what is due and expected', note: 'In {{runway-days}}' }, { metric: 'lasts-no-income', label: 'If nothing more comes in' }] }
                  : tenWeeks(b),
            ),
          }
        : d,
    ),
});
/**
 * MONEY 3.29.0 COMES OFF BEFORE ALL: no page per job under Money, and Categories without an icon, a colour, a share to
 * warn at, a carry over or a category it sits under. AND THE REBUILD IN THE SAME UNRELEASED STEP: none of the figures
 * the new pages read and no offer of budgets from last month and no warning of a budget near or over, a book's spending as bars and not a donut, a plan's page
 * as 3.28.0 declared it (`fixtures/money-plan-3.28.0.json`), and Money's home as 3.28.0 declared it, with its side column (`fixtures/money-home-3.28.0.json`), its walk keeping the legs over
 * the lists this record's own walks keep.
 */
const SECTION_29 = new Set(['money-accounts', 'money-ledger', 'money-budgets', 'money-coming', 'money-forecast', 'money-reports', 'money-payees']);
const CATEGORY_29 = new Set(['icon', 'colour', 'budget_alert', 'rollover', 'parent', 'budget_warned', 'warned_month']);
const FIGURES_29 = new Set([
  'budgets-total', 'budgets-unset', 'unfiled-spent-month', 'unfiled-month', 'payees-paid-90d', 'paid-times-by-payee-90d', 'paid-last-by-payee',
  'kept-share-90d', 'received-month', 'left-month', 'account-now', 'account-lines', 'account-gap', 'lines-by-account', 'account-in-by-month',
  'account-out-by-month', 'every-month-net', 'cash-foreign-share', 'plan-late', 'plan-parts-cancelled', 'plan-paid-by-quarter',
  'plan-parts-paid-by-plan', 'plan-parts-by-plan', 'plan-next-due-by-plan', 'plan-left-by-plan', 'plan-after-next-by-plan',
]);
const HOME_3_28 = JSON.parse(readFileSync(new URL('./fixtures/money-home-3.28.0.json', import.meta.url), 'utf8')) as Body;
/* AND A PLAN'S PAGE AS 3.28.0 DECLARED IT, before it was laid out as Property's: four figures, one track and every part in one list. */
const PLAN_3_28 = JSON.parse(readFileSync(new URL('./fixtures/money-plan-3.28.0.json', import.meta.url), 'utf8')) as Body;
const unsplit = (d: Body): Body => ({
  ...d,
  ...(typeof d.where === 'string' ? { where: d.where.replace(', parts is empty', '') } : {}),
  ...(typeof d.when === 'string' ? { when: d.when.replace(', parts is empty', '') } : {}),
});
const withoutSection29 = (doc: Body): Body => {
  const decls = doc.declarations as Body[];
  const walked = new Set(decls.flatMap((d) => [...((d.legs as Body[] | undefined) ?? []), ...((d.blocks as Body[] | undefined) ?? []).flatMap((b) => (b.from as Body[] | undefined) ?? [])].map((l) => String(l.register))));
  const home = { ...HOME_3_28, blocks: (HOME_3_28.blocks as Body[]).map((b) => (Array.isArray(b.from) ? { ...b, from: (b.from as Body[]).filter((l) => walked.has(String(l.register))) } : b)) };
  return {
    ...doc,
    declarations: decls
      .filter((d) => !SECTION_29.has(d.page as string) && !FIGURES_29.has(d.metric as string) && d.script !== 'offer_budgets' && d.script !== 'budget_watch' && d.rule !== 'budget-near' && d.rule !== 'budget-over')
      /* AND NO ENTRY SPLIT INTO PARTS: no `parts` on the Ledger, and nothing filed is told apart from a split entry. */
      .map((d) => (d.metric === 'txn-uncategorised' || d.rule === 'txn-categorise' ? unsplit(d) : d))
      .map((d) =>
        d.register === 'transactions' && Array.isArray(d.fields)
          ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'parts') }
          : d.register === 'categories' && Array.isArray(d.fields)
          ? { ...d, fields: (d.fields as Body[]).filter((f) => !CATEGORY_29.has(f.id as string)) }
          : d.page === 'money'
            ? { ...home, nav: d.nav }
            : d.page === 'money-plan'
              ? PLAN_3_28
              : d.page === 'money-book'
              ? { ...d, blocks: (d.blocks as Body[]).map(({ donut: _donut, ...b }) => b) }
              : d,
      ),
  };
};
/**
 * MONEY 3.29.1 COMES OFF BEFORE ALL: the words of 3.29.0 on the pages that outlive the step above, a book's page, the
 * filing rules and an account's page, as 3.29.0 declared them (`fixtures/money-pages-3.29.0.json`). The other pages
 * 3.29.1 reworded are taken away or replaced by the step above.
 */
const PAGES_3_29 = new Map((JSON.parse(readFileSync(new URL('./fixtures/money-pages-3.29.0.json', import.meta.url), 'utf8')) as Body[]).map((d) => [d.page, d]));
const withoutWords291 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => PAGES_3_29.get(d.page) ?? d),
});
/**
 * MONEY 3.30.0 COMES OFF BEFORE ALL: no category says the money stays yours, so the Ledger reads no `stays` through it,
 * and no figure, page or walk says `stays is not true`.
 */
const unstayed = (v: unknown): unknown =>
  typeof v === 'string'
    ? v.replace(', stays is not true', '')
    : Array.isArray(v)
      ? v.map(unstayed)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v as Body).map(([k, x]) => [k, unstayed(x)]))
        : v;
const withoutStays330 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => {
    const out = unstayed(d) as Body;
    if (out.register === 'transactions' && Array.isArray(out.fields)) return { ...out, fields: (out.fields as Body[]).filter((f) => f.id !== 'stays') };
    if (out.register === 'categories' && Array.isArray(out.fields)) return { ...out, fields: (out.fields as Body[]).filter((f) => f.id !== 'transfer') };
    return out;
  }),
});
/** MONEY 3.24.0 COMES OFF FIRST (the look of 26 October): the Accounts split read six accounts at most. */
const withoutLimit24 = (doc: Body): Body =>
  withPage(doc, 'money', (now) => now.map((x) => (x.heading === 'Accounts' && x.limit === 12 ? { ...x, limit: 6 } : x)));
const withoutLasts23 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) =>
    Array.isArray(d.cells)
      ? {
          ...d,
          cells: (d.cells as Body[]).map((c) =>
            c.label === 'With what is due and expected' ? { ...c, label: 'With what is due' } : c.label === 'If nothing more comes in' ? { ...c, label: 'If nothing comes in' } : c,
          ),
        }
      : d,
  ),
});
const PLANS_3_21 =((await import(new URL('./fixtures/plans-from-names-3.21.0.js', import.meta.url).href)) as { PLANS_FROM_NAMES_SCRIPT: Body }).PLANS_FROM_NAMES_SCRIPT;
const withoutTwins22 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.rule !== 'plan-made-one')
    .map((d) =>
      d.register === 'plans' && Array.isArray(d.fields)
        ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'one_with') }
        : d.script === 'plans_from_names'
          ? { ...d, source: PLANS_3_21.source }
          : d,
    ),
});
/**
 * MONEY 3.21.0 COMES OFF NEXT: the calendar of what falls due under Coming and
 * going wears its own heading and glyph again, and reads Bills and invoices alone, while one falls due.
 */
const withoutCalendar21 = (doc: Body): Body =>
  withPage(doc, 'money', (now) =>
    now.map((b) =>
      b.kind === 'calendar' && b.source === 'deadlines'
        ? {
            kind: 'calendar',
            heading: 'Due in the next 30 days',
            icon: 'calendar',
            span: b.span,
            source: 'register.obligations',
            where: DUE_30D,
            columns: [{ field: 'what' }, { field: 'due' }, { field: 'amount', sign: { field: 'direction', minus: 'owed_by_me' } }],
            back: b.back,
            ahead: b.ahead,
            when: { metric: 'due-items-30d', gt: 0 },
            empty: b.empty,
          }
        : b,
    ),
  );
/**
 * MONEY 3.20.0 COMES OFF BEFORE IT (B8 and B24 of 24 October): no sentence of what is to pay on the card in the lines
 * and no figure of it, no card fields on Accounts, no rule or script that works it out or asks to move a twin line on,
 * and no File old entries on the filing rules page.
 */
const CARD_20 = ' On the card: {{card-to-pay}} to pay, as of {{card-to-pay-on}}.';
const CARD_FIELDS_20: ReadonlySet<string> = new Set(['limit', 'to_pay', 'to_pay_on']);
const withoutCard20 = (doc: Body): Body => {
  const off = withPage(
    doc,
    'money',
    (now) => now.map((b) => (b.lead === true && typeof b.body === 'string' ? { ...b, body: b.body.replace(CARD_20, '') } : b)),
    (d) =>
      d.metric !== 'card-to-pay' && d.metric !== 'card-to-pay-on' && d.rule !== 'bill-moves-line' && d.rule !== 'card-text-owes' && d.rule !== 'card-limit-owes' && d.script !== 'move_line' && d.script !== 'card_owed',
  );
  const rules = withPage(off, 'money-rules', (now) => now.filter((b) => !(typeof b.body === 'string' && b.body.includes('[File old entries]'))));
  return {
    ...rules,
    declarations: (rules.declarations as Body[]).map((d) =>
      d.register === 'accounts' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => !CARD_FIELDS_20.has(String(f.id))) } : d,
    ),
  };
};
const withoutUiPassR3 = (doc: Body): Body =>
  withPage(itemAgain(doc), 'money', (now) =>
    now
      .filter((b) => b.heading !== 'Runs out')
      .flatMap((b): Body[] => {
        const { area: _area, ...rest } = b;
        const off = b.area === 'rail' && (b.heading === 'Heads up' || (b.kind === 'note' && b.lead !== true)) ? rest : b;
        if (typeof off.body !== 'string') return [off];
        if (off.lead === true) return [{ ...off, body: off.body.replace('{{cash-now.moved}}', '{{cash-now.change}}') }];
        if (off.body.startsWith('The oldest balance')) return [{ ...off, body: STALE_LINE }, AGES.find((x) => x.kind === 'capture') as Body];
        return [{ ...off, body: off.body.replace(ACTS, '') }];
      }),
  );
/**
 * THIS MONTH'S SPENDING AS 3.28.0 DREW IT, the whole width and its part with no category named "No category". Written out
 * because money-core 3.29.0 renamed and narrowed the part (`parts/spending.ts`), and a step older than it puts back what
 * was, not what is.
 */
const SPENDING_3_28: Body = {
  kind: 'bar',
  heading: "This month's spending",
  icon: 'chart-bar',
  span: 12,
  source: 'metric.spent-vs-last-month',
  unset: 'No category',
  when: { metric: 'spent-by-category-month', gt: 0 },
  empty: 'Nothing spent this month or last has a category yet.',
};
const WHERE_IT_WENT_100: ReadonlySet<string> = new Set(['Where it went', 'This month, by category', 'No category yet, by who was paid']);
const noAxis = ({ axis: _axis, ...rest }: Body): Body => rest;
const withoutBatch100 = (doc: Body): Body => {
  const money = withPage(doc, 'money', (now) =>
    now
      .filter((b) => !WHERE_IT_WENT_100.has(String(b.heading)))
      .flatMap((b): Body[] => {
        if (b.heading === 'Lasts' && b.area === 'rail') return [RUNS_OUT_99];
        if (b.heading === 'Cash ahead') return [noAxis({ ...b, horizon: 90, horizons: [90, 180, 365, 730, 1825, 'last'] })];
        if (b.heading === 'What it holds today') return [AGES[0] as Body, b];
        if (b.heading === 'Instalments') return [b, SPENDING_3_28, BUDGET.find((x) => x.kind === 'progress') as Body];
        return [b];
      }),
  );
  return withPage(money, 'money-book', (now) =>
    now.map((b) => (b.heading === 'Cash ahead' ? noAxis({ ...b, horizon: 365, horizons: [90, 180, 365, 730, 1825, 'last'], empty: 'Nothing in {{name}} is dated in the next twelve months.' }) : b)),
  );
};
/** Batch 63's four figures of this month's spending against last (spend-figures-63), new in the unreleased money-core 3.17.0. */
const SPEND_VS_LAST: ReadonlySet<string> = new Set(['spent-last-month', 'spent-by-category-last-month', 'spent-by-category-to-date-last-month', 'spent-vs-last-month']);
/** Projects' quiet line with the clause for its list's questions, added inside the unreleased portfolio 1.17.0 (waiting-work-projects-99). */
const QUIET_PROJECTS = 'Nothing needs a push, {{questions-open-in:things}} question(s) for you';
/**
 * PEOPLE'S EVERYONE AND ORGANISATIONS AS CARDS, BEFORE BATCH 6 made them lines (people as lines, the plan's People 2): each
 * person a little form of labelled facts grouped by the organisation they are with, three to a group, and each
 * organisation the same. Put back, so the marks the released versions were cut with are still read off today's page.
 */
const EVERYONE_CARDS: Body = {
  kind: 'cards',
  heading: 'Everyone',
  icon: 'people',
  span: 12,
  source: 'register.people',
  where: 'merged_into is empty',
  columns: [
    { field: 'name', label: 'Name', as: 'who' },
    { field: 'role', label: 'Role', as: 'fact' },
    { field: 'org', label: 'Organisation', as: 'fact' },
    { field: 'projects', label: 'Met in', as: 'fact' },
    { field: 'in_touch', label: 'Last in touch', as: 'when' },
  ],
  group: 'org',
  fold: 3,
  order: [
    { field: 'in_touch', dir: 'desc' },
    { field: 'seq', dir: 'desc' },
  ],
  empty: 'Nobody yet. Add someone, or an agent adds whoever it meets in a commit or a mail.',
};
const ORGANISATIONS_CARDS: Body = {
  kind: 'cards',
  heading: 'Organisations',
  icon: 'building',
  span: 12,
  source: 'register.organisations',
  where: 'merged_into is empty',
  when: { metric: 'organisations-count', gt: 0 },
  columns: [
    { field: 'name', label: 'Organisation', as: 'who' },
    { field: 'kind', label: 'Kind', as: 'fact' },
    { field: 'domain', label: 'Website', as: 'fact' },
  ],
  order: [{ field: 'name', dir: 'asc' }],
};
const peopleBefore6 = (b: Body): Body => (b.heading === 'Everyone' ? EVERYONE_CARDS : b.heading === 'Organisations' ? ORGANISATIONS_CARDS : b);

/**
 * PROJECTS AS IT WAS BEFORE portfolio 1.19.0 (the KPI plan of 21 October, K1-A): no Numbers, which it took over from the
 * founder use case, no Key numbers, no figures over them, and no kind on a project.
 */
/* AND portfolio 1.22.0'S SCRIPT THAT OFFERS THE KEY NUMBERS (`kpi_backfill`) goes with them.
   AND WITH PORTFOLIO 1.23.0'S STAGES, THEIR FIGURE AND THE PLAN'S KEPT SHAPE off first, newer still. */
const KPI_LISTS: ReadonlySet<string> = new Set(['datapoints', 'kpis', 'stages']);
const KPI_FIGURES: ReadonlySet<string> = new Set(['kpis-held', 'readings-held', 'kpi-stale', 'project-staged', 'project-plan-path', 'project-plan-roadmap']);
const beforeKpis = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    /* AND NUMBERS' OWN PAGE (portfolio 1.25.0), which reads the readings Portfolio holds only since 1.19.0. */
    .filter((d) => !KPI_LISTS.has(String(d.register)) && !KPI_FIGURES.has(String(d.metric)) && d.script !== 'kpi_backfill' && d.page !== 'all-numbers')
    /* AND 1.24.0'S OFFER BY KIND (B27 of 24 October), the rule and its script, which read the kind going below. */
    .filter((d) => d.rule !== 'kind-offers-kpis' && d.script !== 'kind_drafts')
    .map((d) => (d.register === 'things' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'kind' && f.id !== 'drawn_as') } : d)),
});

/**
 * THE VERSIONS OF THE SECOND DESIGN REVIEW, FROZEN FROM THE COMMITS THAT HELD THEM, each with what a record on them holds (`onRecord`, cut to the lists
 * held when it went in, in the order below). `BEFORE` is d3e7ca033 (work 1.15.0, portfolio 1.14.0, people 3.0.0, money-core 3.12.0) and `LATEST` 72ec5ab1d
 * (work 1.16.0, portfolio 1.15.0, people 3.1.0, money-core 3.13.0). THEY WERE REBUILT HERE BY UNDOING EVERY LATER CHANGE BY HAND, which took a function a release
 * and went red on the first release nobody undid. Written by reading those commits through `git archive`, and held to the fingerprints each version shipped with.
 */
type Frozen = { version: string; whole: Body; onRecord: Body };
type FrozenFile = { modules: Record<string, Frozen>; usecases: Record<string, Body> };
const frozenFile = (name: string): FrozenFile => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as FrozenFile;
const FROZEN_LATEST = frozenFile('review-2-after-2026-10-07.json');
const FROZEN_BEFORE = frozenFile('review-2-before-2026-10-07.json');
const LATEST: Record<string, Frozen & { released: string }> = {
  'money-core': { ...FROZEN_LATEST.modules['money-core']!, released: '2e09983b40aba73e' },
  portfolio: { ...FROZEN_LATEST.modules.portfolio!, released: '982f163d9d8ab76f' },
  work: { ...FROZEN_LATEST.modules.work!, released: 'b27c59050f32684d' },
  people: { ...FROZEN_LATEST.modules.people!, released: '36328d2fcaeb58f3' },
};
const BEFORE: Record<string, Frozen & { released: string }> = {
  work: { ...FROZEN_BEFORE.modules.work!, released: '285a35e7197ac5cb' },
  'money-core': { ...FROZEN_BEFORE.modules['money-core']!, released: 'f7558a5590d4ee11' },
  people: { ...FROZEN_BEFORE.modules.people!, released: 'd6246046a52dcc45' },
  portfolio: { ...FROZEN_BEFORE.modules.portfolio!, released: '51a2d8569a7b35e3' },
};

test('THE VERSIONS BEFORE THE SECOND DESIGN REVIEW, FROZEN, ARE THE ONES RELEASED, to the letter', () => {
  for (const [id, was] of [...Object.entries(BEFORE), ...Object.entries(LATEST)]) {
    const now = firstPartyDocument(id as never, { seeds: [] }) as unknown as Body;
    assert.notEqual(FIRST_PARTY_VERSIONS[id as 'work'], was.version, `${id} has not moved on from ${was.version}`);
    assert.equal(fingerprintOf(was.whole), was.released, `${id}: the frozen file is not ${was.version} as it was released`);
    assert.notEqual(fingerprintOf(now), was.released, `${id}: this build declares what ${was.version} did under a new version`);
  }
});

/**
 * WORK 1.16.0, PROJECTS 1.15.0, PEOPLE 3.1.0 AND MONEY 3.13.0 REACH A RECORD ON THEIR OWN. Each changes headings and
 * blocks on a page the record already holds, and People adds a figure; nothing is taken away, `people-in-touch-12w`
 * included, which no page draws now and which stays declared for exactly this reason. So a record holding the four
 * versions before is updated with no question, and its pages are this build's.
 */
test('THE SECOND DESIGN REVIEW’S PAGE FIXES GO IN ON THEIR OWN over the versions a record holds, and ask nothing', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    await put(k, sql, withoutCashStale(BEFORE[m]!.onRecord));
    assert.equal(k.packs().find((p) => p.id === m)?.version, BEFORE[m]!.version);
  }
  assert.ok(!k.packClaims('people').includes('metric.people-in-touch-90d'), 'the record starts without the figure the update brings');
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  for (const id of ['portfolio', 'people', 'money-core', 'work'] as const)
    assert.deepEqual(
      steps.find((s) => s.pack === id && s.from !== s.to),
      { pack: id, from: BEFORE[id]!.version, to: FIRST_PARTY_VERSIONS[id], did: 'updated' },
      JSON.stringify(steps),
    );
  assert.deepEqual(port.asked, [], 'nothing was lost, so nothing was asked');

  type Held = { kind: string; heading?: string; icon?: string; box?: boolean; fold?: boolean; tone?: string; when?: { metric?: string; gt?: number; lte?: number } };
  const blocks = (slug: string): Held[] => value<{ blocks: Held[] }>(k.page(slug)).blocks;
  /* THE BOARD AND THE WALK OF THIRTY DAYS WEAR NO HEADING. */
  assert.deepEqual(blocks('work-board').filter((b) => b.kind === 'board').map((b) => [b.heading, b.icon]), [[undefined, undefined]]);
  const money = blocks('money');
  /* AND SINCE REC-B23 NO WALK OF THIRTY DAYS AT ALL, and since money-core 3.29.0 no calendar either: Coming up names the
     next few things, and the Coming up page holds the rest. */
  assert.deepEqual([money.some((b) => b.kind === 'timeline' && b.heading === 'Coming up'), money.some((b) => b.kind === 'bridge' || b.kind === 'calendar')], [true, false]);
  /* PEOPLE DRAWS NO DOTS, AND SINCE 3.2.0 NO LIST OVER ITS CARDS EITHER, and keeps the figures the chart and the list drew on. */
  const people = blocks('people');
  assert.ok(!people.some((b) => b.kind === 'heat'), 'the twelve weeks of dots are still on People');
  /* EVERYONE THE FACES, SINCE People 3.6.0, the people and not a list over their cards; AND NO TABLE AT ALL SINCE People
     4.1.0, where the organisations went to their own list and People says how many in a line. */
  assert.deepEqual(people.filter((b) => b.kind === 'table').map((b) => b.heading), []);
  assert.deepEqual(people.filter((b) => b.kind === 'cards').map((b) => b.heading), ['Everyone']);
  for (const id of ['metric.people-in-touch-90d', 'metric.people-in-touch-12w']) assert.ok(k.packClaims('people').includes(id), `${id} is not on the record`);
  /* AND PROJECTS HOLDS NO HEADING OVER ITS CARDS (proj F5): what each earns alone, and
     the parked a lane of the cards. */
  const sections = blocks('portfolio').filter((b) => b.kind === 'section');
  assert.deepEqual(sections.map((b) => b.heading), []);

  /* AND ONCE IN, THE NEXT RUN HAS NOTHING TO DO. */
  assert.deepEqual(await updateFirstParty(port), []);
  sql.close();
});

/** The chart a project's page drew until founder 2.3.0 and team 2.18.0, as the template declared it. */
const DONE_BY_WEEK: Body = {
  kind: 'series',
  heading: 'Done, by week',
  icon: 'chart-column',
  span: 12,
  series: [{ metric: 'project-done-by-week:{{name}}', label: 'Done' }],
  back: 8,
  empty: 'Nothing on {{name}} was finished in these weeks.',
};

/**
 * A USE CASE'S PROJECT PAGE AS THE VERSION BEFORE DECLARED IT: Done, by week over the plan, and At a glance without what
 * was finished this week as its last figure. Founder's row had no such figure; Team's, made up from its tasks, had it
 * with no line asked for (`trend`).
 */
/**
 * AND THE FOUNDER AS 2.7.0 DECLARED IT, BEFORE 3.0.0 HANDED NUMBERS TO PORTFOLIO AND LAID ITS TWO LINKS ON IT: the
 * published 2.7.0 file, which declares what this build's 3.0.0 does but for Numbers (`founder-home.test.ts`), with its
 * settings. Undone first, so every version before is still the one released.
 */
const FOUNDER_2_7 = (() => {
  const file = JSON.parse(readFileSync(new URL('../../../apps/web/static/catalogue/usecases/founder/2.7.0.usecase.json', import.meta.url), 'utf8')) as unknown;
  return useCasePack(value<UseCase>(normaliseUseCase(file)))!;
})();
const handedBefore = (doc: Body, id: string): Body =>
  id !== 'founder' ? doc : (({ extends: _laid, ...rest }) => ({ ...rest, declarations: FOUNDER_2_7.declarations, config: FOUNDER_2_7.config, hands: FOUNDER_2_7.hands }))(doc);

/* AND ONE OF BILLS AND INVOICES WAS AN `item` (P25), which a use case's label setting starts from. */
const oneBefore = (doc: Body): Body => JSON.parse(JSON.stringify(doc).replaceAll('"default":"bill or invoice"', '"default":"item"').replaceAll('{"id":"retro","label":"How it went","type":"document"},', '')) as Body;

/**
 * THE PROJECT PAGE AS IT WAS BEFORE portfolio 1.23.0 (founder 3.2.0, team 2.24.0): no road of stages, the roadmap drawn
 * on its dated work alone, and its two opening sentences two notes on one figure.
 */
const roadBefore = (doc: Body): Body =>
  withPage(
    {
      ...doc,
      declarations: (doc.declarations as Body[]).map((d) =>
        d.page === 'project' && Array.isArray(d.requires) ? { ...d, requires: (d.requires as string[]).filter((r) => r !== 'register.stages') } : d,
      ),
    },
    'project',
    (now) =>
      now.flatMap((b): Body[] => {
        if (b.kind === 'steps' && b.heading === 'The road') return [];
        if (b.kind === 'note' && b.lead === true && Array.isArray(b.says)) {
          const { says, ...rest } = b as Body & { says: Body[] };
          return [
            { ...rest, when: says[0]!.when, body: says[0]!.body },
            { ...rest, when: { metric: 'project-in-review:{{name}}', is: 0 }, body: says[1]!.body },
          ];
        }
        const all = (b.when as { all?: Body[] } | undefined)?.all;
        if (b.kind === 'roadmap' && Array.isArray(all)) return [{ ...b, when: all[0] }];
        return [b];
      }),
  );

/** Handed back or blocked, as the project page declared it until founder 3.3.0 and team 2.25.0. */
const HANDED_BACK: Body = {
  kind: 'todo',
  heading: 'Handed back or blocked',
  icon: 'hourglass',
  span: 12,
  area: 'rail',
  source: 'register.tasks',
  where: 'thing is {{name}}, state is review or blocked',
  columns: [{ field: 'what' }, { field: 'state' }],
  order: [{ field: 'by', dir: 'asc' }],
  limit: 6,
  when: { metric: 'project-held-up:{{name}}', gt: 0 },
  empty: 'Nothing on {{name}} is handed back or blocked.',
};

/** Money by month, as the project page declared it until founder 3.3.0, on a record that keeps Money's transactions. */
const MONEY_BY_MONTH: Body = {
  kind: 'series',
  heading: 'Money by month',
  icon: 'chart-column',
  span: 12,
  series: [
    { metric: 'project-in-by-month:{{name}}', label: 'Money in' },
    { metric: 'project-out-by-month:{{name}}', label: 'Money out', dir: 'out' },
  ],
  back: 12,
  net: true,
};

/**
 * THE PROJECT PAGE AS IT WAS BEFORE ITS SHAPE WAS BLOCKS (founder 3.3.0, team 2.25.0): no `project`
 * blocks, More about not declared folded, Handed back or blocked and Money by month back at their places, and What
 * changed and the agents' cards half a row each.
 */
/** What changed, as the project page declared it until founder 3.7.0 and team 2.28.0. */
const WHAT_CHANGED: Body = { kind: 'feed', heading: 'What changed', icon: 'activity', span: 12, source: 'activity', where: 'target is {{spoken}}', first: 3 };

/**
 * THE PROJECT PAGE AS IT WAS BEFORE founder 3.7.0 AND team 2.28.0 (the project page of 27 October): Key numbers and the
 * plan over More about, not under it, and What changed before the agents' cards, which What happened says in words now.
 */
const partsBefore = (doc: Body): Body =>
  withPage(doc, 'project', (now) => {
    const moved = [...now.filter((b) => b.kind === 'kpis'), ...now.filter((b) => b.kind === 'roadmap')];
    const rest = now.filter((b) => b.kind !== 'kpis' && b.kind !== 'roadmap');
    return rest.flatMap((b): Body[] => {
      if (b.kind === 'section' && b.box === true && b.heading === 'More about {{name}}') return [...moved, b];
      if (b.kind === 'cards' && b.heading === 'Agents') return [WHAT_CHANGED, b];
      return [b];
    });
  });

const shapeBefore = (doc: Body, id: string): Body =>
  withPage(partsBefore(doc), 'project', (now) =>
    now.flatMap((b): Body[] => {
      if (b.kind === 'project') return [];
      if (b.kind === 'section' && b.box === true && b.fold === true) return [(({ fold: _fold, ...section }) => section)(b)];
      if (b.key === 'stands-figures') return [b, HANDED_BACK];
      if (b.kind === 'note' && b.document === true && id === 'founder') return [b, MONEY_BY_MONTH];
      if (b.kind === 'feed' && b.heading === 'What changed') return [{ ...b, span: 6 }];
      if (b.kind === 'cards' && b.heading === 'Agents') return [{ ...b, span: 6 }];
      return [b];
    }),
  );

const projectBefore = (doc: Body, id: string): Body =>
  withPage(workingBefore(numbersBefore(standsBefore(lookBefore(handedBefore(roadBefore(shapeBefore(doc, id)), id), id)), id), id), 'project', (now) =>
    now.flatMap((b) => {
      if (b.kind === 'roadmap') return [DONE_BY_WEEK, b];
      /* AND UNTIL THE KPI PLAN OF 21 OCTOBER (K3-C) no project page drew its Key numbers. */
      if (b.kind === 'kpis') return [];
      /* TOOLS AND SERVERS LISTED EVERYBODY'S TOOLS until batch 60 (pinwheel-60), where it now reads the project's own. */
      /* AND UNTIL BATCH 87 (project-runs-tile-87) the three were halves under More about, with no heading of their own
         and nothing said of what reaches a project from everywhere; Money by month was a half beside the bills; and
         Agents read every run placed in the project, titled by what it was doing. */
      /* AND UNTIL BATCH 89 (runs-on-section-89) the three drew three rows each and named who by the run, `used_by`, Last used by. */
      const runsOn89 = (x: Body): Body => ({ ...x, limit: 3, columns: (x.columns as Body[]).map((c) => (c.as === 'who' ? { field: 'used_by', label: 'Last used by', as: 'who' } : c)) });
      if (b.kind === 'section' && b.panel === 'seen') return [];
      if (b.kind === 'section' && b.heading === 'Runs on') return [];
      if (b.heading === 'And from everywhere') return [];
      if (b.heading === 'Money by month') return [{ ...b, span: 6 }];
      /* AND UNTIL founder 3.8.2 (31 October, AG22) what keeps it running was headed Keeping it alive. */
      if (b.heading === 'Services' && b.source === 'register.services') return [{ ...b, heading: 'Keeping it alive' }];
      if (b.heading === 'Agents' && b.source === 'register.session')
        return [{ ...b, columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }], where: 'project is {{spoken}}' }];
      if (b.heading === 'Tools and servers') return [{ ...runsOn89(b), span: 6, where: 'kind is tool' }];
      /* KEYS AND SKILLS LISTED EVERYBODY'S until batch 72 (project-own-cards-72), as Tools and servers had. */
      /* A TEAM'S KEYS WERE THE WHOLE ROW: the half Keeping it alive left, on a record that holds no services, went to the
         tile beside it (`projectTemplate`). Under Runs on nothing is beside a block that goes, so it is a third. */
      if (b.heading === 'Keys' && b.source === 'runs_on') return [{ ...runsOn89(b), span: id === 'team' ? 12 : 6, where: 'kind is key' }];
      if (b.heading === 'Skills' && b.source === 'runs_on') return [{ ...runsOn89(b), span: 6, where: 'kind is skill' }];
      if (b.heading !== 'At a glance') return [b];
      const cells = (b.cells as Body[]).flatMap((c) => (c.metric !== 'project-done-7d:{{name}}' ? [c] : id === 'founder' ? [] : [(({ trend: _trend, ...cell }) => cell)(c)]));
      return [{ ...b, cells }];
    }),
  );

/** The window Due this week read until founder 2.6.0: no near edge, so a bill already late was listed as due this week. */
const DUE_NO_NEAR_EDGE = 'state is open or part, due before +8d';

/**
 * AND THE FOUNDER'S HOME AS IT WAS BEFORE FOUNDER 2.6.0, undone first: Home called Overview in the voice and on the page,
 * Due this week with no near edge and no figure or table for what is late, and a Cost column under Lapsing. Undone
 * with the changes before it, so the version before is still the one released.
 * AND BATCH 74'S TWO, folded into the same unreleased 2.6.0: the project page's cell over `project-owed` says Owed to
 * you again (owed-words-74), and Home's line of what there is is one note on one book, with no second note ending "it
 * lasts the year" (founder-lasts-74).
 */
const lookBefore = (doc: Body, id: string): Body => {
  /* A TEAM'S HOME DRAWS GONE QUIET inside the unreleased 2.21.0 (founder-home-quiet-88, batch 88): it comes off. AND
     BATCH 100'S BURN-DOWN THAT FILLS ITSELF (team-cycle-follows-100) comes off too: Bring the team in gets Invite your
     team back, the burn-down's empty line says the standup agent again, and the use case's rules and scripts go. */
  if (id === 'team') return withPage(doc, 'home-team', (now) => now.filter((b) => b.source !== 'exceptions').map((b) => b.heading === 'Bring the team in' ? { ...b, authored: [{ cells: ['Invite your team', '/settings/people', 'Send each teammate a link to this board'] }, { cells: ['Connect an agent', '/settings/agents', 'The line to paste into Claude Code so an agent can take tickets'] }] } : b.heading === 'Open tickets, each morning' ? { ...b, empty: 'No cycle day is written yet. The standup agent adds one each morning, or add today by hand.' } : b), (d) => !(d.pack === 'usecase-team' && (typeof d.rule === 'string' || typeof d.script === 'string')));
  if (id !== 'founder') return doc;
  const config = doc.config as Record<string, Body> | undefined;
  return {
    ...doc,
    ...(config === undefined ? {} : { config: { ...config, voice_home: { ...config.voice_home, default: 'Overview' } } }),
    declarations: (doc.declarations as Body[])
      .filter((d) => d.metric !== 'late-money')
      .map((d) => {
        if (d.metric === 'due-this-week') return { ...d, where: DUE_NO_NEAR_EDGE };
        if (d.page === 'project')
          return {
            ...d,
            blocks: (d.blocks as Body[]).map((b) =>
              b.heading === 'At a glance' ? { ...b, cells: (b.cells as Body[]).map((c) => (c.metric === 'project-owed:{{name}}' ? { ...c, label: 'Owed to you' } : c)) } : b,
            ),
          };
        if (d.page !== 'home-founder') return d;
        return {
          ...d,
          title: 'Overview',
          blocks: (d.blocks as Body[]).flatMap((b) => {
            if (b.heading === 'Late') return [];
            if (b.source === 'exceptions' || (b.kind === 'section' && b.heading === 'Agents at work')) return [];
            if (b.kind === 'note' && typeof b.body === 'string' && b.body.endsWith('it lasts the year.')) return [];
            if (b.kind === 'note' && typeof b.body === 'string' && b.body.includes('{{runway-days}}')) return [{ ...b, when: { metric: 'books-held', lt: 2 } }];
            if (b.heading === 'Due this week') return [{ ...b, where: DUE_NO_NEAR_EDGE }];
            if (b.heading === 'Lapsing') return [{ ...b, columns: [...(b.columns as Body[]), { field: 'cost', label: 'Cost', width: '13ch', align: 'end' }] }];
            return [b];
          }),
        };
      }),
  };
};

/**
 * AND WHERE IT STANDS AS IT WAS BEFORE portfolio 1.16.0: the typed card on every project, said or not, and no figures
 * under the same heading. Undone with the changes before it, so the version before is still the one released.
 */
const standsBefore = (doc: Body): Body =>
  withPage(doc, 'project', (now) =>
    now.flatMap((b) => (b.key === 'stands-figures' ? [] : b.heading === 'Where it stands' ? [(({ when: _when, ...card }) => card)(b)] : [b])),
  );

/** The clause the Agents add-on wrote for a run at work until agents 1.9.0: active and heard from today. */
const RUNS_TODAY = 'state is active, last_seen is today';

/**
 * AND THE WORKING NOW BLOCK AS IT WAS BEFORE FOUNDER 2.4.0 AND TEAM 2.19.0: the add-on's clause of today over
 * `sessions.live` where it reads `sessions.working`, drawn whatever the count, and Founder with no line saying how many
 * agents work now. Undone with the project page's change, so the version before is still the one released.
 */
const workingBefore = (doc: Body, id: string): Body =>
  withPage(doc, id === 'founder' ? 'home-founder' : 'agent-work', (now) =>
    now.flatMap((b) => {
      if (b.kind === 'note' && typeof b.body === 'string' && b.body.includes('{{runs-working}}')) return [];
      if (b.source !== 'sessions.working') return [b];
      return [Object.fromEntries(Object.entries(b).flatMap(([k, v]): [string, unknown][] => (k === 'when' ? [] : k === 'source' ? [['source', 'sessions.live'], ['where', RUNS_TODAY]] : [[k, v]])))];
    }),
  );

/** Drops the Amount column from every list of columns that also has Value: the blocks and tables over Numbers. */
const dropAmount = (v: unknown): unknown =>
  Array.isArray(v)
    ? (v.some((c) => (c as Body | null)?.field === 'value') ? v.filter((c) => (c as Body).field !== 'amount') : v).map(dropAmount)
    : v !== null && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropAmount(x)]))
      : v;

/**
 * AND NUMBERS AS THEY WERE BEFORE FOUNDER 2.5.0: a reading's `value` required and no `amount`, so no Amount column on a
 * block or a table over them. Undone with the two changes before it, so the version before is still the one released.
 * AND THE UNRELEASED 2.6.0'S SERVICE NUMBERS (estate-numbers-61) come off with them: the field `about_service`, the figure
 * `service-numbers`, and the block laid on Renewals. The unreleased 2.6.0's end of day comes off the counts of numbers
 * too (founder-bound-66): `, at before tomorrow` on each `datapoints-` figure. And the order Numbers declares, newest
 * first by `at` (numbers-order-categories-97), comes off the list.
 */
const numbersBefore = (doc: Body, id: string): Body =>
  id !== 'founder'
    ? doc
    : {
        ...doc,
        ...(Array.isArray(doc.adds) ? { adds: (doc.adds as Body[]).filter((a) => (a.block as Body | undefined)?.key !== 'earning-silent' && (a.block as Body | undefined)?.heading !== 'Server and provider numbers' && (a.block as Body | undefined)?.panel !== 'seen') } : {}),
        declarations: (doc.declarations as Body[]).filter((d) => d.metric !== 'project-numbers-7d' && d.metric !== 'projects-earning-silent' && d.metric !== 'service-numbers').map((d) =>
          typeof d.metric === 'string' && d.metric.startsWith('datapoints-') && typeof d.where === 'string'
            ? d.where === 'at before tomorrow'
              ? (({ where: _where, ...held }) => held)(d)
              : { ...d, where: d.where.replace(', at before tomorrow', '') }
            : d.page === 'dashboard'
            ? (dropAmount({ ...d, blocks: (d.blocks as Body[]).map((b) => (b.heading === 'Latest numbers' ? (({ where: _where, ...table }) => table)(b) : b)) }) as Body)
            : d.register === 'datapoints'
            ? (({ order: _order, ...held }) => ({ ...held, fields: (d.fields as Body[]).flatMap((f) => (f.id === 'amount' || f.id === 'about_service' ? [] : f.id === 'value' ? [{ ...f, required: true }] : [f])) }))(d)
            : (dropAmount(d) as Body),
        ),
      };

/** The version each use case was on, and what `usecase-versions.test.ts` records it declared. */
const USECASE_BEFORE: Record<string, { version: string; released: string }> = {
  founder: { version: '2.2.0', released: 'e298abda699c666d' },
  team: { version: '2.17.0', released: 'c11cf821f8eb46c7' },
};

/**
 * FOUNDER 2.3.0 AND TEAM 2.18.0 TAKE THE PROJECT TEMPLATE WITHOUT ITS CHART OF THE WEEKS, and lose nothing a person would
 * be asked about: a block gone from a page and a cell added to another, on a page the use case already holds. The
 * version before is rebuilt from this build's document and held to the fingerprint released under it.
 */
test("A USE CASE'S UPDATE THAT FOLDS A CHART INTO A FIGURE LOSES NOTHING, and goes in over the version released before it", async () => {
  for (const id of ['founder', 'team']) {
    const u = useCase(id)!;
    const was = USECASE_BEFORE[id]!;
    assert.notEqual(u.version, was.version);
    /* TEAM FROM ITS FROZEN FILE, SINCE 2.30.1 (Sprints) AND 2.31.0 (no count line) MOVED IT PAST WHAT THE UNDOING UNDOES; FOUNDER'S UNDOING STILL HOLDS. */
    const rebuilt = id === 'team' ? FROZEN_BEFORE.usecases[id]! : oneBefore(projectBefore(useCaseThingsUndone(useCaseDocument(id, TODAY) as Body), id));
    assert.equal(fingerprintOf(rebuilt), was.released, `${id}: this is not ${was.version} as it was released`);

    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    for (const m of modulesFor(u, ['people', ...u.modules])) if (m !== 'agents') await put(k, sql, moduleBefore(k, m, id));
    const now = carriedDocument(u, TODAY)!;
    await put(k, sql, { ...projectBefore(now, id), version: was.version });
    const pack = `usecase-${id}`;
    assert.equal(k.packs().find((p) => p.id === pack)?.version, was.version);

    /* PROJECTS FIRST ON A FOUNDER'S RECORD, AS THE NIGHT AND THE USE CASE'S OWN UPDATE TAKE THEM, SINCE portfolio 1.19.0:
       it takes Numbers over from the use case, which then lays its organisation and service on it. */
    if (id === 'founder') await put(k, sql, documentFor(k, 'portfolio')!);
    const next = value<Pack>(await normalise(now, { kind: 'local' }));
    const diff = await plan(next, stateOf(k, sql));
    assert.deepEqual(losses(diff), [], `${id}: nothing would be lost`);
    /* NUMBERS IS HANDED TO PORTFOLIO, NOT RETIRED, SINCE founder 3.0.0: a hand is no loss, so it is not counted here. */
    assert.deepEqual([diff.adds.length, diff.retires.filter((r) => r.to === undefined).length, diff.conflicts.length], [id === 'founder' ? 5 : id === 'team' ? 5 : 0, 0, 0], `${id}: only a page changed, and the founder's figures since (service-numbers the fourth, estate-numbers-61, and datapoints-age the fifth, Z20 of 25 October), and the team's three rules and two scripts (team-cycle-follows-100)`);
    value(await install(next, diff, hostFor(k), diff.planHash));
    assert.equal(k.packs().find((p) => p.id === pack)?.version, u.version);
    const held = (k.declarations() as { id: string; body: unknown }[]).find((d) => d.id === 'page.project')!;
    const body = (typeof held.body === 'string' ? JSON.parse(held.body) : held.body) as { blocks: (Body & { cells?: Body[] })[] };
    assert.ok(!body.blocks.some((b) => b.heading === 'Done, by week'), `${id}: the chart of the weeks is still on the page`);
    assert.deepEqual(body.blocks.find((b) => b.heading === 'At a glance')!.cells!.at(-1), { metric: 'project-done-7d:{{name}}', label: 'Done this week', trend: '4w' }, `${id}: the page is this build's`);
    sql.close();
  }
});

/* ── work 1.17.0 and people 3.2.0, over the versions before them ───────────────────────────────────────────────────── */

/**
 * MONEY-CORE 3.14.0, WORK 1.17.0 AND PEOPLE 3.2.0 REACH A RECORD ON THEIR OWN. The first relabels an account's digits,
 * the second gives the Board's cards another column and takes one away, the third takes two lists off a page; no list,
 * field or figure goes, `people-in-touch-90d` included. So a record holding the versions before, rebuilt to the
 * fingerprint released under each (`LATEST`), is updated with no question.
 */
test('THE BOARD’S CARDS AND PEOPLE SHOWN ONCE GO IN ON THEIR OWN over the versions released before them, and ask nothing', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    await put(k, sql, withoutCashStale(LATEST[m]!.onRecord));
  }
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  assert.deepEqual(
    steps.filter((s) => s.from !== s.to),
    [
      { pack: 'portfolio', from: '1.15.0', to: FIRST_PARTY_VERSIONS.portfolio, did: 'updated' },
      { pack: 'people', from: '3.1.0', to: FIRST_PARTY_VERSIONS.people, did: 'updated' },
      { pack: 'money-core', from: '3.13.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'updated' },
      { pack: 'work', from: '1.16.0', to: FIRST_PARTY_VERSIONS.work, did: 'updated' },
      /* AND CORE, SINCE People 4.0.0 hands it Health, Scripts, Calendar and Activity: a record from before it gains it. */
      { pack: 'core', from: '0.0.0', to: FIRST_PARTY_VERSIONS.core, did: 'updated' },
    ],
    JSON.stringify(steps),
  );
  assert.deepEqual(port.asked, [], 'nothing was lost, so nothing was asked');

  type Held = { kind: string; heading?: string; source?: string; columns?: { field: string }[] };
  const blocks = (slug: string): Held[] => value<{ blocks: Held[] }>(k.page(slug)).blocks;
  assert.deepEqual(blocks('work-board').find((b) => b.kind === 'board')!.columns!.map((c) => c.field), ['state', 'what', 'by', 'owner']);
  assert.deepEqual(blocks('people').filter((b) => b.source === 'register.people').map((b) => [b.kind, b.heading]), [['cards', 'Everyone']]);
  assert.ok(k.packClaims('people').includes('metric.people-in-touch-90d'), 'the figure the list drew on was taken off the record');

  assert.deepEqual(await updateFirstParty(port), []);
  sql.close();
});

/* ── the agents pack and the use cases, in the night's own loop (Medium 3) ─────────────── */

/** The agents pack as 1.7.0 declared it: no lanes over the runs, and no figure for them to be drawn on. */
const agentsBefore = (): Body => {
  const now = agentsPackDocument() as Body;
  return {
    ...withPage(now, 'agents', (blocks) => blocks.filter((b) => b.kind !== 'lanes'), (d) => d.metric !== 'runs-heard-today'),
    version: '1.7.0',
  };
};

/**
 * A MODULE AS A RECORD ON THE USE CASE BEFORE HOLDS IT: Projects before 1.19.0 under a founder before 3.0.0, which held
 * Numbers itself; every other module as this build ships it.
 */
const moduleBefore = (k: Kernel, m: string, id: string): Body =>
  id === 'founder' && m === 'portfolio' ? { ...beforeKpis(documentFor(k, m)!), version: '1.18.0' } : documentFor(k, m)!;

/** A record holding a use case at the version before this build's, the modules under it, and the agents pack at 1.7.0. */
async function onUseCaseBefore(id: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of modulesFor(u, ['people', ...u.modules])) if (m !== 'agents') await put(k, sql, moduleBefore(k, m, id));
  await put(k, sql, agentsBefore());
  await put(k, sql, { ...projectBefore(carriedDocument(u, TODAY)!, id), version: USECASE_BEFORE[id]!.version });
  return { k, sql };
}

/**
 * THE NIGHT'S LOOP WALKED THE FIVE MODULES ONLY, so a founder's and a team's page updates and Agents 1.8.0 reached no
 * record that already held them: the two tests above plan and install by hand, which proves the plan loses nothing and
 * not that anything runs it. This is the runner itself, lent the same port a record lends it, and nothing else.
 */
test('THE NIGHT UPDATES THE AGENTS PACK AND THE USE CASE A RECORD HOLDS, after its modules, and asks nothing', async () => {
  for (const id of ['founder', 'team']) {
    const u = useCase(id)!;
    const pack = `usecase-${id}`;
    const { k, sql } = await onUseCaseBefore(id);
    assert.equal(k.packs().find((p) => p.id === pack)?.version, USECASE_BEFORE[id]!.version);
    assert.ok(!k.packClaims('agents').includes('metric.runs-heard-today'), 'the record starts without the figure Agents 1.8.0 brings');
    const port = portOf(k, sql);

    /* THE STEPS THAT MOVED A VERSION, without the modules put in again for the links that came after them. */
    const steps = (await updateFirstParty(port)).filter((s) => s.from !== s.to);
    assert.deepEqual(
      steps,
      [
        /* PROJECTS FIRST ON A FOUNDER'S RECORD, SINCE portfolio 1.19.0: it takes Numbers over from the use case before it. */
        ...(id === 'founder' ? [{ pack: 'portfolio', from: '1.18.0', to: FIRST_PARTY_VERSIONS.portfolio, did: 'updated' }] : []),
        /* NO STEP FOR CORE: a record made by the first run holds it from the start (`modulesFor`). */
        { pack: 'agents', from: '1.7.0', to: AGENTS_PACK.manifest.version, did: 'updated' },
        { pack, from: USECASE_BEFORE[id]!.version, to: u.version, did: 'updated' },
      ],
      `${id}: ${JSON.stringify(steps)}`,
    );
    assert.deepEqual(port.asked, [], `${id}: nothing was lost, so nothing was asked`);

    /* THE RECORD HOLDS THIS BUILD'S OF BOTH. */
    assert.ok(k.packClaims('agents').includes('metric.runs-heard-today'), `${id}: Agents is not this build's`);
    const declared = (k.declarations() as { id: string; body: unknown }[]).find((d) => d.id === 'page.project')!;
    const project = (typeof declared.body === 'string' ? JSON.parse(declared.body) : declared.body) as { blocks: Body[] };
    assert.ok(!project.blocks.some((b) => b.heading === 'Done, by week'), `${id}: the chart of the weeks is still on the page`);
    /* A LIST AN OLDER VERSION OF THE USE CASE DECLARED IS NOT LAID ON A RECORD THAT NEVER HELD IT. */
    for (const list of keptLists(id)) assert.ok(!held(k).includes(list), `${id}: the update brought ${list}, which this record never held`);

    /* AND ONCE IN, THE NEXT NIGHT HAS NOTHING TO DO. */
    assert.deepEqual(await updateFirstParty(port), []);
    sql.close();
  }
});

test('A RECORD THAT KEPT A LIST AN OLDER VERSION OF ITS USE CASE DECLARED KEEPS IT through the night’s update', async () => {
  const { k, sql } = await onUseCaseBefore('team');
  /* THE LIST AS THE USE CASE'S OWN DOCUMENT CARRIES IT for a record that holds it, laid here under the version before. */
  const kept = keptLists('team');
  assert.ok(kept.length > 0, 'Team keeps no earlier list, so this proves nothing');
  await put(k, sql, { ...projectBefore(useCaseDocument('team', TODAY, kept) as Body, 'team'), version: USECASE_BEFORE.team!.version, seeds: undefined });
  for (const list of kept) assert.ok(held(k).includes(list));
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  assert.deepEqual(steps.find((s) => s.pack === 'usecase-team'), { pack: 'usecase-team', from: USECASE_BEFORE.team!.version, to: useCase('team')!.version, did: 'updated' }, JSON.stringify(steps));
  assert.deepEqual(port.asked, []);
  for (const list of kept) assert.ok(held(k).includes(list), `${list} was taken away by the update`);
  sql.close();
});

/**
 * A NO IS KEPT FOR THE FIVE MODULES BY EVERY RECORD, and for anything else only by a port that says so (`remembers`). An
 * update to the agents pack that would bring back what the person took off is asked about where the answer will be
 * kept, and otherwise said and left, since a question that comes back each night after a no is worse than waiting.
 */
test('AN UPDATE TO THE AGENTS PACK THAT WOULD LOSE SOMETHING is asked about only where a no is remembered', async () => {
  const { k, sql } = await onUseCaseBefore('founder');
  const tookOff = (): string[] => ['metric.runs-heard-today'];
  const port = { ...portOf(k, sql), tookOff };

  const quietly = (await updateFirstParty(port)).find((s) => s.pack === 'agents');
  assert.equal(quietly?.did, 'refused', JSON.stringify(quietly));
  assert.match(String(quietly?.why), /^Updating it would bring back .+, which you took off, so it waits for you to update it yourself\.$/u);
  assert.deepEqual(port.asked, [], 'a question was filed that no answer would be kept for');
  assert.equal(k.packs().find((p) => p.id === 'agents')?.version, '1.7.0');

  const remembering = { ...portOf(k, sql), tookOff, remembers: () => true };
  const asked = (await updateFirstParty(remembering)).find((s) => s.pack === 'agents');
  assert.equal(asked?.did, 'asked', JSON.stringify(asked));
  assert.deepEqual(remembering.asked.map((q) => q.body), [{ install: 'agents' }]);
  assert.match(remembering.asked[0]!.question, /^Agents has a newer version\. Updating it would bring back /u);
  assert.equal((await updateFirstParty(remembering)).find((s) => s.pack === 'agents')?.did, 'waiting');
  sql.close();
});

test('THE VERSION THIS BUILD SHIPS IS SAID FOR EVERYTHING THE NIGHT KEEPS CURRENT, and for nothing else', () => {
  assert.equal(shippedVersion('work'), FIRST_PARTY_VERSIONS.work);
  assert.equal(shippedVersion('agents'), AGENTS_PACK.manifest.version);
  for (const id of ['founder', 'team']) assert.equal(shippedVersion(`usecase-${id}`), useCase(id)!.version);
  for (const id of ['usecase-nobody', 'bank-hsbc-eg', '']) assert.equal(shippedVersion(id), undefined, id);
});

test('TAKING CASH STALE AWAY IS ASKED: a record on money-core 3.13.0 that holds the rule is asked once, and nothing else of Money is lost', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    await put(k, sql, LATEST[m]!.onRecord);
  }
  const steps = await updateFirstParty(portOf(k, sql));
  assert.deepEqual(
    steps.find((s) => s.pack === 'money-core'),
    { pack: 'money-core', from: '3.13.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'asked', lose: ['take away Cash stale'] },
    JSON.stringify(steps),
  );
  sql.close();
});

/* ── people 4.0.0: Health, Scripts, Calendar and Activity leave for core ─────────────────────────────────────────── */

test('A RECORD ON PEOPLE 3.x UPDATES TO PEOPLE 4.0.0 AND CORE ON ITS OWN, keeps its navigation order and what it hid, and all four pages still open', async () => {
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
  const now = { at: Date.UTC(2026, 9, 27, 3) };
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);

  /* PEOPLE AS 3.9.0 SHIPPED IT: this build's document with the four pages it still declared, under its own name, and no hand-over. */
  const core = firstPartyDocument('core', { seeds: [] })! as { declarations: Body[] };
  const people = firstPartyDocument('people', { holds: [], seeds: [] })! as Body & { declarations: Body[] };
  const before: Body = { ...people, version: '3.9.0', declarations: [...people.declarations, ...core.declarations.map((d) => ({ ...d, pack: 'people' }))] };
  delete before.hands;
  const planned = value<{ diff: { planHash: string; approve?: string[] } }>(await api.planPack({ doc: before, source: { kind: 'local' } }, owner));
  value(await api.installPack({ doc: before, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  const held = (id: string): string | undefined => api.kernel.packStates().find((p) => p.id === id)?.version ?? undefined;
  const ownerOf = (id: string): string | null | undefined => (api.kernel.declarations() as { id: string; pack_id: string | null }[]).find((d) => d.id === `page.${id}`)?.pack_id;
  assert.equal(held('people'), '3.9.0');
  assert.equal(held('core'), undefined);
  for (const page of CORE_PAGES) assert.equal(ownerOf(page), 'people', `${page} starts as People's`);

  /* HIS OWN ORDER AND ONE PAGE HE HID, kept by address, which names the page and not the pack that holds it. */
  const order = ['/p/people', '/p/activity', '/p/health', '/p/calendar', '/p/scripts'];
  value(await api.setPref({ key: 'nav.order', value: order }, owner));
  value(await api.setPref({ key: 'nav.hidden', value: ['/p/scripts'] }, owner));
  value(api.kernel.create('people', { name: 'Mara Lindqvist', email: 'mara@halden.example' }, OWNER));

  await api.slashTick();

  assert.equal(held('people'), FIRST_PARTY_VERSIONS.people);
  /* 4.0.0 OR A LATER 4.x: People 4.1.0 and 4.2.x (round 1030) changed words and a figure, and handed no page back. */
  assert.match(FIRST_PARTY_VERSIONS.people, /^4\.\d+\.\d+$/u);
  assert.equal(held('core'), FIRST_PARTY_VERSIONS.core);
  const kept = api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] };
  assert.deepEqual(kept.steps, [`People was updated to ${FIRST_PARTY_VERSIONS.people}.`, `BrainDog was updated to ${FIRST_PARTY_VERSIONS.core}.`]);
  assert.deepEqual(api.kernel.openSuggestions().ok ? (api.kernel.openSuggestions() as { value: unknown[] }).value : [], [], 'nothing was lost, so nothing was asked');

  /* HANDED, NOT LOST: every page is live, under core now, and none was retired along the way. */
  for (const page of CORE_PAGES) {
    assert.equal(ownerOf(page), 'core', `${page} is core's`);
    const opened = value<{ blocks: unknown[] }>(api.kernel.page(page));
    assert.ok(opened.blocks.length > 0, `${page} opens`);
  }
  const prefs = api.kernel.prefsOf('p_1') as Record<string, unknown>;
  assert.deepEqual(prefs['nav.order'], order, 'his order is as he left it');
  assert.deepEqual(prefs['nav.hidden'], ['/p/scripts'], 'what he hid is still hidden');

  /* AND THE NEXT NIGHT HAS NOTHING TO DO. */
  now.at += 86_400_000;
  await api.slashTick();
  assert.deepEqual((api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps, []);
  sql.close();
});
