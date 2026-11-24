<!--
  @component
  One of the drawers `lazy.ts` names, drawn once its chunk has landed (at once when it already has: a host that waited
  for its page's drawers, or one that holds them all, `eager.ts`). Nothing is drawn in the moment before, so the
  block's figure and caption stand and its body arrives with the code.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import { drawer, drawerNow, type LazyKind } from './lazy.ts';

  let { kind, props }: { kind: LazyKind; props: Record<string, unknown> } = $props();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let came = $state.raw<{ kind: LazyKind; drawn: Component<any> } | null>(null);
  const Drawn = $derived(drawerNow(kind) ?? (came?.kind === kind ? came.drawn : null));

  $effect(() => {
    const k = kind;
    if (drawerNow(k) !== null) return;
    let gone = false;
    void drawer(k).then(
      (d) => {
        if (!gone) came = { kind: k, drawn: d };
      },
      () => undefined,
    );
    return () => {
      gone = true;
    };
  });
</script>

{#if Drawn}<Drawn {...props} />{/if}
