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
 */

import type { createClient } from '@braindog/client';
import type { CatalogueEntry } from '@braindog/declare/catalogue';

import type { Listing } from '../../../../lib/market/listing.ts';
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
