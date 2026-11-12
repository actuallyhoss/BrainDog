/**
 * Whether the quick-add sheet is open, which way, and which list it writes: the one state the floating +, the `+` key
 * and the palette's three rows share.
 *
 * A HOST DRAWS IT (`QuickHost.svelte`), which a declared page mounts. While no host is mounted the palette offers none
 * of its rows, since a row that cannot run is absent (`palette/admit.ts`).
 *
 * THE LEDGER IS FOUND ONCE A RECORD, from the declarations the tab already asked beside `boot` (`ledger.ts`), and
 * forgotten when the record changes. Nothing here imports the client: the finding is handed in, so the palette's chunk
 * carries this file and nothing behind it.
 */

import { untrack } from 'svelte';

import type { Ledger } from './ledger.ts';
import type { Way } from './quick.ts';

class Quick {
  /** The sheet is up. */
  open = $state(false);
  /** Which of the three it opened on. */
  way = $state<Way>('out');
  /** The ledger of the record this tab is on, once found; `null` before, and on a record that keeps none. */
  ledger = $state<Ledger | null>(null);
  /** The record the ledger was found on, so a second record is asked afresh. */
  base = $state<string | null>(null);
  /** The record whose ledger has been looked for and answered, finding none included: what a page waits on before it lands. */
  settled = $state<string | null>(null);
  /** The record the ledger was last asked for fresh, so a kept one (`kept.ts`) is still asked behind. Not state: nothing draws it. */
  asked: string | null = null;
  /** How many hosts are mounted. The first one draws the sheet and answers the key. */
  #hosts = $state<number[]>([]);
  #next = 0;

  /** Whether the sheet can open here and now: a ledger is known and a host is mounted to draw it. */
  get ready(): boolean {
    return this.ledger !== null && this.#hosts.length > 0;
  }

  /**
   * A host mounting: it is answered a ticket, and `leads` says whether it is the one that draws.
   *
   * IT READS THE LIST UNTRACKED. A host calls this from an `$effect`, and a read of `#hosts` there made the effect
   * depend on the list it writes, so it ran again, joined again and never settled (`effect_update_depth_exceeded` on
   * every page that mounts a host).
   */
  join(): number {
    const t = ++this.#next;
    const held = untrack(() => this.#hosts);
    this.#hosts = [...held, t];
    return t;
  }

  leave(t: number): void {
    const kept = untrack(() => this.#hosts).filter((h) => h !== t);
    this.#hosts = kept;
    if (kept.length === 0) this.open = false;
  }

  leads(t: number): boolean {
    return this.#hosts[0] === t;
  }

  /** Open the sheet on one way. Answers whether it opened: with no ledger or no host, nothing does. */
  start(way: Way = 'out'): boolean {
    if (!this.ready) return false;
    this.way = way;
    this.open = true;
    return true;
  }

  close(): void {
    this.open = false;
  }

  /** The ledger found on one record. */
  found(base: string, ledger: Ledger | null): void {
    this.base = base;
    this.ledger = ledger;
  }

  /** The look for a record's ledger has ended, whatever it found. */
  settle(base: string): void {
    this.settled = base;
  }
}

export const quick = new Quick();
