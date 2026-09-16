<!--
  A writer, as a face: a disc with the initial, the way the record app draws one.

  AN INITIAL, NOT A PHOTO, for the app's reason (`apps/web/src/lib/ui/Face.svelte`): a letter in a
  disc is a face without inventing one, and the name always sits beside it, so it is `aria-hidden`.

  NO TINT, as in the app: colour on this site is kept for state, and the name beside the disc is
  what tells two writers apart.
-->
<script lang="ts">
  let { name, size = 'm' }: { name: string; size?: 's' | 'm' } = $props();

  const initial = $derived(name.trim().replace(/^the\s+/i, '').charAt(0).toUpperCase() || '?');
</script>

<span class="face" data-size={size} aria-hidden="true">{initial}</span>

<style>
  .face {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: var(--hover-wash);
    box-shadow: inset 0 0 0 1px var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
    line-height: 1;
  }

  .face[data-size='s'] {
    inline-size: 22px;
    block-size: 22px;
  }
</style>
