<!--
  The close of an inner page: one slim strip on the paper with the start button in the middle, at full width on a phone.
  It replaced the huge centred close, which said the page's recap again. The home page has none: its free tile is its
  last ask.
-->
<script lang="ts">
  import { shell } from '../copy/shell.ts';
  import Start from './Start.svelte';
</script>

<section class="early" aria-label={shell.nav.start}>
  <div class="wrap strip">
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
    justify-content: center;
    min-block-size: 120px;
  }

  @media (max-width: 760px) {
    .strip {
      flex-direction: column;
      align-items: stretch;
      padding-block: 32px;
    }

    .go :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
