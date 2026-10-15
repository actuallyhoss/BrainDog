/**
 * One step of an automation tested alone (SHL-D14): the ask the card's "Test this step" sends, and the answers an
 * earlier test gave that a later step's token picker offers.
 *
 * THE EARLIER STEPS ARE NOT TAKEN AGAIN WHERE AN ANSWER OF THEIRS IS IN HAND. Step three of a flow whose second step is
 * a call would otherwise stop at the call every time, since a try sends nothing; with the call's answer from an earlier
 * test given back, the record runs step three over it (`packages/kernel/src/flow-try.ts`, `TryOptions`).
 *
 * WHAT THE RECORD WITHHELD OR CUT IS NEVER GIVEN BACK. A `--withheld--` in place of a secret, or an answer cut at 4 KB,
 * is not what the step gave, and a step run over it would write the mark or half a document; the record takes that step
 * again for real instead.
 */

import type { Body } from './flow.ts';
import type { TriedStep, TryOne, TryRun } from './source.ts';

/** What the record writes in place of a value it keeps secret (`packages/kernel/src/figure.ts`, `WITHHELD`). */
export const WITHHELD = '--withheld--';

/** The most tokens one earlier test offers a later step's picker. */
export const TOKENS_MOST = 40;

/** One answer an earlier step gave, as a later step reads it: the path, the braces it is written with, and the sample. */
export type StepToken = { path: string; token: string; sample: string };

/** One step of the draft as the runner lays them out: its path (`steps[1].then[0]`) and the name it keeps an answer under. */
type Placed = { at: string; as: string | null };

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * The draft's steps in the order the runner meets them, walked as the kernel's `plan` walks them, so each path here is
 * the path the record's try answers with.
 */
export function placed(draft: Body): Placed[] {
  const out: Placed[] = [];
  const root = Array.isArray(draft.steps) ? 'steps' : 'then';
  const walk = (list: unknown, at: string) => {
    if (!Array.isArray(list)) return;
    for (const [i, step] of list.entries()) {
      if (!isObject(step)) continue;
      const here = `${at}[${i}]`;
      if ('if' in step) {
        out.push({ at: here, as: null });
        walk(step.then, `${here}.then`);
        walk(step.else, `${here}.else`);
        continue;
      }
      /* A `set_var` KEEPS ITS ANSWER UNDER `name:`, every other verb under `as:`; a key beside the verb holds neither. */
      const kept = isObject(step.set_var) ? step.set_var.name : Object.values(step).find((v): v is Record<string, unknown> => isObject(v) && typeof v.as === 'string')?.as;
      out.push({ at: here, as: typeof kept === 'string' && kept !== '' ? kept : null });
    }
  };
  walk(draft[root], root);
  return out;
}

/** Whether an earlier step's `out` is an answer to hand back: taken, whole, and nothing withheld in it. */
function reusable(step: TriedStep): boolean {
  if (step.state !== 'done' || step.out === undefined || step.cut === true) return false;
  const holds = (v: unknown): boolean => (v === WITHHELD ? true : Array.isArray(v) ? v.some(holds) : isObject(v) ? Object.values(v).some(holds) : false);
  return !holds(step.out);
}

/**
 * The ask for testing the step at `path` alone: the path, and the answers of the steps before it that an earlier test
 * gave, by the name each keeps them under. A step the draft no longer has before `path` gives nothing, so an answer
 * from a step since moved below is not handed to the steps above it.
 */
export function tryStep(draft: Body, path: string, earlier: readonly TriedStep[]): TryOne {
  const steps = placed(draft);
  const upTo = steps.findIndex((s) => s.at === path);
  const before = new Map(steps.slice(0, Math.max(0, upTo)).flatMap((s) => (s.as === null ? [] : [[s.at, s.as] as const])));
  const given: Record<string, unknown> = {};
  for (const step of earlier) {
    const name = before.get(step.path);
    if (name !== undefined && reusable(step)) given[name] = step.out;
  }
  return Object.keys(given).length === 0 ? { step: path } : { step: path, given };
}

/** A value as a token's sample: text as it is, anything else as its JSON, cut to a line. */
const sampleOf = (v: unknown): string => {
  const text = typeof v === 'string' ? v : (JSON.stringify(v) ?? '');
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};

/**
 * The fields of the answers an earlier test gave, as tokens a later step may write (`{{vars.<as>.<field>}}`): an
 * answer that is an object gives one token a field, two levels down at most, and any other answer gives one token for
 * itself. A withheld field gives none. At most `TOKENS_MOST`, in the order the steps ran.
 */
export function tokensFrom(tried: TryRun | readonly TriedStep[]): StepToken[] {
  const steps = Array.isArray(tried) ? (tried as readonly TriedStep[]) : (tried as TryRun).steps;
  const out: StepToken[] = [];
  const seen = new Set<string>();
  const add = (path: string, v: unknown) => {
    if (out.length >= TOKENS_MOST || seen.has(path) || v === WITHHELD) return;
    seen.add(path);
    out.push({ path, token: `{{${path}}}`, sample: sampleOf(v) });
  };
  const walk = (path: string, v: unknown, depth: number) => {
    if (isObject(v) && depth < 2) for (const [k, x] of Object.entries(v)) walk(`${path}.${k}`, x, depth + 1);
    else add(path, v);
  };
  for (const step of steps) {
    if (step.state !== 'done' || step.out === undefined || step.as === undefined || step.cut === true) continue;
    walk(`vars.${step.as}`, step.out, 0);
  }
  return out;
}

/** The step a one-step try tested, or `null` for a whole try. */
export const testedOf = (t: TryRun): TriedStep | null => (t.step === undefined ? null : (t.steps.find((s) => s.path === t.step) ?? null));

/** An answer drawn folded under its step: text as it is, anything else as JSON laid out two spaces a level. */
export const outText = (v: unknown): string => (typeof v === 'string' ? v : (JSON.stringify(v, null, 2) ?? ''));
