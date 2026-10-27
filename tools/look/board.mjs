/**
 * A board, drawn by the product's own renderer from a record (the folder contract is `design/boards/README.md`).
 *
 *   node tools/look/board.mjs <board> [--source lived|seed|file:<path>|shape:<path>] [--out <folder>]
 *   node tools/look/board.mjs <board> --yes "<the words of the yes>" --from <drawing folder> [--taken <where>] [--seen] [--units A,B]
 *
 * THE BOARDS WERE ELEVEN STATIC FILES OUTSIDE THE REPOSITORY, with a data sheet that did not add up, and the look was
 * built with no picture anybody said yes to. Here a board is drawn the way the look draws a screen (`run.mjs`,
 * `capture.mjs`): the built app served over a copy of a record, the board's `page.dog` installed on the copy through
 * the one door a page goes in by (`setDeclaration`, as the source view writes one), its `skin.css` put after the
 * product's sheets, and every count on it computed by the record. Nothing on a board is typed by hand.
 *
 * FOUR WIDTHS AND BOTH THEMES, ALWAYS: 390, 1440, 1512 and 1728, the gate's own list (`tools/gates/board-yes.mjs`), so
 * a yes and the gate never count different pictures. Each drawing is a folder: `today` (the screen without the board's
 * skin, when it has one), `candidate` (with it), and one `variant-<id>` for each open choice. `drawing.json` beside them
 * holds every image's sha256 and the hashes of the board's own files and of the source it governs, as drawn.
 *
 * `--yes` COPIES A DRAWING INTO `yes.json`, and only while the board and its governed files are still what was drawn:
 * a yes to a picture of other code would be a yes to nothing. It never opens a browser.
 *
 * NEVER `live`. A board is a picture he judges, drawn from the lived record or a copy of a record file; his real record
 * is read by the look's `live` source, to local files only, never by this tool.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, env as processEnv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseDog } from '../../packages/dog/src/index.ts';
import { BOARDS, THEMES, WIDTHS, readJson, sha256, standing } from '../gates/board-yes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');

/** Where drawings go when `--out` is not given: beside the look's own, which git does not keep. */
export const DRAWINGS = join('loop', 'proof', 'boards');

/** The sources a board may draw from. `shape:<path>` is a shape copy, and waits for the unit that opens one. */
export const SOURCES = ['lived', 'seed', 'file', 'shape'];

/** A source a board names before it exists, and the unit it waits for. Said, never drawn as something else. */
export const UNTIL = { shape: 'PRF-A13 job 5' };

/** `<board>`, `--board <board>`, `--flag value` and `--flag=value`. A flag this tool does not take is refused. */
export function parseArgs(args) {
  const out = { seen: false };
  const takes = new Set(['board', 'source', 'out', 'yes', 'from', 'taken', 'units']);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--seen') {
      out.seen = true;
      continue;
    }
    const m = /^--([a-z]+)(?:=(.*))?$/u.exec(a);
    if (m === null) {
      if (out.board !== undefined) throw new Error(`A board is named once, and ${a} is a second name.`);
      out.board = a;
      continue;
    }
    if (!takes.has(m[1])) throw new Error(`board.mjs takes a board, --source, --out, --yes, --from, --taken, --units and --seen, and not --${m[1]}.`);
    const value = m[2] ?? args[(i += 1)];
    if (value === undefined) throw new Error(`--${m[1]} needs a value.`);
    out[m[1]] = value;
  }
  if (!out.board || !/^[a-z][a-z0-9-]*$/u.test(out.board)) throw new Error('Name the board to draw, as its folder under design/boards is named.');
  if (out.yes !== undefined && out.from === undefined) throw new Error('A yes is taken from a drawing: add --from <the drawing folder>.');
  if (out.units !== undefined) out.units = out.units.split(',').map((u) => u.trim()).filter(Boolean);
  if (out.source !== undefined) out.source = sourceOf(out.source);
  return out;
}

/** `lived`, `seed`, `file:<path>` or `shape:<path>`, as `{ name, arg }`. `live` and anything else are refused by name. */
export function sourceOf(raw) {
  const colon = raw.indexOf(':');
  const name = colon === -1 ? raw : raw.slice(0, colon);
  const arg = colon === -1 ? undefined : raw.slice(colon + 1);
  if (name === 'live') throw new Error('A board never draws live: it is drawn from the lived record or a copy of a record file.');
  if (!SOURCES.includes(name)) throw new Error(`A board draws from lived, seed, file:<path> or shape:<path>, and not ${raw}.`);
  if (name === 'file' && !arg) throw new Error('Name the record file: --source file:<path>.');
  return { name, arg };
}

/** A page's address, as the record makes it from the page's id (`slugify` in `packages/kernel/src/pages.ts`). */
export const slugOf = (page) => String(page).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');

/** A `.dog` text as a page body, or a refusal naming the file and the line. */
function bodyOf(text, file) {
  const got = parseDog(text);
  if (!got.ok) throw new Error(`${file} does not read as a page, at line ${got.line}: ${got.fix}`);
  return got.value;
}

/**
 * One board's folder, read: its page (the stand-ins added as notes in their places), its skin, its checks, its
 * variants and its stand-ins. A file that does not read is refused with its name, never drawn as something else.
 */
export function readBoard(root, board) {
  const dir = join(root, BOARDS, board);
  const at = `${BOARDS}/${board}`;
  if (!existsSync(dir)) throw new Error(`There is no board called ${board}: ${at} is not there.`);
  const text = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
  const page = text('page.dog');
  const skin = text('skin.css');
  const checks = readJson(join(dir, 'checks.json'));
  if (checks.value === undefined) throw new Error(`${at}/checks.json ${checks.fix}, and a board says what it is checked for.`);
  const standIns = (existsSync(join(dir, 'stand-ins')) ? readdirSync(join(dir, 'stand-ins')) : [])
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const s = readJson(join(dir, 'stand-ins', f));
      if (s.value === undefined || typeof s.value.name !== 'string' || typeof s.value.needs !== 'string')
        throw new Error(`${at}/stand-ins/${f} is not a stand-in: it names the block as name and what it needs as needs.`);
      return { id: f.slice(0, -'.json'.length), name: s.value.name, needs: s.value.needs, span: Number.isInteger(s.value.span) ? s.value.span : 12 };
    });
  const withStandIns = (body) => (body === null ? null : { ...body, blocks: [...(body.blocks ?? []), ...standIns.map(standInBlock)] });
  const variants = (existsSync(join(dir, 'variants')) ? readdirSync(join(dir, 'variants')) : [])
    .filter((f) => /\.(?:css|dog)$/u.test(f))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(dir, 'variants', f), 'utf8');
      const id = f.replace(/\.(?:css|dog)$/u, '');
      return f.endsWith('.css') ? { id, css: raw } : { id, body: withStandIns(bodyOf(raw, `${at}/variants/${f}`)) };
    });
  const body = page === null ? null : withStandIns(bodyOf(page, `${at}/page.dog`));
  const screens = Array.isArray(checks.value.screens) ? checks.value.screens.filter((s) => typeof s === 'string') : [];
  if (body === null && screens.length === 0) throw new Error(`${at} has no page.dog and its checks.json names no screens, so there is nothing to draw.`);
  return { board, dir, at, body, skin, checks: checks.value, screens, variants, standIns };
}

/** A stand-in drawn in its place by the real renderer: a plain note that says what it is and what it waits for. */
export const standInBlock = (s) => ({ kind: 'note', span: s.span, body: `Not drawable yet: ${s.name}. It needs ${s.needs}.` });

/**
 * What one board draws, in order: `today` (the screen without the board's skin, only when it has one), `candidate`
 * (the board as it would ship), and each variant, a `.css` put after the skin and a `.dog` in place of the page.
 */
export function drawingsOf(b) {
  const css = (more) => [b.skin, more].filter((c) => typeof c === 'string' && c.trim() !== '').join('\n') || undefined;
  const out = [];
  if (css() !== undefined) out.push({ id: 'today', body: b.body, css: undefined });
  out.push({ id: 'candidate', body: b.body, css: css() });
  for (const v of b.variants) out.push({ id: `variant-${v.id}`, body: v.body ?? b.body, css: css(v.css) });
  return out;
}

/** The screens a drawing shows: the board's page first, then the screens its checks name, as `capture.mjs` takes them. */
export const screensFor = (b, body) => [
  ...(body ? [{ key: slugOf(body.page), name: String(body.title ?? body.page), path: `/p/${slugOf(body.page)}`, why: "the board's own page" }] : []),
  ...b.screens,
];

/** Every picture in a folder and its sha256, by name. The look's contact sheets are not pictures of the board. */
export function imagesIn(dir, prefix = '') {
  if (!existsSync(dir)) return {};
  const names = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('sheet-')).sort();
  return Object.fromEntries(names.map((f) => [`${prefix}${f}`, sha256(readFileSync(join(dir, f)))]));
}

/** The commit the tree is at, or `null` outside a repository. */
export const commitOf = (root) => {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/**
 * Install a page on the look's copy through the public write path, the version kept so a second drawing of the same
 * page is an edit and not a clash. A refusal is the record's own sentence, and stops the drawing.
 */
export async function install(origin, body, held = new Map()) {
  const version = held.get(body.page);
  const res = await fetch(`${origin}/api/setDeclaration`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(version === undefined ? { body } : { body, version }),
  });
  const said = await res.json().catch(() => null);
  if (said?.ok !== true) throw new Error(`The record would not take the board's page ${body.page}: ${said?.refusal?.fix ?? `it answered ${res.status}`}`);
  const mine = (Array.isArray(said.value) ? said.value : []).find((d) => d.id === `page.${body.page}`);
  if (typeof mine?.version === 'number') held.set(body.page, mine.version);
}

/** The yes `--yes` writes, from a drawing, or a refusal when the board or its governed files moved since. */
export function yesOf(root, board, drawing, { said, taken, seen = false, units, at = new Date() }) {
  if (typeof said !== 'string' || said.trim() === '') throw new Error('A yes holds the words said: --yes "<the words of the yes>".');
  if (drawing.board !== board) throw new Error(`That drawing is of the ${drawing.board} board, not ${board}.`);
  const now = standing(root, board);
  const moved = [
    ...Object.keys({ ...now.paths, ...drawing.paths }).filter((f) => now.paths[f] !== drawing.paths?.[f]),
    ...Object.keys({ ...now.drawn, ...drawing.drawn }).filter((f) => now.drawn[f] !== drawing.drawn?.[f]).map((f) => `${BOARDS}/${board}/${f}`),
  ];
  if (moved.length > 0) throw new Error(`${moved.slice(0, 5).join(', ')} changed since this drawing, so it is not what the yes would be given to. Draw the board again.`);
  const candidate = drawing.drawings?.find((d) => d.id === 'candidate');
  if (!candidate || Object.keys(candidate.images ?? {}).length === 0) throw new Error('That drawing holds no pictures of the candidate.');
  const was = readJson(join(root, BOARDS, board, 'yes.json')).value ?? {};
  return {
    board,
    units: units ?? (Array.isArray(was.units) ? was.units : []),
    said: said.trim(),
    taken: { on: at.toISOString().slice(0, 10), from: taken ?? 'the owner\'s word' },
    seen: seen === true,
    source: drawing.source,
    images: candidate.images,
    widths: drawing.widths,
    themes: drawing.themes,
    commit: drawing.commit,
    paths: now.paths,
    drawn: now.drawn,
  };
}

/**
 * The source a board draws from, the look's own (`sources/`). `shape:<path>` is a shape copy, opened by the file
 * source's `openShape` (PRF-A13 job 5, in `sources/file.mjs`), and said to wait for that job until it is there.
 */
export async function openFor(asked) {
  if (asked.name === 'shape') {
    const { openShape } = await import('./sources/file.mjs');
    if (typeof openShape !== 'function') throw new Error(`The shape copy is not built yet: it arrives with ${UNTIL.shape}. Draw the board from lived or a record file meanwhile.`);
    if (!asked.arg) throw new Error('Name the shape copy to draw: --source shape:<path>, a file made by braindog export --shape.');
    return openShape(asked.arg);
  }
  const { openSource } = await import('./run.mjs');
  return openSource(asked, { env: processEnv });
}

/**
 * Draw a board: every drawing at the four widths in both themes, and `drawing.json`. Returns the drawing. The server
 * and the source are closed whatever happens.
 */
export async function draw({ board, source: asked, out: given }, root = ROOT) {
  const b = readBoard(root, board);
  const want = asked ?? sourceOf(typeof b.checks.source === 'string' ? b.checks.source : 'lived');
  const { appShell, webBuildUnmet } = await import('../gates/lib.mjs');
  const build = join(root, 'apps', 'web', 'build');
  if (!existsSync(appShell(build))) throw new Error('There is no built app to draw. Run pnpm --filter @braindog/web build first.');
  const stale = await webBuildUnmet(root);
  if (stale !== null) throw new Error(`${stale}. Run pnpm --filter @braindog/web build first.`);
  const source = await openFor(want);
  const stamp = new Date().toISOString().slice(0, 16).replace(':', '-');
  const out = given === undefined ? join(root, DRAWINGS, `${board}-${stamp}`) : resolve(given);
  mkdirSync(out, { recursive: true });
  const { serve } = await import('./run.mjs');
  const { answers } = await import('../gates/record.mjs');
  const { default: capture } = await import('./capture.mjs');
  let served = null;
  const drawing = {
    board,
    title: b.checks.title ?? board,
    source: source.name,
    record: source.record,
    at: new Date().toISOString(),
    commit: commitOf(root),
    widths: WIDTHS,
    themes: THEMES,
    checks: Array.isArray(b.checks.checks) ? b.checks.checks : [],
    standIns: b.standIns.map(({ id, name, needs }) => ({ id, name, needs })),
    ...standing(root, board),
    drawings: [],
  };
  delete drawing.patterns;
  try {
    served = await serve(source, { build: join(root, 'apps', 'web', 'build') });
    await answers(served.origin);
    const held = new Map();
    for (const d of drawingsOf(b)) {
      if (d.body) await install(served.origin, d.body, held);
      const folder = join(out, d.id);
      mkdirSync(folder, { recursive: true });
      const said = await capture({
        origin: served.origin,
        app: served.app,
        set: board,
        out: folder,
        source: { ...source, widths: WIDTHS, screens: screensFor(b, d.body), ...(d.css === undefined ? {} : { css: d.css }) },
      });
      drawing.drawings.push({ id: d.id, verdict: said.look.verdict, missing: said.missing, images: imagesIn(folder, `${d.id}/`) });
      writeFileSync(join(out, 'drawing.json'), `${JSON.stringify(drawing, null, 2)}\n`);
    }
  } finally {
    await served?.close();
    await source.close();
  }
  return { out, drawing };
}

async function main() {
  const asked = parseArgs(argv.slice(2));
  if (asked.yes !== undefined) {
    const drawing = JSON.parse(readFileSync(join(resolve(asked.from), 'drawing.json'), 'utf8'));
    const yes = yesOf(ROOT, asked.board, drawing, { said: asked.yes, taken: asked.taken, seen: asked.seen, units: asked.units });
    const file = join(ROOT, BOARDS, asked.board, 'yes.json');
    writeFileSync(file, `${JSON.stringify(yes, null, 2)}\n`);
    console.log(`  board ${asked.board}: the yes is kept in ${BOARDS}/${asked.board}/yes.json, naming ${Object.keys(yes.images).length} pictures and ${Object.keys(yes.paths).length} governed files.`);
    return;
  }
  const { out, drawing } = await draw(asked);
  const pictures = drawing.drawings.reduce((n, d) => n + Object.keys(d.images).length, 0);
  console.log(`  board ${drawing.board}: ${pictures} pictures from ${drawing.record} in ${drawing.drawings.length} drawing(s), ${drawing.standIns.length} stand-in(s), in ${out}`);
  for (const d of drawing.drawings) console.log(`  ${d.id}: ${d.verdict}${d.missing.length > 0 ? `, ${d.missing.length} screen(s) not drawn` : ''}`);
  const { boardSheets } = await import('./board-sheet.mjs');
  for (const f of await boardSheets(out)) console.log(`  sheet: ${f}`);
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href)
  main().catch((e) => {
    console.error(`  board refused: ${e instanceof Error ? e.message : String(e)}`);
    exit(1);
  });
