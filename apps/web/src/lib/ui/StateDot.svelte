<!--
  A thing's state as an 8px dot. The dot is the second channel; the word beside it is
  the first, and a dot that means something is never drawn without its word.

  RED ONLY FOR LATE AND NEEDS YOU. An open thing that is not late is a NEUTRAL RING, never a colour: most of a list is
  open, and a list of red or amber dots says everything is wrong.

    open       a 1.5px `--ink-2` ring, hollow
    part       the same ring with its first half filled (part paid), a hard stop and never a blend
    done       filled `--cat-slate`
    late       filled `--red`, with its word ("64 days late")
    needs-you  filled `--red`, with its word
    warn       filled `--warn`, with its word ("At risk", "No value yet")
    good       filled `--good`, with its word ("Paid")
    live       filled `--live`: the running dot, which is never text

  `word` is drawn after the dot when given, in the state's own ink for late, needs you, warn and good (each 4.5:1 on
  the tile in both schemes) and `--ink-3` otherwise. Without a word the dot is hidden from a screen reader, because
  the words beside it say the state; with one, the word is the reading.
-->
<script module lang="ts">
  export type State = 'open' | 'part' | 'done' | 'late' | 'needs-you' | 'warn' | 'good' | 'live';
</script>

<script lang="ts">
  let { state, word }: { state: State; word?: string | undefined } = $props();
</script>

{#if word}
  <span class="status" data-state={state}><span class="dot" data-state={state} aria-hidden="true"></span><span class="status-word">{word}</span></span>
{:else}
  <span class="dot" data-state={state} aria-hidden="true"></span>
{/if}

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
  }

  .status-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status:is([data-state='late'], [data-state='needs-you']) {
    color: var(--red);
    font-weight: var(--fw-semi);
  }

  .status[data-state='warn'] {
    color: var(--warn);
  }

  .status[data-state='good'] {
    color: var(--good);
  }

  .dot {
    display: inline-block;
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    vertical-align: middle;
  }

  /* OPEN: a hollow ring in the second ink. */
  .dot[data-state='open'] {
    box-shadow: inset 0 0 0 1.5px var(--ink-2);
  }

  /* PART: the ring, its first half filled, a hard stop. The start is the reading start, so it flips right to left. */
  .dot[data-state='part'] {
    background: linear-gradient(to right, var(--ink-2) 50%, transparent 50%);
    box-shadow: inset 0 0 0 1.5px var(--ink-2);
  }

  :global([dir='rtl']) .dot[data-state='part'] {
    background: linear-gradient(to left, var(--ink-2) 50%, transparent 50%);
  }

  .dot[data-state='done'] {
    background: var(--cat-slate, var(--ink-3));
  }

  .dot:is([data-state='late'], [data-state='needs-you']) {
    background: var(--red);
  }

  .dot[data-state='warn'] {
    background: var(--warn-fill);
  }

  .dot[data-state='good'] {
    background: var(--good);
  }

  .dot[data-state='live'] {
    background: var(--live);
  }

  /* FORCED COLOURS: every state keeps its shape, a ring or a disc, in the system's text colour. */
  @media (forced-colors: active) {
    .dot {
      background: CanvasText;
    }

    .dot:is([data-state='open'], [data-state='part']) {
      background: none;
      border: 1.5px solid CanvasText;
    }
  }
</style>
