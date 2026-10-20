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
  ask: { bar: 'Ask or change anything', key: '/', open: 'Ask BrainDog', close: 'Close' },
  working: (n: number): string => `${n} working`,
  /** The greeting line's first phrase, in red while something waits (SF14: digits). */
  needYou: (n: number): string => (n === 0 ? 'Nothing needs you' : n === 1 ? '1 thing needs you' : `${n} things need you`),
  areWorking: ' are working, and cash lasts about ',
  behind: 'Where it comes from',
  needs: {
    title: 'Needs you',
    answered: 'Answered today',
    undo: 'Undo',
    empty: 'Nothing needs you. Everything else is handled.',
  },
  money: { cash: 'Cash ahead' },
  agents: { connected: 'Connected', working: 'Working now', terminal: 'A terminal, with Claude working on Tidepool' },
} as const;

export type Tab = keyof typeof DESK.tabs;

/** The five places in the order the app's bar draws them, Today first and chosen as the page loads. */
export const TABS: readonly Tab[] = ['today', 'needs', 'projects', 'money', 'agents'];
