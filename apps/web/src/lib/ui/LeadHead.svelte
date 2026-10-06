<!--
  The head of a screen's lead tile, which the page header now is (DIRECTION §39).

  IT DREW THE SENTENCE A SECOND TIME. A lead tile opened on the day, the keys and the screen's sentence as a 40px
  headline, while `PageHead` stepped aside from 900px up; the header now draws the name, the actions and the sentence
  once at every width, so a tile that still drew them here would say the page's line twice and offer its actions twice.

  KEPT, AND DRAWING NOTHING, for the screens that still place it: they lose nothing, because everything it said is in
  the header above them. A screen may drop it when it next changes.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {}: {
    /** The quiet line over the headline: the day, and what the screen counts. */
    meta?: string | undefined;
    sentence: string;
    /** The phrase inside `sentence` that needs the reader. */
    needs?: string | undefined;
    aside?: Snippet | undefined;
  } = $props();
</script>
