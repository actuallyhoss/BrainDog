/**
 * The home page of 17 October (DIRECTION §47): its words, and the page the build writes from them.
 *
 * THE WORDS ARE THE APPROVED DESIGN'S. `copy/home.ts` holds them at the key paths the claims ledger reads, word for
 * word as `loop/site-2026-10-17/src/site.html` says them, with no em dash and none of the words a reader never meets
 * (`docs/54-WRITING.md`). The plans band left with the pricing page, which is held until BrainDog is priced.
 *
 * THE BUILT PAGE reads completely with scripting off: one h1, the four cards in order with everything they draw
 * already in the HTML, the makers by name, no picture, and no solid red but the Start free button. Those checks read
 * `apps/site/build` and skip, saying why, until it has been built.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { home } from '../src/lib/copy/home.ts';
import { BUILD, missing, when } from './built.ts';

const NO_BUILD = missing(['index.html'], 'the home page checks read the built page');

/** Every string a reader can meet in `home`, the functions said with a sample figure. */
function strings(value: unknown, path = 'home'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') return [[path, String((value as (x: never) => unknown)(3 as never))]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}.${i}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

/* The words the site never says in prose (docs/54-WRITING.md), whole words and either case. */
const NEVER = /\b(rows?|list items?|entit(?:y|ies)|register|schemas?|slugs?|MCP|packs?|credentials?|snapshots?)\b/i;

test('home.ts holds the design words at the key paths the ledger reads', () => {
  assert.equal(home.hero.title, 'Give your business a memory.');
  assert.equal(home.hero.sub, 'One record of your projects, money and people, shared by you and every AI agent you use.');
  assert.equal(home.hero.secondary, 'Connect an agent');
  assert.equal(home.hero.works, 'Works with');
  assert.deepEqual(
    home.hero.makers.map((m) => m.name),
    ['Claude', 'ChatGPT', 'Codex', 'Cursor', 'VS Code'],
  );
  const c = home.cards;
  assert.equal(c.brief.title, 'It tells you where things stand.');
  assert.equal(c.brief.say, 'A short brief every morning, rewritten whenever something changes. Tap a figure to see why.');
  assert.equal(c.brief.label, "Maya's brief");
  assert.equal(c.brief.behind, 'where it comes from');
  assert.equal(c.agents.title, 'Your agents share one memory.');
  assert.equal(c.agents.say, "Each starts with your brief and leaves a note when it's done. Nothing gets explained twice.");
  assert.equal(c.agents.notes, 'Notes on Tidepool');
  assert.equal(c.agents.connect, 'Connect yours in one line');
  assert.equal(c.chores.title, 'It does the chores. You make the calls.');
  assert.equal(
    c.chores.say,
    'Filing, naming and sorting just happen, each with a reason and an undo. You only see what needs a person.',
  );
  assert.equal(c.chores.waits, 'Waits for you');
  assert.equal(c.chores.done, 'Done on its own');
  assert.equal(c.chores.floor, 'Money, keys, sharing and deletes always wait for your yes.');
  assert.equal(c.chores.floorMore, 'No rule and no agent can change that.');
  assert.equal(c.slash.name, 'Slash');
  assert.equal(c.slash.title, 'Press / and ask anything.');
  assert.equal(
    c.slash.say,
    'Slash answers from your record, finds anything in a keystroke, and drafts what you ask for. Nothing goes in without your yes.',
  );
  assert.equal(c.slash.more, 'How Slash works');
  assert.equal(home.yours.title, 'It stays yours.');
  assert.deepEqual(home.yours.points, [
    { title: 'Every change has a name on it.', body: 'You see who changed what, you or which agent, and you can undo it.' },
    { title: 'Take it all with you.', body: 'Export the whole record as one file, whenever you like.' },
    { title: 'Keys stay in the vault.', body: 'Agents use your keys without ever seeing them, and no key goes into a chat.' },
  ]);
  assert.equal(home.closing.title, 'Start your record.');
  assert.equal(home.closing.body, 'Say what you work on, connect an agent, and read your first brief in a few minutes.');
});

test('the home words hold no em dash and none of the never-words', () => {
  for (const [path, said] of strings(home)) {
    assert.ok(!said.includes('—'), `${path} holds an em dash: ${said}`);
    assert.ok(!NEVER.test(said), `${path} says ${said.match(NEVER)?.[0]}: ${said}`);
  }
});

test('the hero sentence names no mechanism', () => {
  assert.doesNotMatch(home.hero.sub, /\b(events?|logs?|rows?|MCP|ledger)\b/i);
});

test('the home page draws no plans while the pricing page is held', () => {
  assert.ok(!('plans' in home), 'home.ts holds a plans band');
  const page = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /\/pricing|Plans\.svelte/, 'the home page links the held pricing page or draws its cards');
});

/** The built home page, and its readable text: tags and Svelte's markers out, entities said, spaces closed up. */
const page = (): string => readFileSync(new URL('index.html', BUILD), 'utf8');
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
const text = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/\s+/g, ' ');

test('the built home page has one h1, the slogan', when(NO_BUILD), () => {
  const h1s = [...page().matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1, 'one h1');
  assert.equal(text(h1s[0]![1]!).trim(), 'Give your business a memory.');
  assert.match(h1s[0]![0], /\bid="hero-title"/, 'the h1 is #hero-title, which scripts/product.mjs reads');
});

test('the hero is section.hero with the slogan and the .sub sentence', when(NO_BUILD), () => {
  const html = page();
  const hero = html.match(/<section\b[^>]*class="[^"]*\bhero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(hero, 'section.hero');
  assert.match(hero[0], /id="hero-title"/);
  assert.match(hero[0], /class="[^"]*\bsub\b[^"]*"[^>]*>\s*(<!--[^>]*-->)?\s*One record of your projects/);
});

test('the four cards, then It stays yours and the close, in order', when(NO_BUILD), () => {
  const said = text(page());
  const order = [
    home.cards.brief.title,
    home.cards.agents.title,
    home.cards.chores.title,
    home.cards.slash.title,
    home.yours.title,
    home.closing.title,
  ];
  let at = 0;
  for (const heading of order) {
    const found = said.indexOf(heading, at);
    assert.ok(found >= 0, `"${heading}" is on the page after the one before it`);
    at = found + heading.length;
  }
  assert.equal([...page().matchAll(/<article\b[^>]*class="[^"]*\bcard\b/g)].length, 4, 'four article.card');
});

test('the makers are named, and the page draws no picture', when(NO_BUILD), () => {
  const html = page();
  const said = text(html);
  for (const name of ['Claude', 'ChatGPT', 'Codex', 'Cursor', 'VS Code']) assert.ok(said.includes(name), name);
  assert.doesNotMatch(html, /<img\b/i);
});

test('the only solid red on the page is Start free', when(NO_BUILD), () => {
  for (const m of page().matchAll(/<(\w+)\b[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    const classes = m[2]!.split(/\s+/);
    if (!(classes.includes('btn') && classes.includes('red'))) continue;
    assert.equal(m[1], 'a', `a solid red ${m[1]}`);
    assert.match(text(m[3]!).trim(), /^(Start free|Open BrainDog)$/, `a solid red button says "${text(m[3]!).trim()}"`);
  }
});

test('with scripting off, every card says what it draws', when(NO_BUILD), async () => {
  const { BRIEF, EVIDENCE, HANDLED, NEEDS, NOTES, ASKS } = await import('../src/lib/demo/maya.ts');
  const said = text(page());
  const brief = BRIEF.parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');
  assert.ok(said.includes(brief), 'the brief, in plain text');
  assert.ok(said.includes(EVIDENCE.inv.head), "the first figure's facts are open");
  for (const n of NOTES) assert.ok(said.includes(n.text), `the note "${n.text}"`);
  for (const n of NEEDS) assert.ok(said.includes(n.ask), `the ask "${n.ask}"`);
  for (const h of HANDLED) assert.ok(said.includes(h.text), `the chore "${h.text}"`);
  assert.ok(said.includes(ASKS[0]!.q), "the Slash card's first question");
  assert.ok(said.includes(home.cards.chores.floor), 'the floor');
});
