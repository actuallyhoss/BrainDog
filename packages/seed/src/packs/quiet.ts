/**
 * BRAINDOG'S OWN UPDATES REACH A RECORD ON THEIR OWN WHEN NOTHING THE PERSON CHANGED WOULD BE LOST (DIRECTION §37), and
 * otherwise come to Decide as one question.
 *
 * WHY. A record holding People 2.x had no way to People 3.0.0 but somebody opening Add-ons, finding Updates and pressing
 * it, so a record already in use (the owner's own, measured on October 6th: People 2.x, no organisations, no `self`)
 * kept meeting every company as a person and could not say which person it was. The Decide card for page updates
 * (`apps/web/src/routes/decide/improved.ts`) is the second half of §37; this is the first, for whatever runs on its own
 * (the server on deploy, the night): every first-party module this build ships at a newer version than the record
 * holds, planned against the record as it is now, put in when the plan loses nothing, asked about once when it would.
 *
 * WHAT COUNTS AS LOST, read off the plan (`@braindog/declare` `Diff`) and said in words (`losses`): something taken away
 * that is not handed on, something the person took off that the update would bring back, a list of the person's own
 * the update would take over, a field that would hold another kind of thing or become required, a sentence the person
 * wrote that would count differently, a rename, another pack that would stop working, and anything that reaches outside
 * the record, which no update is ever let do unasked.
 * NOT LOST: a page or list the person changed, which the plan keeps as they made it (`kept`), and a choice the rows
 * still hold, which stays (`stays`). An update that only adds and improves goes in.
 *
 * ASKED ONLY WHERE A YES INSTALLS IT. The record files a pack question only when the accept would install it
 * (`planAll` in `packages/record/src/arrange.ts` refuses a conflict and every `installFault`), so a loss `install`
 * refuses whoever answers (a list taken over, a retype, a newly required field, a misread, a rename, a pack that would
 * stop working) is no question: the step is `refused`, says what it would lose, and Decide's update card shows it.
 * What is asked is what a person can say yes to: something taken away, something brought back, a service outside.
 *
 * EVERY MODULE ALIKE, AND EVERY RECORD. Nothing here names a pack, a version or a record (§27): People 3.0.0 reaches the
 * owner's record because it is a newer first-party module that loses nothing there, as Work 1.15.0 will.
 *
 * NO EXAMPLE ROWS. An update planted on its own writes no row nobody typed, so a document that carries any is sent
 * without them.
 *
 * AND THE AGENTS PACK AND THE USE CASES, AFTER THE FIVE (`loop/research-audit-30.md`, Medium 3). The loop walked
 * `FIRST_PARTY` alone, so Agents 1.8.0 and the founder's and the team's page updates reached no record that already
 * held them: their tests planned and installed by hand, and nothing ran at night. They are BrainDog's own as much as
 * Money is, so they take the same road: Agents once the five are in, since it reads Projects, then each use case the
 * record holds, since a use case's pages read the modules under it. Their documents are built here (`documentOf`),
 * because the port lends a document for the five only.
 */

import type { Diff } from '@braindog/declare';
import { compareVersions } from '@braindog/declare/catalogue';
import type { Result } from '@braindog/ports';

import { USE_CASES, keptLists, useCaseDocument } from '../usecases/index.ts';
import { moduleName, namesSaid } from '../usecases/names.ts';
import { AGENTS_PACK, agentsPackDocument } from './agents.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS } from './first-party.ts';

type Body = Record<string, unknown>;

/** The one question an update that would lose something files: install this pack, from the record's own document. */
export type QuietQuestion = { question: string; body_kind: 'pack'; body: { install: string } };

/** What the caller lends: the record as it is, its plan and install, and Decide. */
export type QuietPort = {
  /** The packs the record holds, each with its version and whether it is on. */
  held(): readonly { id: string; version: string | null; on: boolean }[] | Promise<readonly { id: string; version: string | null; on: boolean }[]>;
  /**
   * One first-party module's document as it would go into this record now (`moduleDocument` or `firstPartyDocument` with
   * the lists the record holds), or `null` for none. Asked after every module before it went in, so a link to a list an
   * earlier update brought is laid.
   */
  document(id: string): Body | null | Promise<Body | null>;
  plan(doc: Body): Promise<Result<Diff>>;
  install(doc: Body, planHash: string): Promise<Result<unknown>>;
  /** Whether a question to update this pack is open already, so a record is asked once and not every night. */
  asking(id: string): boolean | Promise<boolean>;
  propose(q: QuietQuestion): Result<{ id: string }> | Promise<Result<{ id: string }>>;
  /** A declaration id (`page.quiet`) as the record names it ("Quiet people"), or nothing, and then its id in words. */
  nameOf?(id: string): string | null | undefined;
  /**
   * The declarations a person took off and the record does not hold now. An update that would lay one again asks
   * first. Absent, nothing is known to have been taken off, and only an upgrade can lay one again.
   */
  tookOff?(): readonly string[] | Promise<readonly string[]>;
  /**
   * Whether a no to this pack's question is kept for the version asked about, so the next night does not ask again.
   * Absent, it is kept for the five modules of `FIRST_PARTY` only, which is what a record kept before this loop took
   * the agents pack and the use cases. One of those that would lose something is then said and not asked, because a
   * question that comes back every night after a no is worse than an update that waits.
   */
  remembers?(id: string): boolean | Promise<boolean>;
};

/**
 * What happened to one module: `updated` went in, `asked` filed its question, `waiting` already has one open, and
 * `refused` could not be planned, installed or asked, with the record's sentence in `why`.
 */
export type QuietStep = { pack: string; from: string; to: string; did: 'updated' | 'asked' | 'waiting' | 'refused'; lose?: string[]; why?: string };

/** A declaration's id in words, when nothing names it: `page.money-book` is "Money book". */
const spelled = (id: string): string => {
  const bare = id.slice(id.indexOf('.') + 1).replaceAll(/[-_]/gu, ' ');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

/**
 * WHAT INSTALLING THIS PLAN WOULD LOSE OR CHANGE UNDER THE PERSON, one plain phrase each, or nothing when it can go in on
 * its own. Each phrase finishes "Updating it would …", so a question reads as one sentence.
 */
export function losses(diff: Diff, nameOf: (id: string) => string = spelled, tookOff: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  /* A PACK'S OWN FIGURE RETIRED IS NO LOSS by itself: a page the person changed that reads it is still asked about, as
     a conflict through `c.reads`, and one the pack draws goes with it (agents 1.9.0's working count, DIRECTION 42). */
  const gone = diff.retires.filter((r) => r.to === undefined && !r.id.startsWith('metric.'));
  if (gone.length > 0) out.push(`take away ${namesSaid(gone.map((r) => nameOf(r.id)))}`);
  const back = diff.adds.filter((a) => a.handed !== true && tookOff.has(a.id));
  if (back.length > 0) out.push(`bring back ${namesSaid(back.map((a) => nameOf(a.id)))}, which you took off`);
  for (const c of diff.conflicts) {
    if (c.reads !== undefined) out.push(`leave ${nameOf(c.id)}, which you changed, reading ${nameOf(c.reads)} after it is gone`);
    else if (c.changed === true) out.push(`change ${nameOf(c.id)}, which you changed too`);
    else if (c.pack === '(this record)') out.push(`take over ${nameOf(c.id)}, which you made yourself`);
    else out.push(`take ${nameOf(c.id)} from ${moduleName(c.pack)}`);
  }
  for (const r of diff.retypes) out.push(`change what ${r.field} on ${nameOf(r.id)} holds`);
  for (const r of diff.newly_required) out.push(`make ${r.field} on ${nameOf(r.id)} required`);
  for (const m of diff.misreads) out.push(`change what ${m.name} counts`);
  for (const r of diff.renames) out.push(`rename ${nameOf(r.from)}`);
  const broken = diff.dependents.filter((p) => p.was && !p.ok);
  if (broken.length > 0) out.push(`stop ${namesSaid(broken.map((p) => moduleName(p.id)))} working`);
  if (diff.approve.length > 0 || diff.calls_out.some((c) => c.change !== 'same')) out.push('reach a service outside BrainDog');
  return out;
}

/**
 * Why a plan cannot go in, whoever answers: a module it needs first, a list the record does not hold, or a loss
 * `install` refuses even after a yes (a list taken over, a rename, rows left under a list that goes, a field retyped or
 * newly required, a sentence read differently, a pack that would stop working).
 */
function unready(diff: Diff): string | null {
  const need = diff.requires.packs.find((p) => !p.ok);
  if (need) return `It needs ${moduleName(need.id)} ${need.range} first.`;
  const list = diff.unresolved[0];
  if (list) return `It reads ${spelled(`register.${list.register}`)}, which this record does not hold.`;
  if (!diff.requires.format.ok || !diff.requires.primitives.ok) return 'It needs a newer BrainDog.';
  const refused =
    diff.conflicts.length + diff.renames.length + diff.retypes.length + diff.newly_required.length + diff.misreads.length > 0 ||
    diff.orphans > 0 ||
    diff.dependents.some((p) => p.was && !p.ok);
  if (refused) return 'It cannot go in over what this record holds now.';
  return null;
}

/** What an update would lose, as the end of one sentence: "take away X, rename Y and reach a service outside BrainDog". */
const lostSaid = (lose: readonly string[]): string => (lose.length === 1 ? lose[0]! : `${lose.slice(0, -1).join(', ')} and ${lose.at(-1)!}`);

/** The sentence a refusal says, or that the record moved under the write for a conflict. */
const fixOf = (r: Result<unknown>): string => (r.ok ? '' : 'refusal' in r ? r.refusal.fix : 'The record changed while this was being written. It is tried again next time.');

const without = (doc: Body): Body => {
  const { seeds: _seeds, ...rest } = doc;
  return rest;
};

const USE_CASE_PACK = /^usecase-(.+)$/u;
const isFirstParty = (id: string): boolean => (FIRST_PARTY as readonly string[]).includes(id);

/** A day for a document's example rows to be counted from. They are taken off before it is planned, so any day does. */
const NO_DAY = '1970-01-01';

/**
 * THE VERSION THIS BUILD SHIPS OF ANYTHING THE LOOP KEEPS CURRENT, by pack id: one of the five modules, the agents pack,
 * or a use case's pack (`usecase-founder`). Nothing for any other id, an add-on's among them, which is not BrainDog's to
 * update unasked. A host that remembers which version a person said no to reads it here, so it remembers every one.
 */
export function shippedVersion(id: string): string | undefined {
  if (isFirstParty(id)) return FIRST_PARTY_VERSIONS[id as keyof typeof FIRST_PARTY_VERSIONS];
  if (id === AGENTS_PACK.manifest.id) return AGENTS_PACK.manifest.version;
  const usecase = USE_CASE_PACK.exec(id)?.[1];
  const version = usecase === undefined ? undefined : useCaseDocument(usecase, NO_DAY)?.version;
  return typeof version === 'string' ? version : undefined;
}

/** The use-case packs this build ships, in the order it lists them. One that carries no pack has none to update. */
const USE_CASE_PACKS: readonly string[] = USE_CASES.map((u) => `usecase-${u.usecase}`);

/**
 * Every first-party module the record holds, on, at an older version than this build ships, in install order: put in
 * when its plan loses nothing, otherwise asked about once. Then every one at the version this build ships, put in again
 * where its document now lays more on this record.
 *
 * IN INSTALL ORDER (`FIRST_PARTY`), and each document asked for after the one before went in, so People's organisations
 * are there by the time Money's plan is made.
 *
 * AND THE LINKS THAT CAME AFTER A MODULE, ONCE ALL ARE IN. A module's document leaves out a link to a list the record
 * does not hold and a block over one (`LINKS` and `placed` in `first-party.ts`), and People installs before Money, so a
 * record that gained organisations today holds a Money whose ledger names nobody, and a People whose page for an
 * organisation draws no money, both at the version this build ships. Planned again, each now adds what it left out;
 * put in only when that loses nothing, and never asked about, since nothing was offered that the person did not have.
 * THE FIVE ONLY: a link left out is theirs alone, and the agents pack and a use case are never put in again at the
 * version the record holds.
 *
 * THEN THE AGENTS PACK AND THE USE CASES THE RECORD HOLDS, in the first pass, after the five, each on the same terms.
 */
export async function updateFirstParty(port: QuietPort): Promise<QuietStep[]> {
  const out: QuietStep[] = [];
  /* A PAGE FOR ONE ROW IS TITLED BY THE ROW (`{{name}}`), which names nothing here, so it is said by its id in words. */
  const nameOf = (id: string): string => {
    const said = port.nameOf?.(id);
    return said && !said.includes('{{') ? said : spelled(id);
  };
  const tookOff = new Set((await port.tookOff?.()) ?? []);
  const heldOf = async (id: string) => (await port.held()).find((p) => p.id === id && p.on && p.version !== null);

  /**
   * A pack's document as it would go into this record now. One of the five is the port's, made for the lists the record
   * holds. The agents pack is one document on every record. A use case's keeps a list an older version of it declared
   * only where the record holds that list (`useCaseDocument`), and the port says nothing of lists, so it is planned
   * once with every such list and each one the plan would ADD is a list the record does not hold, and is left out.
   */
  const documentOf = async (id: string): Promise<Body | null> => {
    if (isFirstParty(id)) return port.document(id);
    if (id === AGENTS_PACK.manifest.id) return agentsPackDocument();
    const usecase = USE_CASE_PACK.exec(id)![1]!;
    const kept = keptLists(usecase);
    const whole = useCaseDocument(usecase, NO_DAY, kept);
    if (!whole || kept.length === 0) return whole;
    const probe = await port.plan(without(whole));
    if (!probe.ok) return whole;
    const lacks = new Set(probe.value.adds.map((a) => a.id));
    return useCaseDocument(usecase, NO_DAY, kept.filter((list) => !lacks.has(`register.${list}`)));
  };

  for (const id of [...FIRST_PARTY, AGENTS_PACK.manifest.id, ...USE_CASE_PACKS]) {
    const held = await heldOf(id);
    const to = shippedVersion(id);
    if (!held || to === undefined || compareVersions(held.version!, to) >= 0) continue;
    const step = { pack: id, from: held.version!, to };
    const given = await documentOf(id);
    if (!given) continue;
    const doc = without(given);
    const planned = await port.plan(doc);
    if (!planned.ok) {
      out.push({ ...step, did: 'refused', why: fixOf(planned) });
      continue;
    }
    const diff = planned.value;
    const lose = losses(diff, nameOf, tookOff);
    /* NOTHING TO DECIDE WHILE IT CANNOT GO IN AT ALL: a yes would be refused at the accept, and the record would not file
       the question. It is planned again next time, once what it needs is there or what was in the way is gone. */
    const blocked = unready(diff);
    if (blocked !== null) {
      out.push({ ...step, did: 'refused', ...(lose.length === 0 ? {} : { lose }), why: blocked });
      continue;
    }
    if (lose.length === 0) {
      const put = await port.install(doc, diff.planHash);
      out.push(put.ok ? { ...step, did: 'updated' } : { ...step, did: 'refused', why: fixOf(put) });
      continue;
    }
    if (await port.asking(id)) {
      out.push({ ...step, did: 'waiting', lose });
      continue;
    }
    if (!isFirstParty(id) && (await port.remembers?.(id)) !== true) {
      out.push({ ...step, did: 'refused', lose, why: `Updating it would ${lostSaid(lose)}, so it waits for you to update it yourself.` });
      continue;
    }
    const asked = await port.propose(questionFor(id, lose));
    out.push(asked.ok ? { ...step, did: 'asked', lose } : { ...step, did: 'refused', lose, why: fixOf(asked) });
  }

  for (const id of FIRST_PARTY) {
    const held = await heldOf(id);
    const to = FIRST_PARTY_VERSIONS[id];
    if (!held || compareVersions(held.version!, to) !== 0) continue;
    const given = await port.document(id);
    if (!given) continue;
    const doc = without(given);
    const planned = await port.plan(doc);
    if (!planned.ok) continue;
    const diff = planned.value;
    /* CHANGES ONLY. At the version the record holds, a declaration the plan would add is one the person took off, or
       one left out for a list the record lacked; the record cannot always tell which, so a relink never adds. Measured:
       with adds let through, a figure and a rule the person had taken off People came back the next night. */
    if (diff.changes.length === 0 || diff.adds.length > 0 || losses(diff, nameOf, tookOff).length > 0 || unready(diff) !== null) continue;
    const put = await port.install(doc, diff.planHash);
    out.push(put.ok ? { pack: id, from: to, to, did: 'updated' } : { pack: id, from: to, to, did: 'refused', why: fixOf(put) });
  }
  return out;
}

/**
 * The one question: what is newer, what updating would lose, and whether to go ahead.
 *
 * THE BODY NAMES THE PACK AND CARRIES NO DOCUMENT: the record installs a pack its catalogue offers from its own document
 * and refuses a question that sends one (`prepare` in `packages/record/src/arrange.ts`, "is on offer here").
 */
export function questionFor(id: string, lose: readonly string[]): QuietQuestion {
  const name = moduleName(id);
  return {
    question: `${name} has a newer version. Updating it would ${lostSaid(lose)}. Update ${name}?`,
    body_kind: 'pack',
    body: { install: id },
  };
}
