<!--
  Settings > Tidy up (Health until 25 October): what the record found to tidy in itself.

  THE RECORD'S HOUSEKEEPING LIVES HERE AND NOT ON TODAY. It stood under Today's More: what
  went stale, who the record matched, what it found wrong in its own pages and notes, what the answers taught, what may
  be one, what has no colour, and the imported automations to keep as filing rules. Today is his desk, and these are the
  record looking after itself; the walk of every page and note held his whole record for about ten seconds on an open.

  READ ONLY WHEN THIS AREA OPENS, one at a time and each when the tab is idle, as Today read them: the record answers one
  call at a time, so seven asked at once were seven places in its queue ahead of the next screen. Each part and its
  reader are fetched as they are asked for, so Settings carries none of them until somebody opens Health.

  A PART THAT FINDS NOTHING DRAWS NOTHING, and a read that fails is not drawn. With all of them heard and none holding
  anything, one calm line says so. THE WORDS ARE WALKED AT NIGHT: before the record's first night pass its answer says
  not checked yet (`notChecked`), and that is said in its place, never as nothing to fix.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { idle } from '$lib/ui/idle.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import type { Fetch } from '$lib/record/boot-live.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import Understand from '../Understand.svelte';

  let { shell }: AreaProps = $props();

  /* THE OWNER'S, as the record's `understand` is (People & sharing held it until 25 October). */
  const s = settingsState(() => shell);

  const words = {
    reading: 'Reading the record for anything to tidy.',
    readingPages: 'Still reading every page and note.',
    clear: 'Nothing to tidy',
    clearBody: 'Every page and note reads as it should, and nothing has gone stale.',
    pages: 'Pages and notes',
    notYet: 'Not checked yet, it runs at night.',
    slow: 'The record is slow to answer',
    slowBody: 'Nothing was found to tidy yet, and the rest did not answer in time. Open this page again in a moment.',
    clearBodyUnchecked: 'Nothing has gone stale, and nothing else waits to be tidied.',
    lateBody: 'Nothing was found to tidy yet, and the rest is still being read.',
    health: 'Whether BrainDog itself is running well is on its own page.',
    healthGo: 'Open Health',
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
  /** Whether every part but the long walk of pages and notes has answered. */
  let quick = $state(false);
  /** Whether the record has not walked its words yet: said as not checked, and the calm line does not vouch for them. */
  let unchecked = $state(false);

  /** Whether the reads took longer than anyone waits: said in plain words, never left on Reading. */
  let slow = $state(false);
  /**
   * WHETHER THE QUICK PARTS ARE LATE: eight seconds and some still out. "Reading the record
   * for anything to tidy." stood alone for as long as the slowest of them took on his record, so past eight seconds it
   * says what it has, that the record is slow, and reads on under it.
   */
  let late = $state(false);

  const any = $derived(Boolean(stale || matched || faults || learned || named || hues || imported));

  onMount(() => {
    if (shell.refused) {
      heard = true;
      return;
    }
    const base = apiBase();
    let here = true;
    /* A SCREEN NEVER SITS ON READING FOR EVER: after 20 seconds it says what it has, or that the record is slow. */
    const giveUp = setTimeout(() => {
      if (!here || heard) return;
      slow = true;
      quick = true;
      heard = true;
    }, 20_000);
    const lateAfter = setTimeout(() => {
      if (here && !quick) late = true;
    }, 8_000);
    /* A TAB BEING LEFT ASKS NOTHING MORE: WebKit refuses every call begun once a navigation starts and prints each as an
       error, and a failed part walks on to the next. `beforeunload` is the last event before that. */
    const leaving = new AbortController();
    const leave = () => leaving.abort();
    addEventListener('beforeunload', leave);
    const io: Fetch = (url, init) => fetch(url, { ...init, signal: leaving.signal });
    const parts: (() => Promise<unknown>)[] = [
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
      /* WHAT THE RECORD FOUND WRONG IN ITS OWN PAGES AND NOTES: the long walk, kept for the tab (`textFaultsOnce`), and every
         thing the night's page lint found the pages print raw (`printed`). LAST: it
         was asked first, and on his record its 11 to 16 seconds held the six quick parts behind it, so Health said
         "Reading the record for anything to tidy." long after it said it was drawn. */
      () =>
        Promise.all([import('$lib/home/text-faults.ts'), import('$lib/home/TextFaults.svelte')]).then(async ([m, part]) => {
          const found = await m.textFaultsOnce(base, io);
          if (!here) return;
          unchecked = m.notChecked(found);
          faults = found && m.anyFound(found) ? { found, Part: part.default } : null;
        }),
    ];
    /* THE SCREEN IS DRAWN ONCE ITS FIRST PART HAS ANSWERED, and not on the shell alone: one call is held open until
       then, so `data-screen` waits for it (`screen.svelte.ts`). */
    let first: number | null = opened();
    const drawn = (): void => {
      if (first === null) return;
      closed(true, first);
      first = null;
    };
    let asked = 0;
    void (async () => {
      for (const part of parts) {
        await idle();
        if (!here || leaving.signal.aborted) break;
        /* A PART THAT FAILS IS NOT DRAWN, and the next is still asked. */
        await part().catch(() => undefined);
        drawn();
        /* THE QUICK PARTS HEARD: what they found is drawn, or that there is nothing, while the walk reads on. */
        asked += 1;
        if (here && asked === parts.length - 1) quick = true;
      }
      drawn();
      if (here) heard = true;
      removeEventListener('beforeunload', leave);
    })();
    return () => {
      clearTimeout(giveUp);
      clearTimeout(lateAfter);
      here = false;
      removeEventListener('beforeunload', leave);
    };
  });
</script>

<div class="health" data-health>
  <!-- WHAT IS ALWAYS HERE COMES FIRST, AND WHAT IS READ COMES UNDER IT (leftovers8). The pointer to Health and Read what you
       already have stood under the parts, and each part that landed pushed them down a phone's screen: 0.662 on a cold
       open, the walk of pages and notes landing on top last of all. Now nothing that is drawn at once stands under
       anything that is read. -->
  <!-- HEALTH COUNTS SOMETHING ELSE, its checks, and the two pages point at each other so neither count is read as the
       other's. -->
  {#if shell.pages.includes('health')}
    <p class="health-reading">{words.health} <a class="tap" href={at('/p/health')}>{words.healthGo}</a></p>
  {/if}
  <!-- READ WHAT YOU ALREADY HAVE: the record's walk linking old payments, runs and services to who and what they are
       about, a dry look first and then Do it. Tidying the record, so it is here and not in the sharing screen. -->
  {#if s.anOwner}<Understand />{/if}
  <!-- THE QUICK PARTS ARE DRAWN TOGETHER, once all of them have answered, in the reading line's place: one by one, each
       moved the line and the parts before it. -->
  {#if quick || heard}
    {#if stale}<stale.Part rows={stale.rows} />{/if}
    {#if matched}<matched.Part rows={matched.rows} />{/if}
    {#if learned}<learned.Part found={learned.found} />{/if}
    {#if named}<named.Part found={named.found} />{/if}
    {#if hues}<hues.Part found={hues.found} />{/if}
    {#if imported}<imported.Part found={imported.found} />{/if}
  {/if}
  {#if !any && !heard && !quick && !late}
    <p class="health-reading" role="status">{words.reading}</p>
  {:else if !any && !heard && !quick}
    <Empty kind="error" title={words.slow} body={words.lateBody} />
  {:else if !any && !heard}
    <!-- THE QUICK PARTS FOUND NOTHING, and the walk of pages and notes is still out: the calm line vouches only for them. -->
    <Empty kind="cleared" title={words.clear} body={words.clearBodyUnchecked} />
  {:else if !any && slow}
    <Empty kind="error" title={words.slow} body={words.slowBody} />
  {:else if !any}
    <Empty kind="cleared" title={words.clear} body={unchecked ? words.clearBodyUnchecked : words.clearBody} />
  {/if}
  <!-- THE LONG WALK OF PAGES AND NOTES LANDS LAST, SO IT IS DRAWN LAST, where its line stood. -->
  {#if unchecked}
    <section class="health-part" aria-labelledby="health-pages">
      <h2 class="health-h" id="health-pages">{words.pages}</h2>
      <p class="health-said">{words.notYet}</p>
    </section>
  {/if}
  {#if faults}<faults.Part found={faults.found} lists={shell.lists} />{/if}
  <!-- ONCE A PART HAS LANDED THE READING LINE GOES: what is drawn says the record answered, and "Reading the record for
       anything to tidy." under it read as stuck. Only the long walk of pages and notes is still said while it runs. -->
  {#if quick && !heard && !any}
    <p class="health-reading" role="status">{words.readingPages}</p>
  {/if}
</div>

<style>
  .health {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* A PART OF ITS OWN, flat as the tiles beside it: the name of what was not checked, and the plain line under it. */
  .health-part {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .health-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lh-body);
  }

  .health-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .health-reading {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
</style>
