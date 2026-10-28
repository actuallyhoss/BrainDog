/**
 * The names a drawn page is read by: the classes and data attributes that tests, gates and the rule sheet's
 * `expect.json` (`packs/rule-sheet`) find things with.
 *
 * "DO NOT RENAME CLASSES/DATA READ BY TESTS", AND NOTHING SAID WHICH THEY WERE. A class is a word in a template
 * string in `html.ts` and a word in a template in `svelte/`, and a gate reads it as a third spelling in a selector. A
 * rename on one side drew a page the gate could not find anything on, and a gate that finds nothing is quiet, not red.
 * So the names are here, once, and `contract.test.ts` draws a write-up through BOTH renderers and fails when either
 * stops writing one. A selector built from these is a selector both renderers answer.
 *
 * PAGE NAMES ARE THE WEB APP'S (`apps/web/src/lib/page`): the section's tab strip and the board's two columns, which no
 * renderer draws. The test reads them from the app's own templates, so a rename there is red here too.
 */

/** The classes both renderers write, by what they mark. */
export const CLASSES = {
  /* Every block, its heading line, and the fence a block that did not read draws instead (`degraded`). */
  block: 'block',
  blockHead: 'block-head',
  degraded: 'block-degraded',
  degradedFix: 'degraded-fix',
  degradedSource: 'degraded-source',
  /* Inline values in prose and cells: a typed value, a value written loosely and left as typed, a path that names
     nothing, an evidence tag, an inline icon, a tone's mark, a currency's code and any figure set in tabular digits. */
  typed: 'typed',
  unresolved: 'unresolved',
  bad: 'bad',
  hole: 'hole',
  evidence: 'evidence',
  glyphInline: 'glyph-inline',
  glyph: 'glyph',
  amountCode: 'amount-code',
  num: 'num',
  measure: 'measure',
  /* `stat`: the grid and each tile, with its label, figure and note line. */
  grid: 'grid',
  cell: 'cell',
  cellLabel: 'cell-label',
  cellFigure: 'cell-figure',
  cellNote: 'cell-note',
  /* `chips`: each pill and its parts. */
  pill: 'pill',
  pillFigure: 'pill-figure',
  pillWord: 'pill-word',
  /* `bar`: each row, its track and its value. A row whose value is words draws no track. */
  prop: 'prop',
  propRow: 'prop-row',
  propLabel: 'prop-label',
  propTrack: 'prop-track',
  propValue: 'prop-value',
  /* `ring`, `heat` and `note`. */
  ring: 'ring',
  ringMark: 'ring-mark',
  heat: 'heat',
  panel: 'panel',
} as const;

/** The data attributes both renderers write. */
export const ATTRS = {
  kind: 'data-kind',
  primitive: 'data-primitive',
  form: 'data-form',
  intent: 'data-intent',
  code: 'data-code',
  path: 'data-path',
  evidence: 'data-evidence',
  glyph: 'data-glyph',
} as const;

/** The names the web app writes around the blocks: the tab strip and the two columns of a page with a layout. */
export const PAGE = {
  tabs: 'page-tabs',
  tab: 'tab',
  tabMore: 'tab-more',
  tally: 'tally',
  area: 'area',
  areaAttr: 'data-area',
  areaSpan: '--area-span',
} as const;

export type ClassName = (typeof CLASSES)[keyof typeof CLASSES];
export type AttrName = (typeof ATTRS)[keyof typeof ATTRS];

/** The selectors a rule is read with, made from the names above so a rename is one edit. */
export const SELECT = {
  block: (kind: string): string => `.${CLASSES.block}[${ATTRS.kind}="${kind}"]`,
  degraded: `.${CLASSES.degraded}`,
  degradedFix: `.${CLASSES.degraded} .${CLASSES.degradedFix}`,
  typed: (form: string): string => `.${CLASSES.typed}[${ATTRS.form}="${form}"]`,
  unresolved: `.${CLASSES.unresolved}`,
  hole: `.${CLASSES.hole}`,
  evidence: (kind: string): string => `.${CLASSES.evidence}[${ATTRS.evidence}="${kind}"]`,
  glyphInline: `.${CLASSES.glyphInline}`,
  tile: `.${CLASSES.cell}`,
  tileNote: `.${CLASSES.cell} .${CLASSES.cellNote}`,
  pill: `.${CLASSES.pill}`,
  barRow: `.${CLASSES.propRow}`,
  ring: `.${CLASSES.ring}`,
  heat: `.${CLASSES.heat}`,
  toned: (intent: string): string => `[${ATTRS.intent}="${intent}"]`,
  tab: `.${PAGE.tabs} .${PAGE.tab}`,
  more: `.${PAGE.tabMore} .${PAGE.tally}`,
  column: (area: 'main' | 'rail'): string => `.${PAGE.area}[${PAGE.areaAttr}="${area}"]`,
} as const;

/**
 * ONE LINE OF `packs/rule-sheet/expect.json`, as `tools/gates/rule-sheet.mjs` reads it: the rule in words, the page it
 * is drawn on (by title or id, or by `path` under the record's app address), the selector it is read at, and what must be
 * read there: `count`, the number of matches; `text`, words one match's text holds; `attr` or `style`, an attribute or a
 * style property of the first match, which must equal `is`. A line may say more than one, and each must hold.
 */
export type Expectation = {
  readonly rule: string;
  readonly page: string;
  readonly path?: string;
  readonly selector: string;
  readonly count?: number;
  readonly text?: string;
  readonly attr?: string;
  readonly style?: string;
  readonly is?: string;
};

/**
 * The whole file: the rules, and any page's address the gate cannot find itself. It finds the add-on's own pages by
 * title or id (`/p/<id>`); a page per row (the ring on a row's page) needs its `path` here or on the line.
 */
export type ExpectFile = { readonly pages?: Readonly<Record<string, string>>; readonly rules: readonly Expectation[] };
