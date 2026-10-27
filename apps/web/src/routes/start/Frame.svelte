<!--
  The first run's frame, on `/signup` and on `/start`: the entry screens' one frame (`../signin/Entry.svelte`) in its
  wide shape, the brand on the ground at the top left and the screen's own columns across the whole window under it.

  ONE FRAME AND NOT TWO (first F5): the brand stands in the same place here as on sign in, an
  invitation and connect, so it never moves under a person going from one to the next.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Entry from '../signin/Entry.svelte';

  let { children, end }: { children: Snippet; end?: Snippet | undefined } = $props();
</script>

<Entry wide {end}>{@render children()}</Entry>
