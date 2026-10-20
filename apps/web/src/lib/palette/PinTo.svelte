<!--
  Pin, under Slash's answer in the palette, and its sheet, "Pin to" (PGS-B12, "answers you can pin", D37.34).

  COPIED FROM `BindBlock.svelte` AND SMALLER. A pinned answer has already said its list and its filter, so the sheet asks
  one thing, the page, and one press on a page is the pin: there is no kind to choose (an answer over a list is a table,
  one in prose a note) and no second confirm. Today is first, by Home's own rule. The toast's Undo sets the page back to
  the body the write read, as "Put this on a page" does.

  NOTHING IS PINNED WITHOUT HIS PRESS: opening the sheet only reads the record's pages. Loaded by the palette only when an
  answer is on screen, so neither this file nor `pin.ts` is in what every screen loads.
-->
<script lang="ts">
  import type { Reading } from '@braindog/client';

  import { apiBase } from '../at.ts';
  import { citedWords } from '../cite.ts';
  import { copy } from '../copy.ts';
  import Button from '../ui/Button.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import { listName } from '../record/names.ts';
  import { homePage } from '../voice.svelte.ts';
  import { pinnable, words, type PinPage, type PinSheet } from './pin.ts';

  let {
    reading,
    asked,
    proposal = null,
  }: {
    reading: Reading | null;
    /** What the person typed, which a pinned list's heading carries. */
    asked: string;
    /** Slash's pass-2 answer, its sentence with braces and what each stands for, when it wrote one. */
    proposal?: { text: string; figures: Record<string, unknown> } | null;
  } = $props();

  /* THE PROSE AS PLAIN WORDS, its figures said, so a pinned note never carries Slash's braces as if they were the note's. */
  const prose = $derived(proposal && proposal.text ? citedWords(proposal.text, proposal.figures) : null);
  const pin = $derived(pinnable(reading, asked, prose));

  let open = $state(false);
  let sheet = $state<PinSheet | null>(null);
  let busy = $state(false);
  let problem = $state<string | null>(null);

  /** Ask `boot` whether the record answered, then which pages it keeps. Asked on every opening, so a new page is there. */
  async function look(register: string | null) {
    let next: PinSheet;
    try {
      const { readBoot } = await import('../record/boot-live.ts');
      const booted = await readBoot(apiBase());
      if (booted.from === 'refused') next = { from: 'refused', fix: booted.fix };
      else next = await (await import('./pin.ts')).pinSheet(apiBase(), register, homePage());
    } catch {
      next = { from: 'refused', fix: words.failed };
    }
    sheet = next;
  }

  $effect(() => {
    if (!open || pin === null || pin.kind === 'refused') return;
    problem = null;
    sheet = null;
    void look(pin.kind === 'rows' ? pin.register : null);
  });

  const pages = $derived(sheet?.from === 'live' ? sheet.pages : []);

  /* WHAT THE PIN WILL BE, said before the press: the list and its filter by the names a person reads, or a dated note. */
  const what = $derived(
    pin === null || pin.kind === 'refused'
      ? ''
      : pin.kind === 'note'
        ? words.note
        : words.rows(sheet?.from === 'live' && sheet.name ? sheet.name : listName(pin.register), pin.predicate === copy.everything ? null : pin.predicate),
  );

  async function press(to: PinPage) {
    if (pin === null || pin.kind === 'refused' || busy) return;
    busy = true;
    problem = null;
    const base = apiBase();
    let out: Awaited<ReturnType<typeof import('./pin.ts').pinTo>>;
    try {
      const m = await import('./pin.ts');
      out = await m.pinTo(base, to, pin, Date.now(), undefined, sheet?.from === 'live' ? sheet.declared : null);
    } catch {
      problem = words.failed;
      return;
    } finally {
      busy = false;
    }
    if (out.from !== 'written') {
      problem = out.fix;
      return;
    }
    open = false;
    const { before, version } = out;
    toasts.push(words.pinned(to.title), {
      intent: 'good',
      undo: () =>
        void import('../record/page-write.ts')
          .then((w) => w.setBody(base, before, undefined, version))
          .then((back) => {
            if (back.from !== 'written') toasts.push(back.fix, { intent: 'warn' });
          }),
    });
  }
</script>

{#if pin}
  <div class="pin-at">
    <Button size="sm" onclick={() => (open = true)}>{words.pin}</Button>
  </div>
  <Sheet bind:open title={words.pinTo}>
    <div class="form">
      {#if pin.kind === 'refused'}
        <p class="none" role="status">{pin.fix}</p>
      {:else}
        <p class="what">{what}</p>
        {#if sheet?.from === 'refused'}
          <p class="none">{sheet.fix}</p>
        {:else if sheet && pages.length === 0}
          <p class="none">{words.noPages}</p>
        {:else if sheet}
          <ul class="pages" aria-label={words.pinTo}>
            {#each pages as p (p.slug)}
              <li><button type="button" class="page tap" disabled={busy} onclick={() => void press(p)} dir="auto">{p.title}</button></li>
            {/each}
          </ul>
        {/if}
      {/if}
      {#if problem}<p class="none" role="status">{problem}</p>{/if}
    </div>
    {#snippet footer()}
      <Button weight="bare" onclick={() => (open = false)}>{copy.close}</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .pin-at {
    display: flex;
    justify-content: flex-end;
    padding: var(--sp-2) var(--sp-3);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .what {
    color: var(--ink-3);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  /* THE PAGES ARE ONE TILE, each a full-width rectangle, Today at the top. A press is the pin, so each is a button and
     not an option in a select a second press would confirm. */
  .pages {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--tile-2);
    border-radius: var(--r-tile);
    overflow: hidden;
  }

  .page {
    inline-size: 100%;
    min-block-size: max(44px, var(--ctl-h));
    padding: 0 var(--sp-4);
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: pointer;
  }

  .page:hover:not(:disabled),
  .page:focus-visible {
    background: var(--tile-2);
  }

  .page:disabled {
    color: var(--ink-3);
    cursor: progress;
  }

  .none {
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-tile);
    color: var(--ink-3);
    font-size: var(--fs-body);
  }
</style>
