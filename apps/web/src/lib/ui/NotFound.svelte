<!--
  An address that leads to nothing on this record: `Empty`'s whole-screen form,
  the kind `no-results`, with Today and Search.

  ONE SCREEN FOR BOTH DOORS A MISTYPED ADDRESS COMES THROUGH. A path that is one segment long reaches `routes/[id]`, the
  spoken-id resolver, before anything else can answer it, and every other unmatched path reaches `+error.svelte` at 404.
  Both draw this, so the answer does not depend on how many slashes were typed.

  NOT AN ALARM. `no-results`, not `error`: nothing failed, a string was typed and it names nothing, which is the same
  class of event as a search with no hits, and `error` would also settle the screen as refused.

  TODAY IS THE WAY ON, SEARCH THE OTHER ONE. "Go to Today" is the primary, because it always leads somewhere; Search
  opens the palette, quiet, for somebody who was looking for something. Signed out, the one way on is "Sign in".

  THE GLYPH IS `globe`, THE APP'S OWN, because its path ships with the app: a glyph from the rest of the set would fetch
  that whole set for the one picture on a screen somebody reached by mistake.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { openPalette } from '../palette/open.svelte.ts';
  import { frame } from '../shell/frame.svelte.ts';

  import Button from './Button.svelte';
  import Empty from './Empty.svelte';
  import Icon from './Icon.svelte';
  import NearLinks from './NearLinks.svelte';
  import type { Place } from '../record/nearest.ts';

  /* This screen's own words, in a `words` object in the module that draws them. */
  const words = {
    title: copy.errorPage.missing,
    /* THE CARD'S LINE WHEN THE BAR ALREADY SAYS THE PAGE'S NAME (ui-perfect, 3 Nov): "No page called xyz" stood in the
       bar and again in the card under it. */
    here: 'Nothing at this address',
    search: 'Search',
    signIn: 'Sign in',
  } as const;

  let {
    title = words.title,
    body,
    near = [],
  }: {
    /** The screen's heading, when the caller knows more than "nothing is here": a number that names no one list. */
    title?: string;
    /** One sentence on what to do next. */
    body?: string | undefined;
    /** The places nearest to what was typed (`record/nearest.ts`), as links over Today and Search. */
    near?: readonly Place[];
  } = $props();

  /* SIGNED OUT is a record that refused who is asking: there is no Today to go to and no record to search. */
  const out = $derived((page.data as { refused?: { code?: string } } | undefined)?.refused?.code === 'UNAUTHORIZED');
  /* SAID ONCE: the bar says the name, so the card says what it means. */
  const shown = $derived(frame.here !== '' && frame.here === title && title !== words.here ? words.here : title);
</script>

<Empty kind="no-results" heading glyph="globe" title={shown} {body}>
  {#snippet actions()}
    {#if out}
      <Button weight="primary" href="/signin">{words.signIn}</Button>
    {:else}
      <NearLinks places={near} said={copy.nearPages} />
      <Button weight="primary" href="/">{copy.errorPage.home}</Button>
      <Button onclick={openPalette}><Icon name="search" size="m" />{words.search}</Button>
    {/if}
  {/snippet}
</Empty>
