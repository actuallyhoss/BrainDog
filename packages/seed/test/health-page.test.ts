/**
 * Health: the record's vital signs as one declared page, drawn from the built-in source `signs` and the
 * built-in figures `signs-red` and `green-days`, and from nothing else.
 *
 * READ THROUGH THE KERNEL'S OWN `readPage`, over a host that hands it signs and two figures, so what is asserted is what
 * a screen draws: which line leads, which group each sign lands in, and that a sign with nothing to read is never under
 * Alive.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readPage, validateDeclaration, type BlockResult, type Declaration, type MetricDecl, type PageDeps } from '@braindog/kernel';
import { no, ok } from '@braindog/ports';

import { HEALTH_FIGURES, HEALTH_PAGES, HEALTH_SOURCE } from '../src/modules/health.ts';

const NOW = Date.UTC(2026, 9, 9, 7);
const PAGE = HEALTH_PAGES.health!;
const BLOCKS = PAGE.blocks as Record<string, unknown>[];

type Sign = { sign: string; name: string; state: 'green' | 'red' | 'none'; value: number | null; said: string; facts: string[]; days: [] };
const sign = (id: string, name: string, state: Sign['state'], said: string): Sign => ({ sign: id, name, state, value: null, said, facts: [], days: [] });

const RED = sign('arrivals-filed', 'Arrivals file by themselves', 'red', '7 bank texts have waited more than a day.');
const GREEN = sign('oldest-question', 'No question waits too long', 'green', 'The oldest question has waited 3 days.');
const NONE = sign('model-answers', 'The model answers', 'none', 'Nothing has been filed for this sign yet.');

/** A host that reads the page with these signs and these two figures, and nothing else: any other name is a refusal. */
function depsWith(signs: readonly Sign[], figures: Record<string, number | null>): PageDeps {
  return {
    pages: () => [PAGE as never],
    metric: (id) => (Object.hasOwn(figures, id) ? ({ metric: id, name: id, source: 'record.vitals', value: { count: 'id' } } as unknown as MetricDecl) : null),
    read: (decl) =>
      Object.hasOwn(figures, decl.metric)
        ? ok({ value: figures[decl.metric] ?? null, unit: null, rows: 0, refusals: [], delta: null, why: '', met: null } as never)
        : no('METRIC_UNKNOWN', `This test reads no figure called ${decl.metric}.`),
    list: () => no('SOURCE_UNKNOWN', 'Health reads no list.'),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    signs: () => signs,
  } as PageDeps;
}

function read(signs: readonly Sign[], figures: Record<string, number | null>): BlockResult[] {
  const out = readPage(depsWith(signs, figures), 'health');
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks;
}

const drawn = (blocks: readonly BlockResult[]): BlockResult[] => blocks.filter((b) => b.drawn !== false);
const leads = (blocks: readonly BlockResult[]): string[] => drawn(blocks).filter((b) => b.kind === 'note' && b.lead).map((b) => String((b as { body?: unknown }).body));
const under = (blocks: readonly BlockResult[], heading: string): string[] =>
  (blocks.find((b) => b.heading === heading)?.rows ?? []).map((r) => String(r.fields.name));

test('HEALTH BUILDS: one page, no list leaned on, and every block reads clean with no refusal', () => {
  assert.equal(PAGE.page, 'health');
  assert.equal(PAGE.title, 'Health');
  assert.equal(PAGE.requires, undefined, 'Health leans on no list, so every record can hold it');
  const blocks = read([RED, GREEN, NONE], { 'signs-red': 1, 'green-days': 4 });
  assert.equal(blocks.length, BLOCKS.length);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${String(b.heading ?? (b as { body?: unknown }).body)} reads clean`);
});

test('IT READS ONLY THE NAMES IT DECLARES: the signs source and its two figures', () => {
  const sources = new Set<string>();
  const figures = new Set<string>();
  for (const b of BLOCKS) {
    if (typeof b.source === 'string') sources.add(b.source);
    const when = b.when as { metric?: string } | undefined;
    if (when?.metric) figures.add(when.metric);
    for (const m of String(b.body ?? '').matchAll(/\{\{([a-z][a-z0-9-]*)/gu)) figures.add(m[1]!);
  }
  assert.deepEqual([...sources], [HEALTH_SOURCE]);
  assert.deepEqual([...figures].sort(), [...HEALTH_FIGURES].sort());
});

test('NOTHING THE GRAMMAR REFUSES: the page installs as a declaration', () => {
  const decl = (body: unknown): Declaration => ({ id: 'page.health', kind: 'page', body: body as never, pack: 'core' });
  /* UNTIL THE KERNEL'S INSTALL CHECK KNOWS `signs` (`COMPUTED_SOURCES` in `declare.ts`, a line this unit hands on), the
     one refusal allowed is that one, at a block reading it. Once it knows the source, the page must install whole. */
  const probe = validateDeclaration(decl({ page: 'health', title: 'Health', blocks: [{ kind: 'cards', source: HEALTH_SOURCE, columns: [{ field: 'name', as: 'title' }] }] }));
  const said = validateDeclaration(decl(PAGE));
  if (probe === null) assert.equal(said, null, JSON.stringify(said));
  else {
    assert.match(probe.fix, /reads "signs"/u, 'the only refusal let through is the source the kernel does not know yet');
    assert.match(said?.fix ?? '', /reads "signs"/u, JSON.stringify(said));
    /* AND EVERYTHING ELSE ON THE PAGE STILL CHECKED: the same blocks over a source the check knows, so a role, a `when`
       or a key it refuses is caught today and not only once the line lands. */
    const standIn = { ...PAGE, blocks: BLOCKS.map((b) => (b.source === HEALTH_SOURCE ? { ...b, source: 'activity' } : b)) };
    assert.equal(validateDeclaration(decl(standIn)), null);
  }
});

test('NO LINE IS SAID FROM signs-red SINCE core 1.3.1, whatever it reads: Needs a look names each one', () => {
  /* "3 things need a look." went on 3 Nov ("i dont like those briefs at all, remove them"): it counted the group under it. */
  assert.deepEqual(leads(read([GREEN], { 'signs-red': 0 })), []);
  assert.deepEqual(leads(read([RED, GREEN], { 'signs-red': 1 })), []);
  assert.deepEqual(leads(read([RED, RED, RED], { 'signs-red': 3 })), []);
  assert.deepEqual(leads(read([NONE], { 'signs-red': null })), [], 'a record nobody has read is not told it is alive');
  assert.equal(BLOCKS.some((b) => b.lead === true), false, 'the page still declares a line');
  assert.deepEqual(under(read([RED, RED, RED], { 'signs-red': 3 }), 'Needs a look').length, 3);
});

test('ONE GREEN AND THE REST UNREAD IS NEVER CALLED ALIVE: the line says only that nothing needs a look', () => {
  const unread = [NONE, { ...NONE, sign: 'tools-listed', name: 'The tools list' }, { ...NONE, sign: 'rules-ran', name: 'Rules ran this week' }];
  /* `signs-red` reads 0 here, as the kernel reads it once one sign is green (`readVitals`). */
  const blocks = read([GREEN, ...unread], { 'signs-red': 0 });
  assert.deepEqual(leads(blocks), ['Nothing needs a look.']);
  for (const line of leads(blocks)) assert.doesNotMatch(line, /alive|healthy|everything/iu, line);
  assert.deepEqual(under(blocks, 'All good'), [GREEN.name]);
  /* EVERY UNREAD SIGN IS SAID BY ITS NAME, and the ones nothing was ever filed for in one line, not one line each. */
  assert.deepEqual(under(blocks, 'Not checked yet'), ['The model answers, The tools list and Rules ran this week']);
  for (const b of BLOCKS) if (b.kind === 'note') assert.doesNotMatch(String(b.body), /alive/iu, 'no line says alive of the record');
});

test('HOW LONG IT HAS HELD is said from green-days in whole words, and not at all at nought or unread', () => {
  const lines = (days: number | null): string[] =>
    drawn(read([GREEN], { 'signs-red': 0, 'green-days': days })).filter((b) => b.kind === 'note' && !b.lead).map((b) => String((b as { body?: unknown }).body)).filter((w) => !w.includes('[Tidy up]'));
  assert.deepEqual(lines(null), []);
  assert.deepEqual(lines(0), []);
  assert.deepEqual(lines(1), ['Every check passed yesterday.']);
  assert.equal(lines(4).length, 1);
  assert.match(lines(4)[0]!, /^Every check has passed for (\{\{green-days\}\}|4) days, up to yesterday\.$/u);
  /* ONLY A LEAD NOTE HAS ITS `(s)` SETTLED (`page-live.ts` `leadOf`): anywhere else it is drawn as written. */
  for (const b of BLOCKS) if (b.kind === 'note' && b.lead !== true) assert.doesNotMatch(String(b.body), /\(s\)/u, String(b.body));
});

test('A NONE SIGN IS NEVER DRAWN GREEN: it is under Not read yet, and Alive holds only green ones', () => {
  const blocks = read([RED, GREEN, NONE], { 'signs-red': 1, 'green-days': 0 });
  assert.deepEqual(under(blocks, 'Needs a look'), [RED.name]);
  assert.deepEqual(under(blocks, 'All good'), [GREEN.name]);
  assert.deepEqual(under(blocks, 'Not checked yet'), [NONE.name]);
  const alive = BLOCKS.find((b) => b.heading === 'All good')!;
  const unread = BLOCKS.find((b) => b.heading === 'Not checked yet')!;
  assert.notEqual(unread.icon, alive.icon, 'an unread sign does not wear the green mark');
  const onlyNone = read([NONE, { ...NONE, sign: 'tools-listed', name: 'The tools list' }], { 'signs-red': null });
  assert.deepEqual(under(onlyNone, 'All good'), []);
  assert.equal(drawn(onlyNone).some((b) => b.heading === 'All good'), false, 'no empty All good is drawn');
});

test('RED CARRIES A WORD AND A MARK, never colour alone, and comes first', () => {
  const groups = BLOCKS.filter((b) => b.source === HEALTH_SOURCE);
  assert.equal(groups[0]?.heading, 'Needs a look');
  assert.equal(groups[0]?.icon, 'octagon-alert');
  for (const g of groups) assert.ok(typeof g.icon === 'string' && typeof g.heading === 'string', 'every state says its word beside a glyph');
});

test('THE WORDS ARE PLAIN: no em dash, no id, and never row, item or entity', () => {
  const words = [PAGE.title, ...BLOCKS.flatMap((b) => [b.heading, b.body, b.empty])].filter((w): w is string => typeof w === 'string');
  for (const w of words) {
    assert.doesNotMatch(w, /—/u, w);
    assert.doesNotMatch(w, /\b(rows?|items?|entit(y|ies))\b/iu, w);
    assert.doesNotMatch(w, /[a-z]+#\d|\b[0-9A-HJKMNP-TV-Z]{26}\b/u, w);
  }
});

test('HOW MANY SIGNS ARE NOT READ YET is said from signs-unread, and not at all at nought or unread', () => {
  const lines = (n: number | null): string[] =>
    drawn(read([GREEN, NONE], { 'signs-red': 0, 'signs-unread': n })).filter((b) => b.kind === 'note' && !b.lead).map((b) => String((b as { body?: unknown }).body)).filter((w) => !w.includes('[Tidy up]'));
  assert.deepEqual(lines(null), []);
  assert.deepEqual(lines(0), []);
  assert.deepEqual(lines(1), ['One check has not run yet.']);
  assert.equal(lines(3).length, 1);
  assert.match(lines(3)[0]!, /^(\{\{signs-unread\}\}|3) checks have not run yet\.$/u);
});

test('HEALTH AND TIDY UP POINT AT EACH OTHER, so the two counts are never read as one', () => {
  const notes = drawn(read([GREEN], { 'signs-red': 0 })).filter((b) => b.kind === 'note').map((b) => String((b as { body?: unknown }).body));
  assert.ok(notes.some((w) => w.includes('](/settings/tidy)')), notes.join(' | '));
});
