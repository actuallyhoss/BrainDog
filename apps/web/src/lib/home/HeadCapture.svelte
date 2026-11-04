<!--
  The line a task is typed into, in a page's head ("Today reads as one story"): a 320px field at the right
  of the page's name, where it spent a whole tile on one field above the questions. On a phone it is one line of its own
  under the page's sentence (`PageHead`'s `below` on Home, the body's `under` on a declared page). Home draws it, and so
  does any declared page whose main column opens on a lone capture (`page/layout.ts` `headCaptureAt`).

  THE SAME LINE AS THE TILE WAS. The page's `capture` block says which list it adds to and what a new row is filled
  with (`capturePlan`), the light syntax is read by the page's own write ("Chase Halden tomorrow #kiln"), and the receipt
  and its Undo are the page's. The house's field classes (`capture-field`, `capture-input`, `capture-add`) draw it, so
  it looks and focuses as every other capture line does. Add shows once there is text; Enter sends too.
-->
<script lang="ts">
  import { CAPTURE_ADD, capturePlan, captureSubmit, inline, text as plain, type CapturePlan } from 'braindog-render';
  import { capturePlanOf } from '$lib/record/capture-plan.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    block,
    oncapture,
  }: {
    /** The page's capture block, lifted out of its body (`homeDrawn`'s `capture`). */
    block: LiveBlock;
    /** The page's write for a captured line: the list, the line as typed and trimmed, and what the row inherits. */
    oncapture: (register: string, text: string, inherited: Record<string, string>) => void;
  } = $props();

  /* THE PLAN WITHOUT THE PAGE'S RENDERER for a plain capture (`capture-plan.ts`), so Today's first load does not carry
     `blocks.ts` for one field; anything else is drawn by `draw` itself, asked by `import()` the once it is needed. */
  const quick = $derived(capturePlanOf(block));
  let drawn = $state<{ of: LiveBlock; plan: CapturePlan | null } | null>(null);
  $effect(() => {
    if (quick !== undefined) return;
    const of = block;
    void import('$lib/record/blocks.ts').then(({ draw }) => {
      const seg = draw(of, undefined).segments.find((s) => s.type === 'block');
      drawn = { of, plan: seg?.type === 'block' ? capturePlan(seg.rows) : null };
    });
  });
  const plan = $derived(quick !== undefined ? quick : drawn?.of === block ? drawn.plan : null);
  const prompt = $derived(plain(inline(block.heading ?? '')).trim() || (plan?.label ?? ''));

  let typed = $state('');
  const ready = $derived(captureSubmit(plan, typed) !== null);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const sent = captureSubmit(plan, typed);
    if (!sent) return;
    oncapture(sent.register, sent.text, sent.inherited);
    typed = '';
  }
</script>

{#if plan}
  <form class="head-capture capture" onsubmit={submit}>
    <span class="capture-field">
      <span class="head-capture-mark" aria-hidden="true"><Icon name="plus" size="s" /></span>
      <!-- `n` puts the caret here, as it did in the tile (`PageBody`'s row keys find the page's capture input). -->
      <input class="capture-input" type="text" name="capture" autocomplete="off" enterkeyhint="done" placeholder={prompt} aria-label={prompt} bind:value={typed} />
      {#if ready}<button type="submit" class="capture-add">{CAPTURE_ADD}</button>{/if}
    </span>
  </form>
{/if}

<style>
  /* 320 AT THE RIGHT OF THE NAME, as tall as a control; the whole row's width on a phone. On the board, a tile-coloured
     field, as a quiet control beside the name is. */
  .head-capture {
    inline-size: 320px;
    /* IN A NARROW BAR THE FIELD GIVES WAY BEFORE THE PAGE'S NAME OR ITS BUTTONS DO. */
    flex-shrink: 1;
    min-inline-size: 140px;
    max-inline-size: 100%;
    margin: 0;
  }

  .head-capture :global(.capture-field) {
    min-block-size: 36px;
    padding-inline-start: 10px;
    background: var(--tile);
  }

  .head-capture-mark {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
  }

  .head-capture :global(.capture-input) {
    font-size: var(--fs-body);
  }

  .head-capture :global(.capture-input::placeholder) {
    color: var(--ink-3);
  }

  @media (pointer: coarse) {
    .head-capture :global(.capture-input) {
      min-block-size: var(--tap);
    }
  }

  @media (width < 900px) {
    .head-capture {
      inline-size: 100%;
    }
  }
</style>
