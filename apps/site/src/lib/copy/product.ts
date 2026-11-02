/**
 * The app's own furniture in the drawings of it (`lib/product/`): its places, its tiles' names and the words its
 * screens say, as the app says them on 1 November. Every name and figure in a drawing is Maya's (`demo/maya.ts`); only
 * the frame round her record is said here, so a word the app changes is changed in one place.
 *
 * IT IS NOT SPREAD INTO `copy.ts`: the drawings import it directly.
 */
import { PROJECT_ORDER } from '../demo/maya.ts';

export const frame = {
  /** What a screen reader hears for the whole drawing, and the line that says it is made up. */
  label: "BrainDog's Today, on Maya Okafor's made-up record",
  brand: 'BrainDog',
  places: [
    { label: 'Today', icon: 'today', on: true },
    { label: 'Needs you', icon: 'inbox', count: true },
    { label: 'Work', icon: 'work', n: '12' },
    { label: 'Money', icon: 'money' },
    { label: 'Agents', icon: 'agent', live: true, n: '2' },
    { label: 'People', icon: 'people', n: '6' },
  ],
  projects: 'Projects',
  inPlay: `${PROJECT_ORDER.length} in play`,
  foot: [
    { label: 'Add-ons', icon: 'box' },
    { label: 'Usage', icon: 'activity' },
    { label: 'Settings', icon: 'settings' },
  ],
  search: 'Search or go to…',
  searchKey: '⌘K',
  bell: 3,
  face: 'M',
  /* THE PHONE'S TAB BAR, the app's four places and Menu. */
  tabs: [
    { label: 'Today', icon: 'today', on: true },
    { label: 'Needs you', icon: 'inbox', count: true },
    { label: 'Projects', icon: 'projects' },
    { label: 'Money', icon: 'money' },
    { label: 'Menu', icon: 'menu', live: true },
  ],
} as const;

export const today = {
  title: 'Today',
  /** Today's head, as the app's `greetingOf` says it by the reader's hour. */
  greet: (hour: number, name: string): string =>
    `${hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'}, ${name}`,
  needs: 'Needs you',
  waiting: (n: number): string => (n === 1 ? '1 waits for you' : `${n} wait for you`),
  allDone: 'Nothing needs you. Everything else is handled.',
  undo: 'Undo',
  handled: (n: number): string => `BrainDog handled ${n} today`,
  review: 'Review',
  cash: 'Cash ahead',
  cashNow: 'Cash now',
  lasts: 'Lasts about 14 months at this pace',
  in30: 'In, 30 days',
  out30: 'Out, 30 days',
  working: 'Working now',
  allAgents: 'All agents',
  heard: 'heard 2 min ago',
  numbers: 'Numbers',
  allNumbers: 'All numbers',
  coming: 'Coming up',
} as const;
