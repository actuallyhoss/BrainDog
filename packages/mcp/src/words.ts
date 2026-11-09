/**
 * The words an answer is written in: one line of somebody's text, money as people read it, a day and an age, a device
 * and an agent by the names a person gives them, a cursor that carries no row id, and a call written out to copy.
 *
 * PURE, AND NO `node:` MODULE, for the reason `rpc.ts` gives: every package under `packages/` runs inside a Worker too.
 *
 * WHY A BRIEF ANSWER IS WORDS AND NOT JSON. Driven against the owner's record, a session paid about 12,800 tokens to
 * start right, `context` alone 16.6 KB, and the reads were JSON carrying raw row ids, person ids and nulls an agent
 * cannot use and a person should never be shown. Turning ids into names "significantly improves Claude's precision in
 * retrieval tasks by reducing hallucinations", and a concise mode cut one answer from 206 tokens to 72 (Anthropic,
 * "Writing tools for agents"). So every read answers in plain labelled lines, and the JSON travels beside it in
 * `structuredContent` for a client that wants it (`rpc.ts`).
 */

/** A row's own id, as a ref field holds one. Anything that reads one in a brief answer is a defect. */
export const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/u;

/** A person's or a token's id, `p_` or `t_` and its tail: a brief answer names the person instead. */
export const PERSON_ID = /\b[pt]_[0-9A-Za-z]{1,}\b/u;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Bidirectional controls and invisible characters, taken out of a line rather than spaced, as the command line's
 * `clip.ts` takes them out: a person reads none of them, and some reorder what they can read.
 */
const FORMAT = /[­؜​‎‏‪-‮⁠⁦-⁩￹-￻\u{e0000}-\u{e007f}]/gu;

/** Somebody's words on one line: format characters gone, every run of control characters and space one space. */
export const oneLine = (said: string): string =>
  said
    .replace(FORMAT, '')
    .replace(/[\x00-\x1f\x7f-\x9f\s]+/gu, ' ')
    .trim();

/**
 * One line cut to `max` code points AT A WORD, with `...` where it was cut.
 *
 * AT A WORD, because the briefing measured on the owner's record clipped two identical questions mid-word ("fix the
 * ...", "fix th..."), and a word cut in half reads as a typo of the person's. A line with no space in its first half is
 * cut where it stands, since waiting for a space there would throw most of the line away.
 */
export function clip(said: string, max: number): string {
  const points = [...oneLine(said)];
  if (points.length <= max) return points.join('');
  const head = points.slice(0, Math.max(1, max - 3)).join('');
  const space = head.lastIndexOf(' ');
  const cut = space >= head.length / 2 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:.(-]+$/u, '')}...`;
}

/** `n` and the word for it, one or many. */
export const counted = (n: number, one: string, many = `${one}s`): string => `${grouped(n)} ${n === 1 ? one : many}`;

/** A whole number with its thousands marked, `1,450`. Anything else as `String` writes it. */
export const grouped = (n: number): string => (Number.isSafeInteger(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, ',') : String(n));

/**
 * Currencies whose minor unit is not two places, at ISO 4217's values.
 *
 * A COPY OF `braindog-render`'s `EXPONENT` (`packages/render/src/format.ts`), because this package depends on the
 * record and the ports and nothing else, and `test/words.test.ts` holds the two tables to one another. The kernel keeps
 * a third copy for the same reason (`packages/kernel/src/ingest.ts`).
 */
export const EXPONENT: Readonly<Record<string, number>> = {
  CLF: 4, UYW: 4,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/** Whether three letters are a currency ISO 4217 assigns, the runtime's list as the kernel reads it. */
export const isCurrency = (code: unknown): code is string => typeof code === 'string' && /^[A-Z]{3}$/u.test(code) && CURRENCIES.has(code);

/**
 * An amount in minor units, as a person reads it: `£39`, `£39.50`, `-£48`, `EGP 1,450`, `JPY 1,299`, `KWD 1.500`.
 *
 * ONE FORM IN EVERY ANSWER (audit 10k, AK22): `context` said `£39` and `activity` `GBP 39.00` for one amount. The
 * sign where a currency has one of its own, as the kernel's `{{short:}}` writes a message (`SIGN` in
 * `packages/kernel/src/rules.ts`), its code where it has none, and the minor part only where it is not nought.
 *
 * DONE ON THE DIGITS, NOT BY DIVIDING, so no amount the record holds (up to 2^53 - 1 minor units) is ever rounded on
 * its way to a sentence. The minus is the plain one, because a model reads this before a person does.
 *
 * A PART OF A MINOR UNIT IS SAID TO THE NEAREST ONE, AS "about". A figure that averages money reads in fractions of a
 * penny (an average of GBP 1.01 and GBP 1.02 is `101.5`), and written as it came beside its code that was `GBP 101.5`,
 * which every reader takes as a hundred pounds: a hundredfold off. The kernel keeps a series point of it the same way,
 * to the nearest minor unit (`point` in `packages/kernel/src/metrics.ts`). A value that is not a number at all says so.
 */
export function money(minor: number, currency: string): string {
  const code = currency.toUpperCase();
  if (!Number.isFinite(minor)) return `${code}, an amount that could not be read`;
  /* HALVES AWAY FROM ZERO, ON BOTH SIDES: `Math.round` takes -101.5 up to -101, so a debit read a penny smaller than
     the same credit read larger. */
  const near = Math.sign(minor) * Math.round(Math.abs(minor));
  if (!Number.isSafeInteger(near)) return `${code} ${String(minor)}`;
  const exp = EXPONENT[code] ?? 2;
  const digits = String(Math.abs(near)).padStart(exp + 1, '0');
  const whole = grouped(Number(digits.slice(0, digits.length - exp)));
  const fraction = exp > 0 ? digits.slice(digits.length - exp) : '';
  const part = /[1-9]/u.test(fraction) ? `.${fraction}` : '';
  const minus = near < 0 ? '-' : '';
  const sign = SIGN[code];
  const said = sign === undefined ? `${code} ${minus}${whole}${part}` : `${minus}${sign}${whole}${part}`;
  return near === minor ? said : `about ${said}`;
}

/**
 * The currencies written by a sign, each sign one currency's alone: the kernel's table (`SIGN` in
 * `packages/kernel/src/rules.ts`), so an answer and a message the record sends write one amount alike. Any other is
 * written by its code, `EGP 1,450`.
 */
const SIGN: Readonly<Record<string, string>> = {
  GBP: '£', EUR: '€', USD: '$', JPY: '¥', CNY: 'CN¥', INR: '₹', KRW: '₩', ILS: '₪',
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', MXN: 'MX$', BRL: 'R$',
};

/**
 * An amount written into a sentence by its code, said as `money` says one: "Pay GBP 39.00?" is "Pay £39?", as the
 * context card says it (`moneyPlain` in `packages/record/src/card.ts`). A code with no sign is left as written, so three
 * capitals that are no currency are never touched.
 */
export function moneyInText(text: string): string {
  return text.replace(/\b([A-Z]{3}) ([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?(?![\d.,]*\d)/gu, (whole, code: string, minus: string, units: string, minor: string | undefined) => {
    const sign = SIGN[code];
    if (sign === undefined) return whole;
    /* THE MINOR PART TO THE CURRENCY'S OWN PLACES, as `money` writes it (RL11): "EUR 1.5" is "€1.50", never "€1.5". A
       figure with more places than its currency has is left as written. */
    const exp = EXPONENT[code] ?? 2;
    if (minor !== undefined && minor.length > exp) return whole;
    const part = minor !== undefined && /[1-9]/u.test(minor) ? `.${minor.padEnd(exp, '0')}` : '';
    return `${minus === '' ? '' : '-'}${sign}${units}${part}`;
  });
}

/** A money value as the record stores one, `{ amount, currency }`, or `null` for anything else. */
export const moneyIn = (value: unknown): { amount: number; currency: string } | null =>
  isObject(value) && typeof value.amount === 'number' && isCurrency(value.currency) ? { amount: value.amount, currency: value.currency } : null;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A calendar day as a person says it: `4 Oct`, and the year only when it is not this one.
 *
 * A DAY IS NOT AN INSTANT, so it is read from its own digits and never shifted by a zone: the 4th is the 4th wherever
 * it is read.
 */
export function day(said: string, now: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(said);
  if (!m) return said;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  /* `29 Oct`, AS EVERY ANSWER AND THE APP SAY A DAY (AK22): `Tue 8 Sep` here and `8 Sep 2026` in an undo were one day. */
  const year = new Date(now).getUTCFullYear() === y ? '' : ` ${String(y)}`;
  return `${String(d)} ${MONTHS[mo - 1] ?? ''}${year}`.trim();
}

/**
 * A day said in words, as YYYY-MM-DD beside `now`, or `null` for words this does not read: today, tomorrow, yesterday,
 * a weekday ("friday", "next friday", the coming one), "in 3 days", "next week", "29 Oct", "October 29 2026",
 * "29/10/2026", and an instant's own day. What a refusal's `try` hands an agent that sent `by: "next friday"` (AK14).
 *
 * TODAY IS THE RECORD'S, in its own zone (RL8): at 00:30 in Cairo "tomorrow" is Cairo's tomorrow, not Greenwich's.
 * "friday" said on a Friday is today, and "next friday" a week out. "03/04/2026" is read by the record's locale, day
 * first unless it writes month first, and left unread where the locale names no country to say which.
 */
export function dayInWords(said: string, now: number, place: { zone?: string; locale?: string } = {}): string | null {
  const w = said.trim().toLowerCase().replace(/[.,]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const base = new Date(zonedDay(now, place.zone));
  const today = base.getTime();
  const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  const DAY_MS = 86_400_000;
  const instant = /^(\d{4}-\d{2}-\d{2})t/u.exec(w);
  if (instant) return instant[1]!;
  if (w === 'today' || w === 'now') return iso(today);
  if (w === 'tomorrow') return iso(today + DAY_MS);
  if (w === 'yesterday') return iso(today - DAY_MS);
  if (w === 'next week') return iso(today + 7 * DAY_MS);
  const ahead = /^in (\d{1,3}) (day|days|week|weeks)$/u.exec(w);
  if (ahead) return iso(today + Number(ahead[1]) * (ahead[2]!.startsWith('week') ? 7 : 1) * DAY_MS);
  const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = /^(?:(next|this|on|coming) )?([a-z]+)$/u.exec(w);
  if (weekday) {
    const at = WEEK.findIndex((d) => d === weekday[2] || (weekday[2]!.length >= 3 && d.startsWith(weekday[2]!)));
    if (at >= 0) {
      const gap = (at - new Date(today).getUTCDay() + 7) % 7 || (weekday[1] === 'next' ? 7 : 0);
      return iso(today + gap * DAY_MS);
    }
  }
  const month = (m: string): number => MONTHS.findIndex((x) => m.startsWith(x.toLowerCase()));
  const real = (y: number, mo: number, d: number): string | null => {
    const at = new Date(Date.UTC(y, mo, d));
    return at.getUTCFullYear() === y && at.getUTCMonth() === mo && at.getUTCDate() === d ? iso(at.getTime()) : null;
  };
  const dm = /^(\d{1,2}) ([a-z]{3,9})(?: (\d{4}))?$/u.exec(w) ?? null;
  const md = /^([a-z]{3,9}) (\d{1,2})(?: (\d{4}))?$/u.exec(w) ?? null;
  const named = dm ? { d: Number(dm[1]), m: month(dm[2]!), y: dm[3] } : md ? { d: Number(md[2]), m: month(md[1]!), y: md[3] } : null;
  if (named && named.m >= 0) {
    const y = named.y === undefined ? base.getUTCFullYear() : Number(named.y);
    const day = real(y, named.m, named.d);
    /* A DAY WITH NO YEAR THAT HAS GONE BY THIS YEAR IS NEXT YEAR'S, as a person means "3 Jan" said in December. */
    if (day !== null && named.y === undefined && day < iso(today)) return real(y + 1, named.m, named.d);
    return day;
  }
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(w);
  if (slashed) {
    const [a, b, y] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])];
    const first = a <= 12 && b <= 12 && a !== b ? monthFirst(place.locale) : a > 12 ? false : b > 12 ? true : false;
    if (first === null) return null;
    return first ? real(y, a - 1, b) : real(y, b - 1, a);
  }
  const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/u.exec(w);
  if (ymd) return real(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  return null;
}

/** Midnight UTC of the day `now` falls on in `zone`, or in UTC where the zone is missing or one the runtime cannot read. */
function zonedDay(now: number, zone: string | undefined): number {
  const utc = new Date(now);
  const plain = Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  if (zone === undefined || zone === '' || zone === 'UTC') return plain;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(utc);
    const of = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    const ms = Date.UTC(of('year'), of('month') - 1, of('day'));
    return Number.isFinite(ms) ? ms : plain;
  } catch {
    return plain;
  }
}

/** The countries that write a day month first, 03/04 for 4 March. */
const MONTH_FIRST = new Set(['US', 'PH', 'FM', 'MH', 'PW', 'GU', 'AS', 'MP', 'PR', 'VI', 'UM', 'BZ']);

/**
 * Whether a locale writes a day month first: `true` for `en-US`, `false` for `en-GB` or `ar-EG`, and `null` for a
 * locale that names no country (`en`), where 03/04 could be either.
 */
function monthFirst(locale: string | undefined): boolean | null {
  if (locale === undefined || locale.trim() === '') return null;
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale.trim().replace(/_/gu, '-')).region;
  } catch {
    return null;
  }
  if (region === undefined) return null;
  return MONTH_FIRST.has(region.toUpperCase());
}

/** How long ago `seconds` was, the short way: `just now`, `12m ago`, `5h ago`, `3d ago`. */
export function ago(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now';
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3_600))}h ago`;
  return `${String(Math.floor(seconds / 86_400))}d ago`;
}

/**
 * An instant as a person reads it beside `now`: an age within a month, `in 3d` ahead of it, and a day past that.
 * Anything that is not an instant is handed back as it came.
 */
export function when(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at) || !/^\d{4}-\d{2}-\d{2}T/u.test(iso)) return iso;
  const seconds = (now - at) / 1000;
  if (seconds < -60) {
    const ahead = -seconds;
    return ahead < 3_600 ? `in ${String(Math.ceil(ahead / 60))}m` : ahead < 86_400 ? `in ${String(Math.ceil(ahead / 3_600))}h` : `in ${String(Math.ceil(ahead / 86_400))}d`;
  }
  return seconds < 30 * 86_400 ? ago(seconds) : day(iso.slice(0, 10), now);
}

/**
 * The device a run is on, as a person names it, from the host name the machine gives itself, or `null`.
 *
 * NEVER THE HOST NAME. One like `Maras-MacBook-Pro.local` carries the owner's own name and the machine's, and the
 * owner's own reached the owner's questions word for word ("set up in ~/.claude.json on Maras-MacBook-Pro.local", its
 * names changed here). What a person says is the kind of machine, so that is all that is read out of it, and a name
 * that says no kind says nothing at all.
 */
export function deviceOf(host: unknown): string | null {
  if (typeof host !== 'string' || host === '') return null;
  const h = host.toLowerCase();
  if (h.includes('macbook')) return 'MacBook';
  if (h.includes('imac')) return 'iMac';
  if (/mac-?mini/u.test(h)) return 'Mac mini';
  if (/mac-?studio/u.test(h)) return 'Mac Studio';
  if (/mac-?pro/u.test(h)) return 'Mac Pro';
  if (h.includes('iphone')) return 'iPhone';
  if (h.includes('ipad')) return 'iPad';
  if (/^laptop-/u.test(h)) return 'Windows laptop';
  if (/^(desktop|win)-/u.test(h)) return 'Windows PC';
  if (h.includes('raspberry')) return 'Raspberry Pi';
  return null;
}

/** The words a kernel's `agent` value is said in, with the app where the run is a local one. */
const AGENT_WORDS: Readonly<Record<string, readonly [local: string, remote: string]>> = {
  claude: ['Claude Code', 'Claude'],
  codex: ['Codex', 'Codex'],
  cursor: ['Cursor', 'Cursor'],
};

/**
 * The app a run is, as a person names it: `Claude Code` for Claude working in a folder, `Claude` for one that is not,
 * `Codex`, `Cursor`, and `An agent` for one that says nothing about itself.
 *
 * A FOLDER IS WHAT TELLS THE TWO CLAUDES APART. A run the command line opened says where it is (`cwd`, `repo`, `host`),
 * and claude.ai over the remote door says none of them, so the same `claude` is the terminal app in one case and the web
 * app in the other.
 */
export function agentOf(agent: unknown, local: boolean): string {
  const words = typeof agent === 'string' ? AGENT_WORDS[agent.toLowerCase()] : undefined;
  return words ? (local ? words[0] : words[1]) : 'An agent';
}

/**
 * The apps that name themselves in MCP's `clientInfo`, as a person calls each: the kernel's own reading of the same
 * names (`CLIENTS` in `packages/kernel/src/session.ts`), so a run says "Claude Code" here and on the Agents page.
 */
const CLIENT_WORDS: readonly (readonly [RegExp, string])[] = [
  [/^claude[\s._-]*code/u, 'Claude Code'],
  [/^(?:claude|anthropic)/u, 'Claude'],
  [/^(?:openai[\s._-]*)?codex/u, 'Codex'],
  [/^cursor/u, 'Cursor'],
  [/^gemini/u, 'Gemini'],
  [/^(?:github[\s._-]*)?copilot/u, 'Copilot'],
  [/^windsurf/u, 'Windsurf'],
  [/^(?:chatgpt|openai)/u, 'ChatGPT'],
  [/^(?:visual studio code|vs[\s._-]*code)/u, 'VS Code'],
];

/**
 * A run as a person names it: `Claude Code on MacBook`, or the app alone where the machine says no kind; and the Claude
 * Code profile it runs under where it is not the default one, `Claude Code as studio on MacBook` (migration 44).
 */
export function runnerOf(fields: Record<string, unknown>): string {
  const local = ['cwd', 'repo', 'host'].some((k) => typeof fields[k] === 'string' && fields[k] !== '');
  const client = typeof fields.client === 'string' ? fields.client.trim().toLowerCase() : '';
  /* THE CLIENT'S OWN NAME WINS where the run kept it, because `agent` is a kind of four and `claude` is two apps. */
  const app = CLIENT_WORDS.find(([name]) => client !== '' && name.test(client))?.[1] ?? agentOf(fields.agent, local);
  const seat = typeof fields.seat === 'string' ? fields.seat.trim() : '';
  const as = seat === '' || seat === 'default' ? app : `${app} as ${seat}`;
  const device = deviceOf(fields.host);
  return device ? `${as} on ${device}` : as;
}

/** An id a person never says, as words: `bank-card-used-sms` is `Bank card used sms`, `renewal_due` `Renewal due`. */
export function humanize(id: string): string {
  const words = id.replace(/[._-]+/gu, ' ').trim();
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}

/**
 * THE RULES BRAINDOG ANSWERS FOR ITSELF WITH, which the app says as BrainDog (`OWN_RULES` in the record's
 * `update-pass.ts`): "The handled automation" was the record settling its own arranging.
 */
const OWN_RULES: ReadonlySet<string> = new Set(['rule:handled', 'rule:additive', 'rule:update']);

/** What signs a line when it is a mechanism rather than somebody, by the word before its colon: named, and not. */
const MECHANISMS: Readonly<Record<string, readonly [named: (name: string) => string, unnamed: string]>> = {
  /* A RULE BY ITS NAME IN QUOTATION MARKS, as the app's Activity says it (`apps/web/src/routes/audit/who.ts`): "The rule
     “Invoice late”". It was "The invoice late automation", which an agent repeated to the person word for word. */
  rule: [(name) => `The rule “${name.slice(0, 1).toUpperCase()}${name.slice(1)}”`, 'An automation'],
  ingest: [(name) => `The ${name} door`, 'A door'],
  script: [(name) => `The ${name} script`, 'A script'],
  report: [() => 'A report key', 'A report key'],
  grant: [() => 'A key', 'A key'],
};

/**
 * Who signed a line, in words: a person by the name the record has for them, a run by its app with its handle beside
 * it, Slash, BrainDog, an automation, a door, and "Someone on this record" for a person the record has no name for.
 *
 * NEVER THE ID. The default decisions read on the owner's record carried fifty `p_` ids, and a model reading them either
 * spent a call per id finding a name or repeated the id to the person. The web's Activity screen already says these
 * words for the same lines (`apps/web/src/routes/audit/who.ts`); this is the same rule for an agent, which has no "you".
 *
 * `runs` IS EACH RUN'S APP AS A PERSON NAMES IT, by handle, where the answer read them: `S42` is `Claude Code`,
 * and `An agent` where the caller cannot read the runs.
 */
export function actorWords(by: string, names: ReadonlyMap<string, string>, runs: ReadonlyMap<string, string> = new Map()): string {
  const who = by.trim();
  const named = names.get(who);
  if (named !== undefined && named.trim() !== '') return named.trim();
  if (/^S[1-9][0-9]*$/u.test(who)) return `${runs.get(who) ?? 'An agent'} (${who})`;
  if (who === 'slash') return 'Slash';
  if (who === 'system' || who === 'kernel' || who === 'p_seed' || who === '' || OWN_RULES.has(who)) return 'BrainDog';
  if (who === 'rule:ladder') return 'The trust rule';
  const agent = /^agent:(.+)$/u.exec(who)?.[1];
  if (agent !== undefined) return ULID.test(agent) ? 'An agent' : agentOf(agent, true);
  /* `person:<id>` IS HOW THE FOUNDING OWNER'S OWN GRANT SIGNS ITS LINE (`packages/kernel/src/provision.ts`). */
  const person = /^person:(.+)$/u.exec(who)?.[1];
  if (person !== undefined) return names.get(person) ?? (PERSON_ID.test(person) || ULID.test(person) ? 'Someone you share with' : humanize(person));
  const mechanism = /^([a-z][a-z0-9-]*)[:.](.+)$/u.exec(who);
  if (mechanism) {
    const [, kind, name] = mechanism as unknown as [string, string, string];
    const say = MECHANISMS[kind];
    const unsaid = ULID.test(name) || PERSON_ID.test(name) || name.includes(':');
    if (say) return unsaid ? say[1] : say[0](humanize(name).toLowerCase());
    return unsaid ? 'An automation' : humanize(kind);
  }
  if (/^t_/u.test(who)) return 'An agent key';
  if (PERSON_ID.test(who) || ULID.test(who) || who.includes('_') || who.includes(':')) return 'Someone you share with';
  return who;
}

/**
 * The one of `among` that `said` most likely meant, or `null` when none is close: the same word in another case or
 * number, the start of one, or one a typo or two away.
 *
 * WHAT A REFUSAL'S `try` IS BUILT FROM, and only from what the refusal already handed over (`allowed`, a list's own
 * name), so a corrected call never says anything the caller was not told.
 */
export function closest(said: string, among: readonly { id: string; name?: string | undefined }[]): string | null {
  const word = said.trim().toLowerCase();
  if (word === '' || among.length === 0) return null;
  const forms = (s: string): string[] => {
    const w = s.toLowerCase();
    return [w, w.replace(/ies$/u, 'y'), w.replace(/s$/u, ''), `${w}s`];
  };
  const wanted = new Set(forms(word));
  for (const c of among) if ([c.id, c.name ?? ''].some((s) => s !== '' && forms(s).some((f) => wanted.has(f)))) return c.id;
  /* ONE WORD OF ONE NAME: "runs" is Agent runs (`session`), and "rates" Exchange rates. Only where one name alone has it. */
  const worded = among.filter((c) => (c.name ?? '').split(/[\s_-]+/u).some((w) => w.length >= 3 && forms(w).some((f) => wanted.has(f))));
  if (worded.length === 1) return worded[0]!.id;
  const starts = among.filter((c) => word.length >= 3 && [c.id, c.name ?? ''].some((s) => s.toLowerCase().startsWith(word)));
  if (starts.length === 1) return starts[0]!.id;
  let best: { id: string; d: number } | null = null;
  for (const c of among)
    for (const s of [c.id, c.name ?? '']) {
      if (s === '') continue;
      const d = distance(word, s.toLowerCase());
      if (d <= (word.length > 6 ? 2 : 1) && (best === null || d < best.d)) best = { id: c.id, d };
    }
  return best?.id ?? null;
}

/**
 * How many single characters change one word into the other, two letters swapped counting as one: `emial` is one from
 * `email`, the commonest typo there is, and counted as two it was too far for a five-letter word and got no `try`.
 */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let before: number[] = [];
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2]! + 1);
      next.push(d);
    }
    before = row;
    row = next;
  }
  return row[b.length]!;
}

/** The lists that say nothing when they are empty: nothing refused, no currency missing a rate. */
const SAYS_NOTHING_EMPTY: ReadonlySet<string> = new Set(['refusals', 'missing']);

/**
 * A value with every `null` taken out, all the way down, and the empty lists that say nothing: what the full answer
 * carries.
 *
 * A NULL SAYS NOTHING A MISSING KEY DOES NOT, and the owner's `context` held fifty of them; a figure's `refusals: []`
 * and `fx.missing: []` said nothing twice. An array keeps its length and order, so a null inside one (a sparse series)
 * stays: only keys are dropped. Any other empty list stays, because a page's queue with nothing in it, like an envelope
 * with no rows, is still something drawn.
 */
export function bare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bare);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0 && SAYS_NOTHING_EMPTY.has(k))) continue;
    out[k] = bare(v);
  }
  return out;
}

/**
 * A call written out to copy: the tool and its arguments as JSON, `list {"register":"tasks"}`, or the tool alone when
 * it takes none. What a brief answer's last line and a refusal's `try` hand over, so the next call is the exact one.
 */
export function callOf(tool: string, args: Record<string, unknown> = {}): string {
  const kept = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length === 0 ? tool : `${tool} ${JSON.stringify(kept)}`;
}

/** UTF-8 to base64url and back, through `btoa`/`atob`, which a Worker and Node both have. */
const toBase64Url = (text: string): string => {
  let bin = '';
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};
/* `fatal` is in every runtime this runs on; the Workers types leave it out of the options, hence the cast. */
const fromBase64Url = (said: string): string | null => {
  try {
    const bin = atob(said.replace(/-/gu, '+').replace(/_/gu, '/'));
    return new TextDecoder('utf-8', { fatal: true } as unknown as ConstructorParameters<typeof TextDecoder>[1]).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

/** A cursor that is already a handle a person can say, such as `SG40`: it travels as it is. */
const SAID_CURSOR = /^[A-Za-z]{1,4}[0-9]{1,9}$/u;

/**
 * The record's cursor as an answer hands it on: a handle it can say as it is, anything else wrapped as `c_...`.
 *
 * WRAPPED BECAUSE THE RECORD'S CURSORS CARRY ROW IDS. A page of a list ends on `<updated_at>|<row id>` and a page of the
 * log on `e.<event id>`, so a closing line that said where to go on put a raw id in the one line an agent copies from.
 * The wrapping is the cursor itself, encoded, so nothing is kept between messages and any host decodes it.
 */
export function cursorOut(cursor: unknown): string | undefined {
  if (cursor === null || cursor === undefined || cursor === '') return undefined;
  if (typeof cursor === 'string' && SAID_CURSOR.test(cursor)) return cursor;
  return `c_${toBase64Url(JSON.stringify(cursor))}`;
}

/** A cursor as the record takes it: a `c_...` this package wrote, unwrapped, and anything else as it was sent. */
export function cursorIn(said: unknown): unknown {
  if (typeof said !== 'string' || !said.startsWith('c_')) return said;
  const text = fromBase64Url(said.slice(2));
  if (text === null) return said;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return said;
  }
}

/** An amount beside its currency's code, either way round, or after a sign: `GBP 1,200`, `12.50 EUR`, `£12`. */
const AMOUNT_AFTER = /\b([A-Z]{3})\s?(-?\d[\d,]*(?:\.\d+)?)/gu;
const AMOUNT_BEFORE = /(-?\d[\d,]*(?:\.\d+)?)\s?([A-Z]{3})\b/gu;
const AMOUNT_SIGN = /([£$€¥])\s?(-?\d[\d,]*(?:\.\d+)?)/gu;
/** A name of three or more hyphenated parts each capitalised, `Jean-Luc-Marie`: a person's, never a door's. */
const HYPHENED_NAME = /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)+$/u;

/**
 * What a question says once its ids and its case are set aside, for telling two questions that read the same.
 *
 * IDS, NOT WORDS, ARE WHAT TWO OF THE OWNER'S QUESTIONS DIFFERED BY. Three bank texts the same pattern could not read
 * were three questions, two of them word for word, and a fourth told the same thing about a second pattern. A spoken
 * id, a row id, a path, a number and a name made of three or more hyphenated parts (a door's or a pattern's) are taken
 * out before two are compared, so the queue says it once with how many it stands for.
 *
 * AND NOTHING THAT TELLS TWO REAL QUESTIONS APART IS TAKEN OUT WITH THEM. This
 * kept only a to z, so two merge questions about different people named in Arabic both read "are and the same person",
 * "Pay GBP 12 to Acme?" read as "Pay GBP 1,200 to Acme?", and "Jean-Luc-Marie" went as a door's name would. So every
 * letter of every script is kept with its marks (a Devanagari vowel sign, an Arabic vowel), an amount beside its
 * currency is kept whole after the words, a hyphenated name whose parts are capitalised stays, and a handle whose words
 * the answer read (`title`) is said by them, so two questions about two rows of different names are two.
 */
export function gist(question: string, title?: (spoken: string) => string | undefined): string {
  const amounts: string[] = [];
  const kept = (code: string, digits: string): string => {
    amounts.push(`${code}${digits.replace(/,/gu, '')}`);
    return ' ';
  };
  const named = (handle: string): string => ` ${title?.(handle) ?? ''} `;
  const words = oneLine(question)
    .replace(AMOUNT_AFTER, (all, code: string, digits: string) => (isCurrency(code) ? kept(code, digits) : all))
    .replace(AMOUNT_BEFORE, (all, digits: string, code: string) => (isCurrency(code) ? kept(code, digits) : all))
    .replace(AMOUNT_SIGN, (_, sign: string, digits: string) => kept(sign, digits))
    .replace(/[a-z][a-z0-9_]*#\d+/giu, named)
    .replace(/\b[a-z]{1,4}\d+\b/giu, named)
    .replace(/[0-9a-hjkmnp-tv-z]{26}/giu, named)
    .replace(/(?:~|\.{1,2})?\/[^\s,;]+/gu, ' ')
    .replace(/\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/giu, (part) => (HYPHENED_NAME.test(part) ? part : ' '))
    .replace(/\d[\d,.]*/gu, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return amounts.length === 0 ? words : `${words} | ${amounts.join(' ')}`;
}

/* ── a refusal in the called tool's own words ─────────────────────────── */

/**
 * Where a refusal points, said in the fields of the tool that was called, or `undefined` when none of them is it.
 *
 * A REFUSAL NAMED ANOTHER BODY'S INSIDES. On the owner's record `update {spoken, patch: {}}` was turned into a
 * proposal by the ladder and refused `VALUE_MALFORMED at body.rows[0].patch`: `update` has no `body` and no `rows`,
 * so the agent was pointed at a field it cannot send. The path is read from its left, and it is taken from the first
 * part that is a field of the tool (`takes`) or a key the caller sent: `body.rows[0].patch` is `patch` to `update` and
 * stays itself to `propose`, whose `body` it is. A path with no such part is no place the caller can go, so it is left
 * out, and the sentence says what to do.
 */
export function atIn(at: unknown, takes: readonly string[], sent: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof at !== 'string' || at === '') return undefined;
  const parts = at.match(/[^.[\]]+|\[[^\]]*\]/gu) ?? [];
  const ours = (part: string): boolean => !part.startsWith('[') && (takes.includes(part) || Object.hasOwn(sent, part));
  const from = parts.findIndex(ours);
  if (from === -1) return undefined;
  return parts
    .slice(from)
    .map((part, i) => (part.startsWith('[') || i === 0 ? part : `.${part}`))
    .join('');
}

/**
 * A refusal's sentence with no `undefined` written in where a value was meant to be.
 *
 * THE RECORD WRITES WHAT IT WAS SENT INTO ITS SENTENCE, so a value never sent came out as a word of code: `propose`
 * with no `body_kind` answered "undefined is not a kind of proposal", and `list` with no register "There is no register
 * called undefined". The shape "X is not a kind of Y" becomes "Say which kind of Y this is, in `at`", "There is no Y
 * called X" becomes "Say which Y you mean", and any other `undefined` reads "nothing", which is what was sent. `null`
 * is left alone outside those shapes, because a sentence's JSON example may hold one on purpose.
 */
export function unsaid(fix: string, at: string | undefined): string {
  const where = (word: string): string => (at === undefined || at === word ? '' : `, in ${at}`);
  const kind = /^(?:undefined|null) is not (?:a|an) (.+?)\.(\s.*)?$/su.exec(fix);
  if (kind !== null) return `Say which ${kind[1]!} this is${at === undefined ? '' : `, in ${at}`}.${kind[2] ?? ''}`;
  const called = /^There is no (\w+) called (?:undefined|null)\.(\s.*)?$/su.exec(fix);
  if (called !== null) return `Say which ${called[1]!} you mean${where(called[1]!)}.${called[2] ?? ''}`;
  return fix.replace(/\bundefined\b/gu, 'nothing');
}

/**
 * An id as a sentence may say one: a list's handle (`tasks#14`), a handle the record numbers with a prefix of its own
 * (`S42`, `SG290`, `LN3`, `D7`, `IN5`), a row's own id (a ULID with a digit in it) and a person's or a token's.
 *
 * A PREFIX IS THE RECORD'S OWN, NOT EVERY CAPITAL AND A NUMBER, so "Q3", "M1", "MP3", "UTF8" and "S3" (a bucket) stay
 * words: a run is `S` and two digits or more, and `SG`, `LN`, `IN` and `D` are the prefixes the kernel and the agents
 * pack speak. A list an add-on numbers with a prefix of its own is not looked for, so the check misses before it accuses.
 */
const AN_ID = String.raw`(?:[a-z][a-z0-9_]*#[1-9][0-9]*|S[1-9][0-9]{1,6}|(?:SG|LN|IN|D)[1-9][0-9]{0,6}|(?=[0-9A-HJKMNP-TV-Z]*[0-9])[0-9A-HJKMNP-TV-Z]{26}|[pt]_(?=[a-z]*[0-9A-Z])[0-9A-Za-z]+)`;
/** One or several, each with the version a line may say beside it, `(tasks#8 v1)`, as `context`'s lanes do. */
const IDS = String.raw`${AN_ID}(?:\s+v[1-9][0-9]*)?(?:\s*(?:,|;|&|and)\s*${AN_ID}(?:\s+v[1-9][0-9]*)?)*`;
/** A trailing reference: ids alone in brackets, or after a dot at the end of a line, as a row's line ends on one. */
const BRACKETED_IDS = new RegExp(String.raw`\(\s*${IDS}\s*\)|\[\s*${IDS}\s*\]|\s\u00b7\s*${IDS}\s*$`, 'gu');
const SAID_ID = new RegExp(String.raw`\b${AN_ID}\b`, 'gu');
/** Where a name can end, so a bracket after it is that name's reference: a word, a figure, a quote, a stop, a mark. */
const NAME_ENDS = /[\p{L}\p{N}"'\u2019\u201d)\]?!.\u2026*_]$/u;

/**
 * THE IDS A TEXT SAYS WHERE A NAME BELONGS, each with its line, in the order it says them; none when the text says each
 * thing by name.
 *
 * NAMES, NEVER IDS (the rethink's seventh pick, 16 Oct, and the instructions' third rule). A real agent still wrote "LN3
 * says" and "tasks#14" to the owner (6 Nov), so the door check's names row holds every line a real session says to
 * this (`tools/door-check/manners.check.mjs`).
 *
 * AN ID IS SAID ONLY AS ITS NAME'S TRAILING REFERENCE: in brackets after the words it names, as `named` writes one,
 * `Fix the login (tasks#14)`, or several there, `(tasks#3, tasks#9)`; or after a dot at the end of a line. Anywhere else
 * it stands where the name should: "LN3 says", "tasks#14 is late", "(S42) Morning tidy", "Done: S42", and a bracket with
 * other words in it, "(see tasks#3)", is the sentence's.
 *
 * CODE IS NOT PROSE: a span in backticks, a quoted value and a call's braces carry what a tool takes, `handoff
 * {done:"tasks#3"}`; an address's fragment is the address's; and a receipt's line carries the batch `undo` takes. Each
 * is left out before the ids are looked for.
 */
export function spokenIds(text: string): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [];
  /* A FENCED BLOCK IS CODE WHOLE, an unclosed one to the end, before the text is read a line at a time. */
  for (const line of text.replace(/```[\s\S]*?(?:```|$)/gu, '\n').split('\n')) {
    if (/^\s*Receipt: /u.test(line)) continue;
    let prose = line
      .replace(/\b(?:https?:\/\/|www\.)\S+/gu, ' ')
      .replace(/`[^`]*`/gu, ' ')
      .replace(/\S+=\S+/gu, ' ');
    for (let before = ''; before !== prose; ) {
      before = prose;
      prose = prose.replace(/\{[^{}]*\}/gu, ' ');
    }
    prose = prose.replace(/"[^"]*"/gu, '""').replace(/\u201c[^\u201d]*\u201d/gu, '""');
    prose = prose.replace(BRACKETED_IDS, (ref, at: number, whole: string) => (NAME_ENDS.test(whole.slice(0, at).trimEnd()) ? ' ' : ref));
    for (const hit of prose.matchAll(SAID_ID)) out.push({ id: hit[0], line: line.trim() });
  }
  return out;
}
