<!--
  A draft's three presses, where the draft shows: Keep, Try again and Throw away, under its card in the
  strip and over its page in the viewer. Keep is the one primary. Try again is offered only on a version a run drew,
  since it asks that run to draw it again (`held.ts` `mayAskAgain`).

  EACH PRESS IS THE RECORD'S `settleVisual`, and says what happened in the record's own sentence, which `onsettled` is
  handed so what holds it can read the thing again. A press already on its way holds the other two.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import { mayAskAgain, settle, visualWords as words, type Press } from './held.ts';

  let {
    id,
    version,
    by,
    title,
    onsettled,
  }: {
    /** The visual, and the draft's version: the press names it, so a newer draft is never settled by an older screen. */
    id: string;
    version: number;
    /** Who drew the draft, as the record signs it. */
    by: string;
    /** The visual's title, so each press is named for a screen reader. */
    title: string;
    /** Said after a press went through, with the record's sentence. */
    onsettled?: ((said: string) => void) | undefined;
  } = $props();

  let busy = $state<Press | null>(null);
  let fix = $state('');

  async function press(as: Press) {
    if (busy) return;
    busy = as;
    fix = '';
    const out = await settle(apiBase(), id, version, as);
    busy = null;
    if (!out.ok) {
      fix = out.fix;
      return;
    }
    onsettled?.(out.value.said);
  }
</script>

<div class="db" role="group" aria-label="{words.draft}: {title}">
  <span class="db-mark">{words.draft}</span>
  <div class="db-do">
    <Button size="sm" weight="primary" disabled={busy !== null} onclick={() => void press('keep')} data-press="keep">{busy === 'keep' ? words.settling : words.keepDraft}</Button>
    {#if mayAskAgain(by)}
      <Button size="sm" disabled={busy !== null} onclick={() => void press('again')} data-press="again">{busy === 'again' ? words.settling : words.again}</Button>
    {/if}
    <Button size="sm" weight="bare" disabled={busy !== null} onclick={() => void press('throw')} data-press="throw">{busy === 'throw' ? words.settling : words.throwAway}</Button>
  </div>
  {#if fix}<p class="db-fix" role="status">{fix}</p>{/if}
</div>

<style>
  .db {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    min-inline-size: 0;
  }

  .db-mark {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--r-xs);
    background: color-mix(in srgb, var(--link) 14%, transparent);
    color: var(--link);
    font-size: var(--fs-cap);
    font-weight: 600;
  }

  .db-do {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-inline-size: 0;
  }

  .db-fix {
    flex-basis: 100%;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }
</style>
