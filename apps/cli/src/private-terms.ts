/**
 * `braindog private-terms`: the private list `public-clean` searches the repository for, written from the record.
 *
 *   braindog private-terms [--dry-run] [--host <host>]
 *
 * THE LIST IS THE OWNER'S OWN WORDS, READ FROM HIS OWN RECORD, and it works the same for any person's (LCH-C11, DIRECTION
 * §27): nothing here names a person, a machine or a bank. What it reads, each through what the record declares:
 *   - the owner, as the list declaring `meets:` marks him by its `self` part: every name and alias, every address and
 *     its domain unless that is a public mail service, every handle and every key;
 *   - the people that list holds who have a whole name (two words or more), with their addresses: a single
 *     word such as a first name is everybody's, and a list of them would find every test;
 *   - his machines: the name each device grant was signed in under, and this machine's own network name and login;
 *   - his accounts: the digits a bank prints (the `last4` field), and each balance of a hundred or more in its two
 *     written forms and as the minor units a test would carry.
 *
 * NOTHING IN THE LIST IS EVER PRINTED. The file is written with mode 600 and only its count is said, so the words do
 * not land in a terminal's scrollback, a log or an agent's transcript. A word that is public on purpose, the account
 * the repository is published under, is left out, because `public-clean` allows that spelling and its list must not
 * call it a leak; it is read from the folder's own `origin`, never written here.
 *
 * LINES ALREADY IN THE FILE STAY. He may add a term by hand, and a second run adds what is new without losing it.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import type { Client } from '@braindog/client';
import { fixOf, refused, type Result } from '@braindog/ports';

import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { git } from './position.ts';
import { isObject, type AgentIo } from './skills.ts';

export const USAGE = 'usage: braindog private-terms [--dry-run] [--host <host>]';

/** The reads the list is written from. */
export type Reader = Pick<Client, 'boot' | 'schema' | 'list' | 'listDevices'>;

/** Where the list goes: the file `tools/gates/public-clean.mjs` reads, by the same rule (`privateTermsFile`). */
export const termsFile = (env: NodeJS.ProcessEnv, home: string): string => env.BRAINDOG_PRIVATE_TERMS ?? join(home, '.braindog', 'private-terms.txt');

/** The shortest term written: two letters would be found inside every word of the repository. */
export const SHORTEST = 3;

/** Mail services everybody's address can be at, whose domain says nothing about whose it is. */
const PUBLIC_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'yahoo.com', 'proton.me', 'protonmail.com', 'users.noreply.github.com']);

/** Logins every machine has, which name nobody. */
const COMMON_LOGINS = new Set(['root', 'admin', 'administrator', 'user', 'runner', 'ubuntu', 'guest']);

/** The most pages of one list read, at 200 rows a page: a record past it is read as far as that. */
const PAGES = 50;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);

/** What the list was written from, by kind, as counts; and what could not be read, in words. */
export type Read = { terms: string[]; owner: boolean; missed: string[] };

/** A list's declaration, as `schema` answers it, or `null`. */
type Decl = Record<string, unknown> & { id: string };

/** Every row of one list, page by page, or `null` when the first page is refused. */
async function rowsOf(reader: Reader, register: string, where?: unknown): Promise<Record<string, unknown>[] | null> {
  const out: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES; page++) {
    const got: Result<{ rows: unknown[]; cursor: string | null }> = await reader.list({ register, limit: 200, ...(where === undefined ? {} : { where }), ...(cursor ? { cursor } : {}) });
    if (!got.ok) return page === 0 ? null : out;
    for (const r of got.value.rows) if (isObject(r) && isObject(r.fields)) out.push(r.fields);
    cursor = got.value.cursor;
    if (!cursor) break;
  }
  return out;
}

/** A key or a handle without its kind or its `@`: `github:ada` and `@ada` are both `ada`. */
export const bareKey = (key: string): string => key.trim().replace(/^[a-z][a-z0-9_]*:(?!\/\/)/u, '').replace(/^@/u, '');

/** An address's domain when it says whose the address is, and `null` at a public mail service. */
export function ownDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  const domain = at < 0 ? '' : address.slice(at + 1).trim().toLowerCase();
  return domain === '' || PUBLIC_MAIL.has(domain) ? null : domain;
}

/** A name worth searching for: two words or more, where one word is a first name and everybody's. */
const wholeName = (name: string): boolean => name.trim().split(/\s+/u).length >= 2;

/**
 * A balance as a file would carry it: its major units with two decimals, the same with thousands marks, and the minor
 * units a test writes it in. Only from a hundred up, because a smaller amount is in every price list.
 */
export function amountForms(minor: number): string[] {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) < 100_00) return [];
  const n = Math.abs(minor);
  const major = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  const marked = `${Math.floor(n / 100).toLocaleString('en-US')}.${String(n % 100).padStart(2, '0')}`;
  return [...new Set([major, marked, String(n)])];
}

/** The machine's own words: its network name, with and without `.local`, and the login when it is somebody's. */
export function machineWords(network: string, login: string): string[] {
  const out = [network, network.replace(/\.local$/iu, '')];
  if (!COMMON_LOGINS.has(login.toLowerCase())) out.push(login);
  return out;
}

/** The machine a device grant was signed in from: its label up to the ` · ` that names the program. */
export const deviceMachine = (label: string | null): string => (label ?? '').split(' · ')[0]!.trim();

/**
 * Every term the record gives, read through its declarations, with what could not be read said in words. The owner is
 * `false` when no list marks which person is the owner, and then only the rest is written.
 */
export async function readTerms(reader: Reader, here: { network: string; login: string }): Promise<Read> {
  const terms: string[] = [];
  const missed: string[] = [];
  const add = (...said: string[]) => terms.push(...said);
  const boot = await reader.boot();
  if (!boot.ok) throw Object.assign(new Error('boot'), { result: boot });
  const decls = (await Promise.all(boot.value.registers.map((r) => reader.schema(r.id)))).flatMap((d): Decl[] =>
    d.ok && isObject(d.value) && typeof d.value.id === 'string' ? [d.value as Decl] : [],
  );
  const me = (boot.value as { me?: { name?: unknown } }).me;
  if (typeof me?.name === 'string') add(me.name);

  /* THE PEOPLE, by the parts the list declaring `meets:` names. */
  let owner = false;
  const people = decls.find((d) => isObject(d.meets));
  if (people === undefined) missed.push('no list keeps people');
  else {
    const parts = people.meets as Record<string, unknown>;
    const part = (p: string, f: Record<string, unknown>): string[] => (typeof parts[p] === 'string' ? strings(f[parts[p]]) : []);
    const rows = await rowsOf(reader, people.id);
    if (rows === null) missed.push('the people could not be read');
    for (const f of rows ?? []) {
      const self = typeof parts.self === 'string' && f[parts.self] === true;
      owner ||= self;
      const names = [...part('name', f), ...part('aliases', f)];
      add(...(self ? names : names.filter(wholeName)));
      const addresses = part('email', f);
      /* Somebody else's handle may be a common word, so only the owner's go in; anybody's address is theirs alone. */
      const keys = [...part('keys', f), ...part('handles', f)].map(bareKey);
      add(...addresses, ...(self ? keys : keys.filter((k) => k.includes('@'))));
      if (self) for (const a of [...addresses, ...part('keys', f).filter((k) => k.includes('@'))]) add(ownDomain(a) ?? '');
    }
    if (!owner) missed.push('People does not say which person is you yet');
  }

  /* THE MACHINES: this one, and every one a device grant was signed in from. ONLY A GRANT A PERSON APPROVED: anybody
     can ask for one under any label, and an asking stranger's "the" would find every file. */
  add(...machineWords(here.network, here.login));
  const devices = await reader.listDevices();
  if (devices.ok) {
    for (const d of devices.value) if (d.approved_at !== null) add(deviceMachine(d.label));
  } else missed.push('the signed-in machines could not be read');

  /* THE ACCOUNTS: any list with the digits a bank prints, and its balances. */
  for (const d of decls) {
    const fields = Array.isArray(d.fields) ? d.fields.filter(isObject) : [];
    const digits = fields.some((f) => f.id === 'last4');
    const balance = fields.some((f) => f.id === 'balance' && f.type === 'money');
    if (!digits) continue;
    const rows = await rowsOf(reader, d.id);
    if (rows === null) {
      missed.push('the accounts could not be read');
      continue;
    }
    for (const f of rows) {
      add(...strings(f.last4));
      const b = f.balance;
      if (balance && isObject(b) && typeof b.amount === 'number') add(...amountForms(b.amount));
    }
  }
  /* One space between words, as the gate matches a term: a name kept with a line break in it would be two lines. */
  return { terms: terms.map((t) => t.replace(/\s+/gu, ' ').trim()).filter((t) => t.length >= SHORTEST), owner, missed };
}

/** The account a repository is published under, from its `origin`, as `owner` in `github.com/owner/name`; or `null`. */
export async function publicOwner(cwd: string): Promise<string | null> {
  const url = await git(cwd, 'remote', 'get-url', 'origin');
  const m = url === null ? null : /[/:]([^/:]+)\/[^/]+?(?:\.git)?\/?$/u.exec(url);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * The file's lines with the terms it does not hold yet after them, and how many those were. Every line already there
 * stays as it is, a `#` line and a term he typed too; a term is new when no line holds it in any letter case, and the
 * public spelling is never one. THE ONE LINE TAKEN OUT IS THAT SPELLING, which a run outside the repository put in:
 * the gate would call every link to the repository a leak.
 */
export function merged(before: string | null, terms: readonly string[], publicSpelling: string | null): { text: string; added: number; total: number } {
  const lines = (before === null ? ['# Private terms for public-clean, one a line. Written by braindog private-terms; a line you add stays.'] : before.replace(/\n$/u, '').split('\n')).filter(
    (l) => publicSpelling === null || l.trim().toLowerCase() !== publicSpelling,
  );
  const held = new Set(lines.map((l) => l.trim().toLowerCase()).filter((l) => l !== '' && !l.startsWith('#')));
  let added = 0;
  for (const t of terms) {
    const key = t.toLowerCase();
    if (held.has(key) || key === publicSpelling || key.startsWith('#')) continue;
    held.add(key);
    lines.push(t);
    added++;
  }
  return { text: `${lines.join('\n')}\n`, added, total: held.size };
}

/** Write the list readable by its owner alone: mode 600 in a folder of mode 700, never seen half written. */
export function writeTerms(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  /* A part file a cut run left keeps its own mode, so it goes first and the words only ever land in a new one. */
  rmSync(`${file}.tmp`, { force: true });
  writeFileSync(`${file}.tmp`, text, { mode: 0o600, flag: 'wx' });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
  chmodSync(file, 0o600);
}

/**
 * `braindog private-terms [--dry-run] [--host <host>]`, and the exit code: 0 written, 1 refused, 3 unreachable.
 * `reader` and `here` are a test's record and machine; the command reads the host this machine is signed in to.
 */
export async function privateTermsCommand(args: string[], io: AgentIo, reader?: Reader, here?: { network: string; login: string }): Promise<number> {
  let values: { host?: string | undefined; 'dry-run'?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { host: { type: 'string' }, 'dry-run': { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  let to: Target | null = null;
  if (reader === undefined) {
    try {
      to = target(values.host, io.env, hostsPath(io.env));
    } catch (e) {
      io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
      return 1;
    }
    reader = clientFor(to, async () => ({}), AbortSignal.timeout(budgetOf(io.env) * 20));
  }
  let read: Read;
  try {
    read = await readTerms(reader, here ?? { network: hostname(), login: userInfo().username });
  } catch (e) {
    const r = (e as { result?: Result<unknown> }).result;
    if (r === undefined) throw e;
    return refuse(io, r, refused(r) && r.refusal.code === 'UNREACHABLE' && to !== null ? `${to.key} did not answer.` : fixOf(r));
  }
  const file = termsFile(io.env, io.home);
  const spelling = await publicOwner(io.cwd);
  const { text, added, total } = merged(existsSync(file) ? readFileSync(file, 'utf8') : null, read.terms, spelling);
  const dry = values['dry-run'] === true;
  if (!dry) writeTerms(file, text);
  io.answer?.({ value: { terms: total, added, written: !dry } });
  io.out(
    dry
      ? `A run would leave your private list holding ${String(total)} terms, ${String(added)} of them new. Nothing was written, and no term is printed.`
      : `Your private list holds ${String(total)} terms, ${String(added)} of them new, readable by you alone. No term is printed: public-clean reads them before a push.`,
  );
  for (const m of read.missed) io.say(`Not in it: ${m}.`);
  if (spelling === null) io.say('This folder has no published repository, so no account name was left out. Run it in the repository the list guards.');
  return 0;
}
