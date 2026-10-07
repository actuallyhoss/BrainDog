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

import { handedOf, install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { updateFirstParty, type QuietPort, type QuietQuestion } from '@braindog/seed/packs/quiet';
import type { Result } from '@braindog/ports';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY_VERSIONS, NOW, firstPartyManifest } from '../src/index.ts';
import { dayOf, moduleDocument } from '../src/usecases/install.ts';
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
    ['Sam', 'admin@person.example'],
    ['sam', 'sam@laptop.example'],
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
