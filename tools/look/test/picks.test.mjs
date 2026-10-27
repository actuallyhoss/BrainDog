/**
 * The picks page of the frame: the slots read, the defaults that stand for a blank answer, dark.md as the
 * theme makes it now, the kit's sizes beside ours, the page, and a yes that carries every pick. No browser: the
 * drawing is `board.mjs`'s and `capture.mjs`'s, tested there.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHOSEN, DARK, DEFAULTED, PICKS, ROOT, SPECIMEN, answersOf, chosenOf, darkMd, darkRoles, measuresOf, pageColours, parseArgs,
  picksHtml, readSlots, shotsOf, yesWithPicks,
} from '../picks.mjs';
import { standing } from '../../gates/board-yes.mjs';
import { parseDog } from '../../../packages/dog/src/index.ts';

const put = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};
const slot = (pick, more = {}) =>
  JSON.stringify({ pick, asks: 'Which one', options: [{ id: 'a', says: 'The first.', live: true }, { id: 'b', says: 'The second.' }], default: 'a', why: 'Because.', ...more });
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('every pick of the frame reads, with its default one of its options and every sheet an option of its own', () => {
  const slots = readSlots();
  assert.ok(slots.length >= 17, `${slots.length} picks`);
  for (const s of slots) {
    assert.ok(s.options.some((o) => o.id === s.default), `${s.pick} marks an option it offers`);
    assert.doesNotMatch(`${s.asks} ${s.why} ${s.options.map((o) => o.says).join(' ')}`, /\u2014|\brow\b|\bentity\b/u, s.pick);
  }
  const drawn = Object.fromEntries(slots.flatMap((s) => s.options.filter((o) => o.drawn && o.css !== null).map((o) => [`${s.pick}/${o.id}`, o.css])));
  assert.deepEqual(Object.keys(drawn).sort(), ['size-12/thirteen', 'status/fill', 'tile-heading/seventeen']);
  assert.deepEqual(slots.filter((s) => s.shown).map((s) => s.pick), ['frame', 'red', 'size-12', 'status', 'tile-heading']);
  assert.equal(slots.find((s) => s.pick === 'frame').taken, 'the frame decision');
  assert.ok(!slots.some((s) => s.pick === 'blue' || s.pick === 'site-accent'), 'red was taken, so no blue pick is asked');
});

test('each sheet drawn on the specimen reaches a part the renderer draws, so its pictures differ from the look as it stands', () => {
  /* A sheet whose classes the renderer never writes draws the same picture twice, and he would pick between two equal
     pictures. Only the classes are held here; whether the pictures differ is seen on the drawing. */
  const svelte = readdirSync(join(ROOT, 'packages/render/svelte'), { recursive: true }).filter((f) => f.endsWith('.svelte'));
  const drawnBy = [read('packages/render/src/html.ts'), read('apps/web/src/lib/page/BlockSlot.svelte'), ...svelte.map((f) => read(`packages/render/svelte/${f}`))].join('\n');
  for (const s of readSlots().filter((x) => x.shown))
    for (const o of s.options.filter((x) => x.css !== null))
      for (const [, cls] of o.css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/\.([a-z][a-z0-9-]*)/gu))
        assert.match(drawnBy, new RegExp(`class="[^"]*\\b${cls}\\b`, 'u'), `${s.pick}/${o.id}.css reaches .${cls}, which the renderer never draws`);
});

test('a slot that does not read is refused by its file, never dropped from the page', () => {
  const root = mkdtempSync(join(tmpdir(), 'picks-'));
  try {
    put(root, `${PICKS}/one/slot.json`, slot('one'));
    put(root, `${PICKS}/one/b.css`, '.x {}\n');
    assert.deepEqual(readSlots(root).map((s) => [s.pick, s.options.map((o) => o.drawn)]), [['one', [false, false]]]);
    put(root, `${PICKS}/one/slot.json`, slot('one', { shown: 'specimen' }));
    assert.deepEqual(readSlots(root).map((s) => [s.pick, s.options.map((o) => o.drawn)]), [['one', [true, true]]]);
    put(root, `${PICKS}/one/c.css`, '.x {}\n');
    assert.throws(() => readSlots(root), /one\/c\.css is a sheet for no option/u);
    rmSync(join(root, PICKS, 'one', 'c.css'));
    put(root, `${PICKS}/two/slot.json`, slot('two', { default: 'z' }));
    assert.throws(() => readSlots(root), /marks "z" as the default/u);
    put(root, `${PICKS}/two/slot.json`, slot('three'));
    assert.throws(() => readSlots(root), /names the pick "three", and its folder is two/u);
    put(root, `${PICKS}/two/slot.json`, '{');
    assert.throws(() => readSlots(root), /two\/slot\.json does not read as JSON/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a pick left blank takes its default and says so; a choice is the owner\'s; one taken elsewhere is said as taken', () => {
  const slots = [
    { pick: 'status', default: 'dot', options: [{ id: 'dot' }, { id: 'fill' }], taken: null },
    { pick: 'red', default: 'late-over-error', options: [{ id: 'late-over-error' }, { id: 'late-only' }], taken: null },
    { pick: 'frame', default: 'yes', options: [{ id: 'yes' }, { id: 'no' }], taken: 'the frame decision' },
  ];
  assert.deepEqual(answersOf(slots, chosenOf(['status=fill'])), {
    status: { option: 'fill', how: CHOSEN },
    red: { option: 'late-over-error', how: DEFAULTED },
    frame: { option: 'yes', how: 'taken in the frame decision' },
  });
  assert.equal(DEFAULTED, 'default, not chosen');
  assert.throws(() => answersOf(slots, { status: 'glow' }), /offers dot and fill, and not glow/u);
  assert.throws(() => answersOf(slots, { blue: 'own' }), /There is no pick called blue/u);
  assert.throws(() => chosenOf(['status']), /slot=option/u);
});

test('dark.md is what the theme makes now, and every colour for words reads on the board and on a tile', async () => {
  const roles = await darkRoles();
  assert.equal(read(DARK), darkMd(roles), 'dark.md is stale: run node tools/look/picks.mjs dark');
  for (const name of ['ink', 'ink2', 'dim', 'faint', 'danger-text', 'action-text', 'accent-text']) {
    const r = roles.find((x) => x.role === name);
    assert.ok(r && r.board >= 4.5 && r.tile >= 4.5, `${name} reads ${r?.board} on the board and ${r?.tile} on a tile`);
  }
  for (const [name, fill] of [['on-action', 'action'], ['accent-ink', 'accent']]) {
    const r = roles.find((x) => x.role === name);
    assert.equal(r?.own?.fill, fill, `${name} is measured on ${fill}`);
    assert.ok(r.own.ratio >= 4.5, `${name} reads ${r.own.ratio} on ${fill}`);
  }
  assert.doesNotMatch(read(DARK), /\u2014/u);
});

// The reference kit is a local file under loop/, which is never pushed, so a checkout without it skips this one.
const KIT = 'loop/KIT-REFERENCE.md';
const kitAway = existsSync(join(ROOT, KIT)) ? false : 'the reference kit is a local file, never pushed';
test("each of our sizes stands beside the kit's, both read from their files", { skip: kitAway }, () => {
  const got = measuresOf(read('packages/skin/tokens.css'), read(KIT));
  for (const m of got) assert.ok(m.ours !== null && m.kit !== null, `${m.name}: ours ${m.ours}, the kit's ${m.kit}`);
  assert.deepEqual(measuresOf('--rail: 240px;', ''), [{ name: 'Rail width', ours: 240, kit: null }, ...got.slice(1).map((m) => ({ ...m, ours: null, kit: null }))]);
});

test('the page shows each option dark first, marks one recommendation a pick, and ticks it, in plain words', () => {
  assert.deepEqual(
    shotsOf({ 'x/s-1440-light.png': 1, 'x/s-390-light.png': 1, 'x/s-1440-dark.png': 1, 'x/s-390-dark.png': 1 }).map((s) => `${s.width} ${s.theme}`),
    ['390 dark', '1440 dark', '390 light', '1440 light'],
  );
  const slots = readSlots();
  const pics = { 'p-390-dark.png': 1, 'p-1440-dark.png': 1, 'p-390-light.png': 1, 'p-1440-light.png': 1 };
  const prefixed = (k) => Object.fromEntries(Object.keys(pics).map((f) => [`${k}/${f}`, 'h']));
  const drawn = { 'as-it-stands': prefixed('as-it-stands'), status: { fill: prefixed('status/fill') } };
  const html = picksHtml({ slots, drawn, record: 'a sample record', dark: [{ role: 'ink', value: ['#', 'F1F3F6'].join(''), board: 17.15, tile: 15.71 }], measures: [{ name: 'Rail width', ours: 240, kit: 188 }], colours: pageColours(read('packages/skin/house.css')) });
  assert.equal((html.match(/class="rec">Recommended</gu) ?? []).length, slots.length);
  assert.equal((html.match(/ checked data-default/gu) ?? []).length, slots.length);
  assert.match(html, /Yes to every recommendation/u);
  assert.match(html, /src="status\/fill\/p-390-dark\.png"/u);
  assert.ok(html.indexOf('status/fill/p-390-dark.png') < html.indexOf('status/fill/p-390-light.png'), 'dark first');
  assert.match(html, /Said in words: it is about a screen/u);
  assert.match(html, /Said in words: nothing draws this one/u, 'an option of a shown pick with no sheet is not said to be off the page');
  assert.match(html, /Taken for you in the frame decision/u);
  assert.match(html, /drawn on a sample record/u);
  assert.match(html, /<td class="num">240px<\/td><td class="num">188px<\/td>/u);
  assert.match(html, /prefers-color-scheme: dark/u);
  const words = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<[^>]+>/gu, ' ');
  assert.doesNotMatch(words, /\u2014|\brow\b|\bentity\b|\blist item\b/u);
  assert.doesNotMatch(words, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'no ids in what he reads');
});

test('the specimen holds every part of the frame on tiles of 3, 4, 6, 8 and 12', () => {
  const got = parseDog(read(SPECIMEN));
  assert.equal(got.ok, true, got.fix);
  const blocks = got.value.blocks;
  assert.deepEqual([...new Set(blocks.map((b) => b.span))].sort((a, b) => a - b), [3, 4, 6, 8, 12]);
  for (const k of ['note', 'stat', 'queue', 'bar', 'table', 'feed', 'capture']) assert.ok(blocks.some((b) => b.kind === k), `a ${k}`);
  assert.equal(blocks[0].lead, true, 'the header line leads');
  let line = 0;
  for (const b of blocks) {
    line += b.span;
    assert.ok(line <= 12, `${b.heading ?? b.kind} runs past the twelfth column`);
    if (line === 12) line = 0;
  }
  assert.equal(line, 0, 'the last line of tiles is whole');
});

test('the specimen goes in through the record\'s own door and every block draws', async (t) => {
  const { openSource, serve } = await import('../run.mjs');
  const { install } = await import('../board.mjs');
  let source;
  try {
    source = await openSource({ name: 'seed' });
  } catch (e) {
    /* THE SEED ITSELF, NOT THE SPECIMEN: said by name and left to the seed's own tests, never passed. */
    if (/could not take the seed/u.test(String(e?.message))) return t.skip(`the seed refuses itself: ${e.message}`);
    throw e;
  }
  const served = await serve(source);
  try {
    const body = parseDog(read(SPECIMEN)).value;
    await install(served.origin, body, new Map());
    const page = await (await fetch(`${served.origin}/api/page?slug=board-specimen`)).json();
    assert.equal(page.ok, true, JSON.stringify(page.refusal));
    for (const b of page.value.blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} draws`);
  } finally {
    await served.close();
    await source.close();
  }
});

test('the yes carries every pick beside the hashes, and is refused for a drawing of code that moved', async () => {
  const root = mkdtempSync(join(tmpdir(), 'picks-yes-'));
  try {
    put(root, 'packages/skin/house.css', ':root {}\n');
    put(root, 'design/boards/frame/page.dog', 'page: f\ntitle: F\nrequires: [register.session]\n\nblocks:\n  - kind: note\n    span: 12\n    body: One line.\n');
    put(root, 'design/boards/frame/checks.json', JSON.stringify({ board: 'frame', screens: [], checks: [] }));
    put(root, 'design/boards/frame/paths.json', JSON.stringify(['packages/skin/**']));
    put(root, `${PICKS}/status/slot.json`, slot('status'));
    put(root, `${PICKS}/frame/slot.json`, slot('frame', { taken: 'the frame decision' }));
    const { paths, drawn } = standing(root, 'frame');
    const images = { 'candidate/board-frame-390-dark.png': 'a'.repeat(64) };
    const drawing = { board: 'frame', source: 'seed', widths: [390], themes: ['dark'], commit: 'abc', paths, drawn, drawings: [{ id: 'candidate', images }] };
    const yes = await yesWithPicks(root, drawing, { said: 'The frame on the four boards drawn on 8 October is yes, in red.', taken: 'the frame decision', chosen: { status: 'b' }, at: new Date('2026-10-09T10:00:00Z') });
    assert.deepEqual(yes.units, ['EXP-A01', 'EXP-A02']);
    assert.equal(yes.seen, false);
    assert.deepEqual(yes.taken, { on: '2026-10-09', from: 'the frame decision' });
    assert.deepEqual(yes.picks, { frame: { option: 'a', how: 'taken in the frame decision' }, status: { option: 'b', how: CHOSEN } });
    assert.deepEqual(yes.images, images);
    put(root, 'packages/skin/house.css', ':root { --x: 1; }\n');
    await assert.rejects(yesWithPicks(root, drawing, { said: 'yes' }), /changed since this drawing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('it takes dark, draw, page and yes, and refuses a yes with no words or no drawing', () => {
  assert.deepEqual(parseArgs(['dark']), { command: 'dark', picks: [], seen: false });
  assert.deepEqual(parseArgs(['yes', 'yes to it', '--from', 'd', '--pick', 'status=fill', '--seen']), { command: 'yes', picks: ['status=fill'], seen: true, said: 'yes to it', from: 'd' });
  assert.equal(parseArgs(['draw', '--source=seed']).source, 'seed');
  assert.throws(() => parseArgs(['yes', '--from', 'd']), /holds the words said/u);
  assert.throws(() => parseArgs(['page']), /needs --from/u);
  assert.throws(() => parseArgs(['draw', '--pick', 'a=b']), /does not take --pick/u);
  assert.throws(() => parseArgs(['blue']), /takes dark, draw, page or yes/u);
});
