<!--
  One line or snippet a reader copies: a label, the text in a panel, and a copy button.

  THE PANEL SCROLLS INSIDE ITSELF AND NOTHING ELSE DOES. A curl line is longer than a phone is wide,
  and wrapping it would put a line break in the middle of a command somebody pastes, so the text
  keeps its lines and the `pre` scrolls sideways within the page's gutter. It takes focus for that
  reason: a region that scrolls has to be reachable from the keyboard.

  IT SAYS COPIED ONLY WHEN THE BROWSER SAID SO, for the reason `lib/docs/CopyText.svelte` gives:
  `writeText` refuses without permission or focus, and a button reporting success either way would
  claim something that did not happen. The button is drawn once the script has run, because with
  scripting off it could do nothing and the text can still be selected.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';

  let { label, code }: { label: string; code: string } = $props();

  const w = site.agents.copy;

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
      await navigator.clipboard.writeText(code);
      said = 'copied';
    } catch {
      said = 'failed';
    } finally {
      busy = false;
    }
  }
</script>

<div class="code">
  <div class="code-head">
    <span class="code-label">{label}</span>
    {#if live}
      <span class="code-said" role="status">{said === 'copied' ? w.copied : said === 'failed' ? w.failed : ''}</span>
      <button type="button" class="btn btn-sm code-copy" aria-label={`${w.label}: ${label}`} onclick={copy}>{w.label}</button>
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre class="code-text" tabindex="0" role="region" aria-label={label}><code>{code}</code></pre>
</div>

<style>
  /* `min-inline-size: 0` so a long line scrolls in the panel rather than widening whatever grid holds it. */
  .code {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .code-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .code-label {
    flex: 1;
    min-inline-size: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    overflow-wrap: anywhere;
  }

  .code-copy {
    flex: none;
  }

  /* THE TILE'S SECOND FILL, as a key cap and a field are (the design system), in ink and the mono face: a panel inside a tile,
     never a tile of its own and never a dark slab dropped into a light one. */
  .code-text {
    margin: 0;
    padding: 12px 14px;
    overflow-x: auto;
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    line-height: 1.6;
    white-space: pre;
  }

  .code-text code {
    font: inherit;
  }

  /* BESIDE THE BUTTON, so an empty status takes no line under every panel on the page. */
  .code-said {
    min-inline-size: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
    text-align: end;
    overflow-wrap: anywhere;
  }

  /* 44 BY 44 UNDER A THUMB AT ANY WIDTH, and on a phone whatever the pointer says: `.btn-sm` does not
     grow with the pointer, and the copy button is the one control on each panel. */
  @media (pointer: coarse), (width < 900px) {
    .code-copy {
      min-block-size: var(--tap);
      min-inline-size: var(--tap);
    }
  }
</style>
