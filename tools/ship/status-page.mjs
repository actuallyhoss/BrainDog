#!/usr/bin/env node
/**
 * The Status page on the BrainDog project: the newest sections of `loop/NEXT.md`, drawn as one plain page.
 *
 *   node tools/ship/status-page.mjs [--next <NEXT.md>] [--out <page.html>] [--sections <n>] [--sha <commit>]
 *
 * `deploy.mjs` builds it before it attaches it, so the Status in BrainDog is never older than the last deploy. The page
 * keeps to what a visual may hold (`visualPage` in packages/kernel/src/visual.ts): it loads nothing, a link is drawn as
 * its words, and an `=`, `url(` or `@import` in the notes is written as an entity so it is never read as an address.
 * A NEXT.md line that looks like a key stops the page: it is named, and nothing is written.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ── words ──────────────────────────────────────────────────────────────── */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);
/** Text as the page shows it: escaped, with nothing in it the record's page check reads as an address or a load. */
const words = (s) =>
  esc(s)
    .replace(/=/g, '&#61;')
    .replace(/(url)\(/gi, '$1&#40;')
    .replace(/@(import)/gi, '&#64;$1')
    .replace(/(shadow)(root)/gi, '$1&#8203;$2');

function emphasis(s) {
  return words(s)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=[^\s_])([\s\S]*?[^\s_])_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

const LINKS = /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)|<(https?:\/\/[^>\s]+)>/g;

/** Links and pictures, then emphasis. A picture shows only when `picture` names it; a link out is its words. */
function spans(s, o) {
  const out = [];
  let last = 0;
  for (const m of s.matchAll(LINKS)) {
    out.push(emphasis(s.slice(last, m.index)));
    if (m[4]) out.push(words(m[4]));
    else if (m[1]) {
      const src = o.picture?.(m[3]) ?? null;
      out.push(src ? `<img src="${esc(src)}" alt="${words(m[2])}">` : emphasis(m[2]));
    } else if (m[3].startsWith('#')) out.push(`<a href="${esc(m[3])}">${emphasis(m[2])}</a>`);
    else out.push(emphasis(m[2]) + (/^https?:\/\//.test(m[3]) && m[3] !== m[2] ? ` (${words(m[3])})` : ''));
    last = m.index + m[0].length;
  }
  out.push(emphasis(s.slice(last)));
  return out.join('');
}

/** One line of markdown as HTML: code spans held aside first, so emphasis may run across them. */
export function inline(text, o = {}) {
  const codes = [];
  const held = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => {
    codes.push(`<code>${words(/^ [\s\S]* $/.test(c) ? c.slice(1, -1) : c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  return spans(held, o)
    .replace(/ {2,}\n/g, '<br>\n')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

/* ── blocks ─────────────────────────────────────────────────────────────── */

const LIST = /^( *)([-*+]|\d{1,9}[.)])(?: +(.*)|$)/;
const FENCE = /^ *(`{3,}|~{3,})/;
const HEAD = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const QUOTE = /^ {0,3}> ?/;
const indentOf = (l) => l.length - l.trimStart().length;
const isSep = (l) => l.includes('|') && l.includes('-') && /^[\s|:-]+$/.test(l);
const startsBlock = (l) => FENCE.test(l) || HEAD.test(l) || RULE.test(l) || QUOTE.test(l) || LIST.test(l);

/** A table row's cells: split on `|` outside code, `\|` kept as a bar. */
function cells(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out = [];
  let cur = '';
  let code = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') {
      cur += '|';
      k++;
      continue;
    }
    if (c === '`') code = !code;
    if (c === '|' && !code) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function list(lines, at, o) {
  const first = LIST.exec(lines[at]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = at;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    const pad = indent + m[2].length + 1;
    const body = [m[3] ?? ''];
    let loose = false;
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '') {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && indentOf(lines[j]) > indent) {
          body.push('');
          loose = true;
          i++;
          continue;
        }
        break;
      }
      const lm = LIST.exec(l);
      if (lm && lm[1].length <= indent) break;
      if (!lm && indentOf(l) <= indent && startsBlock(l)) break;
      body.push(indentOf(l) >= pad ? l.slice(pad) : l.trimStart());
      i++;
    }
    const h = blocks(body, o);
    items.push(loose ? h : h.replace(/^<p>([\s\S]*?)<\/p>/, '$1'));
    /* A blank line between two items of this list keeps it one list. */
    let j = i;
    while (j < lines.length && lines[j].trim() === '') j++;
    const next = j < lines.length ? LIST.exec(lines[j]) : null;
    if (next && next[1].length === indent && /\d/.test(next[2]) === ordered) i = j;
    else break;
  }
  const n = ordered ? Number.parseInt(first[2], 10) : 1;
  const open = ordered ? (n === 1 ? '<ol>' : `<ol start="${n}">`) : '<ul>';
  return [`${open}\n${items.map((h) => `<li>${h}</li>`).join('\n')}\n${ordered ? '</ol>' : '</ul>'}`, i];
}

function blocks(lines, o) {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    let m;
    if ((m = FENCE.exec(line))) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(m[1])) body.push(lines[i++]);
      i++;
      html.push(`<pre><code>${words(body.join('\n'))}</code></pre>`);
    } else if ((m = HEAD.exec(line))) {
      html.push(`<h${m[1].length}>${inline(m[2], o)}</h${m[1].length}>`);
      i++;
    } else if (RULE.test(line)) {
      html.push('<hr>');
      i++;
    } else if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) rows.push(cells(lines[i++]));
      const tr = (r, tag) => `<tr>${r.map((c) => `<${tag}>${inline(c, o)}</${tag}>`).join('')}</tr>`;
      html.push(`<div class="wrap"><table><thead>${tr(head, 'th')}</thead><tbody>\n${rows.map((r) => tr(r, 'td')).join('\n')}\n</tbody></table></div>`);
    } else if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim() !== '' && (QUOTE.test(lines[i]) || !startsBlock(lines[i]))) body.push(lines[i++].replace(QUOTE, ''));
      html.push(`<blockquote>${blocks(body, o)}</blockquote>`);
    } else if (LIST.test(line) && (LIST.exec(line)[3] ?? '').trim() !== '') {
      const [h, next] = list(lines, i, o);
      html.push(h);
      i = next;
    } else {
      const body = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i]) && !(lines[i].includes('|') && isSep(lines[i + 1] ?? ''))) body.push(lines[i++].trim());
      const text = body.join('\n');
      const pic = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(text);
      const src = pic ? (o.picture?.(pic[2]) ?? null) : null;
      html.push(src ? `<figure><img src="${esc(src)}" alt="${words(pic[1])}"><figcaption>${words(pic[1])}</figcaption></figure>` : `<p>${inline(text, o)}</p>`);
    }
  }
  return html.join('\n');
}

/**
 * Markdown as plain HTML: headings, paragraphs, lists, tables, quotes and code. `picture(src)` answers the name a
 * picture is kept under, or `null` to show its words; every other address is drawn as text.
 */
export function markdownToHtml(md, o = {}) {
  return blocks(md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'), o);
}

/** One plain page around `body`, in the app's quiet greys, light or dark as the reader's system is. */
export function pageHtml(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${words(title)}</title><style>
:root{--bg:#fbfaf8;--fg:#1f1d1a;--muted:#6b665f;--line:#e4e0da;--well:#f1eee9}
@media (prefers-color-scheme: dark){:root{--bg:#1a1817;--fg:#ece8e3;--muted:#a39d95;--line:#35312d;--well:#262321}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:break-word}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px}
h2{font-size:19px;line-height:1.3;margin:32px 0 10px;padding-top:12px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:24px 0 8px}
h4,h5,h6{font-size:15px;margin:20px 0 6px}
p,ul,ol,blockquote,pre,.wrap,figure{margin:0 0 12px}
ul,ol{padding-left:22px}
li{margin:2px 0}
li>p{margin:0 0 6px}
.lede{color:var(--muted)}
a{color:inherit;text-decoration-color:var(--muted)}
code{font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--well);padding:1px 4px;border-radius:4px;overflow-wrap:anywhere}
pre{background:var(--well);padding:10px 12px;border-radius:6px;overflow-x:auto}
pre code{background:none;padding:0}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600}
blockquote{border-left:3px solid var(--line);margin-left:0;padding-left:12px;color:var(--muted)}
figure{margin-left:0;margin-right:0}
figure img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
figcaption{color:var(--muted);font-size:13px;margin-top:4px}
hr{border:0;border-top:1px solid var(--line);margin:24px 0}
</style></head>
<body><main>
${body}
</main></body></html>
`;
}

/* ── the status ─────────────────────────────────────────────────────────── */

/** What a key looks like, so one pasted into NEXT.md by mistake never leaves this machine inside a page. */
const KEYS = [
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{12,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{12,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\b(?:rec|tok|bdt)_[0-9A-Z]{26}\.[A-Za-z0-9_-]{16,}/,
];

/**
 * The page for one NEXT.md: its first `sections` `## ` sections, newest first as NEXT.md keeps them. `key` is the
 * 1-based line of NEXT.md that looks like a key, or `null`; the page is not to be kept when it is not `null`.
 */
export function statusPage(next, { sections = 6, sha = '', at = new Date() } = {}) {
  const lines = next.replace(/\r\n?/g, '\n').split('\n');
  const starts = lines.flatMap((l, k) => (/^## /.test(l) ? [k] : []));
  const from = starts[0] ?? 0;
  const to = starts[sections] ?? lines.length;
  const top = lines.slice(from, to);
  const hit = top.findIndex((l) => KEYS.some((re) => re.test(l)));
  const shown = Math.min(sections, starts.length);
  const when = `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const said = `${sha ? `Rebuilt with the deploy of ${sha.slice(0, 12)}` : 'Rebuilt'}, ${when}, from the newest ${shown === 1 ? 'section' : `${shown} sections`} of the loop's notes (loop/NEXT.md), newest first.`;
  const body = `<h1>BrainDog: where it stands</h1>\n<p class="lede">${words(said)}</p>\n${markdownToHtml(top.join('\n'))}`;
  return { html: pageHtml('Status', body), sections: shown, key: hit < 0 ? null : from + hit + 1 };
}

/* ── the command ────────────────────────────────────────────────────────── */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const take = (flag, fallback) => {
    const k = args.indexOf(flag);
    return k < 0 ? fallback : args[k + 1];
  };
  if (args.includes('--help') || args.includes('-h')) {
    console.log('node tools/ship/status-page.mjs [--next loop/NEXT.md] [--out loop/status/index.html] [--sections 6] [--sha <commit>]');
    process.exit(0);
  }
  const nextAt = resolve(take('--next', join(ROOT, 'loop/NEXT.md')));
  const outAt = resolve(take('--out', join(ROOT, 'loop/status/index.html')));
  const sections = Number.parseInt(take('--sections', '6'), 10);
  if (!Number.isSafeInteger(sections) || sections < 1) {
    console.error('--sections is a whole number, 1 or more.');
    process.exit(2);
  }
  const built = statusPage(readFileSync(nextAt, 'utf8'), { sections, sha: take('--sha', '') });
  if (built.key !== null) {
    console.error(`${relative(process.cwd(), nextAt)} line ${built.key} looks like it holds a key, so no page was written.`);
    process.exit(1);
  }
  mkdirSync(dirname(outAt), { recursive: true });
  writeFileSync(outAt, built.html);
  console.log(`Status: the newest ${built.sections} sections of ${relative(process.cwd(), nextAt)}, ${Math.round(Buffer.byteLength(built.html) / 1024)} KB, at ${relative(process.cwd(), outAt)}`);
}
