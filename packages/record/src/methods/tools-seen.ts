/**
 * What one machine holds, written down by the record itself: `toolsSeen` (DATA), the servers, command lines and
 * integrations a machine's agents use, each matched to its row by what it runs.
 *
 * BEFORE THIS THE COMMAND LINE MADE THE MATCH, by scope and exact name, against the tools one context shows, and stopped
 * adding past that cut. So a 22nd server was never recorded, `x` and `x-mcp` running one package were two rows, and a
 * second machine whose home folder is another proposed a change that waited on Decide.
 *
 * THE MATCH IS MADE HERE, BY WHAT A TOOL RUNS. Two values are worked out for every tool by the two pure functions below:
 * `programOf`, what is run wherever it lives, and `startOf`, how it starts on one machine. Inside one scope:
 *   1. same program, same start: the row is stamped "Seen on" and "Last seen", and nothing is asked;
 *   2. same program, another start: the machine is stamped, and nothing is asked (keeping each machine's start needs a
 *      `starts` field the add-on does not declare yet);
 *   3. same name, another program: one question, once, never when the change equals what the row holds and never while
 *      an open question carries the same row and change;
 *   4. no match: the row is added, signed by the caller's run.
 *
 * RULE 4 WRITES THE ROW DIRECTLY, AS `meet` ADDS A PERSON, and not through the ladder: this is the record writing down
 * what a machine holds, not an agent choosing what the record should say. Nothing here runs on a clock, and nothing is
 * signed by the record itself: every write and every question is the caller's run.
 *
 * THE LIST IS THE ONE THAT PLAYS THE PART OF THE TOOLS (`listFor` in `../agent-lists.ts`), whatever it is called. A
 * record that keeps none is no refusal: every tool sent is answered `skipped`, with why in one sentence, and the
 * session goes on.
 *
 * ONE CALL READS THE LIST ONCE, A PAGE AT A TIME, and every found tool is matched against what it read and what this
 * call has written since. Every write is made before the call gives way, so two calls at once are taken one after the
 * other and the second finds the row the first one added.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { MOOT_HELD, looksLikeCredential, ulids, type Entry, type WriteContext } from '@braindog/kernel';

import { listFor, noListSaid } from '../agent-lists.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** One tool as a machine holds it, read from one file of one client. `needs` are names only, or `NAME=credentials#N`. */
export type FoundTool = {
  name: string;
  kind: 'mcp' | 'cli' | 'integration';
  scope: 'project' | 'global';
  transport?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  endpoint?: string;
  needs: string[];
  /** The file it was read from, in words. */
  source: string;
};

/** What became of one found tool: its row by its spoken id, the question asked or waiting, or why it was left. */
export type SeenTool = { name: string; did: 'added' | 'seen' | 'asked' | 'waiting' | 'skipped'; row?: string; question?: string; why?: string };
export type ToolsSeen = { tools: SeenTool[] };

/** The most tools one call takes: more than any one machine's configs hold. */
export const FOUND_MOST = 50;

/** How long a "Last seen" stands before a sighting writes it again, so a machine starting ten sessions writes once. */
const SEEN_AGAIN_MS = 60 * 60 * 1000;

/* ── what a tool runs, and how it starts ─────────────────────────────── */

/** A tool's start as the two functions read it: a found tool, or a row's fields. */
type Startable = { name?: unknown; kind?: unknown; transport?: unknown; command?: unknown; args?: unknown; endpoint?: unknown };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A path's last part, with `\` read as `/` and a Windows runner's `.cmd` or `.exe` taken off. */
const baseOf = (path: string): string => (path.replace(/\\/gu, '/').split('/').filter((p) => p !== '').at(-1) ?? '').replace(/\.(cmd|exe|bat|ps1)$/iu, '');

/** An address as one program: `http:`, the host in lower case and the path, with no query, no fragment and no last `/`. */
function addressOf(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `http:${u.host.toLowerCase()}${u.pathname.replace(/\/+$/u, '')}`;
  } catch {
    return `http:${endpoint.toLowerCase().replace(/[?#].*$/u, '').replace(/\/+$/u, '')}`;
  }
}

/** The runners that fetch a package and run it, each by its command and the word after it when it needs one. */
const RUNNERS: readonly (readonly [string, string | null])[] = [['npx', null], ['bunx', null], ['uvx', null], ['pnpm', 'dlx'], ['pipx', 'run'], ['docker', 'run'], ['podman', 'run']];

/** The flags of a runner that take the next argument as their value, so the value is never read as the package. */
const VALUED = new Set(['-e', '--env', '--env-file', '-v', '--volume', '--mount', '-p', '--publish', '--name', '--network', '-w', '--workdir', '-u', '--user', '--entrypoint', '--platform', '-l', '--label', '--with', '--python', '--index-url', '--spec', '-c', '--call']);

/** The flags that name the package itself, so their value is it (`npx -p pkg cmd`, `uvx --from pkg cmd`). */
const PACKAGE_FLAGS = new Set(['-p', '--package', '--from']);

/** A package without its version or tag: `@scope/pkg@1.2` is `@scope/pkg`, `pkg==1.0` is `pkg`, `ghcr.io/a/b:2` is `ghcr.io/a/b`. */
function packageOf(spec: string, image: boolean): string {
  if (image) {
    const at = spec.split('@')[0] ?? spec;
    const slash = at.lastIndexOf('/');
    const colon = at.lastIndexOf(':');
    return (colon > slash ? at.slice(0, colon) : at).toLowerCase();
  }
  const bare = spec.replace(/(==|>=|<=|~=|!=|\[).*$/u, '');
  const at = bare.indexOf('@', bare.startsWith('@') ? 1 : 0);
  return (at > 0 ? bare.slice(0, at) : bare).toLowerCase();
}

/** The interpreters that run a script by its path, each by its command and the word after it when it needs one. */
const INTERPRETERS = new Set(['node', 'nodejs', 'python', 'python3', 'bun', 'deno', 'tsx', 'ts-node']);

/** The parts of a path that name a build or an entry and never the program, compared without their extension. */
const NOT_A_NAME = new Set(['dist', 'build', 'out', 'src', 'bin', 'lib', 'index', 'main', 'server', 'cli']);

/** A script's program: the last part of its path that is not a build or entry name, without its extension. */
function scriptOf(path: string): string | null {
  const parts = path.replace(/\\/gu, '/').split('/').filter((p) => p !== '' && p !== '.' && p !== '..').map((p) => p.replace(/\.[a-z0-9]+$/iu, ''));
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    if (part !== '' && !NOT_A_NAME.has(part.toLowerCase())) return `script:${part.toLowerCase()}`;
  }
  return null;
}

/**
 * WHAT A TOOL RUNS, WHEREVER IT LIVES: an address, a package a runner fetches, a script an interpreter
 * runs, a module, or a command by its base name. A command line with no transport is its name, and an integration is
 * its address or its name. Two machines that run one thing from different folders read the same.
 */
export function programOf(tool: Startable): string {
  const kind = text(tool.kind);
  const endpoint = text(tool.endpoint);
  const command = text(tool.command);
  const args = listOf(tool.args);
  if (kind === 'integration') return endpoint !== '' ? addressOf(endpoint) : `name:${text(tool.name).toLowerCase()}`;
  if (endpoint !== '' && (text(tool.transport) === 'http' || command === '')) return addressOf(endpoint);
  if (kind === 'cli' && text(tool.transport) === '') return `bin:${(text(tool.name) || baseOf(command)).toLowerCase()}`;
  const bin = baseOf(command).toLowerCase();
  const runner = RUNNERS.find(([c]) => c === bin);
  if (runner !== undefined) {
    const rest = runner[1] === null ? args : args[0] === runner[1] ? args.slice(1) : null;
    if (rest !== null) {
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (PACKAGE_FLAGS.has(a) && rest[i + 1] !== undefined) return `pkg:${packageOf(rest[i + 1]!, false)}`;
        if (a.startsWith('-')) {
          if (VALUED.has(a)) i++;
          continue;
        }
        return `pkg:${packageOf(a, bin === 'docker' || bin === 'podman')}`;
      }
    }
  }
  if (INTERPRETERS.has(bin)) {
    const rest = bin === 'deno' && args[0] === 'run' ? args.slice(1) : bin === 'bun' && args[0] === 'run' ? args.slice(1) : args;
    const m = rest.indexOf('-m');
    if (bin.startsWith('python') && m >= 0 && rest[m + 1] !== undefined) return `mod:${rest[m + 1]!.toLowerCase()}`;
    const path = rest.find((a) => !a.startsWith('-'));
    const script = path === undefined ? null : scriptOf(path);
    if (script !== null) return script;
  }
  return `bin:${bin || text(tool.name).toLowerCase()}`;
}

/**
 * A home folder at the start of a path, or just after the `=` of a flag, on a Mac, on Linux and on Windows, written `~`
 * so two people's machines agree.
 */
const HOME = /(^|=)(?:\/Users\/[^/]+|\/home\/[^/]+|\/root|[A-Za-z]:\/Users\/[^/]+)(?=\/|$)/u;

/** One part of a start with `/` between its folders and the home folder written `~`. */
const homed = (part: string): string => part.replace(/\\/gu, '/').replace(HOME, '$1~');

/**
 * HOW A TOOL STARTS ON ONE MACHINE: its transport, command, arguments and address in one line, with the home folder
 * written `~` and `/` between the parts of a path. Two machines with the same config in different home folders start
 * the same; one that runs the same program from another folder does not.
 */
export function startOf(tool: Startable): string {
  const transport = text(tool.transport);
  const parts = [transport, homed(text(tool.command)), ...listOf(tool.args).map(homed), homed(text(tool.endpoint))];
  return parts.filter((p) => p !== '').join(' ');
}

/* ── the method ───────────────────────────────────────────────────────── */

/** A name as two of them are one: in lower case, its spaces run together, as the list folds its names. */
const folded = (name: unknown): string => text(name).toLowerCase().replace(/\s+/gu, ' ');

/** A need's name, the part before `=`, which says which key a tool reads whatever row holds it. */
const needName = (need: string): string => need.split('=')[0] ?? need;

/** A short fingerprint of a change, so the cause it is asked under stays inside 200 characters. Two runs of 32-bit FNV-1a. */
function fingerprint(said: string): string {
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < said.length; i++) {
    const c = said.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** A value as JSON with its keys sorted, so one change always reads as the same text. */
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null);

const ONE_OF = { kind: ['mcp', 'cli', 'integration'], scope: ['project', 'global'], transport: ['stdio', 'http'] } as const;

/** Why one found tool is not a tool as this method takes one, or `null` when it is. */
function malformed(t: unknown): string | null {
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return 'is not a tool: each one has a name, a kind, a scope, the keys it needs by name and where it was read.';
  const f = t as Record<string, unknown>;
  if (typeof f.name !== 'string' || f.name.trim() === '' || f.name.length > 64) return 'needs a name of at most 64 characters.';
  if (!(ONE_OF.kind as readonly unknown[]).includes(f.kind)) return 'has a kind of mcp, cli or integration.';
  if (!(ONE_OF.scope as readonly unknown[]).includes(f.scope)) return 'has a scope of project or global.';
  if (f.transport !== undefined && !(ONE_OF.transport as readonly unknown[]).includes(f.transport)) return 'has a transport of stdio or http, or none.';
  for (const k of ['command', 'endpoint'] as const) if (f[k] !== undefined && (typeof f[k] !== 'string' || (f[k] as string).length > 512)) return `has a ${k} of at most 512 characters, or none.`;
  if (f.args !== undefined && (!Array.isArray(f.args) || f.args.length > 64 || !f.args.every((a) => typeof a === 'string' && a.length <= 512))) return 'has its arguments as a list of at most 64 texts.';
  if (f.needs !== undefined && (!Array.isArray(f.needs) || f.needs.length > 32 || !f.needs.every((n) => typeof n === 'string' && n.trim() !== '' && n.length <= 200))) return 'names the keys it needs as a list of names.';
  if (typeof f.source !== 'string' || f.source.trim() === '') return 'says where it was read, in words.';
  return null;
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no, tail, clock } = deps;
  const mint = ulids(() => clock.now());

  /**
   * Who writes down what a machine holds, and the project its run is in: the caller's run, found or opened as
   * `signerOf` in `agents.ts` does it and named in the hints, so every write lands on that run. A person signs as
   * themselves and is in no project.
   */
  const signerOf = (ctx: CallContext): Result<{ w: Pick<WriteContext, 'actor' | 'principal' | 'session'>; project: string | null }> => {
    const p = ctx.principal;
    if (p.kind !== 'token') return ok({ w: { actor: p.id }, project: null });
    const hints = ctx.session ?? {};
    const w = { actor: `agent:${hints.agent ?? 'other'}`, principal: { kind: 'token' as const, token: p.id }, session: hints };
    const found = kernel.runFor(w, 'opened: tools seen');
    if (!found.ok) return found as Result<never>;
    return ok({ w: { ...w, actor: found.value.spoken, session: { ...hints, spoken: found.value.spoken } }, project: placeOf(found.value.run.fields.project) });
  };

  /** A project by its row's id, however a field holds it, so a run's project and a tool's are compared as one. */
  const placeOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? (kernel.get(v)?.id ?? v) : null);

  /** Every live tool in the list that keeps them, a page at a time, once a call. */
  const liveTools = (TOOLS: string): Result<Entry[]> => {
    const rows: Entry[] = [];
    let cursor: string | null = null;
    do {
      const page = kernel.list({ register: TOOLS, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!page.ok) return page as Result<never>;
      rows.push(...page.value.rows);
      cursor = page.value.cursor;
    } while (cursor !== null);
    return ok(rows);
  };

  return {
    /**
     * `{ machine, found }`: every server, command line and integration one machine holds, at most 50, each matched to
     * its row by what it runs. Answers `{ tools }`, one line a found tool, in the order sent: `added` with its row,
     * `seen` with its row, `asked` or `waiting` with the question on Decide, or `skipped` with why. DATA.
     *
     * A TOOL FROM A PROJECT'S CONFIG GOES TO THE RUN'S PROJECT, and is skipped when the run is in none. A tool of the
     * user's config from a run that is in a project is not written for every project by one agent: all of them are one
     * question, as before. A value that looks like a key, in a command, an argument, an address or a need, is never
     * written, and its tool is skipped with why.
     */
    async toolsSeen(args: { machine?: unknown; found?: unknown } | undefined, ctx: CallContext): Promise<Result<ToolsSeen>> {
      const kept = listFor('tools', kernel.registers());
      const stop = kept === null ? guard(ctx, 'write') : guard(ctx, 'write', kept);
      if (stop) return { ok: false, refusal: stop };
      const decl = kept === null ? undefined : kernel.register(kept);
      if (ctx.principal.kind === 'system' || ctx.principal.kind === 'share' || ctx.principal.kind === 'runner')
        return no('FORBIDDEN', 'What a machine holds is written down by the agent on it, or by a person, and never by BrainDog itself.', { at: 'principal' });
      const machine = text(args?.machine);
      if (machine === '' || machine.length > 120 || /[\n\r]/u.test(machine) || looksLikeCredential(machine))
        return no('VALUE_MALFORMED', 'machine is the name of the machine the tools were found on, one line of at most 120 characters.', { at: 'machine' });
      const sent = args?.found;
      if (!Array.isArray(sent) || sent.length > FOUND_MOST)
        return no('VALUE_MALFORMED', `found is the list of tools this machine holds, at most ${String(FOUND_MOST)} in one call.`, { at: 'found' });
      for (const [i, t] of sent.entries()) {
        const bad = malformed(t);
        if (bad !== null) return no('VALUE_MALFORMED', `The tool at ${String(i + 1)} in found ${bad}`, { at: 'found' });
      }
      const found = sent as FoundTool[];
      if (found.length === 0) return ok({ tools: [] });
      /* NO LIST KEEPS TOOLS: nothing is written, and each tool is answered in the one sentence that says why. */
      if (kept === null || !decl) return ok({ tools: found.map((f) => ({ name: f.name.trim(), did: 'skipped' as const, why: noListSaid('tools') })) });
      const TOOLS: string = kept;

      const signed = signerOf(ctx);
      if (!signed.ok) return signed as Result<never>;
      const { w, project } = signed.value;
      const read = liveTools(TOOLS);
      if (!read.ok) return read as Result<never>;
      const now = clock.now();
      const at = new Date(now).toISOString();

      type Held = { id: string; spoken: string; version: number; fields: Record<string, unknown>; program: string; start: string; place: string | null };
      const heldOf = (row: Entry): Held => ({
        id: row.id,
        spoken: kernel.nameOf(row.id),
        version: row.version,
        fields: row.fields,
        program: programOf(row.fields),
        start: startOf(row.fields),
        place: placeOf(row.fields.project),
      });
      const held = read.value.map(heldOf);
      const out: SeenTool[] = [];
      const everywhere: { f: FoundTool; i: number; fields: Record<string, unknown> }[] = [];
      /* The rows this call added or stamped, which an open "add everywhere" question must no longer add again. */
      const touched: Held[] = [];

      for (const f of found) {
        const name = f.name.trim();
        const needs = (f.needs ?? []).map((n) => n.trim());
        if ([f.command ?? '', ...(f.args ?? []), f.endpoint ?? '', ...needs].some((v) => v !== '' && looksLikeCredential(v))) {
          out.push({ name, did: 'skipped', why: 'How it starts holds what looks like a key, so none of it was written down. Keep the key in the keychain and name it among the keys it needs.' });
          continue;
        }
        if (f.scope === 'project' && project === null) {
          out.push({ name, did: 'skipped', why: "It is in a project's config and this run is in no project, so it was not written down." });
          continue;
        }
        const place = f.scope === 'project' ? project : null;
        const program = programOf(f);
        const start = startOf(f);
        /* INSIDE ONE SCOPE, and a tool of the user's config from a run in a project is also the project's own row of it.
           Live rows first, so a retired copy never takes the sighting its live twin should get. */
        const among = (p: string | null) => liveFirst(held.filter((h) => h.place === p));
        const scopes = place === null && project !== null ? [among(null), among(project)] : [among(place)];
        /* A SCRIPT IS ONE PROGRAM ONLY WHEN THE NAMES AGREE OR ITS PATH NAMES THE ROW: two scripts in folders of one name
           are otherwise two tools (its cost). */
        const sameProgram = (h: Held) =>
          h.program === program && (!program.startsWith('script:') || folded(h.fields.name) === folded(name) || start.toLowerCase().includes(folded(h.fields.name)));
        let match: Held | undefined;
        let byName: Held | undefined;
        for (const rows of scopes) {
          const same = rows.filter(sameProgram);
          match = same.find((h) => folded(h.fields.name) === folded(name)) ?? same.find((h) => h.start === start) ?? same[0];
          byName ??= rows.find((h) => folded(h.fields.name) === folded(name));
          if (match !== undefined) break;
        }
        /* A TOOL OF THE USER'S CONFIG THAT A PROJECT ALREADY HOLDS, same program and same name, is that row: matching
           only global rows made a global copy of every project's server. The name is asked because one address can be three. */
        if (match === undefined && place === null)
          match = liveFirst(held.filter((h) => h.place !== null && sameProgram(h) && folded(h.fields.name) === folded(name)))[0];

        if (match !== undefined) {
          const said = stamp(match, f, needs);
          if (said.did === 'seen') touched.push(match);
          out.push(said);
          continue;
        }
        if (byName !== undefined) {
          out.push(ask(byName, f, needs, start));
          continue;
        }
        const fields = fieldsOf(f, needs, place);
        if (place === null && project !== null) {
          everywhere.push({ f, i: out.length, fields });
          out.push({ name, did: 'asked' });
          continue;
        }
        const made = kernel.create(TOOLS, fields, w as WriteContext);
        if (!made.ok) {
          out.push({ name, did: 'skipped', why: 'refusal' in made ? made.refusal.fix : 'BrainDog did not take it.' });
          continue;
        }
        const row = heldOf(made.value);
        held.push(row);
        touched.push(row);
        out.push({ name, did: 'added', row: row.spoken });
      }
      if (touched.length > 0) unask(touched);
      if (everywhere.length > 0) askEverywhere(everywhere, out);
      return tail(ok({ tools: out }));

      /** A row's fields for a new tool: how it starts, the keys it needs by name, where it applies and where it was seen. */
      function fieldsOf(f: FoundTool, needs: string[], place: string | null): Record<string, unknown> {
        const integration = f.kind === 'integration';
        return {
          name: f.name.trim(),
          kind: f.kind,
          ...(integration || f.transport === undefined ? {} : { transport: f.transport }),
          ...(integration || f.command === undefined || f.command.trim() === '' ? {} : { command: f.command.trim() }),
          ...(integration || f.args === undefined || f.args.length === 0 ? {} : { args: f.args }),
          ...(f.endpoint === undefined || f.endpoint.trim() === '' ? {} : { endpoint: f.endpoint.trim() }),
          ...(needs.length === 0 ? {} : { needs }),
          ...(place === null ? {} : { project: kernel.nameOf(place) }),
          hosts: [machine],
          seen: at,
          origin: f.source.trim().slice(0, 280),
          state: 'active',
        };
      }

      /** The keys a row needs, with the ones found here that it lacks added and a bare name bound where one is found bound. */
      function needsWith(prior: string[], needs: string[]): string[] {
        const bound = new Map(needs.filter((n) => n.includes('=')).map((n) => [needName(n), n]));
        const kept = prior.map((p) => (p.includes('=') ? p : (bound.get(needName(p)) ?? p)));
        const had = new Set(kept.map(needName));
        return [...kept, ...needs.filter((n) => !had.has(needName(n)))];
      }

      /** What a sighting has to say once a row is written: the row, by its spoken id, read again from what was written. */
      function rewritten(h: Held, row: Entry): void {
        Object.assign(h, heldOf(row));
      }

      /**
       * RULES 1 AND 2: the same program, here. "Seen on" gains this machine, "Last seen" is stamped when it is an hour
       * old, a stale row is active again, and a key it needs here that the row lacks is named. Nothing is asked. A
       * retired row is left as it is: he said it is done.
       */
      function stamp(h: Held, f: FoundTool, needs: string[]): SeenTool {
        const name = f.name.trim();
        if (h.fields.state === 'retired') return { name, did: 'skipped', row: h.spoken, why: 'It is retired in your BrainDog, so it was left as it is.' };
        const patch: Record<string, unknown> = {};
        const hosts = listOf(h.fields.hosts);
        if (!hosts.includes(machine)) patch.hosts = [...hosts, machine];
        const seen = typeof h.fields.seen === 'string' ? Date.parse(h.fields.seen) : Number.NaN;
        if (!(now - seen < SEEN_AGAIN_MS)) patch.seen = at;
        if (h.fields.state === 'stale') patch.state = 'active';
        const prior = listOf(h.fields.needs);
        const wants = needsWith(prior, needs);
        if (canon(wants) !== canon(prior)) patch.needs = wants;
        if (Object.keys(patch).length === 0) return { name, did: 'seen', row: h.spoken };
        const wrote = kernel.update(TOOLS, h.id, patch, w as WriteContext);
        if (!wrote.ok) return { name, did: 'skipped', row: h.spoken, why: 'refusal' in wrote ? wrote.refusal.fix : 'BrainDog did not take it.' };
        rewritten(h, wrote.value);
        return { name, did: 'seen', row: h.spoken };
      }

      /**
       * RULE 3: a known name that now runs something else. One question, signed by the run, asked under the row and the
       * change, so a second machine with the same config joins it and a second call files none. Never when the change
       * is what the row holds already, which is a sighting, and never again once he answered it.
       */
      function ask(h: Held, f: FoundTool, needs: string[], start: string): SeenTool {
        const name = f.name.trim();
        if (h.fields.state === 'retired') return { name, did: 'skipped', row: h.spoken, why: 'It is retired in your BrainDog, so it was left as it is.' };
        const blank = (v: unknown) => (v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);
        const change: Record<string, unknown> =
          f.kind === 'integration' ? { endpoint: blank(f.endpoint) } : { transport: blank(f.transport), command: blank(f.command), args: blank(f.args), endpoint: blank(f.endpoint) };
        const patch = Object.fromEntries(Object.entries(change).filter(([k, v]) => canon(v) !== canon(blank(h.fields[k]))));
        if (Object.keys(patch).length === 0) return stamp(h, f, needs);
        const prior = listOf(h.fields.needs);
        const wants = needsWith(prior, needs);
        if (canon(wants) !== canon(prior)) patch.needs = wants;
        const cause = `tools-seen#${h.id}#${fingerprint(canon(patch))}`;
        const open = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE cause = ? AND status = 'open' LIMIT 1", cause);
        if (open) return { name, did: 'waiting', row: h.spoken, question: open.id };
        const question = f.kind === 'integration' ? fitted('Change the address of ', name, '?') : fitted('Change how ', name, ' starts?');
        const filed = kernel.propose(
          {
            question,
            body_kind: 'rowset',
            body: { register: TOOLS, rows: [{ at: h.spoken, version: h.version, patch }], details: { source: f.source.trim(), machine, was: h.start, now: start } },
            cause,
          } as never,
          w as WriteContext,
        );
        if (!filed.ok) return { name, did: 'skipped', row: h.spoken, why: 'refusal' in filed ? filed.refusal.fix : 'BrainDog did not take the question.' };
        if (filed.value.answered !== undefined) return { name, did: 'skipped', row: h.spoken, why: 'This change was answered on Decide before, so it was not asked again.' };
        return { name, did: filed.value.joined ? 'waiting' : 'asked', row: h.spoken, question: filed.value.id };
      }

      /**
       * A TOOL THE RECORD NOW HOLDS IS TAKEN OUT OF EVERY OPEN "ADD EVERYWHERE" QUESTION that would add it again, by its
       * name and program: on 20 Oct one run asked, another added the same tools directly, and his yes two days later
       * made them twice. A question left with nothing to add is closed as moot, as `recheck` closes one already so.
       */
      function unask(rows: Held[]): void {
        const holds = new Set(rows.map((h) => `${folded(h.fields.name)}\u0000${h.program}`));
        for (const q of sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE cause LIKE 'tools-seen#everywhere#%' AND status = 'open'")) {
          let body: { rows?: unknown } & Record<string, unknown>;
          try {
            body = JSON.parse(q.body) as typeof body;
          } catch {
            continue;
          }
          const asked = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
          const left = asked.filter((r) => !holds.has(`${folded(r.name)}\u0000${programOf(r)}`));
          if (left.length === asked.length) continue;
          const ts = new Date(now).toISOString();
          if (left.length === 0) {
            sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ? AND status = 'open'", q.id);
            sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'system', 'resolve', ?, 'suggestion', 'moot', ?)", mint(), ts, `suggestion:${q.id}`, MOOT_HELD);
            continue;
          }
          const gone = asked.length - left.length;
          sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, rows: left }), q.id);
          sql.exec(
            "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'system', 'note', ?, 'suggestion', ?, ?)",
            mint(),
            ts,
            `suggestion:${q.id}`,
            String(gone),
            gone === 1 ? 'One of these tools is in your BrainDog already, so a yes no longer adds it again.' : `${String(gone)} of these tools are in your BrainDog already, so a yes no longer adds them again.`,
          );
        }
      }

      /**
       * A RUN IN A PROJECT DOES NOT ADD A TOOL FOR EVERY PROJECT BY ITSELF: the tools of the user's config it found new
       * are one question, with their keys by name only. One already carried by an open question waits on it.
       */
      function askEverywhere(asks: { f: FoundTool; i: number; fields: Record<string, unknown> }[], said: SeenTool[]): void {
        const carried = new Map<string, string>();
        for (const q of sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE cause LIKE 'tools-seen#everywhere#%' AND status = 'open'")) {
          let rows: unknown = [];
          try {
            rows = (JSON.parse(q.body) as { rows?: unknown }).rows;
          } catch {
            continue;
          }
          for (const r of Array.isArray(rows) ? rows : []) if (r !== null && typeof r === 'object') carried.set(folded((r as { name?: unknown }).name), q.id);
        }
        const fresh = asks.filter((a) => {
          const waiting = carried.get(folded(a.f.name));
          if (waiting !== undefined) said[a.i] = { name: a.f.name.trim(), did: 'waiting', question: waiting };
          return waiting === undefined;
        });
        if (fresh.length === 0) return;
        const names = fresh.map((a) => a.f.name.trim());
        const cause = `tools-seen#everywhere#${fingerprint(canon(fresh.map((a) => [folded(a.f.name), programOf(a.f)]).sort()))}`;
        const filed = kernel.propose(
          {
            question: names.length === 1 ? fitted('Add ', names[0]!, ' to the tools, for use everywhere?') : severalAsked(names),
            body_kind: 'rowset',
            body: { register: TOOLS, rows: fresh.map((a) => a.fields), details: { source: [...new Set(fresh.map((a) => a.f.source.trim()))].join(' and '), machine } },
            cause,
          } as never,
          w as WriteContext,
        );
        for (const a of fresh) {
          const name = a.f.name.trim();
          said[a.i] = !filed.ok
            ? { name, did: 'skipped', why: 'refusal' in filed ? filed.refusal.fix : 'BrainDog did not take the question.' }
            : filed.value.answered !== undefined
              ? { name, did: 'skipped', why: 'Adding it for use everywhere was answered on Decide before, so it was not asked again.' }
              : { name, did: filed.value.joined ? 'waiting' : 'asked', question: filed.value.id };
        }
      }
    },
  };
}

/** Rows with the live ones first and the retired last, each kept in the order it was read. */
const liveFirst = <T extends { fields: Record<string, unknown> }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => Number(a.fields.state === 'retired') - Number(b.fields.state === 'retired'));

/** The longest question the record asks: one line on a phone. */
const QUESTION = 80;

/** A question with a name in it, the name cut so the whole stays inside 80 characters. */
function fitted(before: string, name: string, after: string): string {
  const room = QUESTION - before.length - after.length;
  return `${before}${name.length <= room ? name : `${name.slice(0, Math.max(1, room - 3))}...`}${after}`;
}

/** The one question for several tools, inside 80 characters: as many names as fit, then how many more. */
function severalAsked(names: string[]): string {
  const lead = `Add ${String(names.length)} tools for use everywhere`;
  for (let shown = names.length; shown >= 1; shown--) {
    const rest = names.length - shown;
    const said = rest === 0 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}` : `${names.slice(0, shown).join(', ')} and ${String(rest)} more`;
    if (`${lead}: ${said}?`.length <= QUESTION) return `${lead}: ${said}?`;
  }
  return `${lead}?`;
}
