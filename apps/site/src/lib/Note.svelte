<!--
  The line that says the specific true thing: a limit, a caveat, how something works underneath.

  It used to hang off a 2px rule down its left edge, which set every caveat on the site as a quoted
  aside. It is small and dim for the same reason as before, because it is for the reader who has
  already decided they are interested, and the glyph is what marks it as a note rather than body.
-->
<script lang="ts">
  import Icon from './Icon.svelte';

  let { text }: { text: string } = $props();
</script>

<p class="note">
  <span class="mark"><Icon name="info" /></span>
  <span>{text}</span>
</p>

<style>
  .note {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    max-inline-size: 60ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* One line-box tall, so the glyph centres on the first line of the note however many it runs to. */
  .mark {
    display: flex;
    align-items: center;
    block-size: 1.6em;
  }
</style>
