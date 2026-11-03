/**
 * Sharing a BrainDog's arrangement as a use case, and installing one somebody shared.
 *
 * THREE WAYS IN, ONE PLAN. A file picked from the computer, an https address, and a built-in use case from the browse
 * screen all become the same text, which the record's `planUseCase` reads through `readShared` and plans pack by pack.
 * The screen draws that plan and nothing of its own.
 *
 * INSTALLING IS THE EXISTING PATH, NEVER AROUND IT. Each pack in the plan is planned again with `planPack` and installed
 * with `installPack`, its hash and the calls-out lines the owner read. A pack that now calls out a line the plan did not
 * show stops the install there, and the plan is read again for the owner to look at before pressing a second time.
 *
 * PURE, AND THEREFORE TESTABLE, for the reason `packs.ts` gives: the screen only assigns.
 */

import { linkExamples, type ExampleLink } from '@braindog/seed/usecases/links';
import { moduleName, ruleName } from '@braindog/seed/usecases/names';
import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';

import { copy } from '../../lib/copy.ts';
import { partName } from '../../lib/start/propose.ts';
import { words } from './words.ts';
import { withOrder } from '../../lib/nav.ts';
import { SPEAKS, speaking, voiceBatch, voiceWrites, withSpeaks, type SpeakingState } from '../../lib/voice.ts';
import { callsOutOf, type CallOut } from '../../lib/record/actions.ts';
import type { PackState, Refusal } from '../../lib/record/packs.ts';
import { REGISTERS } from '../../lib/record/held.ts';

type Body = Record<string, unknown>;
type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** The client methods sharing calls, so a test can hand in an object literal. */
export type SharingClient = {
  planUseCase(args: { doc?: unknown; text?: string; source?: { kind: string; ref?: string }; modules?: Record<string, unknown> }): Promise<Wire<unknown>>;
  exportUseCase(args: {
    usecase?: string;
    title?: string;
    summary?: string;
    version?: string;
    audience?: string;
    examples?: Record<string, number[]>;
    step?: 'patch' | 'minor';
    nav?: string[];
    signals?: string[];
    skills?: number[];
  }): Promise<Wire<unknown>>;
  fetchShared(args: { url: string }): Promise<Wire<unknown>>;
  planPack(args: { doc: unknown; source?: { kind: string } }): Promise<Wire<unknown>>;
  installPack(args: { doc: unknown; source?: { kind: string }; planHash: string; approve?: string[] }): Promise<Wire<unknown>>;
  enablePack(args: { id: string }): Promise<Wire<unknown>>;
  disablePack(args: { id: string; alsoDisable?: string[] }): Promise<Wire<unknown>>;
  packConfig(args: { id: string }): Promise<Wire<unknown>>;
  setPackConfig(args: { id: string; values: Record<string, unknown>; batch?: string }): Promise<Wire<unknown>>;
};

const refusalOf = (r: Wire<unknown>): Refusal =>
  r.ok ? { code: 'VALUE_MALFORMED', fix: copy.writeRaced } : 'refusal' in r ? r.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* ── reading a file in ─────────────────────────────────────────────────── */

/**
 * The text at an https address or `git:owner/repo@ref:path`, read by the record's host (`fetchShared`), or the sentence
 * to say instead.
 *
 * THE HOST READS IT, because most sites send no CORS header and a tab may not read them. The host sends nothing of the
 * record's and refuses a private or local address, so what an owner pastes cannot point this server at its own network.
 * A `git:` address is turned into the raw file on GitHub by the host, so it is checked there as an https one is; here
 * it is only held to its shape, so a typing slip is said before anything is asked.
 */
export async function readOnHost(
  client: Pick<SharingClient, 'fetchShared'>,
  address: string,
): Promise<{ ok: true; text: string; pinned?: string } | { ok: false; fix: string; code: string | null }> {
  const asked = address.trim();
  let url: string;
  if (asked.startsWith('git:')) {
    if (!GIT.test(asked)) return { ok: false, fix: words.gitNotOne, code: null };
    url = asked;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(asked);
    } catch {
      return { ok: false, fix: copy.shareAddressNotOne, code: null };
    }
    if (parsed.protocol !== 'https:') return { ok: false, fix: copy.shareAddressHttps, code: null };
    url = parsed.href;
  }
  const out = await client.fetchShared({ url });
  if (!out.ok) {
    const refusal = refusalOf(out);
    return { ok: false, fix: refusal.fix, code: refusal.code };
  }
  const v = out.value;
  /* A GIT ADDRESS COMES BACK PINNED to the commit its ref pointed at (`git-channel.ts`), which the install keeps. */
  if (isMap(v) && typeof v.text === 'string') return { ok: true, text: v.text, ...(typeof v.pinned === 'string' ? { pinned: v.pinned } : {}) };
  return { ok: false, fix: copy.writeRaced, code: null };
}

/** `git:owner/repo@ref:path`, as the host reads it (`fetchShared` in `@braindog/record`). */
export const GIT = /^git:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[A-Za-z0-9_./-]+:[^\s?#]+$/u;

/* ── the plan ──────────────────────────────────────────────────────────── */

export type SharedPack = {
  id: string;
  /** The name a person knows the pack by: Money for `money-core`, the use case's title for its own pack. */
  title: string;
  role: 'module' | 'usecase';
  version: string;
  installedVersion: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  /** `figure` for a number it tracks, so the plan sheet folds them into one row; `other` for a rule. */
  adds: { kind: 'list' | 'page' | 'figure' | 'other'; name: string }[];
  changes: string[];
  retires: string[];
  /**
   * What the update hands to another pack instead of taking away: still live, now under `to`'s name. The record files it
   * apart from `retires` (`PlannedPack.hands`), and a screen that read only `retires` said nothing about it at all.
   */
  hands: { name: string; to: string }[];
  conflicts: string[];
  examples: number;
  calls: CallOut[];
  approve: string[];
  doc: Body;
};

export type SharedPlan = {
  usecase: { id: string; title: string; version: string; summary: string; author: string };
  /** The rail order the file carries, as addresses, applied as the reader's own once it is installed. */
  nav: string[];
  /** How the file's example rows point at each other, by title, made once they are in (`UseCase.links`). */
  links: ExampleLink[];
  enable: string[];
  packs: SharedPack[];
  approve: string[];
};

/** Plurals English makes without an s, each to its one. */
const IRREGULAR: Readonly<Record<string, string>> = { people: 'person', children: 'child', men: 'man', women: 'woman', staff: 'staff' };

/** One row of a list, as a page for each is said: Organisations reads organisation, Studies reads study. */
export const oneOf = (list: string): string => {
  const lower = list.trim().toLowerCase().replace(/_/gu, ' ');
  /* A PLURAL WITH NO s TO CUT: "A page for each people" read as a mistake on the People add-on. */
  const odd = IRREGULAR[lower.split(' ').at(-1) ?? ''];
  if (odd !== undefined) return lower.replace(/\S+$/u, odd);
  if (/ies$/u.test(lower)) return `${lower.slice(0, -3)}y`;
  if (/(ss|us)$/u.test(lower)) return lower;
  if (/(ss|x|ch|sh)es$/u.test(lower)) return lower.slice(0, -2);
  return lower.replace(/s$/u, '');
};

/** A pack by the name a person knows it by: this build's name for a module, else its id in words. */
/** The rail's word for a module (`partName`): Projects for the module named Portfolio, because its one list says so. */
export const moduleTitle = (id: string): string => (moduleOf(id) ? partName(id) : moduleName(id));

/** A declaration id as a person reads it, from the document that declares it: a list's name, a page's title. */
function namesIn(doc: Body, others: readonly Body[] = []): (id: string) => { kind: 'list' | 'page' | 'figure' | 'other'; name: string } {
  const declsOf = (d: Body): Body[] => (Array.isArray(d.declarations) ? (d.declarations as Body[]) : []);
  const decls = declsOf(doc);
  /* A LIST ANOTHER PACK IN THE SAME PLAN DECLARES, such as Projects for a page on each of Portfolio's rows. */
  const lists = [...decls, ...others.flatMap(declsOf)];
  /* A TITLE MAY READ A SETTING, `{{config:voice_home}}`, and is said as the value this file installs it with. */
  const config = isMap(doc.config) ? doc.config : {};
  const filled = (text: string): string =>
    text.replace(/\{\{config:([a-z0-9_]+)\}\}/gu, (all, key: string) => {
      const d = config[key];
      return isMap(d) && typeof d.default === 'string' ? d.default : all;
    });
  return (id) => {
    const [kind, ...rest] = id.split('.');
    const bare = rest.join('.');
    if (kind === 'register') {
      const d = decls.find((x) => x.register === bare);
      /* A LIST THIS VERSION NO LONGER DECLARES, one it takes away or hands on, is not in the file to be named from, and
         `reading` opened the sentence that says where it goes. This build's name for it, else its id in words. */
      return { kind: 'list', name: typeof d?.name === 'string' ? filled(d.name) : (REGISTERS[bare]?.name ?? listWords(bare)) };
    }
    if (kind === 'page') {
      const d = decls.find((x) => x.page === bare);
      /* A PAGE FOR EACH ROW is titled by the row, `{{name}}`, which names nothing until a row is chosen: said by its list. */
      if (typeof d?.title === 'string' && /\{\{(?!config:)/u.test(d.title) && isMap(d.for) && typeof d.for.register === 'string') {
        const list = lists.find((x) => x.register === (d.for as Body).register && x.page === undefined);
        const register = String((d.for as Body).register);
        return { kind: 'page', name: copy.sharePageEach(oneOf(typeof list?.name === 'string' ? filled(list.name) : (REGISTERS[register]?.name ?? register))) };
      }
      return { kind: 'page', name: typeof d?.title === 'string' ? filled(d.title) : bare };
    }
    /* A FIGURE OR A RULE IS SAID BY ITS OWN NAME, "Going out, 30 days", not `out-30d`. A rule declares none, so a
       first-party one is said by the name this build gives it: "Chase late payments", not `invoice-late`. */
    const d = decls.find((x) => x[kind ?? ''] === bare);
    const own = typeof d?.name === 'string' ? filled(d.name) : kind === 'rule' ? ruleName(bare) : null;
    return { kind: kind === 'metric' ? 'figure' : 'other', name: own ?? (bare || id) };
  };
}

/** The record's plan, in the screen's words. `null` for an answer this build does not recognise. */
export function sharedPlanOf(value: unknown, nav: readonly string[] = [], links: readonly ExampleLink[] = []): SharedPlan | null {
  if (!isMap(value) || !isMap(value.usecase) || !Array.isArray(value.packs)) return null;
  const u = value.usecase;
  const packs: SharedPack[] = [];
  for (const raw of value.packs) {
    if (!isMap(raw) || typeof raw.id !== 'string' || !isMap(raw.doc)) return null;
    const name = namesIn(raw.doc, value.packs.flatMap((other) => (isMap(other) && isMap(other.doc) && other !== raw ? [other.doc] : [])));
    const role = raw.role === 'module' ? 'module' : 'usecase';
    packs.push({
      id: raw.id,
      title: role === 'usecase' ? String(u.title ?? raw.id) : moduleTitle(raw.id),
      role,
      version: String(raw.version ?? ''),
      installedVersion: typeof raw.installed_version === 'string' ? raw.installed_version : null,
      direction: (['install', 'upgrade', 'downgrade', 'reinstall'] as const).find((d) => d === raw.direction) ?? 'install',
      adds: strings(raw.adds).map(name),
      changes: strings(raw.changes).map((id) => name(id).name),
      retires: strings(raw.retires).map((id) => name(id).name),
      hands: (Array.isArray(raw.hands) ? raw.hands : []).flatMap((h) =>
        isMap(h) && typeof h.id === 'string' && typeof h.to === 'string' ? [{ name: name(h.id).name, to: moduleTitle(h.to) }] : [],
      ),
      conflicts: (Array.isArray(raw.conflicts) ? raw.conflicts : []).flatMap((c) =>
        isMap(c) && typeof c.id === 'string' ? [copy.shareConflict(name(c.id).name, moduleTitle(String(c.pack ?? '')))] : [],
      ),
      examples: typeof raw.examples === 'number' ? raw.examples : 0,
      calls: callsOutOf(raw.calls_out),
      approve: strings(raw.approve),
      doc: raw.doc,
    });
  }
  return {
    usecase: { id: String(u.usecase ?? ''), title: String(u.title ?? ''), version: String(u.version ?? ''), summary: String(u.summary ?? ''), author: String(u.author ?? '') },
    nav: [...nav],
    links: links.map((l) => ({ ...l })),
    enable: strings(value.enable),
    packs,
    approve: strings(value.approve),
  };
}

/**
 * Ask the record to plan a shared use case. The modules it needs that this record does not hold are sent as the app
 * builds them for this record (`packDocument`), because a host with no catalogue cannot offer them by name.
 *
 * EVERY MODULE THIS BATCH BRINGS IN COUNTS AS HELD WHILE THE OTHERS ARE BUILT, or a link field pointing at a sibling's
 * list is stripped for good. `packDocument` reads `holds` off `installed`, and every module's document here is built
 * off the SAME `installed` snapshot, before any of them has actually gone in: with People built beside Portfolio, both
 * new, `installed` said neither's lists existed yet, so People's "Met in" (`to: things`) and Work's "Project" and
 * "Owner" were left out of what was proposed and never came back — reinstalling Portfolio later does not reach back
 * into a document already filed. `firstPartyModule` says each module's own lists without installing anything, so a
 * sibling in this same batch is held for that alone.
 *
 * BUT ONLY THE SIBLINGS INSTALLED BEFORE IT (uc6-walk-46): each module's document is cut to the lists held before it in
 * install order, or a page of People that reads Money's Ledger is planned before the Ledger exists and the whole build
 * is refused (`page.relation.requires`). accept's `refreshModule` gives People its Money page once Money is in.
 */
export async function planShared(
  client: SharingClient,
  file: { text: string; source: 'paste' | 'url' | 'local'; ref?: string },
  installed: readonly PackState[],
  moduleDoc: (id: string, installed: readonly PackState[], usecase: string) => Promise<Body | null>,
  /** A module already here, in the words and targets of the use case being added, or `null` when it gives it none. */
  relabelDoc: (id: string, installed: readonly PackState[], usecase: string) => Promise<Body | null> = async () => null,
): Promise<{ ok: true; plan: SharedPlan } | { ok: false; fix: string; code: string | null }> {
  /* THE SUBPATH AND NOT THE PACKAGE: a dynamic import of the package is its whole namespace, which kept every export of
     `@braindog/declare` alive beside the few a page reads statically, and put them all in front of Today. */
  const { readShared } = await import('@braindog/declare/shared');
  const read = await readShared(file.text, { kind: file.source });
  if (!read.ok) return { ok: false, fix: 'refusal' in read ? read.refusal.fix : copy.writeRaced, code: 'refusal' in read ? read.refusal.code : null };
  const withBatch: readonly PackState[] = [
    ...installed,
    ...read.value.usecase.modules
      .filter((m) => !installed.some((p) => p.id === m))
      .map((m) => ({ id: m, version: null, disabled_at: null, registers: [...(moduleOf(m)?.registers ?? [])] })),
  ];
  const modules: Record<string, unknown> = {};
  for (const m of read.value.usecase.modules) {
    const held = installed.find((p) => p.id === m);
    const doc = held ? (held.disabled_at === null ? await relabelDoc(m, installed, read.value.usecase.usecase) : null) : await moduleDoc(m, withBatch.filter((p) => installed.some((i) => i.id === p.id) || read.value.usecase.modules.indexOf(p.id) <= read.value.usecase.modules.indexOf(m)), read.value.usecase.usecase);
    if (doc) modules[m] = doc;
  }
  const out = await client.planUseCase({
    text: file.text,
    source: { kind: file.source, ...(file.ref === undefined ? {} : { ref: file.ref }) },
    ...(Object.keys(modules).length === 0 ? {} : { modules }),
  });
  if (!out.ok) {
    const refusal = refusalOf(out);
    return { ok: false, fix: refusal.fix, code: refusal.code };
  }
  const plan = sharedPlanOf(out.value, read.value.usecase.nav, read.value.usecase.links);
  return plan ? { ok: true, plan } : { ok: false, fix: copy.writeRaced, code: null };
}

/** The modules already here that the plan offers in the use case's words and targets, which the person may leave as they are. */
export const relabelled = (plan: SharedPlan): SharedPack[] => plan.packs.filter((p) => p.role === 'module' && p.installedVersion !== null);

/** Whether a plan can be installed as it stands: nothing in it takes over another pack's list or page. */
export const installable = (plan: SharedPlan): boolean => plan.packs.every((p) => p.conflicts.length === 0);

/**
 * An update that brings nothing but its version: no list or page added, changed or taken away, no module and nothing turned
 * on, and nothing new called out. The plan says so, rather than drawing "Updates from" over nothing.
 */
export const nothingElse = (plan: SharedPlan): boolean =>
  plan.enable.length === 0 &&
  plan.packs.every(
    (p) =>
      p.role === 'usecase' &&
      p.installedVersion !== null &&
      p.direction !== 'reinstall' &&
      p.adds.length === 0 &&
      p.changes.length === 0 &&
      p.retires.length === 0 &&
      p.hands.length === 0 &&
      p.calls.length === 0,
  ) &&
  plan.packs.length > 0;

/**
 * What the plan hands from one pack to another, one sentence each, in Decide's words (`arranged.ts`), for every pack in
 * it: money-core's update is the one that hands a bank's door on, and it is a module, not the use case's own pack.
 */
export const movesOf = (plan: SharedPlan): string[] => plan.packs.flatMap((p) => p.hands.map((h) => copy.arrangeMovesTo(h.name, h.to)));

/**
 * Install the plan that was read, a pack at a time through `planPack` and `installPack`. The modules that are off are
 * turned on first. Answers the packs that went in, and the sentence that stopped it, if one did.
 */
/**
 * What an install's answer says it carried into a page or list he changed (`said`, RJ6): the update's new words, in the
 * record's own sentences, for the screen to say beside "Installed". Empty for anything else.
 */
export const saidOf = (value: unknown): string[] => (isMap(value) ? strings(value.said) : []);

export async function installShared(client: SharingClient, plan: SharedPlan, relabel = true): Promise<{ ok: boolean; done: string[]; fix: string | null; stale: boolean; said?: string[] }> {
  const done: string[] = [];
  const said: string[] = [];
  for (const id of plan.enable) {
    const on = await client.enablePack({ id });
    if (!on.ok) return { ok: false, done, fix: refusalOf(on).fix, stale: false };
    done.push(id);
  }
  for (const pack of plan.packs) {
    /* A MODULE ALREADY HERE IS UPDATED ONLY WHEN THE PERSON SAID YES under "Update for". */
    if (!relabel && relabelled(plan).includes(pack)) continue;
    const planned = await client.planPack({ doc: pack.doc, source: { kind: 'local' } });
    if (!planned.ok) return { ok: false, done, fix: refusalOf(planned).fix, stale: false };
    const diff = isMap(planned.value) && isMap(planned.value.diff) ? planned.value.diff : null;
    const planHash = typeof diff?.planHash === 'string' ? diff.planHash : '';
    const approve = strings(diff?.approve);
    const unshown = approve.filter((line) => !plan.approve.includes(line));
    if (planHash === '' || unshown.length > 0) return { ok: false, done, fix: copy.shareStale, stale: true };
    const put = await client.installPack({ doc: pack.doc, source: { kind: 'local' }, planHash, ...(approve.length === 0 ? {} : { approve }) });
    if (!put.ok) {
      const refusal = refusalOf(put);
      return { ok: false, done, fix: refusal.fix, stale: refusal.code === 'PLAN_STALE' };
    }
    done.push(pack.id);
    said.push(...saidOf(put.value));
  }
  return { ok: true, done, fix: null, stale: false, ...(said.length > 0 ? { said } : {}) };
}

/**
 * What a plan does once its packs are in, the two steps onboarding takes after an install: the examples pointed at each
 * other (`links.ts`, a seed carries no link), and the rail order the file carries laid over the reader's own. Answers the
 * arrangement to keep, for the screen to write where the rail reads it; a link that is refused is skipped.
 */
export async function afterInstall(
  client: {
    list(args: { register: string; limit?: number }): Promise<Wire<unknown>>;
    update(args: { register: string; seq: number; patch: Record<string, unknown> }): Promise<Wire<unknown>>;
  },
  plan: SharedPlan,
  arrangement: readonly string[],
): Promise<{ links: number; nav: string[] | null }> {
  const io = {
    rows: async (register: string) => {
      const read = await client.list({ register, limit: 200 });
      return read.ok && isMap(read.value) && Array.isArray(read.value.rows) ? (read.value.rows as { seq: number | null; fields: Record<string, unknown> }[]) : null;
    },
    link: async (register: string, seq: number, field: string, spoken: string | readonly string[]) => (await client.update({ register, seq, patch: { [field]: spoken } })).ok,
  };
  /* WHAT AN OLDER VERSION KEPT TYPED IS MOVED BY THE RECORD as it installs the update (`@braindog/record` `carryUpdate`),
     so an agent's proposal and any other caller carry it too; this only links the examples. */
  const links = await linkExamples(
    io,
    plan.usecase.id,
    {
      links: plan.links,
      declarations: plan.packs.flatMap((p) => (Array.isArray(p.doc.declarations) ? (p.doc.declarations as Body[]) : [])),
    },
  );
  return { links, nav: plan.nav.length === 0 ? null : withOrder(plan.nav, arrangement) };
}

/* ── switching between use cases ───────────────────────────────────────── */

/**
 * The use case this record speaks as, without its prefix, or `null`, by the voice rule (`voice.ts` `speaking`). The states
 * may carry each pack's `speaks` setting (`speakingStates`); without it the rule's default is said.
 */
export const speakingOf = (states: readonly SpeakingState[]): string | null => speaking(states)?.slice('usecase-'.length) ?? null;

/** The record's packs with each use-case pack's `speaks` setting read, when two or more are on. */
export const speakingStates = (client: Pick<SharingClient, 'packConfig'>, states: readonly PackState[]): Promise<(PackState & SpeakingState)[]> =>
  withSpeaks(states, async (id) => {
    const read = await client.packConfig({ id });
    return read.ok && isMap(read.value) && isMap(read.value.values) ? read.value.values : null;
  }) as Promise<(PackState & SpeakingState)[]>;

/**
 * WHAT A PERSON IS ASKED BEFORE A SECOND USE CASE GOES IN, as onboarding and an agent's arrangement say it: the use case
 * speaking now, and what the rule would do if nobody chose (`beside`, or `speaks` to take the voice and Home over).
 * `null` when there is nothing to ask: no use case speaks, or the one speaking is the one being installed.
 */
export function voiceQuestion(states: readonly SpeakingState[], adding: string): { now: string; rule: 'speaks' | 'beside' } | null {
  const now = speaking(states);
  if (now === null || now === `usecase-${adding}`) return null;
  return { now: now.slice('usecase-'.length), rule: unasked(states, adding) };
}

/** What the rule does if nobody chooses: whether the use case added speaks once it is on beside the others. */
const unasked = (states: readonly SpeakingState[], adding: string): 'speaks' | 'beside' =>
  speaking([...states.filter((p) => p.id !== `usecase-${adding}`), { id: `usecase-${adding}`, disabled_at: null }]) === `usecase-${adding}` ? 'speaks' : 'beside';

/**
 * Keep the person's answer once the use case is in, as the `speaks` settings, by the voice rule (`voice.ts` `voiceWrites`):
 * the one chosen set to speak, the added one when it takes the voice over or the one speaking now when it goes beside, and
 * EVERY OTHER USE CASE ON set not to. Writing only the added one left a third use case speaking by how ids sort. Only what
 * differs is written. Called after the examples are linked, so the setup stays one line of the feed. A pack that has no
 * such setting (one installed before it existed) is given it by the record on the first write.
 */
export async function keepVoice(client: Pick<SharingClient, 'setPackConfig'>, states: readonly SpeakingState[], adding: string, choice: 'speaks' | 'beside'): Promise<void> {
  const added = `usecase-${adding}`;
  const now = speaking(states.filter((p) => p.id !== added));
  const speaker = choice === 'speaks' || now === null ? added : now;
  const after = [...states.filter((p) => p.id !== added), { id: added, disabled_at: null, speaks: null }];
  const batch = voiceBatch();
  for (const w of voiceWrites(after, speaker)) await client.setPackConfig({ id: w.id, values: { [SPEAKS]: w.speaks }, batch }).catch(() => null);
}

/** What a browse card offers for a use case on this record. */
export type Offer = 'in-use' | 'switch' | 'install' | 'update';

/** Whether version `a` comes before `b`, by number, a pre-release tail ignored. `false` when either is not a version. */
export function olderThan(a: string | null | undefined, b: string | null | undefined): boolean {
  const parse = (v: string | null | undefined) => /^(\d+)\.(\d+)\.(\d+)/u.exec(v ?? '')?.slice(1).map(Number) ?? null;
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number);
  return false;
}

/**
 * `version` is the use case as this build offers it: a pack held at an earlier version is offered as an update, with the
 * plan saying the difference, rather than In use or Switch to over an older copy.
 */
export function offerFor(id: string, states: readonly (PackState & SpeakingState)[], carriesPack: boolean, modules: readonly string[] = [], version?: string): Offer {
  const speaking = speakingOf(states);
  /* A USE CASE THAT CARRIES NO PACK IS ITS MODULES AND THE HOUSE VOICE: installed once every module is here and on. */
  if (!carriesPack) {
    if (modules.some((m) => !states.some((s) => s.id === m && s.disabled_at === null))) return 'install';
    return speaking === null ? 'in-use' : 'switch';
  }
  const held = states.find((s) => s.id === `usecase-${id}`);
  if (held && olderThan(held.version, version)) return 'update';
  if (speaking === id) return 'in-use';
  return held ? 'switch' : 'install';
}

/**
 * Switch to a use case this record already holds: turn its pack on, then the one speaking now off, so the voice and Home
 * follow. A use case that carries no pack (the house voice) is switched to by turning the one speaking off.
 */
export async function switchTo(client: SharingClient, id: string, states: readonly PackState[], carriesPack: boolean): Promise<{ ok: true } | { ok: false; fix: string }> {
  if (carriesPack) {
    const on = await client.enablePack({ id: `usecase-${id}` });
    if (!on.ok) return { ok: false, fix: refusalOf(on).fix };
    /* A USE CASE THAT CAN BE SET TO SPEAK IS, and the others stay on beside it with their lists. */
    const batch = voiceBatch();
    const set = await client.setPackConfig({ id: `usecase-${id}`, values: { [SPEAKS]: true }, batch }).catch(() => null);
    if (set?.ok) {
      for (const s of states)
        if (s.id.startsWith('usecase-') && s.id !== `usecase-${id}` && s.disabled_at === null) await client.setPackConfig({ id: s.id, values: { [SPEAKS]: false }, batch }).catch(() => null);
      return { ok: true };
    }
  }
  for (const s of states)
    if (s.id.startsWith('usecase-') && s.id !== `usecase-${id}` && s.disabled_at === null) {
      const off = await client.disablePack({ id: s.id });
      if (!off.ok) return { ok: false, fix: refusalOf(off).fix };
    }
  return { ok: true };
}

/** A use case's name for the voice question: the built-in's title, or its id in words for one somebody shared. */
export const useCaseTitle = (id: string, builtIn: readonly { usecase: string; title: string }[]): string =>
  builtIn.find((u) => u.usecase === id)?.title ?? listWords(id.replaceAll('-', '_'));

/* ── going out ─────────────────────────────────────────────────────────── */

/** The file `exportUseCase` answered, ready to save, or the sentence to say instead. */
export async function exportShared(
  client: SharingClient,
  args: Parameters<SharingClient['exportUseCase']>[0],
): Promise<{ ok: true; file: string; text: string; bytes: number } | { ok: false; fix: string; at: string | null }> {
  const out = await client.exportUseCase(args);
  if (!out.ok) {
    const refusal = refusalOf(out);
    return { ok: false, fix: refusal.fix, at: refusal.at ?? null };
  }
  const v = out.value;
  if (!isMap(v) || typeof v.file !== 'string' || !isMap(v.doc)) return { ok: false, fix: copy.writeRaced, at: null };
  const text = `${JSON.stringify(v.doc, null, 2)}\n`;
  return { ok: true, file: v.file, text, bytes: new TextEncoder().encode(text).length };
}

/**
 * The version a share offers: a patch or a minor on from the later of the version installed and the one this record last
 * shared as (`shared_version`), as the record would pick. 1.0.0 for an arrangement that has neither.
 */
export function offeredVersion(installed: string | null, lastShared: string | null, step: 'patch' | 'minor' = 'patch'): string {
  const parse = (v: string | null) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(v ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(installed);
  const b = parse(lastShared);
  const from = !a ? b : !b ? a : a[0]! !== b[0]! ? (a[0]! > b[0]! ? a : b) : a[1]! !== b[1]! ? (a[1]! > b[1]! ? a : b) : a[2]! >= b[2]! ? a : b;
  if (!from) return '1.0.0';
  return step === 'minor' ? `${from[0]}.${from[1]! + 1}.0` : `${from[0]}.${from[1]}.${from[2]! + 1}`;
}

/** The rail as this person sees it, as the addresses a share carries: the pages in drawn order, then the lists. */
export const drawnOrder = (pages: readonly { href: string }[], lists: readonly { id: string }[]): string[] => [...pages.map((p) => p.href), ...lists.map((l) => `/r/${l.id}`)];

/** A row as a person picks it from a list they know: its first line of text. */
export function rowTitle(fields: Readonly<Record<string, unknown>>): string {
  for (const key of ['name', 'what', 'title']) if (typeof fields[key] === 'string' && (fields[key] as string).trim() !== '') return fields[key] as string;
  for (const v of Object.values(fields)) if (typeof v === 'string' && v.trim() !== '' && !/^\d{4}-\d{2}-\d{2}/u.test(v)) return v;
  return '';
}

/** A list id in words, for a list the build does not ship a name for. */
export const listWords = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replaceAll('_', ' ');
