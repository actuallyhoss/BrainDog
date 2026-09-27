<!--
  A shared page's address, `/s/<token>`, and what it says while no record answers a share.

  A SHARE LINK IS A CAPABILITY URL, and the design is settled: signed, read-only, scoped to one page, terminally
  revocable, drawn at `me.level = read` with NO NAV AND NO PALETTE, and a real path rather than a hash so a server can
  check the token (19 §5). What does not exist yet is the read. No record answers a share token, no scheme authorises
  one, and nothing turns a token into a record's page.

  SO THIS SCREEN DREW THE SAMPLE. One token was written into this file, `9f2a7c41d8b3`, and it opened the sample's Money
  page with "Shared from The Studio" under the title and a note saying it was an example; every other token drew the
  revoked state. A stranger opening a link was shown a business that does not exist (DIRECTION 26). The sample's page
  reader is a test fixture now (`fixtures/readers.ts`), so no token opens a page, and the screen says that rather than
  saying a link was revoked that never opened anything. The page comes back with the read that answers a token.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen from a shell that has
   * fetched nothing. A screen that starts fetching brackets its reads with `opened()` and `closed()` instead.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf('Shared')}</title></svelte:head>

<div class="shared">
  <header class="bar">
    <a class="brand" href={at('/')}>
      <Mark height={22} />
      <span class="wordmark">{copy.product}</span>
    </a>
    <span class="chip">Shared · read only</span>
  </header>

  <!-- NO ACTION. The revoked state offered Request access, which toasted what would have been asked and asked nobody:
       a control whose only answer is that it did nothing is not drawn. -->
  <Empty kind="no-permission" heading title="This link does not open a page" body="No record answers a shared link yet, so there is nothing here to read." />
</div>

<style>
  .shared {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding: var(--sp-5);
  }

  /* No rule under the bar: the space before the title is what separates the two. */
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  /* 114x26 on a phone. It is a link out of a SHARED page — the one screen somebody arrives at from
     a message, on a device they are holding — so it is the first target a stranger to this product
     ever tries. `13 §7`'s 44 on both axes. */
  .brand {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    gap: 9px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    padding: 2px var(--sp-3);
    background: var(--sunk);
    border-radius: var(--r-pill);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
