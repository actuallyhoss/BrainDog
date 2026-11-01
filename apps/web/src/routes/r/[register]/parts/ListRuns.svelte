<!--
  The list of agent runs as one ledger: who, what it is doing, and for how long (1 Nov, L16 and L17).

  A TABLE OF THREE ROWS 1190PX WIDE SAID LESS THAN THIS. Each run is a line: the agent's face (its maker's mark, a dot
  while it works), the agent's name as the run says it ("ChatGPT", where the table's choice column said "Other"), what
  it said it is doing, and at the end how long it has been at it or when it finished. Working runs first, then the
  quiet ones, then the finished, each newest heard first. A line opens the run's own page.

  INSIDE THE LIST'S TILE, NO BOX OF ITS OWN: `rows.css`'s ledger, as People's groups are.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn, springy } from '$lib/motion/index.ts';
  import { at } from '$lib/at.ts';
  import { gapSaid, runWho } from '$lib/record/api.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import type { RunLive } from '$lib/ui/face.ts';
  import { presenceOf } from '@braindog/kernel';
  import { since } from 'braindog-render';

  let {
    register,
    decl,
    entries,
    now,
    more,
    openCardMenu,
  }: {
    register: string;
    decl: RegisterDecl;
    entries: readonly Entry[];
    now: number;
    more: boolean;
    openCardMenu?: ((seq: number, el: HTMLElement, point?: MenuAt) => void) | undefined;
  } = $props();

  /* This part's own words. */
  const words = {
    agent: 'Agent',
    nothingSaid: 'Said nothing of what it is doing',
    helping: 'helping',
    working: (d: string) => `working ${d}`,
    quiet: (when: string) => `quiet, heard ${when}`,
    ended: (when: string) => `finished ${when}`,
    left: (when: string) => `left a step ${when}`,
    stopped: (when: string) => `stopped ${when}`,
    justStarted: 'just started',
  } as const;

  const iso = (v: unknown): string | null => (typeof v === 'string' && v !== '' && Number.isFinite(Date.parse(v)) ? v : null);
  const nowIso = $derived(new Date(now).toISOString());
  const presence = (e: Entry) => presenceOf({ state: e.state ?? null, fields: e.fields as never }, now);
  const liveOf = (e: Entry): RunLive => {
    const p = presence(e);
    return p === 'working' ? 'working' : p === 'quiet' ? 'quiet' : 'stopped';
  };
  const RANK: Record<RunLive, number> = { working: 0, quiet: 1, stopped: 2 };
  const heard = (e: Entry): string => iso(e.fields.last_seen) ?? e.updated ?? e.created;
  const runs = $derived(
    [...entries].sort((a, b) => RANK[liveOf(a)] - RANK[liveOf(b)] || (heard(a) < heard(b) ? 1 : heard(a) > heard(b) ? -1 : 0)),
  );

  const doingOf = (e: Entry): string => String(e.fields[decl.title] ?? '').trim();
  const whoOf = (e: Entry): string => {
    const who = runWho(e.fields) ?? words.agent;
    return typeof e.fields.parent === 'string' && e.fields.parent !== '' ? `${who}, ${words.helping}` : who;
  };
  /* THE FACE IS DECORATION HERE (`run=""`): the whole line is the door to the run, and one link may not hold another. */
  const faceOf = (e: Entry): string | null =>
    typeof e.fields.agent === 'string' && e.fields.agent !== '' && e.fields.agent !== 'other' ? e.fields.agent : runWho(e.fields);
  /* HOW LONG, OR WHEN IT ENDED: "working 2h", "quiet, heard 3h ago", "finished yesterday". */
  const whenOf = (e: Entry): string => {
    const p = presence(e);
    const last = heard(e);
    if (p === 'working') {
      const d = gapSaid(iso(e.fields.started) ?? e.created, nowIso);
      return d ? words.working(d) : words.justStarted;
    }
    if (p === 'quiet' || p === 'before') return words.quiet(since(last, now));
    const end = iso(e.fields.closed_at) ?? last;
    return p === 'left' ? words.left(since(end, now)) : p === 'stopped' ? words.stopped(since(end, now)) : words.ended(since(end, now));
  };
</script>

<ul class="ledger ledger-lead runs">
  {#each runs as e (e.seq)}
    {@const doing = doingOf(e)}
    {@const live = liveOf(e)}
    <li in:lineIn out:dismiss animate:flip={springy()}>
      <a class="line line-tall" data-live={live} href={at(`/r/${register}/${e.seq}`)} {@attach openCardMenu && ownMenu((p) => openCardMenu(e.seq, document.body, p))}>
        <span class="line-mark"><AgentFace agent={faceOf(e)} run="" {live} size="m" /></span>
        <span class="line-main">
          <span class="line-title" dir="auto">{whoOf(e)}</span>
          <span class="line-detail" dir="auto">{doing || words.nothingSaid}</span>
        </span>
        <span></span>
        <span class="line-when">{whenOf(e)}</span>
      </a>
    </li>
  {/each}
</ul>

{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  /* WHAT IT IS DOING STAYS ONE LINE, so every run is a row of one height and the list scans down the agents. */
  .runs :global(.line-tall .line-detail) {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  /* A FINISHED RUN IS QUIETER THAN ONE AT WORK, under it. */
  .line[data-live='stopped'] .line-title {
    color: var(--ink-2);
  }

  @media (width < 640px) {
    .runs :global(.line-when) {
      grid-column: 3;
      grid-row: 1;
    }

    .runs :global(.line > span:empty) {
      display: none;
    }
  }
</style>
