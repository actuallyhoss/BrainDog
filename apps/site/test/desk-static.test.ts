/**
 * THE HERO'S LIVE DESK (`src/lib/desk/`), as a reader with scripting off receives it, and the shared asks it moves.
 *
 * ALL FIVE PLACES ARE IN THE HTML (20 October). Since 29 October the desk is drawn in the app's frame: a sidebar
 * whose buttons open five panes (Today, Needs you, Money, Agents and a project), and only the chosen one shows once the
 * script runs; with scripting off a <noscript> rule lays all five out one under another. So the served page must hold
 * the sidebar with its places, five panes, Today's greeting, and that rule. No <img>: every band is the product's own parts, never a picture of them (§23, §47).
 *
 * THE SAME CHECKS RUN TWICE. Once over the desk rendered on the server here, which needs no build, and once over the
 * built `index.html`, which waits for a build newer than the desk (`built.ts`): an older build holds someone else's
 * page, and under `SITE_BUILT=1` a missing one is a failure, not a skip.
 *
 * THE DESK'S ASKS ARE ONE STATE (`needs.svelte.ts`) its Today, its Needs you and its count all read, and the chores
 * band asks other things from a store of its own. The reducer is held to the order here, and the module itself is
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

import { ASKED, NEEDS } from '../src/lib/demo/maya.ts';
import { DESK, TABS } from '../src/lib/desk/words.ts';
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
const { default: Desk } = await load<{ default: Component<Record<string, never>> }>('../src/lib/desk/Desk.svelte');
type Store = { open: string[]; done: string[]; answer(id: string, yes: boolean): void; undo(id: string): void };
type Move = { kind: 'answer'; id: string; yes: boolean } | { kind: 'undo'; id: string };
type State = { open: readonly string[]; done: readonly string[] };
const shared = await load<{
  needs: Store;
  asked: Store;
  start: (order: readonly string[]) => State;
  step: (s: State, m: Move, order: readonly string[]) => State;
}>('../src/lib/desk/needs.svelte.ts');

const DESK_DIR = new URL('../src/lib/desk/', import.meta.url);
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

/** Today's head as it reads before the script tells the hour: the greeting alone (DIRECTION §51). */
const GREETING = 'Good morning, Maya';

/** The desk's promises over one page of HTML, whichever way it was made. */
function holdsTheDesk(html: string, where: string): void {
  const side = html.match(/<nav class="places[^"]*"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(side, `${where} has no sidebar`);
  const opens = [...side[1]!.matchAll(/<button[^>]*id="desk-tab-([a-z]+)"[^>]*>/g)].map((m) => m[1]);
  assert.deepEqual(opens, ['today', 'needs', 'money', 'agents', 'projects'], `${where}: the five places that open, in the sidebar's order`);
  assert.deepEqual([...opens].sort(), [...TABS].sort(), `${where}: every pane has its place`);
  const named = words(side[1]!);
  for (const t of TABS) if (t !== 'projects') assert.ok(named.includes(DESK.tabs[t]), `${where}: the sidebar names ${DESK.tabs[t]}`);
  assert.ok(named.includes(DESK.more.work) && named.includes(DESK.more.people), `${where}: Work and People are in the frame`);
  assert.match(side[1]!, /<button[^>]*id="desk-tab-today"[^>]*aria-current="page"|<button[^>]*aria-current="page"[^>]*id="desk-tab-today"/, `${where}: Today is chosen`);

  const panels = html.match(/id="desk-pane-[a-z]+"/g) ?? [];
  assert.equal(panels.length, 5, `${where} holds five panes`);
  for (const t of TABS) assert.match(html, new RegExp(`id="desk-pane-${t}"`), `${where} has the ${t} pane`);
  assert.ok(html.indexOf('id="desk-pane-today"') < html.indexOf('id="desk-pane-needs"'), 'Today comes first');
  assert.ok(words(html).includes(GREETING), `${where}: Today opens on the greeting "${GREETING}"`);

  const rule = html.match(/<noscript>\s*<style[^>]*>([\s\S]*?)<\/style>\s*<\/noscript>/);
  assert.ok(rule, `${where} has no <noscript><style> rule`);
  assert.match(rule[1]!, /\.desk-pane\s*\{\s*display:\s*block\s*!important/, 'every place shows with scripting off');
  assert.match(rule[1]!, /\.desk-pane-name\s*\{\s*display:\s*block/, 'each place is headed by its name');
  assert.match(rule[1]!, /aria-current='page'\]/, 'the sidebar stops marking a place as chosen');

  assert.doesNotMatch(html, /<img\b/i, `${where} draws no picture of the product`);
  assert.ok(!words(html).includes(EM_DASH), `${where} has an em dash a person reads`);
}

test('the desk rendered on the server holds every place, Today\'s greeting and the noscript rule', () => {
  const { body, head } = render(Desk, { props: {} });
  const html = head + body;
  holdsTheDesk(html, 'the server-rendered desk');
  for (const n of NEEDS) assert.ok(words(html).includes(n.ask), `Needs you holds "${n.ask}"`);
  assert.match(html, /<span class="count[^"]*"[^>]*>2<\/span>/, 'the count on Needs you says 2');
  for (const n of ASKED) assert.ok(!words(html).includes(n.ask), `the desk does not repeat the chores band's "${n.ask}"`);
  assert.doesNotMatch(html, /id="desk-drop"/, 'the bar is closed until pressed');
  const visible = words(body);
  assert.doesNotMatch(visible, /\b(rows?|list items?|entity|entities|schema|slug|MCP)\b/i, 'no never-word on the desk');
  assert.doesNotMatch(visible, /\b[0-9A-HJKMNP-TV-Z]{26}\b/, 'no id on the desk');
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
  /* The chores band's questions are their own: answering one leaves the desk's alone. */
  assert.deepEqual(asked.open, ASKED.map((n) => n.id));
  asked.answer(ASKED[0]!.id, true);
  assert.deepEqual(needs.open, [ids[0]]);
});

/* THE BUILT PAGE IS READ ONLY WHEN IT IS NEWER THAN EVERY DESK FILE, unless the step has just built it. */
const newest = Math.max(...readdirSync(DESK_DIR).map((f) => statSync(new URL(f, DESK_DIR)).mtimeMs));
const STALE =
  !STRICT && existsSync(INDEX) && statSync(INDEX).mtimeMs < newest
    ? 'apps/site/build is older than src/lib/desk, so it holds an older home page; build the site to read this one'
    : null;

test('the built home page holds the desk whole for a reader without scripting', when(missing(['index.html']) ?? STALE), () => {
  holdsTheDesk(readFileSync(INDEX, 'utf8'), 'index.html');
});
