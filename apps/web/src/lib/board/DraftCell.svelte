<!--
  A WIDGET SOMEBODY MADE THAT IS NOT HIS YET (widgets plan §5.7 and §7.1, batch W4): what Slash or an agent made from a
  sentence lands on Today as a draft, the block with its `draft: { by, why, cost? }` mark, drawn on his own data in a
  dashed frame, with who made it, the words it was made from and what asking cost, and three answers.

  KEEP hands the board the block with its mark taken off (`onkeep(key, block)`), and the board writes it as his. TRY
  AGAIN asks for another from the same words, telling the record what was turned down, and hands the board the new draft
  (`onchange(key, block)`). THROW AWAY hands the board the key (`ondiscard(key)`), and the board takes it off. Each is one
  version with Undo, written by the board (the widgets-board lane), never here.

  ONLY ITS OWNER SEES IT: the board does not draw a draft to anyone else (§7.1).
-->
<script lang="ts">
  import { draftOf, kept, type WidgetSize } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import WidgetTile from './WidgetTile.svelte';
  import { composeOn } from './compose.ts';

  let {
    key,
    block,
    size,
    onkeep,
    ondiscard,
    onchange,
    home = homeCurrency(),
  }: {
    key: string;
    /** The draft as the board holds it, its `draft` mark on. */
    block: Record<string, unknown>;
    size: WidgetSize;
    onkeep: (key: string, block: Record<string, unknown>) => unknown;
    ondiscard: (key: string) => unknown;
    /** Try again: the new draft for the same place. Absent, Try again is not offered. */
    onchange?: ((key: string, block: Record<string, unknown>) => unknown) | undefined;
    home?: string | null;
  } = $props();

  const words = {
    madeBy: (by: string) => `Made by ${by}`,
    from: (why: string) => `From “${why}”`,
    keep: 'Keep',
    again: 'Try again',
    away: 'Throw away',
    trying: 'Making another',
  } as const;

  const mark = $derived(draftOf(block));
  const title = $derived(typeof block.heading === 'string' && block.heading !== '' ? block.heading : 'New widget');
  let busy = $state(false);

  async function again() {
    if (busy || mark === null || onchange === undefined) return;
    busy = true;
    try {
      const made = await composeOn(apiBase(), mark.why, undefined, [kept(block)]);
      if ('fix' in made) {
        toasts.push(made.fix, { intent: 'warn' });
        return;
      }
      await onchange(key, made.block);
    } finally {
      busy = false;
    }
  }
</script>

{#if mark !== null}
  <aside class="dc" aria-label="{words.madeBy(mark.by)}: {title}">
    <WidgetTile {block} {size} />
    <div class="dc-say">
      <p class="dc-who"><Icon name="zap" size="s" /><span>{words.madeBy(mark.by)}</span></p>
      {#if mark.why !== ''}<p class="dc-why">{words.from(mark.why)}</p>{/if}
      {#if mark.cost}<p class="dc-cost">{mark.cost}</p>{/if}
      <div class="dc-acts">
        <Button weight="primary" size="sm" disabled={busy} onclick={() => void onkeep(key, kept(block))}>{words.keep}</Button>
        {#if onchange && mark.why !== ''}<Button weight="quiet" size="sm" disabled={busy} onclick={() => void again()}>{busy ? words.trying : words.again}</Button>{/if}
        <Button weight="bare" size="sm" disabled={busy} onclick={() => void ondiscard(key)}>{words.away}</Button>
      </div>
    </div>
  </aside>
{/if}

<style>
  /* THE SAME DASHED EDGE AS A SUGGESTION (`SuggestCell.svelte`): what is not his yet is told by its edge alone. */
  .dc {
    --u: var(--board-u, 128px);
    --gap: var(--tile-gap, 12px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4, 16px);
    align-items: center;
    padding: var(--sp-3);
    border: 1.5px dashed var(--rule-strong);
    border-radius: 22px;
  }


  .dc-say {
    display: grid;
    flex: 1 1 220px;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .dc-who {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }

  .dc-why {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .dc-cost {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .dc-acts {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--dense, 1));
    margin-block-start: calc(6px * var(--dense, 1));
  }

</style>
