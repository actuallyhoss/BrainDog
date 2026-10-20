/**
 * The lived record: a record built by living in it, for the gates to read (PRF-A07, `loop/scope/area-proof-a.md` 2.5).
 *
 *   node tools/gates/lived.mjs [default|lived-well]    builds the profile (or finds it cached) and prints its signs
 *
 * WHY. Every gate drew one seed of hand-written rows at a pinned clock, and an owner's real record stood still for ten
 * days while all of them stayed green, because the seed has no age and no residue: every account has its digits, no
 * arrival pattern is installed, nothing waits. This record is made the way a person's is, through the product's own
 * verbs on a clock that steps: an import with residue, add-ons installed from their pack files in `packs/` as a person
 * installs them, one use case, then five weeks a day at a time of bank texts at the add-on's own door, numbers, agents'
 * runs that end three ways, and the schedule drained every simulated hour, so the sweep writes runs off and the nights
 * take their readings. It ends at the gates' pinned instant.
 *
 * TWO PROFILES, ONE BUILDER. `fixtures/shapes/default.json` is a record left untended, and its vital signs read red for
 * the reasons a real one's do; `lived-well.json` is the same weeks tended, and they read green
 * (`test/lived.test.mjs`). A profile is round counts and switches only. No value in either comes from a real record, and
 * nothing here names one: what the default profile gets wrong, any record can get wrong (DIRECTION 27).
 *
 * CACHED BY WHAT MAKES IT. The file is kept under a hash of the profile's bytes, the documents it installs, the source
 * of the packages it runs through and this builder, so a second run with nothing changed opens the file and builds
 * nothing, and a change to any of them builds again.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argv, env } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRecordApi } from '../../packages/record/src/index.ts';
import { NOW } from '../../packages/seed/src/index.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/packs-entry.ts';
import { useCaseDocument } from '../../packages/seed/src/usecases/index.ts';
import { withoutRows } from '../../packages/seed/src/usecases/install.ts';
import { applyPlan } from '../../apps/cli/src/import.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHAPES = join(ROOT, 'fixtures/shapes');
const PACKS = join(ROOT, 'packs');
/**
 * The product's source a build runs through: the packages the record, its modules and the import are made of, and the
 * command whose `applyPlan` imports. The kernel's migrations are in the first.
 */
const SOURCES = ['packages/kernel/src', 'packages/ports/src', 'packages/where/src', 'packages/declare/src', 'packages/extract/src', 'packages/theme/src', 'packages/record/src', 'packages/seed/src', 'apps/cli/src'];
const SELF = fileURLToPath(import.meta.url);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The instant every lived record ends at: the gates' own, so a lived screen and a seeded one read the same today. */
export const ENDS = NOW;

/** The owner every write of the person is signed by. */
const OWNER = 'p_owner';

/* ── the profile ───────────────────────────────────────────────────────── */

/** The profiles there are, by the file each is in. */
export const PROFILES = readdirSync(SHAPES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length)).sort();

const count = (v, at) => {
  if (!Number.isInteger(v) || v < 0) throw new Error(`The lived profile's ${at} is not a whole number of things: ${JSON.stringify(v)}.`);
  return v;
};

/**
 * One profile, read and checked: every count a whole number, every switch a boolean, so a typo is said here and not
 * found later as a record that is quietly empty.
 */
export function readProfile(name, over = null) {
  const file = join(SHAPES, `${name}.json`);
  if (!existsSync(file)) throw new Error(`There is no lived profile called ${name}. There are: ${PROFILES.join(', ')}.`);
  const p = merged(JSON.parse(readFileSync(file, 'utf8')), over);
  const i = p.import ?? {};
  const d = p.days ?? {};
  const ends = d.runs?.ends ?? {};
  const profile = {
    profile: String(p.profile ?? name),
    record: { name: String(p.record?.name ?? 'A lived record'), tz: String(p.record?.tz ?? 'UTC'), locale: String(p.record?.locale ?? 'en-GB'), currency: String(p.record?.currency ?? 'EUR') },
    weeks: count(p.weeks, 'weeks'),
    usecase: p.usecase === null ? null : String(p.usecase),
    packs: Array.isArray(p.packs) ? p.packs.map(String) : [],
    import: {
      accounts: { count: count(i.accounts?.count, 'import.accounts.count'), digits: i.accounts?.digits === true },
      ledger: count(i.ledger, 'import.ledger'),
      people: { count: count(i.people?.count, 'import.people.count'), twice: count(i.people?.twice, 'import.people.twice') },
      numbers: { series: count(i.numbers?.series, 'import.numbers.series'), points: count(i.numbers?.points, 'import.numbers.points') },
      questions: { open: count(i.questions?.open, 'import.questions.open'), alike: count(i.questions?.alike, 'import.questions.alike') },
    },
    days: {
      arrivals: { count: count(d.arrivals?.count, 'days.arrivals.count'), lastDaysQuiet: count(d.arrivals?.lastDaysQuiet, 'days.arrivals.lastDaysQuiet') },
      balances: { everyDays: count(d.balances?.everyDays ?? 0, 'days.balances.everyDays') },
      numbers: { stopDaysBeforeEnd: count(d.numbers?.stopDaysBeforeEnd, 'days.numbers.stopDaysBeforeEnd') },
      runs: { count: count(d.runs?.count, 'days.runs.count'), ends: { done: count(ends.done, 'runs.ends.done'), handoff: count(ends.handoff, 'runs.ends.handoff'), abandoned: count(ends.abandoned, 'runs.ends.abandoned') } },
      answers: { imported: count(d.answers?.imported, 'days.answers.imported') },
    },
  };
  if (profile.weeks < 1) throw new Error('A lived record lives at least one week.');
  if (profile.import.questions.alike > profile.import.questions.open) throw new Error('More questions are alike than are open.');
  if (profile.import.people.twice > profile.import.people.count) throw new Error('More people are written twice than there are people.');
  for (const id of profile.packs) if (!existsSync(packFile(id))) throw new Error(`There is no pack file for ${id} in packs/.`);
  return profile;
}

/**
 * A profile with a few of its values changed, for a test that asks what one switch does on the same weeks. Objects
 * merge key by key; anything else replaces.
 */
function merged(base, over) {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) out[k] = merged(out[k], v);
  return out;
}

/** A pack's file in `packs/`, by its folder's name. */
const packFile = (id) => join(PACKS, id, `${id}.pack.json`);

/* ── the file and the clock ────────────────────────────────────────────── */

/**
 * The `Sql` port over one SQLite file, the adapter the kernel's own tests use, with the same one-level transaction. Not
 * WAL, so the record is one file a gate can copy and open.
 */
function fileSql(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec('PRAGMA synchronous = OFF');
  let depth = 0;
  return {
    close: () => db.close(),
    exec(text, ...params) {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...params);
    },
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/** A clock the builder steps, handed to the record as its clock, so every write is stamped with the lived instant. */
function steppedClock(ms) {
  let at = ms;
  return { now: () => at, set: (next) => (at = next), advance: (by) => (at += by) };
}

/* ── the cache ─────────────────────────────────────────────────────────── */

/**
 * Where built records are kept: `BRAINDOG_LIVED_CACHE`, or a folder in the machine's temporary space named for this
 * checkout, so builders in parallel worktrees never sweep each other's records.
 */
export const cacheDir = () =>
  env.BRAINDOG_LIVED_CACHE ??
  join(tmpdir(), `braindog-lived-${createHash('sha256').update(ROOT).digest('hex')}`);

/**
 * The hash a built record is kept under: the profile's file byte for byte, every document it installs (BrainDog's
 * modules, the use case and each pack file), the source of every package the build runs through (the migrations, the
 * verbs, the import) and this builder. A change to any of them builds again, so a kept file never hides a changed shape
 * or a broken verb; anything else finds the file it built last time. Tests are not in it, since a build never runs them.
 */
export function livedHash(name, over = null) {
  const h = createHash('sha256').update(JSON.stringify(over)).update('\0');
  const add = (file) => h.update(file.slice(ROOT.length)).update('\0').update(readFileSync(file)).update('\0');
  add(join(SHAPES, `${name}.json`));
  for (const dir of SOURCES)
    for (const f of readdirSync(join(ROOT, dir), { recursive: true }).map(String).sort())
      if (f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.split(/[\\/]/).includes('test')) add(join(ROOT, dir, f));
  const profile = readProfile(name, over);
  for (const id of profile.packs) add(packFile(id));
  for (const id of FIRST_PARTY) h.update(JSON.stringify(firstPartyDocument(id, { seeds: [] })));
  if (profile.usecase !== null) h.update(JSON.stringify(useCaseDocument(profile.usecase, dayOf(ENDS - profile.weeks * 7 * DAY))));
  add(SELF);
  return h.digest('hex').slice(0, 16);
}

/**
 * The lived record for a profile: `{ file, now, profile, cached }`. Built when no file is kept under its hash, and
 * built to a scratch name first, so a run that is stopped part way never leaves a half record where a gate finds it.
 */
export async function buildLived(name = 'default', o = {}) {
  const over = o.over ?? null;
  const profile = readProfile(name, over);
  const dir = o.dir ?? cacheDir();
  mkdirSync(dir, { recursive: true });
  /* A PROFILE WITH CHANGES IS KEPT UNDER ITS NAME AND ITS CHANGES, `lived-well+3f2a91c0-…`, beside the profile's own. */
  const kept = over === null ? name : `${name}+${createHash('sha256').update(JSON.stringify(over)).digest('hex').slice(0, 8)}`;
  const file = join(dir, `${kept}-${livedHash(name, over)}.sqlite`);
  if (existsSync(file) && o.fresh !== true) return { file, now: ENDS, profile, cached: true };
  const scratch = `${file}.${process.pid}.building`;
  rmSync(scratch, { force: true });
  const sql = fileSql(scratch);
  try {
    await live(sql, profile);
  } finally {
    sql.close();
  }
  renameSync(scratch, file);
  /* AND ITS OLDER BUILDS GO, so the folder holds one file a profile and not one a change. Matched whole, so `lived`'s
     builds are never `lived-well`'s. */
  const older = (f) => f.startsWith(`${kept}-`) && /^[0-9a-f]{16}\.sqlite$/.test(f.slice(kept.length + 1));
  for (const f of readdirSync(dir)) if (older(f) && join(dir, f) !== file) rmSync(join(dir, f), { force: true });
  return { file, now: ENDS, profile, cached: false };
}

let opened = 0;

/**
 * The record a built file holds, opened at the instant it ended, for a reader such as the signs. The clock is pinned,
 * so a read made a week later reads the same record on the same day.
 *
 * ON A COPY, which `close` deletes: opening a record arms its schedule, and a reader that writes must not change the
 * file the next reader finds under the same hash.
 */
export async function openLived(file, at = ENDS) {
  const copy = `${file}.${process.pid}.${++opened}.open`;
  copyFileSync(file, copy);
  const sql = fileSql(copy);
  const api = await createRecordApi({ sql, clock: steppedClock(at) });
  return {
    api,
    kernel: api.kernel,
    sql,
    close: () => {
      sql.close();
      rmSync(copy, { force: true });
    },
  };
}

/* ── living it ─────────────────────────────────────────────────────────── */

/** A result's value, or a throw that says which step of the lived record the record refused and in its own words. */
const said = (r, step) => {
  if (r?.ok === true) return r.value;
  throw new Error(`The lived record could not ${step}: ${r?.refusal?.code ?? 'refused'}, ${r?.refusal?.fix ?? JSON.stringify(r)}`);
};

const owner = { principal: { kind: 'person', id: OWNER, level: 'owner' } };

/** Plan and install one pack document as a person does, approving exactly what the plan asked to approve. */
async function put(api, doc, what) {
  const { diff } = said(await api.planPack({ doc, source: { kind: 'local' } }, owner), `plan ${what}`);
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve }, owner), `install ${what}`);
}

/** A record id for a profile: `rec_` and a ULID, the same for the same profile on every build. */
const recordId = (name) => {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = createHash('sha256').update(`lived:${name}`).digest();
  return `rec_01J9${[...bytes.subarray(0, 22)].map((b) => ALPHABET[b % 32]).join('')}`;
};

/** The day a ms falls on, in UTC, `2026-08-14`. */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * WEEK 0, THE FIRST HOUR: the record is named, BrainDog's modules go in with no example rows (a person who imports has
 * rows of their own), then the use case, then each add-on from its own file in `packs/`. Nothing from the seed's sample.
 */
async function setUp(api, profile, start) {
  const k = api.kernel;
  said(k.createRecord({ id: recordId(profile.profile), slug: 'lived', name: profile.record.name, tz: profile.record.tz, locale: profile.record.locale, owner: { id: OWNER } }), 'name the record');
  for (const id of FIRST_PARTY) await put(api, firstPartyDocument(id, { seeds: [] }), `the ${id} module`);
  if (profile.usecase !== null) {
    const doc = useCaseDocument(profile.usecase, dayOf(start));
    if (doc === null) throw new Error(`There is no use case called ${profile.usecase}.`);
    await put(api, withoutRows(doc), `the ${profile.usecase} use case`);
  }
  for (const id of profile.packs) await put(api, JSON.parse(readFileSync(packFile(id), 'utf8')), `the ${id} add-on`);
}

/* ── week 0: the import, with its residue ──────────────────────────────── */

/**
 * The same draws on every build and in both profiles, so `default` and `lived-well` live the same weeks and differ only
 * where their profiles do. Mulberry32, seeded once.
 */
function draws(seed = 0x11fed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)] };
}

/* EVERY NAME IS MADE UP. Shops as a bank prints them, in capitals; people and projects as an owner writes them. */
const SHOPS = ['CEDAR LANE BAKERY', 'NILE CORNER MARKET', 'GRANARY MARKET', 'MARLOW JOINERY', 'QUAYSIDE PHARMACY', 'SALT AND STONE CAFE', 'TIDEWATER FUEL', 'OLIVE ROW GROCER', 'KESTREL BOOKS', 'BLUE DUNE TELECOM'];
const FIRST = ['Nadia', 'Omar', 'Lena', 'Karim', 'Mira', 'Tarek', 'Selma', 'Yusuf', 'Hana', 'Idris', 'Farah', 'Malik', 'Rana', 'Sami', 'Dalia'];
const LAST = ['Farid', 'Haddad', 'Marlow', 'Quill', 'Rahim', 'Selim', 'Tawfik', 'Wren', 'Zaki', 'Nour'];
const PROJECTS = [
  { name: 'Tidewater', lane: 'earning', measures: ['active users', 'paying servers', 'monthly revenue', 'churn', 'signups', 'support tickets'] },
  { name: 'Lanternfish', lane: 'building', measures: ['waitlist', 'beta users', 'crash reports', 'build minutes', 'page views', 'downloads'] },
  { name: 'Kestrel Studio', lane: 'earning', measures: ['clients', 'invoices sent', 'hours booked', 'proposals', 'open quotes', 'reviews'] },
  { name: 'Quayside', lane: 'parked', measures: ['visitors', 'orders', 'refunds', 'stock lines', 'reorders', 'returns'] },
];

/** The card every bank text names, made up. On `default` no account holds these digits, so no text can file. */
export const CARD_DIGITS = '4817';

/** The question the old tool asked once per message, in one wording: the residue that makes one cause many questions. */
const ALIKE = 'A bank text could not be read for its account. Accept it into Transactions, or fix the pattern?';

const money = (amount, currency) => ({ amount, currency });

/** Every series the import carries, by project, as `tidewater-active-users`. */
const seriesOf = (profile) => PROJECTS.flatMap((p) => p.measures.map((m) => `${p.name}-${m}`.toLowerCase().replace(/\s+/g, '-'))).slice(0, profile.import.numbers.series);

/**
 * WHAT THE OLD TOOL'S EXPORT HELD, as an adapter plans it (`apps/cli/src/adapter.ts`'s `Plan`). The residue is the
 * point: accounts with no digits on `default`, people written twice, and open questions asked once per message.
 */
function importPlan(profile, start) {
  const d = draws();
  const { currency } = profile.record;
  const key = 'ledgerbook:';
  const rows = [];
  for (const p of PROJECTS) rows.push({ register: 'things', key: `${key}project:${p.name}`, label: p.name, fields: { name: p.name, lane: p.lane } });
  const accounts = [];
  for (let i = 0; i < profile.import.accounts.count; i++) {
    const card = i === 0 || i % 4 === 3;
    /* THE CARD THE TEXTS NAME AND THE CURRENT ACCOUNT THE BALANCES NAME, the second printed two ways as the bank prints it. */
    const drawn = String(1000 + d.int(0, 8999));
    const digits = i === 0 ? CARD_DIGITS : i === 1 ? `${ACCOUNT_DIGITS},${ACCOUNT_DIGITS.slice(1)}` : drawn;
    const k = `${key}account:${i}`;
    accounts.push(k);
    const fields = { name: i === 0 ? 'Credit Card' : i === 1 ? 'Current Account' : `${card ? 'Card' : 'Account'} ${i + 1}`, kind: card ? 'card' : 'bank', balance: money(d.int(0, 900_000) * 100, currency), as_of: dayOf(start - 30 * DAY), liquid: !card };
    rows.push({ register: 'accounts', key: k, label: fields.name, fields: profile.import.accounts.digits ? { ...fields, last4: digits } : fields });
  }
  for (let i = 0; i < profile.import.ledger; i++) {
    const on = dayOf(start - d.int(1, 90) * DAY);
    const out = d.next() < 0.8;
    rows.push({ register: 'transactions', key: `${key}ledger:${i}`, label: `Ledger ${i + 1}`, fields: { what: out ? d.pick(SHOPS) : 'Client payment', on, direction: out ? 'out' : 'in', amount: money(d.int(50, 20_000) * 100, currency), account: { $ref: d.pick(accounts) }, state: 'cleared' } });
  }
  const people = profile.import.people;
  for (let i = 0; i < people.count; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    rows.push({ register: 'people', key: `${key}person:${i}`, label: name, fields: { name, role: d.pick(['client', 'contractor', 'collaborator', 'other']) } });
    /* THE SAME PERSON AGAIN, under the old tool's second id for them: one is in the address book, one in the old CRM. */
    if (i < people.twice) rows.push({ register: 'people', key: `${key}contact:${i}`, label: name, fields: { name: name.toUpperCase() } });
  }
  const asks = [];
  const options = [
    { id: 'accept', label: 'Accept it', because: 'The text is a real charge on the card.' },
    { id: 'fix', label: 'Fix the pattern', because: 'The pattern should read the account by itself.' },
  ];
  for (let i = 0; i < profile.import.questions.open; i++) {
    const alike = i < profile.import.questions.alike;
    const question = alike ? ALIKE : `Renew ${d.pick(PROJECTS).name}'s ${['domain', 'hosting', 'mail plan', 'design licence', 'test devices', 'certificate', 'backup plan', 'analytics plan'][i % 8]} for another year?`;
    asks.push({ key: `${key}question:${i}`, label: `Question ${i + 1}`, question, body: { from: `${key}question:${i}`, options } });
  }
  return { key, taken: dayOf(start), rev: 1, rows, asks, polls: [], skipped: [], changed: [] };
}

/** The importer's door onto the record, the record's own verbs signed by its owner, as `braindog import` reaches a host. */
function doorOf(k) {
  const w = { actor: OWNER };
  return {
    schema: async (register) => (k.registers().has(register) ? { ok: true, value: { register } } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${register}.` } }),
    list: async ({ register, limit, cursor }) => k.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor == null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => k.create(register, fields, { ...w, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) => k.update(register, `${register}#${seq}`, patch, { ...w, ...(version === undefined ? {} : { version }), ...(note === undefined ? {} : { note }) }),
    governance: async ({ register, status, limit, cursor }) => k.governance(register ?? 'suggestion', { ...(status === undefined ? {} : { status }), ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }) }),
    propose: async (p) => k.propose(p, OWNER),
  };
}

/**
 * The import, through the command's own `applyPlan`, and the numbers its history carried: every series gets its points
 * back to before the import, through the verb a connector writes numbers with.
 */
async function importWithResidue(api, profile, start) {
  const k = api.kernel;
  const plan = importPlan(profile, start);
  const report = await applyPlan(plan, doorOf(k), { dryRun: false, now: start });
  const refused = [...report.refused, ...report.missing];
  if (refused.length > 0) throw new Error(`The lived record's import was refused: ${JSON.stringify(refused).slice(0, 400)}`);
  const series = seriesOf(profile);
  const each = series.length === 0 ? 0 : Math.floor(profile.import.numbers.points / series.length);
  const d = draws(0x5eed);
  for (const s of series) {
    const points = Array.from({ length: each }, (_, i) => ({ series: s, grain: 'day', at: dayOf(start - (each - i) * DAY), value: d.int(10, 5000), unit: 'int', n: 1 }));
    said(k.writePoints('ledgerbook-stats', points), `carry the numbers of ${s}`);
  }
  return { plan, report };
}

/* ── weeks 1 to N: the days ────────────────────────────────────────────── */

/**
 * The door the add-ons' texts are posted to, read off their own files: the one the other text patterns name as their
 * `door:`, which is where a phone's shortcut posts every text. `null` when no installed add-on takes texts.
 */
function textDoor(profile) {
  for (const id of profile.packs) {
    const decls = JSON.parse(readFileSync(packFile(id), 'utf8')).declarations ?? [];
    const named = decls.find((d) => typeof d.door === 'string');
    if (named) return named.door;
  }
  return null;
}

/** A card text in the bank's own wording (`packs/bank-hsbc-eg`'s first shape), with a made-up shop and amount. */
const cardText = (digits, amount, day, shop, limit) => {
  const [y, m, d] = day.split('-');
  const figure = (minor) => (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Your Credit Card ending with *** ${digits} has been used for EGP ${figure(amount)} on ${d}/${m}/${y} at ${shop}. Your available limit is EGP ${figure(limit)}`;
};

/** The current account as the bank's account line prints it: a branch code, three stars and the last three digits. */
export const ACCOUNT_DIGITS = '0352';

/** A message that only prints a balance (`packs/bank-hsbc-eg`'s fourth shape), in the account line's own day, `21AUG26`. */
const balanceText = (day, balance) => {
  const [y, m, d] = day.split('-');
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(m) - 1];
  const figure = (balance / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `HSBC: ${d}${mon}${y.slice(2)} Your account 310-207***-${ACCOUNT_DIGITS.slice(1)} available balance is EGP ${figure}`;
};

/** An agent's write context: a token, and the host session it is, so the record's ladder finds or opens its run. */
const agent = (client_id) => ({ actor: 'agent:claude', principal: { kind: 'token', token: 't_lived' }, session: { client_id, client: 'claude-code', doing: 'Working through the week' } });

/**
 * WHAT HAPPENS ON EACH DAY, as timed events: bank texts at the door, the day's numbers, agents' runs that start and end
 * one of three ways, and on a tended record the owner answering what the import asked. The schedule is drained once an
 * hour around them (`liveDays`).
 */
function daysOf(profile, start) {
  const days = profile.weeks * 7;
  const d = draws(0xda75);
  const events = [];
  const at = (day, hour, minute = 0) => start + day * DAY + hour * HOUR + minute * 60_000;
  const door = textDoor(profile);
  /* THE TEXTS, spread over the days before the quiet ones at the end, in office hours. */
  const { count, lastDaysQuiet } = profile.days.arrivals;
  const span = Math.max(1, days - lastDaysQuiet - 1);
  let limit = 5_000_000;
  for (let i = 0; door !== null && i < count; i++) {
    const t = at(1 + Math.floor((i * span) / Math.max(1, count)), 8 + (i % 9), d.int(0, 59));
    const amount = d.int(40, 3000) * 100;
    /* A LIMIT NEVER PRINTED BELOW NOTHING: a profile with more texts than the limit holds has the card paid off first. */
    if (limit < amount) limit = 5_000_000;
    limit -= amount;
    const body = cardText(CARD_DIGITS, amount, dayOf(t), d.pick(SHOPS), limit);
    events.push({ t, run: (k) => said(k.arrive({ channel: 'webhook', ingest: door, body, sha256: createHash('sha256').update(`lived:${i}:${body}`).digest('hex'), verified: true }), 'take a bank text') });
  }
  /* THE BALANCES, where the bank sends them, one every few days at eight in the evening. */
  const every = profile.days.balances.everyDays;
  for (let day = every; door !== null && every > 0 && day < span; day += every) {
    const t = at(day, 20);
    const body = balanceText(dayOf(t), 3_000_000 + d.int(0, 900_000) * 100);
    events.push({ t, run: (k) => said(k.arrive({ channel: 'webhook', ingest: door, body, sha256: createHash('sha256').update(`lived:balance:${body}`).digest('hex'), verified: true }), 'take a balance text') });
  }
  /* THE NUMBERS, one a series a day at seven in the morning, until the day they stop. */
  const series = seriesOf(profile);
  for (let day = 0; day < days - profile.days.numbers.stopDaysBeforeEnd; day++) {
    const t = at(day, 7);
    const points = series.map((s) => ({ series: s, grain: 'day', at: dayOf(t), value: d.int(10, 5000), unit: 'int', n: 1 }));
    events.push({ t, run: (k) => said(k.writePoints('ledgerbook-stats', points), 'take the day\'s numbers') });
  }
  /* THE RUNS, the same number each day from nine, each ending as the profile's shares say: done and handoff by the
     session's own end, abandoned by nobody, so the hourly sweep writes it off twelve hours on. */
  const { done, handoff, abandoned } = profile.days.runs.ends;
  const ways = [...Array(done).fill('done'), ...Array(handoff).fill('handoff'), ...Array(abandoned).fill('abandoned')];
  const total = profile.days.runs.count;
  for (let i = 0; ways.length > 0 && i < total; i++) {
    const day = Math.floor((i * days) / total);
    const opened = at(day, 9 + (i % 10), d.int(0, 50));
    const id = `lived-run-${i}`;
    const way = ways[i % ways.length];
    events.push({ t: opened, run: (k) => said(k.runFor(agent(id), 'opened: lived'), 'open a run') });
    if (way === 'handoff') events.push({ t: opened + 40 * 60_000, run: (k) => said(k.update('session', said(k.runFor(agent(id)), 'find a run').spoken, { next: 'Pick up the next unit' }, agent(id)), 'leave a next step') });
    if (way !== 'abandoned') events.push({ t: opened + 50 * 60_000, run: (k) => said(k.endRun(agent(id), {}), 'end a run') });
  }
  /* THE ANSWERS, on the days of the first week, to the questions the import asked, in the order they were asked. */
  for (let i = 0; i < profile.days.answers.imported; i++)
    events.push({
      t: at(1 + (i % 5), 20, i),
      run: (k, sql) => {
        const q = sql.one("SELECT id FROM suggestion WHERE status = 'open' AND json_valid(body) AND json_extract(body, '$.from') LIKE 'ledgerbook:%' ORDER BY rowid LIMIT 1");
        if (q) said(k.decide(q.id, { decide: { option: 'accept', reason: 'Read it, and it is right.' } }, OWNER), 'answer a question');
      },
    });
  return events.sort((a, b) => a.t - b.t);
}

/**
 * The days, an hour at a time: every event of the hour at its own minute, then the schedule drained at the hour's end,
 * as the record's alarm drains it. The last hour ends at `ENDS`.
 */
async function liveDays(api, sql, clock, profile, start) {
  const k = api.kernel;
  const events = daysOf(profile, start);
  let next = 0;
  for (let hour = clock.now() + HOUR - (clock.now() % HOUR); hour <= ENDS; hour += HOUR) {
    while (next < events.length && events[next].t < hour) {
      clock.set(Math.max(clock.now(), events[next].t));
      events[next].run(k, sql);
      next++;
    }
    clock.set(hour);
    await k.drain();
  }
}

/** The whole of it: week 0's first hour, the import, then every day to `ENDS`. */
async function live(sql, profile) {
  const start = ENDS - profile.weeks * 7 * DAY;
  const clock = steppedClock(start);
  const api = await createRecordApi({ sql, clock });
  await setUp(api, profile, start);
  await importWithResidue(api, profile, start);
  await liveDays(api, sql, clock, profile, start);
}

/** Every sign of a built record, as the record reads them at the instant it ended. */
export async function livedSigns(file) {
  const r = await openLived(file);
  try {
    return said(r.kernel.signs(), 'read its signs').signs;
  } finally {
    r.close();
  }
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  const name = argv[2] ?? 'default';
  const t = Date.now();
  const built = await buildLived(name);
  console.log(`${name}: ${built.cached ? 'found' : 'built'} in ${((Date.now() - t) / 1000).toFixed(1)}s, ${built.file}`);
  for (const s of await livedSigns(built.file)) console.log(`${s.state.padEnd(5)} ${s.name}: ${s.said}`);
}
