<!--
  How it works with agents: three steps, drawn rather than described.

  THE ONE CHAIN IN THE DEMO THAT RUNS FROM AN ARRIVAL TO ROWS. The Fenwick invoice (`in_8f21`), the
  question it raised (`SG33`), the answer and the reason it was given, and the two rows written
  (`services#6`, `services#7`). Every word is in `copy.ts`.

  THE STEPPER IS THE ORDER, AND THE MOTION IS ONLY THE ORDER. Each node lights when its step
  happens and the rail between two nodes fills as the next begins. At rest, and under reduced
  motion, all three are lit and every card shows its finished state.

  The drawings are `aria-hidden`: each step's title and sentence are the content, and the card
  under them is the picture of that sentence.
-->
<script lang="ts">
  import Face from './Face.svelte';
  import Icon from './Icon.svelte';
  import { site } from './copy.ts';

  const s = site.steps;
</script>

<ol class="steps">
  <li class="step s1">
    <div class="node"><span class="n num">1</span><span class="rail" aria-hidden="true"></span></div>
    <h3 class="step-title">{s.items[0].title}</h3>
    <p class="step-body">{s.items[0].body}</p>
    <div class="card" aria-hidden="true">
      <p class="mail"><Icon name="inbox" size="s" /><span class="mail-from">{s.mail.from}</span></p>
      <p class="subject">{s.mail.subject}</p>
      <p class="by"><Face name={s.proposer} size="s" /><b>{s.proposer}</b> {s.proposes}</p>
      <ul class="drafts">
        {#each s.drafts as d, i}
          <li class="draft" style="--i: {i}"><Icon name="plus" size="s" /><span class="draft-name">{d.name}</span><span class="cost num">{d.cost}</span></li>
        {/each}
      </ul>
    </div>
  </li>

  <li class="step s2">
    <div class="node"><span class="n num">2</span><span class="rail rail-2" aria-hidden="true"></span></div>
    <h3 class="step-title">{s.items[1].title}</h3>
    <p class="step-body">{s.items[1].body}</p>
    <div class="card" aria-hidden="true">
      <p class="q-title"><span class="ask"><Icon name="ask" size="s" /></span>{s.question}</p>
      <ul class="opts">
        {#each s.options as o}
          <li class="opt" class:rec={o.recommended}>
            <span class="opt-title">{o.title}</span>
            {#if o.recommended}<span class="badge">{s.recommended}</span>{/if}
          </li>
        {/each}
      </ul>
    </div>
  </li>

  <li class="step s3">
    <div class="node"><span class="n num">3</span></div>
    <h3 class="step-title">{s.items[2].title}</h3>
    <p class="step-body">{s.items[2].body}</p>
    <div class="card" aria-hidden="true">
      <p class="answered"><Face name="You" size="s" /><b>{s.answered}</b></p>
      <p class="reason">{s.reason}</p>
      <ul class="written">
        {#each s.written as w, i}
          <li class="row" style="--i: {i}">
            <span class="seq num">{w.seq}</span>
            <Face name={s.writer} size="s" />
            <span class="row-main"><span class="row-id">{w.id}</span> {w.name}</span>
            <span class="age">{s.age}</span>
          </li>
        {/each}
      </ul>
    </div>
  </li>
</ol>

<style>
  .steps {
    --gap: var(--sp-5);
    --loop: 12s;
    --i: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    position: relative;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .node {
    position: relative;
    display: flex;
    align-items: center;
    block-size: 32px;
  }

  /* Left as a literal on purpose, same reasoning as `apps/web`'s `.block-slot[data-drop]::after`:
     the app's `--z-*` scale (`--z-sheet --z-palette --z-toast --z-hint` in `tokens.css`) names
     global overlay tiers, and this is a local stacking need only, the node dot sitting in front of
     the rail line drawn behind it within one `.step`. None of the four names fit a "above my own
     background, nothing else" case, so this stays a plain `1` rather than borrowing a tier that
     means something else. */
  .n {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--accent);
    border-radius: var(--r-pill);
    box-shadow: 0 0 0 6px var(--bg);
    color: var(--accent-ink);
    font-size: var(--t-sm);
    font-weight: 700;
  }

  /* The rail runs from this node, across the gap, to the next one. `::after` is the filled half. */
  .rail {
    position: absolute;
    inset-inline: 32px calc(var(--gap) * -1);
    inset-block-start: 15px;
    block-size: 2px;
    background: var(--line);
  }

  .rail::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--accent);
  }

  .step-title {
    margin-block-start: var(--sp-4);
    font-size: var(--t-lg);
    line-height: 1.25;
    letter-spacing: -0.018em;
    text-wrap: balance;
  }

  .step-body {
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e2);
    font-size: var(--t-sm);
  }

  .mail {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .mail-from,
  .draft-name,
  .row-main {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subject {
    color: var(--ink);
    font-weight: 600;
  }

  .by,
  .answered {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .by b,
  .answered b {
    color: var(--ink);
    font-weight: 600;
  }

  .drafts,
  .opts,
  .written {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .draft {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block: 6px;
    padding-inline: var(--sp-2);
    background: var(--s2);
    border: 1px dashed var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-text);
  }

  .draft-name {
    flex: 1;
    color: var(--ink);
  }

  .cost {
    color: var(--ink2);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  .q-title {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--ink);
    font-weight: 600;
    line-height: 1.35;
  }

  .ask {
    display: flex;
    align-items: center;
    block-size: 1.35em;
    color: var(--accent-text);
  }

  .opt {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block: 7px;
    padding-inline: var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink);
  }

  .opt.rec {
    border-color: var(--accent);
  }

  .opt-title {
    flex: 1;
  }

  .badge {
    padding-block: 1px;
    padding-inline: 8px;
    background: var(--accent-wash);
    border-radius: var(--r-pill);
    color: var(--accent-text);
    font-size: var(--t-xs);
    font-weight: 600;
    white-space: nowrap;
  }

  .reason {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .row {
    display: grid;
    grid-template-columns: 4.5ch auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
    padding-block: 6px;
    padding-inline: var(--sp-2);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .seq,
  .row-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .age {
    color: var(--dim);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  /**
   * ON ONE COLUMN THE STEPPER TURNS ON ITS SIDE. The nodes run down the inline-start edge, the rail
   * drops from each to the next, and everything else in a step sits beside its node, so the order
   * still reads as a line rather than as three cards stacked.
   */
  @media (width < 960px) {
    .steps {
      --gap: var(--sp-6);
      grid-template-columns: minmax(0, 1fr);
    }

    .step {
      padding-inline-start: 48px;
    }

    .node {
      position: absolute;
      inset-block: 0 calc(var(--gap) * -1);
      inset-inline-start: 0;
      align-items: flex-start;
      block-size: auto;
    }

    .rail {
      inset-inline: 15px auto;
      inset-block: 32px 0;
      inline-size: 2px;
      block-size: auto;
    }

    .step-title {
      margin-block-start: 4px;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .s2 .n {
      animation: light-2 var(--loop) linear infinite both;
    }

    .s3 .n {
      animation: light-3 var(--loop) linear infinite both;
    }

    .rail::after {
      animation: rail-1 var(--loop) var(--ease-out) infinite both;
    }

    .rail-2::after {
      animation-name: rail-2;
    }

    .draft {
      animation: draft var(--loop) var(--ease-spring) calc(0.5s * var(--i)) infinite both;
    }

    .s2 .badge {
      animation: badge var(--loop) var(--ease-out) infinite both;
    }

    .s2 .rec {
      animation: choose var(--loop) var(--ease-out) infinite both;
    }

    .answered,
    .reason {
      animation: answer var(--loop) var(--ease-out) infinite both;
    }

    .row {
      animation: row var(--loop) var(--ease-spring) calc(0.4s * var(--i)) infinite both;
    }

    .steps:hover * {
      animation-play-state: paused;
    }
  }

  @keyframes light-2 {
    0%,
    32% {
      background: var(--s2);
      color: var(--ink2);
    }

    35%,
    100% {
      background: var(--accent);
      color: var(--accent-ink);
    }
  }

  @keyframes light-3 {
    0%,
    65% {
      background: var(--s2);
      color: var(--ink2);
    }

    68%,
    100% {
      background: var(--accent);
      color: var(--accent-ink);
    }
  }

  @keyframes rail-1 {
    0%,
    24% {
      opacity: 0;
    }

    32%,
    100% {
      opacity: 1;
    }
  }

  @keyframes rail-2 {
    0%,
    57% {
      opacity: 0;
    }

    65%,
    100% {
      opacity: 1;
    }
  }

  @keyframes draft {
    0%,
    6% {
      opacity: 0;
      transform: translateY(8px);
    }

    14%,
    96% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
    }
  }

  @keyframes badge {
    0%,
    38% {
      opacity: 0;
      transform: translateY(4px);
    }

    44%,
    96% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
    }
  }

  @keyframes choose {
    0%,
    46% {
      box-shadow: none;
    }

    52% {
      box-shadow: 0 0 0 4px var(--accent-wash);
    }

    60%,
    100% {
      box-shadow: none;
    }
  }

  @keyframes answer {
    0%,
    68% {
      opacity: 0;
      transform: translateY(6px);
    }

    74%,
    96% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
    }
  }

  @keyframes row {
    0%,
    76% {
      opacity: 0;
      transform: translateY(8px);
    }

    82%,
    96% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
    }
  }
</style>
