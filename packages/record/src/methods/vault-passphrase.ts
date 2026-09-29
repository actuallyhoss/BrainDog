/**
 * The vault passphrase, the record's half: `setVaultPassphrase` and `clearVaultPassphrase`, VAULT, and `unlockVault`,
 * INTERNAL (`docs/12-SECURITY.md` §6, "The optional second factor").
 *
 * THE VAULT GATE COMES FIRST AND THE HOST'S STEP ONLY AFTER IT. Each host hands these a step holding the passphrase and
 * its root key (`withVaultPassphrase` and `unlockedKey` in `packages/host/src/passphrase.ts`), and the kernel calls it
 * (`kernel/src/api/vault-passphrase.ts`) only once the gate has let an owner in a browser through, proved within
 * fifteen minutes. What comes back here is wrapped bytes and a salt, or whether the key opened, and never the
 * passphrase or a key.
 *
 * A HOST THAT HANDS NO STEP IS ANSWERED `NOT_IN_THIS_BUILD`. `handlersFor` wires the two rows by name with two
 * arguments, so a host that has not put its handlers through `withVaultPassphrase` reaches these with no step at all,
 * and saying the vault changed when nothing could change it would be the worst answer there is.
 */

import type { Kernel, VaultGrant } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The host's two steps and the kernel's answer, named from the kernel so the shape is declared once. */
type Rewrap = Parameters<Kernel['changeVaultWrapping']>[1];
type Unlock = Parameters<Kernel['unlockVault']>[0];
type Changed = Awaited<ReturnType<Kernel['changeVaultWrapping']>>;
type Unlocked = Awaited<ReturnType<Kernel['unlockVault']>>;

export function methods(deps: RecordDeps) {
  const { kernel, vault, no, tail } = deps;

  /** Who signs the change. The vault gate has refused every token by then, so this is the person, or the host's owner. */
  const actorOf = (ctx: CallContext): string => (ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id);

  /** One change, once the gate has passed: refused without a step, and refused on a record this build cannot open. */
  const change = async (to: 'passphrase' | 'kek', ctx: CallContext, rewrap: Rewrap | undefined): Promise<Changed> => {
    if (typeof rewrap !== 'function')
      return no<never>('NOT_IN_THIS_BUILD', 'This host cannot put a passphrase on the vault or take one off, so nothing was changed.', { at: 'passphrase' });
    const broken = kernel.refused();
    if (broken) return { ok: false, refusal: broken };
    return tail(await kernel.changeVaultWrapping(to, rewrap, actorOf(ctx)));
  };

  return {
    /**
     * Put the vault behind a passphrase only its owner knows. VAULT. The record key's root key wrapping is overwritten
     * by the passphrase's in one transaction, with one `grant.rotate` event on `vault_key:record`.
     */
    async setVaultPassphrase(_args: unknown, ctx: CallContext, rewrap?: Rewrap): Promise<Changed> {
      const stop = vault(ctx);
      if (stop) return { ok: false, refusal: stop };
      return change('passphrase', ctx, rewrap);
    },

    /** Take the passphrase off, with that passphrase, so the vault's keys open under the host's root key again. VAULT. */
    async clearVaultPassphrase(_args: unknown, ctx: CallContext, rewrap?: Rewrap): Promise<Changed> {
      const stop = vault(ctx);
      if (stop) return { ok: false, refusal: stop };
      return change('kek', ctx, rewrap);
    },

    /**
     * Whether the record key opens for one key door's request. INTERNAL: each host's key doors ask it before
     * `depositGrant` or `openForGrant`, and no route reaches it.
     *
     * A PERSON IS HELD TO THE VAULT GATE HERE, BEFORE A PASSPHRASE IS COMPARED OR COUNTED. An agent, by its vault grant
     * or by the login token the deposit door takes, types no passphrase, so behind one it opens nothing and is told so
     * without a strike; `depositGrant` and `openForGrant` still put their own gates in front of what it asked for.
     */
    async unlockVault(unlock: Unlock, by: VaultGrant | CallContext): Promise<Unlocked> {
      const person = 'principal' in by && by.principal.kind !== 'token' ? by : null;
      if (person !== null) {
        const stop = vault(person);
        if (stop) return { ok: false, refusal: stop };
      }
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      return kernel.unlockVault(unlock, person !== null);
    },
  };
}
