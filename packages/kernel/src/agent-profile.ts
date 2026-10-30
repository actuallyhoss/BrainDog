/**
 * The settings each kind of agent works under (agents and MCP plan §5, §8.1; migration 42's `agent_profile`).
 *
 * ONE ROW PER KIND OF AGENT, OPTIONALLY PER CONNECTION. A row matches by agent kind (`claude`, `codex`, `cursor`,
 * `runner`, `script`, …), and optionally by token, machine or Claude Code profile (`seat`, migration 44). The nearest
 * match wins: the token, then the profile and the machine with the kind, then the profile with the kind, then the
 * machine with the kind, then the kind, then Defaults (`profileFor`). A row bound to a token is a security boundary;
 * one matched on the kind, the machine or the profile is a claim the client makes of itself, and `by` says which, so
 * the app can label it "applies by name".
 *
 * SETTINGS ONLY NARROW (§10.4). What a run may do is min(token scope, `ceiling`, the ladder's rung) under the floors
 * that no setting lifts; `mayOf` is the first two. Lists and projects outside a row's become questions in the record's
 * guard (wave 2), and an instruction never lifts any of it.
 *
 * ONLY HE EDITS THEM, signed in to the app: `setProfile` takes a person's id, and the record's method refuses every
 * token with `NEEDS_BROWSER_SESSION` before it gets here. A table and not a register, so no token's write path reaches
 * it. Every change is a line in the log (`create` or `edit`, target `agent_profile:<id>`), and a token reads its own
 * row through `whoami`, never writes it.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { SEAT_NAME } from './instruction.ts';
import { jcs } from './jcs.ts';
import { PROFILE_KINDS } from './migrations/0042_agents.ts';

export { PROFILE_KINDS };

/** The scopes a token holds and a row's ceiling takes, narrowest first: Read, Suggest, Write. */
export const CEILINGS = ['read', 'propose', 'write'] as const;
export type Ceiling = (typeof CEILINGS)[number];

/** The context budgets a row may choose, in tokens. 700 is the default. */
export const CONTEXT_BUDGETS = [400, 700, 1200] as const;
export type ContextBudget = (typeof CONTEXT_BUDGETS)[number];

/** The id of the Defaults row, which applies to any agent no other row matches. */
export const DEFAULT_PROFILE_ID = 'default';

/**
 * What a row matches on. A row with no key is Defaults. `seat` is the Claude Code profile a run is under, by name
 * (`studio`), as its run's `seat` says it (migration 44).
 */
export type ProfileMatch = { kind?: string; token?: string; host?: string; seat?: string };

/** Quiet hours, as the record's notification settings keep them: from and to as `HH:MM`, in a zone. */
export type ProfileQuiet = { from: string; to: string; zone?: string };

/** Limits: runner jobs per day, minutes per day and turns per job (enforced); "wrap up after N hours" (soft). */
export type ProfileCaps = { jobs_day?: number; minutes_day?: number; turns_job?: number; wrap_hours?: number };

/** On finish: off, when it took something he told it, or every run over N minutes; by push, or Needs you only. */
export type ProfileNotify = { on: 'off' | 'told' | 'long'; minutes?: number; by: 'push' | 'needs_you' };

/** Context: the budget, and whether tool answers carry the one or two lines of what is new. */
export type ProfileContext = { budget: ContextBudget; lines: boolean };

/** Advanced: the stop switch in Claude Code's hooks, and the opt-in channel. */
export type ProfileEnforce = { hooks: boolean; channel: boolean };

/**
 * One settings row, read whole, every optional column filled with what it means when empty.
 *
 * `projects` and `lists_write` are `null` for all; `tools` holds only the tools switched off (`false`), so a tool added
 * later is on. `by` says how `profileFor` matched it (`token`, `seat`, `host`, `kind` or `default`); a row read by id is
 * `row`.
 */
export type Profile = {
  id: string;
  name: string;
  match: ProfileMatch;
  ceiling: Ceiling;
  projects: string[] | null;
  lists_write: string[] | null;
  tools: Record<string, boolean>;
  brief: string | null;
  model: string | null;
  quiet: ProfileQuiet | null;
  caps: ProfileCaps;
  notify: ProfileNotify;
  context: ProfileContext;
  enforce: ProfileEnforce;
  created_at: string | null;
  updated_at: string | null;
  retired_at: string | null;
  by: 'token' | 'seat' | 'host' | 'kind' | 'default' | 'row';
};

/**
 * What `setProfile` is given: the row's id to change one (absent to make one), and every field it sets. A field left
 * out keeps what the row holds; `null` empties it. `retired: true` retires the row; Defaults cannot be retired.
 */
export type ProfileRow = {
  id?: string | undefined;
  name?: string | undefined;
  match?: ProfileMatch | undefined;
  ceiling?: Ceiling | undefined;
  projects?: string[] | null | undefined;
  lists_write?: string[] | null | undefined;
  tools?: Record<string, boolean> | null | undefined;
  brief?: string | null | undefined;
  model?: string | null | undefined;
  quiet?: ProfileQuiet | null | undefined;
  caps?: ProfileCaps | null | undefined;
  notify?: ProfileNotify | null | undefined;
  context?: ProfileContext | null | undefined;
  enforce?: ProfileEnforce | null | undefined;
  retired?: boolean | undefined;
};

/** Defaults for a new agent: Suggest, every tool on, a 700-token context, told when it took something. */
export const DEFAULT_NOTIFY: ProfileNotify = { on: 'told', by: 'push' };
export const DEFAULT_CONTEXT: ProfileContext = { budget: 700, lines: true };
export const DEFAULT_ENFORCE: ProfileEnforce = { hooks: true, channel: false };

/** The Defaults row as it stands before the record has written one. */
export const DEFAULT_PROFILE: Profile = {
  id: DEFAULT_PROFILE_ID,
  name: 'Defaults for new agents',
  match: {},
  ceiling: 'propose',
  projects: null,
  lists_write: null,
  tools: {},
  brief: null,
  model: null,
  quiet: null,
  caps: {},
  notify: DEFAULT_NOTIFY,
  context: DEFAULT_CONTEXT,
  enforce: DEFAULT_ENFORCE,
  created_at: null,
  updated_at: null,
  retired_at: null,
  by: 'default',
};

/** The longest a brief may be: what every run of the agent reads first, so it is kept to a screen. */
export const BRIEF_MOST = 4_000;

/* ── reading ─────────────────────────────────────────────────────────────── */

type StoredRow = {
  id: string;
  name: string;
  match: string;
  ceiling: string;
  projects: string | null;
  lists_write: string | null;
  tools: string | null;
  brief: string | null;
  model: string | null;
  quiet: string | null;
  caps: string | null;
  notify: string | null;
  context: string | null;
  enforce: string | null;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
};

const COLUMNS = 'id, name, match, ceiling, projects, lists_write, tools, brief, model, quiet, caps, notify, context, enforce, created_at, updated_at, retired_at';

const parse = <T>(s: string | null, fallback: T): T => {
  if (s === null) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function profileOf(r: StoredRow, by: Profile['by']): Profile {
  return {
    id: r.id,
    name: r.name,
    match: parse<ProfileMatch>(r.match, {}),
    ceiling: (CEILINGS as readonly string[]).includes(r.ceiling) ? (r.ceiling as Ceiling) : 'propose',
    projects: parse<string[] | null>(r.projects, null),
    lists_write: parse<string[] | null>(r.lists_write, null),
    tools: parse<Record<string, boolean>>(r.tools, {}),
    brief: r.brief,
    model: r.model,
    quiet: parse<ProfileQuiet | null>(r.quiet, null),
    caps: parse<ProfileCaps>(r.caps, {}),
    notify: { ...DEFAULT_NOTIFY, ...parse<Partial<ProfileNotify>>(r.notify, {}) },
    context: { ...DEFAULT_CONTEXT, ...parse<Partial<ProfileContext>>(r.context, {}) },
    enforce: { ...DEFAULT_ENFORCE, ...parse<Partial<ProfileEnforce>>(r.enforce, {}) },
    created_at: r.created_at,
    updated_at: r.updated_at,
    retired_at: r.retired_at,
    by,
  };
}

/** Every settings row, Defaults first, then by name; retired rows only when asked for. */
export function readProfiles(sql: Sql, retired = false): Profile[] {
  return sql
    .all<StoredRow>(
      `SELECT ${COLUMNS} FROM agent_profile ${retired ? '' : 'WHERE retired_at IS NULL '}ORDER BY id = '${DEFAULT_PROFILE_ID}' DESC, name, id`,
    )
    .map((r) => profileOf(r, 'row'));
}

/** One row by id, retired or not, or null. */
export function profileById(sql: Sql, id: string): Profile | null {
  const r = sql.one<StoredRow>(`SELECT ${COLUMNS} FROM agent_profile WHERE id = ?`, id);
  return r ? profileOf(r, 'row') : null;
}

const said = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Who an agent is, as `profileFor` matches it: its kind, its token, its machine and its Claude Code profile. */
export type ProfileWho = {
  kind?: string | null | undefined;
  token?: string | null | undefined;
  host?: string | null | undefined;
  seat?: string | null | undefined;
};

/**
 * The row an agent works under (`profileFor` in §8.3): the nearest live match for what it is, a token row first, then
 * the profile and the machine with the kind, then the profile with the kind, then the machine with the kind, then the
 * kind alone, then Defaults (the stored row, else `DEFAULT_PROFILE`). A row that names a key the caller did not say is
 * never a match: a row for `{kind: claude, host: MacBook}` does not apply to Claude on another machine, and one for
 * `{kind: claude, seat: studio}` not to Claude under another profile.
 */
export function profileFor(sql: Sql, who: ProfileWho): Profile {
  const kind = said(who.kind);
  const token = said(who.token);
  const host = said(who.host);
  const seat = said(who.seat);
  const live = readProfiles(sql);
  const fits = (m: ProfileMatch): boolean =>
    (m.kind === undefined || m.kind === kind) &&
    (m.token === undefined || m.token === token) &&
    (m.host === undefined || m.host === host) &&
    (m.seat === undefined || m.seat === seat);
  const pick = (by: Exclude<Profile['by'], 'row'>, test: (m: ProfileMatch) => boolean): Profile | null => {
    const row = live.find((p) => p.id !== DEFAULT_PROFILE_ID && fits(p.match) && test(p.match));
    return row ? { ...row, by } : null;
  };
  const onKind = (m: ProfileMatch): boolean => m.token === undefined && m.kind !== undefined;
  return (
    (token !== null ? pick('token', (m) => m.token !== undefined) : null) ??
    (seat !== null && host !== null && kind !== null ? pick('seat', (m) => onKind(m) && m.seat !== undefined && m.host !== undefined) : null) ??
    (seat !== null && kind !== null ? pick('seat', (m) => onKind(m) && m.seat !== undefined && m.host === undefined) : null) ??
    (host !== null && kind !== null ? pick('host', (m) => onKind(m) && m.seat === undefined && m.host !== undefined) : null) ??
    (kind !== null ? pick('kind', (m) => onKind(m) && m.seat === undefined && m.host === undefined) : null) ?? {
      ...(live.find((p) => p.id === DEFAULT_PROFILE_ID) ?? DEFAULT_PROFILE),
      by: 'default',
    }
  );
}

/** The narrower of a token's scope and a row's ceiling: what an agent may do before the ladder and the floors. */
export function mayOf(scope: Ceiling, ceiling: Ceiling): Ceiling {
  return CEILINGS[Math.min(CEILINGS.indexOf(scope), CEILINGS.indexOf(ceiling))]!;
}

/** Whether a tool is on for a row: every tool is, unless the row switched it off. */
export const toolOn = (p: Pick<Profile, 'tools'>, tool: string): boolean => p.tools[tool] !== false;

/* ── writing ─────────────────────────────────────────────────────────────── */

/** What `setProfile` writes through: the record's clock, an id minter, and its log. */
export type ProfileDeps = { sql: Sql; now: string; mint: () => string };

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim() !== '');
const whole = (v: unknown, most: number): boolean => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= most);
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** The first thing wrong with a row as given, or null. */
function fault(row: ProfileRow, isDefault: boolean): Result<never> | null {
  const bad = (at: string, fix: string, code = 'VALUE_MALFORMED') => no<never>(code, fix, { at });
  if (row.name !== undefined && (typeof row.name !== 'string' || row.name.trim() === '' || row.name.length > 80))
    return bad('name', 'A settings row has a name of up to 80 characters, "MacBook · Claude Code".');
  if (row.match !== undefined) {
    const m = row.match as Record<string, unknown> | null;
    if (m === null || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some((k) => !['kind', 'token', 'host', 'seat'].includes(k)))
      return bad('match', 'match names a kind, a token, a machine or a profile: {kind, token, host, seat}.');
    for (const k of ['kind', 'token', 'host', 'seat'] as const)
      if (m[k] !== undefined && (typeof m[k] !== 'string' || (m[k] as string).trim() === '')) return bad(`match.${k}`, `match.${k} is a name, not empty.`);
    if (m.seat !== undefined && !SEAT_NAME.test((m.seat as string).trim()))
      return bad('match.seat', 'match.seat is a profile as its runs name it, like studio or default: a name, never a folder.');
    if (m.kind !== undefined && !(PROFILE_KINDS as readonly string[]).includes(m.kind as string))
      return no('ENUM_VALUE_UNKNOWN', `match.kind is one of ${PROFILE_KINDS.join(', ')}.`, { at: 'match.kind', allowed: PROFILE_KINDS });
    if (isDefault && Object.keys(m).length > 0) return bad('match', 'Defaults applies to every agent no other row matches, so it matches on nothing.');
    if (!isDefault && Object.keys(m).length === 0) return bad('match', 'Say what this row applies to: a kind of agent, a token or a machine.', 'REQUIRED_MISSING');
    if (!isDefault && m.host !== undefined && m.kind === undefined && m.token === undefined)
      return bad('match', 'A machine is matched with a kind of agent on it: {kind, host}.');
    if (!isDefault && m.seat !== undefined && m.kind === undefined && m.token === undefined)
      return bad('match', 'A profile is matched with the kind of agent under it: {kind, seat}.');
  }
  if (row.ceiling !== undefined && !(CEILINGS as readonly string[]).includes(row.ceiling))
    return no('ENUM_VALUE_UNKNOWN', `ceiling is one of ${CEILINGS.join(', ')}.`, { at: 'ceiling', allowed: CEILINGS });
  for (const k of ['projects', 'lists_write'] as const) if (row[k] !== undefined && row[k] !== null && !strings(row[k])) return bad(k, `${k} is a list of names, or null for all.`);
  if (row.tools !== undefined && row.tools !== null) {
    const t = row.tools as Record<string, unknown>;
    if (typeof t !== 'object' || Array.isArray(t) || Object.values(t).some((v) => typeof v !== 'boolean'))
      return bad('tools', 'tools switches a tool on or off by name: {"create": false}.');
  }
  if (row.brief !== undefined && row.brief !== null && (typeof row.brief !== 'string' || [...row.brief].length > BRIEF_MOST))
    return bad('brief', `A brief is text of up to ${String(BRIEF_MOST)} characters.`, 'OUT_OF_BOUNDS');
  if (row.model !== undefined && row.model !== null && (typeof row.model !== 'string' || row.model.length > 200)) return bad('model', 'A model hint is a line of text.');
  if (row.quiet !== undefined && row.quiet !== null) {
    const q = row.quiet as Partial<ProfileQuiet>;
    if (typeof q !== 'object' || !HHMM.test(String(q.from)) || !HHMM.test(String(q.to)) || (q.zone !== undefined && typeof q.zone !== 'string'))
      return bad('quiet', 'Quiet hours are {from: "22:00", to: "07:00"}, with a zone if not this BrainDog’s.');
  }
  if (row.caps !== undefined && row.caps !== null) {
    const c = row.caps as Record<string, unknown>;
    if (typeof c !== 'object' || Object.keys(c).some((k) => !['jobs_day', 'minutes_day', 'turns_job', 'wrap_hours'].includes(k)))
      return bad('caps', 'Limits are jobs_day, minutes_day, turns_job and wrap_hours, each a whole number.');
    if (!whole(c.jobs_day, 500) || !whole(c.minutes_day, 1440) || !whole(c.turns_job, 1000) || !whole(c.wrap_hours, 72))
      return bad('caps', 'Each limit is a whole number: up to 500 jobs or 1,440 minutes a day, 1,000 turns a job, 72 hours.', 'OUT_OF_BOUNDS');
  }
  if (row.notify !== undefined && row.notify !== null) {
    const n = row.notify as Partial<ProfileNotify>;
    if (typeof n !== 'object' || !['off', 'told', 'long'].includes(String(n.on)) || !['push', 'needs_you'].includes(String(n.by)))
      return bad('notify', 'On finish is {on: off | told | long, by: push | needs_you}, with minutes for long.');
    if (n.on === 'long' && !(Number.isInteger(n.minutes) && (n.minutes as number) >= 1 && (n.minutes as number) <= 1440))
      return bad('notify.minutes', 'Say after how many minutes a run counts as long, 1 to 1,440.', 'OUT_OF_BOUNDS');
  }
  if (row.context !== undefined && row.context !== null) {
    const c = row.context as Partial<ProfileContext>;
    if (typeof c !== 'object' || !(CONTEXT_BUDGETS as readonly number[]).includes(c.budget as number) || typeof c.lines !== 'boolean')
      return bad('context', `Context is {budget: ${CONTEXT_BUDGETS.join(' | ')}, lines: true | false}.`);
  }
  if (row.enforce !== undefined && row.enforce !== null) {
    const e = row.enforce as Partial<ProfileEnforce>;
    if (typeof e !== 'object' || typeof e.hooks !== 'boolean' || typeof e.channel !== 'boolean')
      return bad('enforce', 'Advanced is {hooks: true | false, channel: true | false}.');
  }
  return null;
}

/** A match with only the keys it names, each trimmed, so `{kind: 'claude', host: undefined}` is `{kind: 'claude'}`. */
function cleanMatch(m: ProfileMatch): ProfileMatch {
  const out: ProfileMatch = {};
  for (const k of ['kind', 'token', 'host', 'seat'] as const) if (typeof m[k] === 'string') out[k] = m[k].trim();
  return out;
}

const json = (v: unknown): string | null => (v === null || v === undefined ? null : jcs(v as never));

/**
 * Make, change or retire one settings row (`setProfile` in §8.3), `by` being the person who did it in the app.
 *
 * ONE LINE IN THE LOG PER CHANGE: `create` with the row, or `edit` with the row before and after, target
 * `agent_profile:<id>`, signed by `by`. A change that changes nothing writes nothing. Two live rows may not match on
 * the same thing, because then neither would be the nearest. Answers the row as it now stands.
 */
export function setProfile(d: ProfileDeps, row: ProfileRow, by: string): Result<Profile> {
  if (typeof by !== 'string' || !by.startsWith('p_'))
    return no('NEEDS_BROWSER_SESSION', 'Only the owner changes what an agent may do, signed in to BrainDog in a browser.', { at: 'by' });
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return no('VALUE_MALFORMED', 'A settings row is an object of its fields.', { at: 'row' });
  const id = said(row.id ?? null);
  const was = id === null ? null : profileById(d.sql, id);
  if (id !== null && !was && id !== DEFAULT_PROFILE_ID) return no('ROW_UNKNOWN', `There is no settings row called ${id}.`, { at: 'id' });
  const isDefault = id === DEFAULT_PROFILE_ID;
  const wrong = fault(row, isDefault);
  if (wrong) return wrong;
  if (isDefault && row.retired === true) return no('FORBIDDEN', 'Defaults cannot be retired: some agent always needs a row.', { at: 'retired' });
  const base: Profile = was ?? { ...DEFAULT_PROFILE, ...(isDefault ? {} : { id: '', name: '' }) };
  if (!was && !isDefault && (row.name === undefined || row.match === undefined))
    return no('REQUIRED_MISSING', 'A new settings row has a name and says what it applies to (match).', { at: row.name === undefined ? 'name' : 'match' });

  const next = {
    id: was?.id ?? (isDefault ? DEFAULT_PROFILE_ID : d.mint()),
    name: row.name !== undefined ? row.name.trim() : base.name,
    match: row.match !== undefined ? cleanMatch(row.match) : base.match,
    ceiling: row.ceiling ?? base.ceiling,
    projects: row.projects !== undefined ? row.projects : base.projects,
    lists_write: row.lists_write !== undefined ? row.lists_write : base.lists_write,
    tools: row.tools !== undefined ? (row.tools ?? {}) : base.tools,
    brief: row.brief !== undefined ? said(row.brief) : base.brief,
    model: row.model !== undefined ? said(row.model) : base.model,
    quiet: row.quiet !== undefined ? row.quiet : base.quiet,
    caps: row.caps !== undefined ? (row.caps ?? {}) : base.caps,
    notify: row.notify !== undefined ? (row.notify ?? DEFAULT_NOTIFY) : base.notify,
    context: row.context !== undefined ? (row.context ?? DEFAULT_CONTEXT) : base.context,
    enforce: row.enforce !== undefined ? (row.enforce ?? DEFAULT_ENFORCE) : base.enforce,
    retired_at: row.retired === true ? (base.retired_at ?? d.now) : row.retired === false ? null : base.retired_at,
  };
  if (next.retired_at === null) {
    const key = jcs(next.match as never);
    const twin = readProfiles(d.sql).find((p) => p.id !== next.id && jcs(p.match as never) === key);
    if (twin) return no('UNIQUE_VIOLATION', `${twin.name} already applies to the same agents; change that row instead.`, { at: 'match' });
  }
  const stored = {
    id: next.id,
    name: next.name,
    match: jcs(next.match as never),
    ceiling: next.ceiling,
    projects: json(next.projects),
    lists_write: json(next.lists_write),
    tools: Object.keys(next.tools).length === 0 ? null : json(next.tools),
    brief: next.brief,
    model: next.model,
    quiet: json(next.quiet),
    caps: Object.keys(next.caps).length === 0 ? null : json(next.caps),
    notify: json(next.notify),
    context: json(next.context),
    enforce: json(next.enforce),
    retired_at: next.retired_at,
  };
  const before = was ? shown(was) : null;
  const after = shown(profileOf({ ...stored, created_at: was?.created_at ?? d.now, updated_at: d.now }, 'row'));
  if (before !== null && before === after) return ok(was!);
  return d.sql.transactionSync((): Result<Profile> => {
    d.sql.exec(
      `INSERT INTO agent_profile (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, match = excluded.match, ceiling = excluded.ceiling,
         projects = excluded.projects, lists_write = excluded.lists_write, tools = excluded.tools, brief = excluded.brief,
         model = excluded.model, quiet = excluded.quiet, caps = excluded.caps, notify = excluded.notify,
         context = excluded.context, enforce = excluded.enforce, updated_at = excluded.updated_at, retired_at = excluded.retired_at`,
      stored.id,
      stored.name,
      stored.match,
      stored.ceiling,
      stored.projects,
      stored.lists_write,
      stored.tools,
      stored.brief,
      stored.model,
      stored.quiet,
      stored.caps,
      stored.notify,
      stored.context,
      stored.enforce,
      was?.created_at ?? d.now,
      d.now,
      stored.retired_at,
    );
    const note = row.retired === true && !was?.retired_at ? 'retired' : row.retired === false && was?.retired_at ? 'brought back' : null;
    d.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, note) VALUES (?, ?, ?, ?, ?, 'agent_profile', ?, ?, ?)",
      d.mint(),
      d.now,
      by,
      was ? 'edit' : 'create',
      `agent_profile:${stored.id}`,
      before,
      after,
      note,
    );
    return ok(profileById(d.sql, stored.id)!);
  });
}

/** A row as its log line holds it: every setting, without its clock. */
function shown(p: Profile): string {
  const { created_at: _c, updated_at: _u, by: _b, ...rest } = p;
  return jcs(rest as never);
}
