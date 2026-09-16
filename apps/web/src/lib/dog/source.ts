/**
 * A PAGE'S SOURCE, AS A FILE SOMEBODY CAN KEEP.
 *
 * `.dog` is one page, one file: the text you get when you open the source of a page, in the terse
 * dialect the record already holds and `packages/where` already parses. It is not one file holding
 * a whole record; the record is the database and it keeps its own name.
 *
 * THE TEXT LIVED IN THE ROUTE AND NOTHING COULD BE DONE WITH IT. It was a `<pre>` behind `?src=1`:
 * readable, and impossible to save, diff, send or edit. Printing it and writing it are the same
 * bytes by construction now, because there is one function and the screen and the file both call
 * it.
 *
 * THE SHAPES ARE STRUCTURAL ON PURPOSE. A declaration reaches this file from two places that do not
 * share a type: the record's own answer for a live page, whose blocks carry what the kernel read on
 * them, and the seed's `PageDecl` when there is no record. Both spell the keys this prints the same
 * way, so the narrow shape is the honest description of what is needed and neither caller has to be
 * converted into the other.
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

/**
 * Hand the text to the browser as a file.
 *
 * `text/plain` BECAUSE IT IS TEXT. There is no registered type for this and inventing one would
 * mean an operating system that opens the file in nothing, where every machine already opens plain
 * text in the editor the person reads code in.
 */
export function saveDog(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
