/**
 * The desk's own labels: the app's words for its places and tiles. Every name and figure on the desk is Maya's and
 * comes from `../demo/maya.ts`; only the app's furniture is said here.
 */

export const DESK = {
  brand: 'BrainDog',
  places: 'Places in the app',
  tabs: { today: 'Today', project: 'Projects', needs: 'Needs you', agents: 'Agents' },
  waiting: (n: number): string => (n === 1 ? '1 waiting' : `${n} waiting`),
  ask: { bar: 'Ask or change anything', key: '/', open: 'Ask BrainDog', close: 'Close' },
  today: { rewritten: 'rewritten' },
  needs: {
    title: 'Needs you',
    clear: 'all clear',
    asked: 'asked by',
    handled: 'Handled today',
    withUndo: 'with undo',
    undo: 'Undo',
    empty: 'Nothing needs you. Everything else is handled.',
  },
  agents: { notes: 'latest notes', terminal: 'A terminal, with Claude working on Tidepool' },
} as const;

export type Tab = keyof typeof DESK.tabs;

/** The four places in the order the tab bar draws them, Today first and chosen as the page loads. */
export const TABS: readonly Tab[] = ['today', 'project', 'needs', 'agents'];
