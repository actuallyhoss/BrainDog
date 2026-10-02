/**
 * Slash's row in the palette, and what its answer draws: the parts of `Palette.svelte` that are rules rather than markup.
 *
 * OUT OF THE COMPONENT SO `node --test` CAN HOLD THEM. `admit.ts` is here for the same reason: a `.svelte` file cannot be
 * imported by a test, and a regex over source proves where a string sits rather than what the panel does with it.
 *
 * WHEN THE ROW EXISTS is `50 §5.5` step 5: a model behind Slash on this host, and a query that matched no place or that ends
 * in a question mark. Without a
 * model the row is ABSENT, NOT DISABLED (`23 §8`), and because the row is the only way into the mode, nothing that says
 * "Slash" can reach the screen on a host without one.
 *
 * WHAT THE ANSWER DRAWS is pass 1 of `46 §5.4`: the predicate Slash drafted, in words and BEFORE the rows, so a person reads
 * what was asked of the record before reading what it answered; the rows, drawn by code as addresses; and the fold, whose
 * last line is the vault, refused, on every ask (`23 §6`). The model writes none of the words below. It chose a predicate,
 * and the predicate is data.
 */

import { exponentOf, yesno } from 'braindog-render';
import type { Reading, SlashProposal, SlashStatus, SlashWhere } from '@braindog/client';

import { copy } from '../copy.ts';
import { figuresIn, summaryTitle, words as citeWords } from '../cite.ts';
import { listName } from '../record/names.ts';
import { atCap, nearCap, resetsWords } from '../ui/slash-asks.ts';

/**
 * The fold's line for the figures an ask read, as the engine writes it (`FIGURES_TRACE` in
 * `packages/slash/src/propose.ts`, restated because the web may not import the engine). It is not a register, so the fold
 * says it in its own words, and it is a reason to ask pass 2 when no row answered.
 */
export const FIGURES_TRACE = '@figures';

/**
 * The question the row would ask, or `null` when there is no row.
 *
 * PLAIN TEXT ONLY. `>` `#` `@` and `/` each narrow the palette to one kind of thing that already has its own answer, so a
 * prefixed query is not a question for Slash. AND NOT WHILE THE RECORD'S SEARCH IS STILL ANSWERING: `places` is zero for
 * the frame before the hits arrive, and a row offered in that frame is a row that vanishes under the pointer.
 */
export function offersSlash(a: { slash: boolean; prefix: string | null; text: string; pending: boolean; places: number }): string | null {
  if (!a.slash || a.prefix !== null) return null;
  /* TWO CHARACTERS OR MORE, the palette's own threshold for asking the record's search. Below it the search never ran, so
     `places` would be zero for every single letter and each one would be offered to Slash as a question. */
  const question = a.text.trim();
  if (question.length < 2) return null;
  /* A QUESTION MARK IS THE PERSON SAYING IT IS A QUESTION, so the row is offered beside the
     places that matched and not only when none did. It does not wait on the search either: it depends on nothing the
     search answers, so it cannot vanish under the pointer when the hits arrive. */
  if (question.endsWith('?')) return question;
  return a.pending || a.places > 0 ? null : question;
}

/**
 * A value inside a predicate, as a person would type it into a filter.
 *
 * NO THOUSANDS COMMA, BECAUSE BOTH ENGINES READ A COMMA AS THE END OF A CONDITION. This printed a number through
 * `toLocaleString('en')` and a money through `money()`, the record's screens' spellings, and every clause over a value past
 * a thousand stopped typing back: `amount is at least GBP 1,500.00` was `FIELD_UNKNOWN` for a field called `500.00` in the
 * record and a refusal in the browser, and `money()`'s minus is U+2212, which neither reads as a sign (`slash-print.test.ts`). So a number is its digits, and a money is its code and its amount in the
 * currency's own places, which is the literal the grammar was written to read.
 */
const valueWords = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return yesno(v);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o['amount'] === 'number' && typeof o['currency'] === 'string') {
      const places = exponentOf(o['currency']);
      return `${o['currency']} ${(o['amount'] / 10 ** places).toFixed(places)}`;
    }
    if (typeof o['value'] === 'number' && typeof o['unit'] === 'string') return `${String(o['value'])} ${o['unit']}`;
  }
  return JSON.stringify(v) ?? String(v);
};

/**
 * The values a field may hold one of, after `is one of`, WITH COMMAS AND NO `or`. The first draft wrote `open, doing or
 * waiting`, and inside an `any` group that read `state is one of open, doing or waiting or owner is empty`, where the group's
 * `or` and the list's `or` cannot be told apart.
 */
const oneOf = (vs: unknown[]): string => vs.map(valueWords).join(', ');

/**
 * `34 §1`'s `where` tree, in words.
 *
 * A NESTED GROUP IS BRACKETED, and the top one is not. `state is open and tags has urgent or late is yes` reads two ways,
 * and a person checking the predicate against the rows it found has to be able to read it one way.
 */
export function whereWords(w: SlashWhere, nested = false): string {
  const group = (parts: SlashWhere[], joiner: string) => {
    const said = parts.map((p) => whereWords(p, true)).join(joiner);
    return nested && parts.length > 1 ? `(${said})` : said;
  };
  if ('all' in w && Array.isArray(w.all)) return group(w.all, ' and ');
  if ('any' in w && Array.isArray(w.any)) return group(w.any, ' or ');
  if ('none' in w && Array.isArray(w.none)) return `not (${w.none.map((p) => whereWords(p, true)).join(' or ')})`;
  if ('matches' in w && !('field' in w)) return copy.slashMatches(String(w.matches));

  /* EVERY TEST ON THE LEAF, AND A FALSE `empty` OR `present` AS ITS OPPOSITE, which is how `@braindog/where`'s `splitLeaf`
     runs it. The first draft said the first key and dropped the rest, and ignored the operand of `empty`: the record ran
     `owner is set` under a line that said `owner is empty`. A leaf with two tests is said as the `all` it is run as. */
  const leaf = w as { field: string; via?: string } & Record<string, unknown>;
  const subject = typeof leaf.via === 'string' ? `${leaf.via} ${leaf.field}` : leaf.field;
  const ops = Object.keys(leaf).filter((k) => k !== 'field' && k !== 'via');
  if (ops.length === 0) return subject;
  const said = ops.map((op) => {
    const operand = leaf[op];
    if (op === 'empty' || op === 'present') return `${subject} ${copy.slashOps[operand === false ? (op === 'empty' ? 'present' : 'empty') : op]}`;
    const verb = copy.slashOps[op] ?? op;
    if (op === 'between' && Array.isArray(operand) && operand.length === 2) return `${subject} ${verb} ${valueWords(operand[0])} and ${valueWords(operand[1])}`;
    return `${subject} ${verb} ${Array.isArray(operand) ? oneOf(operand) : valueWords(operand)}`;
  });
  return nested && said.length > 1 ? `(${said.join(' and ')})` : said.join(' and ');
}

/** One fold line's predicate: `all`, the canonical JSON the engine traced, or, for anything else, what it said. */
const traced = (predicate: string): string => {
  if (predicate === 'all') return copy.slashAll;
  try {
    return whereWords(JSON.parse(predicate) as SlashWhere);
  } catch {
    return predicate;
  }
};

export type DrawnRow = { id: string; title: string; spoken: string; register: string; href: string };
export type Drawn = { where: string | null; q: string | null; rows: DrawnRow[]; fold: string[] };

/**
 * A `Reading`, as the palette draws it.
 *
 * THE VAULT'S LINE IS WRITTEN HERE AND NOT COPIED FROM THE ANSWER. The engine appends `{ register: 'grant', rows: 0,
 * predicate: 'refused' }` to every trace, and `23 §6` says the line is drawn every time, including when nothing about
 * credentials was asked. So the drawing does not depend on the engine remembering: the engine's line is dropped wherever it
 * is, and the one line is put last, which also means it can never be drawn twice. Only the refused line is dropped, so a
 * pack's own register that happened to be called `grant` would still be listed.
 */
export function drawReading(r: Reading): Drawn {
  return {
    where: r.predicate === null ? null : whereWords(r.predicate),
    q: r.q,
    rows: r.rows.map((row) => ({
      id: row.id,
      /* THE TITLE AND NEVER THE SPOKEN ID: the host's summary reads `tasks#1 | Invoice Acme | open`, and an id is an
         address, not a name. A row with no title is named by its list. */
      title: summaryTitle(row.summary, row.spoken) || citeWords.rowIn(listName(row.register)),
      spoken: row.spoken,
      register: row.register,
      href: `/r/${encodeURIComponent(row.register)}/${row.seq}`,
    })),
    fold: [
      ...r.read
        .filter((t) => !(t.register === 'grant' && t.predicate === 'refused'))
        .map((t) => (t.register === FIGURES_TRACE ? slashWords.figuresLine(t.rows) : copy.slashFoldLine(t.register, t.rows, traced(t.predicate)))),
      copy.slashGrantRefused,
    ],
  };
}

/*
 * PASS 2 (`46 §5.5`): after the rows, what Slash proposes about them.
 *
 * THE WORDS ARE HERE AND NOT IN `copy.ts`, because `copy.ts` was another agent's file for the run that built this. They
 * are the palette's and nobody else's, so moving them into its Slash block later changes an import and nothing else.
 */
export const slashWords = {
  proposing: 'Slash is writing a proposal about what it found.',
  proposed: 'What Slash proposes',
  /* `23 §8`'s footer: receded, small, and naming the model on every output. */
  drawnBy: (model: string) => `Drawn by ${model}`,
  noModel: 'Drawn by a model this host did not name',
  /* THE VERB AND WHAT IT OPENS, AND NO ID: `Decide SG14` read an address aloud. */
  decide: 'Open the proposal in Decide',
  without: 'Everything above this line was drawn without it.',
  figuresLine: (n: number) => (n === 1 ? 'figures: 1 read' : `figures: ${n.toLocaleString('en')} read`),
  capLine: (used: number, cap: number, resets: string) =>
    `Slash has used ${used} of this month's ${cap} asks. The count resets on ${resetsWords(resets)}.`,
  capDismiss: 'Hide until next month',
} as const;

/**
 * Whether to ask for a proposal at all. ZERO ROWS IS ZERO INFERENCE (`23 §6`): the engine already answers a zero-row
 * propose without calling the model, but the palette asking is still a request, a held ask and a `query` body with
 * nothing to say, for a question the record already answered with *Nothing in the record answers that.* A FIGURE READ IS
 * A ROW'S EQUAL HERE: "why is runway four months" may match no row and still have its figure to talk about.
 */
export const secondPass = (r: Reading): boolean =>
  r.rows.length > 0 || r.read.some((t) => t.register === FIGURES_TRACE && t.rows > 0);

/**
 * `text` IS SLASH'S SENTENCE WITH ITS BRACES IN IT, and `figures` what each stands for; `Cited.svelte` draws the two
 * together, so the palette never prints a brace and never formats a figure itself.
 */
export type DrawnProposal = {
  text: string;
  figures: Record<string, unknown>;
  verbs: SlashProposal['verbs'];
  decide: string | null;
  footer: string;
};

/**
 * A `Proposal`, as the palette draws it under the rows.
 *
 * THE FOOTER IS NEVER LEFT OUT. `23 §8` makes it a mechanism rather than a policy: a downgrade the footer does not name is a
 * downgrade nobody sees. So a proposal that arrives with no model still gets a footer, and it says the host named none.
 *
 * `decide` IS WHERE THE VERBS ARE CARRIED OUT. An `options` or `rowset` answer is filed as `SG<n>` on Decide, and decide,
 * defer and dismiss are that screen's; the palette links to it rather than keeping a second copy of the gate. A `query`
 * files nothing, so it has no link, and its rows are already the ones drawn above.
 */
export function drawProposal(p: SlashProposal): DrawnProposal {
  const model = typeof p.model === 'string' ? p.model.trim() : '';
  return {
    text: p.text,
    figures: figuresIn(p.body),
    verbs: [...p.verbs],
    decide: p.filed === null ? null : `/decide/${encodeURIComponent(p.filed)}`,
    footer: model === '' ? slashWords.noModel : slashWords.drawnBy(model),
  };
}

/**
 * Whether the palette's footer carries the 80 % line (`23 §8`): once a month, dismissible, never a modal.
 *
 * `dismissed` IS THE RESET INSTANT THE LINE WAS HIDDEN FOR, so hiding it lasts exactly until the count starts again and
 * needs no clock here. At the cap the pass-2 refusal says it under the rows, so the line stops at 100 %; that also keeps
 * a cap of zero, which is Slash switched off, from reading as a warning.
 */
export const capLine = (s: SlashStatus, dismissed: string | null): boolean =>
  nearCap(s) && !atCap(s) && dismissed !== s.asks.resets;

/**
 * A refusal on pass 2, drawn under the rows. The `fix` is shown as it came (`13 §6`). ONLY A SPENT BUDGET adds the second
 * sentence, because only there is it true in the sense `23 §8` means: the rows above were found by code and the proposal
 * is what the missing ask would have bought.
 *
 * `spent` IS RUNNING OUT, SAID WITH ITS TWO WAYS ON: where it is true the caller draws
 * `SlashOut` under the sentences, "Use your own key" and "Settings", so a person at the cap is shown what to press and
 * not only told to wait.
 */
export const pass2Refused = (r: { code: string; fix: string }): { fix: string; without: string | null; spent: boolean } => {
  const spent = r.code === 'SLASH_BUDGET_SPENT';
  return { fix: r.fix, without: spent ? slashWords.without : null, spent };
};
