<!--
  Settings > Health: what the record found to tidy in itself.

  THE RECORD'S HOUSEKEEPING LIVES HERE AND NOT ON TODAY (the audit of 22 October, U3). It stood under Today's More: what
  went stale, who the record matched, what it found wrong in its own pages and notes, what the answers taught, what may
  be one, what has no colour, and the imported automations to keep as filing rules. Today is his desk, and these are the
  record looking after itself; the walk of every page and note held his whole record for about ten seconds on an open.

  READ ONLY WHEN THIS AREA OPENS, one at a time and each when the tab is idle, as Today read them: the record answers one
  call at a time, so seven asked at once were seven places in its queue ahead of the next screen. Each part and its
  reader are fetched as they are asked for, so Settings carries none of them until somebody opens Health.

  A PART THAT FINDS NOTHING DRAWS NOTHING, and a read that fails is not drawn. With all of them heard and none holding
  anything, one calm line says so.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { idle } from '$lib/ui/idle.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import type { Fetch } from '$lib/record/boot-live.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  const words = {
    reading: 'Reading the record for anything to tidy.',
    clear: 'Nothing to tidy',
    clearBody: 'Every page and note reads as it should, and nothing has gone stale.',
  } as const;

  type StalePart = typeof import('$lib/home/Stale.svelte').default;
  type MatchedPart = typeof import('$lib/home/Matched.svelte').default;
  type FaultsPart = typeof import('$lib/home/TextFaults.svelte').default;
  type LearnedPart = typeof import('$lib/home/Learned.svelte').default;
  type NamedPart = typeof import('$lib/home/NamedTwice.svelte').default;
  type HuesPart = typeof import('$lib/home/Hues.svelte').default;
  type ImportedPart = typeof import('$lib/home/ImportedRules.svelte').default;

  let stale = $state.raw<{ rows: readonly import('$lib/home/stale.ts').StaleRow[]; Part: StalePart } | null>(null);
  let matched = $state.raw<{ rows: readonly import('$lib/home/matched.ts').MatchedRow[]; Part: MatchedPart } | null>(null);
  let faults = $state.raw<{ found: import('$lib/home/text-faults.ts').TextFaults; Part: FaultsPart } | null>(null);
  let learned = $state.raw<{ found: import('$lib/home/learned.ts').Learned; Part: LearnedPart } | null>(null);
  let named = $state.raw<{ found: import('$lib/home/named-twice.ts').NamedTile; Part: NamedPart } | null>(null);
  let hues = $state.raw<{ found: import('$lib/home/hues.ts').HuesFound; Part: HuesPart } | null>(null);
  let imported = $state.raw<{ found: import('$lib/home/imported-rules.ts').ImportedFound; Part: ImportedPart } | null>(null);
  /** Whether every part has answered, so the calm line is said only once nothing is left to land. */
  let heard = $state(false);

  const any = $derived(Boolean(stale || matched || faults || learned || named || hues || imported));

  onMount(() => {
    if (shell.refused) {
      heard = true;
      return;
    }
    const base = apiBase();
    let here = true;
    /* A TAB BEING LEFT ASKS NOTHING MORE: WebKit refuses every call begun once a navigation starts and prints each as an
       error, and a failed part walks on to the next. `beforeunload` is the last event before that. */
    const leaving = new AbortController();
    const leave = () => leaving.abort();
    addEventListener('beforeunload', leave);
    const io: Fetch = (url, init) => fetch(url, { ...init, signal: leaving.signal });
    const parts: (() => Promise<unknown>)[] = [
      /* WHAT THE RECORD FOUND WRONG IN ITS OWN PAGES AND NOTES: the long walk, kept for the tab (`textFaultsOnce`). */
      () =>
        Promise.all([import('$lib/home/text-faults.ts'), import('$lib/home/TextFaults.svelte')]).then(async ([m, part]) => {
          const found = await m.textFaultsOnce(base, io);
          if (here) faults = found && found.count > 0 ? { found, Part: part.default } : null;
        }),
      /* WHAT WENT STALE, AND WHERE EACH IS CLEARED. */
      () =>
        Promise.all([import('$lib/home/stale.ts'), import('$lib/home/Stale.svelte')]).then(async ([m, part]) => {
          const out = await m.readStale(base, io);
          if (here) stale = out.value.length > 0 ? { rows: out.value, Part: part.default } : null;
        }),
      /* WHO THE RECORD MATCHED ON ITS OWN. */
      () =>
        Promise.all([import('$lib/home/matched.ts'), import('$lib/home/Matched.svelte')]).then(async ([m, part]) => {
          const out = await m.readMatched(base, io);
          if (here) matched = out.value.length > 0 ? { rows: out.value, Part: part.default } : null;
        }),
      /* WHAT THE ANSWERS TAUGHT: what the record will not ask again. */
      () =>
        Promise.all([import('$lib/home/learned.ts'), import('$lib/home/Learned.svelte')]).then(async ([m, part]) => {
          const found = await m.loadLearned(base, io);
          if (here) learned = found && found.rows.length > 0 ? { found, Part: part.default } : null;
        }),
      /* WHAT MAY BE ONE: a pair to put to Needs you. */
      () =>
        Promise.all([import('$lib/home/named-twice.ts'), import('$lib/home/NamedTwice.svelte')]).then(async ([m, part]) => {
          const found = await m.loadNamedTwice(base, io);
          if (here) named = found && (found.lines.length > 0 || found.people > 0) ? { found, Part: part.default } : null;
        }),
      /* WHAT HAS NO COLOUR OF ITS OWN: one press gives each its own. */
      () =>
        Promise.all([import('$lib/home/hues.ts'), import('$lib/home/Hues.svelte')]).then(async ([m, part]) => {
          const found = await m.loadHues(base, io);
          if (here) hues = found && found.lists.length > 0 ? { found, Part: part.default } : null;
        }),
      /* IMPORTED AUTOMATIONS AS FILING RULES. Never set back to none here: after the press the automations are off and a
         read finds none, and the part must keep its Undo. */
      () =>
        Promise.all([import('$lib/home/imported-rules.ts'), import('$lib/home/ImportedRules.svelte')]).then(async ([m, part]) => {
          const found = await m.loadImported(base, io);
          if (here && found && found.rules.length > 0) imported = { found, Part: part.default };
        }),
    ];
    void (async () => {
      for (const part of parts) {
        await idle();
        if (!here || leaving.signal.aborted) break;
        /* A PART THAT FAILS IS NOT DRAWN, and the next is still asked. */
        await part().catch(() => undefined);
      }
      if (here) heard = true;
      removeEventListener('beforeunload', leave);
    })();
    return () => {
      here = false;
      removeEventListener('beforeunload', leave);
    };
  });
</script>

<div class="health" data-health>
  {#if faults}<faults.Part found={faults.found} lists={shell.lists} />{/if}
  {#if stale}<stale.Part rows={stale.rows} />{/if}
  {#if matched}<matched.Part rows={matched.rows} />{/if}
  {#if learned}<learned.Part found={learned.found} />{/if}
  {#if named}<named.Part found={named.found} />{/if}
  {#if hues}<hues.Part found={hues.found} />{/if}
  {#if imported}<imported.Part found={imported.found} />{/if}
  {#if !heard}
    <p class="health-reading" role="status">{words.reading}</p>
  {:else if !any}
    <Empty kind="cleared" title={words.clear} body={words.clearBody} />
  {/if}
</div>

<style>
  .health {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .health-reading {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
</style>
