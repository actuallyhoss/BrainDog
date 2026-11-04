/**
 * WHAT THE SHELL'S ONE THING MENU IS ASKED TO DO, kept where the shell can read it with none of the menu's code. The shell
 * hears a right-click on a link (`hearThings`), puts it here, and draws `ThingMenu.svelte`, which is its own chunk. A verb
 * pressed anywhere that needs a sheet (rename, hand, share) asks here too, since its menu closes on the press.
 */

import type { ThingAsk } from '../ui/context-menu.ts';
import type { Entry, RegisterDecl } from '../record/schema.ts';

export type SheetAsk =
  | { kind: 'rename'; title: string; label: string; value: string; save: (value: string) => Promise<string | null> }
  | { kind: 'hand'; register: string; row: Entry; decl: RegisterDecl }
  | { kind: 'share'; subject: { kind: 'row'; list: string; seq: number; id: string | null; name: string } }
  | { kind: 'merge'; register: string; seq: number; name: string; title: string; mergedInto: string | undefined };

export const things = $state<{ wanted: boolean; ask: ThingAsk | null; sheet: SheetAsk | null }>({ wanted: false, ask: null, sheet: null });

/** Ask for a sheet, which draws the shell's menu chunk if nothing has yet. */
export function askSheet(sheet: SheetAsk): void {
  things.wanted = true;
  things.sheet = sheet;
}
