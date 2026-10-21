/**
 * THE DESIGN BOOK (DIRECTION §45, "One design language"): what the model and every agent read before designing, and what
 * the app shows at Settings > Look > Design book. One function, so the page and the MCP resource `braindog:design` can
 * never say two things.
 *
 * GENERATED, NOT COPIED. A block kind, its job, its cells, its forms and its narrowest width are read from `KINDS` and
 * `KIND_LINES`; a chart's example is the sheet's own specimen; the colours, the type scale, the spacing and the radii are
 * parsed out of the declarations the skin is drawn from (`LOOK_B_CSS`, `SCALE_CSS`, handed in because this package has no
 * stylesheet to import). The only prose written here is the layout and the voice, which no table holds.
 *
 * AN EXAMPLE IS A FENCE OF INVENTED DATA, as a person would write it, so the book draws it through `parse` and the
 * drawer like any block. `Record<Exclude<Kind, ...>>` makes a kind added without an example (or without saying it has
 * none) a type error, and `design-book.test.ts` parses every one.
 */

import { KINDS, type Kind } from './kinds.ts';
import { KIND_LINES, REACH_FOR } from './kind-lines.ts';
import { SHEET_KINDS, specimenFor } from './sheet.ts';

export type BookToken = { name: string; light: string; dark: string; role: string };
export type BookStep = { name: string; value: string };
export type BookKind = {
  kind: Kind;
  /** The author's group: say, figure, list, plan or media. */
  group: string;
  for: string;
  cells: string;
  reads: string | null;
  forms: readonly string[];
  /** The narrowest the kind stays legible, in twelfths of the page. */
  narrowest: number;
  pageOnly: boolean;
  chart: boolean;
  /** A fence of invented data, or null where the kind needs a list or a file that only a page holds. */
  example: string | null;
};

export type DesignBook = {
  about: string;
  tokens: { colours: BookToken[]; type: BookStep[]; space: BookStep[]; radii: BookStep[]; hues: string };
  kinds: BookKind[];
  reach_for: readonly string[];
  layout: Record<'desk_grid' | 'phone_stacking' | 'reserved_slot' | 'in_a_decision' | 'in_a_task' | 'in_a_card', string>;
  voice: readonly string[];
  compose: readonly string[];
};

/** What each named colour is for. Only the ones a design reaches for; the rest follow from these. */
const ROLES: Readonly<Record<string, string>> = {
  board: 'the ground of a page, behind the tiles',
  tile: 'a block and every card: sits on the board',
  'tile-2': 'a well inside a tile, and a quiet control on it',
  nav: 'the top bar and the side rail',
  ink: 'text',
  'ink-2': 'second-line text',
  'ink-3': 'meta and captions',
  rule: 'a line between rows',
  'red-fill': 'the primary button and the count pill, with white words',
  red: 'red words and marks: late, links, and what needs a person',
  'red-tint': 'the wash behind a red mark',
  good: 'done and paid, with its word',
  warn: 'a real warning, with its word',
  info: 'a note, with its word',
  live: 'the dot of something working now, never text',
};

const fence = (info: string, rows: readonly string[]): string => ['```' + info, ...rows, '```'].join('\n');

/** An example for every kind that is not a chart (those use the sheet's specimens), or null with the reason it has none. */
const EXAMPLES: Readonly<Record<Exclude<Kind, (typeof SHEET_KINDS)[number]>, string | null>> = {
  note: fence('note | Heads up', ['Rent goes out on the 28th.']),
  quote: fence('quote | Said', ['Ship it on Friday. | Sam']),
  stat: fence('stat | Today', ['Open tasks | 12 | 3 due today', 'Waiting | 4 | on two people']),
  chips: fence('chips | State', ['Paid | 6', 'Late | 2 | chase', 'Draft | 3']),
  spec: fence('spec | The job', ['Client | Acme | since June', 'Owner | Sam', 'Due | 28 Oct']),
  params: fence('params | Runs with', ['Day | Friday', 'Report | Weekly']),
  todo: fence('todo | Next', ['Send the quote | Acme | due Friday', 'Book the printer | Sam']),
  steps: fence('steps | Launch', ['Write the page | first draft | done', 'Proof it | with Sam | next', 'Publish']),
  timeline: fence('timeline | This week', ['Mon | Quote sent | Acme', 'Wed | Call booked | Sam']),
  board: fence('board | Jobs', ['open | Call Acme | due Fri', 'doing | Proof the page | Sam', 'done | Send the quote']),
  code: fence('code | Command', ['braindog keys put acme']),
  tree: fence('tree | Folders', ['quotes', '  acme', '  north']),
  comparison: fence('comparison | Plans', ['Aspect | Basic | Plus', 'Price | 9 | 19', 'People | 1 | 5']),
  table: null,
  cards: null,
  section: fence('section | Later', []),
  feed: null,
  diff: fence('diff | Edit', ['  Rent goes out', '- on the 25th.', '+ on the 28th.']),
  agents: null,
  queue: null,
  capture: null,
  inputs: null,
  calendar: fence('calendar | Dates', ['Renewal | 2026-10-28', 'Quote due | 2026-10-21']),
  lanes: fence('lanes | Spans', ['Launch | 2026-10-05 | 2026-10-19', 'Review | 2026-10-12 | 2026-10-23']),
  link: fence('link | Open', ['The site | https://example.com | home']),
  gallery: null,
  embed: null,
  form: null,
  kpis: null,
};

const decomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, '');
const declarations = (css: string): Map<string, string> => new Map([...decomment(css).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)].map((m) => [m[1]!.slice(2), m[2]!.trim()]));

/** The body of the block a selector opens, to the brace that closes it. */
function blockOf(css: string, opener: string): string {
  const from = css.indexOf(opener);
  if (from < 0) return '';
  const open = css.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

const steps = (css: string, prefix: string): BookStep[] =>
  [...declarations(css)].filter(([n]) => n.startsWith(prefix)).map(([name, value]) => ({ name: `--${name}`, value }));

export function designBook(input: { look: string; scale: string }): DesignBook {
  const bare = decomment(input.look);
  const light = declarations(blockOf(bare, ':root {'));
  const dark = declarations(blockOf(bare, ':root[data-theme="dark"]'));
  const colours = Object.entries(ROLES).flatMap(([name, role]) => {
    const l = light.get(name);
    return l === undefined ? [] : [{ name: `--${name}`, light: l, dark: dark.get(name) ?? l, role }];
  });

  const kinds = (Object.keys(KINDS) as Kind[]).map((kind): BookKind => {
    const spec = KINDS[kind];
    const line = KIND_LINES[kind];
    const chart = (SHEET_KINDS as readonly string[]).includes(kind);
    const specimen = chart ? specimenFor(kind) : undefined;
    return {
      kind,
      group: spec.purpose,
      for: line.for,
      cells: line.cells,
      reads: line.reads ?? null,
      forms: spec.forms ?? [],
      narrowest: spec.minSpan,
      pageOnly: spec.pageOnly === true,
      chart,
      example: chart ? (specimen?.source ?? null) : EXAMPLES[kind as keyof typeof EXAMPLES],
    };
  });

  return {
    about:
      'BrainDog describes every page, card, component and visual in its own language: the .dog page declaration, whose blocks are the kinds below. Compose from them. Nothing is drawn by hand outside it.',
    tokens: {
      colours,
      type: steps(input.scale, 'fs-'),
      space: steps(input.scale, 'sp-'),
      radii: steps(input.scale, 'r-'),
      hues: 'A project or card carries a hue, a whole number from 0 to 359. It colours that one mark and nothing else, never an edge, a ground or a tone.',
    },
    kinds,
    reach_for: REACH_FOR,
    layout: {
      desk_grid: 'A page is twelve columns on a desk. A block takes a span of them, never narrower than its kind allows. A side rail is 3 to 5 twelfths, and the main column takes the rest.',
      phone_stacking: 'On a phone the same list reads top to bottom, one block to a row, with the rail after the main column. Nothing is placed by coordinates, so order is the design.',
      reserved_slot: "A page has one reserved slot, for BrainDog's own suggestions of a better visual. Nothing else is drawn there, and it is empty when there is nothing to suggest.",
      in_a_decision: 'A visual sits under the question, above the answers, at the width of the card. It shows the figures the choice turns on and never replaces the answers.',
      in_a_task: "A visual sits in the task's panel after its facts, at the width of the panel, and is drawn only when the task has data for it.",
      in_a_card: 'A card holds one block at a time. It is drawn on the tile, takes the card hue for its mark only, and shows a quiet line when it has nothing, never an empty frame.',
    },
    voice: [
      'Say names, never ids.',
      'Never say record, row or register to a person: say list, entry and the list by name.',
      'Short and plain, one line where one will do.',
      'Nothing is drawn empty.',
    ],
    compose: [
      'Arrange these kinds into a page, a card or a visual. It is native, instant, and right in both themes and on a phone.',
      'Draw a small component of your own only when no kind fits.',
    ],
  };
}
