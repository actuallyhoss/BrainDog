/**
 * Screenshot mode, turned on and off: what `mode.ts` adds to `plate.ts`.
 *
 * `plate.test.ts` holds the rule. This file holds the switch round it: on plates what the record holds and leaves the
 * product's own words, the tab's title keeps only the page's own name, off takes every mark away, one session runs at a
 * time, and a shared page never takes it. And the palette's row that turns it on and off (`customise.ts`).
 *
 * NO BROWSER AND NO BUILD. The own words and the sheet are handed in, so `virtual:own-words` and the stylesheet are
 * never imported, and the page is the same dozen lines of stand-in nodes `plate.test.ts` draws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyShot, shared, SHOT_MARK, titleIn, type Page } from './mode.ts';
import { customise, type Here } from '../palette/customise.ts';

/** The words a developer typed. Everything else on the page below is a record's. */
const OWN: ReadonlySet<string> = new Set(['Money', 'Accept', 'Needs you']);

class Txt {
  readonly nodeType = 3;
  readonly childNodes: never[] = [];
  parentNode: El | null = null;
  nodeValue: string;
  constructor(text: string) {
    this.nodeValue = text;
  }
}

class El {
  readonly nodeType = 1;
  readonly childNodes: (El | Txt)[] = [];
  parentNode: El | null = null;
  readonly attrs = new Map<string, string>();
  readonly tagName: string;
  constructor(tag: string, attrs: Record<string, string> = {}, kids: (El | string)[] = []) {
    this.tagName = tag;
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    for (const kid of kids) {
      const node = typeof kid === 'string' ? new Txt(kid) : kid;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
}

const el = (tag: string, attrs: Record<string, string> = {}, ...kids: (El | string)[]) => new El(tag, attrs, kids);
const marks = (node: El): string[] => [
  ...(node.hasAttribute('data-plated') ? [node.tagName] : []),
  ...node.childNodes.flatMap((kid) => (kid instanceof El ? marks(kid) : [])),
];

/** A Money page: its heading and a button the product typed, a balance and a payee the record holds. */
function drawn() {
  const heading = el('h1', {}, 'Money');
  const balance = el('span', {}, '4,310.00');
  const payee = el('td', { title: 'Orla Penhallow' }, 'Orla Penhallow');
  const button = el('button', {}, 'Accept');
  const body = el('body', {}, heading, el('table', {}, el('tr', {}, payee)), balance, button);
  const html = el('html');
  const page = { title: 'Orla Penhallow · Money · BrainDog', documentElement: html, querySelector: () => null };
  return { body, html, heading, balance, payee, button, page, root: body as unknown as Element, at: page as unknown as Page };
}

/** The parts the mode loads, counted, with the own words above. */
function parts(path = '/app/fernhill/p/money') {
  const loaded = { words: 0, sheet: 0 };
  return {
    loaded,
    words: async () => (loaded.words++, OWN),
    sheet: async () => (loaded.sheet++, undefined),
    path,
  };
}

test('on plates what the record holds and leaves the heading and the button the copy typed', async () => {
  const s = drawn();
  const p = parts();
  const stop = await applyShot(true, s.root, { ...p, page: s.at });
  assert.deepEqual(marks(s.body), ['td', 'span']);
  assert.equal(s.heading.hasAttribute('data-plated'), false);
  assert.equal(s.button.hasAttribute('data-plated'), false);
  /* A tooltip the record wrote is moved aside, since no sheet reaches a native one. */
  assert.equal(s.payee.getAttribute('title'), null);
  assert.equal(s.html.hasAttribute(SHOT_MARK), true);
  assert.equal(s.page.title, 'Money · BrainDog');
  assert.deepEqual(p.loaded, { words: 1, sheet: 1 });
  stop();
});

test('off takes every mark away, puts the tooltip and the title back, and the mark on the page goes', async () => {
  const s = drawn();
  await applyShot(true, s.root, { ...parts(), page: s.at });
  const stop = await applyShot(false, s.root, { ...parts(), page: s.at });
  assert.deepEqual(marks(s.body), []);
  assert.equal(s.payee.getAttribute('title'), 'Orla Penhallow');
  assert.equal(s.html.hasAttribute(SHOT_MARK), false);
  assert.equal(s.page.title, 'Orla Penhallow · Money · BrainDog');
  stop();
  assert.deepEqual(marks(s.body), []);
});

test('one session a tab: a second on hands back the same stop, and a stop that is no longer running does nothing', async () => {
  const s = drawn();
  const p = parts();
  const first = await applyShot(true, s.root, { ...p, page: s.at });
  const second = await applyShot(true, s.root, { ...p, page: s.at });
  assert.equal(first, second);
  assert.deepEqual(p.loaded, { words: 1, sheet: 1 });
  first();
  assert.deepEqual(marks(s.body), []);
  const again = await applyShot(true, s.root, { ...p, page: s.at });
  assert.deepEqual(marks(s.body), ['td', 'span']);
  first();
  assert.deepEqual(marks(s.body), ['td', 'span'], 'the old stop must not end the new session');
  again();
});

test('an off that arrives while the words are still loading starts nothing', async () => {
  const s = drawn();
  const pending = applyShot(true, s.root, { ...parts(), page: s.at });
  await applyShot(false, s.root, { ...parts(), page: s.at });
  const stop = await pending;
  assert.deepEqual(marks(s.body), []);
  assert.equal(s.html.hasAttribute(SHOT_MARK), false);
  stop();
});

test('a shared page for a stranger never takes it, inside a record or not, and loads nothing', async () => {
  for (const path of ['/app/s', '/app/fernhill/s']) {
    const s = drawn();
    const p = parts(path);
    const stop = await applyShot(true, s.root, { ...p, page: s.at });
    assert.deepEqual(marks(s.body), [], path);
    assert.equal(s.html.hasAttribute(SHOT_MARK), false, path);
    assert.deepEqual(p.loaded, { words: 0, sheet: 0 }, path);
    stop();
  }
  assert.equal(shared('/app/fernhill/p/money'), false);
  assert.equal(shared('/app/fernhill/s/k7Qm2'), true);
});

test("the tab keeps only the page's own name and the product's", () => {
  assert.equal(titleIn('Orla Penhallow · Money · BrainDog', OWN), 'Money · BrainDog');
  assert.equal(titleIn('Lease renewal · Pinecrest Lettings · BrainDog', OWN), 'BrainDog');
  assert.equal(titleIn('BrainDog', OWN), 'BrainDog');
});

/* ── the palette's row ──────────────────────────────────────────────────── */

const here = (shot: boolean): Here => ({ look: { shot }, places: [], hidden: [], home: null, pageMenu: false });
const rows = (query: string, shot = false) => customise(query, here(shot)).filter((o) => o.change.kind === 'shot');

test('"screenshot" finds the row that turns the mode on, and the one that turns it off once it is on', () => {
  assert.deepEqual(
    rows('screenshot').map((o) => o.change),
    [{ kind: 'shot', on: true }],
  );
  assert.deepEqual(
    rows('screenshot', true).map((o) => o.change),
    [{ kind: 'shot', on: false }],
  );
  assert.equal(rows('screenshot')[0]?.icon, 'eye');
});

test('the words a person reaches for find it too, and two letters find nothing', () => {
  for (const q of ['values', 'shoulder', 'screen', 'private values'])
    assert.equal(rows(q).length, 1, q);
  assert.equal(rows('sc').length, 0);
  /* "hide" alone is the page verb's, which draws nothing until a page is named. */
  assert.equal(rows('hide').length, 0);
  assert.equal(rows('').length, 0);
});
