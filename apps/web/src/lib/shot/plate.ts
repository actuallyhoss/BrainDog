/**
 * Screenshot mode: plate what the record holds, leave what a developer typed.
 *
 * IT IS A DISPLAY MODE FOR A SHOULDER, not a redaction. Nothing is removed from the page and what
 * is sent to the device does not change. This file only decides WHICH elements carry `data-plated`;
 * the stylesheet decides what a plated element looks like, and it does so without moving a box.
 *
 * THE RULE KNOWS NOTHING ABOUT THE RECORD, on purpose. It does not ask whether a string is a
 * balance or a name. It asks whether the string is one of the words typed into the copy files, and
 * plates everything that is not. So a new kind of value is plated the day it is first drawn, and
 * the only way to make something legible is to type it into source. A sentence built from a
 * template with a hole is never in the set, so it is plated whole, figure and all.
 *
 * THE SET IS HANDED IN. This file imports nothing: not the record, not a component, not the set
 * itself. Whoever mounts it passes the words, which is what lets the test beside it run on strings.
 *
 * WHAT IS PLATED BESIDE TEXT. A field, because what is in it was typed by the person or read from
 * the record. A picture and a canvas, because nothing here can read them. A chart, which is an
 * `svg` that says `role="img"` with a sentence that is not an own word: its marks say the figures
 * as plainly as its labels do, so it is plated as one thing. And a tooltip: no stylesheet reaches a
 * native one, so its text is moved aside while the mode is on and put back when it goes off.
 */

const MARK = 'data-plated';
/** Where a tooltip waits while the mode is on. */
const HELD = 'data-plated-title';

const ELEMENT = 1;
const TEXT = 3;

/** Never drawn, so never read. */
const UNSEEN = new Set(['script', 'style', 'noscript', 'template']);
/** Plated as one thing, always. */
const SEALED = new Set(['textarea', 'select', 'canvas', 'video']);
/** An input that holds no words of its own. */
const WORDLESS = new Set(['checkbox', 'radio', 'hidden']);
/** An input that is a button, and reads as its label does. */
const PRESSED = new Set(['button', 'submit', 'reset']);

/** What a mutation observer is asked to report, beside nodes and their text. */
const WATCHED = ['title', 'alt', 'aria-label', 'value', 'type'];

/** Something a person could read: a letter or a digit in any script. */
const READABLE = /[\p{L}\p{N}]/u;

/**
 * Which of these texts are plated. One answer per text, in the order given.
 *
 * A text is matched as it is drawn: trimmed, and with a run of white space read as one space, since
 * a line break inside a template is not a different sentence. A text with no letter and no digit is
 * left alone, because a separator or a tick says nothing about a record.
 */
export function platedOf(texts: readonly string[], own: ReadonlySet<string>): boolean[] {
  return texts.map((text) => {
    const trimmed = text.trim();
    if (!READABLE.test(trimmed)) return false;
    return !own.has(trimmed) && !own.has(trimmed.replace(/\s+/g, ' '));
  });
}

const reads = (text: string | null, own: ReadonlySet<string>) => text !== null && platedOf([text], own)[0] === true;

/** Whether this element is plated as one thing, whatever is inside it. */
function sealed(el: Element, tag: string, own: ReadonlySet<string>): boolean {
  if (SEALED.has(tag)) return true;
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (WORDLESS.has(type)) return false;
    return PRESSED.has(type) ? reads(el.getAttribute('value'), own) : true;
  }
  /* A picture reads only when its words do. One with no words is plated: it may be a face. */
  if (tag === 'img') return !own.has((el.getAttribute('alt') ?? '').trim());
  if (tag === 'svg' && el.getAttribute('role') === 'img') return reads(el.getAttribute('aria-label'), own);
  return false;
}

/** Move a tooltip aside while the mode is on, and put it back when it is off. */
function tooltip(el: Element, own: ReadonlySet<string>, on: boolean): void {
  const title = el.getAttribute('title');
  if (on) {
    if (!reads(title, own)) return;
    el.setAttribute(HELD, title ?? '');
    el.removeAttribute('title');
    return;
  }
  const held = el.getAttribute(HELD);
  if (held === null) return;
  if (title === null) el.setAttribute('title', held);
  el.removeAttribute(HELD);
}

/** Decide one element. Says whether what is inside it still needs deciding. */
function one(el: Element, own: ReadonlySet<string>, on: boolean): boolean {
  const tag = el.tagName.toLowerCase();
  if (UNSEEN.has(tag)) return false;
  tooltip(el, own, on);

  const whole = on && sealed(el, tag, own);
  let plated = whole;
  if (on && !whole) {
    const texts: string[] = [];
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i];
      if (kid?.nodeType === TEXT) texts.push(kid.nodeValue ?? '');
    }
    plated = platedOf(texts, own).includes(true);
  }

  /* Written only when it changes, so a second pass over a settled page writes nothing. */
  if (plated && !el.hasAttribute(MARK)) el.setAttribute(MARK, '');
  if (!plated && el.hasAttribute(MARK)) el.removeAttribute(MARK);
  return !whole;
}

function sweep(el: Element, own: ReadonlySet<string>, on: boolean): void {
  if (!one(el, own, on)) return;
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (kid?.nodeType === ELEMENT) sweep(kid as Element, own, on);
  }
}

/** Whether something above this node, up to `root`, is already plated as one thing or never drawn. */
function covered(node: Node, root: Element, own: ReadonlySet<string>): boolean {
  for (let up = node.parentNode; up && up.nodeType === ELEMENT; up = up.parentNode) {
    const tag = (up as Element).tagName.toLowerCase();
    if (UNSEEN.has(tag) || sealed(up as Element, tag, own)) return true;
    if (up === root) return false;
  }
  return false;
}

/**
 * Mark everything under `root` that the record holds, or with `'off'` take every mark away.
 *
 * The mark goes on the PARENT of a plated text, since a text has no box of its own to plate. Run
 * twice it changes nothing the second time, and run after the page has changed it also removes the
 * mark from an element whose text has since become an own word.
 */
export function plate(root: Element, own: ReadonlySet<string>, mode: 'on' | 'off' = 'on'): void {
  sweep(root, own, mode === 'on');
}

/**
 * Plate `root` now and keep it plated as the page changes. The function it returns stops watching
 * and takes every mark away, so turning the mode off is one call.
 *
 * Only what changed is decided again: the element a text or a child arrived in, what arrived, and
 * an element whose tooltip or label was rewritten. The marks this file writes are not among the
 * things it watches, and what its own tooltip move queues is dropped before it is delivered.
 */
export function watch(root: Element, own: ReadonlySet<string>): () => void {
  plate(root, own);
  if (typeof MutationObserver === 'undefined') return () => plate(root, own, 'off');

  const seen = new MutationObserver((changes) => {
    for (const change of changes) {
      const at = change.target;
      /* Inside a chart or a field there is nothing left to decide: the whole of it is plated. */
      if (covered(at, root, own)) continue;
      if (change.type === 'characterData') {
        const parent = at.parentNode;
        if (parent?.nodeType === ELEMENT) one(parent as Element, own, true);
      } else if (change.type === 'attributes') {
        sweep(at as Element, own, true);
      } else {
        if (at.nodeType === ELEMENT) one(at as Element, own, true);
        const added = change.addedNodes;
        for (let i = 0; i < added.length; i++) {
          const node = added[i];
          if (node?.nodeType === ELEMENT) sweep(node as Element, own, true);
        }
      }
    }
    seen.takeRecords();
  });
  seen.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: WATCHED });

  return () => {
    seen.disconnect();
    plate(root, own, 'off');
  };
}
