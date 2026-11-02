<!--
  "Copy as text": the page's dialect text onto the clipboard, for pasting into an agent, followed by the page's other
  ways to take it as text (its `children`) and then the line that says what happened.

  IT SAYS COPIED ONLY WHEN THE BROWSER SAID SO. `writeText` refuses without permission or focus, and a
  button that reported success either way would be the "says done, and it did not happen" class of
  fault, so a refusal says so and points at the text address, which works everywhere.

  IN THE HTML FROM THE FIRST PAINT, so "Open as text" beside it never moves when the script runs (polish, 2 November:
  the button and its line arrived with the script, and the line took a row of its own between the two buttons). With
  scripting off a `<noscript>` rule takes the button away, and the "Open as text" link beside it is the same text.
  The line is the last thing in the row, after every button, and takes no room until it has something to say.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { docsWords } from './words.ts';

  let { text, children }: { text: string; children?: Snippet } = $props();

  const w = docsWords;

  let busy = false;
  let said = $state<'copied' | 'failed' | null>(null);

  async function copy() {
    if (busy) return;
    busy = true;
    try {
      await navigator.clipboard.writeText(text);
      said = 'copied';
    } catch {
      said = 'failed';
    } finally {
      busy = false;
    }
  }
</script>

<noscript>
  <style>
    button[data-copy-text] { display: none !important; }
  </style>
</noscript>

<button type="button" class="btn quiet sm" data-copy-text onclick={copy}>{w.copy}</button>
{@render children?.()}
<p class="copy-said" role="status">{said === 'copied' ? w.copied : said === 'failed' ? w.failed : ''}</p>

<style>
  .copy-said {
    flex-basis: 100%;
    margin: 0;
    color: var(--muted);
    font-size: var(--t-label);
  }

  /* NOTHING TO SAY YET: out of the row, so it adds no gap, and still in the page for the reader that listens to it. */
  .copy-said:empty {
    position: absolute;
  }
</style>
