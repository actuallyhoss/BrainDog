<!--
  ONE QUIET SUGGESTION AT THE BOARD'S END (widgets plan §6.3, batch W5): a widget Slash would add to Today from how the
  record is used, drawn on the person's own data in a dashed frame, with its reason in one line, and Add, Not now and
  Never.

  NEVER ABOVE ANYTHING OF HIS. The board places it after its last widget (`Board.svelte`, the widgets-board lane), and it
  is never in Needs you, never in a count, never a push. One at a time, a new one at most once a day, two Not nows in a
  week pause them for two weeks, Never is final on every device: the record's brakes (`design-agent.ts`), so the cell
  only says what was pressed (`widget-held.svelte.ts`).

  ADD HANDS THE BOARD `{ block, size }` (`onadd`), as the widget sheet does, and the board writes it and says Undo. A
  suggestion to take a widget off (S6, empty for three weeks) hands the board its key (`onremove`) instead.

  Its words are plain, and the reason is the record's own sentence ("You asked how much went on food on 3 days this
  month.").
-->
<script lang="ts">
  import { SIZE_SAID, type WidgetOffer, type WidgetSize } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import WidgetPreview from './WidgetPreview.svelte';
  import { widgetHeld } from './widget-held.svelte.ts';
  import { todayOffer } from './offer.svelte.ts';

  let {
    offer: given = null,
    onadd,
    onremove,
    home = homeCurrency(),
    line = false,
  }: {
    /** The offer to show. Absent, the one Today's own read carried (`offer.svelte.ts`), so the board need pass none. */
    offer?: WidgetOffer | null;
    /** The board adds it, writes it once and says Undo. */
    onadd: (add: { block: Record<string, unknown>; size: WidgetSize }) => unknown;
    /** The board takes the widget with this key off (S6). Absent, a suggestion to take one off is not drawn. */
    onremove?: ((key: string) => unknown) | undefined;
    home?: string | null;
    /** At Today's foot (T6): its name and one line, with Add, Not now and Never beside them, and no preview. The
     *  preview drew two 12px lines in a 185-tall card. */
    line?: boolean;
  } = $props();

  /** The cell's own words. */
  const words = {
    noticed: 'Slash suggests',
    add: 'Add',
    remove: 'Take it off',
    notNow: 'Not now',
    never: 'Never',
    later: 'Not now. Slash will not suggest it for two weeks.',
    gone: 'Slash will not suggest it again.',
    offToday: 'Taken off Today.',
  } as const;

  let busy = $state(false);
  const offer = $derived(given ?? todayOffer.offer);
  const removal = $derived(offer?.remove !== undefined);
  /* A WIDGET THAT WOULD DRAW NOTHING IS NOT OFFERED (live check of 30 October, 22): "People to get back to" was a tall
     empty card with "You are in touch with everyone" at its foot, and Gold price said "No gold rate yet". Its reading is
     what the record drew of it; with no figure and no line there is nothing to show him. */
  const blank = $derived(!removal && offer?.reading !== undefined && (offer.reading.figures?.length ?? 0) === 0 && (offer.reading.rows?.length ?? 0) === 0);
  const hidden = $derived(offer === null || blank || widgetHeld.gone.includes(offer.key) || (removal && onremove === undefined));
  const cols = $derived(offer === null ? 1 : SIZE_SAID[offer.size].cols);
  const rows = $derived(offer === null ? 1 : SIZE_SAID[offer.size].rows);

  async function press(act: 'add' | 'notNow' | 'never') {
    if (busy || offer === null) return;
    busy = true;
    try {
      if (act === 'add') {
        if (removal) {
          await onremove?.(offer.remove!);
          toasts.push(words.offToday);
        } else await onadd({ block: offer.block, size: offer.size });
        void widgetHeld.added(offer.key);
        return;
      }
      const saved = act === 'notNow' ? await widgetHeld.notNow(offer.key) : await widgetHeld.never(offer.key);
      toasts.push(saved.from === 'refused' ? saved.fix : act === 'notNow' ? words.later : words.gone, saved.from === 'refused' ? { intent: 'warn' } : {});
    } finally {
      busy = false;
    }
  }
</script>

{#if !hidden && offer !== null}
  <aside class="sc" data-removal={removal ? '' : undefined} data-line={line ? '' : undefined} style:--cols={cols} style:--rows={rows} aria-label="{words.noticed}: {offer.title}">
    {#if !removal && !line}
      <div class="sc-frame" data-size={offer.size}>
        <WidgetPreview widget={{ title: offer.title, icon: String(offer.block.icon ?? 'grid'), example: {}, ready: true }} size={offer.size} reading={offer.reading ?? null} {home} waiting={offer.reading === undefined} />
      </div>
    {/if}
    <div class="sc-say">
      <p class="sc-who"><Icon name="zap" size="s" /><span>{words.noticed}</span></p>
      <p class="sc-title">{removal ? offer.why.split('.')[0] : offer.title}</p>
      <p class="sc-why">{removal ? offer.why.slice(offer.why.indexOf('.') + 1).trim() : offer.why}</p>
      {#if !line}{@render acts()}{/if}
    </div>
    {#if line}{@render acts()}{/if}
  </aside>
{/if}

{#snippet acts()}
  <div class="sc-acts">
    <!-- INK, NOT THE RED: an offer is never the screen's one primary, and Today's answers already wear the ink. -->
    <Button weight="ink" disabled={busy} onclick={() => press('add')}>{removal ? words.remove : words.add}</Button>
    <Button weight="quiet" disabled={busy} onclick={() => press('notNow')}>{words.notNow}</Button>
    <Button weight="bare" disabled={busy} onclick={() => press('never')}>{words.never}</Button>
  </div>
{/snippet}

<style>
  /* A DASHED FRAME ON THE BOARD, NOT A TILE: what is offered is told from what is his by its edge alone. Its widget is
     drawn at the board's own cell (`--board-u`, the board's unit, 128 when the board says none). */
  .sc {
    --u: var(--board-u, 128px);
    --gap: var(--tile-gap, 12px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4, 16px);
    align-items: center;
    padding: var(--sp-3);
    border: 1.5px dashed var(--rule-strong);
    border-radius: var(--r-tile);
    background: transparent;
  }

  .sc-frame {
    flex: none;
    inline-size: calc(var(--cols) * var(--u) + (var(--cols) - 1) * var(--gap));
    max-inline-size: 100%;
    block-size: calc(var(--rows) * var(--u) + (var(--rows) - 1) * var(--gap));
    opacity: 0.92;
  }

  .sc-frame[data-size='full'] {
    inline-size: 100%;
  }

  .sc-say {
    display: grid;
    flex: 1 1 220px;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .sc-who {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }

  .sc-title {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 1.3;
  }

  .sc-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 1.4;
  }

  .sc-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* ONE LINE AT TODAY'S FOOT (T6): what Slash suggests and why on the left, its three answers on the right; under a
     narrow width the answers go under the words. */
  .sc[data-line] {
    padding: var(--sp-3) var(--sp-4);
  }

  .sc[data-line] .sc-say {
    flex: 1 1 320px;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    column-gap: var(--sp-2);
  }

  .sc[data-line] .sc-why {
    grid-column: 1 / -1;
  }

  .sc[data-line] .sc-acts {
    margin-block-start: 0;
  }

  .sc[data-line] > .sc-acts {
    flex: none;
  }

  /* ON THE PHONE THE BOARD IS TWO COLUMNS, so the frame is the phone's (a Full is drawn as a Wide) and the words go under. */
  @media (width < 720px) {
    .sc {
      --u: var(--board-u, calc((100vw - 2 * 16px - 24px - 3px - var(--gap)) / 2));
    }

    .sc-frame {
      inline-size: calc(min(var(--cols), 2) * var(--u) + (min(var(--cols), 2) - 1) * var(--gap));
    }
  }
</style>
