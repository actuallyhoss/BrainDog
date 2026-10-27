/**
 * A look is rehearsed before it is written (decision 3 check 4): laid over the page as it reads now, and the
 * lint for what a page prints is run over the result.
 *
 * WHY. A look the model composed is trusted for nothing as it came (`compose-look.ts`), and each of its parts is
 * checked alone there: the headline's words, the keys an order names. What no part can say alone is what the PAGE
 * prints once the look is on it: a blank tile at the top because the block it leads with read no row, a hole in the
 * headline nothing filled, a cell an order brought into view that prints a raw time. So the look is laid with the same
 * `applyLook` a read lays it with, and read by the same `lintAnswer` Health reads every page with. A fault refuses the
 * look and the rules' look stands, so nobody is the composer's tester.
 *
 * WHAT IS READ, in this order: the block the look leads with, every tile left drawn, the headline and the next step
 * as they would print, then the page's own answer. A fault the page prints under its rules too refuses the look as
 * surely as one the look made: a line composed over a page that prints a brace is a line over a broken page, and the
 * page's own finding (`pages-clean`) is what gets it mended.
 *
 * TWO REFUSALS FOR ONE BASIS LEAVE THE PAGE TO ITS RULES. The basis is what a look was composed from, so asking a
 * third time over the same facts would be the same ask for the same answer. `refusedFor` and `noteRefusal` hold that
 * over a plain value the caller stores as a pref (`lookRefusedKey`); a basis that moved is rehearsed afresh.
 *
 * NOTHING HERE WRITES OR READS A RECORD. The caller hands the page it read and stores what `noteRefusal` answers.
 */

import { lintPart, type LintRule } from 'braindog-render';
import { applyLook, drewNothing, type BlockResult, type LookBody, type PageResult } from '@braindog/kernel';

import { lintAnswer, type KeysOf, type PageFinding, type TypesOf } from './page-lint.ts';

/** What a rehearsal can find beside what the page lint finds: a tile on the page with nothing in it. */
export type RehearseRule = PageFinding['rule'] | 'drew-nothing';

/** One fault the look would put on the page, in a person's words: the page and the part by their names. */
export type RehearseFinding = { page: string; part: string; rule: RehearseRule; said: string };

/** What a rehearsal reads beside the page and the look. All of it is the caller's reading, none of it is fetched. */
export type RehearseDeps = {
  /** How many questions wait on the person, or `null` when it cannot be read (`lintAnswer`). */
  waiting?: number | null;
  /** A field's type by its id, for the list a block is over, so a cell is read as the web draws it. */
  typesOf?: TypesOf;
  /** The keys of a closed field with no name, so a cell that prints one is found. */
  keysOf?: KeysOf;
};

/** A look that may be written, with the blocks as they would be drawn under it, or the faults that refuse it. */
export type Rehearsal = { ok: true; blocks: BlockResult[]; look: LookBody } | { ok: false; findings: RehearseFinding[] };

/**
 * The rules a composed line is read by: what prints raw. The copy rules are `headlineFault`'s to hold (`headlines.ts`),
 * and a line names his own things, so a rule that reads a name as a word of the product's is not asked here.
 */
const LINE_RULES = new Set<LintRule>(['placeholder', 'braces', 'raw-key', 'raw-id', 'raw-instant', 'raw-fault', 'em-dash']);

/** A brace of either hand, which no rule above may let through whatever stands between them. */
const BRACE = /\{\{|\}\}/u;

/** A block's name for a finding: its heading with its values filled, or the page's title where it has none. */
function partOf(b: BlockResult, title: string): string {
  if (typeof b.heading !== 'string' || b.heading.trim() === '') return title;
  const values = (b as { values?: Record<string, unknown> }).values ?? {};
  const said = b.heading.replace(/\{\{\s*([\w.]+)\s*\}\}/gu, (whole, id: string) => {
    const v = values[id];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : whole;
  });
  return BRACE.test(said) ? title : said.trim();
}

/** A composed line read as the page prints it: only the rules for what prints raw, and never a brace let through. */
function lineFindings(text: string, page: string): RehearseFinding[] {
  const out: RehearseFinding[] = lintPart({ name: page, text })
    .filter((f) => LINE_RULES.has(f.rule))
    .map((f) => ({ page, part: f.part, rule: f.rule, said: f.said }));
  if (BRACE.test(text) && !out.some((f) => f.rule === 'braces' || f.rule === 'placeholder'))
    out.push({ page, part: page, rule: 'braces', said: 'Prints a figure in braces instead of its value.' });
  return out;
}

/**
 * The look laid over the page as it reads now, and what the page would print under it. `page` is a read's answer and
 * is not changed. A look that passes answers the blocks and the look as `applyLook` laid them, which is what a read
 * draws; one that does not answers every fault, each once a part and a rule.
 */
export function rehearse(page: PageResult, look: LookBody, deps: RehearseDeps = {}): Rehearsal {
  const title = page.title;
  const laid = applyLook(page.blocks, look);
  const found: RehearseFinding[] = [];

  /* THE LEAD IS THE FIRST THING THE PAGE SHOWS, so one that read nothing is a blank at the top, whatever it says of itself. */
  const lead = laid.look.lead === undefined ? undefined : laid.blocks.find((b) => b.key === laid.look.lead);
  if (lead && (lead.drawn === false || drewNothing(lead)))
    found.push({ page: title, part: partOf(lead, title), rule: 'drew-nothing', said: 'Leads the page and draws nothing.' });

  /* AND EVERY OTHER TILE LEFT DRAWN. The rules hide a block that read nothing; a stored look wins as it is, so one that
     did not hide it leaves the tile standing. Two are theirs to show: a tile that says its own empty words, and one the
     person pinned. */
  const pins = new Set(laid.look.pinned ?? []);
  for (const b of laid.blocks) {
    if (b === lead || b.drawn === false || !drewNothing(b)) continue;
    if ((typeof b.empty === 'string' && b.empty.trim() !== '') || (b.key !== undefined && pins.has(b.key))) continue;
    found.push({ page: title, part: partOf(b, title), rule: 'drew-nothing', said: 'Stays on the page and draws nothing.' });
  }

  /* THE HEADLINE AS A READ PRINTS IT. `applyLook` fills its holes from the page's own figures and drops a line with a
     hole it cannot fill, so the rules' line stands on a read. Here that is a fault: the look asked for a line the
     page cannot say. A line that came through is read for what it prints. */
  if (look.headline !== undefined && look.headline.trim() !== '') {
    if (laid.look.headline === undefined) found.push({ page: title, part: title, rule: 'placeholder', said: 'Prints a placeholder where a value goes in its headline.' });
    else found.push(...lineFindings(laid.look.headline, title));
  }
  /* The next step is read as the look asked for it: one `applyLook` dropped names a row nobody is shown, and is not printed. */
  if (laid.look.next !== undefined) found.push(...lineFindings(laid.look.next.text, title));

  found.push(...lintAnswer({ ...page, blocks: laid.blocks }, deps.waiting ?? null, deps.typesOf, undefined, deps.keysOf));

  const seen = new Set<string>();
  const findings = found.filter((f) => {
    const k = `${f.part}\n${f.rule}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return findings.length > 0 ? { ok: false, findings } : { ok: true, blocks: laid.blocks, look: laid.look };
}

/* ── two refusals for one basis ─────────────────────────────────────────── */

/** How many times a look for one basis is refused before the page is left to its rules. */
export const REFUSALS_MOST = 2;

/** Slash's pref keeping how often a look for a page's basis was refused. Not `headline.`, so no page's line is it. */
export const lookRefusedKey = (page: string): string => `look.refused.${page}`;

/** What the pref holds: the basis the refused looks were composed from, and how many were refused. */
export type Refused = { basis: string; times: number };

/** The kept value read back, or `null` for anything that is not one: a pref is whatever was stored under its key. */
function refusedOf(kept: unknown): Refused | null {
  if (typeof kept !== 'object' || kept === null || Array.isArray(kept)) return null;
  const { basis, times } = kept as { basis?: unknown; times?: unknown };
  if (typeof basis !== 'string' || typeof times !== 'number' || !Number.isInteger(times) || times < 1) return null;
  return { basis, times: Math.min(times, REFUSALS_MOST) };
}

/**
 * Whether a look for this basis is still worth composing: `leave` once `REFUSALS_MOST` were refused for it, so the page
 * stays on its rules until its basis moves, and `rehearse` otherwise, which a new basis always is.
 */
export function refusedFor(basis: string, kept: unknown): 'rehearse' | 'leave' {
  const was = refusedOf(kept);
  return was !== null && was.basis === basis && was.times >= REFUSALS_MOST ? 'leave' : 'rehearse';
}

/** The value to keep after one more refusal for this basis: counted on from the same basis, from one for a new one. */
export function noteRefusal(basis: string, kept: unknown): Refused {
  const was = refusedOf(kept);
  return { basis, times: was !== null && was.basis === basis ? Math.min(was.times + 1, REFUSALS_MOST) : 1 };
}
