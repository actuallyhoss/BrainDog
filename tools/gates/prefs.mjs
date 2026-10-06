/**
 * A preference that changes nothing is a control that lies.
 *
 *   node tools/gates/prefs.mjs
 *
 * `25 §1` names this class of defect and calls it a bug rather than a gap: "Exactly the same class
 * of defect as the `series` chart that was advertised with no way to feed it: **a capability that
 * exists as a table row.**" `27 §3` puts it in a list titled "Four findings that were bugs, not
 * gaps", because "each was a statement the corpus already made and could not honour". `23 §3.1` is
 * the same rule from the other side: *"a row that cannot run is not there"*.
 *
 * IT WAS FOUND BY AN AUDIT, NOT BY A GATE, AND THAT IS THE POINT. Settings → Text size set
 * `data-text` on `<html>`, lit its own segment and wrote the cookie, while every UI surface sized
 * from a token pinned to a constant. Full-page screenshots at Small, Normal and Large were
 * byte-identical on six routes at two widths; 0 of 182 elements moved on Home. It shipped that way
 * because the 128-configuration matrix (`50 §9`) is 8 fixtures x 4 widths x 2 schemes x 2
 * directions. `data-text` is not an axis of it, and neither is any other preference but `scheme`.
 *
 * SO THIS GATE ASKS ONE QUESTION OF EACH: set it, and does the page come back different? Not "is it
 * the right difference" (a gate cannot judge that) but "is there one at all", which is the
 * question that was never asked. Each check names the token or attribute it measures, so a red line
 * says which preference stopped reaching the DOM rather than that something is wrong.
 *
 * WHAT IT DOES NOT COVER, AND THE LIST HAD DRIFTED FROM THE TYPE IT GUARDS. It used to name `keys`,
 * `columns`, `previewDismissed` and `suggestPages`. `Pref` has never had `previewDismissed` or
 * `suggestPages`, while four real fields went unmentioned. The file written to catch an excuse that
 * outlives its reason had grown one of its own.
 *
 * AND THEN IT DRIFTED AGAIN, WHICH IS THE PART WORTH READING. This paragraph said `Pref` holds
 * ELEVEN and then named them, leaving out `contrast`, `sampleSaid` and `railShut`; it said "this
 * covers six" while `CASES` below held seven, because `contrast` was given a case and the sentence
 * a screen above it was not touched. Twice is not bad luck. A hand-written enumeration of a type,
 * sitting a screen away from the list it describes, drifts every time somebody edits one of the two
 * and not the other, and left as prose it would do it a third time.
 *
 * SO THE PARAGRAPH IS NO LONGER THE AUTHORITY AND THE TYPE IS. The check below `CASES` reads
 * `pref.ts` as text, the way every gate in this directory reads TypeScript, and is red when a
 * `Pref` field is in neither `CASES` nor `EXCUSED`, and red again when either of those names a
 * field the type no longer has. `sampleSaid` was the first kind and `previewDismissed` was the
 * second; one check catches both, and what follows is a description of its answer rather than the
 * record it is kept in. `sampleSaid` then went the other way: the sample bar it put away went with
 * the sample, and the check was red on this file's case for it until the
 * case went too.
 *
 * `Pref` holds fourteen: `scheme`, `text`, `density`, `theme`, `contrast`, `sidebar`, `shape`,
 * `chars`, `suggestPages`, `seen`, `columns`, `nav`, `defined`, `railShut`. Nine are covered
 * here: `text`, `density`, `scheme`, `contrast`, `sidebar`, `shape`, `suggestPages`, `nav` and
 * `railShut`, which is everything a page LOAD can settle. `suggestPages` joined the type after this
 * file had spent a paragraph excusing itself from covering a field the type did not have; it is
 * covered now, on the load, because turning it off empties a list. `railShut` arrived later still
 * and was measured by nothing and excused by nothing, which is the hole the derived check exists to
 * close: it is settled by a load exactly the way `sidebar` is, folding a section of the rail. The
 * other five each need something a fixture cannot do by loading a URL:
 *
 *   - `theme`   an accent is chosen by pressing a swatch, and the difference is a palette rather
 *               than one token. **A duplicate swatch that repainted nothing lived here for months**
 *               precisely because this gate could not reach it; `theme.test.ts` asserts the
 *               invariant instead: no suggestion is the house colour.
 *   - `chars`   needs a keystroke, and `keys` (the gate next door) is the one that presses keys.
 *   - `seen`    needs a click on Home's *Mark all read*, and its effect is an absence.
 *   - `columns` needs the Display sheet opened and a column unticked.
 *   - `defined` is spent once per device and cannot be re-read.
 *
 * A check that pretended to cover any of them would be the thing this file exists to catch.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from '@playwright/test';

import { ACCENTS } from '../../packages/theme/src/record.ts';
import { APP_BASE, appShell, budget, readiness } from './lib.mjs';
import { answers, forward, forwards, serverKeyFor, startRecord } from './record.mjs';

/* AND WHY THIS GATE DECLARES NO `needs`, although it drives a browser like the four that do.
   `52 §5.1` step 2 lets the runner refuse a gate whose prerequisite is unmet, and a refusal means
   the gate is never run. Half of this one reads `pref.ts` as text and is RED when the covered
   list and the type have drifted, which is a finding with nothing to do with whether anybody has
   run a build; the check below is deliberately placed after it for exactly that reason, and returns
   1 rather than 3 when the drift is there. Declaring `web-build` would throw that half away on
   every run at a desk, which is where the drift is found.

   STEP 3 DOES NOT CHANGE THAT, and it is worth saying because the absence is the declaration here.
   `run.mjs` reads `mod.needs` off this module, finds nothing, and runs the gate, which is the same
   answer it reached by finding no `export const needs` in the text. An absent prerequisite means the
   gate decides for itself what it can measure, which for this one is the whole argument above. */

/**
 * EVERY PREFERENCE, SET AND MEASURED, AS A FUNCTION THE RUNNER CALLS. `52 §5.1` step 3.
 *
 * IT OWNS A PORT, A RECORD AND A BROWSER, AND A CALLED GATE HAS TO GIVE THEM BACK, which a spawned
 * one got for nothing: the process ending closed whatever it held. In this process a server left
 * listening is a handle the runner cannot exit past, and a browser left running is a
 * runner that never exits. The two returns that come before any of that is started need no cleanup,
 * which is the other reason the drift check is first. Everything after it hands all three back in ONE
 * `finally`, so a case that throws costs the run its answer and nothing else.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to this file's own two directories up, which is what the
 * constant it replaces computed. Nothing here has ever read `process.cwd()`.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep
 * rests on: a pass is the end of the function and never a statement inside it.
 */
export default async function prefs(root = join(import.meta.dirname, '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');

  /**
   * WHEN A PROBE IS ALLOWED TO BE BELIEVED, and for this gate that is a question about false REDS.
   *
   * Seven of the ten cases read the record: `text` measures a grid cell, `suggestPages` counts
   * `#main .ledger li`, `nav` joins the rail's hrefs. Over a screen that has not drawn, all three
   * settings come back `no element`, `0` and `''`, the values are identical, and this gate prints
   * exactly the sentence it is named for: a preference that reached the cookie and not the page. The
   * repair somebody reaches for under time pressure is to weaken the probe, and a weakened probe is
   * permanently vacuous. So an unsettled or refused load is reported as what it is, and its case is not
   * compared at all.
   */
  const ready = readiness('prefs', budget('ready').settleTimeoutMs, ROOT);

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
   * What to set, where to look, and what has to differ.
   *
   * `probe` runs in the page and returns a string. Two settings whose probes come back equal is the
   * finding: the preference reached the cookie and not the DOM.
   */
  const CASES = [
    {
      name: 'text',
      what: 'the body step (13 §7)',
      route: '/r/obligations',
      /* `50 §4.7`: `text: 'sm' | 'base' | 'md'`, applied before first paint. `13 §7`: it "picks the
         body step". So the chrome moves and the fixed steps around it do not. */
      values: [{ text: 'sm' }, { text: 'base' }, { text: 'md' }],
      /* A CELL IN `#main`, AND NEVER THE RAIL. The probe used to take the first of `.line-title, .td,
         .rail a[data-nav]` in document order, and the rail comes first: its rows are `--t-sm` on
         purpose (the design system's "rail"), a fixed step, so all three settings read 13px off a rail
         link while the grid moved from 13 to 16. The grid cell is what the setting is for. */
      probe: () => {
        const el = document.querySelector('#main .td') ?? document.querySelector('#main .line-title');
        return el ? getComputedStyle(el).fontSize : 'no element';
      },
    },
    {
      name: 'density',
      what: 'the row height (13 §4.2)',
      route: '/r/obligations',
      values: [{ density: 'compact' }, { density: 'comfortable' }, { density: 'roomy' }],
      probe: () => getComputedStyle(document.documentElement).getPropertyValue('--row-h').trim(),
    },
    {
      name: 'scheme',
      what: 'the ground colour',
      route: '/',
      values: [{ scheme: 'light' }, { scheme: 'dark' }],
      probe: () => getComputedStyle(document.body).backgroundColor,
    },
    {
      /**
       * `contrast`: the second palette, which shipped and had no control at all.
       *
       * `packages/theme` solves it against a higher floor, `theme.mjs` writes it into `house.css`
       * behind `html[data-theme='hc']`, and `--check` byte-compares it on every build. Nothing in the
       * app ever set that attribute, so sixteen checks' worth of generated work was unreachable by
       * the reader it exists for, and no gate could say so: this list is hand-written, so a
       * preference nobody adds a case for is a preference nobody measures.
       *
       * THE INK AND NOT THE GROUND. The high-contrast grounds are close to the ordinary ones by
       * design, because what a contrast palette moves is the DISTANCE between a surface and what sits
       * on it. Probing `background-color` would compare `#F8F9EE` against `#F3F3E9` and call a five
       * per cent difference a pass; the ink moves from `#26261F` to `#181812`, which is the thing the
       * palette is for.
       */
      name: 'contrast',
      what: 'the ink against the ground (28 §4)',
      route: '/',
      values: [{}, { contrast: true }],
      probe: () => getComputedStyle(document.body).color,
    },
    {
      name: 'sidebar',
      what: 'whether the rail is drawn',
      route: '/',
      /* `undefined` is open, which is what a first visit should be. So the two values are "unset"
         and `false` rather than `true` and `false`. */
      values: [{ shape: 'rail' }, { shape: 'rail', sidebar: false }],
      /* THE RENDERED WIDTH, not the link count. Folding hides the rail with CSS, so its anchors are
         still in the DOM and still queryable. A probe that counts them reports "no change" about a
         control that works, which is the same lie in the other direction. */
      probe: () => String(Math.round(document.querySelector('.rail-slot, nav.rail')?.getBoundingClientRect().width ?? -1)),
    },
    {
      /**
       * `shape`: which of the three shapes `19 §3` offers is drawn, and it is drawn by the SHELL.
       *
       * THE ONE PREFERENCE WHERE A LAZY PROBE WOULD GO GREEN ON A BROKEN BUILD, and it would do it
       * the opposite way round from `sidebar` two cases up. `sidebar` leaves its anchors in the DOM,
       * so counting them lies about a control that works; this one REPLACES one nav with another, so
       * a probe that counted nav links would report a difference between a top bar and a menu no
       * matter which of the two was drawn, and would keep reporting it if the shell drew the rail
       * every time and the strip on top of it.
       *
       * SO IT IS WHICH OF THE THREE IS PRESENT, all three counted on every load. `1 0 0` is the rail,
       * `0 1 0` the top bar, `0 0 1` the menu button, and a build that ignored the preference comes
       * back `1 0 0` three times, which is exactly what this gate is for.
       */
      name: 'shape',
      what: 'which navigation the shell draws (19 §3)',
      route: '/',
      /* 1440 BY 900, WHICH IS THIS GATE'S VIEWPORT AND IS WHY THIS CASE CAN BE MEASURED AT ALL. The
         tab bar stays below 900px whatever the shape says, so the same three values there are one
         answer three times, correctly. */
      /* `undefined` IS THE RAIL, the default again (`19 §3`, and DIRECTION 37's floating rail card), so the first value
         is "unset" rather than `'rail'`. A `'rail'` beside it would draw the rail twice, and this case is red on any two
         values that agree. A device's own `'bar'` is not a value here either: older builds wrote it into the cookie on
         every boot, so `deviceChose` (nav-prefs.svelte.ts) reads it as nobody's choice and draws the rail. A top bar
         somebody chose lives on the record, and the `nav.shape` case below draws it. */
      values: [{}, { shape: 'menu' }],
      probe: () =>
        [
          document.querySelectorAll('nav.rail').length,
          document.querySelectorAll('nav.topbar').length,
          document.querySelectorAll('button.menu-open').length,
        ].join(' '),
    },
    {
      /**
       * `suggestPages`: `29 §4`'s one global switch, and the list it empties.
       *
       * A page LOAD settles it, which is what makes it gateable at all: off draws a `cleared` empty
       * state where on draws the holding pen, so the count in the section heading is the measurement.
       * `19 §2` says this switch is the reason the `navigation` area exists, and the area shipped
       * without it. That is the third control in this product found to move a tick and write nothing.
       */
      name: 'suggestPages',
      what: 'the switch the page draws, and the holding pen or the empty state it draws instead (29 §4)',
      route: '/settings/navigation',
      values: [{}, { suggestPages: false }],
      /* THE SWITCH AND WHAT IT EMPTIES, not the pen's rows alone. The rows came from the sample record, and with it gone
         a record with nothing waiting draws none either way, so the count read 0 for both values and the
         gate called a working switch dead. The switch's own state and the section's empty-state title are what a page
         load settles on any record. */
      probe: () => [
        document.querySelector('#main button[role="switch"][aria-label="Suggest new pages"]')?.getAttribute('aria-checked') ?? 'none',
        document.querySelectorAll('#main .ledger li').length,
        [...document.querySelectorAll('#main h3, #main [class*="empty"] strong, #main [class*="empty"] h3')].map((e) => e.textContent?.trim()).filter(Boolean).join('|'),
      ].join(' '),
    },
    {
      name: 'nav',
      what: 'the order of the rail (19 §3: position lives in a per-user store and wins)',
      route: '/',
      /* THE ONE THAT WAS WRITTEN, SURVIVED A RELOAD, AND MOVED NOTHING. The rail rendered the raw
         list while the arrangement lived in a value read only by the two move functions. */
      /* WITHIN ONE SECTION, because that is the only move the product offers: `29 §4` places a page
         "at the end of its section, never inserted mid-list", and the menu is up / down / to top /
         hide. Three pages from three different sections would reorder three buckets of one, which
         changes nothing and would fail this gate for being a bad test rather than a bad build. */
      values: [{ shape: 'rail' }, { shape: 'rail', nav: ['/p/portage', '/p/kiln', '/p/marlow-co'] }],
      probe: () => [...document.querySelectorAll('nav.rail a[data-nav]')].map((a) => a.getAttribute('href')).join(' '),
    },
    {
      /**
       * `railShut`: thirty-four items of navigation, and the heading somebody folded away.
       *
       * THE OTHER ONE NOTHING MEASURED, and the one of the two where a lazy probe would lie. Folding
       * writes `data-shut` and `inert` on the group and leaves every anchor in the DOM, so a probe
       * that counted rail links would report "no change" about a control that works. `sidebar` names
       * the same trap two cases up and answers it with the rendered width.
       *
       * SO THE HEADINGS AND NOT THE LINKS. The fold is a button carrying the section's own name, and
       * `aria-expanded` is what it writes, so this comes back as the name of every section that is
       * folded and as the empty string when none is.
       */
      name: 'railShut',
      what: 'which rail sections are folded (19 §3)',
      route: '/',
      /* `Projects` BECAUSE `/` IS NOT IN IT. A section holding the screen you are looking at is never
         shut, deliberately, so a case that folded the section containing its own route would measure
         that exception rather than the preference.

         AND BECAUSE IT HOLDS MORE THAN ONE PAGE. This folded `Money`, which declares one page, and the
         rail now draws a section of one as a plain row with no fold to press, so the cookie carried
         the name and the page had nothing to shut. `Projects` is three things on the shipped seed. */
      values: [{ shape: 'rail' }, { shape: 'rail', railShut: ['Projects'] }],
      probe: () =>
        [...document.querySelectorAll('nav.rail .fold[aria-expanded="false"]')]
          .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())
          .join(' '),
    },

    /*
     * THE RECORD'S OWN KEYS (`PREF_KEYS`, contracts §7.3). A person's shape, switch and dismissals are kept by the record
     * and answered on `boot`'s `me.prefs`, and the cookie is only their first-paint copy. The gate's record is reached with
     * a key, and a key is not a person, so `setPref` refuses it; instead this gate's server writes the case's `@record`
     * into the `boot` it hands the page (`bootWith` below), which is exactly the answer a person's `boot` carries. A value
     * may be a function of the value before it, for a case whose second load names what the first one drew.
     */
    {
      /**
       * `nav.shape`: the record's word draws the shell, AND IT STANDS OVER THE COOKIE. The third value carries a top bar in
       * the cookie and a menu in the record, so a build that still read the cookie as the truth comes back with the top
       * bar twice and goes red.
       *
       * `bar` AND NOT `side` IN THE MIDDLE. `side` is the record's word for the rail, which was the one shape the unset load
       * did not draw while the top bar was the default. With the rail the default again, a record that keeps nothing draws
       * the rail too, and the two loads would be one answer twice. `bar` is the one word left that draws neither the rail nor
       * the menu. The record's `side` still reads as the rail, which `nav-prefs.svelte.test.ts` holds.
       */
      name: 'nav.shape',
      record: true,
      what: "which navigation the shell draws when the record keeps the shape, over the cookie's copy (contracts §7.3)",
      route: '/',
      values: [{ '@record': {} }, { '@record': { 'nav.shape': 'bar' } }, { shape: 'bar', '@record': { 'nav.shape': 'menu' } }],
      probe: () =>
        [
          document.querySelectorAll('nav.rail').length,
          document.querySelectorAll('nav.topbar').length,
          document.querySelectorAll('button.menu-open').length,
        ].join(' '),
    },
    {
      /** `pen.suggest`: the switch as the record keeps it, and the pen or the empty state it draws, over the cookie's copy. */
      name: 'pen.suggest',
      record: true,
      what: 'the Suggest new pages switch as the record keeps it, and the holding pen or the empty state it draws (29 §4)',
      route: '/settings/navigation',
      values: [{ '@record': {} }, { suggestPages: true, '@record': { 'pen.suggest': false } }],
      probe: () =>
        [
          document.querySelector('#main button[role="switch"][aria-label="Suggest new pages"]')?.getAttribute('aria-checked') ?? 'none',
          document.querySelectorAll('#main [data-pen]').length,
          [...document.querySelectorAll('#main h3, #main [class*="empty"] strong, #main [class*="empty"] h3')].map((e) => e.textContent?.trim()).filter(Boolean).join('|'),
        ].join(' '),
    },
    {
      /**
       * `pen.dismissed`: an offer dismissed on the record is gone from the pen, which is what makes Dismiss terminal on
       * every device (`19 §3`). The first load keeps a menu so the navigation shape is offered at this width; the second
       * dismisses every offer the first one drew, by the ids it drew them under, and the pen has to come back without them.
       */
      name: 'pen.dismissed',
      record: true,
      what: 'the offers the holding pen draws, and that a dismissal the record keeps takes one out on every device (19 §3)',
      route: '/settings/navigation',
      values: [
        { '@record': { 'nav.shape': 'menu' } },
        (drew) => ({ '@record': { 'nav.shape': 'menu', 'pen.dismissed': drew.split('\n').filter(Boolean) } }),
      ],
      probe: () => [...document.querySelectorAll('#main [data-pen]')].map((row) => row.getAttribute('data-pen')).join('\n'),
    },
    {
      /**
       * `home.page`: the page this person opens on, chosen in Settings > Pages. The shell sends a tab that opened on the
       * bare front door there (`+layout.svelte`), so the address the tab lands on and the screen's heading are the
       * measurement: unset, `/` stays Today; set, the same load ends on the chosen list.
       *
       * WAITED FOR, AND NOT READ ONCE. The move is an effect after the first draw, so the probe gives the address a moment
       * to change before it reads it; on the unset load it reads `/` after that moment, which is the answer.
       */
      name: 'home.page',
      record: true,
      what: 'the page a tab opened on the front door lands on (Settings > Pages)',
      route: '/',
      values: [{ '@record': {} }, { '@record': { 'home.page': '/r/obligations' } }],
      probe: async () => {
        for (let n = 0; n < 30 && !location.pathname.includes('/r/'); n++) await new Promise((r) => setTimeout(r, 100));
        return [location.pathname, document.querySelector('#main h1')?.textContent?.trim() ?? 'no heading'].join(' ');
      },
    },
    {
      /**
       * `nav.labels`: a page renamed in Settings > Navigation, drawn under its new name in the rail (`navPrefs.relabel`).
       * The rail's words are the measurement, in the rail's order, so a build that kept the label and drew the page's own
       * title comes back with the same words twice and goes red.
       */
      name: 'nav.labels',
      record: true,
      what: 'the names the rail draws its pages under (Settings > Navigation)',
      route: '/',
      values: [{ shape: 'rail', '@record': {} }, { shape: 'rail', '@record': { 'nav.labels': { '/p/kiln': 'The kiln room' } } }],
      probe: () =>
        [...document.querySelectorAll('nav.rail a[data-nav]')].map((a) => (a.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | '),
    },

    /*
     * THE FIVE `look.*` KEYS, the look a person chose and the record keeps for every device they sign in on (`35`). They
     * were excused as measured by the cookie cases above, and that was only half true: those cases load a cookie, and the
     * record's answer reaches the page by another road (`theme/follow.ts`: `boot` answers, `pref.adopt` and `accent.adopt`
     * put it on `<html>` and write it over the cookie). A build that dropped that road kept every cookie case green.
     *
     * THREE LOADS EACH, AND THE THIRD IS THE ONE THAT MATTERS: the cookie says one thing and the record another, so a build
     * that still trusted the cookie draws the second load's answer twice and goes red. Each probe reads the attribute the
     * key writes AND the token it moves, so a red line says whether the word or the look stopped arriving.
     */
    {
      name: 'look.scheme',
      record: true,
      what: "data-scheme and the ground colour, when the record keeps the scheme, over the cookie's copy (35)",
      route: '/',
      values: [{ '@record': {} }, { '@record': { 'look.scheme': 'dark' } }, { scheme: 'dark', '@record': { 'look.scheme': 'light' } }],
      /* `device` IS AN ABSENT ATTRIBUTE, which is what the unset load draws: the device's own scheme, decided by CSS. So the
         first and third loads may share a ground and still differ, because a light the person chose is written down. */
      probe: () => `${document.documentElement.getAttribute('data-scheme') ?? 'device'} ${getComputedStyle(document.body).backgroundColor}`,
    },
    {
      name: 'look.size',
      record: true,
      what: "data-text and the body step, when the record keeps the text size, over the cookie's copy (13 §7)",
      route: '/r/obligations',
      values: [{ '@record': {} }, { '@record': { 'look.size': 'sm' } }, { text: 'sm', '@record': { 'look.size': 'md' } }],
      /* A CELL IN `#main`, for the reason the `text` case gives: the rail is a fixed step and would read the same three times. */
      probe: () => {
        const el = document.querySelector('#main .td') ?? document.querySelector('#main .line-title');
        return `${document.documentElement.getAttribute('data-text') ?? 'none'} ${el ? getComputedStyle(el).fontSize : 'no element'}`;
      },
    },
    {
      name: 'look.density',
      record: true,
      what: "data-density and the row height, when the record keeps the density, over the cookie's copy (13 §4.2)",
      route: '/r/obligations',
      values: [{ '@record': {} }, { '@record': { 'look.density': 'compact' } }, { density: 'compact', '@record': { 'look.density': 'roomy' } }],
      probe: () =>
        `${document.documentElement.getAttribute('data-density') ?? 'none'} ${getComputedStyle(document.documentElement).getPropertyValue('--row-h').trim()}`,
    },
    {
      /**
       * `look.contrast`: TWO LOADS, BECAUSE A SWITCH HAS TWO ANSWERS. A third load would have to repeat one of them, and this
       * gate is red on any two that agree.
       *
       * THE COOKIE IS ON IN BOTH AND THE RECORD TURNS IT OFF IN THE SECOND. That pair is the one a broken build cannot pass
       * either way round: a build that ignored the record draws `hc` twice, and so does one that let the cookie win. Off
       * over on is the harder direction, since an adopt that only ever turned the palette on would be green the other way.
       */
      name: 'look.contrast',
      record: true,
      what: "data-theme and the ink, when the record keeps the contrast palette, over the cookie's copy (28 §4)",
      route: '/',
      values: [{ contrast: true, '@record': {} }, { contrast: true, '@record': { 'look.contrast': false } }],
      /* THE INK AND NOT THE GROUND, for the reason the `contrast` case gives. */
      probe: () => `${document.documentElement.getAttribute('data-theme') ?? 'none'} ${getComputedStyle(document.body).color}`,
    },
    {
      /**
       * `look.accent`: the colour by its swatch's name. NO ATTRIBUTE TO READ, because the accent is an adopted stylesheet
       * and not a `data-` word (`accent.ts`, "this does not touch data-theme"), so the token it moves is the measurement.
       *
       * THE COOKIE CARRIES A HEX AND THE RECORD A NAME, which is how each keeps it. The third load's cookie is the second
       * load's colour, so a build that let the cookie win draws that colour twice.
       *
       * THE SWATCHES ARE READ OUT OF `@braindog/theme`, NOT SPELT HERE. A name written into this file would outlive the
       * swatch it named, and `accent.adopt` reads a name it has no swatch for as no answer: both loads would draw the house
       * colour and this case would call a working key dead.
       */
      name: 'look.accent',
      record: true,
      what: "the accent the page is painted in, when the record keeps it, over the cookie's copy (35)",
      route: '/',
      values: [
        { '@record': {} },
        { '@record': { 'look.accent': ACCENTS[0].name } },
        { theme: ACCENTS[0].hex, '@record': { 'look.accent': ACCENTS[ACCENTS.length - 1].name } },
      ],
      probe: () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'no accent',
    },
  ];

  /**
   * WHO IS MEASURING EACH PREFERENCE, READ OFF THE TYPE RATHER THAN OFF THE PARAGRAPH AT THE TOP.
   *
   * That paragraph enumerated `Pref` by hand and was wrong twice, the second time about the length of
   * the list directly beneath it. So it is not what this gate trusts any more. `pref.ts` is read as
   * text, which is how every gate in this directory reads TypeScript: `closed-lists` walks SQL out of
   * a migration, `event-kinds` walks an array out of `events.ts`, `dead-copy` takes `copy.ts`'s keys
   * off a two-space indent. A parser would be a second thing that can be wrong.
   *
   * BOTH DIRECTIONS, BECAUSE THE DRIFT HAS GONE BOTH WAYS. A field the type gained and this file
   * never noticed is `sampleSaid`; a name this file kept after the type dropped it is
   * `previewDismissed`. Neither is findable by reading one of the two lists on its own.
   *
   * AND AN EMPTY PARSE IS RED, NOT SILENT. `flags.mjs` next door pays for the same lesson: "a parse
   * that returns an empty list is a gate that goes green having read no declarations at all, which is
   * the one failure mode this directory exists to stop."
   */
  const EXCUSED = new Set(['theme', 'chars', 'seen', 'columns', 'defined']);

  const prefSrc = (await readFile(join(root, 'apps', 'web', 'src', 'lib', 'pref.ts'), 'utf8')).replace(/\r\n/g, '\n');
  const prefOpens = prefSrc.indexOf('export type Pref = {');
  const prefCloses = prefOpens < 0 ? -1 : prefSrc.indexOf('\n};', prefOpens);
  const FIELDS =
    prefOpens < 0 || prefCloses < 0
      ? []
      : [...prefSrc.slice(prefOpens, prefCloses).matchAll(/^ {2}([A-Za-z]\w*)\??:/gm)].map((m) => m[1]);

  const drift = [];
  if (!FIELDS.length)
    drift.push(
      'Pref could not be read out of apps/web/src/lib/pref.ts, so no preference here was checked against the type.\n' +
        '        The parse wants `export type Pref = {`, one field per line at two spaces, and `};` on its own.',
    );
  else {
    const measured = new Set(CASES.filter((c) => !c.record).map((c) => c.name));
    for (const field of FIELDS)
      if (!measured.has(field) && !EXCUSED.has(field))
        drift.push(
          `${field} is a Pref field with no case and no excuse, so nothing asks whether it changes anything.\n` +
            '        Add a case above, or name it in EXCUSED with what a fixture cannot do by loading a URL.',
        );
    for (const name of [...measured, ...EXCUSED])
      if (!FIELDS.includes(name))
        drift.push(
          `${name} is named here and Pref no longer has it, which is how previewDismissed outlived the type.\n` +
            '        Take it out of CASES or out of EXCUSED, whichever is holding it.',
        );
  }

  /**
   * AND THE RECORD'S KEYS THE SAME WAY, both directions, read off `PREF_KEYS` as text as `Pref` is read above.
   *
   * `nav.order` AND `nav.hidden` ARE EXCUSED because the rail keeps them through the same `nav-prefs.svelte.ts` path the
   * three cases above measure, and their cookie and `localStorage` copies are what the `nav` case already loads.
   *
   * THE FIVE `look.*` KEYS ARE NOT EXCUSED ANY MORE, and have their cases above.
   *
   * `notify.muted` IS EXCUSED BECAUSE THE RECORD APPLIES IT, NOT THE PAGE. The record drops a muted rule's notes from what
   * it answers (`mutedFor`), reading the mutes it keeps; this gate's `@record` only rewrites `boot`'s `me.prefs` on the way
   * to the page, so it never reaches that read, and a case here would compare two loads of one unchanged answer. The test
   * that asks is the record's: "A RULE A PERSON MUTED LEAVES THEIR NOTICES" in `packages/record/test/prefs.test.ts`, with
   * `mutedFor` itself in `packages/kernel/test/digest.test.ts`.
   *
   * IT USED TO SAY THE KEY "CHANGES NO SCREEN AT ALL", AND THAT WAS FALSE. Settings promises a muted rule's notices leave
   * the person's digest, and Today's activity is a screen; it drew muted notes all the same, and the excuse is what kept
   * anybody from looking (`loop/research-audit-11-13.md`). Whether a muted note leaves Today is the record's to test, where
   * the activity block is built: `packages/record/test/activity-muted.test.ts`.
   */
  const RECORD_EXCUSED = new Set(['nav.order', 'nav.hidden', 'notify.muted']);
  const recordSrc = await readFile(join(root, 'packages', 'record', 'src', 'index.ts'), 'utf8').catch(() => '');
  const keysSaid = /export const PREF_KEYS = \[([^\]]*)\]/u.exec(recordSrc)?.[1];
  const RECORD_KEYS = keysSaid === undefined ? [] : [...keysSaid.matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  if (!RECORD_KEYS.length)
    drift.push(
      'PREF_KEYS could not be read out of packages/record/src/index.ts, so no key the record keeps was checked here.\n' +
        "        The parse wants `export const PREF_KEYS = [`, each key in single quotes on as many lines as it likes, and `]` after the last.",
    );
  else {
    const measured = new Set(CASES.filter((c) => c.record).map((c) => c.name));
    for (const key of RECORD_KEYS)
      if (!measured.has(key) && !RECORD_EXCUSED.has(key))
        drift.push(
          `${key} is a key the record keeps with no case and no excuse, so nothing asks whether it changes anything.\n` +
            '        Add a case with `record: true` above, or name it in RECORD_EXCUSED with why.',
        );
    for (const name of [...measured, ...RECORD_EXCUSED])
      if (!RECORD_KEYS.includes(name))
        drift.push(
          `${name} is named here and PREF_KEYS no longer has it.\n` + '        Take it out of CASES or out of RECORD_EXCUSED, whichever is holding it.',
        );
  }

  /**
   * AND EVERY CASE HAS TO CARRY THE FIVE KEYS THE RUN READS, because a missing one is invisible until
   * the day it matters.
   *
   * `suggestPages` shipped with no `what`, and the finding line below interpolates `${test.what}`. So
   * the one run where that case went red would have printed `suggestPages: 2 values, 1 distinct.
   * undefined` to somebody trying to work out which preference had stopped reaching the page. The
   * check above already reads `Pref` rather than trusting the paragraph at the top; this reads the
   * cases the same way, rather than trusting nine entries to look like the tenth.
   *
   * IT GOES IN `drift` AND NOT IN THE FINDINGS, for the reason written beside `sayDrift`: a case
   * missing a key is a claim about this file, and a preference that reached the cookie and not the
   * page is a claim about the app. A reader who cannot tell them apart fixes the wrong one.
   */
  const NEEDED = ['name', 'what', 'route', 'values', 'probe'];
  for (const [at, test] of CASES.entries()) {
    const short = NEEDED.filter((key) => test[key] === undefined);
    if (short.length)
      drift.push(
        `the case at ${at} (${test.name ?? 'unnamed'}) has no ${short.join(', no ')}, and the run reads all five.\n` +
          '        `what` is printed in the finding, so a case without one names the preference and then says undefined.',
      );
  }

  /* NOT UNDER EITHER OF THE HEADINGS AT THE BOTTOM, for the reason written beside them: "a preference
     that reaches the cookie and not the page" is a claim about the app and this is a claim about this
     file, and a reader who cannot tell them apart fixes the wrong one. */
  const sayDrift = () => {
    console.error('\n  a preference this file has stopped accounting for:');
    for (const line of drift) console.error(`      ${line}`);
  };

  /**
   * AND THE BUILD IS CHECKED FOR AFTER THE TYPE IS, WHICH IS THE ONE ORDERING THAT LOSES NOTHING.
   *
   * This block used to sit above `CASES`, so a tree with no `build/` exited 3 before anything had
   * read `pref.ts`, and the drift this file exists to stop was invisible on exactly the runs a person
   * does at their desk. `flags.mjs` states the rule: "a finding found by reading source is a real
   * answer, and reporting it as a skip would lose it." Whether the list matches the type has nothing
   * to do with whether anybody has run a build.
   */
  if (!(await stat(ROOT).catch(() => null))) {
    if (drift.length) sayDrift();
    console.log('  prefs: no build to check. `pnpm build` first, and CI does.');
    return drift.length ? 1 : 3;
  }

  /**
   * AND FROM HERE EVERY HANDLE IS GIVEN BACK EVEN WHEN THE RUN THROWS, which it was not.
   *
   * The three closes used to stand together below the case loop on the straight-line path, with no
   * `try` above them, so anything that threw in between skipped all three: `context.addCookies`,
   * `page.evaluate(test.probe)` on a probe that is wrong about the DOM, `chromium.launch()` where no
   * browser is installed. `run.mjs` calls this gate IN-PROCESS, so what was skipped stayed open for the
   * rest of the run. Measured on 21 September against `keys.mjs`, which had the identical shape: a
   * throw after the launch left its port answering **HTTP 200**, the rebind a later gate then needed came
   * back **EADDRINUSE** (the port was fixed then and is ephemeral now), and the machine went from 18 browser processes to 21. With the `finally` the
   * same throw rebinds free and the process count comes back to 18.
   *
   * `let`, BECAUSE THE FINALLY HAS TO SEE THEM HALF-BUILT: the run that dies before the browser exists
   * is the run this is for, and a `const` inside the block is out of scope for the hand-back.
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
    /* THE RECORD THE REGISTER LIST READS, forwarded to from this gate's own port. See `record.mjs`. */
    record = await startRecord();

    server = createServer(async (req, res) => {
      const held = recordPrefsOf(req.headers.cookie);
      if (held !== null && /^\/+api\/boot$/u.test(new URL(req.url ?? '/', 'http://x').pathname)) return bootWith(req, res, record.base, held);
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

    browser = await chromium.launch();
    const findings = [];
    /** Loads that never drew, kept apart from the findings so neither sentence is read as the other. */
    const unsettled = [];
    let checked = 0;

    for (const test of CASES) {
      const seen = new Map();
      /* A CASE IS COMPARED ONLY IF EVERY LOAD IN IT WAS REAL. Two probes of two screens, one of which
         was never there, is not a comparison of a preference. */
      let comparable = true;
      /* WHAT THE LOAD BEFORE DREW, for a value that is a function of it (`pen.dismissed`). */
      let drew = '';
      for (const said of test.values) {
        const value = typeof said === 'function' ? said(drew) : said;
        /* `@record` IS WHAT THE RECORD KEEPS FOR THE PERSON, and never goes in the cookie. */
        const { '@record': kept, ...cookie } = value;
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', bypassCSP: true });
        /* THE COOKIE, NOT A CLICK. `50 §4.7` has the shell read `bd_pref` in a one-statement inline
           script before first paint, so setting it is exactly what the product does. It keeps this
           gate about whether the preference REACHES the DOM rather than about the control that sets it,
           which the a11y and layout gates already drive. */
        await context.addCookies([
          { name: 'bd_pref', value: encodeURIComponent(JSON.stringify(cookie)), url: `http://localhost:${PORT}` },
          ...(kept === undefined ? [] : [{ name: RECORD_PREFS, value: encodeURIComponent(JSON.stringify(kept)), url: `http://localhost:${PORT}` }]),
        ]);
        const page = await context.newPage();
        await page.goto(`http://localhost:${PORT}${APP_BASE}${test.route}`, { waitUntil: 'networkidle' });
        const unmeasured = ready.check(`${test.name} ${JSON.stringify(value)}`, test.route, await ready.settled(page));
        if (unmeasured) {
          unsettled.push(unmeasured);
          comparable = false;
          process.stdout.write('~');
          await context.close();
          continue;
        }
        /* THE GATE'S OWN PROOF THAT IT LOOKS AT ANYTHING. `BRAINDOG_GATE_SEED=prefs` pins the two
           tokens the checks read, which is exactly the shape of the bug this gate is named after (a
           preference reaching the cookie and a constant reaching the page), and the run must go red. */
        if (process.env.BRAINDOG_GATE_SEED === 'prefs')
          await page.addStyleTag({ content: ':root{--row-h:34px !important}html{--t-ui:15px !important;--text:15px !important}' });
        await page.waitForTimeout(120);
        drew = await page.evaluate(test.probe);
        seen.set(JSON.stringify(value), drew);
        await context.close();
        checked++;
        process.stdout.write('.');
      }

      if (!comparable) continue;

      /* EVERY VALUE DISTINCT, not merely "some pair differs". Three settings where two agree is a
         control with a step that does nothing, which is the same defect one notch smaller. */
      const answers = [...seen.entries()];
      const distinct = new Set(answers.map(([, v]) => v));
      if (distinct.size < answers.length) {
        findings.push(
          `${test.name}: ${answers.length} values, ${distinct.size} distinct. ${test.what}\n` +
            answers.map(([k, v]) => `        ${k} -> ${v}`).join('\n'),
        );
        process.stdout.write('!');
      }
    }

    process.stdout.write('\n');

    console.log(
      `  prefs: ${checked} page-runs over ${CASES.filter((c) => !c.record).length} of Pref's ${FIELDS.length} preferences ` +
        `and ${CASES.filter((c) => c.record).length} of the record's ${RECORD_KEYS.length} keys, ` +
        `${findings.length + drift.length} finding(s)` +
        (unsettled.length ? `, ${unsettled.length} load(s) on a page that never drew` : ''),
    );

    if (drift.length) sayDrift();

    if (findings.length) {
      console.error('\n  a preference that reaches the cookie and not the page:');
      for (const f of findings) console.error(`      ${f}`);
    }

    /* NOT UNDER THE HEADING ABOVE. "A preference that reaches the cookie and not the page" is a claim
       about the app, and a page that never drew is a claim about the load: printing the second under the
       first is how somebody ends up editing a probe to silence a host that was not answering. */
    if (unsettled.length) {
      console.error('\n  a preference whose screen was never there to measure:');
      for (const u of unsettled) console.error(`      ${u}`);
    }

    /**
     * AND A RUN WHERE NO SCREEN DREW IS RED even when every case came back distinct.
     *
     * Three of the ten cases read tokens off `documentElement` and `body`, which `app.html` sets from
     * the cookie before first paint and which are true of an empty document as well as a full one. Those
     * three would pass over a product that drew nothing at all, so the aggregate is what keeps a clean
     * `prefs` run from meaning less than it says.
     */
    const blind = ready.nothingDrawn();
    if (blind) console.error(`\n  ${blind}`);

    if (findings.length || unsettled.length || blind || drift.length) return 1;
  } finally {
    /**
     * ALL THREE, AND ONE FAILURE MAY NOT COST THE OTHER TWO.
     *
     * `await browser.close()` first and unguarded would be the same defect one layer in: a browser that
     * had already crashed rejects there, the rejection leaves the `finally`, and the record and the port
     * stay open exactly as before. Each hand-back is its own statement and swallows its own failure.
     * None of them is a second close either, which matters more than it looks: two closes of one record
     * reach `sql.close()` on a database already closed (`apps/selfhost/src/server.ts:72`) and throw
     * `ERR_INVALID_STATE` from inside `net`'s close callback, where no `await` can catch it, and the run
     * dies. Driven on 21 September.
     */
    await browser?.close().catch(() => {});
    /* AWAITED, unlike the bare `server.close()` this replaces: the callback is the moment the listening
       socket is actually gone. The port is ephemeral, so no later gate is waiting on this number, but a
       socket still listening is a handle that keeps the runner from exiting. */
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/** The cookie a case's `@record` rides in from the browser to this gate's server. Only this gate's server reads it. */
const RECORD_PREFS = 'bd_gate_record';

/** What a case says the record keeps for the person, from the request's cookie, or `null` when the case says nothing. */
function recordPrefsOf(cookie) {
  const raw = new RegExp(`(?:^|;\\s*)${RECORD_PREFS}=([^;]*)`).exec(cookie ?? '')?.[1];
  if (raw === undefined) return null;
  try {
    const out = JSON.parse(decodeURIComponent(raw));
    return out && typeof out === 'object' && !Array.isArray(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * The record's own `boot`, with `me.prefs` set to what the case says the record keeps.
 *
 * THE REST IS THE RECORD'S ANSWER, UNTOUCHED, read with the gate's key as `forward` reads it, so the page draws exactly
 * the screen it draws for a person whose record holds these preferences.
 */
async function bootWith(req, res, base, held) {
  const key = serverKeyFor(base);
  const said = await fetch(new URL(req.url ?? '/', base), { headers: key === undefined ? {} : { authorization: `Bearer ${key}` } })
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok === true && said.value && typeof said.value === 'object') said.value.me = { ...(said.value.me ?? {}), prefs: held };
  const answer = said ?? { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: "The gate's record did not answer its boot." } };
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(answer));
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns this file with `BRAINDOG_GATE_SEED=prefs` and
   the header documents `node tools/gates/prefs.mjs`. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await prefs()) ?? 0;
