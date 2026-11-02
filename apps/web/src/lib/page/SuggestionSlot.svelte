<!--
  THE RESERVED SLOT (`slot.ts`): one suggestion at the head of a page, from BrainDog's own questions first, with its
  suggested answer as the button and Not now beside it. Empty, and drawn as nothing at all, when there is nothing to
  suggest, so a page without one is exactly the page it was.

  ON A PHONE IT IS ONE LINE: the question, cut to the width, which opens it in Needs you; its suggested answer; and a
  quiet cross for Not now. Whose it is and why fold away, so a suggestion never takes the first screen from the page it
  stands on (it took 40% of Today's at 390).

  ON A PAGE THAT DRAWS A QUEUE, its questions are read from that queue and none of the ones it shows is drawn again here;
  on any other page they are read once, after the page has drawn, so the slot never holds the page up; or, on a page
  opened by its address, beside the page's own first reads (`slot.ts` `askSlot`), and taken as the slot is made.

  THE ANSWER IS THE ONE EVERY QUESTION TAKES (`decide-write.ts`), and a question that turns out to owe a reason opens in
  Needs you, where its whole card asks for one. Not now changes nothing in the record: the question leaves the slot on
  this device and still waits in Needs you.
-->
<script lang="ts">
  import { at as inApp, apiBase } from '../at.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { drawnIn, isDrawing, putAside, readSlot, setAside, slotPick, slotQuestion, slotWords as words, takeSlot, type SlotQuestion, type SlotRow } from './slot.ts';

  let {
    blocks,
    page = null,
    row = null,
    compact = null,
    reread = null,
  }: {
    /** The page's blocks as read, which a queue of open questions is taken from where the page draws one. */
    blocks: readonly { kind: string; source?: string | undefined; drawn?: boolean | undefined; queue?: readonly unknown[] | undefined }[];
    /** The page's address, so a question about this page is the one offered first. */
    page?: string | null;
    /** The row the page is about, so a question about that project is offered on its page. */
    row?: SlotRow | null;
    /** How many of a queue's questions the page shows before the rest fold, or `null` where it shows them whole. */
    compact?: number | null;
    /** Reads the page again once a question is answered, or `null` where nothing need be read. */
    reread?: (() => void | Promise<void>) | null;
  } = $props();

  const own = $derived(blocks.find((b) => b.kind === 'queue' && b.source === 'governance.open' && b.drawn !== false) ?? null);
  let read = $state<SlotQuestion[] | null>(null);
  let aside = $state<Set<string>>(setAside());
  let busy = $state(false);

  /* WHAT THE PAGE'S FIRST READ ASKED FOR THIS SLOT (`askSlot`), taken as the slot is made. */
  let ahead = takeSlot(apiBase());

  /* A PAGE WITH NO QUEUE OF ITS OWN READS THE QUESTIONS ONCE, when the browser is next idle; at once where the page's
     first read asked them already. */
  $effect(() => {
    if (own !== null || read !== null) return;
    let live = true;
    if (ahead !== null) {
      const asked = ahead;
      void asked.then((got) => {
        if (!live) return;
        if (got !== null) read = got;
        else {
          ahead = null;
          void readSlot(apiBase()).then((again) => live && (read = again));
        }
      });
      return () => {
        live = false;
      };
    }
    const go = () => void readSlot(apiBase()).then((got) => live && (read = got));
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 300);
    return () => {
      live = false;
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number') cancelIdleCallback(idle);
      else clearTimeout(idle as ReturnType<typeof setTimeout>);
    };
  });

  const questions = $derived(own ? (own.queue ?? []).map(slotQuestion).filter((q): q is SlotQuestion => q !== null) : (read ?? []));
  const drawn = $derived(drawnIn(blocks, compact));
  const pick = $derived(slotPick(questions, { page, row, drawn, dismissed: aside }));

  async function accept() {
    const p = pick;
    if (!p || busy) return;
    busy = true;
    const { answerQuestion } = await import('$lib/record/decide-write.ts');
    const out = await answerQuestion(apiBase(), p.question.id, p.answer.key);
    busy = false;
    if (out.from === 'written') {
      aside = putAside(p.question.id);
      toasts.push(words.done(p.answer.label));
      await reread?.();
      return;
    }
    if (out.from === 'refused' && out.wants === 'reason') return void toasts.push(words.why, { intent: 'warn' });
    toasts.push(out.fix, { intent: 'warn' });
  }

  function notNow() {
    const p = pick;
    if (!p) return;
    aside = putAside(p.question.id);
    toasts.push(words.later);
  }
</script>

{#if pick}
  <aside class="slot" aria-label={words.label}>
    <p class="slot-who">{isDrawing(pick.question) ? words.drew : pick.own ? words.own : words.asked}</p>
    <a class="slot-question" href={inApp(`/decide/${pick.question.id}`)}>{pick.question.question}</a>
    {#if pick.answer.because || pick.question.why}<p class="slot-why">{pick.answer.because || pick.question.why}</p>{/if}
    <div class="slot-row">
      <Button weight="primary" disabled={busy} onclick={() => void accept()}>{pick.answer.label}</Button>
      <span class="slot-later"><Button weight="quiet" disabled={busy} onclick={notNow}>{words.notNow}</Button></span>
      <a class="slot-open" href={inApp(`/decide/${pick.question.id}`)}>{words.open}</a>
      <button type="button" class="slot-shut tap" aria-label={words.notNow} disabled={busy} onclick={notNow}><Icon name="close" size="m" /></button>
    </div>
  </aside>
{/if}

<style>
  .slot {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--tile);
    border-radius: var(--r-tile);
    min-inline-size: 0;
  }

  /* WHO DREW IT IS META, in the quiet ink (colour lane, 2 Nov): in red it read as a warning over a draft. */
  .slot-who {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .slot-question {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) and (pointer: fine) {
    .slot-question:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* NOT NOW AS A CROSS IS THE PHONE'S; from 600px it says its words. */
  .slot-shut {
    display: none;
  }

  .slot-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .slot-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .slot-open {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /**
   * ONE LINE ON A PHONE: the question cut to the room left, its answer, and the cross. 12 in and 8 between, the tile's
   * own fill, so it reads as a strip of the board and not a card of its own.
   */
  @media (width < 600px) {
    .slot {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    }

    .slot-who,
    .slot-why,
    .slot-later,
    .slot-open {
      display: none;
    }

    .slot-question {
      flex: 1 1 0;
      min-inline-size: 0;
      overflow: hidden;
      font-size: var(--fs-ctl);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow-wrap: normal;
    }

    .slot-row {
      flex: none;
      flex-wrap: nowrap;
      gap: var(--sp-1);
    }

    .slot-shut {
      display: inline-grid;
      place-items: center;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-ctl);
      color: var(--ink-3);
      cursor: pointer;
    }
  }

  /* A THUMB NEEDS 44px: the link grows its box, not its type. */
  @media (pointer: coarse) and (width >= 600px) {
    .slot-open {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }
</style>
