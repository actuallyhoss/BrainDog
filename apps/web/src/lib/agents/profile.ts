/**
 * Settings › Agents, what it decides with no runes (agents and MCP plan §5): one row per kind of agent he works with,
 * Defaults for new ones last, what each may do said in plain words, and the settings his sheet edits.
 *
 * PURE, SO `node --test` CAN IMPORT IT. `Agents.svelte` reads `agentProfiles` and the runs, `ProfileSheet.svelte` draws
 * a draft, and both hand their facts in here.
 *
 * SETTINGS ONLY NARROW (§10.4), AND ONLY ONCE A ROW IS STORED. An agent with no row of its own follows Defaults when he
 * saved Defaults, and its key otherwise; a row made from an agent that followed its key starts at Write, which is
 * "whatever the key allows" (min(key, Write) is the key), so opening a sheet and saving it never quietly takes more away
 * than he moved. A new agent's Defaults start at Suggest (§5.2, 12a).
 *
 * ONLY HE CHANGES THEM. `setAgentProfile` is ADMIN and refuses every token, so nothing here is drawn for a colleague.
 *
 * A ROW PER CLAUDE CODE PROFILE (migration 44). Where his runs of a kind were under a profile of his own (`studio`, any
 * but `default`), that profile has a row of its own under its kind, "Claude Code as studio": it follows the kind's row
 * until he saves it, and saved it matches `{kind, seat}`, which the record holds nearer than the kind alone.
 */

import {
  BRIEF_MOST,
  CEILINGS,
  CONTEXT_BUDGETS,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  PROFILE_KINDS,
  type Ceiling,
  type ContextBudget,
  type Profile,
  type ProfileCaps,
  type ProfileContext,
  type ProfileEnforce,
  type ProfileNotify,
  type ProfileQuiet,
} from '@braindog/kernel';

import { machineSaid } from '../record/machine-name.ts';

export { BRIEF_MOST, CEILINGS, CONTEXT_BUDGETS };

/** One row of `agentProfiles` (`ProfileView` in `packages/record/src/methods/agent-profile.ts`). */
export type ProfileView = Profile & {
  effective: { says: string; applies: 'token' | 'name' | 'default' };
  heard_at: string | null;
  machines: string[];
  /** The Claude Code profiles it was heard under, by name; absent from a host older than migration 44. */
  seats?: string[];
};

/**
 * The order the usual kinds come in. A KIND HAS A ROW ONLY ONCE IT IS HEARD FROM OR GIVEN A ROW (audit C of 25 October,
 * X15): four rows saying "Not heard from yet" on a new record read as four agents already set up.
 */
export const KIND_ORDER = ['claude', 'codex', 'cursor', 'other'] as const;

/** What the list says while no agent has a row of its own: Defaults alone is not an agent. */
export const noAgentYet = (rows: readonly Pick<AgentRow, 'key'>[]): string | null =>
  rows.some((r) => r.key !== DEFAULT_PROFILE_ID) ? null : 'No agent connected yet';

/** A kind of agent as he reads it. */
export const KIND_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
  other: 'Other apps',
  runner: 'Runner',
  script: 'Scripts',
};

export const kindName = (kind: string): string => KIND_NAMES[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** The three steps of how far an agent may go, as the segmented control and the row's end say them. */
export const LEVEL_WORDS: Readonly<Record<Ceiling, string>> = { read: 'Read', propose: 'Suggest', write: 'Write' };

/** What each step means, under the control: one short line. */
export const LEVEL_LINES: Readonly<Record<Ceiling, string>> = {
  read: 'It reads and changes nothing.',
  propose: 'Every change it wants waits for you in Needs you.',
  write: 'It makes changes itself. Money, keys and deletes still wait for you.',
};

/** The MCP tools he can switch, in plain words, reads first. `context` and `instructions` are how it hears him: always on. */
export type ToolRow = { name: string; label: string; group: 'read' | 'write'; always?: true };
export const TOOL_ROWS: readonly ToolRow[] = [
  { name: 'context', label: 'Read its briefing', group: 'read', always: true },
  { name: 'instructions', label: 'Hear what you tell it', group: 'read', always: true },
  { name: 'record_index', label: 'See what is kept', group: 'read' },
  { name: 'get', label: 'Open one thing', group: 'read' },
  { name: 'list', label: 'Browse lists', group: 'read' },
  { name: 'search', label: 'Search everything', group: 'read' },
  { name: 'activity', label: 'See recent changes', group: 'read' },
  { name: 'governance', label: 'See decisions', group: 'read' },
  { name: 'propose', label: 'Ask you', group: 'write' },
  { name: 'create', label: 'Add things', group: 'write' },
  { name: 'update', label: 'Change things', group: 'write' },
  { name: 'log', label: 'Add notes', group: 'write' },
  { name: 'handoff', label: 'Leave the next step', group: 'write' },
  { name: 'meet', label: 'Note people it meets', group: 'write' },
  { name: 'triage', label: 'File what arrives', group: 'write' },
  { name: 'act', label: 'Do anything the app does', group: 'write' },
];

/** The context sizes, as words. */
export const BUDGET_WORDS: Readonly<Record<ContextBudget, string>> = { 400: 'Short', 700: 'Standard', 1200: 'Long' };

/** On finish, as the segmented control says it. */
export const NOTIFY_WORDS: Readonly<Record<ProfileNotify['on'], string>> = { off: 'Never', told: 'When told', long: 'Long runs' };
/* EACH SAYS WHAT THE CHOSEN SEGMENT LEAVES OUT, never the segment again ("When told" over "When it finishes something
   you told it to do"). */
export const NOTIFY_LINES: Readonly<Record<ProfileNotify['on'], string>> = {
  off: 'Its work still shows on the Agents page.',
  told: 'Only for work you asked it to do.',
  long: 'When a run goes past the minutes you set.',
};
export const NOTIFY_BY_WORDS: Readonly<Record<ProfileNotify['by'], string>> = { push: 'A notification', needs_you: 'Needs you only' };

/** Every half hour of a day, 24-hour, for the quiet hours' two pickers. */
export const TIMES: readonly string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);

/** The quiet hours a sheet offers when they are first turned on. */
export const QUIET_START: ProfileQuiet = { from: '22:00', to: '07:00' };

/** The limits, with the most each takes (the kernel's `fault`). */
export const CAP_MOST: Readonly<Record<keyof ProfileCaps, number>> = { jobs_day: 500, minutes_day: 1440, turns_job: 1000, wrap_hours: 72 };

/** What his sheet edits: a settings row's fields, each filled. */
export type Draft = {
  ceiling: Ceiling;
  projects: string[] | null;
  lists_write: string[] | null;
  /** Only the tools switched off, each `false`. */
  tools: Record<string, boolean>;
  brief: string;
  model: string;
  quiet: ProfileQuiet | null;
  caps: ProfileCaps;
  notify: ProfileNotify;
  context: ProfileContext;
  enforce: ProfileEnforce;
};

/** A draft from a row the record holds or would hold. */
export function draftOf(p: Profile): Draft {
  return {
    ceiling: p.ceiling,
    projects: p.projects === null ? null : [...p.projects],
    lists_write: p.lists_write === null ? null : [...p.lists_write],
    tools: Object.fromEntries(Object.entries(p.tools).filter(([, on]) => on === false)),
    brief: p.brief ?? '',
    model: p.model ?? '',
    quiet: p.quiet === null ? null : { ...p.quiet },
    caps: { ...p.caps },
    notify: { ...p.notify },
    context: { ...p.context },
    enforce: { ...p.enforce },
  };
}

/** Whether two drafts would write the same row. */
export const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify(normal(a)) === JSON.stringify(normal(b));

const sorted = (xs: string[] | null): string[] | null => (xs === null ? null : [...xs].sort());
const normal = (d: Draft) => ({
  ...d,
  projects: sorted(d.projects),
  lists_write: sorted(d.lists_write),
  tools: Object.fromEntries(Object.entries(d.tools).filter(([, on]) => !on).sort()),
  brief: d.brief.trim(),
  model: d.model.trim(),
  caps: Object.fromEntries(Object.entries(d.caps).filter(([, v]) => v !== undefined).sort()),
  notify: d.notify.on === 'long' ? d.notify : { on: d.notify.on, by: d.notify.by },
});

/** One row of Settings › Agents. */
export type AgentRow = {
  /** `kind:claude` for a kind, the stored id for any other row, `default` for Defaults. */
  key: string;
  name: string;
  /** The kind its face draws, or `null` (Defaults, or a row matched on a key alone). */
  kind: string | null;
  /** The Claude Code profile it is for, by name, or `null` for a row on no one profile. */
  seat?: string | null;
  /** The row as the record holds it, or `null` while this agent has none of its own. */
  stored: ProfileView | null;
  /**
   * What applies to it now: its own row, Defaults, (nothing stored at all) its key, or for a profile's row with none of
   * its own, its kind's row.
   */
  follows: 'own' | 'defaults' | 'key' | 'kind';
  /** How far it may go, as the row's end says it; `null` when its key decides and no key of it was read. */
  may: Ceiling | null;
  /** One sentence: what it may do. */
  says: string;
  /** `token`: bound to one key, a hard limit. `name`: matched on what the agent says it is. `default`: Defaults. */
  applies: 'token' | 'name' | 'default';
  /** What the sheet opens with. */
  draft: Draft;
  /** When it was last heard from, the run, and where, or `null`. */
  heard: { at: string; seq: number | null; scope: Heard['scope'] } | null;
  machines: string[];
};

/** An agent heard from in its runs (`heardFrom` in `record/device.ts`), as this file needs it. */
export type Heard = { agent: string; seq: number; seen: string; scope: { spoken: string; name: string; mark: string | null; hue: number | null } | null };

/** A kind of agent heard from under one Claude Code profile (`seatsHeard` in `record/device.ts`): the newest run. */
export type HeardSeat = { agent: string; seat: string; seq: number; seen: string };

const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

/**
 * What a draft lets an agent do, in one sentence: "Writes Tasks and Notes on Kiln; asks for money, keys and deletes,
 * and anything outside that." `nameOf` names a list or a project by its id.
 */
export function saysOf(d: Pick<Draft, 'ceiling' | 'projects' | 'lists_write'>, nameOf: (said: string) => string = (s) => s): string {
  if (d.ceiling === 'read') return 'Reads only; every change is refused.';
  if (d.ceiling === 'propose') return 'Suggests; every change waits for you.';
  const lists = d.lists_write === null ? '' : d.lists_write.length === 0 ? ' nothing on its own' : ` ${LIST.format(d.lists_write.map(nameOf))}`;
  const where = d.projects === null || d.lists_write?.length === 0 ? '' : d.projects.length === 0 ? ' on no project' : ` on ${LIST.format(d.projects.map(nameOf))}`;
  const narrowed = d.lists_write !== null || d.projects !== null;
  return `Writes${lists}${where}; asks for money, keys and deletes${narrowed ? ', and anything outside that' : ''}.`;
}

/** A row's match on a kind alone: no key, no machine, no profile. */
const onKind = (p: Profile): string | null =>
  p.match.kind !== undefined && p.match.token === undefined && p.match.host === undefined && p.match.seat === undefined ? p.match.kind : null;

/** A row's match on a kind under one profile: no key, no machine. */
const onSeat = (p: Profile): { kind: string; seat: string } | null =>
  p.match.kind !== undefined && p.match.seat !== undefined && p.match.token === undefined && p.match.host === undefined ? { kind: p.match.kind, seat: p.match.seat } : null;

/** The profile every Claude Code runs under when nothing names another, which its kind's row covers. */
const DEFAULT_SEAT = 'default';

/** A heard agent as the record matches it: one of its kinds, else `other`. */
export const kindOfAgent = (agent: string): string => {
  const a = agent.trim().toLowerCase().replace(/^agent:/u, '');
  return (PROFILE_KINDS as readonly string[]).includes(a) ? a : 'other';
};

/**
 * Every row Settings › Agents draws: each kind he has a row for or was heard from, the usual four first, the rows
 * bound to one key or machine, then Defaults for new agents.
 *
 * `keyScope` answers how far a kind's key reaches (`keyScopeOf` in `record/device.ts`), for an agent that follows it.
 */
export function agentRows(input: {
  profiles: readonly ProfileView[];
  heard: readonly Heard[];
  keyScope: (kind: string) => Ceiling | null;
  nameOf?: (said: string) => string;
  /** The profiles each kind was heard under (`seatsHeard`); none from a host older than migration 44. */
  seats?: readonly HeardSeat[];
}): AgentRow[] {
  const nameOf = input.nameOf ?? ((s: string) => s);
  const held = input.profiles.find((p) => p.id === DEFAULT_PROFILE_ID) ?? null;
  const defaults: Profile = held ?? DEFAULT_PROFILE;
  const defaultsStored = held !== null && held.created_at !== null;
  const heardOf = (kind: string): AgentRow['heard'] => {
    const h = input.heard.find((x) => kindOfAgent(x.agent) === kind);
    return h ? { at: h.seen, seq: h.seq, scope: h.scope } : null;
  };
  const storedHeard = (p: ProfileView, kind: string | null): AgentRow['heard'] => {
    const fromRuns = kind === null ? null : heardOf(kind);
    if (p.heard_at === null) return fromRuns;
    return fromRuns !== null && fromRuns.at >= p.heard_at ? fromRuns : { at: p.heard_at, seq: null, scope: null };
  };

  const kinds: string[] = [];
  const add = (k: string) => {
    if ((PROFILE_KINDS as readonly string[]).includes(k) && !kinds.includes(k)) kinds.push(k);
  };
  for (const h of input.heard) add(kindOfAgent(h.agent));
  for (const p of input.profiles) if (p.id !== DEFAULT_PROFILE_ID && p.retired_at === null && onKind(p) !== null) add(onKind(p)!);
  const order = (k: string): number => {
    const at = (KIND_ORDER as readonly string[]).indexOf(k);
    return at === -1 ? KIND_ORDER.length : at;
  };
  kinds.sort((a, b) => order(a) - order(b));

  const used = new Set<string>();
  const rows: AgentRow[] = kinds.map((kind) => {
    const own = input.profiles.find((p) => p.id !== DEFAULT_PROFILE_ID && p.retired_at === null && onKind(p) === kind) ?? null;
    if (own) {
      used.add(own.id);
      const draft = draftOf(own);
      return { key: `kind:${kind}`, name: kindName(kind), kind, stored: own, follows: 'own', may: own.ceiling, says: saysOf(draft, nameOf), applies: 'name', draft, heard: storedHeard(own, kind), machines: own.machines };
    }
    if (defaultsStored) {
      const draft = draftOf(defaults);
      return { key: `kind:${kind}`, name: kindName(kind), kind, stored: null, follows: 'defaults', may: defaults.ceiling, says: saysOf(draft, nameOf), applies: 'name', draft, heard: heardOf(kind), machines: [] };
    }
    /* NOTHING STORED: ITS KEY DECIDES, and the row it would become starts at Write, which is "what the key allows". The
       row says what the key allows and no more: that its key decides is said once under the list (`keyDecides`), not on
       every row, and a key not read says nothing rather than "Nothing set yet". */
    const scope = input.keyScope(kind);
    const draft = { ...draftOf(defaults), ceiling: 'write' as const };
    return {
      key: `kind:${kind}`,
      name: kindName(kind),
      kind,
      stored: null,
      follows: 'key',
      may: scope,
      says: scope === null ? '' : saysOf({ ...draft, ceiling: scope }, nameOf),
      applies: 'name',
      draft,
      heard: heardOf(kind),
      machines: [],
    };
  });

  /* A ROW PER PROFILE OF HIS, after the kinds: the ones he saved, then each other profile a kind was heard under, which
     follows its kind's row until he saves it. `default` is the kind's own row. */
  const seats: AgentRow[] = [];
  const seated = new Set<string>();
  for (const p of input.profiles) {
    const at = onSeat(p);
    if (at === null || p.id === DEFAULT_PROFILE_ID || p.retired_at !== null) continue;
    used.add(p.id);
    seated.add(`${at.kind}:${at.seat}`);
    const draft = draftOf(p);
    const heard = input.seats?.find((h) => kindOfAgent(h.agent) === at.kind && h.seat === at.seat);
    seats.push({
      key: p.id,
      name: p.name,
      kind: at.kind,
      seat: at.seat,
      stored: p,
      follows: 'own',
      may: p.ceiling,
      says: saysOf(draft, nameOf),
      applies: 'name',
      draft,
      heard: heard ? { at: heard.seen, seq: heard.seq, scope: null } : p.heard_at === null ? null : { at: p.heard_at, seq: null, scope: null },
      machines: p.machines,
    });
  }
  for (const h of input.seats ?? []) {
    const kind = kindOfAgent(h.agent);
    const parent = rows.find((r) => r.key === `kind:${kind}`);
    if (h.seat === DEFAULT_SEAT || seated.has(`${kind}:${h.seat}`) || parent === undefined) continue;
    seated.add(`${kind}:${h.seat}`);
    seats.push({ ...parent, key: `seat:${kind}:${h.seat}`, name: `${kindName(kind)} as ${h.seat}`, seat: h.seat, stored: null, follows: 'kind', heard: { at: h.seen, seq: h.seq, scope: null }, machines: [] });
  }
  const kindAt = (r: AgentRow): number => kinds.indexOf(r.kind ?? '');
  rows.push(...seats.sort((a, b) => kindAt(a) - kindAt(b) || (a.seat ?? '').localeCompare(b.seat ?? '')));

  /* ROWS BOUND TO ONE KEY OR ONE MACHINE, under their own names, after the kinds. */
  for (const p of input.profiles) {
    if (p.id === DEFAULT_PROFILE_ID || used.has(p.id) || p.retired_at !== null) continue;
    const draft = draftOf(p);
    const kind = p.match.kind ?? null;
    rows.push({ key: p.id, name: p.name, kind, stored: p, follows: 'own', may: p.ceiling, says: saysOf(draft, nameOf), applies: p.match.token !== undefined ? 'token' : 'name', draft, heard: storedHeard(p, kind), machines: p.machines });
  }

  const draft = draftOf(defaults);
  rows.push({
    key: DEFAULT_PROFILE_ID,
    name: 'Defaults for new agents',
    kind: null,
    stored: held !== null && held.created_at !== null ? held : null,
    follows: 'own',
    may: defaults.ceiling,
    says: saysOf(draft, nameOf),
    applies: 'default',
    draft,
    heard: null,
    machines: [],
  });
  return rows;
}

/** What a level lets an agent do with nothing narrowed: the sentence most rows would say, said once under the list. */
export const plainSays = (level: Ceiling): string => saysOf({ ceiling: level, projects: null, lists_write: null });

/**
 * Whether a row's sentence says more than its level: held to some lists or projects. Only those rows draw their sentence;
 * the rest say their level in one word at the row's end, and what the level means is said once under the list.
 */
export const narrowed = (row: Pick<AgentRow, 'may' | 'says'>): boolean => row.may !== null && row.says !== '' && row.says !== plainSays(row.may);

/** Whether any agent follows its key, which the list says once ("Until you set one, an agent does what its key allows."). */
export const keyDecides = (rows: readonly AgentRow[]): boolean => rows.some((r) => r.follows === 'key');

/** One agent and the rows that hang off it as chips: its Claude Code profiles, and rows bound to one of its keys. */
export type AgentGroup = { row: AgentRow; chips: AgentRow[] };

/**
 * THE LIST GROUPED BY AGENT: a kind's row, with each profile of it, and each row bound to
 * one of its keys or machines, as a chip under it, so twenty rows of "Claude Code as studio" read as one agent with
 * four profiles. A row whose kind has no row of its own, and Defaults, stay rows.
 */
export function groupRows(rows: readonly AgentRow[]): AgentGroup[] {
  const heads = new Map(rows.filter((r) => r.kind !== null && r.key === `kind:${r.kind}`).map((r) => [r.kind!, r]));
  const groups: AgentGroup[] = [];
  const at = new Map<AgentRow, AgentGroup>();
  for (const r of rows) {
    const head = r.kind === null || r.key === DEFAULT_PROFILE_ID ? undefined : heads.get(r.kind);
    if (head !== undefined && head !== r) {
      at.get(head)?.chips.push(r);
      continue;
    }
    const g: AgentGroup = { row: r, chips: [] };
    at.set(r, g);
    groups.push(g);
  }
  return groups;
}

/** A chip's words: the profile it is for, else the row's own name less its agent's ("Claude Code as brain" is "brain"). */
export function chipName(row: Pick<AgentRow, 'seat' | 'name' | 'kind'>): string {
  if (row.seat) return row.seat;
  const lead = row.kind === null ? '' : kindName(row.kind);
  for (const join of [' as ', ', ', ' · ', ' '])
    if (lead !== '' && row.name.startsWith(`${lead}${join}`) && row.name.length > lead.length + join.length) return row.name.slice(lead.length + join.length);
  return row.name;
}

/**
 * The agents saving Defaults would leave as they are, by name: heard from, with nothing stored for them, so their key
 * decides now. HIS CURRENT AGENTS KEEP WHAT THEY HAVE (§5.2, 12a), as migration 42's data step keeps them, so the
 * first save of Defaults gives each a row of its own first, at Write, which is what its key allows.
 */
export const keepersOf = (rows: readonly AgentRow[]): AgentRow[] => rows.filter((r) => r.follows === 'key' && r.heard !== null && r.kind !== null);

/** The agents that take Defaults as their own once it is saved, by name: no row of their own, and not kept. */
export const followers = (rows: readonly AgentRow[]): string[] => {
  const kept = new Set(keepersOf(rows).map((r) => r.key));
  return rows.filter((r) => r.key !== DEFAULT_PROFILE_ID && r.follows !== 'own' && r.follows !== 'kind' && !kept.has(r.key)).map((r) => r.name);
};

/** A fault in a draft, before it is sent: the field and the sentence, or `null`. */
export function faultOf(d: Draft): { at: string; fix: string } | null {
  if ([...d.brief].length > BRIEF_MOST) return { at: 'brief', fix: `A brief is at most ${BRIEF_MOST.toLocaleString('en-GB')} characters.` };
  for (const [k, most] of Object.entries(CAP_MOST) as [keyof ProfileCaps, number][]) {
    const v = d.caps[k];
    if (v !== undefined && !(Number.isInteger(v) && v >= 0 && v <= most)) return { at: `caps.${k}`, fix: `A whole number up to ${most.toLocaleString('en-GB')}.` };
  }
  if (d.notify.on === 'long' && !(Number.isInteger(d.notify.minutes) && d.notify.minutes! >= 1 && d.notify.minutes! <= 1440))
    return { at: 'notify.minutes', fix: 'Say after how many minutes, 1 to 1,440.' };
  if (d.model.length > 200) return { at: 'model', fix: 'A model hint is one line.' };
  return null;
}

/**
 * What `setAgentProfile` is sent to save a draft for a row: the row's id when the record holds it (Defaults always by
 * its id), else the kind's name and match, so the first save makes the agent's own row.
 */
export function argsOf(row: Pick<AgentRow, 'key' | 'kind' | 'stored' | 'name'> & { seat?: string | null }, d: Draft): Record<string, unknown> {
  const caps = Object.fromEntries(Object.entries(d.caps).filter(([, v]) => v !== undefined));
  const off = Object.fromEntries(Object.entries(d.tools).filter(([, on]) => on === false));
  const fields = {
    ceiling: d.ceiling,
    projects: d.projects,
    lists_write: d.lists_write,
    tools: Object.keys(off).length === 0 ? null : off,
    brief: d.brief.trim() === '' ? null : d.brief.trim(),
    model: d.model.trim() === '' ? null : d.model.trim(),
    quiet: d.quiet,
    caps: Object.keys(caps).length === 0 ? null : caps,
    notify: d.notify.on === 'long' ? { on: 'long', minutes: d.notify.minutes, by: d.notify.by } : { on: d.notify.on, by: d.notify.by },
    context: d.context,
    enforce: d.enforce,
  };
  if (row.key === DEFAULT_PROFILE_ID) return { id: DEFAULT_PROFILE_ID, ...fields };
  if (row.stored) return { id: row.stored.id, ...fields };
  /* A PROFILE'S FIRST SAVE MAKES ITS OWN ROW, matched on its kind under that profile. */
  if (row.seat) return { name: row.name, match: { kind: row.kind ?? 'other', seat: row.seat }, ...fields };
  return { name: row.kind === null ? row.name : kindName(row.kind), match: { kind: row.kind ?? 'other' }, ...fields };
}

/** Whether a row's agent has Claude Code's hooks, which the stop switch and live push need. Defaults covers Claude too. */
export const hasHooks = (row: Pick<AgentRow, 'key' | 'kind'>): boolean => row.key === DEFAULT_PROFILE_ID || row.kind === 'claude';

/** The meta line under a row's name: "Working now", "Last heard 3 min ago", "Not heard from yet"; none for Defaults. */
export function heardLine(row: Pick<AgentRow, 'heard' | 'key'>, working: boolean, ago: (at: string) => string): string | null {
  if (row.key === DEFAULT_PROFILE_ID) return null;
  if (row.heard === null) return 'Not heard from yet';
  const when = ago(row.heard.at);
  return working ? 'Working now' : `Last heard ${when === '1d ago' ? 'yesterday' : when}`;
}

/** The machines it was heard on, after the line, as a person says them (`machineSaid`): "MacBook Pro", "MacBook Pro and 1 more", or `null`. */
export function machinesLine(machines: readonly string[]): string | null {
  if (machines.length === 0) return null;
  const first = machineSaid(machines[0]!, machines);
  return machines.length === 1 ? first : `${first} and ${machines.length - 1} more`;
}
