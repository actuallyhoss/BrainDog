/**
 * A list's words: the grid on `/r`, its search, filters, sort and selection, the capture line, a row's own page,
 * the row form, and a saved view on `/v`.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { article, list } from './english.ts';

/**
 * THE LETTERS WHOSE NAMES ARE SAID WITH A VOWEL FIRST: "an HSBC card", "an SMS", "an FX trade", "an NHS letter". `U` is
 * "you" and takes `a`, so it is not here.
 */
const VOWEL_NAMED = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);

/** A word in capitals: two letters or more and no small one, so "HSBC" and "SMS" and never "I". */
const ALL_CAPS = /^[A-Z][A-Z0-9&]+$/u;

/**
 * `a` or `an` before a noun as it will be printed. A WORD IN CAPITALS IS SAID LETTER BY LETTER when its first two
 * letters are not a sound ("HSBC", "SMS", "UK") and the article follows the first letter's name; one that opens on a
 * syllable ("SIM", "PIN", "ISA") is said as a word and takes the word's article. Any other noun is `article`'s.
 */
const articleFor = (noun: string): string => {
  const first = noun.trim().split(/\s+/u)[0] ?? '';
  if (!ALL_CAPS.test(first)) return article(noun);
  /* A CAPITAL U IS "YOU" WHETHER SPELLED OR SAID: "a URL", "a USB stick", "a UNICEF grant", never "an". */
  if (first.startsWith('U')) return 'a';
  const spelled = first.length < 3 || !/^[^AEIOU]?[AEIOU]/u.test(first);
  return spelled ? (VOWEL_NAMED.has(first.charAt(0)) ? 'an' : 'a') : article(first.toLowerCase());
};

/**
 * A list's `one:` AS IT GOES MID-SENTENCE. A word in capitals or with a capital inside it is a name ("HSBC", "GitHub")
 * and keeps its case wherever it stands, as does any capitalised word after the first, which an author only types for
 * a name. The first word alone is lowered when it is capitalised the way a sentence opens ("Item", "Bank card"), since
 * a declaration is often typed that way and "Add a Bank card" reads as a typo.
 */
const midSentence = (one: string): string =>
  one
    .trim()
    .split(/(\s+)/u)
    .map((w, i) => (i === 0 && /^\p{Lu}[\p{Ll}\d'’-]*$/u.test(w) ? w.toLowerCase() : w))
    .join('');

export const lists = {
  rowActions: 'Actions',
  /* A LIST THAT SAYS WHO HOLDS ITS ROWS (`hand:`) offers this view over its own, filtered to what is handed to you. */
  handedToMe: 'Handed to me',
  editValue: (field: string) => `Change ${field.toLowerCase()}`,
  /* WHY THIS CELL IS NOT THE EDITOR, said when somebody asks for it rather than only drawn.
     The pencil appears on an editable cell and on no other, which answers the question for anybody
     looking at that cell with a pointer. `e` is a keyboard binding on a sheet that advertises it
     for every cell, so pressing it on a money or a ref did nothing at all and said nothing: the
     silence a bound key is never allowed to answer with (19 §4). */
  /* SAID WITHOUT SENDING ANYBODY ANYWHERE. This was "Open the row to change it", which was true while the row page
     edited types the grid did not. The two now ask the same `editable` (`field-draft.ts`), so a cell the grid refuses
     is a field the row refuses too, and a sentence sending the reader there sent them to a second refusal. */
  cellNotEdited: (field: string, why: string) => `${field} is ${why}, so it cannot be changed here.`,
  /* ONE REASON PER TYPE THE GRID REFUSES, AND ONLY THOSE. The first version gave two reasons for six types, so `e`
     on an update's `When` answered *When is a row in another list*, which was not true of an instant: a wrong sentence
     is worse than the silence it replaced, because silence is not a claim. The grid then learnt to edit money, ref,
     document, instant, duration, yes or no and, once the file store existed, a file too, and their reasons
     stayed behind as sentences explaining a refusal that no longer happens. What is left is what `editable` answers
     no to, a secret alone, which `field-draft.test.ts` holds equal. */
  cellWhy: {
    secret: 'held by the Keychain and never drawn in full',
  } as Record<string, string | undefined>,
  /* FOR A REFUSED TYPE `cellWhy` DOES NOT NAME. Every type `editable` refuses today is named above, so this is said
     only if that list grows and this one does not, and it is written to be true of any value a box cannot hold. */
  cellWhyElse: 'a kind of value no box here holds',
  /* AND A COLUMN THAT IS NOT A FIELD AT ALL. The picker and the row's verbs are controls rather
     than values, and `e` on one of them did nothing and said nothing: `19 §4` is that the sheet
     documents the bindings by reading them, so a key it prints for the grid has to answer wherever
     the caret is. It became reachable the day clicking a cell started moving the caret to it. */
  cellNoValue: 'Nothing to change in this column.',
  setTo: (state: string) => `Set to ${state}`,
  markArchived: 'Archived',
  undoRow: 'Put back',
  /* WHAT A ROW IS CALLED WHEN IT HAS NO NAME YET. `undoRowOf` puts the row's title in the control's
     accessible name, and a row typed into the capture line has a title only if the capture WAS the
     title; the grid falls back to `#<seq>`, which for a pending row is the negative sentinel. */
  thisRow: 'this one',
  undoRowOf: (row: string) => `Put ${row} back`,
  archiveRow: (row: string) => `Archive ${row}`,
  moreOn: (row: string) => `More on ${row}`,

  /* The capture line: one field at the top of a register, and the only decision in it is the words.
     IT SPELT THE ARTICLE ITSELF and got it wrong on two of the nine registers the seed ships. AND IT LOWERED A NAME:
     a list of cards one bank issues said "Add a hsbc card", where a person writes "Add an HSBC card". */
  captureIn: (one: string) => {
    const said = midSentence(one);
    return `Add ${articleFor(said)} ${said}`;
  },
  captureAdd: 'Add',

  /* the register grid */
  /* A NAME FOR THE SEARCH BOX. It had only a placeholder, which is not an accessible name and
     disappears the moment somebody types — so the field announced itself right up until it had
     content, and then stopped. */
  searchIn: (name: string) => `Search ${name}`,
  done: 'Done',
  noneChosen: 'None',
  yes: 'Yes',
  secretsLiveInTheKeychain: 'Passwords and keys go in the Keychain. This records what one opens.',
  /* The few words beside a move a row's panel offers, said before it is pressed (`ui/row-form-moves.ts`). */
  moveNeedsReason: 'needs a reason',
  moveNeeds: (label: string): string => `needs ${label.toLowerCase()}`,
  moveAsksDecide: 'goes to Needs you',
  /* A field the form does not draw has no label there, and an id is never the word. */
  anotherField: 'another field',
  /* THE SAME ANSWER `/decide` GIVES TO THE SAME QUESTION. A disabled control says why it is
     disabled, and the register's own declaration is what says which fields cannot be left out — so
     the line names them rather than saying "some fields", in as few words as that takes. */
  rowRequired: (names: string[]): string =>
    `${list(names)} needed.`,
  /* AND IT POINTS RATHER THAN REPEATS. A money field already prints its own sentence under itself;
     copying that sentence into the footer put the same words on screen twice, six inches apart —
     which is the thing `/decide` was just fixed for. This one names the field and says where the
     reason is. */
  rowFieldProblem: (names: string[]): string =>
    `${list(names)} ${names.length === 1 ? 'needs' : 'need'} a fix, see under the field.`,
  /* `noFilters` WAS HERE, READING "Nothing here can be filtered yet." IT HAD NO SURFACE AND WANTS
     NONE. The bar is drawn at eight rows (`r/[register]/+page.svelte:2195`, `ENOUGH_TO_SIFT`), and
     what it always carries is the search box and Display; the pills come from the declared enums a
     reader can sift on, so a list that declares none simply has none. A line announcing that is the
     interface explaining itself, which is the rule at the top of `copy.ts`. */
  /* THE FILTERS WITH NO NUMBERS ON THEM, said in one line under the bar. The record would not count the list for this
     person (`countsWithheld`) or the count did not come back (`countsUnread`); either way the pills print no figure,
     since a 0 over a list that opens full is a count nobody can trust. The filters themselves still work. */
  countsWithheld: 'Counts are hidden for you.',
  countsUnread: 'Counts could not be read.',
  /**
   * WHAT THE SEARCH BOX READS, SAID WHERE A SEARCH HAS FOUND NOTHING, because that is where somebody
   * is when it matters. It was also said under the bar on every visit, which is a screen explaining
   * its own interface to somebody who had not asked; an empty answer is the moment they have.
   *
   * The box is `34 §6`'s `matches` operator over the register's `search:` fields, which is narrower
   * than the scan it replaced — rightly, per `fts.ts` (*"an index over everything answers every query
   * with everything"*), and at a cost: an amount, a state word or a counterparty's name that used to
   * find rows now finds none. Enum words are recoverable from the chips in the same bar. A REF is
   * not: `party` and `thing` have no chip and no other text surface, so *"38 rows, none matching:
   * halden"* over a list where nine rows are Halden's is a dead end unless the screen says where the
   * words it does read come from.
   */
  searchesOnly: (fields: string[]): string => `Searches ${list(fields)} only. Use the filters for the rest.`,

  /* `displayOptions` SAT ON THIS LINE HOLDING THE WORD BELOW IT. One string, two keys, and the
     screen reads the second: `display` is the bar's button and the title of the sheet it opens
     (`r/[register]/+page.svelte:2329` and `:2938`). `dead-copy` excused it as a menu that names its
     sections directly, which is true of the menu and was never what the key was waiting for. */
  display: 'Display',
  columns: 'Columns',
  always: 'always',
  showAll: 'Show every column',
  rowMenu: 'More actions',
  archive: 'Archive it',
  selected: 'selected',
  clear: 'Clear the selection',
  /* The picker's two labels, written out rather than built by concatenation — the screenshot
     allow-list only keeps text a developer typed into source. */
  /* WHAT THE LIST IS ORDERED BY. It lives beside the column list because both are answers to
     "what am I looking at", and on a phone this sheet is the only place either can be asked. */
  sortedBy: 'Sorted by',
  /* A DIRECTION IN THE FIELD'S OWN WORDS. An arrow on a column header sits on the thing it orders
     and needs no more; a chip in a sheet is read alone, and nobody calls an ascending date "lowest
     first". Six words rather than two, because a date, a number and a name each have their own. */
  oldestFirst: 'oldest first',
  newestFirst: 'newest first',
  lowestFirst: 'lowest first',
  highestFirst: 'highest first',
  aToZ: 'A to Z',
  zToA: 'Z to A',
  firstAdded: 'first added',
  lastAdded: 'last added',
  matching: 'matching',
  /**
   * A SAVED VIEW'S FILTER, AS THE SENTENCE A PERSON WOULD SAY.
   *
   * `/v/obligations.overdue` printed `state is open or part, due before today` in the id face on a
   * grey chip: the `where` dialect, with the field ids `state` and `due`, over a list whose own
   * columns call them Status and Due. The dialect is what an agent reads, and it stays on the
   * control that hands one over; this is the reading line.
   *
   * TWO FUNCTIONS, ONE CLAUSE AND ONE SENTENCE, because `access.test.ts` renders every function in
   * `copy` with a handful of argument shapes and counts one that renders under none of them as a
   * sentence nobody checked. A single function over an array of clause objects was that sentence.
   *
   * `filterClause` takes the field's label, not its id: the caller knows the register.
   *
   * `has` AND `lacks` ARE THE TWO WORDS A LIST TAKES, AND BOTH CAME OUT AS `is`. A view saved on
   * `repos:lacks:portage` read "Repositories is portage", the opposite of the filter its rows were
   * drawn under, and `repos:has:portage` read that same line, an equality over a test for
   * membership. Measured against the compiler the chips actually run on, the line was worse than
   * the wrong words: `Repositories is portage` comes back "repos is a list, which cannot be asked
   * is", so the sentence on screen was one the record refuses by name. The four operators this
   * function knew were the four `whereOf` knew before the same two words were added to it, which is
   * why they were missing together and why `filter-clause.test.ts` now round-trips every clause
   * this function prints back through `compile`.
   *
   * ONE VALUE FOR THOSE TWO, and that is the grammar's rule rather than a narrowing chosen here.
   * The operator looks for a single element inside a list, so `whereOf` sends `values[0]` and
   * `where.ts` types the clause `values: [string]`. Joining the rest on ` or ` would print a
   * sentence that compiles clean and looks for an element literally called `urgent or soon`.
   */
  filterClause: (label: string, values: readonly string[], op = 'in'): string =>
    op === 'before' || op === 'after'
      ? `${label} ${op} ${values.join(' or ')}`
      : op === 'has' || op === 'lacks'
        ? `${label} ${op} ${values[0] ?? ''}`
        : `${label} is ${op === 'not-in' ? 'not ' : ''}${values.join(' or ')}`,
  /* Every clause after the first starts lower-case when it starts with an ordinary word, so "Due"
     joins the sentence and "VAT number" keeps its capitals. */
  filterReads: (clauses: readonly string[], join: 'and' | 'or' = 'and'): string => {
    const said = clauses.map((c, i) => (i > 0 && /^[A-Z][a-z]/.test(c) ? c.charAt(0).toLowerCase() + c.slice(1) : c));
    return said.length < 2 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')}, ${join} ${said.at(-1) ?? ''}`;
  },
  backToView: 'Back to the saved view',
  rowsWord: (n: number) => (n === 1 ? 'item' : 'items'),
  select: 'Select',
  deselect: 'Deselect',
  /* THE VERBS A SELECTION IS FOR. A selection with nothing to do with it is a mode you can enter
     and not leave usefully, which is what this one was: implemented, drawn, and consumed by
     nothing. Verb + Noun, like every other action here. */
  copyIds: 'Copy references',
  /* THE REGISTER'S OWN WORD FOR ITS OWN COLUMN. `things` labels its state field **Status**, so a
     hardcoded "Set state" put one field's three names on one screen — `lane` in the schema, Status
     in the header, state on the verb, two of them visible at once. The menu's VALUES already come
     from the declaration, which is why they were right; only the verb was typed. It is wrong the
     first time anybody labels theirs, which is exactly what a pack author does. */
  setState: (field: string) => `Set ${field.toLowerCase()}`,
  archiveSelected: 'Archive them',
  saveAsView: 'Save as a view',
  /* `Preview` AND IT WAS `Peek`. It is printed as a keyboard hint on every list, `p peek`, which is
     a word the product invented for a thing every other product calls a preview. It opens the panel a
     row is read and changed in (`page/RowPanel.svelte`). */
  peek: 'Preview',
  /** Said when a key would move that panel off something typed and not saved. */
  rowUnsaved: 'Save or close the panel first.',
  openRow: 'Open',
  copyId: 'Copy reference',
  copyLink: 'Copy link',
  includesExample: 'includes 1 example',
  /* `example`, THE BARE LOWER-CASE WORD, IS THE RECORD'S AND NOT THIS FILE'S. It is the tag a seeded
     row carries in its `tags` field, declared once in `record/tags.ts` as `EXAMPLE`, and it reaches
     a reader from the record rather than from here: `shownTags` keeps it on a plain example row and
     the row page draws the list through `listLine` (`r/[register]/[seq]/+page.svelte`). Held here as
     well, the bare word was a second name for a value the record defines, which is how the chip and
     the data drift apart. `dead-copy` excused it as the chip that mark would render. */
  stale: 'Stale',
  /** Over a search this device answered from the list it keeps, until the record's own answer lands. */
  foundHere: 'Found on this device. Checking BrainDog.',
  /* A ROW IS NAMED BY ITS NUMBER, and "no obligation CALLED #9999" is not English. `19 §642`: a row
     "has a number you can say" — so the sentence says it the way somebody would. */
  noSuchNumber: (one: string, seq: number | string) => `There is no ${one} numbered ${seq}`,
  /* Row writes (lane A) */
  writeConflict: (row: string) => `${row} changed elsewhere. Check the latest and try again.`,
  writeMarkSaved: 'Saved',
  writeBulk: (landed: number, total: number, state: string) =>
    landed === total ? `${total} ${total === 1 ? 'item' : 'items'} set to ${state}.` : `${landed} of ${total} set to ${state}.`,
  writeArchivedSome: (landed: number, total: number) => `${landed} of ${total} archived.`,
  writeMarkRestored: 'Restored',
  viewEmpty: 'Nothing matches this view yet.',
  viewTitle: (list: string, reads: string) => `${list}: ${reads}`,
  viewSaved: (title: string) => `Saved ${title} under Views.`,
  viewNeedsFilter: 'Filter or search first.',
  /* Lane I */
  /**
   * EDITING A ROW WHERE IT IS READ, which is the half this screen did not have.
   *
   * The page could show every field and change none of them: the one control in the header opened a
   * toast saying the row "would open for editing". A detail screen that cannot edit is a report, and
   * the product's own answer to "change any of it" was on the list behind it, a screen away from the
   * row a person is looking at.
   *
   * ONE FIELD AT A TIME, so what is saved is what was changed: a form over eight fields sends eight
   * values and a `version`, and the seven nobody touched are seven chances to overwrite somebody
   * else's write with what was on screen when the page was opened.
   */
  /* `editValue` IS ALREADY HERE, as "Change <field>", and it says what this control does. A second
     spelling of one sentence is the drift a copy file exists to prevent. */
  editSave: 'Save',
  /* A SAVE THAT CHANGES NOTHING IS NOT A WRITE. Sending it would put a line in the row's history
     saying a field went from a value to the same value, which is a fact about a press, not the row. */
  editNoChange: 'Nothing was changed.',
  /* Archive and put back, on the row itself, in the words the list already uses for the same verb. */
  rowArchive: 'Archive',
  /* A ROW ITS MAKER KEEPS TO THEMSELVES: the menu's two verbs, the lock's label and the line that says who can see it,
     drawn only on a private row (money F9). */
  rowKeepPrivate: 'Private to me',
  rowShareAgain: 'Share with everyone',
  rowPrivateLock: 'Private',
  rowSeenByOnlyYou: 'Only you can see this.',
  rowPrivateNotDone: 'That did not save. Try again.',
  rowRestore: 'Put back',
  /** On a row of a list with a page of its own: the way to where it is drawn, a reading's chart. */
  rowSeeChart: 'See its chart',
  rowRestored: (what: string) => `${what} is back.`,
  /* The row is archived: said on the row, because every list leaves it out and nothing else here would. */
  rowArchivedNote: 'Archived, so left out of every list.',
  /* What points at this row, when the record refuses that read alone: the sections are absent and the
     reason is said once, rather than the page looking like nothing points here. */
  linksRefused: 'What points here could not be read',
  /* WHICH FIELD POINTS HERE, and only where two of one list's fields do: a milestone's page headed its choices
     "Choices milestone 1", which is the field's id read as part of the heading. */
  linkedThrough: (field: string) => `through ${field.toLowerCase()}`,
} as const;
