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
  class Element {
    removed = false;
    tag: string;
    constructor(tag: string) {
      this.tag = tag;
    }
    get nodeType() { return 1; }
    matches(sel: string) { return sel.split(',').includes(this.tag); }
    querySelectorAll() { return []; }
    remove() { this.removed = true; }
    attachShadow() { return {}; }
  }
  class ShadowRoot { setHTMLUnsafe() {} }
  class Document { write(_html?: string) {} writeln(_html?: string) {} static parseHTMLUnsafe() { return {}; } }
  let watch: ((records: { addedNodes: unknown[] }[]) => void) | null = null;
  const document = Object.assign(new Document(), {
    documentElement: { setAttribute() {}, style: { setProperty() {} } },
    getElementById: () => ({ textContent: start }),
    body: null,
  });
  const window: Record<string, unknown> = {
    document,
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
  return { window, document, Element, add: (n: unknown) => watch?.([{ addedNodes: [n] }]) };
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
