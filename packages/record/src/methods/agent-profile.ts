/**
 * The settings each kind of agent works under, as Settings › Agents reads and changes them (agents and MCP plan §5,
 * §8.2; the kernel's half is `packages/kernel/src/agent-profile.ts`).
 *
 * `agentProfiles` IS HIS READ: every row, Defaults first, each with what it lets an agent do said as one sentence, how
 * it matches ("applies by name" when only a kind says so, a security boundary when a token does), when an agent it
 * covers was last heard from, and the machines and Claude Code profiles it was heard on. The owner's, since a row names
 * his tokens.
 *
 * `setAgentProfile` IS ADMIN: only he changes what an agent may do, signed in to the app, and every token is refused
 * `NEEDS_BROWSER_SESSION` before the row is read (§10.4). Each change is a line in the log, which the kernel writes.
 */

import type { Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { type Kernel, type Profile, type ProfileRow } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** What one row lets an agent do, worked out for the app: the sentence, and how far its match reaches. */
export type Effective = {
  /** "Writes; asks for money, keys and deletes." */
  says: string;
  /** `token`: bound to one key, a security boundary. `name`: matched on what the agent says it is. `default`: no match. */
  applies: 'token' | 'name' | 'default';
};

/**
 * One row of `agentProfiles`: the settings, what they let an agent do, and who it last covered: when, on which machines
 * and under which Claude Code profiles (`seats`, by name).
 */
export type ProfileView = Profile & { effective: Effective; heard_at: string | null; machines: string[]; seats: string[] };

/** The floors no setting lifts, said the same way on every row and in `whoami` (§5.1). */
export const FLOORS = 'money, keys and deletes are asked';

/** What the person's word lifts of the floors, said after them to a key that may act on it (`wordOf` in `index.ts`). */
export const ON_WORD = 'On their word, passed as said, only money and keys still are.';

/**
 * What a key may do while its owner's "Let agents do everything without asking" is on (`agents.bypass`, `bypassOf` in
 * `index.ts`): the May line `context` says, so the agent acts instead of asking, and knows what still waits.
 */
export const BYPASS_SAYS =
  "The owner lets you do everything without asking: write, delete, money, settings, add-ons, automations, sharing, the team, making keys, imports and exports land at once, each logged with your name and undoable. Still theirs in BrainDog: giving the BrainDog away, deleting it, erasing a person for good, reading a key's value and paying. This holds after reading things from outside BrainDog too, and such a change says so beside it.";

/**
 * The one sentence a row's ceiling, lists and projects come to: "Writes Tasks and Learnings; money, keys and deletes are
 * asked." With `onWord`, for a key that may act on the person's word, it adds what that word lifts (`ON_WORD`): a delete
 * lands on it, money and keys never do (audit 10k, AK6). With `bypass`, for a key whose owner lets agents do everything
 * without asking, the floors are not said at all: `BYPASS_SAYS` follows what the row narrows to.
 */
export function saysOf(p: Pick<Profile, 'ceiling' | 'lists_write' | 'projects'>, nameOf: (list: string) => string = (l) => l, onWord = false, bypass = false): string {
  if (p.ceiling === 'read') return 'Reads only; every change is refused.';
  if (p.ceiling === 'propose') return 'Suggests; every change is asked first.';
  const lists = p.lists_write === null ? '' : ` ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(p.lists_write.map(nameOf))}`;
  const where = p.projects === null ? '' : ` on ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(p.projects)}`;
  if (bypass) return `Writes${lists}${where}${p.lists_write !== null || p.projects !== null ? '; anything outside that is asked' : ''}. ${BYPASS_SAYS}`;
  return `Writes${lists}${where}; ${FLOORS}${p.lists_write !== null || p.projects !== null ? ', and so is anything outside that' : ''}.${onWord ? ` ${ON_WORD}` : ''}`;
}

/** How a row's match reaches. */
export const appliesOf = (p: Pick<Profile, 'id' | 'match'>): Effective['applies'] =>
  p.id === 'default' ? 'default' : p.match.token !== undefined ? 'token' : 'name';

/** When an agent this row covers was last heard from, and on which machines and under which profiles, read off the runs. */
function heardOf(sql: Sql, p: Profile): { heard_at: string | null; machines: string[]; seats: string[] } {
  if (p.id === 'default' || (p.match.kind === undefined && p.match.token === undefined)) return { heard_at: null, machines: [], seats: [] };
  const where: string[] = ["register = 'session'", 'deleted_at IS NULL'];
  const params: string[] = [];
  if (p.match.kind !== undefined) {
    where.push("coalesce(json_extract(fields, '$.agent'), 'other') = ?");
    params.push(p.match.kind);
  }
  if (p.match.token !== undefined) {
    where.push("json_extract(fields, '$.token_id') = ?");
    params.push(p.match.token);
  }
  if (p.match.host !== undefined) {
    where.push("json_extract(fields, '$.host') = ?");
    params.push(p.match.host);
  }
  if (p.match.seat !== undefined) {
    where.push("json_extract(fields, '$.seat') = ?");
    params.push(p.match.seat);
  }
  const heard = sql.one<{ at: string | null }>(`SELECT max(json_extract(fields, '$.last_seen')) AS at FROM entry WHERE ${where.join(' AND ')}`, ...params);
  /* THE FIVE NEWEST HEARD, by the one field asked: the machines, then the profiles. */
  const newest = (field: 'host' | 'seat'): string[] =>
    sql
      .all<{ v: string }>(
        `SELECT json_extract(fields, '$.${field}') AS v, max(json_extract(fields, '$.last_seen')) AS at FROM entry
          WHERE ${where.join(' AND ')} AND json_extract(fields, '$.${field}') IS NOT NULL GROUP BY v ORDER BY at DESC LIMIT 5`,
        ...params,
      )
      .map((r) => r.v);
  return { heard_at: heard?.at ?? null, machines: newest('host'), seats: newest('seat') };
}

/** A row as the app reads it. */
export function viewOf(sql: Sql, kernel: Kernel, p: Profile): ProfileView {
  return { ...p, effective: { says: saysOf(p, (l) => kernel.register(l)?.name ?? l), applies: appliesOf(p) }, ...heardOf(sql, p) };
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, admin, no, tail } = deps;

  return {
    /** Every settings row, Defaults first, each with what it lets an agent do and who it last covered. READ+, the owner's. */
    async agentProfiles(args: { retired?: boolean } | undefined, ctx: CallContext): Promise<Result<ProfileView[]>> {
      const stop = guard(ctx, 'owner');
      if (stop) return { ok: false, refusal: stop };
      const a = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(a).find((k) => k !== 'retired');
      if (stray !== undefined) return no('FIELD_UNKNOWN', `${stray} is not something agentProfiles takes. It takes retired.`, { at: stray, allowed: ['retired'] });
      if (a.retired !== undefined && typeof a.retired !== 'boolean') return no('VALUE_MALFORMED', 'retired is true, to list the retired ones too.', { at: 'retired' });
      const rows = kernel.agentProfiles(a.retired === true);
      /* DEFAULTS IS ALWAYS A ROW, the one the record holds or the one it would hold, so the sheet has it to open. */
      const all = rows.some((p) => p.id === 'default') ? rows : [kernel.profileFor({}), ...rows];
      return ok(all.map((p) => viewOf(sql, kernel, p)));
    },

    /**
     * He makes, changes or retires one settings row (`setProfile`): `id` to change one, absent to make one, every other
     * field as Settings › Agents edits it. ADMIN: an owner in a browser, and no token of any kind.
     *
     * A ROW BOUND TO A TOKEN NAMES ONE THE RECORD HOLDS, so a key typed wrong is refused here and not kept as a row that
     * binds nothing.
     */
    async setAgentProfile(args: ProfileRow | undefined, ctx: CallContext): Promise<Result<ProfileView>> {
      const stop = admin(ctx, 'change what an agent may do');
      if (stop) return { ok: false, refusal: stop };
      if (ctx.principal.kind !== 'person') return no('NEEDS_BROWSER_SESSION', 'Only the owner changes what an agent may do, signed in to BrainDog in a browser.', { at: 'principal' });
      const row = (args ?? {}) as ProfileRow;
      const token = row.match !== null && typeof row.match === 'object' ? (row.match as { token?: unknown }).token : undefined;
      if (typeof token === 'string' && token.trim() !== '' && sql.one<{ id: string }>('SELECT id FROM token WHERE id = ?', token.trim()) === undefined)
        return no('ROW_UNKNOWN', 'There is no key with that id here. Pick one from Connections.', { at: 'match.token' });
      const set = kernel.setProfile(row, ctx.principal.id);
      return tail(set.ok ? ok(viewOf(sql, kernel, set.value)) : set);
    },
  };
}
