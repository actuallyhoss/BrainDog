<!--
  Arrivals: what arrived since the reader last looked, a line each (Today as the desk, today F10).

  WHEN, WHO, WHAT, AND WHERE IT WAS FILED: the name in the heavier weight, its note after it in the quiet ink, and the
  list at the right with a tick. LINES THAT SHARE WHO, LIST AND HOUR ARE ONE LINE ("BrainDog added 6 to Tools"),
  opening in place to the names (`arrivalsOf`). The lines are Home's own read of `whatsNew`, the same read the read mark
  is stamped from, so what is drawn here is what the mark will say was seen.

  WHAT WAITS IN THE INBOX is said in the heading ("4 to review"), opening it (today F14).

  A LINE THAT ARRIVES WHILE THE READER LOOKS opens in (`rowIn`) and is washed in `--arrived`, the wash fading over 1.5s
  (motion F12). Under reduced motion it fades in and the wash holds, then goes in one step. NOTHING IS DRAWN FOR NOTHING.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { at } from '$lib/at.ts';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { rowIn, rowOut, settle } from '$lib/ui/motion.ts';
  import { arrivalsOf, freshOf, groupSaid, type Landed } from './landed.ts';

  /* `self` IS THE READER'S OWN NAME, which their own lines' face is drawn from: "You" drew a Y beside their own name on a
     first Today ("Y Maya You"). */
  let { rows, review = 0, self = null }: { rows: readonly Landed[]; review?: number; self?: string | null } = $props();
  const faceOf = (r: { who: string; kind?: string | undefined }): string => (r.kind === 'you' && self !== null && self.trim() !== '' ? self : r.who);

  const words = {
    title: 'Arrivals',
    /* "ALL ACTIVITY", AS THE TILES BESIDE IT SAY THEIR DOORS ("All numbers", "All projects"), AN20: a foot that says
       "all" is one the board's fit counts as saying there is more, so the "1 more" it laid on top of a bare "Activity",
       with no gap, is not drawn. */
    all: 'All activity',
    review: (n: number) => `${n.toLocaleString('en-GB')} to review`,
    names: (n: number) => `Show the ${n.toLocaleString('en-GB')}`,
    /* A GROUPED LINE IN PARTS, so its count and its list stand a step heavier: "BrainDog added 6 to Tools". */
    filed: (who: string) => `${who} added`,
    into: 'to',
  } as const;

  const lines = $derived(arrivalsOf(rows));

  /* The keys drawn before this read: a line not among them came while the reader looked. `null` until the first read. */
  let before: ReadonlySet<string> | null = null;
  const fresh = $derived.by(() => {
    const now = freshOf(before, lines);
    before = new Set(lines.map((r) => r.key));
    return now;
  });

  /* WHICH GROUPED LINES ARE OPEN to their names. */
  let open = $state<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    open = next;
  };
</script>

{#if lines.length > 0}
  <Tile icon="activity" title={words.title} count={rows.length} data-landed>
    {#snippet actions()}
      {#if review > 0}<a class="l-review tap" href={at('/inbox')}>{words.review(review)}<Icon name="arrow" size="s" /></a>{/if}
    {/snippet}
    <ul class="stream">
      {#each lines as r (r.key)}
        <li class="l-row" data-arrived={fresh.has(r.key) ? '' : undefined} in:rowIn out:rowOut animate:flip={settle()}>
          <span class="l-at num">{r.at}</span>
          <span class="l-face"><Face name={faceOf(r)} kind={r.kind} run={r.run} size="s" /></span>
          {#if 'group' in r}
            <span class="l-what" dir="auto">
              <button type="button" class="l-open tap" data-free aria-expanded={open.has(r.key)} aria-label={groupSaid(r)} onclick={() => toggle(r.key)}
                ><span class="l-said" aria-hidden="true">{words.filed(r.who)} <b class="l-count num">{r.rows.length.toLocaleString('en-GB')}</b> {words.into} <b class="l-list">{r.to}</b></span><Icon name="chevronDown" size="s" /></button
              >
            </span>
            {#if open.has(r.key)}
              <ul class="l-names">
                {#each r.rows as n (n.key)}
                  <li>{#if n.href}<a href={at(n.href)}>{n.name}</a>{:else}{n.name}{/if}{#if n.note}<span class="l-note">{' · '}{n.note}</span>{/if}</li>
                {/each}
              </ul>
            {/if}
          {:else}
            <span class="l-what" dir="auto">
              {#if r.href}<a class="l-name" href={at(r.href)}>{r.name}</a>{:else}<b class="l-name">{r.name}</b>{/if}
              {#if r.note}<span class="l-note">{r.note}</span>{/if}
              <span class="l-who">{r.who}</span>
            </span>
            {#if r.to}<span class="l-to"><Icon name="check" size="s" />{r.to}</span>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    <!-- THE DOOR TO THE WHOLE LOG, AT THE TILE'S FOOT (Today polish 3), where the tiles beside it keep theirs. -->
    <a class="l-review l-all l-foot tap" href={at('/audit')}>{words.all}<Icon name="arrow" size="s" /></a>
  </Tile>
{/if}

<style>
  .stream {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* NO RADIUS ON A RULED ROW: a corner and a hairline together curl the rule at both ends (today F10). */
  /* A LINE AN ARRIVAL, 44 TALL (Today polish 9): when in a 64 column, the mark at 20, then what came, and the list. */
  .l-row {
    display: grid;
    grid-template-columns: 64px 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    min-block-size: 44px;
    padding-block: var(--sp-1);
    box-sizing: border-box;
    font-size: var(--fs-body);
    font-weight: var(--fw-regular);
  }

  .l-face {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
  }

  .l-said {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .l-said > b {
    font-weight: var(--fw-semi);
  }

  /* ROWS TOLD APART BY AIR, NOT A HAIRLINE (ui-perfect, 3 Nov), as every other card on Today: the ops look's rows. */
  .l-row + .l-row {
    margin-block-start: var(--sp-1);
  }

  .l-row[data-arrived] {
    animation: landed 1.5s var(--ease-out);
  }

  @keyframes landed {
    from {
      background-color: var(--arrived);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .l-row[data-arrived] {
      animation: landed 1.5s step-end;
    }
  }

  .l-at {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .l-what {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* WHAT CAME AT A ROW TITLE'S WEIGHT, 500: at 600 over two lines it was the loudest thing on the board. */
  .l-name {
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .l-open {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .l-open > :global(.icon) {
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-out);
  }

  .l-open[aria-expanded='true'] > :global(.icon) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .l-open > :global(.icon) {
      transition: none;
    }
  }

  .l-names {
    grid-column: 3 / -1;
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0 0 var(--sp-1);
    list-style: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .l-names a {
    color: inherit;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .l-names a:hover,
    a.l-name:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* A finger needs the full target the layout gate measures. */
  @media (pointer: coarse) {
    .l-name,
    .l-open,
    .l-names a {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  .l-note,
  .l-who {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .l-to {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .l-review {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-decoration: none;
  }

  .l-all {
    color: var(--ink-2);
  }

  .l-foot {
    align-self: flex-start;
    margin-block-start: auto;
  }

  /* ON A PHONE, ONE LINE AN ARRIVAL (today F10): the time, the face, the name with its note cut short, and the list. */
  @media (width < 640px) {
    .l-row {
      grid-template-columns: 48px 20px minmax(0, 1fr) auto;
      column-gap: var(--sp-2);
    }

    .l-what {
      flex-wrap: nowrap;
      overflow: hidden;
      white-space: nowrap;
    }

    .l-what > * {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .l-who {
      display: none;
    }

    .l-names {
      grid-column: 3 / -1;
    }
  }
</style>
