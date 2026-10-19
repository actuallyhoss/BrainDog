<!--
  An address that leads to nothing on this record, drawn inside the shell with Search and Home.

  ONE SCREEN FOR BOTH DOORS A MISTYPED ADDRESS COMES THROUGH. A path that is one segment long reaches `routes/[id]`, the
  spoken-id resolver, before anything else can answer it, and every other unmatched path reaches `+error.svelte` at 404.
  They said the same thing in two sets of words with two sets of buttons, and one of them printed the whole address,
  record slug and all, as its title. Both draw this now, so the answer does not depend on how many slashes were typed.

  NOT AN ALARM. `no-results`, not `error`: nothing failed, a string was typed and it names nothing, which is the same
  class of event as a search with no hits. Spending the danger colour on it is how a product teaches people that red
  means nothing in particular, and `error` would also settle the screen as refused.

  SEARCH OPENS THE PALETTE AND HOME GOES HOME. The Search button once went home beside a second button that also went
  home, on the one screen whose whole purpose is that somebody was looking for something.

  THE GLYPH IS `globe`, THE APP'S OWN, because its path ships with the app: a glyph from the rest of the set would fetch
  that whole set for the one picture on a screen somebody reached by mistake.
-->
<script lang="ts">
  import { copy } from '../copy.ts';

  import Button from './Button.svelte';
  import Empty from './Empty.svelte';

  /* This screen's own words, in a `words` object in the module that draws them. */
  const words = {
    title: 'Nothing is at this address',
    body: 'The address may be mistyped, or the page has moved. Go back to Home.',
  } as const;

  let {
    title = words.title,
    body = words.body,
  }: {
    /** The screen's heading, when the caller knows more than "nothing is here": a number that names no one list. */
    title?: string;
    /** One sentence on what to do next. */
    body?: string;
  } = $props();
</script>

<Empty kind="no-results" heading glyph="globe" {title} {body}>
  {#snippet actions()}
    <Button weight="primary" href="/">{copy.errorPage.home}</Button>
  {/snippet}
</Empty>
