<!--
  What accepting a queue's lead question would put on the screen, drawn under it whole: the preview Needs you has of its own
  (`routes/decide/[id]/Proposed.svelte`), each page, list, rule or look by its name, and a page drawn as it will be.

  ONLY FOR A PROPOSAL THAT CHANGES WHAT IS ON THE SCREEN, a `change` or a `pattern`; a choice between the answers
  written on the card has nothing more to show. The question's body is read when it is drawn, once, and the preview and
  its reader are fetched then, so a page with no such question carries none of it. Nothing is drawn while it is read,
  and a question the record will not say more about draws nothing more than its card.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';

  let { id, kind }: { id: string; kind: string } = $props();

  /** What a change that arranges the screen is previewed as, and the drawing of it. */
  let shown = $state<{ draw: Component<{ proposed: never }>; proposed: unknown } | null>(null);

  const previews = (k: string): boolean => k === 'change' || k === 'pattern';

  $effect(() => {
    const asked = id;
    const k = kind;
    shown = null;
    if (!previews(k)) return;
    let current = true;
    void Promise.all([
      import('@braindog/client'),
      import('$lib/record/governance.ts'),
      import('../../routes/decide/[id]/proposed.ts'),
      import('../../routes/decide/[id]/Proposed.svelte'),
    ])
      .then(async ([{ createClient }, { readOne }, { proposedOf }, drawn]) => {
        const out = await readOne(createClient({ base: apiBase() }), asked);
        if (!current || out.from !== 'live' || !out.value.about) return;
        const proposed = proposedOf(out.value.about.kind, out.value.about.body);
        if (proposed) shown = { draw: drawn.default as unknown as Component<{ proposed: never }>, proposed };
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  });
</script>

{#if shown}
  {@const Draw = shown.draw}
  <!-- NOT A TILE: the queue it is under is the tile already, and a tile inside a tile is a box in a box. -->
  <section class="lead-preview" aria-labelledby="lead-{id}-appears">
    <h3 class="lead-preview-name" id="lead-{id}-appears">{copy.proposalWillAppear}</h3>
    <Draw proposed={shown.proposed as never} />
  </section>
{/if}

<style>
  /* UNDER THE CARD IT BELONGS TO, after a hairline, so the question reads first and what it changes after. */
  .lead-preview {
    display: grid;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
    min-inline-size: 0;
  }

  .lead-preview-name {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }
</style>
