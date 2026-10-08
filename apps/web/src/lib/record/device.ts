/**
 * `/settings/agents`, the address every device code points at: what the screen decides, with no runes.
 *
 * PURE, SO `node --test` CAN IMPORT IT. A `.svelte.ts` file needs the compiler, and the parts with
 * consequences are here: what counts as a code and what each answer from `deviceApprove` means to the
 * person.
 *
 * THE RECORD'S SHAPE AND NOTHING ELSE. The kernel names a grant by a handle and never by its poll id,
 * and five wrong codes leave rows `denied`. The screen draws `listDevices` and `listTokens` as they
 * come back. It also drew the sample's machines and keys, converted into those rows, until the sample
 * went.
 *
 * NO APPROVAL IS SIMULATED. The kernel owns the arithmetic of a wrong guess and tests it.
 *
 * AND WHAT IS CONNECTED IS ONE LIST. A machine signed in by six digits, a key minted
 * for a script and an app let in through OAuth are three ways of letting something act on the record, and the owner's
 * question is the same about each: what is it, what can it do, when did it last work, and how do I stop it. So
 * `connected` folds the record's two lists, and the runs they opened, into rows that answer those four.
 */

import type { DeviceApproved, DeviceRow } from '@braindog/client';

import { BASE } from '../at.ts';
import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';
import { AGENT_NAMES } from './names.ts';

export type { DeviceRow };

/** Six digits is a million, which is only safe beside five tries and ten minutes (`12 §6.1`). */
export const CODE_DIGITS = 6;

/** `listTokens`, as `TokenRow` in `@braindog/kernel` has it. Never the bearer. */
export type TokenRow = {
  id: string;
  person_id: string;
  scope: 'read' | 'propose' | 'write';
  /* WHAT IT MAY OPEN BEYOND ITS SCOPE, `inbox` so far (`TOKEN_REACHES` in `@braindog/kernel`). Optional, because a host
     older than token reaches answers without it, and that is a token that reaches nothing more. */
  reach?: string[];
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_surface: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  /** Present when the operator's cut-off ended it: it can do nothing, and the list says why. */
  ended_by?: 'operator';
  /** Whose token this is, for the owner's `listTokens`. Absent on a host older than the field. */
  person_name?: string | null;
  /** The build of the command behind the key, as its last call said it (AGT-A02). Absent on an older host. */
  last_build?: string | null;
  /** When the key last made a tool call through the door. Absent on an older host. */
  last_tool_at?: string | null;
};

/**
 * A report key, as a person reads one: what its owner named it and the list it sends numbers to, or `null` for any
 * other token.
 *
 * ITS LABEL IS ITS BINDING, `report:{"register":...}` (`packages/record/src/report.ts`), because a label is fixed for a
 * token's life. Printed as it is, the settings list showed JSON where a name goes and "can read and change rows"
 * beside a key that can do neither.
 */
export function reportKeyOf(label: string | null): { name: string | null; register: string } | null {
  if (label === null || !label.startsWith('report:')) return null;
  try {
    const said = JSON.parse(label.slice('report:'.length)) as { register?: unknown; name?: unknown };
    return {
      name: typeof said.name === 'string' && said.name.trim() !== '' ? said.name : null,
      register: typeof said.register === 'string' ? said.register : '',
    };
  } catch {
    return { name: null, register: '' };
  }
}

/** `createToken`: the only copy of the bearer there will ever be. */
export type Minted = { id: string; bearer: string; scope: string; expires_at: string };

/** A refusal as the client hands one back, and only the keys read here. */
export type Refusal = { code: string; fix: string };

/**
 * The separators a code is printed with, gone, and nothing else.
 *
 * The CLI prints the code in two groups, so a paste carries a space, and a terminal or chat client may
 * have made it a non-breaking one. Anything else stays and is refused: an entry that reaches the record
 * spends a try on every waiting machine, so a paste that dragged a word along must not be sent.
 */
export const normalise = (typed: string): string => typed.replace(/[\s  -​_.‐-―-]+/gu, '');

/** What the field holds: a code to send, or which of three mistakes it is. Nothing malformed is sent. */
export type Entry =
  | { ok: true; code: string }
  | { ok: false; why: 'empty' | 'short' | 'long' | 'other'; digits: number };

export function codeOf(typed: string): Entry {
  const code = normalise(typed);
  if (/^\d+$/u.test(code) && code.length === CODE_DIGITS) return { ok: true, code };
  if (code === '') return { ok: false, why: 'empty', digits: 0 };
  if (!/^\d+$/u.test(code)) return { ok: false, why: 'other', digits: 0 };
  /* Seven digits is refused rather than trimmed: trimming would approve whichever machine the first
     six happen to match. */
  return { ok: false, why: code.length < CODE_DIGITS ? 'short' : 'long', digits: code.length };
}

/**
 * What the screen says after a press.
 *
 * `signin` IS ITS OWN KIND because it is the one refusal with a way forward on this screen: a sign-in
 * older than fifteen minutes cannot approve, and neither can no sign-in at all, and signing in is the fix
 * for both. `refused` carries the record's own sentence for anything else, a host that could not be
 * reached included. There is no `demo` kind: with no sample there is no screen a stranger approves on.
 */
export type Answer =
  | { kind: 'approved'; label: string | null; reach: DeviceRow['reach']; scope: string | null }
  | { kind: 'malformed'; why: 'empty' | 'short' | 'long' | 'other'; digits: number }
  | { kind: 'wrong' }
  | { kind: 'tries' }
  | { kind: 'expired' }
  | { kind: 'signin' }
  | { kind: 'refused'; fix: string };

export function answerOf(out: { ok: true; value: DeviceApproved } | { ok: false; refusal: Refusal }): Answer {
  if (out.ok) return { kind: 'approved', label: out.value.label, reach: out.value.reach, scope: out.value.scope };
  switch (out.refusal.code) {
    /* The kernel answers a code that matches nothing with FORBIDDEN, and says no more on purpose. */
    case 'FORBIDDEN':
      return { kind: 'wrong' };
    case 'DEVICE_CODE_TRIES':
      return { kind: 'tries' };
    case 'DEVICE_CODE_EXPIRED':
      return { kind: 'expired' };
    case 'NEEDS_BROWSER_SESSION':
      return { kind: 'signin' };
    /* The field refuses these first; a record that disagrees about the shape is still a shape mistake. */
    case 'VALUE_MALFORMED':
      return { kind: 'malformed', why: 'other', digits: 0 };
    default:
      return { kind: 'refused', fix: out.refusal.fix };
  }
}

/**
 * The key a reach's sentence is filed under. A vault grant's life depends on its scope: `*` is the
 * keys of no project and lasts seven days, one project lasts thirty.
 */
export const reachKey = (reach: DeviceRow['reach'], scope: string | null): string =>
  reach === 'vault' ? (scope === '*' ? 'vaultAll' : 'vault') : reach;

/** The rows a revoke still changes. A finished row keeps saying what it said, so it has no button. */
export const revocable = (row: DeviceRow): boolean => row.status === 'pending' || row.status === 'approved' || row.status === 'active';

/** Tokens still working. A revoked one can do nothing, so it is not something to look after. */
export const standing = (rows: readonly TokenRow[]): TokenRow[] => rows.filter((t) => t.revoked_at === null);

/**
 * The lines the first two ways of connecting an agent hand over. NONE CARRIES A BEARER: an MCP client that is given
 * the address signs in through OAuth and the owner allows it on the consent screen, and `braindog setup` starts its own
 * device flow, so no key lands in a shell history or in a client's config (`48 §2`).
 *
 * `mcp` IS THE ADDRESS ANY MCP CLIENT TAKES, and `claude` is the same address as Claude Code's own command for it: an
 * HTTP server, which the stdio line this printed before could not be, because it named a `braindog` that only a
 * checkout of the repository had.
 *
 * THE SETUP LINE NAMES THE RECORD when the screen knows it. The Cloud device flow is refused without a slug, and a line
 * with the bare origin did not work where most people would paste it. `setup` logs in, installs the hooks, registers
 * the MCP server and syncs the skills in one command.
 */
export function connectLines(origin: string, slug?: string | null): { mcp: string; claude: string; setup: string } {
  const mcp = `${origin}/mcp`;
  return {
    mcp,
    claude: `claude mcp add --transport http braindog ${mcp}`,
    setup: `braindog setup ${slug ? `${origin}${BASE}/${slug}` : origin}`,
  };
}

/**
 * The header a script sends a key it was given in, beside the key itself. The key is `<record>.<secret>`, and the
 * header is the one a key is read from at both `/api` and `/mcp` (`apps/worker/src/session.ts`, `bearerOf`).
 */
export const headerLine = (bearer: string): string => `Authorization: Bearer ${bearer}`;

/** The most runs read to find each connection's last one: the newest first, so a connection used this month is found. */
export const RUNS_READ = 200;

/** A run as the connected list reads it: its number, the key that opened it, and the agent and machine it said it was. */
export type Run = { seq: number; token: string; agent: string | null; host: string | null };

const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);

/**
 * The runs among `rows` that a key opened, as `list` answers the kernel's `session` list, newest first.
 *
 * A RUN NO KEY OPENED IS LEFT OUT: a person made it from the app for an agent to take up, and it belongs to no
 * connection (`packages/kernel/src/session.ts`, `findSession`).
 */
export function runsOf(rows: readonly unknown[]): Run[] {
  const runs: Run[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const { seq, fields } = row as { seq?: unknown; fields?: unknown };
    if (typeof seq !== 'number' || typeof fields !== 'object' || fields === null) continue;
    const f = fields as Record<string, unknown>;
    const token = text(f.token_id);
    if (token !== null) runs.push({ seq, token, agent: text(f.agent), host: text(f.host) });
  }
  return runs;
}

/** A run's name as its writes are signed, `S47`: the prefix the record declares for its runs, and the run's number. */
export const runName = (run: Run): string => `${REGISTERS.session?.seq_prefix ?? 'S'}${run.seq}`;

/**
 * One thing that can act on the record: a machine's grant, a key, or both at once.
 *
 * BOTH AT ONCE IS A MACHINE SIGNED IN BY SIX DIGITS. Its `login` grant minted a key when the machine collected it, and
 * the record lists the two apart, so drawn as they come the owner would read the same laptop twice. `run` is the newest
 * run its key opened among the runs read, and `used` the later of the two last uses.
 */
export type Connection = {
  key: string;
  machine: DeviceRow | null;
  token: TokenRow | null;
  run: Run | null;
  used: string | null;
  /** Still able to act, or about to be: a finished grant keeps saying what it said, with no Revoke. */
  live: boolean;
};

const later = (a: string | null, b: string | null): string | null => (a === null ? b : b === null || a >= b ? a : b);

/**
 * Whether `token` is the key `machine`'s login grant minted.
 *
 * THE RECORD SAYS SO IN THE ONLY WAY A LIST CAN. The exchange writes the key's own end onto the grant
 * (`packages/kernel/src/device.ts`, `devicePoll`), under the machine's label, for the person who approved it; a list
 * shows no hash to join on, so those three together are the join, and a key they do not all match stays its own row.
 */
const mintedBy = (machine: DeviceRow, token: TokenRow): boolean =>
  machine.reach === 'login' &&
  machine.status === 'active' &&
  token.label === machine.label &&
  token.expires_at === machine.expires &&
  token.person_id === machine.approved_by;

/**
 * Every machine and every standing key, as one list: what can act now first, the most recently used first within it,
 * then what has finished, which is kept because "I said no to a request I did not make" is a line worth reading
 * (`12 §6.1`).
 *
 * `tokens` ARE THE STANDING ONES (`standing`), so a revoked key is not listed twice as a finished row.
 */
export function connected(machines: readonly DeviceRow[], tokens: readonly TokenRow[], runs: readonly Run[]): Connection[] {
  const newest = new Map<string, Run>();
  for (const run of runs) if (!newest.has(run.token)) newest.set(run.token, run);
  const taken = new Set<string>();
  const rows: Connection[] = [];
  for (const machine of machines) {
    const token = tokens.find((t) => !taken.has(t.id) && mintedBy(machine, t)) ?? null;
    if (token !== null) taken.add(token.id);
    rows.push({
      key: `machine:${machine.handle}`,
      machine,
      token,
      run: token === null ? null : (newest.get(token.id) ?? null),
      used: later(machine.last_used, token?.last_used_at ?? null),
      live: revocable(machine) && machine.ended_by !== 'operator',
    });
  }
  for (const token of tokens) {
    if (taken.has(token.id)) continue;
    rows.push({ key: `key:${token.id}`, machine: null, token, run: newest.get(token.id) ?? null, used: token.last_used_at, live: token.ended_by !== 'operator' });
  }
  /* THE MOMENT A ROW IS SORTED BY: its last use, else when it was made or approved, so a key minted a minute ago and not
     used yet sits at the top rather than under every key anybody ever used. Instants the record wrote compare as text. */
  const when = (c: Connection): string => c.used ?? c.token?.created_at ?? c.machine?.approved_at ?? '';
  const newer = (a: Connection, b: Connection): number => (when(a) > when(b) ? -1 : when(a) < when(b) ? 1 : 0);
  return rows.sort((a, b) => Number(b.live) - Number(a.live) || newer(a, b));
}

/** A key read in an author's map only when the map holds it, so a name like `constructor` finds nothing. */
const own = (map: Readonly<Record<string, string>>, key: string | null): string | undefined =>
  key !== null && Object.hasOwn(map, key) ? map[key] : undefined;

/**
 * What a connection is called.
 *
 * A MACHINE IS WHAT RUNS ON IT, "Claude on STUDIO-PC", from the newest run its key opened, because the label a machine
 * signs in with is the command's own (`STUDIO-PC · braindog-cli`) and says nothing about the agent. A key and an app keep
 * the name they were given, which the owner typed or the app registered ("claude.ai"): that name was chosen.
 */
export function nameOf(c: Connection): string {
  const report = reportKeyOf(c.token?.label ?? null);
  if (report) return copy.reportKeyNamed(report.name);
  if (c.machine) {
    const agent = own(AGENT_NAMES, c.run?.agent ?? null);
    if (agent && c.run?.host) return copy.agentOn(agent, c.run.host);
    return c.machine.label ?? copy.unnamedMachine;
  }
  return c.token?.label ?? copy.unnamedKey;
}

/** What a connection may do, in words: a key's scope and its inbox, or a grant's reach and how long it lasts. */
export function reachOf(c: Connection): string {
  const t = c.token;
  if (t) {
    const report = reportKeyOf(t.label);
    if (report) return copy.reportKeyCan(report.register ? (Object.hasOwn(REGISTERS, report.register) ? (REGISTERS[report.register]?.name ?? report.register) : report.register) : '');
    const can = copy.keyCan[t.scope] ?? t.scope;
    return t.reach?.includes('inbox') ? copy.canAndInbox(can) : can;
  }
  const m = c.machine;
  return m ? (copy.reachMeans[reachKey(m.reach, m.scope)] ?? m.reach) : '';
}

/**
 * The machines waiting for six digits now, which is when the approval is the first thing on the screen.
 *
 * THE CLOCK IS AN ARGUMENT. A pending row past its ten minutes is expired whether or not the kernel has written so yet
 * (it writes it at the machine's next poll), and a field offered for a code that can no longer be approved is a field
 * that answers "ran out of time" to somebody who did everything right.
 */
export const waiting = (machines: readonly DeviceRow[], nowMs: number): DeviceRow[] =>
  machines.filter((m) => m.status === 'pending' && Date.parse(m.expires) > nowMs);

/** How long a token minted from this screen lasts, as `createToken` is asked for it. */
export const TOKEN_DAYS = 90;

/** The label `deviceStart` allows, and the one this screen asks for when minting. */
export const LABEL_MAX = 120;
