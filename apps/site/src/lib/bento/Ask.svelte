<!--
  A question the record puts to you, with its recommendation, being answered.

  SG29 from the demo, with its two real options and the one the record recommends. It is still open
  in the demo; the loop shows what answering it looks like and then puts it back.
-->
<script lang="ts">
  import Face from '../Face.svelte';
  import ProjectMark from '../ProjectMark.svelte';
  import { site } from '../copy.ts';

  const c = site.bento.ask;
  const project = site.projects[c.project];
</script>

<div class="q" aria-hidden="true">
  <p class="meta">
    <ProjectMark mark={project.mark} hue={project.hue} />
    <span>{project.name}</span>
    <span class="sid">{c.id}</span>
  </p>
  <p class="title">{c.question}</p>
  <ul class="opts">
    {#each c.options as o}
      <li class="opt" class:rec={o.recommended}>
        <span class="radio"></span>
        <span class="opt-title">{o.title}</span>
        {#if o.recommended}<span class="badge">{c.recommended}</span>{/if}
      </li>
    {/each}
  </ul>
  <p class="answered"><Face name="You" size="s" /><span>{c.answered}</span></p>
</div>

<style>
  .q {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    inline-size: 100%;
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: none;
    font-size: var(--t-sm);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .sid {
    margin-inline-start: auto;
    color: var(--dim);
    font-family: var(--font-id);
  }

  .title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    line-height: 1.35;
    text-wrap: pretty;
  }

  .opts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
  }

  .opt.rec {
    border-color: var(--ink);
  }

  .radio {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 14px;
    block-size: 14px;
    border: 1.5px solid var(--edge);
    border-radius: var(--r-pill);
  }

  .rec .radio {
    border-color: var(--ink);
  }

  .rec .radio::after {
    content: '';
    inline-size: 6px;
    block-size: 6px;
    background: var(--ink);
    border-radius: var(--r-pill);
  }

  .opt-title {
    flex: 1;
    min-inline-size: 0;
  }

  .badge {
    padding-block: 1px;
    padding-inline: 8px;
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 600;
    white-space: nowrap;
  }

  .answered {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: no-preference) {
    .badge {
      animation: badge 9s var(--ease-out) infinite both;
    }

    .rec {
      animation: choose 9s var(--ease-out) infinite both;
    }

    .rec .radio::after {
      animation: tick 9s var(--ease-spring) infinite both;
    }

    .answered {
      animation: answer 9s var(--ease-out) infinite both;
    }

    .q {
      animation: reset 9s linear infinite both;
    }
  }

  @keyframes badge {
    0%,
    8% {
      opacity: 0;
      transform: translateY(4px);
    }

    14%,
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes choose {
    0%,
    20% {
      border-color: var(--line);
      box-shadow: none;
    }

    28% {
      border-color: var(--ink);
      box-shadow: 0 0 0 4px var(--hover-wash);
    }

    36%,
    100% {
      border-color: var(--ink);
      box-shadow: none;
    }
  }

  @keyframes tick {
    0%,
    30% {
      transform: scale(0);
    }

    36%,
    100% {
      transform: none;
    }
  }

  @keyframes answer {
    0%,
    40% {
      opacity: 0;
      transform: translateY(6px);
    }

    48%,
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes reset {
    0% {
      opacity: 0.4;
    }

    4%,
    92% {
      opacity: 1;
    }

    100% {
      opacity: 0.4;
    }
  }
</style>
