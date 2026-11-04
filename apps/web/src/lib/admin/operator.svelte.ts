/**
 * Whether the person signed in is this host's operator, so the shell draws Admin in the sidebar, the phone's Menu and
 * the palette (`/admin`). Asked once a tab of the Cloud's `GET /account/ops/me`, which answers the operator and is the
 * 404 an unknown path gets for anybody else. A self-host is never asked: it has no operator but its owner, and no
 * Admin page.
 *
 * KEPT ON THIS DEVICE FOR THE PERSON IT WAS ASKED FOR, so the row is drawn with the sidebar's first frame and does not
 * step in a moment later. The answer still goes out each time, and a no takes the row away.
 */

import type { NavEntry } from '$lib/record/api.ts';

const KEY = 'bd.operator';

function kept(person: string): boolean {
  try {
    return person !== '' && localStorage.getItem(KEY) === person;
  } catch {
    return false;
  }
}

class Operator {
  /** Whether Admin is drawn. */
  yes = $state(false);
  #asked = '';

  /** Ask for `person` on a host that is `cloud`, once a tab a person. */
  ask(person: string, cloud: boolean): void {
    if (!cloud || person === '') {
      this.yes = false;
      return;
    }
    if (this.#asked === person) return;
    this.#asked = person;
    this.yes = kept(person);
    void fetch('/account/ops/me', { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        /* THE STATUS IS THE ANSWER, and a body nobody reads is a request still out, as Chromium counts it. */
        void res.body?.cancel();
        this.#keep(person, res.ok);
      })
      .catch(() => undefined);
  }

  #keep(person: string, yes: boolean): void {
    this.yes = yes;
    try {
      if (yes) localStorage.setItem(KEY, person);
      else localStorage.removeItem(KEY);
    } catch {
      /* a private window keeps it for the tab only */
    }
  }
}

export const operator = new Operator();

/** The row Admin is drawn as, in the sidebar's foot and the palette. */
export const ADMIN = { href: '/admin', label: 'Admin', icon: 'lock' } as const;

/** Admin as the palette finds it by name, typed or after `/`, for the operator only. */
export const ADMIN_ENTRY: NavEntry = { id: 'admin', title: ADMIN.label, href: ADMIN.href, section: 'Operator', order: 9999, icon: ADMIN.icon };
