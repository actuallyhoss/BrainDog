/**
 * The five shapes a response arrives in.
 *
 * THE PATH IS NOT HERE, AND THAT IS THE POINT. `25 §3.1` promised "literal keys, integer indices, `[-1]`,
 * `[]`" and left the rest to whoever implemented it, which is how `expect:`, `page.from` and `read.rows`
 * came to be three readings of one sentence. `packages/where` already owns "how a declaration names a
 * thing" and already carries `47 §4.3`'s reading; `43 §4.4`'s lives beside it as `selectAll`, with the
 * divergences written down between them. Rank 3 is below rank 9, so this package imports it and the edge
 * points down (`31 §2`). A fourth copy here would be the exact thing that file exists to prevent.
 *
 * A BODY NEVER THROWS (`43 §2`). Every parser here answers `UNPARSEABLE` when it cannot read what it was
 * given, because a malformed body is an outcome a person reviews and not a bug in the record. Only a
 * malformed PATH throws, and a path is a declaration.
 *
 * NO `RegExp`, LIKE EVERYTHING ELSE UNDER `src/` (`43 §8`). Each parser is one index that only advances.
 */

import { selectAll, type Json } from '@braindog/where';

/** `43 §2` names it `select`; `where` names it `selectAll` to sit beside `readPath`. Same function. */
export { selectAll as select };

/** `readRows`' one non-`Json` answer, so `null` from a body stays a value and not a failure. */
export const UNPARSEABLE: unique symbol = Symbol('UNPARSEABLE');

export type Format = 'json' | 'csv' | 'xml' | 'html_table' | 'text';
export type Read = { format?: Format; rows?: string; delimiter?: ',' | ';' | '\t'; table?: number };

/* ── CSV, RFC 4180 by hand ───────────────────────────────────────────────── */

/**
 * Records of cells, honouring quotes. A newline inside quotes is data.
 *
 * BY HAND AND NOT BY SPLITTING, because splitting on the delimiter is correct for exactly the files that
 * would also have been correct as anything else. A bank statement has commas inside quoted merchant names on
 * the day it matters, and a split turns one row into two fields too many for that row alone, silently.
 */
function records(body: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < body.length) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endCell();
      i += 1;
      continue;
    }
    if (ch === '\r' && body[i + 1] === '\n') {
      endRow();
      i += 2;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * One object per record, keyed by the header row.
 *
 * THE LAST DUPLICATE HEADER WINS, and `43 §10` names it as a ceiling rather than leaving it to be
 * discovered. A file with two columns called `amount` is a file whose author meant something this cannot
 * express, and the alternative — refusing it — would reject a whole statement over a column nobody reads.
 */
function fromCsv(body: string, read: Read): Json[] | typeof UNPARSEABLE {
  const text = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
  const rows = records(text, read.delimiter ?? ',');
  /* A TRAILING EMPTY LINE IS NOT A ROW. Nearly every writer ends the file with a newline. */
  while (rows.length > 0 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === '') rows.pop();
  if (rows.length === 0) return UNPARSEABLE;

  const header = rows[0]!;
  if (header.length === 0 || header.every((h) => h === '')) return UNPARSEABLE;
  return rows.slice(1).map((cells) => {
    const out: { [k: string]: Json } = {};
    header.forEach((name, at) => {
      if (name === '') return;
      if (at < cells.length) out[name] = cells[at]!;
    });
    return out;
  });
}

/* ── entities, shared by XML and HTML ────────────────────────────────────── */

const NAMED = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

/**
 * The five predefined entities and numeric references, and nothing else.
 *
 * THIS IS THE BILLION-LAUGHS ANSWER (`43 §8`). An entity table a document can add to is a document that can
 * define one entity in terms of ten others and hand a parser a gigabyte from a kilobyte. There is no table to
 * add to: a `<!DOCTYPE` makes the whole body `UNPARSEABLE` before this is ever reached, and an unknown `&foo;`
 * stays the five characters it was written as.
 */
function entities(text: string, extra?: Map<string, string>): string {
  if (!text.includes('&')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '&') {
      out += text[i];
      i += 1;
      continue;
    }
    const end = text.indexOf(';', i + 1);
    /* A BOUND ON THE NAME, so `&` followed by a paragraph is one character and not a search to the end of the
       body once per ampersand. */
    if (end === -1 || end - i > 10) {
      out += '&';
      i += 1;
      continue;
    }
    const name = text.slice(i + 1, end);
    let decoded: string | undefined;
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const digits = hex ? name.slice(2) : name.slice(1);
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (digits.length > 0 && Number.isInteger(code) && code >= 0 && code <= 0x10ffff) decoded = String.fromCodePoint(code);
    } else decoded = NAMED.get(name) ?? extra?.get(name);
    if (decoded === undefined) {
      out += '&';
      i += 1;
      continue;
    }
    out += decoded;
    i = end + 1;
  }
  return out;
}

/* ── XML, a tiny non-validating parser ───────────────────────────────────── */

const isSpace = (ch: string | undefined): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
const isNameChar = (ch: string | undefined): boolean =>
  ch !== undefined && !isSpace(ch) && ch !== '>' && ch !== '/' && ch !== '=' && ch !== '<';

type Element = { name: string; attrs: [string, string][]; children: Element[]; text: string };

/**
 * Elements, attributes, text and CDATA. No DTD, ever.
 *
 * A `<!DOCTYPE` ANYWHERE MAKES THE BODY UNPARSEABLE, which is a refusal and not a limitation. Supporting a
 * doctype means supporting entity declarations, and the moment a stranger's document can declare entities the
 * parser has an expansion surface whether or not anybody meant it to (`43 §10`).
 */
function parseXml(body: string): Element | null {
  if (body.includes('<!DOCTYPE') || body.includes('<!doctype')) return null;
  const stack: Element[] = [];
  let root: Element | null = null;
  let i = 0;

  while (i < body.length) {
    const lt = body.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i && stack.length > 0) stack[stack.length - 1]!.text += entities(body.slice(i, lt));

    if (body.startsWith('<!--', lt)) {
      const end = body.indexOf('-->', lt + 4);
      if (end === -1) return null;
      i = end + 3;
      continue;
    }
    if (body.startsWith('<![CDATA[', lt)) {
      const end = body.indexOf(']]>', lt + 9);
      if (end === -1) return null;
      if (stack.length > 0) stack[stack.length - 1]!.text += body.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (body.startsWith('<?', lt)) {
      const end = body.indexOf('?>', lt + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    if (body.startsWith('</', lt)) {
      const end = body.indexOf('>', lt);
      if (end === -1) return null;
      const name = body.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (open === undefined || open.name !== name) return null;
      i = end + 1;
      continue;
    }

    /* An open tag: the name, then attributes to `>` or `/>`. */
    let at = lt + 1;
    let name = '';
    while (at < body.length && isNameChar(body[at])) name += body[at++];
    if (name === '') return null;

    const attrs: [string, string][] = [];
    let selfClosing = false;
    while (at < body.length) {
      while (isSpace(body[at])) at += 1;
      if (body[at] === '/' && body[at + 1] === '>') {
        selfClosing = true;
        at += 2;
        break;
      }
      if (body[at] === '>') {
        at += 1;
        break;
      }
      let key = '';
      while (at < body.length && isNameChar(body[at])) key += body[at++];
      if (key === '') return null;
      while (isSpace(body[at])) at += 1;
      let value = '';
      if (body[at] === '=') {
        at += 1;
        while (isSpace(body[at])) at += 1;
        const quote = body[at];
        if (quote !== '"' && quote !== "'") return null;
        const end = body.indexOf(quote, at + 1);
        if (end === -1) return null;
        value = entities(body.slice(at + 1, end));
        at = end + 1;
      }
      attrs.push([key, value]);
    }

    const element: Element = { name, attrs, children: [], text: '' };
    if (stack.length > 0) stack[stack.length - 1]!.children.push(element);
    else if (root === null) root = element;
    else return null; // two roots is not a document
    if (!selfClosing) stack.push(element);
    i = at;
  }

  return stack.length === 0 ? root : null;
}

/**
 * An element as JSON: attributes under `@`, repeated children as a list, text under `#text`.
 *
 * A TEXT-ONLY ELEMENT IS ITS STRING, because `{ "#text": "5" }` for `<count>5</count>` would make every path
 * in every declaration end in `.#text` for no information.
 */
function asJson(el: Element): Json {
  const text = el.text.trim();
  if (el.attrs.length === 0 && el.children.length === 0) return text;

  const out: { [k: string]: Json } = {};
  for (const [key, value] of el.attrs) out[`@${key}`] = value;
  for (const child of el.children) {
    const value = asJson(child);
    const had = Object.hasOwn(out, child.name) ? out[child.name] : undefined;
    if (had === undefined) out[child.name] = value;
    else if (Array.isArray(had)) had.push(value);
    else out[child.name] = [had, value];
  }
  if (text !== '') out['#text'] = text;
  return out;
}

/* ── an HTML table ───────────────────────────────────────────────────────── */

const HTML_EXTRA = new Map([['nbsp', ' ']]);

const collapse = (text: string): string => {
  let out = '';
  let wasSpace = false;
  for (const ch of text) {
    const space = ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
    if (space && wasSpace) continue;
    out += space ? ' ' : ch;
    wasSpace = space;
  }
  return out.trim();
};

/** The tag name at `<`, lower-cased, and whether it closes. */
function tagAt(body: string, lt: number): { name: string; closing: boolean; end: number } | null {
  let at = lt + 1;
  const closing = body[at] === '/';
  if (closing) at += 1;
  let name = '';
  while (at < body.length && isNameChar(body[at])) name += body[at++];
  const end = body.indexOf('>', at);
  if (name === '' || end === -1) return null;
  return { name: name.toLowerCase(), closing, end: end + 1 };
}

/**
 * The nth table on the page, as objects keyed by its first row.
 *
 * NO COLSPAN, NO ROWSPAN, NO NESTED TABLES (`43 §10`). Each of those is a layout fact rather than a data one,
 * and honouring them means deciding what a merged cell means for a row, which is a decision the page does not
 * carry either. A page that needs them needs a declaration that does not read a table.
 */
function fromHtmlTable(body: string, read: Read): Json[] | typeof UNPARSEABLE {
  const want = read.table ?? 1;
  /* LOWER-CASED ONCE. Doing it inside the loop reads the whole page again per `<script>`, which is
     quadratic on exactly the pages that have many of them. */
  const lower = body.toLowerCase();
  let depth = 0;
  let seen = 0;
  let inWanted = false;
  let rows: string[][] = [];
  let row: string[] | null = null;
  let cell: string | null = null;
  let i = 0;

  while (i < body.length) {
    const lt = body.indexOf('<', i);
    if (lt === -1) break;
    if (cell !== null) cell += body.slice(i, lt);
    const tag = tagAt(body, lt);
    if (tag === null) {
      if (cell !== null) cell += '<';
      i = lt + 1;
      continue;
    }

    if (tag.name === 'script' || tag.name === 'style') {
      if (!tag.closing) {
        const close = lower.indexOf(`</${tag.name}`, tag.end);
        i = close === -1 ? body.length : close;
        continue;
      }
    } else if (tag.name === 'table') {
      if (tag.closing) {
        depth -= 1;
        /* THE MATCHING CLOSE AND NOT THE FIRST ONE. A nested table's `</table>` would otherwise end the
           read halfway down the table that was asked for, dropping rows silently. Nesting is still
           unsupported (`43 §10`) and an inner table's cells flatten into the outer row, but a wanted
           table is read to its own end. */
        if (inWanted && depth === 0) break;
      } else {
        depth += 1;
        if (depth === 1) {
          seen += 1;
          inWanted = seen === want;
        }
      }
    } else if (inWanted && tag.name === 'tr') {
      if (tag.closing) {
        if (row !== null) rows.push(row);
        row = null;
      } else row = [];
    } else if (inWanted && (tag.name === 'td' || tag.name === 'th')) {
      if (tag.closing) {
        if (row !== null && cell !== null) row.push(collapse(entities(cell, HTML_EXTRA)));
        cell = null;
      } else cell = '';
    }
    i = tag.end;
  }
  if (row !== null && row.length > 0) rows.push(row);

  rows = rows.filter((r) => r.length > 0);
  if (rows.length === 0) return UNPARSEABLE;
  const header = rows[0]!;
  return rows.slice(1).map((cells) => {
    const out: { [k: string]: Json } = {};
    header.forEach((name, at) => {
      if (name !== '' && at < cells.length) out[name] = cells[at]!;
    });
    return out;
  });
}

/* ── the five, behind one door ───────────────────────────────────────────── */

/**
 * The rows a body holds, under the format the declaration named.
 *
 * `UNPARSEABLE` IS A VALUE AND NOT A THROW, and it is a symbol rather than `null` because `null` is a legal
 * JSON body. The caller turns it into `needs-review` with a reason naming the format, which is a sentence a
 * person can act on: the provider changed what it sends.
 */
export function readRows(body: string, format: Format, read: Read = {}): Json[] | typeof UNPARSEABLE {
  if (format === 'text') return [body];
  if (format === 'csv') return fromCsv(body, read);
  if (format === 'html_table') return fromHtmlTable(body, read);

  let root: Json;
  if (format === 'json') {
    try {
      root = JSON.parse(body) as Json;
    } catch {
      return UNPARSEABLE;
    }
  } else {
    const element = parseXml(body);
    if (element === null) return UNPARSEABLE;
    root = { [element.name]: asJson(element) };
  }

  const reached = selectAll(root, read.rows ?? '', 'fetch.read.rows');
  /* ONE ARRAY IS THE ROWS IT HOLDS, and anything else is the values the path reached. `data` pointing at a
     list of ten is ten rows; `data[]` reaching ten is the same ten, and an author should not have to know
     which spelling this package prefers. */
  if (reached.length === 1 && Array.isArray(reached[0])) return reached[0];
  return reached;
}
