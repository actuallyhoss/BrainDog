<!--
  The white card: "It tells you where things stand." Maya's brief, with every figure in it opening where it comes from.

  FINISHED WITHOUT SCRIPTING. The prerendered brief says its figures as plain text, and the first figure's facts are
  drawn under it, so a reader with no script reads the sentence and one figure explained. Once the page runs, the
  figures become buttons (`aria-pressed` says which is open) and a press opens that figure's facts in place.
  The words are `copy/home.ts`; the sentence, its figures and their facts are Maya's record, `demo/maya.ts`.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { BRIEF, EVIDENCE, type EvidenceKey, type Figure } from '$lib/demo/maya.ts';

  const words = home.cards.brief;

  /* The first figure that opens something is open as the page loads, with scripting or without. */
  const first = BRIEF.parts.find((p): p is Figure => typeof p !== 'string' && p.key !== undefined);
  let open = $state<EvidenceKey>(first?.key ?? 'inv');
  const facts = $derived(EVIDENCE[open]);

  /* Buttons only once the script runs: before that a figure is text, so nothing on the page is a dead control. */
  let live = $state(false);
  $effect(() => {
    live = true;
  });
</script>

<article class="card paper reveal brief-card" aria-labelledby="brief-title">
  <div class="split">
    <div class="head">
      <h2 id="brief-title">{words.title}</h2>
      <p class="say">{words.say}</p>
    </div>
    <div class="tile">
      <p class="th"><Icon name="rows" size="s" />{words.label}</p>
      <p class="brief-big">
        {#each BRIEF.parts as part}{#if typeof part === 'string'}{part}{:else if live && part.key}{@const key = part.key}<button
              type="button"
              class="figbtn"
              class:late={part.late}
              aria-pressed={open === key}
              onclick={() => (open = key)}>{part.text}</button
            >{:else}<span class="fig" class:late={part.late}>{part.text}</span>{/if}{/each}
      </p>
      <div class="evidence" aria-live="polite">
        <p class="th"><Icon name="arrow-right" size="s" />{facts.head}<span class="r">{words.behind}</span></p>
        {#each facts.rows as [label, value]}
          <div class="ev"><span>{label}</span><b>{value}</b></div>
        {/each}
      </div>
    </div>
  </div>
</article>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 56px;
    align-items: center;
  }

  .tile {
    background: var(--tile);
    border-radius: 20px;
    padding: 26px;
    min-width: 0;
  }

  .th {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 500 12.5px/1.2 var(--ui);
    color: var(--ink2);
  }

  .th .r {
    margin-inline-start: auto;
  }

  .brief-big {
    font-size: var(--t-figure);
    line-height: 1.5;
    letter-spacing: -0.005em;
    margin: 0;
    text-wrap: pretty;
    color: var(--ink);
  }

  .fig,
  .figbtn {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .figbtn {
    all: unset;
    cursor: pointer;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    border-block-end: 2px solid var(--faint);
    line-height: 1.2;
    transition: background 0.15s;
  }

  .late {
    color: var(--red-ink);
  }

  .figbtn.late {
    border-bottom-color: color-mix(in srgb, var(--red) 55%, transparent);
  }

  .figbtn[aria-pressed='true'] {
    background: var(--red-tint);
    border-bottom-color: var(--red);
    border-radius: 3px;
  }

  .figbtn:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }

  .evidence {
    margin-block-start: 18px;
    padding-block-start: 16px;
    border-block-start: 1px dashed var(--rule);
    display: grid;
    gap: 8px;
  }

  .evidence .th {
    margin: 0 0 2px;
  }

  .ev {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    font-size: var(--t-site-small);
    padding: 9px 12px;
    background: var(--soft);
    border-radius: 9px;
    color: var(--ink);
  }

  .ev span {
    color: var(--muted);
  }

  .ev b {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  @media (pointer: coarse) {
    .figbtn {
      padding-block: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .figbtn {
      transition: none;
    }
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: 1fr;
      gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .tile {
      padding: 18px;
    }

    .brief-big {
      font-size: var(--t-site-18);
    }
  }
</style>
