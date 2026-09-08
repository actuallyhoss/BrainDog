/**
 * Every key this product prints is a key that does something.
 *
 *   node tools/gates/keys.mjs
 *
 * `19 §4` makes the keymap "a registry the dispatcher consults" for two reasons, and the second is
 * the one this checks: *"a `?` sheet that documents the bindings by READING them, so it cannot drift
 * from what is bound"*. `50 §9`'s `keys-sheet` gate is specified for it — *"the `?` sheet lists
 * exactly the registry; every palette row's printed `<kbd>` matches its binding"*.
 *
 * IT HAD DRIFTED THREE WAYS, and a sweep of 379 clicked controls found them, not a gate. `f`
 * "Filter" was advertised on every register long after the filter drawer was deleted; `o` was
 * printed on a saved view's own "Open Obligations" button with nothing listening; `y` was printed on
 * a row page that registered no key listener at all, under a comment saying it had been fixed. A
 * registry read by a sheet and by nothing else is a list of claims.
 *
 * TWO QUESTIONS, AND THE FIRST ONE IS WHY THIS IS NOT A HAND-WRITTEN LIST.
 *
 *   1. Every bare binding in the registry has a RECIPE here — a route, a setup, and the keys to
 *      press. Add a row to the registry and this goes red until somebody says how it is exercised.
 *      That is the direction the coupling has to run: the registry is the claim, and the gate has to
 *      be forced to keep up with it rather than the other way round.
 *   2. Every recipe produces a change. Not the RIGHT change — a gate cannot judge that — but any
 *      change at all in the URL, the DOM, an open dialog, a toast, the focused element or a live
 *      region. That is the question none of the other seventeen gates asked.
 *
 * A RECIPE IS A PRECONDITION, NOT A CHEAT. `o` on a grid follows the ref the focused cell points at,
 * so a cell with no ref is correctly silent and pressing it there would prove nothing; `k` on the
 * first row has nowhere to go. The first version of this gate pressed every key on a fresh page and
 * called seven of fifteen dead — five of them correct behaviour. A gate that cries wolf is worse
 * than no gate, because the next person turns it off.
 *
 * CHORDS AND THE TWO OVERLAY SCOPES ARE OUT. A modifier spelling would have to be invented here, and
 * `palette` and `nav` need a state open first — the a11y gate's `STATES` drives both by keystroke
 * already. `bare: false` rows are skipped, and skipped rows are counted so the number is honest.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { budget } from './lib.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const ROOT = join(REPO, 'apps', 'web', 'build');
const REGISTRY = join(REPO, 'apps', 'web', 'src', 'lib', 'a11y', 'keys.svelte.ts');
const PORT = budget('keys').port;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

if (!(await stat(ROOT).catch(() => null))) {
  console.log('  keys: no build to check. `pnpm build` first, and CI does.');
  process.exit(3);
}

/* Read as text, not imported: the registry uses runes, so anything reaching it cannot load outside
   a Svelte build — the same reason `silenced` lives next door in a plain `.ts`. */
const source = await readFile(REGISTRY, 'utf8');
const rows = [
  ...source.matchAll(/\{\s*id:\s*'([^']+)',\s*scope:\s*'([^']+)',\s*key:\s*'([^']+)',[^}]*?bare:\s*(true|false)/g),
].map((m) => ({ id: m[1], scope: m[2], key: m[3], bare: m[4] === 'true' }));

if (rows.length < 20) {
  console.error(`  keys: read ${rows.length} bindings from the registry, which cannot be right.`);
  process.exit(1);
}

const GRID = '/r/obligations';
const focusFirstCell = async (page) => {
  await page.locator('[role="row"] .td').first().click();
};

/**
 * How each bare binding is exercised, by id.
 *
 * `press` is a list of Playwright key names, sent in order — which is how a SEQUENCE is tested at
 * all: `g` on its own arms a prefix and changes nothing anybody can see, so a `goto` run presses `g`
 * then a letter and the change is the navigation.
 *
 * `runs` IS THE PLURAL, AND IT EXISTS BECAUSE ONE RUN WAS NOT ENOUGH. The registry advertises
 * `g then h d i s v p ,` — seven destinations on one row — and this gate proved the row by pressing
 * `g h` and nothing else. So `s` could be deleted from the chord map and 344 tests, `dead-copy` and
 * this gate all stayed green, which is the exact defect it was written to make impossible: *"a key we
 * print that nothing binds"*. A row that advertises seven letters is checked on seven letters.
 */
const RECIPES = {
  'palette-slash': { route: '/', press: ['/'] },
  /**
   * Every destination the row names, from a route that is none of them AND HAS NO BARE BINDINGS OF
   * ITS OWN.
   *
   * It ran on `/r/obligations`, where `p` is `peek` and `v` is `display` on the grid's own key
   * handler — and the layout's `g`-armed branch `return`s without `stopPropagation`, so the grid
   * fires too and the snapshot changes whatever the chord did. Measured: deleting `p` and `v` from
   * the chord map left the gate reporting **18 checked, 0 dead**. Two of the seven letters could not
   * fail, on the gate written to make exactly that impossible.
   *
   * `/decide` binds nothing bare, so a change there is the navigation and nothing else.
   */
  goto: {
    runs: ['h', 'd', 'i', 's', 'v', 'p', ','].map((letter) => ({ route: '/decide', press: ['g', letter] })),
  },
  'goto-nav': { route: '/inbox', press: ['g', '1'] },
  help: { route: '/', press: ['?'] },

  'row-down': { route: GRID, setup: focusFirstCell, press: ['j'] },
  /* Down first: `k` on the first row has nowhere to go, and silence there is the right answer. */
  'row-up': { route: GRID, setup: focusFirstCell, press: ['j', 'j', 'k'] },
  peek: { route: GRID, setup: focusFirstCell, press: ['p'] },
  select: { route: GRID, setup: focusFirstCell, press: ['x'] },
  edit: { route: GRID, setup: focusFirstCell, press: ['e'] },
  new: { route: GRID, setup: focusFirstCell, press: ['n'] },
  display: { route: GRID, setup: focusFirstCell, press: ['v'] },
  'copy-id': { route: GRID, setup: focusFirstCell, press: ['y'] },
  /* `o` FOLLOWS THE REF THE FOCUSED CELL POINTS AT, so the cell has to be one. On a cell with no
     `to:` there is nothing related and nothing should happen — which is why this walks right to the
     Project column rather than pressing it where it lands. */
  related: {
    route: GRID,
    setup: async (page) => {
      await focusFirstCell(page);
      for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    },
    press: ['o'],
  },

  /* A page's block cursor starts on the first block, which on `/p/kiln` is a stat tile with no
     register behind it. `j` moves to one that has. */
  'block-move': { route: '/p/kiln', press: ['j'] },
  'block-source': { route: '/p/kiln', press: ['j', 'o'] },
  'block-link': { route: '/p/kiln', press: ['j', 'y'] },

  /* The gate is a question, and a question has an address. There is no `/gate` route. */
  'gate-highlight': { route: '/decide/SG31', press: ['2'] },
  'gate-defer': { route: '/decide/SG31', press: ['d'] },
};

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).slice(1);
  if (rel.includes('..')) return res.writeHead(400).end();
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(ROOT, candidate);
    if ((await stat(file).catch(() => null))?.isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return createReadStream(file).pipe(res);
    }
  }
  if (!Object.hasOwn(TYPES, extname(rel))) {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return createReadStream(join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(PORT, r));

/** Everything a press could plausibly move, as one string. */
const SNAPSHOT = () => {
  const el = document.activeElement;
  return [
    location.pathname + location.search,
    String(document.body.innerHTML.length),
    String(document.querySelectorAll('dialog[open]').length),
    document.querySelector('.toast')?.textContent ?? '',
    el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : '',
    String(document.querySelectorAll('[data-focused], [aria-selected="true"], [data-on], [data-cursor]').length),
    [...document.querySelectorAll('[aria-live]')].map((n) => n.textContent).join('|').slice(0, 120),
  ].join('␟');
};

const browser = await chromium.launch();
const dead = [];
const uncovered = [];
let checked = 0;
let skipped = 0;

for (const row of rows) {
  if (!row.bare) {
    skipped++;
    continue;
  }
  /* THE TWO SCOPES THAT NEED A LAYER OPEN FIRST. The a11y gate drives both by keystroke already, so
     covering them here would be a second, weaker copy of a check that exists. */
  if (row.scope === 'palette' || row.scope === 'nav') {
    skipped++;
    continue;
  }

  const recipe = RECIPES[row.id];
  if (!recipe) {
    uncovered.push(`${row.id} (${row.scope}, "${row.key}")`);
    process.stdout.write('?');
    continue;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. `BRAINDOG_GATE_SEED=keys` swallows every `y` in
     the capture phase before any handler sees it — which is exactly what a binding that was never
     written looks like from outside — and the run must go red naming `copy-id`. */
  if (process.env.BRAINDOG_GATE_SEED === 'keys')
    await page.addInitScript(() => {
      addEventListener('keydown', (e) => e.key === 'y' && e.stopImmediatePropagation(), true);
    });
  /* One recipe or several — a row that advertises several keys is proved on each of them, and a
     single dead letter fails the row. */
  const runs = recipe.runs ?? [recipe];
  let alive = 0;
  for (const run of runs) {
    await page.goto(`http://localhost:${PORT}${run.route}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#main *', { timeout: 5000 }).catch(() => {});
    await page.addStyleTag({ content: '.rowgroup{content-visibility:visible !important}' });
    if (run.setup) await run.setup(page).catch(() => {});
    await page.waitForTimeout(140);

    const before = await page.evaluate(SNAPSHOT);
    for (const key of run.press) {
      await page.keyboard.press(key);
      await page.waitForTimeout(160);
    }
    const after = await page.evaluate(SNAPSHOT);

    if (before === after) {
      dead.push(`${row.id} (${row.scope}) — the sheet prints "${row.key}"; ${run.press.join(' then ')} on ${run.route} changes nothing`);
      process.stdout.write('!');
    } else {
      alive++;
      process.stdout.write('.');
    }
  }
  if (alive === runs.length) checked++;
  await context.close();
}

process.stdout.write('\n');
await browser.close();
server.close();

console.log(`  keys: ${checked} bare binding(s) pressed in their own scope, ${skipped} skipped, ${dead.length} dead`);

if (uncovered.length) {
  console.error('\n  a binding in the registry that this gate does not exercise:');
  for (const u of uncovered) console.error(`      ${u} — add a recipe to tools/gates/keys.mjs saying how it is pressed`);
}

if (dead.length) {
  console.error('\n  a key this product prints and does not answer:');
  for (const d of dead) console.error(`      ${d}`);
  console.error('\n  19 §4: the sheet documents the bindings by READING them, so it cannot drift from');
  console.error('  what is bound. Bind it, or take the row out of the registry.');
}

if (dead.length || uncovered.length) process.exitCode = 1;
