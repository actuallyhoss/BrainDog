/**
 * One pass of BrainDog's own update, said once and as nobody's work.
 *
 * THE NIGHT'S UPDATE WRITES AS THE RECORD ITSELF (`system`), one install, carry and question at a time, so Activity read
 * "Installed the Agents add-on" and "Installed the Work add-on" as lines of their own, and a headline that counted who
 * made the newest sixty lines had nowhere to put them but beside the agents. The tick now keeps the stretch of the log
 * one pass wrote (`UpdatePass`, beside the versions in its own pref), and a read of the log folds the record's own lines
 * inside that stretch into one line, `pass`, with every line it folded under it as `steps`, each one still undone on
 * its own. A line somebody else wrote in the same moment is never folded, since only `system` is the pass.
 *
 * WHO DID WHAT IS COUNTED HERE, `byWho`, so the page and an agent read the same number: you, people, agents, rules and
 * the record. The record is `system`, the seed and Slash, and never an agent or a person.
 *
 * NOTHING NAMES A PACK OR A RECORD (§27): a pass is whatever first-party modules were behind, on every record.
 */

import type { Sql } from '@braindog/ports';
import { SEED_ACTOR } from '@braindog/kernel';

/** The passes kept, newest last: a month of nights, so the log a person pages through is folded that far back. */
export const PASSES_KEPT = 31;

/** The kind of the one line a pass is said as. */
export const PASS_KIND = 'update';

/** One pass as the tick keeps it: the log's rowids it wrote, above `from` and up to `to`, and what it did, in names. */
export type UpdatePass = { from: number; to: number; at: string; updated: string[]; asked: string[] };

/** A pass as a line says it: the sentence its first line reads, and how many add-ons and steps it holds. */
export type PassSaid = { said: string; updated: number; asked: number; steps: number; at: string };

/** Who wrote the lines a read answers, counted the one way the page and an agent both read. */
export type ByWho = { you: number; people: number; agents: number; rules: number; record: number };

const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []);

/** The passes a pref holds, newest last, with anything that is not one left out. */
export function passesOf(held: unknown): UpdatePass[] {
  if (!plain(held) || !Array.isArray(held.passes)) return [];
  return held.passes.flatMap((p): UpdatePass[] =>
    plain(p) && Number.isSafeInteger(p.from) && Number.isSafeInteger(p.to) && (p.to as number) > (p.from as number) && typeof p.at === 'string'
      ? [{ from: p.from as number, to: p.to as number, at: p.at, updated: names(p.updated), asked: names(p.asked) }]
      : [],
  );
}

/**
 * The passes to keep after one more, and the oldest go past `PASSES_KEPT`. A pass that wrote nothing is not one, and
 * neither is one that updated and asked about nothing: a night with nothing to update says no line, and a check that
 * stopped partway leaves what it did put in as lines of their own, never under "changed none".
 */
export function passKept(prior: readonly UpdatePass[], pass: UpdatePass): UpdatePass[] {
  const did = pass.updated.length > 0 || pass.asked.length > 0;
  return pass.to > pass.from && did ? [...prior, pass].slice(-PASSES_KEPT) : [...prior];
}

const listed = (all: readonly string[]): string => (all.length === 1 ? all[0]! : `${all.slice(0, -1).join(', ')} and ${all.at(-1)!}`);

/**
 * The pass's first line: how many add-ons, by name, and whether what the person changed was kept. A pass that changed a
 * number is still one closed line, so the line says what it did, never only that it ran.
 */
export function passSentence(pass: Pick<UpdatePass, 'updated' | 'asked'>): string {
  const { updated, asked } = pass;
  const n = updated.length === 1 ? 'one plugin' : `${updated.length} plugins`;
  const did = updated.length > 0 ? `BrainDog updated ${n}: ${listed(updated)}` : "BrainDog checked its own plugins and changed none";
  if (asked.length === 0) return updated.length > 0 ? `${did}, and nothing you changed was lost.` : `${did}.`;
  const held = `${listed(asked)} ${asked.length === 1 ? 'waits' : 'wait'} on Decide, so what you changed is kept`;
  return `${did}. ${held}.`;
}

/**
 * THE RULES THE RECORD ANSWERS FOR ITSELF WITH: `rule:handled` when it settles his own arranging, `rule:additive` and
 * `rule:update` for its own updates. They are the record's, as the page names them (`names.ts`, `OWN_RULE`), and were
 * counted with his rules. The trust ladder keeps its own name, and so its place among the rules.
 */
const OWN_RULES: ReadonlySet<string> = new Set(['rule:handled', 'rule:additive', 'rule:update']);

/** Whose kind an actor is: the reader, a person, an agent, a rule or automation, or the record itself. */
export function whoOf(actor: string, reader: string | null, isRun: (a: string) => boolean = (a) => /^[A-Z]+[1-9][0-9]*$/u.test(a)): keyof ByWho {
  if (actor === 'system' || actor === SEED_ACTOR || actor === 'slash' || OWN_RULES.has(actor)) return 'record';
  if (reader !== null && actor === reader) return 'you';
  if (actor.startsWith('agent:') || isRun(actor)) return 'agents';
  if (/^[a-z][a-z0-9-]*[.:]/u.test(actor)) return 'rules';
  return 'people';
}

/** `byWho` over the lines a read answers: a folded pass is one line, and the record's. */
export function byWhoOf(lines: readonly { actor: string }[], reader: string | null, isRun?: (a: string) => boolean): ByWho {
  const out: ByWho = { you: 0, people: 0, agents: 0, rules: 0, record: 0 };
  for (const l of lines) out[whoOf(l.actor, reader, isRun)] += 1;
  return out;
}

/** The parts of a log line the fold reads and writes. */
type Foldable = { rowid: number; actor: string; kind: string; target: string | null; target_kind: string | null; field: string | null; from?: unknown; to?: unknown; register: string | null; seq: number | null; title: string | null; note?: string | null };

/** A folded pass: the newest step's place in the log, so a read mark taken from it covers the whole pass. */
export type Folded<L> = L & { pass: PassSaid; steps: L[] };

/**
 * The fold, for a walk down the log (newest first): a line `system` wrote inside a kept pass is held, and the held steps
 * are said as one line when the walk leaves the pass, or at the end. One step alone is still one line, so the line a
 * person reads is the same shape whether the night moved one add-on or five.
 *
 * A LINE SOMEBODY ELSE WROTE BETWEEN TWO STEPS IS NEVER FOLDED AND NEVER SPLITS THE PASS. The update awaits between its
 * steps, so a person's edit can land inside the pass's stretch of the log; it used to close the fold there and open a
 * second one for the same pass, and Activity said the night's update twice. It is held beside the steps and said after
 * the pass's one line, which keeps the walk newest first.
 */
export function passFolder<L extends Foldable>(passes: readonly UpdatePass[]): { push: (line: L) => L[]; flush: () => L[] } {
  let held: L[] = [];
  let aside: L[] = [];
  let open: UpdatePass | null = null;
  const passOf = (line: L): UpdatePass | null =>
    line.actor === 'system' ? (passes.find((p) => line.rowid > p.from && line.rowid <= p.to) ?? null) : null;
  const said = (): L[] => {
    const steps = held;
    const between = aside;
    const pass = open;
    held = [];
    aside = [];
    open = null;
    if (pass === null || steps.length === 0) return between;
    const line: Folded<L> = {
      ...steps[0]!,
      kind: PASS_KIND,
      target: null,
      target_kind: null,
      field: null,
      from: null,
      to: pass.updated.length,
      register: null,
      seq: null,
      title: null,
      /* THE SENTENCE AS ITS NOTE TOO, so a reader that knows no pass still says what it did. */
      note: passSentence(pass),
      pass: { said: passSentence(pass), updated: pass.updated.length, asked: pass.asked.length, steps: steps.length, at: pass.at },
      steps,
    };
    return [line, ...between];
  };
  return {
    push(line) {
      const pass = passOf(line);
      if (pass !== null && pass === open) {
        held.push(line);
        return [];
      }
      if (pass === null && open !== null && line.rowid > open.from && line.rowid <= open.to) {
        aside.push(line);
        return [];
      }
      const out = said();
      if (pass === null) return [...out, line];
      open = pass;
      held = [line];
      return out;
    },
    flush: said,
  };
}

/**
 * THE SAME VERSION OF ONE ADD-ON PUT IN TWICE ON ONE DAY BY THE RECORD ITSELF, which is a fault in the tick and never the
 * plain case of two versions shipped that day. Each pack and version with the day and the count, oldest
 * day first; an empty answer is a log with no such day.
 */
export function installedTwice(sql: Sql): { pack: string; version: string; day: string; times: number }[] {
  return sql
    .all<{ target: string; to_v: string; day: string; times: number }>(
      `SELECT target, to_v, substr(ts, 1, 10) AS day, COUNT(*) AS times FROM event
        WHERE kind = 'install' AND target_kind = 'pack' AND actor = 'system' AND to_v IS NOT NULL
        GROUP BY target, to_v, substr(ts, 1, 10) HAVING COUNT(*) > 1 ORDER BY day, target`,
    )
    .map((r) => ({ pack: r.target.replace(/^pack:/u, ''), version: String(r.to_v), day: r.day, times: Number(r.times) }));
}
