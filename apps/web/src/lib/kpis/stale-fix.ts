/**
 * WHAT PUTS A STALE KEY NUMBER RIGHT (the KPI plan of 21 October, 2.3 and K4-B): the button under "Not updated since
 * 30 Sep", on a project's Key numbers and on Today's Numbers rows.
 *
 * KEPT BY AN AGENT, IT ASKS THAT AGENT: "Ask Claude to report it" files an instruction (`instruct`, the agents plan
 * §2.1) to that kind of agent on the number's project, now, so a run working there sees it at its next call and one
 * that starts there later takes it. What it says is plain: which number, where, and when its last reading came in.
 * Only the record's owner tells agents, so anyone else is offered the reading instead.
 *
 * KEPT BY NOBODY'S AGENT, A READING IS ADDED BY HAND: "Add a reading" opens a one-field sheet that writes one row into
 * the readings list (Numbers), under the number's own measure, on its project, now. The list is found by its shape,
 * never named (`tools/gates/web-lists.mjs`): a `name`, an `at`, a `value` or an `amount`, and a link to the projects.
 *
 * PURE, AND NO SVELTE, so `node --test` reads it (`stale-fix.test.ts`).
 */

import { exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { AGENT_NAMES } from '../record/names.ts';
import type { Fields } from '../record/schema.ts';
import { isCurrency, targetOf } from './sheet.ts';

/** A key number as far as its fix reads it: the block's answer (`kpis-in.ts`). */
export type StaleKpi = {
  name: string;
  owner?: string | undefined;
  project?: string | undefined;
  /** The project's handle (`things#1`), which `instruct` takes. */
  spoken?: string | undefined;
  points: readonly { at: string }[];
};

/** What the button does: ask an agent (with the instruction to file), or open the reading sheet. */
export type StaleFix =
  | { kind: 'ask'; label: string; agent: string; name: string; args: { said: string; to: 'agent'; to_agent: string; when: 'now'; project?: string } }
  | { kind: 'add'; label: string };

/** Who may do what here: tell agents (the record's owner), and add a row to the readings list. */
export type FixMay = { tell: boolean; add: boolean };

const KINDS: readonly string[] = Object.keys(AGENT_NAMES);
/** An agent as a person may write it in "Who keeps it": its kind, its name, or the app it runs in. */
const ALSO: Readonly<Record<string, string>> = { 'claude code': 'claude', 'claude-code': 'claude' };

/** The kind of agent a number's owner names (`claude` for "Claude", "Claude Code" or "agent:claude"), or `null`. */
export function agentOf(owner: string | null | undefined): string | null {
  const said = (owner ?? '').trim().toLowerCase().replace(/^agent:/u, '');
  if (said === '') return null;
  if (KINDS.includes(said)) return said;
  if (Object.hasOwn(ALSO, said)) return ALSO[said]!;
  return KINDS.find((k) => AGENT_NAMES[k]!.toLowerCase() === said) ?? null;
}

/** The newest point's instant, or `null` when nothing came in. */
export function lastOf(points: readonly { at: string }[]): string | null {
  let best: string | null = null;
  let t = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/u.test(p.at) ? `${p.at}T00:00:00Z` : p.at);
    if (Number.isFinite(ms) && ms > t) [best, t] = [p.at, ms];
  }
  return best;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as a person says it, "30 Sep", with the year when it is not this one: the day the stale line above it says. */
export function daySaid(at: string, now: number): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/u.test(at) ? `${at}T12:00:00Z` : at);
  const y = d.getUTCFullYear();
  return `${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]!}${y === new Date(now).getUTCFullYear() ? '' : ` ${String(y)}`}`;
}

/**
 * The fix a stale number offers, or `null` when there is none to offer this person: asking its agent when an agent
 * keeps it and they tell agents, else adding a reading when they may.
 */
export function staleFixOf(k: StaleKpi, may: FixMay, at: { now: number }): StaleFix | null {
  const agent = agentOf(k.owner);
  if (agent !== null && may.tell) {
    const last = lastOf(k.points);
    const named = AGENT_NAMES[agent] ?? agent;
    const said = copy.kpiAskSaid(k.name, k.project ?? null, last === null ? null : daySaid(last, at.now));
    const where = k.spoken ?? k.project;
    return { kind: 'ask', label: copy.kpiAskAgent(named), agent: named, name: k.name, args: { said, to: 'agent', to_agent: agent, when: 'now', ...(where ? { project: where } : {}) } };
  }
  return may.add ? { kind: 'add', label: copy.kpiAddReading } : null;
}

/* ── the reading ──────────────────────────────────────────────────────────────────────────────────────────────── */

type FieldShape = { id?: unknown; type?: unknown; to?: unknown; values?: unknown; retired?: unknown };

/**
 * The readings list among `registers`: a `name`, an `at`, a `value` or an `amount`, and a link to `projects`. The key
 * numbers' own list is not one (it has no `at`). `null` when the record keeps none.
 */
export function readingListIn(registers: Readonly<Record<string, { fields?: readonly FieldShape[] }>>, projects: string | null): string | null {
  for (const [id, decl] of Object.entries(registers)) {
    const fields = (Array.isArray(decl?.fields) ? decl.fields : []).filter((f) => f.retired !== true);
    const has = (fid: string, types: readonly string[]): boolean => fields.some((f) => f.id === fid && typeof f.type === 'string' && types.includes(f.type));
    if (!has('name', ['text']) || !has('at', ['instant', 'day', 'date'])) continue;
    if (!has('value', ['decimal', 'int', 'integer', 'number']) && !has('amount', ['money'])) continue;
    if (!fields.some((f) => f.type === 'ref' && (projects === null || f.to === projects))) continue;
    return id;
  }
  return null;
}

/** The field of the readings list that links a reading to its project. */
export function projectFieldOf(fields: readonly FieldShape[], projects: string | null): string | null {
  const f = fields.find((x) => x.type === 'ref' && (projects === null || x.to === projects) && typeof x.id === 'string');
  return f ? (f.id as string) : null;
}

/** The key number's row as the reading reads it: its name, the measure its readings are saved under, and its unit. */
export type ReadingFor = { name: string; measure?: string | null | undefined; unit?: string | null | undefined };

/**
 * The row one typed reading writes: under the number's measure (its name when it says none), on its project, now, as a
 * plain value with its unit or, for money, an amount in minor units of its currency. `source` is `typed` where the list
 * says where a reading came from. A box that is empty or not a number is said, and nothing is written.
 */
export function readingOf(
  k: ReadingFor,
  typed: string,
  at: { project: number; field: string; now: number; sources?: readonly unknown[] | undefined; amount: boolean },
): { ok: true; fields: Fields } | { ok: false; fault: string } {
  const said = typed.trim();
  if (said === '') return { ok: false, fault: copy.kpiReadingEmpty };
  const n = targetOf(said);
  if (n === null) return { ok: false, fault: copy.kpiNotDigits(said) };
  const unit = (k.unit ?? '').trim();
  const money = isCurrency(unit) && at.amount;
  const currency = unit.toUpperCase();
  const measure = (k.measure ?? '').trim() || k.name.trim();
  return {
    ok: true,
    fields: {
      name: measure,
      [at.field]: at.project,
      ...(money ? { amount: { amount: Math.round(n * 10 ** exponentOf(currency)), currency } } : { value: n, ...(unit ? { unit } : {}) }),
      at: new Date(at.now).toISOString(),
      ...(Array.isArray(at.sources) && at.sources.includes('typed') ? { source: 'typed' } : {}),
    },
  };
}
