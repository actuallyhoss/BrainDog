/**
 * Arranging a BrainDog by proposal: what an agent or Slash reads first, what it may ask for, and what the owner's press
 * applies.
 *
 * THE RECORD HAD NO WAY TO BE ARRANGED BY ANYBODY BUT ITS OWNER IN A BROWSER. Installing a pack, turning
 * one on or off and changing its settings are `ADMIN`, and no token of any scope reaches them (ADR-060).
 * That stays true. What is added is the question: a `pack`, `settings` or `arrange` suggestion, which is
 * filed with everything the owner needs to answer it and changes nothing until they accept it.
 *
 * WHAT A PROPOSAL WOULD DO IS WORKED OUT HERE, NEVER TAKEN FROM THE PROPOSER. The packs it installs, in
 * order, what each one adds, the calls out it asks the owner to approve and the settings as they stand
 * are all read from the catalogue and the record when the question is filed. Anything the proposer wrote
 * under those keys is dropped. On acceptance each pack is planned again, and a pack that now calls out
 * something the question did not show is refused `PLAN_STALE` rather than armed.
 *
 * THE CORE NAMES NO USE CASE. What a host offers is its catalogue, handed in as data; the only convention
 * read here is `declare`'s own, that a use case's pack is `usecase-<id>` and its voice is `voice_<key>`.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { conflictFault, installFault, installOrder, keptQuestion, labelsOf, laterVersion, packIdOf, plan, plannedState, readShared, install, labelSetting, stagedBatch, uninstall, unresolvedFault, SPEAKS, VOICE_KEYS, speakingPack, voiceOf as voiceIn, voiceSetting, voiceWrites, type Diff, type Host, type Installed, type InstallOptions, type Pack, type VoiceKey } from '@braindog/declare';
import { KEY_OPENED_UNATTENDED, KEY_OPENED_UNATTENDED_PASSPHRASE, approvalLines, configReads, configValue, egressChanged, egressOf, personNameOf, ulids, type ConfigDecl, type Declaration, type Json, type Kernel, type PlannedRecord } from '@braindog/kernel';
import type { FormSpec, NextSpec } from './slash.ts';
import { normaliseChecked } from './theme-check.ts';
import { retireMarks, takersFor } from './arrange-retires.ts';
import { notesKept, type KeptRow } from './arrange-keeps.ts';

/**
 * The record `plannedState` leaves, as `kernel.lint` reads one: each body parsed, and the pack that put it there.
 *
 * A BODY THAT WILL NOT PARSE IS STILL A DECLARATION, as the kernel's own `knownTo` keeps one, so a page requiring it is
 * not told it is missing.
 */
function plannedOf(state: Installed): [PlannedRecord['known'], PlannedRecord['owners']] {
  const known = new Map<string, Record<string, Json>>();
  const owners = new Map<string, string | null>();
  for (const row of state.declarations) {
    try {
      known.set(row.id, JSON.parse(row.body) as Record<string, Json>);
    } catch {
      known.set(row.id, {});
    }
    owners.set(row.id, row.pack_id);
  }
  return [known, owners];
}

/**
 * One thing a host offers to install: a pack, or a use case and the modules it builds on.
 *
 * `doc` IS A FUNCTION because a document is built when it is asked for, and a catalogue listed on every
 * read should not build nine of them.
 */
export type CatalogueEntry = {
  /** The pack id it installs as: `work`, or `usecase-student`. */
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  summary: string;
  /** The packs installed before it, in order. */
  modules: readonly string[];
  /**
   * `false` FOR WHAT IS INSTALLED AND NEVER OFFERED: core, the pages every record holds, which a use case and the first run
   * install by its id. It is found as any entry is, and left out of every list of what is on offer.
   */
  offered?: false | undefined;
  /**
   * The version `doc` builds, when the host knows it without building one, so a pack on at an older version is offered as
   * an update. Absent, the document is built to read it, and only for a pack a proposal names.
   */
  version?: string | undefined;
  /**
   * The document to install, for a record that holds `holds` once the packs before it are in, so a link to a list
   * the record will not hold can be left out, and whose use case is `usecase` (its id, `team`), so a module carries
   * that use case's example rows as onboarding gives them, or none.
   */
  doc: (options: { holds: readonly string[]; usecase?: string | null }) => Record<string, unknown> | null;
  /**
   * What the installer does once the pack is in, through the ordinary write path: a use case links its example rows
   * to each other by title, because a seed carries no link (42 §5.2). OPTIONAL, and never a reason to fail the install.
   */
  afterInstall?: (io: RowIo) => Promise<unknown>;
  /**
   * What an update from an older version moves: numbers the older version kept typed, written as the rows the newer one
   * reads (`@braindog/seed` `carryForward`). Run wherever the record updates the pack, from the app, an agent's accepted
   * proposal or any other caller, after the install and before its examples are linked. OPTIONAL, and never a reason to fail.
   */
  carry?: (io: CarryIo, from: string) => Promise<number>;
  /** The skills a use case names for agents working in it, which Slash offers once it is on. */
  skills?: readonly { name: string; trigger: string; what?: string; body?: string; rev?: number; was?: readonly string[] }[] | undefined;
  /**
   * WHAT A USE CASE GROWS INTO, and when: once every figure test holds, Slash asks on Decide to install these packs beside it
   * (`slash.ts` `growsDrafts`). A guide whose idea stage is over grows into Projects and Work. Nothing is taken away.
   */
  grows?: Grows | undefined;
  /**
   * WHAT A USE CASE FORMS AROUND WHAT THE PERSON SAID, when a model is configured: the lists and limits of a first plan, which
   * Slash asks the model for and files on Decide as rows (`slash.ts` `formedRows`, the record's `slashForm`).
   */
  forms?: FormSpec | undefined;
  /** What moves on when a row of a use case's list is reached, asked once on Decide or done as its setting says (`NextSpec`). */
  next?: NextSpec | undefined;
};

/** One test of a figure the use case declares, as a page block's `when:` is written. */
export type FigureTest = { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number };

/** What a use case grows into: the tests that say it is time, the packs to add, the question Decide asks and the short reason it gives. */
export type Grows = { when: readonly FigureTest[]; install: readonly string[]; question: string; why: string };

/** The rows of a list, and one link set on one row, as the owner who accepted. */
export type RowIo = {
  rows: (register: string) => Promise<readonly { seq: number | null; fields: Record<string, unknown> }[] | null>;
  link: (register: string, seq: number, field: string, spoken: string | readonly string[]) => Promise<boolean>;
};

/** A `RowIo` that also writes a row and empties one field, as the owner who pressed. */
export type CarryIo = RowIo & {
  create: (register: string, fields: Record<string, unknown>) => Promise<boolean>;
  clear: (register: string, seq: number, field: string) => Promise<boolean>;
};

/** The ordinary write path as an install's steps use it, signed by `actor`. */
export function rowIo(kernel: Kernel, actor: string): CarryIo {
  return {
    rows: async (register) => {
      const read = kernel.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) =>
      kernel.update(register, `${register}#${seq}`, { [field]: spoken }, { actor, cascade: false, note: 'Linked an example to the example it belongs with.' }).ok,
    create: async (register, fields) => kernel.create(register, fields as never, { actor, note: 'Carried forward from before the update.' }).ok,
    clear: async (register, seq, field) =>
      kernel.update(register, `${register}#${seq}`, { [field]: null }, { actor, cascade: false, note: 'Carried forward into its own row.' }).ok,
  };
}

/**
 * The catalogue's carry for a pack just updated from `from`, when it has one. Answers how many were moved; nothing when the
 * pack was new, the catalogue has no step, or the step throws.
 */
export async function carryUpdate(catalogue: readonly CatalogueEntry[], kernel: Kernel, id: string, from: string | null, actor: string): Promise<number> {
  const step = from === null ? undefined : catalogue.find((e) => e.id === id)?.carry;
  if (!step || from === null) return 0;
  return step(rowIo(kernel, actor), from).catch(() => 0);
}

type Body = Record<string, unknown>;

/** Who holds each add-on's file while a part of it waits (`installHeld`), in the record's own settings. */
const WAITING_HOLDER = 'braindog:waiting';

/**
 * `install`, with what the plan held back written on the add-on (migration 38) and the add-on's file kept beside it for as
 * long as a part waits.
 *
 * WHY THE FILE IS KEPT. A part that says `when: { holds: [people] }` is cut out of what the install stages, and the record
 * stores declarations and a manifest, never the file. So the day People arrives nothing the record held could say what
 * the part was. The file as it was read is kept until nothing of it waits, and the first install that leaves nothing
 * waiting takes it away again. Without its example entries: a part that lands by itself writes nothing nobody typed.
 */
export async function installHeld(kernel: Kernel, pack: Pack, diff: Diff, host: Host, planHash: string, approve: readonly string[] = [], because?: string, options: InstallOptions = {}): ReturnType<typeof install> {
  const waiting = diff.waiting ?? [];
  /* `because` IS WHY AN INSTALL NOBODY PRESSED HAPPENED, for the line history keeps of it (`planAgain`). */
  const more = { waiting, ...(because === undefined ? {} : { because }) };
  const put = await install(pack, diff, { ...host, remember: (row) => host.remember({ ...row, ...more } as Parameters<Host['remember']>[0]) }, planHash, approve, options);
  if (put.ok) kernel.setPref(WAITING_HOLDER, pack.manifest.pack, waiting.length > 0 ? { ...pack, seeds: [] } : null);
  return put;
}

/** The file of an add-on that is gone is let go with it. */
export const forgetHeld = (kernel: Kernel, id: string): void => kernel.setPref(WAITING_HOLDER, id, null);

/**
 * Whether a plan made again only brings parts that waited, and brings nothing a person has to be asked about.
 *
 * ADDITIVE: the same version over itself, with fewer parts waiting than before and none waiting that did not, so a part
 * that landed is never taken back out (the add-on that made it true may be off, and the part stays).
 * Nothing retired, renamed, retyped or taken over, and no other add-on left broken.
 * AND ONLY WHAT WAITED: every list, page or rule the plan would add or change holds a part that arrives. A setting somebody
 * changed and has not installed yet would otherwise ride in with it and rename a list nothing waited on, with no press.
 * OPTIONAL: no field made required. The grammar refuses `when` on a required field, and this is asked all the same.
 * AND NOTHING THAT REACHES OUTSIDE, which no plan is ever let do unasked (`@braindog/seed` `losses`).
 */
function arrivesAlone(pack: Pack, diff: Diff, before: readonly { at: string }[]): boolean {
  const was = new Set(before.map((w) => w.at));
  const still = diff.waiting ?? [];
  if (diff.direction !== 'reinstall' || still.length >= was.size || still.some((w) => !was.has(w.at))) return false;
  if (diff.retires.length + diff.conflicts.length + diff.renames.length + diff.retypes.length + diff.newly_required.length + diff.misreads.length > 0) return false;
  const left = new Set(still.map((w) => w.at));
  const came = [...was].filter((at) => !left.has(at));
  const brought = (id: string): boolean => came.some((at) => at === id || at.startsWith(`${id}.`) || at.startsWith(`${id}[`));
  if (![...diff.adds, ...diff.changes].every((c) => brought(c.id))) return false;
  if (diff.orphans > 0 || diff.unresolved.length > 0 || diff.dependents.some((p) => p.was && !p.ok)) return false;
  if (diff.approve.length > 0 || diff.calls_out.some((c) => c.change !== 'same')) return false;
  return installFault(pack, diff) === null;
}

/**
 * THE RULE AN ADD-ON'S PUBLISHER EARNS for a part that arrives: whether it lands with no press. Every publisher earns the
 * same today, since the file is the one the owner already installed at this version and `arrivesAlone` has passed it.
 * The one place a rule by publisher goes when the catalogue says who signed what.
 */
const earnsAlone = (_pack: Pack): boolean => true;

/** What a person calls a role a part can wait for, where no list of that name says it. */
const ROLE_WORDS: Readonly<Record<string, string>> = { rates: 'Exchange rates', meets: 'People', org: 'Organisations' };

/** Why a plan made again landed, as history says it: "1 part that waited for People arrived." */
function arrivedSaid(kernel: Kernel, before: readonly { at: string; holds: readonly string[] }[], still: readonly { at: string }[]): string {
  const left = new Set(still.map((w) => w.at));
  const came = before.filter((w) => !left.has(w.at));
  const names = [...new Set(came.flatMap((w) => w.holds))].map((hold) => {
    const words = hold.replace(/_/gu, ' ');
    return kernel.register(hold)?.name ?? ROLE_WORDS[hold] ?? words.charAt(0).toUpperCase() + words.slice(1);
  });
  const said = names.length <= 1 ? (names[0] ?? 'this BrainDog') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  return `${came.length === 1 ? '1 part' : `${came.length} parts`} that waited for ${said} arrived.`;
}

/**
 * AFTER AN INSTALL, AN UPDATE OR A SWITCH-ON: every add-on with a part waiting is planned again over what the record holds
 * now, and a part whose wait is over lands. Answers the add-ons something landed for.
 *
 * BEFORE: a field that waited for People stayed out for good once People was installed, until somebody installed the
 * add-on a second time by hand. Now it is there within the next plan, with no press.
 *
 * ONE PASS, EACH ADD-ON PLANNED ONCE, in the order they would install (`installOrder`). What waits is read once, before
 * anything is planned, and an install made here does not start another pass: two add-ons that wait on each other each
 * get one plan a pass, and a part the pass itself made true lands after the next install or switch-on, never in a loop.
 *
 * AN ADD-ON THAT IS OFF IS LEFT, since a plan installed would turn it on, and turning it on is what runs this again.
 * One whose file was not kept, or was kept at another version, is left too. Anything but parts arriving is left
 * (`arrivesAlone`), and so is a plan the install refuses.
 *
 * THE HOST SIGNS WHAT LANDS, as whoever's install or switch-on brought the part, and the install carries why
 * (`arrivedSaid`), so history says who and what for. Any throw is swallowed: the install that ran this is in, and a
 * part that could not land goes on waiting.
 */
export async function planAgain(d: { kernel: Kernel; installed: () => Installed; host: Host }): Promise<string[]> {
  const landed: string[] = [];
  try {
    const { kernel } = d;
    const waits = new Map(kernel.packsWaiting().map((p) => [p.id, p.waiting]));
    if (waits.size === 0) return landed;
    const kept = kernel.prefsOf(WAITING_HOLDER) as Record<string, Pack | undefined>;
    const states = new Map(kernel.packStates().map((p) => [p.id, p]));
    const files = new Map<string, Pack>();
    for (const id of waits.keys()) {
      const file = kept[id];
      const state = states.get(id);
      if (file !== undefined && state !== undefined && state.disabled_at === null && state.version === file.manifest.version) files.set(id, file);
    }
    const order = installOrder([...files.values()].map((f) => ({ id: f.manifest.pack, version: f.manifest.version, requires: f.manifest.requires.packs })), d.installed());
    for (const id of order) {
      /* ONE ADD-ON AT A TIME: a throw from one plan or install leaves that one waiting, and the ones after it are
         still tried. */
      try {
        const file = files.get(id)!;
        const diff = await plan(file, d.installed());
        const before = waits.get(id) ?? [];
        if (!arrivesAlone(file, diff, before) || !earnsAlone(file)) continue;
        if ((await installHeld(kernel, file, diff, d.host, diff.planHash, [], arrivedSaid(kernel, before, diff.waiting ?? []))).ok) landed.push(id);
      } catch {
        /* This one goes on waiting. */
      }
    }
  } catch {
    /* Said above: what could not land goes on waiting. */
  }
  return landed;
}

/** One current entry of the host's whole catalogue: `id` is the pack id a record holds it under, `modules` what goes in first. */
export type ShelfEntry = {
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  summary: string;
  version: string;
  modules: readonly string[];
  /** The widgets its newest version ships for the sheet, by title, as the index lists them; absent when it ships none. */
  widgets?: readonly string[];
};

/** A shelf entry with its document, fetched and held to its checksum and signature. */
export type ShelfFetched = ShelfEntry & { doc: Record<string, unknown> };

/**
 * THE HOST'S WHOLE CATALOGUE, beside the short list `catalogue` is (`catalogue-offers.ts` `shelfFromCatalogue`). `fetch`
 * answers `null` for an id it does not hold, and a refusal for one it holds that does not verify.
 */
export type CatalogueShelf = {
  listed: () => Promise<readonly ShelfEntry[]>;
  fetch: (id: string) => Promise<Result<ShelfFetched> | null>;
  /**
   * The catalogue's whole index, as the store reads it: every entry with who published it, its versions and what each
   * reaches. What `addons` and `addon` answer an agent from. Absent on a shelf made before it, which offers no listing.
   */
  index?: () => Promise<import('@braindog/declare/catalogue').CatalogueIndex | null>;
};

export type ArrangeDeps = {
  kernel: Kernel;
  catalogue: readonly CatalogueEntry[];
  installed: () => Installed;
  host: (actor: string) => Host;
  /** The host's whole catalogue. Absent, only the short list is offered. */
  shelf?: CatalogueShelf | undefined;
  /**
   * An install that is in and kept a page the owner changed: the record asks its one question about what the page goes
   * without (declare-edited-page-60, `keptAsk` in `index.ts`). `packSaid` is the add-on by the name the catalogue gives it.
   * It answers the lines that say what the update reworded on a page or list he changed (`rewordSaid`, RJ6), which go
   * in the press's answer as `said`, so Decide says them as the night does.
   */
  kept?: ((pack: Pack, diff: Diff, packSaid: (id: string) => string) => readonly string[] | void) | undefined;
};

/** What a proposal found in the host's whole catalogue: each document by pack id, the modules under it, and its entry. */
type Shelving = { docs: Map<string, Body>; sent: Map<string, readonly string[]>; found: Map<string, ShelfEntry> };
const shelving = (): Shelving => ({ docs: new Map(), sent: new Map(), found: new Map() });

/**
 * One part of a setup that was not written: the part by the id an arrangement gives it (`install:money`, `rows`, `me`),
 * the words a person reads for it, and the one sentence that says why.
 */
export type SetupPart = { part: string; label?: string; why: string };

/**
 * What `setup` answers. `done` is what landed, as an accepted arrangement says it: the add-ons `installed`, `enabled`
 * and `disabled`, the `settings` by add-on, the `pages` and `declarations`, `me` (the owner's own entry as it is spoken,
 * or `account` where People is off and the name is kept on the account), and the `rows` written. `failed` is each part
 * that was refused, with everything before it kept. `skipped` is what had nowhere to go and was passed over: a setting
 * no add-on keeps, a name with no use case to keep it, entries an earlier press already wrote.
 */
export type SetupAnswer = { done: Record<string, string[]>; failed: SetupPart[]; skipped?: SetupPart[] };

/** Where a setup keeps the handles of the presses whose entries it wrote, under a name no person holds. */
const SETUP_HOLDER = 'braindog:setup';
const SETUP_KEYS = 'rows';
const SETUP_KEYS_KEPT = 200;
/** Where a setup keeps the stretch of the log each press wrote, as `{ from, to, actor }` (PK1). */
const SETUP_MADE = 'made';
const SETUP_MADE_KEPT = 20;

/** One stretch of the log a setup wrote: the rowids from and to, and who it was signed by. */
export type MadeSpan = { from: number; to: number; actor: string };

/**
 * WHAT THE MAKING WROTE, by the stretches of the log each setup press took (PK1). Arrivals said "You added 6 to
 * Milestones" for a Guide's own plan, which the starter wrote from the sentence: a line inside one of these, by the one
 * who pressed, is the making's and not an arrival. Held in the record, so every device and every reader agrees.
 */
export function madeSpans(kernel: Pick<Kernel, 'prefsOf'>): MadeSpan[] {
  const kept = kernel.prefsOf(SETUP_HOLDER)[SETUP_MADE];
  if (!Array.isArray(kept)) return [];
  return kept.filter(
    (x): x is MadeSpan => isMap(x) && Number.isSafeInteger(x.from) && Number.isSafeInteger(x.to) && typeof x.actor === 'string' && (x.from as number) <= (x.to as number),
  );
}

/** Whether a line of the log is one the making wrote: inside a setup's stretch, by the one who pressed. */
export const madeLine = (spans: readonly MadeSpan[], line: { rowid: number; actor: string }): boolean =>
  spans.some((s) => line.rowid >= s.from && line.rowid <= s.to && line.actor === s.actor);

/** A use case's pack starts with this, by `declare`'s own convention. */
const USE_CASE = packIdOf('');

/** The record's packs with each use case's `speaks` setting read, as the voice rule reads them. */
const speakingStates = (kernel: Kernel) =>
  kernel.packStates().map((p) => {
    if (!p.id.startsWith(USE_CASE)) return { id: p.id, disabled_at: p.disabled_at };
    const read = kernel.packConfig(p.id);
    const said = read.ok ? read.value.values[SPEAKS] : null;
    return { id: p.id, disabled_at: p.disabled_at, speaks: typeof said === 'boolean' ? said : null };
  });

/** The use case this record speaks in now, by the voice rule (`declare` `voiceWhenAdding`), or `null` for the house voice. */
export const speakingNow = (kernel: Kernel): string | null => speakingPack(speakingStates(kernel));

/**
 * Write the voice rule down with `speaker` speaking (`declare` `voiceWrites`): it set to speak and every other use case on
 * set not to, only where that differs. A pack that refuses the setting is passed over; the rule still names one speaker.
 */
export function writeVoice(kernel: Kernel, speaker: string, actor: string): void {
  /* ONE BATCH FOR THE ANSWER, so a reader of the log (Home's feed) reads these lines as one change and never pairs them with
     another write's by where they sit. */
  const batch = ulids(() => Date.now())();
  for (const w of voiceWrites(speakingStates(kernel), speaker)) kernel.setPackConfig(w.id, { [SPEAKS]: w.speaks }, { actor, batch });
}

const isMap = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);
const refuse = <T>(code: Refusal['code'], fix: string, at?: string, allowed?: readonly string[]): Result<T> => ({
  ok: false,
  refusal: { code, fix, ...(at === undefined ? {} : { at }), ...(allowed === undefined ? {} : { allowed }) },
});
const listed = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.slice(0, 20).join(', '));
/* WHAT IS ON OFFER, BY NAME, AND THEN THE IDS a proposal sends, in the same order. */
const offered = (items: readonly { id: string; title: string }[]): string => {
  const shown = items.slice(0, 20);
  const more = items.length > shown.length ? `, and ${items.length - shown.length} more` : '';
  return `${shown.map((e) => e.title || e.id).join(', ')}${more} (by id: ${shown.map((e) => e.id).join(', ')})`;
};

/**
 * A key an arrangement needs, worked out by the record: its label, the one host it opens, whether a run by
 * itself uses it, and the parts that need it, so Decide unticks the part a missing key holds and leaves the rest.
 */
export type ArrangeNeed = { label: string; opens: string; scheduled: boolean; parts: string[] };

/**
 * THE KEYS IT NEEDS, FROM THE CALLS IT WOULD MAKE, as the kernel prints each (`CALLS OUT <host> · <cadence> · grant
 * "<label>"`, or a script's `key "<a>" to <host>, ...`). Never from the proposer: a `needs` it sends is not read, so a key
 * cannot be asked for that nothing in the arrangement opens, nor one left out that something does. A call with a cadence
 * runs with nobody signed in, so its keys are a scheduled run's.
 */
export function needsOf(approve: readonly string[]): Omit<ArrangeNeed, 'parts'>[] {
  const out = new Map<string, Omit<ArrangeNeed, 'parts'>>();
  for (const line of approve) {
    const m = /^CALLS OUT (.+?) · (.*)$/u.exec(line);
    if (!m) continue;
    const parts = m[2]!.split(' · ');
    const scheduled = parts.some((p) => /^(every \d+[smhdw]|daily|weekly)\b/u.test(p));
    const host = /^[\w-]+(\.[\w-]+)+(:\d+)?$/u.test(m[1]!) ? m[1]! : '';
    const keys: [string, string][] = [];
    for (const p of parts) {
      const grant = /^grant "(.*)"$/u.exec(p);
      if (grant && grant[1] !== 'none' && grant[1] !== '') keys.push([grant[1]!, host]);
      if (p.startsWith('key "'))
        for (const k of p.matchAll(/"([^"]+)" to (\S+)/gu)) {
          const to = k[2]!.replace(/,$/u, '');
          keys.push([k[1]!, /^[\w-]+(\.[\w-]+)+(:\d+)?$/u.test(to) ? to : '']);
        }
    }
    for (const [label, opens] of keys) {
      const was = out.get(label);
      out.set(label, { label, opens: was?.opens || opens, scheduled: (was?.scheduled ?? false) || scheduled });
    }
  }
  return [...out.values()];
}

/**
 * THE KEYS IT NEEDS, EACH WITH THE PARTS THAT NEED IT, so Decide unticks the part a missing key holds and leaves the
 * rest. `owners` is each part's own lines; a key two parts call out with is both parts'.
 */
export function needsByPart(approve: readonly string[], owners: ReadonlyMap<string, readonly string[]>): ArrangeNeed[] {
  return needsOf(approve).map((n) => ({
    ...n,
    parts: [...owners].filter(([, lines]) => needsOf(lines).some((m) => m.label === n.label)).map(([part]) => part),
  }));
}

/**
 * One call out of an arrangement, listed on the question by host and how often: the part that makes it,
 * the host it goes to, the interval it runs on (`null` when only a rule runs it), and the most a rule may make in a day.
 */
export type ArrangeCall = { part: string; host: string | null; every: string | null; per_day: number | null };
type Call = ArrangeCall;
const callAt = (part: string, host: string | null, every: string | null, per_day: number | null): Call => ({ part, host, every, per_day });

/**
 * TWO ARRANGEMENTS WITH ONE CAUSE AS ONE QUESTION: the open one, widened with the parts of the next, which
 * govern files in its place and notes once. Both are bodies as `prepare` filed them, so nothing here is the proposer's.
 *
 * WHAT BOTH CARRY IS SAID ONCE. An add-on installed by both, a line both call out and a part both hold are one; a page or
 * a declaration both send is the next one's, as the later reading; settings run in order, so the later value stands;
 * entries are the open one's and then the next one's, the next one's links moved past the open one's. A key both need is
 * one key, needed by the parts of both.
 */
export function arrangeUnion(open: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const maps = (x: unknown): Body[] => list(x).filter(isMap);
  const once = <T>(items: readonly T[], key: (t: T) => string): T[] => [...new Map(items.map((t) => [key(t), t] as const)).values()];
  const out: Body = { ...open };
  const set = (key: string, items: unknown[]) => {
    if (items.length === 0) delete out[key];
    else out[key] = items;
  };
  set('why', once([...list(open.why), ...list(next.why)], (w) => JSON.stringify(w)).slice(0, 12));
  if (out.usecase === undefined && next.usecase !== undefined) out.usecase = next.usecase;
  set('alongside', [...new Set([...list(open.alongside), ...list(next.alongside)])]);
  const a = isMap(open.packs) ? open.packs : {};
  const b = isMap(next.packs) ? next.packs : {};
  const packs: Body = {};
  for (const verb of ['install', 'enable', 'disable']) {
    const ids = [...new Set([...list(a[verb]), ...list(b[verb])])];
    if (ids.length > 0) packs[verb] = ids;
  }
  if (open.packs !== undefined || next.packs !== undefined) out.packs = packs;
  set('plan', once([...maps(open.plan), ...maps(next.plan)], (s) => `${String(s.pack)}${s.replan === true ? ' again' : ''}`));
  /* THE LINE EVERY KEY SHARES STAYS LAST, where `approvalLines` puts it. */
  const lines = [...new Set([...list(open.approve), ...list(next.approve)].filter((l): l is string => typeof l === 'string'))];
  const last = (l: string) => l === KEY_OPENED_UNATTENDED || l === KEY_OPENED_UNATTENDED_PASSPHRASE;
  set('approve', [...lines.filter((l) => !last(l)), ...lines.filter(last)]);
  /* A PAGE OR A DECLARATION BOTH SEND IS THE NEXT ONE'S, in the open one's place. */
  const later = (key: string) => {
    const mine = maps(open[key]);
    const theirs = maps(next[key]);
    return [...mine.map((x) => theirs.find((y) => y.id === x.id) ?? x), ...theirs.filter((y) => !mine.some((x) => x.id === y.id))];
  };
  set('pages', later('pages'));
  set('declarations', later('declarations'));
  set('settings', [...maps(open.settings), ...maps(next.settings)]);
  const first = maps(open.rows).length;
  set('rows', [
    ...maps(open.rows),
    ...maps(next.rows).map((r) => (isMap(r.links) ? { ...r, links: Object.fromEntries(Object.entries(r.links).map(([f, to]) => [f, typeof to === 'number' ? to + first : to])) } : r)),
  ]);
  set('calls', once([...maps(open.calls), ...maps(next.calls)], (c) => `${String(c.part)} ${String(c.host)} ${String(c.every)}`));
  /* AND EACH AS DECIDE'S SENTENCE READS IT, once: the later reading of a call both make. */
  set('calls_out', once([...maps(open.calls_out), ...maps(next.calls_out)], (c) => `${String(c.part)} ${String(c.host)} ${String(c.every)} ${String(c.trigger)} ${String(c.grant)}`));
  /* A PART BOTH HOLD IS ONE, needing what either said it needs. */
  const parts = new Map<string, Body>();
  for (const p of [...maps(open.parts), ...maps(next.parts)]) {
    const had = parts.get(String(p.id));
    const requires = [...new Set([...list(had?.requires), ...list(p.requires)])];
    parts.set(String(p.id), { ...(had ?? p), ...(requires.length === 0 ? {} : { requires }) });
  }
  set('parts', [...parts.values()]);
  const needs = new Map<string, Body>();
  for (const n of [...maps(open.needs), ...maps(next.needs)]) {
    const had = needs.get(String(n.label));
    needs.set(
      String(n.label),
      had === undefined
        ? n
        : { ...had, opens: had.opens || n.opens, scheduled: had.scheduled === true || n.scheduled === true, parts: [...new Set([...list(had.parts), ...list(n.parts)])] },
    );
  }
  set('needs', [...needs.values()]);
  if (isMap(open.names) || isMap(next.names)) out.names = { ...(isMap(open.names) ? open.names : {}), ...(isMap(next.names) ? next.names : {}) };
  return out;
}

/** A part's id: a handle the accept names, never shown. */
const PART_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/u;

/**
 * THE CHOICES A PROPOSER LEAVES TO THE OWNER, each `{ id, question, suggested, options: [{ id, label, does }] }`, as the
 * page draws them (`arranged.ts` `choicesOf`). Two options or more, each with a name and a line of what it does, and the
 * suggested one among them.
 */
function choicesIn(raw: unknown): Result<Body[]> {
  if (raw === undefined) return ok([]);
  const shape = 'A choice is {"id":"<handle>","question":"...","suggested":"<option id>","options":[{"id":"<handle>","label":"...","does":"..."}]}.';
  if (!Array.isArray(raw) || raw.length > 12) return refuse('VALUE_MALFORMED', `choices is a list of at most 12. ${shape}`, 'body.choices');
  const out: Body[] = [];
  const seen = new Set<string>();
  for (const [i, c] of raw.entries()) {
    const at = `body.choices[${i}]`;
    if (!isMap(c) || typeof c.id !== 'string' || !PART_ID.test(c.id) || typeof c.question !== 'string' || c.question.trim() === '' || !Array.isArray(c.options))
      return refuse('VALUE_MALFORMED', shape, at);
    if (seen.has(c.id)) return refuse('VALUE_MALFORMED', `Two choices share the handle ${c.id}. Give each its own.`, `${at}.id`);
    seen.add(c.id);
    if (c.options.length < 2 || c.options.length > 6) return refuse('VALUE_MALFORMED', 'A choice has two to six options.', `${at}.options`);
    const options: Body[] = [];
    for (const [j, o] of c.options.entries()) {
      const words = (x: unknown) => typeof x === 'string' && x.trim() !== '';
      if (!isMap(o) || typeof o.id !== 'string' || !PART_ID.test(o.id) || !words(o.label) || !words(o.does))
        return refuse('VALUE_MALFORMED', 'An option is {"id":"<handle>","label":"its name","does":"one line of what it does"}.', `${at}.options[${j}]`);
      if (options.some((x) => x.id === o.id)) return refuse('VALUE_MALFORMED', `Two options share the handle ${o.id}.`, `${at}.options[${j}].id`);
      options.push({ id: o.id, label: String(o.label).trim(), does: String(o.does).trim() });
    }
    if (typeof c.suggested !== 'string' || !options.some((o) => o.id === c.suggested))
      return refuse('VALUE_MALFORMED', 'suggested is the handle of one of its options, the one you would pick.', `${at}.suggested`);
    out.push({ id: c.id, question: c.question.trim(), suggested: c.suggested, options });
  }
  return ok(out);
}

export function arranger(d: ArrangeDeps) {
  const { kernel, catalogue } = d;
  /**
   * THE PACKS ANOTHER PACK HANDED DECLARATIONS TO, WHICH WERE NEVER INSTALLED: live declarations under the id and no `pack`
   * row. `packStates` reads a pack by what is live under it, so after money-core 1.8.0 handed an HSBC door on, `bank-hsbc-eg`
   * read as on at no version; the overview listed it and did not offer it, and a proposal to install it was refused
   * `TRANSITION_ILLEGAL` "already installed and on" (`declare`'s `test/plan-handover-shown.test.ts`). `packStates` marks
   * such a pack `handed` now, by the check this file first made for itself: a live `pack_id` naming a pack with no row.
   */
  const handedPacks = (): Set<string> => new Set(kernel.packStates().flatMap((s) => (s.handed === true ? [s.id] : [])));
  /* WHAT IS INSTALLED, which a handed pack is not: it is planned as an install, and its first install takes the handed
     declarations over (`declare` `plan`). */
  const states = () => kernel.packStates().filter((s) => s.handed !== true);
  const stateOf = (id: string) => states().find((s) => s.id === id);
  const on = (id: string) => stateOf(id)?.disabled_at === null;
  /* WHAT TURNING A PACK OFF STOPS, which a handed pack has: its door is live and answering. Read through `stateOf`, a handed
     pack was "not installed here, so it cannot be turned off", and the one way Decide had to stop a door money-core handed
     to `bank-hsbc-eg` was gone; before the arranger read handovers, the same proposal was filed and the door went off. */
  const running = (id: string) => kernel.packStates().find((s) => s.id === id);
  const entryOf = (id: string): CatalogueEntry | undefined =>
    catalogue.find((e) => e.id === id) ?? catalogue.find((e) => e.kind === 'usecase' && e.id === packIdOf(id));
  /** The version on offer for a pack, from the catalogue or the document sent with the proposal. */
  const offeredVersion = (id: string, docs: ReadonlyMap<string, Body>): string | null => {
    const sent = docs.get(id)?.version;
    if (typeof sent === 'string') return sent;
    const entry = entryOf(id);
    if (!entry) return null;
    if (entry.version !== undefined) return entry.version;
    const built = entry.doc({ holds: heldBy(d.installed()), usecase: null })?.version;
    return typeof built === 'string' ? built : null;
  };
  /**
   * AN UPDATE: a pack on at a version older than the one on offer. It is planned and installed like any other, over the one
   * there, and the catalogue's carry step moves what the older version kept typed (`carryUpdate`).
   */
  const updateOf = (id: string, docs: ReadonlyMap<string, Body>): { from: string; to: string } | null => {
    const held = stateOf(id);
    if (!held || held.disabled_at !== null || held.version === null) return null;
    const offered = offeredVersion(id, docs);
    return offered !== null && offered !== held.version && laterVersion(offered, held.version) === offered ? { from: held.version, to: offered } : null;
  };
  const speakerNow = (): string | null => speakingNow(kernel);
  /* THE USE CASE SPEAKING, by the rule and the setting a person chose, never simply the first one on. */
  const useCaseOn = (): string | null => speakerNow();
  const waiting = (): string[] => {
    const open = kernel.openSuggestions();
    return open.ok ? open.value.filter((r) => r.body_kind === 'arrange').map((r) => String(r.id)) : [];
  };

  /* ONE SENTENCE THAT NAMES WHAT IS OFFERED, the short list and the whole catalogue together. */
  const notOffered = (id: string, at: string, shelf: readonly ShelfEntry[] = []): Result<never> => {
    const all = [...catalogue.filter((e) => e.offered !== false).map((e) => ({ id: e.id, title: e.title })), ...shelf.filter((x) => !catalogue.some((e) => e.id === x.id))];
    return refuse(
      'DECLARATION_UNKNOWN',
      all.length === 0
        ? `This host offers no catalogue, so ${id} cannot be found by its id. Send the pack document as doc.`
        : `There is no add-on called ${id} on offer here, and what is on offer is ${offered(all)}.`,
      at,
    );
  };

  /* THE NAME A PACK FROM THE WHOLE CATALOGUE WAS FETCHED UNDER, for a sentence about it once it is planned. */
  const shelfTitles = new Map<string, string>();
  const titleOf = (id: string): string => entryOf(id)?.title ?? shelfTitles.get(id) ?? id;

  /**
   * THE IDS ASKED, FOUND: in the short list, in a document sent, or else in the host's whole catalogue, fetched and held to
   * its checksum as an update is. The modules under one found there are found the same way. Answers each id as the record
   * installs it (`student` is `usecase-student`), or the refusal for the first not offered or not verified.
   */
  async function shelved(ids: readonly string[], at: string, into: Shelving, sent: ReadonlyMap<string, Body> = new Map()): Promise<Result<string[]>> {
    const out: string[] = [];
    for (const [i, asked] of ids.entries()) {
      const queue = [asked];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const entry = entryOf(id);
        if (entry || sent.has(id) || into.docs.has(id) || into.found.has(id) || !d.shelf) {
          if (id === asked) out.push(entry?.id ?? id);
          continue;
        }
        const fetched = await d.shelf.fetch(id);
        if (fetched === null) {
          /* A MODULE NOTHING OFFERS IS LEFT FOR `expand` TO SAY, as it says one under a short-list entry, and so is a pack
             this record holds that the catalogue does not: "already installed" is the true answer, not "not on offer". */
          if (id !== asked || stateOf(id)) {
            if (id === asked) out.push(id);
            continue;
          }
          return notOffered(asked, `${at}[${i}]`, await d.shelf.listed());
        }
        if (!fetched.ok) return { ok: false, refusal: { ...(fetched as { refusal: Refusal }).refusal, at: `${at}[${i}]` } };
        const { doc, ...found } = fetched.value;
        into.docs.set(found.id, doc);
        into.sent.set(found.id, found.modules);
        into.found.set(found.id, found);
        shelfTitles.set(found.id, found.title);
        if (id === asked) out.push(found.id);
        queue.push(...found.modules);
      }
    }
    return ok(out);
  }

  /* ── reading ─────────────────────────────────────────────────────────── */

  /**
   * How this BrainDog is arranged, compactly: its packs, what else is on offer, its voice and other
   * settings, the pages the caller can open, and the arrangements already waiting.
   */
  async function overview(pages: readonly { slug: string; title: string }[]): Promise<Body> {
    const packs = states();
    /* A PACK ON AT AN OLDER VERSION THAN THE ONE OFFERED, which a `pack` install proposal updates, PLANNED AS `propose` PLANS
       IT. This listed every declaration the owner had changed as `keeps`, read from the record's history without building a
       document, and so told an agent that money-core 1.7.0 kept an edited `register.fx` when `propose` for the same update
       was refused `PROVIDES_CONFLICT`, because 1.7.0 adds a field to that list. Measured on `arrange-keeps.test.ts`. Now
       the update is planned through `planAll`, the one `propose` calls, and says what it keeps or the refusal it would get.
       IT IS EXPANDED FIRST, AS `propose` EXPANDS IT: planned alone, a money-core 1.7.0 reading a list only portfolio 1.5.0
       adds was said as refused `REGISTER_UNRESOLVED`, while `propose` for it updated portfolio first and filed. */
    const updates: Body[] = [];
    for (const p of packs) {
      const version = p.disabled_at === null && p.version !== null ? entryOf(p.id)?.version : undefined;
      if (version === undefined || version === p.version || laterVersion(version, p.version) !== version) continue;
      const order = expand([p.id], 'body.install', new Map());
      const planned = order.ok ? await planAll(order.value.install, new Map()) : order;
      if (!planned.ok) {
        const { code, fix } = (planned as { refusal: Refusal }).refusal;
        updates.push({ id: p.id, from: p.version, to: version, refused: { code, fix } });
        continue;
      }
      const keeps = planned.value.plan.flatMap((step) => (Array.isArray(step.keeps) ? (step.keeps as string[]) : []));
      updates.push({ id: p.id, from: p.version, to: version, ...(keeps.length === 0 ? {} : { keeps }) });
    }
    const settings: Record<string, Body> = {};
    for (const p of packs) {
      if (p.disabled_at !== null) continue;
      const config = kernel.packConfig(p.id);
      if (!config.ok) continue;
      const values = Object.fromEntries(Object.entries(config.value.values).filter(([key]) => !key.startsWith('voice_')));
      if (Object.keys(values).length > 0) settings[p.id] = values;
    }
    const voicePack = useCaseOn();
    const said: Body = {};
    if (voicePack) {
      const config = kernel.packConfig(voicePack);
      if (config.ok)
        for (const key of VOICE_KEYS) {
          const v = config.value.values[voiceSetting(key)];
          if (typeof v === 'string' && v) said[key] = v;
        }
    }
    const held = new Set(packs.map((p) => p.id));
    /* A HANDED PACK IS LISTED AS ONE, so an agent reading this says "holds a door money-core handed it, not installed" and
       offers the install or turning it off, rather than naming it among the packs the owner chose. */
    const handed = [...handedPacks()].sort().map((id) => ({ id, handed: true }));
    /* AND EVERY CURRENT ENTRY OF THE HOST'S WHOLE CATALOGUE, said as the short list says one: a proposal installs it by its
       id, and the record fetches it and holds it to its checksum then. */
    const shelf = d.shelf ? (await d.shelf.listed()).filter((e) => !held.has(e.id) && !catalogue.some((c) => c.id === e.id)) : [];
    return {
      packs: [...packs.map((p) => ({ id: p.id, ...(p.version === null ? {} : { version: p.version }), ...(p.disabled_at === null ? {} : { off: true }) })), ...handed],
      offer: catalogue
        .filter((e) => !held.has(e.id) && e.offered !== false)
        /* A PACK IS ITS ID AND ONE LINE; a use case says so, and its title, because that is what a person is offered. */
        .map((e) => ({
          id: e.id,
          ...(e.kind === 'usecase' ? { usecase: e.title } : {}),
          summary: e.summary,
          ...(e.modules.length === 0 ? {} : { modules: e.modules }),
        }))
        .concat(
          shelf.map((e) => ({
            id: e.id,
            ...(e.kind === 'usecase' ? { usecase: e.title } : {}),
            summary: e.summary,
            ...(e.modules.length === 0 ? {} : { modules: [...e.modules] }),
          })),
        ),
      ...(updates.length === 0 ? {} : { updates }),
      /* THE KEYS ARE IN braindog:grammar/proposals, read once; here is only what this record says. */
      voice: { pack: voicePack, said },
      ...(Object.keys(settings).length === 0 ? {} : { settings }),
      pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
      waiting: waiting(),
    };
  }

  /** One page's declaration, as installed, to read before proposing a change to it. */
  function declaration(asked: string, pages: readonly { slug: string; template?: string | null }[]): Result<Body> {
    const slug = asked.startsWith('page.') ? asked.slice('page.'.length) : asked;
    /* A PAGE MADE FOR EACH ROW OF A LIST HAS NO DECLARATION OF ITS OWN: its source is its template's, which is what a
       change to it is written from (`docs/06-PAGES.md` §1). Asked only once the expanded page is visible to this caller. */
    const seen = pages.find((p) => p.slug === slug);
    const id = `page.${seen?.template ?? slug}`;
    const row = seen ? kernel.declarations().find((r) => r.id === id && r.kind === 'page') : undefined;
    if (!row)
      return refuse(
        'PAGE_UNKNOWN',
        `There is no page declaration page.${slug} that you can read. The pages are: ${listed(pages.map((p) => p.slug))}.`,
        'page',
      );
    const body = JSON.parse(row.body) as Body;
    return ok({ id: row.id, version: row.version, pack: row.pack_id ?? (typeof body.pack === 'string' ? body.pack : null), body });
  }

  /* ── filing ──────────────────────────────────────────────────────────── */

  /**
   * The packs to install and to turn on, dependencies first, for what was asked. Already on is skipped, unless a newer
   * version is offered: of what was asked, or of a module under it, which the shared-file install already plans.
   */
  function expand(ids: readonly string[], at: string, docs: ReadonlyMap<string, Body>, sent: ReadonlyMap<string, readonly string[]> = new Map()): Result<{ install: string[]; enable: string[] }> {
    const install: string[] = [];
    const enable: string[] = [];
    const seen = new Set<string>();
    for (const [i, asked] of ids.entries()) {
      const entry = entryOf(asked);
      const target = entry?.id ?? asked;
      if (!entry && !docs.has(target)) return notOffered(asked, `${at}[${i}]`);
      for (const id of [...(entry?.modules ?? sent.get(target) ?? []), target]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const state = stateOf(id);
        if (state && state.disabled_at === null) {
          if (updateOf(id, docs)) install.push(id);
          continue;
        }
        if (state) enable.push(id);
        else if (entryOf(id) || docs.has(id)) install.push(id);
        else return notOffered(id, `${at}[${i}]`);
      }
    }
    return ok({ install, enable });
  }

  /**
   * `kept` is each declaration an update leaves as the owner changed it, with the name the owner gave it. `order` is the
   * packs in the order they install, which is the order a proposal files and `apply` runs. `state` is the record as the
   * last of them leaves it, which an arrangement's pages are linted against. `calls` is each pack's own lines and what
   * it calls out, so a key and a call are said beside the part that needs them, never only for the whole.
   */
  type Planned = {
    order: string[];
    plan: Body[];
    approve: string[];
    state: Installed;
    config: Map<string, Record<string, ConfigDecl>>;
    packs: Map<string, Pack>;
    kept: Map<string, string>;
    calls: Map<string, { approve: string[]; out: Call[]; sent: Body[] }>;
  };

  /**
   * A declaration by the name the record holds for it now, which for one the owner changed is theirs and not the pack's.
   * `owned` says a page and a list as the owner's ("your My money page"), for a sentence addressed to them.
   */
  const spokenOf = (id: string, owned = true): string => {
    const row = kernel.declarations().find((r) => r.id === id);
    let body: Body = {};
    try {
      body = row ? (JSON.parse(row.body) as Body) : {};
    } catch {
      /* A body that will not parse is said by its id. */
    }
    /* A LIST'S `title` IS THE FIELD ITS ROWS ARE TITLED BY, so a list is said by `name`: measured, `register.fx` came out
       as "your currency list". A page's `title` is its name. */
    const said = id.startsWith('page.') ? body.title : body.name;
    const name = typeof said === 'string' && said !== '' ? said : null;
    if (name === null) return id;
    if (!owned) return name;
    return id.startsWith('page.') ? `your ${name} page` : id.startsWith('register.') ? `your ${name} list` : name;
  };

  /** Each pack planned in order, each against the record as the ones before it would leave it. Nothing is written. */
  async function planAll(asked: readonly string[], docs: ReadonlyMap<string, Body>, given: ReadonlyMap<string, Body> = new Map()): Promise<Result<Planned>> {
    /* THE LIVE DOORS AN UPDATE WOULD RETIRE, and the add-ons that take one over, joined as their own steps (retires-48). */
    const takers = await takersFor(d, asked, docs);
    asked = [...asked, ...takers.adds];
    docs = new Map([...docs, ...takers.docs]);
    const base = d.installed();
    /* IN THE ORDER THAT INSTALLS, and not the order asked. The owner can only accept an arrangement, and `base` 2.0.0
       named before the `leaf` 1.1.0 that takes it was filed and refused `PACK_REQUIRED` at the accept, telling him to
       do "first" an update that was already in it. */
    const coming: { id: string; version: string; requires: Readonly<Record<string, string>> }[] = [];
    for (const id of asked) {
      const read = await packOf(id, docs, heldBy(base), useCaseFor(asked, id));
      if (!read.ok) return read;
      coming.push({ id, version: read.value.manifest.version, requires: read.value.manifest.requires.packs });
    }
    const ids = installOrder(coming, base);
    let state: Installed = base;
    const out: Planned = { order: ids, plan: [], approve: [], state: base, config: new Map(), packs: new Map(), kept: new Map(), calls: new Map() };
    for (const id of ids) {
      const read = await packOf(id, docs, heldBy(state), useCaseFor(ids, id));
      if (!read.ok) return read;
      const pack = read.value;
      /* THE SETTINGS SENT FOR IT FILL THE INSTALL, so what reads them is planned, approved and written with them. */
      const diff = await plan(pack, state, { settings: given.get(id), live: takers.live });
      const unheld = unresolvedFault(diff);
      if (unheld) return { ok: false, refusal: unheld };
      const clash = diff.conflicts[0];
      /* AN EDIT THE UPDATE WOULD BREAK IS SAID AS ONE, by the names the owner reads: "retire page.money first" told them
         to throw away their own Money page. */
      const edited = conflictFault(diff, (x) => (x === id ? titleOf(id) : spokenOf(x)));
      if (edited) return { ok: false, refusal: { ...edited, at: 'body.packs' } };
      if (clash)
        return refuse('PROVIDES_CONFLICT', `${id} would take over ${clash.id}, which ${clash.pack} holds. Leave ${id} out, or retire ${clash.id} first.`, 'body.packs');
      /* AND EVERY OTHER REFUSAL THE ACCEPT WOULD GIVE, from the same function `install` asks, so what is filed installs. */
      const fault = installFault(pack, diff);
      if (fault) return { ok: false, refusal: { ...fault, at: 'body.packs' } };
      /* AND WHAT THE KERNEL REFUSES AT `host.stage`, which `installFault` cannot see: it reads the diff, and the stage
         is the kernel's `stageInstall` over the batch with the record laid under it. Two packs each declaring
         `scopes:`, as one arrangement, were filed, and the accept installed the first and answered "register.things
         already declares scopes: ... Already applied, and kept: one." (`test/arrange-kernel-lint.test.ts`). Asked of
         the batch `install` stages, against `state`, the record as the packs before this one leave it, so a list an
         earlier update in the same arrangement retires is not held against this one.

         `kernel.lint` WITH THE PLANNED RECORD, AND NOT `declare`'s `stagedFault`, which an earlier build used and which
         asks `validate` alone. The rest of what `stageInstall` asks read the table, and five arrangements were filed
         that the accept refused: a narrowed `tags` under a live rule, a rule tagging a list the pack before it types
         `int`, a page filtering a list the pack before it declares on a field it lacks, a rule asking Slash on a host
         that answers none, and (for the pages, below) a `where:` over `rates` beside an update retiring `fx`. */
      const staging = kernel.lint(stagedBatch(pack, diff) as Declaration[], ...plannedOf(state));
      if (staging) return { ok: false, refusal: { ...staging, at: 'body.packs' } };
      /* A REBASED LIST IS NOT KEPT: its update installs, with what the owner or another pack laid put back on it. Filed
         as `keeps`, Decide said "This update's version of it is not taken" of an update that was. */
      const kept = new Set(diff.kept.filter((k) => k.rebased === undefined).map((k) => k.id));
      const rebased = diff.kept.filter((k) => k.rebased !== undefined).map((k) => k.id);
      const changes = [...diff.changes.map((c) => c.id), ...rebased.filter((k) => !diff.changes.some((c) => c.id === k))];
      for (const k of kept) out.kept.set(k, spokenOf(k, false));
      const from = state.packs.find((p) => p.id === id)?.version ?? null;
      out.plan.push({
        pack: id,
        ...(from === null ? {} : { from }),
        version: pack.manifest.version,
        adds: diff.adds.map((a) => a.id),
        ...(changes.length === 0 ? {} : { changes }),
        /* WHAT AN UPDATE TAKES AWAY, with the rows it keeps, so Decide says it beside what it adds. AND `to` FOR WHAT
           IT HANDS ON INSTEAD: copied as `{ id, rows }`, the HSBC door money-core hands to `bank-hsbc-eg` and keeps
           live was filed exactly as one it retires (`declare`'s `test/plan-handover-shown.test.ts`). `to_name` IS THAT
           PACK AS THE CATALOGUE CALLS IT, since it is not installed and Decide has nothing else to name it by: "Bank
           hsbc eg", from its id, is not what the owner would look for. */
        ...(diff.retires.length === 0
          ? {}
          : {
              retires: diff.retires.map((x) => {
                const to = x.to === undefined ? undefined : (entryOf(x.to)?.title ?? shelfTitles.get(x.to));
                return { id: x.id, rows: x.rows, ...(x.to === undefined ? {} : { to: x.to }), ...(to === undefined ? {} : { to_name: to }), ...retireMarks(x, takers) };
              }),
            }),
        /* WHAT IT LEAVES AS THE OWNER CHANGED IT, so Decide says the update's version of it is not taken. */
        ...(kept.size === 0 ? {} : { keeps: [...kept] }),
        /* AND WHAT A KEPT PAGE GOES WITHOUT (`Diff.brings`), with the sentence that says it (`keptQuestion`), so Decide
           says the Late table by name where it said only that the page was kept. The choice itself is asked once the
           update is in (`ArrangeDeps.kept`), since this card is a yes or a no to the whole update. */
        ...((asks) => (asks === null ? {} : { brings: diff.brings, brings_line: asks.line.split(' Take the update')[0] }))(keptQuestion(diff, (x) => (x === id ? titleOf(id) : spokenOf(x)))),
        /* WHAT IT LAYS ON A LIST ANOTHER PACK OWNS, by list, as `field` or `field.value`. Without it Personal's step named
           only its own lists and pages, and the five roles it lays on People reached Decide as nothing: measured on the
           seed catalogue, the step was `["pack","version","adds","examples"]`. A list that has everything already lays
           nothing, which is every later update of the same pack, so it says nothing either. */
        ...((laid) => (laid.length === 0 ? {} : { extends: laid }))(diff.extends.flatMap((e) => (e.adds.length === 0 || e.refusal !== undefined ? [] : [{ id: e.id, adds: e.adds }]))),
        /* AND THE VALUES AN UPDATE TAKES OFF A LIST HOLDING ROWS, WHICH STAY ON IT. The People update that sheds
           `registrar` from a record holding a registrar row was filed as `changes: ["register.people"]` and nothing
           else, the same step as an update that did take the choice away. `body` is the install's, not Decide's.
           `holding` AND `binned` GO WITH IT, how many rows hold each value and how many of those are deleted, since
           Decide says both: copied as `{ id, values, rows }`, the count Decide says never reached it. */
        ...(diff.stays.length === 0 ? {} : { stays: diff.stays.map(({ body: _install, ...stay }) => stay) }),
        ...(diff.seeds.count === 0 ? {} : { examples: diff.seeds.count }),
      });
      out.approve.push(...diff.approve.filter((line) => !out.approve.includes(line)));
      /* `sent` IS EACH NEW OR CHANGED CALL AS THE KERNEL'S `doesOf` READS IT, with the key's label and what runs it, which
         `out` (a part's host and how often) does not keep. An install's body files it as `calls_out`. */
      const arms = diff.calls_out.filter((c) => c.change !== 'same');
      out.calls.set(id, {
        approve: [...diff.approve],
        out: arms.map((c) => callAt(`install:${id}`, c.host, c.every || null, c.per_day)),
        sent: arms.map((c) => ({ host: c.host, every: c.every, trigger: c.trigger, per_day: c.per_day, grant: c.grant, change: c.change })),
      });
      out.config.set(id, pack.manifest.config ?? {});
      out.packs.set(id, pack);
      /* THE RECORD AS THE INSTALL LEAVES IT, from `declare`, which stages it. The fold this replaced carried
         `{ id, version }` with no `requires` and nothing an `extends` laid, so a second pack laying `domain` on the
         same list was planned against a list with none, filed, and refused half-way at the accept. */
      state = plannedState(state, pack, diff);
    }
    return ok({ ...out, state });
  }

  /**
   * WHAT DECIDE CALLS EACH LIST AND PAGE A PROPOSAL NAMES, as the rail will once it is accepted. Decide named a use case's
   * Home page from its id, "Home personal", and a list by the build's word, Things, where the rail says Projects, because
   * a catalogue pack is filed without its document. So the record files the names: a list by the label the use case
   * speaking afterwards gives it, else its declared name; that use case's Home page by its voice, else a page by its title.
   *
   * A LIST ALREADY HERE IS NAMED ONLY WHEN THE PROPOSAL MOVES THE VOICE. Otherwise its name is the one the rail draws when
   * Decide is opened, which a later switch may change, and a name filed now would go stale beside it.
   */
  function namesFor(planned: Planned, speaker: string | null): Record<string, string> {
    let values: Record<string, unknown> = {};
    let config: Record<string, { label?: unknown }> = {};
    if (speaker !== null) {
      const coming = planned.packs.get(speaker)?.manifest.config ?? {};
      const read = kernel.packConfig(speaker);
      const now = read.ok ? read.value : { values: {}, config: {} };
      config = { ...(now.config as Record<string, { label?: unknown }>), ...coming };
      values = { ...Object.fromEntries(Object.entries(coming).map(([k, decl]) => [k, decl.default ?? null])), ...(now.values as Record<string, unknown>) };
    }
    const labels = labelsOf(values, config);
    const home = voiceIn(values).home;
    const out: Record<string, string> = {};
    const moves = speaker !== speakerNow();
    if (moves) for (const [key, word] of Object.entries(labels)) if (/^[a-z][a-z0-9_]*$/u.test(key)) out[`register.${key}`] = word;
    for (const pack of planned.packs.values()) {
      for (const decl of pack.declarations) {
        const body = decl.body as Body;
        if (decl.kind === 'register') {
          const name = typeof body.name === 'string' ? body.name : null;
          const bare = decl.id.slice('register.'.length);
          if (out[decl.id] === undefined && name !== null && (moves || kernel.register(bare) === undefined)) out[decl.id] = labels[bare] ?? name;
        } else if (decl.kind === 'page') {
          const title = typeof body.title === 'string' && !body.title.includes('{{') ? body.title : null;
          const said = speaker !== null && home !== undefined && decl.id === `page.home-${speaker.slice(USE_CASE.length)}` ? home : title;
          if (said !== null) out[decl.id] = said;
        }
      }
    }
    /* A DECLARATION THE UPDATE KEEPS IS NAMED AS THE OWNER NAMED IT, over the pack's title above: the pack's "Money" for a
       page the owner retitled "My money" would name a page this update does not install. */
    for (const [id, name] of planned.kept) out[id] = name;
    return out;
  }

  /** The lists a declaration state holds. */
  const heldBy = (state: Installed): string[] =>
    state.declarations.filter((decl) => decl.kind === 'register').map((decl) => decl.id.slice('register.'.length));

  /**
   * THE USE CASE A MODULE IS INSTALLED FOR: the one this proposal installs, else the one already on. A module added by a
   * proposal carried no examples where onboarding gives it the use case's, so the two paths made different records.
   */
  const useCaseFor = (installing: readonly string[], id?: string): string | null => {
    /* A MODULE GOES IN FOR THE USE CASE AFTER IT IN THE ORDER, so with Student beside Personal, Money carries Personal's
       examples and not Student's. */
    const from = id === undefined ? -1 : installing.indexOf(id);
    const next = from < 0 ? undefined : installing.slice(from).find((x) => x.startsWith(USE_CASE));
    return (next ?? [...installing].reverse().find((x) => x.startsWith(USE_CASE)) ?? useCaseOn())?.slice(USE_CASE.length) ?? null;
  };

  async function packOf(id: string, docs: ReadonlyMap<string, Body>, holds: readonly string[], usecase: string | null): Promise<Result<Pack>> {
    const doc = docs.get(id) ?? entryOf(id)?.doc({ holds, usecase }) ?? null;
    if (!doc) return notOffered(id, 'body.packs');
    /* THROUGH THE THEME CHECK, as `installPack` reads a document: a proposal that installs a pack is that pack's
       install, and a palette refused there is refused here in the same words. */
    const pack = await normaliseChecked(doc, { kind: 'local' });
    if (!pack.ok) return pack;
    if (pack.value.manifest.pack !== id)
      return refuse('VALUE_MALFORMED', `The document names its pack ${pack.value.manifest.pack}, and the proposal asks for ${id}. Make the two agree.`, 'body.doc');
    return pack;
  }

  /**
   * Who is asking. `own` is the owner setting up their own record (`setup`): only then is `me` read, and a name or a
   * setting with nowhere to go is said and passed over where a proposal is refused, since the person at the first run
   * cannot know which add-on keeps a currency. `order` is every add-on of the setup this piece is one part of, so a
   * module installed on its own still goes in for the use case after it (`useCaseFor`).
   */
  type Own = { own?: boolean | undefined; order?: readonly string[] | undefined };
  /** A part that was not written, and the one sentence that says why. */
  type Passed = { part: string; label?: string; why: string };

  /**
   * THE SETTINGS OF AN ARRANGEMENT, EACH UNDER THE ADD-ON THAT KEEPS IT. Three ways in: `{ pack, values }` as
   * ever; `{ values }` alone, where each key goes to the add-on that declares it, one this installs before one already
   * on, which is the loop the first run ran in the browser for `home_currency`; and `names`, a list's own word
   * (`{"projects":"Shops"}`, and `"projects:one"` for one of them), kept as the label of the use case that will speak.
   * No declaration is rewritten for a name: the list keeps the name its add-on gave it and the label is what is drawn.
   */
  async function placedSettings(
    body: Body,
    install: readonly string[],
    lead: string | null,
    docs: ReadonlyMap<string, Body>,
    by: Own,
  ): Promise<Result<{ settings: { raw: Body; at: string }[]; words: Record<string, string>; skipped: Passed[] }>> {
    const settings: { raw: Body; at: string }[] = [];
    const skipped: Passed[] = [];
    const words: Record<string, string> = {};
    const sent: unknown[] = Array.isArray(body.settings) ? body.settings : [];
    const bare = sent.some((raw) => isMap(raw) && typeof raw.pack !== 'string' && isMap(raw.values));
    if (!bare && body.names === undefined) {
      for (const [i, raw] of sent.entries()) if (isMap(raw)) settings.push({ raw, at: `body.settings[${i}]` });
      return ok({ settings, words, skipped });
    }
    /* WHAT EACH ADD-ON DECLARES: one this installs by its document, one that is on by the record. */
    const coming = new Map<string, Record<string, ConfigDecl>>();
    for (const id of install) {
      const read = await packOf(id, docs, heldBy(d.installed()), useCaseFor(install, id));
      if (read.ok) coming.set(id, read.value.manifest.config ?? {});
    }
    const live = (id: string): Record<string, ConfigDecl> | null => {
      const read = kernel.packConfig(id);
      return read.ok ? (read.value.config as Record<string, ConfigDecl>) : null;
    };
    const keeperOf = (key: string): string | null =>
      install.find((id) => Object.hasOwn(coming.get(id) ?? {}, key)) ??
      states().find((s) => s.disabled_at === null && !install.includes(s.id) && Object.hasOwn(live(s.id) ?? {}, key))?.id ??
      null;
    for (const [i, raw] of sent.entries()) {
      if (!isMap(raw)) continue;
      const at = `body.settings[${i}]`;
      if (typeof raw.pack === 'string' || !isMap(raw.values)) {
        settings.push({ raw, at });
        continue;
      }
      const byPack = new Map<string, Body>();
      for (const [key, value] of Object.entries(raw.values)) {
        const keeper = keeperOf(key);
        if (keeper !== null) byPack.set(keeper, { ...(byPack.get(keeper) ?? {}), [key]: value });
        else if (by.own === true) skipped.push({ part: `setting:${key}`, why: `No add-on here keeps a setting called ${key}, so it was not set.` });
        else return refuse('FIELD_UNKNOWN', `No add-on that is on or in this arrangement has a setting called ${key}. Name its add-on as pack, or leave it out.`, `${at}.values.${key}`);
      }
      for (const [pack, values] of byPack) settings.push({ raw: { pack, values }, at });
    }
    if (body.names === undefined) return ok({ settings, words, skipped });
    if (!isMap(body.names)) return refuse('VALUE_MALFORMED', 'names is a map of a list to the word you call it, such as {"projects":"Shops"}.', 'body.names');
    /* THE USE CASE THAT WILL SPEAK, by the rule `namesFor` names the rail by: the one this sets up, else the one speaking. */
    const speaker = lead ?? speakerNow() ?? install.find((id) => id.startsWith(USE_CASE)) ?? null;
    const config = speaker === null ? null : (coming.get(speaker) ?? live(speaker));
    const values: Body = {};
    for (const [list, said] of Object.entries(body.names)) {
      const at = `body.names.${list}`;
      const word = typeof said === 'string' ? said.trim() : '';
      if (word === '') return refuse('VALUE_MALFORMED', 'A name is a word or a few, such as "Shops".', at);
      const setting = /^[a-z][a-z0-9_]*(:(one|holds))?$/u.test(list) ? labelSetting(list) : null;
      if (speaker !== null && config !== null && setting !== null && Object.hasOwn(config, setting)) {
        values[setting] = word;
        if (!list.includes(':')) words[list] = word;
        continue;
      }
      const why =
        speaker === null
          ? `A list's own name is kept by the use case this BrainDog speaks in, and none is on, so ${word} was not kept.`
          : `${titleOf(speaker)} keeps no name for a list called ${list}, so ${word} was not kept.`;
      if (by.own === true) skipped.push({ part: `name:${list}`, why });
      else
        return refuse(
          speaker === null ? 'REQUIRED_MISSING' : 'FIELD_UNKNOWN',
          speaker === null
            ? "A list's own name is kept by the use case this BrainDog speaks in, and none is on. Name one as usecase in the same arrangement."
            : `${titleOf(speaker)} keeps no name for a list called ${list}. Name one of its own lists, or leave it out.`,
          at,
        );
    }
    if (speaker !== null && Object.keys(values).length > 0) settings.push({ raw: { pack: speaker, values }, at: 'body.names' });
    return ok({ settings, words, skipped });
  }

  /**
   * `me`, THE PERSON WHOSE RECORD THIS IS: `{ name, email?, note? }`, the name by the rule a rename keeps
   * (`personNameOf`). ONLY THE OWNER'S OWN SETUP SAYS IT. A proposal that carried it would have an agent say who the
   * owner is, and marking a row as them folds their commits and mail into it, so it is refused there.
   */
  function meOf(raw: unknown, by: Own): Result<Body | null> {
    if (raw === undefined || raw === null) return ok(null);
    if (by.own !== true)
      return refuse('FORBIDDEN', 'me says who this BrainDog belongs to, and only its owner setting it up says that. Leave it out; to add somebody, meet them.', 'body.me');
    if (!isMap(raw)) return refuse('VALUE_MALFORMED', 'me is {"name":"<what to call you>"}, with your email and a note about you when you have them.', 'body.me');
    const name = personNameOf(raw.name);
    if (!name.ok) return { ok: false, refusal: { ...(name as { refusal: Refusal }).refusal, at: 'body.me.name' } };
    for (const key of ['email', 'note'] as const)
      if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== 'string') return refuse('VALUE_MALFORMED', `${key} takes a line of text.`, `body.me.${key}`);
    const email = typeof raw.email === 'string' ? raw.email.trim() : '';
    const note = typeof raw.note === 'string' ? raw.note.trim() : '';
    return ok({ name: name.value, ...(email === '' ? {} : { email }), ...(note === '' ? {} : { note }) });
  }

  /** One settings change, checked against the pack's declared settings, with the values it replaces. */
  function settingsOf(raw: Body, at: string, pending: ReadonlyMap<string, Record<string, ConfigDecl>>): Result<Body> {
    const pack = String(raw.pack);
    const values = (isMap(raw.values) ? raw.values : {}) as Body;
    let config: Record<string, ConfigDecl>;
    let current: Body = {};
    const coming = pending.get(pack);
    if (coming) config = coming;
    else {
      const read = kernel.packConfig(pack);
      if (!read.ok)
        return refuse(
          'DECLARATION_UNKNOWN',
          `${pack} is not installed, so it has no settings to change. Install it in the same arrangement, or propose installing it first.`,
          `${at}.pack`,
        );
      config = read.value.config as Record<string, ConfigDecl>;
      current = read.value.values as Body;
    }
    const keys = Object.keys(config);
    for (const [key, value] of Object.entries(values)) {
      const decl = config[key];
      if (!decl) return refuse('FIELD_UNKNOWN', `${pack} has no setting called ${key}. Its settings are: ${listed(keys)}.`, `${at}.values.${key}`, keys.slice(0, 32));
      if (value === null) continue;
      const fits = configValue(key, decl, value, `${at}.values.${key}`);
      if (!fits.ok) return fits as Result<Body>;
    }
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, current[key] ?? (coming ? (config[key]?.default ?? null) : null)]));
    /* A LONG LABEL IS KEPT AS `lk_<hash>`, which says nothing to the owner, and Decide has no declared settings to read it
       through when the pack is not on yet. Its title goes with it, as the setting was declared. */
    const titles = Object.fromEntries(Object.keys(values).flatMap((key) => (/^lk_[0-9a-f]{8}$/u.test(key) && typeof config[key]?.label === 'string' ? [[key, config[key].label]] : [])));
    return ok({ pack, values, before, ...(Object.keys(titles).length === 0 ? {} : { titles }) });
  }

  /** `{"voice":{"home":"Today"}}` as the settings of the use case's pack: the one being installed, or the one on. */
  function voiceOf(raw: unknown, at: string, installing: readonly string[], lead: string | null = null): Result<Body> {
    if (!isMap(raw) || Object.keys(raw).length === 0)
      return refuse('VALUE_MALFORMED', `voice is a map of voice keys to short lines, such as {"home":"Today"}. The keys are: ${VOICE_KEYS.join(', ')}.`, at);
    /* THE USE CASE THE ARRANGEMENT SETS THE RECORD UP FOR, where it names one: with others beside it, the last one in the
       order is one of those, and the voice sent was written to a use case that does not speak. */
    const pack = lead ?? [...installing].reverse().find((id) => id.startsWith(USE_CASE)) ?? useCaseOn();
    if (!pack)
      return refuse(
        'REQUIRED_MISSING',
        'No use case is installed, so this BrainDog speaks in the house voice and has no voice to change. Install a use case in the same arrangement, then set its voice.',
        at,
      );
    const values: Body = {};
    for (const [key, line] of Object.entries(raw)) {
      if (!(VOICE_KEYS as readonly string[]).includes(key))
        return refuse('FIELD_UNKNOWN', `${key} is not a voice key. The keys are: ${VOICE_KEYS.join(', ')}.`, `${at}.${key}`, VOICE_KEYS);
      values[voiceSetting(key as VoiceKey)] = line;
    }
    return ok({ pack, values });
  }

  /**
   * A SETTING A DECLARATION READS PLANS ITS ADD-ON AGAIN (second half). A setting is read when its add-on
   * is planned and installed, and `setPackConfig` changes nothing installed, so a later change to the book every title of
   * an add-on reads reached none of them until its next update. Such a change plans the add-on again at the version it
   * holds with the new values in hand (`declare` `plan`), filed as one approved change: the plan step, marked `replan`, and
   * what it calls out. `null` when no declaration reads the keys, or the host no longer holds the version this record
   * does, and the setting is then written alone, as before.
   */
  async function replanned(pack: string, values: Body, sh: Shelving): Promise<Result<Planned> | null> {
    const held = stateOf(pack);
    if (!held || held.disabled_at !== null || held.version === null) return null;
    if (!entryOf(pack) && d.shelf && !sh.docs.has(pack) && !(await shelved([pack], 'body.settings', sh)).ok) return null;
    const read = await packOf(pack, sh.docs, heldBy(d.installed()), useCaseFor([], pack));
    if (!read.ok || read.value.manifest.version !== held.version) return null;
    const keys = new Set(Object.keys(values));
    if (!read.value.declarations.some((decl) => configReads(decl.body).some((r) => keys.has(r.key)))) return null;
    const planned = await planAll([pack], sh.docs, new Map([[pack, values]]));
    if (planned.ok) for (const step of planned.value.plan) step.replan = true;
    return planned;
  }

  /** One part of an arrangement an accept may take on its own. */
  type Part = Body & { id: string; kind: string; label: string };

  /**
   * THE PARTS AN ACCEPT MAY TAKE ONE BY ONE. Every install, add-on turned on or off, add-on's settings,
   * group of entries by list, page and choice has an id the accept names (`parts`), a label the owner reads, and what it
   * covers in this body: `pack` for an install (its plan step, and the settings sent with it, which fill it), a turn on or
   * off, and a settings part (its settings, and its `replan` step); `register` for a group of entries, new and changed;
   * `page` for a page. `requires` names the parts it cannot be taken without: the add-ons an install needs, the install a
   * page reads a new list from, and the group an entry links to. A setting a declaration reads is its add-on planned
   * again inside the same part, so the two are never taken apart.
   */
  function partsOf(o: {
    planned: Planned;
    sent: ReadonlyMap<string, readonly string[]>;
    enable: readonly string[];
    disable: readonly string[];
    settings: readonly Body[];
    pages: readonly Body[];
    rows: readonly Body[];
    choices: readonly Body[];
    names: Record<string, string>;
    declarations?: readonly Body[];
  }): Part[] {
    const out: Part[] = [];
    const requires = (ids: readonly string[]) => (ids.length === 0 ? {} : { requires: [...new Set(ids)] });
    const installing = new Set(o.planned.order);
    const listWords = (register: string) => o.names[`register.${register}`] ?? kernel.register(register)?.name ?? register;
    for (const id of o.planned.order) {
      const pack = o.planned.packs.get(id);
      const under = [...Object.keys(pack?.manifest.requires.packs ?? {}), ...(entryOf(id)?.modules ?? o.sent.get(id) ?? [])];
      const updates = typeof o.planned.plan.find((s) => s.pack === id)?.from === 'string';
      const label = `${updates ? 'Update' : 'Add'} ${titleOf(id)}`;
      out.push({ id: `install:${id}`, kind: 'install', label, pack: id, ...requires(under.filter((q) => q !== id && installing.has(q)).map((q) => `install:${q}`)) });
    }
    for (const id of o.enable) out.push({ id: `enable:${id}`, kind: 'enable', label: `Turn on ${titleOf(id)}`, pack: id });
    for (const id of o.disable) out.push({ id: `disable:${id}`, kind: 'disable', label: `Turn off ${titleOf(id)}`, pack: id });
    for (const pack of new Set(o.settings.map((s) => String(s.pack))))
      if (!installing.has(pack))
        out.push({ id: `setting:${pack}`, kind: 'setting', label: `Settings of ${titleOf(pack)}`, pack, ...requires(o.enable.includes(pack) ? [`enable:${pack}`] : []) });
    for (const register of new Set(o.rows.map((r) => String(r.register)))) {
      const mine = o.rows.filter((r) => r.register === register);
      const linked = mine.flatMap((r) => Object.values(isMap(r.links) ? r.links : {}).map((to) => String(o.rows[Number(to)]?.register)));
      const adds = mine.some((r) => typeof r.at !== 'string');
      const changes = mine.some((r) => typeof r.at === 'string');
      const label = `${adds && changes ? 'Additions and changes' : adds ? 'Additions' : 'Changes'} to ${listWords(register)}`;
      out.push({ id: `rows:${register}`, kind: 'rows', label, register, ...requires(linked.filter((x) => x !== register).map((x) => `rows:${x}`)) });
    }
    for (const page of o.pages) {
      const slug = String(page.id).replace(/^page\./u, '');
      const said = isMap(page.body) && typeof page.body.title === 'string' && page.body.title.trim() !== '' ? page.body.title.trim() : slug.replace(/[-_]/gu, ' ');
      /* A PAGE OVER A LIST AN INSTALL HERE BRINGS cannot be taken without that install. */
      const text = new Set<string>();
      const walk = (x: unknown): void => {
        if (typeof x === 'string') text.add(x.replace(/^register\./u, ''));
        else if (Array.isArray(x)) x.forEach(walk);
        else if (isMap(x)) Object.values(x).forEach(walk);
      };
      walk(page.body);
      const from = o.planned.order.filter((q) =>
        (o.planned.packs.get(q)?.declarations ?? []).some((decl) => decl.kind === 'register' && text.has(decl.id.slice('register.'.length)) && !kernel.register(decl.id.slice('register.'.length))),
      );
      out.push({ id: `page:${slug}`, kind: 'page', label: `The ${said} page`, page: String(page.id), ...requires(from.map((q) => `install:${q}`)) });
    }
    /* A DECLARATION IS A PART OF ITS OWN, named by its own name and needing the install that brings a
       list it reads. govern's `partsOf` adds the settings it reads. */
    for (const decl of o.declarations ?? []) {
      const id = String(decl.id);
      const own = isMap(decl.body) ? [decl.body.name, decl.body.title].find((x): x is string => typeof x === 'string' && x.trim() !== '') : undefined;
      const said = own?.trim() ?? (o.names[id] || id.slice(id.indexOf('.') + 1).replace(/[-_.]+/gu, ' '));
      const reads = new Set<string>();
      const walk = (x: unknown): void => {
        if (typeof x === 'string') reads.add(x.replace(/^register\./u, ''));
        else if (Array.isArray(x)) x.forEach(walk);
        else if (isMap(x)) Object.values(x).forEach(walk);
      };
      walk(decl.body);
      const from = o.planned.order.filter((q) =>
        (o.planned.packs.get(q)?.declarations ?? []).some((x) => x.kind === 'register' && !kernel.register(x.id.slice('register.'.length)) && reads.has(x.id.slice('register.'.length))),
      );
      out.push({ id: `declaration:${id}`, kind: 'declaration', label: `${decl.was === 0 ? 'Add' : 'Change'} ${said}`, declaration: id, ...requires(from.map((q) => `install:${q}`)) });
    }
    for (const c of o.choices) out.push({ ...c, id: `choice:${String(c.id)}`, kind: 'choice', label: String(c.question) });
    return out;
  }

  /**
   * A `pack`, `settings` or `arrange` body as it is filed: what was asked, and what it would do.
   *
   * ONLY THE KEYS A PROPOSER MAY WRITE ARE READ. Everything the owner is shown about the consequences is
   * this function's, so a proposer cannot describe a pack as friendlier than it is.
   */
  async function prepare(kind: 'pack' | 'settings' | 'arrange', body: Body, by: Own = {}): Promise<Result<Body>> {
    if (kind === 'settings') {
      if (body.voice !== undefined) {
        const said = voiceOf(body.voice, 'body.voice', []);
        if (!said.ok) return said;
        return settingsOf(said.value, 'body', new Map());
      }
      if (typeof body.pack !== 'string' || !isMap(body.values)) return ok(body);
      const one = settingsOf(body, 'body', new Map());
      if (!one.ok) return one;
      /* AND ITS ADD-ON PLANNED AGAIN when a declaration reads it, so the change reaches what reads it on the same yes. */
      const again = await replanned(body.pack, one.value.values as Body, shelving());
      if (again === null) return one;
      if (!again.ok) return again;
      const needs = needsOf(again.value.approve);
      return ok({
        ...one.value,
        plan: again.value.plan,
        ...(again.value.approve.length === 0 ? {} : { approve: again.value.approve }),
        ...(needs.length === 0 ? {} : { needs }),
      });
    }

    if (kind === 'pack') {
      if (typeof body.enable === 'string' || typeof body.disable === 'string') {
        const verb = typeof body.enable === 'string' ? 'enable' : 'disable';
        const id = String(body[verb]);
        const state = verb === 'enable' ? stateOf(id) : running(id);
        if (!state) return refuse('DECLARATION_UNKNOWN', `${id} is not installed here, so it cannot be turned ${verb === 'enable' ? 'on' : 'off'}. Propose install instead.`, `body.${verb}`);
        if ((state.disabled_at === null) === (verb === 'enable'))
          return refuse('TRANSITION_ILLEGAL', `${id} is already ${verb === 'enable' ? 'on' : 'off'}.`, `body.${verb}`);
        /* TURNING A PACK ON ARMS WHAT IT CALLS OUT AGAIN, so the owner is shown those lines, as an install shows them. */
        const calls = verb === 'enable' ? kernel.callsWhenEnabled(id) : [];
        const needs = needsOf(calls);
        return ok({ [verb]: id, registers: state.registers, ...(calls.length === 0 ? {} : { approve: calls }), ...(needs.length === 0 ? {} : { needs }) });
      }
      /* A SHARED USE-CASE FILE, as `braindog usecase install` sends it. It is read through the door the app and `planUseCase`
         read one through (`readShared`: the size, a credential, a block kind nothing draws), and becomes the install of its
         pack with the document it carries and the modules it names. A token files the question; only the owner installs. */
      let fromFile: { title: string; summary: string; modules: readonly string[] } | null = null;
      if (body.file !== undefined) {
        if (typeof body.file !== 'string' && !isMap(body.file))
          return refuse('VALUE_MALFORMED', 'file is a .usecase.json file, as its text or its document.', 'body.file');
        const shared = await readShared(body.file, { kind: 'paste' });
        if (!shared.ok) {
          const r = 'refusal' in shared ? shared.refusal : ({ code: 'PACK_MALFORMED', fix: 'This is not a use-case file.' } as Refusal);
          return { ok: false, refusal: { ...r, at: r.at ? `body.file.${r.at}` : 'body.file' } };
        }
        const u = shared.value.usecase;
        if (shared.value.doc === null)
          return refuse('PACK_MALFORMED', `${u.title} carries no lists or pages of its own, only the modules it names: ${listed(u.modules)}. Propose installing those instead.`, 'body.file');
        body = { install: packIdOf(u.usecase), doc: shared.value.doc };
        /* THE MODULES IT CANNOT STAND WITHOUT, when it names them (`needs`), else every module it names. */
        fromFile = { title: u.title, summary: u.summary, modules: [...(u.needs ?? u.modules)] };
      }
      if (typeof body.install !== 'string') return ok(body);
      const asked = body.install;
      const target = entryOf(asked)?.id ?? asked;
      /* A DOCUMENT IS FOR A PACK THE CATALOGUE LACKS, as the grammar says. One sent for a pack the host offers was filed under the
         catalogue's title and summary, so a propose token could put its own pages, rules and version in front of the owner as
         "Study". What the host offers is installed from the host's own document; a shared file says its own name. */
      if (fromFile === null && isMap(body.doc) && entryOf(asked) !== undefined)
        return refuse(
          'VALUE_MALFORMED',
          `${target} is on offer here, so it is installed from this host's own document. Propose {"install":"${asked}"} without doc.`,
          'body.doc',
        );
      /* AND THE SAME FOR ONE THE HOST'S WHOLE CATALOGUE HOLDS, which the arrangement reading lists as on offer. */
      const shelfHolds = fromFile === null && isMap(body.doc) && d.shelf ? await d.shelf.fetch(asked) : null;
      if (shelfHolds !== null)
        return refuse(
          'VALUE_MALFORMED',
          `${shelfHolds.ok ? shelfHolds.value.title : target} is in this host's catalogue, so it is installed from the host's own document. Propose {"install":"${asked}"} without doc.`,
          'body.doc',
        );
      const docs = new Map<string, Body>(isMap(body.doc) ? [[target, body.doc]] : []);
      const sent = new Map<string, readonly string[]>(fromFile === null ? [] : [[target, fromFile.modules]]);
      /* NOT IN THE SHORT LIST AND NO DOCUMENT SENT: the host's whole catalogue, held to its checksum. */
      const sh = shelving();
      const found = await shelved([asked], 'body.install', sh, docs);
      if (!found.ok) return found;
      for (const [id, doc] of sh.docs) docs.set(id, doc);
      for (const [id, modules] of sh.sent) sent.set(id, modules);
      const fromShelf = sh.found.get(found.value[0] ?? target);
      if (fromShelf && fromShelf.id !== target) return prepare('pack', { ...body, install: fromShelf.id });
      /* AN UPDATE OF A MODULE UNDER IT is an update too: Personal at its version with Money behind is planned for Money. */
      if (on(target) && ![...(entryOf(asked)?.modules ?? sent.get(target) ?? []), target].some((id) => on(id) && updateOf(id, docs)))
        return refuse(
          'TRANSITION_ILLEGAL',
          `${target} is already installed and on, at ${stateOf(target)?.version ?? 'its version'}, and no newer version is offered. To change what it says, propose body_kind settings.`,
          'body.install',
        );
      const order = expand([asked], 'body.install', docs, sent);
      if (!order.ok) return order;
      const planned = await planAll(order.value.install, docs);
      if (!planned.ok) return planned;
      const entry = entryOf(target);
      /* A USE CASE ADDED BESIDE THE ONE SPEAKING KEEPS THAT VOICE, and Decide says whose. An update changes no voice. */
      const speaker = speakerNow();
      const keeps = target.startsWith(USE_CASE) && !on(target) && speaker !== null && speaker !== target ? speaker : null;
      const names = namesFor(planned.value, keeps ?? (target.startsWith(USE_CASE) && !on(target) ? target : speaker));
      /* WHAT THE PRESS ARMS, key by label and host, for Decide's one sentence (the kernel's `doesOf('install', body)`). */
      const callsOut = planned.value.order.flatMap((id) => planned.value.calls.get(id)?.sent ?? []);
      return ok({
        install: target,
        /* A FILE IS SAID BY ITS OWN TITLE, even over a catalogue use case with the same id: it is what the owner was asked about. */
        ...(fromFile
          ? { kind: 'usecase', title: fromFile.title, summary: fromFile.summary }
          : entry
            ? { kind: entry.kind, title: entry.title, summary: entry.summary }
            : fromShelf
              ? { kind: fromShelf.kind, title: fromShelf.title, summary: fromShelf.summary }
              : {}),
        ...(keeps === null ? {} : { keeps }),
        packs: { install: planned.value.order, ...(order.value.enable.length === 0 ? {} : { enable: order.value.enable }) },
        plan: planned.value.plan,
        approve: planned.value.approve,
        ...(callsOut.length === 0 ? {} : { calls_out: callsOut }),
        ...((needs) => (needs.length === 0 ? {} : { needs }))(needsOf(planned.value.approve)),
        ...(Object.keys(names).length === 0 ? {} : { names }),
        ...(isMap(body.doc) ? { doc: body.doc } : {}),
      });
    }

    /* AN ARRANGEMENT: packs, then pages, then settings, each checked against what the ones before would leave. */
    const packs = isMap(body.packs) ? body.packs : {};
    const sh = shelving();
    const lead = typeof body.usecase === 'string' ? packIdOf(body.usecase.replace(new RegExp(`^${USE_CASE}`), '')) : null;
    /* A USE CASE BESIDE THE ONE SPEAKING, by the voice rule every other door keeps (`declare` `voiceWhenAdding`): it
       installs after the lead and never changes who speaks, whichever way its id sorts, because accepting writes the
       answer down (`apply`). */
    const beside: string[] = [];
    if (body.alongside !== undefined) {
      if (!Array.isArray(body.alongside) || body.alongside.some((x) => typeof x !== 'string'))
        return refuse('VALUE_MALFORMED', 'alongside is a list of use case ids from offer, such as ["student"].', 'body.alongside');
      if (lead === null && speakerNow() === null)
        return refuse('REQUIRED_MISSING', 'A use case goes beside the one this BrainDog speaks in, and none is on. Name one as usecase, and the others beside it.', 'body.alongside');
      for (const [i, raw] of (body.alongside as string[]).entries()) {
        const id = packIdOf(raw.replace(new RegExp(`^${USE_CASE}`), ''));
        const found = await shelved([id], 'body.alongside', sh);
        if (!found.ok) return { ok: false, refusal: { ...(found as { refusal: Refusal }).refusal, at: `body.alongside[${i}]` } };
        if ((entryOf(id) ?? sh.found.get(id))?.kind !== 'usecase') return notOffered(raw, `body.alongside[${i}]`, d.shelf ? await d.shelf.listed() : []);
        beside.push(id);
      }
    }
    const asked = [...(lead === null ? [] : [lead]), ...beside, ...(Array.isArray(packs.install) ? packs.install.map(String) : [])];
    /* ANY CURRENT ADD-ON OF THE HOST'S WHOLE CATALOGUE, found by its id and held to its checksum, beside the short list. */
    const found = await shelved([...new Set(asked)], 'body.packs.install', sh);
    if (!found.ok) return found;
    const order = expand([...new Set(found.value)], 'body.packs.install', sh.docs, sh.sent);
    if (!order.ok) return order;
    const enable = [...order.value.enable];
    for (const [i, id] of (Array.isArray(packs.enable) ? packs.enable.map(String) : []).entries()) {
      const state = stateOf(id);
      if (!state) return refuse('DECLARATION_UNKNOWN', `${id} is not installed here, so it cannot be turned on. Put it under packs.install.`, `body.packs.enable[${i}]`);
      if (state.disabled_at !== null && !enable.includes(id)) enable.push(id);
    }
    const disable: string[] = [];
    for (const [i, id] of (Array.isArray(packs.disable) ? packs.disable.map(String) : []).entries()) {
      if (running(id)?.disabled_at !== null) return refuse('TRANSITION_ILLEGAL', `${id} is not on, so there is nothing to turn off.`, `body.packs.disable[${i}]`);
      disable.push(id);
    }
    /* THE SETTINGS SENT FOR AN ADD-ON IT INSTALLS FILL THAT INSTALL (`declare` `plan`), checked below as any setting is. */
    const given = new Map<string, Body>();
    /* EVERY SETTING SENT, EACH UNDER THE ADD-ON THAT KEEPS IT: a setting named by its key alone and a list's own word
       (`names`) are placed here, before the plan, so one for an add-on this installs fills that install like any other. */
    const placed = await placedSettings(body, order.value.install, lead, sh.docs, by);
    if (!placed.ok) return placed;
    const sentSettings = placed.value.settings;
    for (const { raw } of sentSettings)
      if (typeof raw.pack === 'string' && isMap(raw.values) && order.value.install.includes(raw.pack)) given.set(raw.pack, { ...(given.get(raw.pack) ?? {}), ...raw.values });
    /* THE VOICE TOO, when it is the voice of a use case this installs: `apply` fills the install with every setting filed for
       it, and the voice is filed as one, so the plan the owner is shown is the plan that runs. Checked below as any setting. */
    const voiced = body.voice === undefined ? null : voiceOf(body.voice, 'body.voice', order.value.install, lead);
    if (voiced?.ok && typeof voiced.value.pack === 'string' && isMap(voiced.value.values) && order.value.install.includes(voiced.value.pack))
      given.set(voiced.value.pack, { ...(given.get(voiced.value.pack) ?? {}), ...voiced.value.values });
    const planned = await planAll(order.value.install, sh.docs, given);
    if (!planned.ok) return planned;

    const pages: Body[] = [];
    const installed = kernel.declarations();
    for (const raw of Array.isArray(body.pages) ? body.pages : []) {
      if (!isMap(raw)) continue;
      const was = installed.find((r) => r.id === raw.id);
      pages.push({ id: raw.id, kind: 'page', body: raw.body, was: was ? was.version : null });
    }
    /* THE PAGES AGAINST THE RECORD AS THE PACKS LEAVE IT, and only the pages. This was `kernel.lint` over every pack's file
       and the pages together, asked only when a page rode along, so the packs' own faults were found by accident and said
       as the page's: two `scopes:` packs with one page were refused at `body.pages` "register.jobs already declares
       scopes:", a page nobody wrote wrong. Each pack has met the kernel's checks in `planAll` by now, so a fault here is a
       page's.

       ONE QUESTION, AND THE WHOLE OF IT. An earlier build asked `validate` of the planned record, and then
       `kernel.lint` of the pages beside the lists they read, laid on the live record, for the `where:` and `sign:` only
       `unreadable` reads; and where those lists alone were refused on the live record, as `rates` is beside an `fx` an
       earlier update in the arrangement retires, it asked the page nothing more. A page over `rates` filtering on
       `nosuch` was filed and refused at the accept, after both packs had installed. The planned record holds the lists
       as the packs leave them, so `lint` reads each page against those and nothing is skipped. */
    /* THE DECLARATIONS FIRST, against the record as the packs leave it, and then the pages beside them, so a page over a
       list this declares reads that list. */
    const declared = declarationsOf(body.declarations, planned.value.state);
    if (!declared.ok) return declared;
    const staged = pages.map((p) => ({ id: String(p.id), kind: 'page' as const, body: p.body as never }));
    const declaring = declared.value.filed.map((x) => ({ id: String(x.id), kind: x.kind as Declaration['kind'], body: x.body as never }));
    const unfit = staged.length === 0 ? null : kernel.lint([...declaring, ...staged], ...plannedOf(planned.value.state));
    if (unfit) return { ok: false, refusal: { ...unfit, at: `body.pages${unfit.at ? `: ${unfit.at}` : ''}` } };

    const settings: Body[] = [];
    for (const { raw, at } of sentSettings) {
      const one = settingsOf(raw, at, planned.value.config);
      if (!one.ok) return one;
      settings.push(one.value);
    }
    /* A SETTING A DECLARATION READS, on an add-on this does not install, plans that add-on again (`replanned`). */
    const again: Body[] = [];
    const calls: string[] = [];
    /* EACH PART'S OWN LINES AND CALLS, so a key and a call out are said beside the part that makes them. */
    const lines = new Map<string, string[]>();
    const heard: Call[] = [];
    const heardSent: Body[] = [];
    const sentFor = new Map<string, Body>();
    for (const s of settings) if (!order.value.install.includes(String(s.pack))) sentFor.set(String(s.pack), { ...(sentFor.get(String(s.pack)) ?? {}), ...(s.values as Body) });
    for (const [pack, values] of sentFor) {
      const one = await replanned(pack, values, sh);
      if (one === null) continue;
      if (!one.ok) return { ok: false, refusal: { ...(one as { refusal: Refusal }).refusal, at: 'body.settings' } };
      again.push(...one.value.plan);
      calls.push(...one.value.approve);
      lines.set(`setting:${pack}`, one.value.approve);
      heard.push(...(one.value.calls.get(pack)?.out ?? []).map((c) => ({ ...c, part: `setting:${pack}` })));
      heardSent.push(...(one.value.calls.get(pack)?.sent ?? []).map((c) => ({ part: `setting:${pack}`, ...c })));
    }
    if (body.voice !== undefined) {
      const said = voiceOf(body.voice, 'body.voice', order.value.install, lead);
      if (!said.ok) return said;
      const one = settingsOf(said.value, 'body.voice', planned.value.config);
      if (!one.ok) return one;
      settings.push(one.value);
    }

    const rows: Body[] = [];
    if (body.rows !== undefined) {
      const checked = rowsOf(body.rows, planned.value.state);
      if (!checked.ok) return checked;
      rows.push(...checked.value);
    }

    const choices = choicesIn(body.choices);
    if (!choices.ok) return choices;

    const names = namesFor(planned.value, lead ?? speakerNow() ?? order.value.install.find((id) => id.startsWith(USE_CASE)) ?? null);
    /* A LIST THIS NAMES IS SAID BY THAT WORD on Decide and in each part's label, as the rail will say it. */
    for (const [list, word] of Object.entries(placed.value.words)) names[`register.${list}`] = word;
    const me = meOf(body.me, by);
    if (!me.ok) return me;
    const approve = [...new Set([...planned.value.approve, ...enable.flatMap((id) => kernel.callsWhenEnabled(id)), ...calls, ...[...declared.value.lines.values()].flat()])];
    for (const id of planned.value.order) lines.set(`install:${id}`, planned.value.calls.get(id)?.approve ?? []);
    for (const id of enable) lines.set(`enable:${id}`, kernel.callsWhenEnabled(id));
    for (const [part, said] of declared.value.lines) lines.set(part, said);
    const listedCalls = [...planned.value.order.flatMap((id) => planned.value.calls.get(id)?.out ?? []), ...heard, ...declared.value.calls];
    /* THE SAME CALLS AS THE KERNEL'S `doesOf('install', body)` READS THEM, with the key's label and what runs each, which
       `calls` does not keep: Decide's one sentence had nothing to say of an add-on that sends a key out. Each names its
       part, as `calls` does, so what is left of a question says only what is left to arm. */
    const sentCalls: Body[] = [
      ...planned.value.order.flatMap((id) => (planned.value.calls.get(id)?.sent ?? []).map((c) => ({ part: `install:${id}`, ...c }))),
      ...heardSent,
      ...declared.value.sent,
    ];
    /* WHAT IT NEEDS IS THE RECORD'S TO SAY, from what it calls out, with the parts that need each; a `needs` the proposer
       sent is not read. */
    const needs = needsByPart(approve, lines);
    /* A NOTE REWRITTEN MAY NOT LOSE ITS WORDS (skills-49, `arrange-keeps.ts`): what it lifted out has to land somewhere in
       the same arrangement, a field the patch writes or a new entry that points at it. `rows[i]` is `body.rows[i]`. */
    const typesOf = (register: string) => new Map((listShape(register, planned.value.state)?.fields ?? []).map((f) => [f.id, f.type]));
    const lost = notesKept(
      rows as KeptRow[],
      typesOf,
      (r, at) =>
        Object.entries(r.fields ?? {}).some(([id, v]) => typesOf(r.register).get(id) === 'ref' && typeof v === 'string' && kernel.get(v)?.id === kernel.get(at)?.id),
      (r) => entryWords(r.register, r.before ?? {}),
    );
    if (lost) return refuse('VALUE_MALFORMED', lost.fix, `body.rows[${lost.at}]`);
    const parts = partsOf({ planned: planned.value, sent: sh.sent, enable, disable, settings, pages, rows, choices: choices.value, names, declarations: declared.value.filed });
    return ok({
      ...(typeof body.usecase === 'string' ? { usecase: body.usecase } : {}),
      ...(beside.length === 0 ? {} : { alongside: beside.map((id) => id.slice(USE_CASE.length)) }),
      why: body.why,
      packs: {
        /* THE ORDER `planAll` PLANNED, which `apply` runs as written. */
        ...(planned.value.order.length === 0 ? {} : { install: planned.value.order }),
        ...(enable.length === 0 ? {} : { enable }),
        ...(disable.length === 0 ? {} : { disable }),
      },
      ...(planned.value.plan.length + again.length === 0 ? {} : { plan: [...planned.value.plan, ...again] }),
      ...(approve.length === 0 ? {} : { approve }),
      ...(needs.length === 0 ? {} : { needs }),
      ...(pages.length === 0 ? {} : { pages }),
      ...(settings.length === 0 ? {} : { settings }),
      ...(me.value === null ? {} : { me: me.value }),
      ...(rows.length === 0 ? {} : { rows }),
      ...(placed.value.skipped.length === 0 ? {} : { skipped: placed.value.skipped }),
      ...(declared.value.filed.length === 0 ? {} : { declarations: declared.value.filed }),
      ...(listedCalls.length === 0 ? {} : { calls: listedCalls }),
      ...(sentCalls.length === 0 ? {} : { calls_out: sentCalls }),
      ...(parts.length === 0 ? {} : { parts }),
      ...(Object.keys(names).length === 0 ? {} : { names }),
    });
  }

  /**
   * THE DECLARATIONS AN ARRANGEMENT CARRIES, each `{ id, kind, body }`, checked as a `change` is: the
   * kernel's own checks over the batch, with the record laid under it as the add-ons before it leave it, and what each
   * calls out worked out here from its body, never from the proposer. Only a call that is new, or whose host, key or
   * fields differ from the one installed, is asked about (the kernel's `review`). A page goes under `pages`, where it is
   * drawn as one. Each is filed with `was`, the version it replaces (`0` for none), so a press after somebody else moved
   * it lands nothing.
   */
  function declarationsOf(raw: unknown, state: Installed): Result<{ filed: Body[]; lines: Map<string, string[]>; calls: Call[]; sent: Body[] }> {
    const out = { filed: [] as Body[], lines: new Map<string, string[]>(), calls: [] as Call[], sent: [] as Body[] };
    if (raw === undefined) return ok(out);
    const shape = 'A declaration is {"id":"<kind>.<name>","kind":"<kind>","body":{...}}, as a change installs one.';
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return refuse('VALUE_MALFORMED', `declarations is a list of one to 12. ${shape}`, 'body.declarations');
    const live = new Map(kernel.declarations().map((r) => [r.id, r]));
    for (const [i, d] of raw.entries()) {
      const at = `body.declarations[${i}]`;
      if (!isMap(d) || typeof d.id !== 'string' || typeof d.kind !== 'string' || !d.id.startsWith(`${d.kind}.`) || d.id.length === d.kind.length + 1 || !isMap(d.body))
        return refuse('VALUE_MALFORMED', shape, at);
      if (d.kind === 'page') return refuse('VALUE_MALFORMED', 'A page goes under pages, where Decide draws it as one: {"pages":[{"id":"page.<slug>","kind":"page","body":{...}}]}.', at);
      if (out.filed.some((x) => x.id === d.id)) return refuse('VALUE_MALFORMED', `Two declarations here are both ${d.id}. Send each once.`, `${at}.id`);
      const was = live.get(d.id);
      out.filed.push({ id: d.id, kind: d.kind, body: d.body, was: was ? was.version : 0 });
    }
    const staged = out.filed.map((x) => ({ id: String(x.id), kind: x.kind as Declaration['kind'], body: x.body as never }));
    const unfit = kernel.lint(staged, ...plannedOf(state));
    if (unfit) {
      /* THE ONE AT FAULT IS NAMED, as `body.declarations[i]`, so the proposer knows which part to send again: the kernel
         says it by its id in the fix, and the longest id the fix holds is the one it means. */
      const i = out.filed.reduce((best, x, j) => (unfit.fix.includes(String(x.id)) && (best < 0 || String(x.id).length > String(out.filed[best]!.id).length) ? j : best), out.filed.length === 1 ? 0 : -1);
      return { ok: false, refusal: { ...unfit, at: `body.declarations${i < 0 ? '' : `[${i}]`}${unfit.at ? `: ${unfit.at}` : ''}` } };
    }
    for (const x of out.filed) {
      const e = newCall(x, live.get(String(x.id)));
      if (e === null) continue;
      const part = `declaration:${String(x.id)}`;
      out.lines.set(part, approvalLines([e]));
      out.calls.push(callAt(part, e.host, e.every, e.per_day));
      out.sent.push({ part, host: e.host, every: e.every, trigger: e.trigger, per_day: e.per_day, grant: e.key, change: live.has(String(x.id)) ? 'changed' : 'new' });
    }
    return ok(out);
  }

  /**
   * WHAT A DECLARATION CALLS OUT THAT THE ONE LIVE UNDER ITS ID DID NOT, as the kernel's `review` and govern's `newEgress`
   * read a change: an ingest's or a script's call, or a digest's webhook. `null` when it calls out nothing new, so a feed
   * changed without changing where it calls is asked nothing, at filing and at the yes alike. A digest posting the
   * record's lists to a host went in with no line before this.
   */
  function newCall(x: Body, held: { body: string } | undefined): ReturnType<typeof egressOf> {
    if (x.kind !== 'ingest' && x.kind !== 'script' && x.kind !== 'digest') return null;
    const opens = (label: string) => kernel.opensOf(label);
    const e = egressOf(x.body, undefined, opens);
    if (e === null || held === undefined) return e;
    try {
      const before = egressOf(JSON.parse(held.body), undefined, opens);
      return before !== null && !egressChanged(before, e) ? null : e;
    } catch {
      return e;
    }
  }

  /** A declaration as a person says it: its own name, or the words of its id after the kind. */
  const declSaid = (x: Body): string => {
    const own = isMap(x.body) ? [x.body.name, x.body.title].find((y): y is string => typeof y === 'string' && y.trim() !== '') : undefined;
    const id = String(x.id);
    if (own !== undefined) return own.trim();
    const said = id.slice(id.indexOf('.') + 1).replace(/[-_.]+/gu, ' ');
    return said.charAt(0).toUpperCase() + said.slice(1);
  };

  /**
   * THE ROWS A PLAN IS MADE OF (`slash.ts` `formedRows`), checked against the lists as they are: each list is here, each field
   * is one it declares, and a link is a ref field pointing at the list of the earlier row it names. Whether a value is valid
   * is the write path's, when the arrangement is accepted, as it is for a rowset.
   *
   * A ROW MAY BE A PATCH: `{ register, at, version, patch }`, checked as a rowset's update is (govern
   * `checkUpdates`), and filed with `before`, the entry's fields now, so Decide says what it changes from. A version gone
   * stale refuses the whole question, naming the entry by its title.
   */
  /**
   * A list as it will stand once this arrangement's add-ons are in (skills-49): its planned declaration where the plan
   * changes or brings it, else the live one, so an arrangement that installs Project brief may also fill the fields it
   * lays on Projects. A list neither holds is `null`.
   */
  type ListShape = { name: string; title: string; fields: readonly { id: string; type: string; to?: string | undefined }[] };
  const listShape = (id: string, state?: Installed): ListShape | null => {
    const live = kernel.register(id);
    const row = state?.declarations.find((d) => d.id === `register.${id}`);
    if (!row) return live ? { name: live.name, title: live.title, fields: live.fields } : null;
    try {
      const b = JSON.parse(row.body) as { name?: unknown; title?: unknown; fields?: unknown };
      return {
        name: typeof b.name === 'string' ? b.name : (live?.name ?? id),
        title: typeof b.title === 'string' ? b.title : (live?.title ?? ''),
        fields: Array.isArray(b.fields) ? (b.fields as ListShape['fields']).filter((f) => f !== null && typeof f === 'object' && typeof f.id === 'string') : (live?.fields ?? []),
      };
    } catch {
      return live ? { name: live.name, title: live.title, fields: live.fields } : null;
    }
  };

  function rowsOf(raw: unknown, state?: Installed): Result<Body[]> {
    if (!Array.isArray(raw))
      return refuse('VALUE_MALFORMED', 'rows is a list, each {"register":"<id>","fields":{...}} to add, or {"register":"<id>","at":"<id>","version":<n>,"patch":{...}} to change one.', 'body.rows');
    const out: Body[] = [];
    const named = new Set<string>();
    for (const [i, r] of raw.entries()) {
      const at = `body.rows[${i}]`;
      if (isMap(r) && typeof r.register === 'string' && ('at' in r || 'patch' in r)) {
        const one = patchOf(r, at, named, state);
        if (!one.ok) return one;
        out.push(one.value);
        continue;
      }
      if (!isMap(r) || typeof r.register !== 'string' || !isMap(r.fields)) return refuse('VALUE_MALFORMED', 'A row is {"register":"<id>","fields":{...}}.', at);
      const decl = listShape(r.register, state);
      if (!decl) return refuse('REGISTER_UNKNOWN', `There is no list called ${r.register} here.`, `${at}.register`);
      const fields = new Map(decl.fields.map((f) => [f.id, f]));
      for (const id of Object.keys(r.fields))
        if (!fields.has(id)) return refuse('FIELD_UNKNOWN', `${r.register} has no field ${id}.`, `${at}.fields.${id}`, [...fields.keys()]);
      const links: Record<string, number> = {};
      for (const [id, to] of Object.entries(isMap(r.links) ? r.links : {})) {
        const field = fields.get(id);
        const target = typeof to === 'number' && Number.isInteger(to) && to >= 0 && to < i ? (raw[to] as Body | undefined) : undefined;
        if (!field || field.type !== 'ref' || !target || field.to !== target.register)
          return refuse('VALUE_MALFORMED', `${id} points at an earlier row of the list it links to, by its position from 0.`, `${at}.links.${id}`);
        links[id] = to as number;
      }
      out.push({ register: r.register, fields: { ...r.fields }, ...(Object.keys(links).length === 0 ? {} : { links }) });
    }
    return ok(out);
  }

  /** An entry as the owner knows it: its title in its list ("Kiln in Projects"), else "an entry in Projects". */
  const entryWords = (register: string, fields: Record<string, unknown>): string => {
    const decl = kernel.register(register);
    const list = decl?.name ?? register;
    const said = decl ? fields[decl.title] : undefined;
    return typeof said === 'string' && said.trim() !== '' ? `${said.trim()} in ${list}` : `an entry in ${list}`;
  };

  /** The words a stale patch is refused in, the whole question with it. */
  const staleSaid = (words: string, at: string): Result<never> =>
    refuse('VERSION_STALE', `${words[0]!.toUpperCase()}${words.slice(1)} changed after this was read, so none of it is taken. Read it again and propose with what it says now.`, at);

  /** One patch row, checked as a rowset's update is, with the entry's fields now as `before`. */
  function patchOf(r: Body, at: string, named: Set<string>, state?: Installed): Result<Body> {
    const register = String(r.register);
    const decl = listShape(register, state);
    if (!decl) return refuse('REGISTER_UNKNOWN', `There is no list called ${register} here.`, `${at}.register`);
    const extra = Object.keys(r).find((key) => !['register', 'at', 'version', 'patch', 'before'].includes(key));
    if (extra !== undefined) return refuse('FIELD_UNKNOWN', 'A change to an entry carries register, at, version and patch, and nothing beside them.', `${at}.${extra}`);
    const row = typeof r.at === 'string' ? kernel.get(r.at, { includeDeleted: true }) : null;
    if (!row || row.register !== register || row.deleted_at !== null) return refuse('VALUE_MALFORMED', `There is no live entry there in ${decl.name}.`, `${at}.at`);
    /* ONE CHANGE PER ENTRY: a second would be held to the version the first leaves, and could never apply. */
    if (named.has(row.id)) return refuse('VALUE_MALFORMED', `${entryWords(register, row.fields)} is changed twice. Put both changes in one patch.`, `${at}.at`);
    named.add(row.id);
    if (r.version === undefined) return refuse('REQUIRED_MISSING', 'A change carries the version its entry was read at, so one changed since is not overwritten.', `${at}.version`);
    if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 1) return refuse('VALUE_MALFORMED', 'version is the whole number the entry was read at.', `${at}.version`);
    if (!isMap(r.patch) || Object.keys(r.patch).length === 0) return refuse('VALUE_MALFORMED', 'A change carries a patch: the fields it changes, with their new values.', `${at}.patch`);
    const fields = decl.fields.map((f) => f.id);
    for (const id of Object.keys(r.patch))
      if (id !== 'deleted_at' && !fields.includes(id)) return refuse('FIELD_UNKNOWN', `${decl.name} has no field ${id}.`, `${at}.patch.${id}`, fields);
    if (row.version !== r.version) return staleSaid(entryWords(register, row.fields), `${at}.version`);
    return ok({ register, at: kernel.nameOf(row.id), version: row.version, patch: { ...r.patch }, before: { ...row.fields } });
  }

  /** The first patch whose entry moved since the question was filed, refused before anything is applied. */
  function staleOf(rows: readonly Body[]): Result<never> | null {
    for (const [i, r] of rows.entries()) {
      if (typeof r.at !== 'string') continue;
      const row = kernel.get(r.at, { includeDeleted: true });
      const words = entryWords(String(r.register), row?.fields ?? (isMap(r.before) ? r.before : {}));
      if (!row || row.deleted_at !== null || row.version !== r.version) return staleSaid(words, `body.rows[${i}]`);
    }
    return null;
  }

  /* ── applying, after the owner's press ───────────────────────────────── */

  /**
   * An accepted proposal, carried out: packs installed in order, then turned on and off, then pages, then
   * settings. The first that will not land stops the rest and is the answer, and the caller reopens the
   * question with what was already done in its sentence.
   */
  /** The catalogue entry's own step after its pack is in. A throw or a refusal in it leaves the install as it is. */
  /**
   * THE OWNER, WRITTEN INTO THEIR OWN RECORD, by the rules the first run kept in the browser. With a list that
   * plays `meets` on, they are met as anybody is, at their own keyboard; the row is marked as them only when this call
   * made it or found it by their address, never on a name alone, which may be somebody else of that name. A name with no
   * address is only a mention to `meet`, and a People list without the parts `meet` writes refuses it, so they are
   * written as a plain entry instead. WITH PEOPLE OFF THE NAME IS KEPT ON THEIR ACCOUNT AND IN NO LIST: nobody is put
   * back into a list its owner switched off. Answers where they are: the entry as it is spoken, or `account`.
   */
  function meetOwner(me: Body, actor: string): Result<string> {
    const name = String(me.name);
    const email = typeof me.email === 'string' ? me.email : null;
    const note = typeof me.note === 'string' ? me.note : null;
    const meets = kernel.meetsList();
    if (meets === null) {
      const kept = kernel.renamePerson(actor, name);
      return kept.ok ? ok('account') : (kept as Result<never>);
    }
    const parts = meets.fields as Record<string, string | undefined>;
    const fields = new Set((kernel.register(meets.register)?.fields ?? []).filter((f) => f.retired !== true).map((f) => f.id));
    const self = parts.self !== undefined && fields.has(parts.self) ? parts.self : null;
    const by = { actor, note: 'Added when this BrainDog was set up.' };
    const met = kernel.meet({ name, ...(email === null ? {} : { email }), where: 'onboarding' }, { actor, principal: { kind: 'person' } }, { viewer: null });
    const row = met.ok ? met.value.row : null;
    if (met.ok && row !== null) {
      const theirs = met.value.created || met.value.matched_by === 'key';
      const patch: Body = { ...(met.value.created && note !== null && fields.has('note') ? { note } : {}), ...(theirs && self !== null ? { [self]: true } : {}) };
      /* A LIST OLDER THAN A PART REFUSES IT, and the row stays an ordinary person. */
      if (Object.keys(patch).length > 0) kernel.update(meets.register, row.id, patch as never, by);
      if (theirs && self !== null) kernel.askOwnRows?.(actor);
      return ok(kernel.nameOf(row.id) ?? row.name);
    }
    /* ALREADY THERE BY THIS NAME AND MARKED AS THEM, which a second press finds: nothing is written twice. */
    const nameField = parts.name ?? 'name';
    if (self !== null) {
      const held = kernel.list({ register: meets.register, limit: 500 });
      const mine = held.ok ? held.value.rows.find((r) => r.fields[self] === true && r.fields[nameField] === name) : undefined;
      if (mine) return ok(kernel.nameOf(mine.id) ?? name);
    }
    const plain: Body = { [nameField]: name, ...(email !== null && parts.email !== undefined ? { [parts.email]: email } : {}), ...(note !== null && fields.has('note') ? { note } : {}) };
    let put = self === null ? null : kernel.create(meets.register, { ...plain, [self]: true } as never, by);
    if (put === null || !put.ok) put = kernel.create(meets.register, plain as never, by);
    if (!put.ok) return 'refusal' in put ? { ok: false, refusal: { ...put.refusal, at: 'body.me' } } : refuse('VERSION_STALE', 'Something changed while you were being added. Press it again.', 'body.me');
    if (self !== null) kernel.askOwnRows?.(actor);
    return ok(`${meets.register}#${put.value.seq}`);
  }

  async function afterInstall(id: string, actor: string): Promise<void> {
    const step = entryOf(id)?.afterInstall;
    if (!step) return;
    await step(rowIo(kernel, actor)).catch(() => undefined);
  }

  async function apply(kind: 'pack' | 'settings' | 'arrange', body: Body, actor: string, by: Own = {}): Promise<Result<Body>> {
    const done: { installed: string[]; enabled: string[]; disabled: string[]; pages: string[]; settings: string[]; me: string[]; rows: string[]; declarations: string[]; said: string[] } = {
      said: [],
      installed: [],
      enabled: [],
      disabled: [],
      pages: [],
      settings: [],
      me: [],
      rows: [],
      declarations: [],
    };
    /* ALL OR NONE WITHIN WHAT WAS TAKEN. Each write that lands leaves how to take it back, and one that will not
       land takes every earlier one back, newest first, so the question reopens holding the whole take with none of it
       applied, and a second yes starts from where the first did. This said "Already applied, and kept: ..." and kept
       them: an install landed, the settings after it were refused, and the reopened question held an add-on that was
       already in. Only what cannot be taken back is still said as kept, in those words: an update, whose older version
       the host no longer offers, and an add-on that took over declarations another add-on had handed it. */
    const undo: { said: string; back: () => Promise<boolean> }[] = [];
    const stopped = async <T>(r: Result<T>): Promise<Result<Body>> => {
      const refusal = (r as { refusal?: Refusal }).refusal ?? { code: 'VALUE_MALFORMED' as const, fix: 'It would not apply.' };
      const kept: string[] = [];
      for (const step of undo.splice(0).reverse()) if (!(await step.back().catch(() => false))) kept.unshift(step.said);
      return { ok: false, refusal: { ...refusal, fix: kept.length === 0 ? refusal.fix : `${refusal.fix} Already applied, and kept: ${kept.join(', ')}.` } };
    };
    /* WHAT A SETTING HELD BEFORE THIS PRESS, key by key, so taking it back writes those values and not the defaults. */
    const heldValues = (pack: string, keys: readonly string[]): Body => {
      const read = kernel.packConfig(pack);
      if (!read.ok) return {};
      return Object.fromEntries(keys.map((k) => [k, Object.hasOwn(read.value.values, k) ? read.value.values[k] : (read.value.config[k]?.default ?? null)]));
    };
    /* A DECLARATION PUT BACK AS IT WAS: the body it held, or retired when this press brought it. */
    const putBack = (id: string, kind: string, was: { body: string } | undefined) => async (): Promise<boolean> => {
      if (was === undefined) return kernel.retire([id], { actor }).ok;
      const out = await kernel.install([{ id, kind, body: JSON.parse(was.body) } as never], undefined, { actor });
      return out.ok;
    };

    const packs = (isMap(body.packs) ? body.packs : {}) as { install?: string[]; enable?: string[]; disable?: string[] };
    /* EVERY ADD-ON OF THE SETUP THIS IS ONE PIECE OF, so a module goes in for the use case after it as the plan read it. */
    const whole = by.order ?? packs.install ?? [];
    const settings: Body[] = kind === 'settings' ? [body] : Array.isArray(body.settings) ? (body.settings as Body[]) : [];
    const enable = kind === 'pack' && typeof body.enable === 'string' ? [body.enable] : (packs.enable ?? []);
    const disable = kind === 'pack' && typeof body.disable === 'string' ? [body.disable] : (packs.disable ?? []);
    const approved = Array.isArray(body.approve) ? (body.approve as string[]) : [];
    const docs = new Map<string, Body>(kind === 'pack' && typeof body.install === 'string' && isMap(body.doc) ? [[body.install, body.doc]] : []);
    const declarations = kind === 'arrange' && Array.isArray(body.declarations) ? (body.declarations as Body[]).filter(isMap) : [];

    const steps = Array.isArray(body.plan) ? (body.plan as Body[]) : [];
    /* A PATCH WHOSE ENTRY MOVED SINCE THE QUESTION WAS FILED REFUSES ALL OF IT, before anything is installed, so the owner
       is never left with the add-ons in and the changes they were for refused. */
    const stale = kind === 'arrange' && Array.isArray(body.rows) ? staleOf(body.rows as Body[]) : null;
    if (stale) return stopped(stale);
    /* AND SO DOES A DECLARATION SOMEBODY CHANGED SINCE, or one that would now call out something the owner was not shown. */
    const live = new Map(kernel.declarations().map((r) => [r.id, r]));
    for (const [i, x] of declarations.entries()) {
      const now = live.get(String(x.id))?.version ?? 0;
      if (typeof x.was === 'number' && x.was !== now)
        return stopped(refuse('PLAN_STALE', `${declSaid(x)} changed after this was proposed. Propose it again against it as it is now.`, `body.declarations[${i}]`));
      /* AGAINST THE ONE LIVE NOW, which is the one it was filed against: a call it makes already is not asked again. */
      const e = newCall(x, live.get(String(x.id)));
      if (e !== null && !approved.includes(e.line))
        return stopped(refuse('PLAN_STALE', `${declSaid(x)} now calls out something this proposal did not show: ${e.line}. Propose it again.`, 'body.approve'));
    }
    /* AND A TURN ON THAT WOULD CALL OUT SOMETHING UNSHOWN, before anything is in. */
    for (const id of enable) {
      const unshown = on(id) ? [] : kernel.callsWhenEnabled(id).filter((line) => !approved.includes(line));
      if (unshown.length > 0) return stopped(refuse('PLAN_STALE', `${id} would call out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
    }
    /* AND THE ENTRIES, written once and rolled back, when every list they go to is here already: a value the list refuses
       is found before an add-on is in, not after. Entries for a list this press brings are written after it, as before. */
    const rows = kind === 'arrange' && Array.isArray(body.rows) ? (body.rows as Body[]) : [];
    if (rows.length > 0 && rows.every((r) => kernel.register(String(r.register)) !== undefined)) {
      const rehearsal = { rows: null as Result<string[]> | null };
      try {
        kernel.transaction(() => {
          rehearsal.rows = writeRows(rows, actor);
          throw rehearsal;
        });
      } catch (e) {
        if (e !== rehearsal) throw e;
      }
      if (rehearsal.rows !== null && !rehearsal.rows.ok) return stopped(rehearsal.rows);
    }
    /* A SETTING A DECLARATION READS PLANS ITS ADD-ON AGAIN (`replan`), installed over itself at the version it holds. */
    const replans = steps.filter((x) => x.replan === true && typeof x.pack === 'string').map((x) => String(x.pack));
    /* WHAT IS INSTALLED FROM THE HOST'S WHOLE CATALOGUE IS FETCHED AGAIN, held to its checksum again, and must be the version
       the owner was shown: a catalogue that moved since the question was filed is said, and nothing is installed. */
    for (const id of [...(packs.install ?? []), ...replans]) {
      if (docs.has(id) || entryOf(id) || !d.shelf) continue;
      const fetched = await d.shelf.fetch(id);
      if (fetched === null) return stopped(notOffered(id, 'body.packs', await d.shelf.listed()));
      if (!fetched.ok) return stopped(fetched);
      const planned = steps.find((x) => x.pack === id)?.version;
      if (typeof planned === 'string' && planned !== fetched.value.version)
        return stopped(
          refuse('PLAN_STALE', `${fetched.value.title} is at ${fetched.value.version} in this host's catalogue now, and this proposal showed ${planned}. Propose it again.`, 'body.packs'),
        );
      docs.set(id, fetched.value.doc);
      shelfTitles.set(id, fetched.value.title);
    }
    /* THE SETTINGS SENT FOR AN ADD-ON THIS PRESS INSTALLS GO IN WITH IT, as `prepare` planned them. */
    const given = new Map<string, Body>();
    if (kind === 'arrange' || kind === 'settings')
      for (const s of settings)
        if (typeof s.pack === 'string' && isMap(s.values) && [...(packs.install ?? []), ...replans].includes(s.pack)) given.set(s.pack, { ...(given.get(s.pack) ?? {}), ...s.values });
    /* AN ADD-ON INSTALLED OVER ITSELF AGAIN, with the settings in hand: how a replan is taken back. */
    const again = async (id: string, values: Body): Promise<boolean> => {
      const state = d.installed();
      const pack = await packOf(id, docs, heldBy(state), useCaseFor(whole, id));
      if (!pack.ok) return false;
      const diff = await plan(pack.value, state, { settings: values });
      return (await installHeld(kernel, pack.value, diff, d.host(actor), diff.planHash, diff.approve)).ok;
    };
    const filled = new Set<string>();
    const spokeBefore = speakerNow();
    for (const id of [...(packs.install ?? []), ...replans.filter((x) => !(packs.install ?? []).includes(x))]) {
      /* AN UPDATE THE OWNER ACCEPTED goes in over the pack that is on, unless that pack is already at the planned version. */
      const step = steps.find((s) => s.pack === id);
      const held = stateOf(id)?.version ?? null;
      const updating = on(id) && typeof step?.from === 'string' && typeof step.version === 'string' && held !== step.version && laterVersion(step.version, held) === step.version;
      /* PLANNED AGAIN FOR A SETTING, at the version it held when the question was filed; one moved since is said. */
      const replanning = step?.replan === true;
      if (replanning && (!on(id) || held !== step.version))
        return stopped(refuse('PLAN_STALE', `${titleOf(id)} changed after this was proposed. Propose the setting again.`, 'body.settings'));
      if (on(id) && !updating && !replanning) continue;
      if (stateOf(id) && !updating && !replanning) {
        const unshown = kernel.callsWhenEnabled(id).filter((line) => !approved.includes(line));
        if (unshown.length > 0)
          return stopped(refuse('PLAN_STALE', `${id} would call out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
        const back = await kernel.enablePack(id, { actor });
        if (!back.ok) return stopped(back);
        done.enabled.push(id);
        undo.push({ said: id, back: async () => kernel.disablePack(id, { actor }).ok });
        continue;
      }
      const state = d.installed();
      const pack = await packOf(id, docs, heldBy(state), useCaseFor(whole, id));
      if (!pack.ok) return stopped(pack);
      const diff = await plan(pack.value, state, { settings: given.get(id) });
      const unshown = diff.approve.filter((line) => !approved.includes(line));
      if (unshown.length > 0)
        return stopped(refuse('PLAN_STALE', `${id} now calls out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
      const from = state.packs.find((p) => p.id === id)?.version ?? null;
      /* WHAT TAKES IT BACK, read before it lands: a fresh add-on comes out whole, and one over itself goes in again with the
         settings it held. One that had declarations live under it before (a handover), or an update, cannot be. */
      const before = replanning ? heldValues(id, Object.keys(given.get(id) ?? {})) : null;
      const fresh = from === null && running(id) === undefined;
      const put = await installHeld(kernel, pack.value, diff, d.host(actor), diff.planHash, diff.approve);
      if (!put.ok) return stopped(put);
      /* AND WHAT A PAGE IT KEPT GOES WITHOUT IS ASKED ABOUT, once it is in. A question that will not file leaves it in. */
      try {
        const said = d.kept?.(pack.value, diff, titleOf);
        /* AND WHAT IT REWORDED ON A PAGE OR LIST HE CHANGED, said in the answer Decide reads back (RJ6). */
        if (said) done.said.push(...said);
      } catch {
        /* The page is kept either way. */
      }
      if (given.has(id)) filled.add(id);
      if (replanning) {
        undo.push({ said: id, back: () => again(id, before ?? {}) });
        continue;
      }
      done.installed.push(id);
      undo.push({ said: id, back: async () => fresh && uninstall(id, d.host(actor)).ok });
      await carryUpdate(d.catalogue, kernel, id, from, actor);
      await afterInstall(id, actor);
    }
    for (const id of enable) {
      if (on(id)) continue;
      const back = await kernel.enablePack(id, { actor });
      if (!back.ok) return stopped(back);
      done.enabled.push(id);
      undo.push({ said: id, back: async () => kernel.disablePack(id, { actor }).ok });
    }
    for (const id of disable) {
      if (running(id)?.disabled_at !== null) continue;
      const off = kernel.disablePack(id, { actor });
      if (!off.ok) return stopped(off);
      done.disabled.push(id);
      undo.push({ said: id, back: async () => (await kernel.enablePack(id, { actor })).ok });
    }
    /* THE VOICE RULE, WRITTEN DOWN (`declare` `voiceWrites`). The use case an arrangement sets the record up for speaks;
       any other use case this press added or turned on goes beside the one that spoke before, which keeps its voice. Every
       use case on is then set to speak or not, so a third one, or an id that sorts first, never moves it. */
    const lead = kind === 'arrange' && typeof body.usecase === 'string' ? packIdOf(body.usecase.replace(new RegExp(`^${USE_CASE}`), '')) : null;
    const updated = new Set(steps.filter((s) => typeof s.from === 'string').map((s) => String(s.pack)));
    const joined = [...done.installed.filter((id) => !updated.has(id)), ...done.enabled].filter((id) => id.startsWith(USE_CASE));
    if (lead !== null || joined.length > 0) {
      const speaker = (lead !== null && on(lead) ? lead : null) ?? (spokeBefore !== null && on(spokeBefore) ? spokeBefore : null) ?? speakerNow();
      if (speaker !== null) {
        const spoke = new Map(speakingStates(kernel).flatMap((s) => (s.id.startsWith(USE_CASE) ? [[s.id, s.speaks ?? null] as const] : [])));
        writeVoice(kernel, speaker, actor);
        /* TAKEN BACK BY WRITING WHAT EACH USE CASE STILL HERE SAID BEFORE. One this press brought is gone by then. */
        undo.push({
          said: 'the voice',
          back: async () =>
            [...spoke].every(([id, was]) => !stateOf(id) || speakingStates(kernel).find((s) => s.id === id)?.speaks === was || kernel.setPackConfig(id, { [SPEAKS]: was }, { actor }).ok),
        });
      }
    }
    /* THE DECLARATIONS IT CARRIES, one install, each at the version the owner was shown, before the pages
       that may read them. */
    if (declarations.length > 0) {
      const was = declarations.map((x) => live.get(String(x.id)));
      const put = await kernel.install(
        declarations.map((x) => ({ id: String(x.id), kind: x.kind, body: x.body }) as never),
        declarations.map((x, i) => ({ id: String(x.id), version: was[i]?.version ?? 0 })),
        { actor },
      );
      if (!put.ok) return stopped('refusal' in put ? put : refuse('PLAN_STALE', 'A declaration here changed after this was proposed. Propose it again.', 'body.declarations'));
      for (const [i, x] of declarations.entries()) {
        done.declarations.push(String(x.id));
        undo.push({ said: declSaid(x), back: putBack(String(x.id), String(x.kind), was[i]) });
      }
    }
    for (const page of Array.isArray(body.pages) ? (body.pages as Body[]) : []) {
      const was = kernel.declarations().find((r) => r.id === String(page.id));
      const put = await kernel.install([{ id: String(page.id), kind: 'page', body: page.body as never }], undefined, { actor });
      if (!put.ok) return stopped(put);
      done.pages.push(String(page.id));
      undo.push({ said: String(page.id), back: putBack(String(page.id), 'page', was) });
    }
    for (const s of settings) {
      /* ALREADY WRITTEN BY ITS INSTALL, which kept the values as chosen. */
      if (filled.has(String(s.pack))) {
        if (!done.settings.includes(String(s.pack))) done.settings.push(String(s.pack));
        continue;
      }
      const before = heldValues(String(s.pack), Object.keys(isMap(s.values) ? s.values : {}));
      const set = kernel.setPackConfig(String(s.pack), s.values, { actor });
      if (!set.ok) return stopped(set);
      done.settings.push(String(s.pack));
      undo.push({ said: String(s.pack), back: async () => kernel.setPackConfig(String(s.pack), before, { actor }).ok });
    }
    /* THE OWNER THEMSELVES (`meetOwner`), after the add-ons, so the list that plays `meets` is the one this press leaves,
       and before the entries, so they are the first person in it. Not taken back: a person met is kept, and said so. */
    if (kind === 'arrange' && by.own === true && isMap(body.me)) {
      const met = meetOwner(body.me, actor);
      if (!met.ok) return stopped(met);
      done.me.push(met.value);
      undo.push({ said: met.value === 'account' ? 'your name on your account' : 'you in your own list', back: async () => false });
    }
    /* THE ROWS, ALL OR NONE, in order, each written as the owner who accepted, with a link set to the row it points at. */
    if (rows.length > 0) {
      const wrote = writeRows(rows, actor);
      if (!wrote.ok) return stopped(wrote);
      done.rows.push(...wrote.value);
    }
    /* AND WHAT WAITED FOR ANY OF IT LANDS (`planAgain`). Last, so nothing after it can stop and take the press back. */
    if (done.installed.length + done.enabled.length + done.declarations.length > 0) await planAgain({ kernel, installed: d.installed, host: d.host(actor) });
    return ok(Object.fromEntries(Object.entries(done).filter(([, v]) => v.length > 0)));
  }

  /**
   * A RECORD SET UP IN ONE CALL: what the first run asks for, read as an arrangement and applied here, by the
   * owner and signed by them. The press was a script in the browser, and a closed tab left the record part made.
   *
   * READ WHOLE, APPLIED PIECE BY PIECE. `prepare` checks all of it against the record as its add-ons leave it, and a
   * refusal there writes nothing. Then each add-on, each turn on or off, each add-on's settings, the declarations, each
   * page, the owner themselves and the entries is one `apply`, all or none within itself. A PIECE THAT IS REFUSED KEEPS
   * THE ONES BEFORE IT AND SAYS SO: an arrangement accepted on Decide takes everything back, because its question
   * reopens holding all of it, and a first run has no question to reopen, so two add-ons in and a third refused is two
   * add-ons the person has, with the third named in `failed` beside why.
   *
   * ON A RECORD THAT HOLDS ADD-ONS ALREADY IT IS REFUSED, UNLESS `again` IS TRUE, and then it writes only what is
   * missing: an add-on that is on is passed over (`apply`), the owner is found by their address or their mark and not
   * added twice, and the entries of a press that says its `key` are written once however often it is sent.
   */
  async function setup(raw: Body, actor: string): Promise<Result<SetupAnswer>> {
    const { again, key, ...asked } = raw;
    if (again !== undefined && typeof again !== 'boolean') return refuse('VALUE_MALFORMED', 'again is true to add only what is missing, or left out.', 'again');
    if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/u.test(key)))
      return refuse('VALUE_MALFORMED', 'key is a short handle of your own for this press, such as first-run or import-3, so its entries are written once.', 'key');
    const here = states();
    if (again !== true && here.length > 0)
      return refuse(
        'TRANSITION_ILLEGAL',
        `This BrainDog is set up already: it holds ${listed(here.map((s) => titleOf(s.id)))}. Send again as true to add only what is missing.`,
        'again',
      );
    const prepared = await prepare('arrange', asked, { own: true });
    if (!prepared.ok) return prepared;
    const p = prepared.value;
    /* THE STRETCH OF THE LOG THIS PRESS WRITES, kept when it is done, so what it made is never "you added" (PK1). */
    const began = kernel.version();
    const packs = (isMap(p.packs) ? p.packs : {}) as { install?: string[]; enable?: string[]; disable?: string[] };
    const order = packs.install ?? [];
    const maps = (x: unknown): Body[] => (Array.isArray(x) ? x.filter(isMap) : []);
    const steps = maps(p.plan);
    const settings = maps(p.settings);
    const labels = new Map(maps(p.parts).map((x) => [String(x.id), String(x.label)]));
    const named = (isMap(p.names) ? p.names : {}) as Record<string, unknown>;
    const approve = p.approve ?? [];
    const done: Record<string, string[]> = {};
    const failed: SetupPart[] = [];
    const skipped: SetupPart[] = maps(p.skipped).map((x) => ({ part: String(x.part), why: String(x.why) }));
    /** One piece, applied: what it did joins `done`, and a refusal joins `failed` under the piece's own words. */
    const piece = async (part: string, label: string, body: Body): Promise<boolean> => {
      const out = await apply('arrange', { ...body, approve }, actor, { own: true, order });
      if (!out.ok) {
        failed.push({ part, label, why: (out as { refusal: Refusal }).refusal.fix });
        return false;
      }
      for (const [k, ids] of Object.entries(out.value)) if (Array.isArray(ids)) done[k] = [...new Set([...(done[k] ?? []), ...ids.map(String)])];
      return true;
    };
    const lead = typeof p.usecase === 'string' ? { usecase: p.usecase } : {};
    for (const id of order) {
      const mine = { ...lead, packs: { install: [id] }, plan: steps.filter((s) => s.pack === id && s.replan !== true), settings: settings.filter((s) => s.pack === id) };
      await piece(`install:${id}`, labels.get(`install:${id}`) ?? `Add ${titleOf(id)}`, mine);
    }
    for (const id of packs.enable ?? []) await piece(`enable:${id}`, labels.get(`enable:${id}`) ?? `Turn on ${titleOf(id)}`, { ...lead, packs: { enable: [id] } });
    for (const id of packs.disable ?? []) await piece(`disable:${id}`, labels.get(`disable:${id}`) ?? `Turn off ${titleOf(id)}`, { packs: { disable: [id] } });
    /* THE SETTINGS OF AN ADD-ON THIS DID NOT INSTALL, with the step that plans it again where a declaration reads one. */
    for (const pack of new Set(settings.map((s) => String(s.pack)))) {
      if (order.includes(pack)) continue;
      const mine = { settings: settings.filter((s) => s.pack === pack), plan: steps.filter((s) => s.pack === pack && s.replan === true) };
      await piece(`setting:${pack}`, labels.get(`setting:${pack}`) ?? `Settings of ${titleOf(pack)}`, mine);
    }
    const declarations = maps(p.declarations);
    if (declarations.length > 0) await piece('declarations', 'What it declares', { declarations });
    for (const page of maps(p.pages)) {
      const id = `page:${String(page.id).replace(/^page\./u, '')}`;
      await piece(id, labels.get(id) ?? 'A page', { pages: [page] });
    }
    if (isMap(p.me)) await piece('me', 'You', { me: p.me });
    await setupRows(maps(p.rows), { again: again === true, key: typeof key === 'string' ? key : null, named, labels, piece, failed, skipped });
    const ended = kernel.version();
    if (ended > began) kernel.setPref(SETUP_HOLDER, SETUP_MADE, [...madeSpans(kernel), { from: began + 1, to: ended, actor }].slice(-SETUP_MADE_KEPT));
    return ok({ done, failed, ...(skipped.length === 0 ? {} : { skipped }) });
  }

  /**
   * THE ENTRIES OF A SETUP. One for a list that is not here, because its add-on was refused, is left out and said, and
   * the rest are written, all or none: an invoice whose client was not written is written with no one on it, as the
   * first run always did. A press that says its `key` writes its entries once: a second one with `again` passes them over.
   */
  async function setupRows(
    rows: readonly Body[],
    o: { again: boolean; key: string | null; named: Record<string, unknown>; labels: ReadonlyMap<string, string>; piece: (part: string, label: string, body: Body) => Promise<boolean>; failed: SetupPart[]; skipped: SetupPart[] },
  ): Promise<void> {
    if (rows.length === 0) return;
    const wrote = kernel.prefsOf(SETUP_HOLDER)[SETUP_KEYS];
    const keys = Array.isArray(wrote) ? wrote.filter((k): k is string => typeof k === 'string') : [];
    if (o.again && o.key !== null && keys.includes(o.key)) {
      o.skipped.push({ part: 'rows', label: 'Your entries', why: 'These entries were written by an earlier press, so they were not written again.' });
      return;
    }
    const kept: Body[] = [];
    const place = new Map<number, number>();
    const lost = new Map<string, number>();
    for (const [i, r] of rows.entries()) {
      const register = String(r.register);
      if (kernel.register(register) === undefined) {
        lost.set(register, (lost.get(register) ?? 0) + 1);
        continue;
      }
      const { links: sent, ...row } = r;
      const links = Object.fromEntries(Object.entries(isMap(sent) ? sent : {}).flatMap(([field, to]) => (place.has(Number(to)) ? [[field, place.get(Number(to))!]] : [])));
      place.set(i, kept.length);
      kept.push({ ...row, ...(Object.keys(links).length === 0 ? {} : { links }) });
    }
    for (const [register, n] of lost) {
      const list = typeof o.named[`register.${register}`] === 'string' ? String(o.named[`register.${register}`]) : register;
      o.failed.push({ part: `rows:${register}`, label: o.labels.get(`rows:${register}`) ?? `Additions to ${list}`, why: `${list} is not here, so ${n === 1 ? 'its entry was' : `its ${n} entries were`} not written.` });
    }
    if (kept.length === 0) return;
    const landed = await o.piece('rows', 'Your entries', { rows: kept });
    if (landed && o.key !== null) kernel.setPref(SETUP_HOLDER, SETUP_KEYS, [...keys.filter((k) => k !== o.key), o.key].slice(-SETUP_KEYS_KEPT));
  }

  function writeRows(rows: readonly Body[], actor: string): Result<string[]> {
    const batch = ulids(() => Date.now())();
    const halted: { refusal: Refusal | null } = { refusal: null };
    const made: { spoken: string; id: string }[] = [];
    try {
      kernel.transaction(() => {
        for (const [i, r] of rows.entries()) {
          const register = String(r.register);
          /* A PATCH, COMPARE-AND-SET at the version the owner was shown, and a delete as its own write after the fields, as
             a rowset's update is (govern `applyUpdate`). A version that moved refuses all of it, naming the entry. */
          if (typeof r.at === 'string') {
            const { deleted_at, ...patch } = (isMap(r.patch) ? r.patch : {}) as Body;
            let version = Number(r.version);
            let out: ReturnType<Kernel['update']> | null = null;
            /* NO NOTE OF ITS OWN: the feed says a note in the verb's place, and "You Changed by a plan accepted on Decide"
               named a place that is Needs you now. The batch ties the plan's writes. */
            const by = { actor, batch, cascade: false };
            if (Object.keys(patch).length > 0) out = kernel.update(register, r.at, patch as never, { ...by, version });
            if (out?.ok) version = out.value.version;
            if (deleted_at !== undefined && (out === null || out.ok)) out = kernel.update(register, r.at, { deleted_at } as never, { ...by, version });
            if (out && !out.ok) {
              const refusal = 'refusal' in out ? out.refusal : null;
              const stale = refusal === null || refusal.code === 'VERSION_STALE';
              halted.refusal = stale
                ? (staleSaid(entryWords(register, isMap(r.before) ? r.before : {}), `body.rows[${i}]`) as { refusal: Refusal }).refusal
                : { ...refusal, at: `body.rows[${i}]${refusal.at ? `.${refusal.at}` : ''}` };
              throw halted;
            }
            made.push({ spoken: r.at, id: r.at });
            continue;
          }
          const fields: Record<string, unknown> = { ...(r.fields as Body) };
          for (const [field, to] of Object.entries(isMap(r.links) ? r.links : {})) {
            const target = made[Number(to)];
            if (target) fields[field] = target.spoken;
          }
          /* No note either way: the feed reads "You added Ada", not "You Added from a plan accepted on Decide." */
          const out = kernel.create(register, fields as never, { actor, batch });
          if (!out.ok) {
            const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE' as const, fix: 'Something changed while the plan was written. Accept it again.' };
            halted.refusal = { ...refusal, at: `body.rows[${i}]${refusal.at ? `.${refusal.at}` : ''}` };
            throw halted;
          }
          made.push({ spoken: `${register}#${out.value.seq}`, id: out.value.id });
        }
      });
    } catch (e) {
      if (e !== halted) throw e;
      return { ok: false, refusal: halted.refusal! };
    }
    return ok(made.map((m) => m.spoken));
  }

  /**
   * An add-on's install asked again at the version the catalogue holds now, when its plan went stale because the
   * catalogue moved on (`PLAN_STALE` in `apply`): the body `prepare` files for it today, and the sentence the question
   * comes back with. `null` for anything else, or when it would not plan today, and the refusal then stands as it was.
   *
   * MEASURED ON THE LIVE RECORD: an add-on's install was asked at one version, the catalogue moved a patch on before the
   * yes, and the question came back saying "Propose it again", which an owner cannot do: an add-on the catalogue does not
   * list is not in Browse. Asked again here, it waits at the newer version with the plan that version makes, and the next
   * yes installs it.
   */
  async function askAgain(kind: 'pack' | 'settings' | 'arrange', body: Body): Promise<{ body: Body; said: string } | null> {
    if (kind !== 'pack' || typeof body.install !== 'string') return null;
    const id = body.install;
    const fresh = await prepare('pack', { install: id, ...(isMap(body.doc) ? { doc: body.doc } : {}) });
    if (!fresh.ok) return null;
    const versionIn = (b: Body): string | null => {
      const step = (Array.isArray(b.plan) ? (b.plan as Body[]) : []).find((s) => s.pack === id);
      return typeof step?.version === 'string' ? step.version : null;
    };
    const was = versionIn(body);
    const now = versionIn(fresh.value);
    if (now === null || now === was) return null;
    const title = typeof fresh.value.title === 'string' && fresh.value.title.trim() !== '' ? fresh.value.title.trim() : titleOf(id);
    return { body: fresh.value, said: `${title} is at ${now} in the catalogue now${was === null ? '' : `, where this asked for ${was}`}, so it asks for ${now}. Read it again, and accept to install it.` };
  }

  return { overview, declaration, prepare, apply, setup, askAgain };
}
