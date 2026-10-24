<!--
  `/add`: capture from the phone in one press (E45 of the 24 October scope). The Home Screen icon's "Ask" and a share
  from another app open here (`static/manifest.webmanifest`); the page goes Home and opens the palette with what was
  shared already in its field, so its "Add to" line and its question are one tap away. It draws nothing of its own.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { at } from '$lib/at.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import { sharedSeed } from './seed.ts';

  let done = false;
  $effect(() => {
    if (done) return;
    done = true;
    const seed = sharedSeed(page.url.searchParams);
    void goto(at('/'), { replaceState: true }).then(() => openPaletteWith(seed));
  });
</script>
