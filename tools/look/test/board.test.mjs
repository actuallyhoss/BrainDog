/**
 * The board tool without a browser: what it takes, what a board folder reads as, what it draws, the page installed
 * through the record's own door, the yes it writes, and the sheet.
 *
 *   node --test tools/look/test/board.test.mjs
 *
 * THE PICTURES THEMSELVES NEED A BUILD AND A BROWSER, so they are the integrator's to look at after the deploy word;
 * everything that decides what is drawn and what a yes holds is asserted here.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOT, drawingsOf, imagesIn, install, openFor, parseArgs, readBoard, screensFor, slugOf, sourceOf, yesOf } from '../board.mjs';
import { boardSheetHtml, ordered } from '../board-sheet.mjs';
import { namedScreens } from '../capture.mjs';
import { standing } from '../../gates/board-yes.mjs';

const put = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};
const PAGE = 'page: specimen\ntitle: Specimen\nrequires: [register.session]\n\nblocks:\n  - kind: note\n    span: 12\n    body: One line.\n';

/** A board with everything a folder may hold: a page, a skin, two variants, a stand-in, and what it governs. */
function planted() {
  const root = mkdtempSync(join(tmpdir(), 'board-'));
  put(root, 'packages/skin/house.css', ':root {}\n');
  put(root, 'design/boards/today/page.dog', PAGE);
  put(root, 'design/boards/today/skin.css', '.tile { border-radius: 16px; }\n');
  put(root, 'design/boards/today/variants/dense.css', '.tile { padding: 12px; }\n');
  put(root, 'design/boards/today/variants/split.dog', PAGE.replace('span: 12', 'span: 6'));
  put(root, 'design/boards/today/stand-ins/timeline.json', JSON.stringify({ name: 'The plan as a timeline', needs: 'a lanes block over steps', span: 8 }));
  put(root, 'design/boards/today/checks.json', JSON.stringify({ board: 'today', screens: ['decide'], checks: [{ id: 'one-board', says: 'One board.', by: 'eye' }] }));
  put(root, 'design/boards/today/paths.json', JSON.stringify(['packages/skin/**']));
  return root;
}

test('it takes a board and a source, and refuses live, a stray flag and a yes with no drawing', () => {
  assert.deepEqual(parseArgs(['frame']), { board: 'frame', seen: false });
  assert.deepEqual(parseArgs(['--board', 'frame', '--source=file:/tmp/r.sqlite']).source, { name: 'file', arg: '/tmp/r.sqlite' });
  assert.deepEqual(parseArgs(['frame', '--yes', 'yes', '--from', 'x', '--seen', '--units', 'EXP-A01, EXP-A02']).units, ['EXP-A01', 'EXP-A02']);
  assert.throws(() => parseArgs(['frame', '--source', 'live:lanternfish']), /never draws live/u);
  assert.throws(() => parseArgs(['frame', '--set', 'six']), /not --set/u);
  assert.throws(() => parseArgs(['frame', '--yes', 'yes']), /add --from/u);
  assert.throws(() => parseArgs([]), /Name the board/u);
  assert.throws(() => sourceOf('file'), /Name the record file/u);
  assert.deepEqual(sourceOf('shape'), { name: 'shape', arg: undefined });
});

test('the shape copy is opened by the file source, or said to wait for PRF-A13 job 5, never drawn as something else', async () => {
  const { openShape } = await import('../sources/file.mjs');
  if (typeof openShape !== 'function') return void (await assert.rejects(openFor({ name: 'shape', arg: 'x.brainl' }), /PRF-A13 job 5/u));
  await assert.rejects(openFor({ name: 'shape' }), /--source shape:<path>/u);
  const dir = mkdtempSync(join(tmpdir(), 'board-shape-'));
  try {
    put(dir, 'plain.txt', 'not a shape copy\n');
    await assert.rejects(openFor({ name: 'shape', arg: join(dir, 'plain.txt') }), /is not a shape copy/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the frame board reads: its page, no skin, one drawing at /p/board-frame', () => {
  const b = readBoard(ROOT, 'frame');
  assert.equal(b.body.page, 'board_frame');
  assert.equal(b.skin, null);
  assert.equal(b.checks.checks.length, 12);
  const ds = drawingsOf(b);
  assert.deepEqual(ds.map((d) => d.id), ['candidate']);
  assert.deepEqual(screensFor(b, ds[0].body).map((s) => s.path), ['/p/board-frame']);
  assert.equal(slugOf('board_frame'), 'board-frame');
});

test('a board with a skin draws today, the candidate and each variant; a stand-in is a note in its place', () => {
  const root = planted();
  try {
    const b = readBoard(root, 'today');
    assert.deepEqual(b.standIns, [{ id: 'timeline', name: 'The plan as a timeline', needs: 'a lanes block over steps', span: 8 }]);
    assert.deepEqual(b.body.blocks.at(-1), { kind: 'note', span: 8, body: 'Not drawable yet: The plan as a timeline. It needs a lanes block over steps.' });
    const ds = drawingsOf(b);
    assert.deepEqual(ds.map((d) => d.id), ['today', 'candidate', 'variant-dense', 'variant-split']);
    assert.equal(ds[0].css, undefined);
    assert.equal(ds[2].css, '.tile { border-radius: 16px; }\n\n.tile { padding: 12px; }\n');
    assert.equal(ds[3].body.blocks[0].span, 6);
    assert.equal(ds[3].body.blocks.at(-1).span, 8);
    assert.deepEqual(screensFor(b, ds[1].body).map((s) => s.path ?? s), ['/p/specimen', 'decide']);
    put(root, 'design/boards/today/page.dog', 'page: [unclosed\n');
    assert.throws(() => readBoard(root, 'today'), /page\.dog does not read as a page, at line/u);
    assert.throws(() => readBoard(root, 'nothing'), /There is no board called nothing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a yes is taken from a drawing only while the board and what it governs are as drawn', () => {
  const root = planted();
  try {
    put(root, 'out/candidate/specimen-390-light.png', 'picture');
    put(root, 'out/candidate/sheet-today-light.png', 'not a board picture');
    const images = imagesIn(join(root, 'out', 'candidate'), 'candidate/');
    assert.deepEqual(Object.keys(images), ['candidate/specimen-390-light.png']);
    const { paths, drawn } = standing(root, 'today');
    const drawing = { board: 'today', source: 'lived', widths: [390], themes: ['light'], commit: 'abc', paths, drawn, drawings: [{ id: 'candidate', images }] };
    const yes = yesOf(root, 'today', drawing, { said: 'yes to that', taken: 'the frame decision', units: ['EXP-A01'], at: new Date('2026-10-09T10:00:00Z') });
    assert.deepEqual(yes.taken, { on: '2026-10-09', from: 'the frame decision' });
    assert.equal(yes.seen, false);
    assert.deepEqual(yes.images, images);
    assert.deepEqual(Object.keys(yes.paths), ['packages/skin/house.css']);
    assert.ok(Object.hasOwn(yes.drawn, 'stand-ins/timeline.json'));
    assert.throws(() => yesOf(root, 'today', drawing, { said: ' ' }), /holds the words said/u);
    assert.throws(() => yesOf(root, 'frame', drawing, { said: 'yes' }), /of the today board/u);
    put(root, 'packages/skin/house.css', ':root { --x: 1; }\n');
    assert.throws(() => yesOf(root, 'today', drawing, { said: 'yes' }), /packages\/skin\/house\.css changed since this drawing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the board's page goes in through the record's own door, and a second drawing of it is an edit", async () => {
  const { openSource, serve } = await import('../run.mjs');
  const source = await openSource({ name: 'seed' });
  const served = await serve(source);
  try {
    const held = new Map();
    const b = readBoard(ROOT, 'frame');
    await install(served.origin, b.body, held);
    assert.equal(typeof held.get('board_frame'), 'number');
    await install(served.origin, { ...b.body, title: 'Frame again' }, held);
    const res = await fetch(`${served.origin}/api/page?slug=board-frame`);
    const page = await res.json();
    assert.equal(page.ok, true, JSON.stringify(page.refusal));
    assert.ok(page.value.blocks.every((x) => (x.refusals ?? []).length === 0), 'every block of the frame draws');
    await assert.rejects(install(served.origin, { page: 'board_frame', blocks: [] }, new Map()), /would not take the board's page/u);
  } finally {
    await served.close();
    await source.close();
  }
});

test('capture draws the screens a source names: its own page as given, a key as the record picks it', async () => {
  const of = async (set) =>
    set === 'six'
      ? { screens: [{ key: 'today', name: 'Today', path: '/', why: 'home' }], missing: [{ key: 'project', name: 'A project', missing: 'none' }] }
      : { screens: [{ key: 'decide', name: 'Decide', path: '/decide', why: 'set' }], missing: [] };
  const own = { key: 'board-frame', name: 'Frame', path: '/p/board-frame', why: "the board's own page" };
  const got = await namedScreens([own, 'decide', 'project', 'nowhere'], {}, of);
  assert.deepEqual(got.screens.map((s) => s.path), ['/p/board-frame', '/decide']);
  assert.deepEqual(got.missing.map((m) => m.key), ['project', 'nowhere']);
});

test('the sheet leads with 390 and 1440, lists the checks and outlines each stand-in', () => {
  assert.deepEqual(ordered([390, 1440, 1512, 1728].reverse()), [390, 1440, 1728, 1512]);
  const shot = (width, theme) => ({ screen: 'board-frame', name: 'Frame', width, theme, image: `board-frame-${width}-${theme}.png`, settled: 'page', waited: {}, overflowPx: 0 });
  const drawing = {
    board: 'frame', title: 'The frame', record: 'lived, default', widths: [1728, 390, 1440, 1512], themes: ['light', 'dark'],
    checks: [{ id: 'a', says: 'One board.', by: 'gate:layout' }], standIns: [{ id: 't', name: 'The plan', needs: 'a lanes block' }],
    drawings: [{ id: 'candidate', missing: [] }],
  };
  const saids = { candidate: { shots: [1728, 390, 1440, 1512].flatMap((w) => [shot(w, 'light'), shot(w, 'dark')]) } };
  const html = boardSheetHtml({ drawing, saids, theme: 'dark', out: tmpdir() });
  const captions = [...html.matchAll(/<figcaption>(\d+)<\/figcaption>/gu)].map((m) => Number(m[1]));
  assert.deepEqual(captions, [390, 1440, 1728, 1512]);
  assert.match(html, /The board/u);
  assert.match(html, /Held by the layout check/u);
  assert.match(html, /class="tile stand"><h2>The plan<\/h2><p class="muted">Not drawable yet\. It needs a lanes block\./u);
  assert.match(html, /1 block not drawable yet/u);
  assert.doesNotMatch(html, /\u2014/u);
  assert.doesNotMatch(boardSheetHtml({ drawing: { ...drawing, standIns: [] }, saids, theme: 'light', out: tmpdir() }), /not drawable yet/u);
});
