/**
 * The one primary button on a listing's page, as steps: read the record's plan for the document, then install what the
 * plan said.
 *
 * THE PLAN IS THE RECORD'S, AND WHAT INSTALLS IS WHAT WAS SHOWN. An add-on or a module is planned by `planPack`, and
 * `installPack` is sent the plan's `planHash` and the calls-out lines the sheet printed, so a record that moved in
 * between refuses the install instead of taking something nobody read. A use case is planned pack by pack by
 * `sharing.ts` `planShared` and installed by `installShared`, the path a shared file takes, then its example rows are
 * linked and its rail order kept (`afterInstall`), as onboarding does.
 *
 * ONLY THE OWNER INSTALLS FROM A BROWSER. Anybody else is refused by the record, and a Kennel entry is then asked for on
 * Decide instead (`catalogue.ts` `askForVersion`), where the owner reads the same plan.
 *
 * WHAT WAITS IS SAID AS SENTENCES ON THE SHEET (`waitsOf`): the parts the plan left out until the record holds a list.
 * What it sends is the plan sheet's own calls group (`$lib/market/plan.ts`).
 *
 * AN UPDATE THAT WAITS ON ANOTHER IS AN ORDER, NOT A DEAD END (`afterOthers`, `$lib/market/update-order.ts`). When the
 * record would refuse this plan over something another waiting update hands to it, that update's plan is read too and
 * both are on the one sheet, this one said as going in after it; Approve puts the holder in, plans this again and
 * installs that (`installInTurn`), as "Update all" on Add-ons does.
 */

import type { createClient } from '@braindog/client';
import type { CatalogueEntry, CatalogueIndex } from '@braindog/declare/catalogue';

import type { Listing } from '../../../lib/market/listing.ts';
import { holderFirst, marked, type Waiting } from '../../../lib/market/update-order.ts';
import { words } from '../../../lib/market/words.ts';
import { packDocument, relabelDocument, type PackState } from '../../../lib/record/packs.ts';
import { afterInstall, installShared, keepVoice, planShared, saidOf, speakingStates, switchTo, voiceQuestion, type SharedFrom, type SharedPlan } from '../sharing.ts';
import { firstPartyUpdates, inTurn, landed } from '../../decide/improved.ts';
import { askForVersion, indexForUpdates, readShippedCatalogue, updatesFor } from '../catalogue.ts';

type Wire<T> = { ok: true; value: T } | { ok: false; refusal?: { code?: string; fix?: string } };

/** The record's client, as every step here and in `sharing.ts` calls it. */
export type OfferClient = ReturnType<typeof createClient>;

/** A plan read and on the sheet: an add-on's or a module's `Diff`, or a use case's pack-by-pack plan. */
export type Planned =
  | { kind: 'pack'; doc: Record<string, unknown>; diff: unknown; planHash: string; approve: string[]; after?: After; source?: SharedFrom }
  | { kind: 'usecase'; plan: SharedPlan };

/** An update that waits, and where its file is from: the one planned, or another it may go in after. */
export type Offered = Waiting & { source: Listing['source'] };

/** One update of a run, with the plan the sheet showed for it. */
export type Turn = { of: Offered; planned: Planned };

/**
 * What a plan that waits on other updates carries beside the record's own `diff`: the updates that go in first, each
 * with its plan, and what the sheet draws (`shown`), their plans and then this one with each wait marked. `first` is
 * empty when the holder is named as a step to take and not taken along.
 */
export type After = { self: Offered; first: readonly Turn[]; shown: unknown };

/**
 * A refusal. From a run in turn it also carries `first`, the updates that really went in before the stop, by title
 * and in order, and `stopped`, the title of the one the run stopped at: neither is there when nothing went in.
 */
export type Refused = { ok: false; fix: string; code: string | null; first?: readonly string[]; stopped?: string };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const refusedOf = (r: Wire<unknown>, fallback: string): Refused => (r.ok ? { ok: false, fix: fallback, code: null } : { ok: false, fix: r.refusal?.fix ?? fallback, code: r.refusal?.code ?? null });

/** The labels of the keys a plan says are not in the keys yet, in order: what `again` compares to know a key went in. */
export const keysWanted = (p: Planned | null): string =>
  p?.kind === 'pack' && isMap(p.diff) && Array.isArray(p.diff.keys_missing) ? p.diff.keys_missing.map((k) => (isMap(k) ? String(k.label) : '')).join('\u0000') : '';

/** What the plan sheet draws: the record's `Diff`, or the use case's plan whole. */
export const diffOf = (p: Planned): unknown => (p.kind === 'pack' ? (p.after?.shown ?? p.diff) : p.plan);

/**
 * What a run in turn says. `unread`: the plan read again, once the one before it is in, asks for something the sheet
 * did not show. `installedAfter`: the run is done and took other updates in first, so the page names them beside
 * this one. `stoppedAfter`: the run was refused part way, so what did go in is named beside the refusal, and the one
 * it stopped at when its name is known. KEPT HERE AND NOT IN `lib/copy/packs.ts`, which `lib/copy.ts` spreads into what every screen loads.
 */
export const turnWords = {
  unread: 'This one now asks for something its plan did not show, so read its plan again.',
  installedAfter: (title: string, first: readonly string[]) => `${title} is installed, after ${and(first)}.`,
  stoppedAfter: (first: readonly string[], fix: string, stopped = '') => `${and(first)} ${first.length > 1 ? 'are' : 'is'} installed. ${stopped === '' ? 'The next one stopped' : `${stopped} stopped`}: ${fix}`,
} as const;

/** The words over what waits on the sheet, kept with the market's other words. */
export const sheetWords = { waits: words.waits, waitsNote: words.waitsNote, planMoved: words.planMoved } as const;

/** What a part waits for, said: a role any list may play in the market's own words (`words.waitsOn`), else the list by its name. */
const waitedFor = (h: string, nameOf: (id: string) => string): string => (Object.hasOwn(words.waitsOn, h) ? words.waitsOn[h]! : nameOf(h));

const and = (names: readonly string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * What the plan left out until the record holds a list (`Diff.waiting`), as sentences: "Clients waits until you have
 * People.", "2 parts of Clients wait until you have People."
 *
 * BY NAME, NEVER BY PLACE. The plan says where each part sits (`register.clients.fields[2]`), which is an address
 * nobody typed. A part is said by the list or page it belongs to, and counted when it is only a piece of one, and what
 * it waits for is the list's name as `nameOf` gives it, or a role in plain words. A use case's plan carries none, and
 * says nothing.
 */
export function waitsOf(p: Planned, nameOf: (id: string) => string): string[] {
  const waiting = p.kind === 'pack' && isMap(p.diff) && Array.isArray(p.diff.waiting) ? p.diff.waiting : [];
  const by = new Map<string, { owner: string; whole: boolean; parts: number; holds: string[] }>();
  for (const w of waiting) {
    if (!isMap(w) || typeof w.at !== 'string' || !Array.isArray(w.holds)) continue;
    const holds = [...new Set(w.holds.filter((h): h is string => typeof h === 'string' && h !== '').map((h) => waitedFor(h, nameOf)))];
    const m = /^([a-z_]+)\.([^.[]+)(.*)$/u.exec(w.at);
    if (holds.length === 0 || !m) continue;
    const owner = nameOf(m[1] === 'register' ? m[2]! : `${m[1]}.${m[2]}`);
    const key = `${owner}\u0000${holds.join('\u0000')}`;
    const n = by.get(key) ?? { owner, whole: false, parts: 0, holds };
    if (m[3] === '') n.whole = true;
    else n.parts += 1;
    by.set(key, n);
  }
  return [...by.values()].map((n) => {
    const until = `until you have ${and(n.holds)}`;
    if (n.whole) return `${n.owner} waits ${until}.`;
    return n.parts === 1 ? `One part of ${n.owner} waits ${until}.` : `${n.parts} parts of ${n.owner} wait ${until}.`;
  });
}

/**
 * The record's plan for a listing. `doc` is a plugin's verified document, or `null` for a module, whose document is
 * built for this record here; `text` is a use case's file, verified for a Kennel one and built for a built-in one.
 */
export async function planFor(
  client: OfferClient,
  listing: Pick<Listing, 'kind' | 'id' | 'source'> & { title?: string },
  file: { doc: Record<string, unknown> | null; text: string | null; from?: SharedFrom },
  states: readonly PackState[],
  fallback: string,
  /** What else waits, asked for only when this plan has something to wait for. Left out, the plan is the record's as it stands. */
  waiting?: () => Promise<readonly Offered[]>,
): Promise<{ ok: true; planned: Planned } | Refused> {
  /* WHERE IT CAME FROM GOES ON THE ADD-ON, and decides where its updates come from (`updatesFromStore`): the store's by
     id, a file or a link from nowhere but its own next file. One read from a file says so (`file.from`). */
  const source: SharedFrom = file.from ?? (listing.source === 'kennel' ? { kind: 'kennel' } : { kind: 'local' });
  if (listing.kind === 'usecase') {
    if (file.text === null) return { ok: false, fix: fallback, code: null };
    const out = await planShared(client, { text: file.text, source: source.kind, ...(source.ref === undefined ? {} : { ref: source.ref }) }, states, packDocument, relabelDocument);
    return out.ok ? { ok: true, planned: { kind: 'usecase', plan: out.plan } } : { ok: false, fix: out.fix, code: out.code };
  }
  /* A MODULE IS BUILT FOR THE RECORD IT GOES INTO (`packDocument`): a link to a list this record will not hold is left
     out, and it carries no example rows. */
  const doc = file.doc ?? (listing.kind === 'module' ? await packDocument(listing.id, states) : null);
  if (!doc) return { ok: false, fix: fallback, code: null };
  const planned = await client.planPack({ doc, source });
  if (!planned.ok) return refusedOf(planned, fallback);
  const read = isMap(planned.value) && isMap(planned.value.diff) ? planned.value.diff : null;
  const planHash = typeof read?.planHash === 'string' ? read.planHash : '';
  if (!read || planHash === '') return { ok: false, fix: fallback, code: null };
  /* THE KEYS IT SENDS THAT ARE NOT IN THE KEYS YET (`planPack`'s `keys`) ride beside the diff the sheet reads, as
     `keys_missing`, so every sheet says them as a stop before the press (`plan.ts` `keysOf`). Nothing is sent back. */
  const keys = isMap(planned.value) && Array.isArray(planned.value.keys) ? planned.value.keys.filter(isMap) : [];
  const diff = keys.length > 0 ? { ...read, keys_missing: keys } : read;
  const approve = Array.isArray(diff.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  const own: Planned = { kind: 'pack', doc, diff, planHash, approve, source };
  if (!waiting || !Array.isArray(diff.conflicts) || diff.conflicts.length === 0) return { ok: true, planned: own };
  const self: Offered = { key: `${listing.kind}:${listing.id}`, kind: listing.kind, id: listing.id, title: listing.title ?? '', source: listing.source, file };
  return { ok: true, planned: await afterOthers(own, self, await waiting(), (u) => planFor(client, u, u.file, states, fallback)) };
}

/**
 * A plan beside the updates it goes in after. A conflict is waited out only when the pack that holds the thing has an
 * update waiting whose document hands it to this one (`holderFirst`); that update is planned, and the two are one
 * sheet with the wait said under Worth knowing and stopping nothing (`marked`). A plan with no such conflict comes
 * back as it was.
 *
 * ONLY AN UPDATE THIS BUILD SHIPS IS TAKEN ALONG. A Kennel version is signed, and its key is read on its own page, so
 * it is named as the step to take first. So is a holder whose plan cannot be read. A holder that itself waits on a
 * third is planned as the record says it, and its own stop then shows.
 */
export async function afterOthers(own: Planned, self: Offered, waiting: readonly Offered[], plan: (u: Offered) => Promise<{ ok: true; planned: Planned } | Refused>): Promise<Planned> {
  if (own.kind !== 'pack') return own;
  const others = waiting.filter((o) => o.key !== self.key);
  if (!holderFirst(own.diff, others)) return own;
  const first: Turn[] = [];
  let rest = others.filter((o) => o.source === 'bundled');
  for (let holder = holderFirst(own.diff, rest); holder; holder = holderFirst(own.diff, rest)) {
    const taken = holder;
    rest = rest.filter((o) => o !== taken);
    const out = await plan(taken);
    if (out.ok) first.push({ of: taken, planned: out.planned });
  }
  const mine = marked(own.diff, others, first.map((t) => t.of));
  return { ...own, after: { self, first, shown: first.length > 0 ? [...first.map((t) => diffOf(t.planned)), mine] : mine } };
}

/**
 * Every update that waits on this record, as Add-ons' Updates tab reads them: the ones this build ships
 * (`firstPartyUpdates`) and the Kennel's, a Kennel version standing in for a built-in of the same name. A Kennel that
 * cannot be read leaves the built-in ones.
 */
export async function waitingOf(fetcher: typeof fetch, index: CatalogueIndex | null, states: readonly PackState[]): Promise<Offered[]> {
  const bundled = firstPartyUpdates(states).map((u): Offered => ({ key: u.key, kind: u.kind, id: u.id, title: u.title, source: 'bundled', file: u.file }));
  if (!index) return bundled;
  try {
    const out = await updatesFor(fetcher, await indexForUpdates(index, await readShippedCatalogue(fetcher), states), states);
    const far = out.updates.map((u): Offered => ({ key: `${u.entry.kind}:${u.entry.id}`, kind: u.entry.kind, id: u.entry.id, title: u.entry.title, source: 'kennel', file: { doc: u.file.kind === 'pack' ? u.file.file.doc : null, text: u.text } }));
    const taken = new Set(far.map((u) => u.key));
    return [...bundled.filter((u) => !taken.has(u.key)), ...far];
  } catch {
    return bundled;
  }
}

/** An install that went through: the arrangement to keep, and the updates a run in turn took in first, by title. */
/** `said` is what the update carried into a page or list he changed, in the record's sentences (RJ6), to say beside "Installed". */
export type Installed = { ok: true; nav: string[] | null; first?: readonly string[]; said?: readonly string[] };

const asksOf = (p: Planned): readonly string[] => (p.kind === 'pack' ? p.approve : p.plan.approve);

/**
 * Install a plan and the updates it goes in after, in turn (`improved.ts` `inTurn`): each holder, then this one
 * planned again, because the holder moved the record and only now does this plan read clean. One the holder already
 * brought in is passed over, and one that now asks for a line nobody was shown stops there. A plan that waits on
 * nothing is installed as it is. `by` is the record's own plan and install; a test hands in names.
 *
 * `first` IS WHO REALLY WENT IN BEFORE THIS ONE, by title and in order, for the page to say. One passed over is not
 * in it, and a plan that waited on nothing carries none. A RUN REFUSED PART WAY CARRIES IT TOO, with the title of the
 * one it stopped at, because those updates are in the record whatever the refusal says. A refusal before anything
 * went in carries neither.
 */
export async function installInTurn(
  planned: Planned,
  by: { replan: (u: Offered) => Promise<{ ok: true; planned: Planned } | Refused>; install: (p: Planned) => Promise<{ ok: true; nav: string[] | null; said?: readonly string[] } | Refused> },
): Promise<Installed | Refused> {
  if (planned.kind !== 'pack' || !planned.after || planned.after.first.length === 0) return by.install(planned);
  const { after, ...own } = planned;
  let nav: string[] | null = null;
  let code: string | null = null;
  /* `inTurn` installs the first plan as it stands and plans every later one again, so the one in hand is the last planned. */
  let at: Offered = after.first[0]!.of;
  const first: string[] = [];
  const said: string[] = [];
  const out = await inTurn<Offered, Planned>([...after.first.map((t) => ({ u: t.of, p: t.planned })), { u: after.self, p: own }], {
    replan: async (u) => {
      at = u;
      const fresh = await by.replan(u);
      if (!fresh.ok) code = fresh.code;
      return fresh;
    },
    asksOf,
    landed: (p) => landed(diffOf(p)),
    install: async (p) => {
      const went = await by.install(p);
      if (went.ok) nav = went.nav ?? nav;
      if (went.ok) said.push(...(went.said ?? []));
      else code = went.code;
      if (went.ok && at !== after.self && at.title !== '') first.push(at.title);
      return went;
    },
    unread: turnWords.unread,
  });
  if (out.fix === '') return { ok: true, nav, ...(first.length > 0 ? { first } : {}), ...(said.length > 0 ? { said } : {}) };
  return { ok: false, fix: out.fix, code, ...(first.length > 0 ? { first, ...(at.title !== '' ? { stopped: at.title } : {}) } : {}) };
}

/**
 * Install what the sheet showed. A use case's voice is kept by the rule's own answer (`voiceQuestion`), because the
 * sheet asks nothing of its own: an update keeps whoever speaks now.
 */
export async function install(
  client: OfferClient,
  planned: Planned,
  states: readonly PackState[],
  arrangement: readonly string[],
  fallback: string,
): Promise<Installed | Refused> {
  if (planned.kind === 'pack' && planned.after && planned.after.first.length > 0) {
    return installInTurn(planned, { replan: (u) => planFor(client, u, u.file, states, fallback), install: (p) => install(client, p, states, arrangement, fallback) });
  }
  if (planned.kind === 'pack') {
    /* A PLAN THAT TAKES A LIST AWAY WHILE IT HOLDS ITEMS SHOWED THAT STEP (`Diff.removals`), so Install on it is the
       press that lifts the refusal, keeping every item. */
    const removals = (planned.diff as { removals?: unknown } | null)?.removals;
    const out = await client.installPack({
      doc: planned.doc,
      source: planned.source ?? { kind: 'local' },
      planHash: planned.planHash,
      ...(planned.approve.length > 0 ? { approve: planned.approve } : {}),
      ...(Array.isArray(removals) && removals.length > 0 ? { retireWithRows: true } : {}),
    });
    if (!out.ok) return refusedOf(out, fallback);
    const said = saidOf(out.value);
    return { ok: true, nav: null, ...(said.length > 0 ? { said } : {}) };
  }
  const heard = await speakingStates(client, states);
  const updating = states.some((s) => s.id === `usecase-${planned.plan.usecase.id}`);
  const out = await installShared(client, planned.plan, true);
  if (!out.ok) return { ok: false, fix: out.fix ?? fallback, code: out.stale ? 'PLAN_STALE' : null };
  const after = await afterInstall(client, planned.plan, arrangement);
  const asked = updating ? null : voiceQuestion(heard, planned.plan.usecase.id);
  if (asked) await keepVoice(client, heard, planned.plan.usecase.id, asked.rule);
  return { ok: true, nav: after.nav, ...(out.said ? { said: out.said } : {}) };
}

/** Turn a listing on that this record holds and has off: a use case by switching to it, anything else by `enablePack`. */
export async function turnOn(client: OfferClient, listing: Pick<Listing, 'kind' | 'id' | 'installedId'>, states: readonly PackState[], carriesPack: boolean, fallback: string): Promise<{ ok: true } | Refused> {
  if (listing.kind === 'usecase') {
    const out = await switchTo(client, listing.id, states, carriesPack);
    return out.ok ? out : { ok: false, fix: out.fix, code: null };
  }
  const on = await client.enablePack({ id: listing.installedId });
  return on.ok ? { ok: true } : refusedOf(on, fallback);
}

/** Whether a refusal says this person may not install here, so a Kennel entry is asked for on Decide instead. */
export const notOwner = (code: string | null): boolean => code === 'FORBIDDEN' || code === 'NEEDS_BROWSER_SESSION' || code === 'NOT_OWNER';

/** A Kennel entry asked for on Decide, when this person may not install it. */
export async function askOnDecide(client: OfferClient, entry: CatalogueEntry, from: string | null): Promise<{ ok: true; id: string } | Refused> {
  const version = entry.versions.find((v) => v.yanked === undefined);
  if (!version) return { ok: false, fix: `${entry.title} has no version on offer.`, code: null };
  const out = await askForVersion(fetch, (name, args) => client.call(name, args), entry, version, from);
  return out.ok ? { ok: true, id: out.id } : out;
}

/**
 * THE PAGE ONE PRESS OPENS ONCE IT IS IN: the first page it adds that opens on its own, by
 * the title it is drawn with, or `null`. A page for each row needs a row chosen, and a title still reading a setting
 * (`{{config:…}}`) is no name to put on a button. Installed with nothing to open said only a grey "Installed".
 */
export function firstPageOf(pages: readonly { id: string; title: string }[], declared: readonly Record<string, unknown>[]): { id: string; title: string } | null {
  for (const p of pages) {
    const d = declared.find((x) => x.page === p.id);
    if (d !== undefined && typeof d.for === 'object' && d.for !== null) continue;
    if (p.title.includes('{{') || p.title.trim() === '') continue;
    return { id: p.id, title: p.title };
  }
  return null;
}
