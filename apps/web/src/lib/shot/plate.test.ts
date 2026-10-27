/**
 * Screenshot mode: what is plated and what still reads.
 *
 * THE RULE IS ONE SENTENCE AND THE TESTS ARE ITS TWO HALVES. A string the record holds is plated; a
 * literal somebody typed into the copy files is not. Nothing here knows what a balance or a title
 * is: it knows only that `1,204.50` and `Renew the lease` are not in the set of own words, and that
 * `Accept` is. So the first half below is the pure question over strings, and the second is the
 * same question asked of a drawn fragment.
 *
 * THERE IS NO BROWSER HERE. The fragment is a dozen lines of stand-in nodes carrying the members
 * `plate.ts` reads and no others, so a member it starts to lean on fails here before it fails in a
 * gate. That a plated thing cannot be READ is the stylesheet's claim and the picture gates'; that
 * the right things carry the mark, and lose it, is this file's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { plate, platedOf, watch } from './plate.ts';

/** The words a developer typed. `Due in ${n} days` has a hole, so it is not here in any form. */
const OWN: ReadonlySet<string> = new Set(['Accept', 'Needs you', 'Money', 'Needs you', 'Search', 'Close']);

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
  constructor(tag: string, attrs: Record<string, string> = {}, kids: (El | Txt | string)[] = []) {
    this.tagName = tag;
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    for (const kid of kids) this.add(kid);
  }
  add(kid: El | Txt | string): El | Txt {
    const node = typeof kid === 'string' ? new Txt(kid) : kid;
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
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

const el = (tag: string, attrs: Record<string, string> = {}, ...kids: (El | Txt | string)[]) => new El(tag, attrs, kids);
const root = (node: El) => node as unknown as Element;
const marked = (node: El) => node.hasAttribute('data-plated');

/** Every mark under a node, as the tag names that carry it, in document order. */
function marks(node: El): string[] {
  const here = marked(node) ? [node.tagName.toLowerCase()] : [];
  return [...here, ...node.childNodes.flatMap((kid) => (kid instanceof El ? marks(kid) : []))];
}

test('a balance, a name and a title are plated', () => {
  assert.deepEqual(platedOf(['1,204.50', 'Mara Okafor', 'Renew the lease'], OWN), [true, true, true]);
});

test('a button and a heading from the set still read', () => {
  assert.deepEqual(platedOf(['Accept', 'Needs you', 'Money'], OWN), [false, false, false]);
});

test('a sentence made from a template with a hole is plated, because the set never held it', () => {
  assert.deepEqual(platedOf(['Due in 3 days', 'Due in ${n} days'], OWN), [true, true]);
});

test('the text is matched as drawn: trimmed, and with a line break inside it read as one space', () => {
  assert.deepEqual(platedOf(['  Accept\n', 'Needs\n      you', 'accept'], OWN), [false, false, true]);
});

test('nothing to read is nothing to plate: an empty node and a lone separator', () => {
  assert.deepEqual(platedOf(['', '   ', '·', '/', '✓'], OWN), [false, false, false, false, false]);
});

test('the answer is the same the second time, and the input is not touched', () => {
  const texts = ['Accept', '1,204.50', 'Money', 'Mara Okafor'];
  const first = platedOf(texts, OWN);
  assert.deepEqual(platedOf(texts, OWN), first);
  assert.deepEqual(texts, ['Accept', '1,204.50', 'Money', 'Mara Okafor']);
  assert.equal(first.length, texts.length);
});

/**
 * A row of Money as it is drawn: a heading, a name, a balance, a sentence with a figure in it, and
 * the two buttons.
 */
function fragment() {
  const heading = el('h1', {}, 'Money');
  const name = el('span', {}, 'Mara Okafor');
  const balance = el('span', {}, '\n  1,204.50\n');
  const due = el('p', {}, 'Due in 3 days');
  const accept = el('button', {}, 'Accept');
  const decide = el('button', {}, el('svg', { 'aria-hidden': 'true' }, el('path')), 'Needs you');
  const frame = el('main', {}, heading, el('li', {}, name, ' · ', balance, due, accept, decide));
  return { frame, heading, name, balance, due, accept, decide };
}

test('on a drawn page the name, the balance and the made sentence carry the mark, and nothing else', () => {
  const f = fragment();
  plate(root(f.frame), OWN);
  assert.equal(marked(f.name), true);
  assert.equal(marked(f.balance), true);
  assert.equal(marked(f.due), true);
  assert.equal(marked(f.heading), false);
  assert.equal(marked(f.accept), false);
  assert.equal(marked(f.decide), false);
  /* The mark is on the element that holds the text, never on what holds that element. */
  assert.deepEqual(marks(f.frame), ['span', 'span', 'p']);
});

test('a second pass writes nothing', () => {
  const f = fragment();
  plate(root(f.frame), OWN);
  let writes = 0;
  const count = (node: El) => {
    const set = node.setAttribute.bind(node);
    const drop = node.removeAttribute.bind(node);
    node.setAttribute = (k, v) => (writes++, set(k, v));
    node.removeAttribute = (k) => (writes++, drop(k));
    for (const kid of node.childNodes) if (kid instanceof El) count(kid);
  };
  count(f.frame);
  plate(root(f.frame), OWN);
  assert.equal(writes, 0);
  assert.deepEqual(marks(f.frame), ['span', 'span', 'p']);
});

test('off takes every mark away', () => {
  const f = fragment();
  plate(root(f.frame), OWN);
  plate(root(f.frame), OWN, 'off');
  assert.deepEqual(marks(f.frame), []);
});

test('a text that becomes an own word loses its mark on the next pass', () => {
  const f = fragment();
  plate(root(f.frame), OWN);
  (f.name.childNodes[0] as Txt).nodeValue = 'Needs you';
  plate(root(f.frame), OWN);
  assert.equal(marked(f.name), false);
});

test('a field, a picture and a canvas are plated; a tick box and a button that says an own word are not', () => {
  const field = el('input', { type: 'text', placeholder: 'Search' });
  const bare = el('input');
  const notes = el('textarea', {}, 'Call the bank');
  const pick = el('select', {}, el('option', {}, 'Mara Okafor'));
  const tick = el('input', { type: 'checkbox' });
  const press = el('input', { type: 'submit', value: 'Accept' });
  const send = el('input', { type: 'submit', value: 'Pay Mara' });
  const face = el('img', { src: '/f/1', alt: '' });
  const logo = el('img', { src: '/mark.svg', alt: 'Money' });
  const drawn = el('canvas');
  const frame = el('main', {}, field, bare, notes, pick, tick, press, send, face, logo, drawn);
  plate(root(frame), OWN);
  assert.deepEqual(
    [field, bare, notes, pick, tick, press, send, face, logo, drawn].map(marked),
    [true, true, true, true, false, false, true, true, false, true],
  );
  /* A field is one plate: what is inside it is not marked a second time. */
  assert.equal(marked(pick.childNodes[0] as El), false);
});

test('a chart is plated as one thing, and an icon is left alone', () => {
  const label = el('text', {}, 'Rent');
  const chart = el('svg', { role: 'img', 'aria-label': 'Rent is most of what you spent in March' }, label, el('rect'));
  const icon = el('svg', { 'aria-hidden': 'true' }, el('path'));
  const named = el('svg', { role: 'img', 'aria-label': 'Close' }, el('path'));
  const frame = el('main', {}, chart, icon, named);
  plate(root(frame), OWN);
  assert.deepEqual([chart, label, icon, named].map(marked), [true, false, false, false]);
});

test('what is never drawn is never marked', () => {
  const code = el('script', {}, 'const who = "Mara Okafor"');
  const frame = el('main', {}, el('style', {}, '.a{}'), code);
  plate(root(frame), OWN);
  assert.deepEqual(marks(frame), []);
});

test('a tooltip the record wrote is moved aside while the mode is on, and put back when it is off', () => {
  const held = el('span', { title: 'Mara Okafor' }, 'Accept');
  const plain = el('button', { title: 'Close' }, 'Close');
  const frame = el('main', {}, held, plain);
  plate(root(frame), OWN);
  assert.equal(held.getAttribute('title'), null);
  assert.equal(plain.getAttribute('title'), 'Close');
  /* The words inside still read: only the tooltip was the record's. */
  assert.equal(marked(held), false);
  plate(root(frame), OWN, 'off');
  assert.equal(held.getAttribute('title'), 'Mara Okafor');
  assert.deepEqual([...held.attrs.keys()], ['title']);
});

type Change = { type: string; target: El | Txt; addedNodes: (El | Txt)[] };

/** The observer `watch` asks for, held so a test can say what the page did. */
function observer() {
  const seen = { tell: (_: Change[]) => {}, watching: false, asked: {} as Record<string, unknown>, dropped: 0 };
  (globalThis as { MutationObserver?: unknown }).MutationObserver = class {
    constructor(tell: (changes: Change[]) => void) {
      seen.tell = tell;
    }
    observe(_: unknown, asked: Record<string, unknown>) {
      seen.watching = true;
      seen.asked = asked;
    }
    disconnect() {
      seen.watching = false;
    }
    takeRecords() {
      seen.dropped++;
      return [];
    }
  };
  return seen;
}

test('watch plates what is there, then what arrives', () => {
  const seen = observer();
  const f = fragment();
  const stop = watch(root(f.frame), OWN);
  assert.deepEqual(marks(f.frame), ['span', 'span', 'p']);
  assert.equal(seen.watching, true);

  const list = f.frame.childNodes[1] as El;
  const title = el('a', {}, 'Renew the lease');
  const added = el('li', {}, title, el('button', {}, 'Accept'));
  f.frame.add(added);
  const late = list.add('Mara Okafor');
  seen.tell([
    { type: 'childList', target: f.frame, addedNodes: [added] },
    { type: 'childList', target: list, addedNodes: [late] },
  ]);
  assert.equal(marked(title), true);
  assert.equal(marked(list), true);
  assert.deepEqual(marks(added), ['a']);
  stop();
});

test('watch follows a text that is rewritten in place, both ways', () => {
  const seen = observer();
  const f = fragment();
  const stop = watch(root(f.frame), OWN);
  const text = f.accept.childNodes[0] as Txt;
  text.nodeValue = 'Pay Mara 1,204.50';
  seen.tell([{ type: 'characterData', target: text, addedNodes: [] }]);
  assert.equal(marked(f.accept), true);
  text.nodeValue = 'Accept';
  seen.tell([{ type: 'characterData', target: text, addedNodes: [] }]);
  assert.equal(marked(f.accept), false);
  stop();
});

test('watch does not hear its own marks, and leaves what is inside a chart alone', () => {
  const seen = observer();
  const label = el('text', {}, 'Rent');
  const chart = el('svg', { role: 'img', 'aria-label': 'Rent is most of what you spent' }, label);
  const frame = el('main', {}, chart);
  const stop = watch(root(frame), OWN);
  const filter = seen.asked.attributeFilter as string[];
  assert.equal(filter.includes('data-plated'), false);
  assert.equal(filter.includes('data-plated-title'), false);
  seen.tell([{ type: 'characterData', target: label.childNodes[0] as Txt, addedNodes: [] }]);
  assert.deepEqual(marks(frame), ['svg']);
  assert.ok(seen.dropped > 0);
  stop();
});

test('the stop function stops watching and takes every mark away', () => {
  const seen = observer();
  const f = fragment();
  const stop = watch(root(f.frame), OWN);
  stop();
  assert.equal(seen.watching, false);
  assert.deepEqual(marks(f.frame), []);
});

test('with no observer to ask, watch still plates once and still stops clean', () => {
  delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
  const f = fragment();
  const stop = watch(root(f.frame), OWN);
  assert.deepEqual(marks(f.frame), ['span', 'span', 'p']);
  stop();
  assert.deepEqual(marks(f.frame), []);
});

/* The copy files hold the empty string, so the set of the product's own words will hold it too, and a
   picture with no alt, or none said, then read as an own word and was left for anyone to see. Red before the fix. */
test('a picture with no words is plated even when the own words hold the empty string', () => {
  const own: ReadonlySet<string> = new Set([...OWN, '']);
  const face = el('img', { src: '/f/1', alt: '' });
  const spaced = el('img', { src: '/f/2', alt: '  ' });
  const bare = el('img', { src: '/f/3' });
  const logo = el('img', { src: '/mark.svg', alt: 'Money' });
  plate(root(el('main', {}, face, spaced, bare, logo)), own);
  assert.deepEqual([face, spaced, bare, logo].map(marked), [true, true, true, false]);
});
