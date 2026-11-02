<!--
  "Copy as text": the page's dialect text onto the clipboard, for pasting into an agent.

  IT SAYS COPIED ONLY WHEN THE BROWSER SAID SO. `writeText` refuses without permission or focus, and a
  button that reported success either way would be the "says done, and it did not happen" class of
  fault, so a refusal says so and points at the text address, which works everywhere.

  Drawn once the script has run, like the search: with scripting off the "Open as text" link beside it
  is the same text.
-->
<script lang="ts">
  import { docsWords } from './words.ts';

  let { text }: { text: string } = $props();

  const w = docsWords;

  let live = $state(false);
  $effect(() => {
    live = true;
  });

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

{#if live}
  <button type="button" class="btn quiet sm" onclick={copy}>{w.copy}</button>
  <p class="copy-said" role="status">{said === 'copied' ? w.copied : said === 'failed' ? w.failed : ''}</p>
{/if}

<style>
  /* THE STATUS LINE GOES LAST, under every button in the row, so it never splits the row's buttons. */
  .copy-said {
    order: 1;
    flex-basis: 100%;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-15);
  }

  /* EMPTY, IT TAKES NO LINE: a line of its own under the row, even an empty one, added the row's gap the moment the
     script drew it, and the whole page under the head moved down 8px (a layout shift Lighthouse counted). It stays in
     the page, unseen, so a screen reader still hears "Copied" when the words arrive. */
  .copy-said:empty {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
