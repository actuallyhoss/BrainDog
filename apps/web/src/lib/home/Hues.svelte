<!--
  Colours, as one quiet tile at the end of the board: the rows of a list that have no colour of their
  own, counted and named in the list's own word ("6 projects have no colour of their own"), the first names under it,
  and one press, "Give them colours".

  A ROW'S COLOUR IS THE THEME'S. A row made before its list declared a colour was drawn in a hue the screen
  hashed, a different one on every build. The press has the record give each its own once (`giveHues`), chosen by the
  theme, and it is never recomputed.

  AN OFFER AND NEVER A WRITE OF ITS OWN. Nothing is given until he presses. After the press the tile goes and the toast
  says what was given ("Gave 6 colours.") with Undo, which puts the whole batch back through the record's own undo, as
  a match on Home is put back. Undone, the tile comes back. A press the record refuses says the record's own sentence
  in the tile, and the button stays for another try.

  Nothing at nought. The button is a rectangle, 44 tall under a thumb.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { undoChange } from '$lib/record/undo-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { give, huesSaid, huesWords, namesSaid, type HueList, type HuesFound } from './hues.ts';

  let { found }: { found: HuesFound } = $props();

  /* WHAT EACH PRESS ANSWERED, by the list's handle: given (the list's lines go), or the record's sentence for why not. */
  let gone = $state.raw<ReadonlySet<string>>(new Set());
  let refused = $state.raw<Readonly<Record<string, string>>>({});
  let busy = $state<string | null>(null);

  const shown = $derived(found.lists.filter((l) => !gone.has(l.list)));

  const without = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => new Set([...set].filter((k) => k !== key));

  async function undo(list: string, batch: string) {
    const out = await undoChange(apiBase(), batch);
    if (out.from !== 'undone') return void toasts.push(out.fix, { intent: 'warn' });
    gone = without(gone, list);
    toasts.push(out.said, { intent: 'good' });
  }

  async function press(l: HueList) {
    if (busy !== null) return;
    busy = l.list;
    try {
      const out = await give(apiBase(), l.list);
      if (!out.ok) return void (refused = { ...refused, [l.list]: out.fix });
      refused = Object.fromEntries(Object.entries(refused).filter(([k]) => k !== l.list));
      gone = new Set([...gone, l.list]);
      const batch = out.batch;
      toasts.push(out.said, batch === '' ? { intent: 'good' } : { intent: 'good', undo: () => void undo(l.list, batch) });
    } finally {
      busy = null;
    }
  }
</script>

{#if shown.length > 0}
  <section class="hues" aria-label={huesSaid(shown[0]!)} data-hues>
    {#each shown as l (l.list)}
      {@const said = huesSaid(l)}
      {@const names = namesSaid(l)}
      <div class="h-row">
        <div class="h-main">
          <div class="h-text">
            <p class="h-line" dir="auto">{said}</p>
            {#if names}<p class="h-names" dir="auto">{names}</p>{/if}
          </div>
          <span class="h-press">
            <Button aria-label="{l.count === 1 ? huesWords.giveOne : huesWords.give}: {said}" disabled={busy !== null} aria-busy={busy === l.list} data-hues-give onclick={() => void press(l)}>
              {l.count === 1 ? huesWords.giveOne : huesWords.give}
            </Button>
          </span>
        </div>
        {#if refused[l.list]}<p class="h-no" role="status" dir="auto">{refused[l.list]}</p>{/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .hues {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .h-row + .h-row {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  /* THE SENTENCE AND ITS PRESS ON ONE LINE, the press at the end; it drops under the words on a phone (390). */
  .h-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
  }

  .h-text {
    flex: 1 1 16rem;
    min-inline-size: 0;
  }

  .h-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  /* THE FIRST NAMES UNDER IT, in the quieter colour at a row's own size. */
  .h-names,
  .h-no {
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .h-no {
    margin-block-start: var(--sp-2);
    color: var(--ink);
  }

  /* 44 TALL UNDER A THUMB, drawn and not only hit. */
  @media (pointer: coarse) {
    .h-press :global(.btn) {
      min-block-size: 44px;
    }
  }

  @media (forced-colors: active) {
    .hues {
      border: 1px solid CanvasText;
    }
  }
</style>
