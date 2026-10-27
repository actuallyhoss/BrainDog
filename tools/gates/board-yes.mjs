/**
 * `board-yes`: a screen is not restyled without a board with a yes (rule 7 of the experience area).
 *
 *   node tools/gates/board-yes.mjs [root]
 *
 * THE LOOK WAS BUILT WITH NO PICTURE ANYBODY SAID YES TO, and nothing could have stopped it: the
 * boards were eleven static files outside the repository. A board is now a folder, `design/boards/<board>/`, drawn by
 * the product's own renderer (`tools/look/board.mjs`), and its `yes.json` holds the words of the yes and the hashes of
 * what was seen. This gate reads every board folder and holds three things:
 *
 *   * A GOVERNED PATH THAT CHANGED. `paths.json` names the source the board governs (globs). `yes.json`'s `paths` holds
 *     each governed file's sha256 as it was when the board was drawn. A governed file whose hash is not that one, or
 *     that its yes never named, changed without a board with a yes, and that is red.
 *   * A YES WITH NO PICTURES. `yes.json` names one image hash for each width and theme it says were seen. Fewer is a yes
 *     to something nobody can point at, and that is red too.
 *   * A BOARD THAT DRIFTED. `drawn` holds the hash of each of the board's own files (`page.dog`, `skin.css`,
 *     `variants/*`, `stand-ins/*`). One edited after its yes is not the board the yes was given to.
 *
 * A BOARD WITH NO `yes.json` GOVERNS NOTHING YET, so the gate starts quiet and tightens board by board. A board with a
 * `yes.json` and no `paths.json` holds only its own drift. `board`, `units` and `said` are what 
 * reads (`readYes`), so a yes the planner counts is a yes this gate holds.
 *
 * HASHES ARE OF THE TEXT WITH ITS LINE ENDINGS FOLDED, so a checkout that writes CRLF reads the same file. Images are
 * hashed as bytes by `board.mjs`, which writes them; this gate never opens a picture.
 *
 * IT RETURNS 1 FOR RED, 3 WHEN THE ROOT HOLDS NO BOARDS FOLDER, AND FALLS OFF THE END FOR A PASS.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filesOf } from './public-clean.mjs';

/** Where boards live, from the repository's top. */
export const BOARDS = 'design/boards';

/** What a look draws when a yes does not say: the four widths and both themes (`tools/look/board.mjs`). */
export const WIDTHS = [390, 1440, 1512, 1728];
export const THEMES = ['light', 'dark'];

/**
 * A board's own files, which are what was seen drawn: the page, the sample page, the skin patch, the variants, the
 * stand-ins and each pick's slot and sheets, so a sample page or a pick edited after its yes needs a new yes.
 */
export const DRAWN = /^(?:page\.dog|specimen\.dog|skin\.css|variants\/[^/]+\.(?:css|dog)|stand-ins\/[^/]+\.json|picks\/[^/]+\/(?:slot\.json|[^/]+\.css))$/u;

const HEX = /^[0-9a-f]{64}$/u;

/** sha256 of bytes, as hex. */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** sha256 of a text file with CRLF folded to LF, or of its bytes when it holds a NUL. `null` when it cannot be read. */
export function hashOf(file) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    return null;
  }
  if (bytes.subarray(0, 8000).includes(0)) return sha256(bytes);
  return sha256(bytes.toString('utf8').replace(/\r\n/gu, '\n'));
}

/**
 * A glob as a pattern over repository paths: `**` any depth, `*` and `?` inside one folder, and a pattern ending in `/`
 * every file under that folder. A pattern with no wildcard names one file.
 */
export function globRe(glob) {
  const g = glob.endsWith('/') ? `${glob}**` : glob;
  let out = '';
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      i += 1;
      if (g[i + 1] === '/') {
        i += 1;
        out += '(?:.*/)?';
      } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${out}$`, 'u');
}

/** The files of `files` any of `patterns` names, sorted. */
export const governedOf = (patterns, files) => {
  const res = patterns.map(globRe);
  return files.filter((f) => res.some((re) => re.test(f))).sort();
};

/** `{ value }` or `{ fix }`: a JSON file read, or the sentence that says why not. */
export function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (e) {
    return { fix: e?.code === 'ENOENT' ? 'is missing' : `does not read as JSON (${String(e?.message ?? e).split('\n')[0]})` };
  }
}

/** The patterns of a `paths.json`: a list, or `{ paths: [...] }`. `null` when it says neither. */
export const patternsOf = (v) => {
  const list = Array.isArray(v) ? v : Array.isArray(v?.paths) ? v.paths : null;
  return list !== null && list.every((p) => typeof p === 'string' && p.trim() !== '') ? list : null;
};

/** A board's own drawn files, relative to its folder, sorted. */
export function drawnFiles(dir) {
  const out = [];
  const walk = (at, rel) => {
    for (const name of readdirSync(at)) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) walk(full, `${rel}${name}/`);
      else if (DRAWN.test(`${rel}${name}`)) out.push(`${rel}${name}`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
}

/** The board folders under a root, by name, sorted. Empty when there is no boards folder. */
export function boardsIn(root) {
  const dir = join(root, BOARDS);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * The hashes a yes holds for one board as it stands: `{ paths, drawn }`, each file to its sha256. `board.mjs` writes
 * these into a drawing, and `--yes` copies them into `yes.json`, so the gate and the tool read one sum.
 */
export function standing(root, board, files = filesOf(root) ?? []) {
  const dir = join(root, BOARDS, board);
  const read = readJson(join(dir, 'paths.json'));
  const patterns = read.value === undefined ? [] : (patternsOf(read.value) ?? []);
  /* A BOARD FOLDER IS NEVER GOVERNED SOURCE, its own or another's: a glob wide enough to reach `yes.json` would hash
     the yes before `--yes` wrote it and read it changed for good. A board's own files are held by `drawn`. */
  const source = files.filter((f) => !f.startsWith(`${BOARDS}/`));
  const paths = Object.fromEntries(governedOf(patterns, source).map((f) => [f, hashOf(join(root, f))]));
  const drawn = Object.fromEntries(drawnFiles(dir).map((f) => [f, hashOf(join(dir, f))]));
  return { patterns, paths, drawn };
}

/** How many images a yes names, whether as `{ name: sha256 }` or `[sha256]`, counting only real hashes. */
export const imagesNamed = (images) => {
  const list = Array.isArray(images) ? images : images !== null && typeof images === 'object' ? Object.values(images) : [];
  return list.filter((h) => typeof h === 'string' && HEX.test(h)).length;
};

/** The findings for one board, each a line that starts with the file it is about. */
export function judge(root, board, files) {
  const at = `${BOARDS}/${board}`;
  const dir = join(root, at);
  const said = readJson(join(dir, 'yes.json'));
  if (said.fix === 'is missing') return { governs: 0, findings: [] };
  if (said.value === undefined) return { governs: 0, findings: [`  ${at}/yes.json  ${said.fix}, so this screen has no board with a yes.`] };
  const yes = said.value ?? {};
  const findings = [];
  const pathsRead = readJson(join(dir, 'paths.json'));
  if (pathsRead.value !== undefined && patternsOf(pathsRead.value) === null)
    findings.push(`  ${at}/paths.json  is not a list of paths, so what this board governs cannot be read.`);
  else if (pathsRead.fix !== undefined && pathsRead.fix !== 'is missing') findings.push(`  ${at}/paths.json  ${pathsRead.fix}.`);
  const now = standing(root, board, files);
  const governs = Object.keys(now.paths).length;
  const nowords = typeof yes.said !== 'string' || yes.said.trim() === '';
  if (nowords) findings.push(`  ${at}/yes.json  holds no words in said, so this screen has no board with a yes.`);
  /* `board` AND `units` ARE WHAT THE PLANNER COUNTS: a yes that names neither holds
     every unit waiting on it for good, so it is said here rather than found a batch later. */
  if (typeof yes.board !== 'string' || yes.board.trim() === '' || !Array.isArray(yes.units) || yes.units.some((u) => typeof u !== 'string'))
    findings.push(`  ${at}/yes.json  names no board or no list of units, so the planner cannot count this yes. Take it again with board.mjs --yes.`);
  if (yes.seen !== undefined && typeof yes.seen !== 'boolean')
    findings.push(`  ${at}/yes.json  says seen is ${JSON.stringify(yes.seen)}, and seen is true once the pictures have been looked at, false until then.`);
  const widths = Array.isArray(yes.widths) && yes.widths.length > 0 ? yes.widths : WIDTHS;
  const themes = Array.isArray(yes.themes) && yes.themes.length > 0 ? yes.themes : THEMES;
  /* EVERY WIDTH AND BOTH THEMES A BOARD IS DRAWN AT: a yes that says it saw fewer would need fewer pictures, and a yes
     to the laptop alone is no yes to the phone. */
  const short = [...WIDTHS.filter((w) => !widths.includes(w)), ...THEMES.filter((t) => !themes.includes(t))];
  if (short.length > 0)
    findings.push(`  ${at}/yes.json  was not taken at ${short.join(', ')}, so this screen has no board with a yes: draw it at every width in both themes and take the yes from the drawing.`);
  const need = widths.length * themes.length;
  const have = imagesNamed(yes.images);
  if (have < need)
    findings.push(`  ${at}/yes.json  names ${have} image hash(es) for ${widths.length} width(s) and ${themes.length} theme(s), so this screen has no board with a yes: draw it and take the yes from the drawing.`);
  const hashes = yes.paths !== null && typeof yes.paths === 'object' ? yes.paths : {};
  for (const [file, hash] of Object.entries(now.paths)) {
    if (hashes[file] === hash) continue;
    const how = hashes[file] === undefined ? 'is governed by it and its yes never named it' : 'changed since its yes';
    findings.push(
      `  ${file}  ${how} (the ${board} board), so this screen has no board with a yes. ` +
        `Draw it with node tools/look/board.mjs ${board} and take the yes again, which writes the new hashes to ${at}/yes.json.`,
    );
  }
  /* A FILE ITS YES NAMED THAT IS GONE is a change to the screen as much as an edit is. */
  for (const file of Object.keys(hashes)) {
    if (Object.hasOwn(now.paths, file) || !now.patterns.some((p) => globRe(p).test(file))) continue;
    findings.push(`  ${file}  is gone, and the yes to the ${board} board named it, so this screen has no board with a yes.`);
  }
  const was = yes.drawn !== null && typeof yes.drawn === 'object' ? yes.drawn : {};
  for (const file of new Set([...Object.keys(now.drawn), ...Object.keys(was)])) {
    if (was[file] === now.drawn[file]) continue;
    const how = now.drawn[file] === undefined ? 'is gone, and its yes named it' : was[file] === undefined ? 'was added after its yes' : 'was edited after its yes';
    findings.push(`  ${at}/${file}  ${how}, so it is not the board the yes was given to. A board changed after its yes needs a new yes.`);
  }
  /* EVERY PICK HAS ITS ANSWER IN THE YES, chosen or left at its default: a yes missing one is a yes to a screen with a
     choice nobody made (look-sheet-50, the scope's Done line). */
  const slotDir = join(dir, 'picks');
  if (existsSync(slotDir))
    for (const p of readdirSync(slotDir).sort()) {
      if (!statSync(join(slotDir, p)).isDirectory()) continue;
      const s = readJson(join(slotDir, p, 'slot.json')).value;
      const got = yes.picks?.[p];
      if (!got || !Array.isArray(s?.options) || !s.options.some((o) => o.id === got.option))
        findings.push(`  ${at}/yes.json  holds no pick for ${p}, chosen or defaulted, so this screen has no board with a yes. Take it again with node tools/look/picks.mjs yes.`);
    }
  return { governs, findings };
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned. Nothing here happens on import. The root defaults
 * to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims a gate at its seeded tree.
 */
export default function boardYes(root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')) {
  const ROOT = resolve(root);
  const boards = boardsIn(ROOT);
  if (!existsSync(join(ROOT, BOARDS))) {
    console.log(`  board-yes: there is no ${BOARDS} folder in ${ROOT}, so no board governs anything here. Skipped.`);
    return 3;
  }
  const files = filesOf(ROOT) ?? [];
  const findings = [];
  let held = 0;
  let governs = 0;
  for (const b of boards) {
    const r = judge(ROOT, b, files);
    if (existsSync(join(ROOT, BOARDS, b, 'yes.json'))) held += 1;
    governs += r.governs;
    findings.push(...r.findings);
  }
  const where = `${boards.length} board(s), ${held} with a yes, governing ${governs} file(s)`;
  if (findings.length === 0) {
    console.log(`  board-yes: ${where}, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  board-yes: ${where}, ${findings.length} finding(s).\n` +
      '  A screen a board governs changes only with a board with a yes: draw it with tools/look/board.mjs, show the\n' +
      '  sheet, and take the yes with board.mjs --yes, which writes the hashes this gate reads.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = boardYes(process.argv[2]) ?? 0;
