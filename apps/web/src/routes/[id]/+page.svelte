<!--
  The spoken-id resolver: `/D41`, `/SG31`, `/tasks#7`.

  Resolved by the SHELL, not by a server 302 — no server renders a request here (50 §13 D17). It
  calls `get({ spoken })` and replaces the address with the canonical one, so Back does not bounce.

  `brain.dog/D41` is a sentence one person can say to another and a string an agent can emit with no
  lookup. It is the cheapest legibility win available (19 §5).

  The one exception is the display default `#`: `#125` NEVER resolves bare, because every register
  has a `#1`. Type `tasks#125`.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { openPalette } from '$lib/palette/open.svelte.ts';
  import { DECIDED, QUESTIONS, REGISTERS, entry } from '$lib/record/api.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  const raw = $derived(decodeURIComponent(page.params.id ?? ''));

  const target = $derived.by(() => {
    // A prefixed spoken id: D41, SG31, LN7.
    if (/^[A-Za-z]{1,3}\d+$/.test(raw)) {
      const id = raw.toUpperCase();
      if ([...QUESTIONS, ...DECIDED].some((q) => q.id === id)) return `/decide/${id}`;
      return null;
    }
    // A qualified row: tasks#125.
    const q = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(raw);
    if (q && REGISTERS[q[1]!] && entry(q[1]!, Number(q[2]))) return `/r/${q[1]}/${q[2]}`;
    return null;
  });

  const bare = $derived(/^#?\d+$/.test(raw));

  onMount(() => {
    if (target) goto(target, { replaceState: true });
  });

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(target ? raw : `Nothing answers to “${raw}”`)}</title></svelte:head>

{#if !target}
  <div class="page">
    <!-- `no-results`, not `error`. Nothing failed here — a string was typed and it does not name a
         row, which is the same class of event as a search with no hits. `error` paints the heading
         in `danger`, and spending the alarm colour on "you typed an id that doesn't exist" is how a
         product teaches people that red means nothing in particular. There is a `rid` on it because
         the resolver did make a call, and a request id is free to keep. -->
    <Empty
      kind="no-results"
      heading
      title={bare ? `“${raw}” could be in any of your lists.` : `Nothing answers to “${raw}”.`}
      body={bare
        ? 'Every list has a #1, so a number on its own does not say which. Put the list in front of it: obligations#4, or tasks#7.'
        : 'An id is a list and a number, like obligations#4, or the short code a thing was given, like SG31.'}
    >
      <!-- IT SAID `Search` AND WENT HOME, beside a second button that also went home. Two controls,
           one behaviour, and the one with the magnifying glass was named for something it did not
           do — on the screen whose whole purpose is that somebody was looking for something. -->
      {#snippet actions()}
        <Button weight="primary" onclick={openPalette}><Icon name="search" size="s" />{copy.search}</Button>
        <Button href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  </div>
{/if}

<style>
  .page {
    padding: var(--sp-8) var(--sp-6);
    max-inline-size: 900px;
  }
</style>
