/**
 * `braindog env apply [--profile <name>...] [--dry-run] [--yes-data] [--host <host>]`: what `setup` does for one
 * profile, done for every Claude Code profile on this machine, or the ones named (`docs/48-SPEC-CLI.md` §5.19), so a
 * person who runs several profiles has the record's tools, skills and BrainDog's own hooks in each, on every machine.
 *
 * EACH STEP IS SETUP'S OWN CODE, RUN IN ONE PROFILE: BrainDog's hooks and Agent Skill (`installProfiles`), its MCP
 * server (`registerServer`), the record's tools that apply everywhere as MCP servers in that profile's own servers file
 * (`writeTools` with `profile`), its skills into that profile's folder (`syncSkills`), and with a Profiles list, that
 * profile's rules in a marked block of its CLAUDE.md. The profiles are the ones `doctor` finds, named as `env diff`
 * names them (`labelsOf`), which is what `--profile` takes. AND CODEX, where it is on this machine and no profile was
 * named: its turn end and BrainDog's AGENTS.md block (`clients/codex-hooks.ts`), and BrainDog's server in its
 * config.toml (`clients/codex.ts`), each program approved here as Claude Code's are.
 *
 * WHICH PROFILE GETS WHAT. With a list that plays the role `profiles` (the Profiles add-on, `listPlaying`), a tool or a
 * skill whose `profiles` field names profiles goes to those alone, and an empty one to every profile; a profile's row
 * gives its `rules`. Without such a list every profile gets what applies everywhere, and it says so once.
 *
 * A PROGRAM IS APPROVED ON THIS MACHINE BEFORE IT IS PLACED, as a runner's job kind is (48 §5.13 step 4): the record
 * may say what every machine runs, and only the person at a machine says what runs on it. BrainDog's hooks, its server
 * and a tool's stdio command or `headersHelper` each run a program: each is printed whole, asked y/N at a terminal, and
 * a yes is pinned by its SHA-256 (`pins.ts`), so the same entry is not asked again and a changed one is. With no
 * terminal an entry that is not pinned is left out and named. Plain data (a skill's text, a URL server, the rules
 * block) is written with its line and no question.
 *
 * PLANNED, THEN ASKED, THEN WRITTEN, a step at a time: each question comes after its step's plan is printed and before
 * the record is read again to write it, so no connection to the record waits on a person.
 *
 * A YES NOBODY TYPED IS NOT ONE. At a terminal the data is written as the run goes. With no terminal it is written only
 * with `--yes-data`, which never approves a program; without it the run is its plan, and the last line says how to go
 * on. `--dry-run` writes nothing at all: no file, no `claude`, no question and no pin, and the record is only read.
 *
 * NO KEY IS WRITTEN. A tool's key is named by the command that opens it (`keys exec`, `keys headers`) and never held,
 * and an entry or a rules text that looks like a key is left out and said. The record is read under the login with no
 * session headers, as `env diff` reads it, so the run names no session and opens none.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { Context } from '@braindog/client';

import { oneLine } from './clip.ts';
import { ccenvHome, profilesIn, realOf, shown } from './doctor.ts';
import { labelsOf, listPlaying, rowsOf } from './env.ts';
import { hostsPath, target } from './http.ts';
import { BRAINDOG_SERVER, HOOKS_HELD, installProfiles, keepCopy, PLACES_SKILL } from './install.ts';
import { keepPin, pinOf, pinsFile, readPins, type PinKind, type Pins } from './pins.ts';
import { applyCodexHooks, planCodexHooks } from './clients/codex-hooks.ts';
import { codex, codexHome } from './clients/codex.ts';
import { askTerminal, envFor, heldIn, registerServer, runIn, sameServer, type ProfileRunner } from './setup.ts';
import { placeStatusLine, statusLineEntry, statusLineIn } from './statusline-place.ts';
import { connect, Stopped, syncSkills, type AgentIo, type Connected } from './skills.ts';
import { SKILLS_ASK, skillsAllowed } from './skills-consent.ts';
import { canonical, looksLikeKey, writeTools } from './tools.ts';

/** What `env apply` needs from its process, passed in so a test can hold all of it. */
export type EnvApplyIo = AgentIo & {
  /** The path of `main.ts` (the bundle, once built), which every tool wrapper runs. */
  cli: string;
  /** The folder of the hook scripts the hooks run. */
  scripts: string;
  /** Whether a person is at the terminal to answer: standard input and error both one, unless a test says. */
  terminal?: boolean | undefined;
  /** One y/N at the terminal: `askTerminal` unless a test holds it. */
  ask?: ((question: string) => Promise<boolean | null>) | undefined;
  /** How `claude` runs in a profile: `runIn` unless a test holds it. */
  claude?: ProfileRunner | undefined;
  /** How the record is reached: `connect` with no session headers, unless a test holds it. */
  record?: ((host: string | undefined) => Promise<Connected | number>) | undefined;
  signal?: AbortSignal | undefined;
  now?: (() => number) | undefined;
};

const USAGE = 'braindog env apply takes --profile <name>, --dry-run, --yes-data and --host <host>, and nothing else.';

/** A profile's row in Profiles: its name and its rules, and what a ref to it holds. */
type ProfileRow = { id: string | null; spoken: string; name: string; rules: string | null };

/** A tool or skill that names profiles: the names, in lower case, its title, and whether it applies everywhere. */
type Scoped = { names: string[]; title: string; everywhere: boolean };

/** The record as the run reads it at the start, or why it was not read. */
type Read = { read: true; profiles: ProfileRow[] | null; scoped: Map<string, Scoped> } | { read: false; why: 'signed-out' | 'unreachable' | 'refused' };

const NOT_READ: Record<'signed-out' | 'unreachable' | 'refused', string> = {
  'signed-out': 'This machine is not signed in to BrainDog, so your BrainDog was not read: BrainDog\'s hooks and server are placed, and its tools, skills and rules wait for braindog setup <host>.',
  unreachable: "BrainDog did not answer, so your BrainDog was not read: BrainDog's hooks and server are placed, and its tools, skills and rules wait for the next run.",
  refused: "BrainDog would not give this machine its tools and skills, so your BrainDog was not read: BrainDog's hooks and server are placed, and nothing else.",
};

/** Names joined as a sentence says them: `a`, `a and b`, `a, b and c`. */
const and = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`);

/* ── the rules block ───────────────────────────────────────────────────── */

/** The two lines a profile's CLAUDE.md block of rules starts and ends with, each a line of its own. */
export const RULES_START = '<!-- braindog: this profile\'s rules from Profiles. Change them there; braindog env apply writes this block. -->';
export const RULES_END = '<!-- braindog: end of the rules from Profiles. -->';

/** Where a marker stands on a line of its own: at the start of the text or after a line break, before one or the end. */
function markerAt(text: string, marker: string, from: number): number {
  for (let at = text.indexOf(marker, from); at >= 0; at = text.indexOf(marker, at + 1)) {
    const before = at === 0 || text[at - 1] === '\n';
    const next = text.slice(at + marker.length, at + marker.length + 2);
    if (before && (next === '' || next.startsWith('\n') || next === '\r\n')) return at;
  }
  return -1;
}

/**
 * A CLAUDE.md with the rules in its block: the block replaced where it stands, added at the end with a blank line
 * before it, or taken out when the rules are none. EVERY OTHER BYTE IS THE PERSON'S AND STAYS AS IT WAS, line endings
 * included: the block takes the file's own. `null` stands for no file. A block with a start and no end, or rules that
 * hold a marker line, are refused in a sentence and change nothing.
 */
export function withRules(text: string | null, rules: string): { text: string | null } | { refused: string } {
  const had = text ?? '';
  const eol = had.includes('\r\n') ? '\r\n' : '\n';
  const body = rules.trim() === '' ? [] : rules.trim().split(/\r?\n/u);
  if (body.some((line) => line.trim() === RULES_START || line.trim() === RULES_END)) return { refused: 'its rules hold a line BrainDog marks the block with' };
  const block = body.length === 0 ? '' : [RULES_START, ...body, RULES_END].join(eol);
  const start = markerAt(had, RULES_START, 0);
  if (start < 0) {
    if (block === '') return { text };
    if (text === null || had === '') return { text: `${block}${eol}` };
    return { text: `${had}${had.endsWith('\n') ? '' : eol}${eol}${block}${eol}` };
  }
  const end = markerAt(had, RULES_END, start + RULES_START.length);
  if (end < 0) return { refused: 'its CLAUDE.md holds the start of the rules block and no end' };
  const before = had.slice(0, start);
  const after = had.slice(end + RULES_END.length);
  if (block !== '') return { text: `${before}${block}${after}` };
  /* TAKEN OUT WITH THE BLANK LINE ADDED BEFORE IT, so a file the block was added to is the person's again. */
  return { text: `${before.endsWith(`${eol}${eol}`) ? before.slice(0, -eol.length) : before}${after.replace(/^\r?\n/u, '')}` };
}

/* ── the record ────────────────────────────────────────────────────────── */

/** A name as rows and profiles are matched by: its letters in lower case. */
const same = (name: string): string => name.trim().toLowerCase();

/**
 * The record, read once at the start: the rows of the list that plays `profiles`, when one does, and of each tool and
 * skill that names profiles, which. A field naming a profile by its row (a ref) is read as that row's name.
 */
async function readRecord(host: string | undefined, io: EnvApplyIo, reach: () => Promise<Connected | number>): Promise<Read> {
  try {
    if (target(host, io.env, hostsPath(io.env)).token === undefined) return { read: false, why: 'signed-out' };
  } catch {
    return { read: false, why: 'signed-out' };
  }
  const at = await reach();
  if (typeof at === 'number') return { read: false, why: at === 3 ? 'unreachable' : 'refused' };
  try {
    const list = await listPlaying(at.client, 'profiles');
    if (list === null) return { read: true, profiles: null, scoped: new Map() };
    const profiles: ProfileRow[] = [];
    for (const r of (await rowsOf(at.client, list.id)) ?? []) {
      const name = r.fields[list.title];
      const app = r.fields.app;
      /* A ROW FOR ANOTHER APP (Codex, Cursor) IS NOT A CLAUDE CODE PROFILE, whatever it is called. */
      if (typeof name !== 'string' || name.trim() === '' || (typeof app === 'string' && app !== '' && !/claude/iu.test(app))) continue;
      if (profiles.some((p) => same(p.name) === same(name))) continue;
      profiles.push({ id: r.id, spoken: r.spoken, name: name.trim(), rules: typeof r.fields.rules === 'string' ? r.fields.rules : null });
    }
    const refs = new Map<string, string>();
    for (const p of profiles) for (const ref of [p.id, p.spoken]) if (ref) refs.set(ref, p.name);
    const scoped = new Map<string, Scoped>();
    for (const register of ['tools', 'skills'])
      for (const r of (await rowsOf(at.client, register)) ?? []) {
        const said = r.fields.profiles;
        const values = Array.isArray(said) ? said.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : typeof said === 'string' && said.trim() !== '' ? [said] : [];
        if (values.length === 0) continue;
        const { name, project } = r.fields;
        scoped.set(r.spoken, { names: values.map((v) => same(refs.get(v) ?? v)), title: typeof name === 'string' ? name : r.spoken, everywhere: project === undefined || project === null || project === '' });
      }
    return { read: true, profiles, scoped };
  } catch (e) {
    if (e instanceof Stopped) return { read: false, why: 'unreachable' };
    throw e;
  }
}

/** Whether an entry runs a program: a stdio server's command, or an HTTP server's `headersHelper`. */
const runsProgram = (entry: Record<string, unknown>): boolean => entry.type === 'stdio' || typeof entry.command === 'string' || typeof entry.headersHelper === 'string';

/** One entry that runs a program, as it is pinned. */
type Program = { kind: PinKind; name: string; entry: unknown };

/* ── the run ───────────────────────────────────────────────────────────── */

/** `braindog env apply`, and the exit code: 1 when anything was left out or failed, or a plan nobody could approve. */
export async function envApply(args: string[], io: EnvApplyIo): Promise<number> {
  let values: { profile?: string[] | undefined; 'dry-run'?: boolean | undefined; 'yes-data'?: boolean | undefined; statusline?: boolean | undefined; host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { profile: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' }, 'yes-data': { type: 'boolean' }, statusline: { type: 'boolean' }, host: { type: 'string' } } }));
  } catch {
    /* parseArgs quotes what it could not read, and that could be a key pasted in the wrong place. */
    io.say(USAGE);
    return 1;
  }
  const dryRun = values['dry-run'] === true;
  const terminal = io.terminal ?? (process.stdin.isTTY === true && process.stderr.isTTY === true);
  /* WITH NO TERMINAL AND NO --yes-data, THE RUN IS ITS PLAN: nobody typed a yes. */
  const planOnly = dryRun || (!terminal && values['yes-data'] !== true);

  const found = profilesIn(io.home, [], io.env);
  const labels = labelsOf(found, io.home, ccenvHome(io.home, io.env));
  const here = found.map((dir, i) => ({ dir, name: labels[i] ?? dir }));
  const named = values.profile ?? [];
  if (named.some((n) => !here.some((p) => p.name === n))) {
    io.say(`braindog env apply --profile takes a profile on this machine: ${here.length === 0 ? 'none was found' : and(here.map((p) => p.name))}.`);
    return 1;
  }
  const profiles = named.length > 0 ? here.filter((p) => named.includes(p.name)) : here;
  /* CODEX, WHEN IT IS ON THIS MACHINE AND NO PROFILE WAS NAMED: --profile names Claude Code's profiles alone. */
  const withCodex = named.length === 0 && codex.found(io.home, io.env);
  if (profiles.length === 0 && !withCodex) {
    io.out('No Claude Code profile was found on this machine, so there is nothing to apply. Run braindog setup <host> first.');
    return 0;
  }
  const file = pinsFile(io.home);
  let pins: Pins | null = readPins(file);
  if (pins === null) {
    io.say(`${file} is not valid JSON, so nothing was applied. Delete it, and every program entry is asked about again.`);
    return 1;
  }

  const now = (io.now ?? Date.now)();
  const ask = io.ask ?? ((q: string) => askTerminal(q, io.signal));
  const run = io.claude ?? runIn;
  const reach = (): Promise<Connected | number> => (io.record ?? ((host: string | undefined) => connect(host, { ...io, headers: async () => ({}) })))(values.host);
  const detail = (lines: string[]) => {
    for (const line of lines) io.out(`   ${line}`);
  };
  /* THE FILES COPIED ASIDE THIS RUN, shared by every step and profile, so each is copied once, before its first change. */
  const copied = new Set<string>();
  /* THIS RUN'S ANSWERS, by hash, so an entry declined is not asked again for the next profile. */
  const answers = new Map<string, boolean>();
  /* WHAT WAS LEFT OUT FOR WANT OF APPROVAL, and the profiles each was left out of, for the last lines. */
  const left = new Map<string, string[]>();
  let changes = false;
  let wrote = false;
  let failed = false;

  const pinned = (p: Program): boolean => pins?.[pinOf(p.kind, p.name, p.entry)] !== undefined;
  /** What a plan says of a program entry: approved here before, or asked about first. */
  const planned = (p: Program, what: string): string => {
    /* BrainDog's hooks in Claude Code are said as several, every other entry as one, Codex's turn end among them. */
    const [run, is, it] = p.kind === 'hooks' && p.name === 'hooks' ? ['run', 'they are', 'them'] : ['runs', 'it is', 'it'];
    return pinned(p)
      ? `${what} ${run} a program approved on this machine before, so ${is} not asked about again.`
      : terminal || dryRun
        ? `${what} ${run} a program not yet approved on this machine, so applying asks about ${it} first.`
        : `${what} ${run} a program not yet approved on this machine, and no one is at a terminal to approve ${it}.`;
  };
  /** Asked at the terminal, when nothing pins it and this run has not asked: a yes is pinned at once. */
  const askAbout = async (p: Program, what: string, profile: string, app = 'Claude Code'): Promise<void> => {
    const sha = pinOf(p.kind, p.name, p.entry);
    if (pins?.[sha] !== undefined || answers.has(sha) || !terminal) return;
    const yes = (await ask(`Allow ${what} to run from ${app} on this machine? [y/N] `)) === true;
    answers.set(sha, yes);
    if (yes) pins = keepPin(file, sha, { name: p.name, kind: p.kind, profile, now });
  };
  /** Whether a program entry may go into this profile now: only when pinned, and this profile is added to its pin. */
  const mayPlace = (p: Program, what: string, profile: string): boolean => {
    const sha = pinOf(p.kind, p.name, p.entry);
    if (pins?.[sha] === undefined) {
      left.set(what, [...(left.get(what) ?? []), oneLine(profile)]);
      return false;
    }
    pins = keepPin(file, sha, { name: p.name, kind: p.kind, profile, now });
    return true;
  };

  const which =
    profiles.length === 0
      ? 'no Claude Code profile on this machine, and Codex'
      : `${profiles.length === 1 ? 'one profile' : `${String(profiles.length)} profiles`} on this machine, ${and(profiles.map((p) => oneLine(p.name)))}${withCodex ? ', and Codex' : ''}`;
  io.out(`braindog env apply: ${which}${dryRun ? ', as a dry run' : planOnly ? ', as a plan' : ''}.`);
  const record = await readRecord(values.host, io, reach);
  if (!record.read) {
    io.out(NOT_READ[record.why]);
    if (!dryRun) failed = true;
  } else if (record.profiles === null) io.out('Install the Profiles plugin to choose per profile; applying what applies everywhere.');
  else io.out(record.profiles.length === 0 ? 'Profiles names no profile yet, so each gets what applies everywhere.' : `Profiles names ${and(record.profiles.map((p) => oneLine(p.name)))}, and a tool or skill that names profiles goes to those alone.`);

  /* A FOLDER TWO PROFILES REACH, by where it resolves, is written once: ccenv's profiles link to the default's skills. */
  const skillsDone = new Map<string, string>();
  const rulesDone = new Map<string, string>();
  /* AND HOLDS WHAT ANY OF THEM IS GIVEN, since each of them reads every skill in it. */
  const sharing = new Map<string, string[]>();
  for (const p of profiles) {
    const folder = realOf(join(p.dir, 'skills'));
    sharing.set(folder, [...(sharing.get(folder) ?? []), same(p.name)]);
  }
  const scoped = record.read ? record.scoped : new Map<string, Scoped>();
  /** Whether a row names profiles and none of these. */
  const leavesAll = (names: string[]) => (spoken: string): boolean => {
    const s = scoped.get(spoken);
    return s !== undefined && !names.some((n) => s.names.includes(n));
  };
  const leftOut = (register: 'tools' | 'skills', leaves: (spoken: string) => boolean) =>
    [...scoped.entries()].filter(([spoken, s]) => spoken.startsWith(`${register}#`) && s.everywhere && leaves(spoken)).map(([, s]) => oneLine(s.title));

  for (const p of profiles) {
    io.out('');
    io.out(`${oneLine(p.name)}, ${shown(p.dir, io.home)}:`);
    const leaves = leavesAll([same(p.name)]);

    /* ── 1. the hooks and the Agent Skill, as `install --apply` writes them ── */
    let plan: string[] | null = null;
    try {
      plan = installProfiles([p.dir], [], { apply: false, scripts: io.scripts, home: io.home }).lines;
    } catch (e) {
      /* `install`'s own sentence, which names the file and never quotes what is in it. */
      io.say(e instanceof Error ? e.message : String(e));
      io.out("1. Hooks: Claude Code's settings could not be read, so no hook was placed.");
      failed = true;
    }
    if (plan !== null) {
      const hookLines = plan.filter((line) => /^\s+[+~] hooks\./u.test(line));
      const rest = plan.filter((line) => !line.startsWith('Nothing was changed.') && !line.includes(HOOKS_HELD));
      const hooks: Program = { kind: 'hooks', name: 'hooks', entry: hookLines.map((line) => line.trim().replace(/^[+~] /u, '')) };
      if (hookLines.length === 0 && !plan.some((line) => line.startsWith(PLACES_SKILL))) io.out("1. Hooks: Claude Code's settings already run the BrainDog hooks and Agent Skill.");
      else if (planOnly) {
        changes = true;
        io.out("1. Hooks: the BrainDog hooks and Agent Skill would be added to Claude Code's settings, with a copy of the file kept first:");
        detail(rest);
        if (hookLines.length > 0) detail([planned(hooks, "BrainDog's hooks")]);
      } else {
        changes = true;
        io.out("1. Hooks: these changes to Claude Code's settings come next, with a copy of the file kept first:");
        detail(rest);
        if (hookLines.length > 0) await askAbout(hooks, "BrainDog's hooks", p.name);
        if (hookLines.length > 0 && !mayPlace(hooks, "BrainDog's hooks", p.name)) detail(["Nothing was written to Claude Code's settings, because BrainDog's hooks are not approved on this machine."]);
        else
          try {
            const applied = installProfiles([p.dir], [], { apply: true, scripts: io.scripts, home: io.home }).lines;
            wrote = true;
            /* Install's own lines, less what the plan above already said. */
            detail(["Written: the BrainDog hooks and Agent Skill are in Claude Code's settings.", ...applied.filter((line) => !line.startsWith('  ') && !line.endsWith(':') && !line.includes(HOOKS_HELD) && !plan.includes(line))]);
          } catch (e) {
            io.say(e instanceof Error ? e.message : String(e));
            detail(["Claude Code's settings could not be written, so they are as they were."]);
            failed = true;
          }
      }
    }

    /* ── 2. BrainDog's MCP server, as `claude mcp add-json` registers it ── */
    const o = { home: io.home, env: io.env, cwd: io.cwd, copied, run };
    const server: Program = { kind: 'server', name: 'braindog', entry: BRAINDOG_SERVER };
    const looked = await registerServer(p.dir, { ...o, dryRun: true });
    if (looked.did === 'same') io.out('2. MCP server: braindog is already registered, running this command.');
    else if (looked.did === 'would') {
      changes = true;
      const instead = looked.replaces ? ' in place of the braindog entry there, which runs something else' : '';
      io.out(`2. MCP server: braindog ${planOnly ? 'would be registered' : 'is registered next'} at user scope${instead}, with a copy of its servers file kept first:`);
      detail([JSON.stringify(BRAINDOG_SERVER)]);
      if (planOnly) detail([planned(server, 'It')]);
      else {
        await askAbout(server, "BrainDog's MCP server", p.name);
        if (!mayPlace(server, "BrainDog's MCP server", p.name)) detail(['It was not registered, because it is not approved on this machine.']);
        else {
          const done = await registerServer(p.dir, { ...o, dryRun: false });
          if (done.did === 'added') {
            wrote = true;
            detail([`braindog ${done.replaced ? 'replaced the entry there and is' : 'is'} registered, running this command.`, ...(done.kept === null ? [] : [`The servers file as it was is kept at ${done.kept}.`])]);
          } else {
            failed = true;
            detail([
              done.did === 'no-copy'
                ? 'A copy of its servers file could not be kept first, so nothing was registered.'
                : done.did === 'failed' && done.code === -1
                  ? 'claude was not found, so nothing was registered. Install Claude Code, then run env apply again.'
                  : done.did === 'failed'
                    ? `claude mcp ${done.what} (exit ${String(done.code)}).`
                    : 'braindog is registered already.',
            ]);
          }
        }
      }
    }

    /* ── 2b. the status line, only where the profile has none of its own ──── */
    const line = values.statusline === true ? statusLineIn(p.dir) : 'off';
    if (line === 'off') {
      /* Not asked for: --statusline places it. */
    } else if (line === 'has') io.out('2b. Status line: this profile has its own, which is left as it is.');
    else if (line === 'unreadable') io.out("2b. Status line: Claude Code's settings could not be read, so none was placed.");
    else {
      const status: Program = { kind: 'statusline', name: 'statusline', entry: statusLineEntry(io.scripts) };
      changes = true;
      io.out(`2b. Status line: ${planOnly ? 'braindog statusline would be set' : 'braindog statusline is set next'} as this profile's status line, with a copy of its settings kept first:`);
      detail([JSON.stringify(statusLineEntry(io.scripts))]);
      if (planOnly) detail([planned(status, 'It')]);
      else {
        await askAbout(status, "BrainDog's status line", p.name);
        if (!mayPlace(status, "BrainDog's status line", p.name)) detail(['It was not set, because it is not approved on this machine.']);
        else
          try {
            const done = placeStatusLine(p.dir, io.scripts);
            wrote = true;
            detail(['Written: the status line shows the model, the folder and the limits.', ...(done.kept === null ? [] : [`The settings as they were are kept at ${done.kept}.`])]);
          } catch (e) {
            io.say(e instanceof Error ? e.message : String(e));
            detail(["Claude Code's settings could not be written, so they are as they were."]);
            failed = true;
          }
      }
    }

    /* ── 3. the record's tools, in this profile's own servers file ───────── */
    if (!record.read) io.out('3. Tools: your BrainDog was not read, so none was written.');
    else {
      const first = await reach();
      if (typeof first === 'number') {
        failed = true;
        io.out('3. Tools: your BrainDog could not be read, so none was written.');
      } else if (!first.context.registers.some((r) => r.id === 'tools')) io.out('3. Tools: this BrainDog has no Tools list, so there is nothing to write.');
      else {
        /* A TOOL THAT NAMES OTHER PROFILES IS NOT IN THIS PROFILE'S CONTEXT, so `writeTools` never sees it here. */
        const only = (c: Context): Context => ({
          ...c,
          registers: c.registers.map((r) => (r.id === 'tools' ? { ...r, rows: r.rows.filter((b) => !leaves(b.spoken)), inherited: r.inherited.filter((b) => !leaves(b.spoken)) } : r)),
        });
        const programs: Program[] = [];
        const base = { top: null, cwd: io.cwd, home: io.home, scope: 'user' as const, cli: io.cli, app: 'claude', env: io.env, copied, profile: p.dir };
        const lines = await writeTools({
          ...base,
          client: first.client,
          context: only(first.context),
          dryRun: true,
          claude: async () => -1,
          approve: async (name, entry) => {
            if (looksLikeKey(canonical(entry))) return { ok: false, line: `Tool ${name} holds what looks like a key, so it is never written.` };
            if (!runsProgram(entry)) return { ok: true, line: null };
            const tool: Program = { kind: 'tool', name, entry };
            programs.push(tool);
            return { ok: true, line: planned(tool, name) };
          },
        });
        const said = lines.filter((line) => !line.startsWith('Nothing was changed.'));
        if (!said.some((line) => /^[+~] /u.test(line))) {
          io.out(said.length === 0 ? `3. Tools: every tool your BrainDog applies to ${oneLine(p.name)} is already there.` : '3. Tools: nothing new is written, and this is why:');
          detail(said);
        } else if (planOnly) {
          changes = true;
          io.out(`3. Tools: what would be written at user scope, from the tools your BrainDog applies to ${oneLine(p.name)}:`);
          detail(said);
        } else {
          changes = true;
          io.out(`3. Tools: what is written next at user scope, from the tools your BrainDog applies to ${oneLine(p.name)}:`);
          detail(said);
          for (const tool of programs) await askAbout(tool, `the ${tool.name} tool`, p.name);
          const second = await reach();
          if (typeof second === 'number') {
            failed = true;
            detail(['Your BrainDog could not be read again, so no tool was written.']);
          } else {
            const done = await writeTools({
              ...base,
              client: second.client,
              context: only(second.context),
              dryRun: false,
              claude: (argv, cwd) => run(argv, cwd, envFor(p.dir, io.home, io.env)),
              approve: async (name, entry) => {
                if (looksLikeKey(canonical(entry))) return { ok: false, line: `Tool ${name} holds what looks like a key, so it was not written.` };
                if (!runsProgram(entry) || mayPlace({ kind: 'tool', name, entry }, `the ${name} tool`, p.name)) return { ok: true, line: null };
                return { ok: false, line: `Tool ${name} was not written, because it runs a program not approved on this machine.` };
              },
            });
            const out = done.filter((line) => !line.startsWith('Nothing was changed.'));
            if (out.some((line) => /^Tool \S+ (?:added|replaced)\b/u.test(line))) wrote = true;
            if (out.some((line) => /^claude was not found|^claude mcp \S+ did not|could not be kept first|stopped answering/u.test(line))) failed = true;
            detail(out);
          }
        }
        const out = leftOut('tools', leaves);
        if (out.length > 0) detail([`Left out here, because Profiles gives ${out.length === 1 ? 'it' : 'them'} to other profiles: ${and(out)}.`]);
      }
    }

    /* ── 4. the record's skills, into this profile's folder ──────────────── */
    if (!record.read) io.out('4. Skills: your BrainDog was not read, so none was synced.');
    else {
      const folder = realOf(join(p.dir, 'skills'));
      const shared = leavesAll(sharing.get(folder) ?? [same(p.name)]);
      const twin = skillsDone.get(folder);
      if (twin !== undefined) io.out(`4. Skills: its skills folder is ${oneLine(twin)}'s, so the skills given to any profile that shares it ${planOnly ? 'would be' : 'were'} synced there.`);
      else {
        skillsDone.set(folder, p.name);
        const at = await reach();
        if (typeof at === 'number') {
          failed = true;
          io.out('4. Skills: your BrainDog could not be read, so none was synced.');
        } else if (!at.context.registers.some((r) => r.id === 'skills')) io.out('4. Skills: this BrainDog has no Skills list, so there is nothing to sync.');
        /* NOTHING IS COPIED EITHER WAY WITHOUT THE YES `braindog skills sync` asks for after its owner check (RG12). */
        else if (!skillsAllowed(io.home, at.to.key)) io.out(`4. Skills: ${SKILLS_ASK}`);
        else {
          const leave = new Set([...scoped.keys()].filter((spoken) => spoken.startsWith('skills#') && shared(spoken)));
          const lines = await syncSkills({ client: at.client, context: at.context, home: io.home, configDir: p.dir, top: null, dryRun: planOnly, until: Infinity, to: at.to, leave, upload: true });
          if (lines.length > 0) {
            changes = true;
            if (!planOnly) wrote = true;
          }
          io.out(lines.length === 0 ? `4. Skills: it already holds every skill your BrainDog applies to ${oneLine(p.name)}.` : `4. Skills: ${planOnly ? 'what would be synced' : 'synced'}:`);
          detail(lines);
        }
        const out = leftOut('skills', shared);
        if (out.length > 0) detail([`Left out here, because Profiles gives ${out.length === 1 ? 'it' : 'them'} to other profiles: ${and(out)}.`]);
      }
    }

    /* ── 5. the profile's rules, in a marked block of its CLAUDE.md ──────── */
    const row = record.read && record.profiles !== null ? (record.profiles.find((r) => same(r.name) === same(p.name)) ?? null) : null;
    if (!record.read) io.out('5. Rules: your BrainDog was not read, so CLAUDE.md is left as it is.');
    else if (record.profiles === null) io.out('5. Rules: kept per profile by the Profiles plugin, which this BrainDog does not have.');
    else if (row === null) io.out(`5. Rules: Profiles has no row for ${oneLine(p.name)}, so its CLAUDE.md is left as it is.`);
    else {
      const claudeMd = join(p.dir, 'CLAUDE.md');
      /* THE FILE ITSELF, through any link, so a CLAUDE.md two profiles share is written as one and never replaced by a copy. */
      const real = realOf(claudeMd);
      const twin = rulesDone.get(real);
      const rules = row.rules ?? '';
      if (twin !== undefined) io.out(`5. Rules: its CLAUDE.md is ${oneLine(twin)}'s, through a link, so the block there is ${oneLine(twin)}'s.`);
      else if (looksLikeKey(rules)) {
        failed = true;
        io.out(`5. Rules: ${oneLine(p.name)}'s rules in Profiles hold what looks like a key, so CLAUDE.md is left as it is.`);
      } else {
        rulesDone.set(real, p.name);
        const had = existsSync(real) ? readFileSync(real, 'utf8') : null;
        const next = withRules(had, rules);
        if ('refused' in next) {
          failed = true;
          io.out(`5. Rules: ${next.refused}, so CLAUDE.md is left as it is.`);
        } else if (next.text === had) io.out(rules.trim() === '' ? `5. Rules: Profiles holds no rules for ${oneLine(p.name)}, and its CLAUDE.md has no block of them.` : `5. Rules: its CLAUDE.md already holds ${oneLine(p.name)}'s rules from Profiles.`);
        else {
          changes = true;
          const lines = rules.trim() === '' ? 0 : rules.trim().split(/\r?\n/u).length;
          const what = lines === 0 ? 'the block of its rules from Profiles, which holds none for it now' : `the block of ${oneLine(p.name)}'s rules from Profiles, ${lines === 1 ? 'one line' : `${String(lines)} lines`}`;
          const verb = lines === 0 ? ['would lose', 'lost'] : had === null ? ['would be made with', 'was made with'] : had.includes(RULES_START) ? ['would change', 'changed'] : ['would gain', 'gained'];
          if (planOnly) io.out(`5. Rules: CLAUDE.md ${verb[0] ?? ''} ${what}${had === null ? '' : ', with a copy of the file kept first'}. The rest of it is left as it is.`);
          else {
            try {
              const kept = had !== null && !copied.has(real) ? keepCopy(real) : null;
              copied.add(real);
              writeFileSync(`${real}.tmp`, next.text ?? '');
              renameSync(`${real}.tmp`, real);
              wrote = true;
              io.out(`5. Rules: CLAUDE.md ${verb[1] ?? ''} ${what}. The rest of it is as it was.`);
              if (kept !== null) detail([`The file as it was is kept at ${kept}.`]);
            } catch {
              failed = true;
              io.out(`5. Rules: ${shown(real, io.home)} could not be written, so it is as it was.`);
            }
          }
        }
      }
    }
  }

  /* ── Codex: its turn end and AGENTS.md block, and BrainDog's MCP server ── */
  if (withCodex) {
    io.out('');
    io.out(`Codex, ${shown(codexHome(io.home, io.env), io.home)}:`);

    /* 1. THE TURN END RUNS A PROGRAM, so it is approved here as the hooks are; the AGENTS.md block is plain data. */
    const plan = planCodexHooks({ home: io.home, env: io.env, scripts: io.scripts });
    const notify: Program = { kind: 'hooks', name: 'codex', entry: plan.notify };
    const runs = plan.writes.some((w) => w.file.endsWith('config.toml'));
    if (plan.writes.length === 0) {
      io.out(plan.left.length === 0 ? "1. Hooks: Codex already runs BrainDog's turn end, and its AGENTS.md holds BrainDog's block." : '1. Hooks: nothing is added, and this is why:');
      detail(plan.left);
    } else if (planOnly) {
      changes = true;
      io.out("1. Hooks: BrainDog's turn end and its block in AGENTS.md would be added to Codex's files, with a copy of each kept first:");
      detail([...plan.lines, ...plan.left, ...(runs ? [planned(notify, "BrainDog's turn end")] : [])]);
    } else {
      changes = true;
      io.out("1. Hooks: these changes to Codex's files come next, with a copy of each kept first:");
      detail([...plan.lines, ...plan.left]);
      if (runs) await askAbout(notify, "BrainDog's turn end", 'codex', 'Codex');
      const approved = !runs || mayPlace(notify, "BrainDog's turn end", 'Codex');
      const writes = approved ? plan.writes : plan.writes.filter((w) => !w.file.endsWith('config.toml'));
      if (!approved) detail(["Codex's config.toml was not written, because BrainDog's turn end is not approved on this machine."]);
      if (writes.length > 0) {
        const done = applyCodexHooks({ ...plan, writes }, copied);
        if (done.written) wrote = true;
        else failed = true;
        detail([...(done.written ? [`Written: ${approved ? "BrainDog's turn end and its block in AGENTS.md are" : "BrainDog's block in AGENTS.md is"} in Codex's files.`] : []), ...done.lines]);
      }
    }

    /* 2. BRAINDOG'S MCP SERVER, as setup writes it into Codex's config.toml (`clients/codex.ts`). */
    const want = codex.server;
    const held = heldIn(codex, 'braindog', io);
    const server: Program = { kind: 'server', name: 'braindog (Codex)', entry: want };
    if (sameServer(held, want)) io.out('2. MCP server: braindog is already registered in Codex, running this command.');
    else {
      changes = true;
      const serverPlan = codex.plan({ name: 'braindog', scope: 'user', entry: want, replace: held !== undefined, home: io.home, top: null, cwd: io.cwd });
      const instead = held !== undefined ? ' in place of the braindog entry there, which runs something else' : '';
      io.out(`2. MCP server: braindog ${planOnly ? 'would be registered' : 'is registered next'} in Codex${instead}, with a copy of its config.toml kept first:`);
      detail(serverPlan.lines);
      if (planOnly) detail([planned(server, 'It')]);
      else {
        await askAbout(server, "BrainDog's MCP server", 'codex', 'Codex');
        if (!mayPlace(server, "BrainDog's MCP server", 'Codex')) detail(['It was not registered, because it is not approved on this machine.']);
        else {
          const done = await codex.apply(serverPlan, { run: async () => -1, copied });
          if (done.written) wrote = true;
          else failed = true;
          detail(done.lines);
        }
      }
    }
  }

  /* ── the last lines ────────────────────────────────────────────────── */
  io.out('');
  if (dryRun) {
    io.out('That was a dry run, so nothing was written, registered, asked or pinned.');
    return failed ? 1 : 0;
  }
  if (planOnly) {
    io.out(
      changes
        ? 'Nothing was written, because no one is at a terminal to say yes. Run braindog env apply --yes-data to write the plain data and the programs already approved here; any other program is asked about at a terminal.'
        : 'Nothing to change: every profile already holds what your BrainDog applies to it.',
    );
    return changes || failed ? 1 : 0;
  }
  if (left.size > 0)
    io.out(
      `Left out, because they are not approved on this machine: ${[...left].map(([what, where]) => `${what} in ${and(where)}`).join('; ')}.${terminal ? '' : ' Run braindog env apply at a terminal to be asked.'}`,
    );
  io.out(
    wrote
      ? `Applied to ${and([...profiles.map((p) => oneLine(p.name)), ...(withCodex ? ['Codex'] : [])])}. Sessions started from now on in each have it.`
      : failed || left.size > 0
        ? 'Nothing else changed.'
        : 'Nothing changed: every profile already holds what your BrainDog applies to it.',
  );
  return failed || left.size > 0 ? 1 : 0;
}
