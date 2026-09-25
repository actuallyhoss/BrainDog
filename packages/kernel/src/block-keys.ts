/**
 * THE WORDS A PAGE DECLARATION MAY SAY, IN ONE PLACE, because two checks have to agree about them.
 *
 * `declare.ts` checks a page when it is installed and `pages.ts` checks each block when it is read, and until this
 * file each had its own idea: the read named a key nobody reads (`READS`), and the install named none at all. Measured
 * in `loop/research-dynamic-layouts.md` §3 through a pack installed on a fresh record: a block carrying `size: 2`
 * installed and was refused only when the page was opened, weeks after its author had gone; a page carrying `layout`
 * and `tabs` installed and was handed to the host in the answer, read by nothing and refused by nothing; and `lead: true`
 * on a `cards` block and `first: 3` on a `steps` block installed and read clean while no code for either kind looked at
 * them. So the install now refuses exactly what the read would, from this list, and the read refuses per kind too.
 *
 * IT IMPORTS NOTHING, so `declare.ts` and `pages.ts` both import it and neither has to import the other, whose own
 * imports reach half the kernel.
 */

/**
 * A table's own entry for `key`, never one `Object.prototype` lends it. Looked up by bracket, a key named `constructor`
 * found `Object` itself and a refusal pasted its native source into the sentence.
 */
const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

/**
 * The keys a block declaration may carry, whatever its kind.
 *
 * `area` puts the block in a page's main column or its rail, which a page with a `layout` has (`declare.ts` refuses it
 * on a page without one).
 */
const GENERAL = [
  'kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'limit', 'target', 'authored', 'empty',
  'tone', 'body', 'when', 'opening', 'from', 'horizon', 'inherit', 'working', 'area',
] as const;

/**
 * The keys only some kinds read, and which. A key here on any other kind is refused, at install and at read.
 *
 * EACH ROW IS WHAT THE CODE READS, not what a document hoped. `lead` is the hero figure of a `stat`, the one bigger card
 * of a `cards` block and the opening sentence of a `note`; `first` cuts a `feed`'s or an `agents` block's groups and
 * a `steps` block's open rows; `range` draws a `progress` block's rows as bands; `box` puts the blocks after a `section`
 * on one surface; `tiles` draws a `queue` as tiles; `register` is the list a `capture` adds to and an `inputs` block
 * edits; `row` is a `diff`'s row and an `inputs` block's.
 *
 * LEFT GENERAL ON PURPOSE: `opening`, `from` and `horizon` are read by whatever kind sits over `forecast.runway`, and a
 * `table` over it is written in the app's own tests; `cells` turns any block into figures; `target`, `inherit`,
 * `working` and `when` are read over any register. Narrowing one of those would refuse a page the read draws.
 */
export const KEY_KINDS: Readonly<Record<string, readonly string[]>> = {
  lead: ['stat', 'cards', 'note'],
  first: ['feed', 'agents', 'steps'],
  since: ['feed'],
  stale: ['cards'],
  spent: ['progress'],
  toward: ['progress'],
  range: ['progress'],
  unset: ['bar', 'split'],
  tones: ['bar', 'split'],
  document: ['note'],
  fold: ['section'],
  icon: ['section'],
  box: ['section'],
  tiles: ['queue'],
  register: ['capture', 'inputs'],
  series: ['series'],
  net: ['series'],
  ahead: ['series'],
  back: ['series', 'stat', 'lines'],
  bucket: ['stat', 'lines'],
  recorded: ['forecast'],
  knobs: ['forecast'],
  late: ['forecast'],
  under: ['forecast'],
  sell: ['forecast'],
  versions: ['diff'],
  field: ['diff'],
  row: ['diff', 'inputs'],
  of: ['ring'],
};

/**
 * THE KEYS AN ANSWER CARRIES, BECAUSE A BLOCK THAT CAME OUT OF THE READ CAN GO BACK IN. `block()` is a public call and
 * `BlockResult` is a `PageBlock` with the answer on it, so reading one back, to redraw it with one column changed, would
 * otherwise report `rows` and `matched` as keys this record does not read. `rings`, `queue`, `walks` and `walkFx` were
 * answered and missing from this list, so a card grid read back with its rings was refused for a key the read had
 * written.
 */
const ANSWERED = [
  'drawn', 'rows', 'matched', 'readings', 'walk', 'walks', 'walkFx', 'refusals', 'inherited', 'scopes', 'feed', 'seen',
  'history', 'values', 'bars', 'measures', 'past', 'changes', 'working_now', 'lateness', 'late_name', 'sells', 'fx',
  'fills', 'rings', 'queue', 'nexts', 'done_now', 'next', 'types',
] as const;

/**
 * Every key a block may be DECLARED with. An answer's keys are not among them: `{ kind: cards, next: what }` installed
 * clean and drew nothing, because `next` is what a steps block answers, not a word a block is written with.
 */
export const BLOCK_INSTALLS: ReadonlySet<string> = new Set([...GENERAL, ...Object.keys(KEY_KINDS)]);

/** Every key a block may carry and the read will not refuse by name: what it is declared with, and what a read answered. */
export const BLOCK_READS: ReadonlySet<string> = new Set([...BLOCK_INSTALLS, ...ANSWERED]);

/** The keys a block of this kind may be declared with, for a refusal's `allowed`. */
export const keysFor = (kind: string): string[] => [...GENERAL, ...Object.keys(KEY_KINDS).filter((k) => KEY_KINDS[k]!.includes(kind))];

/** The kinds that read `key`, when only some do. */
export const kindsReading = (key: string): readonly string[] | undefined => own(KEY_KINDS, key);

/**
 * WHAT TO WRITE INSTEAD of a block key nobody reads, for the words an author reaches for first. A refusal that names
 * the key and stops there sends the author to the documents, and the one they came from is usually a screen that did
 * the thing another way.
 */
const BLOCK_INSTEAD: Readonly<Record<string, string>> = {
  size: 'A block is made wider with span:, a whole number of twelfths from 1 to 12.',
  width: 'A block is made wider with span:, a whole number of twelfths from 1 to 12.',
  low: 'A progress block draws each row from its low to its high with range: true and four columns: the label, what was spent, the low and the high.',
  high: 'A progress block draws each row from its low to its high with range: true and four columns: the label, what was spent, the low and the high.',
  shows: 'A queue is drawn as tiles with tiles: true. What an option shows is written on the option, in the question that offers it.',
  rail: 'A block goes in the rail with area: rail, on a page that declares layout: { rail: 4 }.',
  next: 'The next step on a card is a column: { field: <a field of the steps list>, as: next }.',
};

/** The sentence for a block key this record does not read at all. */
export const unreadBlockKey = (key: string): string =>
  `${key}: is not a key a block has. ${
    own(BLOCK_INSTEAD, key) ??
    ((ANSWERED as readonly string[]).includes(key)
      ? 'It is what a read answers, and a block is not declared with it. Take it off.'
      : 'Take it off; the keys this kind reads are listed with this refusal.')
  }`;

/** What to do with a key read by other kinds than this one. */
const WRONG_KIND: Readonly<Record<string, string>> = {
  first: 'To draw fewer rows, write limit: instead.',
  lead: 'Take it off, or draw these rows as cards.',
  icon: 'Put a section before this block and give the section the icon.',
  fold: 'Put a section before this block and fold the section.',
  box: 'Put a section before this block and give the section box: true.',
  register: 'A block that reads rows names them with source: register.<id>.',
};

/** The sentence for a key this kind does not read, naming the kinds that do. */
export function wrongKindKey(key: string, kind: string): string {
  const kinds = own(KEY_KINDS, key) ?? [];
  const said = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
  return `${key}: is read by ${said} blocks, and a ${kind} block does nothing with it. ${own(WRONG_KIND, key) ?? 'Take it off.'}`;
}

/**
 * The keys a page declaration may carry, `06 §1.1`'s table plus what the shipped pages were measured to use.
 *
 * WALKED BEFORE IT WAS CLOSED: every page declaration in `packages/seed` and `packs/` (thirty-four, templates and the
 * holding pen's among them) uses `page`, `title`, `nav`, `icon`, `requires`, `blocks`, `for`, `pack`, `origin` and
 * `placed`, and nothing else. `icon`, `for` and `pack` were missing from the table while thirty-three pages, seven
 * templates and eight pages carried them, so the table was the thing that was wrong and it gains them. `layout` is
 * new. `filters` and `header` are in the table and refused apart, below, because nothing draws them.
 */
export const PAGE_KEYS: ReadonlySet<string> = new Set([
  'page', 'title', 'nav', 'icon', 'requires', 'blocks', 'for', 'pack', 'origin', 'derived_from', 'placed', 'tone', 'layout',
]);

/** Published in `06 §1.1` and read by nothing in this build, so the repair is a deploy rather than an edit. */
export const PAGE_UNBUILT: ReadonlySet<string> = new Set(['filters', 'header']);

/** The keys of `nav`. `tabs: true` draws every page of the section as a strip of tabs over each of them. */
export const NAV_KEYS: ReadonlySet<string> = new Set(['section', 'order', 'icon', 'tabs']);

const PAGE_INSTEAD: Readonly<Record<string, string>> = {
  tabs: 'Tabs are a nav section drawn as a strip: nav: { section, order, tabs: true } on the pages that share it.',
  rail: 'A page gets a side rail with layout: { rail: 4 }, and a block goes in it with area: rail.',
  columns: 'A page is laid out with layout: { rail: 3 to 5 } and each block\'s span: and area:.',
  sections: 'A section is a block: { kind: section, heading: ... }, and the blocks after it sit under it.',
  name: 'A page is named by title:.',
  id: 'A page is named by page:, and its declaration id is page.<page>.',
};

/** The sentence for a page key this record does not read. */
export const unreadPageKey = (key: string): string =>
  `${key}: is not a key a page has. ${own(PAGE_INSTEAD, key) ?? 'Take it off; the keys a page reads are listed with this refusal.'}`;
