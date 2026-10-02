<!--
  `/settings`: the index of every settings area.

  It used to redirect to the first area, and then, from 900px up, it still did. It is the index at
  every width now, and the index is a declared page (`[area]/place.ts` `SETTINGS_INDEX`) drawn by
  the one reader, a tile for each group, which a person arranges as their own `settings` page.

  THE SAME SCREEN AS `/settings/<area>`, WITH NO AREA IN THE ADDRESS. That file reads the index and
  draws it; drawing it here too keeps one screen rather than a copy of it. It reads the area from the
  address, finds none, and draws the index, its heading, its title and its readiness itself.
-->
<script lang="ts">
  import Settings from './[area]/+page.svelte';
</script>

<Settings />
