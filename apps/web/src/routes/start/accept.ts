/**
 * "Make it mine": the one press that writes a first run's proposal into the record.
 *
 * ONE CALL, AND THE RECORD OWNS IT. The press is `bodyOf(asked)` handed to the record's `setup`: the lists
 * in order, then the person, their words for things, the currency, and the entries all or none, signed by the owner as
 * one change. The page used to run that as a script of a dozen calls of its own, so a closed tab left a record part
 * made. Now a tab closed in the same second leaves a record that holds every part.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE. The only entries sent are the ones formed from the person's own sentence: a guide's
 * plan (`formedRows`), and the entries the sentence filled completely (`rowsFor`).
 *
 * A REFUSAL IS SAID IN THE PERSON'S WORDS ("Money was not added.") with the record's own sentence kept beside it for
 * Details and for the log. Whatever went in stays in, and the next press asks only for what is missing (`again`).
 *
 * WHAT STAYS THE PAGE'S: a draft Slash made for a business no use case fits, filed as a change and decided in this
 * press; the one answer Today reads, kept as a pref on this device; and a file the person pointed at, whose entries go
 * through `setup` too once the list it maps into is there (`lib/start/export.ts` checks each against the list first).
 *
 * FOR ONE RELEASE, a host older than this page answers that it has no such call, and the press falls back to the script
 * it used to be (`oldScript`, at the foot of this file, the whole of it in one function).
 */

import { isNoSuchCall, type createClient, type SetupAnswer, type SetupBody } from '@braindog/client';
import { CORE_PACK, type Diff } from '@braindog/declare';
import { losses } from '@braindog/seed/packs/quiet';
import { listsOf as caseLists, modulesFor, useCase, type UseCase } from '@braindog/seed/usecases';
import { moduleName } from '@braindog/seed/usecases/names';

import { firstRun } from '../../lib/first-run.ts';
import { write as writePref } from '../../lib/pref.ts';
import { keepMade } from '../../lib/home/made-counts.ts';
import { packDocument, relabelDocument, type PackState } from '../../lib/record/packs.ts';
import { fileDrafted, type Drafted, type SlashClient } from '../../lib/record/slash.ts';
import { withOrder } from '../../lib/nav.ts';
import { hear, introduce, nameFromAddress, personRow, PEOPLE, roleNote, type Heard } from '../../lib/who.ts';
import { allLists } from '../../lib/start/lists.ts';
import { entriesOf, newListDeclarations, ownList, type Export, type Mapping } from '../../lib/start/export.ts';
import type { Proposal } from '../../lib/start/propose.ts';
import { afterInstall, installShared, keepVoice, planShared, speakingStates } from '../addons/sharing.ts';
import { words } from './preview.ts';

type Body = Record<string, unknown>;
type Client = ReturnType<typeof createClient>;
type Wire<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

/** What the press is asked to make: the proposal as the person left it on the preview. */
export type Accepting = {
  /** The whole sentence, as typed. */
  sentence: string;
  proposal: Proposal;
  /** The use case chosen, which may be another than the one proposed, or `null`. */
  usecase: string | null;
  /** The use cases installed beside it, by id: the proposal's, while the use case chosen is the one proposed. */
  also: readonly string[];
  /** The modules left on, which always hold every module the chosen use case stands on. */
  modules: readonly string[];
  /** The currency chosen, when Money is kept. */
  currency: string | null;
  /** The day the record is made, `YYYY-MM-DD`, from the caller's clock. */
  today: string;
  /** The address the person signed in with, for their People row, or `null`. */
  email: string | null;
  /** The reader's own rail order, which a use case's order is laid over. */
  nav: readonly string[];
  /**
   * What Slash drafted for a business no use case fits, when the person kept it: its
   * lists, figures and pages, filed and accepted in this same press. Its sample rows are never written.
   */
  drafted?: Drafted | null;
  /**
   * The files the person pointed at and how each maps, when they kept them (one, or one for each table a zip held, in
   * the order their tiles stand), and the language their days are read in.
   */
  imported?: Imported | readonly Imported[] | null;
  locale?: string;
  /** A press after one that came back with something not made: the record writes only what is missing. */
  again?: boolean;
  /**
   * THE AI APPS THEY NAMED THAT ARE AGENTS BRAINDOG KNOWS (`agentsNamed` in `lib/start/chat.ts`), each kept as its agent's
   * row (`keepAgents`), not connected until it first calls.
   */
  agents?: readonly { kind: string; name: string }[];
  /**
   * THE BUILD'S OWN HANDLE, set once by the page that built it and sent again with every press of the same build, so the
   * record writes its entries once. A press whose answer never came back and is pressed again with `again` must carry the
   * key the first one carried, or the record takes it for a new press and writes every entry twice (finding
   * 2). Left out, `accept` makes one for this call alone.
   */
  key?: string;
  /**
   * THE USE CASE'S PLAN STILL TO MAKE, as an answered press handed it back (`Accepted.plan`, set by `pressAgain`):
   * sent in place of the plan formed from the sentence, so an entry of it that is in is not written again under the
   * next press's new key. Left out, the plan is formed whole.
   */
  plan?: readonly SetupRow[];
};

/** A handle for one build's entries, as a page sets it on `Accepting.key`. */
export const pressKey = (): string => `first-run-${crypto.randomUUID()}`;

/** A file the person pointed at, and how it maps. */
export type Imported = { file: Export; mapping: Mapping };

/** The files a press carries, in order: none, the one, or each of many. */
const importsOf = (imported: Accepting['imported']): readonly Imported[] => (!imported ? [] : 'file' in imported ? [imported] : imported);

/** One thing that was not made: the person's sentence and the record's. */
export type NotMade = { said: string; why: string };

/**
 * What the press made: what could not be made, the sentence's entries it did not write, and the rail order to keep,
 * `null` for no change. An entry left whose client was written names that client in its own fields, so a second press
 * links it without writing the client again.
 */
export type Accepted = {
  failed: NotMade[];
  left: Proposal['rows'];
  nav: string[] | null;
  /** Whether the draft went onto Decide, kept or waiting there, so a second press does not file it again. */
  filed: boolean;
  /** What the record itself refused, part by part with its own sentence, for the tiles of the making step. */
  refused?: { part: string; why: string }[];
  /** The record never answered, twice over: the build may have gone in, so the next press carries the same `key`. */
  unheard?: true;
  /**
   * The use case's plan the record did not write, when it answered a press that carried one: all of it, none, or a
   * missing list's entries.
   */
  plan?: SetupRow[];
};

/**
 * THE NEXT PRESS OF A BUILD THAT DID NOT ALL GO IN, as a page's Try again sends it: with `again`, so the record writes
 * only what it does not hold.
 *
 * A PRESS NOBODY ANSWERED KEEPS ITS KEY (`out` is `null` for one that threw, or says `unheard`): the same entries are
 * asked for, and the record passes them over if they went in. A PRESS THAT WAS ANSWERED TAKES A NEW ONE: the record
 * said which entries it did not write, and may have kept the first key for the ones it did, so the same key again
 * would pass over the very entries that are still missing. THAT NEW KEY CARRIES ONLY WHAT IS STILL TO MAKE: the
 * sentence's entries it handed back (`left`) and the plan's (`plan`), which may be none at all. Sent whole, the plan
 * would be written a second time, since the record passes over only a key it holds. A draft that
 * went onto Decide is not filed again.
 */
export function pressAgain(asked: Accepting, out: Accepted | null): Accepting {
  if (out === null || out.unheard) return { ...asked, again: true, key: asked.key ?? pressKey() };
  return {
    ...asked,
    again: true,
    key: pressKey(),
    nav: out.nav ?? asked.nav,
    proposal: { ...asked.proposal, rows: out.left },
    ...(out.plan === undefined ? {} : { plan: out.plan }),
    ...(out.filed ? { drafted: null } : {}),
  };
}

/** The record's own sentence for a refusal, or the calm one when nothing answered. */
const fixOf = (r: Wire<unknown>, otherwise: string): string => (!r.ok && 'refusal' in r ? r.refusal.fix : otherwise);

/**
 * THE MODULES A USE CASE IS INSTALLED WITH: core first, which every record holds, then every one it stands on, and the ones the person kept beside them, in the
 * order each list a later one points at comes first (`modulesFor`).
 */
export const withNeeds = (u: UseCase | null, kept: readonly string[]): string[] => (u ? modulesFor(u, kept) : [CORE_PACK, ...kept.filter((id) => id !== CORE_PACK)]);

/**
 * THE USE CASE AS A SHARED FILE, WITH NOTHING IN IT BUT WHAT THE PERSON ASKED FOR.
 *
 * `builtInFile` carries the use case's pack as it ships, examples included, because Browse hands out the same file. Its
 * rows are replaced here with the plan formed from what the person said (`carriedDocument`, tagged `formed`) or with
 * none, and its links with the formed plan's. `modules` is what the person kept, so the modules the sentence named beside
 * the use case go in through the same plan.
 */
export async function fileFor(u: UseCase, modules: readonly string[], today: string, said: string): Promise<Body | null> {
  const [{ builtInFile }, { carriedDocument, formedFor, moduleManifest }] = await Promise.all([import('@braindog/seed/usecases/share'), import('@braindog/seed/usecases/install')]);
  const file = builtInFile(u.usecase, today);
  if (!file) return null;
  /* EVERY MODULE THE BUILD KEEPS IS INSTALLED, not only the use case's `needs`: the file's own list would cut them. */
  const { links: _links, pack: shipped, needs: _needs, ...rest } = file;
  const formed = formedFor(u, said);
  /* THE FORMED SEEDS GO ONLY INTO LISTS THE BUILD HOLDS, so an entry is never planted in a list nothing installs. */
  const holds = new Set(
    withNeeds(u, modules).flatMap((m) => (moduleManifest(m)?.provides ?? []).flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []))),
  );
  const formedRows = carriedDocument(u, today, said, { holds })?.seeds;
  const seeds = Array.isArray(formedRows) ? (formedRows as unknown[]) : [];
  let pack: unknown = shipped;
  if (shipped !== null && typeof shipped === 'object') {
    const { seeds: _examples, ...bare } = shipped as Body;
    pack = seeds.length > 0 ? { ...bare, seeds } : bare;
  }
  return { ...rest, modules: withNeeds(u, modules), pack, ...(formed && formed.links.length > 0 ? { links: [...formed.links] } : {}) };
}

/* ── what the press sends ──────────────────────────────────────────────── */

/** One entry as `setup` takes it: its list, its fields, and the earlier entries it points at, each by its place from 0. */
export type SetupRow = { register: string; fields: Record<string, unknown>; links?: Record<string, number> };

/** A title an entry goes by, whichever list it is for. */
const titled = (fields: Record<string, unknown>): string => String(fields.what ?? fields.name ?? fields.title ?? '');

/**
 * THE PLAN FORMED FROM WHAT THE PERSON SAID, AS ENTRIES: a guide's steps and what they hang on, tagged `formed` as the
 * install tags them and never `example`. Each entry that points at another comes after it and names it by its place,
 * which is how `setup` takes a link. A link to several entries is left for the person, since a place names one.
 */
export async function formedRows(u: UseCase, today: string, said: string): Promise<SetupRow[]> {
  const { carriedDocument, formedFor } = await import('@braindog/seed/usecases/install');
  const formed = formedFor(u, said);
  if (!formed) return [];
  const seeds = carriedDocument(u, today, said)?.seeds;
  const rows = (Array.isArray(seeds) ? (seeds as Body[]) : []).flatMap((s) => (typeof s.register === 'string' && s.fields !== null && typeof s.fields === 'object' ? [{ register: s.register, fields: s.fields as Record<string, unknown> }] : []));
  const find = (register: string, title: string) => rows.findIndex((r) => r.register === register && titled(r.fields) === title);
  /* WHAT EACH ENTRY POINTS AT, by where it stands now; then the entries are put in an order where every target is first. */
  const points = new Map<number, Map<string, number>>();
  for (const l of formed.links) {
    if (l.list === true) continue;
    const from = find(l.register, l.title);
    const to = find(l.to, l.target);
    if (from < 0 || to < 0 || from === to) continue;
    points.set(from, (points.get(from) ?? new Map<string, number>()).set(l.field, to));
  }
  const order: number[] = [];
  const place = (i: number, on: ReadonlySet<number>) => {
    if (order.includes(i)) return;
    /* TWO ENTRIES THAT POINT AT EACH OTHER: the second keeps its entry and loses the link, never the plan. */
    if (!on.has(i)) for (const to of points.get(i)?.values() ?? []) place(to, new Set([...on, i]));
    if (!order.includes(i)) order.push(i);
  };
  for (const i of rows.keys()) place(i, new Set());
  return order.map((i, at) => {
    const links = Object.fromEntries([...(points.get(i) ?? [])].flatMap(([field, to]) => (order.indexOf(to) < at ? [[field, order.indexOf(to)] as const] : [])));
    return { ...rows[i]!, ...(Object.keys(links).length === 0 ? {} : { links }) };
  });
}

/**
 * THE SENTENCE'S OWN ENTRIES, each pointing at the client it names by that client's place: "We bill Fenwick £2,000 a
 * month" makes Fenwick and an invoice to him. An entry for a list this press does not make is left with the person, as
 * it always was, with its client by its place among what is left; `first` is how many entries stand before these.
 */
export function rowsFor(asked: Accepting, first = 0): { rows: SetupRow[]; left: Proposal['rows'] } {
  const u = asked.usecase === null ? null : (useCase(asked.usecase) ?? null);
  const cases = u ? [u, ...asked.also.flatMap((id) => (id === u.usecase ? [] : (useCase(id) ?? [])))] : [];
  const made = new Set([...allLists(withNeeds(u, asked.modules)).map((l) => l.id), ...cases.flatMap((c) => caseLists(c).map((l) => l.id))]);
  const rows: SetupRow[] = [];
  const left: Proposal['rows'] = [];
  const sent = new Map<number, number>();
  const kept = new Map<number, number>();
  for (const [i, row] of asked.proposal.rows.entries()) {
    if (made.has(row.register)) {
      const to = row.party === undefined ? undefined : sent.get(row.party);
      sent.set(i, first + rows.length);
      rows.push({ register: row.register, fields: row.fields, ...(to === undefined ? {} : { links: { party: to } }) });
      continue;
    }
    const still = row.party === undefined ? undefined : kept.get(row.party);
    kept.set(i, left.length);
    left.push({ register: row.register, fields: row.fields, ...(still === undefined ? {} : { party: still }) });
  }
  return { rows, left };
}

/**
 * The entries `keep` keeps, each still pointing at the kept ones by their new places. A link to one left out is
 * dropped: that entry is in the record already, and the page never learns what the record called it.
 */
function keptRows(rows: readonly SetupRow[], keep: (r: SetupRow) => boolean): SetupRow[] {
  const place = new Map<number, number>();
  const out: SetupRow[] = [];
  for (const [i, r] of rows.entries()) {
    if (!keep(r)) continue;
    const links = Object.fromEntries(Object.entries(r.links ?? {}).flatMap(([field, to]) => (place.has(to) ? [[field, place.get(to)!]] : [])));
    place.set(i, out.length);
    out.push({ register: r.register, fields: r.fields, ...(Object.keys(links).length === 0 ? {} : { links }) });
  }
  return out;
}

/** Who the sentence is from: the name the proposal carries, which the model may have read where the rules did not, and the words after it. */
function whoOf(asked: Accepting): Heard {
  const heard = hear(asked.sentence);
  return asked.proposal.name === heard.name ? heard : { name: asked.proposal.name, bio: heard.name === null ? heard.bio : asked.sentence.trim() };
}

/** The use case chosen, then the ones beside it, each once. */
function casesOf(asked: Accepting): UseCase[] {
  const u = asked.usecase === null ? null : (useCase(asked.usecase) ?? null);
  return u ? [u, ...asked.also.flatMap((id) => (id === u.usecase ? [] : (useCase(id) ?? [])))] : [];
}

/**
 * WHAT THE PRESS ASKS THE RECORD TO MAKE, AS ONE BODY. Nothing here reads the record or writes to it: the record checks
 * every part and applies them in its own order (the lists, then the person, their words for things, the currency, then
 * the entries all or none), which is what a closed tab cannot cut in half.
 *
 * - `usecase` and `alongside`: the one that speaks and the ones beside it, which never change who speaks.
 * - `packs.install`: every module the use case stands on and the ones the person kept, in the order a later one needs.
 * - `me`: the name they typed, else the one they answered, else the one in their address, with the words after the name
 *   as their note. The record decides where it is kept, and keeps People off behind somebody who turned it off.
 * - `names`: the person's own word for a list, "Shops" for Projects. No declaration is rewritten for it.
 * - `settings`: the currency by its key alone. The record finds the add-on that declares it.
 * - `rows`: the plan formed from the sentence (`formed`), then the sentence's own entries.
 */
export function bodyOf(asked: Accepting, formed: readonly SetupRow[] = []): SetupBody {
  const who = whoOf(asked);
  const [u = null, ...beside] = casesOf(asked);
  const install = withNeeds(u, asked.modules);
  const name = who.name ?? (asked.proposal.answers?.name?.trim() || null) ?? nameFromAddress(asked.email);
  const names = asked.proposal.names ?? {};
  const rows = [...formed, ...rowsFor(asked, formed.length).rows];
  return {
    ...(u ? { usecase: u.usecase } : {}),
    ...(beside.length === 0 ? {} : { alongside: beside.map((b) => b.usecase) }),
    ...(install.length === 0 ? {} : { packs: { install } }),
    ...(name ? { me: { name, ...(asked.email ? { email: asked.email } : {}), ...(roleNote(who.bio) === '' ? {} : { note: roleNote(who.bio) }) } } : {}),
    ...(Object.keys(names).length === 0 ? {} : { names: { ...names } }),
    ...(asked.currency === null ? {} : { settings: [{ values: { home_currency: asked.currency } }] }),
    ...(rows.length === 0 ? {} : { rows }),
    ...(asked.again === true ? { again: true } : {}),
  };
}

type Answered = Wire<SetupAnswer>;

/** Whether an answer is the record saying it is set up already, which a press with \`again\` is the answer to. */
const setUpAlready = (out: Answered): boolean => !out.ok && 'refusal' in out && (out.refusal as { at?: string }).at === 'again';

/**
 * THE ONE CALL, AND ONCE MORE BY ITSELF WHEN IT WAS CUT OFF. A call that installs several lists may run past the time
 * a request is given: the record carries on, and the page presses again with \`again\`, which writes only what is
 * missing. The body carries the press's own \`key\`, so the record writes its entries once however often it is sent.
 * The same second press answers a record that says it is set up already: the person asked for more, and gets what is
 * missing. A host with no such call throws (\`isNoSuchCall\`), and that is passed up untouched for the caller to fall
 * back on.
 */
async function send(client: Client, body: SetupBody): Promise<Answered | null> {
  try {
    const first = (await client.setup(body)) as Answered;
    if (body.again === true || !setUpAlready(first)) return first;
  } catch (e) {
    if (isNoSuchCall(e)) throw e;
  }
  return (await client.setup({ ...body, again: true }).catch((e: unknown) => {
    if (isNoSuchCall(e)) throw e;
    return null;
  })) as Answered | null;
}

/** The add-on a part of the answer is about, by its id, or \`null\` for a part that is not an add-on. */
const addOnOf = (part: string): string | null => /^(install|enable):(.+)$/u.exec(part)?.[2] ?? null;

/**
 * What the record could not make, in the person's words. The record names a part as an arrangement does: an add-on
 * (\`install:money-core\`), them (\`me\`), a setting (\`setting:\`), their word for a list (\`name:\`), the entries
 * (\`rows\`), or the entries of one list that is not there (\`rows:invoices\`).
 */
function notMade(part: string, body: SetupBody): string {
  if (part === 'me') return body.me ? firstRun.notMet(body.me.name) : firstRun.notAllMade;
  if (/^settings?\b/u.test(part)) return firstRun.notSet;
  const id = addOnOf(part);
  if (id === null) return firstRun.notAllMade;
  const u = id.startsWith(CASE) ? useCase(id.slice(CASE.length)) : undefined;
  return firstRun.notAdded(u ? u.title : moduleName(id));
}

/** How a use case's own add-on is named in the record's answer. */
const CASE = 'usecase-';

/* ── the press ─────────────────────────────────────────────────────────── */

/**
 * Write the proposal into the record, in one press and one call.
 *
 * `busy` IS THE CALLER'S. The screen holds the press while this runs, so a second press writes nothing twice.
 *
 * WHAT THE RECORD COULD NOT MAKE COMES BACK PART BY PART, each with its own sentence, and whatever went in stays in.
 * The entries go in all or none, so one refused hands every one of them back for the next press, which is sent with
 * `again` and writes only what is missing.
 */
/**
 * How many entries each list holds now, by id, the empty ones left out, and the record's address they are kept under;
 * `null` where the record did not answer. By the record's own slug, since sign-up asks it from outside its address.
 */
async function madeCounts(client: Client): Promise<{ slug: string; counts: Record<string, number> } | null> {
  const out = (await (client as { boot?: () => Promise<unknown> }).boot?.().catch(() => null)) as Wire<{ record?: { slug?: string } | null; registers?: { id: string; count: number }[] }> | null | undefined;
  if (!out?.ok || !Array.isArray(out.value.registers) || typeof out.value.record?.slug !== 'string') return null;
  const counts = Object.fromEntries(out.value.registers.filter((r) => typeof r.id === 'string' && Number.isFinite(r.count) && r.count > 0).map((r) => [r.id, r.count]));
  return { slug: out.value.record.slug, counts };
}

export async function accept(client: Client, asked: Accepting): Promise<Accepted> {
  if (typeof (client as { setup?: unknown }).setup !== 'function') return oldScript(client).accept(asked);
  const cases = casesOf(asked);
  /* THE PLAN AS THE LAST PRESS HANDED IT BACK, when there was one (`pressAgain`), else formed from the sentence. */
  const formed = asked.plan ?? (cases[0] ? await formedRows(cases[0], asked.today, whoOf(asked).bio).catch(() => []) : []);
  /* THE PRESS'S OWN HANDLE, so its entries are written once however often the call is sent. */
  const body: SetupBody = { ...bodyOf(asked, formed), key: asked.key ?? pressKey() };
  const unsent = rowsFor(asked, formed.length).left;
  let out: Answered | null;
  try {
    out = await send(client, body);
  } catch (e) {
    /* A HOST A RELEASE BEHIND THIS PAGE, for this one release: the script the press used to be. */
    if (isNoSuchCall(e)) return oldScript(client).accept(asked);
    throw e;
  }
  if (out === null || !out.ok)
    return { failed: [{ said: firstRun.notAllMade, why: out === null ? '' : fixOf(out, '') }], left: asked.proposal.rows, nav: null, filed: false, ...(out === null ? { unheard: true as const } : {}) };
  const parts = out.value.failed;
  const failed: NotMade[] = parts.map((f) => ({ said: notMade(f.part, body), why: f.why }));
  /* THE ADD-ONS IT REFUSED, each by its id, which is what a tile of the making step is found by. */
  const refused = parts.flatMap((f) => ((id) => (id === null ? [] : [{ part: id, why: f.why }]))(addOnOf(f.part)));
  /* WHAT IS STILL TO MAKE: every entry where the record wrote none of them (`rows`), and the entries of a list that is
     not there (`rows:invoices`) where it wrote the rest. One left whose client was written keeps its fields and loses
     the link, since the page never learns what the record called the client. */
  const none = parts.some((f) => f.part === 'rows');
  const lost = new Set(parts.flatMap((f) => (f.part.startsWith('rows:') ? [f.part.slice('rows:'.length)] : [])));
  const left = none ? asked.proposal.rows : [...asked.proposal.rows.filter((r) => lost.has(r.register)).map(({ register, fields }) => ({ register, fields })), ...unsent];
  /* AND THE PLAN'S, by the same rule, so the next press sends none of it that is in. */
  const plan = none ? [...formed] : keptRows(formed, (r) => lost.has(r.register));

  /* THE RAIL ORDER EACH USE CASE CARRIES, laid over the reader's own, for every one that went in. */
  let nav: string[] | null = null;
  for (const one of cases) {
    if (one.nav.length === 0 || refused.some((f) => f.part === `${CASE}${one.usecase}`)) continue;
    nav = withOrder(one.nav, nav ?? asked.nav);
  }

  /* WHAT SLASH DRAFTED GOES IN AS A CHANGE, proposed and then decided in this press, which is the one way a change comes
     into a record (`slash.ts` `fileDrafted`). It is filed as it was drawn, its declarations and nothing else: the sample
     rows the preview drew were only examples. After the lists, since a page it makes may read one of them. */
  let filed = false;
  if (asked.drafted) {
    const kept = await fileDrafted(client as unknown as SlashClient, asked.drafted, true);
    filed = kept.kind !== 'refused';
    if (kept.kind === 'refused') failed.push({ said: words.notDrafted, why: kept.fix });
    else if (kept.kind === 'filed') failed.push({ said: words.draftWaits, why: kept.fix ?? '' });
  }

  /* WHERE THEIR WORK ARRIVES, the one question the first run asked (`start/question.ts`), kept as the pref Today's next
     steps are ordered by (`arrivesBy`, `madeSteps`). Only now, with the record made: nothing is kept before the link. */
  const arrivesBy = asked.proposal.answers?.arrivesBy;
  if (arrivesBy !== undefined) writePref({ arrivesBy });

  /* THE AGENTS THEY NAMED, EACH ITS OWN ROW (`keepAgents`), once the build is in. One that could not be kept is no
     failure of the build: Settings, Agents makes it the day the agent first calls. */
  if ((asked.agents ?? []).length > 0) await keepAgents(client, asked.agents ?? []).catch(() => undefined);

  /* WHAT THE MAKING WROTE, COUNTED ONCE IT IS IN (AH19): a Guide's plan is the starter's, not something the person added,
     so Today still offers to tell it one real thing. Before the file, which the person brought. */
  const made = await madeCounts(client);
  if (made !== null) keepMade(made.slug, made.counts);

  /* THE FILE THEY POINTED AT, LAST, once the list it maps into is there. In the currency the preview drew it in: the one
     chosen for Money, or the one typed where Money is not kept. */
  if (importsOf(asked.imported).length > 0) {
    const read = (await client.packs().catch(() => null)) as Wire<PackState[]> | null;
    failed.push(...(await importFiles(client, importsOf(asked.imported), asked.currency ?? asked.proposal.currency, asked.locale ?? 'en', read?.ok ? read.value : [])));
  }

  return { failed, left, nav, filed, refused, ...(formed.length === 0 ? {} : { plan }) };
}

/**
 * ONE ROW FOR EACH AGENT THEY NAMED (1 Nov, a live run: "Claude, and Figma" said "That adds Agents" and the Agents page
 * then held no agent): the agent's own settings row, matched by its kind, as the record makes one for each kind of agent
 * that calls (`agent_profile`, migration 42). It starts as Defaults are and says nothing about the agent being connected:
 * that is the first call it makes, and the Agents page offers to connect it until then. A kind that has a row already is
 * left as it is. The owner's alone, signed in, which the press always is.
 */
export async function keepAgents(client: Client, agents: readonly { kind: string; name: string }[]): Promise<void> {
  const c = client as unknown as {
    agentProfiles?: () => Promise<Wire<{ match?: { kind?: string; token?: string; host?: string; seat?: string }; retired_at?: string | null }[]>>;
    setAgentProfile?: (args: Record<string, unknown>) => Promise<Wire<unknown>>;
  };
  if (typeof c.agentProfiles !== 'function' || typeof c.setAgentProfile !== 'function') return;
  const held = await c.agentProfiles();
  if (!held.ok) return;
  const kinds = new Set(held.value.filter((p) => !p.retired_at && p.match?.kind && !p.match.token && !p.match.host && !p.match.seat).map((p) => p.match?.kind));
  for (const a of agents) if (!kinds.has(a.kind)) await c.setAgentProfile({ name: a.name, match: { kind: a.kind } });
}

/** How many of a file's entries go to the record in one call. */
const FILE_AT_ONCE = 200;

/**
 * EVERY FILE'S ENTRIES, EACH INTO ITS OWN LIST, in the order the files were brought: a zip of two tables is two lists.
 * Each is written as `importFile` writes one, and one the record refused, or whose call threw, is answered in its own
 * line while the next still goes in. A list of a file's own takes a name no file before it took in this press, so two
 * tables both called Tasks are two lists.
 */
export async function importFiles(client: Client, imported: readonly Imported[], currency: string | null, locale: string, states: readonly PackState[]): Promise<NotMade[]> {
  const old = typeof (client as { setup?: unknown }).setup !== 'function' ? oldScript(client) : null;
  const taken: string[] = [];
  const failed: NotMade[] = [];
  for (const one of imported) {
    const done = await (old ? old.importFile(one, currency, locale, states, taken) : importOne(client, one, currency, locale, states, taken)).catch(() => [
      { said: firstRun.importNotMade(one.mapping.name), why: '' },
    ]);
    failed.push(...done);
  }
  return failed;
}

/** One file's entries into the list it maps to: `importFiles` with that file alone. */
export const importFile = (client: Client, imported: Imported, currency: string | null, locale: string, states: readonly PackState[]): Promise<NotMade[]> =>
  importFiles(client, [imported], currency, locale, states);

/**
 * THE FILE'S ENTRIES, WRITTEN INTO THE LIST IT MAPS TO: a list of its own filed and accepted first, as a drafted change
 * is, then its entries through `setup` with `again`, two hundred to a call. A call's entries go in all or none, so one
 * the record refuses is halved and sent again until the entry it would not take stands alone: every other one goes in.
 * What could not be written is one line, with how many and the record's first sentence for why. A list of its own is
 * added to `taken`, so the next file's own list is not given the same name.
 */
async function importOne(client: Client, imported: Imported, currency: string | null, locale: string, states: readonly PackState[], taken: string[]): Promise<NotMade[]> {
  const { file, mapping } = imported;
  let own = undefined;
  if (mapping.list === null) {
    own = ownList(file, mapping.name, currency, locale, [...new Set([...states.flatMap((p) => p.registers), ...allLists().map((l) => l.id), ...taken])]);
    taken.push(own.id);
    const change: Drafted = { question: firstRun.importAsk(mapping.name), change: { to: { declarations: newListDeclarations(own, mapping.summary) } }, rows: {}, preview: { pages: [] } };
    const kept = await fileDrafted(client as unknown as SlashClient, change, true);
    if (kept.kind !== 'kept') return [{ said: firstRun.importNotMade(mapping.name), why: kept.kind === 'refused' ? kept.fix : (kept.fix ?? '') }];
  } else if (!states.some((p) => p.disabled_at === null && p.registers.includes(mapping.list ?? ''))) {
    return [{ said: firstRun.importNotMade(mapping.name), why: '' }];
  }
  const out = entriesOf(file, mapping, currency, locale, own);
  let refused = 0;
  let why = '';
  const press = crypto.randomUUID();
  let calls = 0;
  const write = async (rows: SetupRow[]): Promise<void> => {
    /* EACH CALL HAS ITS OWN HANDLE, so one cut off is sent once more and its entries still go in once. */
    const body = { again: true, key: `import-${press}-${calls++}`, rows };
    const wrote = (await client.setup(body).catch(() => client.setup(body).catch(() => null))) as Answered | null;
    if (wrote?.ok && wrote.value.failed.length === 0) return;
    if (rows.length > 1 && wrote !== null) {
      const half = Math.ceil(rows.length / 2);
      await write(rows.slice(0, half));
      await write(rows.slice(half));
      return;
    }
    refused += rows.length;
    if (why === '') why = wrote === null ? '' : wrote.ok ? (wrote.value.failed[0]?.why ?? '') : fixOf(wrote, '');
  };
  for (let at = 0; at < out.fields.length; at += FILE_AT_ONCE) await write(out.fields.slice(at, at + FILE_AT_ONCE).map((fields) => ({ register: out.register, fields })));
  const missed = refused + out.skipped;
  return missed === 0 ? [] : [{ said: firstRun.importMissed(missed, file.entries.length, mapping.name), why }];
}

/* ── the old script, for one release ───────────────────────────────────── */

/**
 * THE PRESS AS A SCRIPT OF CALLS FROM THE BROWSER, kept for the one release in which a host may be older than this page
 * and answer that it has no `setup` (`NO_SUCH_CALL`). Everything the script needs is inside this one function, so the
 * next release deletes the function and the two places that call it, and nothing else.
 *
 * A closed tab leaves the record part made here, which is what `setup` ends: the record does the whole of it in one call.
 */
function oldScript(client: Client): {
  accept(asked: Accepting): Promise<Accepted>;
  importFile(imported: Imported, currency: string | null, locale: string, states: readonly PackState[], taken: string[]): Promise<NotMade[]>;
} {
  /** The packs the record holds now, or the refusal that said it could not tell. */
  async function packsOf(client: Client): Promise<{ ok: true; value: PackState[] } | { ok: false; why: string }> {
    const read = (await client.packs()) as Wire<PackState[]>;
    return read.ok ? { ok: true, value: read.value } : { ok: false, why: fixOf(read, '') };
  }

  /** A module by the name a person knows it by. */
  const nameOf = (id: string): string => moduleName(id);

  /**
   * A MODULE'S LISTS IN THE PERSON'S OWN WORDS: "Shops" for Projects where that is what they called them. The list's name
   * is the module's declaration, so renaming it here is what the record keeps and Settings can rename again.
   */
  function named(doc: Record<string, unknown> | null, names: Readonly<Record<string, string>> | undefined): Record<string, unknown> | null {
    if (doc === null || names === undefined || !Array.isArray(doc.declarations)) return doc;
    const declarations = (doc.declarations as Body[]).map((d) => (typeof d.register === 'string' && names[d.register] ? { ...d, name: names[d.register] } : d));
    return { ...doc, declarations };
  }

  /** Install one module alone, for a proposal with no use case: planned, then installed with exactly that plan's hash. */
  async function addModule(client: Client, id: string, held: readonly PackState[], names?: Readonly<Record<string, string>>): Promise<string | null> {
    const state = held.find((p) => p.id === id);
    if (state) {
      if (state.disabled_at === null) return null;
      /* THE PERSON LEFT IT ON, SO IT IS TURNED ON. A module off on this record is turned on only when it is in what the
         person kept, which is how People stays off behind somebody who turned it off. */
      const on = (await client.enablePack({ id })) as Wire<unknown>;
      return on.ok ? null : fixOf(on, '');
    }
    const doc = named(await packDocument(id, held), names);
    if (!doc) return '';
    const planned = (await client.planPack({ doc, source: { kind: 'local' } })) as Wire<{ diff?: { planHash?: unknown; approve?: unknown } }>;
    if (!planned.ok) return fixOf(planned, '');
    const hash = planned.value.diff?.planHash;
    const lines = planned.value.diff?.approve;
    const approve = Array.isArray(lines) ? (lines as unknown[]).filter((a): a is string => typeof a === 'string') : [];
    if (typeof hash !== 'string' || hash === '') return '';
    const put = (await client.installPack({ doc, source: { kind: 'local' }, planHash: hash, ...(approve.length === 0 ? {} : { approve }) })) as Wire<unknown>;
    return put.ok ? null : fixOf(put, '');
  }

  /** The objects in a list the record answered, and none where it sent no list, so a plan with a part missing reads as empty. */
  const objects = (v: unknown): never[] => (Array.isArray(v) ? v.filter((x) => x !== null && typeof x === 'object') : []) as never[];

  /** A plan as the record answered it, with every list `losses` reads there, empty where the answer left one out. */
  const wholeDiff = (d: Body): Diff =>
    ({
      ...d,
      adds: objects(d.adds),
      retires: objects(d.retires),
      conflicts: objects(d.conflicts),
      retypes: objects(d.retypes),
      newly_required: objects(d.newly_required),
      misreads: objects(d.misreads),
      renames: objects(d.renames),
      dependents: objects(d.dependents),
      calls_out: objects(d.calls_out),
      approve: Array.isArray(d.approve) ? d.approve.filter((a) => typeof a === 'string') : [],
    }) as unknown as Diff;

  /** Each declaration of a module's document by its id, `register.people` or `page.relation`: its kind, then its name. */
  function declared(doc: Body | null): Map<string, Body> {
    const out = new Map<string, Body>();
    for (const d of Array.isArray(doc?.declarations) ? (doc.declarations as unknown[]) : []) {
      if (d === null || typeof d !== 'object') continue;
      const kind = Object.keys(d)[0];
      const name = kind === undefined ? undefined : (d as Body)[kind];
      if (kind !== undefined && typeof name === 'string') out.set(`${kind}.${name}`, d as Body);
    }
    return out;
  }

  /**
   * A MODULE PLANNED AGAIN ONCE EVERY LIST IS IN, and installed when that plan changes anything.
   *
   * A MODULE'S COPY IS CUT TO THE LISTS THE RECORD HOLDS WHEN IT GOES IN (`packDocument`). People goes in before Money, so
   * its copy left out what an organisation's page shows of Money, and the page gained it only at People's next update.
   * Planned again here, with the lists of everything this press put in, it gains it now. Nothing is said when the record
   * refuses it: People works as it went in, and its next update brings the rest.
   *
   * `before` IS WHAT THE RECORD HELD BEFORE THIS PRESS, or `null` when this press put the module in. One the record held
   * before is the person's, and may carry what they changed, so its plan goes in only when it loses nothing, by the same
   * check BrainDog's own updates go in by (`losses` in `@braindog/seed/packs/quiet`): nothing taken away, nothing the
   * person took off brought back, nothing of theirs changed or taken over, no service outside. Otherwise it waits for the
   * module's own update, where the person sees it.
   *
   * WHAT THE PERSON TOOK OFF IS WHAT THE MODULE'S COPY HELD BEFORE THIS PRESS AND THE RECORD DOES NOT: the copy cut to the
   * lists held before is what the record would hold, so a plan that adds one of those adds what somebody took away. What
   * this press made room for (a block over Money, now that Money is in) is new to that copy, and goes in. A module held at
   * an older version than this build ships is left to its own update by the same reading, since what its newer copy adds
   * cannot be told apart from what was taken off.
   */
  async function refreshModule(client: Client, id: string, held: readonly PackState[], names?: Readonly<Record<string, string>>, before: readonly PackState[] | null = null): Promise<void> {
    if (!held.some((p) => p.id === id && p.disabled_at === null)) return;
    const doc = named(await packDocument(id, held), names);
    if (!doc) return;
    /* A PLAN THAT THROWS IS A REFUSAL TOO, and says nothing: everything this press put in is in already. */
    const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as Wire<{ diff?: Body }> | null;
    if (!planned?.ok) return;
    const diff = planned.value.diff;
    const some = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
    if (typeof diff?.planHash !== 'string' || diff.planHash === '' || !(some(diff.adds) || some(diff.changes) || some(diff.retires))) return;
    const approve = Array.isArray(diff.approve) ? (diff.approve as unknown[]).filter((a): a is string => typeof a === 'string') : [];
    if (before !== null) {
      const now = declared(doc);
      const was = declared(await packDocument(id, before).catch(() => null));
      /* A DECLARATION SAID BY ITS OWN NAME, which a page for one row (`{{name}}`) does not have, and then by its id. */
      const nameOf = (key: string): string => {
        const d = now.get(key);
        const said = typeof d?.name === 'string' ? d.name : typeof d?.title === 'string' ? d.title : '';
        return said !== '' && !said.includes('{{') ? said : key.slice(key.indexOf('.') + 1);
      };
      if (losses(wholeDiff(diff), nameOf, new Set(was.keys())).length > 0) return;
    }
    await client.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, ...(approve.length === 0 ? {} : { approve }) }).catch(() => null);
  }

  /** The spoken id of the entry `create` answered, `<list>#<seq>`, which a link field takes, or `null`. */
  function spokenOf(entry: unknown): string | null {
    const e = entry as { register?: unknown; seq?: unknown } | null;
    return e !== null && typeof e.register === 'string' && typeof e.seq === 'number' ? `${e.register}#${e.seq}` : null;
  }

  /** An entry's title, whichever list it is for. */
  const titleOf = (fields: Record<string, unknown>): string => String(fields.what ?? fields.name ?? '');

  /**
   * Write the proposal into the record, in one press.
   *
   * `busy` IS THE CALLER'S. The screen holds the press while this runs, so a second press writes nothing twice.
   */
  async function accept(client: Client, asked: Accepting): Promise<Accepted> {
    const failed: NotMade[] = [];
    let nav: string[] | null = null;
    const held = await packsOf(client);
    if (!held.ok) return { failed: [{ said: firstRun.notAllMade, why: held.why }], left: asked.proposal.rows, nav, filed: false };
    let states = held.value;
    /* THE NAME THE PROPOSAL CARRIES, which the model may have read where the rules did not; the words after it stay the note. */
    const heard = hear(asked.sentence);
    const who = asked.proposal.name === heard.name ? heard : { name: asked.proposal.name, bio: heard.name === null ? heard.bio : asked.sentence.trim() };
    const names = asked.proposal.names;
    const u = asked.usecase === null ? null : (useCase(asked.usecase) ?? null);
    /* PEOPLE IS NEVER TURNED BACK ON BEHIND SOMEBODY WHO TURNED IT OFF. A name heard in the
       sentence keeps People in the proposal, and on a record where it is off that name is said back and stored nowhere;
       only a use case that cannot stand without People turns it on, as installing it from Browse would. */
    const off = states.some((p) => p.id === PEOPLE && p.disabled_at !== null) && !(u?.modules.includes(PEOPLE) ?? false);
    const modules = asked.modules.filter((id) => !(off && id === PEOPLE));

    /* ── the lists ─────────────────────────────────────────────────────────── */
    const cases = u ? [u, ...asked.also.flatMap((id) => (id === u.usecase ? [] : (useCase(id) ?? [])))] : [];
    const installed: UseCase[] = [];
    for (const one of cases) {
      /* THE CHOSEN ONE CARRIES WHAT THE PERSON KEPT; ONE BESIDE IT CARRIES ITS OWN MODULES, all in by then. */
      const file = await fileFor(one, one === u ? modules : one.modules, asked.today, who.bio);
      if (!file) continue;
      const planned = await planShared(
        client,
        { text: JSON.stringify(file), source: 'local' },
        states,
        async (m, h, id) => named(await packDocument(m, h, id), names),
        async (m, h, id) => named(await relabelDocument(m, h, id), names),
      );
      if (!planned.ok) {
        failed.push({ said: firstRun.notAdded(one.title), why: planned.fix });
        continue;
      }
      const put = await installShared(client, planned.plan, true);
      if (!put.ok) failed.push({ said: firstRun.notAdded(one.title), why: put.fix ?? '' });
      if (put.done.length > 0) {
        const after = await afterInstall(client, planned.plan, nav ?? asked.nav);
        if (after.nav) nav = after.nav;
      }
      if (put.ok) installed.push(one);
      const now = await packsOf(client);
      if (now.ok) states = now.value;
    }
    if (!u)
      for (const id of modules) {
        const refused = await addModule(client, id, states, names);
        if (refused !== null) failed.push({ said: firstRun.notAdded(nameOf(id)), why: refused });
        const now = await packsOf(client);
        if (now.ok) states = now.value;
      }

    /* PEOPLE IS PLANNED AGAIN WITH EVERY LIST IN (`refreshModule`): put in by this press before the lists it links to, or
       held already while this press added a list it links to, such as Money's. */
    const peopleOurs = !held.value.some((p) => p.id === PEOPLE);
    const added = states.some((s) => !held.value.some((h) => h.id === s.id));
    if (!off && (peopleOurs || added)) {
      await refreshModule(client, PEOPLE, states, names, peopleOurs ? null : held.value);
      const now = await packsOf(client);
      if (now.ok) states = now.value;
    }

    /* THE USE CASE CHOSEN SPEAKS, AND ANY BESIDE IT IS SET NOT TO, so no use case added later moves the voice by how its
       id sorts (`sharing.ts` `keepVoice`). With one use case there is nothing to write. */
    if (u && installed.length > 1) await keepVoice(client, await speakingStates(client, states), u.usecase, 'speaks');

    /* WHAT SLASH DRAFTED GOES IN AS A CHANGE, proposed and then decided in this press, which is the one way a change comes
       into a record (`slash.ts` `fileDrafted`). It is filed as it was drawn, its declarations and nothing else: the sample
       rows the preview drew were only examples. After the modules, since a page it makes may read one of their lists. */
    let filed = false;
    if (asked.drafted) {
      const kept = await fileDrafted(client as unknown as SlashClient, asked.drafted, true);
      filed = kept.kind !== 'refused';
      if (kept.kind === 'refused') failed.push({ said: words.notDrafted, why: kept.fix });
      else if (kept.kind === 'filed') failed.push({ said: words.draftWaits, why: kept.fix ?? '' });
      if (filed) {
        const now = await packsOf(client);
        if (now.ok) states = now.value;
      }
    }

    /* ── the person, first ─────────────────────────────────────────────────── */
    /* ONLY WITH PEOPLE ON, and People is on only where the person left it on: `introduce` reads the record, and a name heard
       with People off was said back on the preview and is stored nowhere.
       EVERY PERSON WHO SETS UP IS THE FIRST ENTRY IN THEIR PEOPLE: the name they typed, else the one they
       answered, else the name in the address they kept the record with. Before any client the sentence named. */
    const met = introduce(who, asked.email, states, { answered: asked.proposal.answers?.name ?? null, address: true });
    if (met) {
      const out = (await client.meet(met)) as Wire<{ row: { register: string; seq: number | null } | null; created: boolean; matched_by?: string }>;
      const row = out.ok ? out.value.row : null;
      if (row && row.seq !== null) {
        /* THE WORDS AFTER THE NAME ARE THE PERSON'S NOTE, which is where a sentence these rules could not read is kept. */
        if (out.ok && out.value.created && roleNote(who.bio) !== '') await client.update({ register: row.register, seq: row.seq, patch: { note: roleNote(who.bio) } }).catch(() => null);
        /* THIS IS THEM, SO THE ROW SAYS SO (People's `self`): their own commits and mail are never
           met as somebody new, and an imported copy of them folds into this row. A People list older than the part refuses
           it, and the row stays an ordinary person.
           ONLY A ROW THAT IS SURELY THEM: one this press added, or one already known by the address they signed in with.
           A row matched on a name alone may be somebody else of that name, and marking them as the owner would fold the
           owner's own commits into a stranger.
           THE RECORD ASKS ABOUT THEIR OTHER ROWS ON THIS WRITE (`ownRowsAsked` in `@braindog/record`), so nothing more is
           sent from here. */
        const theirs = out.ok && (out.value.created || out.value.matched_by === 'key');
        if (theirs) await client.update({ register: row.register, seq: row.seq, patch: { self: true } }).catch(() => null);
      } else {
        /* A PEOPLE LIST WITH NO PROJECTS TO LINK, a student's or a guide's, is one `meet` refuses (it writes the agents
           pack's fields), so the person is written as a plain entry instead, and is in People like anybody else. A name
           with no address is only a mention to `meet`, which keeps no row, and the person the record belongs to is no
           mention: they are written the same way. Marked as them where the list has the part, plain where it does not. */
        const fields = personRow(met, roleNote(who.bio));
        let plain = (await client.create({ register: PEOPLE, fields: { ...fields, self: true } }).catch(() => null)) as Wire<unknown> | null;
        if (!plain?.ok) plain = (await client.create({ register: PEOPLE, fields }).catch(() => null)) as Wire<unknown> | null;
        if (!plain?.ok) failed.push({ said: firstRun.notMet(met.name), why: fixOf(plain ?? out, '') });
      }
    }

    /* ── the currency ──────────────────────────────────────────────────────── */
    /* ASKED OF THE RECORD, NOT NAMED HERE: the module whose settings declare `home_currency` is the one that keeps it. */
    if (asked.currency !== null)
      for (const id of modules) {
        const read = (await client.packConfig({ id })) as Wire<{ config?: Record<string, unknown> }>;
        if (!read.ok || !Object.hasOwn(read.value.config ?? {}, 'home_currency')) continue;
        const set = (await client.setPackConfig({ id, values: { home_currency: asked.currency } })) as Wire<unknown>;
        if (!set.ok) failed.push({ said: firstRun.notSet, why: fixOf(set, '') });
        break;
      }

    /* ── the sentence's own entries ────────────────────────────────────────── */
    /* AN INVOICE POINTS AT THE CLIENT THE SENTENCE NAMED. "We bill Fenwick £2,000 a month" makes Fenwick and an invoice
       to him, and the client comes first in `rows`, so by the invoice's turn his spoken id is known and goes in its
       `party` field, which a link takes (`kernel/src/coerce.ts`). A client that was not written leaves the invoice
       written with no one on it rather than refused.
       WHAT WAS NOT WRITTEN IS HANDED BACK, so a press after a refusal writes only what did not go in, and never writes the
       client and the invoice twice. An entry left keeps its client: by spoken id once the client is written, else by its
       place among what is left. */
    const written = new Map<number, string>();
    const place = new Map<number, number>();
    const left: Proposal['rows'] = [];
    const on = new Set(states.filter((p) => p.disabled_at === null).flatMap((p) => p.registers));
    for (const [i, row] of asked.proposal.rows.entries()) {
      const to = row.party === undefined ? undefined : written.get(row.party);
      const fields = to === undefined ? row.fields : { ...row.fields, party: to };
      if (on.has(row.register)) {
        const wrote = (await client.create({ register: row.register, fields })) as Wire<unknown>;
        if (wrote.ok) {
          const spoken = spokenOf(wrote.value);
          if (spoken !== null) written.set(i, spoken);
          continue;
        }
        failed.push({ said: firstRun.notMade(titleOf(row.fields)), why: fixOf(wrote, '') });
      }
      const still = to === undefined && row.party !== undefined ? place.get(row.party) : undefined;
      place.set(i, left.length);
      left.push({ register: row.register, fields, ...(still === undefined ? {} : { party: still }) });
    }

    /* ── the one answer ────────────────────────────────────────────────────── */
    /* WHERE THEIR WORK ARRIVES, the one question the first run asked (`start/question.ts`), kept as the pref Today's next
       steps are ordered by (`arrivesBy`, `madeSteps`). Only now, with the record made: nothing is kept before the link. */
    const arrivesBy = asked.proposal.answers?.arrivesBy;
    if (arrivesBy !== undefined) writePref({ arrivesBy });

    /* ── the file they pointed at ─────────────────────────────────────────── */
    if (importsOf(asked.imported).length > 0) {
      const now = await packsOf(client);
      if (now.ok) states = now.value;
      /* THE CURRENCY THE PREVIEW DREW THE FILE IN: the one chosen for Money, or the one typed where Money is not kept. */
      const taken: string[] = [];
      for (const one of importsOf(asked.imported)) {
        const done = await importFile(client, one, asked.currency ?? asked.proposal.currency, asked.locale ?? 'en', states, taken).catch(() => [{ said: firstRun.importNotMade(one.mapping.name), why: '' }]);
        failed.push(...done);
      }
    }

    return { failed, left, nav, filed };
  }

  /** How many entries go to the record at once: enough to be quick, few enough not to crowd one record. */
  const AT_ONCE = 4;

  /**
   * THE FILE'S ENTRIES, WRITTEN INTO THE LIST IT MAPS TO: a list of its own filed and accepted first, as a drafted change
   * is, then each entry checked against its list and created. What could not be written is one line, with how many and
   * the record's first sentence for why; nothing else of the press is undone for it.
   */
  async function importFile(
    client: Client,
    imported: { file: Export; mapping: Mapping },
    currency: string | null,
    locale: string,
    states: readonly PackState[],
    taken: string[],
  ): Promise<NotMade[]> {
    const { file, mapping } = imported;
    let own = undefined;
    if (mapping.list === null) {
      own = ownList(file, mapping.name, currency, locale, [...new Set([...states.flatMap((p) => p.registers), ...allLists().map((l) => l.id), ...taken])]);
      taken.push(own.id);
      const change: Drafted = { question: firstRun.importAsk(mapping.name), change: { to: { declarations: newListDeclarations(own, mapping.summary) } }, rows: {}, preview: { pages: [] } };
      const kept = await fileDrafted(client as unknown as SlashClient, change, true);
      if (kept.kind !== 'kept') return [{ said: firstRun.importNotMade(mapping.name), why: kept.kind === 'refused' ? kept.fix : (kept.fix ?? '') }];
    } else if (!states.some((p) => p.disabled_at === null && p.registers.includes(mapping.list ?? ''))) {
      return [{ said: firstRun.importNotMade(mapping.name), why: '' }];
    }
    const out = entriesOf(file, mapping, currency, locale, own);
    const queue = [...out.fields];
    let refused = 0;
    let why = '';
    const worker = async () => {
      for (let fields = queue.shift(); fields !== undefined; fields = queue.shift()) {
        const wrote = (await client.create({ register: out.register, fields }).catch(() => null)) as Wire<unknown> | null;
        if (wrote?.ok) continue;
        refused++;
        if (why === '') why = wrote ? fixOf(wrote, '') : '';
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    const missed = refused + out.skipped;
    return missed === 0 ? [] : [{ said: firstRun.importMissed(missed, file.entries.length, mapping.name), why }];
  }

  return { accept: (asked) => accept(client, asked), importFile: (imported, currency, locale, states, taken) => importFile(client, imported, currency, locale, states, taken) };
}
