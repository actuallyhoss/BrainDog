/**
 * What `arrangement` says about an update, against what `propose` then does with it.
 *
 * THE TWO DISAGREED. `arrangement` listed every declaration the owner had changed as `keeps` from the record's history
 * alone, without planning the update. On a record whose owner renamed `register.fx` "My rates", with a money-core 1.7.0
 * on offer that adds a `spread` field to fx and a figure summing it, `arrangement` answered
 * `{ id: 'money-core', from: '1.6.0', to: '1.7.0', keeps: ['register.fx'] }` (measured when 1.6.0 was current), and
 * `propose` for the same update was
 * refused `PROVIDES_CONFLICT`: "changes your My rates list, which you changed". An agent reading the first was told an
 * update was fine that the second would refuse.
 *
 * SO `arrangement` PLANS EACH UPDATE IT OFFERS, the way `propose` does, and says the refusal where there is one. The
 * record is built through `planPack` and `installPack` rather than `installSeed`, because the seed writes its
 * declarations with no pack behind them, and a record with no money-core version has no update to offer.
 *
 * THE VERSIONS ARE READ, NOT WRITTEN. The record is on whatever `FIRST_PARTY_VERSIONS` says money-core is, and the update
 * on offer is the minor step above it, so raising money-core does not turn these tests red for a reason that is not theirs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../../seed/src/index.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';
import { notesKept, textKept, textShort, type KeptRow } from '../src/arrange-keeps.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(x).slice(0, 300)}`);
  return x.refusal!;
};

type Doc = { version: string; declarations: Record<string, unknown>[] };
type Diff = { planHash: string; approve: string[] };
type Update = { id: string; from: string; to: string; keeps?: string[]; refused?: { code: string; fix: string } };

/** The version every first-party install below puts money-core on, and the minor step above it that is offered. */
const CURRENT = FIRST_PARTY_VERSIONS['money-core'];
const [major, minor] = CURRENT.split('.').map(Number) as [number, number];
const NEXT = `${major}.${minor + 1}.0`;

/** The next money-core on offer, built from the first-party document by `change`. */
const offering = (doc: Doc) => seedCatalogue().map((e) => (e.id === 'money-core' ? { ...e, version: doc.version, doc: () => structuredClone(doc) as never } : e));
const next = (change: (d: Doc) => void): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = NEXT;
  change(d);
  return d;
};

/** Every first-party pack installed as the owner, then `register.fx` renamed "My rates" through `setDeclaration`. */
async function renamedRates(doc: Doc) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)), catalogue: offering(doc) });
  for (const id of FIRST_PARTY) {
    const pack = firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc: pack, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc: pack, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  const r = api.kernel.declarations().find((x) => x.id === 'register.fx')!;
  said(await api.setDeclaration({ body: { register: 'fx', ...(JSON.parse(r.body) as object), name: 'My rates' }, version: r.version } as never, owner));
  return { sql, api };
}

test('an update that changes a list the owner changed is said as refused, in the sentence propose refuses it with', async () => {
  const { sql, api } = await renamedRates(
    next((d) => {
      const fx = d.declarations.find((x) => x.register === 'fx' && !x.rule && !x.metric)! as { fields: unknown[] };
      fx.fields.push({ id: 'spread', type: 'decimal' });
      d.declarations.push({ metric: 'fx-spread', name: 'Spread', source: 'register.fx', value: { sum: 'spread' }, format: 'decimal', target: { lte: 100 }, window: '30d', compare: 'previous' });
    }),
  );
  const filed = refused(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  assert.equal(filed.code, 'PROVIDES_CONFLICT');

  const ar = said<{ updates?: Update[] }>(await api.arrangement({}, agent));
  const update = ar.updates?.find((u) => u.id === 'money-core');
  assert.ok(update, 'the update is no longer offered at all, and an agent is not told why');
  assert.equal(update.keeps, undefined, 'arrangement says the update keeps a list propose will refuse it for');
  assert.deepEqual(update.refused, { code: filed.code, fix: filed.fix });
  assert.match(update.refused.fix, /changes your My rates list, which you changed/u);
  sql.close();
});

/* PLANNED ALONE, AN UPDATE THAT READS WHAT ITS MODULE'S UPDATE ADDS WAS SAID AS REFUSED. `propose` expands money-core
   to portfolio's update first and files it; `arrangement` planned money-core by itself against a record without the new
   list and said `REGISTER_UNRESOLVED`. Measured, and red against `planAll([p.id])`. */
test('an update that reads a list its module update adds is offered, as propose files it', async () => {
  /* PORTFOLIO'S OWN NEXT, THE SAME WAY MONEY-CORE'S IS BUILT (`CURRENT`/`NEXT` above), and never the version it is
     already on. This test wrote a bare `'1.5.0'` while that was still portfolio's next minor over its installed
     version; once `FIRST_PARTY_VERSIONS['portfolio']` itself reached 1.5.0 the literal named the version already
     installed, so `updateOf` saw no update to offer, `expand` never added portfolio to the install, and the extra
     list this test means to add was never there for money-core to read: refused `REGISTER_UNRESOLVED` for a reason
     that was never money-core's. */
  const portfolioCurrent = FIRST_PARTY_VERSIONS['portfolio'];
  const [portfolioMajor, portfolioMinor] = portfolioCurrent.split('.').map(Number) as [number, number];
  const portfolioNext = `${portfolioMajor}.${portfolioMinor + 1}.0`;
  const portfolio = structuredClone(firstPartyDocument('portfolio')) as unknown as Doc;
  portfolio.version = portfolioNext;
  const { scopes: _scopes, ...list } = structuredClone(portfolio.declarations.find((x) => x.register === 'things')!);
  portfolio.declarations.push({ ...list, register: 'extra', name: 'Extra' });
  /* A METRIC THE KERNEL TAKES, since the arranger now asks it: this one said `value: 'count'` and no target, and was
     filed only because nothing linted it until the accept. `scopes` is dropped from the clone for the same reason. */
  const money = next((d) => {
    d.declarations.push({ metric: 'extra-count', name: 'Extra count', source: 'register.extra', value: { count: 'id' }, format: 'int', target: { gte: 1 }, window: '30d', compare: 'none' });
  });
  const sql = openSqlite();
  /* MONEY NAMES PORTFOLIO AS ITS MODULE HERE: the shipped Money stands alone now, and it is a module's update `expand` brings along. */
  const catalogue = offering(money).map((e) =>
    e.id === 'portfolio' ? { ...e, version: portfolioNext, doc: () => structuredClone(portfolio) as never } : e.id === 'money-core' ? { ...e, modules: ['portfolio'] } : e,
  );
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)), catalogue });
  for (const id of FIRST_PARTY) {
    const pack = firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc: pack, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc: pack, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  const ar = said<{ updates?: Update[] }>(await api.arrangement({}, agent));
  assert.deepEqual(ar.updates?.find((u) => u.id === 'money-core'), { id: 'money-core', from: CURRENT, to: NEXT });
  said(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  sql.close();
});

test('an update that leaves the changed list as the pack wrote it still says it keeps the list, and propose files it', async () => {
  const { sql, api } = await renamedRates(next(() => undefined));
  const ar = said<{ updates?: Update[] }>(await api.arrangement({}, agent));
  assert.deepEqual(ar.updates, [{ id: 'money-core', from: CURRENT, to: NEXT, keeps: ['register.fx'] }]);
  said(await api.propose({ question: 'Update money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  sql.close();
});

/* ── a note written again keeps its text ─────────────────── */

const NOTE = 'A type family for screens.\n\nStage: building\n\nBlockers:\n- the italic is not drawn\n\nPlan:\n1. Draw the italic (so it ships)\n2. Hint it\n\nThe revenue is {{revenue.monthly}}.';

test('a note written again keeps every character, in the new note or in what was lifted out of it', () => {
  const after = 'Stage: building\n\nBlockers:\n\nPlan:\n\nThe revenue is `{{revenue.monthly}}`.';
  const moved = ['A type family for screens.', ['the italic is not drawn'], { what: '1. Draw the italic', gain: '(so it ships)' }, { what: '2. Hint it' }];
  assert.equal(textKept(NOTE, after, moved), true);
  /* SPACE IS NOT TEXT: blank lines tidied away cost nothing. */
  assert.equal(textKept(NOTE, after.replace(/\n+/gu, ' '), moved), true);
  /* A STEP DROPPED IS TEXT LOST, by its own length, less the one character the code span's two backticks gave over the
     list's dash the rewrite dropped. */
  assert.equal(textKept(NOTE, after, moved.slice(0, 3)), false);
  assert.equal(textShort(NOTE, after, moved.slice(0, 3)), [...'2.Hintit'].length - 1);
  /* BY CHARACTER, so a note in another script is measured as it reads. */
  assert.equal(textKept('\u{1F600}\u{1F600}', '\u{1F600}', ['\u{1F600}']), true);
});

const TYPES = new Map([
  ['things', new Map([['name', 'text'], ['about', 'text'], ['note', 'document'], ['blockers', 'list'], ['lane', 'enum']])],
  ['plan_steps', new Map([['what', 'text'], ['gain', 'text'], ['thing', 'ref']])],
]);
const types = (register: string) => TYPES.get(register) ?? new Map<string, string>();
const pointsAt = (r: KeptRow, at: string) => r.fields?.thing === at;
const named = (r: KeptRow) => `${String(r.before?.name)} in Projects`;

test('an arrangement that rewrites a note and loses text is caught, by the entry and in words; one that keeps it is not', () => {
  const change = (note: string, patch: Record<string, unknown> = {}): KeptRow => ({
    register: 'things',
    at: 'things#1',
    before: { name: 'Typeface', note: NOTE },
    patch: { note, about: 'A type family for screens.', blockers: ['the italic is not drawn'], ...patch },
  });
  const steps: KeptRow[] = [
    { register: 'plan_steps', fields: { what: '1. Draw the italic', gain: '(so it ships)', thing: 'things#1' } },
    { register: 'plan_steps', fields: { what: '2. Hint it', thing: 'things#1' } },
  ];
  const kept = 'Stage: building\n\nBlockers:\n\nPlan:\n\nThe revenue is `{{revenue.monthly}}`.';
  assert.equal(notesKept([change(kept), ...steps], types, pointsAt, named), null);
  /* A STEP NOT FILED, and a lane moved beside it, which is no text and pays for nothing. */
  const lost = notesKept([change(kept, { lane: 'parked parked parked' }), steps[0]!], types, pointsAt, named);
  assert.equal(lost?.at, 0);
  assert.equal(lost?.fix, 'The new text of Typeface in Projects leaves out 7 characters of the old one that no field here takes. Keep every word of the old text, in the text or in the fields it moves to.');
  assert.ok(!/\brow\b|\u2014/u.test(lost!.fix));
  /* A NOTE NOT TOUCHED, or one that was empty, is no rewrite. */
  assert.equal(notesKept([{ register: 'things', at: 'things#1', before: { note: NOTE }, patch: { lane: 'parked' } }], types, pointsAt, named), null);
  assert.equal(notesKept([{ register: 'things', at: 'things#1', before: { note: '' }, patch: { note: 'New.' } }], types, pointsAt, named), null);
});

test('A PROPOSAL WHOSE NOTE REWRITE LOSES WORDS IS REFUSED BY PROPOSE ITSELF, at the entry (skills-49); one that keeps them is filed', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)), catalogue: seedCatalogue() });
  for (const id of FIRST_PARTY) {
    const pack = firstPartyDocument(id);
    const planned = said<{ diff: Diff }>(await api.planPack({ doc: pack, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc: pack, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  }
  const made = said<{ id: string; version: number }>(await api.create({ register: 'things', fields: { name: 'Typeface', lane: 'building', note: NOTE } } as never, owner));
  const at = api.kernel.nameOf(made.id);
  const ask = (note: string) =>
    api.propose({ question: 'Tidy the note?', body_kind: 'arrange', body: { why: ['A shorter note.'], rows: [{ register: 'things', at, version: made.version, patch: { note } }] } } as never, owner);
  const lost = refused(await ask('Short.'));
  assert.equal(lost.code, 'VALUE_MALFORMED');
  assert.match(lost.fix, /^The new text of Typeface in Projects leaves out \d+ characters of the old one/u);
  said(await ask(`${NOTE}\n\nMore.`));
});
