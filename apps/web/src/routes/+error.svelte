<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { rid } from '$lib/data/call.ts';

  /* MINTED ONCE, WHEN THIS SCREEN EXISTS, and not on every render. The id names one failure; a
     `$derived` would hand a person a different string each time something on the page changed,
     which is the one way to make a quotable id worse than none. */
  const requestId = rid();
</script>

<div class="page">
  <!--
    ONE SENTENCE IN THE HOUSE VOICE, AND IT WAS TWO. `page.error.message` is SvelteKit's string and
    not this product's: on a 404 it is the literal `Not Found`, so a mistyped URL read "There is
    nothing at /moneyy." and then "Not Found" underneath it — the same fact twice, the second time in
    the framework's words. On a thrown error it is whatever a developer typed into `error()`, which
    is the stack trace the comment here used to promise it never showed.

    AND A MISTYPED URL IS NOT AN ALARM. `/[id]` answers the identical event with `no-results` and
    says why: spending the alarm colour on "you typed an id that does not exist" is how a product
    teaches people that red means nothing in particular. Two not-found screens, one colour now.

    THE REQUEST ID BELONGS TO THE FAILURE AND NOT TO THE TYPO. The client mints an `X-Request-Id` on
    every call and the host echoes and logs it (19 §6) — there is nothing to look up for a path
    that was never a route.
  -->
  {#if page.status === 404}
    <Empty kind="no-results" glyph="globe" title={`There is nothing at ${page.url.pathname}.`}>
      {#snippet actions()}
        <Button weight="primary" href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  {:else}
    <!-- AND THE ONE ID IN THE PRODUCT THAT IS REAL. `50 §2.5` mints it client-side — ten base32
         characters from `crypto.getRandomValues` — and sends it as `X-Request-Id` so both hosts can
         echo and log it. It was the literal `r7k2m9qd4x` at eight call sites, identical on every
         screen that could fail: two different failures quoting one id, and an id that identifies
         nothing is the worst thing to put on an error screen, because it is the one string there
         that has to mean something. Seven of those eight sites were not failures at all and no
         longer offer one. -->
    <Empty kind="error" title={copy.screenFailed} body={copy.screenFailedBody} rid={requestId}>
      {#snippet actions()}
        <Button weight="primary" onclick={() => location.reload()}>{copy.tryAgain}</Button>
        <Button href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  {/if}
</div>

<style>
  .page {
    padding: var(--sp-6) var(--sp-5);
    max-inline-size: 900px;
  }
</style>
