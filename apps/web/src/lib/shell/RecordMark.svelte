<!--
  The record's mark: a rounded square in the record's colour with the first letter of its name, at the head of the
  sidebar, its narrow rail and every phone page. Decoration beside the name, so it is hidden from a screen reader.
-->
<script lang="ts">
  import { frame } from './frame.svelte.ts';

  let { size = 20 }: { size?: number } = $props();
  const letter = $derived((frame.record.trim().slice(0, 1) || '·').toUpperCase());
</script>

<span class="mark" style:--mark={`${size}px`} aria-hidden="true">{letter}</span>

<style>
  .mark {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--mark);
    block-size: var(--mark);
    border-radius: calc(var(--mark) * 0.3);
    background: var(--red-fill);
    color: var(--on-red);
    font-family: var(--font-display);
    font-size: calc(var(--mark) * 0.55);
    font-weight: var(--fw-semi);
    line-height: 1;
  }
</style>
