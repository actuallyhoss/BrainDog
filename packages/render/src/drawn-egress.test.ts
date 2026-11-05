/**
 * A drawn component has no peer connection and keeps no frame of its own: the two ways out its policy does not close.
 *
 * MEASURED IN CHROMIUM before the bridge did this: a component under `DRAWN_POLICY` named a TURN server and the browser
 * sent it UDP, and a `srcdoc` frame the component made ran a script of its own that did the same. No engine enforces
 * a policy on a peer connection. Here the bridge runs over a small stand-in for the frame's window, as the frame runs it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import { drawnDocument } from './drawn.ts';

function frame() {
  const doc = drawnDocument('', { data: { list: null, columns: [], rows: [] }, theme: { mode: 'light', tokens: {} } });
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map((m) => m[1]!);
  const start = /<script type="application\/json" id="braindog-start">([\s\S]*?)<\/script>/u.exec(doc)![1]!;
  class Node {
    get nodeType() { return 1; }
  }
  class NodeList {
    items: unknown[];
    constructor(items: unknown[]) {
      this.items = items;
    }
    get length() { return this.items.length; }
    item(i: number) { return this.items[i]; }
  }
  class MutationRecord {
    nodes: unknown[];
    constructor(nodes: unknown[]) {
      this.nodes = nodes;
    }
    get addedNodes() { return new NodeList(this.nodes); }
  }
  class Element extends Node {
    removed = false;
    tag: string;
    inside: Element[] = [];
    constructor(tag: string) {
      super();
      this.tag = tag;
    }
    matches(sel: string) { return sel.split(',').includes(this.tag); }
    querySelectorAll(sel: string) { return new NodeList(this.inside.filter((e) => e.matches(sel))); }
    remove() { this.removed = true; }
    attachShadow() { return {}; }
  }
  class ShadowRoot { setHTMLUnsafe() {} }
  class Document { write(_html?: string) {} writeln(_html?: string) {} static parseHTMLUnsafe() { return {}; } }
  let watch: ((records: MutationRecord[]) => void) | null = null;
  const document = Object.assign(new Document(), {
    documentElement: { setAttribute() {}, style: { setProperty() {} } },
    getElementById: () => ({ textContent: start }),
    body: null,
  });
  const window: Record<string, unknown> = {
    document,
    Node,
    NodeList,
    MutationRecord,
    Element,
    ShadowRoot,
    Document,
    RTCPeerConnection: function RTCPeerConnection() {},
    webkitRTCPeerConnection: function webkitRTCPeerConnection() {},
    MutationObserver: class {
      constructor(fn: typeof watch) { watch = fn; }
      observe() {}
    },
    ResizeObserver: class { observe() {} },
    addEventListener() {},
    parent: { postMessage() {} },
    console,
  };
  window.window = window;
  for (const s of scripts) runInNewContext(s, window);
  return { window, document, Element, Node, NodeList, MutationRecord, add: (n: unknown) => watch?.([new MutationRecord([n])]) };
}

test('THE BRIDGE TAKES THE PEER CONNECTION AWAY FOR GOOD, BEFORE ANY AUTHOR CODE', () => {
  const { window } = frame();
  assert.equal(window.RTCPeerConnection, undefined, 'a drawn component can still open a peer connection');
  assert.equal(window.webkitRTCPeerConnection, undefined);
  assert.throws(() => runInNewContext('"use strict"; window.RTCPeerConnection = function () {};', window));
  const doc = drawnDocument('<p>mine</p>', { data: { list: null, columns: [], rows: [] }, theme: { mode: 'light', tokens: {} } });
  assert.ok(doc.indexOf('RTCPeerConnection') < doc.indexOf('<p>mine</p>'));
});

test('A FRAME THE COMPONENT MAKES IS TAKEN OUT, AND A SHADOW ROOT OR A WRITTEN DOCUMENT IS REFUSED', () => {
  const { window, document, Element, add } = frame();
  const made = new Element('iframe');
  add(made);
  assert.equal(made.removed, true, 'a frame the component made stayed in the page');
  const plain = new Element('div');
  add(plain);
  assert.equal(plain.removed, false);
  assert.throws(() => new Element('div').attachShadow());
  assert.throws(() => document.write('<p>'));
  assert.throws(() => (window.Document as { parseHTMLUnsafe: () => unknown }).parseHTMLUnsafe());
});

test('THE AUTHOR CANNOT DISARM THE WATCH: all it calls was taken before any author code, off whatever the prototypes say now', () => {
  const { Element, MutationRecord, NodeList, add } = frame();
  /* MEASURED IN CHROMIUM: any one of these left the frame standing, and its script sent a row's text to a TURN server. */
  Element.prototype.remove = function () {};
  Element.prototype.matches = () => false;
  Element.prototype.querySelectorAll = () => new NodeList([]);
  Object.defineProperty(MutationRecord.prototype, 'addedNodes', { get: () => new NodeList([]) });
  Object.defineProperty(NodeList.prototype, 'length', { get: () => 0 });
  const made = new Element('iframe');
  const removed = () => (made as unknown as { removed: boolean }).removed;
  /* THE TAKEN `remove` MARKS IT, SO THE STAND-IN'S FIRST ONE IS WHAT MUST RUN. */
  add(made);
  assert.equal(removed(), true, 'the component disarmed the watch and kept its frame');
});

test('A FRAME DEEP INSIDE WHAT WAS ADDED IS TAKEN OUT TOO', () => {
  const { Element, add } = frame();
  const box = new Element('div');
  const made = new Element('iframe');
  box.inside.push(made);
  add(box);
  assert.equal(made.removed, true);
  assert.equal(box.removed, false);
});

test('AN ATTACHED PAGE IS HANDED ITS GUARD FIRST, AND KEEPS ITS DOCTYPE FIRST SO IT DRAWS AS IT WAS WRITTEN', async () => {
  const { attachedDocument } = await import('./visual.ts');
  const { DRAWN_GUARD } = await import('./drawn.ts');
  const guarded = (doc: string) => doc.indexOf(`<script>${DRAWN_GUARD}</script>`);
  const page = '<!-- made --> <!DOCTYPE html><html><body><p>mine</p>';
  const doc = attachedDocument(page);
  assert.equal(guarded(doc), '<!-- made --> <!DOCTYPE html>'.length, 'the guard is not right after the doctype');
  assert.ok(doc.endsWith('<html><body><p>mine</p>'), 'the page changed');
  assert.equal(guarded(attachedDocument('<p>no doctype</p>')), 0);
  /* A SHADOW ROOT THE PARSER WOULD OPEN IS WHERE THE WATCH CANNOT SEE, SO THE WORD IS TAKEN. */
  assert.doesNotMatch(attachedDocument('<div><template ShadowRootMode="closed"><iframe></iframe></template></div>').replace(DRAWN_GUARD, ''), /(?<!data-)shadowrootmode/iu);
  /* A PAGE OF COMMENTS WITH NO DOCTYPE AFTER THEM TAKES NO LONGER THAN ITS LENGTH. */
  const started = Date.now();
  attachedDocument(`${'<!-- x --> '.repeat(200_000)}<p>`);
  assert.ok(Date.now() - started < 1000, 'reading for the doctype backtracks');
});

test('A SHADOW ROOT WRITTEN IN THE MARKUP IS REFUSED AT INSTALL, where the watch for frames cannot see into it', async () => {
  const { drawnFault } = await import('./drawn.ts');
  const code = '<div><template shadowrootmode="closed"><script>void 0</script></template></div>';
  assert.match(drawnFault(code) ?? '', /shadow root/u);
  assert.equal(drawnFault('<div class="shadow">root</div>'), null);
});

test('A VISUAL IS DRAWN UNDER THE SAME GUARD, BEFORE ITS PAGE', async () => {
  const { visualDocument } = await import('./visual.ts');
  const { DRAWN_GUARD } = await import('./drawn.ts');
  const doc = visualDocument('<p>mine</p>', {}, { mode: 'light', tokens: {} });
  assert.ok(doc.includes(DRAWN_GUARD), 'a visual is drawn with no guard');
  assert.ok(doc.indexOf(DRAWN_GUARD) < doc.indexOf('<p>mine</p>'));
});
