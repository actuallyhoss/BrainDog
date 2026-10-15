/**
 * A use case's pack cut to the lists a record holds (`fitted`, USE-B08): over every shipped use case and every mix of the
 * modules it names, generated here and never listed by hand, no part of the cut document names a list the record will not
 * hold, and the record takes it. What reads a held list stays, a page left empty goes, a part that says
 * `when: { holds }` is left to the plan, and a document asked for with no `holds` is the one it always was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW } from '../src/index.ts';
import { USE_CASES, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, fitted, moduleDocument, moduleManifest, withoutRows } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
type Body = Record<string, unknown>;

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

/** Plans and installs one document, answering the refusal rather than throwing. */
async function put(k: Kernel, doc: unknown): Promise<{ ok: boolean; refusal?: { code: string; fix: string; at?: string } }> {
  const pack = await normalise(doc, { kind: 'local' });
  if (!pack.ok) return pack;
  const diff = await plan(pack.value as Pack, stateOf(k));
  return install(pack.value as Pack, diff, hostFor(k), diff.planHash) as never;
}

/** Every mix of a use case's modules: each part of `modules`, the empty one and the whole one among them. */
const mixesOf = (modules: readonly string[]): string[][] =>
  Array.from({ length: 2 ** modules.length }, (_, n) => modules.filter((_m, i) => (n >> i) & 1));

/** The lists a mix of modules brings. */
const listsOf = (mix: readonly string[]): Set<string> =>
  new Set(mix.flatMap((m) => (moduleManifest(m)?.provides ?? []).flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []))));

/** Whether a mix can go in on its own: every list one of its modules needs is brought by one of them. */
const standsAlone = (mix: readonly string[]): boolean => {
  const lists = listsOf(mix);
  return mix.every((m) => (moduleManifest(m)?.requires ?? []).every((r) => lists.has(r.replace(/^register\./u, ''))));
};

const bodies = (v: unknown): Body[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x)) : []);
const listIn = (v: unknown): string[] => (typeof v === 'string' && v.startsWith('register.') ? [v.slice('register.'.length)] : []);

/** Every list a document names, with where: what `@braindog/declare` checks at plan, and a block's own list and a page per row. */
function namedLists(doc: Body): { list: string; at: string }[] {
  const out: { list: string; at: string }[] = [];
  const add = (lists: readonly unknown[], at: string) => {
    for (const l of lists) if (typeof l === 'string' && l !== '') out.push({ list: l, at });
  };
  for (const d of bodies(doc.declarations)) {
    const id = String(d.register ?? d.page ?? d.metric ?? d.rule ?? d.ingest);
    for (const f of bodies(d.fields)) if (f.type === 'ref' || f.of === 'ref') add([f.to], `${id}.fields.${String(f.id)}`);
    add(Array.isArray(d.requires) ? (d.requires as unknown[]).flatMap(listIn) : [], `${id}.requires`);
    for (const [i, b] of bodies(d.blocks).entries()) add([...listIn(b.source), b.register], `${id}.blocks[${i}]`);
    if (typeof d.metric === 'string') add(listIn(d.source), `${id}.source`);
    if (d.for !== null && typeof d.for === 'object') add([(d.for as Body).register], `${id}.for`);
    if (typeof d.rule === 'string') add([d.register, ...bodies(d.then).concat(bodies(d.steps)).map((a) => (a.create as Body | undefined)?.register)], `${id}`);
  }
  for (const id of Object.keys((doc.extends as Body | undefined) ?? {})) add(listIn(id), `extends.${id}`);
  for (const a of bodies(doc.adds)) add(listIn((a.block as Body | undefined)?.source), `adds.${String(a.page)}`);
  return out;
}

const ownOf = (doc: Body): string[] => bodies(doc.declarations).flatMap((d) => (typeof d.register === 'string' ? [d.register] : []));

test('EVERY MIX OF EVERY USE CASE FITS: no part of the cut document names a list the record will not hold', () => {
  let mixes = 0;
  for (const u of USE_CASES) {
    const whole = carriedDocument(u, TODAY);
    if (!whole) continue;
    for (const mix of mixesOf(u.modules)) {
      mixes++;
      const holds = listsOf(mix);
      const doc = carriedDocument(u, TODAY, null, { holds })!;
      const held = new Set([...holds, ...ownOf(doc), 'session']);
      const absent = namedLists(doc).filter((n) => !held.has(n.list));
      assert.deepEqual(absent, [], `${u.usecase} with ${mix.join(', ') || 'no module'}`);
    }
  }
  assert.ok(mixes >= 40, `every mix was generated, got ${mixes}`);
});

test('EVERY MIX THAT CAN STAND ON ITS OWN INSTALLS: its modules, then the use case cut to what they hold', async () => {
  for (const u of USE_CASES) {
    for (const mix of mixesOf(u.modules).filter(standsAlone)) {
      const k = await openRecord(openSqlite(), fixedClock(NOW));
      const holds = listsOf(mix);
      /* EACH MODULE AS THE RECORD STANDS WHEN IT GOES IN, as onboarding installs them: a link to a list a later one brings
         waits for that one's update. */
      for (const m of u.modules.filter((x) => mix.includes(x))) {
        const now = new Set([...(k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length)), ...listsOf([m])]);
        const r = await put(k, moduleDocument(u, m, { today: TODAY, holds: now }));
        assert.ok(r.ok, `${u.usecase}: ${m} with ${mix.join(', ')}: ${r.refusal?.code} ${r.refusal?.fix}`);
      }
      const doc = carriedDocument(u, TODAY, null, { holds });
      if (!doc) continue;
      const r = await put(k, doc);
      assert.ok(r.ok, `${u.usecase} with ${mix.join(', ') || 'no module'}: ${r.refusal?.code} at ${r.refusal?.at}: ${r.refusal?.fix}`);
    }
  }
});

test('WHAT THE RECORD HOLDS IS KEPT: with every module in, the document is the whole one, and a block over a held list stays', () => {
  for (const u of USE_CASES) {
    const whole = carriedDocument(u, TODAY);
    if (!whole) continue;
    assert.deepEqual(carriedDocument(u, TODAY, null, { holds: listsOf(u.modules) }), whole, `${u.usecase} with all it names`);
  }
  /* Personal without Money: its goals are its own lists and every block over them stays; the budgets and the cash line go. */
  const personal = useCase('personal')!;
  const cut = carriedDocument(personal, TODAY, null, { holds: listsOf(['portfolio', 'people']) })!;
  const pageOf = (doc: Body, id: string) => bodies(doc.declarations).find((d) => d.page === id);
  const goals = pageOf(cut, 'goals')!;
  assert.deepEqual(goals, pageOf(carriedDocument(personal, TODAY)!, 'goals'), 'a page over its own lists is untouched');
  const home = pageOf(cut, 'home-personal')!;
  const sources = bodies(home.blocks).map((b) => b.source);
  assert.ok(sources.includes('register.goals') && sources.includes('register.things'), 'blocks over held lists stay');
  assert.ok(!sources.includes('register.categories'), 'the budgets go with Money');
  assert.ok(!bodies(home.blocks).some((b) => String(b.body ?? '').includes('{{cash-now}}')), "a line that says Money's figure goes");
  assert.ok(!(home.requires as string[]).includes('register.accounts') && (home.requires as string[]).includes('register.goals'));
});

test('A PAGE LEFT WITH NOTHING TO DRAW IS DROPPED, and a page per row of a list not held goes with the list', () => {
  const personal = useCase('personal')!;
  const pages = (doc: Body) => bodies(doc.declarations).flatMap((d) => (typeof d.page === 'string' ? [d.page] : []));
  assert.ok(pages(carriedDocument(personal, TODAY)!).includes('my-project'));
  assert.ok(!pages(carriedDocument(personal, TODAY, null, { holds: new Set() })!).includes('my-project'), 'no projects, no page per project');
  const doc = fitted(
    {
      pack: 'reading-club',
      declarations: [
        { register: 'meetings', fields: [{ id: 'what', type: 'text' }] },
        { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'note', lead: true, body: 'What we read' }, { kind: 'table', source: 'register.library' }] },
        { page: 'met', title: 'Met', requires: ['register.meetings', 'register.library'], blocks: [{ kind: 'table', source: 'register.meetings' }, { kind: 'cards', source: 'register.library' }] },
      ],
    },
    new Set(),
  );
  assert.deepEqual(pages(doc), ['met'], 'a page left with its heading alone is dropped');
  const met = bodies(doc.declarations).find((d) => d.page === 'met')!;
  assert.deepEqual(met.requires, ['register.meetings']);
  assert.deepEqual(bodies(met.blocks).map((b) => b.source), ['register.meetings']);
});

test('A PART THAT SAYS when: { holds } IS LEFT TO THE PLAN, and no holds means no change', () => {
  const waiting = { kind: 'table', source: 'register.library', when: { holds: ['library'] } };
  const doc = fitted(
    {
      pack: 'reading-club',
      declarations: [
        { register: 'meetings', fields: [{ id: 'what', type: 'text' }, { id: 'book', type: 'ref', to: 'library', when: { holds: ['library'] } }] },
        { page: 'met', title: 'Met', requires: ['register.meetings'], blocks: [{ kind: 'table', source: 'register.meetings' }, waiting] },
        { page: 'shelf', title: 'Shelf', when: { holds: ['library'] }, requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library' }] },
      ],
    },
    new Set(),
  );
  const decls = bodies(doc.declarations);
  assert.deepEqual(bodies(decls.find((d) => d.page === 'met')!.blocks)[1], waiting);
  assert.ok(decls.some((d) => d.page === 'shelf'), 'a page that waits is the plan to settle');
  assert.equal(bodies(decls.find((d) => d.register === 'meetings')!.fields).length, 2, 'a field that waits stays');

  for (const u of USE_CASES) {
    const today = useCaseDocument(u.usecase, TODAY);
    assert.equal(JSON.stringify(carriedDocument(u, TODAY)), JSON.stringify(today ? withoutRows(today) : null), `${u.usecase} with no holds`);
  }
});

test('A LINK TO A LIST NOT HELD GOES, with its columns, its filter, the figure asked of it and the note that says that figure', () => {
  const doc = fitted(
    {
      pack: 'reading-club',
      declarations: [
        { register: 'meetings', fields: [{ id: 'what', type: 'text' }, { id: 'book', type: 'ref', to: 'library' }], mobile: ['what', 'book'] },
        { metric: 'meetings-held', source: 'register.meetings', value: { count: 'id' } },
        { metric: 'meetings-on-a-book', source: 'register.meetings', where: 'book is set', value: { count: 'id' } },
        {
          page: 'met',
          title: 'Met',
          requires: ['register.meetings'],
          filters: [{ field: 'book' }],
          blocks: [
            { kind: 'note', lead: true, body: '{{meetings-held}} meeting(s), {{meetings-on-a-book}} on a book' },
            { kind: 'note', body: '{{meetings-held}} meeting(s)' },
            { kind: 'table', source: 'register.meetings', columns: [{ field: 'what' }, { field: 'book' }] },
            { kind: 'bar', source: 'register.meetings', columns: [{ field: 'book' }, { field: 'what' }] },
            { kind: 'table', source: 'register.meetings', where: 'book is set' },
            { kind: 'stat', cells: [{ metric: 'meetings-held' }, { metric: 'meetings-on-a-book' }] },
          ],
        },
      ],
      seeds: [{ register: 'meetings', fields: { what: 'First meeting', book: 'Middlemarch' } }],
    },
    new Set(),
  );
  const decls = bodies(doc.declarations);
  const list = decls.find((d) => d.register === 'meetings')!;
  assert.deepEqual(bodies(list.fields).map((f) => f.id), ['what']);
  assert.deepEqual(list.mobile, ['what']);
  assert.deepEqual(decls.flatMap((d) => (typeof d.metric === 'string' ? [d.metric] : [])), ['meetings-held'], 'the figure asked of the link goes');
  const met = decls.find((d) => d.page === 'met')!;
  assert.equal(met.filters, undefined, 'the filter on the link goes');
  assert.deepEqual(bodies(met.blocks), [
    { kind: 'note', body: '{{meetings-held}} meeting(s)' },
    { kind: 'table', source: 'register.meetings', columns: [{ field: 'what' }] },
    { kind: 'stat', cells: [{ metric: 'meetings-held' }] },
  ]);
  assert.deepEqual(doc.seeds, [{ register: 'meetings', fields: { what: 'First meeting' } }]);
});
