/**
 * The drawn app on the home page, as a reader with scripting off receives it, and the phone's tab strip.
 *
 * SVELTE.CONFIG.JS PROMISES THE WHOLE SITE READABLE WITH SCRIPTING OFF, and the drawn app broke the
 * promise without anything noticing. Every case's panel is stacked in one grid cell and only the
 * chosen one is `visibility: visible`, so with no script to choose another, four of the five cases
 * never appeared. `loop/research-site-now.md` measured it in Chromium with `javaScriptEnabled: false`
 * at 1440 and again at 390: 1 of 5 panels visible, and pressing "Solo founder" left "Personal"
 * chosen. The layout gate cannot see it, because it drives the page with scripting on.
 *
 * AT 390 THE TAB STRIP IS 340 PIXELS WIDE AND ITS TABS ARE 602, so "Team" and "New project" start
 * off screen. The last visible tab faded at the edge and nothing else said the row went on.
 *
 * IT READS `build/` AND NOT `src/`, for the reason `content.test.ts` gives: a `<noscript>` that the
 * compiler drops, or a rule whose selector loses to the component's own, is invisible in the source
 * and plain in the served bytes. A missing build is a skip that says so, as it is there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BUILD = new URL('../build/', import.meta.url);
const INDEX = new URL('index.html', BUILD);
const ASSETS = new URL('_app/immutable/assets/', BUILD);

const NO_BUILD = existsSync(INDEX)
  ? null
  : 'apps/site/build/index.html is missing. Run "pnpm --filter @braindog/site build" first: ' +
    'these checks read the served bytes, and a check with nothing to read is a pass that means nothing.';

/** `{ skip: reason }` or nothing, because `exactOptionalPropertyTypes` refuses `{ skip: undefined }`. */
const when = (reason: string | null): { skip: string } | Record<string, never> => (reason ? { skip: reason } : {});

/* The five cases by the ids and the words `copy.ts` gives them, which `content.test.ts` also holds. */
const CASES = [
  ['personal', 'Personal'],
  ['student', 'Student'],
  ['founder', 'Solo founder'],
  ['team', 'Team'],
  ['guide', 'New project'],
] as const;

const page = (): string => readFileSync(INDEX, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');

/** The CSS inside every `<noscript>` in the document's head, which is where a scripting-off rule has to live. */
const noscriptCss = (html: string): string => {
  const head = html.slice(0, html.indexOf('</head>'));
  const out: string[] = [];
  for (const block of head.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)) {
    for (const style of (block[1] ?? '').matchAll(/<style>([\s\S]*?)<\/style>/g)) out.push(style[1] ?? '');
  }
  return out.join('\n');
};

/** Every `selector { body }` pair at the top level of a stylesheet with no nesting in it. */
const rules = (css: string): { selector: string; body: string }[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: (m[2] ?? '').replace(/\s+/g, ''),
  }));

/** Classes plus attribute selectors: the part of specificity every rule here competes on. */
const weight = (selector: string): number => (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;

/* `(width < 640px)` AS THE BUILD WRITES IT. lightningcss rewrites the range form in the source as
   `not (min-width:640px)`, measured on the build of 23 September, so the source's spelling alone would
   find no phone rule at all and fail for the wrong reason. */
const PHONE = /width\s*<\s*640px|not\s*\(min-width:\s*640px\)|max-width:\s*639/;

/** Each panel's own markup, from its opening tag to the next panel's. */
const panels = (html: string): Map<string, string> => {
  const found = new Map<string, string>();
  const starts = [...html.matchAll(/<div\b[^>]*\srole="tabpanel"[^>]*\sid="uc-([\w-]+)-rail"/g)];
  starts.forEach((m, i) => found.set(m[1] ?? '', html.slice(m.index, starts[i + 1]?.index ?? html.length)));
  return found;
};

/**
 * THE RULE THAT LAYS THE FIVE OUT, AND IT HAS TO WIN. The component's own `.panel.svelte-HASH`
 * carries two classes, and so does `.on.svelte-HASH`. A scripting-off rule that also carried two
 * would tie, and a tie goes to whichever stylesheet the browser met last: the `<noscript>` sits in
 * the head before or after the external stylesheet depending on what SvelteKit decides to emit
 * first, which is not something to rest a promise on. So every rule that touches a panel has to
 * outweigh the component's by a class, and this measures that rather than trusting it.
 */
test('with scripting off, a rule in the head puts all five panels in view, one after another', when(NO_BUILD), () => {
  const html = page();
  const css = noscriptCss(html);
  assert.notEqual(css, '', 'index.html has no <noscript><style> in its head, so a reader with scripting off sees one case of five');

  const scoped = html.match(/role="tabpanel"[^>]*/)?.[0] ?? '';
  const panelClass = html.match(/<div class="(panel svelte-[\w-]+)[^"]*"[^>]*role="tabpanel"/)?.[1];
  assert.ok(panelClass, `no panel in index.html carries a scoped class to compete with: ${scoped.slice(0, 120)}`);
  const componentWeight = panelClass.split(/\s+/).length;

  const touching = rules(css).filter((r) => /\.panel\b|tabpanel/.test(r.selector));
  const said = touching.map((r) => r.body).join(';');
  for (const need of ['visibility:visible', 'opacity:1', 'grid-area:auto']) {
    assert.ok(said.includes(need), `the scripting-off rule for the panels does not say ${need}, so a panel stays hidden or stacked on the others`);
  }
  for (const r of touching) {
    for (const one of r.selector.split(',')) {
      assert.ok(
        weight(one) > componentWeight,
        `the scripting-off selector "${one.trim()}" weighs ${weight(one)}, and the component's own panel rule weighs ${componentWeight}: a tie is decided by stylesheet order`,
      );
    }
  }
});

/**
 * THE TABS GO, AND EACH PANEL SAYS WHICH CASE IT IS. A tab with no script behind it does nothing when
 * pressed, which `Arrange.svelte` calls a broken control however it looks, so the rule hides the
 * strip. With the strip gone the case's own name has to be somewhere, and a panel's Home page is
 * titled "Day to day" or "Overview", which is not the name the reader was offered. So each panel
 * carries its case's name, `hidden` in the served markup so that a reader with scripting on never
 * meets it twice, and shown by the same rule.
 */
test('with scripting off, the tabs are hidden and each panel is headed by its own case', when(NO_BUILD), () => {
  const html = page();
  const css = noscriptCss(html);
  const hidesStrip = rules(css).some((r) => /\.tabs\b|tablist/.test(r.selector) && r.body.includes('display:none'));
  assert.ok(hidesStrip, 'the scripting-off rule leaves the tab strip in view, and not one of its tabs does anything without a script');

  const found = panels(html);
  assert.equal(found.size, CASES.length, `index.html has ${found.size} case panels, and there are ${CASES.length} cases`);
  for (const [id, label] of CASES) {
    const markup = found.get(id) ?? '';
    const named = markup.match(/<p class="case[^"]*" hidden="">([^<]*)<\/p>/);
    assert.ok(named, `the ${label} panel has no hidden case name for a scripting-off reader to be shown`);
    assert.equal(named[1]?.trim(), label, `the ${label} panel is headed "${named[1]}"`);
  }
  const shows = rules(css).some((r) => /\.case\b/.test(r.selector) && /display:(?!none)/.test(r.body));
  assert.ok(shows, 'the scripting-off rule never shows the hidden case names, so five panels arrive with no name between them');
});

/**
 * THE PHONE'S CUE, SERVED BEFORE ANY SCRIPT RUNS. The strip is drawn saying there is more after
 * it, which is true at every phone width the layout gate measures (320, 360, 390), so the arrow is
 * there on the first paint and not only once the page has hydrated. The component measures the
 * strip after that and moves the fade to whichever end still has tabs behind it.
 *
 * AND ONLY ON A PHONE: every stylesheet rule that shows the arrow sits inside the narrow media
 * query, so a desk, where all five tabs fit, draws the bar exactly as it did.
 */
test('at phone width the tab strip says it scrolls, and on a desk it says nothing', when(NO_BUILD), () => {
  const html = page();
  const strip = html.match(/<div class="tabs[^"]*"[^>]*role="tablist"[^>]*>/)?.[0] ?? '';
  assert.match(strip, /\sdata-more="after"/, `the served tab strip does not say it has more after it: ${strip}`);
  assert.match(html, /<span class="more[^"]*" aria-hidden="true">/, 'the bar has no arrow beside the strip to say it scrolls');

  const sheets = existsSync(ASSETS) ? readdirSync(ASSETS).filter((name) => name.endsWith('.css')) : [];
  const css = sheets.map((name) => readFileSync(new URL(name, ASSETS), 'utf8')).join('\n');
  const shown: string[] = [];
  const outside: string[] = [];
  // Walk the minified sheet with a stack of the preludes it is inside, so each rule knows its media query.
  const open: string[] = [];
  let buffer = '';
  for (const ch of css) {
    if (ch === '{') {
      open.push(buffer.trim());
      buffer = '';
    } else if (ch === '}') {
      const selector = open.pop() ?? '';
      if (!selector.startsWith('@') && /\.more\b/.test(selector) && /display:(?!none)/.test(buffer.replace(/\s+/g, ''))) {
        const inside = open.filter((p) => p.startsWith('@media'));
        (inside.some(PHONE.test.bind(PHONE)) ? shown : outside).push(`${inside.join(' ')} ${selector}`.trim());
      }
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  assert.ok(shown.length > 0, 'no rule in the built stylesheet shows the arrow at phone width');
  assert.deepEqual(outside, [], 'a rule shows the arrow outside the phone media query, so a desk would draw it too');
});
