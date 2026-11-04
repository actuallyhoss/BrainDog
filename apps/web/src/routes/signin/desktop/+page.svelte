<!--
  `/signin/desktop?code=`: where the Mac app lands after a sign-in finished in the browser (Google, or an emailed link
  handed back), in the app's own window. It swaps the one-time code and the verifier this window kept for the session
  cookie (`lib/desktop-signin.ts`), then opens the app where the window was headed when it began. The code is taken out
  of the address on arrival so it is never in history.

  ON THE ENTRY FRAME, AS SIGN IN IS (`../Entry.svelte`, first F12): the layout draws this bare, so the brand stands where
  it stood on sign in a moment ago. While it works, one status line; when it fails, the error and the way back.

  THE FAILURE IS THIS SCREEN'S OWN ANSWER, NOT A REFUSAL, so it is drawn in the frame's title and line and not as an
  error `Empty`: an `Empty` of kind `error` counts as a refusal of the screen (`ui/screen.svelte.ts`), which outranks the
  `ready` said below, and the gates then read the screen a person lands on without a code as an error card.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { BASE } from '$lib/at.ts';
  import { swapCode, takeKept } from '$lib/desktop-signin.ts';
  import { appPath } from '$lib/shell.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
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
    const { verifier, next } = takeKept();
    if (code === '' || verifier === null || !(await swapCode(code, verifier, location.origin))) {
      failed = true;
      return;
    }
    // A full load so the whole app boots with the new cookie, on the page it was headed to (only a page of the app).
    location.replace(appPath(next ?? undefined) ?? `${BASE}/`);
  });
</script>

<svelte:head><title>{titleOf(words.desktopTitle)}</title></svelte:head>

<Entry>
  {#if failed}
    <!-- THE ANSWER THIS SCREEN EXISTS TO GIVE, drawn in the entry frame's own words as the working line is, and not an
         `Empty` error: that card says the record refused a read, and no read was refused here. A code that did not
         finish is this screen's designed answer, so it settles `ready` and is measured as the screen it is. -->
    <div class="said">
      <h1 class="entry-title">{words.desktopFailed}</h1>
      <p class="entry-lede" role="status">{words.desktopFailedWhy}</p>
      <Button weight="primary" href="/signin">{words.desktopBack}</Button>
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
    line-height: calc(22px * var(--type, 1));
  }

  /* The title, the line and the way back, the button a step further from the words than they are from each other. */
  .said {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .said :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
    margin-block-start: var(--sp-3);
  }
</style>
