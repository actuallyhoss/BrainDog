/**
 * What the record found wrong in its own pages and notes, on Home: the record's `textFaults` as what a person reads,
 * each fault by its place's own name with the fix and one press to the place, the sentence that heads them, and
 * nothing at all at nought or on a host that does not answer the read.
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
  placeOf,
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
  const base = 'http://kept.test/app/acme';
  const first = textFaultsOnce(base, io, 1_000);
  /* WHILE IT IS OUT, and after it landed, the same read: the record is not asked to walk its words twice. */
  assert.equal(textFaultsOnce(base, io, 2_000), first);
  const got = await first;
  assert.equal(textFaultsOnce(base, io, 1_000 + TEXT_FAULTS_KEPT_MS - 1), first);
  assert.ok(asked <= 1, `asked ${String(asked)} times`);
  /* ANOTHER RECORD IS ITS OWN, and past the keeping time the record is asked again. */
  assert.notEqual(textFaultsOnce('http://kept.test/app/other', io, 2_000), first);
  const later = textFaultsOnce(base, io, 1_000 + TEXT_FAULTS_KEPT_MS);
  assert.notEqual(later, first);
  assert.deepEqual(await later, got);
});

test('NONE IS NOT KEPT: a host that refused is asked again at the next visit', async () => {
  const base = 'http://refused.test/app/acme';
  const refused = async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } });
  const first = textFaultsOnce(base, refused, 1_000);
  assert.equal(await first, null);
  await Promise.resolve();
  assert.notEqual(textFaultsOnce(base, refused, 2_000), first);
});

const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const home = bare(readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8'));

test('HOME REACHES THE TILE BY A DYNAMIC IMPORT ONLY, and draws it once, after the board\'s reads, only above nought', () => {
  for (const name of ['text-faults', 'TextFaults']) {
    assert.doesNotMatch(home, new RegExp(`^\\s*import (?!type\\b)[^;]*from '[^']*/${name}(\\.svelte|\\.ts)';$`, 'mu'), `${name} is imported with the screen`);
  }
  assert.match(home, /import\('\.\/text-faults\.ts'\)/u);
  assert.match(home, /import\('\.\/TextFaults\.svelte'\)/u);
  assert.match(home, /const found = await m\.textFaultsOnce\(base\);\s*if \(here\) faults = found && found\.count > 0 \? \{ found, Part: part\.default \} : null;/u);
  assert.equal(home.split('<faults.Part').length - 1, 1, 'the tile is drawn once');
  assert.match(home, /\{#if faults\}<faults\.Part found=\{faults\.found\} lists=\{data\.lists\} \/>\{\/if\}/u);
  /* AFTER THE BOARD'S READS: past the each that draws the briefing, the page, what went stale and who was matched. */
  assert.ok(home.indexOf('<faults.Part') > home.indexOf('<stale.Part'));
  assert.ok(home.indexOf('<faults.Part') > home.indexOf('{/each}', home.indexOf('<matched.Part')));
});

test('THE BOARD\'S LAST TILES ARE ASKED ONCE THE PAGE HAS ANSWERED, never beside the page read or in the bracket', () => {
  const effects = home.split('$effect(').slice(1);
  const late = effects.filter((e) => e.includes('textFaultsOnce(base)'));
  assert.equal(late.length, 1, 'one effect asks for the walk');
  assert.match(late[0]!, /^\(\) => \{\s*if \(data\.refused \|\| !settled\) return;/u);
  for (const tile of ['loadLearned(base)', 'loadNamedTwice(base)']) assert.ok(late[0]!.includes(tile), `${tile} waits for the page too`);
  assert.doesNotMatch(late[0]!.slice(0, late[0]!.indexOf('return () =>')), /opened|closed\(/u);
  assert.doesNotMatch(home, /loadTextFaults\(/u);
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

test('THE LAST TILES ARE ASKED ONE AT A TIME, each when the tab is idle, so none queues ahead of the next screen', () => {
  const late = home.split('$effect(').slice(1).find((e) => e.includes('textFaultsOnce(base)'))!;
  const body = late.slice(0, late.indexOf('return () =>'));
  assert.equal(body.match(/tiles\.push\(\(\) => Promise\.all\(/gu)?.length, 6, 'every tile waits its turn');
  assert.doesNotMatch(body, /void Promise\.all\(/u, 'a tile asked at once beside the others');
  assert.match(body, /for \(const tile of tiles\) \{\s*await idle\(\);\s*if \(!here\) return;/u);
});
