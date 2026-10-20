<!--
  `/signin/desktop?code=`: where the Mac app lands after Google, in the app's own window. It swaps the one-time code
  and the verifier this window kept for the session cookie (`lib/desktop-signin.ts`), then opens the app. The code is
  taken out of the address on arrival so it is never in history.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { BASE } from '$lib/at.ts';
  import { swapCode, takeVerifier } from '$lib/desktop-signin.ts';
  import { drew } from '$lib/ui/screen.svelte.ts';

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

<svelte:head><title>Signing in</title></svelte:head>

<!-- A SECTION AND NOT A SECOND `main`: the shell's `<main id="main">` is the page's one main landmark. -->
<section style="padding: 4rem 1rem; text-align: center">
  <h1>Signing in</h1>
  {#if failed}
    <p role="status">That sign-in did not finish. It may have timed out.</p>
    <p><a class="tap" href="{BASE}/signin">Back to sign in</a></p>
  {:else}
    <p role="status">Signing you in...</p>
  {/if}
</section>
