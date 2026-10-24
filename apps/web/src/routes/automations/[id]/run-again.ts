/**
 * RUN A RULE AGAIN OVER WHAT IS ALREADY THERE (SHL-D07: re-run every rule over rows a field is still empty
 * on). A rule fires on a write, so one written today has never seen what was written before it. The record's
 * `ruleApply` walks it over the rows already there, `dry` first, and the real press is one batch one Undo takes back.
 *
 * DRY FIRST, AND IN TWO READS. `ruleApply` with `dry` says how many it would fill and how many already hold a value;
 * only the record's `dryRun` of the same body says which other rule got to a row first (`takenBy`, by rule name). Both
 * are reads, and nothing here writes until the owner presses Run.
 *
 * AND THE TRY PANEL'S CONTEST (job 6): a dry run of an inline body answers `won`, `lost` and `takenBy`, said here as
 * one line each by rule name, never by id.
 *
 * PURE, with the call handed in, so `node --test` drives every branch without a socket.
 */

import { humanize } from '../../../lib/record/names.ts';

/** What a record call answers on the wire. */
export type Wire = { ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } };
/** `client.call`, bound to this record. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<Wire>;

/** One other rule that sets the field first, and on how many. `rule` is its handle, said by `nameOf`. */
export type Taken = { rule: string; n: number };

/** The dry run as the sheet says it. `later` is past this press's page; `calls` the calls a bulk run never sends. */
export type Dry = { fill: number; held: number; taken: Taken[]; later: number; calls: number };

/** What the press did, and the batch one Undo takes back when the record says it. */
export type Done = { filled: number; refused: number; firstRefusal: string | null; later: number; batch: string | null };

export type Out<T> = { ok: true; value: T } | { ok: false; fix: string };

export const againWords = {
  offer: (field: string) => `Fill in where ${field} is empty`,
  heading: (field: string) => `Fill in where ${field} is empty`,
  reading: 'Reading what it would do…',
  run: 'Run',
  running: 'Running…',
  cancel: 'Cancel',
  fill: (n: number) => (n === 0 ? 'Nothing would be filled.' : `Would fill ${count(n)}.`),
  held: (n: number) => (n === 1 ? '1 is already set by hand.' : `${count(n)} are already set by hand.`),
  taken: (n: number, name: string) => (n === 1 ? `1 is taken by ${name}.` : `${count(n)} are taken by ${name}.`),
  later: (n: number) => `${count(n)} more wait past this run. Run it again for them.`,
  calls: 'It sends nothing out: a run over what is already there skips its calls.',
  filled: (n: number) => (n === 0 ? 'Nothing was filled.' : `Filled ${count(n)}.`),
  refused: (n: number, fix: string | null) => `${n === 1 ? '1 was' : `${count(n)} were`} refused${fix ? `: ${fix.replace(/\.$/u, '')}` : ''}.`,
  wroteNothing: 'Nothing is changed until you press Run.',
  unreached: 'That did not reach your BrainDog. Nothing was changed.',
  /* THE TRY PANEL'S CONTEST, one line each. */
  first: (n: number) => (n === 1 ? 'First on 1: no other rule got there before it.' : `First on ${count(n)}: no other rule got there before it.`),
  alone: 'No other rule takes any of them first.',
  lost: (n: number, name: string) => `Lost ${count(n)} to ${name}.`,
} as const;

const count = (n: number): string => n.toLocaleString('en');
const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A rule's name for a handle: the page's name for it, else the handle in words. Never the handle itself. */
export const nameFor = (names: ReadonlyMap<string, string>) => (rule: string): string => {
  const bare = rule.startsWith('rule.') ? rule.slice(5) : rule;
  return names.get(bare) ?? names.get(rule) ?? humanize(bare);
};

/**
 * The field an inline rule sets or links, or `null`: a rule that fills none has no gap to fill, and is offered nothing.
 *
 * A LINK FILLS A FIELD TOO. Money's `txn-categorise` files an entry by linking its category (`link: { field }`), not by
 * setting it, so it was offered no Run again, and a filing rule written today never reached the entries before it.
 * `ruleApply` runs a link step as it runs a set one, under the same one batch.
 */
export function fieldOf(body: unknown): string | null {
  if (!isObject(body) || !Array.isArray(body.then)) return null;
  for (const a of body.then) {
    if (isObject(a) && isObject(a.set)) return text(a.set.field);
    if (isObject(a) && isObject(a.link)) return text(a.link.field);
  }
  return null;
}

/** A field's label as its list declares it (`schema`), else its id in words. */
export function labelOf(schema: unknown, field: string): string {
  const fields = isObject(schema) && Array.isArray(schema.fields) ? schema.fields : [];
  const f = fields.find((x) => isObject(x) && x.id === field);
  return (isObject(f) ? (text(f.label) ?? text(f.name)) : null) ?? humanize(field);
}

/** Who took how many, largest first, from a dry run's `takenBy`. */
export function takenOf(raw: unknown): Taken[] {
  if (!isObject(raw) || !isObject(raw.takenBy)) return [];
  return Object.entries(raw.takenBy)
    .map(([rule, n]) => ({ rule, n: whole(n) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n || a.rule.localeCompare(b.rule));
}

/**
 * The sheet's figures from `ruleApply` dry (`applied`) and the `dryRun` of the same body (`tried`, or `null`).
 *
 * A ROW ANOTHER RULE TOOK ALREADY HOLDS ITS VALUE, so it is among `kept`, and the taken counts are held to `kept`: the
 * rest of `kept` is what somebody set by hand. A taken row still empty is filled by this press, which runs this rule
 * alone, so it is said as filled and never as taken.
 */
export function dryOf(applied: unknown, tried: unknown = null): Dry | null {
  if (!isObject(applied) || typeof applied.kept !== 'number') return null;
  const kept = whole(applied.kept);
  let budget = kept;
  const taken: Taken[] = [];
  for (const t of takenOf(tried)) {
    const n = Math.min(t.n, budget);
    if (n === 0) break;
    taken.push({ rule: t.rule, n });
    budget -= n;
  }
  return { fill: whole(applied.filled), held: budget, taken, later: whole(applied.remaining), calls: whole(applied.calls_skipped) };
}

/** The dry run's sentences, in the order a person asks them: how many it fills, what it leaves and why. */
export function dryLines(dry: Dry, nameOf: (rule: string) => string): string[] {
  return [
    againWords.fill(dry.fill),
    ...(dry.held > 0 ? [againWords.held(dry.held)] : []),
    ...dry.taken.map((t) => againWords.taken(t.n, nameOf(t.rule))),
    ...(dry.later > 0 ? [againWords.later(dry.later)] : []),
    ...(dry.calls > 0 ? [againWords.calls] : []),
  ];
}

/** What the press did, from the real `ruleApply` answer. `batch` is the record's, when it says one. */
export function doneOf(raw: unknown): Done | null {
  if (!isObject(raw) || typeof raw.filled !== 'number') return null;
  const refusals = Array.isArray(raw.refusals) ? raw.refusals.filter(isObject) : [];
  return {
    filled: whole(raw.filled),
    refused: refusals.length,
    firstRefusal: refusals.length > 0 ? text(refusals[0]!.fix) : null,
    later: whole(raw.remaining),
    batch: text(raw.batch),
  };
}

/** The press's one sentence, and what it refused or left for next time. */
export function doneSaid(done: Done): string {
  return [
    againWords.filled(done.filled),
    ...(done.refused > 0 ? [againWords.refused(done.refused, done.firstRefusal)] : []),
    ...(done.later > 0 ? [againWords.later(done.later)] : []),
  ].join(' ');
}

const sent = async (call: Call, name: string, args: Record<string, unknown>): Promise<Out<unknown>> => {
  try {
    const out = await call(name, args);
    return out.ok ? { ok: true, value: out.value } : { ok: false, fix: out.refusal.fix };
  } catch {
    return { ok: false, fix: againWords.unreached };
  }
};

/**
 * Read what a run again would do. `body` is the installed rule, for the `dryRun` that names who takes what; a refusal
 * there leaves the taken counts out and keeps the rest, since the fill figure is `ruleApply`'s own.
 */
export async function dryRule(call: Call, id: string, body: unknown = null): Promise<Out<Dry>> {
  const [applied, tried] = await Promise.all([
    sent(call, 'ruleApply', { id, dry: true }),
    isObject(body) ? sent(call, 'dryRun', { rule: body }) : Promise.resolve(null),
  ]);
  if (!applied.ok) return applied;
  const dry = dryOf(applied.value, tried?.ok ? tried.value : null);
  return dry ? { ok: true, value: dry } : { ok: false, fix: againWords.unreached };
}

/** Run it over what is there, as one batch. The value carries `batch` when the record says it, so Undo can take it back. */
export async function applyRule(call: Call, id: string): Promise<Out<Done>> {
  const out = await sent(call, 'ruleApply', { id });
  if (!out.ok) return out;
  const done = doneOf(out.value);
  return done ? { ok: true, value: done } : { ok: false, fix: againWords.unreached };
}

/* ── the try panel's contest ─────────────────────────────────────────── */

/** `won`, `lost` and `takenBy` from a dry run, or `null` when it answers none of them. */
export type Contest = { won: number; lost: number; taken: Taken[] };

export function contestOf(raw: unknown): Contest | null {
  if (!isObject(raw) || (typeof raw.won !== 'number' && typeof raw.lost !== 'number' && !isObject(raw.takenBy))) return null;
  return { won: whole(raw.won), lost: whole(raw.lost), taken: takenOf(raw) };
}

/** One line for what it is first on, and one per rule that takes some first, by name. */
export function contestLines(c: Contest, nameOf: (rule: string) => string): string[] {
  if (c.won === 0 && c.taken.length === 0) return [];
  if (c.taken.length === 0) return [againWords.alone];
  return [...(c.won > 0 ? [againWords.first(c.won)] : []), ...c.taken.map((t) => againWords.lost(t.n, nameOf(t.rule)))];
}
