/**
 * What the Share sheet asks the record and sends it (the share API, sharing plan slice 7): who can be shared with, the
 * preview, the share or a chip's bundle, and the invitation an address is sent.
 *
 * AN ADDRESS IS TWO CALLS FROM ONE PRESS. The shares go first, each to `{ kind: 'email' }`, and wait for whoever
 * accepts; then `invite({ email })` with no level makes the link that joins them, which the record gives only while a
 * share is waiting for that address. A link that was not made leaves the shares kept, and the sheet says so.
 *
 * A CHIP IS ONE BUNDLE: its rows are sent one by one under one `bundle`, the allow first, so a refusal (the inline
 * confirm among them) is met before anything is kept.
 *
 * A ROUTE-ONLY MODULE, like `settings-write.ts`: the client carries the route table as a value, so only the sheet loads
 * it.
 */

import { createClient, type Member } from '@braindog/client';
import type { Share, ShareTarget } from '@braindog/kernel';

import type { Fetch } from '../record/boot-live.ts';
import { canAsk } from '../reauth/ask.ts';

export type Preview = {
  sentence: string;
  lists: { list: string; name: string; rows: number }[];
  /** The money it shows (`SharePreview.money`); absent from a host older than it, which is read as none. */
  money?: { lists: string[]; hidden: boolean; figures: { label: string; said: string }[] } | null;
};
export type Refused = { ok: false; code: string; fix: string; at: string | undefined };
export type Got<T> = { ok: true; value: T } | Refused;

/**
 * Somebody on the record the sheet offers, by name. An owner already sees everything and is never offered. `team` is
 * whether they hold a role on the whole record; a guest who holds only shares is offered too, and is not on his team.
 */
export type Here = { id: string; name: string; email: string | null; team: boolean };
export type Group = { id: string; name: string; people: number };

const refused = (out: { ok: false } & ({ refusal: { code: string; fix: string; at?: string } } | object)): Refused =>
  'refusal' in out ? { ok: false, code: out.refusal.code, fix: out.refusal.fix, at: out.refusal.at } : { ok: false, code: 'VERSION_STALE', fix: '', at: undefined };

/** The confirm the record asks for before a share with no end, or Edit or Manage to an address (§6, default 1). */
/* INSIDE THE APP'S FRAME THE CLIENT HAS ALREADY ASKED "Confirm it's you" (`lib/reauth`) and sent the share again had it
   passed, so a confirm refusal that comes back is a Cancel, said as its plain line and not asked again in the sheet. */
export const asksConfirm = (r: Refused): boolean => !canAsk() && r.code === 'NEEDS_BROWSER_SESSION' && r.at === 'confirm';

export function sheetApi(base: string, io?: Fetch) {
  const c = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    /**
     * The people on the record, owners and the caller left out: its members, each said to be on his team when they hold
     * a role on the whole record, and the guests a live share is with, who are not.
     */
    async people(me: string): Promise<Here[]> {
      const [out, shared] = await Promise.all([c.call<Member[]>('members'), c.call<{ who: { kind: string; id: string }; who_name: string | null; ended_at: string | null }[]>('sharing')]);
      if (!out.ok) return [];
      const members = out.value
        .filter((m) => m.level !== 'owner' && m.person_id !== me && m.suspended_at === null)
        .map((m) => ({ id: m.person_id, name: m.name ?? m.email ?? '', email: m.email, team: m.level !== null }));
      const known = new Set([...out.value.map((m) => m.person_id), me]);
      const guests = new Map<string, Here>();
      for (const r of shared.ok ? shared.value : [])
        if (r.who.kind === 'person' && r.ended_at === null && !known.has(r.who.id) && r.who_name) guests.set(r.who.id, { id: r.who.id, name: r.who_name, email: null, team: false });
      return [...members, ...guests.values()].filter((p) => p.name !== '').sort((a, b) => a.name.localeCompare(b.name));
    },

    /** The record's groups, by name. None where the host is older than `groups`. */
    async groups(): Promise<Group[]> {
      const out = await c.call<{ id: string; name: string; people: unknown[] }[]>('groups');
      return out.ok ? out.value.map((g) => ({ id: g.id, name: g.name, people: g.people.length })) : [];
    },

    /** A row's id, for a project or a row the page named by its number. */
    async idOf(register: string, seq: number): Promise<string | null> {
      const out = await c.get(register, seq);
      if (!out.ok) return null;
      const id = (out.value as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    },

    async preview(share: Share): Promise<Got<Preview>> {
      const out = await c.call<Preview>('sharePreview', { share });
      return out.ok ? out : refused(out);
    },

    /**
     * The shares, the allow first, under one bundle when there are more than one. The record's sentence for the last kept.
     * `id` changes that one share in place, which is only ever one share and no bundle.
     */
    async send(shares: readonly Share[], template: string | null, id?: string): Promise<Got<{ sentence: string; ids: string[] }>> {
      const bundle = shares.length > 1 && id === undefined ? `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` : undefined;
      const ids: string[] = [];
      let sentence = '';
      for (const share of id === undefined ? shares : shares.slice(0, 1)) {
        const out = await c.call<{ id: string; sentence: string }>('share', {
          share,
          ...(id === undefined ? {} : { id }),
          ...(bundle ? { bundle } : {}),
          ...(template ? { template } : {}),
        });
        if (!out.ok) return refused(out);
        ids.push(out.value.id);
        if (share.effect === 'allow') sentence = out.value.sentence;
      }
      return { ok: true, value: { sentence, ids } };
    },

    /**
     * Share on what the caller manages (`shareOnward`): `from` is their own share, `who` somebody here, `what` absent
     * for all of it. The record keeps it under theirs and answers its sentence.
     */
    async onward(a: { from: string; who: string; can: 'view' | 'comment' | 'edit'; what?: ShareTarget | undefined }): Promise<Got<{ id: string; sentence: string }>> {
      const out = await c.call<{ id: string; sentence: string }>('shareOnward', { from: a.from, who: a.who, can: a.can, ...(a.what === undefined ? {} : { what: a.what }) });
      return out.ok ? out : refused(out);
    },

    /** The link that joins an address to what waits for it, shown once. No level: the shares are what it gives. */
    async invite(email: string): Promise<Got<string>> {
      const out = await c.call<{ token: string }>('invite', { email });
      return out.ok ? { ok: true, value: out.value.token } : refused(out);
    },
  };
}

export type SheetApi = ReturnType<typeof sheetApi>;
