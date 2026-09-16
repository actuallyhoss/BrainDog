/**
 * A PAGE'S SOURCE, AS TEXT: THE PRINTER AND ITS PARSER, IN ONE PACKAGE SO THEY CANNOT DRIFT APART.
 *
 * `.dog` is one page, one file: the text you get when you open the source of a page, in the terse
 * dialect `dogText` prints. It is not one file holding a whole record; the record is the database
 * and it keeps its own name, `.brain` (`docs/03-DOG-FORMAT.md` §1).
 *
 * WHY THIS LIVES IN A PACKAGE AND NOT IN THE WEB APP. `apps/web/src/lib/dog/source.ts` is the place
 * a browser reads this from — it also owns `saveDog`, which needs `document` and is not portable —
 * but the CLI needs the exact same dialect to write a `.dog` file with `braindog page pull` and to
 * read one back with `braindog page push` and `braindog page check`, and apps in this repository do
 * not import each other's source. A copy of `dogText` kept in step with a parser by hand is the
 * failure mode `packages/kernel/src/declare.ts` names outright: *"a copy that drifts is worse than
 * no copy."* So the printer and the parser are one module, imported by both.
 *
 * THE SHAPES ARE STRUCTURAL ON PURPOSE. A declaration reaches `dogText` from two places that do not
 * share a type: the record's own answer for a live page, whose blocks carry what the kernel read on
 * them, and a seed's page declaration when there is no record. Both spell the keys this prints the
 * same way, so the narrow shape is the honest description of what is needed and neither caller has
 * to be converted into the other.
 *
 * `parseDog` INVERTS EXACTLY WHAT `dogText` PRINTS, AND NOTHING MORE. `docs/06-PAGES.md` §1 draws
 * the line between the AUTHORING GRAMMAR the kernel accepts — where a column is an object carrying
 * `label`, `width`, `align`, `link`, `tone_when` and `as` — and the SOURCE VIEW `dogText` prints,
 * which flattens a column to its bare field name and is "a summary rather than a round trip... text
 * to read, diff and send, not text to feed back in as a declaration." `parseDog` does not widen that
 * grammar back out: it reads the terse dialect back into the same narrow shape `dogText` printed it
 * from, so `dogText(parseDog(dogText(x)).value)` reproduces the bytes `dogText(x)` wrote. Pushing the
 * result loses exactly what the source view always lost — a column's label, width and formatting —
 * which is the trade the format documents, not a defect this parser introduces.
 */

/** One block of a page, in the keys the source prints. */
export type DogBlock = {
  kind: string;
  heading?: string | undefined;
  span?: number | undefined;
  source?: string | undefined;
  where?: string | undefined;
  columns?: readonly { field: string }[] | undefined;
  cells?: readonly { metric: string }[] | undefined;
  order?: readonly { field: string; dir?: string | undefined }[] | undefined;
  target?: unknown;
  limit?: unknown;
  empty?: string | undefined;
  authored?: readonly unknown[] | undefined;
  body?: string | undefined;
};

/** One page, in the keys the source prints. */
export type DogPage = {
  page: string;
  title: string;
  for?: { register: string; where?: string | undefined } | undefined;
  nav?: { section: string; order: number } | undefined;
  requires?: readonly string[] | undefined;
  blocks: readonly DogBlock[];
};

const line = (indent: string, key: string, value: unknown): string =>
  value === undefined || value === null || value === '' ? '' : `${indent}${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;

/** The declaration as text: what the source view shows, and what the file holds. */
export function dogText(decl: DogPage): string {
  return [
    `page: ${decl.page}`,
    `title: ${decl.title}`,
    decl.for ? `for: { register: ${decl.for.register}${decl.for.where ? `, where: ${decl.for.where}` : ''} }` : '',
    decl.nav ? `nav: { section: ${decl.nav.section}, order: ${decl.nav.order} }` : '',
    `requires: [${(decl.requires ?? []).join(', ')}]`,
    '',
    'blocks:',
    ...decl.blocks.flatMap((b) => [
      `  - kind: ${b.kind}`,
      line('    ', 'heading', b.heading),
      b.span && b.span !== 12 ? `    span: ${b.span}` : '',
      line('    ', 'source', b.source),
      line('    ', 'where', b.where),
      b.columns?.length ? `    columns: [${b.columns.map((c) => c.field).join(', ')}]` : '',
      b.cells?.length ? `    cells: [${b.cells.map((c) => c.metric).join(', ')}]` : '',
      b.order?.length ? `    order: [${b.order.map((o) => `${o.field} ${o.dir}`).join(', ')}]` : '',
      line('    ', 'target', b.target),
      line('    ', 'limit', b.limit),
      b.empty ? `    empty: "${b.empty}"` : '',
      b.authored?.length ? `    authored: ${b.authored.length} rows` : '',
      b.body ? `    body: |\n${b.body.split('\n').map((l) => `      ${l}`).join('\n')}` : '',
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the file is called: the page's own name, which is the first line of the file. */
export const dogName = (page: string): string => `${page}.dog`;

/** The parser's answer: the page it read, or one sentence a person can act on. Never a stack trace. */
export type DogParsed = { ok: true; value: DogPage } | { ok: false; fix: string };

const ok = (value: DogPage): DogParsed => ({ ok: true, value });
const no = (fix: string): DogParsed => ({ ok: false, fix });

/**
 * `line()`'s inverse: a string was always printed raw, so anything else was `JSON.stringify`d and
 * must round-trip back through `JSON.parse` to the identical text or it was never that shape at all.
 * `target` and `limit` are numbers in every page this build declares, but the printer would print a
 * string just as happily, so this reads either back rather than assuming.
 */
function unline(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'string' && JSON.stringify(parsed) === text) return parsed;
  } catch {
    /* Not JSON, so it is the raw string `line()` printed. */
  }
  return text;
}

const listOf = (bracketed: string): string[] => {
  const inner = bracketed.trim();
  return inner === '' ? [] : inner.split(', ');
};

const BLOCK_START = /^ {2}- kind: (.+)$/;
const FIELD_LINE = /^ {4}([a-z]+): (.*)$/;

/** One block, from its `- kind:` line through its last field. Returns the next unread index. */
function parseBlock(lines: readonly string[], start: number, page: string): { block: DogBlock; next: number } | { fix: string } {
  const head = BLOCK_START.exec(lines[start] ?? '');
  if (!head) return { fix: `${page} declares a line that is not a block: ${JSON.stringify(lines[start] ?? '')}.` };
  const block: DogBlock = { kind: head[1]! };
  let i = start + 1;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    if (raw === '' || BLOCK_START.test(raw)) break;

    const field = FIELD_LINE.exec(raw);
    if (!field) return { fix: `${page}'s ${block.kind} block has a line this format does not recognise: ${JSON.stringify(raw)}.` };
    const key = field[1]!;
    const rest = field[2]!;

    if (key === 'heading') {
      block.heading = rest;
      i += 1;
    } else if (key === 'span') {
      if (!/^\d+$/.test(rest)) return { fix: `${page}'s ${block.kind} block's span is not a whole number: ${JSON.stringify(rest)}.` };
      block.span = Number(rest);
      i += 1;
    } else if (key === 'source') {
      block.source = rest;
      i += 1;
    } else if (key === 'where') {
      block.where = rest;
      i += 1;
    } else if (key === 'columns') {
      const m = /^\[(.*)\]$/.exec(rest);
      if (!m) return { fix: `${page}'s ${block.kind} block's columns is not a bracketed list.` };
      block.columns = listOf(m[1]!).map((field) => ({ field }));
      i += 1;
    } else if (key === 'cells') {
      const m = /^\[(.*)\]$/.exec(rest);
      if (!m) return { fix: `${page}'s ${block.kind} block's cells is not a bracketed list.` };
      block.cells = listOf(m[1]!).map((metric) => ({ metric }));
      i += 1;
    } else if (key === 'order') {
      const m = /^\[(.*)\]$/.exec(rest);
      if (!m) return { fix: `${page}'s ${block.kind} block's order is not a bracketed list.` };
      block.order = listOf(m[1]!).map((term) => {
        const [field, dir] = term.split(' ');
        return dir === 'asc' || dir === 'desc' ? { field: field ?? '', dir } : { field: field ?? '' };
      });
      i += 1;
    } else if (key === 'target') {
      block.target = unline(rest);
      i += 1;
    } else if (key === 'limit') {
      block.limit = unline(rest);
      i += 1;
    } else if (key === 'empty') {
      const m = /^"(.*)"$/.exec(rest);
      if (!m) return { fix: `${page}'s ${block.kind} block's empty is not a quoted sentence.` };
      block.empty = m[1];
      i += 1;
    } else if (key === 'authored') {
      /* IRRECOVERABLE, ON PURPOSE. The source view counts authored rows and prints nothing else about
         them, so a file holding this line cannot become a declaration without deleting real rows —
         which is exactly what `06 §1` warns the source view is not for. Refusing here, at the parse,
         is what keeps `push` from ever making that write. */
      return {
        fix: `${page}'s ${block.kind} block holds authored rows (${rest}), and the source view only counts them. Edit authored rows in the app; pushing this file would replace them with nothing.`,
      };
    } else if (key === 'body') {
      if (rest !== '|') return { fix: `${page}'s ${block.kind} block's body is not a block of text.` };
      i += 1;
      const bodyLines: string[] = [];
      while (i < lines.length && !BLOCK_START.test(lines[i] ?? '')) {
        const bodyLine = lines[i] ?? '';
        bodyLines.push(bodyLine.length >= 6 ? bodyLine.slice(6) : '');
        i += 1;
      }
      block.body = bodyLines.join('\n');
      break;
    } else {
      return { fix: `${page}'s ${block.kind} block declares ${key}, and the source view does not print that key.` };
    }
  }

  return { block, next: i };
}

/**
 * The text of a `.dog` file, back into the shape `dogText` printed it from.
 *
 * A CLOSED, LINE-BY-LINE GRAMMAR, and deliberately not a general YAML reader: the source view is one
 * function's output, so its inverse only has to understand what that function writes. A line outside
 * it is refused by name rather than silently accepted, because a file `check` and `push` cannot read
 * correctly is a file they must say so about rather than guess at.
 */
export function parseDog(text: string): DogParsed {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  /* ONE TRAILING BLANK LINE IS TOLERATED, because a text editor adds one on save and `dogText` never
     writes one. A second one, or a blank line in the middle of the file, is not part of the dialect. */
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const pageLine = /^page: (.+)$/.exec(lines[0] ?? '');
  if (!pageLine) return no("A .dog file's first line is page: <id>, and this one is not.");
  const page = pageLine[1]!.trim();

  const titleLine = /^title: (.*)$/.exec(lines[1] ?? '');
  if (!titleLine) return no(`${page} has no title line, and a page is named on the screen before it is drawn.`);
  const decl: DogPage = { page, title: titleLine[1]!, blocks: [] };
  let i = 2;

  const forLine = /^for: \{ register: (.+) \}$/.exec(lines[i] ?? '');
  if (forLine) {
    const inner = forLine[1]!;
    const sep = inner.indexOf(', where: ');
    decl.for = sep < 0 ? { register: inner.trim() } : { register: inner.slice(0, sep).trim(), where: inner.slice(sep + ', where: '.length) };
    i += 1;
  }

  const navLine = /^nav: \{ section: (.*), order: (-?\d+) \}$/.exec(lines[i] ?? '');
  if (navLine) {
    decl.nav = { section: navLine[1]!, order: Number(navLine[2]) };
    i += 1;
  }

  const requiresLine = /^requires: \[(.*)\]$/.exec(lines[i] ?? '');
  if (!requiresLine) return no(`${page} has no requires: line, and a page names the registers it reads.`);
  decl.requires = listOf(requiresLine[1]!);
  i += 1;

  if ((lines[i] ?? '') !== 'blocks:') return no(`${page} has no blocks: line where one is expected.`);
  i += 1;

  const blocks: DogBlock[] = [];
  while (i < lines.length && (lines[i] ?? '') !== '') {
    const out = parseBlock(lines, i, page);
    if ('fix' in out) return no(out.fix);
    blocks.push(out.block);
    i = out.next;
  }
  decl.blocks = blocks;

  return ok(decl);
}
