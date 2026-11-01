/**
 * `/keychain`, and the approval it shares with `/settings/agents`: what the two screens decide, with no runes.
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `device.ts` gives. The client and the sign-in helpers
 * are handed in, so every branch is testable against an object literal.
 *
 * AND NOTHING HERE DRAWS A KEYCHAIN THAT IS NOT THE RECORD. This module turned the sample's grants and keys into
 * the record's rows for a visitor with no record; the sample is gone, and the
 * screen now draws only what `listDevices`, `list` and `listGrants` answer.
 *
 * ONE APPROVAL, EVERY SCREEN. A machine asking to open keys prints `/connect/approve`, Settings, Agents takes the
 * same code, and the Keychain shows the same request at the top. All send the six digits through `approve` and say what came back
 * through `answerLine`, so they cannot drift into different rules for one act.
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
import { list } from '../copy/english.ts';
import { answerOf, codeOf, reachKey, type Answer, type Refusal } from './device.ts';
import { REGISTERS } from './held.ts';
import { KEYS_REGISTER } from './keys-register.ts';
import type { Scope } from './scope-move.ts';

/** The scope a keychain access names when it opens the keys of no project. */
export const GLOBAL = '*';

/** How long an approved keychain access lasts: `packages/kernel/src/device.ts`, and question 6 of the agent path. */
export const KEYCHAIN_DAYS = 30;
export const KEYCHAIN_ALL_DAYS = 7;

export const words = {
  waiting: 'A request is waiting',
  keys: 'Keys',
  mayOpen: 'Machines that open keys',
  global: 'Global',
  someProject: 'A project',
  days: (n: number) => `${n} days`,
  sealed: 'Sealed',
  opened: (n: number) => (n === 0 ? 'never opened' : n === 1 ? 'opened once' : `opened ${n} times`),
  lastOpened: (when: string) => `last ${when}`,
  /* WHO OPENED IT LAST, when that was a run: `usedBy`'s newest, as a key's row page and "Runs on" say it. */
  openedBy: (run: string, agent: string | null, when: string) => `Last opened by ${run}${agent ? ` (${agent})` : ''} ${when}`,
  noKeys: 'No keys yet',
  noKeysHow: 'A key is a password, a token or a set of codes an agent may use without ever reading it.',
  /* THE COMMAND AN AGENT ADDS ONE WITH, said on its own line with Copy, never mid-sentence. */
  noKeysAgent: 'Or have an agent add one:',
  noKeysCommand: 'braindog keys put <name>',
  noMachines: 'No machine opens keys yet',
  /* HOW ONE GETS HERE, so the empty part says what will be in it and how (Look B: never "None yet" alone). */
  noMachinesHow: 'A machine asks when an agent on it first needs a key, and shows here once you approve it.',
  /* Putting a key in, replacing one, and reading one back: `/api/keys/*`, a browser session only. */
  addKey: 'Add a key',
  replace: 'Replace value',
  replaceTitle: (label: string) => `Replace the value of ${label}`,
  addValueTitle: (label: string) => `Add the value for ${label}`,
  nameField: 'Name',
  nameHint: 'What you would call it out loud, such as Kiln deploy.',
  opensAsk: 'What it opens',
  opensHint: 'A host or an account, such as Deploys kiln.example.',
  kindField: 'Kind',
  projectField: 'Project',
  projectNone: 'No project',
  valueField: 'Value',
  valueHint: 'Locked when saved. Nobody can read it back, you included.',
  valueAgain: 'The new value replaces the old one. What the old one opened stays in your BrainDog.',
  save: 'Save',
  saving: 'Saving',
  cancel: 'Cancel',
  reveal: 'Reveal',
  revealing: 'Opening',
  hide: 'Hide',
  copyValue: 'Copy',
  copied: 'Copied. The clipboard clears itself in a minute.',
  hidesIn: (s: number) => `Hides in ${s}s`,
  keyAdded: (label: string) => `${label} is in the Keychain.`,
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
  /* AGENTS IS PART OF BRAINDOG, never an add-on to choose: a record that lacks it is offered it as turning it on. */
  offerTitle: 'Turn on Agents?',
  packInstalled: 'Agents is on.',
  seeds: (n: number) => `${n} example ${n === 1 ? 'row' : 'rows'}, marked example, clearable in one action`,
  touches: 'Nothing you wrote is touched',
  /* THE OFFER'S FIGURES, FOLDED: forty engineer-worded names were a wall under Settings › Agents. */
  moreFigures: (n: number) => `and ${String(n)} ${n === 1 ? 'number' : 'numbers'}`,
  conflict: (name: string, pack: string) => `${name} already exists, from ${pack}`,
  /* WHAT AN UPDATE CHANGES. A declaration another pack handed this one is taken over, said by both names; one of its own
     is changed. */
  changesTitle: 'Changes',
  takesOver: (names: string[], pack: string) => `Takes ${list(names)} over from ${pack}`,
  changesOwn: (name: string, detail: string) => (detail === '' ? `Changes ${name}` : `Changes ${name}, now ${detail}`),
  /* THE KEYCHAIN PASSPHRASE (`12 §6`, "The optional second factor"): the switch, the honesty table and the two sheets. The
     table is the document's own trade, said in a person's words, with the consequence in the same place as the switch. */
  passphrase: 'Keychain password',
  lockSwitch: 'Keychain password',
  /* THE PASSPHRASE ROW'S LINE WHILE IT IS OFF: the state and what turning it on does, in one sentence (`12 §6`). */
  lockOffRow: 'Off',
  lockNoKeys: 'Add a key first.',
  lockHow: 'How it works',
  lockOn: 'On. Only you can open your keys.',
  lockOff: 'Off. BrainDog opens keys with the host key.',
  lockReading: 'Checking whether the Keychain has a password.',
  lockProtects: 'Only you can open your keys, here. Connector keys stay on the host key, so scheduled pulls keep running.',
  tableCaption: 'What the keychain password changes',
  tableState: 'Keychain password',
  tableReads: 'BrainDog can open your keys',
  tableForget: 'If you forget it',
  rowOff: 'Off',
  rowOffNote: '(the default)',
  rowOn: 'On',
  offReads: 'Yes, with the key this host keeps',
  offForget: 'Nothing is lost',
  onReads: 'No, only you can',
  onForget: 'BrainDog cannot open your keys, and nobody can reset it',
  backups: 'Older backups open with the host key until they age out in 30 days.',
  turnOnTitle: 'Set a keychain password',
  turnOnHint: 'A sentence you will remember beats a short password.',
  turnOffTitle: 'Take the keychain password off',
  turnOffHint: 'Keys go back under the host key.',
  passField: 'Keychain password',
  passAgain: 'Type it again',
  passAgainHint: 'So a typo cannot lock you out.',
  passDiffer: 'The two do not match yet.',
  passForget: 'If you forget it, BrainDog cannot open your keys.',
  showPass: 'Show keychain password',
  hidePass: 'Hide keychain password',
  turnOn: 'Put the keychain password on',
  turningOn: 'Putting it on',
  turnOff: 'Take the keychain password off',
  turningOff: 'Taking it off',
  lockedNow: 'The Keychain is behind its password.',
  unlockedNow: 'Keychain password off.',
  askTitle: (label: string) => `Open ${label}`,
  askHint: 'Sent with this request only, never kept.',
  askGo: 'Open the key',
  keyPassHint: 'Sent with this request only, never kept.',
} as const;

/* ── the approval ─────────────────────────────────────────────────────── */

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** The one client method an approval calls. */
export type Approver = { deviceApprove(args: { user_code: string }): Promise<Wire<DeviceApproved>> };

/**
 * The six digits, sent or refused. Nothing malformed is sent.
 *
 * NO CLIENT IS NOBODY SIGNED IN TO APPROVE AS, so the answer is `signin`: the one refusal with a way forward on
 * this screen, drawn with its Sign in again button. It answered `demo` while the bare address with no session was the sample
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

/** Keychain access waiting for the six digits. */
export const asks = (rows: readonly DeviceRow[]): DeviceRow[] => rows.filter((r) => r.reach === 'vault' && r.status === 'pending');

/** Keychain access that may open keys now, or will at the machine's next poll. */
export const holders = (rows: readonly DeviceRow[]): DeviceRow[] =>
  rows.filter((r) => r.reach === 'vault' && (r.status === 'approved' || r.status === 'active'));

/** How many days a grant for this scope lasts once approved. */
export const daysFor = (scope: string | null): number => (scope === null || scope === GLOBAL ? KEYCHAIN_ALL_DAYS : KEYCHAIN_DAYS);

/** A scope as a person reads it: the project's name, or Global. A project this screen could not name is still a project. */
export const scopeName = (scope: string | null, names: ReadonlyMap<string, string>): string =>
  scope === null || scope === GLOBAL ? words.global : (names.get(scope) ?? words.someProject);

/** A project's mark and hue by row id, from the same `list` `namesOf` reads: what a key's `scope` chip is drawn from. */
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
      /* THE PROJECTS LIST'S OWN IDENTITY FIELDS, else `mark` and `hue` as every seed project holds them: on a tab that has not
         learnt the list yet the chip's dot was the neutral grey under a project with a colour (as `project-cards.ts`). */
      const mark = r.fields[decl?.identity?.mark ?? 'mark'];
      const hue = r.fields[decl?.identity?.accent ?? 'hue'];
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
  /** The row as a person says it, `credentials#3`, which `usedBy` is asked with; `null` for a row read without its seq. */
  spoken: string | null;
  label: string;
  opens: string;
  /** Who the key is with ("Azure", "Stripe"), as its row says, or `null`: the Keychain groups a project's keys by it. */
  provider?: string | null;
  /** Which account the key is for (a user name or address), as its row says. Not secret. */
  account?: string;
  project: string | null;
  /** Where the key applies, as the chip draws it: the project's spoken id, name, mark and hue, or `null` for
      a global key. Built from the same project row `project` names, never a second lookup. */
  scope: Scope | null;
  sealed: boolean;
  opened: number;
  lastOpened: string | null;
  /** The grant `revokeGrant` names, where this row points at one. An index row points at none. */
  grant: string | null;
  /** Whether the row says where the key is kept when its value is not here (`where`), so it is not one with no value
      anywhere: the Agents page's "keys with no value" counts the same rows (`keys-nowhere`). */
  kept?: boolean;
  /** How long the sealed value is, in bytes. Absent on a row with no value sealed here and on a seal older than the fact. */
  bytes?: number;
  /** What the sealed value is, unopened ("a 40-character value"), as the host wrote it when it sealed. Absent as `bytes` is. */
  hint?: string;
  /** When the value was last put in or rotated, else when it was first sealed. Absent where the grant says neither. */
  changed?: string;
  /** The day the key runs out, from the register's `expires` deadline, else the grant's own. Absent where there is none. */
  expires?: string;
};

/** `listGrants`, with only the keys read here. `bytes` and `hint` are absent from a host older than them and null on an older seal. */
export type GrantState = {
  id: string;
  opened: number;
  last_opened: string | null;
  revoked_at: string | null;
  bytes?: number | null;
  hint?: string | null;
  created_at?: string | null;
  rotated_at?: string | null;
  expires_at?: string | null;
};

type KnownState = { sealed: boolean; opened: number; last_opened: string | null; bytes?: unknown; hint?: unknown };

/** The longest hint the record keeps (`packages/kernel/src/keychain.ts`, `bindGrant`): past it a hint could be the value. */
export const HINT_MOST = 60;

/**
 * The two facts of a sealed value a row may say unopened, each only when it is one.
 *
 * NEITHER IS TAKEN ON TRUST. They come over the wire as whatever the host answered, so a size that is no whole number
 * and a hint that is empty or longer than the record lets one be are left off, and the row reads as it did before.
 */
function unopened(from: { bytes?: unknown; hint?: unknown }): { bytes?: number; hint?: string } {
  const out: { bytes?: number; hint?: string } = {};
  if (typeof from.bytes === 'number' && Number.isInteger(from.bytes) && from.bytes >= 0) out.bytes = from.bytes;
  const hint = typeof from.hint === 'string' ? from.hint.trim() : '';
  if (hint !== '' && hint.length <= HINT_MOST) out.hint = hint;
  return out;
}

const isKnown = (v: unknown): v is KnownState =>
  typeof v === 'object' && v !== null && typeof (v as KnownState).sealed === 'boolean' && typeof (v as KnownState).opened === 'number';

/** WHEN A KEY'S VALUE LAST CHANGED: the grant's rotation, else its first sealing. Nothing is guessed for a grant that says neither. */
function changedOf(grant: GrantState | undefined): { changed?: string } {
  const at = [grant?.rotated_at, grant?.created_at].find((v): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)));
  return at ? { changed: at } : {};
}

/** THE DAY A KEY RUNS OUT: the register's `expires` deadline first, the grant's own day where the row names none. */
function expiresOf(field: unknown, grant: GrantState | undefined): { expires?: string } {
  const day = [field, grant?.expires_at].find((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(v));
  return day ? { expires: day.slice(0, 10) } : {};
}

/**
 * The credentials register's rows as the index draws them: retired rows are gone, and the order is
 * the label's.
 *
 * THE SECRET FIELD IS READ TWO WAYS. A row from `list` holds the grant's id there, joined to `listGrants`
 * for the counts; a row from `context` holds what is known already. A row pointing at no grant is an
 * index row: the key is kept somewhere the row names, not here.
 *
 * A SEALED ROW ALSO SAYS WHAT IT IS, UNOPENED: `bytes` and `hint`, which the host stores when it seals and the record
 * hands a browser with the grant. Only a row whose value is sealed here carries them, so a revoked grant's row, whose
 * bytes are gone, does not go on describing them.
 */
/**
 * WHAT A KEY IS, SAID ONCE: a row of the Keys list that is not retired. The Keychain lists
 * and counts these; the Keys list itself, and Search's "every entry, finished ones too", count the retired as well, so
 * the Keychain says how many are retired beside its own count and the two add up.
 */
export const isKey = (r: { fields: Record<string, unknown>; state?: string | null }): boolean => (r.state ?? r.fields.state) !== 'retired';

/** How many of the Keys list's rows are retired, and so not keys on the Keychain. */
export const retiredOf = (rows: readonly { fields: Record<string, unknown>; state?: string | null }[]): number => rows.filter((r) => !isKey(r)).length;

export function keysOf(
  rows: readonly { id: string; seq?: number | null; fields: Record<string, unknown>; state?: string | null }[],
  grants: readonly GrantState[],
  names: ReadonlyMap<string, string> & { marks?: ReadonlyMap<string, ProjectMark> },
  field = 'value',
): KeyRow[] {
  const byId = new Map(grants.map((g) => [g.id, g]));
  return rows
    .filter(isKey)
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
      const sealed = known ? known.sealed : grant ? grant.revoked_at === null : typeof value === 'string';
      return {
        id: r.id,
        spoken: typeof r.seq === 'number' ? `${KEYS_REGISTER}#${r.seq}` : null,
        grant: grant ? grant.id : null,
        label: String(r.fields.label ?? ''),
        opens: String(r.fields.opens ?? ''),
        ...(typeof r.fields.provider === 'string' && r.fields.provider.trim() !== '' ? { provider: r.fields.provider.trim() } : {}),
        ...(typeof r.fields.account === 'string' && r.fields.account.trim() !== '' ? { account: r.fields.account.trim() } : {}),
        project,
        scope,
        sealed,
        opened: known?.opened ?? grant?.opened ?? 0,
        lastOpened: known?.last_opened ?? grant?.last_opened ?? null,
        ...(typeof r.fields.where === 'string' && r.fields.where.trim() !== '' ? { kept: true } : {}),
        ...(sealed ? unopened(known ?? grant ?? {}) : {}),
        ...changedOf(grant),
        ...expiresOf(r.fields.expires, grant),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The list the Keys index reads, which `usedBy` names a key's row in (`keys-register.ts`). */
export { KEYS_REGISTER };

/* ── every page of a list ─────────────────────────────────────────────── */

/**
 * The most pages `readAll` asks for: at the 200 rows a page the Keychain reads, ten thousand keys. It is a stop for a host
 * that never answers a last page, not a size anybody is expected to reach, and a read that meets it says `more`.
 */
export const READ_ALL_PAGES = 50;

/** One page as `list` answers it, with only what is read here. A page with no `cursor` is the last one. */
export type PageOf<T> = { rows: readonly T[]; cursor?: string | null };

/** What `readAll` answers: the rows of every page read, in order; the refusal that stopped it, or null; and whether rows stand past these. */
export type AllRead<T, F> = { rows: T[]; refused: F | null; more: boolean };

/**
 * A list read page by page until the record says it is done, so a screen that reads it shows every row and not the first 200.
 *
 * `read` IS HANDED THE CURSOR OF THE PAGE BEFORE, null for the first, and answers what `client.list` answers. The caller
 * closes over the list and the page's size, so this knows neither.
 *
 * A REFUSED PAGE KEEPS WHAT WAS READ. The rows before it are real, so they are answered beside the refusal, as it came,
 * for the screen to say in its own words. `more` is true then, since a page was owed.
 *
 * IT STOPS BY ITSELF TWICE OVER: at `most` pages, and at a cursor it has been handed before, which is a host going
 * round. Both answer `more`, and neither is a refusal, because nothing was refused.
 */
export async function readAll<T, F extends { ok: false }>(
  read: (cursor: string | null) => Promise<{ ok: true; value: PageOf<T> } | F>,
  most: number = READ_ALL_PAGES,
): Promise<AllRead<T, F>> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let asked = 0; asked < most; asked++) {
    const out = await read(cursor);
    if (!out.ok) return { rows, refused: out, more: true };
    rows.push(...out.value.rows);
    const next = out.value.cursor;
    if (typeof next !== 'string' || next === '') return { rows, refused: null, more: false };
    if (seen.has(next)) return { rows, refused: null, more: true };
    seen.add(next);
    cursor = next;
  }
  return { rows, refused: null, more: true };
}

/** One run among a key's or a tool's newest uses, as `usedBy` answers it (`@braindog/record` `UsedByRun`). */
export type UsedByRun = { run: string; agent: string | null; machine: string | null; at: string; count: number };

/** The client's one method this reads, so a test hands a stub and nothing else. */
export type UsedByReader = { usedBy(args: { spoken: string }): Promise<Wire<{ runs: UsedByRun[] }>> };

/**
 * The run that opened each key last, by the key's row id, for the keys that were opened at all: at most `most` asks,
 * in the order the index draws them.
 *
 * WHY A KEY'S ROW SAYS IT: the Keychain counts every open and signs each with the run that asked, so "opened 12 times"
 * was a count with nobody behind it, and the question a person has about a key is which agent is using it
 * A key nobody opened is not asked about, and a refusal leaves the row saying what
 * it said before rather than guessing: `usedBy` answers a key the caller cannot read as one that is not there.
 */
export async function lastUsers(client: UsedByReader, keys: readonly KeyRow[], most = 24): Promise<Map<string, UsedByRun>> {
  const asked = keys.filter((k) => k.spoken !== null && k.opened > 0).slice(0, most);
  const answers = await Promise.all(asked.map((k) => client.usedBy({ spoken: k.spoken! })));
  const out = new Map<string, UsedByRun>();
  answers.forEach((a, i) => {
    const first = a.ok ? a.value.runs[0] : undefined;
    if (first) out.set(asked[i]!.id, first);
  });
  return out;
}

/** A run's page, `S47` to the `session` list's row 47, or `null` for an actor that is not a run's name. */
export const runPath = (run: string): string | null => (/^S[1-9][0-9]*$/u.test(run) ? `/r/session/${run.slice(1)}` : null);

/* ── the pack offered on connect ──────────────────────────────────────── */

/** `planPack`'s diff, with only the keys drawn here. `from` on a change is the pack it is taken over from. */
type PlanDiff = {
  pack?: { summary?: string };
  adds?: { id: string; summary: string }[];
  changes?: { id: string; summary?: string; from?: string }[];
  conflicts?: { id: string; pack: string }[];
  seeds?: { count: number };
  planHash?: string;
};

/** "What this adds", as the Packs screen draws it. */
export type Plan = {
  summary: string;
  adds: { kind: 'list' | 'page' | 'figure'; name: string; detail: string }[];
  /** What it changes of what is here, a line each: "Takes Clients and Invoices over from People", "Changes Tasks". */
  changes: string[];
  conflicts: string[];
  /** What example rows it writes, or `null` when it writes none, so the plan has no line to say so. */
  seeds: string | null;
  touches: string;
  planHash: string;
};

const counted = (summary: string, one: string, many: string): string =>
  summary.replace(/^(\d+) \S+$/u, (_, n: string) => (n === '1' ? `1 ${one}` : `${n} ${many}`));

/** A pack by its id, where the screen holds no better name for it: `money-core` is "Money core". */
export function packSaid(id: string): string {
  const w = id.replace(/[-_.]+/gu, ' ').trim();
  return w === '' ? id : w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * A plan from the record, in the Packs screen's words. `nameOf` names a register or a page by id, and `packOf` a pack;
 * the plan carries ids, and the reader is being asked about names. A plan with no hash is no plan.
 */
export function planOf(diff: unknown, nameOf: (kind: 'register' | 'page' | 'metric', id: string) => string, packOf: (id: string) => string = packSaid): Plan | null {
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
  const described = (id: string, summary: string): Plan['adds'][number] => {
    const { kind, name } = split(id);
    return kind === 'register'
      ? { kind: 'list', name, detail: counted(summary, 'field', 'fields') }
      : kind === 'metric'
        ? { kind: 'figure', name, detail: '' }
        : { kind: 'page', name, detail: counted(summary, 'table or figure', 'tables and figures') };
  };
  return {
    summary: d.pack?.summary ?? '',
    adds: (d.adds ?? []).map((a) => described(a.id, a.summary)),
    changes: changesOf(d.changes ?? [], described, packOf),
    conflicts: (d.conflicts ?? []).map((c) => words.conflict(split(c.id).name, packOf(c.pack))),
    seeds: (d.seeds?.count ?? 0) === 0 ? null : words.seeds(d.seeds?.count ?? 0),
    touches: words.touches,
    planHash: d.planHash,
  };
}

/** A plan's lists and pages by name, and its figures as one count ("and 36 numbers"), or `null` with none. */
export function foldedAdds(plan: Pick<Plan, 'adds'>): { named: Plan['adds']; more: string | null } {
  const figures = plan.adds.filter((a) => a.kind === 'figure').length;
  return { named: plan.adds.filter((a) => a.kind !== 'figure'), more: figures === 0 ? null : words.moreFigures(figures) };
}

/**
 * A plan's changes, a line each: the ones taken over from another pack grouped by that pack ("Takes Clients and Invoices
 * over from People"), first and in the plan's order, then this pack's own.
 */
function changesOf(
  changes: readonly { id: string; summary?: string; from?: string }[],
  described: (id: string, summary: string) => { name: string; detail: string },
  packOf: (id: string) => string,
): string[] {
  const taken = new Map<string, string[]>();
  const own: string[] = [];
  for (const c of changes) {
    const { name, detail } = described(c.id, c.summary ?? '');
    const from = typeof c.from === 'string' && c.from.trim() !== '' ? c.from.trim() : null;
    if (from === null) own.push(words.changesOwn(name, detail));
    else taken.set(from, [...(taken.get(from) ?? []), name]);
  }
  return [...[...taken].map(([pack, names]) => words.takesOver(names, packOf(pack))), ...own];
}

/* ── reconnecting a paused action's key ──────────────────────────────── */

/** What `/keychain?reconnect=<label>&then=<action>` opens: the row to replace, or a new key under that name, and the action to resume. */
export type Reconnect = { then: string | null } & ({ mode: 'replace'; row: KeyRow } | { mode: 'add'; label: string });

/**
 * The sheet a paused action's "Reconnect key" opens, or `null` when the address asks for none.
 *
 * THE KEY IS FOUND BY ITS LABEL, case-blind, because that is how a declaration names it and how the row that paused says
 * it. A label the Keychain does not hold opens Add with the name filled in, which is the "not in the Keychain" pause.
 */
export function reconnectOf(params: URLSearchParams, keys: readonly KeyRow[]): Reconnect | null {
  const label = params.get('reconnect')?.trim() ?? '';
  if (label === '') return null;
  const then = params.get('then')?.trim() || null;
  const row = keys.find((k) => k.label.trim().toLowerCase() === label.toLowerCase());
  return row ? { mode: 'replace', row, then } : { mode: 'add', label, then };
}

/** Where a navigation to `/keychain` carries a `ReconnectState`: `goto('/keychain', { state: { [RECONNECT_STATE]: ... } })`, read back from the page's state. */
export const RECONNECT_STATE = 'keychainReconnect';

/**
 * What "Reconnect key" hands the Keychain in the navigation's state, never in the address: the key's name as the paused
 * action says it, and the action to resume, or null for none. A reload drops it, and the plain Keychain shows.
 */
export type ReconnectState = { key: string; then: string | null };

/**
 * `reconnectOf`, asked with the navigation's state: the same sheet for the same key, with nothing after `/keychain`.
 *
 * `state` IS WHAT THE PAGE HOLDS UNDER `RECONNECT_STATE`, whatever that is. A history entry is written by more than this
 * app, so anything that is not a name and an action or null answers null, as an address asking for nothing does.
 */
export function reconnectFrom(state: unknown, keys: readonly KeyRow[]): Reconnect | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null;
  const { key, then: after } = state as { key?: unknown; then?: unknown };
  if (typeof key !== 'string' || (typeof after !== 'string' && after !== null)) return null;
  const label = key.trim();
  if (label === '') return null;
  const then = after?.trim() || null;
  const row = keys.find((k) => k.label.trim().toLowerCase() === label.toLowerCase());
  return row ? { mode: 'replace', row, then } : { mode: 'add', label, then };
}

/* ── the keychain password ─────────────────────────────────────────────── */

/**
 * An answer from the passphrase's two methods or the two key doors, with the part of a refusal read here: `at` says
 * which field the record was talking about, so a missing passphrase is told apart from any other missing field.
 */
export type Told<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: { code: string; fix: string; at?: string | undefined } }
  | { ok: false; conflict: unknown };

/** The two client methods the switch calls (`packages/client` `setKeychainPassphrase`, `clearKeychainPassphrase`). */
export type Locker = {
  setKeychainPassphrase(passphrase: string): Promise<Told<unknown>>;
  clearKeychainPassphrase(passphrase: string): Promise<Told<unknown>>;
};

/**
 * Whether the Keychain is behind a passphrase. `unknown` and `none` carry the record's sentence: `unknown` when the record
 * would not say (a sign-in older than fifteen minutes, a colleague), `none` when there is nothing to put one on yet or
 * this host cannot.
 */
export type Lock = { state: 'reading' | 'on' | 'off' } | { state: 'unknown' | 'none'; fix: string };

/** The refusal every door gives a request that carried no passphrase while the Keychain is behind one. */
export const wantsPassphrase = (out: Told<unknown>): boolean =>
  !out.ok && 'refusal' in out && out.refusal.code === 'REQUIRED_MISSING' && out.refusal.at === 'passphrase';

/** What a change answered the Keychain now is: the record's `{ on }`, read as a lock. */
const lockFrom = (value: unknown): Lock => ({
  state: typeof value === 'object' && value !== null && (value as { on?: unknown }).on === true ? 'on' : 'off',
});

/**
 * Whether the Keychain is behind a passphrase, asked by taking it off with none.
 *
 * THE RECORD HAS NO READ THAT SAYS, and this is the one question whose answer says it and changes nothing either way
 * (`kernel/src/api/keychain-passphrase.ts`, `host/src/passphrase.ts`). A Keychain with no password answers `ALREADY_KNOWN`
 * before anything is compared. A Keychain behind one counts the try, then hears that no passphrase was carried, which is
 * `REQUIRED_MISSING` and not a wrong one, so the try is handed back; `RATE_LIMITED` is only reached while one is on.
 * `NOT_IN_THIS_BUILD` is a record with no key of its own yet, or a host that cannot, and it is said rather than hidden.
 * Anything else, the Keychain gate above all, leaves the switch saying why it cannot tell.
 */
export async function lockOf(client: Pick<Locker, 'clearKeychainPassphrase'>): Promise<Lock> {
  const out = await client.clearKeychainPassphrase('');
  if (out.ok) return lockFrom(out.value);
  if (!('refusal' in out)) return { state: 'unknown', fix: copy.writeRaced };
  switch (out.refusal.code) {
    case 'ALREADY_KNOWN':
      return { state: 'off' };
    case 'REQUIRED_MISSING':
    case 'RATE_LIMITED':
      return { state: 'on' };
    case 'NOT_IN_THIS_BUILD':
      return { state: 'none', fix: out.refusal.fix };
    default:
      return { state: 'unknown', fix: out.refusal.fix };
  }
}

/**
 * Put the passphrase on (`to: 'on'`) or take it off (`'off'`): the Keychain after, or the record's sentence and, where the
 * refusal says what the Keychain is, that too.
 *
 * `ALREADY_KNOWN` IS THE KEYCHAIN ALREADY BEING WHERE IT WAS ASKED TO GO, changed from another tab since this one read it,
 * so the switch moves to match and the sentence says why nothing was changed.
 */
export async function turnLock(
  client: Locker,
  to: 'on' | 'off',
  passphrase: string,
): Promise<{ ok: true; lock: Lock } | { ok: false; fix: string; lock: Lock | null }> {
  const out = to === 'on' ? await client.setKeychainPassphrase(passphrase) : await client.clearKeychainPassphrase(passphrase);
  if (out.ok) return { ok: true, lock: lockFrom(out.value) };
  if (!('refusal' in out)) return { ok: false, fix: copy.writeRaced, lock: null };
  const already: Lock | null = out.refusal.code === 'ALREADY_KNOWN' ? { state: to } : null;
  return { ok: false, fix: out.refusal.fix, lock: already };
}

/** Both passphrases typed, and the same: the confirmation the Put it on button waits for. The record judges the rest. */
export const confirmed = (first: string, again: string): boolean => first !== '' && first === again;

/**
 * The passphrase a key door's body carries, or nothing: sent only while the Keychain is behind one, so a Keychain without
 * one is sent the body it always was.
 */
export const withPassphrase = (lock: Lock, passphrase: string): { passphrase?: string } =>
  lock.state === 'on' && passphrase !== '' ? { passphrase } : {};
