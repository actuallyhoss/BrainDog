/**
 * WHAT A `pack`, `settings` OR `arrange` PROPOSAL WOULD DO TO THIS BRAINDOG, AND WHAT IT DID, read from the body the
 * record filed (`packages/record/src/arrange.ts`, `prepare` and `apply`).
 *
 * THE STORY, IN THE ORDER A PERSON ASKS IT (the sitting of REC-A07). Why, first, because a proposal to rearrange
 * somebody's record is judged by its reasons; then what it needs from them, the keys, because those are the one thing
 * the record cannot do for itself; then what it changes, before and after; then what it adds; then what it starts, each
 * feed by host and how often, because that reaches outside the record and costs egress; then the choices it leaves to
 * them; then any other call out, the packs it installs or turns off, what will appear, the words that change ("Home will
 * be called “Today”") and any other setting. `arrange` is all of these as one question, so it is drawn as one story and
 * not as several proposals stacked.
 *
 * THE RECORD'S READING, NEVER THE PROPOSER'S. Everything drawn here is a key `prepare` worked out: the plan, the
 * calls out, the settings as they stood. Nothing a proposer typed about consequences reaches the screen but `why`.
 *
 * NOTHING HERE ASSUMES A KIND OF RECORD. A pack is named by its id when the body gives no title, a list by the record's
 * own name for it when the screen has one, and every sentence is `copy.ts`'s.
 */
import type { createClient } from '@braindog/client';
import { arrangePartsOf, doesOf } from '@braindog/kernel';
import { moduleName, ruleName } from '@braindog/seed/usecases/names';

import { copy } from '../../../lib/copy.ts';
import { labelsOf, VOICE_LINES, type VoiceKey } from '../../../lib/voice.ts';
import { appearsOf, type Appears } from './proposed.ts';

type Row = Record<string, unknown>;

/* Which questions arrange the record: `arranging.ts`'s, where a page's queue asks it without this file. */
import { ARRANGING, isArranging } from './arranging.ts';
import { publishAskOf, publishAskWords } from '../../../lib/market/publish-asked.ts';
export { ARRANGING, isArranging };

/**
 * One call out a press approves: the host it reaches, and how often and what it sends, in plain words. `every` is the
 * cadence alone, empty for a call only a rule makes; `keys` the labels of the keys it opens, said under what the sitting
 * needs and never in the call's own line; `to` the one host a key is sent to, where the line names one (a script's
 * `key "<a>" to <host>`), since a script's own host may be several.
 */
export type Call = { host: string; detail: string; every: string; keys: string[]; to: Record<string, string> };

/**
 * A key the arrangement needs: its label, what it opens, whether a run with nobody signed in uses it, and whether the
 * record holds it. `held` is `null` when the screen could not read the keys, so nothing is said either way; `person` is a
 * key of that name a scheduled run cannot open (`kernel` `actions.ts`, a key deposited for a person is refused).
 */
export type Need = { label: string; opens: string; scheduled: boolean; held: 'connector' | 'person' | 'none' | null };

/** One existing entry an arrangement changes, field by field: what it says now (`null` when the record sent no before) and after. */
export type Change = { title: string; fields: { field: string; before: string | null; after: string }[] };

/** A part of the arrangement that is a choice between options, each with its name and one line of what it does. */
export type Choice = { question: string; options: { name: string; line: string; suggested: boolean }[] };

export type Part =
  | { part: 'why'; lines: { text: string; at?: string }[] }
  | { part: 'needs'; keys: Need[] }
  | { part: 'changes'; lists: { name: string; changes: Change[] }[]; count: number }
  | { part: 'starts'; feeds: Call[] }
  | { part: 'choices'; choices: Choice[] }
  /* `sends` IS WHAT LEAVES, one sentence a call: the key by its label, the host and how often, as the kernel says it. */
  | { part: 'calls'; calls: Call[]; sends?: string[] }
  | { part: 'packs'; lines: string[] }
  | { part: 'appears'; appears: Appears[]; examples: number }
  | { part: 'words'; lines: string[] }
  | { part: 'rows'; lists: { name: string; lines: string[] }[]; count: number }
  | { part: 'settings'; lines: string[] }
  | { part: 'stops'; lines: string[] };

/**
 * One part of an arrangement an accept may take or leave, by the id the record filed on it and the
 * kernel's `partsOf` gives: `name` is the record's own label for it ("Add Stripe"), `requires` the parts it cannot be
 * taken without, worked out as the kernel works them out so a tick here is never refused there, and `keys` the labels
 * of the keys it needs that the record does not hold for a scheduled run.
 */
export type Take = { id: string; name: string; requires: string[]; keys: string[] };

/**
 * A door or pattern an update takes away while it still files messages: `part` is the part that takes it away,
 * so Accept asks twice only when that part is taken. `unless` is the part that installs the add-on taking it over, when
 * one does: such a door is said as a move, and asks twice only when its add-on is left unticked and the update is not.
 */
export type Stop = { part: string; name: string; unless?: string };

/**
 * `takes` only on an arrangement with parts, and `stops` only when a live door goes, with the add-on taking it if one
 * does: both are left out otherwise, so a story without them reads as it always did.
 */
/** `said` is the whole change as one sentence, for the question's own page; `summary` the queue's counts. */
export type Arranged = { lead: string; parts: Part[]; summary: string; said?: string; takes?: Take[]; stops?: Stop[] };

/**
 * What the screen knows that the body does not: the record's name for each list, the labels it gives them now (the rail's
 * words), and a changed page as it stands. `names` is the body's own, filed by the record, and read in `arrangedOf`.
 */
export type Context = {
  lists?: ReadonlyMap<string, string> | undefined;
  labels?: Readonly<Record<string, string>> | undefined;
  pagesNow?: Readonly<Record<string, Row>> | undefined;
  names?: Readonly<Record<string, string>> | undefined;
  /** The keys the record holds, by label, from `listGrants` (`heldOf`). Left out, the screen says nothing about holding. */
  held?: ReadonlyMap<string, 'connector' | 'person'> | undefined;
};

/** What the question's own page hands `Arranged.svelte` by context so a needed key gets a field: the client, and a re-read. */
export type KeysContext = { readonly client: Pick<ReturnType<typeof createClient>, 'putKey'> | undefined; onheld: () => unknown };
export const KEYS_CONTEXT = Symbol('arranged-keys');

/**
 * What the question's own page hands `Arranged.svelte` by context so each part gets a tick: the parts
 * unticked by hand, and a press on one. Left out, as on the queue, the parts are not drawn and Accept takes the whole.
 */
export type TicksContext = { readonly unticked: ReadonlySet<string>; tick: (id: string, on: boolean) => void };
export const TICKS_CONTEXT = Symbol('arranged-ticks');

/**
 * The keys the record holds by label, from `listGrants`: a live grant sealed for a connector, or one only a person opens.
 * A label held both ways is held for a connector, since that is the one a scheduled run opens. Never a value: a grant
 * row carries none.
 */
export function heldOf(grants: unknown): Map<string, 'connector' | 'person'> {
  const out = new Map<string, 'connector' | 'person'>();
  for (const g of Array.isArray(grants) ? grants.filter(isRow) : []) {
    const label = text(g.label);
    if (label === '' || (g.revoked_at !== null && g.revoked_at !== undefined)) continue;
    if (g.sealed_under === 'connector') out.set(label, 'connector');
    else if (!out.has(label)) out.set(label, 'person');
  }
  return out;
}

/** The names the record filed for a proposal's lists and pages, as the rail will say them once it is accepted. */
const namesOf = (body: Row): Record<string, string> =>
  isRow(body.names) ? Object.fromEntries(Object.entries(body.names).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')) : {};

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
const words = (id: string): string => copy.valueWord(id.replace(/^[a-z]+\./u, '').replace(/^usecase-/u, '').replace(/[_-]+/gu, ' '));

/** The packs a body's plan updates over the version on now, by id, with the version each goes from and to. */
export function updatesOf(body: Row): Map<string, { from: string; to: string }> {
  const out = new Map<string, { from: string; to: string }>();
  for (const step of Array.isArray(body.plan) ? body.plan.filter(isRow) : []) {
    if (text(step.pack) && text(step.from) && text(step.version)) out.set(text(step.pack), { from: text(step.from), to: text(step.version) });
  }
  return out;
}

/**
 * A pack by the name a person knows it by: the body's title for the one it installs, else a first-party module's or a use
 * case's name ("Money", never "Money core" from `money-core`), else its id in words.
 */
export function packName(id: string, body: Row): string {
  /* A MODULE'S CATALOGUE TITLE IS ITS ID (`money-core`), which is not a name: "Updates Money-core" reached Decide. */
  if (id === text(body.install) && text(body.title) !== '' && text(body.title) !== id) return copy.valueWord(text(body.title));
  return moduleName(id);
}

/** A use case named by its id, bare or as its pack: "Student". */
const useCaseWords = (id: string): string => moduleName(id.startsWith('usecase-') ? id : `usecase-${id}`);

/** A list as the rail says it: the name the record filed for it, else the label it has now, else its name, else its id in words. */
const listName = (id: string, ctx: Context): string => {
  const bare = id.replace(/^register\./u, '');
  return ctx.names?.[`register.${bare}`] ?? ctx.labels?.[bare] ?? ctx.lists?.get(bare) ?? words(bare);
};

/**
 * `CALLS OUT api.example · every 1h · grant "Label" · sends a, b` as a host, its cadence and the rest in words, and the
 * keys it opens apart. A line that is not one of those (a key's own line) is kept whole, because it is already a sentence.
 *
 * THE KEY IS NOT SAID IN THE LINE. The sitting says each key once, under what it needs from you, with a field to put it
 * in; said again in every call it read "with the key “Stripe”" three times above a page that never let you add it.
 * The three spellings the kernel prints are read: `grant "<label>"` (an action, a digest), `key "<a>" to <host>, ...`
 * and `no key` (a script).
 */
export function callOf(line: string): Call {
  /* THE HOST MAY BE SEVERAL WORDS: "no host declared", or a script's "a.example and b.example". */
  const m = /^CALLS OUT (.+?) · (.*)$/u.exec(line);
  if (!m) return { host: '', detail: line, every: '', keys: [], to: {} };
  const keys: string[] = [];
  const to: Record<string, string> = {};
  let every = '';
  const rest = m[2]!.split(' · ').flatMap((part): string[] => {
    const grant = /^grant "(.*)"$/u.exec(part);
    if (grant) {
      if (grant[1] !== 'none' && grant[1] !== '') keys.push(grant[1]!);
      return [];
    }
    if (part === 'no key') return [];
    if (part.startsWith('key "')) {
      /* A HOST IS A NAME WITH A DOT; "the host its Keychain entry opens" and "no host it calls" are not one. */
      for (const k of part.matchAll(/"([^"]+)" to (\S+)/gu)) {
        keys.push(k[1]!);
        const host = k[2]!.replace(/,$/u, '');
        if (/^[\w-]+(\.[\w-]+)+(:\d+)?$/u.test(host)) to[k[1]!] ??= host;
      }
      return [];
    }
    if (part.startsWith('sends ')) return [copy.arrangeCallSends(part.slice('sends '.length))];
    /* A CADENCE IS SAID IN WORDS, "every hour" and never the record's `every 1h`. A call with one is a feed: it runs by
       itself, with nobody signed in. One only a rule makes ("when a rule runs it") is not. */
    if (/^(every \d+[mhdw]|daily|weekly)\b/u.test(part)) {
      every = part.replace(/^every (\d+)([mhdw])\b/u, (_, n: string, unit: string) => copy.arrangeCallEvery(Number.parseInt(n, 10), unit as 'm' | 'h' | 'd' | 'w'));
      return [every];
    }
    return [part];
  });
  return { host: m[1] === 'no host declared' ? copy.arrangeCallNoHost : m[1]!, detail: rest.join(', '), every, keys: [...new Set(keys)], to };
}

/** The first key of a pack document's declaration is its kind: `{ "page": "work", ... }`. */
function declared(doc: unknown): Map<string, { id: string; kind: string; body: Row }> {
  const out = new Map<string, { id: string; kind: string; body: Row }>();
  if (!isRow(doc) || !Array.isArray(doc.declarations)) return out;
  /* A USE CASE'S WORDS ARE ITS SETTINGS, and a block reads one as `{{config:voice_needs_you}}`, which reached Decide as
     written. Each is said as the setting's default, the line the use case ships, and one with none says nothing. */
  const config = isRow(doc.config) ? doc.config : {};
  const filled = (v: unknown): unknown => {
    if (typeof v === 'string')
      return v.replace(/\{\{config:([a-z0-9_]+)\}\}/gu, (_, key: string) => {
        const decl = config[key];
        return isRow(decl) && typeof decl.default === 'string' ? decl.default : '';
      });
    if (Array.isArray(v)) return v.map(filled);
    return isRow(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, filled(x)])) : v;
  };
  for (const d of (doc.declarations.filter(isRow).map(filled) as Row[])) {
    const kind = Object.keys(d)[0] ?? '';
    const id = `${kind}.${text(d[kind])}`;
    out.set(id, { id, kind, body: d });
  }
  return out;
}

const newKind = (kind: string): string => copy.arrangeNew(copy.proposalKind(kind));

/**
 * What a step lays on or keeps on one list, `domain` or `role.family` as the record files them, sorted into the fields and
 * each field's choices, every one said as the screen says it: the label the record gives it now, else its own word.
 */
function byField(list: string, ids: readonly string[], ctx: Context): { fields: string[]; values: Map<string, string[]> } {
  const out = { fields: [] as string[], values: new Map<string, string[]>() };
  for (const id of ids) {
    const [field = '', value] = id.split('.');
    const called = ctx.labels?.[`${list}.${field}`] ?? copy.valueWord(field);
    if (value === undefined) out.fields.push(called);
    else out.values.set(called, [...(out.values.get(called) ?? []), ctx.labels?.[`${list}.${field}.${value}`] ?? copy.valueWord(value)]);
  }
  return out;
}

/**
 * What each planned pack adds and changes, as what will appear.
 *
 * A PAGE OR A LIST WITH SOMETHING TO SAY IS DRAWN ON ITS OWN, where the body carries the pack's document and so where it
 * lands in the sidebar and what it shows. EVERYTHING ELSE IS NAMED, one line per kind: Money alone adds twenty measures,
 * and twenty bold titles would bury the page a person will actually open.
 */
function planned(
  plan: unknown,
  doc: unknown,
  ctx: Context,
  name: (id: string) => string,
): { appears: Appears[]; examples: number; pages: number; lists: number; more: number; stops: Stop[] } {
  const known = declared(doc);
  const drawn: Appears[] = [];
  const named = new Map<string, string[]>();
  const changed = new Map<string, string[]>();
  const retired = new Map<string, string[]>();
  const extended: Appears[] = [];
  const moving: Appears[] = [];
  const kept: Appears[] = [];
  const out = { examples: 0, pages: 0, lists: 0, more: 0 };
  const stops: Stop[] = [];
  for (const step of Array.isArray(plan) ? plan.filter(isRow) : []) {
    out.examples += typeof step.examples === 'number' ? step.examples : 0;
    /* WHAT AN UPDATE TAKES AWAY is named on its own, with the rows a list keeps: they stay, and nothing reads them. */
    for (const gone of Array.isArray(step.retires) ? step.retires.filter(isRow) : []) {
      const id = text(gone.id);
      const kind = id.split('.')[0] ?? '';
      const title = kind === 'register' ? listName(id, ctx) : (ctx.names?.[id] ?? (kind === 'rule' ? ruleName(id) : null) ?? words(id));
      /* BUT ONE HANDED TO ANOTHER PACK IS NOT TAKEN AWAY: it stays live under that pack's name, which the record filed
         beside `to` from its catalogue, until the owner installs that pack or turns it off. */
      if (text(gone.to) !== '') {
        moving.push({ kind: copy.arrangeMoving, title: copy.arrangeMovesTo(title, text(gone.to_name) || moduleName(text(gone.to))), lines: [] });
        continue;
      }
      /* A DOOR OR PATTERN THAT STILL FILES MESSAGES (`live`, which the record marks for one that took an
         arrival in thirty days or holds a live address). An add-on in the catalogue that declares it is added to the
         same question as a second step (`taken_by`), and is named here; with none, messages to it stop being filed, which
         is said on its own and asked twice. */
      if (gone.live === true) {
        const taker = takerOf(gone);
        if (taker !== null) moving.push({ kind: copy.arrangeMoving, title: copy.arrangeTakenBy(title, taker.name), lines: [] });
        stops.push({ part: `install:${text(step.pack)}`, name: title, ...(taker?.pack ? { unless: `install:${taker.pack}` } : {}) });
        continue;
      }
      const rows = typeof gone.rows === 'number' && gone.rows > 0 ? copy.arrangeRetiredRows(title, gone.rows) : title;
      const label = copy.arrangeMany(kind);
      retired.set(label, [...(retired.get(label) ?? []), rows]);
    }
    /* WHAT AN UPDATE LEAVES AS THE OWNER CHANGED IT, by the name the record filed for it, which is the owner's. */
    /* AND WHAT A KEPT PAGE GOES WITHOUT, IN THE RECORD'S OWN SENTENCE (`brings_line`, one for the whole update): said
       once, in place of each such page's "is not taken", so the Late table an update was written for is named. */
    const brought = new Set((Array.isArray(step.brings) ? step.brings.filter(isRow) : []).map((b) => text(b.id)));
    const broughtLine = text(step.brings_line);
    let broughtSaid = false;
    for (const id of strings(step.keeps)) {
      const kind = id.split('.')[0] ?? '';
      const title = kind === 'register' ? listName(id, ctx) : (ctx.names?.[id] ?? words(id));
      if (kind === 'page' && broughtLine !== '' && brought.has(id)) {
        if (!broughtSaid) kept.push({ kind: copy.arrangeKept, title: copy.arrangeKeepsPageBrings(broughtLine), lines: [] });
        broughtSaid = true;
        continue;
      }
      kept.push({ kind: copy.arrangeKept, title: kind === 'page' ? copy.arrangeKeepsPage(title) : copy.arrangeKeeps(title), lines: [] });
    }
    /* WHAT A PACK LAYS ON A LIST ANOTHER PACK OWNS, one sentence for its fields and one for each field it adds choices to.
       Personal's step named its own lists and pages, and the five roles it lays on People were nowhere on the screen. */
    for (const laid of Array.isArray(step.extends) ? step.extends.filter(isRow) : []) {
      const bare = text(laid.id).replace(/^register\./u, '');
      const { fields, values } = byField(bare, strings(laid.adds), ctx);
      if (fields.length === 0 && values.size === 0) continue;
      const list = listName(bare, ctx);
      const pack = name(text(step.pack));
      if (fields.length) extended.push({ kind: copy.arrangeExtended, title: copy.arrangeExtendsFields(pack, list, fields), lines: [] });
      for (const [field, choices] of values) extended.push({ kind: copy.arrangeExtended, title: copy.arrangeExtendsValues(pack, choices, field, list), lines: [] });
      out.more++;
    }
    /* AND A CHOICE AN UPDATE TAKES OFF A LIST WHOSE ROWS HOLD IT, which stays. Without it the People update that sheds
       `registrar` read "Changes: People", the line an update that did take the choice away would get. */
    for (const stay of Array.isArray(step.stays) ? step.stays.filter(isRow) : []) {
      const bare = text(stay.id).replace(/^register\./u, '');
      const rows = typeof stay.rows === 'number' ? stay.rows : 0;
      const holding = isRow(stay.holding) ? stay.holding : null;
      const binned = isRow(stay.binned) ? stay.binned : {};
      const ids = strings(stay.values);
      const sum = (counts: Record<string, unknown>, of: readonly string[]) => of.reduce((n, id) => n + (typeof counts[id] === 'number' ? counts[id] : 0), 0);
      /* ONE SENTENCE PER FIELD, AND ITS HOLDERS SUMMED OVER ITS CHOICES: an `enum` row holds one choice, so the sum is the
         rows. A `list<enum>` row holding two of them is counted twice, so the sum is held to the list's rows; it can still
         overstate the holders of a `list<enum>`, which only a count per row of the set could say exactly. A step filed
         before the record counted holders carries no `holding`, and its sentence says the list's rows as it did.
         `holding` COUNTS THE BIN, `binned` SAYS HOW MUCH OF IT IS, and `rows` is live rows alone, so the live holders are
         the difference and only they are held to `rows`. Held to `rows` whole, a People whose one registrar row was
         deleted said "all 0 of its rows hold it". */
      for (const own of new Set(ids.map((id) => id.split('.')[0] ?? ''))) {
        const mine = ids.filter((id) => id.split('.')[0] === own);
        const gone = holding === null ? 0 : sum(binned, mine);
        const held = holding === null ? null : Math.min(rows, Math.max(0, sum(holding, mine) - gone));
        for (const [field, choices] of byField(bare, mine, ctx).values)
          kept.push({ kind: copy.arrangeKept, title: copy.arrangeStays(listName(bare, ctx), field, choices, rows, held, gone), lines: [] });
      }
    }
    for (const [ids, fresh] of [
      [strings(step.adds), true],
      [strings(step.changes), false],
    ] as const) {
      for (const id of ids) {
        const kind = id.split('.')[0] ?? '';
        const full = known.get(id);
        const seen = full ? appearsOf(full) : null;
        const title = kind === 'register' ? listName(id, ctx) : (ctx.names?.[id] ?? seen?.title ?? (kind === 'rule' ? ruleName(id) : null) ?? words(id));
        if (fresh && kind === 'page') out.pages++;
        else if (fresh && kind === 'register') out.lists++;
        else out.more++;
        if (seen && seen.lines.length > 0 && (kind === 'page' || kind === 'register')) {
          /* WHAT A PAGE READS FROM IS NAMED AS THE RAIL NAMES THOSE LISTS, not by their declared words. */
          const reads = kind === 'page' && full && Array.isArray(full.body.requires) ? strings(full.body.requires).filter((r) => r.startsWith('register.')).map((r) => listName(r, ctx)) : [];
          if (reads.length) seen.lines = seen.lines.map((l) => (l.label === copy.proposalReads ? { ...l, value: reads.join(', ') } : l));
          drawn.push({ ...seen, kind: fresh ? newKind(kind) : copy.arrangeChanged(copy.proposalKind(kind)), title });
          continue;
        }
        /* WHAT IS ADDED AND WHAT IS CHANGED ARE TWO GROUPS, each drawn only when it holds something: an update that only
           changes drew an Adds heading over nothing it added. */
        const group = fresh ? named : changed;
        const label = copy.arrangeMany(kind);
        group.set(label, [...(group.get(label) ?? []), title]);
      }
    }
  }
  const first = (label: string) => [copy.arrangeMany('page'), copy.arrangeMany('register')].indexOf(label) >>> 0;
  const weight = (a: Appears) => (a.kind.toLowerCase().endsWith(copy.proposalKind('page').toLowerCase()) ? 0 : 1);
  const appears = drawn.map((a, i) => [a, i] as const).sort(([a, i], [b, j]) => weight(a) - weight(b) || i - j).map(([a]) => a);
  const lines = (group: Map<string, string[]>) => [...group].sort(([a], [b]) => first(a) - first(b)).map(([label, names]) => ({ label, value: names.join(', ') }));
  if (named.size) appears.push({ kind: appears.length ? copy.arrangeAlso : copy.arrangeAdds, title: '', lines: lines(named) });
  if (changed.size) appears.push({ kind: copy.arrangeChanges, title: '', lines: lines(changed) });
  appears.push(...extended);
  if (retired.size) appears.push({ kind: copy.arrangeRetires, title: '', lines: lines(retired) });
  appears.push(...moving, ...kept);
  return { appears, ...out, stops };
}

/**
 * The add-on that takes over a live door an update takes away, by name: `taken_by` as the record files it, an add-on's
 * id beside the name it filed (`taken_by_name`, as `to` has `to_name`), or the two together. Null when none does.
 */
function takerOf(gone: Row): { name: string; pack: string } | null {
  const by = gone.taken_by;
  if (isRow(by)) {
    const pack = text(by.pack) || text(by.id);
    const name = text(by.name) || text(by.title) || (pack ? moduleName(pack) : '');
    return name ? { name, pack } : null;
  }
  return text(by) !== '' ? { name: text(gone.taken_by_name) || moduleName(text(by)), pack: text(by) } : null;
}

/** A page an arrangement puts in place: new, or a change to one there now, with what it shows now beside what it will. */
function pageOf(raw: Row, ctx: Context): Appears | null {
  const drawn = appearsOf({ id: raw.id, kind: 'page', body: raw.body });
  if (!drawn) return null;
  const fresh = raw.was === null || raw.was === undefined;
  const now = ctx.pagesNow?.[text(raw.id)];
  const shows = copy.proposalShows;
  const before = now ? appearsOf({ id: raw.id, kind: 'page', body: now })?.lines.find((l) => l.label === shows)?.value : undefined;
  const lines = drawn.lines.map((l) => (l.label === shows && !fresh ? { label: copy.arrangeWillShow, value: l.value } : l));
  if (before !== undefined) lines.splice(lines.findIndex((l) => l.label === copy.arrangeWillShow), 0, { label: copy.arrangeShowsNow, value: before });
  return { ...drawn, kind: fresh ? newKind('page') : copy.arrangeChanged(copy.proposalKind('page')), lines };
}

const quoted = (v: unknown): string => (v === null || v === undefined ? copy.arrangeDefault : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * One settings change as sentences: each voice line, each label, and each other setting.
 *
 * WHAT IT IS CALLED NOW is the setting's value before, when the pack is on; a pack this same proposal installs is not on
 * yet, so the screen still says the house word, and that is the word the sentence starts from.
 */
function settingsLines(s: Row, installing: readonly string[], ctx: Context, body: Row): { words: string[]; other: string[] } {
  const values = isRow(s.values) ? s.values : {};
  const before = isRow(s.before) && !installing.includes(text(s.pack)) ? s.before : {};
  const out = { words: [] as string[], other: [] as string[] };
  for (const [key, value] of Object.entries(values)) {
    const was = text(before[key]);
    if (key.startsWith('voice_')) {
      const voice = key.slice('voice_'.length) as VoiceKey;
      const house = VOICE_LINES[voice];
      if (house === undefined) continue;
      const now = was || house;
      /* THE WORD IT ALREADY READS IS NO CHANGE: a use case that says Today over a screen called Today read "Today will be
         called “Today”", and counted it among the words that change. */
      if (value !== null && text(value) === now) continue;
      const nav = voice === 'home' || voice === 'decide' || voice === 'inbox' || voice === 'lists';
      if (value === null) out.words.push(copy.arrangeBackToHouse(now, house));
      else out.words.push(nav ? copy.arrangeCalled(now, text(value)) : copy.arrangeReads(now, text(value)));
      continue;
    }
    /* A LONG LABEL IS `lk_<hash>`, read back through the title the record filed with it, never said as its hash. */
    const hashed = /^lk_[0-9a-f]{8}$/u.test(key);
    const title = hashed && isRow(s.titles) ? text(s.titles[key]) : '';
    const labelKey = key.startsWith('label_') ? key.slice('label_'.length).split('__').join('.') : title ? (Object.keys(labelsOf({ [key]: 'x' }, { [key]: { label: title } }))[0] ?? '') : '';
    if (hashed && !labelKey.match(/^[a-z0-9_.]+$/u)) {
      const named = title ? words(title.replace(/^Label: /u, '')) : copy.arrangeLongLabel;
      out.other.push(copy.arrangeSettingTo(packName(text(s.pack), body), named, quoted(value), key in before ? quoted(before[key]) : null));
      continue;
    }
    if (labelKey) {
      const [list = '', field, one] = labelKey.split('.');
      const called = value === null ? copy.arrangeDefault : text(value);
      if (field === undefined) out.words.push(copy.arrangeListCalled(was || listName(list, ctx), called));
      else if (one === undefined) out.words.push(copy.arrangeFieldCalled(listName(list, ctx), was || copy.valueWord(field), called));
      else out.words.push(copy.arrangeValueCalled(listName(list, ctx), was || copy.valueWord(one), called));
      continue;
    }
    out.other.push(copy.arrangeSettingTo(packName(text(s.pack), body), copy.valueWord(key), quoted(value), key in before ? quoted(before[key]) : null));
  }
  return out;
}

/**
 * THE KEYS IT NEEDS, from `needs` when the record worked them out, else from each call out's own keys, one line
 * a label. A key the record lists is used by a scheduled run unless it says otherwise; a call's key always is, since a
 * call runs with nobody signed in.
 */
function needsOf(body: Row, calls: readonly Call[], ctx: Context): Need[] {
  const out = new Map<string, Need>();
  const held = (label: string): Need['held'] => (ctx.held === undefined ? null : (ctx.held.get(label) ?? 'none'));
  if (Array.isArray(body.needs)) {
    for (const n of body.needs) {
      const label = isRow(n) ? text(n.label) || text(n.key) : text(n);
      if (label === '' || out.has(label)) continue;
      out.set(label, { label, opens: isRow(n) ? text(n.opens) : '', scheduled: !isRow(n) || n.scheduled !== false, held: held(label) });
    }
    return [...out.values()];
  }
  for (const c of calls)
    for (const label of c.keys) {
      /* WHAT IT OPENS IS ONE HOST OR NOTHING: a script's "a.example and b.example" is not what the key opens, and the
         field then asks for it (`KeyNeeded.svelte`) rather than guessing one the run would refuse. */
      const opens = c.to[label] ?? (c.host === copy.arrangeCallNoHost || /\s/u.test(c.host) ? '' : c.host);
      if (!out.has(label)) out.set(label, { label, opens, scheduled: true, held: held(label) });
    }
  return [...out.values()];
}

/** A row patch (`at`, `version`, `patch`), as REC-A06 files one, apart from a row the plan adds. */
const isPatch = (r: Row): boolean => text(r.at) !== '' || isRow(r.patch);

/** The title among a row's own fields, and nothing else: a patch of `last4` has no title, and "7731" is not one. */
const titleIn = (fields: unknown): string => {
  if (!isRow(fields)) return '';
  for (const key of ['what', 'question', 'name', 'title']) if (text(fields[key])) return text(fields[key]);
  return '';
};

/**
 * WHAT IT CHANGES, list by list: each entry by its title, and each field as it is now and as it will be. A field the
 * patch leaves as it was is not said. Before is `null` when the record sent no `before`, and the screen then says only
 * what it will be. An entry is never named by its address.
 */
function changesOf(raw: unknown, ctx: Context): Extract<Part, { part: 'changes' }> | null {
  const patches = (Array.isArray(raw) ? raw.filter(isRow) : []).filter(isPatch);
  if (patches.length === 0) return null;
  const lists: { register: string; name: string; changes: Change[] }[] = [];
  for (const r of patches) {
    /* THE LIST FROM AN ADDRESS ONLY WHEN IT IS ONE (`accounts#2`): a bare row id is not a list, and never reaches the page. */
    const register = (text(r.register) || (text(r.at).includes('#') ? text(r.at).split('#')[0]! : '')).replace(/^register\./u, '');
    const name = listName(register, ctx);
    const patch = isRow(r.patch) ? r.patch : isRow(r.fields) ? r.fields : {};
    const before = isRow(r.before) ? r.before : isRow(r.was) ? r.was : null;
    const said = (field: string, v: unknown): string => {
      if (v === null || v === undefined || v === '') return copy.arrangeEmpty;
      if (typeof v === 'boolean') return v ? copy.arrangeYes : copy.arrangeNo;
      if (Array.isArray(v)) return v.map((x) => said(field, x)).join(', ');
      if (typeof v === 'string') return ctx.labels?.[`${register}.${field}.${v}`] ?? v;
      return typeof v === 'number' ? v.toLocaleString('en') : copy.arrangeNewValue;
    };
    const fields = Object.entries(patch)
      .filter(([field, v]) => before === null || JSON.stringify(before[field] ?? null) !== JSON.stringify(v ?? null))
      .map(([field, v]) => ({
        field: ctx.labels?.[`${register}.${field}`] ?? copy.valueWord(field),
        before: before === null ? null : said(field, before[field]),
        after: said(field, v),
      }));
    if (fields.length === 0) continue;
    const title = titleIn(before) || text(r.title) || titleIn(patch) || (name ? copy.arrangeChangeOne(name) : copy.arrangeChangeAny);
    const list = lists.find((l) => l.register === register) ?? (lists.push({ register, name, changes: [] }), lists[lists.length - 1]!);
    list.changes.push({ title, fields });
  }
  const count = lists.reduce((n, l) => n + l.changes.length, 0);
  return count === 0 ? null : { part: 'changes', lists: lists.map(({ name, changes }) => ({ name, changes })), count };
}

/**
 * THE CHOICES IT LEAVES TO YOU: a part (`parts`, or `choices`) with two options or more. Each option by its name and one
 * line of what it does, the suggested one marked. An option with no name is not drawn, since its id is not one.
 */
function choicesOf(body: Row): Choice[] {
  const raw = [...(Array.isArray(body.parts) ? body.parts : []), ...(Array.isArray(body.choices) ? body.choices : [])].filter(isRow);
  const out: Choice[] = [];
  for (const p of raw) {
    const options = (Array.isArray(p.options) ? p.options : [])
      .map((o) =>
        isRow(o)
          ? { name: text(o.label) || text(o.title) || text(o.name), line: text(o.does) || text(o.line) || text(o.description), suggested: o.suggested === true || (text(o.id) !== '' && text(o.id) === text(p.suggested)) }
          : { name: text(o), line: '', suggested: text(o) !== '' && text(o) === text(p.suggested) },
      )
      .filter((o) => o.name !== '');
    const question = text(p.question) || text(p.title) || text(p.label);
    if (question !== '' && options.length >= 2) out.push({ question, options });
  }
  return out;
}

/** A key a scheduled run cannot open yet: not held, or held only for a person. Unknown says nothing either way. */
const waiting = (n: Need): boolean => n.held === 'none' || (n.held === 'person' && n.scheduled);

/**
 * THE PARTS AN ACCEPT MAY TAKE, from the kernel's own reading of the body (`arrangePartsOf`), so what goes together here
 * is what the kernel refuses to split; each named by the label the record filed, else the kernel's own name for it. A part
 * the record says needs a key the record cannot open for a scheduled run (`needs[].parts`) carries that key's label.
 */
function takesOf(body: Row, needs: readonly Need[]): Take[] {
  /* ONLY ON A BODY THE RECORD FILED ITS PARTS ON. One filed before parts existed is taken whole, as it
     was asked, and draws no ticks. */
  if (!Array.isArray(body.parts) || body.parts.length === 0) return [];
  const labels = new Map(body.parts.filter(isRow).map((p) => [text(p.id), text(p.label)] as const));
  const keys = new Map<string, string[]>();
  for (const n of Array.isArray(body.needs) ? body.needs.filter(isRow) : []) {
    const need = needs.find((k) => k.label === (text(n.label) || text(n.key)));
    if (!need || !waiting(need)) continue;
    for (const part of strings(n.parts)) keys.set(part, [...new Set([...(keys.get(part) ?? []), need.label])]);
  }
  return arrangePartsOf(body).map((p) => ({
    id: p.id,
    name: labels.get(p.id) || `${p.name.charAt(0).toUpperCase()}${p.name.slice(1)}`,
    requires: [...p.needs],
    keys: keys.get(p.id) ?? [],
  }));
}

/**
 * WHAT ACCEPT TAKES NOW, from the parts and the ones unticked by hand: a part whose key is not held is off and says
 * which key, and a part that needs one that is off is off with it and says which, until nothing more moves. `parts` is
 * what Accept sends: `undefined` when every part is taken, which is an accept as it always was, and the ids taken
 * otherwise, an empty list when none is.
 */
export function ticksOf(takes: readonly Take[], unticked: ReadonlySet<string> = new Set()): { off: Map<string, string>; parts: string[] | undefined } {
  const off = new Map<string, string>();
  for (const t of takes) if (t.keys.length) off.set(t.id, copy.arrangeTakeWaitsKey(t.keys));
  for (const t of takes) if (unticked.has(t.id) && !off.has(t.id)) off.set(t.id, '');
  for (let moved = true; moved; ) {
    moved = false;
    for (const t of takes) {
      const on = off.has(t.id) ? undefined : t.requires.find((r) => off.has(r));
      if (on === undefined) continue;
      off.set(t.id, copy.arrangeTakeWaitsFor(takes.find((x) => x.id === on)?.name ?? on));
      moved = true;
    }
  }
  return { off, parts: off.size === 0 ? undefined : takes.filter((t) => !off.has(t.id)).map((t) => t.id) };
}

/**
 * The live doors this accept stops filing: one goes by a part it takes, and the add-on that would take it over, if any,
 * is left. A whole accept takes every part, and a part the question does not offer goes with the whole.
 */
export function stopping(arranged: Arranged | null, parts: readonly string[] | undefined): Stop[] {
  const taken = (id: string) => parts === undefined || parts.includes(id) || !(arranged?.takes ?? []).some((t) => t.id === id);
  return (arranged?.stops ?? []).filter((s) => taken(s.part) && (s.unless === undefined || !taken(s.unless)));
}

/** Whether Accept asks twice: this accept stops a live door being filed (`stopping`). */
export const asksTwice = (arranged: Arranged | null, parts: readonly string[] | undefined): boolean => stopping(arranged, parts).length > 0;

/**
 * What an arrangement sends out, one sentence a call, and the hosts those sentences name.
 *
 * THE KERNEL'S OWN SENTENCE, `doesOf('install', body)`, read a call at a time so the sheet can list them: "Sends your
 * key 'stripe' to api.stripe.com every hour." It is the line the queue's card says, so the two cannot drift. A call
 * that is as it was says nothing, and neither does a body that files no `calls_out`.
 */
function sendsOf(body: Row, ctx: Context): { lines: string[]; hosts: Set<string> } {
  const lines: string[] = [];
  const hosts = new Set<string>();
  const names = { list: (id: string) => ctx.names?.[`register.${id}`] ?? ctx.lists?.get(id) ?? null };
  for (const call of Array.isArray(body.calls_out) ? body.calls_out : []) {
    const line = doesOf('install', { calls_out: [call] }, names);
    if (line === '') continue;
    if (isRow(call) && text(call.host)) hosts.add(text(call.host));
    if (!lines.includes(line)) lines.push(line);
  }
  return { lines, hosts };
}

/**
 * A `pack`, `settings` or `arrange` body as the story Decide draws, or `null` for every other kind.
 */
export function arrangedOf(kind: string, body: Row, screen: Context = {}): Arranged | null {
  if (!isArranging(kind)) return null;
  /* A PUBLISH CHANGES NOTHING HERE: it says what goes, and that the store reviews it (`publish-asked.ts`). */
  const publishing = publishAskOf(kind, body);
  if (publishing !== null) {
    const lead = publishAskWords.lead(publishing.title, publishing.version);
    return { lead, parts: [{ part: 'packs', lines: [publishAskWords.goes, publishAskWords.review] }], summary: '', said: copy.arrangeSaid(lead, []) };
  }
  const ctx: Context = { ...screen, names: namesOf(body) };
  const parts: Part[] = [];
  const packs = isRow(body.packs) ? body.packs : {};
  const install = strings(packs.install);
  const enable = kind === 'pack' && text(body.enable) ? [text(body.enable)] : strings(packs.enable);
  const disable = kind === 'pack' && text(body.disable) ? [text(body.disable)] : strings(packs.disable);
  const name = (id: string) => packName(id, body);

  const why = (Array.isArray(body.why) ? body.why : [])
    .map((w) => (isRow(w) ? { text: text(w.text), ...(text(w.at) ? { at: text(w.at) } : {}) } : { text: text(w) }))
    .filter((w) => w.text !== '');
  if (why.length) parts.push({ part: 'why', lines: why });

  /* THE SITTING, IN THE BRIEF'S ORDER after why: what it needs from you, what it changes and adds, what it starts, your
     choices. Then any call out that is not a feed, and the rest of the story as it always read. */
  const allCalls = strings(body.approve).map(callOf);
  const needs = needsOf(body, allCalls, ctx);
  if (needs.length) parts.push({ part: 'needs', keys: needs });
  /* WHAT STOPS BEING FILED leads what it changes: it is the one thing accepting loses that nothing else will say. */
  const plan = planned(body.plan, body.doc, ctx, name);
  const stops = plan.stops.filter((s) => s.unless === undefined);
  if (stops.length) parts.push({ part: 'stops', lines: stops.map((s) => copy.arrangeStopsFiling(s.name)) });
  const changes = kind === 'arrange' ? changesOf(body.rows, ctx) : null;
  if (changes) parts.push(changes);
  const rows = kind === 'arrange' ? rowsOf(body.rows, ctx) : null;
  if (rows) parts.push(rows);
  const feeds = allCalls.filter((c) => c.every !== '');
  if (feeds.length) parts.push({ part: 'starts', feeds });
  const choices = choicesOf(body);
  if (choices.length) parts.push({ part: 'choices', choices });
  /* WHAT LEAVES WITH EACH CALL, from the `calls_out` the record files beside `approve`. A call's own line never says its
     key, so an add-on that sends one out had no sentence of it here. A call a sentence says is not drawn again. */
  const sent = sendsOf(body, ctx);
  const calls = allCalls.filter((c) => c.every === '' && !sent.hosts.has(c.host));
  if (calls.length || sent.lines.length) parts.push({ part: 'calls', calls, ...(sent.lines.length ? { sends: sent.lines } : {}) });

  const packLines: string[] = [];
  /* AN UPDATE IS SAID AS ONE, with the versions, and never as an install. */
  const updates = updatesOf(body);
  const fresh = install.filter((id) => !updates.has(id));
  /* AN UPDATE OF A MODULE UNDER A USE CASE ALREADY AT ITS VERSION leads as that update, never as setting the use case up. */
  const updating = kind === 'pack' ? (updates.has(text(body.install)) ? text(body.install) : fresh.length === 0 ? [...updates.keys()][0] : undefined) : undefined;
  const update = updating === undefined ? undefined : updates.get(updating);
  /* A PACK THAT INSTALLS ONE THING IS SAID BY ITS LEAD, Adds Work, and is not said twice. */
  const saidByLead = install.length === 1 && (kind === 'pack' || install[0] === `usecase-${text(body.usecase)}`);
  if (fresh.length > 0 && !saidByLead) packLines.push(copy.arrangeInstalls(fresh.map(name)));
  for (const [id, u] of updates) if (install.includes(id) && !(saidByLead && kind === 'pack')) packLines.push(copy.arrangeUpdates(name(id), u.from, u.to));
  const beside = strings(body.alongside);
  if (beside.length && kind === 'arrange') packLines.push(copy.arrangeBeside(beside.map(useCaseWords)));
  if (kind === 'pack' && text(body.keeps)) packLines.push(copy.arrangeKeepsVoice(useCaseWords(text(body.keeps))));
  if (enable.length && kind !== 'pack') packLines.push(copy.arrangeTurnsOn(enable.map(name)));
  if (disable.length && kind !== 'pack') packLines.push(copy.arrangeTurnsOff(disable.map(name)));
  const registers = strings(body.registers).map((r) => listName(r, ctx));
  if (registers.length && kind === 'pack') packLines.push(text(body.disable) ? copy.arrangeListsLeave(registers) : copy.arrangeListsReturn(registers));
  if (packLines.length) parts.push({ part: 'packs', lines: packLines });

  const pages = (Array.isArray(body.pages) ? body.pages.filter(isRow) : []).map((p) => pageOf(p, ctx)).filter((a): a is Appears => a !== null);
  const appears = [...pages, ...plan.appears].map((a, i) => (i > 0 && a.kind === copy.arrangeAdds ? { ...a, kind: copy.arrangeAlso } : a));
  if (appears.length || plan.examples) parts.push({ part: 'appears', appears, examples: plan.examples });

  const settings = kind === 'settings' ? [body] : Array.isArray(body.settings) ? body.settings.filter(isRow) : [];
  const said = settings.map((s) => settingsLines(s, install, ctx, body));
  const wordLines = said.flatMap((s) => s.words);
  const otherLines = said.flatMap((s) => s.other);
  if (wordLines.length) parts.push({ part: 'words', lines: wordLines });
  if (otherLines.length) parts.push({ part: 'settings', lines: otherLines });

  const useCase = text(body.usecase) || (kind === 'pack' && body.kind === 'usecase' ? text(body.title) : '');
  const lead =
    kind === 'settings'
      ? copy.arrangeLeadSettings(name(text(body.pack)))
      : kind === 'pack'
        ? text(body.install)
          ? update
            ? copy.arrangeLeadUpdate(name(updating ?? ''), update.from, update.to)
            : useCase
              ? copy.arrangeLeadUseCase(copy.valueWord(useCase))
              : copy.arrangeLeadInstall(name(text(body.install)))
          : enable.length
            ? copy.arrangeLeadEnable(name(enable[0]!))
            : copy.arrangeLeadDisable(name(disable[0] ?? ''))
        : useCase
          ? copy.arrangeLeadUseCase(useCaseWords(useCase))
          : copy.arrangeLeadArrange;

  /* ONE LINE FOR THE QUEUE, in the sitting's order: the keys, the updates and the feeds, then what is added, what appears
     and what is renamed, counted. A call out that is not a feed is never folded into it. */
  const newPages = plan.pages + pages.filter((p) => p.kind === newKind('page')).length;
  const more = plan.more + pages.length - pages.filter((p) => p.kind === newKind('page')).length;
  const bits = [
    needs.length ? copy.arrangeCountKeys(needs.length) : '',
    changes ? copy.arrangeCountUpdates(changes.count) : '',
    feeds.length ? copy.arrangeCountFeeds(feeds.length) : '',
    rows ? copy.arrangeCountRows(rows.count) : '',
    newPages ? copy.arrangeCountPages(newPages) : '',
    plan.lists ? copy.arrangeCountLists(plan.lists) : '',
    more ? copy.arrangeCountOther(more) : '',
    wordLines.length ? copy.arrangeCountWords(wordLines.length) : '',
    otherLines.length ? copy.arrangeCountSettings(otherLines.length) : '',
  ].filter((b) => b !== '');
  const takes = kind === 'arrange' ? takesOf(body, needs) : [];
  return { lead, parts, summary: bits.join(', '), said: copy.arrangeSaid(lead, bits), ...(takes.length ? { takes } : {}), ...(plan.stops.length ? { stops: plan.stops } : {}) };
}

/** A row's title as a plan carries it: the first line of text among its fields. */
const rowTitle = (fields: Row): string => {
  for (const key of ['what', 'question', 'name', 'title']) if (text(fields[key])) return text(fields[key]);
  return Object.values(fields).map(text).find((v) => v !== '') ?? '';
};

/**
 * THE ROWS A PLAN ADDS (`record` `arrange.ts` `rowsOf`), list by list in the order they are written, each said with the title
 * of the earlier row it points at. `null` when the body carries none.
 */
function rowsOf(raw: unknown, ctx: Context): Extract<Part, { part: 'rows' }> | null {
  /* A PATCH IS SAID UNDER WHAT IT CHANGES (`changesOf`), so only a row the plan adds is said here. A link is the index
     into the whole plan, patches and all, so the plan is read whole and the patches skipped. */
  const rows = Array.isArray(raw) ? raw.filter(isRow) : [];
  if (rows.every(isPatch)) return null;
  const lists: { register: string; name: string; lines: string[] }[] = [];
  for (const r of rows) {
    if (isPatch(r)) continue;
    const register = text(r.register);
    const fields = isRow(r.fields) ? r.fields : {};
    const under = Object.values(isRow(r.links) ? r.links : {})
      .map((to) => (typeof to === 'number' && isRow(rows[to]) && isRow(rows[to]!.fields) ? rowTitle(rows[to]!.fields as Row) : ''))
      .find((t) => t !== '');
    const line = under ? copy.arrangeRowUnder(rowTitle(fields), under) : rowTitle(fields);
    const list = lists.find((l) => l.register === register) ?? (lists.push({ register, name: listName(register, ctx), lines: [] }), lists[lists.length - 1]!);
    list.lines.push(line);
  }
  return { part: 'rows', lists: lists.map(({ name, lines }) => ({ name, lines })), count: rows.filter((r) => !isPatch(r)).length };
}

/** A page an arrangement puts in place, by the title its body gives, or its id in words. */
const pageTitle = (id: string, body: Row): string => {
  const raw = (Array.isArray(body.pages) ? body.pages.filter(isRow) : []).find((p) => p.id === id);
  return text(isRow(raw?.body) ? raw.body.title : undefined) || namesOf(body)[id] || words(id);
};

/* ── what an accepted one did ───────────────────────────────────────────── */

/** `applied` as `decide` answers it: what was installed, turned on and off, and which pages and settings were set. */
export type Applied = { installed?: string[]; enabled?: string[]; disabled?: string[]; pages?: string[]; settings?: string[]; rows?: string[]; said?: string[] };

/** What was applied, as sentences, with what is new in the sidebar when the screen could tell. */
export function appliedLines(applied: Applied, body: Row, sidebar: readonly string[] = []): string[] {
  const name = (id: string) => packName(id, body);
  const out: string[] = [];
  const updates = updatesOf(body);
  const installed = (applied.installed ?? []).filter((id) => !updates.has(id));
  const updated = (applied.installed ?? []).filter((id) => updates.has(id));
  if (installed.length) out.push(copy.arrangeDidInstall(installed.map(name)));
  for (const id of updated) out.push(copy.arrangeDidUpdate(name(id), updates.get(id)!.from, updates.get(id)!.to));
  /* WHAT AN UPDATE CARRIED INTO A PAGE OR LIST HE CHANGED, in the record's own sentences (`rewordSaid`, RJ6). */
  for (const line of applied.said ?? []) if (typeof line === 'string' && line.trim() !== '') out.push(line);
  if (applied.enabled?.length) out.push(copy.arrangeDidEnable(applied.enabled.map(name)));
  if (applied.disabled?.length) out.push(copy.arrangeDidDisable(applied.disabled.map(name)));
  if (applied.pages?.length) out.push(copy.arrangeDidPages(applied.pages.map((id) => pageTitle(id, body))));
  if (applied.settings?.length) out.push(copy.arrangeDidSettings([...new Set(applied.settings)].map(name)));
  if (applied.rows?.length) out.push(copy.arrangeDidRows(applied.rows.length));
  if (sidebar.length) out.push(copy.arrangeDidSidebar(sidebar));
  if (out.length === 0) out.push(copy.arrangeDidNothing);
  return out;
}

/**
 * THE RECORD'S SENTENCE WHEN IT STOPPED PART WAY: its reason, then this, then what it kept (`arrange.ts`, `apply`).
 * The only place the record says what landed, so it is read here and nowhere else.
 */
const KEPT = ' Already applied, and kept: ';

/** A partly applied proposal: why it stopped, what was done and kept, and what was not done. `null` when nothing landed. */
export type Partial = { why: string; done: string[]; left: string[] };

export function partialOf(kind: string, body: Row, fix: string): Partial | null {
  const at = fix.lastIndexOf(KEPT);
  if (at < 0) return null;
  const why = fix.slice(0, at);
  const kept = fix
    .slice(at + KEPT.length)
    .replace(/\.$/u, '')
    .split(', ')
    .filter((k) => k !== '');
  const packs = isRow(body.packs) ? body.packs : {};
  /* IN THE ORDER `apply` WORKS: installs, turning on, turning off, pages, settings. */
  const steps: { id: string; said: string }[] = [
    ...strings(packs.install).map((id) => ({ id, said: packName(id, body) })),
    ...(kind === 'pack' && text(body.enable) ? [text(body.enable)] : strings(packs.enable)).map((id) => ({ id, said: packName(id, body) })),
    ...(kind === 'pack' && text(body.disable) ? [text(body.disable)] : strings(packs.disable)).map((id) => ({ id, said: packName(id, body) })),
    ...(Array.isArray(body.pages) ? body.pages.filter(isRow) : []).map((p) => ({ id: text(p.id), said: copy.arrangePageNamed(pageTitle(text(p.id), body)) })),
    ...(kind === 'settings' ? [body] : Array.isArray(body.settings) ? body.settings.filter(isRow) : []).map((s) => ({
      id: text(s.pack),
      said: copy.arrangeSettingsOf(packName(text(s.pack), body)),
    })),
  ];
  const done: string[] = [];
  const left: string[] = [];
  let k = 0;
  for (const step of steps) {
    if (kept[k] === step.id) {
      done.push(step.said);
      k++;
    } else left.push(step.said);
  }
  return { why, done, left };
}

/**
 * WHAT APPEARS, AS SENTENCES WHERE IT CAN BE SAID IN ONE: a group of names under a verb ("Adds" over "Pages:
 * Profiles", "Lists: Profiles, Places") is one sentence a kind, and a line that is already a sentence ("Profiles adds 2
 * fields to Tools: ...") is that sentence. `null` for what has more to show than words: a page drawn, a look's colour,
 * a script's source, a list's own lines; those stay the preview's.
 */
export function appearsSaid(a: Appears): string[] | null {
  if (a.page !== undefined || a.source !== undefined || a.accent !== undefined) return null;
  const verb = a.kind === copy.arrangeAlso ? copy.arrangeAdds : a.kind;
  if (a.title === '' && a.lines.length > 0 && a.lines.every((l) => l.tone === undefined))
    return a.lines.map((l) => copy.arrangeGroupSaid(l.value.split(', ').filter((n) => n !== ''), verb, copy.arrangeGroupOne(l.label), l.label.toLowerCase()));
  if (a.title !== '' && a.lines.length === 0) return [/[.!?]$/u.test(a.title) ? a.title : `${a.title}.`];
  return null;
}
