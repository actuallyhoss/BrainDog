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
import { ACTION_VERBS, BLOCK_VERBS, actionsBody, type ActionKey, type DeclaredAction } from './row-actions.ts';

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
  'tone', 'body', 'when', 'opening', 'from', 'horizon', 'inherit', 'working', 'area', 'icon', 'key', 'actions',
] as const;

/**
 * The keys only some kinds read, and which. A key here on any other kind is refused, at install and at read.
 *
 * EACH ROW IS WHAT THE CODE READS, not what a document hoped. `lead` is the hero figure of a `stat`, the one bigger card
 * of a `cards` block, the opening sentence of a `note` and a `queue`'s first question drawn whole, with what accepting
 * it does; `first` cuts a `feed`'s or an `agents` block's groups and
 * a `steps` block's open rows; `range` draws a `progress` block's rows as bands; `box` puts the blocks after a `section`
 * on one surface, and a `cards` block's `fold` is how many cards each of its `group`s shows before the rest fold; a
 * `cards` or a `table` block's `group` is a link, a choice or the state of its list, a heading each value; a
 * `feed`'s `group` is `day`, a heading each day, and its `fold` is `run`, one line a run (`feedSaysFault`); `tiles` draws a `queue` as tiles; `who` draws a `heat` as a line a person, columns `day | who`; `register` is the list a `capture` adds to and an `inputs` block
 * edits; `row` is a `diff`'s row and an `inputs` block's; `axis` is where a `forecast`'s value axis starts, `fit` or
 * `zero` (`forecastAxisFault`).
 *
 * LEFT GENERAL ON PURPOSE: `opening`, `from` and `horizon` are read by whatever kind sits over `forecast.runway`, and a
 * `table` over it is written in the app's own tests; `cells` turns any block into figures; `target`, `inherit`,
 * `working` and `when` are read over any register. Narrowing one of those would refuse a page the read draws.
 *
 * THESE ARE THE KINDS `pages.ts` READS ITSELF. A kind in the registry names its own keys on its module, and
 * `READ_BY` below is this table with those added, so a registered kind's key is never written in two places. Ask
 * `kindsReading`, which reads both, rather than this table.
 */
/*
 * `actions` IS GENERAL AND `row_actions` IS NOT (PGS-A12): any block may offer a press of its own, such as Add one, and
 * only a block that draws rows has a row to press one on. A registered kind that draws rows names `row_actions` in its
 * own module's keys, as it names any key of its own, and joins these.
 */
const ROW_KINDS = ['table', 'cards', 'todo', 'board', 'steps', 'queue', 'roadmap', 'progress', 'timeline', 'feed'] as const;

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
  says: ['note'],
  fold: ['section', 'cards', 'feed'],
  most: ['cards', 'series'],
  group: ['cards', 'table', 'feed'],
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
  axis: ['forecast'],
  versions: ['diff'],
  field: ['diff'],
  row: ['diff', 'inputs'],
  about: ['table', 'cards', 'kpis'],
  of: ['ring', 'heat'],
  for: ['kpis'],
  row_actions: ROW_KINDS,
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
 *
 * `says_at` IS WHICH OF A NOTE'S `says:` SENTENCES WAS SAID, whose words the read wrote into `body` (`pages.ts`
 * `saidLine`). A note read back with both is read without the body it was answered, so it chooses again.
 */
export const ANSWER_KEYS: readonly string[] = [
  'drawn', 'rows', 'matched', 'readings', 'walk', 'walks', 'walkFx', 'refusals', 'inherited', 'scopes',
  'scope_marks', 'feed', 'seen', 'history', 'values', 'said', 'bars', 'measures', 'latest', 'past', 'changes', 'working_now',
  'quiet', 'presence', 'facts', 'lateness', 'late_name', 'sells', 'fx',
  'fills', 'rings', 'queue', 'nexts', 'trends', 'done_now', 'next', 'open', 'types', 'home',
  'short_now', 'window', 'files', 'lanes', 'wholeRead', 'read_as', 'says_at', 'kpis',
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
  group: 'Draw these rows as cards or a table to group them by a link, a choice or the state.',
  box: 'Put a section before this block and give the section box: true.',
  register: 'A block that reads rows names them with source: register.<id>.',
  says: 'Sentences that each hold under a condition are a note\'s: { kind: note, lead: true, says: [{ when, body }, { body }] }.',
};

/** What a `feed` may say in `group:` and in `fold:`, the one word each. */
export const FEED_GROUP = 'day' as const;
export const FEED_FOLD = 'run' as const;

/** What a feed may say, as the sentence every refusal about a feed's `group` or `fold` ends on. */
const FEED_SAYS = `a feed may say group: ${FEED_GROUP}, for a heading each day, and fold: ${FEED_FOLD}, for one line a run`;

/**
 * Why a `feed`'s `group` or `fold` cannot be drawn, or `null`. `who` is what the sentence calls the block.
 *
 * A FEED'S TWO WORDS ARE NOT A CARDS BLOCK'S. Cards group by a link field of their list and fold at a count; a feed
 * reads the record's events, which have no fields to link by, so it groups by the day a line was written and folds a
 * run's lines to its newest. One word each, so `group: week` or `fold: agent` is refused in a sentence that names
 * both rather than drawn as if nothing had been said. The install and the read both ask here.
 */
export function feedSaysFault(block: Readonly<Record<string, unknown>>, who: string): { fix: string; at: string; allowed: string[] } | null {
  if (block.group !== undefined && block.group !== FEED_GROUP)
    return { fix: `${who}'s group is ${JSON.stringify(block.group)}; ${FEED_SAYS}.`, at: 'group', allowed: [FEED_GROUP] };
  if (block.fold !== undefined && block.fold !== FEED_FOLD)
    return { fix: `${who}'s fold is ${JSON.stringify(block.fold)}; ${FEED_SAYS}.`, at: 'fold', allowed: [FEED_FOLD] };
  return null;
}

/**
 * Where a `forecast`'s value axis may start: `fit`, from a round step under the lowest balance, which is what a forecast
 * draws when it says nothing; or `zero`, from nought whatever the walk does.
 */
export const FORECAST_AXES = ['fit', 'zero'] as const;
export type ForecastAxis = (typeof FORECAST_AXES)[number];

/**
 * Why a `forecast`'s `axis` cannot be drawn, or `null`. `who` is what the sentence calls the block.
 *
 * ONE OF TWO WORDS, and anything else is refused rather than drawn fitted, so `axis: wide` does not install as if it had
 * been heard. The install and the read both ask here, as they ask `feedSaysFault`.
 */
export function forecastAxisFault(block: Readonly<Record<string, unknown>>, who: string): { fix: string; at: string; allowed: string[] } | null {
  if (block.axis === undefined || (FORECAST_AXES as readonly unknown[]).includes(block.axis)) return null;
  return {
    fix: `${who}'s axis is ${JSON.stringify(block.axis)}; a forecast's axis is fit, to start just under its lowest balance, or zero, to always start at nought.`,
    at: 'axis',
    allowed: [...FORECAST_AXES],
  };
}

/**
 * What a `kpis` block is for (`sources/kpis.ts`): one project's key numbers (`project`), the few that lead Today
 * (`today`), or the one number each project's card leads with (`cards`).
 */
export const KPIS_FOR = ['project', 'today', 'cards'] as const;
export type KpisFor = (typeof KPIS_FOR)[number];

/**
 * Why a `kpis` block cannot be read, or `null`. `who` is what the sentence calls the block.
 *
 * IT SAYS WHAT IT IS FOR, AND ITS SOURCE IS THE KEY NUMBERS. A block with no `for:` would have to guess between a
 * project's tile and Today's, and a `kpis` block over a list would draw that list's rows as numbers nobody declared.
 * `about:` names one project, so only a block for one project takes it. The install and the read both ask here.
 *
 * A BARE `kind: kpis` IS LEFT BE, as every kind's bare block installs (`declare.test.ts`, the closure): it names no
 * source, so it is a written block with nothing written, and draws nothing. One that says either half says both.
 */
export function kpisFault(block: Readonly<Record<string, unknown>>, who: string): { fix: string; at: string; allowed?: string[] } | null {
  if (block.source === undefined && block.for === undefined && block.about === undefined) return null;
  if (block.source !== 'kpis') return { fix: `${who} draws the key numbers, so its source is kpis.`, at: 'source', allowed: ['kpis'] };
  if (!(KPIS_FOR as readonly unknown[]).includes(block.for))
    return {
      fix: `${who}'s for is ${JSON.stringify(block.for ?? null)}; a kpis block is for project, one project's numbers, today, the few that lead Today, or cards, the one each project's card leads with.`,
      at: 'for',
      allowed: [...KPIS_FOR],
    };
  if (block.about !== undefined && (block.for !== 'project' || typeof block.about !== 'string' || block.about.trim() === ''))
    return { fix: `${who}'s about names the one project it is for, such as things#1, and only a block for: project takes it.`, at: 'about' };
  return null;
}

/* ── a block's `actions` and `row_actions` (PGS-A12) ───────────────────────────────────────────────────── */

/**
 * WHERE THE FIELDS ARE NOT KNOWN, EVERY NAME IS ONE: an arg is then checked for its shape and the verb it belongs to,
 * and its field is checked where the list is in hand. `actionsBody` asks only `has`.
 */
const ANY_FIELD: ReadonlySet<string> = new (class extends Set<string> {
  override has(): boolean {
    return true;
  }
})();

/** The verbs a row's actions may name: every verb but a block's own (`BLOCK_VERBS`). */
const ROW_ONLY: string[] = Object.keys(ACTION_VERBS).filter((verb) => !BLOCK_VERBS.has(verb));

/** A block's two lists of actions, each checked, or the first refusal of either. */
export type BlockActions = { actions?: DeclaredAction[]; row_actions?: DeclaredAction[] };

/**
 * A block's `actions` and `row_actions` checked and cleaned, or why not, in the shape `feedSaysFault` answers. `who` is
 * what the sentence calls the block, and `fields` the fields of its source or list, `null` where they are not known
 * here, so only the shape is checked. `actions` names block verbs only (`BLOCK_VERBS`), `row_actions` row verbs only.
 */
export function declaredActions(
  block: Readonly<Record<string, unknown>>,
  who: string,
  fields: ReadonlySet<string> | null,
): { ok: true; value: BlockActions } | { ok: false; fault: { fix: string; at: string; allowed?: string[] } } {
  const value: BlockActions = {};
  for (const key of ['actions', 'row_actions'] as const satisfies readonly ActionKey[]) {
    if (block[key] === undefined) continue;
    const read = actionsBody(block[key], { fields: fields ?? ANY_FIELD, key });
    if (!read.ok) {
      const r = 'refusal' in read ? read.refusal : null;
      const allowed = r?.allowed ? [...r.allowed] : undefined;
      return { ok: false, fault: { fix: `${who}'s ${r?.fix ?? `${key} cannot be read.`}`, at: r?.at ?? key, ...(allowed ? { allowed } : {}) } };
    }
    if (key === 'row_actions') {
      const blockVerb = read.value.findIndex((a) => BLOCK_VERBS.has(a.verb));
      if (blockVerb >= 0) {
        const a = read.value[blockVerb]!;
        return {
          ok: false,
          fault: { fix: `${who}'s row_actions[${blockVerb}] (${a.label})'s verb ${a.verb} acts on no row, so it goes under actions, not row_actions.`, at: `row_actions[${blockVerb}].verb`, allowed: ROW_ONLY },
        };
      }
    }
    value[key] = read.value;
  }
  return { ok: true, value };
}

/** Why a block's `actions` or `row_actions` cannot be offered, or `null` (`declaredActions`). The install and the read both ask. */
export function actionsFault(block: Readonly<Record<string, unknown>>, who: string, fields: ReadonlySet<string> | null): { fix: string; at: string; allowed?: string[] } | null {
  const read = declaredActions(block, who, fields);
  return read.ok ? null : read.fault;
}

/* ── a `when:` tree, and a note's `says:` (PGS-A13) ──────────────────────────────────────────────────────── */

/** The two ways a `when:` joins its tests: `all`, every one holds, and `any`, at least one does. */
export const WHEN_JOINS = ['all', 'any'] as const;

/** How deep a `when:` goes: a join, and inside it leaves or one other join of leaves. Deeper is refused. */
export const WHEN_DEPTH = 2;

/** What is wrong with one leaf of a `when:`, as a sentence, or `null`. `said` names the leaf. */
export type WhenLeafFault = (leaf: unknown, said: string) => string | null;

/**
 * WHO READS THE PAGE (PGS-A17): its owner, a member signed in, an agent on a token, or somebody holding a link. A leaf
 * `{ reader: owner }` or `{ reader: [owner, member] }` holds while the reader is one of them, so a block can be shown to
 * its owner alone. A host that does not say who reads is shown no block that asks (`pages.ts` `leafHolds`).
 */
export const WHEN_READERS = ['owner', 'member', 'agent', 'link'] as const;
export type WhenReader = (typeof WHEN_READERS)[number];

/** Whether a leaf of a `when:` is one about who reads rather than a figure: it says `reader`. */
export const isReaderLeaf = (leaf: unknown): leaf is { reader: WhenReader | WhenReader[] } =>
  leaf !== null && typeof leaf === 'object' && !Array.isArray(leaf) && Object.hasOwn(leaf, 'reader');

/**
 * What is wrong with a leaf about who reads, or `null`: one of the four words, or a list of them, and nothing beside.
 * ASKED BY `whenTreeFault` BEFORE THE CALLER'S OWN LEAF CHECK, so the install's fuller check (`declare.ts`) and the
 * read's both admit it without each knowing the words.
 */
export function readerLeafFault(leaf: { reader: unknown }, said: string): string | null {
  const words = Array.isArray(leaf.reader) ? leaf.reader : [leaf.reader];
  const four = 'owner, member, agent or link';
  if (words.length === 0) return `${said} names no reader. A reader is ${four}: { reader: owner }.`;
  const odd = words.find((w) => !(WHEN_READERS as readonly unknown[]).includes(w));
  if (odd !== undefined) return `${said} says reader: ${JSON.stringify(odd)}, and a reader is ${four}.`;
  const beside = Object.keys(leaf).filter((k) => k !== 'reader');
  if (beside.length > 0)
    return `${said} says reader and ${beside.join(' and ')}. Who reads is the whole leaf, so a figure is a leaf of its own: { all: [{ reader: owner }, { metric, ... }] }.`;
  return null;
}

/** The leaf check when the caller has no fuller one: a leaf names its figure. The install hands `declare.ts`'s own. */
const leafNamed: WhenLeafFault = (leaf, said) =>
  isReaderLeaf(leaf)
    ? readerLeafFault(leaf, said)
    : leaf !== null && typeof leaf === 'object' && typeof (leaf as { metric?: unknown }).metric === 'string'
      ? null
      : `${said} is one leaf naming a metric, or one saying who reads: { reader: owner }.`;

/** The join a `when:` part says, `all` or `any`, or `null` for a leaf. Both is `both`, which is refused. */
export function whenJoin(when: unknown): 'all' | 'any' | 'both' | null {
  if (when === null || typeof when !== 'object') return null;
  const all = Object.hasOwn(when, 'all');
  const any = Object.hasOwn(when, 'any');
  return all && any ? 'both' : all ? 'all' : any ? 'any' : null;
}

/**
 * What is wrong with a `when:`, or `null`: one leaf, or `all:` or `any:` of two or more, each a leaf or one join of
 * leaves. `said` is how the refusal names it ("page.cash.blocks[0]'s when"), and a part inside it is named by its place
 * ("…'s when any[1]"). The install and the read both ask here, the install with its fuller leaf check.
 *
 * TWO LEVELS AND NO MORE, because "three questions wait, or an agent is stuck and a run failed" is a sentence a person
 * can hold and a third level is not. A join inside the same join says nothing the outer one does not, so it is refused
 * with the flat way to write it; one join of one leaf is the leaf written the long way.
 */
export function whenTreeFault(when: unknown, said: string, leafFault: WhenLeafFault = leafNamed, depth = 1): string | null {
  const join = whenJoin(when);
  if (join === null) return isReaderLeaf(when) ? readerLeafFault(when, said) : leafFault(when, said);
  if (join === 'both') return `${said} says all and any. A when is one of them, and the other goes inside it: { any: [{ all: [leaf, leaf] }, leaf] }.`;
  const list = (when as Record<string, unknown>)[join];
  const beside = Object.keys(when as object).filter((k) => k !== join);
  if (beside.length > 0) return `${said} says ${join} and ${beside.join(' and ')}. ${join} is the whole when, so move ${beside.length > 1 ? 'them' : 'it'} into a leaf: { ${join}: [{ metric, ... }, { metric, ... }] }.`;
  const holds = join === 'all' ? 'that must every one hold' : 'of which one must hold';
  if (!Array.isArray(list) || list.length < 2)
    return `${said} has an ${join} of ${Array.isArray(list) ? (list.length === 1 ? 'one leaf' : 'no leaves') : JSON.stringify(list ?? null)}, and ${join} is two or more leaves ${holds}. Write one test as the leaf alone, when: { metric, ... }.`;
  for (const [i, item] of list.entries()) {
    const inner = whenJoin(item);
    if (inner === join)
      return `${said} ${join}[${i}] is an ${join} inside an ${join}. ${join === 'all' ? 'Every leaf must hold' : 'One leaf holding is enough'} either way, so write them as one ${join}: { ${join}: [leaf, leaf, leaf] }.`;
    if (inner !== null && depth >= WHEN_DEPTH)
      return `${said} ${join}[${i}] is a third level, and a when is ${WHEN_DEPTH} levels deep at most: { any: [{ all: [leaf, leaf] }, leaf] }.`;
    const fault = whenTreeFault(item, `${said} ${join}[${i}]`, leafFault, depth + 1);
    if (fault) return fault;
  }
  return null;
}

/** The most sentences a note's `says:` holds. Past six it is a rule table, not a page's opening line. */
export const SAYS_MOST = 6;

/** The tones a said sentence may carry: `declare.ts`'s intents, the same four a note's own `tone` takes. */
export const SAYS_TONES = ['good', 'warn', 'bad', 'info'] as const;

/** The keys of one sentence of `says:`. */
const SAYS_LINE_KEYS: ReadonlySet<string> = new Set(['when', 'body', 'tone']);

/**
 * Why a note's `says:` cannot be said, or `null`. `who` is what the sentence calls the block.
 *
 * READ TOP TO BOTTOM, THE FIRST THAT HOLDS IS THE BODY, so the order is the author's ranking: "3 questions wait for you"
 * above "Nothing needs you". THE LAST HAS NO `when`, because it is what the page says on a day nothing else holds, and a
 * note whose every sentence could fail would open the page on nothing. A sentence with no `when` above the last would be
 * said every time and hide the rest, so it is refused too. A note with `body:` beside `says:` says two things where it
 * means one: the body is the calm line, written last. The install and the read both ask here.
 */
export function noteSaysFault(block: Readonly<Record<string, unknown>>, who: string, leafFault: WhenLeafFault = leafNamed): { fix: string; at: string; allowed?: string[] } | null {
  const says = block.says;
  if (says === undefined) return null;
  const shape = 'says: [{ when: { metric, gt: 0 }, body }, { body }]';
  if (block.body !== undefined)
    return { fix: `${who} has both a body and says. The first sentence of says that holds is its body, so take body off and write it as the last sentence: ${shape}.`, at: 'says' };
  if (!Array.isArray(says) || says.length === 0 || says.length > SAYS_MOST)
    return { fix: `${who}'s says is 1 to ${SAYS_MOST} sentences, read top to bottom, the last with no when: ${shape}.`, at: 'says' };
  for (const [i, line] of says.entries()) {
    const at = `says[${i}]`;
    const named = `${who}'s sentence ${i + 1}`;
    if (line === null || typeof line !== 'object' || Array.isArray(line)) return { fix: `${named} is not one sentence. Each is { when, body, tone }.`, at };
    const s = line as { when?: unknown; body?: unknown; tone?: unknown };
    const extra = Object.keys(s).filter((k) => !SAYS_LINE_KEYS.has(k));
    if (extra.length > 0) return { fix: `${named} says ${extra.join(' and ')}, and a sentence has a when, a body and a tone only.`, at: `${at}.${extra[0]}`, allowed: [...SAYS_LINE_KEYS] };
    if (typeof s.body !== 'string' || s.body.trim() === '') return { fix: `${named} has no words. Write them as its body: { when, body }.`, at: `${at}.body` };
    if (s.tone !== undefined && !(SAYS_TONES as readonly unknown[]).includes(s.tone))
      return { fix: `${named} has the tone ${JSON.stringify(s.tone)}, and a tone is good, warn, bad or info.`, at: `${at}.tone`, allowed: [...SAYS_TONES] };
    const last = i === says.length - 1;
    if (last && s.when !== undefined)
      return { fix: `${who}'s last sentence has a when, so on a day none holds the note says nothing. Take the when off the last one: it is the calm line.`, at: `${at}.when` };
    if (!last && s.when === undefined)
      return { fix: `${named} has no when, so it is said every time and the sentences after it never are. Give it a when, or make it the last.`, at };
    if (!last) {
      const fault = whenTreeFault(s.when, `${named}'s when`, leafFault);
      if (fault) return { fix: fault, at: `${at}.when` };
    }
  }
  return null;
}

/** The sentence for a key this kind does not read, naming the kinds that do. */
export function wrongKindKey(key: string, kind: string): string {
  /* AN `agents` BLOCK IS A FEED'S NEIGHBOUR, one group an agent, so the nearest true thing to say is what a feed may. */
  if (kind === 'agents' && (key === 'group' || key === 'fold'))
    return `${key}: is read by a feed, and an agents block does nothing with it: ${FEED_SAYS}. Take it off, or draw these lines as a feed.`;
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
 * new. `filters` is read now: the reader's own choices over every block (`pages.ts` `readPage`). `header` is the head
 * over the title, checked by `page-head.ts` at install and resolved by the read.
 */
export const PAGE_KEYS: ReadonlySet<string> = new Set([
  'page', 'title', 'nav', 'icon', 'requires', 'blocks', 'for', 'pack', 'origin', 'derived_from', 'placed', 'tone', 'layout',
  'filters', 'header',
]);

/** Published in `06 §1.1` and read by nothing in this build, so the repair is a deploy rather than an edit. None now. */
export const PAGE_UNBUILT: ReadonlySet<string> = new Set<string>([]);

/** How a reader filter is drawn: a row of chips, or one segmented control for a field of a few values. */
export const FILTER_CONTROLS = ['chips', 'segmented'] as const;

/** The field types a reader filter offers values of: each holds one value a person can pick by name. */
export const FILTER_TYPES: ReadonlySet<string> = new Set(['enum', 'ref', 'bool', 'text']);

/** The most reader filters one page declares. Past four the strip is a form. */
export const FILTERS_MOST = 4;

/** The keys of `nav`. `tabs: true` draws every page of the section as a strip of tabs over each of them. */
export const NAV_KEYS: ReadonlySet<string> = new Set(['section', 'order', 'place', 'icon', 'tabs']);

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
