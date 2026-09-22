/**
 * The queue block, driven in a real browser: press an option, land on its gate highlighted and
 * unchosen; press the count of what is left, land on Decide.
 *
 *   node tools/gates/queue.mjs
 *
 * WHY THIS EXISTS. `queue` is drawn by `packages/render/svelte/Queue.svelte` and mirrored by
 * `packages/render/src/html.ts`, and both are tested at every seam by unit tests: the grammar in
 * `packages/render/src/queue.ts`, the parity between the two drawers, the row that reads the
 * evaluator's own `more | n | /decide`. NOTHING had ever driven it in a real browser, which is
 * exactly the seam every other gate in this directory exists to close for its own primitive. The
 * seeded Agents page (`packages/seed/src/packs/agents.ts`) opens with a `governance.open` queue, so
 * this gate drives `/p/agents` and nothing else.
 *
 * TWO BEHAVIOURS, AND BOTH ARE ABOUT WHAT ARRIVES ON THE OTHER SIDE OF A PRESS. `askGate` in
 * `apps/web/src/routes/p/[slug]/+page.svelte` sends a pressed option to `/decide/[id]?option=`, and
 * the gate reads that query once to set `highlighted`. The gate's own rule, written at the top of
 * `apps/web/src/routes/decide/[id]/+page.svelte`, is that a recommendation is DISPLAYED AND NEVER
 * PRE-CHOSEN: a question that arrives with an answer already picked is a question that gets pressed
 * through. So a run of this gate lands on a card that carries a recommended option, presses the
 * OTHER one on purpose, and checks three things: the gate it lands on is the same question the card
 * asked, the option pressed and none other carries `data-on`, and no commit step is open, because a
 * commit step open is what "already chosen" would look like on this screen.
 *
 * THE SECOND BEHAVIOUR IS THE LAST LINE OF A QUEUE THAT HOLDS MORE THAN IT DRAWS: `queueMore(n)`,
 * an `<a class="queue-more">` where the evaluator supplied an address and a bare `<p>` where it did
 * not (`packages/render/src/queue.ts`'s own comment: a count with nowhere to press is a dead end).
 * `apps/web/src/lib/record/blocks.ts`'s `queueRows` always writes `/decide` as that address for a
 * live record, so on the seeded Agents page this is provable rather than assumed, and the gate
 * checks it is provable before it asserts anything about it: if the seed ever draws a queue that
 * does not hold more than it shows, this half prints why it skipped rather than inventing a link
 * that is not there.
 *
 * THE THIRD BEHAVIOUR IS THE ORDER, which is the only one of these a unit test cannot reach the end
 * of. `19 §6`'s fourth countermeasure against a rubber stamp is the queue RANKED BY COST OF BEING
 * WRONG, and that rank is computed in `packages/kernel/src/weigh.ts`, carried down the page source
 * as a question row's seventh cell, drawn as a chip by two renderers and asserted by neither about
 * the list it sits in. Each seam is covered and the claim is about the whole chain: what a person
 * sees on a real page is dearest first. So this reads the bands off the cards in the order the
 * browser laid them out and checks the rank never improves going down. It also checks the bands are
 * bands this build knows, because a chip drawn from an unknown one is a ranking silently ignored.
 * That is the failure that looks exactly like it worked.
 *
 * PLUS TWO CHEAP ONES WHILE A REAL PAGE IS OPEN ANYWAY: the queue's empty sentence
 * (`packages/render/src/queue.ts`'s `QUEUE_CLEARED`) never appears beside cards that are actually
 * drawn, and no `.queue-option` is a focusable control that presses to nothing. `Queue.svelte`'s own
 * rule is that an option is a `button.queue-act` where the host can act on it and plain words
 * otherwise; anything else, a bare link or a `tabindex` on inert text, would be a control a keyboard
 * user can reach and a screen reader announces, that does nothing when pressed.
 *
 * NO BUILD, NO RUN. It reports that it looked at nothing and exits 3, which `run.mjs` counts as a
 * skip and not as a pass, so `pnpm gates` stays useful on a fresh checkout without the queue going
 * green on a run that never pressed an option.
 * Every shortfall this gate finds goes into one list and is printed together at the end: it does not
 * throw on the first one, for the same reason `a11y.mjs` and `passkey.mjs` do not.
 *
 * ITS OWN EPHEMERAL PORT (`server.listen(0)`), exactly as `passkey.mjs` takes one, and for the same
 * reason: a fixed port is one that a second run of the same gate finds taken. The self-hosted CI
 * runner is the PC the loop runs these gates on by hand, so a CI run and a desk run of one gate can
 * start within a minute of each other, and with a fixed port one of them goes red for a reason that
 * is not in the tree. An ephemeral port never collides, so this gate can be run by hand while a full
 * `pnpm gates` is going, the same claim `passkey.mjs` makes about itself.
 *
 * THIS PARAGRAPH USED TO SAY THE OTHER BROWSER GATES SHARE PORT 5189, and they never did. Read off
 * `budgets.json` and the `listen` calls on 22 September (`loop/research-ci-gates.md` §1): `layout`
 * had 5189, `a11y` 5186, `prefs` 4183 and `keys` 4184, one each.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, readiness } from './lib.mjs';
import { answers, forward, forwards, startRecord } from './record.mjs';

/* THE PREREQUISITE, AND THIS IS THE OTHER GATE THAT PROVED IT HAD TO LEAVE THIS FILE. It exited 0
   with no build and was counted as a gate that passed, so a fresh checkout reported the queue
   driven green having never pressed an option. `52 §5.1` step 2 gives the question to `run.mjs`,
   which reads this line before spawning anything. The `stat(ROOT)` below stays for a person
   running the file by hand.

   AND `run.mjs` READS IT OFF THE MODULE NOW RATHER THAN OUT OF THIS TEXT (`52 §5.1` step 3), which
   is the same fact with one fewer thing that can disagree: the value this file holds is the value
   the runner acts on, read before a line of the gate has run. */
export const needs = ['web-build'];

/**
 * THE WHOLE DRIVE, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK. A spawned gate got
 * that for nothing, because the process ending closed whatever it held; in this process a socket left
 * listening or a browser left running is a runner that never exits. The `finally` below is what makes
 * that true on every path out, and it was already there for a different reason: it opened after the
 * browser launch until 21 September, so it covered the drive and not the setup that stood the three
 * handles up. It now opens at the server, which is the first of them.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function queue(root = join(import.meta.dirname, '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');

  /* EXIT 3 IS A SKIP, NOT A PASS. This exited 0 with no build, and 0 is what `run.mjs` counts as a
     gate that passed: a fresh checkout reported the queue driven green having never pressed anything.
     A skip is the one thing the runner can be red about under CI, where the build always happened, so
     a skip there says the build did not and no option was ever pressed. */
  if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
    console.log('  queue: no apps/web/build to drive, so nothing was driven. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }

  /** Every way this run fell short, said in the order it happened. Collected, never thrown on first. */
  const findings = [];

  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };

  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE SETUP THROWS, which is the half the
   * `try`/`finally` around the drive never covered.
   *
   * It used to open after `browser.newPage()`, so five lines that throw for ordinary reasons sat
   * outside it: `answers(ORIGIN)` THROWS BY CONTRACT when the forward is not wired (`record.mjs` is
   * explicit about it), the `import()` of `weigh.ts` throws on a syntax error in the kernel,
   * `chromium.launch()` throws where no browser is installed. Each of those left the record answering
   * and this gate's server listening for the rest of the run, because `run.mjs` calls the gate
   * IN-PROCESS and nothing else was going to close them. Measured on 21 September on `keys.mjs`, which
   * had the same gap wider: a throw with the handles open left its port answering **HTTP 200**, the
   * rebind a later gate needs came back **EADDRINUSE**, and the machine went from 18 browser processes
   * to 21. This gate takes an EPHEMERAL port, so the leak was never a collision here, which is why it
   * was never noticed: it leaked a Chromium and a record per failed run instead.
   *
   * THE THREE `let`s ARE FOR THE FINALLY, which has to hand back whatever exists at the moment of the
   * throw; a `const` inside the block is out of scope there.
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
    /* THE RECORD FIRST, the seed's own `governance.open` rows and nothing invented here. */
    record = await startRecord();

    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (forwards(url.pathname)) return forward(req, res, record.base);
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel.includes('..')) return res.writeHead(400).end();
      for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
        const file = join(ROOT, candidate);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        return createReadStream(file).pipe(res);
      }
      /* THE SPA FALLBACK the deployed host serves, for the same reason `a11y.mjs` serves it: without it
         `/decide/<id>` and `/p/agents` 404 on a direct load instead of letting the router decide. */
      /* The app's shell, which is under `/app` in the build as it is on the host (`lib.mjs`). */
      const shell = appShell(ROOT);
      const asset = Object.hasOwn(TYPES, extname(rel));
      if (!asset && (await stat(shell).catch(() => null))?.isFile()) {
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return createReadStream(shell).pipe(res);
      }
      res.writeHead(404).end();
    });
    await new Promise((r) => server.listen(0, r));
    const PORT = server.address().port;
    const ORIGIN = `http://127.0.0.1:${PORT}`;

    /* PROOF THE FORWARD IS WIRED, not just that a server answered something. A gate that forgot to
       forward `/api/*` would have the register screen fall back to its own in-browser sample, which
       would draw a queue too and pass silently over a broken record. */
    await answers(ORIGIN);

    const ready = readiness('queue', budget('ready').settleTimeoutMs, ROOT);

    /* THE RECORD'S OWN RANKING, loaded from source the way `spark-actor.mjs` loads its module: the gate
       asserts the ORDER a person sees matches the function that decided it, so it must be that function
       and not a transcription of it. `weigh.ts` imports nothing, so this costs one file. */
    const { COSTS, costRank } = await import(pathToFileURL(join(root, 'packages', 'kernel', 'src', 'weigh.ts')).href);

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    /** Load a route by address and report what it settled into. */
    async function open(route) {
      await page.goto(`${ORIGIN}${APP_BASE}${route}`, { waitUntil: 'networkidle' });
      return ready.settled(page);
    }

    /** The queue block agents.ts names `heading: 'Waiting on you'`, found by the name its region carries. */
    const waitingOnYou = () => page.getByRole('region', { name: 'Waiting on you', exact: true });

    try {
      const first = await open('/p/agents');
      const unmeasuredFirst = ready.check('queue /p/agents', '/p/agents', first);
      if (unmeasuredFirst) findings.push(unmeasuredFirst);

      /* CHEAP, WHILE THE PAGE IS OPEN ANYWAY: the empty sentence never sits beside cards that are
         actually drawn. `queuePlan` only ever prints one or the other. */
      if ((await page.locator('.queue-empty').count()) > 0)
        findings.push('the seeded Agents page draws .queue-empty even though its queue holds questions.');

      const block = waitingOnYou();
      if ((await block.count()) === 0) {
        findings.push('the seeded Agents page draws no "Waiting on you" queue region, so nothing here could be driven.');
      } else {
        /* AND CHEAP AGAIN: no option is a control that presses to nothing. `Queue.svelte`'s own rule is
           a `button.queue-act` where the host can act, plain words otherwise, never a third thing. */
        const noOp = await block.evaluate((el) =>
          [...el.querySelectorAll('.queue-option')]
            .filter((opt) => !opt.querySelector('button.queue-act'))
            .flatMap((opt) => {
              const pressable = opt.querySelector('a[href], [role="button"], [tabindex]:not([tabindex="-1"])');
              return pressable ? [pressable.outerHTML.slice(0, 80)] : [];
            }),
        );
        for (const p of noOp) findings.push(`a queue option that cannot act is still a focusable control: ${p}`);

        /* ── THREE: THE CARDS ARRIVE DEAREST FIRST ──
           The bands off the DOM, in the order the browser laid them out, against the record's own
           ranking function rather than a copy of the order written here: a gate holding its own list of
           four words would be a second answer to the question `weigh.ts` exists to answer once. A card
           with no chip is a question whose body this build cannot read, which is allowed and sorts
           last. `costRank` says so, so it needs no branch here. */
        /* THE GATE'S OWN PROOF THAT THIS LOOKS AT ANYTHING. `BRAINDOG_GATE_SEED=queue` puts the cheapest
           band at the top and the dearest at the bottom, which is the rule read backwards, and creates
           the chip where a card has none so the seed does not depend on what the seed record happens to
           hold. A queue drawing one card is cloned first, because an order needs two things to be in it
           and a seed that quietly exercises nothing is how a self-test passes a blind gate. */
        if (process.env.BRAINDOG_GATE_SEED === 'queue')
          await block.evaluate((el) => {
            const first = el.querySelector('.queue-card');
            if (!first) return;
            if (el.querySelectorAll('.queue-card').length === 1) first.after(first.cloneNode(true));
            const all = [...el.querySelectorAll('.queue-card')];
            const chip = (card, band) => {
              let c = card.querySelector('.queue-cost');
              if (!c) {
                c = document.createElement('span');
                c.className = 'queue-cost';
                (card.querySelector('.queue-by') ?? card).append(c);
              }
              c.dataset.cost = band;
            };
            chip(all[0], 'call');
            chip(all[all.length - 1], 'undo');
          });

        const bands = await block.evaluate((el) => [...el.querySelectorAll('.queue-card')].map((c) => c.querySelector('.queue-cost')?.dataset.cost ?? ''));
        for (const band of bands) if (band !== '' && !COSTS.includes(band)) findings.push(`a queue card is chipped with a cost band this build has no word for: "${band}".`);
        for (let i = 1; i < bands.length; i += 1)
          if (costRank(bands[i]) < costRank(bands[i - 1]))
            findings.push(`the queue is not ranked by cost of being wrong: "${bands[i]}" is drawn below "${bands[i - 1]}" (${bands.join(' then ')}).`);
        if (bands.every((b) => b === ''))
          /* NOT A FINDING, AND SAID OUT LOUD. A seed whose open questions all carry bodies this build
             cannot read draws no chips at all, and a silent pass over an empty list is how a gate goes
             blind. */
          console.log('queue: no card on the seeded Agents page carries a cost band, so the ranking could not be exercised.');

        /* ── ONE: PRESS AN OPTION THAT IS NOT THE RECOMMENDATION, AND LAND ON ITS GATE HIGHLIGHTED ── */
        const cards = block.locator('.queue-card');
        if ((await cards.count()) === 0) {
          findings.push('the seeded "Waiting on you" queue draws no cards, so nothing here could be pressed.');
        } else {
          /* A CARD CARRYING A RECOMMENDATION IS THE STRONGER PROOF, because pressing its OTHER option
             and finding the recommendation still un-highlighted is exactly the failure mode the gate's
             rule is written against. The record's own rules open questions of their own between the
             three drawn here and the seed's two that carry one, so a run of this seed may draw three
             cards with none: the check still holds on whichever card is drawn, because it presses
             whatever that card offers rather than a card this run assumes exists. */
          const withRec = block.locator('.queue-card:has(.queue-option[data-recommended])').first();
          const card = (await withRec.count()) > 0 ? withRec : cards.first();
          const questionText = (await card.locator('.queue-question').innerText()).trim();
          let press = card.locator('.queue-option:not([data-recommended]) button.queue-act').first();
          if ((await press.count()) === 0) press = card.locator('button.queue-act').first();
          if ((await press.count()) === 0) {
            findings.push(`the card "${questionText}" has no pressable option.`);
          } else {
            const pressedLabel = (await press.innerText()).trim();
            await press.click();
            await page.waitForURL(/\/decide\//, { timeout: budget('ready').settleTimeoutMs });
            const gateState = await ready.settled(page);
            const unmeasuredGate = ready.check('queue press-option gate', new URL(page.url()).pathname, gateState);
            if (unmeasuredGate) findings.push(unmeasuredGate);

            const gateTitle = (await page.locator('h1.title span[dir="auto"]').innerText()).trim();
            if (gateTitle !== questionText)
              findings.push(`pressing "${pressedLabel}" landed on "${gateTitle}", not the question it was pressed from ("${questionText}").`);

            const onCards = page.locator('.cards .card[data-on]');
            const onCount = await onCards.count();
            if (onCount !== 1) {
              findings.push(`the gate arrived with ${onCount} option(s) marked highlighted; expected exactly the one pressed.`);
            } else {
              const highlightedTitle = (await onCards.first().locator('.card-title').innerText()).trim();
              if (highlightedTitle !== pressedLabel)
                findings.push(`the gate highlighted "${highlightedTitle}", not the option pressed ("${pressedLabel}").`);
            }

            /* NOTHING IS CHOSEN. `committing` is null until a card's own Choose button is pressed, and
               the only thing on screen that says otherwise is the commit step this checks for. */
            if ((await page.locator('section.commit').count()) > 0)
              findings.push('the gate arrived with a commit step already open, as though an option were already chosen.');
          }
        }
      }

      /* ── TWO: PRESS THE COUNT OF WHAT IS LEFT, AND LAND ON DECIDE ── */
      const second = await open('/p/agents');
      const unmeasuredSecond = ready.check('queue /p/agents (2)', '/p/agents', second);
      if (unmeasuredSecond) findings.push(unmeasuredSecond);

      const more = waitingOnYou().locator('.queue-more');
      if ((await more.count()) === 0) {
        /* NOT A FINDING. A queue that draws everything it holds writes no `more` row at all
           (`packages/render/src/queue.ts`), and this half of the gate has nothing to press then. Said
           plainly rather than invented. */
        console.log('queue: the seeded Agents queue draws no "N more" row, so pressing the count of what is left could not be exercised.');
      } else {
        const tag = await more.evaluate((el) => el.tagName);
        if (tag !== 'A') {
          findings.push(`the queue holds more than it draws but "${(await more.innerText()).trim()}" is a <${tag.toLowerCase()}>, not a link: the evaluator supplied no address, or the block ignored it.`);
        } else {
          const href = await more.getAttribute('href');
          const label = (await more.innerText()).trim();
          await more.click();
          await page.waitForURL(`**${APP_BASE}/decide`, { timeout: budget('ready').settleTimeoutMs });
          const path = new URL(page.url()).pathname;
          if (path !== `${APP_BASE}/decide`) findings.push(`pressing the queue's "${label}" link (href="${href}") landed on ${path}, not ${APP_BASE}/decide.`);
          const decideState = await ready.settled(page);
          const unmeasuredDecide = ready.check('queue more-link decide', '/decide', decideState);
          if (unmeasuredDecide) findings.push(unmeasuredDecide);
        }
      }
    } catch (e) {
      /* A THROW IN THE DRIVE IS A FINDING AND NOT A CRASH, which is what this block was always for. The
         hand-back that used to sit under it moved OUT to the `finally` that covers the setup as well: a
         `finally` opening after `chromium.launch()` cannot give back a browser the launch line itself
         left running. */
      findings.push(`the queue drive stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }

    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);

    if (findings.length === 0) {
      console.log('queue: pressed a queue option to its gate (highlighted, not chosen), the count of what is left to /decide, and the cards arrived dearest first.');
    } else {
      console.error('\n  the queue block, driven in a real browser:');
      for (const f of findings) console.error(`      ${f}`);
      return 1;
    }
  } finally {
    /**
     * THE BROWSER, THE PORT AND THE RECORD, and one failure may not cost the other two.
     *
     * Each is guarded on its own and swallows its own failure. An unguarded `await browser.close()` on a
     * browser that had already crashed rejects out of the `finally` and leaves the port and the record
     * exactly as leaked as before, which is the same defect one layer in. Nothing here is a second close
     * either: two closes of one record reach `sql.close()` on a database already closed
     * (`apps/selfhost/src/server.ts:72`) and throw `ERR_INVALID_STATE` out of `net`'s close callback,
     * where no `await` can catch it, and the run dies. Driven on 21 September.
     */
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED=queue` and
   the header documents `node tools/gates/queue.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await queue()) ?? 0;
