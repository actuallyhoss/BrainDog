<!--
  The face (frame A, 23 October): the person's letter, and under it Settings, the keyboard keys and Sign out. It no
  longer opens a list of everything: the sidebar holds what you own, the bar where you go.
-->
<script lang="ts">
  import { BASE, at } from '../at.ts';
  import { copy } from '../copy/frame.ts';
  import Icon from '../ui/Icon.svelte';
  import Menu from '../ui/Menu.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import { frame } from './frame.svelte.ts';

  let { phone = false }: { phone?: boolean } = $props();

  const words = { you: 'You', account: 'Account', keys: 'Keyboard keys' } as const;
  const name = $derived(frame.person || words.you);

  /* SIGN OUT AT EVERY WIDTH (LCH-A04): auth.ts is loaded on the press, and a press that did not end the session leaves
     the page where it is and says so. */
  function signOut(): void {
    void import('../auth.ts')
      .then((m) => m.signOutAndLeave(`${BASE}/signin`))
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
    <a class="you-mi" role="menuitem" href={at('/settings')}><Icon name="settings" size="s" />{copy.settings}</a>
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
    inline-size: 32px;
    block-size: 32px;
    background: var(--tile-2);
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

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
