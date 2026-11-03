/**
 * What the record found wrong in its own pages and notes, in Settings › Health: the record's `textFaults` as what a
 * person reads, each fault by its place's own name with the fix and one press to the place, the sentence that heads
 * them, nothing at all at nought or on a host that does not answer the read, and "not checked yet" before the record's
 * first night pass has walked its words.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PAGES, TITLES, learnPages } from '../record/held.ts';
import {
  FAULTS_SHOWN,
  TEXT_FAULTS_KEPT_MS,
  faultLine,
  faultRows,
  knownOf,
  loadTextFaults,
  more,
  notChecked,
  anyFound,
  placeOf,
  printedLeft,
  printedLine,
  printedRows,
  readTextFaults,
  textFaultsOf,
  textFaultsOnce,
  type Known,
} from './text-faults.ts';

const ULID = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const NOTE = {
  kind: 'path-names-nothing',
  where: { list: 'Projects', row: 'Kiln rebuild', field: 'Notes', name: 'Notes' },
  said: 'The note says {{ kiln.lead }}, and nothing is called that.',
  fix: 'Write kiln.owner, the nearest name there is.',
};
const FENCE = {
  kind: 'degraded-fence',
  where: { page: 'Money', name: 'Spending' },
  said: 'A chart block could not be read, so the page shows its text.',
  fix: 'Close the block with three backticks on a line of their own.',
};
const answer = (faults: unknown[], count = faults.length, line = `${String(count)} values on 2 pages name nothing`) => ({
  ok: true as const,
  value: { count, line, faults, truncated: faults.length < count },
});
/* WHAT A TAB HOLDS: the pages `boot` listed, the shell's lists, and the entries a reader walked. */
const KNOWN: Known = {
  pages: [{ slug: 'money', title: 'Money' }, { slug: 'plan-a', title: 'Plan' }, { slug: 'plan-b', title: 'Plan' }],
  lists: [{ id: 'projects', name: 'Projects' }, { id: 'tasks', name: 'Tasks' }],
  seq: (list, name) => (list === 'projects' && name === 'Kiln rebuild' ? 4 : list === 'tasks' && name === 'Send the invoice' ? 12 : null),
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('NOUGHT DRAWS NOTHING: no rows, no heading, no count of the rest', () => {
  const found = textFaultsOf(answer([], 0, ''));
  assert.deepEqual(found, { count: 0, line: '', faults: [], truncated: false });
  assert.deepEqual(faultRows(found), []);
  assert.equal(faultLine(found), null);
  assert.equal(more(found), '');
  /* AND NONE IS NOTHING TOO. */
  assert.deepEqual(faultRows(null), []);
  assert.equal(faultLine(null), null);
  assert.equal(more(null), '');
});

test('BEFORE THE FIRST NIGHT PASS IT IS NOT CHECKED YET, never clean: `computedAt` null is kept, and a night\'s is read', () => {
  const night = (computedAt: unknown) => ({ ok: true as const, value: { count: 0, line: '', faults: [], truncated: false, computedAt } });
  const before = textFaultsOf(night(null));
  assert.deepEqual(before, { count: 0, line: '', faults: [], truncated: false, computedAt: null });
  assert.equal(notChecked(before), true);
  /* NOUGHT STILL DRAWS NO TILE: what is not checked is said in its own words, not as a fault. */
  assert.equal(faultLine(before), null);
  const walked = textFaultsOf(night('2026-10-23T01:00:00.000Z'));
  assert.equal(walked?.computedAt, '2026-10-23T01:00:00.000Z');
  assert.equal(notChecked(walked), false);
  /* A HOST BUILT BEFORE THE NIGHT PASS SENDS NO `computedAt`: it walked as it was asked, and that is checked. */
  assert.equal(notChecked(textFaultsOf(answer([], 0, ''))), false);
  assert.equal(notChecked(textFaultsOf(night(42))), false);
  assert.equal(notChecked(null), false);
});

test('A FAULT IS ITS PLACE BY NAME, WHAT IS WRONG, THE FIX AND WHERE IT OPENS; the heading is the record\'s own sentence', () => {
  const found = textFaultsOf(answer([NOTE, FENCE]));
  assert.equal(faultLine(found), '2 values on 2 pages name nothing');
  assert.deepEqual(faultRows(found, KNOWN), [
    { title: 'Kiln rebuild', said: NOTE.said, fix: NOTE.fix, href: '/r/projects/4' },
    { title: 'Money', said: FENCE.said, fix: FENCE.fix, href: '/p/money' },
  ]);
  assert.deepEqual(Object.keys(faultRows(found)[0]!).sort(), ['fix', 'href', 'said', 'title']);
  /* A TAB THAT KNOWS NO PLACE DRAWS THE SAME FAULTS AS WORDS. */
  assert.deepEqual(faultRows(found).map((r) => r.href), [null, null]);
  /* A RECORD THAT SENT NO SENTENCE still heads the tile, in plain words. */
  assert.equal(faultLine(textFaultsOf(answer([NOTE], 1, ''))), 'One thing on your pages needs a fix');
  assert.equal(faultLine(textFaultsOf(answer([NOTE, FENCE], 2, ''))), '2 things on your pages need a fix');
});

test('SIX ROWS, AND THE REST COUNTED FROM THE RECORD\'S OWN COUNT, the ones it held back as well', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ ...NOTE, where: { ...NOTE.where, row: `Project ${String(i + 1)}` } }));
  const found = textFaultsOf(answer(nine, 14));
  assert.equal(FAULTS_SHOWN, 6);
  assert.equal(faultRows(found).length, 6);
  assert.deepEqual(faultRows(found).map((r) => r.title), ['Project 1', 'Project 2', 'Project 3', 'Project 4', 'Project 5', 'Project 6']);
  assert.equal(more(found), 'and 8 more');
  assert.equal(found?.truncated, true);
  assert.equal(more(textFaultsOf(answer(nine.slice(0, 6), 6))), '');
  assert.equal(more(textFaultsOf(answer(nine.slice(0, 7), 7))), 'and 1 more');
});

test('A PLACE OPENS BY ITS NAME\'S ROUTE, from the names the record says it by, and no raw id is put in an address', () => {
  const at = (where: Parameters<typeof placeOf>[0]['where'], sent?: Parameters<typeof placeOf>[0]['at']) => placeOf({ where, ...(sent ? { at: sent } : {}) }, KNOWN);
  assert.equal(at({ page: 'Money', name: 'Spending' }), '/p/money');
  assert.equal(at({ page: 'money ', name: 'Spending' }), '/p/money');
  assert.equal(at({ list: 'Tasks', row: 'Send the invoice', field: 'Notes', name: 'Notes' }), '/r/tasks/12');
  /* AN ENTRY THIS TAB HAS NOT WALKED OPENS ITS LIST, which has a name route. */
  assert.equal(at({ list: 'Tasks', row: 'Ring the printer', name: 'Notes' }), '/r/tasks');
  assert.equal(at({ list: 'Tasks', name: 'Tasks' }), '/r/tasks');
  /* A DOCUMENT ON A PAGE OPENS THE PAGE; two pages of one name are no place, and its list is opened instead. */
  assert.equal(at({ page: 'Money', list: 'Tasks', row: 'Send the invoice', name: 'Notes' }), '/p/money');
  assert.equal(at({ page: 'Plan', list: 'Tasks', row: 'Send the invoice', name: 'Notes' }), '/r/tasks/12');
  assert.equal(at({ page: 'Plan', name: 'Plan' }), null);
  /* A NAME THIS TAB HOLDS NO PLACE FOR IS WORDS ALONE. */
  assert.equal(at({ page: 'Garden', name: 'Garden' }), null);
  assert.equal(at({ list: 'Recipes', row: 'Soup', name: 'Notes' }), null);
  assert.equal(placeOf({ where: { page: 'Money', name: 'Spending' } }), null);
  /* AN ADDRESS THE RECORD SENDS BESIDE THE NAMES IS TAKEN FIRST, and a raw id in it never is. */
  assert.equal(at({ page: 'Garden', name: 'Garden' }, { slug: 'garden' }), '/p/garden');
  assert.equal(at({ list: 'Recipes', name: 'Notes' }, { list: 'recipes', seq: 3 }), '/r/recipes/3');
  assert.equal(at({ list: 'Recipes', name: 'Notes' }, { list: 'recipes' }), '/r/recipes');
  assert.equal(at({ page: 'Garden', name: 'Garden' }, { slug: ULID }), null);
  assert.equal(at({ list: 'Tasks', name: 'Notes' }, { list: ULID, seq: 3 }), '/r/tasks');
  const rows = faultRows(textFaultsOf(answer([NOTE, FENCE, { ...NOTE, at: { list: ULID, seq: 2 } }])), KNOWN);
  for (const r of rows) assert.ok(!(r.href ?? '').includes(ULID), `${r.href ?? ''} holds a raw id`);
  assert.deepEqual(rows.map((r) => r.href), ['/r/projects/4', '/p/money', '/r/projects/4']);
});

test('WHAT THE TAB HOLDS IS WHAT NAMES A PLACE: the pages boot listed, the shell\'s lists and the entries walked', () => {
  learnPages([{ slug: 'kiln-plan', title: 'Kiln plan' }]);
  TITLES.set('projects', new Map([[7, 'Kiln rebuild']]));
  try {
    const known = knownOf([{ id: 'projects', name: 'Projects' }]);
    assert.equal(placeOf({ where: { page: 'Kiln plan', name: 'Notes' } }, known), '/p/kiln-plan');
    assert.equal(placeOf({ where: { list: 'Projects', row: 'kiln rebuild', name: 'Notes' } }, known), '/r/projects/7');
  } finally {
    delete PAGES['kiln-plan'];
    TITLES.delete('projects');
  }
});

test('A FAULT THE SCREEN CANNOT SAY IS DROPPED: no name, a name that is an id, or no sentence; an em dash is said plainly', () => {
  const found = textFaultsOf(
    answer([
      null,
      'money',
      { ...NOTE, where: { list: 'Projects' } },
      { ...NOTE, where: { list: 'Projects', row: ULID, name: 'Notes' } },
      { ...NOTE, said: '   ' },
      { ...FENCE, said: 'A chart block could not be read \u2014 the page shows its text.' },
    ], 6),
  );
  assert.deepEqual(faultRows(found).map((r) => r.said), ['A chart block could not be read, the page shows its text.']);
  for (const r of faultRows(found)) assert.ok(![r.title, r.said, r.fix].join(' ').includes('\u2014'));
  /* THE COUNT IS THE RECORD'S, so what was dropped is still counted in the rest. */
  assert.equal(more(found), 'and 5 more');
});

test('A REFUSAL ANSWERS NULL, and so does a method the host does not know, a call that threw and an answer of another shape', async () => {
  assert.equal(await readTextFaults(async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called textFaults.' } })), null);
  assert.equal(await readTextFaults(async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'No.' } })), null);
  assert.equal(await readTextFaults(async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await readTextFaults(async () => ({ ok: true, value: { count: 'many', faults: [] } })), null);
  assert.equal(await readTextFaults(async () => ({ ok: true, value: null })), null);
  assert.equal(await readTextFaults(async () => ({ ok: true, value: { count: -1, faults: [] } })), null);
  /* IT ASKS FOR THE RECORD'S OWN READ BY ITS NAME, and takes nothing. */
  const asked: unknown[] = [];
  const got = await readTextFaults(async (name, args) => {
    asked.push([name, args]);
    return answer([FENCE]);
  });
  assert.deepEqual(asked, [['textFaults', {}]]);
  assert.equal(got?.count, 1);
});

test('THROUGH THE CLIENT: a host without the read draws nothing, and a host with it is read', async () => {
  const absent = async () => json(404, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This build has no such call.' } });
  assert.equal(await loadTextFaults('http://record.test', absent), null);
  assert.equal(await loadTextFaults('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), null);
  assert.equal(await loadTextFaults('http://record.test', async () => Promise.reject(new Error('offline'))), null);
  assert.equal(await loadTextFaults('http://record.test', async () => new Response('<html>', { status: 200 })), null);
  /* THE CLIENT ASKS ONLY WHAT THE HOST'S TABLE NAMES: before the route is in it the read never leaves the screen, and
     once it is, the read goes to its own address and is answered. */
  let sent = '';
  const found = await loadTextFaults('http://record.test', async (url) => {
    sent = String(url);
    return json(200, answer([NOTE]));
  });
  if (sent !== '') {
    assert.equal(new URL(sent).pathname, '/api/textFaults');
    assert.equal(found?.count, 1);
  } else {
    assert.equal(sent, '');
    assert.equal(found, null);
  }
});

test('THE WALK IS ASKED ONCE FOR THE TAB: a second ask while it is out, or inside the keeping time, is the same read', async () => {
  let asked = 0;
  const io = async () => {
    asked += 1;
    return json(200, answer([NOTE]));
  };
  const base = 'http://kept.test/acme';
  const first = textFaultsOnce(base, io, 1_000);
  /* WHILE IT IS OUT, and after it landed, the same read: the record is not asked to walk its words twice. */
  assert.equal(textFaultsOnce(base, io, 2_000), first);
  const got = await first;
  assert.equal(textFaultsOnce(base, io, 1_000 + TEXT_FAULTS_KEPT_MS - 1), first);
  assert.ok(asked <= 1, `asked ${String(asked)} times`);
  /* ANOTHER RECORD IS ITS OWN, and past the keeping time the record is asked again. */
  assert.notEqual(textFaultsOnce('http://kept.test/other', io, 2_000), first);
  const later = textFaultsOnce(base, io, 1_000 + TEXT_FAULTS_KEPT_MS);
  assert.notEqual(later, first);
  assert.deepEqual(await later, got);
});

test('NONE IS NOT KEPT: a host that refused is asked again at the next visit', async () => {
  const base = 'http://refused.test/acme';
  const refused = async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } });
  const first = textFaultsOnce(base, refused, 1_000);
  assert.equal(await first, null);
  await Promise.resolve();
  assert.notEqual(textFaultsOnce(base, refused, 2_000), first);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const home = bare(readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8'));

const health = bare(readFileSync(new URL('../../routes/settings/[area]/areas/Health.svelte', import.meta.url), 'utf8'));

test('SETTINGS › HEALTH REACHES THE PART BY A DYNAMIC IMPORT ONLY, draws it once and only above nought; Today never', () => {
  for (const name of ['text-faults', 'TextFaults']) {
    assert.doesNotMatch(health, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with Settings`);
    assert.doesNotMatch(home, new RegExp(`/${name}(\\.svelte|\\.ts)'`, 'u'), `Today reaches ${name}`);
  }
  assert.match(health, /import\('\$lib\/home\/text-faults\.ts'\)/u);
  assert.match(health, /import\('\$lib\/home\/TextFaults\.svelte'\)/u);
  assert.match(health, /const found = await m\.textFaultsOnce\(base, io\);\s*if \(!here\) return;\s*unchecked = m\.notChecked\(found\);\s*faults = found && m\.anyFound\(found\) \? \{ found, Part: part\.default \} : null;/u);
  assert.equal(health.split('<faults.Part').length - 1, 1, 'the part is drawn once');
  assert.match(health, /\{#if faults\}<faults\.Part found=\{faults\.found\} lists=\{shell\.lists\} \/>\{\/if\}/u);
});

test('TODAY NEVER ASKS FOR THE WALK, and Health asks it with the rest, one at a time, each when the tab is idle', () => {
  assert.doesNotMatch(home, /textFaultsOnce\(|loadTextFaults\(|readTextFaults\(/u);
  assert.doesNotMatch(health, /loadTextFaults\(/u);
  assert.equal(health.match(/\(\) =>\s*Promise\.all\(\[import\(/gu)?.length, 7, 'every part waits its turn');
  assert.doesNotMatch(health, /void Promise\.all\(/u, 'a part asked at once beside the others');
  assert.match(health, /for \(const part of parts\) \{\s*await idle\(\);\s*if \(!here \|\| leaving\.signal\.aborted\) break;/u);
});

test('NOT CHECKED YET IS SAID IN HEALTH, and the calm line then vouches for nothing it did not read', () => {
  const raw = readFileSync(new URL('../../routes/settings/[area]/areas/Health.svelte', import.meta.url), 'utf8');
  assert.match(raw, /notYet: 'Not checked yet, it runs at night\.'/u);
  assert.match(health, /\{#if unchecked\}[\s\S]*?\{words\.notYet\}[\s\S]*?\{\/if\}/u);
  /* THE CALM CARD IS A TILE WITH ITS LINE SINCE 3 NOV (settings lane), still the one line for what was not read. */
  assert.match(health, /\{unchecked \? words\.clearBodyUnchecked : words\.clearBody\}/u);
  assert.doesNotMatch(/clearBodyUnchecked: '([^']*)'/u.exec(raw)?.[1] ?? 'missing', /page|note/iu);
});

test('THE TILE IS FLAT, NAMES ITS MARK BESIDE ITS WORDS, AND IS 44 UNDER A THUMB', () => {
  const part = readFileSync(new URL('./TextFaults.svelte', import.meta.url), 'utf8');
  const style = /<style>([\s\S]*)<\/style>/u.exec(part)![1]!;
  assert.match(style, /\.faults \{[^}]*border-radius: var\(--r-tile, 16px\);/u);
  assert.doesNotMatch(style, /box-shadow|gradient|backdrop-filter/u);
  assert.doesNotMatch(style.replace(/@media \(forced-colors: active\)[\s\S]*$/u, ''), /\bborder:/u);
  assert.match(part, /<IconWell name="alert" tone="danger" \/>\s*<h2 class="f-said" id="faults-h" dir="auto">\{line\}<\/h2>/u);
  assert.match(style, /@media \(pointer: coarse\) \{\s*a\.f-line \{\s*min-block-size: var\(--tap\);/u);
  assert.doesNotMatch(bare(part), /\u2014/u);
});

test('EVERY THING THE PAGES PRINT RAW IS LISTED, never six: twenty findings on fourteen pages are twenty rows', () => {
  const findings = Array.from({ length: 20 }, (_, i) => ({
    page: `Desk ${(i % 14) + 1}`,
    part: i === 0 ? `Desk 1` : 'Lead',
    said: `Prints a raw time, number ${i + 1}.`,
    slug: i % 14 === 0 ? 'desk-1' : null,
  }));
  const found = textFaultsOf({ ok: true, value: { count: 0, line: '', faults: [], truncated: false, computedAt: '2026-10-24T03:00:00.000Z', printed: { at: '2026-10-24T03:00:00.000Z', pages: 14, unread: 2, findings, cut: [] } } });
  const rows = printedRows(found);
  assert.equal(rows.length, 20);
  assert.equal(printedLine(found), '20 things on 14 pages print raw');
  /* THE PART IS NAMED WHERE IT IS NOT THE PAGE, and a page the record sent an address for opens. */
  assert.deepEqual(rows[0], { title: 'Desk 1', said: 'Prints a raw time, number 1.', fix: '', href: '/p/desk-1' });
  assert.deepEqual(rows[1], { title: 'Desk 2', said: 'Lead: Prints a raw time, number 2.', fix: '', href: null });
  assert.deepEqual(printedLeft(found), ['2 more pages were not reached last night.']);
  /* THE WORDS' OWN FAULTS ARE NOUGHT, SO THEIR TILE STAYS EMPTY while this one lists. */
  assert.equal(faultLine(found), null);
  assert.equal(anyFound(found), true, 'Health draws the part for these alone');
});

test('NO ROUND, OR A ROUND THAT FOUND NOTHING, DRAWS NO RAW LIST', () => {
  assert.deepEqual(printedRows(textFaultsOf(answer([NOTE]))), []);
  assert.equal(printedLine(textFaultsOf(answer([NOTE]))), null);
  const clean = textFaultsOf({ ok: true, value: { count: 0, line: '', faults: [], truncated: false, printed: { at: '2026-10-24T03:00:00.000Z', pages: 3, unread: 0, findings: [], cut: [] } } });
  assert.equal(printedLine(clean), null);
  assert.deepEqual(printedLeft(clean), []);
});
