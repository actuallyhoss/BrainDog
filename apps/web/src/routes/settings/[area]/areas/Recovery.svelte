<!--
  Settings > Recovery: the passkeys that get you back in, and the ways in without one.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { passkeyRegister, removePasskey, support } from '$lib/auth.ts';
  import { since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE HOST'S ANSWER ABOUT SIGNING IN IS SHARED with Identity, where signing out changes it
     (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const hostAuth = $derived(s.hostAuth);
  const liveKeys = $derived(s.liveKeys);

  const webauthnHere = support();
  let addingKey = $state(false);
  let addSaid = $state<string | null>(null);
  /** Somebody is signed in to a host that offers passkeys, so the list and its button are real. */
  const livePasskeys = $derived(hostAuth?.me && hostAuth.passkey ? hostAuth : null);
  const canAddPasskey = $derived(livePasskeys !== null && webauthnHere.webauthn && webauthnHere.secure);

  /* READ ON ARRIVING AT THE AREA. `untrack` for the reason the Ingest area gives: `opened()` reads
     and writes the same state, so an effect that called it tracked would loop. */
  $effect(() => {
    untrack(() => void s.readSignIn());
  });

  async function addLivePasskey() {
    if (addingKey) return;
    addingKey = true;
    addSaid = null;
    const at = opened();
    const out = await passkeyRegister();
    closed(true, at);
    addingKey = false;
    if (out.ok) s.liveKeys = [...(s.liveKeys ?? []), out.value];
    addSaid = out.ok
      ? copy.passkeyAdded
      : out.kind === 'cancelled'
        ? copy.passkeyNotAdded
        : out.kind === 'exists'
          ? copy.passkeyExists
          : copy.passkeyFailed;
  }

  async function dropPasskey(id: string) {
    const at = opened();
    const out = await removePasskey(id);
    closed(true, at);
    if (out.ok) s.liveKeys = s.liveKeys?.filter((k) => k.id !== id) ?? null;
    else toasts.push(copy.passkeyNotRemoved, { intent: 'warn' });
  }
</script>

<!--
  THE WAY BACK IN, and until now a dead end that said nothing about recovery.

  `19 §2`, verbatim: "`recovery` and `people & sharing` were missing from an earlier draft;
  the first left a passkey-primary product with NO DESIGNED WAY BACK IN." This build shipped
  the area and then left it saying "This area is part of the shell and is not wired in the
  mock-up", which is the same hole with a sentence in it.

  THERE IS NO ACCOUNT-RECOVERY FLOW AND THIS SCREEN DOES NOT INVENT ONE. `grep -rn "recovery
  code"` over all fifty-four documents returns nothing: the mechanism is a second passkey, and
  the fallback is the email link. Anything else here would be a control with nothing behind it
  on the one screen where that costs somebody their record.
-->
{#if livePasskeys}
  <!-- THE HOST'S OWN PASSKEYS, for somebody signed in to a host that offers them. Adding one is
       real only here, because only a live session can say whose passkey it is. -->
  <Section title={copy.passkeys} count={liveKeys?.length ?? 0}>
    <p class="hint">{copy.passkeyHow}</p>
    {#if liveKeys === null}
      <p class="hint">{copy.passkeysUnread}</p>
    {:else if liveKeys.length === 0}
      <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(livePasskeys.magic)} />
    {:else}
      <ul class="ledger ledger-glyph">
        {#each liveKeys as k (k.id)}
          <li>
            <div class="line">
              <span class="seq"><Icon name="key" size="s" /></span>
              <span class="line-main">
                <span class="line-title">{k.label ?? copy.passkeyUnnamed}</span>
                <span class="line-detail">{copy.addedWhen(since(new Date(k.createdAt).toISOString()))}</span>
              </span>
              <span class="line-amount"></span>
              <span class="line-when">
                {k.lastUsed ? copy.usedWhen(since(new Date(k.lastUsed).toISOString())) : copy.neverUsed}
                <Button
                  weight="bare"
                  tone="bad"
                  disabled={liveKeys.length <= 1}
                  aria-describedby={liveKeys.length <= 1 ? 'last-key' : undefined}
                  onclick={() => dropPasskey(k.id)}
                >{copy.remove}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
      {#if liveKeys.length <= 1}<p class="hint" id="last-key">{copy.lastPasskey}</p>{/if}
    {/if}
    {#if canAddPasskey}
      <div class="row-actions">
        <Button weight="primary" onclick={addLivePasskey} aria-busy={addingKey}
          ><Icon name="plus" size="s" />{addingKey ? copy.addingPasskey : copy.addPasskey}</Button
        >
      </div>
    {/if}
    {#if addSaid}<p class="hint" role="status">{addSaid}</p>{/if}
  </Section>
{:else if hostAuth}
<!-- NOBODY SIGNED IN, OR A HOST THAT OFFERS NO PASSKEYS, AND NO LIST OF KEYS NOBODY MADE.
     This arm drew the sample's `PASSKEYS`, two keys on two devices that never existed, with a
     Remove that said what it would have done. What is true where the host has answered and
     there is no session to list keys for is that there is no passkey here, and how that
     person gets back in without one, which the host's own `magic` decides. There is no "Add
     a passkey": without a session there is nobody to add one for. -->
<Section title={copy.passkeys}>
  <p class="hint">{copy.passkeyHow}</p>
  <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(hostAuth.magic)} />
</Section>
{/if}

<!-- AND THE ONE THAT IS OFFERED ONLY WHERE IT EXISTS. `49 §5.6`: on a self-host with no SMTP
     `GET /auth/methods` answers `magic: false` "so the screen never offers it". A recovery
     screen offering a link that cannot be sent is worse than one offering nothing. Until the
     host answers, it is not offered: the fallback was the sample's `AUTH_METHODS`. -->
{#if hostAuth?.magic}
  <Section title={copy.magicLink}>
    <p class="hint">{copy.magicHow}</p>
  </Section>
{/if}

<Section title={copy.lockout}>
  <p class="hint">{copy.lockoutHow}</p>
</Section>

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
