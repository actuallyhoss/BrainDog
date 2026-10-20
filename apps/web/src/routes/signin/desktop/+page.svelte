<!--
  `/signin/desktop?code=`: where the Mac app lands after Google, in the app's own window. It swaps the one-time code
  and the verifier this window kept for the session cookie (`lib/desktop-signin.ts`), then opens the app. The code is
  taken out of the address on arrival so it is never in history.

  ON THE ENTRY FRAME, AS SIGN IN IS (`../Entry.svelte`, first F12): the layout draws this bare, so the brand stands where
  it stood on sign in a moment ago. While it works, one status line; when it fails, the error and the way back.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { BASE } from '$lib/at.ts';
  import { swapCode, takeVerifier } from '$lib/desktop-signin.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import Entry from '../Entry.svelte';
  import { words } from '../words.ts';

  let failed = $state(false);

  /* THE SCREEN HAS DRAWN WHEN IT SAYS THE SIGN-IN DID NOT FINISH; while it swaps the code it is still on its way. */
  $effect(() => {
    if (failed) drew('ready');
  });

  onMount(async () => {
    const code = new URLSearchParams(location.search).get('code') ?? '';
    history.replaceState(null, '', location.pathname);
    const verifier = takeVerifier();
    if (code === '' || verifier === null || !(await swapCode(code, verifier, location.origin))) {
      failed = true;
      return;
    }
    // A full load so the whole app boots with the new cookie.
    location.replace(`${BASE}/`);
  });
</script>

<svelte:head><title>{titleOf(words.desktopTitle)}</title></svelte:head>

<Entry>
  {#if failed}
    <div class="said">
      <Empty kind="error" heading title={words.desktopFailed} body={words.desktopFailedWhy}>
        {#snippet actions()}<Button weight="primary" href="/signin">{words.desktopBack}</Button>{/snippet}
      </Empty>
    </div>
  {:else}
    <div class="working">
      <h1 class="entry-title">{words.desktopTitle}</h1>
      <p class="status" role="status">{words.desktopWorking}</p>
    </div>
  {/if}
</Entry>

<style>
  .working {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .status {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* `Empty` stands in the sheet with no tile of its own, and the sheet's padding is its padding. */
  .said :global(.empty) {
    padding: 0;
    background: none;
  }

  .said :global(.empty-actions) {
    align-self: stretch;
  }

  .said :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
  }
</style>
