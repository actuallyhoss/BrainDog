<!--
  The hero: the demo record's home screen, filling up while you watch.

  IT REPLACED `Preview.svelte`, which drew the same screen standing still. A still picture of a
  record is a picture of a database; the thing BrainDog is about is that the record moves while you
  are away and asks you about what matters. So the feed replays the demo's own "since you were away"
  oldest first, and "What needs you" gains the two questions that arrived in the same hours.

  NOTHING HERE IS INVENTED. Every word is in `copy.ts`, read off the demo record.

  THE MOTION, and the three rules it keeps:
    - IT CANNOT MOVE THE PAGE. Every row is a fixed height and every list sits in a box of fixed
      height, so an arrival is a transform on the list inside the box, never a change of size. The
      page under the hero does not jump once per loop.
    - THE RESTING STYLE IS THE FINISHED SCREEN. Every animation lives inside
      `prefers-reduced-motion: no-preference`, so a reader who has asked for no motion, and a
      checker that measures contrast, gets all four questions and the whole feed, standing still.
    - IT PAUSES UNDER THE POINTER, because somebody hovering is somebody reading.

  `role="img"` with one sentence, so a screen reader hears what the picture shows once rather than
  being walked through a sidebar that does nothing.
-->
<script lang="ts">
  import Face from './Face.svelte';
  import Icon from './Icon.svelte';
  import ProjectMark from './ProjectMark.svelte';
  import { site } from './copy.ts';

  const m = site.moment;

  /* When each arrival lands, as a fraction of one loop. Both lists are newest first, so the last to
     arrive is the first row. These match the stops in `@keyframes feed` and `@keyframes needs`. */
  const FEED_AT = [0.64, 0.44, 0.28, 0.08];
  const NEEDS_AT = [0.48, 0.12];
  /* The two oldest feed rows are pushed out of the box by the end, so at rest they are hidden. */
  const FEED_SHOWN = 4;
</script>

<div class="moment" role="img" aria-label={m.label}>
  <div class="win">
    <div class="top">
      <p class="org"><span class="org-mark">{m.initial}</span>{m.record}</p>
      <p class="date">{m.date}</p>
      <p class="pending">
        <span class="odo num"><span class="odo-col">{#each m.counts as c}<span>{c}</span>{/each}</span></span>
        {m.pending}
      </p>
    </div>

    <div class="panes">
      <div class="pane">
        <p class="h"><Icon name="decide" size="s" />{m.needsTitle}</p>
        <div class="box needs-box">
          <ul class="list needs">
            {#each m.needs as need, i}
              {@const project = need.project ? site.projects[need.project] : null}
              <li class="need" class:arrive={i < NEEDS_AT.length} style="--at: {NEEDS_AT[i] ?? 0}">
                <span class="ask"><Icon name="ask" size="s" /></span>
                <span class="need-main">
                  <span class="need-title">{need.title}</span>
                  {#if need.recommends}
                    <span class="need-sub">{m.recommends} <b>{need.recommends}</b></span>
                  {:else}
                    <span class="need-sub">{need.cost}</span>
                  {/if}
                </span>
                {#if project}
                  <span class="proj"><ProjectMark mark={project.mark} hue={project.hue} /><span class="proj-name">{project.name}</span></span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="pane">
        <p class="h"><Icon name="clock" size="s" />{m.feedTitle}</p>
        <div class="box feed-box">
          <ul class="list feed">
            {#each m.feed as event, i}
              <li
                class="event"
                class:arrive={i < FEED_AT.length}
                class:gone={i >= FEED_SHOWN}
                style="--at: {FEED_AT[i] ?? 0}"
              >
                <span class="event-face"><Face name={event.who} size="s" /></span>
                <span class="who">{event.who}</span>
                <span class="age">{event.age}</span>
                <span class="what" class:typed={i === 0}>{event.what}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .moment {
    --loop: 16s;
    --at: 0;
    /* One row of each list, border included. Fixed, so a list can be moved by exactly one row. */
    --nrow: 58px;
    --frow: 56px;
    position: relative;
    isolation: isolate;
  }

  /* A pool of the accent behind the window, inset from both edges so it can never widen the page. */
  .moment::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-block: -12% 18%;
    inset-inline: 2%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 24%, transparent), transparent);
  }

  .win {
    overflow: hidden;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    color: var(--ink);
    font-size: var(--t-sm);
    line-height: 1.4;
    text-align: start;
  }

  .top {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    padding-inline: var(--sp-4);
    background: var(--bg);
    border-block-end: 1px solid var(--line);
  }

  .org {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
    white-space: nowrap;
  }

  .org-mark {
    display: inline-grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    background: var(--accent-wash);
    border-radius: var(--r-sm);
    color: var(--accent-text);
    font-size: var(--t-xs);
    font-weight: 700;
  }

  .date {
    margin-inline-start: auto;
    color: var(--dim);
    white-space: nowrap;
  }

  .pending {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-block: 3px;
    padding-inline: 10px;
    background: var(--accent-wash);
    border-radius: var(--r-pill);
    color: var(--accent-text);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 16px;
    white-space: nowrap;
  }

  /* An odometer: three figures in a column, one line of it showing. At rest it shows the last. */
  .odo {
    display: inline-block;
    block-size: 16px;
    overflow: hidden;
  }

  .odo-col {
    display: flex;
    flex-direction: column;
    transform: translateY(-32px);
  }

  .odo-col span {
    block-size: 16px;
  }

  .panes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .pane {
    padding-block: var(--sp-3) var(--sp-2);
    padding-inline: var(--sp-3);
  }

  .pane + .pane {
    border-block-start: 1px solid var(--line);
  }

  .h {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block-end: var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--ink2);
    font-weight: 600;
  }

  .box {
    overflow: hidden;
  }

  .needs-box {
    block-size: calc(var(--nrow) * 4);
  }

  .feed-box {
    block-size: calc(var(--frow) * 4);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .need,
  .event {
    padding-inline: var(--sp-2);
    border-block-end: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .need:last-child,
  .event:nth-child(4) {
    border-block-end-color: transparent;
  }

  .need {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    block-size: var(--nrow);
  }

  .ask {
    display: grid;
    color: var(--accent-text);
  }

  .need-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .need-title,
  .need-sub,
  .what {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .need-title {
    font-weight: 500;
    line-height: 18px;
  }

  .need-sub {
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 16px;
  }

  .need-sub b {
    color: var(--ink2);
    font-weight: 600;
  }

  .proj {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-block: 2px;
    padding-inline: 8px;
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  .event {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-content: center;
    gap: 2px var(--sp-3);
    block-size: var(--frow);
  }

  .event-face {
    display: grid;
    grid-row: 1 / span 2;
    align-self: center;
  }

  .who {
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 16px;
  }

  .age {
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 16px;
    white-space: nowrap;
  }

  .what {
    grid-column: 2 / -1;
    line-height: 18px;
  }

  .gone {
    visibility: hidden;
  }

  @media (width < 560px) {
    .date,
    .proj-name {
      display: none;
    }

    .org {
      margin-inline-end: auto;
    }

    .proj {
      padding-inline: 6px;
    }
  }

  /**
   * ONE LOOP, SIXTEEN SECONDS, AND EVERY STOP IS A FRACTION OF IT.
   *
   *   8%   Codex's line lands in the feed, and 4% later its question lands in What needs you.
   *   28%  The renewal rule marks kilnfonts.example as lapsing.
   *   44%  The reply rule notes Halden's payment run, and the failed backup is asked about.
   *   64%  Claude's line arrives and is written out as you watch.
   *   93%  Everything fades, and the loop starts again from the older screen.
   *
   * The list moves and the rows do not: `translateY` by whole rows, inside a box that clips.
   */
  @media (prefers-reduced-motion: no-preference) {
    .needs {
      animation: needs var(--loop) var(--ease-spring) infinite both;
    }

    .feed {
      animation: feed var(--loop) var(--ease-spring) infinite both;
    }

    .panes,
    .odo {
      animation: blink var(--loop) linear infinite both;
    }

    .odo-col {
      animation: odo var(--loop) var(--ease-out) infinite both;
    }

    .arrive {
      animation: flash var(--loop) linear calc(var(--loop) * var(--at)) infinite;
    }

    .gone {
      animation: gone var(--loop) step-end infinite both;
    }

    .typed {
      animation: typed var(--loop) linear infinite both;
    }

    .moment:hover * {
      animation-play-state: paused;
    }
  }

  @keyframes needs {
    0%,
    12% {
      transform: translateY(calc(var(--nrow) * -2));
    }

    16%,
    48% {
      transform: translateY(calc(var(--nrow) * -1));
    }

    52%,
    100% {
      transform: none;
    }
  }

  @keyframes feed {
    0%,
    8% {
      transform: translateY(calc(var(--frow) * -4));
    }

    12%,
    28% {
      transform: translateY(calc(var(--frow) * -3));
    }

    32%,
    44% {
      transform: translateY(calc(var(--frow) * -2));
    }

    48%,
    64% {
      transform: translateY(calc(var(--frow) * -1));
    }

    68%,
    100% {
      transform: none;
    }
  }

  @keyframes odo {
    0%,
    12% {
      transform: none;
    }

    16%,
    48% {
      transform: translateY(-16px);
    }

    52%,
    100% {
      transform: translateY(-32px);
    }
  }

  @keyframes blink {
    0% {
      opacity: 0;
    }

    3%,
    93% {
      opacity: 1;
    }

    98%,
    100% {
      opacity: 0;
    }
  }

  @keyframes flash {
    0% {
      background-color: var(--accent-wash);
    }

    20%,
    100% {
      background-color: transparent;
    }
  }

  @keyframes gone {
    0% {
      visibility: visible;
    }

    90%,
    100% {
      visibility: hidden;
    }
  }

  @keyframes typed {
    0%,
    65% {
      clip-path: inset(0 100% 0 0);
    }

    76%,
    100% {
      clip-path: inset(0);
    }
  }
</style>
