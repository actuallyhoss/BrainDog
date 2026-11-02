<!--
  The close of an inner page (the redo of 2 November): one tile on the board, the early access line at its start and
  the start button at its end; on a phone the line, then the button at the full width. The page's one red. The home
  page has none: its Free section is its last ask.
-->
<script lang="ts">
  import { shell } from '../copy/shell.ts';
  import Start from './Start.svelte';
</script>

<section class="section close" aria-label={shell.early.strong}>
  <div class="wrap">
    <div class="tile lead strip">
      <p><b>{shell.early.strong}</b> {shell.early.rest}</p>
      <div class="go"><Start /></div>
    </div>
  </div>
</section>

<style>
  .strip {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4) var(--sp-6);
  }

  p {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-17);
    line-height: 1.5;
  }

  b {
    color: var(--ink);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .strip {
      flex-direction: column;
      align-items: stretch;
    }

    .go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
