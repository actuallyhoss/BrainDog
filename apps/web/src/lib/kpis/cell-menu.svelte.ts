/**
 * A PROJECT'S NUMBERS TILE DRAWS ITS FIGURES APART FROM THE BLOCK THAT CAN CHANGE THEM: the page holds the block unseen and
 * paints the tile from what it answered. So the tile's figures ask that block for their menu here, and the block is the one
 * place that knows what a number offers. Null while nobody on the page may change them: then a figure has no menu to ask for.
 */
import type { MenuAt } from '$lib/ui/context-menu.ts';

export const numberMenus = $state<{ open: ((name: string | null, at: MenuAt) => void) | null }>({ open: null });
