<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { SUPPORT_EMAIL } from '$lib/copy/shell.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import NotFound from '$lib/ui/NotFound.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { titleOf } from '$lib/title.ts';
  import { reloadOnce, reloading } from '$lib/data/chunk-fail.ts';

  /* WHICH FAILURE THIS IS decides the one line and the one button. A failed fetch has no status of its own, so the
     browser saying it is offline outranks it; a 429 may carry the seconds to wait as `retry_after`. */
  const words = copy.errorPage;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wait = Math.max(1, Math.ceil(Number((page.error as { retry_after?: unknown } | null)?.retry_after) || 30));
  const said = $derived(
    offline ? words.offline : page.status === 429 ? words.wait(wait) : page.status === 503 ? words.rolling : words.broken,
  );
  const stuck = $derived(said === words.broken);
  const missing = $derived(page.status === 404 && !offline);

  /* A MISSING PAGE'S NAME IS THE FAILURE, SO THE CARD UNDER IT SAYS THE NEXT THING (UI pass, 3 Nov): the bar and the
     card both said "No page here". The card's line is what follows from the name. */
  const missingWhy = 'The address may have a typo, or the page is gone.';

  /* ANY OTHER FAILURE IS SAID WHOLE IN THE CARD, its name and its line (24 November), and the bar says only where you
     are: on a place of the rail it said "Today" over a card reading "Nothing was changed.", which named no failure at
     all, and elsewhere it said the failure's name over the card's. The tab still names it. */
  const barTitle = $derived(missing ? words.missing : '');

  /* A FILE OF THE APP'S OWN CODE THAT DID NOT ARRIVE (`page.error.chunk`, `hooks.client.ts`) RELOADS THE PAGE ONCE, onto
     the address it failed at, and nothing is drawn meanwhile: the person sees the page arrive, not a failure flash before
     it. Nor while a reload a lazy block asked for is on its way. A second failure inside 30 seconds is drawn
     (`chunk-fail.ts`). Read in the render, so the decision is made before anything is drawn. */
  const quiet = $derived(reloading() || (page.error?.chunk === true && reloadOnce(page.url)));
</script>

<!-- A TAB AND A SCREEN READER ARE TOLD WHERE THEY ARE, HERE TOO: a page that failed in its load left the title empty. -->
<svelte:head>{#if !quiet}<title>{titleOf(missing ? words.missing : said.title)}</title>{/if}</svelte:head>

{#if !quiet}
  <!-- THE PHONE'S BAR, with the mark, the bell and the face, over the page's own words; on a desk the crumb says it. -->
  <PageHead title={barTitle} headless />
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
    {#if missing}
      <NotFound title={missingWhy} />
    {:else}
      <!-- NO REQUEST ID HERE: it was a ten-character string a person could do nothing with. The Worker still logs one per call. -->
      <Empty kind="error" heading title={said.title} body={said.body || undefined}>
        {#snippet actions()}
          <!-- A WHOLE RELOAD, NEVER A SECOND NAVIGATION: a file of the app's code that failed stays failed in this
               document's module map, so only a new document can fetch it again. -->
          <Button weight="primary" onclick={() => location.reload()}>{said.action}</Button>
          <!-- THE OTHER WAY ON (first F13): a page that will not load is not the only place to be. After a file that did
               not arrive, Today is loaded whole too, for the same reason. -->
          <Button href="/" data-sveltekit-reload={page.error?.chunk ? '' : undefined}>{words.home}</Button>
          <!-- SUPPORT, IN THE CARD UNDER ITS TWO WAYS ON and centred with them, only under the failure a retry cannot
               mend. It sat under the card at the page's start edge. -->
          {#if stuck}<p class="stuck">{words.stuck(SUPPORT_EMAIL)}</p>{/if}
        {/snippet}
      </Empty>
    {/if}
  </div>
{/if}

<style>
  /* ON THE GROUND, as the spoken-id resolver's not-found is (`[id]/+page.svelte`): the page's gutter, 12 from the top of
     the work where a title row would stand, and `Empty` drawing the one tile with everything the failure says in it. */
  .page {
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }
  /* Support: a line of its own across the card's action row, 8 under the buttons, in the muted ink at the meta size. */
  .stuck {
    flex-basis: 100%;
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-align: center;
  }
</style>
