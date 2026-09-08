<!--
  THE ROUTE, which is what makes `Seeded.svelte` a renderer.

  It used to render `copy.shown` from `src/lib/` with no route in the fixture at all — and once the
  gate learned that a module nothing imports is not a renderer, that made `shown` dead too and the
  fixture reported two findings instead of the one it was seeded for. A fixture that goes red for
  the wrong reason is a fixture that stops proving anything.

  It also earns its keep: the reachability walk is transitive, and this is the edge it has to
  follow. `+page.svelte` → `Seeded.svelte` → `copy.shown`.
-->
<script lang="ts">
  import Seeded from '$lib/Seeded.svelte';
</script>

<Seeded />
