<!--
  Settings › Tidy up, "Read what you already have" (understanding is the engine's first job): the record's
  walk over what it already holds, asked for now rather than tonight. One plain line and Look first; the look says, in
  names, what it would link and what it would ask on Decide, and only then Do it. What Do it did has an Undo beside it.

  A SECTION, NOT AN AREA, mounted by one line in `areas/Health.svelte` (Tidy up) for an owner, because the record's `understand` is
  ADMIN; anybody else is refused with its own sentence. A record with no such walk leaves the section out once it says so.

  A LIST WITHOUT A BOX for the changes, at the body size, and no red: nothing here is a danger, and every change has Undo.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { doIt, lookFirst, undoIt, understandWords as words, type Look } from '$lib/record/understand-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';

  /* WHERE THE LINE IS: nothing asked yet, the look in front of the owner, or what Do it did with its Undo. */
  type Step = { at: 'idle' } | { at: 'look'; look: Look } | { at: 'done'; look: Look; undo: string[] };

  let step = $state<Step>({ at: 'idle' });
  let busy = $state<'look' | 'do' | 'undo' | null>(null);
  /** A record with no such walk, which leaves the section out. */
  let gone = $state(false);

  async function look() {
    if (busy) return;
    busy = 'look';
    const at = opened();
    const out = await lookFirst(apiBase());
    closed(out.from === 'look', at);
    busy = null;
    if (out.from === 'look') step = { at: 'look', look: out.look };
    else if (out.from === 'missing' || out.from === 'refused') said(out.fix, out.from === 'missing');
  }

  async function go() {
    if (busy) return;
    busy = 'do';
    const out = await doIt(apiBase());
    busy = null;
    if (out.from === 'done') {
      step = { at: 'done', look: out.look, undo: out.undo };
      toasts.push(out.look.said, { intent: 'good' });
    } else if (out.from === 'missing' || out.from === 'refused') said(out.fix, out.from === 'missing');
  }

  async function back(undo: string[]) {
    if (busy || undo.length === 0) return;
    busy = 'undo';
    const out = await undoIt(apiBase(), undo);
    busy = null;
    if (out.from === 'undone') {
      step = { at: 'idle' };
      toasts.push(out.said, { intent: 'good' });
    } else if (out.from === 'missing' || out.from === 'refused') said(out.fix, false);
  }

  function said(fix: string, missing: boolean) {
    toasts.push(fix, { intent: 'warn' });
    if (missing) gone = true;
  }
</script>

{#if !gone}
  <!-- THE ONE CARD HEAD, WITH ITS GLYPH (ui pass, 3 Nov): it was the only card in Settings with a bare name. -->
  <Tile icon="link" class="section" data-surface="tile" title={words.title}>
    <div class="section-body">
      {#if step.at === 'idle'}
        <div class="u-line">
          <p class="u-hint">{words.hint}</p>
          <Button disabled={busy !== null} aria-busy={busy === 'look' ? 'true' : undefined} onclick={() => void look()}
            >{busy === 'look' ? words.looking : words.look}</Button
          >
        </div>
      {:else}
        {@const l = step.look}
        <p class="u-said" role="status">{l.said}</p>
        {#if l.lines.length > 0}
          <ul class="u-lines">
            {#each l.lines as line, i (i)}<li class="u-row">{line}</li>{/each}
          </ul>
        {/if}
        {#if l.more}<p class="u-note">{l.more}</p>{/if}
        {#if l.asks}<p class="u-note">{l.asks}</p>{/if}
        {#if step.at === 'done' && !l.done}<p class="u-note">{words.nextPart}</p>{/if}
        <div class="u-do">
          {#if step.at === 'look'}
            {#if !l.empty}
              <Button weight="primary" disabled={busy !== null} aria-busy={busy === 'do' ? 'true' : undefined} onclick={() => void go()}
                >{words.doIt}</Button
              >
            {/if}
            <Button weight="bare" disabled={busy !== null} onclick={() => (step = { at: 'idle' })}>{words.notNow}</Button>
          {:else}
            {@const undo = step.undo}
            {#if undo.length > 0}
              <Button disabled={busy !== null} aria-busy={busy === 'undo' ? 'true' : undefined} onclick={() => void back(undo)}
                >{words.undo}</Button
              >
            {/if}
            {#if !l.done}
              <Button weight="bare" disabled={busy !== null} onclick={() => void look()}>{words.lookAgain}</Button>
            {/if}
            <Button weight="bare" disabled={busy !== null} onclick={() => (step = { at: 'idle' })}>{words.close}</Button>
          {/if}
        </div>
      {/if}
    </div>
  </Tile>
{/if}

<style>
  /* ONE LINE: what it does, and Look first at its end. Below 640px the button goes under the words. */
  .u-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
  }

  .u-hint,
  .u-said {
    flex: 1 1 auto;
    min-inline-size: 0;
    margin: 0;
    max-inline-size: var(--measure);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .u-hint {
    color: var(--ink-2);
  }

  .u-said {
    color: var(--ink);
  }

  @media (width < 640px) {
    .u-line {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .u-lines {
    display: grid;
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
    max-inline-size: var(--measure);
  }

  /* ONE CHANGE A LINE, a hairline between, as the run panel's. */
  .u-row {
    padding-block: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .u-row + .u-row {
    border-block-start: 1px solid var(--rule);
  }

  .u-note {
    margin: var(--sp-2) 0 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .u-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
