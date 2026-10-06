/**
 * Identity keys: what identifies a person, an organisation or a place, said one way whatever way it arrived.
 *
 * A KEY IS `kind:value`, AND TWO MENTIONS ARE ONE IDENTITY EXACTLY WHEN THEIR KEYS ARE EQUAL. That is the whole
 * contract `entity_key` rests on (`entities.ts`): one live row per key, so a person met by the same address twice is
 * one person by construction and never by a guess. Everything in this file exists to make "equal" mean "the same
 * mailbox, the same login, the same payee", and nothing wider.
 *
 * FOLDING IS NARROW ON PURPOSE. Gmail ignores dots and `+tags`, so `ada.l+work@gmail.com` and `adal@gmail.com` are one
 * mailbox there and one key here. Most mail hosts do not, and folding `a.b@encore.example` into `ab@encore.example` would make
 * two colleagues one person. So only gmail.com and googlemail.com fold, and googlemail.com becomes gmail.com.
 *
 * A KEY IS NEVER SHOWN TO A PERSON. It is a handle the record joins on; what a person reads is the row's name. A model
 * never sees one either (`entities.ts`'s `resolveJob` masks them).
 *
 * NOTHING HERE READS THE RECORD. Pure functions of their input, so the write path, the migration's backfill, the
 * doors and the tests all key a value the same way.
 */

import { remoteKey } from './scope.ts';

/** The kinds a key may be. A handle of any other provider is kept as `provider:name`, lower-cased, and is still a key. */
export const KEY_KINDS = ['email', 'github', 'discord', 'slack', 'phone', 'bank', 'domain', 'remote', 'folder'] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

/**
 * Mail hosts anybody can sign up to, whose domain says nothing about who someone works for. A domain key is an
 * organisation's, so these are never one: everybody at gmail.com is not one company.
 */
export const PUBLIC_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'mac.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.de', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'fastmail.com', 'hey.com',
  'tutanota.com', 'qq.com', '163.com', 'users.noreply.github.com',
]);

/**
 * Second-level suffixes under which the registrable domain is three labels, not two: `encore.co.uk` and not `co.uk`.
 * Not the whole public suffix list, which is 200 KB; the suffixes a record of a business actually meets.
 */
const SECOND_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'com.eg', 'edu.eg', 'gov.eg', 'org.eg', 'net.eg',
  'com.au', 'net.au', 'org.au', 'edu.au', 'co.nz', 'org.nz', 'co.za', 'org.za', 'co.jp', 'ne.jp', 'or.jp', 'co.in',
  'net.in', 'org.in', 'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.sa', 'com.cn', 'com.hk', 'com.sg', 'com.my',
  'co.il', 'co.kr', 'com.pk', 'com.ng', 'co.ke', 'ae.org', 'com.ly', 'com.lb', 'com.jo', 'com.kw', 'com.qa',
]);

/**
 * Local parts that are a function, not a person: a shared inbox or a machine. Mail from one is an organisation
 * speaking, so it meets the organisation and never makes a person.
 */
const ROLE_LOCALS = new Set([
  'info', 'support', 'hello', 'hi', 'contact', 'team', 'billing', 'invoice', 'invoices', 'accounts', 'accounting',
  'sales', 'admin', 'help', 'helpdesk', 'office', 'notifications', 'notification', 'notify', 'alerts', 'alert',
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply', 'mailer-daemon', 'postmaster',
  'newsletter', 'news', 'marketing', 'receipts', 'receipt', 'orders', 'order', 'security', 'service', 'services',
  'care', 'customercare', 'customerservice', 'feedback', 'jobs', 'careers', 'hr', 'press', 'payments', 'bounce',
  'bounces', 'updates', 'digest', 'reply', 'mail', 'email', 'webmaster', 'hostmaster', 'abuse', 'privacy', 'legal',
  'statements', 'estatements', 'banking', 'onlinebanking', 'ebanking',
]);

/** A local part that is a machine's whatever else it says: `noreply-1234`, `notifications+abc`, `bounce-…`. */
const MACHINE = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|mailer|bounces?)([._+-]|$)/;

/** GitHub's private commit address: `<id>+<login>@users.noreply.github.com`, or the older `<login>@…`. */
const GITHUB_PRIVATE = /^(?:\d+\+)?([a-z0-9](?:[a-z0-9-]{0,38}))@users\.noreply\.github\.com$/;

/** A GitHub login: letters, digits and single hyphens, at most 39, plus the `[bot]` an app signs as. */
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,38})(?:\[bot\])?$/;

/** Card processors that put their own name before the merchant's on a bank text, and the point-of-sale marker. */
const PROCESSORS = /^(?:geidea\s*\*|paymob\s*-|fawry\s*\*|kashier\s*\*|pos\s+|sq\s*\*|sumup\s*\*|paypal\s*\*|zettle_?\s*\*|izettle\s*\*|pp\s*\*)\s*/i;

/** Places a bank text writes after the merchant, removed so `CHILLOUT CAIRO EG` and `Chillout` are one payee. */
const PLACES = new Set([
  'cairo', 'giza', 'alexandria', 'alex', 'newcairo', 'nasr', 'nasrcity', 'heliopolis', 'maadi', 'zamalek', 'dokki',
  'mohandessin', 'sheikhzayed', 'zayed', 'october', '6thofoctober', 'tagamoa', 'tagamo3', 'eg', 'egy', 'egypt',
  'london', 'gb', 'uk', 'gbr', 'dubai', 'ae', 'uae', 'are', 'abudhabi', 'riyadh', 'sa', 'jeddah', 'us', 'usa',
  'newyork', 'ny', 'sanfrancisco', 'sf', 'ca', 'de', 'berlin', 'fr', 'paris', 'nl', 'amsterdam', 'ie', 'dublin',
  'internet', 'online', 'www',
]);

/** A web suffix a payee is sometimes spelled with: `talabat.com` is Talabat. */
const WEB_SUFFIX = /\.(?:com|net|org|io|co|app|ai|xyz|eg|co\.uk|com\.eg)$/;

const lower = (s: string): string => s.trim().toLowerCase();

/** The address's two halves, or `null` when it is not one address. */
function split(address: string): { local: string; domain: string } | null {
  const m = /^([^@\s<>"]+)@([^@\s<>"]+\.[^@\s<>".]+)$/.exec(lower(address));
  return m ? { local: m[1]!, domain: m[2]!.replace(/\.$/, '') } : null;
}

/** A host as a key's value: lower case, no scheme, no path, no port, no `www.`. */
function hostOf(raw: string): string {
  let s = lower(raw);
  const at = s.lastIndexOf('@');
  if (at >= 0 && !s.includes('/')) s = s.slice(at + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return s.replace(/^www\./, '');
}

/** The domain an organisation registered: the last two labels, or three under a suffix like `co.uk`. */
export function registrable(raw: string): string | null {
  const host = hostOf(raw);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const labels = host.split('.');
  const two = labels.slice(-2).join('.');
  const domain = SECOND_LEVEL.has(two) && labels.length >= 3 ? labels.slice(-3).join('.') : two;
  return PUBLIC_MAIL.has(domain) || PUBLIC_MAIL.has(host) ? null : domain;
}

/** Whether a domain is a mail host anybody can sign up to. */
export const isPublicMail = (domain: string): boolean => PUBLIC_MAIL.has(lower(domain));

/**
 * Whether an address is a shared inbox or a machine, which is an organisation speaking and never a person.
 *
 * GITHUB'S PRIVATE ADDRESS IS A PERSON, though it says `noreply`: it is how GitHub writes a commit's author who keeps
 * their address private, and the login inside it is theirs.
 */
export function isOrganisationAddress(address: string): boolean {
  const parts = split(address);
  if (!parts || GITHUB_PRIVATE.test(`${parts.local}@${parts.domain}`)) return false;
  const local = parts.local.replace(/\+.*$/, '');
  return ROLE_LOCALS.has(local) || MACHINE.test(parts.local);
}

/** The login inside GitHub's private commit address, or `null`. */
export function githubOfAddress(address: string): string | null {
  return GITHUB_PRIVATE.exec(lower(address))?.[1] ?? null;
}

/**
 * A raw `From` header as a name, an address and the address's domain: `"Ada Lovelace" <ada@x.com>`, `Ada <ada@x.com>`,
 * `ada@x.com (Ada)` and a bare address all read. `null` when there is no address in it.
 */
export function parseFrom(header: string): { name: string | null; address: string; domain: string } | null {
  const raw = header.trim();
  const angled = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(raw);
  const commented = /^([^\s()]+@[^\s()]+)\s*\((.*)\)\s*$/.exec(raw);
  const address = lower(angled?.[2] ?? commented?.[1] ?? raw);
  const parts = split(address);
  if (!parts) return null;
  const said = (angled?.[1] ?? commented?.[2] ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
  /* A NAME THAT IS ONLY THE ADDRESS AGAIN IS NO NAME, as many mailers write `ada@x.com <ada@x.com>`. */
  const name = said === '' || lower(said) === address ? null : said;
  return { name, address: `${parts.local}@${parts.domain}`, domain: parts.domain };
}

/** An email as its key's value, or a `github:` key for GitHub's private address. Gmail folds; nothing else does. */
function emailKey(raw: string): string | null {
  const parsed = raw.includes('<') ? parseFrom(raw)?.address : raw;
  const parts = parsed === undefined ? null : split(parsed);
  if (!parts) return null;
  const login = githubOfAddress(`${parts.local}@${parts.domain}`);
  if (login !== null) return `github:${login}`;
  if (parts.domain === 'gmail.com' || parts.domain === 'googlemail.com')
    return `email:${parts.local.replace(/\+.*$/, '').replace(/\./g, '')}@gmail.com`;
  return `email:${parts.local}@${parts.domain}`;
}

/** A login, from `@ada`, `ada`, a profile address, or GitHub's private address. */
function githubKey(raw: string): string | null {
  const said = lower(raw);
  const private_ = githubOfAddress(said);
  if (private_ !== null) return `github:${private_}`;
  const login = said.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, '').replace(/^@/, '').replace(/\/.*$/, '');
  return GITHUB_LOGIN.test(login) ? `github:${login}` : null;
}

/** A chat handle: lower case, no `@`, no spaces. */
function handleKey(kind: string, raw: string): string | null {
  const said = lower(raw).replace(/^@/, '');
  return said === '' || /\s/.test(said) ? null : `${kind}:${said}`;
}

/** E.164: a `+` and 8 to 15 digits. A number with no country code cannot be told from another country's, so is none. */
function phoneKey(raw: string): string | null {
  const said = raw.trim().replace(/^00/, '+');
  if (!said.startsWith('+')) return null;
  const digits = said.slice(1).replace(/[\s().-]/g, '');
  return /^[1-9][0-9]{7,14}$/.test(digits) ? `phone:+${digits}` : null;
}

/**
 * A payee as a bank text writes it, folded so its spellings are one: the processor's prefix gone, then a place and
 * any word holding a digit from the end, a web suffix, punctuation, and the spaces, all lower case.
 * `GEIDEA*CHILLOUT 0423 CAIRO EG`, `Chill Out` and `CHILLOUT` are all `bank:chillout`.
 */
function bankKey(raw: string): string | null {
  let said = raw.trim();
  for (let i = 0; i < 3 && PROCESSORS.test(said); i++) said = said.replace(PROCESSORS, '');
  const words = lower(said).replace(/[*#]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const last = words[words.length - 1]!;
    const bare = last.replace(/[^a-z0-9]/g, '');
    /* TWO WORDS FIRST, so `NEW CAIRO` goes whole and does not leave `new` behind as part of the payee. */
    if (words.length > 2 && PLACES.has(`${words[words.length - 2]!.replace(/[^a-z0-9]/g, '')}${bare}`)) words.splice(-2, 2);
    else if (/\d/.test(last) || PLACES.has(bare) || bare === '') words.pop();
    else break;
  }
  const folded = words.join('').replace(WEB_SUFFIX, '').replace(/[^\p{L}\p{N}]/gu, '');
  return folded === '' ? null : `bank:${folded}`;
}

/** An absolute path, with `\` as `/`, no trailing `/`, and a drive letter in lower case. */
function folderKey(raw: string): string | null {
  const said = raw.trim().replace(/\\/g, '/').replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  if (/^[a-z]:\//i.test(said) || /^[a-z]:$/i.test(said)) return `folder:${said[0]!.toLowerCase()}${said.slice(1)}`;
  return said.startsWith('/') && said.length > 1 ? `folder:${said}` : null;
}

/** A remote as `host/owner/name`, by scope's own reading, so a project's remote and a key are one string. */
function remoteKeyOf(raw: string): string | null {
  const key = remoteKey(raw);
  return key.split('/').length >= 3 ? `remote:${key}` : null;
}

/**
 * One raw value of a kind, as its key, or `null` when the value is not one of that kind.
 *
 * A KEY MAY COME BACK AS ANOTHER KIND: GitHub's private address handed in as an `email` is the login it holds, and that
 * is the identity it is. Any kind not in `KEY_KINDS` is kept as a handle, `provider:name` in lower case.
 */
export function keyOf(kind: string, raw: string): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const k = lower(kind);
  switch (k) {
    case 'email':
      return emailKey(raw);
    case 'github':
      return githubKey(raw);
    case 'phone':
      return phoneKey(raw);
    case 'bank':
      return bankKey(raw);
    case 'domain': {
      const domain = registrable(raw);
      return domain === null ? null : `domain:${domain}`;
    }
    case 'remote':
      return remoteKeyOf(raw);
    case 'folder':
      return folderKey(raw);
    default:
      return /^[a-z][a-z0-9.-]*$/.test(k) ? handleKey(k, raw) : null;
  }
}

/**
 * A key as written anywhere, `email:Ada@X.com` or `github:@Ada`, read again so it is said the one way. `null` for text
 * that is not `kind:value`.
 */
export function keyFrom(said: string): string | null {
  const m = /^([a-z][a-z0-9.-]*):(.+)$/i.exec(typeof said === 'string' ? said.trim() : '');
  return m ? keyOf(m[1]!, m[2]!) : null;
}

/** What `keysOf` reads: any of the identifiers a mention or a row can carry. */
export type KeyInput = {
  email?: string | null | undefined;
  emails?: readonly string[] | undefined;
  /** `provider:name`, as `meet` takes a handle. */
  handle?: string | null | undefined;
  handles?: readonly string[] | undefined;
  /** Keys already written `kind:value`. */
  keys?: readonly string[] | undefined;
  domain?: string | null | undefined;
  domains?: readonly string[] | undefined;
  remote?: string | null | undefined;
  remotes?: readonly string[] | undefined;
  folder?: string | null | undefined;
  phone?: string | null | undefined;
  bank?: string | null | undefined;
};

/** Every key the input carries, each once, in the order given. */
export function keysOf(input: KeyInput): string[] {
  const out = new Set<string>();
  const add = (key: string | null): void => void (key !== null && out.add(key));
  const each = (one: unknown, many: unknown, read: (s: string) => string | null): void => {
    if (typeof one === 'string') add(read(one));
    if (Array.isArray(many)) for (const s of many) if (typeof s === 'string') add(read(s));
  };
  each(input.email, input.emails, (s) => keyOf('email', s));
  each(input.handle, input.handles, keyFrom);
  each(null, input.keys, keyFrom);
  each(input.domain, input.domains, (s) => keyOf('domain', s));
  each(input.remote, input.remotes, (s) => keyOf('remote', s));
  each(input.folder, null, (s) => keyOf('folder', s));
  each(input.phone, null, (s) => keyOf('phone', s));
  each(input.bank, null, (s) => keyOf('bank', s));
  return [...out];
}

/** The kind of a key, `email` of `email:ada@x.com`. */
export const kindOfKey = (key: string): string => key.slice(0, key.indexOf(':'));

/** The value of a key, `ada@x.com` of `email:ada@x.com`. */
export const valueOfKey = (key: string): string => key.slice(key.indexOf(':') + 1);
