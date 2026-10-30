/**
 * A swatch's name for a colour, and nothing that paints one.
 *
 * APART FROM `accent.ts`, which builds a whole theme from a colour (`recordTheme` in `@braindog/theme`, about 11 KB on a
 * phone): `theme/follow.ts` runs on every open and needs to know only whether there is a colour to adopt, and which.
 * So it reads this, and `accent.ts` is loaded only when there is one (`follow`).
 */

import { ACCENTS } from '@braindog/theme/accents.ts';

/**
 * The record's word for a colour: a swatch's name, or `House`. `undefined` is a colour no swatch wears, which the
 * record has no word for, so it stays on this device.
 */
export const nameOf = (accent: string | null): string | undefined =>
  accent === null ? 'House' : ACCENTS.find((a) => a.hex.toLowerCase() === accent.toLowerCase())?.name;

/** The colour a swatch's name paints, or `undefined` for a name this build has no swatch for (`House` among them). */
export const hexOf = (name: unknown): string | undefined => (typeof name === 'string' ? ACCENTS.find((a) => a.name === name)?.hex : undefined);
