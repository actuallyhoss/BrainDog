/**
 * The two packs that left the core, read from their files in `packs/`, and the handover money-core carried to them.
 *
 * NOT A TEST FILE, AND THE NAME SAYS SO: the glob is `*.test.ts`. Tests in `packages/declare`, `packages/record`,
 * `packages/host` and `packages/kernel` import it as they already import `money-core-earlier.ts`.
 *
 * WHY THE FILES AND NOT A BUILDER. `bankHsbcEgPack()` and `holdingsPack()` in `packages/seed/src/packs` built both
 * documents in code, so the shell carried one person's bank and one person's kind of list as TypeScript
 * (`loop/research-legacy-parity.md` brief B1). The builders are gone and the files are what a person installs:
 * the the old tool import resolves them by id from the catalogue (`packs/legacy-import`). A test that installs the
 * bank or the holdings pack therefore installs the file, read fresh each call so no test hands the next one a copy it
 * changed.
 *
 * AND THE HANDOVER AS IT SHIPPED, BECAUSE money-core NO LONGER SHIPS ONE. From 1.8.0 to 2.4.0 money-core's `hands`
 * gave the bank's twelve patterns to `bank-hsbc-eg` and, from 2.0.0, `holdings` to `holdings`. The tests that prove a
 * handover keeps a token and a row (`door-hold`, `plan-handover-shown`, `handover-used`, `bank-pack`,
 * `holdings-pack`, `hands-first-party`) drive that mechanism, which `declare` still has, and they now make the `hands`
 * themselves with `handingAsShipped`. Checked on 25 September against the last document that carried it:
 * `handingAsShipped(firstPartyDocument('money-core')).hands` was the shipped `hands`, key for key and in order.
 */

import { readFileSync } from 'node:fs';

import type { Declaration } from '@braindog/kernel';

export type Body = Record<string, unknown>;
export type PackDoc = Body & { pack: string; version: string; requires: { format: number; primitives: number; packs: Record<string, string> }; declarations: Body[] };

const read = (path: string): PackDoc => JSON.parse(readFileSync(new URL(`../../../packs/${path}`, import.meta.url), 'utf8')) as PackDoc;

/** `packs/bank-hsbc-eg/bank-hsbc-eg.pack.json` as it ships: six mail wordings, their six webhook twins and the door's catch-all. */
export const bankHsbcEgFile = (): PackDoc => read('bank-hsbc-eg/bank-hsbc-eg.pack.json');

/** `packs/holdings/holdings.pack.json` as it ships, which is 1.1.0: the list, `cost`, the rule and script, three figures and a page. */
export const holdingsFile = (): PackDoc => read('holdings/holdings.pack.json');

/**
 * `holdings` 1.0.0, the one list and nothing else, frozen from the builder the day it was deleted. It is the version a
 * record that took money-core 2.0.0 was offered, and what `packs/holdings/holdings.test.ts` updates from.
 */
export const holdings100 = (): PackDoc => read('holdings/holdings-1.0.0.json');

/**
 * The holdings pack's one list as a kernel declaration, for a record opened the way `declarations()` opens one, which
 * records no pack. It replaces `holdingsDeclarations()`, which went with the builder: the body is the file's, with the
 * kind's key `register:` read back as the `id` a kernel body carries, so it has `cost` since 1.1.0.
 */
export const holdingsList = (doc: PackDoc = holdingsFile()): Declaration[] =>
  doc.declarations
    .filter((d) => typeof d.register === 'string')
    .map(({ register, ...rest }) => ({ id: `register.${String(register)}`, kind: 'register' as const, body: { id: register, ...rest } as never }));

/** The catch-all the pack added at 1.3.0. money-core never declared it, so it was never handed. */
const NOT_MINE = 'bank-not-mine-sms';

const byIngest = (sms: boolean): Record<string, Body> =>
  Object.fromEntries(
    bankHsbcEgFile()
      .declarations.filter((d) => d.ingest !== NOT_MINE && d.channel === (sms ? 'webhook' : 'email'))
      .map((d) => [String(d.ingest), d]),
  );

/** The six mail wordings, keyed by ingest id, as the file declares them. */
export const HSBC_EG_INGESTS: Readonly<Record<string, Body>> = byIngest(false);

/** Their six webhook twins, keyed the same way: `bank-from-out-sms` is the door, and the other five name it. */
export const HSBC_EG_SMS_INGESTS: Readonly<Record<string, Body>> = byIngest(true);

/**
 * The whole file as kernel declarations, for a record opened with `installSeed`, which installs lists and patterns
 * straight into the kernel and records no pack. Every ingest keeps `pack: 'bank-hsbc-eg'` in its body, as the sample
 * record's twelve did before the sample stopped carrying them.
 */
export const bankDeclarations = (): Declaration[] =>
  bankHsbcEgFile().declarations.map((body) => ({ id: `ingest.${String(body.ingest)}`, kind: 'ingest' as const, body: body as never }));

/** `packs/card-alerts/card-alerts.pack.json` as it ships: the two card wordings money-core carried until 3.0.0, and their twins. */
export const cardAlertsFile = (): PackDoc => read('card-alerts/card-alerts.pack.json');

const cardBy = (sms: boolean): Record<string, Body> =>
  Object.fromEntries(cardAlertsFile().declarations.filter((d) => d.channel === (sms ? 'webhook' : 'email')).map((d) => [String(d.ingest), d]));

/** The two card wordings, keyed by ingest id, as the file declares them. */
export const CARD_INGESTS: Readonly<Record<string, Body>> = cardBy(false);

/** Their two webhook twins, keyed the same way. */
export const CARD_SMS_INGESTS: Readonly<Record<string, Body>> = cardBy(true);

/** The whole file as kernel declarations, for a record opened with `installSeed`, which records no pack. */
export const cardAlertDeclarations = (): Declaration[] =>
  cardAlertsFile().declarations.map((body) => ({ id: `ingest.${String(body.ingest)}`, kind: 'ingest' as const, body: body as never }));

/** What money-core 1.8.0 to 2.4.0 handed the bank pack: the twelve, each to `bank-hsbc-eg`. */
export const MONEY_CORE_HANDS: Readonly<Record<string, string>> = Object.fromEntries(
  [...Object.keys(HSBC_EG_INGESTS), ...Object.keys(HSBC_EG_SMS_INGESTS)].map((id) => [`ingest.${id}`, 'bank-hsbc-eg']),
);

/**
 * A money-core document with the `hands` it shipped with: the twelve, and from 2.0.0 the list as well. `holdings: false`
 * is 1.8.0's, when the list was still money-core's own.
 */
export function handingAsShipped<T>(doc: T, o: { holdings?: boolean } = {}): T & { hands: Record<string, string> } {
  const d = structuredClone(doc) as T & { hands: Record<string, string> };
  d.hands = { ...MONEY_CORE_HANDS, ...(o.holdings === false ? {} : { 'register.holdings': 'holdings' }) };
  return d;
}
