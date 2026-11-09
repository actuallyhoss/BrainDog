/**
 * What the shell's parts read of each other, on the desk and the phone alike: the record switcher, the face's menu, the
 * bell, the phone's head, and the crumb. The shell writes most of it (`+layout.svelte`); the page's head says the page's
 * own name (`PageHead.svelte`), and the sidebar says what each list declares once it has read it (`SideBar.svelte`).
 */
import { MediaQuery } from 'svelte/reactivity';
import type { Snippet } from 'svelte';
import type { Cursor } from '@braindog/client';
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
  /** The person reading, as the record writes them on what they did: their own doings are not the bell's (AO8). */
  actor: '',
  /** Set by the face's "Keyboard keys"; the shell opens the sheet and puts it back. */
  keys: false,
  /** Opens another record; the shell's, since it reloads the tab. */
  open: null as ((r: Reachable) => void) | null,
  /** What the bell holds: what wants the reader since they last looked (`boot`'s `bell`), which the bell opens. */
  news: [] as readonly NewsItem[],
  /** The cursor of the newest line in `news`, which "Mark all read" sends. */
  upTo: null as Cursor | null,
  /** How many things wait on Needs you, the count the rail says, which the bell says too. */
  asks: 0,
  /** The newest line marked read from the bell, by its time: a line at or before it is read. */
  readTo: '',
  /**
   * WHAT THE BELL SAID THAT HAS SINCE BEEN OPENED (`bell.opened`, `shell/bell-open.ts`): each address a line opens, to the
   * time of the newest line read there. A line at or before its address's time is read, on every device.
   */
  opened: {} as Readonly<Record<string, string>>,
  /** Where you are, in one word or name: the lit row of the sidebar, which the phone's head says. */
  here: '',
  /** The page's own name, as its head says it, for the last step of the crumb. */
  title: '',
  /** What the bar says in place of the page's name where the page greets rather than names: Today's "Good afternoon, Mara". */
  heading: '',
  /** Where a page that names itself sits, as its head's way back says it: the crumb's trail when no sidebar row is lit. */
  up: null as { label: string; href: string } | null,
  /** The page's count, said quietly after its name in the bar ("Needs you 4"). */
  figure: '',
  /** The bar carries the crumb, so a page's head on a desk draws no way back of its own. */
  crumbed: false,
  /** What each list declares about where it belongs, by id, as the sidebar learnt it. */
  facts: {} as Readonly<Record<string, ListFacts>>,
  /**
   * THE SHELL'S BANNERS (seeing as somebody, a lapse, a guest's welcome, a new colleague's role line), handed to the page's
   * head so a phone draws them UNDER its bar and not over it (collab pass 2, 2 Nov): drawn by the shell above the page,
   * they sat above the bar the page itself draws, and the bar was pushed half a screen down.
   */
  banners: null as Snippet | null,
  /** A titled page's own buttons on a desk when it says no sentence, which the top bar draws beside the name. */
  actions: null as Snippet | null,
  /** How many page heads are drawn now: with one on a phone, it draws the banners and the shell does not. */
  heads: 0,
});

/** Below 900px a page's head draws the phone's bar, which says where you are at its start. */
export const narrow = new MediaQuery('(width < 900px)', false);

/**
 * WHETHER THE BAR SAYS THE PAGE'S NAME, which is then not said a second time on the page (29 October, his word: "the
 * title showing twice"). On a phone the head's own bar always does; on a desk the top bar does, on either navigation.
 */
export const barTitled = (): boolean => narrow.current || frame.crumbed;
