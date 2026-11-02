/**
 * BRAINDOG'S OWN UPDATES REACH A RECORD ON THEIR OWN WHEN NOTHING THE PERSON CHANGED WOULD BE LOST, and
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
 * AND THE AGENTS PACK AND THE USE CASES, AFTER THE FIVE (Medium 3). The loop walked
 * `FIRST_PARTY` alone, so Agents 1.8.0 and the founder's and the team's page updates reached no record that already
 * held them: their tests planned and installed by hand, and nothing ran at night. They are BrainDog's own as much as
 * Money is, so they take the same road: Agents once the five are in, since it reads Projects, then each use case the
 * record holds, since a use case's pages read the modules under it. Their documents are built here (`documentOf`),
 * because the port lends a document for the five only.
 *
 * AND BRAINDOG'S OWN ADD-ONS FROM THE CATALOGUE, LAST. An add-on BrainDog publishes and
 * lists (Profiles, Setup sync, Pad and the rest) is BrainDog's own as much as a module is, so a newer version reaches a
 * record that holds it on the same terms, with one more: it goes in only when it reaches nothing new as well as losing
 * nothing (`reachesNew`: no service, key or approval it did not have, no script it did not run). Otherwise it is asked
 * about once on Decide, as a module is, with the catalogue's document so a yes installs it; a no is kept for that
 * version. A community add-on is not lent at all, so Slash asks about it.
 */

import type { Diff } from '@braindog/declare';
import { compareVersions } from '@braindog/declare/catalogue';
import type { Result } from '@braindog/ports';

import { USE_CASES, keptLists, useCaseDocument } from '../usecases/index.ts';
import { fitted } from '../usecases/install.ts';
import { moduleName, namesSaid } from '../usecases/names.ts';
import { AGENTS_PACK, agentsPackDocument } from './agents.ts';
import { ADDON_LEG_LISTS } from '../modules/held-legs.ts';
import { CORE_CAME_FROM, FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, laidWithLink } from './first-party.ts';

type Body = Record<string, unknown>;

/**
 * The one question an update that would lose something files: install this pack, from the record's own document for a
 * module, or from the catalogue's (`doc`) for an add-on, with the version asked about (`version`) so a no is kept for it.
 */
export type QuietQuestion = { question: string; body_kind: 'pack'; body: { install: string; doc?: Body }; version?: string };

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
  /**
   * BrainDog's own add-ons from the catalogue with a newer version than the record holds, each verified and read, with
   * its document. Only first-party ones: a community or private add-on is never lent, so it always asks. Absent, none.
   */
  addons?(): readonly QuietAddon[] | Promise<readonly QuietAddon[]>;
  /**
   * The lists the record holds now, asked before each use case is planned. A use case's document is cut to them
   * (`fitted`), as the catalogue cuts it at the first install, so a part over a module the record does not hold goes in
   * without that list instead of refusing the whole update. Absent, the document is the whole one.
   */
  holds?(): readonly string[] | Promise<readonly string[]>;
};

/** One of BrainDog's own add-ons the catalogue holds newer: its pack id, its name, the versions, and its document. */
export type QuietAddon = { id: string; title: string; from: string; to: string; doc: Body };

/**
 * What happened to one module: `updated` went in, `asked` filed its question, `waiting` already has one open, and
 * `refused` could not be planned, installed or asked, with the record's sentence in `why`.
 */
export type QuietStep = { pack: string; from: string; to: string; did: 'updated' | 'asked' | 'waiting' | 'refused'; lose?: string[]; why?: string; title?: string };

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
     a conflict through `c.reads`, and one the pack draws goes with it (agents 1.9.0's working count). */
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
 * WHAT AN ADD-ON'S UPDATE WOULD NEWLY REACH, one phrase each like `losses`, or nothing. A service outside, a key or an
 * approval is already a loss (`losses`); a script the record does not run yet is new code running unasked, so an add-on's
 * update that brings one waits for the person too.
 */
export function reachesNew(diff: Diff): string[] {
  const fresh = diff.scripts.filter((s) => s.changed === null);
  return fresh.length > 0 ? [`run ${namesSaid(fresh.map((s) => s.title))}, which it did not run before`] : [];
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
  if (list) return `It reads ${spelled(`register.${list.register}`)}, which you do not have.`;
  if (!diff.requires.format.ok || !diff.requires.primitives.ok) return 'It needs a newer BrainDog.';
  const refused =
    diff.conflicts.length + diff.renames.length + diff.retypes.length + diff.newly_required.length + diff.misreads.length > 0 ||
    diff.orphans > 0 ||
    diff.dependents.some((p) => p.was && !p.ok);
  if (refused) return 'It cannot go in over what is here now.';
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
/** The first-party document every record holds: the pages that are not any add-on's. */
const CORE = 'core';
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
 *
 * AND A MODULE ANOTHER PACK WAS IN THE WAY OF, AGAIN THE SAME NIGHT, ONCE THAT PACK HAS GONE IN. The five are planned
 * before the use cases, so a module that takes over something a use case holds is refused, and the use case, planned
 * after it, then hands the thing on. Measured on what brain.dog served: money-core 3.17.0 waited a whole night for
 * Personal 2.4.0 to let go of one count. Planned again once its holder is in, on the same terms as the first time, and
 * its one step says what the later plan met. A module refused for any other reason, or whose holder did not go in, is
 * planned once and waits for the next night.
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
    /* AGENTS FOR THE LISTS THE RECORD HOLDS TOO, SINCE 1.32.0: a record made without Projects holds its lists with no
       Where it applies, and the whole document would be refused every night for a link to a list it does not hold. */
    if (id === AGENTS_PACK.manifest.id) return port.holds ? agentsPackDocument({ holds: await port.holds() }) : agentsPackDocument();
    const usecase = USE_CASE_PACK.exec(id)![1]!;
    /* CUT TO THE LISTS THE RECORD HOLDS, AS THE FIRST INSTALL WAS (UP1, 31 Oct). Uncut, a Personal record made without
       People met Personal 2.9.1's Project partner over People's list and was refused every night, and a founder's made
       without People, Estate or Work met 3.9.0's figures over them: neither record ever took a word changed after it
       was made. */
    const lists = port.holds ? new Set(await port.holds()) : null;
    const cut = (doc: Body | null): Body | null => (doc === null || lists === null ? doc : fitted(doc, lists));
    const kept = keptLists(usecase);
    const whole = cut(useCaseDocument(usecase, NO_DAY, kept));
    if (!whole || kept.length === 0) return whole;
    const probe = await port.plan(without(whole));
    if (!probe.ok) return whole;
    const lacks = new Set(probe.value.adds.map((a) => a.id));
    return cut(useCaseDocument(usecase, NO_DAY, kept.filter((list) => !lacks.has(`register.${list}`))));
  };

  /**
   * THE MODULES SOMETHING ANOTHER PACK HOLDS IS IN THE WAY OF, each with the packs that hold it (`conflicts[].pack` of
   * its plan), and of those the ones a holder has gone in since (`freed`).
   */
  const waits = new Map<string, ReadonlySet<string>>();
  const freed = new Set<string>();

  /** One pack, planned against the record as it is now: what happened to it, or nothing when there is nothing newer. */
  const attempt = async (id: string): Promise<QuietStep | null> => {
    waits.delete(id);
    /* CORE GOES TO EVERY RECORD THAT HOLDS PEOPLE, which is where its four pages lived until People 4.0.0, so a record
       that does not hold it yet is planned for it at no version. It goes in once the pages are not People's to give (People
       hands them in the plan that updates People), and until then it says nothing: People's own step is what a person
       reads, and core waits for it (`waits`, below). */
    const unheld = id === CORE && (await heldOf(id)) === undefined && (await heldOf(CORE_CAME_FROM)) !== undefined;
    const held = unheld ? { id, version: '0.0.0', on: true } : await heldOf(id);
    const to = shippedVersion(id);
    if (!held || to === undefined || compareVersions(held.version!, to) >= 0) return null;
    const step = { pack: id, from: held.version!, to };
    const given = await documentOf(id);
    if (!given) return null;
    const doc = without(given);
    const planned = await port.plan(doc);
    if (!planned.ok) return { ...step, did: 'refused', why: fixOf(planned) };
    const diff = planned.value;
    const lose = losses(diff, nameOf, tookOff);
    /* NOTHING TO DECIDE WHILE IT CANNOT GO IN AT ALL: a yes would be refused at the accept, and the record would not file
       the question. It is planned again once what was in the way is gone: later this night when another pack held it
       and that pack goes in, and otherwise next time. */
    const blocked = unready(diff);
    if (blocked !== null) {
      if (diff.conflicts.length > 0) waits.set(id, new Set(diff.conflicts.map((c) => c.pack)));
      if (unheld) return null;
      return { ...step, did: 'refused', ...(lose.length === 0 ? {} : { lose }), why: blocked };
    }
    if (lose.length === 0) {
      const put = await port.install(doc, diff.planHash);
      if (!put.ok) return { ...step, did: 'refused', why: fixOf(put) };
      for (const [waiting, holders] of waits) if (holders.has(id)) freed.add(waiting);
      return { ...step, did: 'updated' };
    }
    if (await port.asking(id)) return { ...step, did: 'waiting', lose };
    if (!isFirstParty(id) && (await port.remembers?.(id)) !== true) {
      return { ...step, did: 'refused', lose, why: `Updating it would ${lostSaid(lose)}, so it waits for you to update it yourself.` };
    }
    const asked = await port.propose(questionFor(id, lose));
    return asked.ok ? { ...step, did: 'asked', lose } : { ...step, did: 'refused', lose, why: fixOf(asked) };
  };

  /* CORE AFTER THE MODULES THAT MAY STILL HOLD ITS PAGES: People hands them to it in the plan that updates People. */
  const order = [...FIRST_PARTY.filter((id) => id !== CORE), CORE, AGENTS_PACK.manifest.id, ...USE_CASE_PACKS];
  for (const id of order) {
    const step = await attempt(id);
    if (step) out.push(step);
  }

  /* AGAIN, IN THE SAME ORDER, UNTIL NONE IS FREED. It ends: a module is planned again only after a pack went in, and
     each pack goes in once. What the later plan met takes the place of the refusal, so the night says one thing. */
  const again = async (): Promise<void> => {
    for (let id = order.find((p) => freed.has(p)); id !== undefined; id = order.find((p) => freed.has(p))) {
      freed.delete(id);
      const step = await attempt(id);
      const at = out.findIndex((s) => s.pack === id);
      if (step && at >= 0) out[at] = step;
    }
  };
  await again();

  /* BRAINDOG'S OWN ADD-ONS, after the modules and use cases they stand on: in when the plan loses nothing and reaches
     nothing new, else asked once on Decide. Never a community one. A private one of BrainDog's, for one bank, is
     BrainDog's own all the same (`catalogue-offers.ts`). */
  const addons = (await port.addons?.()) ?? [];
  /** The add-ons a conflict held back, with the packs that held them: planned again once one of those has gone in. */
  const heldBack = new Map<string, ReadonlySet<string>>();
  const gone = new Set<string>();
  const addon = async (a: QuietAddon): Promise<QuietStep | null> => {
    heldBack.delete(a.id);
    const there = await heldOf(a.id);
    if (!there || there.version !== a.from || compareVersions(a.from, a.to) >= 0) return null;
    const step = { pack: a.id, title: a.title, from: a.from, to: a.to };
    const doc = without(a.doc);
    const planned = await port.plan(doc);
    if (!planned.ok) return { ...step, did: 'refused', why: fixOf(planned) };
    const diff = planned.value;
    const lose = [...losses(diff, nameOf, tookOff), ...reachesNew(diff)];
    const blocked = unready(diff);
    if (blocked !== null) {
      if (diff.conflicts.length > 0) heldBack.set(a.id, new Set(diff.conflicts.map((c) => c.pack)));
      return { ...step, did: 'refused', ...(lose.length === 0 ? {} : { lose }), why: blocked };
    }
    /* ONE THAT WOULD LOSE OR NEWLY REACH SOMETHING IS ASKED ONCE ON DECIDE, as a module is, where a yes installs it. Said
       only in a pref and on the Updates card, it was asked nowhere, and Slash's question for it waited behind its cap. */
    if (lose.length > 0) {
      if (await port.asking(a.id)) return { ...step, did: 'waiting', lose };
      if ((await port.remembers?.(a.id)) !== true) return { ...step, did: 'refused', lose, why: `Updating it would ${lostSaid(lose)}, so it waits for you in Add-ons.` };
      const asked = await port.propose(addonQuestion(a, lose));
      return asked.ok ? { ...step, did: 'asked', lose } : { ...step, did: 'refused', lose, why: fixOf(asked) };
    }
    const put = await port.install(doc, diff.planHash);
    if (!put.ok) return { ...step, did: 'refused', why: fixOf(put) };
    gone.add(a.id);
    /* AND A MODULE OR ADD-ON THIS ONE WAS IN THE WAY OF, AGAIN: Roadmap hands its page to Work, and Work, planned before it,
       was refused for taking a page Roadmap held. Planned once more now Roadmap has handed it over. */
    for (const [waiting, holders] of waits) if (holders.has(a.id)) freed.add(waiting);
    return { ...step, did: 'updated' };
  };
  for (const a of addons) {
    const step = await addon(a);
    if (step) out.push(step);
  }
  for (const a of addons) {
    if (!heldBack.has(a.id) || ![...heldBack.get(a.id)!].some((holder) => gone.has(holder))) continue;
    const step = await addon(a);
    const at = out.findIndex((s) => s.pack === a.id);
    if (step && at >= 0) out[at] = step;
  }
  await again();

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
       with adds let through, a figure and a rule the person had taken off People came back the next night. BUT ONE
       THAT READS A LINK THIS SAME PLAN LAYS BACK (`laidWithLink`) was left out for the link alone, and goes in with it. */
    const changed = diff.changes.map((c) => c.id);
    const adds = diff.adds.filter((a) => !laidWithLink(id, doc, a.id, changed));
    if (diff.changes.length === 0 || adds.length > 0 || losses(diff, nameOf, tookOff).length > 0 || unready(diff) !== null) continue;
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

/**
 * The one question for an add-on: named by its title, and carrying the catalogue's document as the catalogue offered it,
 * so a yes installs that version and Slash, reading the same offer, finds it asked already.
 */
export function addonQuestion(a: QuietAddon, lose: readonly string[]): QuietQuestion {
  return {
    question: `${a.title} has a newer version. Updating it would ${lostSaid(lose)}. Update ${a.title}?`,
    body_kind: 'pack',
    body: { install: a.id, doc: a.doc },
    version: a.to,
  };
}

/**
 * WHETHER A FIRST-PARTY PACK'S DOCUMENT CHANGES WITH THE ADD-ON LISTS A RECORD HOLDS: some figure or block carries a leg
 * over a list only an add-on holds (`ADDON_LEG_LISTS`), so the document with those lists held is not the document
 * without them. Read off the documents, naming no pack and no list.
 */
export function leggedByAddons(id: string): boolean {
  if (!isFirstParty(id) || ADDON_LEG_LISTS.size === 0) return false;
  const bare = firstPartyDocument(id, { holds: [], seeds: [] });
  const full = firstPartyDocument(id, { holds: [...ADDON_LEG_LISTS], seeds: [] });
  return JSON.stringify(bare) !== JSON.stringify(full);
}

/**
 * AFTER AN ADD-ON IS INSTALLED, SWITCHED ON, OFF OR REMOVED, every first-party pack the record holds whose legs name an
 * add-on list is put in again with the lists the record holds now (`port.document`), so Cash ahead counts a certificate's
 * payout the moment Certificates is in and stops naming the list the moment it is gone. QUIETLY: nothing is asked, and
 * a plan that would lose anything, add a declaration, or reach outside the record is left alone. A pack whose plan
 * changes nothing is not installed, so no version moves; the pack stays at the version it holds.
 * Answers the packs put in.
 *
 * WITH `links` (leftovers 4, 2 Nov), EVERY ONE OF THE FIVE, AND THE LINKS THAT CAME AFTER IT: the night's relink
 * (`updateFirstParty`'s last loop), run the moment a module or a starter goes in instead of on the next pass. A founder
 * starts on Projects and Money and gains People after, so until that pass Money's lists had no Who (`party`): the
 * founder's Late and Due this week and every organisation page's Money were refused for a field the list did not have,
 * and a row written in between lost who it was with.
 */
export async function relegFirstParty(port: Pick<QuietPort, 'held' | 'document' | 'plan' | 'install' | 'nameOf' | 'tookOff'>, o: { links?: boolean } = {}): Promise<string[]> {
  const went: string[] = [];
  const nameOf = (id: string): string => {
    const said = port.nameOf?.(id);
    return said && !said.includes('{{') ? said : spelled(id);
  };
  const tookOff = new Set((await port.tookOff?.()) ?? []);
  for (const id of FIRST_PARTY) {
    if (!o.links && !leggedByAddons(id)) continue;
    const held = (await port.held()).find((p) => p.id === id && p.on && p.version !== null);
    if (!held) continue;
    const given = await port.document(id);
    if (!given) continue;
    /* AT THE VERSION IT HOLDS AND NO OTHER: a newer document is the night's update to ask about (`updateFirstParty`), so a
       record holding money-core 2.0.0 was put on 3.29.0 here, unasked, by an add-on coming in. */
    if (given.version !== held.version) continue;
    const doc = without(given);
    const planned = await port.plan(doc);
    if (!planned.ok) continue;
    const diff = planned.value;
    /* WITH `links`, AN ADD THAT READS A LINK THIS SAME PLAN LAYS BACK goes in with it, as the night's relink lets it
       (`laidWithLink`); any other add still keeps the pack as it is. */
    const changed = diff.changes.map((c) => c.id);
    const adds = o.links ? diff.adds.filter((a) => !laidWithLink(id, doc, a.id, changed)) : diff.adds;
    if (diff.changes.length === 0 || adds.length > 0 || losses(diff, nameOf, tookOff).length > 0 || unready(diff) !== null) continue;
    if ((await port.install(doc, diff.planHash)).ok) went.push(id);
  }
  return went;
}
