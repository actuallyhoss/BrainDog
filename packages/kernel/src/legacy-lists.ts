/**
 * The list each role was read from by name before the keys, and still is while no list declares the role.
 *
 * ITS OWN FILE SO `constants.ts` CAN NAME `people` WITHOUT `roles.ts`: the app's first open reads `PEOPLE` and nothing
 * else of the roles, and importing `roles.ts` for it put every part of every role on that path. `roles.ts` exports it
 * again, so it is one value with one home.
 */

import type { RoleName } from './roles.ts';

export const LEGACY: Readonly<Record<RoleName, string>> = { rates: 'fx', meets: 'people', org: 'organisations' };
