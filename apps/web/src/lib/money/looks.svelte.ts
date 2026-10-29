/**
 * MONEY'S CHIPS AS THIS TAB HOLDS THEM: each category's glyph and colour and each account's type, by name, asked of the
 * record once a record the first time a Money page draws a part (`partLook`). Until they arrive a part is drawn by its
 * name alone (`category-look.ts`), so nothing waits on this read.
 */

import { page } from '$app/state';

import { apiBase } from '../at.ts';
import { wordSlot } from 'braindog-render';

import { accountLook, categoryLook, type Look } from './category-look.ts';
import type { Looks } from './read.ts';

/** A part that is no category: money nothing has filed, which keeps the ledger's dashed `?` and no chip here. */
const UNFILED = /^(not filed|no category|nothing filed|uncategori)/iu;

const VIEW_KEY = 'bd_money_lines_view';

function keptView(): 'cards' | 'ledger' {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'ledger' ? 'ledger' : 'cards';
  } catch {
    return 'cards';
  }
}

class Held {
  #looks = $state<Looks | null>(null);
  /** How a table of ledger lines is drawn, as this device last chose: as cards a day at a time, or as the ledger's grid. */
  view = $state<'cards' | 'ledger'>(keptView());

  choose(v: 'cards' | 'ledger'): void {
    this.view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* a private window keeps the choice for this page only */
    }
  }
  #asked: string | null = null;

  ask(): void {
    const base = typeof location === 'undefined' ? null : apiBase();
    if (base === null || this.#asked === base) return;
    this.#asked = base;
    void import('./read.ts')
      .then((m) => m.readLooks(base, (page.data as { lists?: { id: string; kernel?: true }[] } | undefined)?.lists ?? []))
      .then((l) => {
        if (this.#asked === base) this.#looks = l;
      })
      .catch(() => undefined);
  }

  /** A category's chip by its name, its own glyph and colour where it holds them. */
  category(name: string): Look | null {
    const n = name.trim();
    if (n === '' || UNFILED.test(n)) return null;
    this.ask();
    const held = this.#looks?.categories.find((c) => c.name.toLowerCase() === n.toLowerCase());
    return categoryLook(n, held);
  }

  /** Who was paid, as an initial on their own steady colour; money with no name keeps no chip. */
  payee(name: string): Look | null {
    const n = name.trim();
    if (n === '' || /^no name/iu.test(n)) return null;
    return { glyph: '', slot: wordSlot(n) };
  }

  /** An account's chip by its name, where the record holds that account; null for any other label. */
  account(name: string): Look | null {
    this.ask();
    const n = name.trim().toLowerCase();
    const a = this.#looks?.accounts.find((x) => x.name.toLowerCase() === n);
    return a ? accountLook(a.name, a.kind) : null;
  }
}

export const looks = new Held();
