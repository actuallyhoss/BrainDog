/**
 * THE HERO'S DRAWING OF THE APP (`src/lib/product/`), as a reader with scripting off receives it, and the shared asks
 * it moves.
 *
 * SINCE THE REDO OF 2 NOVEMBER the hero draws the app's Today as it is on 1 November, in the app's own window
 * (`Window.svelte`): the rail with its places, the bar with the page's name, and on the board Needs you, Cash ahead,
 * Working now and Numbers (`Today.svelte`). Everything a reader can read is in the HTML; the rail and the bars are
 * hidden from a screen reader as the picture they are. No <img>: every section is the product's own parts, never a
 * picture of them (§23, §47).
 *
 * THE SAME CHECKS RUN TWICE. Once over the desk rendered on the server here, which needs no build, and once over the
 * built `index.html`, which waits for a build newer than the desk (`built.ts`): an older build holds someone else's
 * page, and under `SITE_BUILT=1` a missing one is a failure, not a skip.
 *
 * THE DRAWING'S ASKS ARE ONE STATE (`needs.svelte.ts`) its Needs you tile and the rail's count both read, and the
 * filing section asks other things from a store of its own. The reducer is held to the order here, and the module itself is
 * compiled and driven the way a page drives it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { ASKED, NEEDS, FOUNDER } from '../src/lib/demo/maya.ts';
import { frame, today } from '../src/lib/copy/product.ts';
import { BUILD, STRICT, missing, when } from './built.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const plain = stripTypeScriptTypes(readFileSync(filename, 'utf8'));
      const { js } = compileModule(plain, { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which reads no Svelte here, does not look for the files. */
const load = async <T>(path: string): Promise<T> => (await import(new URL(path, import.meta.url).href)) as T;
const { default: Today } = await load<{ default: Component<Record<string, never>> }>('../src/lib/product/Today.svelte');
type Store = { open: string[]; done: string[]; answer(id: string, yes: boolean): void; undo(id: string): void };
type Move = { kind: 'answer'; id: string; yes: boolean } | { kind: 'undo'; id: string };
type State = { open: readonly string[]; done: readonly string[] };
const shared = await load<{
  needs: Store;
  asked: Store;
  start: (order: readonly string[]) => State;
  step: (s: State, m: Move, order: readonly string[]) => State;
}>('../src/lib/desk/needs.svelte.ts');

const DESK_DIR = new URL('../src/lib/product/', import.meta.url);
const INDEX = new URL('index.html', BUILD);

/* Spelled by code point, so this file holds none. */
const EM_DASH = String.fromCharCode(0x2014);

/** The words a person reads: tags, scripts, styles and comments out, the few entities a page uses turned back. */
const words = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** Today's head as it reads before the script tells the hour: the morning's greeting. */
const GREETING = today.greet(9, FOUNDER.short);

/** Today's promises over one piece of HTML, whichever way it was made. */
function holdsToday(html: string, where: string): void {
  const said = words(html);
  assert.ok(said.includes(GREETING), `${where}: Today opens on the greeting "${GREETING}"`);
  for (const title of [today.needs, today.cash, today.working, today.numbers]) assert.ok(said.includes(title), `${where}: the ${title} tile`);
  for (const n of NEEDS) assert.ok(said.includes(n.what), `${where}: Needs you holds "${n.what}"`);
  assert.match(html, /class="tile-count late num"[^>]*>2</, `${where}: the count on Needs you says 2`);
  for (const n of ASKED) assert.ok(!said.includes(n.ask), `${where}: Today does not repeat the filing section's "${n.ask}"`);
  assert.doesNotMatch(html, /<img\b/i, `${where} draws no picture of the product`);
  assert.ok(!said.includes(EM_DASH), `${where} has an em dash a person reads`);
}

/** The window round it, in the built page: the app's frame, named, its rail and bars a picture. */
function holdsTheWindow(html: string, where: string): void {
  const win = html.match(/<figure class="win shot[^"]*"[^>]*aria-label="([^"]*)"/);
  assert.ok(win, `${where} has no window`);
  assert.equal(win[1]!.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&'), frame.label, `${where}: the window is named`);
  const rail = html.match(/<aside class="rail[^"]*"[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/aside>/);
  assert.ok(rail, `${where}: the rail is there, hidden from a screen reader as the picture it is`);
  for (const p of frame.places) assert.ok(words(rail[1]!).includes(p.label), `${where}: the rail names ${p.label}`);
}

test('Today rendered on the server holds its greeting, its four tiles and both asks', () => {
  const { body, head } = render(Today, { props: {} });
  const html = head + body;
  holdsToday(html, 'the server-rendered Today');
  const visible = words(body);
  assert.doesNotMatch(visible, /\b(rows?|list items?|entity|entities|schema|slug|MCP)\b/i, 'no never-word in Today');
  assert.doesNotMatch(visible, /\b[0-9A-HJKMNP-TV-Z]{26}\b/, 'no id in Today');
});

test('the asks move in order: yes moves across first, Not now drops, Undo goes back to its first place', () => {
  const order = ['pay', 'sam', 'key'];
  let s = shared.start(order);
  assert.deepEqual(s, { open: order, done: [] });
  s = shared.step(s, { kind: 'answer', id: 'sam', yes: true }, order);
  assert.deepEqual(s, { open: ['pay', 'key'], done: ['sam'] }, 'yes moves it across with a done line');
  s = shared.step(s, { kind: 'answer', id: 'pay', yes: true }, order);
  assert.deepEqual(s.done, ['pay', 'sam'], 'the latest done line goes first');
  s = shared.step(s, { kind: 'answer', id: 'key', yes: false }, order);
  assert.deepEqual(s, { open: [], done: ['pay', 'sam'] }, 'Not now drops it with no done line');
  s = shared.step(s, { kind: 'undo', id: 'sam' }, order);
  assert.deepEqual(s, { open: ['sam'], done: ['pay'] });
  s = shared.step(s, { kind: 'undo', id: 'pay' }, order);
  assert.deepEqual(s.open, ['pay', 'sam'], 'an undone ask goes back to its first place');
  assert.equal(shared.step(s, { kind: 'undo', id: 'key' }, order), s, 'an ask dropped with Not now has nothing to undo');
  assert.equal(shared.step(s, { kind: 'answer', id: 'nope', yes: true }, order), s, 'an ask not open is not answered');
});

test("the desk's asks start open in the record order, and Today, Needs you and the count see one state", () => {
  const { needs, asked } = shared;
  const ids = NEEDS.map((n) => n.id);
  assert.deepEqual(needs.open, ids);
  needs.answer(ids[0]!, true);
  assert.deepEqual(needs.open, ids.slice(1));
  assert.deepEqual(needs.done, [ids[0]]);
  needs.answer(ids[1]!, false);
  assert.deepEqual(needs.open, []);
  needs.undo(ids[0]!);
  assert.deepEqual(needs.open, [ids[0]]);
  assert.deepEqual(needs.done, []);
  /* Read afresh through `shared`, which the asserts above have not narrowed. */
  shared.needs.open.push('a copy');
  assert.equal(shared.needs.open.includes('a copy'), false, 'a reader gets a copy, never the state itself');
  /* The filing section's questions are their own: answering one leaves Today's alone. */
  assert.deepEqual(asked.open, ASKED.map((n) => n.id));
  asked.answer(ASKED[0]!.id, true);
  assert.deepEqual(needs.open, [ids[0]]);
});

/* THE BUILT PAGE IS READ ONLY WHEN IT IS NEWER THAN EVERY FILE OF THE DRAWING, unless the step has just built it. */
const newest = Math.max(...readdirSync(DESK_DIR).map((f) => statSync(new URL(f, DESK_DIR)).mtimeMs));
const STALE =
  !STRICT && existsSync(INDEX) && statSync(INDEX).mtimeMs < newest
    ? 'apps/site/build is older than src/lib/product, so it holds an older home page; build the site to read this one'
    : null;

test('the built home page holds Today whole, in the app\'s window, for a reader without scripting', when(missing(['index.html']) ?? STALE), () => {
  const html = readFileSync(INDEX, 'utf8');
  holdsToday(html, 'index.html');
  holdsTheWindow(html, 'index.html');
});
