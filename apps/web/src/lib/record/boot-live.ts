/**
 * The shell's one read: the record's `boot`, or the refusal it answered instead.
 *
 * LOADED DYNAMICALLY, beside `api.ts`, and never from the root layout's entry chunk. `@braindog/client` carries the
 * route table as a value, and the entry chunk has half a kilobyte of room.
 *
 * EVERY REFUSAL IS THE RECORD'S ANSWER, AND THERE IS NO SAMPLE BEHIND ANY OF THEM. `UNREACHABLE` and `UNAUTHORIZED` at
 * an address with no slug used to draw the sample business in the browser; the app only ever shows a real record now.
 * The root layout sends a 401 to sign-in, and for anything else the shell draws itself empty so the
 * screen under it can say what the record said, or that no record answered at all.
 *
 * KEPT FOR THE TAB once decided, the way `lib/data/record.ts` always kept its probe: the layout's `load` runs on every
 * navigation, and the shell must not cost a request each time. A refusal is not kept, because it is about the record's
 * state rather than about whether there is one. `forget` drops the answer after a write that changes it.
 */

import { batchMetrics, batchReads, batchSchemas, createClient, forgetSchemas, type Boot, type ClientOptions, type Cursor, type EventLine } from '@braindog/client';
import { railRoom } from '@braindog/kernel/constants';
/* THE BUILT-IN ADD-ONS' NAMES AND LISTS: a line about an add-on names it from here. It read the sample's `PACKS`, which
   carried the same six and the sample's two made-up add-ons, until the sample left the app, then a hand copy in `modules.ts` until each module's
   own manifest said it, then each module's document (`firstPartyModule`), which put every document on the first open.
   The seed's light door says the same lists and names, held to the documents by its own test. */
import { listsOfModule, moduleNamed } from '@braindog/seed/packs/lists';
import { asPartOf, useCaseName } from '@braindog/seed/usecases/names';

import { hueOf, iconFor, setupSaid, whoDid, type NavEntry } from './api.ts';
import { homeOf, learnHome, learnMoney } from './api.ts';
import { forgetZone, learnZone } from './zone.ts';
import { currencyOf } from './money.ts';
import { learnPages, PAGES, REGISTERS } from './held.ts';
import { learnRowPages } from './row-href.ts';
import { copy } from '../copy.ts';
import { forgetKept } from '../data/kept.ts';
import { forgetWalks as forgetRows } from '../data/rows-forget.ts';
import { forgetToday } from '../home/today-kept.ts';
import { dropCopy } from './boot-copy.ts';
import { forgetWith } from './forget-read.ts';
import type { Answer, SwitcherRow } from './switcher.ts';
import { declaredOf, noteOf } from './history-live.ts';
import { listName, titleOf } from './names.ts';
import type { NewsItem, PageDecl, Person, Question } from './schema.ts';
import { levelsFrom, type HeldLevel } from './may.ts';
import type { IconName } from '../ui/icons.ts';
import { agentKindOf, hueFor, type AgentKind } from '../ui/face.ts';
/* THE HOLDING PEN, AS THE RECORD SENDS IT (`boot`'s `pen`), held to the shape the settings screen draws. */
import { penOf, type PenItem } from '../design/pen.ts';
import type { Prefs } from '../nav-prefs.svelte.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

/**
 * What the record's settings and money say its currency is, read where its `boot` named none (`readImplied`).
 *
 * `setting` is the `home_currency` a pack's settings hold, asked only of a host older than `Boot.record.currency`: a
 * newer one answers that field from the same setting. `held` is every currency the record's money is in, as far as the
 * caller may read it, and `homeOf` takes it only when it is one.
 */
export type Implied = { setting: string | null; held: string[] };

/**
 * What `readBoot` read beside each `boot` it answered, by that answer. BESIDE IT AND NOT ON IT, because the boot a
 * screen is handed (`lib/data/record.ts` `source.boot()`) is the record's own answer, word for word.
 */
const IMPLIED = new WeakMap<Boot, Implied>();

export type Booted = { from: 'live'; boot: Boot } | ({ from: 'refused' } & Said);

/**
 * What the record said instead of its `boot`: its code, its sentence, and where the refusal is about when it said.
 *
 * `at` IS KEPT because a screen branches on it and never on the sentence: `level.append` is a person at "Adds only",
 * and Home draws the one button that is hers under her sentence. Left off when the record sent none, so every
 * refusal that never carried one reads exactly as it did.
 */
export type Said = { code: string; fix: string; at?: string };

/** Where an "Adds only" person's refusal is about, as the record's `appendReadRefusal` sends it. */
export const APPEND_AT = 'level.append';

/** Whether a refused `boot` is the one a person at "Adds only" gets: the screen offers her agent's key. */
export const onAppendOnly = (said: Said | null | undefined): boolean => said?.at === APPEND_AT;

const saidOf = (r: { code: string; fix: string; at?: string | undefined }): Said => ({
  code: r.code,
  fix: r.fix,
  ...(typeof r.at === 'string' && r.at !== '' ? { at: r.at } : {}),
});

/**
 * What every shell carries, whoever answered.
 *
 * IT WAS SPELLED `ReturnType<typeof boot>`, THE SAMPLE'S ANSWER, so the shell every live screen reads took its shape
 * from the mock in `api.ts`, and the mock could not leave without the shell losing its type. It is written out now,
 * field by field, as the sample's `boot` returned it (`fixtures/readers.ts`), which is what `layoutOf` and
 * `refusedShell` build.
 */
type ShellBase = {
  index: {
    slug: string;
    name: string;
    locale: string;
    /**
     * THE RECORD'S HOME CURRENCY AS ITS `boot` SAID IT (`Boot.record.currency`), `null` where nobody has chosen one or
     * the host is older than the field. `homeCurrency()` in `api.ts` answers this same value, kept as the shell is built.
     */
    currency: string | null;
    /** `guessed`: drawn offline from the local copy, which kept no count for the list, so the rail draws none. */
    registers: { id: string; name: string; count: number; open?: number; icon: IconName; views: { key: string; name: string; href: string }[]; guessed?: true }[];
  };
  /**
   * The rail's pages; `tabs` when the page's declaration asked for its nav section to be drawn as tabs, and `cut` on a
   * tabbed section's page the rail's budget left out: the strip of tabs draws it and the rail does not. `waits` (with
   * `cut`) on a page held off the rail while every list it reads is empty: the sidebar still draws it under its place's
   * More, or under More lists, so an add-on just installed has somewhere to be opened from (audit 31 Oct f, AF7).
   */
  nav: (NavEntry & { tabs?: true; cut?: true; waits?: true })[];
  /**
   * The holding pen: what the record would add if somebody asked, each offer with the whole declaration keeping it
   * writes. A holding pen, not a decision (19 §3). Empty for a caller who is offered nothing.
   */
  pen: PenItem[];
  people: Person[];
  questions: Question[];
  whatsNew: NewsItem[];
  /**
   * THE LINES `boot` SAID WERE NEW, as the record sent them, with the cursor they reach (`upTo`): Today's first read keeps
   * them beside its page and does not ask `whatsNew` for the same lines again (scope 2026-10-24 A16). Absent on a shell no
   * record answered.
   */
  newsLines?: readonly EventLine[];
  sinceCapped: boolean;
  version: number;
  /** Absent means every "Ask BrainDog" affordance is ABSENT, not disabled (23 §8). */
  assistant: boolean;
};

/**
 * What the root layout hands every screen: the record's `boot`, or an empty shell over a refusal.
 *
 * `now` is the clock a screen reads ages against (the record's, or this browser's over a refusal), and
 * `upTo` is the newest line of what is new, which is what marking it all read sends.
 */
export type Shell = ShellBase & {
  me: {
    person: string;
    /**
     * THE READER'S OWN NAME as `boot` says it (`me.name`), which a guest's `names` does not carry: her face on the bar is
     * her own first letter, never the "Y" of "You". Absent where the record knows no name.
     */
    name?: string;
    level: string;
    owner: boolean;
    /* THE SWITCHER'S OWN ROW, so a record where somebody holds some lists arrives with `level: null` and `held`. */
    records: SwitcherRow[];
    /**
     * THE LISTS A COLLEAGUE HOLDS WHEN THEY HOLD LISTS AND NOT THE RECORD, by id; `null` for everybody else.
     *
     * `level` CANNOT SAY IT. The record answers `level: null` for a person invited to one list, and the
     * shell falls back to `read` so nothing downstream meets a word it does not know. Measured through the
     * real seed, that fallback is the whole of what a bookkeeper given
     * `write` on Expenses was: "Can read, cannot change", "you have read access", and a Home that took
     * them for the owner of an empty record. This is the fact the fallback threw away.
     */
    lists: string[] | null;
    /**
     * THE LEVEL THE CALLER HOLDS ON EACH LIST, by id, as `boot` answers it (`me.levels`), which `may` reads (`may.ts`).
     *
     * `level` SAYS THE WHOLE RECORD AND `lists` SAYS WHICH, and neither says what a colleague may do on one list: a
     * record-wide appender with `read` on Tasks, or a bookkeeper with `write` on Expenses and `read` on the rest. The
     * owner-only lists are already left out for a record-wide appender, so the app asks and never works it out. Absent
     * from a host older than the field, rather than guessed.
     */
    levels?: Readonly<Record<string, HeldLevel>>;
    /** A person's own navigation on this record, key by key (`nav-prefs.svelte.ts`). Absent for a token. */
    prefs?: Prefs;
    /**
     * WHERE SHARES MADE THIS PERSON'S ACCESS, as `boot` says it (`me.grant`): the access epoch the local copy is keyed on
     * and the version poll compares, and when the last share ends. Absent for anybody who holds no share.
     */
    grant?: { epoch: number; until: string | null };
    /** A fingerprint of the rows and fields their shares narrow them to (`me.lens`), for the copy's key. */
    lens?: string;
  };
  /**
   * Why the records this person can reach could not be listed, when they could not.
   *
   * THE SWITCHER OWES A READER THE REASON. A menu that quietly holds the one record you are already
   * in reads as a product with one record in it, which is a different claim from "this list could
   * not be read just now". The root layout fills it from `/account/records`, and it is absent on
   * every shell that could list them.
   */
  recordsRefused?: string | undefined;
  /**
   * Which host answered `boot`, when it said: Billing reads it before it falls back to asking the mail door.
   *
   * ABSENT ON A HOST OLDER THAN THE FIELD. `DEPLOYMENT.kind` is the test fixture's variant and reads
   * `self-host` on the Cloud build, so it is not a stand-in for this (`routes/settings/billing.ts`).
   */
  host?: 'cloud' | 'self-host' | undefined;
  /** A self-host in its Docker image (PK5), so a command to run on the machine is the `docker compose` one only there. */
  image?: true | undefined;
  /**
   * WHY THE RECORD ITSELF WOULD NOT ANSWER `boot`, when it would not.
   *
   * AN EMPTY RECORD AND A RECORD YOU MAY NOT READ ARE NOT THE SAME FACT AND MUST NOT DRAW THE SAME
   * SCREEN. Measured against a provisioned self-host holding 19 lists and 230 rows, with a colleague
   * invited at `Adds only` accepting through the product's own link: `boot` answers 403
   * `LEVEL_REQUIRED`, "This needs read, and you have append access. Ask an owner to raise your
   * access." The shell drawn over that carried nothing of it, so it was a shell with zero registers,
   * which is exactly what a record nobody has started looks like. Home then printed "Nothing in the
   * record yet." with `Start here`, offering the onboarding of a record that already exists and that
   * this reader cannot open: 50 words and one control, beside the owner's 489 and 27 on that same
   * record in the same minute.
   *
   * Absent on every shell drawn over a record that answered.
   */
  refused?: Said | undefined;
  /**
   * EVERY LIST THE RECORD HOLDS, the empty ones too, for the places that put something INTO a list.
   *
   * `index.registers` is the rail's, and the rail draws only lists that hold something. Filing an arrival and giving
   * somebody an exception read that same list, so a record whose Clients list had no row yet could neither file its
   * first client nor give a bookkeeper access to it: the one way to fill a list was hidden until it was full.
   */
  lists: { id: string; name: string; kernel?: true; pack?: string }[];
  /**
   * THE SLUG OF EVERY PAGE THIS CALLER MAY OPEN, in the rail or not, from `boot`. Home asks for its use case's page only when
   * the record holds it, so a use case with no Home page is not asked for one on every load.
   */
  pages: string[];
  /**
   * EACH PERSON ON THE RECORD BY NAME, by id, when `boot` sent them: to the owner and to a member who may read People. Empty
   * for anybody else, and a person it does not name is Someone on this record.
   */
  names: Record<string, string>;
  inbox: number;
  /* HOW MANY QUESTIONS ARE OPEN, which `questions` cannot say: `boot` caps that list at twenty, and the count is the record's. */
  open: number;
  /**
   * `boot`'s counts as the record sent them, which `spineOf` reads to say whether Decide and Inbox are drawn yet.
   * Absent on a shell no record answered; the root layout then reads `open` and `inbox`.
   */
  counts?: NonNullable<Boot['counts']>;
  /**
   * WHAT WAITS ON THE READER, AS `boot` SAID IT (`waitsOf`): the rail's badge, Today's header and Decide's sentence read
   * these and nothing of their own. `null` from a host older than the field, and on a shell no record answered.
   */
  waits: Waits | null;
  /** How many days a question waits before it is late, as the record says it; `null` where it did not say. */
  lateDays: number | null;
  /**
   * SET WHEN `boot` REACHED NOBODY and the last reader was found (`local-mark.ts`): the screens draw what the local copy
   * holds for them, to read only, and the layout says the offline line. Over the last copy when there is one, else
   * beside the refusal.
   */
  offline?: true | undefined;
  /** SET ON A SHELL DRAWN FROM THE LAST COPY (`boot-copy.ts`) before `boot` answers: it only draws, and holds no level to write by. */
  stale?: true | undefined;
  /** The agents working now, as `boot` said it (`workingOf`). Empty on a shell no record answered. */
  working: Working[];
  now: number;
  live: boolean;
  /* A ROWID FOR THE OWNER AND `e.<id>` FOR A MEMBER HELD TO NAMED LISTS: handed back to `markRead` as it came. */
  upTo: Cursor | null;
};

/**
 * THE RECORD'S CLOCK: what time it is on the record, ticking on from the instant its `boot` said.
 *
 * TWO CLOCKS SAID TWO DAYS. The list measured "late" from the record's `now` and a row's own page, the saved view and
 * Usage from the browser's, so one bill was 64 days late in the list and 111 on its page, and Usage offered October on a
 * record whose today is 3 September. Every screen that says late, today, this month, a relative time or a next run asks
 * this one function. It is the record's instant plus the time this tab has run since that answer, so it still ticks;
 * with no answer yet it is the browser's clock, and nothing else.
 */
let bootNow: number | null = null;
let bootedAt = 0;

/** Keep the record's `now` from a `boot` that just answered. A value that is not a date keeps the clock as it was. */
export function learnNow(iso: string | null | undefined, at: number = performance.now()): void {
  const t = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) return;
  bootNow = t;
  bootedAt = at;
}

/** The record's time now, in milliseconds: the booted instant plus the time since it landed, else the browser's. */
export const recordNow = (): number => (bootNow === null ? Date.now() : bootNow + (performance.now() - bootedAt));

/** Forget the record's clock, as `forget` forgets the rest of its answer; the next `boot` sets it again. */
export function forgetNow(): void {
  bootNow = null;
  bootedAt = 0;
}

let kept: Promise<Booted> | null = null;

/* WHICH RECORD `kept` IS. Since the record is in the address (`/<slug>/api/boot`), one tab can ask two records, and
   an answer kept for acme handed to a screen on kiln is kiln's rail drawn from acme's lists. */
let keptFor = '';

/**
 * THE LAST REFUSAL THIS MODULE READ, kept beside the answer it keeps.
 *
 * `refusedShell()` is called with nothing to say, by the root layout, one tick after `readBoot`
 * resolved. Everything the screen under it needs to be honest was in hand at line 93 and was thrown
 * away there, and this is the file that had it. Cleared the moment the record answers, so a shell
 * over a record that came back never carries a sentence about a read that is over.
 */
let refusal: Said | null = null;

/**
 * THE `boot` THE PAGE ASKED FOR BEFORE THE APP ARRIVED (`app.html`), taken once and only for the address it was asked
 * at, or `null`. The shell's first request goes out beside the first chunks rather than after three of them have loaded;
 * a guess at the record that turns out wrong is left unread, and this asks as it always did.
 */
function earlyBoot(url: string): Promise<Response> | null {
  const held = (globalThis as { __bdBoot?: { url?: unknown; at?: unknown } }).__bdBoot;
  if (!held || held.url !== url || !(held.at instanceof Promise)) return null;
  (globalThis as { __bdBoot?: unknown }).__bdBoot = undefined;
  return held.at as Promise<Response>;
}

/** The record whose every list's declaration was asked beside `boot` and handed to the client (`firstOpen`). */
let everyAt: string | null = null;

/**
 * Whether every list's declaration on `base` was asked beside `boot` and is the client's (`firstOpen`): a list learnt
 * from here on is answered from that one read, never asked again, so a screen need not wait on anything else first.
 */
export const everyAsked = (base: string): boolean => everyAt === base;

/**
 * THE TAB'S FIRST OPEN OF A RECORD, before any screen draws: the lists' declarations a screen asks in one turn go as one
 * read from now on (`batchSchemas`), and every list's declaration the page asked for beside `boot` (`app.html`,
 * `schemas` with `every`) is handed to the client, so Today and a project learn their lists from it and not from the
 * network after `boot`. Taken once and only for the address it was asked at, as `earlyBoot` is.
 */
export function firstOpen(base: string): void {
  batchSchemas(true);
  /* AND THE FIGURES A SCREEN ASKS TOGETHER GO AS ONE `metrics` (the sidebar's one a project, a project page's own). */
  batchMetrics(true);
  /* AND EVERY READ A SCREEN ASKS AT ONCE GOES AS ONE `reads` (Today's tiles, a project's blocks, the sidebar's lists). */
  batchReads(true);
  const url = `${base}/api/schemas?every=true`;
  const held = (globalThis as { __bdSchemas?: { url?: unknown; at?: unknown } }).__bdSchemas;
  if (!held || held.url !== url || !(held.at instanceof Promise)) return;
  (globalThis as { __bdSchemas?: unknown }).__bdSchemas = undefined;
  void createClient({ base }).schemas(held.at as Promise<Response>);
  everyAt = base;
}

export function readBoot(base: string, io?: Fetch): Promise<Booted> {
  if (keptFor !== base) kept = null;
  keptFor = base;
  if (behind) {
    behind = false;
    const was = kept;
    if (was !== null) {
      kept = null;
      const next = readBoot(base, io);
      kept = was;
      void next.then((got) => {
        if (got.from === 'live' && kept === was) kept = next;
      });
      return was;
    }
  }
  kept ??= (async (): Promise<Booted> => {
    /* THE EARLY ANSWER, WHEN IT WAS ASKED AT THIS ADDRESS, is the one `boot` read; anything else goes to the network. */
    const early = io ? null : earlyBoot(`${base}/api/boot`);
    const first: Fetch | undefined = early
      ? (((input: string | URL | Request, init?: RequestInit) =>
          String(input) === `${base}/api/boot` && (init?.method ?? 'GET') === 'GET' ? early : globalThis.fetch(input, init)) as Fetch)
      : io;
    const client = createClient({ base, ...(first ? { fetch: first } : {}) });
    const out = await client.boot();
    refusal = null;
    if (out.ok) {
      /* THE RECORD'S CLOCK, set the moment its answer lands (`recordNow`). */
      learnNow(out.value.now);
      /* THE PAGES' TITLES ARE KEPT WHERE A SCREEN LOOKS A PAGE UP BY SLUG (`held.ts`), which was the sample's copy alone. */
      learnPages(out.value.pages ?? []);
      /* AND WHERE THE RECORD NAMED NO CURRENCY, WHAT ITS MONEY IS IN, asked before the shell is built so the first
         screen is drawn in it. A record that named one costs nothing more, and NOR DOES A HOST THAT SENT `money`: it
         read the money itself and folded the one currency into `currency`, so `null` beside it is none, or two. */
      const record = drawnOf(out.value);
      if (record && homeOf(record.currency) === null && !Object.hasOwn(record, 'money')) {
        const implied = await readImplied(client, out.value).catch(() => null);
        if (implied) IMPLIED.set(out.value, implied);
      }
      return { from: 'live', boot: out.value };
    }
    const said = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'Something changed while it was being read.' };
    /* NOT KEPT, THE 401 LEAST OF ALL. This line used to keep a 401 or an unreached host at the bare address as the
       sample, for the tab, and so the first load after signing in was handed The Studio with no request made.
       A refusal kept nothing then either; now it is every such answer. */
    kept = null;
    refusal = saidOf(said);
    return { from: 'refused', ...refusal };
  })();
  return kept;
}

type Client = ReturnType<typeof createClient>;

/**
 * Where a `boot` says what currency the record is drawn in: its `record`, else the same two keys beside it.
 *
 * A RECORD NOBODY NAMED STILL HAS A CURRENCY. It answers `record: null`, and this file read that as no currency at all,
 * so every sentence on the gates' record said "£39 GBP". A newer host sends `currency` and `money` at the top as well;
 * a host older than that, with no name, is read as before, for nothing.
 */
const drawnOf = (b: Boot): { currency?: string | null; money?: string[] } | null =>
  b.record ?? (Object.hasOwn(b, 'currency') ? { currency: b.currency ?? null, ...(b.money ? { money: b.money } : {}) } : null);

/**
 * The currency a record's settings and money imply, for a `boot` that named none.
 *
 * THE SETTING ONLY FROM A HOST OLDER THAN THE FIELD, AND ONLY THE SETTING. `Boot.record.currency` is the kernel's
 * `homeCurrency`, the `home_currency` of the first enabled pack declaring one, so a host that sends `null` has already
 * read the setting and found none. A host that sends no key at all is asked the same question here, pack by pack in id
 * order as the kernel asks it, and is not read for its money: that host drew its figures in codes before and still
 * does where nobody set a currency.
 *
 * THE MONEY BY ITS TWO ENDS. A list sorts a money field by currency first (the kernel's `list` order), with an empty
 * value last either way, so the first row ascending and the first descending hold the lowest and the highest currency
 * the field holds: equal, and the field is in one. Two rows a field, read only over lists that hold rows, and a list
 * the caller may not read adds nothing. A list this tab already knows the fields of is not asked for them again.
 */
export async function readImplied(client: Client, b: Boot): Promise<Implied> {
  if (b.record && !Object.hasOwn(b.record, 'currency')) return { setting: await readSetting(client), held: [] };
  const lists = b.registers.filter((r) => r.count > 0 && r.id !== 'session');
  const fields = await Promise.all(
    lists.map(async (r): Promise<[string, string[]]> => {
      const known = REGISTERS[r.id];
      if (known) return [r.id, known.fields.filter((f) => f.type === 'money').map((f) => f.id)];
      const said = await client.schema(r.id);
      const decl = said.ok ? (said.value as { fields?: unknown } | null) : null;
      const all = decl && Array.isArray(decl.fields) ? (decl.fields as { id?: unknown; type?: unknown }[]) : [];
      return [r.id, all.flatMap((f) => (f.type === 'money' && typeof f.id === 'string' ? [f.id] : []))];
    }),
  );
  const ends = await Promise.all(
    fields.flatMap(([register, ids]) =>
      ids.flatMap((field) =>
        (['asc', 'desc'] as const).map(async (dir) => {
          const page = await client.list({ register, order: [{ field, dir }], limit: 1 });
          const row = page.ok ? (page.value.rows[0] as { fields?: Record<string, unknown> } | undefined) : undefined;
          return currencyOf(row?.fields?.[field]);
        }),
      ),
    ),
  );
  return { setting: null, held: [...new Set(ends.filter((c): c is string => c !== null))].sort() };
}

/** The `home_currency` the first enabled pack declaring one holds, by id, or `null`. */
async function readSetting(client: Client): Promise<string | null> {
  const packs = await client.packs();
  if (!packs.ok) return null;
  const on = packs.value.filter((p) => p.disabled_at === null).map((p) => p.id).sort();
  const read = await Promise.all(on.map((id) => client.packConfig({ id })));
  for (const r of read) {
    const v = r.ok ? (r.value as { config?: Record<string, unknown>; values?: Record<string, unknown> } | null) : null;
    if (!v?.config || !Object.hasOwn(v.config, 'home_currency')) continue;
    const home = homeOf(null, v.values?.home_currency);
    if (home) return home;
  }
  return null;
}

/**
 * Whether anybody signs in on the host that answered `boot`.
 *
 * ONLY A HOST THAT SAID NO IS ONE WITHOUT SIGN-IN. A self-host started without a key answers `/account/records`
 * 401 on every load, the same answer an ended session gets, so the host says so in `boot` and the app stops
 * asking. A host older than the field says nothing, and is asked as before.
 */
export const signsIn = (b: Boot): boolean => (b as Boot & { signIn?: unknown }).signIn !== false;

/**
 * One agent at work, as the rail's Working now draws it: the run, the kind of agent, the project it was
 * placed in, what it says it is doing, when the run began, whether it has gone quiet, and how long it has gone in
 * seconds (`ran_s`, the record's `runAge`), which stops at the last time a quiet run was heard from.
 */
export type Working = {
  seq: number | null;
  agent: string;
  kind: AgentKind;
  project: string | null;
  doing: string | null;
  since: string | null;
  quiet: boolean;
  ran_s?: number;
};

/**
 * What waits on the reader, as `boot` says it (`waits`, the record's `waiting()`): open questions, how many of them are
 * late and how many hard to undo, arrivals in the inbox (`null` where the reader is not told), and agents working now.
 * The rail's badge, Today's header and Decide's sentence all say these numbers, so no two of them disagree.
 */
export type Waits = { questions: number; late: number; hard: number; inbox: number | null; working: number };

/**
 * WHO IS WORKING, AS `boot` SAYS IT (`working`): the runs active and not quiet, by the record's one clock, so the rail's
 * count, Today's tile and the Agents header are the same runs. It was a page of its own the rail asked the record to
 * draw (`previewPage` over `sessions.live`) on every screen and every version; `boot` answers it in the same request.
 *
 * A HOST OLDER THAN THE FIELD sent its live runs on `sessions`, each saying whether it had gone quiet, so the working ones
 * are read from there: active and not quiet, as that host judged it. A caller who may not read runs is sent none.
 */
export function workingOf(b: Boot): Working[] {
  const said = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (Array.isArray(b.working))
    return b.working.map((w) => ({
      seq: w.seq,
      agent: w.agent || 'other',
      /* The kind of agent (`face.ts`), worked out here so the rail's chunk does not carry the names behind it. */
      kind: agentKindOf(w.agent ?? ''),
      project: w.project,
      doing: w.doing,
      since: w.since || null,
      quiet: false,
      ran_s: w.ran_s,
    }));
  return (b.sessions ?? [])
    .filter((r) => r.state === 'active' && !r.quiet && !r.stale)
    .map((r) => ({
      seq: r.seq,
      agent: said(r.fields.agent) || 'other',
      kind: agentKindOf(said(r.fields.agent)),
      project: null,
      doing: said(r.fields.doing) || null,
      since: null,
      quiet: false,
      ran_s: r.ran_s,
    }));
}

/**
 * WHAT WAITS, AS `boot` SAYS IT, or `null` from a host older than `waits`: a screen then says what it said before, from
 * `counts` and its own reads, rather than a count this tab made up.
 */
export function waitsOf(b: Boot): Waits | null {
  const w = b.waits;
  if (w === null || typeof w !== 'object') return null;
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!whole(w.questions) || !whole(w.late) || !whole(w.hard) || !whole(w.working)) return null;
  return { questions: w.questions, late: w.late, hard: w.hard, inbox: whole(w.inbox) ? w.inbox : null, working: w.working };
}

/**
 * THE POLL'S RE-READ OF `boot`, when the record's version moves: one request, and the answer kept for the tab, so the
 * rail's count, its badge and the next screen's shell are all the record as it is now. A refusal keeps nothing, as
 * `readBoot` keeps none, and the shell already drawn stays.
 */
export function rereadBoot(base: string, io?: Fetch): Promise<Booted> {
  if (keptFor === base) kept = null;
  return readBoot(base, io);
}

/*
 * THE ACCOUNT'S RECORDS, AS THE SWITCHER READS THEM, kept for the tab for the reason `readBoot` is kept: the root load
 * runs on every navigation and the list is the same answer every time. A refusal is dropped rather than kept, because
 * it is about this moment and not about which records exist.
 */
let reach: Promise<Answer<SwitcherRow[]>> | null = null;
let reached: Answer<SwitcherRow[]> | null = null;

/**
 * Ask for the account's records once for the tab, and the answer. NEVER WAITED ON BEFORE THE FIRST PAINT: the
 * rail reads it once it lands, and only a screen that lists the records waits for it.
 */
export function recordsReach(io: Fetch, origin: string, after: Promise<void> | null = null): Promise<Answer<SwitcherRow[]>> {
  /* `after`: SENT ONCE THE FIRST SCREEN HAS DRAWN (`first-drawn.ts`) where nothing on it waits for the list, and asked
     for at once, so the rail reads it where it always did. */
  reach ??= (after ?? Promise.resolve())
    .then(() => import('./switcher.ts'))
    .then((m) => m.readRecordsForSwitcher(io, origin))
    .then((listed) => {
      if (listed.ok) reached = listed;
      else reach = null;
      return listed;
    });
  return reach;
}

/** The account's records once they have answered for this tab, or `null` before then and after a refusal. */
export const recordsReached = (): Answer<SwitcherRow[]> | null => reached;

/** The ask for the account's records when the root load made one, which the rail reads once it lands; else `null`. */
export const recordsAsked = (): Promise<Answer<SwitcherRow[]>> | null => reach;

/** Drop the kept answer, and the refusal beside it, so the next screen asks the record again. */
export function forget(): void {
  forgetShell();
  forgetSchemas();
  forgetRows();
  forgetKept();
  forgetToday();
}
/* SIGN-IN FORGETS THROUGH `forget-read.ts`, which never loads this file: from the moment it has loaded, this is it. */
forgetWith(forget);

/** Drop only the kept answer to `boot` and the last shell copy, so the next screen asks `boot` again. */
export function forgetShell(): void {
  behind = false;
  kept = null;
  refusal = null;
  dropCopy();
}

/**
 * Have the next `readBoot` ask `boot` again BEHIND the kept answer, for a write that changes what `boot` says and
 * nothing a list answers (the reader's mark): that screen draws from the shell it had, and the fresh answer takes the
 * kept one's place when it lands. A refusal drops it, as `readBoot` drops any.
 *
 * DROPPING IT HELD UP THE NEXT SCREEN. The root load runs on every navigation and waits on `readBoot`, so leaving Today
 * (which stamps the mark) left the next screen's heading waiting a whole `boot` round trip. Asked at the next read and
 * not here, so a tab closing as it stamps the mark asks nothing more.
 */
export function refreshShell(base: string): void {
  if (keptFor !== base || kept === null) return forgetShell();
  behind = true;
}

/* `refreshShell` was called: the next `readBoot` hands back the kept answer and asks again behind it. */
let behind = false;

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. The reader's own
   lines are "you", as the sample's are. */
export const actorFor = (actor: string, me: string | null): string =>
  me !== null && actor === me ? 'you' : actor.replace(/^rule:/u, 'rule.');

/* ANOTHER PERSON IN THE FEED BY THE NAME THE RECORD TOLD THIS READER, else as Someone on this record, never as their id. */
const feedActor = (actor: string, me: string | null, names: ReadonlyMap<string, string>): string => {
  if (me !== null && actor === me) return 'you';
  const said = whoDid(actor, me, names);
  return said.person && actor !== 'you' ? said.name : actorFor(actor, me);
};

const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A pack event in the words of the lists it brought.
 *
 * `install` HAS NO REGISTER, NO TITLE AND NO NOTE, so it fell through to the kind itself and Home
 * drew "The record itself / Install" twice on a first run, naming nothing. The lists a pack holds
 * are what a person chose on `/start`, so the line names them: "Added the Services list". A pack
 * this build does not know keeps its id, which is still more than the verb alone.
 */
const PACK_VERB: Record<string, string> = { install: 'Added', uninstall: 'Removed', upgrade: 'Updated', retire: 'Retired' };
function packText(e: EventLine): string | null {
  /* A PACK'S SETTINGS SAVED reached Home as "Edit". A use case's voice is said by `voiceText`, which reads the lines beside it. */
  if (e.kind === 'edit' && e.target_kind === 'pack' && e.target) {
    const id = e.target.replace(/^pack:/u, '');
    return copy.settingsChanged(nameOfPack(id));
  }
  const verb = PACK_VERB[e.kind];
  if (e.target_kind !== 'pack' || !verb || !e.target) return null;
  const id = e.target.replace(/^pack:/u, '');
  /* A USE CASE'S PACK IS NAMED AS THE USE CASE, never by its id: "Added the usecase-student add-on" reached Home, and then
     "Added the Team use case" for Team board. */
  const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
  if (usecase) return copy.useCaseEvent(verb, useCaseName(usecase));
  const names = (listsOfModule(id) ?? []).map((r) => REGISTERS[r]?.name ?? r);
  /* AN ADD-ON FROM THE STORE BRINGS NO LIST THIS BUILD KNOWS: by its id in words, "Added the Reading list add-on",
     never "the reading-list add-on" (audit 6g, AG6). */
  if (names.length === 0) return `${verb} the ${nameOfPack(id) === id ? sentence(id.replace(/[-_]+/gu, ' ')) : nameOfPack(id)} add-on`;
  if (names.length === 1) return `${verb} the ${names[0]} list`;
  return `${verb} ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const nameOfPack = (id: string): string => {
  const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
  return usecase ? useCaseName(usecase) : (moduleNamed(id) ?? id);
};

/** A use case's `speaks` setting saved, alone, as `{ id, from, to }`; `null` for any other line. */
function speaksOf(e: EventLine): { id: string; from: unknown; to: boolean } | null {
  if (e.kind !== 'edit' || e.target_kind !== 'pack' || !e.target?.startsWith('pack:usecase-')) return null;
  const to = typeof e.to === 'object' && e.to !== null && !Array.isArray(e.to) ? (e.to as Record<string, unknown>) : {};
  if (Object.keys(to).length !== 1 || typeof to.speaks !== 'boolean') return null;
  const from = typeof e.from === 'object' && e.from !== null && !Array.isArray(e.from) ? (e.from as Record<string, unknown>).speaks : null;
  return { id: e.target.slice('pack:'.length), from: from ?? null, to: to.speaks };
}

/**
 * THE VOICE WRITTEN DOWN, SAID AS WHAT HAPPENED. Every door that adds a use case beside another writes both answers
 * (`record` `writeVoice`): the one speaking set to speak, the one added set not to. Said line by line, a use case going
 * beside Student put "Student speaks for this BrainDog now" in the feed, which reads as a switch.
 *
 * So the lines one write made are read together, BY THE BATCH THE WRITE GAVE THEM and never by where they sit: two separate
 * writes with nothing logged between them are two changes. A line with no batch (written before there was one) is read alone. The voice MOVED only when a use
 * case that spoke was set not to, one set not to was set to, or the one set to speak is the newest of them to arrive. Then
 * the new speaker's line says "speaks" and the old one's line is not drawn. Otherwise the use case set not to speak reads
 * "Personal added beside Student", and the speaker's line, which changed nothing a person sees, is not drawn.
 *
 * Returns the text for each line of `events` it answers for (`null` to leave a line out), by index.
 */
function voiceTexts(events: readonly EventLine[]): Map<number, string | null> {
  const out = new Map<number, string | null>();
  const installedAt = (id: string, from: number): number => {
    const at = events.findIndex((e, i) => i >= from && e.kind === 'install' && e.target === `pack:${id}`);
    return at === -1 ? Number.POSITIVE_INFINITY : at;
  };
  const read = new Set<number>();
  for (let i = 0; i < events.length; i += 1) {
    if (read.has(i) || !speaksOf(events[i]!)) continue;
    const batch = events[i]!.batch ?? null;
    const group = events.flatMap((e, k) => (k === i || (batch !== null && e.batch === batch && speaksOf(e)) ? [{ at: k, ...speaksOf(e)! }] : []));
    for (const g of group) read.add(g.at);
    const end = Math.max(...group.map((g) => g.at));
    const on = group.filter((g) => g.to);
    const off = group.filter((g) => !g.to);
    /* Newest first, so the smaller index is the later arrival. */
    const newest = [...group].sort((a, b) => installedAt(a.id, end + 1) - installedAt(b.id, end + 1))[0];
    const moved = off.some((g) => g.from === true) || on.some((g) => g.from === false) || (on.length > 0 && off.length > 0 && installedAt(on[0]!.id, end + 1) !== Number.POSITIVE_INFINITY && newest?.id === on[0]!.id);
    if (moved) {
      for (const g of on) out.set(g.at, copy.useCaseSpeaks(nameOfPack(g.id)));
      for (const g of off) out.set(g.at, null);
    } else {
      /* Who speaks: the line set to speak in this write, else the newest older line that did. */
      const said = on[0]?.id ?? events.slice(end + 1).map(speaksOf).find((x) => x?.to === true)?.id ?? null;
      for (const g of on) out.set(g.at, null);
      for (const g of off) out.set(g.at, said ? copy.useCaseAddedBeside(nameOfPack(g.id), nameOfPack(said)) : copy.useCaseBeside(nameOfPack(g.id)));
    }
  }
  return out;
}

/**
 * AN EXPORT'S NOTE IS THE KERNEL'S, not a sentence: "snapshot 2026-09-16T20-14-56Z-now 786432 bytes" and
 * "sections header, data, grants redacted" reached Home word for word. The record's own two shapes, said plainly.
 */
function exportText(e: EventLine): string | null {
  if (e.kind !== 'export' || !e.note) return null;
  if (/^snapshot /u.test(e.note)) return 'Took a copy of your BrainDog';
  if (/^sections all(?:,|$)/u.test(e.note)) return 'Exported all of your BrainDog';
  if (/^sections /u.test(e.note)) return 'Exported part of your BrainDog';
  return null;
}

/**
 * ACCESS GIVEN OR TAKEN AWAY, AS A SENTENCE. The kind is the record's (`access.grant`) and it reached Home as "Access
 * grant": a key made for an agent, a device let in, or a person given a level. What it reaches is in `to`, a key's or a
 * device's label in `note`, and a person's level may be on one list, named in `field`.
 */
const SCOPES: Readonly<Record<string, string>> = { read: 'read', propose: 'read and propose', write: 'read and write' };
function accessText(e: EventLine): string | null {
  if (e.kind !== 'access.grant' && e.kind !== 'access.revoke') return null;
  const given = e.kind === 'access.grant';
  const label = e.note && e.note.trim() !== '' ? `: ${e.note.trim()}` : '';
  const level = typeof (given ? e.to : e.from) === 'string' ? String(given ? e.to : e.from).replaceAll('_', ' ') : null;
  if (e.target_kind === 'token') {
    const can = typeof e.to === 'string' ? SCOPES[e.to] : undefined;
    return given ? `Made a key${can ? ` that can ${can}` : ''}${label}` : `Took back a key${label}`;
  }
  if (e.target_kind === 'device_grant') return given ? `Let a device sign in${label}` : `Signed a device out${label}`;
  /* THE FOUNDING OWNER'S OWN GRANT, written by themselves when the record is made (kernel `provision.ts`). It read "Gave someone
     owner access to this record" on a fresh record's Home, as if a stranger had been let in. */
  if (given && e.target === `person:${e.actor}` && e.field === '*' && e.to === 'owner') return 'Started this BrainDog as its owner';
  const list = e.field && e.field !== '*' ? (REGISTERS[e.field]?.name ?? e.field) : null;
  const on = list ? ` on ${list}` : ' to everything';
  if (given) return level ? `Gave someone ${level} access${on}` : `Gave someone access${on}`;
  return level ? `Took away someone's ${level} access${on}` : `Took away someone's access${on}`;
}

/**
 * A READ-ONLY LINK MADE OR CLOSED, AS A SENTENCE (AH28): the bell said "Share open". The page is the event's `field`, its
 * slug, SAID BY THE PAGE'S OWN TITLE (AM14) as `boot` named it (`PAGES`): Team's Sprints lives at `cycles`, and the bell
 * said "You shared Cycles with a link". A page this tab never heard of is its slug in words.
 */
function shareText(e: EventLine): string | null {
  if (e.kind !== 'share.open' && e.kind !== 'share.close') return null;
  const slug = typeof e.field === 'string' && e.field !== '' ? e.field : '';
  const titled = slug === '' ? '' : (PAGES[slug]?.title ?? '').trim();
  const words = titled !== '' ? titled : slug.replace(/[-_]+/gu, ' ').trim();
  const page = words === '' ? 'a page' : words.charAt(0).toUpperCase() + words.slice(1);
  return e.kind === 'share.open' ? `You shared ${page} with a link` : `You closed the link to ${page}`;
}

/** One line of the log in the words the feed draws. */
function textOf(e: EventLine): string {
  if (e.kind === 'setup') return setupText(e);
  if (e.register !== null) {
    if (e.kind === 'create' && e.title) return `Added ${e.title}`;
    const what = noteOf(e.register, e);
    return e.title ? `${e.title}: ${what}` : sentence(what);
  }
  if (e.kind === 'suggest' && e.title) return `Asked: ${asPartOf(e.title)}`;
  if (e.kind === 'decide' && e.title) return copy.feedDecided(e.title, null);
  if (e.kind === 'declare') {
    const said = declaredOf(e.target, e.note);
    if (said !== null) return said;
  }
  const pack = packText(e) ?? exportText(e) ?? accessText(e) ?? shareText(e);
  if (pack) return pack;
  /* A RULE'S RUN BY THE RULE'S NAME (audit of 30 October, 7): the record notes a run "rule.weekly-review ran." */
  const ran = /^rule\.([a-z0-9][a-z0-9_-]*) ran\.?$/u.exec(e.note ?? '');
  if (ran) return `${titleOf({ id: `rule.${ran[1]!}`, kind: 'rule' })} ran`;
  return sentence(e.note ?? e.kind.replace(/[._]/gu, ' '));
}

/** A record setting itself up is one line (`api.ts` `setupSaid`). */
const setupText = (e: EventLine): string => setupSaid(e.target, typeof e.to === 'number' ? e.to : 0);

/** Where a line goes: the row, the question, or the log for anything that is neither. */
function hrefOf(e: EventLine): string {
  if (e.register !== null && e.seq !== null) return `/r/${e.register}/${e.seq}`;
  const question = /^(?:suggestion:)?(SG\d+)$/u.exec(e.target ?? '');
  if (e.target_kind === 'suggestion' && question) return `/decide/${question[1]}`;
  return '/audit';
}

/**
 * THE REASON A QUESTION WAS ANSWERED IS PART OF ITS DECISION. Accepting writes `decide` and then `resolve` with the reason as
 * its note (`govern.ts`), and the feed drew the reason, "Yes, for the proof.", as a line of its own under "Decided: ...".
 * The `resolve` of the question a decision `settles`, written in the same instant, is folded into that decision's line;
 * any other `resolve` keeps its own.
 *
 * BY `settles`, AND IT WAS `rowid - 1`. A member held to named lists is sent no rowid (the
 * gap between two of hers counted the events she was not shown), so the pairing had nothing to read, and the record
 * now says on the decision which question it settled, from the join the kernel already makes in SQL. The lines are keyed
 * by themselves, since each is one object in one answer and needs no number to be told apart.
 */
function reasonsOf(events: readonly EventLine[]): { byDecision: Map<EventLine, string | null>; folded: Set<EventLine> } {
  const decides = new Map(events.filter((e) => e.kind === 'decide' && e.title && e.settles).map((e) => [`suggestion:${e.settles} ${e.ts}`, e]));
  const out = { byDecision: new Map<EventLine, string | null>(), folded: new Set<EventLine>() };
  for (const e of events) {
    const decision = e.kind === 'resolve' ? decides.get(`${e.target} ${e.ts}`) : undefined;
    if (!decision || out.byDecision.has(decision)) continue;
    out.byDecision.set(decision, e.note && e.note.trim() !== '' ? e.note.trim() : null);
    out.folded.add(e);
  }
  return out;
}

/**
 * BULK WRITES ARE ONE LINE. An import on an open self-host wrote every row and every question as "you", and Home's feed was
 * sixty lines of "You asked". A run of at least `BULK_MIN` row writes and questions by one writer, each within `BULK_GAP_MS`
 * of the one before, is said once with its counts and a link to that writer's day in the log. A person working by hand does
 * not write ten things a few seconds apart, so what they did keeps its own lines.
 */
export const BULK_MIN = 10;
export const BULK_GAP_MS = 5_000;
/** Lines one write made together (one `batch`), such as clearing the examples, are one line from this many. */
export const BULK_BATCH_MIN = 3;
/** `whatsNew` sends at most sixty lines, so a run that reaches the oldest of sixty may go on before them. */
const WHATS_NEW_CAP = 60;
type BulkPart = 'added' | 'changed' | 'asked' | 'removed';
const BULK_KIND: Record<string, BulkPart> = {
  create: 'added',
  edit: 'changed',
  state: 'changed',
  link: 'changed',
  tag: 'changed',
  untag: 'changed',
  note: 'changed',
  restore: 'changed',
  delete: 'removed',
  suggest: 'asked',
  propose: 'asked',
};

/**
 * THE DAY A ROW WAS FINISHED IS PART OF ITS MOVE. A register's `finished:` day is filled or emptied by the record in the same
 * write as the state change (`kernel` `finished.ts`), and Home drew it as a line of its own, "reached on set to 17 Sep 2026",
 * under the move it belongs to. A day written beside a state change of the same row, in the same write, on that write's day
 * (or emptied) is folded into the move. A write's first line carries no batch and the lines after it carry its id, so a
 * move is keyed by its batch or else its own id. A day a person sets on its own keeps its line.
 */
function finishedDays(events: readonly EventLine[]): Set<EventLine> {
  const moves = new Set(events.filter((e) => e.kind === 'state').map((e) => `${e.batch ?? e.id} ${e.target} ${e.actor}`));
  const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v);
  const near = (d: string, ts: string): boolean => Math.abs(Date.parse(d) - Date.parse(ts.slice(0, 10))) <= 86_400_000;
  const out = new Set<EventLine>();
  for (const e of events) {
    if (e.kind !== 'edit' || !e.batch || !moves.has(`${e.batch} ${e.target} ${e.actor}`)) continue;
    const emptied = (e.to === null || e.to === undefined || e.to === '') && day(e.from);
    if (emptied || (day(e.to) && near(e.to, e.ts))) out.add(e);
  }
  return out;
}

/** How long after the record is made its own setting up still counts as the making (`makingOf`). */
export const MAKING_MS = 30 * 60_000;

/** The founding owner's own grant, which the record writes first when it is made (kernel `provision.ts`). */
const isFounding = (e: EventLine): boolean => e.kind === 'access.grant' && e.target === `person:${e.actor}` && e.field === '*' && e.to === 'owner';

/**
 * THE MAKING, SAID ONCE (first-hour audit E5, 31 Oct). A minute-old BrainDog's bell held nine lines of its own setting up:
 * "Started this BrainDog as its owner", "Added the core add-on", "Shop added beside Small business", a twelve-name "Added
 * Bills and invoices, …", "BrainDog updated 2 add-ons", and "Nadia: this is you from no to yes", her own row's `self`
 * read out as a change. They are one thing that happened, "Your BrainDog was made", said at the founding line.
 *
 * WHAT IS THE MAKING: walking up from the founding line, oldest first, every line the record or the build wrote before the
 * person's first own write, inside `MAKING_MS`: add-ons added, updated or set (and a use case's voice), declarations, the
 * record's setup, anything the record itself wrote, and the founder's own People row (the one set to be them). The first
 * line of anything else ends it, so an add-on she adds from the store after her first order keeps its own line. BrainDog's
 * own update pass inside the window is the making's too, wherever it falls.
 *
 * Returns the lines folded into the founding one, or `null` where the founding line is not among `events`.
 */
export function makingOf(events: readonly EventLine[]): { founding: EventLine; folded: Set<EventLine> } | null {
  const at = events.findIndex(isFounding);
  if (at === -1) return null;
  const founding = events[at]!;
  const t0 = Date.parse(founding.ts);
  const within = (e: EventLine): boolean => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= t0 && t - t0 <= MAKING_MS;
  };
  const own = new Set(events.filter((e) => within(e) && e.field === 'self' && e.to === true && e.target !== null).map((e) => e.target!));
  const setup = (e: EventLine): boolean =>
    e.actor === 'system' ||
    e.target_kind === 'pack' ||
    e.kind === 'declare' ||
    e.kind === 'setup' ||
    (e.actor === founding.actor && e.target !== null && own.has(e.target));
  const folded = new Set<EventLine>();
  let mine = false;
  for (let i = at - 1; i >= 0; i--) {
    const e = events[i]!;
    if (!within(e)) break;
    if (e.kind === 'update' && e.pass !== undefined) folded.add(e);
    else if (!mine && setup(e)) folded.add(e);
    else mine = true;
  }
  /* LINES OF THE SAME INSTANT BELOW THE FOUNDING ONE are the making's too, where the log ordered them so. */
  for (let i = at + 1; i < events.length && events[i]!.ts === founding.ts; i++) if (setup(events[i]!)) folded.add(events[i]!);
  return { founding, folded };
}

/** A reason the record wrote for a one-press answer, which is no reason anybody gave. */
const pressed = (reason: string | null): boolean => reason !== null && /^Answered in one press\b/u.test(reason);

/** "Invoice 2026-041: brand system was due 38 days ago, £4,800. Chase it?" is about "Invoice 2026-041: brand system". */
const dueOn = (question: string): string | null => /^(.+?) was due \d+ days? ago\b/u.exec(question.trim())?.[1]?.trim() ?? null;

/**
 * A DECISION BY THE ANSWER CHOSEN, where the line carries it (`answer_label`): "You chose Chase it on Invoice 2026-041",
 * and the reason only when a person wrote one. A line with no label is said as before.
 */
function choseText(e: EventLine, by: string, reason: string | null): string | null {
  const label = typeof e.answer_label === 'string' ? e.answer_label.trim() : '';
  if (e.kind !== 'decide' || !e.title || label === '') return null;
  const who = by === 'you' ? 'You' : by.startsWith('rule.') || by === 'system' ? null : by;
  return copy.feedChose(who, label, dueOn(e.title), e.title, pressed(reason) ? null : reason);
}

/** A script's writes, which its run's own line already counts ("“…” ran and wrote 4 lines"). */
const scriptWrite = (e: EventLine): boolean => /^script:[^@\s]+@v\d+$/u.test(e.actor) && /^Written by script:/u.test(e.note ?? '');

/** A script run's line, as the record writes it, read into its name and the lines it wrote, or `null` for any other. */
function scriptRun(e: EventLine): { named: string; wrote: number } | null {
  const m = /^(.+) ran and wrote (nothing|one line|(\d+) lines)\.$/u.exec((e.note ?? '').trim());
  if (!m) return null;
  return { named: m[1]!, wrote: m[2] === 'nothing' ? 0 : m[2] === 'one line' ? 1 : Number(m[3]) };
}

/**
 * BRAINDOG'S OWN SCRIPTS, ONE LINE A SCRIPT A DAY (audit 6g, AG6, as Activity folds them under AF11). The bell opened on
 * four lines of a setup script, two runs and "Written by script:plans_from_names@v1: made 4 changes in Instalments",
 * above anything the person did. A script's writes are said on its run's line, and its plain runs on one day are its
 * newest line: "“Give each plan a page…” ran 2 times and wrote 5 lines". A run that asked or stopped keeps its line.
 */
function scriptRuns(events: readonly EventLine[]): { folded: Set<EventLine>; said: Map<EventLine, string> } {
  const folded = new Set<EventLine>(events.filter(scriptWrite));
  const said = new Map<EventLine, string>();
  const newest = new Map<string, { line: EventLine; runs: number; wrote: number; named: string }>();
  for (const e of events) {
    const run = scriptRun(e);
    if (run === null) continue;
    const key = `${run.named}\u0001${e.ts.slice(0, 10)}`;
    const had = newest.get(key);
    if (had === undefined) {
      newest.set(key, { line: e, runs: 1, wrote: run.wrote, named: run.named });
      continue;
    }
    had.runs += 1;
    had.wrote += run.wrote;
    folded.add(e);
  }
  /* THE LIST A SCRIPT WROTE IN MOST, by its own write lines, by script and day. */
  const tally = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (!scriptWrite(e) || !e.register) continue;
    const key = `${e.actor}\u0001${e.ts.slice(0, 10)}`;
    const by = tally.get(key) ?? new Map<string, number>();
    by.set(e.register, (by.get(e.register) ?? 0) + 1);
    tally.set(key, by);
  }
  const wroteIn = new Map<string, string>([...tally].map(([key, by]) => [key, listName([...by].sort((a, b) => b[1] - a[1])[0]![0])]));
  /* NO RULE'S NAME IN QUOTES (T21): "“Give each plan a page and count what is left after each part” ran 4 times and
     wrote…" quoted a sentence at him. It is "A rule ran 4 times on Instalments", and the line opens the rule. */
  for (const n of newest.values()) {
    if (n.runs < 2) continue;
    const list = wroteIn.get(`${n.line.actor}\u0001${n.line.ts.slice(0, 10)}`);
    const lines = n.wrote === 0 ? 'nothing' : n.wrote === 1 ? 'one line' : `${n.wrote} lines`;
    said.set(n.line, list ? `A rule ran ${n.runs} times on ${list}` : `A rule ran ${n.runs} times and wrote ${lines}`);
  }
  return { folded, said };
}

/** The record's lines as the feed's items, newest first as they came. */
export function newsOf(events: readonly EventLine[], me: string | null, names: ReadonlyMap<string, string> = new Map()): NewsItem[] {
  const voice = voiceTexts(events);
  const reasons = reasonsOf(events);
  const folded = finishedDays(events);
  const making = makingOf(events);
  const scripts = scriptRuns(events);
  const said = events.flatMap((e, i): { e: EventLine; last: boolean; item: NewsItem }[] => {
    if (folded.has(e) || making?.folded.has(e) || scripts.folded.has(e)) return [];
    if (e === making?.founding) return [{ e, last: false, item: { at: e.ts, by: feedActor(e.actor, me, names), text: copy.feedMade, href: '/audit' } }];
    /* WHAT AN ACCEPTED ARRANGEMENT DID, kept on its decision (`keepApplied`), is the decision's own line and not news. */
    if (e.kind === 'note' && e.target_kind === 'decision') return [];
    /* AN AUTOMATION THAT RAN IS NOT NEWS; WHAT IT CHANGED IS (live check of 30 October, 12): his bell read "Look again for
       what a recent payment paid ran · 59 times" and "Ask whether a category of moves is money that stays yours ran",
       automations' own names for runs that changed nothing. Whatever a run wrote is its own line beside this one. */
    if (/^rule\.[a-z0-9][a-z0-9_-]* ran\.?$/u.test(e.note ?? '')) return [];
    /* A RUN'S OWN ROW MOVING IS THE RUN KEEPING ITS PLACE, NOT NEWS (recheck of 30 October, N6): his bell read
       "attached: compact · 9 times" and "Made 4 changes in Session at once" for an agent picking a run back up. Where a run
       stands (its state) is still said; the Agents page holds the rest. */
    if (e.register === 'session' && e.kind === 'edit' && e.field !== 'state') return [];
    if (reasons.folded.has(e)) return [];
    const reason = reasons.byDecision.get(e);
    const by = feedActor(e.actor, me, names);
    const text = voice.has(i)
      ? voice.get(i)
      : (scripts.said.get(e) ?? choseText(e, by, reason ?? null) ?? (reason !== undefined && e.title ? copy.feedDecided(e.title, pressed(reason) ? null : reason) : textOf(e)));
    const last = i === events.length - 1 && events.length >= WHATS_NEW_CAP;
    /* A QUESTION ASKED IS MARKED, so the bell can leave it to Needs you (`happened` in `shell/alerts.ts`). */
    const asked = e.kind === 'suggest' ? { asked: true as const } : {};
    /* A LINE ABOUT THE READER IS SAID TO THEM (collab pass, 2 Nov): "Sam gave you Draft the home page copy", "Sam
       mentioned you on Draft the home page copy: ...". The record marks it (`you`); the words are here. */
    const you = (e as EventLine & { you?: 'assigned' | 'mentioned' }).you;
    const yours = you === 'assigned' && e.title ? copy.feedGaveYou(by, e.title) : you === 'mentioned' ? copy.feedMentionedYou(by, e.title, e.note ?? '') : null;
    return text == null && yours === null ? [] : [{ e, last, item: { at: e.ts, by, text: yours ?? text!, href: hrefOf(e), ...asked, ...(you ? { you } : {}) } }];
  });

  const out: NewsItem[] = [];
  for (let i = 0; i < said.length; ) {
    let j = i;
    const first = said[i]!;
    if (BULK_KIND[first.e.kind] && !voice.has(events.indexOf(first.e)))
      while (
        j + 1 < said.length &&
        BULK_KIND[said[j + 1]!.e.kind] &&
        said[j + 1]!.e.actor === first.e.actor &&
        Math.abs(Date.parse(said[j]!.e.ts) - Date.parse(said[j + 1]!.e.ts)) <= BULK_GAP_MS
      )
        j++;
    /* ONE WRITE'S LINES, whatever their number: clearing seven examples is one thing somebody did. */
    let k = i;
    const batch = first.e.batch ?? null;
    if (batch !== null && BULK_KIND[first.e.kind])
      while (k + 1 < said.length && said[k + 1]!.e.batch === batch && said[k + 1]!.e.actor === first.e.actor && BULK_KIND[said[k + 1]!.e.kind]) k++;
    const bySize = j + 1 - i >= BULK_MIN;
    if (!bySize && k + 1 - i < BULK_BATCH_MIN) {
      out.push(first.item);
      i++;
      continue;
    }
    if (!bySize) j = k;
    const run = said.slice(i, j + 1);
    const counts = { added: 0, changed: 0, asked: 0, removed: 0 };
    for (const r of run) counts[BULK_KIND[r.e.kind]!]++;
    const on = first.e.ts.slice(0, 10);
    /* THE NOTE THEY ALL CARRY SAYS WHY, "Cleared the examples", and leads the line when there is one. */
    const notes = new Set(run.map((r) => r.e.note?.trim().replace(/\.$/u, '') || null));
    const why = notes.size === 1 ? [...notes][0]! : null;
    out.push({
      at: first.item.at,
      by: first.item.by,
      text: copy.feedBulk(counts, run.some((r) => r.last), why, (() => {
        const lists = new Set(run.map((r) => r.e.register));
        const only = lists.size === 1 ? [...lists][0] : null;
        return only ? listName(only) : null;
      })()),
      href: `/audit?${new URLSearchParams({ by: actorFor(first.e.actor, me), on })}`,
    });
    i = j + 1;
  }
  return out;
}

/**
 * The icon a list declares, as `boot` sends it beside the list, or `undefined` from a host older than the field. Read
 * off the answer and not trusted to the type: anything but a word is no icon, and `iconFor` still turns a word it has
 * no glyph for into the fallback.
 */
export const iconSent = (r: Boot['registers'][number]): string | undefined => {
  const icon = (r as { icon?: unknown }).icon;
  return typeof icon === 'string' && icon.trim() !== '' ? icon.trim() : undefined;
};

/**
 * The hue a page's row is drawn in, as `boot` sends it on `about`, a turn from 0 to 359, or `undefined` from a host
 * older than the field or a row with none.
 */
export const hueSent = (about: object): number | undefined => {
  const hue = (about as { hue?: unknown }).hue;
  return typeof hue === 'number' && Number.isFinite(hue) && hue >= 0 && hue < 360 ? hue : undefined;
};

/**
 * The record's `boot` in the shape the shell draws.
 *
 * WHAT THE RECORD DOES NOT SEND IS EMPTY, NOT SAMPLED. Saved views and the people with access are not in `boot`, so a
 * live shell has none of them rather than the sample's. The holding pen is, and is drawn as the record sent it.
 *
 * THE SWITCHER STARTS AT THE RECORD YOU ARE IN, and the root layout replaces that row with the account's own list. `boot`
 * names this record and no other, so one row is the most this function can honestly claim.
 */
export function layoutOf(b: Boot, implied: Implied | undefined = IMPLIED.get(b)): Shell {
  const record = b.record ?? null;
  const drawn = drawnOf(b);
  /* EVERY CURRENCY THE RECORD'S MONEY IS IN, kept beside the home one (`learnHome` below), so the rates preset quotes
     them all; a shell over a refusal holds none, so the last record's are forgotten. */
  learnMoney(drawn ? (drawn.money ?? implied?.held ?? []) : []);
  /* AND THE RECORD'S ZONE, which every "today" a screen says is counted in (`zone.ts`); a host that sends none leaves the
     reader's own, and a shell over another record forgets the last one's first. */
  forgetZone();
  learnZone(b.zone);
  /* AND THE PAGES A TEMPLATE MADE FOR A ROW, so a `ref:` opens the row's own page where it has one (`row-href.ts`). */
  /* AND THE RUNS' PAGES, WHICH AN OLDER `boot` SENDS BY THEIR ADDRESS ALONE (`rowPages`), and a newer one opens by the
     row (`pagesByRow`). */
  learnRowPages(
    drawn ? [...(b.pages ?? []), ...(b.rowPages ?? []).flatMap((l) => l.rows.map(([seq, slug]) => ({ slug, about: { register: l.register, seq } })))] : [],
    drawn ? (b.pagesByRow ?? []) : [],
  );
  const waits = waitsOf(b);
  const person = b.me?.person ?? null;
  const level = b.me?.level ?? 'read';
  /* A PERSON WITH NO RECORD LEVEL WHOM THE RECORD STILL ANSWERED holds exactly the lists `boot` sent. A token
     with no level is not a colleague, and is left to the fallback as before. */
  const held = b.me?.kind === 'person' && b.me.level === null && person !== null ? b.registers.map((r) => r.id) : null;
  const theirs = new Set(held ?? []);
  /* A SAVED VIEW IS A PAGE UNDER VIEWS OVER ONE LIST, and the rail draws it under that list, as the sample draws its own. */
  const views = new Map<string, { key: string; name: string; href: string }[]>();
  for (const p of b.pages ?? [])
    if (p.nav?.section === copy.viewsSection && p.list) views.set(p.list, [...(views.get(p.list) ?? []), { key: p.slug, name: p.title, href: `/p/${p.slug}` }]);
  /**
   * THE RAIL IS CAPPED PER LIST AND HEADING HERE TOO, and until now it was capped only in the sample.
   *
   * A declaration carrying `for:` is one page per row and every one of them carrying `nav` was a
   * rail entry, so the rail grew with the record. Measured end to end through the record's own
   * `boot` at his size, 27 projects, 23 services and 22 skills: 72 rail entries against 15 with
   * the cap. The sample's `boot()` in `api.ts` had this rule already and the sample is four
   * projects forever, so it was true where it changed nothing and absent from the rail
   * app.brain.dog draws.
   *
   * IT STILL DOES NOTHING UNTIL `boot` SENDS `about`. `packages/record/src/index.ts` maps the
   * kernel's page list key by key into the answer, and the key it does not copy is the one this
   * rule reads: measured on that same record, 72 of 72 rail pages arrived with no `about` at all.
   * A host older than the field sends none either, and the shell then draws the rail it drew
   * before rather than guessing which entries grew out of a list.
   *
   * `railRoom` IS THE SAMPLE'S OWN RULE AND NOT A SECOND COPY OF IT. It is in `@braindog/kernel`
   * because that is the one package both rails can read; `pages.ts` there carries the argument,
   * the numbers behind it and why the budget is keyed on the pair rather than on the register.
   */
  /* THE FIVE KEPT ARE THE ROWS TOUCHED LAST, DRAWN IN THE RECORD'S ORDER. A template's pages come in a stable order, the
     order the rows were written in, so that a strip of tabs does not move when a row is edited. The first five of that
     are the five oldest, where before they were the five edited last. So the cap is spent in order of `about.updated_at`,
     newest first, and the pages it keeps are then drawn where the record put them. A host that sends no time spends
     it in the record's order, which is the rail it drew before. */
  /* A PAGE OVER A LIST WITH NOTHING IN IT STAYS OFF THE RAIL UNTIL THE LIST'S FIRST ROW. A module installs its
     pages with its lists, so a record that took a few modules had a rail of pages that each said "nothing here yet".
     `list` is the one list a page draws, sent only when the caller reads it, and its count is `registers`' own. A saved
     view is somebody's own page and stays, as its list does above, and so does a colleague's own list, for the same
     reason `registers` keeps it at zero rows below.

     A PAGE THAT READS SEVERAL LISTS ARRIVES WITH NO `list` (Services reads its numbers and the open questions too), so
     it is judged by the list its section is named as, which is the reading the first-screen check (rail-has-rows)
     makes. A page in a section no list is named as is never judged.

     AND A PAGE THAT SAYS EVERY LIST IT READS (`lists`) IS JUDGED BY THOSE AND BY NOTHING ELSE. The section's name was a
     guess: Work reads tasks and milestones and no list is called Work, so it sat in a fresh rail with nothing in it.
     It waits while every one of its lists is empty, and comes with the first row in any. A list this caller was sent
     no count for is not held against the page, since nothing says it is empty. A page that says it reads none is never
     judged, and a host that sends no `lists` reads as before.

     AND `lists: null` IS A PAGE THAT READS LISTS, EVERY ONE OF THEM A STARTER SET NOBODY HAS TOUCHED. The record leaves
     such a list out of `lists`, so the page arrived saying `[]`, which is "reads none" and is never judged: an add-on's
     page sat in a fresh rail over nothing of the person's. It waits until the first row of their own, when the record
     says the list by name again. Its count is not read here, since what it counts was planted. A colleague's own list
     keeps the page, as above. */
  const rows = new Map(b.registers.map((r) => [r.id, r.count]));
  const named = new Map(b.registers.map((r) => [r.name.trim().toLowerCase(), r.id]));
  /* AND A PAGE THAT NAMES ITS PLACE ON THE RAIL (`nav.place`) NEVER WAITS. On day one
     every list is empty, so every place a person asked for (Money, Projects, Agents) waited, and their first Today drew
     Today, Needs you and People and nothing they had named. A place opens on its first entry; only a side page waits. */
  const waiting = (p: NonNullable<Boot['pages']>[number]) => {
    if (!p.nav || p.nav.section === copy.viewsSection) return false;
    if (typeof p.nav.place === 'number') return false;
    const said: readonly unknown[] | null | undefined = p.lists;
    if (said === null) return !(typeof p.list === 'string' && theirs.has(p.list));
    if (Array.isArray(said)) {
      return said.length > 0 && said.every((l) => typeof l === 'string' && !theirs.has(l) && rows.get(l) === 0);
    }
    const list = typeof p.list === 'string' ? p.list : named.get(p.nav.section.trim().toLowerCase());
    return list !== undefined && !theirs.has(list) && rows.get(list) === 0;
  };
  /* A TABBED SECTION'S PAGES ARE NEVER CUT BY THE BUDGET. A launch desk with more parts than `RAIL_PAGES` lost the
     rest from its strip, because the cap ran before `nav` existed. They are kept apart instead: the rail still spends
     its budget, and a page past it is carried with `cut`, which the strip draws and the rail leaves out. */
  const tabbed = new Set((b.pages ?? []).flatMap((p) => (p.nav && (p.nav as { tabs?: unknown }).tabs === true ? [p.nav.section] : [])));
  const room = railRoom();
  const newest = [...(b.pages ?? [])].sort((x, y) => (y.about?.updated_at ?? '').localeCompare(x.about?.updated_at ?? ''));
  const kept = new Set(newest.filter((p) => p.nav && !waiting(p) && room(p.about ? { register: p.about.register, section: p.nav.section } : null)));
  /* AND WHETHER ITS SECTION IS DRAWN AS TABS (`$lib/page/tabs.ts`). This entry named its five keys and so dropped every
     other one `boot` sent: with `tabs: true` on the page, `tabsOf` over this list answered no strip on every page of the
     section (`tabs.test.ts`, five of its cases). Only `true` is carried, and a page that did not say it carries no key. */
  /* A PAGE THAT WAITS IS STILL CARRIED, CUT AND MARKED (audit 31 Oct f, AF7): Splits and Weather, installed from the
     store over lists of their own with nothing in them yet, had no row anywhere and no crumb, and the store's Open was
     the only way back. The rail still leaves it out (`cut`); the sidebar draws it under its place's More, or under More
     lists where its section is no place (`waits` on the entry), and the palette finds it. A page about one row still waits unseen. */
  const heldBack = (p: NonNullable<Boot['pages']>[number]): boolean => !!p.nav && p.nav.section !== copy.viewsSection && !p.about && waiting(p);
  const nav: ShellBase['nav'] = (b.pages ?? []).flatMap((p) =>
    p.nav && ((!waiting(p) && (kept.has(p) || tabbed.has(p.nav.section))) || heldBack(p))
      ? [
          {
            id: p.slug,
            title: p.title,
            href: `/p/${p.slug}`,
            section: p.nav.section,
            order: p.nav.order,
            ...(typeof p.nav.place === 'number' ? { place: p.nav.place } : {}),
            /* AND THE LISTS A PLACE READS, so an invitation can offer Money or Projects whole (`invite-places.ts`). */
            ...(typeof p.nav.place === 'number' && Array.isArray(p.lists) ? { lists: p.lists.filter((l): l is string => typeof l === 'string') } : {}),
            icon: iconFor(p.icon ?? undefined, 'doc'),
            ...((p.nav as { tabs?: unknown }).tabs === true ? { tabs: true as const } : {}),
            ...(kept.has(p) ? {} : { cut: true as const }),
            ...(heldBack(p) ? { waits: true as const } : {}),
            /* A PAGE ONE ROW MADE, which the flat nav leaves to its list's own page (`flatNav`). */
            ...(p.about ? { row: true as const, register: p.about.register } : {}),
            /* AND IT DRAWS AS THAT THING'S OWN COLOURED DOT in the rail, so each project is told from its neighbours:
               the hue `boot` sends with the row (`about.hue`), else the row's frozen hue where this tab holds the row,
               else the hue its name is always drawn in (`hueFor`), which is the colour Today gives the same project. */
            ...(p.about ? { hue: hueSent(p.about) ?? (p.about.seq === null ? undefined : hueOf({ register: p.about.register, seq: p.about.seq })) ?? hueFor(p.title) } : {}),
          },
        ]
      : [],
  );
  return {
    index: {
      slug: record?.slug ?? '',
      name: record?.name ?? '',
      locale: record?.locale ?? 'en',
      /* THE CURRENCY A PERSON CHOSE, KEPT WHERE EVERY FIGURE ASKS FOR IT (`learnHome`), and never counted from the rows
         this tab holds. Where nobody chose, the setting an older host did not send, else the record's money when it is
         all one currency (`readImplied`). A record with no name says it beside `record` (`drawnOf`); a `boot` that
         says neither has none, so its shell says none and forgets the last record's. */
      currency: learnHome(drawn?.currency ?? null, drawn ? implied?.setting : null, drawn ? (implied?.held ?? []) : []),
      /* THE LISTS THAT HOLD SOMETHING, the sample's rule, each with the icon it declares: the one `boot` sends with the
         list (`iconSent`), else the declaration this tab already holds. `REGISTERS` alone is empty at boot, so every
         list in the rail wore the same `rows` glyph until a screen had read its schema.
         A LIST WITH A SAVED VIEW STAYS EVEN AT ZERO ROWS: the rail nests a view under its list and drops it from
         Views by matching against these, so dropping the list here strands the view under the generic heading.
         AND A COLLEAGUE'S OWN LIST STAYS AT ZERO ROWS: a list made for somebody is empty on the day they are sent
         the link, and "the lists that hold something" is a rule about an owner's rail. Dropped, it left the
         bookkeeper with a rail of nothing and the list reachable only by typing `/r/expenses`. */
      registers: b.registers
        .filter((r) => r.count > 0 || views.has(r.id) || theirs.has(r.id))
        .map((r) => ({ id: r.id, name: r.name, count: r.count, ...(typeof r.open === 'number' ? { open: r.open } : {}), icon: iconFor(iconSent(r) ?? REGISTERS[r.id]?.icon, 'rows'), views: views.get(r.id) ?? [] })),
    },
    /* A LIST THE KERNEL DECLARES SAYS SO, so Arrivals leaves the runs and his instructions out by declaration. */
    /* AND THE ADD-ON THAT DECLARED IT, so the tell box tells Money's Plans from a list of his own called Plans (RI4). */
    lists: b.registers.map((r) => ({ id: r.id, name: r.name, ...(r.kernel === true ? { kernel: true as const } : {}), ...(typeof r.pack === 'string' ? { pack: r.pack } : {}) })),
    pages: (b.pages ?? []).map((p) => p.slug),
    names: { ...b.names },
    nav,
    /* THE RECORD'S OWN OFFERS, strongest first as it sent them. The browser's own two kinds, the navigation shape and
       the icons, are made on the settings screen that draws them, from what only that screen reads. */
    pen: penOf(b.pen),
    me: {
      person: person ?? '',
      level,
      owner: level === 'owner',
      records: record ? [{ slug: record.slug, name: record.name, level }] : [],
      lists: held,
      ...(typeof b.me?.name === 'string' && b.me.name.trim() !== '' ? { name: b.me.name.trim() } : {}),
      ...((levels) => (levels === null ? {} : { levels }))(levelsFrom((b.me as Record<string, unknown> | undefined)?.levels)),
      ...(b.me?.prefs ? { prefs: b.me.prefs as Prefs } : {}),
      ...grantFrom(b.me),
    },
    people: [],
    /* THE FIRST SCREEN'S QUESTIONS, capped as `boot` caps them. Their options and cost are one `governance` read away. */
    questions: (b.waiting ?? []).map((w, i) => ({ id: w.id, title: w.question || w.id, cost: '', rank: i + 1, opened: w.opened_at, options: [] })),
    whatsNew: newsOf(b.whatsNew?.events ?? [], person, new Map(Object.entries(b.names ?? {}))),
    newsLines: b.whatsNew?.events ?? [],
    sinceCapped: b.whatsNew?.sinceCapped ?? false,
    /* THE NEWEST LINE THIS CALLER MAY SEE, which is as near the record's version as `boot` says. A member held to named
       lists is sent a cursor and no number, and 0 is what "names no event" already means. */
    version: typeof b.whatsNew?.upTo === 'number' ? b.whatsNew.upTo : 0,
    assistant: false,
    inbox: waits?.inbox ?? b.counts?.inbox ?? 0,
    /* THE BADGE IS `waits`' COUNT, the number Today's header and Decide's sentence say; `counts` from an older host. */
    open: waits?.questions ?? b.counts?.decide ?? (b.waiting ?? []).length,
    ...(b.counts ? { counts: b.counts } : {}),
    waits,
    lateDays: typeof b.lateDays === 'number' && Number.isSafeInteger(b.lateDays) && b.lateDays > 0 ? b.lateDays : null,
    working: workingOf(b),
    now: Number.isFinite(Date.parse(b.now)) ? Date.parse(b.now) : Date.now(),
    live: true,
    upTo: b.whatsNew?.upTo ?? null,
    /* ONLY THE TWO WORDS THE RECORD SENDS, as `signsIn` reads only `false`: anything else is a host that did not say. */
    ...(b.host === 'cloud' || b.host === 'self-host' ? { host: b.host } : {}),
    ...(b.host === 'self-host' && b.image === true ? { image: true as const } : {}),
  };
}

/**
 * The shell over a record that refused `boot`: nothing in the rail, and the record's own sentence
 * for the screen to say.
 *
 * THE COMMENT HERE READ "the screen says why" AND THE SCREEN SAID THE RECORD WAS EMPTY, which is a
 * sentence nobody had run the code to check. `said` is the refusal, and the last one this module
 * read when the caller has none to hand.
 */
/**
 * Whether a refused `boot` is the one a person signed in and on no record gets.
 *
 * THE WORKER'S DOOR ANSWERS IT 403 `FORBIDDEN` IN ONE SENTENCE (`doorOf`, `apps/worker/src/session.ts`), and the same
 * code is every other refusal a record gives a person, so the sentence is what tells them apart. `/start` draws "Make a
 * record of your own" on it instead of an empty shell that says nothing is here.
 */
export const NO_RECORD_FIX = 'You are signed in and on no record yet.';

export const onNoRecord = (said: { code: string; fix: string } | null | undefined): boolean =>
  said !== null && said !== undefined && said.code === 'FORBIDDEN' && said.fix === NO_RECORD_FIX;

/**
 * `me.grant` and `me.lens` as the shell keeps them, or nothing: the access epoch and the last share's end, and the
 * fingerprint of what shares narrow (sharing plan slice 10). A host older than either sends neither.
 */
export function grantFrom(me: unknown): Pick<Shell['me'], 'grant' | 'lens'> {
  if (typeof me !== 'object' || me === null) return {};
  const m = me as { grant?: unknown; lens?: unknown };
  const g = typeof m.grant === 'object' && m.grant !== null ? (m.grant as { epoch?: unknown; until?: unknown }) : null;
  return {
    ...(g && typeof g.epoch === 'number' ? { grant: { epoch: g.epoch, until: typeof g.until === 'string' ? g.until : null } } : {}),
    ...(typeof m.lens === 'string' && m.lens !== '' ? { lens: m.lens } : {}),
  };
}

export const refusedShell = (said: Said | null = refusal): Shell => ({
  ...layoutOf({ registers: [], now: new Date().toISOString(), home: null }),
  ...(said ? { refused: said } : {}),
});

/** The rail the local copy can draw (`railOf` in `lib/data/local.ts`), names only. */
export type CopyRail = {
  lists: { id: string; name: string; icon: string | null; count: number | null }[];
  pages: { slug: string; title: string; icon: string | null; section: string | null; order: number }[];
};

/**
 * AN OFFLINE OPEN WITH NO SHELL COPY draws the rail from what the local copy holds, so it is not an empty frame: its
 * lists by name, a count only where one was kept (`guessed` hides the tally otherwise), and its pages where their nav
 * put them. Only the rail is filled; the shell stays the refusal it is, marked offline, and writes nothing.
 */
export function railShell(shell: Shell, rail: CopyRail): Shell {
  const registers = rail.lists.map((l) => ({
    id: l.id,
    name: l.name,
    count: l.count ?? 1,
    icon: iconFor(l.icon ?? REGISTERS[l.id]?.icon, 'rows'),
    views: [],
    ...(l.count === null ? { guessed: true as const } : {}),
  }));
  const nav = rail.pages.flatMap((p) =>
    p.section === null ? [] : [{ id: p.slug, title: p.title, href: `/p/${p.slug}`, section: p.section, order: p.order, icon: iconFor(p.icon ?? undefined, 'doc') }],
  );
  return {
    ...shell,
    index: { ...shell.index, registers },
    lists: rail.lists.map((l) => ({ id: l.id, name: l.name })),
    pages: rail.pages.map((p) => p.slug),
    nav,
  };
}
