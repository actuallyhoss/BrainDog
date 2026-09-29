<!--
  `/settings`: the index of every settings area.

  It used to redirect to the first area, because the areas had a strip of their own and a second
  list of them would have been a second nav. On a phone that strip was the problem: it showed the
  first few areas and cut the rest off at its edge. So below 900px this address is now the index, a
  page of grouped rows, and each area a page with a back link to it; from 900px up the same index
  stands beside the open area, and this address opens the first one.

  THE SAME SCREEN AS `/settings/<area>`, WITH NO AREA IN THE ADDRESS. That file holds `AREAS`, the
  registry every unit adding an area writes to, and draws the index from it; drawing it here too
  keeps one list and one screen rather than a copy of either. It reads the area from the address,
  finds none, and draws the index, its heading, its title and its readiness itself.
-->
<script lang="ts">
  import Settings from './[area]/+page.svelte';
</script>

<Settings />
