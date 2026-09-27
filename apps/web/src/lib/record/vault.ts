/**
 * `/vault`, and the approval it shares with `/settings/agents`: what the two screens decide, with no runes.
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `device.ts` gives. The client and the sign-in helpers
 * are handed in, so every branch is testable against an object literal.
 *
 * AND NOTHING HERE DRAWS A VAULT THAT IS NOT THE RECORD. This module turned the sample's grants and keys into
 * the record's rows for a visitor with no record; the sample went on 25 September (DIRECTION 26), and the
 * screen now draws only what `listDevices`, `list` and `listGrants` answer.
 *
 * ONE APPROVAL, TWO SCREENS. A machine asking to open keys prints `/settings/agents`, and the Vault
 * shows the same request at the top. Both send the six digits through `approve` and say what came back
 * through `answerLine`, so the two cannot drift into different rules for one act.
 *
 * NEVER A VALUE, A CODE OR A HANDLE. A key row carries what is known about its grant: whether a value is
 * sealed, how often it was opened and when. A machine row carries its label, its scope and its days.
 *
 * THE WORDS ARE HERE AND NOT IN `copy.ts`, because `copy.ts` is in the entry chunk every screen waits
 * for and these are read by two routes that are not the home page.
 */

import type { DeviceApproved, DeviceRow } from '@braindog/client';

import { BASE, signinFor } from '../at.ts';
import { copy } from '../copy.ts';
import { answerOf, codeOf, reachKey, type Answer, type Refusal } from './device.ts';
import { REGISTERS } from './held.ts';
import type { Scope } from './scope-move.ts';

/** The scope a vault grant names when it opens the keys of no project. */
export const GLOBAL = '*';

/** How long an approved vault grant lasts: `packages/kernel/src/device.ts`, and question 6 of the agent path. */
export const VAULT_DAYS = 30;
export const VAULT_ALL_DAYS = 7;

export const words = {
  waiting: 'A request is waiting',
  keys: 'Keys',
  mayOpen: 'Machines that may open keys',
  global: 'Global',
  someProject: 'A project',
  days: (n: number) => `${n} days`,
  sealed: 'Sealed',
  indexOnly: 'Value not kept here',
  opened: (n: number) => (n === 0 ? 'never opened' : n === 1 ? 'opened once' : `opened ${n} times`),
  lastOpened: (when: string) => `last ${when}`,
  noKeys: 'No keys yet',
  noKeysHow: 'Add one here, or let an agent add one with braindog keys put and run a command with it through braindog keys exec <label> -- <command>.',
  noMachines: 'No machine may open keys',
  /* Putting a key in, replacing one, and reading one back: `/api/keys/*`, a browser session only. */
  addKey: 'Add a key',
  replace: 'Replace value',
  replaceTitle: (label: string) => `Replace ${label}`,
  nameField: 'Name',
  nameHint: 'What you would call it out loud, such as Kiln deploy.',
  opensAsk: 'What it opens',
  opensHint: 'A host or an account, such as Deploys kiln.example.',
  kindField: 'Kind',
  projectField: 'Project',
  projectNone: 'No project',
  valueField: 'Value',
  valueHint: 'Pasted once. This host seals it, and the record is handed sealed bytes.',
  valueAgain: 'The new value replaces the old one. What the old one opened stays on the record.',
  save: 'Save',
  saving: 'Saving',
  cancel: 'Cancel',
  reveal: 'Reveal',
  revealing: 'Opening',
  hide: 'Hide',
  copyValue: 'Copy',
  copied: 'Copied. The clipboard clears itself in a minute.',
  hidesIn: (s: number) => `Hides in ${s}s`,
  keyAdded: (label: string) => `${label} is in the vault.`,
  keyReplaced: (label: string) => `${label} has a new value.`,
  /** The kinds a key row declares, as a person reads them. `packages/kernel`'s `GRANT_KINDS`, in its order. */
  kinds: [
    { id: 'api_token', name: 'API token' },
    { id: 'password', name: 'Password' },
    { id: 'ssh_key', name: 'SSH key' },
    { id: 'recovery_codes', name: 'Recovery codes' },
    { id: 'note', name: 'Note' },
  ],
  /* The pack offered after "Connect an agent". */
  notNow: 'Not now',
  packInstalled: 'The agents add-on is installed.',
  seeds: (n: number) => `${n} example ${n === 1 ? 'row' : 'rows'}, marked example, clearable in one action`,
  touches: 'nothing you have written: 0 rows read, 0 of your rows changed',
  conflict: (name: string, pack: string) => `${name} already exists, from ${pack}`,
} as const;

/* ── the approval ─────────────────────────────────────────────────────── */

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** The one client method an approval calls. */
export type Approver = { deviceApprove(args: { user_code: string }): Promise<Wire<DeviceApproved>> };

/**
 * The six digits, sent or refused. Nothing malformed is sent.
 *
 * NO CLIENT IS NOBODY SIGNED IN TO APPROVE AS, so the answer is `signin`: the one refusal with a way forward on
 * this screen, drawn with its Sign in again button. It answered `demo` while `/app` with no session was the sample
 * record, and "The demo has no account" would now be said to a person whose only problem is a missing sign-in.
 */
export async function approve(typed: string, client: Approver | null): Promise<Answer> {
  const entry = codeOf(typed);
  if (!entry.ok) return { kind: 'malformed', why: entry.why, digits: entry.digits };
  if (!client) return { kind: 'signin' };
  const out = await client.deviceApprove({ user_code: entry.code });
  /* `deviceApprove` carries no version, so a conflict cannot come back; it is read as a miss rather than drawn blank. */
  return 'conflict' in out ? { kind: 'wrong' } : answerOf(out);
}

/** What the status line under the field says, or nothing. */
export function answerLine(a: Answer | null): { tone: 'good' | 'bad'; line: string } | null {
  if (!a) return null;
  switch (a.kind) {
    case 'approved':
      return { tone: 'good', line: copy.approvedNow(a.label ?? copy.unnamedMachine, copy.reachMeans[reachKey(a.reach, a.scope)] ?? a.reach) };
    case 'malformed':
      return {
        tone: 'bad',
        line: a.why === 'empty' ? copy.codeEmpty : a.why === 'short' ? copy.codeShort(a.digits) : a.why === 'long' ? copy.codeLong(a.digits) : copy.codeOther,
      };
    case 'wrong':
      return { tone: 'bad', line: copy.codeWrong };
    case 'tries':
      return { tone: 'bad', line: copy.codeTries };
    case 'expired':
      return { tone: 'bad', line: copy.codeExpired };
    case 'signin':
      return { tone: 'bad', line: copy.signInAgainWhy };
    default:
      return { tone: 'bad', line: a.fix };
  }
}

/** The sign-in helpers `reprove` needs, as `lib/auth.ts` exports them. */
export type Auth = {
  support(): { webauthn: boolean; secure: boolean };
  methods(): Promise<{ ok: true; value: { passkey: boolean } } | { ok: false }>;
  passkeySignIn(): Promise<{ ok: boolean }>;
};

/**
 * Signing in again without leaving, where a passkey can do it, so the typed code can be sent again.
 * Anywhere else the person is sent to `/signin` and this answers false.
 *
 * UNDER THE APP, AND ASKED TO COME BACK. A bare `/signin` on `brain.dog` is the marketing site's, and sign-in with no
 * `next` lands on the app's front door, which is not the screen whose step this was.
 */
export async function reprove(auth: Auth, go: (href: string) => void): Promise<boolean> {
  const here = auth.support();
  const offered = await auth.methods();
  if (!(offered.ok && offered.value.passkey && here.webauthn && here.secure)) {
    go(globalThis.location ? signinFor(globalThis.location) : `${BASE}/signin`);
    return false;
  }
  return (await auth.passkeySignIn()).ok;
}

/** The one client method a revoke calls. */
export type Revoker = { revokeDevice(args: { handle: string }): Promise<Wire<DeviceRow>> };

/**
 * The rows after revoking one, or the record's sentence for why not.
 *
 * A CONFLICT CARRIES NO SENTENCE OF ITS OWN, and it used to borrow the demo's, so a live record that raced would
 * have been told it was the demo. It borrows the one every other write on this screen says for a race.
 */
export async function revoke(client: Revoker, rows: readonly DeviceRow[], handle: string): Promise<{ ok: true; rows: DeviceRow[] } | { ok: false; fix: string }> {
  const out = await client.revokeDevice({ handle });
  if (out.ok) return { ok: true, rows: rows.map((m) => (m.handle === handle ? out.value : m)) };
  return { ok: false, fix: 'refusal' in out ? out.refusal.fix : copy.writeRaced };
}

/* ── the machines ─────────────────────────────────────────────────────── */

/** Vault grants waiting for the six digits. */
export const asks = (rows: readonly DeviceRow[]): DeviceRow[] => rows.filter((r) => r.reach === 'vault' && r.status === 'pending');

/** Vault grants that may open keys now, or will at the machine's next poll. */
export const holders = (rows: readonly DeviceRow[]): DeviceRow[] =>
  rows.filter((r) => r.reach === 'vault' && (r.status === 'approved' || r.status === 'active'));

/** How many days a grant for this scope lasts once approved. */
export const daysFor = (scope: string | null): number => (scope === null || scope === GLOBAL ? VAULT_ALL_DAYS : VAULT_DAYS);

/** A scope as a person reads it: the project's name, or Global. A project this screen could not name is still a project. */
export const scopeName = (scope: string | null, names: ReadonlyMap<string, string>): string =>
  scope === null || scope === GLOBAL ? words.global : (names.get(scope) ?? words.someProject);

/** A project's mark and hue by row id, from the same `list` `namesOf` reads (AGT-11): what a key's `scope` chip is drawn from. */
export type ProjectMark = { seq: number; mark: string | null; hue: number | null };

/**
 * Project names by row id, from a `list` of the projects register, carrying each row's mark and hue
 * alongside (`.marks`) for a scope chip; a row with no `seq` (the sample's untouched literal) carries none.
 */
export function namesOf(
  rows: readonly { id: string; seq?: number | null; fields: Record<string, unknown> }[],
  title = 'name',
): ReadonlyMap<string, string> & { readonly marks: ReadonlyMap<string, ProjectMark> } {
  const decl = REGISTERS.things;
  const out = new Map<string, string>();
  const marks = new Map<string, ProjectMark>();
  for (const r of rows) {
    if (typeof r.fields[title] === 'string') out.set(r.id, r.fields[title] as string);
    if (typeof r.seq === 'number') {
      const mark = decl?.identity ? r.fields[decl.identity.mark] : undefined;
      const hue = decl?.identity ? r.fields[decl.identity.accent] : undefined;
      marks.set(r.id, {
        seq: r.seq,
        mark: typeof mark === 'string' && mark !== '' ? mark : null,
        hue: typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359 ? hue : null,
      });
    }
  }
  return Object.assign(out, { marks });
}

/* ── the keys ─────────────────────────────────────────────────────────── */

/** One row of the Keys index. `project` is a name, or null for a global key. */
export type KeyRow = {
  id: string;
  label: string;
  opens: string;
  project: string | null;
  /** Where the key applies, as the chip draws it (AGT-11): the project's spoken id, name, mark and hue, or `null` for
      a global key. Built from the same project row `project` names, never a second lookup. */
  scope: Scope | null;
  sealed: boolean;
  opened: number;
  lastOpened: string | null;
  /** The grant `revokeGrant` names, where this row points at one. An index row points at none. */
  grant: string | null;
};

/** `listGrants`, with only the keys read here. */
export type GrantState = { id: string; opened: number; last_opened: string | null; revoked_at: string | null };

type KnownState = { sealed: boolean; opened: number; last_opened: string | null };

const isKnown = (v: unknown): v is KnownState =>
  typeof v === 'object' && v !== null && typeof (v as KnownState).sealed === 'boolean' && typeof (v as KnownState).opened === 'number';

/**
 * The credentials register's rows as the index draws them: retired rows are gone, and the order is
 * the label's.
 *
 * THE SECRET FIELD IS READ TWO WAYS. A row from `list` holds the grant's id there, joined to `listGrants`
 * for the counts; a row from `context` holds what is known already. A row pointing at no grant is an
 * index row: the key is kept somewhere the row names, not here.
 */
export function keysOf(
  rows: readonly { id: string; fields: Record<string, unknown>; state?: string | null }[],
  grants: readonly GrantState[],
  names: ReadonlyMap<string, string> & { marks?: ReadonlyMap<string, ProjectMark> },
  field = 'value',
): KeyRow[] {
  const byId = new Map(grants.map((g) => [g.id, g]));
  return rows
    .filter((r) => (r.state ?? r.fields.state) !== 'retired')
    .map((r): KeyRow => {
      const value = r.fields[field];
      const grant = typeof value === 'string' ? byId.get(value) : undefined;
      const known = isKnown(value) ? value : null;
      const projectId = typeof r.fields.project === 'string' ? r.fields.project : null;
      const project = projectId ? (names.get(projectId) ?? words.someProject) : null;
      const mark = projectId ? names.marks?.get(projectId) : undefined;
      const scope: Scope | null = projectId
        ? { spoken: mark ? `things#${mark.seq}` : projectId, name: project ?? words.someProject, mark: mark?.mark ?? null, hue: mark?.hue ?? null }
        : null;
      return {
        id: r.id,
        grant: grant ? grant.id : null,
        label: String(r.fields.label ?? ''),
        opens: String(r.fields.opens ?? ''),
        project,
        scope,
        sealed: known ? known.sealed : grant ? grant.revoked_at === null : typeof value === 'string',
        opened: known?.opened ?? grant?.opened ?? 0,
        lastOpened: known?.last_opened ?? grant?.last_opened ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ── the pack offered on connect ──────────────────────────────────────── */

/** `planPack`'s diff, with only the keys drawn here. */
type PlanDiff = {
  pack?: { summary?: string };
  adds?: { id: string; summary: string }[];
  conflicts?: { id: string; pack: string }[];
  seeds?: { count: number };
  planHash?: string;
};

/** "What this adds", as the Packs screen draws it. */
export type Plan = {
  summary: string;
  adds: { kind: 'list' | 'page' | 'figure'; name: string; detail: string }[];
  conflicts: string[];
  /** What example rows it writes, or `null` when it writes none, so the plan has no line to say so. */
  seeds: string | null;
  touches: string;
  planHash: string;
};

const counted = (summary: string, one: string, many: string): string =>
  summary.replace(/^(\d+) \S+$/u, (_, n: string) => (n === '1' ? `1 ${one}` : `${n} ${many}`));

/**
 * A plan from the record, in the Packs screen's words. `nameOf` names a register or a page by id; the
 * plan carries ids, and the reader is being asked about names. A plan with no hash is no plan.
 */
export function planOf(diff: unknown, nameOf: (kind: 'register' | 'page' | 'metric', id: string) => string): Plan | null {
  if (typeof diff !== 'object' || diff === null) return null;
  const d = diff as PlanDiff;
  if (typeof d.planHash !== 'string' || d.planHash === '') return null;
  const split = (id: string): { kind: 'register' | 'page' | 'metric'; name: string } => {
    const [kind, ...rest] = id.split('.');
    const bare = rest.join('.') || id;
    return kind === 'register'
      ? { kind, name: nameOf('register', bare) }
      : kind === 'metric'
        ? { kind, name: nameOf('metric', bare) }
        : { kind: 'page', name: nameOf('page', bare) };
  };
  return {
    summary: d.pack?.summary ?? '',
    adds: (d.adds ?? []).map((a) => {
      const { kind, name } = split(a.id);
      return kind === 'register'
        ? { kind: 'list', name, detail: counted(a.summary, 'field', 'fields') }
        : kind === 'metric'
          ? { kind: 'figure', name, detail: '' }
          : { kind: 'page', name, detail: counted(a.summary, 'table or figure', 'tables and figures') };
    }),
    conflicts: (d.conflicts ?? []).map((c) => words.conflict(split(c.id).name, c.pack)),
    seeds: (d.seeds?.count ?? 0) === 0 ? null : words.seeds(d.seeds?.count ?? 0),
    touches: words.touches,
    planHash: d.planHash,
  };
}

/* ── reconnecting a paused action's key ──────────────────────────────── */

/** What `/vault?reconnect=<label>&then=<action>` opens: the row to replace, or a new key under that name, and the action to resume. */
export type Reconnect = { then: string | null } & ({ mode: 'replace'; row: KeyRow } | { mode: 'add'; label: string });

/**
 * The sheet a paused action's "Reconnect key" opens, or `null` when the address asks for none.
 *
 * THE KEY IS FOUND BY ITS LABEL, case-blind, because that is how a declaration names it and how the row that paused says
 * it. A label the vault does not hold opens Add with the name filled in, which is the "not in the vault" pause.
 */
export function reconnectOf(params: URLSearchParams, keys: readonly KeyRow[]): Reconnect | null {
  const label = params.get('reconnect')?.trim() ?? '';
  if (label === '') return null;
  const then = params.get('then')?.trim() || null;
  const row = keys.find((k) => k.label.trim().toLowerCase() === label.toLowerCase());
  return row ? { mode: 'replace', row, then } : { mode: 'add', label, then };
}
