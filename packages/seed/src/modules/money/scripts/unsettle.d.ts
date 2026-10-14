/* The types of `unsettle.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

import type { SettleRow, Settled } from './settle.js';

/**
 * `before` is what the bill's other cleared payments come to, in minor units of the bill's currency; `gone` what the
 * deleted payment counted for (its amount when it had cleared, 0 when it had not), left out when nobody can say.
 */
export declare function unsettle(item: SettleRow, before: number, gone?: number): Exclude<Settled, { ask: unknown }>;
export default function run(ctx: unknown): Promise<unknown>;
export declare const UNSETTLE_SCRIPT: Record<string, unknown>;
export declare const UNSETTLE_RULE: Record<string, unknown>;
