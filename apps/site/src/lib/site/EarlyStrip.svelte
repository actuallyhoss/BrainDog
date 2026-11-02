<!--
  The close of an inner page: one slim strip on the paper, the early access line on the left and the start
  button on the right; on a phone the line, then the button at full width. It replaced the huge centred close, which
  said the page's recap again. The home page has none: its free tile is its last ask.
-->
<script lang="ts">
  import { shell } from '../copy/shell.ts';
  import Start from './Start.svelte';
</script>

<section class="early" aria-label={shell.early.strong}>
  <div class="wrap strip">
    <p><b>{shell.early.strong}</b> {shell.early.rest}</p>
    <div class="go"><Start /></div>
  </div>
</section>

<style>
  .early {
    background: var(--paper);
    color: var(--ink);
  }

  .strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    min-block-size: 120px;
  }

  p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-17);
    line-height: 1.5;
  }

  b {
    color: var(--ink);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .strip {
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      padding-block: 32px;
    }

    .go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
