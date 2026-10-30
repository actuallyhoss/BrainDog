/**
 * The record reads its own words (PGS-B15 job a): one case a kind of fault, the nearest name, the one sentence and its
 * nought, then the read `textFaults` over a real in-memory record with a placeholder planted in a note and a broken
 * fence on a page, and a reader held to one list told nothing of another.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import { parse } from 'braindog-render';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { nearest, textFaultLine, textFaults, type TextFault, type TextNames, type TextPart } from '../src/text-check.ts';
import { keepTextFaults, methods, type TextFaultsRead } from '../src/methods/text-faults.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NAMES: TextNames = { all: ['revenue.monthly', 'projects', 'projects.count', 'projects.live', 'status'], figures: ['status'], states: { projects: ['live'] } };

/** The faults of one part on one page called Home. */
const of = (part: Omit<TextPart, 'name'>, names: TextNames = NAMES): TextFault[] => textFaults([{ title: 'Home', parts: [{ name: 'Notes', ...part }] }], [], names).faults;
const kinds = (fs: readonly TextFault[]): string[] => fs.map((f) => f.kind);

test('A PATH THAT NAMES NOTHING is found with the nearest name that exists, and named by its page and part', () => {
  const [f, ...rest] = of({ text: 'We earn {{revenue.monthy}} and hold {{projects.count}}.' });
  assert.equal(rest.length, 0);
  assert.equal(f!.kind, 'names-nothing');
  assert.deepEqual(f!.where, { page: 'Home', name: 'Notes' });
  assert.equal(f!.said, '"{{revenue.monthy}}" names nothing in your BrainDog.');
  assert.match(f!.fix, /Write \{\{revenue\.monthly\}\}, the nearest name this BrainDog has/);
  /* THE KERNEL'S ANSWER WINS where it was given: a path it says names nothing is one, whatever the names hold. */
  assert.deepEqual(kinds(of({ text: '{{projects.count}}', unnamed: ['projects.count'] })), ['names-nothing']);
  /* A CODE SPAN IS TEXT, as the renderer lifts it first. */
  assert.deepEqual(of({ text: 'Kept as text: `{{revenue.monthy}}`.' }), []);
});

test('A TYPED VALUE THAT DOES NOT PARSE, and a form the dialect has not, are each found with the shape to write', () => {
  const found = of({ text: 'Paid {{money:129900 egp}} on {{day:2026-13-40}}, see {{entity:roomy}}, owed {{money:5000 EGP}}.' });
  assert.deepEqual(kinds(found), ['bad-value', 'bad-value', 'bad-value']);
  assert.match(found[0]!.fix, /three-letter code in capitals/);
  assert.match(found[1]!.fix, /2026-11-01/);
  assert.match(found[2]!.said, /is not a path or a typed value/);
});

test('A DEGRADED FENCE is found with the sentence the parser already writes', () => {
  const text = 'Before.\n\n```widget | Revenue\nJan | 4\n```\n';
  const [f] = of({ text });
  assert.equal(f!.kind, 'degraded');
  assert.equal(f!.said, 'The block "Revenue" is shown as written instead of drawn.');
  const seg = parse(text)[1]!;
  assert.equal(seg.type, 'degraded');
  assert.equal(f!.fix, (seg as { fix: string }).fix);
});

test('A BAR OF TYPED NUMBERS WITH NO DATE is found; a dated heading, a dated note after it, or a live path clears it', () => {
  assert.deepEqual(kinds(of({ text: '```bar | Revenue\nJan | 4\nFeb | 6\n```' })), ['undated-bar']);
  assert.deepEqual(of({ text: '```bar | Revenue, March 2026\nJan | 4\nFeb | 6\n```' }), []);
  assert.deepEqual(of({ text: '```bar | Revenue\nJan | 4\nFeb | 6\n```\n\nAs they stood on 2026-03-01.' }), []);
  assert.deepEqual(of({ text: '```bar | Revenue\nNow | {{revenue.monthly}}\nFeb | 6\n```' }), []);
});

test('A PATH TWO RULES MATCH is found: a field here that a figure is also called', () => {
  const found = of({ text: 'It is {{status}}.', own: ['status', 'name'] });
  assert.deepEqual(kinds(found), ['two-rules']);
  assert.match(found[0]!.said, /both a field here and a figure/);
  /* WITHOUT THE FIELD there is one reading, the figure's. */
  assert.deepEqual(of({ text: 'It is {{status}}.' }), []);
});

test('A PINNED NOTE OLDER THAN THIRTY DAYS is found, and a fresh one is not', () => {
  const found = of({ text: 'Plain words.', pinned: { days: 45 } });
  assert.deepEqual(kinds(found), ['old-pin']);
  assert.match(found[0]!.said, /45 days/);
  assert.deepEqual(of({ text: 'Plain words.', pinned: { days: 10 } }), []);
});

test('A PAGE WITH MORE THAN TWO RED PHRASES is found once for the page, over all its parts', () => {
  const red = (n: number) => Array.from({ length: n }, (_, i) => `{{bad:late ${i}}}`).join(' ');
  const page = (a: number, b: number) => textFaults([{ title: 'Home', parts: [{ name: 'One', text: red(a) }, { name: 'Two', text: red(b) }] }], [], NAMES).faults;
  assert.deepEqual(kinds(page(2, 1)), ['too-red']);
  assert.deepEqual(page(1, 1), []);
  assert.match(page(2, 1)[0]!.said, /^3 phrases here are in red\.$/);
});

test('THE NEAREST NAME is the closest spelling of the same words, and nothing when none is close', () => {
  assert.equal(nearest('effortDays', ['effort', 'effort_days', 'efforts']), 'effort_days');
  assert.equal(nearest('revenue.monthy', ['revenue.monthly', 'revenue.daily']), 'revenue.monthly');
  assert.equal(nearest('servers', ['revenue', 'projects']), null);
});

test('THE ONE SENTENCE says how many values on how many pages name nothing, and is empty at nought', () => {
  const nothing = (page: string): TextFault => ({ kind: 'names-nothing', where: { page, name: page }, said: '', fix: '' });
  const pages = ['A', 'B', 'C', 'D', 'E', 'F'];
  const faults = Array.from({ length: 14 }, (_, i) => nothing(pages[i % 6]!));
  assert.equal(textFaultLine({ faults, pages: 6 }), '14 values on 6 pages name nothing');
  assert.equal(textFaultLine({ faults: [nothing('A')], pages: 1 }), '1 value on 1 page names nothing');
  const other: TextFault = { kind: 'degraded', where: { page: 'B', name: 'B' }, said: '', fix: '' };
  assert.equal(textFaultLine({ faults: [nothing('A'), other], pages: 2 }), '1 value on 1 page names nothing, and 1 other fault needs fixing');
  assert.equal(textFaultLine({ faults: [other], pages: 1 }), '1 fault on 1 page needs fixing');
  assert.equal(textFaultLine({ faults: [], pages: 0 }), '');
  assert.deepEqual(textFaults([], [], NAMES), { faults: [], pages: 0 });
});

/* ── the read, over a real record ───────────────────────────────────────── */

const NOW = Date.UTC(2026, 9, 14, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['projects'] };
const link: CallContext = { principal: { kind: 'share', id: 'sh_1' } } as unknown as CallContext;

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const DECLS = [
  decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'note', type: 'document', label: 'Note' }] }),
  decl('register', 'ledger', { id: 'ledger', name: 'Ledger', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'memo', type: 'document', label: 'Memo' }] }),
  decl('page', 'overview', {
    page: 'overview',
    title: 'Overview',
    requires: ['register.projects'],
    blocks: [{ kind: 'note', heading: 'Lead', body: 'We hold {{projects.count}} projects.\n\n```widget | Revenue\nJan | 4\n```\n' }],
  }),
  decl('page', 'books', { page: 'books', title: 'Books', requires: ['register.ledger'], blocks: [{ kind: 'note', heading: 'Books', body: 'See {{ledger.count}} and {{ledger.nope}}.' }] }),
];

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  for (const [register, fields] of [
    ['projects', { name: 'Kiln', note: 'Earned {{revenue.monthly}} on {{projects.count}} projects, kept `{{as.text}}`.' }],
    ['ledger', { name: 'Spring books', memo: 'Owed {{ledger.owed}}.' }],
  ] as const) {
    const made = (await api.create({ register, fields }, owner)) as { ok: boolean };
    assert.ok(made.ok, JSON.stringify(made));
  }
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const deps = {
    kernel: api.kernel,
    sql,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('A link reads one page.') : null),
    readable: (ctx: CallContext, list: string) =>
      ctx.registers === undefined || ctx.registers === '*' || (ctx.registers as string[]).includes(list) ? null : refuse('Not one of yours.'),
    no,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  /* `night` IS THE WALK THE RECORD'S NIGHT PASS MAKES (`lintTick`): `textFaults` hands the owner what it kept. */
  return { sql, read: methods(deps), night: () => keepTextFaults(deps) };
}

const value = (out: Result<TextFaultsRead>): TextFaultsRead => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('THE READ FINDS THE PLANTED PLACEHOLDER IN A NOTE AND THE BROKEN FENCE ON A PAGE, by names, and writes nothing', async () => {
  const { sql, read, night } = await record();
  night();
  const changes = (): number => sql.one<{ n: number }>('SELECT total_changes() AS n')!.n;
  const before = changes();
  const got = value(await read.textFaults({}, owner));
  assert.equal(got.computedAt, new Date(NOW).toISOString());
  const note = got.faults.find((f) => f.kind === 'names-nothing' && f.where.row === 'Kiln');
  assert.ok(note, JSON.stringify(got.faults));
  assert.equal(note.where.list, 'Projects');
  assert.equal(note.where.field, 'Note');
  assert.equal(note.said, '"{{revenue.monthly}}" names nothing in your BrainDog.');
  const fence = got.faults.find((f) => f.kind === 'degraded');
  assert.ok(fence, JSON.stringify(got.faults));
  assert.deepEqual(fence.where, { page: 'Overview', name: 'Lead' });
  assert.match(fence.fix, /widget/);
  /* EACH FAULT CARRIES THE ADDRESS THE APP OPENS IT BY: a page's slug, or a document's list and number. */
  assert.deepEqual(fence.at, { slug: 'overview' });
  assert.deepEqual(note.at, { list: 'projects', seq: 1 });
  /* A PATH THAT NAMES SOMETHING, AND ONE IN A CODE SPAN, ARE NOT FAULTS. */
  assert.ok(!got.faults.some((f) => /projects\.count|as\.text/.test(f.said)), JSON.stringify(got.faults));
  assert.equal(got.count, got.faults.length);
  assert.equal(got.truncated, false);
  assert.match(got.line, /names? nothing/);
  /* NO ID in what a person reads. */
  assert.ok(!JSON.stringify(got).match(/[0-9A-HJKMNP-TV-Z]{26}|projects#|ledger#/), JSON.stringify(got));
  assert.equal(changes(), before);
  sql.close();
});

test('A READER WHO MAY NOT READ A LIST IS TOLD NOTHING OF IT, and a link reads nothing at all', async () => {
  const { sql, read, night } = await record();
  night();
  const all = value(await read.textFaults({}, owner));
  assert.ok(all.faults.some((f) => f.where.list === 'Ledger' || f.where.page === 'Books'), JSON.stringify(all.faults));
  /* THE NIGHT'S ANSWER NAMES THE LEDGER, SO IT IS NEVER HANDED TO HER: she is walked her own small budget. */
  const held = value(await read.textFaults({}, narrow));
  assert.ok(!JSON.stringify(held).match(/Ledger|Books|Spring books|ledger/), JSON.stringify(held));
  assert.ok(held.faults.some((f) => f.where.row === 'Kiln'), JSON.stringify(held.faults));
  const shut = await read.textFaults({}, link);
  assert.equal(shut.ok, false);
  const extra = await read.textFaults({ page: 'overview' }, owner);
  assert.equal(!extra.ok && 'refusal' in extra ? extra.refusal.code : 'ok', 'FIELD_UNKNOWN');
  sql.close();
});
