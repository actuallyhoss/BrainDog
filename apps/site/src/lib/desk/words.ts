/**
 * The desk's own labels: the app's words for its places and tiles (the 19 October Today). Every name and figure on
 * the desk is Maya's and comes from `../demo/maya.ts`; only the app's furniture is said here.
 */
import type { IconName } from '../icons.ts';

export const DESK = {
  brand: 'BrainDog',
  places: 'Places in the app',
  tabs: { today: 'Today', needs: 'Needs you', projects: 'Projects', money: 'Money', agents: 'Agents' },
  /* The app's glyph for each place: Needs you is the tray (`inbox`, SPEC 2.A.25). */
  icons: { today: 'today', needs: 'inbox', projects: 'projects', money: 'money', agents: 'agent' } as Record<string, IconName>,
  /* THE APP'S KEY FOR ASK, ⌘J (Ctrl J off a Mac), as its bar shows it. */
  ask: { bar: 'Ask or change anything', key: '⌘J', open: 'Ask BrainDog', close: 'Close' },
  /** Today's head, as the app's `greetingOf` says it by the reader's hour. */
  greet: (hour: number, name: string): string =>
    `${hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'}, ${name}`,
  /** The sidebar's places that the desk does not open, drawn so the frame is the app's, and the projects' heading. */
  more: { work: 'Work', people: 'People', projects: 'Projects', inPlay: '4 in play', addons: 'Plugins', settings: 'Settings' },
  bell: 'What happened',
  /** The phone's last tab, the sidebar as a page. */
  menu: 'Menu',
  behind: 'Where it comes from',
  needs: {
    title: 'Needs you',
    answered: 'Answered today',
    undo: 'Undo',
    empty: 'Nothing needs you. Everything else is handled.',
  },
  money: { cash: 'Cash ahead' },
  /* TODAY IS A BOARD OF WIDGETS (the 30 October app): each tile a widget at its own size, one an agent made and is
     still a draft, and the way to change the board at its foot. */
  board: {
    coming: 'Coming up',
    edit: 'Edit Today',
    add: 'Add widget',
    draftBy: (who: string) => `${who} added this`,
    keep: 'Keep',
    toss: 'Throw away',
    kept: 'Kept on Today.',
    tossed: 'Thrown away.',
    undo: 'Undo',
  },
  agents: { connected: 'Connected', working: 'Working now', terminal: 'A terminal: the briefing for Tidepool, a key put away, and a check of this machine' },
} as const;

export type Tab = keyof typeof DESK.tabs;

/** The five places in the order the app's bar draws them, Today first and chosen as the page loads. */
export const TABS: readonly Tab[] = ['today', 'needs', 'projects', 'money', 'agents'];
