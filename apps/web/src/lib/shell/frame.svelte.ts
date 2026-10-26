/**
 * What the shell's parts read of each other, on the desk and the phone alike: the record switcher, the face's menu, the
 * bell, the phone's head, and the crumb. The shell writes most of it (`+layout.svelte`); the page's head says the page's
 * own name (`PageHead.svelte`), and the sidebar says what each list declares once it has read it (`SideBar.svelte`).
 */
import type { NewsItem } from '../record/schema.ts';
import type { SwitcherRow } from '../record/switcher.ts';
import type { ListFacts } from './side.ts';

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
  /** What arrived since the reader last looked, which the bell opens. */
  news: [] as readonly NewsItem[],
  /** Where you are, in one word or name: the lit row of the sidebar, which the phone's head says. */
  here: '',
  /** The page's own name, as its head says it, for the last step of the crumb. */
  title: '',
  /** The bar carries the crumb, so a page's head on a desk draws no way back of its own. */
  crumbed: false,
  /** What each list declares about where it belongs, by id, as the sidebar learnt it. */
  facts: {} as Readonly<Record<string, ListFacts>>,
});
