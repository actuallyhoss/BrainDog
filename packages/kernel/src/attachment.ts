/**
 * Attachments: a file put on a task, a project, any row, a question or a decision, for context. Kept as `note` lines on
 * the thing (`field` `attached:<id>`), as a visual is (`visual.ts`), never a table, so who may see one is who may see
 * the thing, and history, Undo and export already hold it. The bytes stay in the host's file store, named here by hash.
 *
 * WHAT A FILE IS, IS READ FROM ITS BYTES AND ITS NAME, NEVER FROM WHAT THE CALLER SAYS. The magic bytes decide the
 * pictures and PDF; a zip or an OLE file is an office document by its name; bytes that read as UTF-8 are text, and
 * their name says which text (a page, markdown, CSV); anything else is a file to download. The type the store keeps is
 * one of these and nothing a caller wrote.
 *
 * AND ITS WORDS ARE READ ONCE, WHEN IT COMES, so an agent reads a brief or an artifact as text without the bytes: a page
 * to its words, text as it is, a PDF by `pdfText` below. They are kept beside the bytes as a page of their own.
 */

import type { Sql } from '@braindog/ports';

/** The `field` every attachment line carries, before its id. */
export const ATTACHED_FIELD = 'attached:';

/** The most one attached file may be: 25 MiB. A file field on a row keeps the door's own 2 MiB. */
export const ATTACHED_MOST = 25 * 1024 * 1024;

/** The most attachments one thing carries at once, and versions one attachment keeps. */
export const ATTACHED_ON_MOST = 100;
export const ATTACHED_VERSIONS_MOST = 100;

/** The most every attachment of one record may come to, as `ATTACHED_WEIGHT` counts new bytes. */
export const ATTACHED_RECORD_MOST = 1024 * 1024 * 1024;

/** The counter new attachment bytes are added to (`counter`, which travels). */
export const ATTACHED_WEIGHT = 'attachment-bytes';

/** The longest name, in characters, and the most words kept from one file for agents to read. */
export const ATTACHED_NAME_MOST = 200;
export const ATTACHED_TEXT_MOST = 1_000_000;

/** What an attachment is, for how it is shown: in a frame, the browser's PDF viewer, a picture, text, or a download. */
export const ATTACHED_KINDS = ['page', 'pdf', 'picture', 'text', 'document', 'file'] as const;
export type AttachedKind = (typeof ATTACHED_KINDS)[number];

/** One version as a line holds it in `to_v`. `text` is its words for agents, kept as a page, or absent when it has none. */
export type AttachedBody = { name: string; sha256: string; mime: string; kind: AttachedKind; bytes: number; text?: { sha256: string; chars: number } };

/** What any attachment line holds: a version, a new name, the attachment taken off, or put back at a version line. */
export type AttachedSaid = AttachedBody | { rename: string } | { gone: true } | { back: string };

/** One line of an attachment as the log holds it. */
export type AttachedLine = { rowid: number; id: string; ts: string; actor: string; target: string; field: string; to_v: string | null; batch: string | null };

/* ── what a file is ─────────────────────────────────────────────────────── */

const EXT = (name: string): string => /\.([A-Za-z0-9]{1,8})$/u.exec(name)?.[1]?.toLowerCase() ?? '';

/** Text types by the name's ending, for bytes that read as UTF-8. Anything else that reads as text is plain text. */
const TEXT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  svg: 'image/svg+xml',
  xml: 'application/xml',
};

/** Office documents by the name's ending: the zip ones and the old OLE ones. */
const ZIP_TYPES: Readonly<Record<string, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
};
const OLE_TYPES: Readonly<Record<string, string>> = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' };

/** The six types the file door has always taken, by their first bytes (the door's own `sniff`). */
export function magicType(bytes: Uint8Array): string | null {
  const at = (i: number, ...want: number[]): boolean => want.every((b, j) => bytes[i + j] === b);
  const ascii = (i: number, text: string): boolean => at(i, ...[...text].map((c) => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';
  if (ascii(0, '%PDF-')) return 'application/pdf';
  return null;
}

/** Whether bytes read as UTF-8 text: no NUL, and every sequence well formed. The first 64 KB decide. */
function readsAsText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 65_536);
  if (head.includes(0)) return false;
  try {
    /* A SEQUENCE CUT AT THE 64 KB EDGE IS NOT A FAULT, so the decoder is asked to stream. */
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(head, { stream: head.length < bytes.length });
    return true;
  } catch {
    return false;
  }
}

/** The kind a stored type is shown as. */
export function attachedKind(mime: string): AttachedKind {
  if (mime === 'text/html') return 'page';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'picture';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return 'text';
  if (Object.values(ZIP_TYPES).includes(mime) || Object.values(OLE_TYPES).includes(mime)) return 'document';
  return 'file';
}

/**
 * The type the store keeps a file as, from its bytes and then its name, and the kind it is shown as. Never the caller's.
 * SVG is kept as `image/svg+xml` and shown only as a picture (`<img>`, where script never runs); the door serves every
 * type inert (`sandbox`, `nosniff`).
 */
export function attachedType(bytes: Uint8Array, name: string): { mime: string; kind: AttachedKind } {
  const magic = magicType(bytes);
  const ext = EXT(name);
  if (magic !== null) return { mime: magic, kind: attachedKind(magic) };
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (zip) {
    const mime = ZIP_TYPES[ext] ?? 'application/zip';
    return { mime, kind: attachedKind(mime) };
  }
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (ole) {
    const mime = OLE_TYPES[ext] ?? 'application/octet-stream';
    return { mime, kind: attachedKind(mime) };
  }
  if (bytes.length > 0 && readsAsText(bytes)) {
    const mime = TEXT_TYPES[ext] ?? (/^\s*<!doctype html|^\s*<html[\s>]/iu.test(new TextDecoder().decode(bytes.subarray(0, 512))) ? 'text/html' : 'text/plain');
    return { mime, kind: attachedKind(mime) };
  }
  return { mime: 'application/octet-stream', kind: 'file' };
}

/**
 * A file's name as it is kept, or `null` when nothing is left of it: its last path part only, no control characters,
 * spaces run together, at most `ATTACHED_NAME_MOST` characters with its ending kept.
 */
export function attachedName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const last = name.split(/[\\/]/u).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = last.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/gu, '').replace(/\s+/gu, ' ').trim();
  if (clean === '' || clean === '.' || clean === '..') return null;
  if (clean.length <= ATTACHED_NAME_MOST) return clean;
  const ext = EXT(clean);
  const keep = ext === '' ? '' : `.${ext}`;
  return `${clean.slice(0, ATTACHED_NAME_MOST - keep.length - 1).trimEnd()}…${keep}`;
}

/* ── its words ──────────────────────────────────────────────────────────── */

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (whole, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });

const tidy = (s: string): string =>
  s
    .replace(/[ \t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

/**
 * A page's words: its title, then its text, with scripts, styles and markup gone and a line for each block.
 *
 * AND ITS SCRIPT WHEN THE PAGE DRAWS ITSELF. A Claude artifact written in React has its words in its script, so its
 * markup alone is a few words; when the text is that short and the page has script, the script follows as it is, which
 * an agent reads well enough to know what the page says.
 */
export function pageText(html: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(html)?.[1]?.trim() ?? '';
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu)].map((m) => m[1]!.trim()).filter((s) => s !== '');
  const body = html
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1\s*>/giu, ' ')
    .replace(/<(br|hr)\b[^>]*>/giu, '\n')
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h[1-6]|pre|blockquote|table|ul|ol|main|nav|aside)\s*>/giu, '\n')
    .replace(/<(td|th)\b[^>]*>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ');
  const words = tidy(decodeEntities(body));
  const head = title !== '' && !words.startsWith(title) ? `${decodeEntities(title)}\n\n` : '';
  const said = `${head}${words}`;
  if (said.length >= 400 || scripts.length === 0) return said;
  return `${said}${said === '' ? '' : '\n\n'}The page draws itself with script. Its script:\n\n${scripts.join('\n\n')}`;
}

/** The words of a file of this type, or `null` for one that has none this reader can find. Clipped to the most kept. */
export async function attachedText(bytes: Uint8Array, mime: string): Promise<string | null> {
  let text: string | null = null;
  if (mime === 'text/html') text = pageText(new TextDecoder().decode(bytes));
  else if (mime === 'image/svg+xml') text = null;
  else if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') text = new TextDecoder().decode(bytes).replace(/^﻿/u, '');
  else if (mime === 'application/pdf') text = await pdfText(bytes);
  if (text === null) return null;
  const t = text.trim();
  if (t === '') return null;
  return t.length > ATTACHED_TEXT_MOST ? t.slice(0, ATTACHED_TEXT_MOST) : t;
}

/* ── a PDF's words ──────────────────────────────────────────────────────── */

/** Bytes as a string of one character a byte, which the PDF syntax is read in. */
const latin = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32_768) out += String.fromCharCode(...bytes.subarray(i, i + 32_768));
  return out;
};
const bytesOf = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** A zlib stream inflated, or as much of it as came before a fault: a PDF's streams are often cut a byte short. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  try {
    const stream = new Blob([Uint8Array.from(data)]).stream().pipeThrough(new DecompressionStream('deflate'));
    const reader = stream.getReader();
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      parts.push(r.value);
    }
  } catch {
    /* WHAT CAME BEFORE THE FAULT IS KEPT. */
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** One code-to-text map from a `ToUnicode` CMap, and how many bytes one code is. */
type CMap = { map: Map<number, string>; width: number };

const utf16 = (hex: string): string => {
  let s = '';
  for (let i = 0; i + 3 < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length % 4 === 2) s += String.fromCharCode(parseInt(hex.slice(-2), 16));
  return s;
};

function cmapOf(text: string): CMap {
  const map = new Map<number, string>();
  let width = 1;
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/u.exec(text);
  if (space && space[1]!.length >= 4) width = 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu))
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/gu)) {
      if (m[1]!.length >= 4) width = 2;
      map.set(parseInt(m[1]!, 16), utf16(m[2]!));
    }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu))
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/gu)) {
      if (m[1]!.length >= 4) width = 2;
      const lo = parseInt(m[1]!, 16);
      const hi = Math.min(parseInt(m[2]!, 16), lo + 65_535);
      if (m[3]!.startsWith('[')) {
        const each = [...m[3]!.matchAll(/<([0-9a-fA-F]*)>/gu)].map((x) => utf16(x[1]!));
        for (let c = lo; c <= hi && c - lo < each.length; c++) map.set(c, each[c - lo]!);
      } else {
        const start = m[3]!.slice(1, -1);
        const first = utf16(start);
        const lastCode = first.charCodeAt(first.length - 1);
        for (let c = lo; c <= hi; c++) map.set(c, first.slice(0, -1) + String.fromCharCode(lastCode + (c - lo)));
      }
    }
  return { map, width };
}

/** A literal string's bytes, `(…)` with its escapes, from just after its `(`; and where it ends. */
function literal(s: string, i: number): { bytes: string; end: number } {
  let depth = 1;
  let out = '';
  for (; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\') {
      const n = s[++i] ?? '';
      if (n === 'n') out += '\n';
      else if (n === 'r') out += '\r';
      else if (n === 't') out += '\t';
      else if (n === 'b') out += '\b';
      else if (n === 'f') out += '\f';
      else if (n === '\r') {
        if (s[i + 1] === '\n') i++;
      } else if (n === '\n') {
        /* A LINE GOES ON. */
      } else if (/[0-7]/u.test(n)) {
        let oct = n;
        while (oct.length < 3 && /[0-7]/u.test(s[i + 1] ?? '')) oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else out += n;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return { bytes: out, end: i + 1 };
    out += c;
  }
  return { bytes: out, end: i };
}

/** A shown string's text in its font: through the font's map where it has one, else a byte a character. */
function shown(bytes: string, font: CMap | null): string {
  if (font === null || font.map.size === 0) return font !== null && font.width === 2 ? '' : bytes.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/gu, '');
  let out = '';
  for (let i = 0; i + font.width <= bytes.length; i += font.width) {
    const code = font.width === 2 ? (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1) : bytes.charCodeAt(i);
    out += font.map.get(code) ?? (font.width === 1 ? String.fromCharCode(code) : '');
  }
  return out;
}

/** The words one content stream shows, its fonts named by their resource names. */
function contentText(s: string, fonts: ReadonlyMap<string, CMap>): string {
  let out = '';
  let font: CMap | null = null;
  const operands: unknown[] = [];
  const say = (text: string) => {
    out += text;
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '%') {
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
      continue;
    }
    if (/\s/u.test(c)) {
      i++;
      continue;
    }
    if (c === '(') {
      const l = literal(s, i + 1);
      operands.push({ str: l.bytes });
      i = l.end;
      continue;
    }
    if (c === '<' && s[i + 1] !== '<') {
      const end = s.indexOf('>', i);
      const hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/\s+/gu, '');
      let b = '';
      for (let k = 0; k < hex.length; k += 2) b += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
      operands.push({ str: b });
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === '[') {
      operands.push('[');
      i++;
      continue;
    }
    if (c === ']') {
      const items: unknown[] = [];
      while (operands.length > 0 && operands[operands.length - 1] !== '[') items.unshift(operands.pop());
      operands.pop();
      operands.push({ arr: items });
      i++;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      while (j < s.length && !/[\s/[\]()<>{}%]/u.test(s[j]!)) j++;
      operands.push({ name: s.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (c === '<' || c === '>' || c === '{' || c === '}') {
      i += s[i + 1] === c ? 2 : 1;
      continue;
    }
    let j = i;
    while (j < s.length && !/[\s/[\]()<>{}%]/u.test(s[j]!)) j++;
    if (j === i) j = i + 1;
    const word = s.slice(i, j);
    i = j;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(word)) {
      operands.push(Number(word));
      continue;
    }
    /* AN OPERATOR, read against what came before it. An inline image's data is skipped whole. */
    if (word === 'BI') {
      const end = s.indexOf('EI', i);
      i = end < 0 ? s.length : end + 2;
    } else if (word === 'Tf') {
      const name = operands.find((o): o is { name: string } => typeof o === 'object' && o !== null && 'name' in o);
      font = name ? (fonts.get(name.name) ?? null) : null;
    } else if (word === 'Tj' || word === "'" || word === '"') {
      if (word !== 'Tj') say('\n');
      const str = [...operands].reverse().find((o): o is { str: string } => typeof o === 'object' && o !== null && 'str' in o);
      if (str) say(shown(str.str, font));
    } else if (word === 'TJ') {
      const arr = operands.find((o): o is { arr: unknown[] } => typeof o === 'object' && o !== null && 'arr' in o);
      for (const part of arr?.arr ?? []) {
        if (typeof part === 'number') {
          if (part < -180) say(' ');
        } else if (typeof part === 'object' && part !== null && 'str' in part) say(shown((part as { str: string }).str, font));
      }
    } else if (word === 'Td' || word === 'TD') {
      const ty = operands[operands.length - 1];
      const tx = operands[operands.length - 2];
      if (typeof ty === 'number' && Math.abs(ty) > 0.5) say('\n');
      else if (typeof tx === 'number' && tx > 1) say(' ');
    } else if (word === 'T*' || word === 'ET') say('\n');
    else if (word === 'Tm') say(' ');
    operands.length = 0;
  }
  return out;
}

/** The objects of a PDF: each one's dictionary text and its stream's bytes, inflated, by object number. */
async function objectsOf(pdf: string): Promise<{ dicts: Map<number, string>; streams: Map<number, string> }> {
  const dicts = new Map<number, string>();
  const streams = new Map<number, string>();
  const OBJ = /(\d+)\s+\d+\s+obj\b/gu;
  const starts = [...pdf.matchAll(OBJ)];
  for (let k = 0; k < starts.length; k++) {
    const m = starts[k]!;
    const num = Number(m[1]);
    const from = m.index! + m[0].length;
    const next = k + 1 < starts.length ? starts[k + 1]!.index! : pdf.length;
    const endobj = pdf.indexOf('endobj', from);
    const until = endobj < 0 || endobj > next ? next : endobj;
    const body = pdf.slice(from, until);
    const at = body.search(/\bstream\r?\n/u);
    if (at < 0) {
      dicts.set(num, body);
      continue;
    }
    const dict = body.slice(0, at);
    dicts.set(num, dict);
    const dataFrom = at + body.slice(at).indexOf('\n') + 1;
    let dataTo = body.lastIndexOf('endstream');
    if (dataTo < dataFrom) dataTo = body.length;
    let data = body.slice(dataFrom, dataTo).replace(/\r?\n$/u, '');
    const filters = /\/Filter\s*(\[[^\]]*\]|\/\w+)/u.exec(dict)?.[1] ?? '';
    if (/FlateDecode/u.test(filters)) data = latin(await inflate(bytesOf(data)));
    else if (filters !== '') continue;
    streams.set(num, data);
  }
  /* OBJECT STREAMS HOLD SMALL OBJECTS (fonts, pages) packed together: each is unpacked into the dictionaries. */
  for (const [num, dict] of dicts) {
    if (!/\/Type\s*\/ObjStm\b/u.test(dict)) continue;
    const data = streams.get(num);
    if (data === undefined) continue;
    const n = Number(/\/N\s+(\d+)/u.exec(dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/u.exec(dict)?.[1] ?? 0);
    const head = data.slice(0, first).trim().split(/\s+/u).map(Number);
    for (let k = 0; k < n && 2 * k + 1 < head.length; k++) {
      const objNum = head[2 * k]!;
      const off = head[2 * k + 1]!;
      const end = 2 * k + 3 < head.length ? head[2 * k + 3]! : data.length - first;
      if (!dicts.has(objNum)) dicts.set(objNum, data.slice(first + off, first + end));
    }
  }
  return { dicts, streams };
}

const refsIn = (s: string): number[] => [...s.matchAll(/(\d+)\s+\d+\s+R\b/gu)].map((m) => Number(m[1]));

/** A dictionary's value under a key: an inline `<< … >>` (balanced), or the dictionary a reference names. */
function dictAt(dict: string, key: string, dicts: ReadonlyMap<number, string>): string | null {
  const at = new RegExp(`/${key}\\b\\s*`, 'u').exec(dict);
  if (!at) return null;
  const rest = dict.slice(at.index + at[0].length);
  const ref = /^(\d+)\s+\d+\s+R\b/u.exec(rest);
  if (ref) return dicts.get(Number(ref[1])) ?? null;
  if (!rest.startsWith('<<')) return null;
  let depth = 0;
  for (let i = 0; i < rest.length - 1; i++) {
    if (rest[i] === '<' && rest[i + 1] === '<') {
      depth++;
      i++;
    } else if (rest[i] === '>' && rest[i + 1] === '>') {
      depth--;
      i++;
      if (depth === 0) return rest.slice(2, i - 1);
    }
  }
  return null;
}

/**
 * A PDF's words, page by page, or `null` when it shows none this reader can find (a scan, or fonts with no map to text).
 *
 * A SMALL READER, NOT A RENDERER. It inflates `FlateDecode` streams and object streams, walks the page tree from the
 * catalog (each page's own fonts, inherited ones too), maps each font's codes through its `ToUnicode` map, and reads the
 * text operators (`Tj`, `TJ`, `'`, `"`, with a line for `T*`, `Td` down and `ET`). What it cannot read it leaves out.
 * Pure, with `DecompressionStream`, so the Worker and the self-host read a PDF the same way.
 */
export async function pdfText(bytes: Uint8Array): Promise<string | null> {
  if (magicType(bytes) !== 'application/pdf') return null;
  const { dicts, streams } = await objectsOf(latin(bytes));
  const maps = new Map<number, CMap | null>();
  const mapOfFont = (fontNum: number): CMap | null => {
    if (maps.has(fontNum)) return maps.get(fontNum)!;
    const dict = dicts.get(fontNum) ?? '';
    const to = /\/ToUnicode\s+(\d+)\s+\d+\s+R/u.exec(dict);
    const text = to ? streams.get(Number(to[1])) : undefined;
    const two = /\/Subtype\s*\/Type0\b/u.test(dict);
    const map = text !== undefined ? cmapOf(text) : { map: new Map<number, string>(), width: two ? 2 : 1 };
    if (text !== undefined && two) map.width = 2;
    maps.set(fontNum, map);
    return map;
  };
  const fontsOf = (resources: string | null): Map<string, CMap> => {
    const out = new Map<string, CMap>();
    if (resources === null) return out;
    const fonts = dictAt(resources, 'Font', dicts);
    if (fonts === null) return out;
    for (const m of fonts.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/gu)) {
      const map = mapOfFont(Number(m[2]));
      if (map !== null) out.set(m[1]!, map);
    }
    return out;
  };

  /* THE PAGES IN ORDER, from the catalog's tree; failing that, every page object in the order it was written. */
  const pages: { dict: string; resources: string | null }[] = [];
  const seen = new Set<number>();
  const walk = (num: number, inherited: string | null, depth: number) => {
    if (seen.has(num) || depth > 50) return;
    seen.add(num);
    const dict = dicts.get(num);
    if (dict === undefined) return;
    const resources = dictAt(dict, 'Resources', dicts) ?? inherited;
    if (/\/Type\s*\/Pages\b/u.test(dict)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/u.exec(dict)?.[1] ?? '';
      for (const kid of refsIn(kids)) walk(kid, resources, depth + 1);
    } else if (/\/Type\s*\/Page\b/u.test(dict)) pages.push({ dict, resources });
  };
  const catalog = [...dicts.values()].find((d) => /\/Type\s*\/Catalog\b/u.test(d));
  const root = catalog ? /\/Pages\s+(\d+)\s+\d+\s+R/u.exec(catalog)?.[1] : undefined;
  if (root !== undefined) walk(Number(root), null, 0);
  if (pages.length === 0)
    for (const [, dict] of dicts) if (/\/Type\s*\/Page\b/u.test(dict)) pages.push({ dict, resources: dictAt(dict, 'Resources', dicts) });

  const out: string[] = [];
  let total = 0;
  for (const page of pages) {
    const fonts = fontsOf(page.resources);
    const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/u.exec(page.dict)?.[1] ?? '';
    let text = '';
    for (const ref of refsIn(contents)) {
      const data = streams.get(ref);
      if (data !== undefined) text += contentText(data, fonts);
    }
    const t = tidy(text);
    if (t !== '') {
      out.push(t);
      total += t.length;
    }
    if (total > ATTACHED_TEXT_MOST) break;
  }
  const said = out.join('\n\n');
  /* WORDS THAT ARE MOSTLY NOT LETTERS ARE A FONT THIS READER DID NOT MAP, and are no help to anybody. */
  const letters = (said.match(/\p{L}/gu) ?? []).length;
  return said === '' || letters < said.replace(/\s/gu, '').length * 0.4 ? null : said;
}

/* ── a line ─────────────────────────────────────────────────────────────── */

const SHA = /^[0-9a-f]{64}$/u;

/** What a line's `to_v` says, read back, or `null` for one that says nothing an attachment can be (erased). */
export function attachedSaid(to: string | null): AttachedSaid | null {
  if (to === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(to);
  } catch {
    return null;
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.gone === true) return { gone: true };
  if (typeof o.back === 'string') return { back: o.back };
  if (typeof o.rename === 'string') return { rename: o.rename };
  if (typeof o.name !== 'string' || typeof o.sha256 !== 'string' || !SHA.test(o.sha256) || typeof o.mime !== 'string' || typeof o.bytes !== 'number') return null;
  const kind = (ATTACHED_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as AttachedKind) : attachedKind(o.mime);
  const t = o.text as Record<string, unknown> | undefined;
  const text = t && typeof t === 'object' && typeof t.sha256 === 'string' && SHA.test(t.sha256) && typeof t.chars === 'number' ? { text: { sha256: t.sha256, chars: t.chars } } : {};
  return { name: o.name, sha256: o.sha256, mime: o.mime, kind, bytes: o.bytes, ...text };
}

export const isAttachedVersion = (s: AttachedSaid | null): s is AttachedBody => s !== null && 'sha256' in s;

/**
 * Where an attachment stands once `lines` were written: the version line it is at (`null` once taken off), and its name
 * (a rename after a version names it until the next version, which brings its own).
 */
export function attachedState(lines: readonly AttachedLine[]): { standing: string | null; name: string | null } {
  let standing: string | null = null;
  let name: string | null = null;
  const versions = new Map<string, AttachedBody>();
  for (const l of lines) {
    const said = attachedSaid(l.to_v);
    if (said === null) continue;
    if (isAttachedVersion(said)) {
      versions.set(l.id, said);
      standing = l.id;
      name = said.name;
    } else if ('rename' in said) name = said.rename;
    else if ('gone' in said) standing = null;
    else if ('back' in said && versions.has(said.back)) {
      standing = said.back;
      name ??= versions.get(said.back)!.name;
    }
  }
  return { standing, name };
}

const LINE = 'rowid, id, ts, actor, target, field, to_v, batch';

/** Every line of one attachment on its thing, oldest first. The log's `(target, ts)` index finds them. */
export function attachedLines(sql: Sql, target: string, field: string): AttachedLine[] {
  return sql.all<AttachedLine>(`SELECT ${LINE} FROM event WHERE target = ? AND kind = 'note' AND field = ? ORDER BY rowid`, target, field);
}
