/**
 * Writing a job kind in the app: `/agents/new-kind`, opened from "Run a job".
 *
 * THE SAME ROAD AN AGENT TAKES, AND NO NEW METHOD. A kind is a `job` declaration, and it is filed with `propose` as a
 * `change` to `job.<id>`, exactly the body an agent's change carries, so "Run a job" reads it back from the accepted
 * change (`kindsIn` in `record/jobs.ts`) the moment it lands.
 *
 * FILED, NEVER ACCEPTED HERE. A script the owner writes is accepted in his own press (`record/script-draft.ts`); a kind
 * is approved once by him in Decide, so this file files the change, signed by whoever pressed, and stops. Nothing here
 * calls `decide`.
 *
 * A SKIPPED PERMISSION IS NEVER OFFERED. The two choices are the kernel's own `JOB_PERMISSIONS`, which does not hold
 * one, and the kernel's check runs on the body before anything is sent, so its sentence is drawn under the field it
 * names rather than coming back as a refusal.
 *
 * PURE, for the reason `scripts.ts` gives: `node --test` cannot import a `.svelte.ts` file.
 */

import { createClient } from '@braindog/client';
import { JOB_AGENTS, JOB_MCP_PREFIX, JOB_PERMISSIONS, jobBody, type JobBody } from '@braindog/kernel';

import type { Fetch } from '../record/jobs.ts';

/** How a run may ask: the kernel's two, `dontAsk` and `acceptEdits`. */
export type JobPermission = (typeof JOB_PERMISSIONS)[number];
/** Which agent runs it: the kernel's two, Claude Code and Codex. */
export type JobAgent = (typeof JOB_AGENTS)[number];

/** One argument as the form holds it: the slot's id, the words a person types it in by, and how long it may be. */
export type KindArg = { id: string; label: string; max: number };

/** What the form holds. `commands` is the text a person typed, one command a line, and is split when it is sent. */
export type KindDraft = {
  title: string;
  prompt: string;
  args: KindArg[];
  repo: string;
  tools: string[];
  commands: string;
  turns: number;
  permission: JobPermission;
  writes: boolean;
  agent: JobAgent;
};

/** The file tools a kind may name as they are (the kernel's `JOB_FILE_TOOLS`, which its index does not export). */
export const FILE_TOOLS = ['Read', 'Grep', 'Glob'] as const;
/** The most turns a kind may give one run (the kernel's `JOB_TURNS_MOST`). */
export const TURNS_MOST = 40;
/** The longest an argument may be, and what a new one is given (the kernel's `JOB_ARG_CHARS_MOST`). */
const ARG_MOST = 64;
/** The most characters in an argument's label (the kernel's `JOB_ARG_LABEL_CHARS_MOST`). */
const LABEL_MOST = 40;

/**
 * The record's own tools a run may be given: every tool that only reads, and `propose`, which asks the owner and
 * changes nothing until he answers. A tool that writes on its own is not offered, since a run nobody watches would
 * write with it.
 */
export const RECORD_TOOLS: readonly string[] = ['record_index', 'context', 'get', 'list', 'search', 'activity', 'governance', 'propose'].map(
  (name) => JOB_MCP_PREFIX + name,
);

/** The permissions offered, which are the kernel's, so a skipped permission is never one of them. */
export const PERMISSIONS: readonly JobPermission[] = JOB_PERMISSIONS;

/** The agents offered, the kernel's own, Claude Code first since a kind that says none runs on it. */
export const AGENTS: readonly JobAgent[] = JOB_AGENTS;

/** A kind's own id, as the kernel's grammar takes it. */
const ID = /^[a-z][a-z0-9_-]{0,31}$/u;
/** One slot in a prompt, as the kernel reads one. */
const SLOT = /%([a-z][a-z0-9_]{0,31})%/gu;
/** One slot as a person writes it on the form, `{client}`, which the kernel's `%client%` is made from. */
const BRACED = /\{([A-Za-z][A-Za-z0-9_ ]{0,31})\}/gu;

/**
 * THE PROMPT AS THE KERNEL READS IT: a slot written `{client}` on the form is `%client%` (Q41 of 29 October, "Use
 * %client%" put a template token on screen). A slot already written the kernel's way stays.
 */
export const promptOf = (prompt: string): string =>
  prompt.replace(BRACED, (_, id: string) => `%${id.trim().toLowerCase().replace(/\s+/gu, '_')}%`);

/**
 * A LINE THAT SHOWS A SLOT AS IT IS TYPED, cut into its words and its slots, so the screen sets `{client}` as code: a
 * person is shown what to type, and braces drawn as prose read as a template the screen forgot to fill.
 */
export const slotParts = (text: string): { text: string; slot: boolean }[] => {
  const out: { text: string; slot: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(BRACED)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), slot: false });
    out.push({ text: m[0], slot: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), slot: false });
  return out;
};

/** An empty draft: eight turns, and the permission that runs only the tools it names. */
export function blankKind(): KindDraft {
  return { title: '', prompt: '', args: [], repo: '', tools: [], commands: '', turns: 8, permission: 'dontAsk', writes: false, agent: 'claude' };
}

/** A slot's id in words a person reads as a label: `repo_name` is "Repo name". */
const labelOf = (id: string): string => {
  const said = id.replace(/_+/gu, ' ').trim();
  return (said.charAt(0).toUpperCase() + said.slice(1)).slice(0, LABEL_MOST);
};

/**
 * The arguments the prompt's `%slot%`s ask for, in the order it first says them.
 *
 * IN STEP, AND KEEPING WHAT WAS TYPED. A slot the draft already has keeps its label and length; a new one gets its id
 * in words; one the prompt no longer says goes, since the kernel refuses an argument no slot names.
 */
export function slotsOf(prompt: string, args: readonly KindArg[] = []): KindArg[] {
  const out: KindArg[] = [];
  for (const m of promptOf(prompt).matchAll(SLOT)) {
    const id = m[1] ?? '';
    if (id === '' || out.some((a) => a.id === id)) continue;
    out.push(args.find((a) => a.id === id) ?? { id, label: labelOf(id), max: ARG_MOST });
  }
  return out;
}

/** A kind's id from its title: lower case, a hyphen between words, starting with a letter, at most 32. */
export function kindId(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^[^a-z]+/u, '')
    .slice(0, 32)
    .replace(/-+$/u, '');
  return ID.test(slug) ? slug : '';
}

/** The commands typed, one a line, each as the tool that runs only it. A line already written as `Bash(...)` stays. */
function commandTools(commands: string): string[] {
  const out: string[] = [];
  for (const raw of commands.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const tool = /^Bash\(.*\)$/su.test(line) ? line : `Bash(${line})`;
    if (!out.includes(tool)) out.push(tool);
  }
  return out;
}

/** Whether a run of this draft changes files: always under "Accept edits", which the kernel holds it to. */
export const writesOf = (d: Pick<KindDraft, 'permission' | 'writes'>): boolean => d.permission === 'acceptEdits' || d.writes;

/** The declaration's body, exactly as the kernel checks and Decide shows it. */
export function kindBody(d: KindDraft): JobBody {
  const args = slotsOf(d.prompt, d.args).map((a) => ({ id: a.id, label: a.label.trim(), max: a.max }));
  const repo = d.repo.trim();
  return {
    job: kindId(d.title),
    title: d.title.trim(),
    prompt: promptOf(d.prompt),
    ...(args.length > 0 ? { args } : {}),
    ...(repo !== '' ? { repo } : {}),
    tools: [...d.tools, ...commandTools(d.commands)],
    turns: d.turns,
    permission: d.permission,
    ...(writesOf(d) ? { writes: true } : {}),
    ...(d.agent === 'codex' ? { agent: 'codex' as const } : {}),
  };
}

/**
 * WHERE A BODY KEY'S SENTENCE IS DRAWN, when that is not the form field of the same name: `job` is made from the
 * title, `args` from the prompt's slots, and the tools are said under the commands, the last of the three lines that
 * fill them. Keyed by the body's own keys, so the form speaks only of its own fields.
 */
const DRAWN_AT: Partial<Record<keyof JobBody, keyof KindDraft>> = { job: 'title', args: 'prompt', tools: 'commands' };

/** The field on the form a kernel refusal is about: `args[0].label` is the prompt's slots, `tools[2]` the commands. */
function fieldOf(at: string): string {
  const head = at.split(/[.[]/u)[0] ?? at;
  return DRAWN_AT[head as keyof JobBody] ?? head;
}

/**
 * What is wrong with the draft and where, or `null` when the kernel would take it.
 *
 * THE KERNEL'S OWN SENTENCE, with the kind's id said as "This kind": a person reads names, and the id is made from
 * the title they are still typing.
 */
export function kindFaultAt(d: KindDraft): { at: string; fix: string } | null {
  const job = kindId(d.title);
  if (job === '') return { at: 'title', fix: words.needTitle };
  const id = `job.${job}`;
  const refused = jobBody({ id, body: kindBody(d) as unknown as Record<string, unknown> });
  if (refused === null) return null;
  return { at: fieldOf(refused.at ?? ''), fix: refused.fix.split(id).join(words.thisKind) };
}

/** The kernel's sentence for the draft, or `null` when it would take it. */
export const kindFault = (d: KindDraft): string | null => kindFaultAt(d)?.fix ?? null;

/** The change `propose` files: a new `job.<id>`, from version 0, so a kind of that id filed first is a conflict. */
export function kindProposal(d: KindDraft) {
  const id = `job.${kindId(d.title)}`;
  return {
    question: words.ask(d.title.trim()),
    body_kind: 'change' as const,
    body: { declaration_id: id, to: { id, kind: 'job', body: kindBody(d) }, from_version: 0 },
  };
}

/** What filing answered: the question it opened in Decide, or the sentence to fix. */
export type Filed = { kind: 'filed'; question: string | null } | { kind: 'refused'; fix: string };

/**
 * File the kind for Decide. ONE CALL, AND NEVER AN ANSWER: nothing is sent while the kernel would refuse it, and the
 * question it opens is the owner's to approve.
 */
export async function fileKind(base: string, d: KindDraft, io?: Fetch): Promise<Filed> {
  const fault = kindFault(d);
  if (fault !== null) return { kind: 'refused', fix: fault };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const filed = await client.call<{ id?: unknown }>('propose', kindProposal(d) as unknown as Record<string, unknown>);
  if (!filed.ok) return { kind: 'refused', fix: 'refusal' in filed ? filed.refusal.fix : words.notSent };
  const value: unknown = filed.value;
  const question = value !== null && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null;
  return { kind: 'filed', question };
}

export const words = {
  open: 'New job',
  heading: 'New job',
  parent: 'Agents',
  presets: 'How far it may go',
  more: 'More choices: folder, tools and limits',
  title: 'Title',
  prompt: 'What to do',
  promptHelp: 'Write {client} where a name changes each run.',
  slots: 'Filled in at each run',
  slotLabel: (id: string) => `Words for {${id}}`,
  repo: 'Repository',
  repoHelp: 'The folder it works in. Empty for a fresh one.',
  recordTools: 'Connected tools',
  fileTools: 'File tools',
  commands: 'Commands',
  commandsHelp: 'One a line, like git log. A run may use only the commands named here.',
  turns: 'Turns',
  turnsHelp: `How many turns one run may take, from 1 to ${TURNS_MOST}.`,
  permission: 'Permission',
  agent: 'Runs on',
  claude: 'Claude Code',
  codex: 'Codex',
  agentHelp: 'Codex cannot hold a run to named commands, so a Codex kind names only file and connected tools.',
  dontAsk: 'Only these tools',
  dontAskHelp: 'A run uses only the tools above and stops at anything else.',
  acceptEdits: 'Accept edits',
  acceptEditsHelp: 'A run uses the tools above and changes files without asking.',
  writes: 'Changes files',
  writesHelp: 'Needs you shows this in red before anybody approves the kind.',
  writesForced: 'Accept edits changes files, so this stays on.',
  send: 'Save job',
  busy: 'Filing',
  cancel: 'Cancel',
  sent: 'Saved for your yes',
  sentLine: 'Say yes to it once, and Run a job offers it.',
  notSent: 'BrainDog did not answer, so nothing was sent. Try again.',
  needTitle: 'Give it a title that starts with a letter.',
  thisKind: 'This kind',
  ask: (title: string) => `Approve the job ${title}?`,
  toolRecord: {
    record_index: 'See what is kept here',
    context: 'Get your briefing',
    schema: 'See the fields',
    get: 'Open one thing',
    list: 'Browse what is kept',
    search: 'Search everything',
    history: 'See how one thing changed',
    activity: 'See recent changes',
    governance: 'See questions and decisions',
    propose: 'Ask the owner to decide',
  } as Readonly<Record<string, string>>,
  toolFile: { Read: 'Read files', Grep: 'Search in files', Glob: 'Find files' } as Readonly<Record<string, string>>,
};

/** A record tool's words, from its `mcp__braindog__<name>`. */
export const recordToolWords = (tool: string): string => {
  const name = tool.slice(JOB_MCP_PREFIX.length);
  return words.toolRecord[name] ?? name.replace(/_/gu, ' ');
};

/* ── the three ways to start ─────────────────────────────────────────── */

/** A way to start a kind: its words, and the tools, commands and permission it fills in. */
export type KindPreset = { id: 'look' | 'code' | 'tidy'; label: string; said: string; tools: string[]; commands: string; permission: JobPermission; writes: boolean };

const READ_RECORD = ['record_index', 'context', 'get', 'list', 'search', 'activity'].map((name) => JOB_MCP_PREFIX + name);

/**
 * THREE WAYS TO START (24 October), so the tools are picked by what the job is and not one box at a time: one that
 * looks and tells, changing nothing; one that works on code in its folder; and one that keeps the record tidy, asking
 * the owner before anything changes. Each only fills in the choices under More, where every one can still be changed.
 */
export const PRESETS: readonly KindPreset[] = [
  { id: 'look', label: 'Look and tell me', said: 'Reads your BrainDog and its files, and changes nothing.', tools: [...READ_RECORD, ...FILE_TOOLS], commands: '', permission: 'dontAsk', writes: false },
  { id: 'code', label: 'Work on code', said: 'Reads and changes files in its folder, and can see the changes.', tools: [...FILE_TOOLS], commands: 'git status\ngit diff', permission: 'acceptEdits', writes: true },
  { id: 'tidy', label: 'Tidy my BrainDog', said: 'Reads your BrainDog and asks you before anything changes.', tools: [...RECORD_TOOLS], commands: '', permission: 'dontAsk', writes: false },
];

/** The draft with a preset's choices filled in, and everything a person typed kept. */
export const withPreset = (d: KindDraft, p: KindPreset): KindDraft => ({ ...d, tools: [...p.tools], commands: p.commands, permission: p.permission, writes: p.writes });

/** The preset a draft's choices match, or `null` once they were changed by hand. */
export function presetOf(d: KindDraft): KindPreset['id'] | null {
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return PRESETS.find((p) => same(p.tools, d.tools) && p.commands === d.commands && p.permission === d.permission && writesOf(p) === writesOf(d))?.id ?? null;
}
