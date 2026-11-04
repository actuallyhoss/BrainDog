<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { SUPPORT_EMAIL } from '$lib/copy/shell.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import NotFound from '$lib/ui/NotFound.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { titleOf } from '$lib/title.ts';

  /* WHICH FAILURE THIS IS decides the one line and the one button. A failed fetch has no status of its own, so the
     browser saying it is offline outranks it; a 429 may carry the seconds to wait as `retry_after`. */
  const words = copy.errorPage;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wait = Math.max(1, Math.ceil(Number((page.error as { retry_after?: unknown } | null)?.retry_after) || 30));
  const said = $derived(
    offline ? words.offline : page.status === 429 ? words.wait(wait) : page.status === 503 ? words.rolling : words.broken,
  );
  const stuck = $derived(said === words.broken);

  /* THE PAGE'S NAME IS THE FAILURE, SO THE CARD UNDER IT SAYS THE NEXT THING (UI pass, 3 Nov): the bar and the card both
     said "No page here", and "This screen did not load" twice. The card's line is what follows from the name. */
  const missingWhy = 'The address may have a typo, or the page is gone.';
</script>

<!-- A TAB AND A SCREEN READER ARE TOLD WHERE THEY ARE, HERE TOO: a page that failed in its load left the title empty. -->
<svelte:head><title>{titleOf(page.status === 404 && !offline ? words.missing : said.title)}</title></svelte:head>

<!-- THE PHONE'S BAR, with the mark, the bell and the face, over the page's own words; on a desk the crumb says it. -->
<PageHead title={page.status === 404 && !offline ? words.missing : said.title} headless />
<div class="page">
  <!--
    ONE SENTENCE IN THE HOUSE VOICE, AND IT WAS TWO. `page.error.message` is SvelteKit's string and
    not this product's: on a 404 it is the literal `Not Found`, so a mistyped URL read "There is
    nothing at /moneyy." and then "Not Found" underneath it — the same fact twice, the second time in
    the framework's words. On a thrown error it is whatever a developer typed into `error()`, which
    is the stack trace the comment here used to promise it never showed.

    A MISTYPED URL IS NOT AN ALARM, AND IT IS ONE SCREEN WHICHEVER DOOR IT CAME THROUGH. `/[id]`
    catches every one-segment address and this catches the rest, and they drew two different
    not-found screens; both draw `NotFound` now, with Search and Home. The address is not its
    title any more: under `/<record>/` it printed the record's slug to a person who typed a
    page name.

    THE REQUEST ID BELONGS TO THE FAILURE AND NOT TO THE TYPO. The client mints an `X-Request-Id` on
    every call and the host echoes and logs it (19 §6); there is nothing to look up for a path
    that was never a route.
  -->
  {#if page.status === 404 && !offline}
    <NotFound title={missingWhy} />
  {:else}
    <!-- NO REQUEST ID HERE: it was a ten-character string a person could do nothing with. The Worker still logs one per call. -->
    <Empty kind="error" heading title={said.body}>
      {#snippet actions()}
        <Button weight="primary" onclick={() => location.reload()}>{said.action}</Button>
        <!-- THE OTHER WAY ON (first F13): a page that will not load is not the only place to be. -->
        <Button href="/">{words.home}</Button>
      {/snippet}
    </Empty>
    {#if stuck}<p class="stuck">{words.stuck(SUPPORT_EMAIL)}</p>{/if}
  {/if}
</div>

<style>
  /* ON THE GROUND AND NOTHING ELSE, as the spoken-id resolver's not-found is (`[id]/+page.svelte`): the page's gutter,
     12 from the top of the work where a title row would stand, and `Empty` keeping its own words to the measure. No
     tile: a failure is a sentence, its request id and the two ways on, not a card. */
  .page {
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }
  /* Support, only under the failure a retry cannot mend; the muted text token and the page's own measure. */
  .stuck {
    margin: var(--sp-4) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    max-width: 40ch;
  }
</style>
