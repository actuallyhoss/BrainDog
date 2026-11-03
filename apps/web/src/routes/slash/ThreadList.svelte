<!--
  The conversations with Slash, newest first, grouped by day so a week of them can be scanned: today, yesterday, this
  week, earlier. One line each, the question that opened it and a short time, the open one marked. Each is a link
  (`/slash?t=<id>`), so it can be opened in a new tab and Back comes back to it.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import type { KeptThread } from '$lib/palette/slash-chat.ts';
  import { dayOf, shortWhen } from './with.ts';

  let { threads, current, now, label }: { threads: KeptThread[]; current: string | null; now: number; label: string } = $props();

  const NAMES = { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier' } as const;

  const groups = $derived.by(() => {
    const out: { key: keyof typeof NAMES; items: KeptThread[] }[] = [];
    for (const t of threads) {
      const key = dayOf(t.at, now);
      const g = out.at(-1);
      if (g && g.key === key) g.items.push(t);
      else out.push({ key, items: [t] });
    }
    return out;
  });
</script>

<nav class="list" aria-label={label}>
  {#each groups as g (g.key)}
    <p class="group caps-label">{NAMES[g.key]}</p>
    <ul>
      {#each g.items as t (t.id)}
        <li>
          <a class="thread tap" href={at(`/slash?t=${encodeURIComponent(t.id)}`)} aria-current={t.id === current ? 'page' : undefined} data-thread>
            <span class="q" dir="auto">{t.title || 'Untitled'}</span>
            <span class="when num">{shortWhen(t.at, now)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/each}
</nav>

<style>
  .list {
    display: flex;
    flex-direction: column;
  }

  .group {
    margin: 0;
    padding: var(--sp-3) var(--title-inset, 12px) var(--sp-1);
    color: var(--ink-3);
  }

  .group:first-child {
    padding-block-start: 0;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE LINE A CONVERSATION: the question, and how long ago, on the text edge; the open one in the chosen fill. */
  .thread {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 36px;
    padding: 6px var(--title-inset, 12px);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-decoration: none;
    transition: background var(--d-state, 120ms) var(--ease-out, ease);
  }

  @media (hover: hover) {
    .thread:hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  .thread[aria-current='page'] {
    background: var(--chosen);
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .q {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-regular, 400);
  }

  @media (pointer: coarse) {
    .thread {
      min-block-size: 44px;
      font-size: var(--fs-row, 15px);
    }
  }
</style>
