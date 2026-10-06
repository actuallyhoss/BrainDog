/**
 * "Make it mine": the one press that writes a first run's proposal into the record.
 *
 * THE INSTALL PATH BROWSE ALREADY USES, NEVER A SECOND ONE. The use case goes in as the file it would be if somebody
 * shared it (`builtInFile`), planned by the record's `planUseCase` and installed pack by pack through `installPack`
 * (`planShared`, `installShared`), then its formed plan is linked and its rail order kept (`afterInstall`). What the
 * screen used to do instead was about ten record calls of its own, with a branch for each way one could fail.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE. The use case's own example rows are taken out of the file
 * before it is read, the modules go in with none (`moduleDocument`), and the only rows written are the ones formed
 * from the person's own sentence: a guide's plan, the person, and the entries the sentence filled completely.
 *
 * IN THIS ORDER, because each step reads what the one before it made: the lists, and People again once every list it
 * links to is in; the person's own People row, before any client the sentence named; the record's currency, once Money
 * is in; then the sentence's entries.
 *
 * A REFUSAL IS SAID IN THE PERSON'S WORDS ("Money was not added.") with the record's own sentence kept beside it for
 * Details and for the log. Whatever went in stays in: an install is not undone because a later step was refused.
 *
 * AND A FILE THE PERSON POINTED AT GOES IN LAST, once the list it maps into is there: a list this build ships is
 * installed with the rest, and a list of the file's own is filed as a change and accepted in this press, as what Slash
 * drafted is. Its entries are the file's, each checked against the list before it is sent (`lib/start/export.ts`).
 */

import type { createClient } from '@braindog/client';
import { modulesFor, useCase, type UseCase } from '@braindog/seed/usecases';
import { moduleName } from '@braindog/seed/usecases/names';

import { firstRun } from '../../lib/first-run.ts';
import { packDocument, relabelDocument, type PackState } from '../../lib/record/packs.ts';
import { fileDrafted, type Drafted, type SlashClient } from '../../lib/record/slash.ts';
import { hear, introduce, personRow, PEOPLE } from '../../lib/who.ts';
import { allLists } from '../../lib/start/lists.ts';
import { entriesOf, newListDeclarations, ownList, type Export, type Mapping } from '../../lib/start/export.ts';
import type { Proposal } from '../../lib/start/propose.ts';
import { afterInstall, installShared, keepVoice, planShared, speakingStates } from '../packs/sharing.ts';
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
  /** A file the person pointed at and how it maps, when they kept it, and the language its days are read in. */
  imported?: { file: Export; mapping: Mapping } | null;
  locale?: string;
};

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
};

/** The record's own sentence for a refusal, or the calm one when nothing answered. */
const fixOf = (r: Wire<unknown>, otherwise: string): string => (!r.ok && 'refusal' in r ? r.refusal.fix : otherwise);

/**
 * THE MODULES A USE CASE IS INSTALLED WITH: every one it stands on, and the ones the person kept beside them, in the
 * order each list a later one points at comes first (`modulesFor`).
 */
export const withNeeds = (u: UseCase | null, kept: readonly string[]): string[] => (u ? modulesFor(u, kept) : [...kept]);

/**
 * THE USE CASE AS A SHARED FILE, WITH NOTHING IN IT BUT WHAT THE PERSON ASKED FOR.
 *
 * `builtInFile` carries the use case's pack as it ships, examples included, because Browse hands out the same file. Its
 * rows are replaced here with the plan formed from what the person said (`carriedDocument`, tagged `formed`) or with
 * none, and its links with the formed plan's. `modules` is what the person kept, so the modules the sentence named beside
 * the use case go in through the same plan.
 */
export async function fileFor(u: UseCase, modules: readonly string[], today: string, said: string): Promise<Body | null> {
  const [{ builtInFile }, { carriedDocument, formedFor }] = await Promise.all([import('@braindog/seed/usecases/share'), import('@braindog/seed/usecases/install')]);
  const file = builtInFile(u.usecase, today);
  if (!file) return null;
  const { links: _links, pack: shipped, ...rest } = file;
  const formed = formedFor(u, said);
  const formedRows = carriedDocument(u, today, said)?.seeds;
  const seeds = Array.isArray(formedRows) ? (formedRows as unknown[]) : [];
  let pack: unknown = shipped;
  if (shipped !== null && typeof shipped === 'object') {
    const { seeds: _examples, ...bare } = shipped as Body;
    pack = seeds.length > 0 ? { ...bare, seeds } : bare;
  }
  return { ...rest, modules: withNeeds(u, modules), pack, ...(formed && formed.links.length > 0 ? { links: [...formed.links] } : {}) };
}

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
export function named(doc: Record<string, unknown> | null, names: Readonly<Record<string, string>> | undefined): Record<string, unknown> | null {
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

/**
 * A MODULE PLANNED AGAIN ONCE EVERY LIST IS IN, and installed when that plan changes anything.
 *
 * A MODULE'S COPY IS CUT TO THE LISTS THE RECORD HOLDS WHEN IT GOES IN (`packDocument`). People goes in before Money, so
 * its copy left out what an organisation's page shows of Money, and the page gained it only at People's next update.
 * Planned again here, with the lists of everything this press put in, it gains it now. Nothing is said when the record
 * refuses it: People works as it went in, and its next update brings the rest.
 *
 * `ours` IS WHETHER THIS PRESS PUT THE MODULE IN. One the record held before is the person's, and may carry what they
 * changed, so its plan goes in only when it asks nothing to be approved and takes nothing away; otherwise it waits for
 * the module's own update, where the person sees it.
 */
async function refreshModule(client: Client, id: string, held: readonly PackState[], names?: Readonly<Record<string, string>>, ours = true): Promise<void> {
  if (!held.some((p) => p.id === id && p.disabled_at === null)) return;
  const doc = named(await packDocument(id, held), names);
  if (!doc) return;
  /* A PLAN THAT THROWS IS A REFUSAL TOO, and says nothing: everything this press put in is in already. */
  const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as Wire<{ diff?: { planHash?: unknown; approve?: unknown; adds?: unknown; changes?: unknown; retires?: unknown } }> | null;
  if (!planned?.ok) return;
  const diff = planned.value.diff;
  const some = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
  if (typeof diff?.planHash !== 'string' || diff.planHash === '' || !(some(diff.adds) || some(diff.changes) || some(diff.retires))) return;
  const approve = Array.isArray(diff.approve) ? (diff.approve as unknown[]).filter((a): a is string => typeof a === 'string') : [];
  if (!ours && (approve.length > 0 || some(diff.retires))) return;
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
export async function accept(client: Client, asked: Accepting): Promise<Accepted> {
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
    await refreshModule(client, PEOPLE, states, names, peopleOurs);
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
     with People off was said back on the preview and is stored nowhere. */
  const met = introduce(who, asked.email, states);
  if (met) {
    const out = (await client.meet(met)) as Wire<{ row: { register: string; seq: number | null } | null; created: boolean; matched_by?: string }>;
    const row = out.ok ? out.value.row : null;
    if (row && row.seq !== null) {
      /* THE WORDS AFTER THE NAME ARE THE PERSON'S NOTE, which is where a sentence these rules could not read is kept. */
      if (out.ok && out.value.created && who.bio !== '') await client.update({ register: row.register, seq: row.seq, patch: { note: who.bio } }).catch(() => null);
      /* THIS IS THEM, SO THE ROW SAYS SO (People's `self`, `loop/contract-17.md`): their own commits and mail are never
         met as somebody new, and an imported copy of them folds into this row. A People list older than the part refuses
         it, and the row stays an ordinary person.
         ONLY A ROW THAT IS SURELY THEM: one this press added, or one already known by the address they signed in with.
         A row matched on a name alone may be somebody else of that name, and marking them as the owner would fold the
         owner's own commits into a stranger. */
      const theirs = out.ok && (out.value.created || out.value.matched_by === 'key');
      if (theirs) await client.update({ register: row.register, seq: row.seq, patch: { self: true } }).catch(() => null);
    } else {
      /* A PEOPLE LIST WITH NO PROJECTS TO LINK, a student's or a guide's, is one `meet` refuses (it writes the agents
         pack's fields), so the person is written as a plain entry instead, and is in People like anybody else. A name
         with no address is only a mention to `meet`, which keeps no row, and the person the record belongs to is no
         mention: they are written the same way. Marked as them where the list has the part, plain where it does not. */
      const fields = personRow(met, who.bio);
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

  /* ── the file they pointed at ─────────────────────────────────────────── */
  if (asked.imported) {
    const now = await packsOf(client);
    if (now.ok) states = now.value;
    /* THE CURRENCY THE PREVIEW DREW THE FILE IN: the one chosen for Money, or the one typed where Money is not kept. */
    const done = await importFile(client, asked.imported, asked.currency ?? asked.proposal.currency, asked.locale ?? 'en', states);
    failed.push(...done);
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
export async function importFile(
  client: Client,
  imported: { file: Export; mapping: Mapping },
  currency: string | null,
  locale: string,
  states: readonly PackState[],
): Promise<NotMade[]> {
  const { file, mapping } = imported;
  let own = undefined;
  if (mapping.list === null) {
    const taken = [...new Set([...states.flatMap((p) => p.registers), ...allLists().map((l) => l.id)])];
    own = ownList(file, mapping.name, currency, locale, taken);
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
