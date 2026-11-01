<!--
  Settings > Recovery: the passkeys that get you back in, and the ways in without one.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { copy } from '$lib/copy.ts';
  import { signinFor } from '$lib/at.ts';
  import { page } from '$app/state';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { passkeyRegister, platformLabel, removePasskey, support } from '$lib/auth.ts';
  import { since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  /* `part` (G4): Signing in draws the passkeys as a tile and the ways back in inside its You tile, bare. */
  let { shell, part }: AreaProps & { part?: 'passkeys' | 'back' | undefined } = $props();

  /* THIS AREA'S OWN WORDS: the group the ways back in sit under. */
  const words = {
    wayBack: 'Getting back in',
    /* ONE SENTENCE FOR THE EMPTY TILE (first table): what is missing and what it costs, where a mailed link exists. */
    noPasskey: (magic: boolean) => (magic ? 'No passkey yet. Without one, an email link is your only way back in.' : copy.noPasskeys),
  };

  /* THE HOST'S ANSWER ABOUT SIGNING IN IS SHARED with Identity, where signing out changes it
     (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const hostAuth = $derived(s.hostAuth);
  const liveKeys = $derived(s.liveKeys);

  const webauthnHere = support();
  let addingKey = $state(false);
  let addSaid = $state<string | null>(null);
  /* THE NAME IS ASKED BEFORE THE KEY IS MADE, with the device's own as the default, so a passkey is not made
     under one name and renamed in Identity afterwards. Left blank, the device's name is used. */
  let typedName = $state(platformLabel());
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
    const out = await passkeyRegister(undefined, typedName.trim() || platformLabel());
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
{#if part === 'back'}
  <!-- NO PASSKEYS HERE: this part is the ways back in alone. -->
{:else if livePasskeys}
  <!-- THE HOST'S OWN PASSKEYS, for somebody signed in to a host that offers them. Adding one is
       real only here, because only a live session can say whose passkey it is. -->
  <Tile icon="key" class="section" data-surface="tile" id="passkeys" title={copy.passkeys} count={(liveKeys?.length ?? 0) || undefined}>
    <div class="section-body">
      <p class="hint">{copy.passkeyHow}</p>
      {#if liveKeys === null}
        <p class="hint">{copy.passkeysUnread}</p>
      {:else if liveKeys.length === 0}
        <Empty kind="no-data-yet" title={words.noPasskey(livePasskeys.magic !== false)} body={livePasskeys.magic !== false ? undefined : copy.noPasskeysWhy(false)} />
      {:else}
        <ul class="ledger ledger-lead">
          {#each liveKeys as k (k.id)}
            <li in:lineIn out:dismiss animate:flip={settle()}>
              <div class="line line-tall">
                <span class="line-mark"><IconWell name="key" size="l" /></span>
                <span class="line-main">
                  <span class="line-title">{k.label ?? copy.passkeyUnnamed}</span>
                  <span class="line-detail"
                    >{copy.addedWhen(since(new Date(k.createdAt).toISOString()))} · {k.lastUsed
                      ? copy.usedWhen(since(new Date(k.lastUsed).toISOString()))
                      : copy.neverUsed}</span
                  >
                </span>
                <span class="line-amount"></span>
                <span class="line-when">
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
        <label class="name-label" for="recovery-key-name">{copy.identityPasskeyNameLabel}</label>
        <span class="field name-field">
          <input class="field-input" id="recovery-key-name" type="text" autocomplete="off" maxlength="64" bind:value={typedName} disabled={addingKey} />
        </span>
        <div class="row-actions">
          <Button weight="primary" onclick={addLivePasskey} aria-busy={addingKey}
            ><Icon name="plus" size="s" />{addingKey ? copy.addingPasskey : copy.addPasskey}</Button
          >
        </div>
      {/if}
      {#if addSaid}<p class="hint" role="status">{addSaid}</p>{/if}
    </div>
  </Tile>
{:else if hostAuth}
<!-- NOBODY SIGNED IN, OR A HOST THAT OFFERS NO PASSKEYS, AND NO LIST OF KEYS NOBODY MADE.
     This arm drew the sample's `PASSKEYS`, two keys on two devices that never existed, with a
     Remove that said what it would have done. What is true where the host has answered and
     there is no session to list keys for is that there is no passkey here, and how that
     person gets back in without one, which the host's own `magic` decides. There is no "Add
     a passkey": without a session there is nobody to add one for. -->
<!-- AND THE WAY TO ONE, WHERE THE HOST OFFERS PASSKEYS AND NOBODY IS SIGNED IN. There is
     still nobody to add a passkey for, so the action is signing in, which lands back here with
     "Add a passkey" drawn by the arm above. A host that offers no passkeys is offered nothing. -->
<Tile icon="key" class="section" data-surface="tile" title={copy.passkeys}>
  <div class="section-body">
    <p class="hint">{copy.passkeyHow}</p>
    <Empty
      kind="no-data-yet"
      title={words.noPasskey(hostAuth.magic !== false)}
      body={hostAuth.magic !== false ? undefined : copy.noPasskeysWhy(false)}
      actions={hostAuth.passkey && !hostAuth.me ? signInToAdd : undefined}
    />
  </div>
</Tile>
{/if}

{#snippet signInToAdd()}
  <Button href={signinFor(page.url)}>{copy.addPasskey}</Button>
{/snippet}

<!-- THE WAYS BACK IN, IN THE ORDER THEY ARE NEEDED: one passkey lost, all of them lost, and too many tries. -->
{#snippet wayBack()}
    <!-- WHAT A LOST PASSKEY COSTS, said before it happens. The last passkey cannot be removed from this screen (above),
         and the host allows it on purpose (`passkey.remove`, "the last one included"), so a person who signs in by the
         mailed link can still clear a key they lost. The sentence names that way when this host sends mail, and the
         person who runs the host as the last resort either way, because there is no recovery code to offer. -->
    {#if livePasskeys}
      <StateRow icon="key" title={copy.passkeyLost} line={shell.host === 'self-host' && s.anOwner ? copy.passkeyLostSelfHost : copy.passkeyLostHow(livePasskeys.magic !== false)} />
    {/if}
    <!-- AND THE ONE THAT IS OFFERED ONLY WHERE IT EXISTS. `49 §5.6`: on a self-host with no SMTP
         `GET /auth/methods` answers `magic: false` "so the screen never offers it". A recovery
         screen offering a link that cannot be sent is worse than one offering nothing. Until the
         host answers, it is not offered: the fallback was the sample's `AUTH_METHODS`. -->
    {#if hostAuth?.magic}
      <StateRow icon="link" title={copy.magicLink} line={copy.magicHow} />
    {/if}
    {#if part === 'back'}
      <!-- ONE FACT, ONE LINE (G4): it was a tile of its own with a heading, a row and a title over one sentence. -->
      <p class="lockout-line">{copy.lockoutHow}</p>
    {:else}
      <StateRow icon="clock" title={copy.lockout} line={copy.lockoutHow} />
    {/if}
{/snippet}
{#if part === 'back'}
  {@render wayBack()}
{:else if part !== 'passkeys'}
<Tile icon="clock" class="section" data-surface="tile" title={words.wayBack}>
  <div class="section-body">{@render wayBack()}</div>
</Tile>
{/if}

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .name-label {
    display: block;
    margin-block: var(--sp-3) var(--sp-1);
    font-size: var(--fs-body);
  }

  .name-field {
    display: flex;
    max-inline-size: 24rem;
  }

  /* 16px TEXT IN THE INPUT, as Identity's, so a phone never zooms into the field. */
  .name-field .field-input {
    flex: 1;
    min-inline-size: 0;
    font-size: var(--fs-body);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ON A PHONE "Add a passkey" IS A FULL-WIDTH ROW AT THE TOUCH HEIGHT, as every area's buttons are. */
  @media (width < 640px) {
    .row-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .row-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }

  .lockout-line {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }
</style>
