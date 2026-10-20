/**
 * The two look sheets and their Settings area, read as written: every control, state and chart form the sheets are
 * asked to draw is named in them, each open call is drawn twice with its default labelled, a form the record holds
 * none of says "specimen", and no word a person reads there is an id, an em dash or a word for a database.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const controls = read('./SheetControls.svelte');
const charts = read('./SheetCharts.svelte');
/* THE DESIGN BOOK'S OWN PAGE, AT `/design` SINCE THE UI PASS OF 20 OCTOBER (agents F29); it was a Settings area. */
const look = read('../../routes/design/+page.svelte');

/** A component's own words: its `const words = {` object, without the comments in it. */
const wordsOf = (src: string): string => {
  const from = src.indexOf('const words = {');
  assert.ok(from >= 0, 'the component keeps its words in `const words`');
  return src.slice(from, src.indexOf('} as const;', from)).replace(/\/\*[\s\S]*?\*\//gu, '');
};

/** The members of a `const NAME = [ ... ] as const` list of plain strings. */
const listOf = (src: string, name: string): string[] => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\] as const`, 'u').exec(src);
  assert.ok(m, `${name} is declared as a list`);
  return [...m[1]!.matchAll(/'([^']*)'/gu)].map((x) => x[1]!);
};

test('the controls sheet draws three weights by two sizes by five states, with a key cap', () => {
  assert.deepEqual(listOf(controls, 'WEIGHTS'), ['primary', 'quiet', 'bare']);
  assert.deepEqual(listOf(controls, 'SIZES'), ['m', 'sm']);
  assert.deepEqual(listOf(controls, 'STATES'), ['rest', 'hover', 'focus', 'pressed', 'disabled']);
  assert.match(controls, /\{#each WEIGHTS as weight[\s\S]*\{#each SIZES as size[\s\S]*\{#each STATES as state/u, 'the three are crossed');
  assert.match(controls, /<Button[^>]*\{weight\}[^>]*\{size\}[^>]*disabled=\{state === 'disabled'\}/u, "the product's own button, disabled only where it says so");
  assert.match(controls, /<Button[^>]*kbd=/u, 'no button on the sheet carries a key cap');
});

test('the controls sheet draws a segmented control at 2, 3 and 5, a switch, the four fields and the count', () => {
  assert.match(controls, /const SEGMENTS = \[2, 3, 5\] as const/u);
  assert.match(controls, /<Segmented role="group"[\s\S]*class="segment"/u);
  assert.match(controls, /class="switch"[\s\S]*role="switch"[\s\S]*class="switch-track"/u);
  assert.deepEqual(listOf(controls, 'FIELDS'), ['rest', 'focus', 'error', 'empty']);
  assert.match(controls, /aria-invalid=\{f === 'error'/u, 'the field in error is told to the reader as invalid');
  assert.match(controls, /<Count \{n\} label=/u, "the product's own count, with what it counts said");
});

test('the controls sheet draws a line at rest, washed, selected, arrived and changed, a toast in both places and the bulk bar', () => {
  assert.deepEqual(listOf(controls, 'LINES'), ['rest', 'wash', 'selected', 'arrived', 'changed']);
  assert.deepEqual(listOf(controls, 'PLACES'), ['start', 'centre']);
  assert.match(controls, /<Toasts \/>/u, "the product's own toast stack");
  assert.match(controls, /<BatchBar /u, "the product's own bulk bar");
  assert.match(controls, /override async send\(\): Promise<void> \{\}/u, 'the bar on the sheet answers nothing in the record');
});

test('each open call is drawn twice and the default is labelled', () => {
  /* Toasts and choosing several are on the controls sheet; a failed run is on the charts sheet. */
  assert.match(controls, /\{#each PLACES as place[\s\S]*?place === TOAST_DEFAULT[\s\S]*?words\.byDefault/u);
  assert.match(controls, /const TOAST_DEFAULT = 'start'/u, 'the default is the bottom left of the work');
  assert.match(controls, /\{#each SEVERAL as several[\s\S]*?several === SEVERAL_DEFAULT[\s\S]*?words\.byDefault/u);
  assert.deepEqual(listOf(controls, 'SEVERAL'), ['kept', 'none']);
  assert.match(controls, /const SEVERAL_DEFAULT = 'kept'/u);
  assert.match(charts, /\{#each FAILED as failed[\s\S]*?failed === FAILED_DEFAULT[\s\S]*?words\.byDefault/u);
  assert.deepEqual(listOf(charts, 'FAILED'), ['red', 'plain']);
  assert.match(charts, /const FAILED_DEFAULT = 'red'/u);
  for (const src of [controls, charts]) assert.match(wordsOf(src), /byDefault: 'Default'/u);
});

test('the charts sheet draws every specimen the renderer gives, the plan, and the record\'s own block where it holds one', () => {
  for (const name of ['chartSpecimens', 'planSpecimens', 'partSpecimens', 'FAILED_RUN', 'SHEET_NOW', 'specimenSegments']) assert.match(charts, new RegExp(`\\b${name}\\b`, 'u'), name);
  assert.match(charts, /<BlockSlot /u, "a block of the record is drawn by the page's own reader");
  assert.match(charts, /pageReader\(apiBase\(\)\)/u, 'the record is read where it is open');
  assert.match(charts, /now: SHEET_NOW/u, 'a specimen is drawn on its own day, so its picture does not move');
  assert.match(wordsOf(charts), /specimen/iu, 'a drawing that is not the record\'s says so');
});

test('the charts sheet draws the faces: a person, a project, a retired project, each maker\'s mark and the app\'s glyph', () => {
  assert.match(charts, /import \{ AGENT_MARKS[^}]*\} from '@braindog\/skin\/agent-marks\.ts'/u, "the makers' marks are read from the skin");
  assert.match(charts, /Object\.keys\(AGENT_MARKS\)/u, 'every mark the skin holds, not a list kept here');
  assert.match(charts, /<AgentMark /u);
  assert.match(charts, /<Face /u);
  assert.match(charts, /<IdentityMark /u);
  assert.match(charts, /retired: true/u);
  assert.match(charts, /<Mark /u, "the app's own glyph");
});

test('the design book is an address of its own that draws both sheets and keeps its words inside itself', () => {
  assert.match(look, /import SheetControls from '\$lib\/design\/SheetControls\.svelte'/u);
  assert.match(look, /import SheetCharts from '\$lib\/design\/SheetCharts\.svelte'/u);
  assert.match(look, /const shell = \$derived\(page\.data as unknown as Shell\)/u, 'the charts sheet reads the shell the layout asked for');
  assert.doesNotMatch(look, /from '\.\/copies\.ts'/u, 'its words are its own');
  assert.match(wordsOf(look), /controls: 'Controls and rows'[\s\S]*charts: 'Charts and marks'/u, 'the two sheets by their names');
});

test('no word on either sheet or the area is an em dash, an id or a word for a database', () => {
  for (const [name, src] of [['SheetControls', controls], ['SheetCharts', charts], ['Look', look]] as const) {
    const words = wordsOf(src);
    assert.doesNotMatch(words, /—/u, `${name} holds an em dash`);
    assert.doesNotMatch(words, /\b[0-9A-HJKMNP-TV-Z]{26}\b|[a-z]+#\d+/u, `${name} prints an id`);
    /* The sheet called "Controls and rows" is his name for it; nothing else a person reads says "row". */
    assert.doesNotMatch(words.replace(/'Controls and rows'/gu, ''), /\b(rows?|list items?|entity|entities|records?' rows)\b/iu, `${name} says a word for a database`);
  }
});

test('neither sheet draws glass, a gradient or a shadow of its own', () => {
  for (const [name, src] of [['SheetControls', controls], ['SheetCharts', charts], ['Look', look]] as const) {
    const style = src.slice(src.indexOf('<style>'));
    assert.doesNotMatch(style, /backdrop-filter|gradient\(|box-shadow:(?! none)/u, `${name} adds a look the board does not have`);
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b|rgb\(/iu, `${name} names a colour outside the tokens`);
  }
});

test('the design book is generated from the renderer and the skin, and sits on its own page', () => {
  const book = read('./DesignBook.svelte');
  /* THE APP'S OWN FRAME, NOT THE SITE'S LOOK, since the UI pass of 20 October. */
  for (const name of ['designBook', 'HOUSE_FRAME', 'SCALE_CSS', 'SHEET_NOW']) assert.match(book, new RegExp(`\\b${name}\\b`, 'u'), name);
  assert.doesNotMatch(book.slice(book.indexOf('<style>')), /#[0-9a-f]{3,8}\b|rgb\(|gradient\(|box-shadow:(?! none)/iu, 'the book names no colour of its own');
  assert.match(look, /import DesignBook from '\$lib\/design\/DesignBook\.svelte'/u);
  assert.match(look, /title: 'Design book'/u);
});
