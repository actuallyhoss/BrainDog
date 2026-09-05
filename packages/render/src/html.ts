/**
 * `toHTML` — the framework-free renderer.
 *
 * It is NOT a server render. It serves the mirror, the exports, the tests and the digest email; the
 * app draws blocks through `braindog-render/svelte` inside a static shell (05 §1, ADR-066). The two
 * exist so the parity gate can assert they produce the same accessibility tree, which is what makes
 * two renderers one renderer.
 *
 * The markup contract, whole: every block is one `<figure>` carrying its kind, its primitive and its
 * tone as data attributes, with the heading as its `<figcaption>`; a cell is a `<span>` named for
 * the cell it is. That is all a host's stylesheet draws against (05 §7.7).
 *
 * ONE escape function, used on every value, and the only inline `style` values in the output are
 * `--cells` and `--magnitude`, both numbers this file formats itself.
 */

import { KINDS, TONES, type Kind } from './kinds.ts';
import { inline, text as plain, type Inline, type InlineOptions } from './inline.ts';
import { MISSING } from './format.ts';
import type { Block, Degraded, Markdown, Row, Segment } from './parse.ts';

export type RenderOptions = InlineOptions & {
  /** Turn a spoken id into an address. A link the host cannot resolve renders as plain text. */
  link?: (spoken: string) => string | null;
};

export const escape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Two decimals, always, so the value is a number and the assertion over it is one regex. */
const magnitude = (v: number): string => Math.max(0, Math.min(1, v)).toFixed(2);

function renderInline(nodes: Inline[], opts: RenderOptions): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escape(n.text);
        case 'code':
          return `<code>${escape(n.text)}</code>`;
        case 'strong':
          return `<strong>${renderInline(n.body, opts)}</strong>`;
        case 'em':
          return `<em>${renderInline(n.body, opts)}</em>`;
        case 'link':
          return `<a href="${escape(n.href)}">${renderInline(n.body, opts)}</a>`;
        case 'path':
          // A path that names nothing renders as the path, marked, and it is an AFFORDANCE: an
          // unknown is a hole, and a hole is a task somebody has to close (05 §7.5).
          return n.resolved === null
            ? `<button type="button" class="hole" data-path="${escape(n.path)}">${escape(n.path)} ${MISSING}</button>`
            : `<span class="figure num">${escape(n.resolved)}</span>`;
        case 'typed': {
          const href = n.link === 'row' ? opts.link?.(n.arg) : n.link === 'day' ? `/calendar/${n.arg}` : null;
          const body = `<span class="typed num" data-form="${n.form}">${escape(n.text)}</span>`;
          return href ? `<a href="${escape(href)}">${body}</a>` : body;
        }
        case 'evidence':
          // `{unknown}` is not a weak claim, it is a hole, so it renders as an affordance.
          return n.kind === 'unknown'
            ? `<button type="button" class="hole">unknown</button>`
            : `<span class="evidence" data-evidence="${n.kind}"${n.source ? ` title="${escape(n.source)}"` : ''}>${n.kind}${n.source ? `: ${escape(n.source)}` : ''}</span>`;
        case 'unresolved':
          return `<span class="unresolved">${escape(n.text)}</span>`;
      }
    })
    .join('');
}

const cell = (name: string, value: string | undefined, opts: RenderOptions, extra = ''): string =>
  `<span class="${name}"${extra}>${value ? renderInline(inline(value, opts), opts) : ''}</span>`;

/** The intent reaches the DOM only as `data-intent` plus its glyph. There is no other path. */
const toneAttrs = (tone?: string): string => (tone ? ` data-intent="${tone}"` : '');

const toneGlyph = (tone?: string): string => {
  if (!tone || !Object.hasOwn(TONES, tone)) return '';
  const t = TONES[tone as keyof typeof TONES];
  return `<span class="glyph" role="img" aria-label="${t.label}">${t.glyph}</span>`;
};

/* ── the eight primitives ─────────────────────────────────────────────────── */

function panel(b: Block, o: RenderOptions): string {
  if (b.kind === 'quote') {
    const r = b.rows[0] ?? { cells: [] };
    return `<blockquote class="panel">${cell('quote-text', r.cells[0], o)}${r.cells[1] ? `<cite class="quote-by">${escape(r.cells[1])}</cite>` : ''}</blockquote>`;
  }
  // `note` is the only drawn kind in the `measure` class, because it is the only one that may
  // contain a paragraph. Prose in any other block is unreadable, and the heading is a KICKER —
  // two or three words, small caps; the sentence goes in the body (05 §7.4).
  const paragraphs: string[][] = [[]];
  for (const r of b.rows) {
    const line = r.cells[0] ?? '';
    if (line.trim() === '') paragraphs.push([]);
    else paragraphs[paragraphs.length - 1]!.push(line);
  }
  const body = paragraphs
    .filter((p) => p.length)
    .map((p) => `<p>${renderInline(inline(p.join(' '), o), o)}</p>`)
    .join('');
  return `<div class="panel measure">${body}</div>`;
}

function grid(b: Block, o: RenderOptions): string {
  if (b.kind === 'board') {
    const columns = [...new Set(b.rows.map((r) => r.cells[0] ?? ''))];
    const body = columns
      .map(
        (col) =>
          `<div class="board-col"><h4 class="board-head">${escape(col)}</h4>${b.rows
            .filter((r) => r.cells[0] === col)
            .map((r) => `<div class="card">${cell('card-title', r.cells[1], o)}${cell('card-detail', r.cells[2], o)}</div>`)
            .join('')}</div>`,
      )
      .join('');
    return `<div class="grid" style="--cells:${columns.length}">${body}</div>`;
  }
  // A layout primitive must be TOLD how many things it contains. It must never infer the count from
  // the space available — three tiles once drew seven auto-fit tracks and a 550px slab of border
  // colour, and every selector was correct (05 §4).
  const body = b.rows
    .map(
      (r) =>
        `<div class="cell"${toneAttrs(r.tone)}>${cell('cell-label', r.cells[0], o)}<span class="cell-figure num">${
          r.cells[1] ? renderInline(inline(r.cells[1], o), o) : MISSING
        }</span>${cell('cell-note', r.cells[2], o)}${toneGlyph(r.tone)}</div>`,
    )
    .join('');
  return `<div class="grid" style="--cells:${b.rows.length}">${body}</div>`;
}

function rows(b: Block, o: RenderOptions): string {
  const body = b.rows
    .map(
      (r) =>
        `<div class="row">${cell('row-label', r.cells[0], o)}<span class="row-value num">${
          r.cells[1] ? renderInline(inline(r.cells[1], o), o) : MISSING
        }</span>${cell('row-note', r.cells[2], o)}</div>`,
    )
    .join('');
  return `<div class="rows">${body}</div>`;
}

function proportional(b: Block, o: RenderOptions): string {
  if (b.kind === 'gauge') {
    const r = b.rows[0] ?? { cells: [] };
    const value = Number(String(r.cells[1] ?? '').replace(/[^\d.-]/g, ''));
    const target = Number(String(r.cells[2] ?? '').replace(/[^\d.-]/g, ''));
    const m = Number.isFinite(value) && Number.isFinite(target) && target !== 0 ? value / target : 0;
    return `<div class="prop"><div class="prop-row"${toneAttrs(r.tone)}>${cell('prop-label', r.cells[0], o)}<span class="prop-track" style="--magnitude:${magnitude(m)}"></span><span class="prop-value num">${escape(r.cells[1] ?? MISSING)}</span><span class="prop-note num">of ${escape(r.cells[2] ?? MISSING)}</span>${toneGlyph(r.tone)}</div></div>`;
  }
  // A bar scales to its largest NON-HOLE row. A bar row whose value is not a number keeps its words
  // and loses its bar: a bar at zero claims the value IS zero (05 §7.4).
  // An empty cell is not zero. `Number('')` is 0, which would draw a full-width bar for a value
  // nobody has, and a bar at zero claims the value IS zero (05 §7.4).
  const numeric = (r: Row) => {
    const digits = String(r.cells[1] ?? '').replace(/[^\d.-]/g, '');
    return digits === '' ? NaN : Number(digits);
  };
  const scale = Math.max(0, ...b.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite));
  const body = b.rows
    .map((r) => {
      const v = numeric(r);
      const drawable = Number.isFinite(v) && !r.hole && scale > 0;
      const track = drawable ? `<span class="prop-track" style="--magnitude:${magnitude(v / scale)}"></span>` : '';
      const inner = `${cell('prop-label', r.cells[0], o)}${track}<span class="prop-value num">${escape(r.cells[1] ?? MISSING)}</span>${cell('prop-note', r.cells[2], o)}${toneGlyph(r.tone)}`;
      return r.hole
        ? `<button type="button" class="prop-row" data-hole${toneAttrs(r.tone)}>${inner}</button>`
        : `<div class="prop-row"${toneAttrs(r.tone)}>${inner}</div>`;
    })
    .join('');
  return `<div class="prop">${body}</div>`;
}

function inlinePrimitive(b: Block, o: RenderOptions): string {
  // A chips row needs a number AND a word, or it is dropped: an icon alone is a rebus, and a colour
  // alone is unreadable to a tenth of readers. The columns do not move (05 §7.4).
  const body = b.rows
    .filter((r) => (r.cells[1] ?? '') !== '' && (r.cells[2] ?? '') !== '')
    .map(
      (r) =>
        `<span class="pill"${toneAttrs(r.tone)}><span class="pill-glyph" data-glyph="${escape(r.cells[0] ?? '')}" aria-hidden="true"></span><span class="pill-figure num">${escape(r.cells[1] ?? '')}</span><span class="pill-word">${escape(r.cells[2] ?? '')}</span>${toneGlyph(r.tone)}</span>`,
    )
    .join('');
  return `<div class="inline">${body}</div>`;
}

function list(b: Block, o: RenderOptions): string {
  const spec = KINDS[b.kind];
  const tag = spec.ordered ? 'ol' : 'ul';
  const body = b.rows
    .map((r) => {
      if (b.kind === 'todo')
        return `<li class="item"><span class="item-marker" data-done="${r.done ? 'yes' : 'no'}" role="img" aria-label="${r.done ? 'done' : 'not done'}">${r.done ? '✓' : ''}</span>${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}</li>`;
      if (b.kind === 'timeline')
        return `<li class="item"${toneAttrs(r.tone)}>${cell('item-marker num', r.cells[0], o)}${cell('item-title', r.cells[1], o)}${cell('item-detail', r.cells[2], o)}${toneGlyph(r.tone)}</li>`;
      return `<li class="item">${cell('item-title', r.cells[0], o)}${cell('item-detail', r.cells[1], o)}${cell('item-state', r.cells[2], o)}</li>`;
    })
    .join('');
  return `<${tag} class="list" data-kind="${b.kind}">${body}</${tag}>`;
}

function table(b: Block, o: RenderOptions): string {
  const [head, ...body] = b.rows;
  if (!head) return `<div class="table"></div>`;
  const cols = head.cells.length;
  const th = head.cells.map((c) => `<span class="th" role="columnheader">${escape(c)}</span>`).join('');
  const tr = body
    .map(
      (r, i) =>
        `<div class="tr" role="row" aria-rowindex="${i + 2}">${head.cells
          .map((_, j) => `<span class="td" role="gridcell">${renderInline(inline(r.cells[j] ?? '', o), o)}</span>`)
          .join('')}</div>`,
    )
    .join('');
  return `<div class="table" role="grid" aria-rowcount="${body.length + 1}" aria-colcount="${cols}" style="--cols:repeat(${cols},minmax(0,1fr))"><div class="tr" role="row" aria-rowindex="1">${th}</div>${tr}</div>`;
}

function media(b: Block): string {
  const body = b.rows.map((r) => escape(r.cells[0] ?? '')).join('\n');
  const lang = b.kind === 'code' && b.heading ? ` data-lang="${escape(b.heading)}"` : '';
  /* FOCUSABLE, because a `pre` does not wrap: on a phone it is always the widest thing on the
     page and always scrolls sideways, and a scrolling box a keyboard cannot focus is a box a
     keyboard cannot read (WCAG 2.1.1). This is the third place in the product where that was
     true; the other two were fixed at the call site, and this one is fixed here because a host
     cannot reach inside a primitive to add an attribute and every host would need the same one.
     Named, so tabbing to it announces what it is instead of reading a line of code at you. */
  const label = b.heading ? escape(b.heading) : b.kind === 'tree' ? 'Tree' : 'Code';
  return `<pre class="media"${lang} tabindex="0" role="group" aria-label="${label}"><code>${body}</code></pre>`;
}

const PRIMITIVE_RENDERERS = { panel, grid, rows, proportional, inline: inlinePrimitive, list, table, media } as const;

/* ── segments ─────────────────────────────────────────────────────────────── */

function block(b: Block, o: RenderOptions): string {
  const spec = KINDS[b.kind];
  const draw = PRIMITIVE_RENDERERS[spec.primitive];
  // `code`'s heading is its language, not a caption, so it does not become a figcaption.
  const cap =
    b.heading && b.kind !== 'code'
      ? `<figcaption class="block-head"${toneAttrs(b.tone)}>${toneGlyph(b.tone)}${renderInline(inline(b.heading, o), o)}</figcaption>`
      : '';
  return `<figure class="block block-${spec.primitive}" data-kind="${b.kind}" data-primitive="${spec.primitive}"${toneAttrs(b.tone)}>${cap}${draw(b as never, o)}</figure>`;
}

/**
 * A degraded block shows exactly what the author typed, with the reason above it. It never renders
 * wrong and never renders nothing — a dropped block must read as feedback, and when the author is
 * an agent this is the only feedback channel that exists (05 §3).
 */
function degraded(d: Degraded): string {
  return `<figure class="block block-degraded" data-code="${d.code}"><figcaption class="degraded-fix">${escape(d.fix)}</figcaption><pre class="media"><code>${escape(d.raw)}</code></pre></figure>`;
}

/**
 * The closed markdown subset: ATX headings, paragraphs, flat lists, a rule, and inline spans.
 * A BLANK LINE ends a paragraph; a newline does not — see the note in Markdown.svelte, and the
 * `a11y-tree` parity gate is what keeps these two in step.
 */
function markdown(m: Markdown, o: RenderOptions): string {
  const out: string[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p class="measure">${renderInline(inline(para.join(' '), o), o)}</p>`);
    para = [];
    if (bullets.length) out.push(`<ul class="prose-list measure">${bullets.join('')}</ul>`);
    bullets = [];
  };
  for (const raw of m.text.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const n = h[1]!.length;
      out.push(`<h${n} class="measure">${renderInline(inline(h[2]!, o), o)}</h${n}>`);
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flush();
      out.push('<hr />');
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (para.length) flush();
      bullets.push(`<li>${renderInline(inline(li[1]!, o), o)}</li>`);
      continue;
    }
    if (bullets.length) flush();
    para.push(line);
  }
  flush();
  return out.join('');
}

export function toHTML(segments: Segment[], opts: RenderOptions = {}): string {
  return segments
    .map((s) => (s.type === 'block' ? block(s, opts) : s.type === 'degraded' ? degraded(s) : markdown(s, opts)))
    .join('');
}

/** The accessible name of a drawn figure reads as a sentence, not as three floating numbers (13 §7). */
export const describe = (b: Block, o: RenderOptions = {}): string =>
  [b.heading, ...b.rows.map((r) => r.cells.filter(Boolean).map((c) => plain(inline(c, o))).join(', '))]
    .filter(Boolean)
    .join('. ');
