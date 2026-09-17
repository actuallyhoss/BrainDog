/**
 * WHAT A `pack`, `settings` OR `arrange` PROPOSAL WOULD DO TO THIS BRAINDOG, AND WHAT IT DID, read from the body the
 * record filed (`packages/record/src/arrange.ts`, `prepare` and `apply`).
 *
 * THE STORY, IN THE ORDER A PERSON ASKS IT. Why, first, because a proposal to rearrange somebody's record is judged by
 * its reasons; then what it calls out, because that is the one part that reaches outside the record and costs egress;
 * then the packs it installs or turns off; then what will appear, page by page and list by list; then the words that
 * change ("Home will be called “Today”"); then any other setting. `arrange` is all of these as one question, so it is
 * drawn as one story and not as several proposals stacked (DIRECTION §11, DESIGN-SYSTEM D11).
 *
 * THE RECORD'S READING, NEVER THE PROPOSER'S. Everything drawn here is a key `prepare` worked out: the plan, the
 * calls out, the settings as they stood. Nothing a proposer typed about consequences reaches the screen but `why`.
 *
 * NOTHING HERE ASSUMES A KIND OF RECORD. A pack is named by its id when the body gives no title, a list by the record's
 * own name for it when the screen has one, and every sentence is `copy.ts`'s.
 */
import { moduleName, ruleName } from '@braindog/seed/usecases/names';

import { copy } from '../../../lib/copy.ts';
import { labelsOf, VOICE_LINES, type VoiceKey } from '../../../lib/voice.ts';
import { appearsOf, type Appears } from './proposed.ts';

type Row = Record<string, unknown>;

export const ARRANGING = ['pack', 'settings', 'arrange'] as const;
export const isArranging = (kind: string | undefined): boolean => (ARRANGING as readonly string[]).includes(kind ?? '');

/** One call out a press approves: the host it reaches, and how often and with what, in plain words. */
export type Call = { host: string; detail: string };

export type Part =
  | { part: 'why'; lines: { text: string; at?: string }[] }
  | { part: 'calls'; calls: Call[] }
  | { part: 'packs'; lines: string[] }
  | { part: 'appears'; appears: Appears[]; examples: number }
  | { part: 'words'; lines: string[] }
  | { part: 'settings'; lines: string[] };

export type Arranged = { lead: string; parts: Part[]; summary: string };

/** What the screen knows that the body does not: the record's name for each list, and a changed page as it stands. */
export type Context = { lists?: ReadonlyMap<string, string> | undefined; pagesNow?: Readonly<Record<string, Row>> | undefined };

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
  if (id === text(body.install) && text(body.title) !== '') return copy.valueWord(text(body.title));
  return moduleName(id);
}

/** A use case named by its id, bare or as its pack: "Student". */
const useCaseWords = (id: string): string => moduleName(id.startsWith('usecase-') ? id : `usecase-${id}`);

const listName = (id: string, ctx: Context): string => {
  const bare = id.replace(/^register\./u, '');
  return ctx.lists?.get(bare) ?? words(bare);
};

/**
 * `CALLS OUT api.example · every 1h · grant "Label" · sends a, b` as a host and the rest in words. A line that is not
 * one of those (a key's own line) is kept whole, because it is already a sentence.
 */
export function callOf(line: string): Call {
  const m = /^CALLS OUT (\S+) · (.*)$/u.exec(line);
  if (!m) return { host: '', detail: line };
  const rest = m[2]!.split(' · ').map((part) => {
    const grant = /^grant "(.*)"$/u.exec(part);
    if (grant) return grant[1] === 'none' ? copy.arrangeCallNoKey : copy.arrangeCallKey(grant[1]!);
    if (part.startsWith('sends ')) return copy.arrangeCallSends(part.slice('sends '.length));
    return part;
  });
  return { host: m[1] === 'no' ? copy.arrangeCallNoHost : m[1]!, detail: rest.join(', ') };
}

/** The first key of a pack document's declaration is its kind: `{ "page": "work", ... }`. */
function declared(doc: unknown): Map<string, { id: string; kind: string; body: Row }> {
  const out = new Map<string, { id: string; kind: string; body: Row }>();
  if (!isRow(doc) || !Array.isArray(doc.declarations)) return out;
  for (const d of doc.declarations.filter(isRow)) {
    const kind = Object.keys(d)[0] ?? '';
    const id = `${kind}.${text(d[kind])}`;
    out.set(id, { id, kind, body: d });
  }
  return out;
}

const newKind = (kind: string): string => copy.arrangeNew(copy.proposalKind(kind));

/**
 * What each planned pack adds and changes, as what will appear.
 *
 * A PAGE OR A LIST WITH SOMETHING TO SAY IS DRAWN ON ITS OWN, where the body carries the pack's document and so where it
 * lands in the sidebar and what it shows. EVERYTHING ELSE IS NAMED, one line per kind: Money alone adds twenty measures,
 * and twenty bold titles would bury the page a person will actually open.
 */
function planned(plan: unknown, doc: unknown, ctx: Context): { appears: Appears[]; examples: number; pages: number; lists: number; more: number } {
  const known = declared(doc);
  const drawn: Appears[] = [];
  const named = new Map<string, string[]>();
  const out = { examples: 0, pages: 0, lists: 0, more: 0 };
  for (const step of Array.isArray(plan) ? plan.filter(isRow) : []) {
    out.examples += typeof step.examples === 'number' ? step.examples : 0;
    for (const [ids, fresh] of [
      [strings(step.adds), true],
      [strings(step.changes), false],
    ] as const) {
      for (const id of ids) {
        const kind = id.split('.')[0] ?? '';
        const full = known.get(id);
        const seen = full ? appearsOf(full) : null;
        const title = kind === 'register' ? listName(id, ctx) : (seen?.title ?? (kind === 'rule' ? ruleName(id) : null) ?? words(id));
        if (fresh && kind === 'page') out.pages++;
        else if (fresh && kind === 'register') out.lists++;
        else out.more++;
        if (seen && seen.lines.length > 0 && (kind === 'page' || kind === 'register')) {
          drawn.push({ ...seen, kind: fresh ? newKind(kind) : copy.arrangeChanged(copy.proposalKind(kind)), title });
          continue;
        }
        const label = fresh ? copy.arrangeMany(kind) : copy.arrangeChanged(copy.arrangeMany(kind));
        named.set(label, [...(named.get(label) ?? []), title]);
      }
    }
  }
  const first = (label: string) => [copy.arrangeMany('page'), copy.arrangeMany('register')].indexOf(label) >>> 0;
  const weight = (a: Appears) => (a.kind.toLowerCase().endsWith(copy.proposalKind('page').toLowerCase()) ? 0 : 1);
  const appears = drawn.map((a, i) => [a, i] as const).sort(([a, i], [b, j]) => weight(a) - weight(b) || i - j).map(([a]) => a);
  if (named.size)
    appears.push({ kind: appears.length ? copy.arrangeAlso : copy.arrangeAdds, title: '', lines: [...named].sort(([a], [b]) => first(a) - first(b)).map(([label, names]) => ({ label, value: names.join(', ') })) });
  return { appears, ...out };
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
 * A `pack`, `settings` or `arrange` body as the story Decide draws, or `null` for every other kind.
 */
export function arrangedOf(kind: string, body: Row, ctx: Context = {}): Arranged | null {
  if (!isArranging(kind)) return null;
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

  const calls = strings(body.approve).map(callOf);
  if (calls.length) parts.push({ part: 'calls', calls });

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

  const plan = planned(body.plan, body.doc, ctx);
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

  /* ONE LINE FOR THE QUEUE: what appears and what is renamed, counted. The calls are never folded into it. */
  const newPages = plan.pages + pages.filter((p) => p.kind === newKind('page')).length;
  const more = plan.more + pages.length - pages.filter((p) => p.kind === newKind('page')).length;
  const bits = [
    newPages ? copy.arrangeCountPages(newPages) : '',
    plan.lists ? copy.arrangeCountLists(plan.lists) : '',
    more ? copy.arrangeCountOther(more) : '',
    wordLines.length ? copy.arrangeCountWords(wordLines.length) : '',
    otherLines.length ? copy.arrangeCountSettings(otherLines.length) : '',
  ].filter((b) => b !== '');
  return { lead, parts, summary: bits.join(', ') };
}

/** A page an arrangement puts in place, by the title its body gives, or its id in words. */
const pageTitle = (id: string, body: Row): string => {
  const raw = (Array.isArray(body.pages) ? body.pages.filter(isRow) : []).find((p) => p.id === id);
  return text(isRow(raw?.body) ? raw.body.title : undefined) || words(id);
};

/* ── what an accepted one did ───────────────────────────────────────────── */

/** `applied` as `decide` answers it: what was installed, turned on and off, and which pages and settings were set. */
export type Applied = { installed?: string[]; enabled?: string[]; disabled?: string[]; pages?: string[]; settings?: string[] };

/** What was applied, as sentences, with what is new in the sidebar when the screen could tell. */
export function appliedLines(applied: Applied, body: Row, sidebar: readonly string[] = []): string[] {
  const name = (id: string) => packName(id, body);
  const out: string[] = [];
  const updates = updatesOf(body);
  const installed = (applied.installed ?? []).filter((id) => !updates.has(id));
  const updated = (applied.installed ?? []).filter((id) => updates.has(id));
  if (installed.length) out.push(copy.arrangeDidInstall(installed.map(name)));
  for (const id of updated) out.push(copy.arrangeDidUpdate(name(id), updates.get(id)!.from, updates.get(id)!.to));
  if (applied.enabled?.length) out.push(copy.arrangeDidEnable(applied.enabled.map(name)));
  if (applied.disabled?.length) out.push(copy.arrangeDidDisable(applied.disabled.map(name)));
  if (applied.pages?.length) out.push(copy.arrangeDidPages(applied.pages.map((id) => pageTitle(id, body))));
  if (applied.settings?.length) out.push(copy.arrangeDidSettings([...new Set(applied.settings)].map(name)));
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
