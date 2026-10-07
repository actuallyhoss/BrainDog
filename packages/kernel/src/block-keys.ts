/**
 * THE WORDS A PAGE DECLARATION MAY SAY, IN ONE PLACE, because two checks have to agree about them.
 *
 * `declare.ts` checks a page when it is installed and `pages.ts` checks each block when it is read, and until this file
 * each had its own idea: the read named a key nobody reads (`READS`), and the install named none at all. Measured
 * through a pack installed on a fresh record: a block carrying `size: 2` installed and was refused only when the page
 * was opened, weeks after its author had gone; a page carrying `layout` and `tabs` installed and was handed to the host
 * in the answer, read by nothing and refused by nothing; and `lead: true` on a `cards` block and `first: 3` on a
 * `steps` block installed and read clean while no code for either kind looked at them. So the install now refuses
 * exactly what the read would, from this list, and the read refuses per kind too.
 *
 * IT IMPORTS ONLY THE KIND REGISTRY, so `declare.ts` and `pages.ts` both import it and neither has to import the other,
 * whose own imports reach half the kernel. The registry (`kinds/index.ts`) is read here once, when this file loads, and
 * that is why a kind module never imports this file at run time: it would be asked for its keys before it had any.
 */

import { BLOCK_KIND_MODULES } from './kinds/index.ts';

/**
 * A table's own entry for `key`, never one `Object.prototype` lends it. Looked up by bracket, a key named `constructor`
 * found `Object` itself and a refusal pasted its native source into the sentence.
 */
const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

/**
 * The keys a block declaration may carry, whatever its kind.
 *
 * `area` puts the block in a page's main column or its rail, which a page with a `layout` has (`declare.ts` refuses it
 * on a page without one). `icon` is the glyph in the well beside a block's heading, so every tile wears one; it was a
 * section's alone, and a page that gave its stat tile a glyph was refused at install while the host drew it fine.
 */
/*
 * `key` IS THE BLOCK'S NAME FOR THE ENGINE (DIRECTION §38), what a page's look (`compose.ts`) leads with, orders, hides
 * and pins by. A block may declare one; one that does not is named by `defaultBlockKey` below, so every block a read
 * answers carries one and a host keys what it draws by it rather than by its place.
 */
const GENERAL = [
  'kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'limit', 'target', 'authored', 'empty',
  'tone', 'body', 'when', 'opening', 'from', 'horizon', 'inherit', 'working', 'area', 'icon', 'key',
] as const;

/**
 * The keys only some kinds read, and which. A key here on any other kind is refused, at install and at read.
 *
 * EACH ROW IS WHAT THE CODE READS, not what a document hoped. `lead` is the hero figure of a `stat`, the one bigger card
 * of a `cards` block, the opening sentence of a `note` and a `queue`'s first question drawn whole, with what accepting
 * it does; `first` cuts a `feed`'s or an `agents` block's groups and
 * a `steps` block's open rows; `range` draws a `progress` block's rows as bands; `box` puts the blocks after a `section`
 * on one surface, and a `cards` block's `fold` is how many cards each of its `group`s shows before the rest fold; `tiles` draws a `queue` as tiles; `who` draws a `heat` as a line a person, columns `day | who`; `register` is the list a `capture` adds to and an `inputs` block
 * edits; `row` is a `diff`'s row and an `inputs` block's.
 *
 * LEFT GENERAL ON PURPOSE: `opening`, `from` and `horizon` are read by whatever kind sits over `forecast.runway`, and a
 * `table` over it is written in the app's own tests; `cells` turns any block into figures; `target`, `inherit`,
 * `working` and `when` are read over any register. Narrowing one of those would refuse a page the read draws.
 *
 * THESE ARE THE KINDS `pages.ts` READS ITSELF. A kind in the registry names its own keys on its module, and
 * `READ_BY` below is this table with those added, so a registered kind's key is never written in two places. Ask
 * `kindsReading`, which reads both, rather than this table.
 */
export const KEY_KINDS: Readonly<Record<string, readonly string[]>> = {
  lead: ['stat', 'cards', 'note', 'queue'],
  first: ['feed', 'agents', 'steps'],
  since: ['feed'],
  stale: ['cards'],
  spent: ['progress'],
  toward: ['progress'],
  range: ['progress'],
  unset: ['bar', 'split'],
  tones: ['bar', 'split', 'cards', 'lanes'],
  document: ['note'],
  fold: ['section', 'cards'],
  group: ['cards'],
  box: ['section'],
  panel: ['section'],
  tiles: ['queue'],
  who: ['heat'],
  short: ['steps'],
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
  horizons: ['forecast'],
  headline: ['forecast'],
  versions: ['diff'],
  field: ['diff'],
  row: ['diff', 'inputs'],
  about: ['table', 'cards'],
  of: ['ring'],
};

/**
 * `KEY_KINDS` with every registered kind's own keys added (`kinds/index.ts`), which is what the install and the read
 * both refuse from.
 *
 * A KEY THE TABLE ALREADY HAS IS SHARED, not taken: a registered kind that reads `back` joins the kinds that read it.
 * A key every block may carry is left general, because naming it on one kind would refuse it on the rest. Built in a
 * `Map`, so a module's key is never a property name an object already has.
 */
const READ_BY: Readonly<Record<string, readonly string[]>> = (() => {
  const by = new Map<string, string[]>(Object.entries(KEY_KINDS).map(([key, kinds]) => [key, [...kinds]]));
  for (const [kind, registered] of Object.entries(BLOCK_KIND_MODULES))
    for (const key of registered.keys) {
      if ((GENERAL as readonly string[]).includes(key)) continue;
      const kinds = by.get(key) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      by.set(key, kinds);
    }
  return Object.fromEntries(by);
})();

/**
 * THE KEYS AN ANSWER CARRIES, BECAUSE A BLOCK THAT CAME OUT OF THE READ CAN GO BACK IN. `block()` is a public call and
 * `BlockResult` is a `PageBlock` with the answer on it, so reading one back, to redraw it with one column changed, would
 * otherwise report `rows` and `matched` as keys this record does not read. `rings`, `queue`, `walks` and `walkFx` were
 * answered and missing from this list, so a card grid read back with its rings was refused for a key the read had
 * written.
 *
 * `open` WAS ANSWERED AND MISSING TOO: a steps block's short view counts its open rows, and read back it was refused
 * "open: is not a key this record reads".
 *
 * EXPORTED BECAUSE THE RECORD BLANKS A HELD BLOCK BY IT. Every key here is something the read computed from rows, so a
 * block held from a reader keeps none of them beyond the empties, and the record's test holds its shell to this list:
 * `open`, `done_now`, `next`, `nexts` and `types` were measured answered here and left on a held block, where `open: 2`
 * counted the open steps of a list the reader may not open.
 *
 * `said` IS THE MODEL'S HEADLINE on a lead block, put on it by the record after the read, so a lead read
 * back from the page with its line on it is not refused for a key the record wrote, and a held block keeps no line.
 */
export const ANSWER_KEYS: readonly string[] = [
  'drawn', 'rows', 'matched', 'readings', 'walk', 'walks', 'walkFx', 'refusals', 'inherited', 'scopes',
  'scope_marks', 'feed', 'seen', 'history', 'values', 'said', 'bars', 'measures', 'latest', 'past', 'changes', 'working_now',
  'quiet', 'lateness', 'late_name', 'sells', 'fx',
  'fills', 'rings', 'queue', 'nexts', 'trends', 'done_now', 'next', 'open', 'types', 'home',
  'short_now', 'window', 'files', 'lanes',
];

/**
 * Every key a block may be DECLARED with. An answer's keys are not among them: `{ kind: cards, next: what }` installed
 * clean and drew nothing, because `next` is what a steps block answers, not a word a block is written with.
 */
export const BLOCK_INSTALLS: ReadonlySet<string> = new Set([...GENERAL, ...Object.keys(READ_BY)]);

/** Every key a block may carry and the read will not refuse by name: what it is declared with, and what a read answered. */
export const BLOCK_READS: ReadonlySet<string> = new Set([...BLOCK_INSTALLS, ...ANSWER_KEYS]);

/** The keys a block of this kind may be declared with, for a refusal's `allowed`. */
export const keysFor = (kind: string): string[] => [...GENERAL, ...Object.keys(READ_BY).filter((k) => READ_BY[k]!.includes(kind))];

/** The kinds that read `key`, when only some do, registered kinds included. */
export const kindsReading = (key: string): readonly string[] | undefined => own(READ_BY, key);

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
    (ANSWER_KEYS.includes(key)
      ? 'It is what a read answers, and a block is not declared with it. Take it off.'
      : 'Take it off; the keys this kind reads are listed with this refusal.')
  }`;

/** What to do with a key read by other kinds than this one. */
const WRONG_KIND: Readonly<Record<string, string>> = {
  first: 'To draw fewer rows, write limit: instead.',
  lead: 'Take it off, or draw these rows as cards.',
  fold: 'Put a section before this block and fold the section.',
  group: 'Draw these rows as cards to group them by a link field.',
  box: 'Put a section before this block and give the section box: true.',
  register: 'A block that reads rows names them with source: register.<id>.',
};

/** The sentence for a key this kind does not read, naming the kinds that do. */
export function wrongKindKey(key: string, kind: string): string {
  const kinds = own(READ_BY, key) ?? [];
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
 * new. `filters` is read now: the reader's own choices over every block (`pages.ts` `readPage`). `header` is in the
 * table and refused apart, below, because nothing draws it.
 */
export const PAGE_KEYS: ReadonlySet<string> = new Set([
  'page', 'title', 'nav', 'icon', 'requires', 'blocks', 'for', 'pack', 'origin', 'derived_from', 'placed', 'tone', 'layout',
  'filters',
]);

/** Published in `06 §1.1` and read by nothing in this build, so the repair is a deploy rather than an edit. */
export const PAGE_UNBUILT: ReadonlySet<string> = new Set(['header']);

/** How a reader filter is drawn: a row of chips, or one segmented control for a field of a few values. */
export const FILTER_CONTROLS = ['chips', 'segmented'] as const;

/** The field types a reader filter offers values of: each holds one value a person can pick by name. */
export const FILTER_TYPES: ReadonlySet<string> = new Set(['enum', 'ref', 'bool', 'text']);

/** The most reader filters one page declares. Past four the strip is a form. */
export const FILTERS_MOST = 4;

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

/* ── a block's key ───────────────────────────────────────────────────────── */

/**
 * What a declared `key:` looks like: lower-case letters, digits, `_` and `-`, starting with a letter. No `{{`, so a
 * template's fill never touches one, and short, because it is a handle and never words a person reads.
 */
export const BLOCK_KEY = /^[a-z][a-z0-9_-]{0,47}$/u;

/**
 * 32-bit FNV-1a over the UTF-16 units of `text`, in base 36. Not a digest: two blocks on one page that hash alike are
 * told apart by `keyedBlocks`, so all this needs is to be quick, synchronous and the same on every host. A look's
 * `basis` is one too (`compose.ts`).
 */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/** Whether a block declares a key this record reads: a string of `BLOCK_KEY`'s shape. */
const declaredKey = (block: unknown): string | null => {
  const key = block !== null && typeof block === 'object' ? (block as { key?: unknown }).key : undefined;
  return typeof key === 'string' && BLOCK_KEY.test(key) ? key : null;
};

/**
 * THE KEY A BLOCK HAS WHEN IT DECLARES NONE: a hash of its kind, its source and its heading, as written.
 *
 * THOSE THREE AND NOTHING ELSE, because they are what a person means by "that block": the same list under the same
 * heading is the same block after its columns, its limit or its `where:` change, and a look that pinned it still holds.
 * A template's block is keyed before its row fills it (`resolvePages`), so every project's page answers one key for
 * "Steps" and one look covers them all.
 */
export function defaultBlockKey(block: unknown): string {
  const b = block !== null && typeof block === 'object' ? (block as { kind?: unknown; source?: unknown; heading?: unknown }) : {};
  const part = (v: unknown): string => (typeof v === 'string' ? v : '');
  return `k${shortHash(JSON.stringify([part(b.kind), part(b.source), part(b.heading)]))}`;
}

/** A block's key: the one it declares, or its default. Two blocks of one page may share it; `keyedBlocks` parts them. */
export const blockKeyOf = (block: unknown): string => declaredKey(block) ?? defaultBlockKey(block);

/**
 * THE PAGE'S BLOCKS, EACH WITH A KEY NO OTHER BLOCK OF IT HAS.
 *
 * DECLARED KEYS ARE TAKEN FIRST, so a default never takes a key an author wrote further down the page. Then each block
 * in order takes its own, and a second block of one kind, source and heading (two notes with neither, say) takes it with
 * `-2`, the third `-3`, so the parting follows the declared order and a look that reorders the page does not move it.
 * `taken` is the keys already given out on this page, so the blocks other packs add are parted from the page's own.
 */
export function keyedBlocks<T>(blocks: readonly T[], taken: Set<string> = new Set()): (T & { key: string })[] {
  const declared = new Set<string>();
  for (const b of blocks) {
    const key = declaredKey(b);
    if (key !== null && !taken.has(key)) declared.add(key);
  }
  const given = new Set<string>();
  return blocks.map((b) => {
    if (b === null || typeof b !== 'object') return b as T & { key: string };
    const own = declaredKey(b);
    let key = own ?? defaultBlockKey(b);
    if (given.has(key) || taken.has(key) || (key !== own && declared.has(key))) {
      const base = key;
      for (let n = 2; given.has(key) || taken.has(key) || declared.has(key); n += 1) key = `${base}-${n}`;
    }
    given.add(key);
    taken.add(key);
    return { ...b, key };
  });
}
