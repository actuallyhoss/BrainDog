/**
 * Every key this product prints is a key that does something.
 *
 *   node tools/gates/keys.mjs
 *
 * `19 §4` makes the keymap "a registry the dispatcher consults" for two reasons, and the second is
 * the one this checks: *"a `?` sheet that documents the bindings by READING them, so it cannot drift
 * from what is bound"*. `50 §9`'s `keys-sheet` gate is specified for it: *"the `?` sheet lists
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
 *   1. Every bare binding in the registry has a RECIPE here: a route, a setup, and the keys to
 *      press. Add a row to the registry and this goes red until somebody says how it is exercised.
 *      That is the direction the coupling has to run: the registry is the claim, and the gate has to
 *      be forced to keep up with it rather than the other way round.
 *   2. Every recipe produces a change. Not the RIGHT change (a gate cannot judge that) but any
 *      change at all in the URL, the DOM, an open dialog, a toast, the focused element or a live
 *      region. That is the question none of the other seventeen gates asked.
 *
 * A RECIPE IS A PRECONDITION, NOT A CHEAT. `o` on a grid follows the ref the focused cell points at,
 * so a cell with no ref is correctly silent and pressing it there would prove nothing; `k` on the
 * first row has nowhere to go. The first version of this gate pressed every key on a fresh page and
 * called seven of fifteen dead. Five of them were correct behaviour. A gate that cries wolf is worse
 * than no gate, because the next person turns it off.
 *
 * CHORDS AND THE TWO OVERLAY SCOPES ARE OUT. A modifier spelling would have to be invented here, and
 * `palette` and `nav` need a state open first. The a11y gate's `STATES` drives both by keystroke
 * already. `bare: false` rows are skipped, and skipped rows are counted so the number is honest.
 */

import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness } from './lib.mjs';
import { answers, forward, forwards, startRecord } from './record.mjs';

/* THE PREREQUISITE, FOR THE RUNNER TO CHECK RATHER THAN THIS FILE (`52 §5.1` step 2). Every
   question this gate asks is asked by pressing a key in a browser over the built app, so with no
   build there is nothing here that can be answered from source, and `run.mjs` refuses the gate
   before running it. The `stat(ROOT)` below stays for the person running this file directly.

   AND IT IS READ OFF THE MODULE RATHER THAN OUT OF THIS TEXT (`52 §5.1` step 3): `run.mjs` imports
   this file and reads `mod.needs` before it calls the gate, so the value the gate holds is the value
   the runner acts on. */
export const needs = ['web-build'];

/** The registry's rows, read out of `bindings.ts` as text: the registry uses runes, so it is never imported. */
export function bindingsIn(source) {
  return [
    ...source.matchAll(/\{\s*id:\s*'([^']+)',\s*scope:\s*'([^']+)',\s*key:\s*'([^']+)',[^}]*?bare:\s*(true|false)/g),
  ].map((m) => ({ id: m[1], scope: m[2], key: m[3], bare: m[4] === 'true' }));
}

/** A row this gate does not press: a chord (`bare: false`), or a row in the two scopes that need a layer open first. */
export const skips = (row) => !row.bare || row.scope === 'palette' || row.scope === 'nav';

/* THE BINDINGS SKIPPED, BY ID, OFF THIS REPOSITORY'S REGISTRY, so `ledger.mjs` reads how many without a browser or a
   build (PRF-B03 step 3). The run counts the same rows by the same `skips`, so the two cannot disagree. `ledger.json`
   holds `keys.SKIPPED` at its newest line: the list only shrinks, and a fall is a line written there. A registry that
   is not there is `null`, which the ledger names as not a list, rather than a throw that would stop `run.mjs` reading
   `needs`. */
const BINDINGS = join(import.meta.dirname, '..', '..', 'apps', 'web', 'src', 'lib', 'a11y', 'bindings.ts');
export const SKIPPED = existsSync(BINDINGS)
  ? bindingsIn(readFileSync(BINDINGS, 'utf8'))
      .filter(skips)
      .map((row) => row.id)
  : null;

/**
 * EVERY KEY, PRESSED, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK, which a spawned
 * one got for nothing: the process ending closed whatever it held. In this process a server left
 * listening is a handle the runner cannot exit past, and a
 * browser left running is a runner that never exits. All three are handed back in ONE `finally`,
 * which is what makes that true of a run that threw as well as of a run that finished; the early
 * returns inside it hand nothing back themselves, and the note there says why they must not.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function keys(root = join(import.meta.dirname, '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');
  /* `bindings.ts` AND NOT `keys.svelte.ts`. The registry used to live in the module that dispatches
     it, which uses runes, so nothing loadable by `node --test` could import it and the list of chords
     a browser owns had no test at all. The data is a plain module now and the dispatcher re-exports
     it; this gate reads the data. */
  const REGISTRY = join(root, 'apps', 'web', 'src', 'lib', 'a11y', 'bindings.ts');

  /**
   * WHEN THE `before` SNAPSHOT IS ALLOWED TO BE TAKEN, and this gate needed it more than the other
   * three.
   *
   * The verdict below is `before === after`, and `SNAPSHOT` includes
   * `document.body.innerHTML.length`. The wait that used to stand here was `networkidle`, a swallowed
   * selector and a fixed 140ms, so a response landing between the two snapshots moved that number and
   * the row was counted ALIVE whatever the key did. This gate, whose whole subject is "a key we print
   * that nothing binds", would have reported `0 dead` over a build with every handler deleted. Waiting
   * for the screen to settle first is the whole of the repair: `before` is then taken after the
   * response, and the only thing left that can move the length is the key.
   */
  const ready = readiness('keys', budget('ready').settleTimeoutMs, ROOT, { quietMs: budget('ready').quietMs });

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
    return 3;
  }

  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE RUN THROWS, which it was not.
   *
   * The three closes used to stand together near the bottom of this function on the straight-line
   * path, with no `try` above them. Anything between here and there that threw skipped all three:
   * `page.keyboard.press` past its timeout, a recipe's `setup`, `browser.newContext` on a machine with
   * no Chromium. `run.mjs` calls this gate IN-PROCESS, so what was skipped stayed open for the rest of
   * the run. Driven on 21 September by throwing immediately after `chromium.launch()` and asking the
   * OS for the port, which was then the fixed 4184 this gate no longer binds: `listen(4184)` came back
   * **EADDRINUSE** and `getActiveResourcesInfo()` still held three `TCPServerWrap` and one
   * `ProcessWrap` (the names that call returns, checked again on 21 September), so the next run wanting
   * that port could not bind and the runner had nothing left that would let it exit: the same script
   * under `timeout 60` was still running when the timeout killed it. With the `finally` the same throw
   * gave the port back, dropped the `ProcessWrap`, and the script reached the end of the event loop and
   * exited on its own inside a second. The port is ephemeral now, so a leak would no longer collide,
   * but the handles are still what keeps a runner from exiting, which is why the `finally` stays.
   *
   * `let`, BECAUSE THE FINALLY HAS TO SEE THEM HALF-BUILT. The whole point is the run that died before
   * the browser existed, and a `const` inside the block is out of scope for the hand-back.
   *
   * THE RECORD IS ONE OF THEM AND IS TAKEN INSIDE THE `try`, as `passkey.mjs` already took it. It used
   * to be awaited on the line above these declarations, which held only while nothing that can throw
   * stood between it and the `try`. On 22 September one such line was added there in a scratch copy,
   * and `test/handles.test.mjs` named the record as opened outside the `try` whose `finally` closes it.
   * A `startRecord()` that throws has already closed what it built (`record.mjs`), so `record` stays
   * `null` and the `finally` does not close it a second time.
   */
  let record = null;
  let server = null;
  let browser = null;
  try {
    /* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port. See `record.mjs`. WITH THE QUEUE PAGE
       (`/p/questions`), as `queue.mjs` takes it: since money-core 3.17.0 no seeded page draws the open questions as
       rows, and `page-answer` needs a page that does. */
    record = await startRecord(0, { queuePage: true });

    /* Read as text, not imported: the registry uses runes, so anything reaching it cannot load outside
       a Svelte build. That is the same reason `silenced` lives next door in a plain `.ts`. */
    const source = await readFile(REGISTRY, 'utf8');
    const rows = bindingsIn(source);

    if (rows.length < 20) {
      console.error(`  keys: read ${rows.length} bindings from the registry, which cannot be right.`);
      /* THE RECORD IS ALREADY UP BY HERE, AND THE `finally` BELOW HANDS IT BACK. As a script this line
         was `process.exit(1)` and the host died with the process; returning instead would leave a
         record answering on its own port for the rest of the run, which is why an `await record.close()`
         stood here. It has to GO now that one `finally` owns the three handles: two closes of the same
         record is not a harmless repeat. The second reaches `sql.close()` on a database already closed
         (`apps/selfhost/src/server.ts:72`, from `1213`) and throws `ERR_INVALID_STATE: database is not
         open` from inside `net`'s close callback, where no `await` can catch it, so the whole run dies.
         Driven on 21 September: `startRecord()` then `close()` twice takes the process down. */
      return 1;
    }

    const GRID = '/r/obligations';

    /* The cursor on the first item of a queue, before the key under test. */
    const onFirst = async (page) => {
      await page.keyboard.press('j');
      await page.waitForTimeout(120);
    };

    /**
     * THE CURSOR ON THE FIRST ROW OF TODAY THAT `test` ACCEPTS. Today is a declared page drawn as a home (`lib/page`,
     * PageBody in mode=home), whose `j` walks every row of every block: questions, tasks and what falls due. `x` ticks
     * only a task and a number answers only a question, so each is pressed on a row it can act on. The row the keys
     * hold is marked `data-row-cursor`, and `test` is run in the page on it.
     */
    const onTodayRow = (test) => async (page) => {
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('j');
        await page.waitForTimeout(120);
        if (await page.evaluate(test)) return;
      }
    };
    const onQuestion = onTodayRow(() => document.querySelector('[data-row-cursor] .queue-act') !== null);
    const onTask = onTodayRow(() => document.querySelector('[data-row-cursor] [role="checkbox"]') !== null);
    /* AND ON `/decide`, THE CURSOR ON A QUESTION'S CARD, which is what Decide's own keys act on (`questionUnder`). */
    const onCard = onTodayRow(() => document.querySelector('.qa[data-row^="q:"][data-row-cursor]') !== null);
    /* A CARD WITH AN OPTION TO ANSWER BY NUMBER, and one with the box `x` chooses it by.

       AND THE FIRST QUESTION `a` CAN ANSWER. `a` takes the suggested option or accepts a change, and a question with
       neither is one it rightly leaves alone, as is one that is hard to undo or moves money, which it opens instead.
       The record's rules raise questions of their own at the head of the queue (a balance to update, an invoice gone
       late) with two plain options and no suggestion, so the first card is not always one `a` has anything to do on.
       Each `j` moves one question; this stops on the first with a safe suggestion or an accept. DecisionCard marks its
       suggestion `.queue-option[data-recommended]` or `.queue-act[data-recommended]`. */
    const onCardAnswer = onTodayRow(() => document.querySelector('.qa[data-row^="q:"][data-row-cursor] .queue-act') !== null);
    const onCardSuggested = onTodayRow(() => {
      const card = document.querySelector('.qa[data-row^="q:"][data-row-cursor]');
      if (!card || card.querySelector('.queue-cost') !== null) return false;
      const press = card.querySelector('.queue-act[data-recommended], .queue-option[data-recommended] .queue-act') ?? card.querySelector('[id$="-opt-accept"]');
      return press !== null && press.hasAttribute('data-enter');
    });
    const onCardPick = onTodayRow(() => document.querySelector('.qa[data-row^="q:"][data-row-cursor] [role="checkbox"]') !== null);

    /**
     * THE WRITES A TICK OR AN ANSWER SENDS, HELD. One record serves every recipe in this run, in the registry's order,
     * and Today and Work come before the queues: `1` on Today answers the first open question, which is one `/decide`
     * opens on. The screen draws the press before it sends (the row goes, the option is chosen), so the change is
     * there to see; the request is refused at the socket and the record stays as the later recipes expect it.
     */
    const held = (setup) => async (page) => {
      await page.route(/\/api\/(?:decide|update)(?:\?|$)/u, (route) => route.abort());
      await setup(page);
    };

    /**
     * ONE READ'S ANSWER, CHANGED, WHICHEVER WAY IT IS ASKED. Since the client sends the reads a screen asks at once as
     * one `POST /api/reads` (`packages/client`, `inReadWave`, 24 October), a read by its own address is only one of the
     * two ways it reaches the record, and a `page.route` on that address alone never saw the Inbox's arrivals or SG4:
     * the screens drew the record's own answer and their keys were pressed on nothing to act on. Each call in a wave
     * carries the address it would have had (`at`), so the same pattern finds it there, and its answer is changed in
     * place, with every other answer in the wave left as the record gave it.
     */
    const answering = async (page, pattern, rewrite) => {
      await page.route(pattern, async (route) => {
        const res = await route.fetch();
        await route.fulfill({ response: res, json: rewrite(await res.json()) });
      });
      await page.route(/\/api\/reads(?:\?|$)/u, async (route) => {
        const calls = (() => {
          try {
            return JSON.parse(route.request().postData() ?? '{}').calls ?? [];
          } catch {
            return [];
          }
        })();
        const res = await route.fetch();
        const said = await res.json();
        const answers = said?.ok === true ? said.value?.answers : undefined;
        if (Array.isArray(answers))
          calls.forEach((call, i) => {
            if (typeof call?.at === 'string' && pattern.test(call.at) && answers[i]) answers[i] = { ...answers[i], status: 200, body: rewrite(answers[i].body) };
          });
        await route.fulfill({ response: res, json: said });
      });
    };

    /**
     * THE GATE'S RECORD HAS NO ARRIVALS, so an inbox key would be pressed on an empty state and read as dead.
     * Two are handed to the screen in the record's own shape, which is the read the keys act on; nothing is
     * written. Filing one then asks the record, which refuses an id it does not hold, and says so in a toast.
     */
    const arrivals = async (page) => {
      const line = (n) => ({
        rowid: n,
        id: `01KEYS${n}`,
        ts: '2026-09-03T09:00:00.000Z',
        channel: 'email',
        from: `someone${n}@example.test`,
        to: '',
        subject: `Arrival ${n}`,
        body: 'Words.',
        state: 'untriaged',
        reason: null,
      });
      await answering(page, /\/api\/inbox(?:\?|$)/u, () => ({ ok: true, value: { arrivals: [line(1), line(2)], cursor: null } }));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(200);
    };

    /**
     * NOR DOES IT HOLD A QUESTION WITH ROWS TO TICK, which is the only thing `e` edits on the gate: a proposal that adds
     * two or more (`picked.ts`). Its one rowset, SG4, changes two rows that exist, and a change is taken whole. So SG4's
     * read is handed to the screen as a proposal that adds two, in the record's own shape, as `arrivals` hands the Inbox
     * its two; nothing is written, and `e` puts the focus on the first tick.
     */
    const toTick = async (page) => {
      await answering(page, /\/api\/governance\?.*\bid=SG4(?:&|$)/u, (said) => {
        if (said?.ok === true && said.value?.body) said.value.body.rows = [{ name: 'Specimen site' }, { name: 'Licence generator' }];
        return said;
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.picks input').first().waitFor({ timeout: 4000 });
    };

    /* THE CARET'S OWN CELL, FOCUSED AND NOT CLICKED. The picker led every row in a cell of its own, and a click there
       put focus in the grid without opening anything. It sits among the row's verbs now, so the first cell is the
       title and a click on it opens the row: the grid's one tab stop is the way in a keyboard has. */
    const focusFirstCell = async (page) => {
      await page.locator('[role="gridcell"][tabindex="0"]').first().focus();
    };

    /**
     * How each bare binding is exercised, by id.
     *
     * `press` is a list of Playwright key names, sent in order, which is how a SEQUENCE is tested at
     * all: `g` on its own arms a prefix and changes nothing anybody can see, so a `goto` run presses `g`
     * then a letter and the change is the navigation.
     *
     * `runs` IS THE PLURAL, AND IT EXISTS BECAUSE ONE RUN WAS NOT ENOUGH. The registry advertises
     * `g then h d i s v p ,` (seven destinations on one row) and this gate proved the row by pressing
     * `g h` and nothing else. So `s` could be deleted from the chord map and 344 tests, `dead-copy` and
     * this gate all stayed green, which is the exact defect it was written to make impossible: *"a key we
     * print that nothing binds"*. A row that advertises seven letters is checked on seven letters.
     */
    const RECIPES = {
      'palette-slash-key': { route: '/', press: ['/'] },
      /**
       * Every destination the row names, from a route that is none of them AND HAS NO BARE BINDINGS OF
       * ITS OWN.
       *
       * It ran on `/r/obligations`, where `p` is `peek` and `v` is `display` on the grid's own key
       * handler, and the layout's `g`-armed branch `return`s without `stopPropagation`, so the grid
       * fires too and the snapshot changes whatever the chord did. Measured: deleting `p` and `v` from
       * the chord map left the gate reporting **18 checked, 0 dead**. Two of the seven letters could not
       * fail, on the gate written to make exactly that impossible.
       *
       * `/decide` binds bare keys of its own now, and each stands down on a key the shell already took (`defaultPrevented`), so a change there is still the navigation and nothing else.
       */
      goto: {
        runs: ['h', 'd', 'i', 's', 'v', 'p', ','].map((letter) => ({ route: '/decide', press: ['g', letter] })),
      },
      'goto-nav': { route: '/inbox', press: ['g', '1'] },
      help: { route: '/', press: ['?'] },

      /* TODAY, the declared page `/` opens on, drawn by PageView in home mode (`lib/page/PageBody.svelte` `homeKey`). The
         cursor starts on nothing, so `j` alone is the move; `k` is pressed from the second row, since on the first it
         has nowhere to go. */
      'today-move': {
        runs: [
          { route: '/', press: ['j'] },
          { route: '/', setup: async (page) => (await onFirst(page), onFirst(page)), press: ['k'] },
        ],
      },
      'today-tick': { route: '/', setup: held(onTask), press: ['x'] },
      'today-answer': { route: '/', setup: held(onQuestion), press: ['1'] },
      /* `n` puts the caret in the page's capture line (`.capture-input`), where a task is typed, and on the desk, which
         draws no line, in the ask bar's query. */
      'today-new': { route: '/', press: ['n'] },

      /* THE WORK PAGE, at `/?work` (`lib/work/Work.svelte`, the declared `page.work`, whose keys are the page
         reader's). Its keys act on the task under the cursor, so every one but the move and the one that goes to the
         capture line is pressed with the cursor on the first task. `e` opens the task beside the page with the caret
         in its words, `d` and `m` open the row's menu on the day and on the move. */
      'work-move': {
        runs: [
          { route: '/?work', press: ['j'] },
          { route: '/?work', setup: async (page) => (await onFirst(page), onFirst(page)), press: ['k'] },
        ],
      },
      'work-tick': { route: '/?work', setup: held(onFirst), press: ['x'] },
      'work-edit': { route: '/?work', setup: onFirst, press: ['e'] },
      'work-due': { route: '/?work', setup: onFirst, press: ['d'] },
      'work-lane': { route: '/?work', setup: onFirst, press: ['m'] },
      /* The page reader's `n` puts the caret in the capture line. */
      'work-new': { route: '/?work', press: ['n'] },

      'row-down': { route: GRID, setup: focusFirstCell, press: ['j'] },
      /* Down first: `k` on the first row has nowhere to go, and silence there is the right answer. */
      'row-up': { route: GRID, setup: focusFirstCell, press: ['j', 'j', 'k'] },
      peek: { route: GRID, setup: focusFirstCell, press: ['p'] },
      select: { route: GRID, setup: focusFirstCell, press: ['x'] },
      /**
       * ON A CELL THAT HOLDS A VALUE, WHICH THE FIRST ONE DOES NOT.
       *
       * `focusFirstCell` clicks the first `.td` of the first row and that is the selection picker: a
       * control rather than a value, so `e` there is correctly not an editor, and this recipe was
       * asserting the wrong claim about the right key. It is the same mistake the `related` note below
       * records, one column along.
       *
       * IT WALKS RATHER THAN CLICKING THE CELL IT WANTS, because a click on a value cell OPENS THE
       * ROW: the recipe would leave the register entirely and then press `e` on a screen that has no
       * grid. `Home` puts the caret at the start of the row whatever the click left it on, and one
       * column along is the first cell that says what the row IS, which is the cell this key is about.
       * It was two while the id held the second column; the id ends the row now.
       */
      edit: { route: GRID, setup: focusFirstCell, press: ['Home', 'ArrowRight', 'e'] },
      new: { route: GRID, setup: focusFirstCell, press: ['n'] },
      display: { route: GRID, setup: focusFirstCell, press: ['v'] },
      'copy-id': { route: GRID, setup: focusFirstCell, press: ['y'] },
      /* `o` FOLLOWS THE REF THE FOCUSED CELL POINTS AT, so the cell has to be one. On a cell with no
         `to:` there is nothing related and nothing should happen, which is why this walks to the Project
         column rather than pressing it where it lands.

         IT WALKED A FIXED EIGHT AND LANDED ON THE CLAMP. `ArrowRight` stops at the last column, and
         Project happened to BE the last column, so eight presses from a caret that starts on column two
         overshot by two and arrived anyway. Adding a trailing column of row verbs moved the clamp one
         place along and the key went dead: not because `o` broke, but because the recipe had been
         asserting the position of the end of the row rather than the position of a `ref`.

         IT WALKS UNTIL THE CARET IS ON THE COLUMN IT MEANS. The header row names the columns and a
         grid has exactly one tab stop, so both ends of the question are readable from the page: which
         column is Project, and which column the caret is on. Neither is counted from out here any more.
         The loop is capped, so a register with no Project column is a walk that ends rather than a gate
         that hangs. */
      related: {
        /* `/r/tasks` AND NOT `/r/obligations`, WHICH IS WHERE EVERY OTHER GRID RECIPE RUNS.
           `o` follows the ref the focused cell points at, so the register under test has to draw one.
           Obligations stopped drawing its two: a list now opens on the fields its declaration nominates
           rather than on every field marked `index: true`, and neither `party` nor `thing` is among
           them for that register. The key is not dead, and this recipe was reporting it dead because it
           was pressing it on a screen with nothing to follow. Tasks draws Project by default and is the
           same grid with the same handler. */
        route: '/r/tasks',
        setup: async (page) => {
          await focusFirstCell(page);
          const at = () =>
            page.evaluate(() => {
              const heads = [...document.querySelectorAll('[role="columnheader"]')];
              const want = heads.findIndex((h) => (h.textContent ?? '').trim().toLowerCase() === 'project');
              const cell = document.querySelector('[role="gridcell"][tabindex="0"]');
              const now = cell ? [...(cell.parentElement?.children ?? [])].indexOf(cell) : -1;
              return { want, now };
            });
          for (let i = 0; i < 14; i++) {
            const { want, now } = await at();
            if (want < 0 || now < 0 || now === want) break;
            await page.keyboard.press(now > want ? 'ArrowLeft' : 'ArrowRight');
          }
        },
        press: ['o'],
      },

      /* A page's block cursor starts on nothing, and `j` puts it on the first block the page draws. `/p/kiln` opens
         with three blocks whose `when:` said no, and the cursor used to land on each of them in turn with nothing to
         show for it, so one `j` there changed nothing at all (`PageBody.svelte` walks the drawn blocks now).

         `o` IS PRESSED ON A BLOCK WITH A LIST BEHIND IT. It was pressed after one `j`, and the move was the change
         the gate saw, so `o` could have been unbound and this row stayed green. The setup walks the cursor to the
         first block whose bar links its list (`a.block-source`, `BlockSlot.svelte`), and the change is `o` opening it. */
      'block-move': { route: '/p/kiln', press: ['j'] },
      /* AND A PAGE THAT DRAWS ROWS IS WALKED ROW BY ROW (`PageBody.svelte`, `homeKey`), so on `/p/kiln` `j` puts the row
         cursor (`data-row-cursor`) on a task and never moves the block cursor at all. The setup waited for a block
         cursor that never came, walked off the end of the rows into a block with no list behind it, and `o` there is
         rightly silent: the gate read a working key as dead. It stops now on whichever cursor is on a block with a
         list, a block's own or a row's. */
      'block-source': {
        route: '/p/kiln',
        setup: async (page) => {
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press('j');
            await page.waitForTimeout(120);
            const ready = await page.evaluate(
              () =>
                document.querySelector('.block-slot[data-cursor] a.block-source') !== null ||
                document.querySelector('[data-row-cursor]')?.closest('.block-slot')?.querySelector('a.block-source') != null,
            );
            if (ready) return;
          }
        },
        press: ['o'],
      },
      'block-link': { route: '/p/kiln', press: ['j', 'y'] },

      /* THE ROW KEYS OF A PAGE AT ITS OWN ADDRESS (`/p/<slug>`, PageBody in mode=page with a host), pressed with the
         row cursor on a row each can act on, as Today's are. `/p/work` and not `/?work`, which the work-* recipes
         already press, so the page's own address is the one proved here. `/p/questions`, the gate record's queue page,
         draws the record's open questions as rows, which is where a number has an option to choose; the tick and the
         answer are held, as Today's are. NOT `/p/money` SINCE money-core 3.17.0: its questions went to Decide, and
         every other seeded queue is filtered to rows the seed's questions are not about. */
      'page-tick': { route: '/p/work', setup: held(onTask), press: ['x'] },
      'page-edit': { route: '/p/work', setup: onTask, press: ['e'] },
      'page-menu': { route: '/p/work', setup: onTask, press: ['m'] },
      'page-new': { route: '/p/work', press: ['n'] },
      'page-answer': { route: '/p/questions', setup: held(onQuestion), press: ['1'] },
      /* `+` OPENS THE QUICK-ADD SHEET over a page once the record's ledger is found, which is a dialog opening. Money's
         own page, so the record's ledger is on the screen it is added from; nothing is written by opening it. */
      'money-add': {
        route: '/p/money',
        setup: async (page) => {
          await page.locator('.qa-fab').waitFor({ state: 'attached', timeout: 4000 }).catch(() => undefined);
        },
        press: ['+'],
      },

      /* The gate is a question, and a question has an address. There is no `/gate` route. SG5 is the
         seeded record's Kiln licensing question (the sample's SG31): open, with three options. */
      'gate-highlight': { route: '/decide/SG5', press: ['2'] },
      'gate-edit': { route: '/decide/SG4', setup: toTick, press: ['e'] },
      'gate-defer': { route: '/decide/SG5', press: ['d'] },
      /* SG5 is not the last open question, so `j` has a next one to go to. */
      'gate-next': { route: '/decide/SG5', press: ['j'] },

      /* THE QUEUES, on the declared page at `/decide` since the classic screen went (24 October): the page reader walks
         with j and k, chooses a card with `x` and answers with its option's number (`PageBody.svelte` `homeKey`), and
         `e`, `a` and `d` are the page's own (`+page.svelte` `onkey`). The cursor starts on nothing, so a first `j` is the
         change for `decide-move`; every other key is pressed with the cursor already on a card by `setup`, or the `j`
         would be what changed the page. An answer is held at the socket as Today's are, so the queue stays as the later
         recipes expect it. */
      'decide-move': { route: '/decide', press: ['j'] },
      'decide-edit': { route: '/decide', setup: onCard, press: ['e'] },
      'decide-answer': { route: '/decide', setup: held(onCardAnswer), press: ['1'] },
      'decide-approve': { route: '/decide', setup: held(onCardSuggested), press: ['a'] },
      'decide-defer': { route: '/decide', setup: onCard, press: ['d'] },
      'decide-select': { route: '/decide', setup: onCardPick, press: ['x'] },
      'inbox-move': { route: '/inbox', setup: arrivals, press: ['j'] },
      'inbox-file': { route: '/inbox', setup: async (page) => (await arrivals(page), onFirst(page)), press: ['e'] },
      'inbox-select': { route: '/inbox', setup: async (page) => (await arrivals(page), onFirst(page)), press: ['x'] },
    };

    server = createServer(async (req, res) => {
      if (forwards(new URL(req.url ?? '/', 'http://x').pathname)) return forward(req, res, record.base);
      const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).slice(1);
      if (rel.includes('..')) return res.writeHead(400).end();
      for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(ROOT, candidate);
        if ((await stat(file).catch(() => null))?.isFile()) {
          res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
          return createReadStream(file).pipe(res);
        }
      }
      /* The SPA fallback is the app's shell, which is under `/app` in the build as it is on the host (`lib.mjs`). */
      if (!Object.hasOwn(TYPES, extname(rel))) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return createReadStream(appShell(ROOT)).pipe(res);
      }
      res.writeHead(404).end();
    });
    /* AN EPHEMERAL PORT, AS `passkey.mjs` AND `queue.mjs` TAKE ONE. This gate used to bind a fixed
       port out of `budgets.json`, and the CI runner is the same PC where sessions run this gate by
       hand, so a CI run and a desk run of it could meet on one port and one of the two would go red
       for a reason that is not in the tree. Port 0 is a port the
       operating system hands out free at the moment of the bind, and every URL below is built from
       what it handed out. `localhost` still, because the bind names no host and takes the dual-stack
       `::`, which is what `localhost` reaches first on this machine. */
    await new Promise((r) => server.listen(0, r));
    const PORT = server.address().port;
    await answers(`http://localhost:${PORT}`);

    /** Everything a press could plausibly move, as one string. */
    const SNAPSHOT = () => {
      const el = document.activeElement;
      return [
        location.pathname + location.search,
        String(document.body.innerHTML.length),
        String(document.querySelectorAll('dialog[open]').length),
        document.querySelector('.toast')?.textContent ?? '',
        /* WHICH ELEMENT, AND NOT ONLY WHAT KIND. `k` on Today moves focus from one row's `a.q-text` to the one above,
           and a tag and a class read the same on both, so a move between two rows alike was no change here. Its place
           in the document tells them apart and holds still while nothing moves. */
        el ? `${el.tagName}.${String(el.className).slice(0, 40)}#${Array.prototype.indexOf.call(document.getElementsByTagName('*'), el)}` : '',
        String(document.querySelectorAll('[data-focused], [aria-selected="true"], [data-on], [data-cursor]').length),
        [...document.querySelectorAll('[aria-live]')].map((n) => n.textContent).join('|').slice(0, 120),
      ].join('␟');
    };

    browser = await chromium.launch();
    const dead = [];
    const uncovered = [];
    /**
     * Runs whose page was never in a state to press a key on, which is its own sentence.
     *
     * NOT `dead`, AND THAT DISTINCTION IS THE POINT. "The sheet prints `y` and nothing answers it" sends
     * somebody into the key handler. A route that never drew is a fact about the route, and it must not
     * be reported as a fact about the binding.
     */
    const unsettled = [];
    let checked = 0;
    let skipped = 0;

    for (const row of rows) {
      /* CHORDS, AND THE TWO SCOPES THAT NEED A LAYER OPEN FIRST. The a11y gate drives both scopes by keystroke
         already, so covering them here would be a second, weaker copy of a check that exists. `SKIPPED` above is
         these same rows, counted by the same `skips`. */
      if (skips(row)) {
        skipped++;
        continue;
      }

      const recipe = RECIPES[row.id];
      if (!recipe) {
        uncovered.push(`${row.id} (${row.scope}, "${row.key}")`);
        process.stdout.write('?');
        continue;
      }

      /* `serviceWorkers: 'block'`, BECAUSE THE READ COPY'S WORKER ANSWERS `/api` FROM ITS OWN FETCH. The app registers
         it on every visit (`lib/data/offline.ts`), and from the first reload on the worker makes the request, which
         `page.route` never sees: `arrivals` handed the Inbox two rows and the Inbox drew the record's empty one, so
         every inbox key was pressed on an empty state and read as dead. No key here is about the worker. */
      /* OPENED THE ONE WAY EVERY GATE OPENS A PAGE (PRF-B04, `openPage`): the record's clock, the widest width `a11y` audits. */
      const runs = recipe.runs ?? [recipe];
      /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. `BRAINDOG_GATE_SEED=keys` swallows every `y` in
         the capture phase before any handler sees it, which is exactly what a binding that was never
         written looks like from outside. The run must go red naming `copy-id`. On the context before the first
         load (`openPage`'s `init`): put on the page after it, the first load ran without it. */
      const init =
        process.env.BRAINDOG_GATE_SEED === 'keys'
          ? () => {
              addEventListener('keydown', (e) => e.key === 'y' && e.stopImmediatePropagation(), true);
            }
          : undefined;
      const opened = await openPage(browser, `http://localhost:${PORT}${APP_BASE}${runs[0].route}`, {
        width: Math.max(...budget('a11y').widths),
        record,
        ready,
        serviceWorkers: 'block',
        /* WAITING FOR THE NETWORK TO GO QUIET, as this gate always did: at `domcontentloaded` the grid's rows were still
           arriving when the key was pressed, so the screen changed on its own and the planted dead `y` read as alive. */
        waitUntil: 'networkidle',
        ...(init === undefined ? {} : { init }),
      });
      const { context, page } = opened;
      /* One recipe or several: a row that advertises several keys is proved on each of them, and a
         single dead letter fails the row. */
      let alive = 0;
      for (const run of runs) {
        const unmeasured = ready.check(`${row.id} on ${run.route}`, run.route, await opened.goto(`http://localhost:${PORT}${APP_BASE}${run.route}`));
        if (unmeasured) {
          unsettled.push(unmeasured);
          process.stdout.write('~');
          continue;
        }
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
          dead.push(`${row.id} (${row.scope}): the sheet prints "${row.key}", and ${run.press.join(' then ')} on ${run.route} changes nothing`);
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

    console.log(
      `  keys: ${checked} bare binding(s) pressed in their own scope, ${skipped} skipped, ${dead.length} dead` +
        /* SAID IN THE SUMMARY AND NOT ONLY IN THE DETAIL, because this number is the one that decides
           what the other three mean: a run with unsettled pages pressed fewer keys than it looks. */
        (unsettled.length ? `, ${unsettled.length} run(s) on a page that never drew` : ''),
    );

    if (uncovered.length) {
      console.error('\n  a binding in the registry that this gate does not exercise:');
      for (const u of uncovered) console.error(`      ${u}. Add a recipe to tools/gates/keys.mjs saying how it is pressed.`);
    }

    if (dead.length) {
      console.error('\n  a key this product prints and does not answer:');
      for (const d of dead) console.error(`      ${d}`);
      console.error('\n  19 §4: the sheet documents the bindings by READING them, so it cannot drift from');
      console.error('  what is bound. Bind it, or take the row out of the registry.');
    }

    if (unsettled.length) {
      console.error('\n  a run whose page never drew, so the key was never really pressed at it:');
      for (const u of unsettled) console.error(`      ${u}`);
    }

    /**
     * AND A RUN WHERE NO ROUTE DREW IS RED.
     *
     * A recipe stands on a precondition: `o` follows the ref the focused cell points at, `j` moves down
     * a row that has to exist. Over screens with no rows every one of them is silent for a reason that
     * has nothing to do with its binding, and this gate would then be reporting on the record rather
     * than on the registry.
     */
    const blind = ready.nothingDrawn();
    if (blind) console.error(`\n  ${blind}`);

    if (dead.length || uncovered.length || unsettled.length || blind) return 1;
  } finally {
    /**
     * ALL THREE, AND ONE FAILURE MAY NOT COST THE OTHER TWO.
     *
     * `await browser.close()` first and unguarded would be the same defect one layer in: a browser that
     * had already crashed rejects there, the rejection leaves the `finally`, and the record and the
     * port stay open exactly as before. Each hand-back is therefore its own statement and swallows its
     * own failure. Nothing here is a second close: the early return above dropped its `record.close()`
     * for this, because two closes of one record throw `ERR_INVALID_STATE` out of `net`'s close
     * callback and take the process with them.
     */
    await browser?.close().catch(() => {});
    /* AWAITED, unlike the bare `server.close()` this replaces: the callback is the moment the listening
       socket is actually gone. The port is ephemeral, so no later gate is waiting on this number, but a
       socket still listening is a handle that keeps the runner from exiting. */
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED=keys` and
   the header documents `node tools/gates/keys.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await keys()) ?? 0;
