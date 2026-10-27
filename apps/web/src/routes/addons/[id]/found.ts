/**
 * ONE PAGE PER ADD-ON: `/addons/<id>` is the add-on as this record holds it when it holds
 * it, and the store's page for it when it does not. The two disagreed (one said version 1.21.0 and two pages, the other
 * "Update to 1.23.0" and four), so which one an address draws is decided here, once, from what the record holds.
 *
 * PURE, so `node --test` reads it.
 */

import { CORE } from '@braindog/declare';
import type { CatalogueIndex } from '@braindog/declare/catalogue';

import { compareVersion, latestOf, listingKey, listingsOf, unlistedListing, type Listing, type ListingKind } from '../../../lib/market/listing.ts';
import type { PackState } from '../../../lib/record/packs.ts';

/**
 * Where an add-on is offered: `builtin` is part of BrainDog and never an add-on to choose, `store` is listed, `unlisted`
 * installs by its id and is in no listing, and `link` is private, installed by its link alone.
 */
export type Tier = 'builtin' | 'store' | 'unlisted' | 'link';

export const KINDS: readonly ListingKind[] = ['module', 'usecase', 'pack'];

/** The pack id this record holds the add-on an address names under, or `null` when it holds none: `founder` is `usecase-founder`. */
export function heldAs(id: string, kind: ListingKind | null, states: readonly PackState[]): string | null {
  const ids = kind === 'usecase' ? [`usecase-${id}`, id] : kind === null ? [id, `usecase-${id}`] : [id];
  return ids.find((x) => states.some((s) => s.id === x)) ?? null;
}

/**
 * The listing an address names, read as the store reads it (`listingsOf`), then by its id from the catalogue this host
 * serves, then from the one this build ships, which holds a private add-on the public index leaves out. A use case's
 * pack id (`usecase-founder`) names its use case.
 */
export function foundListing(input: {
  kennel: CatalogueIndex | null;
  shipped: CatalogueIndex | null;
  counts: Record<string, number> | null;
  id: string;
  kind: ListingKind | null;
}): { listing: Listing; tier: Tier; shippedOnly: boolean } | null {
  const usecase = /^usecase-(.+)$/u.exec(input.id)?.[1];
  const id = usecase ?? input.id;
  const kind = usecase === undefined ? input.kind : 'usecase';
  const all = listingsOf({ kennel: input.kennel, counts: input.counts });
  const listed = (kind === null ? undefined : all.find((l) => l.key === listingKey(kind, id))) ?? (kind === null ? (all.find((l) => l.kind === 'usecase' && l.id === id) ?? all.find((l) => l.id === id)) : undefined);
  const hosted = listed ?? unlistedListing(input.kennel, id, kind);
  const shipped = hosted ?? unlistedListing(input.shipped, id, kind);
  if (!shipped) return null;
  const entry = [input.kennel, input.shipped].flatMap((i) => i?.entries ?? []).find((e) => e.kind === shipped.kind && e.id === shipped.id);
  const tier: Tier =
    shipped.kind === 'module' && (CORE as readonly string[]).includes(shipped.id) ? 'builtin' : entry?.private === true ? 'link' : listed === undefined && shipped.source !== 'bundled' ? 'unlisted' : 'store';
  return { listing: shipped, tier, shippedOnly: hosted === null };
}

/** The version newer than the one held that the listing offers, or `null` when the record holds the newest. */
export function newerThan(listing: Listing, held: string | null): string | null {
  const latest = latestOf(listing)?.version ?? null;
  return latest !== null && held !== null && compareVersion(held, latest) < 0 ? latest : null;
}
