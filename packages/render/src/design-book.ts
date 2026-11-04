/**
 * THE DESIGN BOOK ("One design language"): what the model and every agent read before designing, and what
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
import { DRAWN_CODE_MOST, DRAWN_HEIGHT, DRAWN_ROWS_MOST, DRAWN_TOKENS } from './drawn.ts';
import { DESIGN_BUDGET, PHONE_PX } from './design-check.ts';

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
  /**
   * LOOK B, AS BUILT (`loop/DESIGN-SYSTEM.md`, rewritten 1 Nov): the rules every design follows, a person's or an
   * agent's, read before the tokens. Where the book's tables and these lines meet, these say how to use them.
   */
  look: readonly string[];
  compose: readonly string[];
  /** How to write a `drawn` block, the second way to design, when no kind fits. */
  draw: readonly string[];
  /** The check every design passes before it is shown (`design-check.ts`), one line a rule. */
  check: readonly string[];
};

/**
 * LOOK B IN LINES (`loop/DESIGN-SYSTEM.md`, "Look B, as built", 1 Nov): what the app draws today, said once for the model,
 * every agent through `braindog:design`, and Settings > Look > Design book. The file is the source; these lines follow it,
 * and `design-book.test.ts` holds the ones a design is most often caught by.
 */
export const LOOK_B: readonly string[] = [
  'Plain and restrained: flat tiles on a quiet board, one red accent, warm dark greys in dark mode, and small icons and infographics where they help a person read. Nothing shines, floats or glows.',
  'Never: gradients, glass, blur, glow, or shadows on anything in the page; pills (buttons, chips, segments, tags and fields are rectangles with an 8px radius; only dots, faces, counts and switches are round); taglines or marketing lines; a grid of four big numbers with nothing to say; serif type, cream, beige, oxblood or brown; emoji, streaks, badges or scores; a tile inside a tile, a border round a tile, or a box round a group.',
  'Type: Plus Jakarta Sans for every word, 600 for page names (28) and big figures (22 on a tile, 34 for a page\'s one number): headings 15 to 17 at 600, body 15, controls 14 at 500, meta 13, captions 12. Weights 400, 500 and 600 only. Figures are tabular and right-aligned in a column. At most two inks in a row: --ink for the subject, --ink-3 for the rest.',
  'Colour is a role token, never a hex: --board under the tiles, --tile for a tile, --tile-2 for a well or a quiet control on it. Red (--red-fill with white words) is the one primary button and the count on Needs you; --red words only for what is late, failing or below nought. --good, --warn and --info always beside their word or glyph, never colour alone. Money out is ink with its minus, money in --good with its plus, one currency at a time, "≈" for a converted figure.',
  'Projects and chart series wear one of the eight category slots (--cat-blue, -violet, -pink, -teal, -sky, -amber, -lime, -slate, each with a -tint), for telling things apart and never for state.',
  'Space: 4, 8, 12, 16, 24, 32, 48 and 64 (--sp-1 to --sp-8). Tiles sit 12 apart; inside a tile 20 of padding (16 on a phone), 16 between parts, 12 from heading to rows. Radii: 4 tags, 8 controls and wells, 12 menus, 16 tiles and sheets. Targets 44 under a thumb; controls 32 tall.',
  'A tile opens on one heading row: a 28px neutral well with an 18px icon, the title at 15/600, an optional count in --ink-3, and at its end one link ("All 17 →"), a line of meta or its actions. A heading well never takes a tone.',
  'A row reads subject, detail, figure, when; one line of detail at most; hairlines only between rows of one list. A list that cuts off says how many more. Dates "29 Oct", times "14:20", ages "2h ago".',
  'Charts only where they help read a number, one idea each: lines 1.5 to 2px in --ink or a category colour, a 6% wash under a line, a solid zero rule and faint others, below nought in --red. A label never sits on a line. Axis words at 12 in --ink-3.',
  'An empty state says what will be here and offers the one next step, under a 40px neutral well. Never "Nothing here yet" alone, never "Get started".',
  'Motion explains a change and never decorates: a press is a fill change, menus 120ms, sheets about 240ms, rows that move 180ms. Everything honours reduced motion.',
  'On a phone: designed, not squeezed. 44px targets, sheets from the bottom, nothing scrolling sideways at 390.',
];

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
  'red-fill': 'the one primary button on a screen and the count on Needs you, with white words',
  red: 'red words and marks, only for what is late, overdue or failing, or money below nought; never decoration or "selected"',
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
  drawn: null,
  project: null,
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
      'BrainDog describes every page, card, component and visual in its own language: the .dog page declaration, whose blocks are the kinds below. Compose from them. Nothing is drawn by hand outside it. Every design follows Look B (the look rules first), the design system the app is drawn in.',
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
      reserved_slot:
        "A page has one reserved slot, at its head, for BrainDog's own suggestion: a better visual for the page, or the one question a rule or BrainDog asked that it would answer first. It shows one at a time, with its suggested answer as the button and Not now beside it. Nothing else is drawn there, and it is empty when there is nothing to suggest.",
      in_a_decision: 'A visual sits under the question, above the answers, at the width of the card. It shows the figures the choice turns on and never replaces the answers.',
      in_a_task: "A visual sits in the task's panel after its facts, at the width of the panel, and is drawn only when the task has data for it.",
      in_a_card: 'A card holds one block at a time. It is drawn on the tile, takes the card hue for its mark only, and shows a quiet line when it has nothing, never an empty frame.',
    },
    voice: [
      'Say names, never ids, handles, run codes or field names.',
      'Never say record, row or register to a person: say list, entry and the list by name.',
      'Short and plain, the way a person would say it to a friend; one line where one will do.',
      'Say what to do next on every warning.',
      'Numbers in digits with thousands grouped (£7,000), one currency at a time.',
      'Nothing is drawn empty.',
    ],
    look: LOOK_B,
    compose: [
      'Arrange these kinds into a page, a card or a visual. It is native, instant, and right in both themes and on a phone.',
      'Draw a small component of your own only when no kind fits.',
    ],
    draw: [
      'A drawn block is { kind: drawn, heading, source: register.<id>, columns: [{ field }], code }. The code is HTML, a style tag and a script, written as what goes inside the page.',
      `It runs in a sandbox with no network, no storage and no reach into the page around it. Nothing is fetched: write pictures inline as SVG or data: images. Its code is at most ${DRAWN_CODE_MOST / 1024} KB.`,
      `It is handed braindog.data, { list, columns, rows }, each entry { ref, fields } with only the fields its columns name, at most ${DRAWN_ROWS_MOST} of them, read for whoever is looking. braindog.on(fn) calls fn(data, theme) now and whenever either changes.`,
      `The theme's colours are CSS variables of the same names: ${DRAWN_TOKENS.map((t) => `--${t}`).join(', ')} and --font. Use them, never a colour of your own, and it reads in light and dark.`,
      'It is drawn in Look B: flat, with no gradient, shadow, glow or pill; corners of 8 on controls and 16 on a surface; red only for what is late, failing or below nought; a big figure at 600 and tabular; text in --ink with --ink-3 for the rest.',
      `braindog.open(ref) opens one of the entries it was handed. Its height follows its content, from ${DRAWN_HEIGHT.least} to ${DRAWN_HEIGHT.most} pixels; height: on the block is where it starts.`,
      'It fits a 390 px phone with nothing scrolling sideways, says its empty state in words, and names things, never ids.',
    ],
    check: [
      'Every design passes this check before it is shown. One that fails is mended by the model, or it is not shown.',
      'It reads only the lists it may read.',
      `It fits a ${PHONE_PX} px phone and a laptop with nothing scrolling sideways, and a whole-page kind never sits inside a decision, a task or a card.`,
      "It uses only the book's colours, so it reads in light and dark.",
      'It follows Look B: no pill, gradient, glass or shadow; nothing red unless something is late, failing or below nought; no tile inside a tile; every tile opens on the same heading row.',
      'It says what it shows when it has nothing, and its loading state is the picture drawn first.',
      'It uses the words of the person it is for: names, never ids, no em dash, and no heading that says row, register, block or entity.',
      `It draws in budget: under ${DESIGN_BUDGET.composedMs} ms composed, and a drawn one alive within ${DESIGN_BUDGET.aliveMs} ms of its picture.`,
    ],
  };
}
