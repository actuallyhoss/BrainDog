/**
 * What a `drawn` block decides, as functions a host calls: whether its code may be drawn at all, the document it is
 * drawn as, the data and the theme handed in, and what the frame may ask back ("Two ways to design":
 * Draw).
 *
 * A DRAWN BLOCK IS A SMALL COMPONENT SOMEBODY WROTE, held as data on the page's declaration (`code:`), for the few
 * visuals no kind fits: a runway chart, a payments calendar strip, a before and after. Composing from the kinds stays
 * the first way; this is the second.
 *
 * IT RUNS IN A SANDBOX, NEVER IN THE PAGE. The host draws it in a frame with `sandbox="allow-scripts"` and no
 * `allow-same-origin`, so it has an origin of its own that holds nothing: no cookie, no storage, no reach into the page
 * around it. The frame's own document carries `DRAWN_POLICY`, so it has no network either: nothing is fetched, nothing
 * is sent, and an image is one written inline. What goes in is the block's rows, as the record already read them for
 * this reader, and the theme's colours. What comes out is two messages, its height and a request to open one of the rows
 * it was handed, and the host checks both (`drawnAsk`).
 *
 * WHY A FRAME DOCUMENT OF ITS OWN AND NOT `srcdoc`. A `srcdoc` frame inherits the policy of the page that holds it, and
 * the app's policy runs no inline script but its own shell's (`apps/web/svelte.config.js`). So a drawn component written
 * into `srcdoc` would never run, and loosening the app's `script-src` to let it would loosen it for every page. The
 * hosts serve one small document instead (`@braindog/host/drawn-frame`), under its own policy, sandboxed by its header
 * too; the host posts it the document built here, and it writes it.
 *
 * THE RULES ARE COPIED INTO THE KERNEL (`packages/kernel/src/kinds/drawn.ts`), which refuses a block at install by them,
 * for the reason `embed.ts` gives of its providers: the kernel does not import the renderer. A rule added is added in both.
 */

/** The most a drawn component's code may hold, in bytes of UTF-8. A visual, not an app. */
export const DRAWN_CODE_MOST = 64 * 1024;

/** How tall a frame may stand, in CSS pixels: the least, what it stands at before the component says, and the most. */
export const DRAWN_HEIGHT = { least: 48, first: 240, most: 1600 } as const;

/**
 * The policy written into the document itself. The frame's own header says the same and adds `sandbox`, which a meta
 * tag cannot carry; a browser enforces both, so this one is the backstop where a host served the frame without it.
 */
export const DRAWN_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The theme's colours a component is handed, as CSS variables of the same names: the roles the design book names
 * (`design-book.ts` `ROLES`), and `accent`, which is `red` under its job's name.
 */
export const DRAWN_TOKENS = ['board', 'tile', 'tile-2', 'ink', 'ink-2', 'ink-3', 'rule', 'red', 'red-fill', 'red-tint', 'good', 'warn', 'info', 'live'] as const;

/** The words the host draws that no author wrote, here because this package cannot import the app's copy. */
export const DRAWN_NONE = 'Nothing drawn here yet.';
export const DRAWN_LABEL = 'A drawn component';

/**
 * WHAT A COMPONENT MAY NOT SAY, with the sentence each refusal is. The frame's policy stops all of it anyway, so these
 * are here to tell an author at install, in words, rather than leave a component that draws nothing in a page.
 *
 * AN ADDRESS OFF THE PAGE IS A SCHEME AND A HOST, a protocol-relative `//`, or a `url()` that is not inline data or a
 * fragment (`url(#fade)` is an SVG's own gradient). The network calls are refused by name, and so is storage, which a
 * sandboxed frame has none of. A whole document is refused because the host writes the head itself.
 */
export const DRAWN_RULES: readonly { test: RegExp; fix: string }[] = [
  /* `http://www.w3.org/` IS A NAME AND NOT A PLACE: an SVG's `xmlns` is written with it, and nothing is fetched from it. */
  { test: /\b(?:https?|wss?|ftp|file):\/\/(?!www\.w3\.org\/)|\bjavascript:/iu, fix: 'it names an address off the page, and a drawn component reaches nothing outside itself. Write pictures inline, as data: images or SVG.' },
  { test: /(?:src|href|action|srcset|poster|data|xlink:href)\s*=\s*["']?\s*\/\//iu, fix: 'it names an address off the page, and a drawn component reaches nothing outside itself.' },
  { test: /url\(\s*["']?\s*(?!data:|#|["')])/iu, fix: 'a url() in it points somewhere other than inline data, and a drawn component loads nothing.' },
  { test: /@import\b/iu, fix: 'it imports a stylesheet, and a drawn component loads nothing. Write the styles in it.' },
  { test: /<\s*(?:link|base|meta|iframe|frame|object|embed|form|portal)\b/iu, fix: 'it holds a link, meta, frame, object or form tag, which a drawn component cannot use. Draw with HTML, SVG, CSS and a script.' },
  { test: /\bshadowroot(?:mode|clonable|delegatesfocus|serializable)\b/iu, fix: 'it opens a shadow root, and a drawn component draws in its own page. Write the markup as it is.' },
  { test: /<\s*(?:!doctype|html|head|body)\b/iu, fix: 'it is a whole document, and the host writes the head. Write what goes inside the page: the markup, a style tag and a script tag.' },
  { test: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|RTCPeerConnection|Worker|SharedWorker)\s*\(/u, fix: 'it calls the network, and a drawn component has none. It is handed its rows as braindog.data.' },
  { test: /\bimport\s*\(|\bimport\s+[\w{*]/u, fix: 'it imports a module, and a drawn component loads nothing. Write it as one script.' },
  { test: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches)\b/u, fix: 'it uses storage, and a drawn component keeps nothing. What it shows comes from braindog.data each time.' },
  { test: /\b(?:top|parent|opener)\s*\.\s*(?:location|document)\b|\bwindow\.open\s*\(/u, fix: 'it reaches for the page around it, and a drawn component cannot. To open one of its rows it calls braindog.open with the row.' },
];

import { isBag, type DrawnData, type DrawnValue } from './drawn-data.ts';

export { DRAWN_ROWS_MOST, drawnData, type DrawnData, type DrawnRow, type DrawnValue } from './drawn-data.ts';

const BYTES = new TextEncoder();

/**
 * What is wrong with a component's code, in words that finish "This component cannot be drawn because", or `null`.
 * Empty code is not a fault here: a drawn block with nothing in it yet says `DRAWN_NONE`.
 */
export function drawnFault(code: string): string | null {
  if (BYTES.encode(code).length > DRAWN_CODE_MOST) return `it is longer than ${DRAWN_CODE_MOST / 1024} KB. A drawn component is one small visual; split it or draw less.`;
  for (const rule of DRAWN_RULES) if (rule.test.test(code)) return rule.fix;
  return null;
}

/** A height a frame asked for, clamped; anything that is not a finite number is the first height. */
export function drawnHeight(asked: unknown): number {
  if (typeof asked !== 'number' || !Number.isFinite(asked)) return DRAWN_HEIGHT.first;
  return Math.round(Math.min(DRAWN_HEIGHT.most, Math.max(DRAWN_HEIGHT.least, asked)));
}

/** What a component is handed as `braindog.theme`: light or dark, and each token's value as the page draws it. */
export type DrawnTheme = { mode: 'light' | 'dark'; tokens: Record<string, string> };

/** A CSS value the host read from its own sheet, kept only when it cannot end the declaration it is set into. */
const SAFE_VALUE = /^[^;{}<>\\]{1,120}$/u;

/** The theme, from a reader of the page's own custom properties (`getComputedStyle(...).getPropertyValue`). */
export function drawnTheme(mode: 'light' | 'dark', read: (name: string) => string): DrawnTheme {
  const tokens: Record<string, string> = {};
  for (const name of DRAWN_TOKENS) {
    const value = read(`--${name}`).trim();
    if (SAFE_VALUE.test(value)) tokens[name] = value;
  }
  if (tokens.red) tokens.accent = tokens.red;
  const font = read('--font-ui').trim();
  if (SAFE_VALUE.test(font)) tokens.font = font;
  return { mode, tokens };
}

/** JSON that can sit inside a script tag: no `<` reaches the page, so no `</script>` closes it early. */
const scriptJson = (v: unknown): string => JSON.stringify(v).replace(/</gu, '\\u003c');

/**
 * THE GUARD, written before anything else into every document drawn in the frame, a drawn block's and a visual's: it
 * takes away the ways out the policy does not close, before any author's script runs.
 *
 * No browser enforces a policy on a peer connection (`connect-src` does not cover one, and `webrtc 'block'` is in no
 * engine), and a component's ICE servers are hosts it names: measured, Chromium sent UDP to a TURN server the code named,
 * from a frame under `DRAWN_POLICY`, and so did a `srcdoc` frame the code made, whose window holds constructors of its
 * own. So the constructors are gone from the window for good, a frame the code makes is taken out again before any task
 * can run in it, and a shadow root or a second document, where that watch cannot see, is refused. Navigating the frame
 * is held by the page around it, whose `frame-src` names only BrainDog and the embed providers.
 */
export const DRAWN_GUARD = `(function () {
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function (n) {
    try { Object.defineProperty(window, n, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  });
  var FRAMES = 'iframe,frame,object,embed';
  function unframe(n) {
    if (!n || n.nodeType !== 1) return;
    if (n.matches(FRAMES)) n.remove();
    else n.querySelectorAll(FRAMES).forEach(function (f) { f.remove(); });
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) { r.addedNodes.forEach(unframe); });
  }).observe(document, { childList: true, subtree: true });
  function refuse() { throw new Error('A drawn component draws in its own page, with no shadow root and no second document.'); }
  [[Element.prototype, 'attachShadow'], [Element.prototype, 'setHTMLUnsafe'], [window.ShadowRoot && ShadowRoot.prototype, 'setHTMLUnsafe'], [Document, 'parseHTMLUnsafe'], [Document.prototype, 'write'], [Document.prototype, 'writeln'], [document, 'write'], [document, 'writeln']].forEach(function (at) {
    if (at[0] && at[1] in at[0]) Object.defineProperty(at[0], at[1], { value: refuse, writable: false, configurable: false });
  });
})();`;

/**
 * THE BRIDGE, the one script the host writes into every drawn document after the guard and before the author's:
 * `braindog.data`, `braindog.theme`, `braindog.size` (the widget frame it is drawn in on a board, or `null` on a page),
 * `braindog.on(fn)` (called now and on every change, with the data, the theme and the size), `braindog.open(ref)`, the
 * theme painted onto the root as CSS variables, and the height said to the host whenever the body changes size.
 *
 * AND ITS PICTURE, when the host asks: the component's styles and its markup as drawn now, with no script, no handler
 * and every canvas turned into an inline image. The host keeps it on the device and draws it inert
 * (`drawnPictureDocument`) where the component is not alive (widgets plan §8: three alive at once).
 */
const BRIDGE = `(function () {
  var start = JSON.parse(document.getElementById('braindog-start').textContent);
  var root = document.documentElement;
  var handlers = [];
  function paint(theme) {
    root.setAttribute('data-theme', theme.mode);
    root.style.colorScheme = theme.mode;
    for (var k in theme.tokens) root.style.setProperty('--' + k, theme.tokens[k]);
  }
  function tell(fn) { try { fn(bd.data, bd.theme, bd.size); } catch (e) { console.error(e); } }
  function picture() {
    var css = '';
    document.querySelectorAll('style').forEach(function (s) { css += s.textContent + ' '; });
    var body = document.body.cloneNode(true);
    var live = document.body.querySelectorAll('canvas');
    body.querySelectorAll('canvas').forEach(function (c, i) {
      try {
        var img = document.createElement('img');
        img.src = live[i].toDataURL();
        img.className = live[i].className;
        img.style.cssText = live[i].style.cssText;
        img.width = live[i].clientWidth || live[i].width;
        c.replaceWith(img);
      } catch (e) { c.remove(); }
    });
    body.querySelectorAll('script,style,template').forEach(function (n) { n.remove(); });
    body.querySelectorAll('*').forEach(function (n) {
      for (var i = n.attributes.length - 1; i >= 0; i--) if (/^on/i.test(n.attributes[i].name)) n.removeAttribute(n.attributes[i].name);
    });
    return '<style>' + css + '</style>' + body.innerHTML;
  }
  var bd = {
    data: start.data,
    theme: start.theme,
    size: start.size || null,
    on: function (fn) { if (typeof fn === 'function') { handlers.push(fn); tell(fn); } },
    open: function (ref) { if (typeof ref === 'string') parent.postMessage({ braindog: 'open', ref: ref }, '*'); },
    create: function (list, fields) { return ask({ braindog: 'create', list: String(list), fields: fields || {} }); },
    update: function (ref, patch) { return ask({ braindog: 'update', ref: String(ref), patch: patch || {} }); }
  };
  var waiting = {};
  var asked = 0;
  function ask(m) {
    asked += 1;
    m.id = 'a' + asked;
    return new Promise(function (resolve) { waiting[m.id] = resolve; parent.postMessage(m, '*'); });
  }
  window.braindog = bd;
  paint(start.theme);
  addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.braindog === 'done' && typeof m.id === 'string' && waiting[m.id]) { var r = waiting[m.id]; delete waiting[m.id]; r(m.answer); return; }
    if (m.braindog === 'picture') { try { parent.postMessage({ braindog: 'picture', picture: picture() }, '*'); } catch (e) {} return; }
    if (m.braindog === 'data') bd.data = m.data;
    else if (m.braindog === 'theme') { bd.theme = m.theme; paint(m.theme); }
    else if (m.braindog === 'size') bd.size = m.size || null;
    else return;
    handlers.forEach(tell);
  });
  var last = -1;
  function report() {
    var h = Math.ceil(document.body ? document.body.getBoundingClientRect().height : 0);
    if (h !== last) { last = h; parent.postMessage({ braindog: 'height', height: h }, '*'); }
  }
  addEventListener('DOMContentLoaded', function () { new ResizeObserver(report).observe(document.body); report(); });
  addEventListener('load', report);
})();`;

/** The ground every component starts on: the theme's text on no background of its own, so it sits on its tile. */
const BASE_STYLE = `html,body{margin:0;padding:0;background:transparent}body{display:flow-root;overflow-x:hidden;color:var(--ink);font:15px/1.45 var(--font,system-ui,sans-serif)}*{box-sizing:border-box}`;

/**
 * The whole document a component is drawn as: the policy, the base style, the guard, the start data, the bridge and the
 * author's code, in that order. The code was checked by `drawnFault` before it got here; the frame's policy holds either way.
 */
export function drawnDocument(code: string, start: { data: DrawnData; theme: DrawnTheme; size?: string | null }): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="content-security-policy" content="${DRAWN_POLICY}">`,
    `<style>${BASE_STYLE}</style>`,
    `<script>${DRAWN_GUARD}</script>`,
    `<script type="application/json" id="braindog-start">${scriptJson(start)}</script>`,
    `<script>${BRIDGE}</script>`,
    '</head><body>',
    code,
    '</body></html>',
  ].join('');
}

/** What a frame asked, once checked: to stand at a height, to open one of the rows it was handed, or its picture. */
export type DrawnAsk =
  | { height: number }
  | { open: string }
  | { picture: string }
  /* A ROW ADDED OR CHANGED BY ITS VIEW (add-ons phase 4): the host forwards it to the record, which checks it against the
     block's declared `actions:`, the add-on's own lists and `uses` writes, and the viewer's ladder, then writes as the
     viewer. `id` is the frame's own, to answer it by. */
  | { act: DrawnAct };

/** One write a view asked for, checked for shape: add a row to a list, or change one of the rows it was handed. */
export type DrawnAct = { id: string; create: { list: string; fields: Record<string, DrawnValue> } } | { id: string; update: { ref: string; patch: Record<string, DrawnValue> } };

/** The most a view's write may weigh, as JSON. */
export const DRAWN_ACT_MOST = 32 * 1024;

/** The most a component's picture may weigh, in characters: a drawing, not a page. */
export const DRAWN_PICTURE_MOST = 256 * 1024;

/**
 * The policy a picture is drawn under: its styles and inline images, and no script at all, so a picture is inert
 * whatever its markup says. The frame's own header still holds; this is the stricter of the two.
 */
export const DRAWN_PICTURE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

/** A token's name as the theme hands it. */
const TOKEN_NAME = /^[a-z0-9-]{1,40}$/u;

/**
 * THE DOCUMENT A PICTURE IS DRAWN AS: the base style, the theme as CSS variables on the root (no script paints it here),
 * and the picture the component handed back, under `DRAWN_PICTURE_POLICY`. Nothing in it runs and nothing in it is
 * pressed: a picture stands in for the component until it comes alive.
 */
export function drawnPictureDocument(picture: string, theme: DrawnTheme): string {
  const mode = theme.mode === 'dark' ? 'dark' : 'light';
  const vars = Object.entries(theme.tokens)
    .filter(([k, v]) => TOKEN_NAME.test(k) && SAFE_VALUE.test(v))
    .map(([k, v]) => `--${k}:${v}`)
    .join(';');
  return [
    `<!doctype html><html data-theme="${mode}" style="color-scheme:${mode}"><head><meta charset="utf-8">`,
    `<meta http-equiv="content-security-policy" content="${DRAWN_PICTURE_POLICY}">`,
    `<style>${BASE_STYLE}:root{${vars}}body{pointer-events:none;user-select:none}</style>`,
    '</head><body>',
    picture.length > DRAWN_PICTURE_MOST ? '' : picture,
    '</body></html>',
  ].join('');
}

/**
 * A message from a frame, read as one of the two things it may ask, or `null`.
 *
 * THE HOST CHECKS WHO SENT IT before this (the message's `source` is its own frame's window), and this checks what it
 * says: a height is clamped, and a row is opened only when it is one of `refs`, the rows the host handed in, so a
 * component can never send its reader to anything the block did not already show.
 */
export function drawnAsk(message: unknown, refs: ReadonlySet<string>): DrawnAsk | null {
  if (!isBag(message)) return null;
  if (message.braindog === 'height') return typeof message.height === 'number' && Number.isFinite(message.height) ? { height: drawnHeight(message.height) } : null;
  if (message.braindog === 'open') return typeof message.ref === 'string' && refs.has(message.ref) ? { open: message.ref } : null;
  if (message.braindog === 'picture') return typeof message.picture === 'string' && message.picture.length <= DRAWN_PICTURE_MOST ? { picture: message.picture } : null;
  if ((message.braindog === 'create' || message.braindog === 'update') && typeof message.id === 'string' && /^a\d{1,9}$/u.test(message.id)) {
    const body = message.braindog === 'create' ? message.fields : message.patch;
    if (!isBag(body)) return null;
    let text = '';
    try {
      text = JSON.stringify(body);
    } catch {
      return null;
    }
    if (text.length > DRAWN_ACT_MOST) return null;
    const plain = JSON.parse(text) as Record<string, DrawnValue>;
    if (message.braindog === 'create')
      return typeof message.list === 'string' && /^[a-z][a-z0-9_-]{0,31}$/u.test(message.list) ? { act: { id: message.id, create: { list: message.list, fields: plain } } } : null;
    /* A ROW IS CHANGED ONLY WHEN IT IS ONE THE HOST HANDED IN, as a row is opened only then. */
    return typeof message.ref === 'string' && refs.has(message.ref) ? { act: { id: message.id, update: { ref: message.ref, patch: plain } } } : null;
  }
  return null;
}

/** An example a person can start from, drawn over whatever rows the block reads: a bar per row of its second column. */
export const DRAWN_EXAMPLE = `<div id="bars"></div>
<style>
  .bar { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
  .bar span { flex: 0 0 30%; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar i { display: block; height: 10px; border-radius: 5px; background: var(--red); }
  button { all: unset; cursor: pointer; display: contents; }
</style>
<script>
  braindog.on(function (data) {
    var name = data.columns[0] && data.columns[0].field;
    var size = data.columns[1] && data.columns[1].field;
    var most = Math.max.apply(null, data.rows.map(function (r) { return Number(r.fields[size]) || 0; }).concat([1]));
    var bars = document.getElementById('bars');
    bars.textContent = data.rows.length === 0 ? 'Nothing to draw yet.' : '';
    data.rows.forEach(function (r) {
      var b = document.createElement('button');
      b.className = 'bar';
      b.onclick = function () { braindog.open(r.ref); };
      var label = document.createElement('span');
      label.textContent = String(r.fields[name] == null ? '' : r.fields[name]);
      var bar = document.createElement('i');
      bar.style.width = Math.round(((Number(r.fields[size]) || 0) / most) * 70) + '%';
      b.append(label, bar);
      bars.append(b);
    });
  });
</script>`;
