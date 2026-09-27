/**
 * "Make it mine": the one press that writes a first run's proposal into the record (`loop/finish/modules.md` MOD-6).
 *
 * THE INSTALL PATH BROWSE ALREADY USES, NEVER A SECOND ONE. The use case goes in as the file it would be if somebody
 * shared it (`builtInFile`), planned by the record's `planUseCase` and installed pack by pack through `installPack`
 * (`planShared`, `installShared`), then its formed plan is linked and its rail order kept (`afterInstall`). What the
 * screen used to do instead was about ten record calls of its own, with a branch for each way one could fail.
 *
 * NOTHING IS WRITTEN AS AN EXAMPLE (`loop/DIRECTION.md` §26). The use case's own example rows are taken out of the file
 * before it is read, the modules go in with none (`moduleDocument`, C11), and the only rows written are the ones formed
 * from the person's own sentence: a guide's plan, the person, and the entries the sentence filled completely.
 *
 * IN THIS ORDER, because each step reads what the one before it made: the lists; the person's own People row, before
 * any client the sentence named; the record's currency, once Money is in; then the sentence's entries.
 *
 * A REFUSAL IS SAID IN THE PERSON'S WORDS ("Money was not added.") with the record's own sentence kept beside it for
 * Details and for the log. Whatever went in stays in: an install is not undone because a later step was refused.
 */

import type { createClient } from '@braindog/client';
import { modulesFor, useCase, type UseCase } from '@braindog/seed/usecases';

import { firstRun } from '../../lib/first-run.ts';
import { MODULES } from '../../lib/record/modules.ts';
import { packDocument, relabelDocument, type PackState } from '../../lib/record/packs.ts';
import { hear, introduce, personRow, PEOPLE } from '../../lib/who.ts';
import type { Proposal } from '../../lib/start/propose.ts';
import { afterInstall, installShared, keepVoice, planShared, speakingStates } from '../packs/sharing.ts';

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
};

/** One thing that was not made: the person's sentence and the record's. */
export type NotMade = { said: string; why: string };

/**
 * What the press made: what could not be made, the sentence's entries it did not write, and the rail order to keep,
 * `null` for no change. An entry left whose client was written names that client in its own fields, so a second press
 * links it without writing the client again.
 */
export type Accepted = { failed: NotMade[]; left: Proposal['rows']; nav: string[] | null };

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
const nameOf = (id: string): string => MODULES.find((m) => m.id === id)?.name ?? id;

/** Install one module alone, for a proposal with no use case: planned, then installed with exactly that plan's hash. */
async function addModule(client: Client, id: string, held: readonly PackState[]): Promise<string | null> {
  const state = held.find((p) => p.id === id);
  if (state) {
    if (state.disabled_at === null) return null;
    /* THE PERSON LEFT IT ON, SO IT IS TURNED ON. A module off on this record is turned on only when it is in what the
       person kept, which is how People stays off behind somebody who turned it off. */
    const on = (await client.enablePack({ id })) as Wire<unknown>;
    return on.ok ? null : fixOf(on, '');
  }
  const doc = await packDocument(id, held);
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

/** The row a spoken id such as `people#3` names, or `null`. */
function rowOf(spoken: string): { register: string; seq: number } | null {
  const m = /^([a-z][a-z0-9_]*)#(\d+)$/u.exec(spoken);
  return m && m[1] !== undefined && m[2] !== undefined ? { register: m[1], seq: Number.parseInt(m[2], 10) } : null;
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
  if (!held.ok) return { failed: [{ said: firstRun.notAllMade, why: held.why }], left: asked.proposal.rows, nav };
  let states = held.value;
  const who = hear(asked.sentence);
  const u = asked.usecase === null ? null : (useCase(asked.usecase) ?? null);
  /* PEOPLE IS NEVER TURNED BACK ON BEHIND SOMEBODY WHO TURNED IT OFF (`loop/DIRECTION.md` §9). A name heard in the
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
    const planned = await planShared(client, { text: JSON.stringify(file), source: 'local' }, states, (m, h, id) => packDocument(m, h, id), (m, h, id) => relabelDocument(m, h, id));
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
      const refused = await addModule(client, id, states);
      if (refused !== null) failed.push({ said: firstRun.notAdded(nameOf(id)), why: refused });
      const now = await packsOf(client);
      if (now.ok) states = now.value;
    }

  /* THE USE CASE CHOSEN SPEAKS, AND ANY BESIDE IT IS SET NOT TO, so no use case added later moves the voice by how its
     id sorts (`sharing.ts` `keepVoice`). With one use case there is nothing to write. */
  if (u && installed.length > 1) await keepVoice(client, await speakingStates(client, states), u.usecase, 'speaks');

  /* ── the person, first ─────────────────────────────────────────────────── */
  /* ONLY WITH PEOPLE ON, and People is on only where the person left it on: `introduce` reads the record, and a name heard
     with People off was said back on the preview and is stored nowhere. */
  const met = introduce(who, asked.email, states);
  if (met) {
    const out = (await client.meet(met)) as Wire<{ person: string; created: boolean }>;
    if (out.ok) {
      /* THE WORDS AFTER THE NAME ARE THE PERSON'S NOTE, which is where a sentence these rules could not read is kept. */
      const row = rowOf(out.value.person);
      if (row && out.value.created && who.bio !== '') await client.update({ register: row.register, seq: row.seq, patch: { note: who.bio } }).catch(() => null);
    } else {
      /* A PEOPLE LIST WITH NO PROJECTS TO LINK, a student's or a guide's, is one `meet` refuses (it writes the agents
         pack's fields), so the person is written as a plain entry instead, and is in People like anybody else. */
      const plain = (await client.create({ register: PEOPLE, fields: personRow(met, who.bio) }).catch(() => null)) as Wire<unknown> | null;
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

  return { failed, left, nav };
}
