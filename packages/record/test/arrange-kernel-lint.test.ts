/**
 * What `propose` files is what the kernel will stage, when the kernel is the one refusing (`declare`'s `stagedBatch`,
 * and the kernel's `lint` over the record `plannedState` leaves, are what this reads).
 *
 * THE ARRANGER ASKED `installFault`, WHICH READS THE DIFF, AND STOPPED THERE. Every refusal `declare` can read off a
 * plan was asked; none of the ones the kernel's `validate` makes at `host.stage` was, since `kernel.lint` ran only
 * inside `if (pages.length > 0)`. Measured on an earlier tree:
 *
 *     fxer (keyless fx) on, then {install: rater}      filed   accept DECLARATION_INVALID at rates:
 *     one arrangement, fxer and rater                  filed   accept DECLARATION_INVALID ... Already applied, and kept: fxer.
 *     one arrangement, two packs declaring scopes:     filed   accept DECLARATION_INVALID ... Already applied, and kept: one.
 *     the same two, with one page                      refused at body.pages, blaming a page nobody wrote wrong
 *
 * The last test holds the other side: the lint reads the record as the packs before leave it, so a list an earlier
 * update retires is not held against the pack after it, as a lint over the live record would.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = (r: Out): string => (r.ok ? 'filed' : `${r.refusal?.code} at ${r.refusal?.at}: ${r.refusal?.fix}`);

const head = (pack: string, version: string) => ({ pack, version, summary: `${pack}.`, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } });
const RATE_FIELDS = [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
];
const NOTES = (pack: string) => ({ register: 'notes', name: 'Notes', title: 'what', pack, fields: [{ id: 'what', type: 'text', required: true }] });
/** A money pack of the older shape, whose `fx` holds rates and says nothing about it; at 2.0.0 it has dropped `fx`. */
const FXER = (version: string) => ({
  ...head('fxer', version),
  declarations: version === '1.0.0' ? [{ register: 'fx', name: 'FX', title: 'currency', pack: 'fxer', fields: RATE_FIELDS }, NOTES('fxer')] : [NOTES('fxer')],
});
const RATER = {
  ...head('rater', '1.0.0'),
  declarations: [{ register: 'rates', name: 'Rates', title: 'currency', pack: 'rater', rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' }, fields: RATE_FIELDS }],
};
const SCOPED = (pack: string, id: string) => ({
  ...head(pack, '1.0.0'),
  declarations: [{ register: id, name: id, title: 'name', pack, scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] }],
});

async function recordOf(offered: Record<string, unknown>) {
  const catalogue: CatalogueEntry[] = Object.keys(offered).map((id) => ({ id, kind: 'pack', title: id, summary: id, modules: [], doc: () => offered[id] as never }));
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)), catalogue });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 's', name: 'S', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } });
  const ask = async (body: Record<string, unknown>, kind = 'pack'): Promise<Out> => (await api.propose({ question: 'Take it?', body_kind: kind, body } as never, owner)) as Out;
  const accept = async (filed: Out): Promise<Out> => (await api.decide({ id: (filed.value as { id: string }).id, decide: { option: 'accept', reason: 'x' } } as never, owner)) as Out;
  const packs = () => api.kernel.packs().map((p) => `${p.id} ${p.version}`).sort();
  return { sql, ask, accept, packs, offered, kernel: api.kernel };
}

test('TWO PACKS THAT EACH DECLARE scopes: ARE REFUSED AT THE PROPOSAL, at body.packs, and nothing is filed', async () => {
  const { sql, ask } = await recordOf({ one: SCOPED('one', 'things'), two: SCOPED('two', 'jobs') });
  const out = await ask({ why: ['x'], packs: { install: ['one', 'two'] } }, 'arrange');
  sql.close();
  assert.equal(out.ok, false, 'filed an arrangement whose second pack the kernel refuses at the accept, after installing the first');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.match(out.refusal?.fix ?? '', /already declares scopes:/u, 'the kernel\'s own sentence');
});

test('WITH A PAGE BESIDE THEM THE FAULT IS STILL THE PACKS\', not the page nobody wrote wrong', async () => {
  const { sql, ask } = await recordOf({ one: SCOPED('one', 'things'), two: SCOPED('two', 'jobs') });
  const page = { id: 'page.p', body: { page: 'p', title: 'P', blocks: [] } };
  const out = await ask({ why: ['x'], packs: { install: ['one', 'two'] }, pages: [page] }, 'arrange');
  sql.close();
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
});

test('A PAGE THAT IS WRONG IS STILL NAMED AT body.pages', async () => {
  const { sql, ask } = await recordOf({ one: SCOPED('one', 'things') });
  const page = { id: 'page.p', body: { page: 'p', title: 'P', requires: ['register.nowhere'], blocks: [{ kind: 'table', source: 'register.nowhere', span: 12, empty: 'None.' }] } };
  const out = await ask({ why: ['x'], packs: { install: ['one'] }, pages: [page] }, 'arrange');
  sql.close();
  assert.equal(out.ok, false, 'filed a page over a list nothing declares');
  assert.match(out.refusal?.at ?? '', /^body\.pages/u, said(out));
});

/* A PAGE'S `where` AND A COLUMN'S `sign:` ARE READ BY THE KERNEL'S `unreadable`, NOT BY `validate`. With the pages
   asked of `validate` alone, both of these were filed, and the accept installed `one` and answered "page.p.blocks[0]
   cannot be read: nosuch is x: things has no field called nosuch. Already applied, and kept: one." `kernel.lint` over
   the packs and the pages, as it was before, refused both at `body.pages`. Measured against a list arriving in the same
   arrangement and against one already installed, with the same answers. */
const ONE = {
  ...head('one', '1.0.0'),
  declarations: [{ register: 'things', name: 'Things', title: 'name', pack: 'one', fields: [{ id: 'name', type: 'text', required: true }, { id: 'amount', type: 'decimal' }] }],
};
const UNREAD = [
  ['a where: over a field the list lacks', { page: 'p', title: 'P', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', where: 'nosuch is x', span: 12, empty: 'None.' }] }],
  ['a sign: over a field that is not an enum', { page: 'p', title: 'P', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'amount', sign: { field: 'name', minus: 'x' } }], span: 12, empty: 'None.' }] }],
] as const;
for (const [what, body] of UNREAD)
  test(`A PAGE WITH ${what.toUpperCase()} IS REFUSED AT body.pages, and the pack beside it is not installed`, async () => {
    const { sql, ask, packs } = await recordOf({ one: ONE });
    const out = await ask({ why: ['x'], packs: { install: ['one'] }, pages: [{ id: 'page.p', body }] }, 'arrange');
    const after = packs();
    sql.close();
    assert.equal(out.ok, false, 'filed a page the accept refuses after installing the pack beside it');
    assert.match(out.refusal?.at ?? '', /^body\.pages/u, said(out));
    assert.deepEqual(after, []);
  });

test('a page whose where: reads a field the arriving list declares is filed', async () => {
  const { sql, ask, accept, packs } = await recordOf({ one: ONE });
  const page = { id: 'page.p', body: { page: 'p', title: 'P', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', where: 'name is x', span: 12, empty: 'None.' }] } };
  const filed = await ask({ why: ['x'], packs: { install: ['one'] }, pages: [page] }, 'arrange');
  assert.ok(filed.ok, said(filed));
  const done = await accept(filed);
  const after = packs();
  sql.close();
  assert.ok(done.ok, said(done));
  assert.deepEqual(after, ['one 1.0.0']);
});

test('A PAGE OVER A LIST WHOSE LIVE TWIN AN EARLIER UPDATE RETIRES IS STILL FILED, and installs', async () => {
  const { sql, ask, accept, packs, offered } = await recordOf({ fxer: FXER('1.0.0'), rater: RATER });
  assert.ok((await accept(await ask({ install: 'fxer' }))).ok);
  offered.fxer = FXER('2.0.0');
  const page = { id: 'page.r', body: { page: 'r', title: 'R', requires: ['register.rates'], blocks: [{ kind: 'table', source: 'register.rates', where: 'currency is EUR', span: 12, empty: 'None.' }] } };
  const filed = await ask({ why: ['x'], packs: { install: ['fxer', 'rater'] }, pages: [page] }, 'arrange');
  assert.ok(filed.ok, said(filed));
  const done = await accept(filed);
  const after = packs();
  sql.close();
  assert.ok(done.ok, said(done));
  assert.deepEqual(after, ['fxer 2.0.0', 'rater 1.0.0']);
});

test('A PACK PROPOSAL THE KERNEL WOULD REFUSE IS REFUSED WHEN IT IS FILED: rates: beside a keyless fx of the same shape', async () => {
  const { sql, ask, accept, packs } = await recordOf({ fxer: FXER('1.0.0'), rater: RATER });
  const first = await ask({ install: 'fxer' });
  assert.ok((await accept(first)).ok);
  const out = await ask({ install: 'rater' });
  const after = packs();
  sql.close();
  assert.equal(out.ok, false, 'filed {install: rater}, which the accept refuses at rates:');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.deepEqual(after, ['fxer 1.0.0']);
});

test('ONE ARRANGEMENT OF fxer AND rater ON AN EMPTY RECORD IS REFUSED, rather than installing fxer and stopping', async () => {
  const { sql, ask, packs } = await recordOf({ fxer: FXER('1.0.0'), rater: RATER });
  const out = await ask({ why: ['x'], packs: { install: ['fxer', 'rater'] } }, 'arrange');
  const after = packs();
  sql.close();
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.deepEqual(after, []);
});

test('A LIST AN EARLIER UPDATE IN THE ARRANGEMENT RETIRES IS NOT HELD AGAINST THE PACK AFTER IT, and both install', async () => {
  const { sql, ask, accept, packs, offered } = await recordOf({ fxer: FXER('1.0.0'), rater: RATER });
  assert.ok((await accept(await ask({ install: 'fxer' }))).ok);
  offered.fxer = FXER('2.0.0');
  const filed = await ask({ why: ['x'], packs: { install: ['fxer', 'rater'] } }, 'arrange');
  assert.ok(filed.ok, said(filed));
  const done = await accept(filed);
  const after = packs();
  sql.close();
  assert.ok(done.ok, said(done));
  assert.deepEqual(after, ['fxer 2.0.0', 'rater 1.0.0']);
});

/* ─── WHAT `validate` ALONE LET THROUGH ───

   AN EARLIER `stagedFault` ASKED THE PLANNED RECORD `validate` AND NOTHING ELSE, and that left out the rest of what
   `stageInstall` asks: `unreadable`, `unserved`, `stranded`, `tagsNarrowed`, `taggingRefused`, `doorsKept` and a
   disabled pack. Five arrangements were filed on that tree that the accept refused, after installing whatever came
   before the one it refused:

       jobsy 2.0.0 narrowing tags under a live rule.late       filed   accept FIELD_TYPE_CHANGED at register.jobs.fields.tags.type
       jobsy (tags: int), then later's rule.late tagging it     filed   accept FIELD_TYPE_CHANGED ... Already applied, and kept: jobsy.
       one's Things, then two's page filtering it on nosuch     filed   accept FIELD_UNKNOWN ... Already applied, and kept: one.
       a rule asking Slash, on a host that answers none         filed   accept NOT_IN_THIS_BUILD at steps[0].ask_slash
       fxer 2.0.0 and rater, with a page over rates on nosuch   filed   accept FIELD_UNKNOWN ... Already applied, and kept: fxer, rater.

   The last is the page half: the lists a page read were linted alone against the live record, which still held the `fx`
   fxer 2.0.0 retires, so the page was asked `validate` alone and its `where:` never.

   NO DISABLED PACK REACHED THE ACCEPT, and there is no test of one here. Measured: with `one` off and 1.1.0 offered, both
   `{install: one}` and an arrangement installing it were filed as turning `one` on, since `expand` sends a pack that is
   off to `enable` and never plans an update over it. The lint still asks, from the table, as `stageInstall` does. */
const headed = (pack: string, version: string, packs: Record<string, string>) => ({ ...head(pack, version), requires: { format: 1, primitives: 1, packs } });
const JOBS = (pack: string, ...more: object[]) => ({ register: 'jobs', name: 'Jobs', title: 'what', pack, fields: [{ id: 'what', type: 'text', required: true }, ...more] });

const LATE = (pack?: string) => ({ rule: 'late', register: 'jobs', when: 'what is Rent', then: [{ tag: 'late' }], ...(pack === undefined ? {} : { pack }) });
const ENUM_TAGS = { id: 'tags', type: 'list', of: 'enum', values: ['chase'] };

test('A PACK NARROWING tags UNDER A RULE THE RECORD HOLDS IS REFUSED AT THE PROPOSAL, and stays at its version', async () => {
  const { sql, ask, accept, packs, offered, kernel } = await recordOf({ jobsy: { ...head('jobsy', '1.0.0'), declarations: [JOBS('jobsy')] } });
  assert.ok((await accept(await ask({ install: 'jobsy' }))).ok);
  const rule = await kernel.install([{ id: 'rule.late', kind: 'rule', body: LATE() }] as never);
  assert.ok(rule.ok);
  offered.jobsy = { ...head('jobsy', '2.0.0'), declarations: [JOBS('jobsy', ENUM_TAGS)] };
  const out = await ask({ why: ['x'], packs: { install: ['jobsy'] } }, 'arrange');
  const after = packs();
  sql.close();
  assert.equal(out.ok, false, 'filed an update whose tags refuse every write rule.late tags, which the accept refuses');
  assert.equal(out.refusal?.code, 'FIELD_TYPE_CHANGED', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.match(out.refusal?.fix ?? '', /rule\.late tags jobs late/u, said(out));
  assert.deepEqual(after, ['jobsy 1.0.0']);
});

test('A PACK WHOSE RULE TAGS A LIST THE PACK BEFORE IT TYPES int IS REFUSED, rather than installing that pack and stopping', async () => {
  const { sql, ask, packs } = await recordOf({
    jobsy: { ...head('jobsy', '1.0.0'), declarations: [JOBS('jobsy', { id: 'tags', type: 'int' })] },
    later: { ...headed('later', '1.0.0', { jobsy: '^1.0.0' }), declarations: [LATE('later')] },
  });
  const out = await ask({ why: ['x'], packs: { install: ['jobsy', 'later'] } }, 'arrange');
  const after = packs();
  sql.close();
  assert.equal(out.ok, false, 'filed later, whose rule the accept refuses after installing jobsy');
  assert.equal(out.refusal?.code, 'FIELD_TYPE_CHANGED', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.deepEqual(after, []);
});

test('A PACK\'S PAGE FILTERING A LIST THE PACK BEFORE IT DECLARES, ON A FIELD IT LACKS, IS REFUSED AT body.packs', async () => {
  const page = { page: 'p', title: 'P', pack: 'two', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', where: 'nosuch is x', span: 12, empty: 'None.' }] };
  const { sql, ask, packs } = await recordOf({ one: ONE, two: { ...headed('two', '1.0.0', { one: '^1.0.0' }), declarations: [page] } });
  const out = await ask({ why: ['x'], packs: { install: ['one', 'two'] } }, 'arrange');
  const after = packs();
  sql.close();
  assert.equal(out.ok, false, 'filed two, whose page the accept refuses after installing one');
  assert.equal(out.refusal?.code, 'FIELD_UNKNOWN', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
  assert.match(out.refusal?.fix ?? '', /things has no field called nosuch/u, said(out));
  assert.deepEqual(after, []);
});

test('A PACK WHOSE RULE ASKS SLASH, ON A HOST THAT ANSWERS NONE, IS REFUSED AT THE PROPOSAL', async () => {
  const ask_slash = { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' };
  const rule = { rule: 'rate', pack: 'one', on: { written: { register: 'jobs', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash }, { notify: { say: 'Rate: {{vars.rate}}' } }] };
  const { sql, ask } = await recordOf({ one: { ...head('one', '1.0.0'), declarations: [JOBS('one'), rule] } });
  const out = await ask({ why: ['x'], packs: { install: ['one'] } }, 'arrange');
  sql.close();
  assert.equal(out.refusal?.code, 'NOT_IN_THIS_BUILD', said(out));
  assert.equal(out.refusal?.at, 'body.packs', said(out));
});

test('A PAGE OVER A LIST WHOSE LIVE TWIN AN EARLIER UPDATE RETIRES IS STILL READ WHOLE: a where: on nosuch is refused', async () => {
  const { sql, ask, accept, packs, offered } = await recordOf({ fxer: FXER('1.0.0'), rater: RATER });
  assert.ok((await accept(await ask({ install: 'fxer' }))).ok);
  offered.fxer = FXER('2.0.0');
  const page = { id: 'page.r', body: { page: 'r', title: 'R', requires: ['register.rates'], blocks: [{ kind: 'table', source: 'register.rates', where: 'nosuch is EUR', span: 12, empty: 'None.' }] } };
  const out = await ask({ why: ['x'], packs: { install: ['fxer', 'rater'] }, pages: [page] }, 'arrange');
  const after = packs();
  sql.close();
  assert.equal(out.ok, false, 'filed a page the accept refuses after installing fxer 2.0.0 and rater');
  assert.equal(out.refusal?.code, 'FIELD_UNKNOWN', said(out));
  assert.match(out.refusal?.at ?? '', /^body\.pages/u, said(out));
  assert.deepEqual(after, ['fxer 1.0.0']);
});
