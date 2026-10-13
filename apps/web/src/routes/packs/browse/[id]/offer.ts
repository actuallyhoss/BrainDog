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
 * WHAT IT SENDS AND WHAT WAITS ARE SAID AS SENTENCES ON THE SHEET (`sendsOf`, `waitsOf`): which key goes to which host
 * and how often, in the kernel's words (`doesOf`), and the parts the plan left out until the record holds a list.
 */

import type { createClient } from '@braindog/client';
import { doesOf } from '@braindog/kernel';
import type { CatalogueEntry } from '@braindog/declare/catalogue';

import type { Listing } from '../../../../lib/market/listing.ts';
import { words } from '../../../../lib/market/words.ts';
import { packDocument, relabelDocument, type PackState } from '../../../../lib/record/packs.ts';
import { afterInstall, installShared, keepVoice, planShared, speakingStates, switchTo, voiceQuestion, type SharedPlan } from '../../sharing.ts';
import { askForVersion } from '../catalogue.ts';

type Wire<T> = { ok: true; value: T } | { ok: false; refusal?: { code?: string; fix?: string } };

/** The record's client, as every step here and in `sharing.ts` calls it. */
export type OfferClient = ReturnType<typeof createClient>;

/** A plan read and on the sheet: an add-on's or a module's `Diff`, or a use case's pack-by-pack plan. */
export type Planned =
  | { kind: 'pack'; doc: Record<string, unknown>; diff: unknown; planHash: string; approve: string[] }
  | { kind: 'usecase'; plan: SharedPlan };

export type Refused = { ok: false; fix: string; code: string | null };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const refusedOf = (r: Wire<unknown>, fallback: string): Refused => (r.ok ? { ok: false, fix: fallback, code: null } : { ok: false, fix: r.refusal?.fix ?? fallback, code: r.refusal?.code ?? null });

/** What the plan sheet draws: the record's `Diff`, or the use case's plan whole. */
export const diffOf = (p: Planned): unknown => (p.kind === 'pack' ? p.diff : p.plan);

/**
 * What installing the plan would send out, a sentence for each action: "Sends your key 'stripe' to api.stripe.com every
 * hour." The kernel writes it (`doesOf`, kind `install`) from the plan's `calls_out`, so Decide and this sheet say an
 * action the same way. Empty when the plan arms nothing new.
 *
 * A USE CASE IS ASKED PACK BY PACK, from the calls `sharing.ts` already read off each pack's plan, and a sentence two
 * packs share is said once.
 */
export function sendsOf(p: Planned): string[] {
  const calls: unknown[] =
    p.kind === 'pack'
      ? isMap(p.diff) && Array.isArray(p.diff.calls_out)
        ? p.diff.calls_out
        : []
      : p.plan.packs.flatMap((pack) => pack.calls.map((c) => ({ host: c.host, every: c.every, key: c.key, trigger: c.trigger ?? 'schedule', per_day: c.perDay ?? null })));
  const said = calls.map((c) => doesOf('install', { calls_out: [c] })).filter((line) => line !== '');
  return [...new Set(said)];
}

/** The words over the two groups of sentences on the sheet, kept with the market's other words. */
export const sheetWords = { sends: words.sends, waits: words.waits, waitsNote: words.waitsNote } as const;

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
 * The record's plan for a listing. `doc` is an add-on's verified document, or `null` for a module, whose document is
 * built for this record here; `text` is a use case's file, verified for a Kennel one and built for a built-in one.
 */
export async function planFor(
  client: OfferClient,
  listing: Pick<Listing, 'kind' | 'id' | 'source'>,
  file: { doc: Record<string, unknown> | null; text: string | null },
  states: readonly PackState[],
  fallback: string,
): Promise<{ ok: true; planned: Planned } | Refused> {
  if (listing.kind === 'usecase') {
    if (file.text === null) return { ok: false, fix: fallback, code: null };
    const out = await planShared(client, { text: file.text, source: listing.source === 'kennel' ? 'url' : 'local' }, states, packDocument, relabelDocument);
    return out.ok ? { ok: true, planned: { kind: 'usecase', plan: out.plan } } : { ok: false, fix: out.fix, code: out.code };
  }
  /* A MODULE IS BUILT FOR THE RECORD IT GOES INTO (`packDocument`): a link to a list this record will not hold is left
     out, and it carries no example rows. */
  const doc = file.doc ?? (listing.kind === 'module' ? await packDocument(listing.id, states) : null);
  if (!doc) return { ok: false, fix: fallback, code: null };
  const planned = await client.planPack({ doc, source: { kind: 'local' } });
  if (!planned.ok) return refusedOf(planned, fallback);
  const diff = isMap(planned.value) && isMap(planned.value.diff) ? planned.value.diff : null;
  const planHash = typeof diff?.planHash === 'string' ? diff.planHash : '';
  if (!diff || planHash === '') return { ok: false, fix: fallback, code: null };
  const approve = Array.isArray(diff.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  return { ok: true, planned: { kind: 'pack', doc, diff, planHash, approve } };
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
): Promise<{ ok: true; nav: string[] | null } | Refused> {
  if (planned.kind === 'pack') {
    const out = await client.installPack({ doc: planned.doc, source: { kind: 'local' }, planHash: planned.planHash, ...(planned.approve.length > 0 ? { approve: planned.approve } : {}) });
    return out.ok ? { ok: true, nav: null } : refusedOf(out, fallback);
  }
  const heard = await speakingStates(client, states);
  const updating = states.some((s) => s.id === `usecase-${planned.plan.usecase.id}`);
  const out = await installShared(client, planned.plan, true);
  if (!out.ok) return { ok: false, fix: out.fix ?? fallback, code: out.stale ? 'PLAN_STALE' : null };
  const after = await afterInstall(client, planned.plan, arrangement);
  const asked = updating ? null : voiceQuestion(heard, planned.plan.usecase.id);
  if (asked) await keepVoice(client, heard, planned.plan.usecase.id, asked.rule);
  return { ok: true, nav: after.nav };
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
