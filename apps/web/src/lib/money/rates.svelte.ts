/**
 * The record's rates as this tab holds them, and which amount on screen says how old they are.
 *
 * AN AMOUNT THAT RESTATES ITSELF IN THE HOME CURRENCY (`Money.svelte` with `approx`) reads the rates here. They are
 * asked of the record once a record, the first time such an amount is drawn, or handed in by a screen that read them
 * already (the quick-add sheet). The age is said by ONE amount on the screen: the first to claim it, and when that one
 * goes, the next.
 */

import { page } from '$app/state';

import { apiBase } from '../at.ts';
import type { Rate } from './rates.ts';

class Held {
  /** The rates of the record at `base`, newest as the record holds them. */
  rates = $state<readonly Rate[]>([]);
  base = $state<string | null>(null);
  #asked: string | null = null;
  #claims = $state<number[]>([]);
  #next = 0;

  /** Rates read by a screen, kept for every amount drawn after. */
  keep(base: string, rates: readonly Rate[]): void {
    this.base = base;
    this.#asked = base;
    this.rates = rates;
  }

  /** Ask the record for its rates, once a record. Nothing is asked with no record to ask. */
  ask(): void {
    const base = typeof location === 'undefined' ? null : apiBase();
    if (base === null || this.#asked === base) return;
    this.#asked = base;
    void import('./read.ts')
      .then((m) => m.readRates(base, (page.data as { lists?: { id: string; kernel?: true }[] } | undefined)?.lists ?? []))
      .then((rates) => {
        if (this.#asked === base) this.keep(base, rates);
      })
      .catch(() => undefined);
  }

  /** An amount that could say the age: answered a ticket, and `says` is whether it is the one that does. */
  claim(): number {
    const t = ++this.#next;
    this.#claims = [...this.#claims, t];
    return t;
  }

  release(t: number): void {
    this.#claims = this.#claims.filter((c) => c !== t);
  }

  says(t: number): boolean {
    return this.#claims[0] === t;
  }
}

export const held = new Held();
