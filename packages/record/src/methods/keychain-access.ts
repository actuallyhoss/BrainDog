/**
 * Keychain access, the owner's half: which machine may open which key, the asks waiting on him, and how long a sign-in
 * opens the keychain for (`docs/12-SECURITY.md` §6.3). Five methods, KEYCHAIN, each the owner in a browser proved within
 * the keychain's lock window: `keyAccess`, `setKeyAccess`, `keyAsks`, `answerKeyAsk` and `setLockAfter`.
 *
 * WHAT IS KEPT IS THE KERNEL'S (migration 46, `kernel/src/keychain.ts`): ids and rules, never a value. A key is named
 * here by its spoken id (`credentials#3`) or its row id, and answered by its spoken id; a machine by the handle
 * `listDevices` shows, or `*` for the key's own default. NO RULE IS `always`, which is how every key opened before this.
 *
 * THE OTHER HALF IS `openForGrant` (`index.ts`), which asks `kernel.keyGate` for an agent's keychain grant, and the
 * sign-in route `/auth/keychain/lock`, which is Lock now.
 */

import type { KeyAccessRow, KeyAnswer, KeyAskRow, KeyAskStatus, KeyRule, LockAfter } from '@braindog/kernel';
import { EVERY_MACHINE, KEY_ANSWERS, KEY_RULES, LOCK_AFTER_MINUTES } from '@braindog/kernel';
import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { listFor } from '../agent-lists.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The list a key is a row of. */
const KEYS = 'credentials';

/** One rule as the owner reads it: the key by its spoken id, and the machine by its handle and its name. */
export type KeyAccessSeen = {
  credential: string;
  machine: string;
  /** The machine's name as Settings shows it, or `null` for `*` and for a machine signed out since. */
  machine_name: string | null;
  rule: KeyRule;
  set_by: string;
  set_at: string;
};

/** What `keyAccess` answers: the record's lock window and the rules set, the key's default first. */
export type KeyAccessRead = { lock_after: LockAfter; rules: KeyAccessSeen[] };

/** One ask as the owner reads it: which key (spoken id and label), which machine, which run, and where it stands. */
export type KeyAskSeen = {
  id: string;
  credential: string;
  label: string | null;
  machine: string;
  machine_name: string | null;
  run: string | null;
  status: KeyAskStatus;
  asked_at: string;
  expires: string;
  answered_by: string | null;
  answered_at: string | null;
};

/** One tool that needs a key: the key by its spoken id, and the tool by its spoken id and its name. */
export type KeyUse = { credential: string; tool: string; title: string };

export function methods(deps: RecordDeps) {
  const { kernel, keychain, no, tail } = deps;

  /** Who signs a change. The keychain gate has refused every token by then, so this is the person. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /** Each keychain machine's name by its handle, the part before what the record adds after a middle dot. */
  const machineNames = async (): Promise<Map<string, string>> => {
    const names = new Map<string, string>();
    for (const d of await kernel.deviceList()) {
      if (d.reach !== 'vault') continue;
      const name = d.label?.split(' · ')[0]?.trim();
      if (name) names.set(d.handle, name);
    }
    return names;
  };

  const seenRule = (r: KeyAccessRow, names: Map<string, string>): KeyAccessSeen => ({
    credential: kernel.nameOf(r.credential),
    machine: r.machine,
    machine_name: r.machine === EVERY_MACHINE ? null : (names.get(r.machine) ?? null),
    rule: r.rule,
    set_by: r.set_by,
    set_at: r.set_at,
  });

  return {
    /**
     * The lock window and the rules set: every key's, or one key's with `{ credential }`. KEYCHAIN. A key with no rule
     * is not listed, and opens for every machine its grants reach, as it always did.
     */
    async keyAccess(args: { credential?: unknown } | undefined, ctx: CallContext): Promise<Result<KeyAccessRead>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      let id: string | undefined;
      if (args?.credential !== undefined) {
        const named = typeof args.credential === 'string' ? args.credential.trim() : '';
        const row = named ? kernel.get(named) : null;
        if (!row || row.register !== KEYS || row.deleted_at) return no('REF_UNKNOWN', 'There is no key by that name here.', { at: 'credential' });
        id = row.id;
      }
      const names = await machineNames();
      return ok({ lock_after: kernel.lockAfter(), rules: kernel.keyAccess(id).map((r) => seenRule(r, names)) });
    },

    /**
     * Which tools need which key: `[{ credential, tool, title }]`, one line for each key a tool's `needs` names, by
     * `credentials#n`, `NAME=credentials#n` or the key's label. KEYCHAIN, as the keychain page that asks is. Names only,
     * never a value. A record that keeps no tools answers an empty list.
     */
    async keyUses(_args: unknown, ctx: CallContext): Promise<Result<KeyUse[]>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      const tools = listFor('tools', kernel.registers());
      const out: KeyUse[] = [];
      if (tools === null) return ok(out);
      let cursor: string | null = null;
      do {
        const page = kernel.list({ register: tools, limit: 500, ...(cursor === null ? {} : { cursor }) });
        if (!page.ok) return page as Result<never>;
        for (const t of page.value.rows) {
          const needs = Array.isArray(t.fields.needs) ? t.fields.needs.filter((n): n is string => typeof n === 'string') : [];
          const seen = new Set<string>();
          for (const n of needs) {
            const named = (n.includes('=') ? n.slice(n.indexOf('=') + 1) : n).trim();
            const key = named ? kernel.get(named) : null;
            if (!key || key.register !== KEYS || key.deleted_at || seen.has(key.id)) continue;
            seen.add(key.id);
            out.push({ credential: kernel.nameOf(key.id), tool: kernel.nameOf(t.id), title: typeof t.fields.name === 'string' && t.fields.name !== '' ? t.fields.name : kernel.nameOf(t.id) });
          }
        }
        cursor = page.value.cursor;
      } while (cursor !== null);
      return ok(out);
    },

    /**
     * Set one key's access for one machine: `{ credential, machine, rule }`, the machine a keychain grant's handle or `*`
     * for the key's default, the rule `always`, `ask` or `deny`, or `null` to take the row away. KEYCHAIN. Answers the
     * rule as set, or `null` when it was taken away.
     */
    async setKeyAccess(args: { credential?: unknown; machine?: unknown; rule?: unknown } | undefined, ctx: CallContext): Promise<Result<KeyAccessSeen | null>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      const named = typeof args?.credential === 'string' ? args.credential.trim() : '';
      if (!named) return no('REQUIRED_MISSING', 'Name the key by its spoken id, such as credentials#3.', { at: 'credential' });
      const row = kernel.get(named);
      if (!row || row.register !== KEYS || row.deleted_at) return no('REF_UNKNOWN', 'There is no key by that name here.', { at: 'credential' });
      const machine = typeof args?.machine === 'string' ? args.machine.trim() : '';
      if (!machine) return no('REQUIRED_MISSING', 'Name the machine by its handle from Settings, or * for every machine.', { at: 'machine' });
      const rule = args?.rule ?? null;
      if (rule !== null && !(KEY_RULES as readonly unknown[]).includes(rule))
        return no('ENUM_VALUE_UNKNOWN', 'A key is opened always, after asking you, or never, or null to take the rule away.', { at: 'rule', allowed: KEY_RULES });
      const names = await machineNames();
      if (machine !== EVERY_MACHINE && !(await kernel.deviceList()).some((d) => d.handle === machine && d.reach === 'vault'))
        return no('REF_UNKNOWN', 'No machine with keychain access has that handle. Settings lists each one.', { at: 'machine' });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const set = kernel.setKeyAccess({ credential: row.id, machine, rule: rule as KeyRule | null }, actorOf(ctx));
      return tail(ok(set === null ? null : seenRule(set, names)));
    },

    /**
     * The asks waiting on the owner, newest first, or with `{ recent: true }` every ask of the last week too. KEYCHAIN.
     * Each names the key by its spoken id and its label, which only the owner reads here.
     */
    async keyAsks(args: { recent?: unknown } | undefined, ctx: CallContext): Promise<Result<{ asks: KeyAskSeen[] }>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      const recent = args?.recent === true || args?.recent === 'true';
      const names = await machineNames();
      const asks = kernel.keyAsks(recent).map((a: KeyAskRow): KeyAskSeen => {
        const row = kernel.get(a.credential);
        const label = row && !row.deleted_at && typeof row.fields.label === 'string' ? row.fields.label : null;
        return { ...a, credential: kernel.nameOf(a.credential), label, machine_name: names.get(a.machine) ?? null };
      });
      return ok({ asks });
    },

    /**
     * Answer one ask: `{ id, answer }`, the answer `once` (the machine's next open is let through), `always` (and the
     * machine's rule for that key becomes `always`) or `deny` (its next open is refused). KEYCHAIN.
     */
    async answerKeyAsk(args: { id?: unknown; answer?: unknown } | undefined, ctx: CallContext): Promise<Result<KeyAskSeen>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      const id = typeof args?.id === 'string' ? args.id.trim() : '';
      if (!id) return no('REQUIRED_MISSING', 'Name the ask by its id, as the list of asks gives it.', { at: 'id' });
      if (!(KEY_ANSWERS as readonly unknown[]).includes(args?.answer))
        return no('ENUM_VALUE_UNKNOWN', 'Answer once, always or deny.', { at: 'answer', allowed: KEY_ANSWERS });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      const out = kernel.answerKeyAsk({ id, answer: args!.answer as KeyAnswer }, actorOf(ctx));
      if (!out.ok) return out;
      const names = await machineNames();
      const row = kernel.get(out.value.credential);
      const label = row && !row.deleted_at && typeof row.fields.label === 'string' ? row.fields.label : null;
      return tail(ok({ ...out.value, credential: kernel.nameOf(out.value.credential), label, machine_name: names.get(out.value.machine) ?? null }));
    },

    /**
     * How long a sign-in opens the keychain for: `{ minutes }`, 5, 15 or 60. KEYCHAIN, so changing it takes a sign-in
     * as recent as the window it replaces. Answers the window now set.
     */
    async setLockAfter(args: { minutes?: unknown } | undefined, ctx: CallContext): Promise<Result<{ lock_after: LockAfter }>> {
      const stop = keychain(ctx);
      if (stop) return { ok: false, refusal: stop };
      const minutes = typeof args?.minutes === 'string' ? Number(args.minutes) : args?.minutes;
      if (!(LOCK_AFTER_MINUTES as readonly unknown[]).includes(minutes))
        return no('ENUM_VALUE_UNKNOWN', 'The keychain locks after 5, 15 or 60 minutes.', { at: 'minutes', allowed: LOCK_AFTER_MINUTES.map(String) });
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      return tail(ok({ lock_after: kernel.setLockAfter(minutes as LockAfter) }));
    },
  };
}
