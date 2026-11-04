<!--
  A WIDGET AN AGENT PUT ON THE BOARD FOR HIM TO LOOK AT (the widgets plan §5.9, the `draft` key): drawn as any widget,
  its frame dashed (`Board.svelte`), and at its foot who put it there and why, with Keep and Throw away. Keep takes the
  draft off it (a `keep` step), so it is his like the rest; Throw away takes the widget off. Only the owner is handed a
  drafted widget at all: the record leaves it out for anybody else.

  The sheet lane's draft actions (W4) may stand in for this; it takes the same two presses.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import Button from '$lib/ui/Button.svelte';
  import { letGo, ms, settleHere, still } from '$lib/motion/index.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    draft,
    name,
    onkeep,
    ondiscard,
    onagain,
  }: {
    draft: { by?: unknown; why?: unknown };
    /** The widget's own name, for the buttons' labels. */
    name: string;
    onkeep: () => unknown;
    ondiscard: () => unknown;
    /** Try again: another from the same words, in its place. Absent, not offered. */
    onagain?: (() => unknown) | undefined;
  } = $props();

  const words = {
    by: (who: string) => `${who} added this`,
    someone: 'An agent added this',
    keep: 'Keep',
    again: 'Try again',
    throwAway: 'Throw away',
  } as const;

  /* AN AGENT THE RECORD COULD NOT NAME comes as "other", which is no name to read. */
  const who = $derived(typeof draft.by === 'string' && draft.by.trim() !== '' && draft.by.trim() !== 'other' ? words.by(draft.by.trim()) : words.someone);
  const why = $derived(typeof draft.why === 'string' && draft.why.trim() !== '' ? draft.why.trim() : null);
  let busy = $state(false);
  let mark = $state<HTMLElement | null>(null);

  async function press(f: () => unknown) {
    if (busy) return;
    busy = true;
    try {
      await f();
    } finally {
      busy = false;
    }
  }

  /* THE PRESS IS FELT AT ONCE, AND THE WRITE FOLLOWS (the record forming, `$lib/motion`). Kept, the widget settles where it
     stands as its dashes go; thrown away, it lets go on the press and the widgets beside it close over its place when
     the board reads again. A throw that did not take puts it back. */
  const tile = () => mark?.closest<HTMLElement>('[data-board-key]') ?? null;
  const keep = () => {
    settleHere(tile());
    return press(onkeep);
  };
  const discard = async () => {
    const back = letGo(tile());
    await press(ondiscard);
    await tick();
    if (mark?.isConnected) back();
  };
</script>

<div class="draft-mark" data-draft-mark bind:this={mark} out:fade={{ duration: still() ? 0 : ms('--form-out', 180) }}>
  <div class="say">
    <p class="who"><Icon name="zap" size="s" /><span>{who}</span></p>
    {#if why}<p class="why">{why}</p>{/if}
  </div>
  <div class="acts">
    <Button weight="primary" size="sm" disabled={busy} aria-label="{words.keep}: {name}" onclick={keep}>{words.keep}</Button>
    {#if onagain}<Button weight="quiet" size="sm" disabled={busy} aria-label="{words.again}: {name}" onclick={() => press(onagain)}>{words.again}</Button>{/if}
    <Button weight="bare" size="sm" disabled={busy} aria-label="{words.throwAway}: {name}" onclick={discard}>{words.throwAway}</Button>
  </div>
</div>

<style>
  /* OVER THE WIDGET'S FOOT, INSIDE ITS FRAME, whatever the widget holds: laid in the flow it was pushed out under the
     frame and cut (audit 30 Oct, item 1). The rows under it are not drawn (`fit.ts` counts it a foot). */
  .draft-mark {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: calc(var(--z-raise) + 5);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
    align-items: center;
    padding: var(--sp-3) var(--sp-4);
    border-block-start: 1px dashed var(--rule);
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
    background: var(--tile);
  }

  .who {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }

  .why {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  /* WHO AND WHY BESIDE THE ANSWERS where the frame is wide, over them where it is a column. */
  .say {
    display: grid;
    flex: 1 1 160px;
    gap: 1px;
    min-inline-size: 0;
  }

  .acts {
    display: flex;
    flex: none;
    gap: var(--sp-2);
  }
</style>
