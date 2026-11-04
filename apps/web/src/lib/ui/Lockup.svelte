<!--
  The BrainDog lockup outside the app: the mark and the name, one size, on every screen a person reaches before or
  without a record (sign-in, /connect, a shared page). /connect drew it at 24 and a shared page at 20, so the brand
  changed size between two screens a person opens in one sitting. Not a link: a shared page's reader has no Today.
-->
<script lang="ts">
  import { PRODUCT } from '../title.ts';
  import Mark from './Mark.svelte';
</script>

<span class="lockup">
  <Mark height={24} />
  <span class="lockup-word">{PRODUCT}</span>
</span>

<style>
  .lockup {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .lockup-word {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: calc(24px * var(--type, 1));
    white-space: nowrap;
  }
</style>
