/**
 * Money's "Keep rates current" switch: whether the rates add-on is installed and on, read off the packs the record holds.
 *
 * MONEY DECLARES NO HOST. The switch is the way into the rates action that asks for the address (`/automations?new=action&preset=rates`) and,
 * once that is installed, the way to turn it off and on again, which is the same call the add-on's own switch makes.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

import { ratesSpecFor } from '@braindog/pack-rates-poll/fill';
import type { PackState } from '../../../lib/record/packs.ts';

/** The rates add-on's id on a record, `rates-<id>`: the one `fillRates` files the preset under. */
export const RATES_PACK = `rates-${ratesSpecFor(['USD', 'EUR'], 'USD')?.id ?? 'open-er-api-com'}`;

/** The rates feed a record holds, or `null`. */
export const ratesFeedOf = (packs: readonly PackState[]): PackState | null => packs.find((p) => p.id === RATES_PACK) ?? null;

/** Whether the switch reads on: the feed is installed and not turned off. */
export const ratesKept = (feed: Pick<PackState, 'disabled_at'> | null): boolean => feed !== null && feed.disabled_at === null;

/** Where the switch is, for Health and the foot of a page to link to. */
export const KEEP_RATES_AT = '/addons/money-core#keep-rates';

/** Where the switch goes when the feed is not installed yet: the rates action, filled in, which asks for the address. */
export const KEEP_RATES_ASK = '/automations?new=action&preset=rates';
