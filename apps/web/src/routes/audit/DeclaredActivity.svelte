<!--
  Activity as a page the record composes (PGS-C24 job 8), drawn at `/audit?declared` while the screen as it was stays.

  THE PAGE IS THE RECORD'S AND THE DRAWING IS THE ONE READER'S. The record's page `activity` (the seed's `BASE_PAGES`:
  a feed by day with a run's lines folded to one, and Who worked, What changed and Busy hours beside it) is read as any
  installed page is (`pageReader`) and drawn by `PageView` in its page mode, as `/p/activity` draws it. So it is
  arranged with Edit layout, shared, and changed through Change this page like any other page, and an agent proposes a
  change to it the way it proposes one to any page. No tile, chart or line is drawn by this file.

  WHY `PageView` AND NOT `PageBody`, which the composed list draws through. That page is installed nowhere, so its
  writes would land on no address; this one is installed, and its address is `activity`.

  WHERE THE RECORD CANNOT DRAW IT, one sentence (`declaredSays`) and the way back to the screen that works. Fetched by
  `+page.svelte` only when the address asks for it, so the screen as it was never loads this or what it imports.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import PageView from '$lib/page/PageView.svelte';
  import { pageReader, type PageReader } from '$lib/record/page-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { classicHref, declaredSays, PAGE, words, type Drawn } from './declared.ts';

  let got = $state.raw<Drawn | null>(null);
  let reader: PageReader | null = null;
  /** Each read's turn, so an answer that lands after a newer read is dropped rather than drawn over it. */
  let started = 0;
  /** A re-read still out, so the record moving under the page does not read it a second time meanwhile. */
  let own = 0;

  async function read(): Promise<Drawn> {
    try {
      reader ??= pageReader(apiBase());
      return await reader.read(PAGE);
    } catch {
      return { from: 'none' };
    }
  }

  /* READ ONCE WHEN THE PAGE OPENS, bracketed as every screen's read is, so `data-screen` waits for the answer. */
  $effect(() => {
    untrack(() => {
      const mark = opened();
      const mine = ++started;
      void read().then((out) => {
        if (mine === started) got = out;
        closed(out.from === 'live' || out.from === 'missing', mark);
      });
    });
  });

  /** After a write, or when the record moved: read again in place, and kept as drawn where the record now says no. */
  async function reread() {
    own += 1;
    const mine = ++started;
    try {
      const out = await read();
      if (mine === started && out.from === 'live') got = out;
    } finally {
      own -= 1;
    }
  }

  /* THE RECORD MOVED UNDER THE PAGE: an agent wrote, so the feed has a new line. Read again without blanking it, and
     never while a card's write is still out (`aria-busy`), whose answer would move the card from under the finger. */
  listen(
    () => reread(),
    () => own > 0 || document.querySelector('main [aria-busy="true"]') !== null,
  );

  const says = $derived(declaredSays(got));
  const back = $derived(classicHref(route.url));

  $effect(() => {
    if (got !== null && got.from !== 'refused') drew('ready');
  });
</script>

{#if says !== null}
  <!-- THE RECORD CANNOT DRAW THE PAGE: one sentence, and the screen that works one press away. -->
  <div class="declared-said">
    <Empty kind="error" heading title={says}>
      {#snippet actions()}<Button href={back}>{words.back}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <!-- Bars while the read is out (`got` is `null`), then the page: its name at 28px and its own sentence under it. -->
  <PageView slug={PAGE} got={got?.from === 'live' ? got : null} {reread} />

  <!-- THE WAY BACK, one quiet line under the page: the same address without the one key. -->
  <p class="declared-back">
    <span>{words.trying}</span>
    <a href={at(back)}>{words.back}</a>
  </p>
{/if}

<style>
  .declared-said {
    padding: var(--sp-5) var(--gutter) var(--sp-4);
    max-inline-size: calc(var(--measure) + 2 * var(--gutter));
  }

  /* ONE LINE, IN THE PAGE'S OWN GUTTER, quieter than anything above it and still body size. */
  .declared-back {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-4) var(--gutter) var(--sp-8);
    padding-inline-end: max(var(--gutter), var(--dock-w, 0px));
    color: var(--ink2);
    font-size: var(--t-base);
  }

  @media (pointer: coarse) {
    .declared-back a {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }
</style>
