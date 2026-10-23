/**
 * What the record switcher and the face's menu read, on the desk's bar and the phone's head alike (frame A, 23 October).
 * The shell writes it (`+layout.svelte`); the phone's head is inside the page, so the two menus read it here.
 */
import type { SwitcherRow } from '../record/switcher.ts';

export type Reachable = SwitcherRow;

export const frame = $state({
  /** The record open now, by its name. */
  record: '',
  /** The records this person can open. */
  records: [] as readonly Reachable[],
  /** The host's own sentence when the records could not be listed. */
  refused: undefined as string | undefined,
  /** The person reading, by the name the record told them. */
  person: '',
  /** Set by the face's "Keyboard keys"; the shell opens the sheet and puts it back. */
  keys: false,
  /** Opens another record; the shell's, since it reloads the tab. */
  open: null as ((r: Reachable) => void) | null,
});
