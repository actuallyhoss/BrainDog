<!--
  The face, top-right: the person's letter, and under it the records they can open (the one they are in ticked), then
  Settings, then what is theirs as a person: how they sign in, the keyboard keys and Sign out. Settings is also at the sidebar's foot.
-->
<script lang="ts">
  import { BASE, at } from '../at.ts';
  import { shellSignedOut } from '../shell.ts';
  import { copy } from '../copy/frame.ts';
  import { levelWord } from '../record/switcher.ts';
  import Icon from '../ui/Icon.svelte';
  import Menu from '../ui/Menu.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import { frame } from './frame.svelte.ts';

  let { phone = false }: { phone?: boolean } = $props();

  const words = { you: 'You', account: 'Account', keys: 'Keyboard keys', signing: 'Signing in', settings: 'Settings' } as const;
  const name = $derived(frame.person || words.you);
  const others = $derived(frame.records.filter((r) => r.name !== frame.record));

  /* SIGN OUT AT EVERY WIDTH: auth.ts is loaded on the press, and a press that did not end the session leaves
     the page where it is and says so. */
  function signOut(): void {
    void import('../auth.ts')
      /* IN AN APP THAT SIGNS IN ITSELF, native takes it from here (`shellSignedOut`): never the web's sign-in page. */
      .then((m) => m.signOutAndLeave(`${BASE}/signin`, (to) => void (shellSignedOut() || location.assign(to))))
      .then(
        (out) => {
          if (!out.ok) toasts.push(copy.signOutFailed, { intent: 'warn' });
        },
        () => toasts.push(copy.signOutFailed, { intent: 'warn' }),
      );
  }
</script>

<div class="you" data-phone={phone ? '' : undefined}>
  <Menu label={name} align="end">
    {#snippet trigger()}
      <span class="you-hit"><span class="you-face"><span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span><span class="sr-only">{words.account}</span></span></span>
    {/snippet}
    <!-- THE RECORDS: the one you are in, ticked, then the others to open. -->
    {#if frame.record}
      <a class="you-mi" role="menuitem" aria-current="true" href={at('/')}>
        <span class="you-tile" aria-hidden="true">{frame.record.slice(0, 1).toUpperCase()}</span><span class="mi-name">{frame.record}</span>
        <span class="you-tick"><Icon name="check" size="s" /></span>
      </a>
    {/if}
    {#each others as r (r.slug)}
      {@const word = levelWord(r)}
      <button type="button" class="you-mi" role="menuitem" onclick={() => frame.open?.(r)}>
        <span class="you-tile" aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span><span class="mi-name">{r.name}</span>
        {#if word !== null}<span class="you-level">{word}</span>{/if}
      </button>
    {/each}
    {#if frame.refused}<span class="you-mi" role="menuitem" aria-disabled="true">{frame.refused}</span>{/if}
    {#if frame.record || others.length > 0 || frame.refused}<hr />{/if}
    <a class="you-mi" role="menuitem" href={at('/settings')}><Icon name="settings" size="s" />{words.settings}</a>
    <a class="you-mi" role="menuitem" href={at('/settings/signing-in')}><Icon name="key" size="s" />{words.signing}</a>
    <!-- THE KEYS ARE A KEYBOARD'S: a phone is not offered them. -->
    {#if !phone}<button type="button" class="you-mi" role="menuitem" onclick={() => (frame.keys = true)}><Icon name="keyboard" size="s" />{words.keys}</button>{/if}
    <button type="button" class="you-mi" role="menuitem" onclick={signOut}><Icon name="lock" size="s" />{copy.signOut}</button>
  </Menu>
</div>

<style>
  .you {
    flex: none;
  }

  .you :global(.menu-trigger) {
    border-radius: var(--r-round);
  }

  .you-hit {
    display: grid;
    place-items: center;
  }

  .you[data-phone] .you-hit {
    inline-size: var(--tap);
    block-size: var(--tap);
  }

  /* THE FACE: the person's letter in a 32px circle on the control's quiet fill. */
  .you-face {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-page);
    block-size: var(--ctl-page);
    background: var(--g-fill);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    border-radius: var(--r-round);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .you-mi {
    color: var(--ink-2);
    text-decoration: none;
    cursor: pointer;
  }

  .you-mi :global(.icon) {
    color: var(--ink-3);
  }

  /* A RECORD'S TILE: its first letter, ink on the ground's colour, the size of an icon's slot. */
  .you-tile {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    background: var(--ink);
    border-radius: var(--r-xs);
    color: var(--tile);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  .you-tick,
  .you-level {
    margin-inline-start: auto;
    padding-inline-start: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .you-tick {
    display: inline-grid;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
