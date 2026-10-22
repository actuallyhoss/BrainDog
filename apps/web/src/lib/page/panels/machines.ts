/**
 * The Agents page's foot, worded (`MachinesPanel.svelte`): one cell a machine, the busiest first, with how many agents
 * are at work on it and how many wait on him, and the profiles its runs are under as chips; then the machines he has
 * run on lately with nothing open, quiet; then every profile, as chips.
 *
 * NAMES ONLY, NEVER A HANDLE: a machine is said as a person says it (`machineSaid`: "MacBook Pro 16", not the host
 * name its runs gave it, which is kept for the hover), a profile its own name. "default" is said as the default profile
 * is everywhere else, not at all.
 *
 * PURE, AND NODE LOADS IT.
 */

import type { LiveRun, Places } from '../../record/instruct.ts';
import { machineSaid } from '../../record/machine-name.ts';

export type MachineLine = {
  /** The name its runs gave it, which keys the cell. */
  key: string;
  /** As a person says it. */
  name: string;
  /** The name its runs gave it, for the hover, where that is not what is said. */
  title: string | null;
  said: string;
  /** The profiles its runs are under, by name. */
  seats: string[];
  quiet: boolean;
};

/** A machine with no name its runs gave it. */
export const UNNAMED = 'A machine not named';

const real = (seat: string | null | undefined): seat is string => typeof seat === 'string' && seat.trim() !== '' && seat !== 'default';

/** The cells, and every profile, for the agents at work, the ones waiting on him and the places he runs on. */
export function machinesOf(working: readonly LiveRun[], waiting: readonly LiveRun[], places: Places): { lines: MachineLine[]; profiles: string[] } {
  const by = new Map<string, { going: number; wait: number; seats: Set<string> }>();
  const add = (r: LiveRun, key: 'going' | 'wait') => {
    const name = r.machine?.trim() || UNNAMED;
    const m = by.get(name) ?? { going: 0, wait: 0, seats: new Set<string>() };
    m[key] += 1;
    if (real(r.seat)) m.seats.add(r.seat);
    by.set(name, m);
  };
  for (const r of working) add(r, 'going');
  for (const r of waiting) add(r, 'wait');
  const among = [...new Set([...by.keys(), ...places.machines])].filter((n) => n !== UNNAMED);
  const line = (key: string, said: string, seats: string[], quiet: boolean): MachineLine => {
    const name = key === UNNAMED ? UNNAMED : machineSaid(key, among);
    return { key, name, title: key !== UNNAMED && name !== key ? key : null, said, seats, quiet };
  };
  const open: MachineLine[] = [...by.entries()]
    .sort((a, b) => b[1].going - a[1].going || b[1].wait - a[1].wait || a[0].localeCompare(b[0]))
    .map(([name, m]) =>
      line(
        name,
        [m.going > 0 ? `${m.going} at work` : null, m.wait > 0 ? `${m.wait} waiting on you` : null].filter((x): x is string => x !== null).join(' · '),
        [...m.seats].sort(),
        m.going === 0,
      ),
    );
  const quiet: MachineLine[] = places.machines.filter((n) => !by.has(n)).map((name) => line(name, 'Nothing open', [], true));
  const profiles = [...new Set([...places.seats, ...[...working, ...waiting].map((r) => r.seat)])].filter(real).sort();
  return { lines: [...open, ...quiet], profiles };
}
