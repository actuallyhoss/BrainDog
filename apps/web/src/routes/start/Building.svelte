<!--
  The BrainDog building beside the words, before there is an account: sign-up's half of describe-then-build.

  THE SAME PARTS /start DRAWS, FROM THE SAME READING. Every part it can make lights up as the sentence asks for it
  (`building.ts` `partsOf`, `stepsOf`), each phrase heard is said with what it became, and each part that is on is its
  own tile (`Part`, live, with no switch: nothing is decided here). Under them, the pages it would make, by name and
  place (`PagesPreview` with no calls, which draws the rail): drawing them needs a record, and there is none yet.

  NOT A LIVE REGION WHILE TYPING, or a screen reader would be told on every key. The one sentence that reads the
  progress aloud sits in the tile, hidden, and is read when the person goes looking.

  WHAT JUST CAME ON takes the arrival tint for a second and a half, as on /start.
-->
<script lang="ts">
  import { firstRun } from '$lib/first-run.ts';
  import type { Proposal } from '$lib/start/propose.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { iconOfBecame, stepsOf, words, type Part as PartOf } from './building.ts';
  import PagesPreview from './PagesPreview.svelte';
  import Part from './Part.svelte';

  let {
    parts,
    heard,
    rail,
    locale,
  }: {
    parts: readonly PartOf[];
    heard: Proposal['heard'];
    rail: readonly { section: string; pages: readonly string[] }[];
    locale: string;
  } = $props();

  const steps = $derived(stepsOf(parts));
  const onParts = $derived(parts.filter((p) => p.on));
  const waiting = $derived(steps.order.find((p) => p.state === 'waiting')?.name ?? null);
  const onNames = $derived(steps.order.filter((p) => p.on && p.state !== 'waiting').map((p) => p.name));

  let fresh = $state.raw<Set<string>>(new Set());
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = new Set([...onParts.map((p) => `part:${p.id}`), ...onParts.flatMap((p) => p.entries.map((e) => e.key))]);
    const was = seen;
    seen = now;
    if (was === null) return;
    const came = [...now].filter((k) => !was.has(k));
    if (came.length === 0) return;
    fresh = new Set([...fresh, ...came]);
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = new Set()), 1500);
  });
  $effect(() => () => clearTimeout(fading));
</script>

<div class="building">
  <Tile icon="home" title={onNames.length === 0 || waiting ? words.building : words.ready} count={words.parts(onNames.length + (waiting ? 1 : 0), parts.length)}>
    <p class="sr">{words.progress(onNames, waiting, steps.order.filter((p) => !p.on).map((p) => p.name))}</p>
    <ol class="lights" aria-hidden="true">
      {#each steps.order as p (p.id)}
        <li class="light" data-state={p.state} data-arrived={fresh.has(`part:${p.id}`) ? '' : undefined}>
          <IconWell name={p.icon} tone={p.state === 'waiting' ? 'danger' : p.on ? 'ink' : undefined} />
          <span class="light-name">{p.name}</span>
        </li>
      {/each}
    </ol>
    {#if heard.length > 0}
      <ul class="heard">
        {#each heard as h, i (i)}
          <li class="heard-one">
            <IconWell name={iconOfBecame(h.became)} />
            <span class="heard-main">
              <q class="phrase">{h.phrase}</q>
              <span class="became"><span class="sr">: </span>{h.became}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="reading">
      {#if onNames.length === 0 && !waiting}{words.lightsUp}{:else}{words.onReading(onNames, waiting)}{/if}
      {words.nothingSaved}
    </p>
  </Tile>

  {#if onParts.length > 0}
    <div class="parts" role="group" aria-label={firstRun.mineKeeps}>
      {#each onParts as p (p.id)}
        <Part part={p} live {locale} arrived={fresh.has(`part:${p.id}`)} {fresh} />
      {/each}
    </div>
  {/if}

  {#if rail.length > 0}
    <PagesPreview asked={[]} {rail} />
  {/if}
</div>

<style>
  .building,
  .parts {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  /* TWO PART TILES TO A ROW WHERE THE BUILD IS WIDE, so a full window is used rather than one long column. */
  @media (width >= 1280px) {
    .parts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }

  .building :global(.tile) {
    transition: background-color 1500ms var(--ease-out);
  }

  .building :global(.tile[data-arrived]) {
    background: var(--arrived-wash);
    transition: none;
  }

  .lights {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
    gap: var(--sp-3) var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .light {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    padding-block: var(--sp-1);
    border-radius: var(--r-md);
    min-inline-size: 0;
    transition: background-color 1500ms var(--ease-out);
  }

  .light[data-arrived] {
    background: var(--arrived-wash);
    transition: none;
  }

  .light-name {
    max-inline-size: 100%;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .light[data-state='waiting'] .light-name {
    color: var(--danger-text);
  }

  .light[data-state='off'] .light-name {
    color: var(--dim);
    font-weight: 400;
  }

  .heard {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-3) 0 0;
    border-block-start: 1px solid var(--line);
    list-style: none;
  }

  .heard-one {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    animation: heard-in var(--d-enter) var(--ease-out) both;
  }

  @keyframes heard-in {
    from {
      opacity: 0;
    }
  }

  .heard-main {
    display: grid;
    min-inline-size: 0;
  }

  .phrase {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .became {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .heard-one {
      animation: none;
    }
  }
</style>
