<!--
  The history, as the demo's audit log draws it: a sequence number, a face, what changed and when.

  The events are the demo's own (`WRITTEN` in `apps/web/src/lib/record/data.ts`), in its words. The
  motion is the one fact about this log worth showing: a new event lands on top and nothing under it
  changes. The rows are a fixed height and the list moves inside a box, so the card never resizes.
-->
<script lang="ts">
  import Face from '../Face.svelte';
  import Icon from '../Icon.svelte';
  import { site } from '../copy.ts';

  const c = site.bento.history;
  const last = c.events.length - 1;
</script>

<div class="hist" aria-hidden="true">
  <p class="head">
    <Icon name="history" size="s" />
    <span>{c.head}</span>
    <span class="only"><Icon name="lock" size="s" />{c.only}</span>
  </p>
  <div class="box">
    <ol class="events">
      {#each c.events as e, i}
        <li class="ev" class:arrive={i === 0} class:gone={i === last}>
          <span class="seq num">{e.seq}</span>
          <Face name={e.who} size="s" />
          <span class="main">
            <span class="what">{e.what}</span>
            <span class="meta">{e.who} · {e.age}</span>
          </span>
        </li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .hist {
    --row: 50px;
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: none;
    font-size: var(--t-sm);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block-end: var(--sp-2);
    padding-inline: var(--sp-1);
    color: var(--ink2);
    font-weight: 600;
  }

  .only {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .box {
    block-size: calc(var(--row) * 4);
    overflow: hidden;
  }

  .events {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ev {
    display: grid;
    grid-template-columns: 4.5ch auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-2);
    block-size: var(--row);
    padding-inline: var(--sp-1);
    border-block-end: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .ev:nth-child(4) {
    border-block-end-color: transparent;
  }

  .seq {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .main {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .what,
  .meta {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what {
    color: var(--ink);
    line-height: 18px;
  }

  .meta {
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 16px;
  }

  .gone {
    visibility: hidden;
  }

  @media (prefers-reduced-motion: no-preference) {
    .events {
      animation: push 8s var(--ease-spring) infinite both;
    }

    .arrive {
      animation: flash 8s linear 2.4s infinite;
    }

    .gone {
      animation: gone 8s step-end infinite both;
    }

    .box {
      animation: reset 8s linear infinite both;
    }
  }

  @keyframes push {
    0%,
    30% {
      transform: translateY(calc(var(--row) * -1));
    }

    36%,
    100% {
      transform: none;
    }
  }

  @keyframes flash {
    0% {
      background-color: var(--hover-wash);
    }

    30%,
    100% {
      background-color: transparent;
    }
  }

  @keyframes gone {
    0% {
      visibility: visible;
    }

    92%,
    100% {
      visibility: hidden;
    }
  }

  @keyframes reset {
    0% {
      opacity: 0;
    }

    4%,
    92% {
      opacity: 1;
    }

    100% {
      opacity: 0;
    }
  }
</style>
