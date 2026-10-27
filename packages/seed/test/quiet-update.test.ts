/**
 * BRAINDOG'S OWN UPDATES GO IN ON THEIR OWN WHEN NOTHING THE PERSON CHANGED WOULD BE LOST, and ask once otherwise
 * (`packs/quiet.ts`).
 *
 * THE RECORD HERE IS SHAPED AS THE OWNER'S WAS ON OCTOBER 6TH (`loop/STATUS.md`): People 2.x with no organisations and no
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

import { AGENTS_PACK, FIRST_PARTY_VERSIONS, NOW, agentsPackDocument, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { keptLists, modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { peopleBefore3 } from './people-before-3.ts';
import { thingsUndone, useCaseThingsUndone } from './things-before.ts';
import { CHASING } from '../src/modules/money/pages/parts/chasing.ts';
import { NEXT_30 } from '../src/modules/money/pages/parts/next30.ts';
import { DUE_30D } from '../src/modules/money/pages/shared.ts';
import { QUEUE } from '../src/modules/money/pages/parts/queue.ts';
import { AGES } from '../src/modules/money/pages/parts/ages.ts';
import { BUDGET } from '../src/modules/money/pages/parts/budget.ts';
import { SPENDING } from '../src/modules/money/pages/parts/spending.ts';

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
          /* AND THE LIST DRAWN ON IT AND ON WHAT IS LATE (Late and this week, the UI pass of 20 October). */
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
  /* AND THE PAGES ARE THIS BUILD'S: Money's side column, and This week drawn on the new figure. */
  const page = value<{ layout?: unknown; blocks: { heading?: string; when?: { metric?: string } }[] }>(k.page('money'));
  assert.deepEqual(page.layout, { rail: 4 });
  const work = value<{ blocks: { heading?: string; when?: { metric?: string } }[] }>(k.page('work'));
  /* THIS WEEK IS ITS OWN BAND AGAIN, SINCE the screens scope of 24 October (E24). */
  assert.equal(work.blocks.find((b) => b.heading === 'This week')?.when?.metric, 'tasks-this-week-yours');
  /* AND LASTS SAYS THE DAY, over the figure the update brought with it (money-core 3.12.0): in the sentence under how long
     the money lasts with nothing coming in since 3.27.0, where it was a figure of its own. */
  const runs = (page.blocks as { heading?: string; cells?: { metric: string; note?: string }[] }[]).find((b) => b.heading === 'Lasts');
  assert.deepEqual(runs?.cells?.map((c) => c.metric), ['lasts-no-income']);
  assert.match(runs?.cells?.[0]?.note ?? '', /\{\{runs-out-on\}\}/u);
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

/** A person, who they are with and the day: the columns of the two lists People 3.1.0 drew over its cards. */
const LAST_IN_TOUCH: Body[] = [
  { field: 'name', label: 'Name', width: 'minmax(12ch,1fr)' },
  { field: 'org', label: 'Organisation', width: 'minmax(10ch,1fr)' },
  { field: 'in_touch', label: 'Last in touch', width: '14ch', align: 'end' },
];
const QUIETEST_FIRST: Body[] = [
  { field: 'in_touch', dir: 'asc' },
  { field: 'seq', dir: 'asc' },
];

/**
 * MONEY-CORE 3.13.0, WORK 1.16.0 AND PEOPLE 3.1.0, THE VERSIONS BEFORE THIS BUILD'S, made from this build's document by
 * undoing the one change each new version makes (money-core 3.14.0, work 1.17.0, people 3.2.0), and held below to the
 * fingerprint released under each. Money-core 3.15.0's one figure, `ledger-rows-7d`, and 3.16.0's three signs are taken
 * off as well.
 */
/** And the two halves of Today's money this week (uc6-money-47), folded into the same unreleased 3.16.0. */
const WEEK_IN = new Set(['received-7d', 'settled-in-7d']);
const SIGNS_ADDED = new Set(['ledger-rows-7d', 'ledger-newest-days', 'currencies-held', 'uncategorised-share-30d', 'statement-oldest-days', 'nights-missed-30d', 'repeating-overdue']);

/**
 * AND 3.16.0'S PAYDAYS (REC-B13), folded into the same unreleased step: Repeating's `day_of_month` and `weekend` and
 * the sentence its `holds` gained, the leg's `days` and `weekend` that name them (on the figures and on the pages' blocks),
 * and Money's `rest_days` setting.
 */
const PAYDAYS_FIELDS = new Set(['day_of_month', 'weekend']);
const withoutPaydays = (doc: Body): Body => {
  const { rest_days: _rest, ...config } = (doc.config ?? {}) as Body;
  const legless = (leg: Body): Body => {
    const { days: _days, weekend: _weekend, ...rest } = leg;
    return rest;
  };
  return {
    ...doc,
    ...(doc.config === undefined ? {} : { config }),
    declarations: (doc.declarations as Body[]).map((d) => {
      if (d.register === 'recurring' && Array.isArray(d.fields))
        return {
          ...d,
          holds: 'the money that comes in and goes out on a cadence, weekly to yearly, without anybody deciding again',
          fields: (d.fields as Body[]).filter((f) => !PAYDAYS_FIELDS.has(String(f.id))),
        };
      if (Array.isArray(d.legs)) return { ...d, legs: (d.legs as Body[]).map(legless) };
      /* A PAGE'S BLOCKS WALK THE SAME LEGS (`from`), so they lose the two keys there too. */
      if (Array.isArray(d.blocks))
        return { ...d, blocks: (d.blocks as Body[]).map((b) => (Array.isArray(b.from) ? { ...b, from: (b.from as Body[]).map(legless) } : b)) };
      return d;
    }),
  };
};
/**
 * AND 3.16.0'S AGES AND CURRENCIES (REC-B03, REC-B04), folded into the same unreleased step: `account-ages` goes,
 * `cash-as-of` and `balances-stale` read the typed day again, the money fields lose `currency_from` and
 * `currency_fixed`, Money loses Last confirmed and its box, a book's account cards read the typed day, and
 * `rule.cash-stale` comes back after `invoice-late`.
 */
const CASH_STALE: Body = {
  rule: 'cash-stale',
  pack: 'money-core',
  register: 'accounts',
  when: 'as_of before -7d',
  then: [{ notify: { say: 'The balance of {{name}} was last set {{ago:as_of}}.' } }],
  once_per: ['entry', 'as_of'],
};
const CURRENCY_KEYS = new Set(['currency_from', 'currency_fixed']);
const withoutAges = (doc: Body): Body => {
  const out: Body[] = [];
  for (const d of doc.declarations as Body[]) {
    if (d.metric === 'account-ages') continue;
    if (d.metric === 'cash-as-of') out.push({ ...d, value: { min: 'as_of' } });
    else if (d.metric === 'balances-stale') out.push({ ...d, where: 'liquid is true, as_of before -7d', value: { count: 'id' } });
    else if (Array.isArray(d.fields) && ['transactions', 'balances', 'installments', 'recurring'].includes(String(d.register)))
      out.push({ ...d, fields: (d.fields as Body[]).map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !CURRENCY_KEYS.has(k)))) });
    else if (d.page === 'money')
      out.push({
        ...d,
        requires: (d.requires as string[]).filter((r) => r !== 'register.balances'),
        blocks: (d.blocks as Body[])
          .filter((b) => b.heading !== 'Last confirmed' && b.heading !== 'What it holds today')
          .map((b) =>
            b.when && (b.when as Body).metric === 'balances-stale' && b.kind === 'note'
              ? { ...b, body: "The oldest balance in Cash now is from {{cash-as-of}}. Update it so this page starts from today's money." }
              : b,
          ),
      });
    else if (d.page === 'money-book')
      out.push({
        ...d,
        blocks: (d.blocks as Body[]).map((b) =>
          b.heading === 'Accounts'
            ? { ...b, columns: (b.columns as Body[]).map((c) => (c.field === 'as_of' ? { field: 'as_of', label: 'As of', as: 'when' } : c)), stale: { field: 'as_of', after: '7d' } }
            : b,
        ),
      });
    else out.push(d);
    if (d.rule === 'invoice-late') out.push(CASH_STALE);
  }
  return { ...doc, declarations: out };
};
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
/** AND 3.17.0'S CROSS-CHECK (cash-check-52): `cash-cross-check`, the one figure it adds, goes. */
const withoutCrossCheck = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.metric !== 'cash-cross-check')
    /* AND THE BLOCK THE MONEY PAGE DRAWS IT WITH (cash-page-54): the tile. The line for no balance it also drew went
       before release, and in the same unreleased step the page gained its lead for two books or more, which goes too. */
    .map((d) =>
      d.page !== 'money' || !Array.isArray(d.blocks)
        ? d
        : { ...d, blocks: (d.blocks as Body[]).filter((b) => b.heading !== 'Cash now does not add up' && !(b.kind === 'note' && b.lead === true && (b.when as Body | undefined)?.gte === 2)) },
    ),
});
/**
 * AND 3.17.0'S FILING RULES AND CLOSED ACCOUNTS (filing-list-56, account-state-56), folded into the same unreleased step:
 * the list Filing rules and the Ledger's `filed_by` go, a category's How it matches loses `pattern`, `txn-categorise`
 * links a category by its Matches alone, Accounts loses its Status, and nothing leaves a closed account out.
 */
const NOT_CLOSED = ', state is not closed';
const open = (b: Body): Body => (typeof b.where === 'string' && b.where.includes(NOT_CLOSED) ? { ...b, where: b.where.replace(NOT_CLOSED, '') } : b);
const RULE_FILED_91: ReadonlySet<string> = new Set(['rule-filed', 'filed-by-rule-30d', 'rules-filing-30d', 'rules-filing']);
const withoutFiling = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.register !== 'filing_rules' && d.page !== 'money-rules' && !RULE_FILED_91.has(String(d.metric)))
    .map((d) => {
      if (d.register === 'transactions' && Array.isArray(d.fields)) return { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'filed_by') };
      if (d.register === 'categories' && Array.isArray(d.fields))
        return {
          ...d,
          fields: (d.fields as Body[]).map((f) =>
            f.id === 'match_by'
              ? { ...f, values: (f.values as string[]).filter((v) => v !== 'pattern'), labels: Object.fromEntries(Object.entries(f.labels as Body).filter(([v]) => v !== 'pattern')) }
              : f,
          ),
        };
      if (d.register === 'accounts' && Array.isArray(d.fields))
        return (({ state: _state, done: _done, ...rest }) => ({ ...rest, fields: (d.fields as Body[]).filter((f) => f.id !== 'state') }))(d);
      if (d.rule === 'txn-categorise') return { ...d, then: [{ link: { field: 'category', to: { register: 'categories', by: 'match', value: '{{what}}' } } }] };
      if (Array.isArray(d.blocks)) return { ...d, blocks: (d.blocks as Body[]).map(open) };
      return open(d);
    }),
});
/**
 * AND 3.17.0'S PAYMENT LINKS (pay-links-57, REC-B11), folded into the same unreleased step: a bill loses Paid so far,
 * an instalment Paid by, a repeating line Last paid and Last amount, and the Ledger its delete rule, which is there
 * for Paid by alone.
 */
const PAID_FIELDS: Record<string, ReadonlySet<string>> = {
  obligations: new Set(['paid_so_far']),
  installments: new Set(['paid_by']),
  recurring: new Set(['last_paid', 'last_amount']),
};
const withoutPaid = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => {
    if (d.register === 'transactions' && d.delete !== undefined) return (({ delete: _delete, ...rest }) => rest)(d);
    const gone = typeof d.register === 'string' ? PAID_FIELDS[d.register] : undefined;
    return gone && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => !gone.has(String(f.id))) } : d;
  }),
});
/**
 * AND 3.17.0'S LEDGER TILE AND ITS BAD PHRASE (ledger-tile-59, bad-phrase-59), folded into the same unreleased step: the
 * tile leaves the Money page and History takes back What moved, twelve lines and the last block, and the two late
 * lines on Heads up say "past their due date" as plain words again.
 */
const WHAT_MOVED: Body = {
  kind: 'timeline',
  heading: 'What moved',
  icon: 'receipt',
  span: 12,
  source: 'register.transactions',
  where: 'state is not void',
  columns: [{ field: 'on' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
  order: [{ field: 'on', dir: 'desc' }],
  limit: 12,
  when: { metric: 'cash-accounts', gt: 0 },
  empty: 'Nothing has moved yet. Add what left the bank and this page starts from it.',
};
const withoutLedgerTile = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) =>
    d.page !== 'money' || !Array.isArray(d.blocks)
      ? d
      : {
          ...d,
          blocks: [
            ...(d.blocks as Body[])
              .filter((b) => b.heading !== 'Ledger')
              .map((b) => (typeof b.body === 'string' && b.body.includes('{{bad:past their due date}}') ? { ...b, body: b.body.replace('{{bad:past their due date}}', 'past their due date') } : b)),
            WHAT_MOVED,
          ],
        },
  ),
});
/**
 * AND 3.17.0'S PLANS (plans-list-66, REC-B12 jobs 1 and 2), folded into the same unreleased step: the list Plans goes,
 * an instalment loses Part of and Left after, and the script that makes and counts plans goes with the rule that starts it.
 * AND BATCH 68'S, folded into the same unreleased step: the rule a new plan starts the script by (plans-calm-67-68), the
 * page of one plan with its eight figures (plan-page-68), and the day a category passed its budget (budget-passed-on-68).
 */
const PLAN_FIELDS: ReadonlySet<string> = new Set(['plan_row', 'left_after']);
const PLAN_FIGURES_68: ReadonlySet<string> = new Set(['plan-parts-paid', 'plan-parts', 'plan-paid', 'plan-left', 'plan-next-due', 'plan-last-due', 'installments-paid-by-plan', 'installments-total-by-plan', 'budget-passed-on']);
/** AND 3.17.0'S PAYEE (payee-field-68, REC-B16 step 2), folded into the same unreleased step: the Ledger loses `payee`, and `counterparty_text` is labelled Paid to or from again. */
const withoutPayee = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) =>
    d.register === 'transactions' && Array.isArray(d.fields)
      ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'payee').map((f) => (f.id === 'counterparty_text' ? { ...f, label: 'Paid to or from' } : f)) }
      : d,
  ),
});
/** AND BATCH 70'S (everyday-leg-69-70, audit 68 finding 4), folded into the same unreleased step: 3.17.0's leg of everyday spending comes off the cash walk, on the figures over it and on Money's Cash ahead and bridge. */
const withoutEveryday = (doc: Body): Body => {
  const dated = (legs: unknown): Body[] => (legs as Body[]).filter((leg) => leg.everyday === undefined);
  return {
    ...doc,
    declarations: (doc.declarations as Body[]).map((d) =>
      Array.isArray(d.legs) ? { ...d, legs: dated(d.legs) } : Array.isArray(d.blocks) ? { ...d, blocks: (d.blocks as Body[]).map((b) => (Array.isArray(b.from) ? { ...b, from: dated(b.from) } : b)) } : d,
    ),
  };
};
/** AND BATCH 70'S (instalments-tile-70, REC-B12 job 5): Money's Instalments tile counts the list's own parts again, as it did before it read the two figures by plan. */
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
 * AND BATCH 70'S (money-wire-70, REC-B19 jobs 3 and 4): This month's spending and Budgets leave Money, Being chased
 * stands straight after Instalments again, and the folded History heading is back over In and out, by month.
 */
const HISTORY_FOLD: Body = { kind: 'section', heading: 'History', icon: 'history', span: 12, fold: true, when: { metric: 'cash-accounts', gt: 0 } };
const moneyBeforeSpending = (blocks: Body[]): Body[] =>
  blocks
    .filter((b) => b.heading !== "This month's spending" && b.heading !== 'Budgets')
    .flatMap((b) => (b.heading === 'Instalments' ? [b, CHASING[0] as Body] : b.heading === 'In and out, by month' ? [HISTORY_FOLD, b] : [b]));
const withoutPlans = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.register !== 'plans' && d.rule !== 'part-counts-plan' && d.rule !== 'plan-links-parts' && d.script !== 'plans_from_names' && d.page !== 'money-plan' && !PLAN_FIGURES_68.has(String(d.metric)))
    .map((d) => (d.register === 'installments' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => !PLAN_FIELDS.has(String(f.id))) } : d))
    .map((d) => (d.page === 'money' && Array.isArray(d.blocks) ? { ...d, blocks: moneyBeforeSpending((d.blocks as Body[]).map((b) => (b.kind === 'progress' && b.heading === 'Instalments' ? INSTALMENTS_BY_PARTS : b))) } : d)),
});
const withoutCashStale = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).filter((d) => d.rule !== 'cash-stale') });
/** Work as 1.18.0 released it, the frozen document (`fixtures/released/`), which holds the follow-up script as it was. */
const WORK_1_18 = JSON.parse(readFileSync(new URL('./fixtures/released/work-1.18.0.json', import.meta.url), 'utf8')) as Body;

/**
 * PROJECTS' AND WORK'S PAGES AS THEY WERE THE MORNING OF 20 OCTOBER, before the UI pass changed them inside the unreleased
 * portfolio 1.18.0 and work 1.19.0 (proj F5, F10, F11): the Overview with its open and folded headings, Work with Late,
 * At a glance, This week and its search word, and a thread's health with no labels. Frozen from that morning's build, so
 * the steps below undo the pass first and then the ones before it, as each version was released.
 */
const BEFORE_UI_PASS = JSON.parse(readFileSync(new URL('./fixtures/before-ui-pass-20-oct.json', import.meta.url), 'utf8')) as {
  portfolio: { page: Body };
  work: { page: Body; updatesHealth: Body };
};

/**
 * A document with the UI pass of 20 October taken off its pages, as the morning's build declared them. AND THE SCREENS
 * SCOPE OF 24 OCTOBER WITH IT (E24), in the same unreleased 1.19.0: the page is the morning's whole, and the figure its
 * head counts now, `tasks-in-play`, goes.
 */
const beforeUiPass = (doc: Body, id: 'portfolio' | 'work'): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).filter((d) => !(id === 'work' && d.metric === 'tasks-in-play')).map((d) => {
    /* ITS PLACE ON THE RAIL AS THE DOCUMENT SAYS IT, which an older step may have taken off. */
    if (id === 'portfolio' && d.page === 'portfolio') return { ...BEFORE_UI_PASS.portfolio.page, nav: d.nav };
    if (id === 'work' && d.page === 'work') {
      /* A RECORD WITHOUT PROJECTS DRAWS NO PROJECT COLUMN, as the document it was made with says. */
      const linked = (doc.declarations as Body[]).some((x) => x.register === 'tasks' && (x.fields as Body[]).some((f) => f.id === 'thing'));
      const page: Body = { ...BEFORE_UI_PASS.work.page, nav: d.nav };
      return linked ? page : { ...page, filters: undefined, blocks: (page.blocks as Body[]).map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => c.field !== 'thing') } : b)) };
    }
    if (id === 'work' && d.register === 'updates' && Array.isArray(d.fields))
      return { ...d, fields: (d.fields as Body[]).map((f) => (f.id === 'health' ? BEFORE_UI_PASS.work.updatesHealth : f)) };
    return d;
  }),
});
/**
 * AND BATCH 71'S BOOKS (book-fill-71, book-figures-71, book-page-71; REC-A09 steps 1 to 3), folded into the same
 * unreleased step: the three rules that file a thing in its account's book go with the script they start, the seven
 * figures of a book's month and of what no book holds go, and a book's page loses This month.
 */
const BOOK_FIGURES_71: ReadonlySet<string> = new Set(['book-in-month', 'book-out-month', 'book-net-month', 'ledger-in-no-book', 'repeating-in-no-book', 'instalments-in-no-book', 'bills-in-no-book']);
const BOOK_RULES_71: ReadonlySet<string> = new Set(['entry-takes-book', 'repeat-takes-book', 'part-takes-book']);
const withoutBookFill = (doc: Body): Body =>
  withPage(doc, 'money-book', (now) => now.filter((b) => b.heading !== 'This month'), (d) => !BOOK_FIGURES_71.has(String(d.metric)) && !BOOK_RULES_71.has(String(d.rule)) && d.script !== 'book_from_account');
/**
 * AND BATCH 72'S (plan-lead-all-paid-72), folded into the same unreleased step: the one figure the plan page's lead
 * sentences wait on goes (batch 74 took the second, `plan-share-left`, out again: plan-lead-one-figure-74). The page
 * itself, with its second lead sentence, goes with every plan (`withoutPlans`), since 3.13.0 held no plan at all, so
 * no lead is put back by hand.
 */
const PLAN_LEAD_72: ReadonlySet<string> = new Set(['plan-parts-open']);
const withoutPlanLeads = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).filter((d) => !PLAN_LEAD_72.has(String(d.metric))) });
/**
 * AND BATCH 73'S, folded into the same unreleased step: the count of budgets set, which Money declares itself now
 * (budgets-set-73); the two figures of what is due to and from one book (book-owed-figures-73) and the three of a book's
 * months (book-page-months-73), with the row What is due and the chart In and out, by month they draw on a book's page;
 * and the rule that files a bill in its account's book, with the account a bill names (bill-takes-book-73). The script
 * the rule starts went whole with `withoutBookFill`, and the Ledger tile's name column with the tile
 * (`withoutLedgerTile`, ledger-payee-73).
 */
const MONEY_FIGURES_73: ReadonlySet<string> = new Set(['budgets-set', 'book-owed-to', 'book-owed-by', 'book-in-by-month', 'book-out-by-month', 'book-net-by-month']);
const BOOK_BLOCKS_73: ReadonlySet<string> = new Set(['What is due', 'In and out, by month']);
const withoutBatch73 = (doc: Body): Body => {
  const cut = withPage(doc, 'money-book', (now) => now.filter((b) => !BOOK_BLOCKS_73.has(String(b.heading))), (d) => !MONEY_FIGURES_73.has(String(d.metric)) && d.rule !== 'bill-takes-book');
  return {
    ...cut,
    declarations: (cut.declarations as Body[]).map((d) => (d.register === 'obligations' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'account') } : d)),
  };
};
/**
 * AND BATCH 74'S, folded into the same unreleased step and undone first: a project's money on its way is named Owed to
 * you again, where it is Still to come in (owed-words-74). The plan page's leads on two counts go with every plan
 * (`withoutPlans`), the share figure batch 74 took out was never in a released version, and `repeating-overdue`,
 * whose value batch 74 changed, is dropped whole with the other signs (`SIGNS_ADDED`), so none of the three is put
 * back by hand.
 */
const withoutBatch74 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => (d.metric === 'project-owed' ? { ...d, name: 'Owed to you' } : d)),
});
/**
 * AND BATCH 75'S, folded into the same unreleased step and undone first: an invoice's Draft to send goes from Bills and
 * invoices, and the step that writes it goes from the rule that answers Chase it (money-chase-draft-75, REC-B22 step 1).
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
 * other loses the half of its condition that left such an invoice to it (chase-part-paid-77, REC-B22).
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
 * one book alone, and the same line ending on the year goes (money-lasts-line-78, REC-B07); the Heads up line on
 * categories that Money gave up for it was never in a released version and is taken off by `withoutDirection`, so it
 * is not put back. A book's line that its money lasts the year goes (book-lasts-year-78, REC-A09 step 2). And the
 * search for what a payment paid goes whole: its script, the rule that starts it and the rule that marks an
 * instalment paid by the payment it names (match-payment-78, REC-B11 step 3). `repeating-overdue`, whose `where` and
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
/** AND BATCH 92'S, folded into the same unreleased step and undone first (money-every-month-92, REC-B23 jobs 5 to 7): the walk of the next thirty days stands under Coming and going again, Every month goes, and the chart reads twelve months back. And a deleted payment no longer reopens its bill (unsettle-92): `payment-unsettles` and its script go. */
const withoutBatch92 = (doc: Body): Body => {
  const money = withPage(doc, 'money', (now) => now.filter((b) => b.heading !== 'Every month').flatMap((b) => (b.heading === 'Coming and going' ? [b, NEXT_30.find((x) => x.kind === 'bridge') as Body] : [b])).map((b) => (b.heading === 'In and out, by month' ? { ...b, back: 12 } : b)));
  return { ...money, declarations: (money.declarations as Body[]).filter((d) => d.script !== 'unsettle' && d.rule !== 'payment-unsettles') };
};
/**
 * AND BATCH 95'S, folded into the same unreleased step and undone first (money-board-place-95, REC-B23 step 7;
 * money-lasts-no-income-95, REC-B07 step 8). Waiting on you stands under Accounts in the side column again and the
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
 * AND THE UI PASS OF 20 OCTOBER'S, folded into the same unreleased 3.17.0 and undone first (money F3, F5): Heads up's two
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
 * AND THE SAME PASS'S LAST ROUND (H18, H19, P20), undone before it: Heads up stands in the side column with each line
 * ending on its one way to act, and the box that took today's balance is off Money, so Runs out stands beside Lasts in
 * the room it left. The line says how far the cash moved in words (`.moved`), where it said a signed percent.
 */
const STALE_LINE = "The oldest balance in Cash now was last confirmed on {{cash-as-of}}. Say what an account holds today and this page starts from today's money.";
const ACTS = / \[(?:See them|Update balances)\]\([^)]*\)$/u;
/* And Bills and invoices said one of it as `item`, before P25 named it `bill or invoice`. */
const itemAgain = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).map((d) => (d.one === 'bill or invoice' ? { ...d, one: 'item' } : d)) });
/**
 * MONEY 3.18.0 COMES OFF FIRST (the audit of 22 October, U4): no figure of the parts late, the lines with no sentence of
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
 * PEOPLE 3.9.0 COMES OFF BEFORE IT (the pass of 27 October): no figure for the shops a card text named nor
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
 * PEOPLE 3.8.0 COMES OFF FIRST (the audit of 25 October, Y2): no Retired on for an organisation, nor a `retired` part in
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
 * MONEY 3.22.0 COMES OFF FIRST (the audit of 25 October, Y1): no "Made one with" on Plans, no rule that moves a plan's
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
 * warn at, a carry over or a category it sits under.
 */
const SECTION_29 = new Set(['money-accounts', 'money-ledger', 'money-budgets', 'money-coming', 'money-forecast', 'money-reports', 'money-payees']);
const CATEGORY_29 = new Set(['icon', 'colour', 'budget_alert', 'rollover', 'parent']);
const withoutSection29 = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => !SECTION_29.has(d.page as string))
    .map((d) => (d.register === 'categories' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => !CATEGORY_29.has(f.id as string)) } : d)),
});
/** MONEY 3.24.0 COMES OFF FIRST (the look of 26 October, R4): the Accounts split read six accounts at most. */
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
 * MONEY 3.21.0 COMES OFF NEXT (the audit of 25 October, Z14 and Z18): the calendar of what falls due under Coming and
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
 * MONEY 3.20.0 COMES OFF BEFORE IT (B6, B8 and B24 of 24 October): no sentence of what is to pay on the card in the lines
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
        if (b.heading === 'Instalments') return [b, SPENDING[0] as Body, BUDGET.find((x) => x.kind === 'progress') as Body];
        return [b];
      }),
  );
  return withPage(money, 'money-book', (now) =>
    now.map((b) => (b.heading === 'Cash ahead' ? noAxis({ ...b, horizon: 365, horizons: [90, 180, 365, 730, 1825, 'last'], empty: 'Nothing in {{name}} is dated in the next twelve months.' }) : b)),
  );
};
/** Batch 63's four figures of this month's spending against last (spend-figures-63), new in the unreleased money-core 3.17.0. */
const SPEND_VS_LAST: ReadonlySet<string> = new Set(['spent-last-month', 'spent-by-category-last-month', 'spent-by-category-to-date-last-month', 'spent-vs-last-month']);
/** Projects' quiet line with the clause for its list's questions, added inside the unreleased portfolio 1.17.0 (waiting-work-projects-99, PGS-C18). */
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
const KPI_FIGURES: ReadonlySet<string> = new Set(['kpis-held', 'kpi-stale', 'project-staged', 'project-plan-path', 'project-plan-roadmap']);
const beforeKpis = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    /* AND NUMBERS' OWN PAGE (portfolio 1.25.0, E26), which reads the readings Portfolio holds only since 1.19.0. */
    .filter((d) => !KPI_LISTS.has(String(d.register)) && !KPI_FIGURES.has(String(d.metric)) && d.script !== 'kpi_backfill' && d.page !== 'all-numbers')
    /* AND 1.24.0'S OFFER BY KIND (B27 of 24 October), the rule and its script, which read the kind going below. */
    .filter((d) => d.rule !== 'kind-offers-kpis' && d.script !== 'kind_drafts')
    .map((d) => (d.register === 'things' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => f.id !== 'kind' && f.id !== 'drawn_as') } : d)),
});

const LATEST: Record<string, { version: string; released: string; undo: (doc: Body) => Body }> = {
  /* AN ACCOUNT'S DIGITS SAID THE LAST FOUR. */
  'money-core': {
    version: '3.13.0',
    released: '2e09983b40aba73e',
    undo: (raw) => {
      const doc = withoutPaydays(withoutAges(withoutDirection(withoutCrossCheck(withoutFiling(withoutPaid(withoutLedgerTile(withoutPlans(withoutPayee(withoutEveryday(withoutBookFill(withoutPlanLeads(withoutBatch73(withoutBatch74(withoutBatch75(withoutBatch76(withoutBatch77(withoutBatch78(withoutBatch92(withoutBatch95(withoutBatch100(withoutUiPass(withoutUiPassR3(withoutLatePart(withoutCard20(withoutCalendar21(withoutTwins22(withoutLasts23(withoutLimit24(withoutAhead27(withoutSection29(raw)))))))))))))))))))))))))))))));
      return {
      ...doc,
      /* AND THE SCRIPT THAT MARKS A BILL PAID, WITH THE RULE THAT STARTS IT (settle-rule-60), both newer than 3.13.0. */
      /* AND BATCH 61'S THREE, folded into the same unreleased 3.17.0: the two figures over who filed the Ledger go
         (filing-figures-61), and the Ledger pairs within one currency alone again (pairs-fx-61). The Ledger tile's own
         gate went with the tile (`withoutLedgerTile`). */
      /* AND BATCH 63'S, folded into the same unreleased 3.17.0: the four figures of this month's spending against last go
         (spend-figures-63). The Ledger tile's written line went with the tile, the narrowed `filed-for-you-30d` with the
         figure, and the guard on a typed Paid so far with `settle`, each dropped whole above. */
      declarations: (doc.declarations as Body[]).filter((d) => !SIGNS_ADDED.has(String(d.metric)) && !WEEK_IN.has(String(d.metric)) && d.script !== 'last_day' && d.script !== 'settle' && d.rule !== 'payment-settles' && d.metric !== 'filed-for-you-30d' && d.metric !== 'filed-today' && !SPEND_VS_LAST.has(String(d.metric))).map((d) =>
        d.register === 'accounts' && Array.isArray(d.fields)
          ? { ...d, fields: (d.fields as Body[]).map((f) => (f.id === 'last4' ? { ...f, label: 'Last four digits' } : f)) }
          : d.register === 'transactions' && d.pairs !== undefined
            ? { ...d, pairs: (({ across_currency: _fx, ...rest }) => rest)(d.pairs as Body) }
            : d,
      ),
      };
    },
  },
  /* A PROJECT OTHERS POINT AT COULD BE DELETED, PROJECTS DID NOT COUNT WHO SAYS WHAT THEY EARNED, AND NOTHING COUNTED
     WHETHER A PROJECT WAS DESCRIBED (portfolio 1.16.0 comes off first). */
  portfolio: {
    version: '1.15.0',
    released: '982f163d9d8ab76f',
    undo: (fresh) => {
      /* THE UI PASS OF 20 OCTOBER COMES OFF FIRST, inside the unreleased 1.18.0, after 1.19.0's key numbers. */
      const raw = beforeUiPass(beforeKpis(fresh), 'portfolio');
      return withPage(
        {
          ...raw,
          /* AND THE `draft` FIELD comes off with it, added in portfolio 1.18.0: a project the record formed from a first session. */
          declarations: (raw.declarations as Body[]).map((d) =>
            /* AND WHERE THEY ARE COUNTS FINISHED AGAIN, as it did until portfolio 1.28.0 (the look of 25 October, P11). */
            d.metric === 'projects-by-lane' ? { ...d, where: 'lane is set' } :
            d.register === 'things' ? (({ delete: _rule, ...rest }) => (Array.isArray(rest.fields) ? { ...rest, fields: (rest.fields as Body[]).filter((f) => f.id !== 'draft').map(({ hidden_from_agents: _h, ...f }) => f) } : rest))(d) : d,
          ),
        },
        'portfolio',
        /* AND THE ONE LINE TYPED ON AN IN PLAY CARD comes off with it, added inside the unreleased 1.17.0
           (card-edit-wire-93, PGS-C15): `about` was text alone. AND ITS WHEN, how long since anybody worked on the
           project, added inside the same unreleased 1.17.0 (projects-last-worked-96, REC-C16). */
        (now) =>
          now
            .filter((b) => b.key !== 'open-earns-said' && b.key !== 'earns-said' && !(b.kind === 'queue' && b.where === 'list is things') && b.key !== 'in-play-earning' && b.key !== 'where-they-are')
            /* AND BATCH 101'S STRIP AND LANES (projects-lanes-lines-101, PGS-C17), inside the same unreleased 1.17.0: the
               strip In play and earning and the split Where they are go, and How they are going draws past four again. */
            .map((b) => (b.kind === 'split' && b.heading === 'How they are going' ? { ...b, when: { metric: 'projects-live', gt: 4 } } : b))
            /* AND THE QUESTIONS ABOUT ITS LIST, a queue and a clause in the line, added inside the same unreleased 1.17.0
               (waiting-work-projects-99, PGS-C18). */
            .map((b) => (b.kind === 'note' && typeof b.body === 'string' ? { ...b, body: b.body === QUIET_PROJECTS ? 'Nothing needs you across {{projects-live}} project(s) in play' : b.body.replace('{{questions-open-in:things}} question(s) for you, ', '') } : b))
            .map((b) =>
              b.kind === 'cards' && Array.isArray(b.columns)
                ? { ...b, columns: (b.columns as Body[]).filter((c) => c.as !== 'when').map(({ edit: _edit, ...c }) => c) }
                : b,
            ),
        (d) => d.metric !== 'project-said' && d.metric !== 'projects-with-health' && d.metric !== 'projects-lane-earning',
      );
    },
  },
  /* A CARD NAMED ITS PROJECT, where it says its day and who holds it. A record without Projects had no third column. */
  /* AND WORK 1.18.0'S COUNT OF WHAT WAS WORKED ON A PROJECT THIS WEEK comes off first. */
  work: {
    version: '1.16.0',
    released: 'b27c59050f32684d',
    undo: (fresh) => {
      /* THE UI PASS OF 20 OCTOBER COMES OFF FIRST, inside the unreleased 1.19.0. */
      const raw = beforeUiPass(fresh, 'work');
      /* WORK 1.19.0'S THREADS AND FOLLOW-UPS COME OFF BEFORE THAT (W061, REC-C10): a thread's Status back to its four
         values with no labels and no declared moves, the day it aims for gone, and the script that starts a follow-up
         back to the title and source 1.18.0 released, read from its frozen document. */
      const was = (WORK_1_18.declarations as Body[]).find((d) => d.script === 'start_with_parent')!;
      const threads = (raw.declarations as Body[]).map((d) =>
        d.register === 'tracks' && Array.isArray(d.fields)
          ? {
              ...d,
              fields: (d.fields as Body[])
                .filter((f) => f.id !== 'target')
                .map((f) => (f.id === 'state' ? (({ labels: _labels, transitions: _moves, ...rest }) => ({ ...rest, values: ['open', 'holding', 'done', 'dropped'] }))(f) : f)),
            }
          : d.script === 'start_with_parent'
            ? { ...d, title: was.title, source: was.source }
            : d,
      );
      const doc = { ...raw, declarations: threads.filter((d) => d.metric !== 'project-moved-7d' && d.metric !== 'project-last-worked') };
      const linked = (doc.declarations as Body[]).some((d) => d.register === 'tasks' && (d.fields as Body[]).some((f) => f.id === 'thing'));
      /* AND THE BOARD'S CAPTURE LINE comes off too, added inside the unreleased 1.19.0 (board-capture-line-83). */
      /* AND THE QUESTIONS ABOUT ITS LIST, a queue and a clause in the line, added inside the unreleased 1.19.0
         (waiting-work-projects-99, PGS-C18). */
      /* AND WORK'S HEAD AND ITS OPEN WORK WITH NO PROJECT, a fold, a list and the figure both are gated on, added inside
         the unreleased 1.19.0 (work-head-and-no-project-101, AGT-D14 job 1, PGS-A14). */
      const headless = {
        ...doc,
        declarations: (doc.declarations as Body[]).filter((d) => d.metric !== 'tasks-no-project').map((d) => (d.page === 'work' ? (({ header: _head, ...rest }) => rest)(d) : d)),
      };
      const asked = withPage(headless, 'work', (now) =>
        now
          .filter((b) => !(b.kind === 'queue' && b.where === 'list is tasks') && b.heading !== 'Needs a project' && b.heading !== 'With no project')
          .map((b) => (b.kind === 'note' && typeof b.body === 'string' ? { ...b, body: b.body.replace('{{questions-open-in:tasks}} question(s) for you, ', '') } : b)),
      );
      /* AND THE BOARD'S READ, ITS LINE AND ITS LIST (audit B of 25 October, Y8), inside the unreleased 1.19.0: the board
         read by tier and day, fifty at most, the line said nothing of Later, and Everything open stood under it. */
      const boardBefore = (b: Body): Body => {
        const { limit: _limit, ...rest } = b;
        return { ...rest, order: [{ field: 'priority', dir: 'asc' }, { field: 'by', dir: 'asc' }] };
      };
      const EVERYTHING_OPEN: Body = {
        kind: 'table',
        heading: 'Everything open',
        icon: 'rows',
        span: 12,
        source: 'register.tasks',
        where: 'state is not backlog or done or dropped',
        columns: [
          { field: 'what', width: 'minmax(20ch,1fr)' },
          { field: 'thing', label: 'Project', width: 'minmax(10ch,16ch)' },
          { field: 'owner', label: 'Owner', width: 'minmax(8ch,14ch)' },
          { field: 'agent', label: 'Agent', width: '10ch' },
          { field: 'state', label: 'Status', width: '12ch' },
          { field: 'by', label: 'Due', width: '13ch', align: 'end' },
        ],
        order: [{ field: 'by', dir: 'asc' }],
        when: { metric: 'open-tasks', gt: 0 },
        limit: 50,
      };
      return withPage(asked, 'work-board', (now) =>
        [...now, EVERYTHING_OPEN]
          .filter((b) => b.kind !== 'capture')
          .map((b) => (b.kind === 'note' && typeof b.body === 'string' ? { ...b, body: b.body.replace('{{tasks-later}} for later, ', '') } : b))
          .map((b) => (b.kind === 'board' ? { ...boardBefore(b), columns: [{ field: 'state' }, { field: 'what' }, ...(linked ? [{ field: 'thing' }] : [])] } : b)),
      );
    },
  },
  /* GONE QUIET AND LAST IN TOUCH STOOD OVER EVERYONE, two lists of the people on the cards under them. */
  /* AND PEOPLE 3.3.0'S HEALTH PAGE, the record's vital signs, comes off first. */
  /* AND PEOPLE 3.4.0'S NOTE OF WHO MAY BE HELD TWICE comes off the People page with it (people-held-twice-69). */
  /* AND PEOPLE 3.4.0'S CALENDAR PAGE, added while it is unreleased (calendar-page-82). */
  /* AND PEOPLE 3.4.0'S ACTIVITY PAGE, added while it is still unreleased (activity-page-88). */
  /* AND PEOPLE 3.6.0'S SCRIPTS PAGE (C33). */
  people: {
    version: '3.1.0',
    released: '36328d2fcaeb58f3',
    undo: (raw) =>
      withPage({ ...raw, declarations: (withoutRetired38(raw).declarations as Body[]).filter((d) => d.page !== 'health' && d.page !== 'calendar' && d.page !== 'activity' && d.page !== 'scripts').map((d) => (d.metric === 'people-in-touch-30d' ? (({ snapshot: _save, ...rest }) => rest)(d) : d)) }, 'people', (now) =>
        /* AND PEOPLE 3.4.0'S QUESTIONS ABOUT SOMEBODY, a queue and a clause in each line (waiting-people-services-99, PGS-C18). */
        /* AND PEOPLE 3.4.0'S IN TOUCH AND WHAT AGENTS DID, with the night's save of the figure and the line's clause that
           In touch took over (services-people-five-parts-101, PGS-C18). */
        now
          .filter((b) => !(b.kind === 'queue' && b.where === 'list is people') && b.heading !== 'In touch' && b.heading !== 'What agents did')
          .map((b) => (b.kind === 'note' && b.body === '{{questions-open-in:people}} question(s) for you, {{people-count}} contact(s)' ? { ...b, body: `${b.body}, {{people-in-touch-30d}} in touch in the last 30 days` } : b))
          .map((b) => (b.kind === 'note' && typeof b.body === 'string' ? { ...b, body: b.body.replace('{{questions-open-in:people}} question(s) for you, ', '') } : b))
          .map(peopleBefore6)
          .flatMap((b) =>
            (b.when as Body | undefined)?.metric === 'held-twice'
              ? []
              : b.heading !== 'Everyone'
              ? [b]
              : [
                  {
                    kind: 'table',
                    heading: 'Gone quiet',
                    icon: 'hourglass',
                    tone: 'bad',
                    span: 6,
                    source: 'register.people',
                    where: 'merged_into is empty, in_touch before -90d',
                    columns: LAST_IN_TOUCH,
                    order: QUIETEST_FIRST,
                    limit: 6,
                    when: { metric: 'people-quiet', gt: 0 },
                  },
                  {
                    kind: 'table',
                    heading: 'Last in touch',
                    icon: 'handshake',
                    span: 6,
                    source: 'register.people',
                    where: 'merged_into is empty, in_touch after -91d',
                    columns: LAST_IN_TOUCH,
                    order: QUIETEST_FIRST,
                    limit: 6,
                    when: { metric: 'people-in-touch-90d', gt: 0 },
                  },
                  b,
                ],
          ),
      ),
  },
};

/**
 * A LEAD PAGE'S PLACE ON THE RAIL, `nav.place`, taken off every page: batch 101 put it inside each module's unreleased
 * step (places-and-computed-101, SHL-A18), and no released version said one.
 */
const unplaced = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[]).map((d) => (d.nav !== null && typeof d.nav === 'object' && 'place' in (d.nav as Body) ? { ...d, nav: (({ place: _place, ...nav }) => nav)(d.nav as Body) } : d)),
});

/** A document as the version before this build's declared it, for a module this build moved on, else as it is. */
const latestUndone = (id: string, doc: Body): Body => LATEST[id]?.undo(thingsUndone(id, doc)) ?? thingsUndone(id, doc);

/**
 * EACH MODULE AS THE VERSION BEFORE DECLARED IT, made from this build's document by undoing the one change its new
 * version makes (work 1.16.0, portfolio 1.15.0, people 3.1.0, money-core 3.13.0). NOT A GUESS AT WHAT SHIPPED: each is
 * held below to the fingerprint `pack-versions.test.ts` records for the version it rebuilds, so the update is planned
 * over what a record really holds, to the letter. WORK AND PEOPLE HAVE MOVED ON ONCE MORE SINCE (`LATEST`), so theirs
 * undo that step first and a record two versions back is rebuilt as it was.
 */
const BEFORE: Record<string, { version: string; released: string; undo: (doc: Body) => Body }> = {
  /* THE BOARD SAID BY STATUS, with its glyph. */
  work: {
    version: '1.15.0',
    released: '285a35e7197ac5cb',
    undo: (doc) => withPage(latestUndone('work', doc), 'work-board', (now) => now.map((b) => (b.kind === 'board' ? headed(b, 'By status', 'board') : b))),
  },
  /* THE WALK OF THE NEXT THIRTY DAYS HAD A HEADING OF ITS OWN under Coming and going's. */
  'money-core': {
    version: '3.12.0',
    released: 'f7558a5590d4ee11',
    undo: (doc) => withPage(latestUndone('money-core', doc), 'money', (now) => now.map((b) => (b.kind === 'bridge' ? headed(b, 'The next 30 days', 'scale') : b))),
  },
  /* TWELVE WEEKS OF DOTS where the two lists are, and no figure for the second of them. */
  people: {
    version: '3.0.0',
    released: 'd6246046a52dcc45',
    undo: (doc) =>
      withPage(
        latestUndone('people', doc),
        'people',
        (now) =>
          now.flatMap((b) =>
            b.heading === 'Last in touch'
              ? []
              : b.heading === 'Gone quiet'
                ? [
                    {
                      kind: 'heat',
                      heading: 'In touch, 12 weeks',
                      icon: 'handshake',
                      span: 12,
                      who: true,
                      source: 'register.people',
                      where: 'in_touch after -84d',
                      columns: [{ field: 'in_touch' }, { field: 'name' }],
                      when: { metric: 'people-in-touch-12w', gt: 0 },
                      empty: 'Nobody was in touch in the last twelve weeks.',
                    },
                  ]
                : [b],
          ),
        (d) => d.metric !== 'people-in-touch-90d',
      ),
  },
  /* BOTH HEADINGS FOLDED WHATEVER WAS UNDER THEM: no open tile, and each fold drawn on more than nought. */
  portfolio: {
    version: '1.14.0',
    released: '51a2d8569a7b35e3',
    undo: (doc) =>
      withPage(latestUndone('portfolio', doc), 'portfolio', (now) => {
        const out: Body[] = [];
        let open = false;
        for (const b of now) {
          if (b.kind === 'section') open = b.box === true;
          if (open) continue;
          out.push(b.kind === 'section' && b.fold === true ? { ...b, when: { ...(b.when as Body), gt: 0 } } : b);
        }
        return out;
      }),
  },
};

test('THE VERSIONS BEFORE THE SECOND DESIGN REVIEW, REBUILT, ARE THE ONES RELEASED, to the letter', () => {
  for (const [id, was] of [...Object.entries(BEFORE), ...Object.entries(LATEST)]) {
    const now = firstPartyDocument(id as never, { seeds: [] }) as unknown as Body;
    assert.notEqual(FIRST_PARTY_VERSIONS[id as 'work'], was.version, `${id} has not moved on from ${was.version}`);
    assert.equal(fingerprintOf(was.undo(unplaced(thingsUndone(id, now)))), was.released, `${id}: undoing this build's change does not give ${was.version} as it was released`);
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
    const doc = documentFor(k, m)!;
    await put(k, sql, { ...withoutCashStale(BEFORE[m]!.undo(doc)), version: BEFORE[m]!.version });
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
  /* AND SINCE REC-B23 NO WALK OF THIRTY DAYS AT ALL: the calendar opens Coming and going. */
  assert.deepEqual([money[money.findIndex((b) => b.heading === 'Coming and going') + 1]!.kind, money.some((b) => b.kind === 'bridge')], ['calendar', false]);
  /* PEOPLE DRAWS NO DOTS, AND SINCE 3.2.0 NO LIST OVER ITS CARDS EITHER, and keeps the figures the chart and the list drew on. */
  const people = blocks('people');
  assert.ok(!people.some((b) => b.kind === 'heat'), 'the twelve weeks of dots are still on People');
  /* THE ONLY TABLE IS THE ORGANISATIONS, AND EVERYONE THE FACES, SINCE People 3.6.0, the people and not a list over their cards. */
  assert.deepEqual(people.filter((b) => b.kind === 'table').map((b) => b.heading), ['Organisations']);
  assert.deepEqual(people.filter((b) => b.kind === 'cards').map((b) => b.heading), ['Everyone']);
  for (const id of ['metric.people-in-touch-90d', 'metric.people-in-touch-12w']) assert.ok(k.packClaims('people').includes(id), `${id} is not on the record`);
  /* AND PROJECTS HOLDS NO HEADING OVER ITS CARDS, SINCE the UI pass of 20 October (proj F5): what each earns alone, and
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

/* AND ONE OF BILLS AND INVOICES WAS AN `item` (P25, the UI pass of 20 October), which a use case's label setting starts from. */
const oneBefore = (doc: Body): Body => JSON.parse(JSON.stringify(doc).replaceAll('"default":"bill or invoice"', '"default":"item"')) as Body;

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
 * THE PROJECT PAGE AS IT WAS BEFORE ITS SHAPE WAS BLOCKS (founder 3.3.0, team 2.25.0; C28 and C29): no `project`
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
      if (b.heading === 'Agents' && b.source === 'register.session')
        return [{ ...b, columns: [{ field: 'doing', as: 'title' }, { field: 'agent', as: 'who' }, { field: 'last_seen', as: 'when' }], where: 'project is {{spoken}}' }];
      if (b.heading === 'Tools and servers') return [{ ...runsOn89(b), span: 6, where: 'kind is tool' }];
      /* KEYS AND SKILLS LISTED EVERYBODY'S until batch 72 (project-own-cards-72, PGS-C31), as Tools and servers had. */
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
    assert.equal(fingerprintOf(oneBefore(projectBefore(useCaseThingsUndone(useCaseDocument(id, TODAY) as Body), id))), was.released, `${id}: undoing this build's change does not give ${was.version} as it was released`);

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
    const doc = documentFor(k, m)!;
    const was = LATEST[m];
    await put(k, sql, was ? { ...withoutCashStale(was.undo(thingsUndone(m, doc))), version: was.version } : doc);
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

/* ── the agents pack and the use cases, in the night's own loop (`loop/research-audit-30.md`, Medium 3) ─────────────── */

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
    const doc = documentFor(k, m)!;
    const was = LATEST[m];
    await put(k, sql, was ? { ...was.undo(thingsUndone(m, doc)), version: was.version } : doc);
  }
  const steps = await updateFirstParty(portOf(k, sql));
  assert.deepEqual(
    steps.find((s) => s.pack === 'money-core'),
    { pack: 'money-core', from: '3.13.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'asked', lose: ['take away Cash stale'] },
    JSON.stringify(steps),
  );
  sql.close();
});
