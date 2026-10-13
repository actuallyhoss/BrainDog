/**
 * Markup read as a person with a screen reader meets it: every sentence drawn, and the flattened tree of roles
 * `first-screen.mjs` reads (`{ role, name, landmark }`). Pure, over the markup the server renderer writes, which is
 * well formed: every tag is closed or void, and every attribute is quoted.
 *
 * WHAT IS LEFT OUT IS WHAT NOBODY MEETS: a subtree that is `hidden`, `inert` or `aria-hidden`, a `dialog` that is not
 * open, a picture's insides, a script and a style. A folded group of the rail is `inert`, so its links are not in the
 * tree here either, as they are not in a browser's.
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The tags a sentence does not run across: text on either side of one is two sentences. */
const BREAKS = new Set(['a', 'address', 'article', 'aside', 'blockquote', 'br', 'button', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'input', 'li', 'main', 'nav', 'ol', 'p', 'section', 'summary', 'table', 'td', 'th', 'tr', 'ul']);

/** A tag's own role where it has one with no `role` written. */
const ROLE_OF = { a: 'link', button: 'button', nav: 'navigation', main: 'main', aside: 'complementary', progress: 'progressbar', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', textarea: 'textbox', select: 'combobox', img: 'img', dialog: 'dialog' };

/** A cell of a grid or a table drawn from spans: its words are its own sentence, as a `td`'s are. */
const CELLS = new Set(['gridcell', 'columnheader', 'rowheader', 'cell', 'row']);

/** The roles named by the words inside them; a landmark, a group or a grid is named only where it is labelled. */
const WORDED = new Set(['link', 'button', 'heading', 'gridcell', 'columnheader', 'rowheader', 'cell', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch', 'tooltip']);

const LANDMARKS = new Set(['navigation', 'main', 'complementary', 'banner', 'contentinfo', 'dialog', 'search']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const plain = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? whole)));
const squash = (s) => s.replace(/\s+/gu, ' ').trim();

/** A tag's attributes, each quoted as the renderer writes them; one with no value is `''`. */
function attrsOf(raw) {
  const out = {};
  for (const m of raw.matchAll(/([^\s=/]+)(?:="([^"]*)")?/gu)) out[m[1].toLowerCase()] = plain(m[2] ?? '');
  return out;
}

/** Whether a tag takes its whole subtree out of what a person meets. */
const unmet = (tag, a) => 'hidden' in a || 'inert' in a || a['aria-hidden'] === 'true' || tag === 'svg' || tag === 'script' || tag === 'style' || tag === 'template' || (tag === 'dialog' && !('open' in a));

function roleOf(tag, a) {
  if (a.role) return a.role === 'presentation' || a.role === 'none' ? null : a.role;
  if (tag === 'a') return 'href' in a ? 'link' : null;
  if (tag === 'input') return a.type === 'checkbox' || a.type === 'radio' ? a.type : a.type === 'hidden' ? null : 'textbox';
  return ROLE_OF[tag] ?? null;
}

/**
 * `{ text, roles }` for one piece of markup. `text` is every sentence, in the order drawn. A thing's name is its
 * `aria-label`, else the words inside it, else its `title` or `placeholder`.
 */
export function readMarkup(html) {
  const text = [];
  const roles = [];
  /* The open tags, outermost first: `{ tag, role, entry, breaks, words, out }`, `out` once a subtree is not met. */
  const open = [];
  let run = '';
  const flush = () => {
    const s = squash(run);
    if (s !== '') text.push(s);
    run = '';
  };
  const close = () => {
    const top = open.pop();
    if (!top) return;
    if (top.breaks) flush();
    if (top.entry && top.entry.name === '') top.entry.name = (WORDED.has(top.role) ? squash(top.words.join(' ')) : '') || top.fallback;
  };
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<\/([a-zA-Z][^\s>]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|[^>"])*)>|([^<]+)/gu)) {
    const [, closing, opening, rawAttrs, words] = m;
    const out = open.some((o) => o.out);
    if (words !== undefined) {
      if (out) continue;
      const said = plain(words);
      run += said;
      for (const o of open) if (o.entry) o.words.push(said);
    } else if (closing !== undefined) {
      const tag = closing.toLowerCase();
      /* A close with no open of its name is dropped; one further up closes what is inside it first. */
      if (!open.some((o) => o.tag === tag)) continue;
      while (open.length > 0 && open.at(-1).tag !== tag) close();
      close();
    } else if (opening !== undefined) {
      const tag = opening.toLowerCase();
      const a = attrsOf(rawAttrs.replace(/\/\s*$/u, ''));
      const gone = out || unmet(tag, a);
      const role = gone ? null : roleOf(tag, a);
      const breaks = !gone && (BREAKS.has(tag) || CELLS.has(role));
      if (breaks) flush();
      let entry = null;
      if (role !== null) {
        const landmark = open.findLast((o) => o.role !== null && LANDMARKS.has(o.role))?.role ?? null;
        entry = { role, name: squash(a['aria-label'] ?? ''), landmark };
        roles.push(entry);
      }
      const node = { tag, role, entry, breaks, words: [], out: gone, fallback: squash(a.title ?? a.placeholder ?? '') };
      if (VOID.has(tag) || /\/\s*$/u.test(rawAttrs)) {
        if (entry && entry.name === '') entry.name = node.fallback;
      } else open.push(node);
    }
  }
  while (open.length > 0) close();
  flush();
  return { text, roles };
}
