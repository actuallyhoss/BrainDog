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

export { BRIEF_MOST, CEILINGS, CONTEXT_BUDGETS };

/** One row of `agentProfiles` (`ProfileView` in `packages/record/src/methods/agent-profile.ts`). */
export type ProfileView = Profile & {
  effective: { says: string; applies: 'token' | 'name' | 'default' };
  heard_at: string | null;
  machines: string[];
};

/** The kinds that always have a row, in this order, whether or not one was heard from yet. */
export const SHOWN_KINDS = ['claude', 'codex', 'cursor', 'other'] as const;

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

/** What each step means, under the control. */
export const LEVEL_LINES: Readonly<Record<Ceiling, string>> = {
  read: 'It reads and changes nothing. Anything it tries to change is refused.',
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
  { name: 'undo', label: 'Undo its changes', group: 'write' },
];

/** The context sizes, as words. */
export const BUDGET_WORDS: Readonly<Record<ContextBudget, string>> = { 400: 'Short', 700: 'Standard', 1200: 'Long' };

/** On finish, as the segmented control says it. */
export const NOTIFY_WORDS: Readonly<Record<ProfileNotify['on'], string>> = { off: 'Never', told: 'When told', long: 'Long runs' };
export const NOTIFY_LINES: Readonly<Record<ProfileNotify['on'], string>> = {
  off: 'It never tells you. Its work is on the Agents page.',
  told: 'When it finishes something you told it to do.',
  long: 'When a run goes on past the minutes you set.',
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
export function draftOf(p: Pick<Profile, 'ceiling' | 'projects' | 'lists_write' | 'tools' | 'brief' | 'model' | 'quiet' | 'caps' | 'notify' | 'context' | 'enforce'>): Draft {
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
  /** The row as the record holds it, or `null` while this agent has none of its own. */
  stored: ProfileView | null;
  /** What applies to it now: its own row, Defaults, or (nothing stored at all) its key. */
  follows: 'own' | 'defaults' | 'key';
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

/** A row's match on a kind alone: no key, no machine. */
const onKind = (p: Profile): string | null => (p.match.kind !== undefined && p.match.token === undefined && p.match.host === undefined ? p.match.kind : null);

/** A heard agent as the record matches it: one of its kinds, else `other`. */
export const kindOfAgent = (agent: string): string => {
  const a = agent.trim().toLowerCase().replace(/^agent:/u, '');
  return (PROFILE_KINDS as readonly string[]).includes(a) ? a : 'other';
};

/**
 * Every row Settings › Agents draws: Claude Code, Codex, Cursor and Other apps always, any other kind he has a row for
 * or was heard from, the rows bound to one key or machine, then Defaults for new agents.
 *
 * `keyScope` answers how far a kind's key reaches (`keyScopeOf` in `record/device.ts`), for an agent that follows it.
 */
export function agentRows(input: {
  profiles: readonly ProfileView[];
  heard: readonly Heard[];
  keyScope: (kind: string) => Ceiling | null;
  nameOf?: (said: string) => string;
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

  const kinds: string[] = [...SHOWN_KINDS];
  const add = (k: string) => {
    if ((PROFILE_KINDS as readonly string[]).includes(k) && !kinds.includes(k)) kinds.push(k);
  };
  for (const h of input.heard) add(kindOfAgent(h.agent));
  for (const p of input.profiles) if (p.id !== DEFAULT_PROFILE_ID && onKind(p) !== null) add(onKind(p)!);

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
    /* NOTHING STORED: ITS KEY DECIDES, and the row it would become starts at Write, which is "what the key allows". */
    const scope = input.keyScope(kind);
    const draft = { ...draftOf(defaults), ceiling: 'write' as const };
    return {
      key: `kind:${kind}`,
      name: kindName(kind),
      kind,
      stored: null,
      follows: 'key',
      may: scope,
      says: scope === null ? 'Nothing set yet; its key decides.' : `${saysOf({ ...draft, ceiling: scope }, nameOf)} Its key decides for now.`,
      applies: 'name',
      draft,
      heard: heardOf(kind),
      machines: [],
    };
  });

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

/**
 * The agents saving Defaults would leave as they are, by name: heard from, with nothing stored for them, so their key
 * decides now. HIS CURRENT AGENTS KEEP WHAT THEY HAVE (§5.2, 12a), as migration 42's data step keeps them, so the
 * first save of Defaults gives each a row of its own first, at Write, which is what its key allows.
 */
export const keepersOf = (rows: readonly AgentRow[]): AgentRow[] => rows.filter((r) => r.follows === 'key' && r.heard !== null && r.kind !== null);

/** The agents that take Defaults as their own once it is saved, by name: no row of their own, and not kept. */
export const followers = (rows: readonly AgentRow[]): string[] => {
  const kept = new Set(keepersOf(rows).map((r) => r.key));
  return rows.filter((r) => r.key !== DEFAULT_PROFILE_ID && r.follows !== 'own' && !kept.has(r.key)).map((r) => r.name);
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
export function argsOf(row: Pick<AgentRow, 'key' | 'kind' | 'stored' | 'name'>, d: Draft): Record<string, unknown> {
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

/** The machines it was heard on, after the line: "kiln-mbp", "kiln-mbp and 1 more", or `null`. */
export function machinesLine(machines: readonly string[]): string | null {
  if (machines.length === 0) return null;
  return machines.length === 1 ? machines[0]! : `${machines[0]!} and ${machines.length - 1} more`;
}
