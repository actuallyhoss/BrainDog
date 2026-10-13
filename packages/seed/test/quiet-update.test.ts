/**
 * BRAINDOG'S OWN UPDATES GO IN ON THEIR OWN WHEN NOTHING THE PERSON CHANGED WOULD BE LOST, and ask once otherwise
 * (DIRECTION §37, `packs/quiet.ts`).
 *
 * THE RECORD HERE IS SHAPED AS THE OWNER'S WAS ON OCTOBER 6TH (`loop/STATUS.md`): People 2.x with no organisations and no
 * `self`, six people with him twice, Projects, Money and Work beside it. Nothing in it is his by name; any record in that
 * shape takes the same road (DIRECTION §27).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { handedOf, install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { losses, shippedVersion, updateFirstParty, type QuietPort, type QuietQuestion } from '@braindog/seed/packs/quiet';
import type { Result } from '@braindog/ports';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_PACK, FIRST_PARTY_VERSIONS, NOW, agentsPackDocument, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { keptLists, modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { peopleBefore3 } from './people-before-3.ts';

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
 * Money 3.11.0 and Work 1.15.0 move their tiles (DIRECTION §39) and Work gains `tasks-this-week-yours`; Money 3.12.0
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
  assert.equal(work.blocks.find((b) => b.heading === 'This week')?.when?.metric, 'tasks-this-week-yours');
  /* AND RUNS OUT DRAWS THE DAY, over the figure the update brought with it (money-core 3.12.0). */
  const runs = (page.blocks as { heading?: string; cells?: { metric: string }[] }[]).find((b) => b.heading === 'Runs out');
  assert.deepEqual(runs?.cells?.map((c) => c.metric), ['runs-out-on']);
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
    for (const m of modulesFor(u, ['people'])) if (m !== 'agents') await put(k, sql, documentFor(k, m)!);

    const now = carriedDocument(u, TODAY)!;
    assert.deepEqual(stands(now).tones, { at_risk: 'warn', off_track: 'bad' }, `${id}: on track wears no mark`);
    const [major, minor] = u.version.split('.').map(Number);
    const before = `${major}.${minor! - 1}.0`;
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
const withoutFiling = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.register !== 'filing_rules')
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
 */
const PLAN_FIELDS: ReadonlySet<string> = new Set(['plan_row', 'left_after']);
const withoutPlans = (doc: Body): Body => ({
  ...doc,
  declarations: (doc.declarations as Body[])
    .filter((d) => d.register !== 'plans' && d.rule !== 'part-counts-plan' && d.script !== 'plans_from_names')
    .map((d) => (d.register === 'installments' && Array.isArray(d.fields) ? { ...d, fields: (d.fields as Body[]).filter((f) => !PLAN_FIELDS.has(String(f.id))) } : d)),
});
const withoutCashStale = (doc: Body): Body => ({ ...doc, declarations: (doc.declarations as Body[]).filter((d) => d.rule !== 'cash-stale') });
/** Work as 1.18.0 released it, the frozen document (`fixtures/released/`), which holds the follow-up script as it was. */
const WORK_1_18 = JSON.parse(readFileSync(new URL('./fixtures/released/work-1.18.0.json', import.meta.url), 'utf8')) as Body;
/** Batch 63's four figures of this month's spending against last (spend-figures-63), new in the unreleased money-core 3.17.0. */
const SPEND_VS_LAST: ReadonlySet<string> = new Set(['spent-last-month', 'spent-by-category-last-month', 'spent-by-category-to-date-last-month', 'spent-vs-last-month']);
const LATEST: Record<string, { version: string; released: string; undo: (doc: Body) => Body }> = {
  /* AN ACCOUNT'S DIGITS SAID THE LAST FOUR. */
  'money-core': {
    version: '3.13.0',
    released: '2e09983b40aba73e',
    undo: (raw) => {
      const doc = withoutPaydays(withoutAges(withoutDirection(withoutCrossCheck(withoutFiling(withoutPaid(withoutLedgerTile(withoutPlans(raw))))))));
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
    undo: (raw) =>
      withPage(
        {
          ...raw,
          declarations: (raw.declarations as Body[]).map((d) => (d.register === 'things' ? (({ delete: _rule, ...rest }) => rest)(d) : d)),
        },
        'portfolio',
        (now) => now.filter((b) => b.key !== 'open-earns-said' && b.key !== 'earns-said'),
        (d) => d.metric !== 'project-said',
      ),
  },
  /* A CARD NAMED ITS PROJECT, where it says its day and who holds it. A record without Projects had no third column. */
  /* AND WORK 1.18.0'S COUNT OF WHAT WAS WORKED ON A PROJECT THIS WEEK comes off first. */
  work: {
    version: '1.16.0',
    released: 'b27c59050f32684d',
    undo: (raw) => {
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
      return withPage(doc, 'work-board', (now) =>
        now.map((b) => (b.kind === 'board' ? { ...b, columns: [{ field: 'state' }, { field: 'what' }, ...(linked ? [{ field: 'thing' }] : [])] } : b)),
      );
    },
  },
  /* GONE QUIET AND LAST IN TOUCH STOOD OVER EVERYONE, two lists of the people on the cards under them. */
  /* AND PEOPLE 3.3.0'S HEALTH PAGE, the record's vital signs, comes off first. */
  people: {
    version: '3.1.0',
    released: '36328d2fcaeb58f3',
    undo: (raw) =>
      withPage({ ...raw, declarations: (raw.declarations as Body[]).filter((d) => d.page !== 'health') }, 'people', (now) =>
        now.flatMap((b) =>
          b.heading !== 'Everyone'
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

/** A document as the version before this build's declared it, for a module this build moved on, else as it is. */
const latestUndone = (id: string, doc: Body): Body => LATEST[id]?.undo(doc) ?? doc;

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
    assert.equal(fingerprintOf(was.undo(now)), was.released, `${id}: undoing this build's change does not give ${was.version} as it was released`);
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
  assert.deepEqual([money[money.findIndex((b) => b.heading === 'Coming and going') + 1]!.kind, money.find((b) => b.kind === 'bridge')!.heading], ['bridge', undefined]);
  /* PEOPLE DRAWS NO DOTS, AND SINCE 3.2.0 NO LIST OVER ITS CARDS EITHER, and keeps the figures the chart and the list drew on. */
  const people = blocks('people');
  assert.ok(!people.some((b) => b.kind === 'heat'), 'the twelve weeks of dots are still on People');
  assert.deepEqual(people.filter((b) => b.kind === 'table').map((b) => b.heading), []);
  for (const id of ['metric.people-in-touch-90d', 'metric.people-in-touch-12w']) assert.ok(k.packClaims('people').includes(id), `${id} is not on the record`);
  /* AND PROJECTS HOLDS EACH HEADING TWICE, open while four or fewer are under it and folded past four. */
  const sections = blocks('portfolio').filter((b) => b.kind === 'section');
  assert.deepEqual(sections.map((b) => [b.heading, b.box === true ? 'open' : 'folded', b.when?.lte ?? b.when?.gt]), [
    ['Earnings, agents and dates', 'open', 4],
    ['Earnings, agents and dates', 'folded', 4],
    ['Parked and finished', 'open', 4],
    ['Parked and finished', 'folded', 4],
  ]);

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
const projectBefore = (doc: Body, id: string): Body =>
  withPage(workingBefore(numbersBefore(standsBefore(lookBefore(doc, id)), id), id), 'project', (now) =>
    now.flatMap((b) => {
      if (b.kind === 'roadmap') return [DONE_BY_WEEK, b];
      /* TOOLS AND SERVERS LISTED EVERYBODY'S TOOLS until batch 60 (sketchpad-60), where it now reads the project's own. */
      if (b.heading === 'Tools and servers') return [{ ...b, where: 'kind is tool' }];
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
 */
const lookBefore = (doc: Body, id: string): Body => {
  if (id !== 'founder') return doc;
  const config = doc.config as Record<string, Body> | undefined;
  return {
    ...doc,
    ...(config === undefined ? {} : { config: { ...config, voice_home: { ...config.voice_home, default: 'Overview' } } }),
    declarations: (doc.declarations as Body[])
      .filter((d) => d.metric !== 'late-money')
      .map((d) => {
        if (d.metric === 'due-this-week') return { ...d, where: DUE_NO_NEAR_EDGE };
        if (d.page !== 'home-founder') return d;
        return {
          ...d,
          title: 'Overview',
          blocks: (d.blocks as Body[]).flatMap((b) => {
            if (b.heading === 'Late') return [];
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
 * too (founder-bound-66): `, at before tomorrow` on each `datapoints-` figure.
 */
const numbersBefore = (doc: Body, id: string): Body =>
  id !== 'founder'
    ? doc
    : {
        ...doc,
        ...(Array.isArray(doc.adds) ? { adds: (doc.adds as Body[]).filter((a) => (a.block as Body | undefined)?.key !== 'earning-silent' && (a.block as Body | undefined)?.heading !== 'Server and provider numbers') } : {}),
        declarations: (doc.declarations as Body[]).filter((d) => d.metric !== 'project-numbers-7d' && d.metric !== 'projects-earning-silent' && d.metric !== 'service-numbers').map((d) =>
          typeof d.metric === 'string' && d.metric.startsWith('datapoints-') && typeof d.where === 'string'
            ? { ...d, where: d.where.replace(', at before tomorrow', '') }
            : d.register === 'datapoints'
            ? { ...d, fields: (d.fields as Body[]).flatMap((f) => (f.id === 'amount' || f.id === 'about_service' ? [] : f.id === 'value' ? [{ ...f, required: true }] : [f])) }
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
    assert.equal(fingerprintOf(projectBefore(useCaseDocument(id, TODAY) as Body, id)), was.released, `${id}: undoing this build's change does not give ${was.version} as it was released`);

    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    for (const m of modulesFor(u, ['people'])) if (m !== 'agents') await put(k, sql, documentFor(k, m)!);
    const now = carriedDocument(u, TODAY)!;
    await put(k, sql, { ...projectBefore(now, id), version: was.version });
    const pack = `usecase-${id}`;
    assert.equal(k.packs().find((p) => p.id === pack)?.version, was.version);

    const next = value<Pack>(await normalise(now, { kind: 'local' }));
    const diff = await plan(next, stateOf(k, sql));
    assert.deepEqual(losses(diff), [], `${id}: nothing would be lost`);
    assert.deepEqual([diff.adds.length, diff.retires.length, diff.conflicts.length], [id === 'founder' ? 4 : 0, 0, 0], `${id}: only a page changed, and the founder's figures since (service-numbers the fourth, estate-numbers-61)`);
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
    await put(k, sql, was ? { ...withoutCashStale(was.undo(doc)), version: was.version } : doc);
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

/** A record holding a use case at the version before this build's, the modules under it, and the agents pack at 1.7.0. */
async function onUseCaseBefore(id: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of modulesFor(u, ['people'])) if (m !== 'agents') await put(k, sql, documentFor(k, m)!);
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
    await put(k, sql, was ? { ...was.undo(doc), version: was.version } : doc);
  }
  const steps = await updateFirstParty(portOf(k, sql));
  assert.deepEqual(
    steps.find((s) => s.pack === 'money-core'),
    { pack: 'money-core', from: '3.13.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'asked', lose: ['take away Cash stale'] },
    JSON.stringify(steps),
  );
  sql.close();
});
