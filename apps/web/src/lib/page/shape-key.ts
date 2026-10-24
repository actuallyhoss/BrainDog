/**
 * Where a project's page hands its one read of the project to the parts it declares (C28, C29): `PageView.svelte` sets
 * a box under this key, and each `project` block's slot (`BlockSlot.svelte`) draws its part from the hold in it. A box
 * and not the hold itself, so the hold's own code is fetched only on a project's page and never by Today.
 */

import type { ShapeHold } from './shape-hold.svelte.ts';

export const SHAPE_KEY = Symbol('project-shape');

/** The page's box: the hold for the project the page is about, or `null` on any other page. */
export type ShapeBox = { hold: ShapeHold | null };
