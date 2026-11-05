/**
 * A visual drawn: its page in the drawn block's frame, its pictures swapped for `data:` addresses the app read through
 * the file door, so the frame stays without network. Whole width, scrolling inside itself.
 */

import { DRAWN_GUARD, DRAWN_POLICY, type DrawnTheme } from './drawn.ts';

/** The places a page names a picture: an attribute's value, each `srcset` candidate, and a CSS `url()`. */
const ATTRIBUTE = /(\s(?:src|href|poster|xlink:href|background)\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'>]+))/giu;
const SRCSET = /(\ssrcset\s*=\s*)("([^"]*)"|'([^']*)')/giu;
const URL = /url\(\s*("([^"]*)"|'([^']*)'|([^)"']*))\s*\)/giu;

/**
 * The page with every picture it names by one of `pictures`' names swapped for that picture's `data:` address. A name it
 * does not hold is left as written, and draws nothing in the frame.
 */
export function swapPictures(page: string, pictures: Readonly<Record<string, string>>): string {
  const swap = (name: string): string | undefined => (Object.hasOwn(pictures, name.trim()) ? pictures[name.trim()] : undefined);
  return page
    .replace(ATTRIBUTE, (whole, lead: string, _q, dq?: string, sq?: string, bare?: string) => {
      const to = swap(dq ?? sq ?? bare ?? '');
      return to === undefined ? whole : `${lead}"${to}"`;
    })
    .replace(SRCSET, (whole, lead: string, _q, dq?: string, sq?: string) => {
      const list = (dq ?? sq ?? '').split(',').map((part) => {
        const [name = '', ...rest] = part.trim().split(/\s+/u);
        const to = swap(name);
        return [to ?? name, ...rest].join(' ');
      });
      return list.join(', ') === (dq ?? sq ?? '') ? whole : `${lead}"${list.join(', ')}"`;
    })
    .replace(URL, (whole, _q, dq?: string, sq?: string, bare?: string) => {
      const to = swap(dq ?? sq ?? bare ?? '');
      return to === undefined ? whole : `url("${to}")`;
    });
}

/** A picture's bytes as the `data:` address the frame takes. */
export function pictureData(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/** What every visual starts from: the theme's ground, pictures and tables kept inside the width, and nothing wider. */
const BASE_STYLE =
  'html{-webkit-text-size-adjust:100%;color-scheme:var(--scheme,light)}html,body{margin:0}body{color:var(--ink);background:var(--board,transparent);font:15px/1.5 var(--font,system-ui,sans-serif);overflow-wrap:anywhere}img,svg,video,canvas{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}*{box-sizing:border-box}';

/** The theme painted onto the root and the height said to the host: a drawn block's bridge, without its data. */
const BRIDGE = `(function () {
  var theme = JSON.parse(document.getElementById('braindog-theme').textContent);
  var root = document.documentElement;
  root.setAttribute('data-theme', theme.mode);
  root.style.setProperty('--scheme', theme.mode);
  for (var k in theme.tokens) root.style.setProperty('--' + k, theme.tokens[k]);
  var last = -1;
  function report() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h !== last) { last = h; parent.postMessage({ braindog: 'height', height: h }, '*'); }
  }
  addEventListener('DOMContentLoaded', function () { new ResizeObserver(report).observe(document.body); report(); });
  addEventListener('load', report);
})();`;

/** JSON that can sit inside a script tag: no `<` reaches the page, so no `</script>` closes it early. */
const scriptJson = (v: unknown): string => JSON.stringify(v).replace(/</gu, '\\u003c');

/** The document a visual is drawn as: the frame's policy, the phone's width, the base style and theme, then the page. */
export function visualDocument(page: string, pictures: Readonly<Record<string, string>>, theme: DrawnTheme): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="content-security-policy" content="${DRAWN_POLICY}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${BASE_STYLE}</style>`,
    `<script>${DRAWN_GUARD}</script>`,
    `<script type="application/json" id="braindog-theme">${scriptJson(theme)}</script>`,
    `<script>${BRIDGE}</script>`,
    '</head><body>',
    swapPictures(page, pictures),
    '</body></html>',
  ].join('');
}

/**
 * Where a page's own doctype ends, with any space and comments before it, or 0 where it has none. WALKED AND NOT A SINGLE
 * PATTERN, because a lazy comment inside a repeat backtracks without end on a page of comments with no doctype after them.
 */
function afterDoctype(page: string): number {
  const space = /\s*/uy;
  const skip = (at: number): number => {
    space.lastIndex = at;
    space.test(page);
    return space.lastIndex;
  };
  let at = skip(0);
  while (page.startsWith('<!--', at)) {
    const shut = page.indexOf('-->', at + 4);
    if (shut === -1) return 0;
    at = skip(shut + 3);
  }
  const doctype = /<!doctype\b[^>]*>/iuy;
  doctype.lastIndex = at;
  return doctype.test(page) ? doctype.lastIndex : 0;
}

/**
 * A page somebody attached (a Claude artifact, any `.html`), as the frame is handed it: the page itself, as it came, with
 * the guard its frame's policy cannot do without. An attached page sees no row of the record, but it can see who opened it
 * and when, and "the internet beyond its libraries" is what its viewer says it cannot reach: measured, it sent a TURN
 * server a username from a frame under `FILE_FRAME_POLICY`.
 *
 * THE GUARD GOES AFTER THE DOCTYPE, WHERE THERE IS ONE, since a script ahead of it would put the page in quirks mode and
 * change how it draws. A DECLARATIVE SHADOW ROOT IS TAKEN OUT BY NAME, because the parser opens one with no call the guard
 * could refuse, and a frame inside it is where the guard's watch cannot see.
 */
export function attachedDocument(page: string): string {
  const end = afterDoctype(page);
  return `${page.slice(0, end)}<script>${DRAWN_GUARD}</script>${page.slice(end).replace(/\bshadowroot(mode|clonable|delegatesfocus|serializable)\b/giu, 'data-shadowroot$1')}`;
}
