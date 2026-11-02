/**
 * WHAT AN AGENT ACTING FOR A COLLEAGUE CAN REACH, IN ONE PLAIN SENTENCE: "You act for Sam and can view Kiln. Amounts
 * are hidden from you." It read "You act for Cole: everything, edit", a list of labels rather than something said
 * (MCP check of 2 November). `context` says it beside May, so an agent knows before its first read why a list it expected is not
 * there, and that a figure it does not see is hidden from it rather than missing.
 *
 * FROM THE CALLER'S OWN CONTEXT, the lens the door merged, and never from anything the agent sent: its shares by what
 * each is about and its rung, its role on the whole record, the lists a legacy grant names, and whether fields are
 * hidden. An owner's agent is told nothing here, since it reaches everything; nor is a person, who reads it on the
 * Sharing page.
 *
 * NAMES, NEVER IDS. A list, a project or a person the namer does not know is said as the share sentences say it.
 */

import { shareSubjectOf, shareTargetReaches, type HeldShare, type LensCatalog, type ShareNames } from '@braindog/kernel';

import type { CallContext } from './index.ts';

/** The most things the line names before it counts the rest. */
export const ACTS_FOR_NAMED = 3;

/** A rung or a level as the verb the sentence says it with: "can view Kiln", "can add to Tasks". */
const RUNG: Readonly<Record<string, string>> = {
  view: 'view',
  read: 'view',
  comment: 'comment on',
  propose: 'comment on',
  append: 'add to',
  edit: 'edit',
  write: 'edit',
  manage: 'manage',
  decide: 'run',
};

/** "Kiln", "Kiln and Tasks", "Kiln, Tasks and Notes". */
const andJoined = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);

/**
 * The line, or `null` where there is nothing to say: a caller that is no agent, or the agent of an owner.
 *
 * `shares` are the person's live shares as the lens read them (their groups' among them); only the allows the lens
 * says reached something (`ctx.grant.via`) are named, when it says.
 */
export function actsFor(ctx: CallContext, catalog: LensCatalog, names: ShareNames, shares: readonly HeldShare[]): string | null {
  const p = ctx.principal;
  if (p.kind !== 'token' || p.level === 'owner') return null;
  const who = names.person?.(p.person) ?? 'someone';
  const listName = (id: string): string => names.list?.(id) ?? catalog.lists.find((l) => l.id === id)?.name ?? 'a list';
  /* EACH THING IT REACHES, WITH THE VERB ITS RUNG GIVES, so the sentence can group them: "can edit Kiln and Tasks, and
     view Notes". */
  const parts: { what: string; verb: string }[] = [];
  const verbOf = (rung: string): string => RUNG[rung] ?? rung;

  /* THE SHARES FIRST, each as what it is about and its rung. */
  const via = ctx.grant?.via;
  const live = shares.filter((s) => s.effect === 'allow' && !s.revoked_at && (via === undefined || via.includes(s.id)));
  for (const s of live) parts.push({ what: shareSubjectOf(s.what, names), verb: verbOf(s.can) });

  /* THEN THE ROLE: the whole record at its rung, or the lists a legacy grant names, each at its own. */
  const level = p.level;
  const ceiling = Array.isArray(ctx.registers) ? (ctx.registers as readonly string[]) : null;
  if (level !== null && ceiling === null) parts.push({ what: 'everything', verb: verbOf(level) });
  const shared = new Set(live.flatMap((s) => listsOf(s, catalog)));
  for (const [list, held] of Object.entries(ctx.levels ?? {})) {
    if (shared.has(list) || (ceiling === null && held === level)) continue;
    const what = ctx.wheres?.[list] !== undefined ? `some rows of ${listName(list)}` : listName(list);
    parts.push({ what, verb: verbOf(held) });
  }

  const hidden = hiddenSaid(ctx, catalog);
  const tail = hidden === null ? '' : ` ${hidden}`;
  if (parts.length === 0) return `You act for ${who} and can reach nothing yet.${tail}`;

  /* THE MOST IT NAMES, THEN A COUNT: "and 2 more". */
  const shown = parts.length > ACTS_FOR_NAMED + 1 ? parts.slice(0, ACTS_FOR_NAMED) : parts;
  const more = parts.length - shown.length;
  const byVerb = new Map<string, string[]>();
  for (const { what, verb } of shown) byVerb.set(verb, [...(byVerb.get(verb) ?? []), what]);
  const clauses = [...byVerb].map(([verb, whats]) => `${verb} ${andJoined(whats)}`);
  const reach = clauses.length === 1 ? clauses[0]! : `${clauses.slice(0, -1).join(', ')}, and ${clauses.at(-1)!}`;
  return `You act for ${who} and can ${reach}${more > 0 ? `, and ${String(more)} more` : ''}.${tail}`;
}

/** "Amounts are hidden from you." when every hidden field is an amount, "Some fields are hidden from you." when any other is, or `null`. */
function hiddenSaid(ctx: CallContext, catalog: LensCatalog): string | null {
  const hides = Object.entries(ctx.hides ?? {}).filter(([, fs]) => fs.length > 0);
  if (hides.length === 0) return null;
  const money = hides.every(([list, fs]) => {
    const l = catalog.lists.find((x) => x.id === list);
    return fs.every((f) => l?.fields.find((x) => x.id === f)?.type === 'money');
  });
  return money ? 'Amounts are hidden from you.' : 'Some fields are hidden from you.';
}

/** The lists a share reaches any row of, so a list it covers is not said a second time from the levels it gave. */
const listsOf = (s: HeldShare, catalog: LensCatalog): string[] => catalog.lists.filter((l) => shareTargetReaches(s.what, l)).map((l) => l.id);
