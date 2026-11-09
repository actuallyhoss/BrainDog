<!--
  The hub's rows: one list shape for automations, scheduled actions, scripts and runs.

  ROWS ON THE GROUND: `rows.css`'s ledger, a 56px row with a 32px icon well for what
  the thing is, its name, and under it what it is and where it stands; the right-hand column is its next turn or the
  time a run started. Nothing round the list, a hairline between its rows, and the rounded wash under the one pointed
  at. The caller puts it under a `Section` heading, grouped by kind or by day.

  ONE SHAPE FOR ALL FOUR because they sit one tab apart, and a failed script and a failed automation should not be two
  different reads.

  THE SECOND LINE IS NEVER CUT, and the " · " between what it is and the verdict is in its words, not drawn by the style,
  so a copy and a screen reader read the two apart. It is the verdict ("Paused. The key is not in the Keychain.") and an ellipsis took exactly
  the part that said what to do, so it wraps; the name gives way instead.

  A DOT FOR WHAT NEEDS A LOOK, AND ONLY THAT, leading the sentence that says it, so the dot never stands alone (a
  status is a 6px dot and its word). Red for a failure, amber for a pause, and a hollow ring for off.

  A ROW THE READER MAY TURN ON AND OFF ENDS IN A SWITCH (`toggle`), at the row's own edge so a column of them lines
  up. A switch cannot sit inside a link, so such a row is not one: its name is the link, and the link's hit box is
  stretched over the whole row (`.tap`, placed against the row), with the switch lifted over it. A press anywhere but
  the switch still opens the thing, and the switch is 44 under a thumb (`controls.css`).
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import { ownPress } from '$lib/record/actions.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { rowIn, rowOut } from '$lib/ui/motion.ts';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import { renames } from '$lib/things/rename.ts';
  import { families, familyOn, familySaid, familyWords } from './hub-family.ts';
  import type { HubRow } from './hub.ts';

  let {
    rows,
    dim = false,
    ontoggle,
    busy = null,
  }: {
    rows: readonly HubRow[];
    /** Draw the group quieter: the turned-off ones. */
    dim?: boolean;
    /** A row's switch was pressed: its key, and what it should now be. */
    ontoggle?: ((key: string, on: boolean) => void) | undefined;
    /** The key of the row whose switch is out to the record now; every switch waits while one is. */
    busy?: string | null;
  } = $props();

  /* RULES OF ONE FAMILY ARE ONE ROW (`hub-family.ts`); every other row, and a family of one, is itself. */
  const all = $derived(families(rows));
  /* GROUPED THE SAME WAY THROUGHOUT: the families first, then the rules that stand alone under their own count, so the
     groups' counts and the single rules add up to the rules in the list. */
  const folds = $derived([...all.filter((f) => f.kind === 'family'), ...all.filter((f) => f.kind === 'one')]);
  const alone = $derived(all.filter((f) => f.kind === 'one').length);
  const grouped = $derived(all.length > alone);
  const firstAlone = $derived(folds.findIndex((f) => f.kind === 'one'));
  /* A LONG RUN OF SINGLE RULES FOLDS AT SIX (L47): "13 rules on their own" stood as thirteen rows of switches. The
     first six stay, and so does any past them that needs a look (a dot), so folding never hides a failing rule. */
  const FOLD_AT = 6;
  let allAlone = $state(false);
  const kept = $derived.by(() => {
    const keep = new Set<string>();
    let seen = 0;
    for (const f of folds) {
      if (f.kind !== 'one') continue;
      if (seen < FOLD_AT || f.row.dot === 'bad' || f.row.dot === 'warn') keep.add(f.row.key);
      seen += 1;
    }
    return keep;
  });
  const hidden = $derived(alone - kept.size);
  /* THE ROWS PAST THE FOLD RISE IN ON THEIR HEIGHT WHEN OPENED; the first six are simply there. */
  const foldIn = (node: Element, more: boolean) => (more ? rowIn(node) : { duration: 0 });
  const foldOut = (node: Element, more: boolean) => (more ? rowOut(node) : { duration: 0 });
  /* THE FAMILIES OPENED, by key. Closed when drawn, so a long family never pushes the rest of the page down. */
  let opened = $state.raw<ReadonlySet<string>>(new Set());
  const flip = (key: string): void => {
    const next = new Set(opened);
    if (!next.delete(key)) next.add(key);
    opened = next;
  };
  /* THIS BROWSER'S CLOCK, read once when the list is drawn, as the rows' own sentences were. */
  const now = Date.now();

  /* A RULE'S VERBS AT THE POINTER: a right-click or a held thumb on its row, or `⇧F10` (`ownMenu`). */
  let menuRow = $state<HubRow | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);
  const heard = (r: HubRow) => ownMenu((p) => ((menuRow = r), (point = p)), r.path);
</script>

<ItemMenu label={menuRow?.name ?? ''} bind:at={point} href={menuRow?.path}>
  {#if menuRow?.toggle && ontoggle}
    {@const r = menuRow}
    {@const t = menuRow.toggle}
    <button role="menuitemcheckbox" type="button" aria-checked={t.on} disabled={busy !== null} onclick={() => ontoggle(r.key, !t.on)}><Icon name={t.on ? 'pause' : 'play'} size="s" /><span class="mi-name">{t.label}</span></button>
  {/if}
  {#if menuRow?.fix}
    <a role="menuitem" href={at(menuRow.fix.path)}><Icon name="arrow" size="s" /><span class="mi-name">{menuRow.fix.label}</span></a>
  {/if}
</ItemMenu>

{#snippet body(r: HubRow, linked: boolean)}
  <IconWell name={r.icon ?? 'refresh'} size="l" />
  <span class="line-main">
    {#if linked && r.path}
      <a class="line-title name open tap" href={at(r.path)} {@attach renames(r.path)}>{r.name}</a>
    {:else}
      <span class="line-title name">{r.name}</span>
    {/if}
    <span class="line-detail meta">
      {#if r.what}<span class="what">{r.what}</span>{#if r.said}<span class="sep">{' · '}</span>{/if}{/if}
      {#if r.said}<span class="said" data-dot={r.dot ?? undefined}>{r.said}</span>{/if}
      {#if r.aside && r.toggle}<span class="aside-in">{' · '}{r.aside}</span>{/if}
    </span>
  </span>
  {#if r.aside}<span class="line-when aside" data-switched={r.toggle ? '' : undefined} data-clock={r.clock ? '' : undefined}>{r.aside}</span>{/if}
{/snippet}

{#snippet item(r: HubRow)}
  {@const t = r.toggle}
  {#if t && ontoggle}
    <div class="row line line-tall switched" data-off={t.on ? undefined : ''}>
      {@render body(r, true)}
      <button
        type="button"
        class="switch"
        role="switch"
        aria-checked={t.on}
        aria-label={t.label}
        disabled={busy !== null}
        onclick={() => ontoggle(r.key, !t.on)}><span class="switch-track"></span></button
      >
    </div>
  {:else if r.path}
    <a class="row tap line line-tall" href={at(r.path)} {@attach renames(r.path)}>{@render body(r, false)}</a>
  {:else}
    <div class="row line line-tall">{@render body(r, false)}</div>
  {/if}
  {#if r.fix}
    <a
      class="fix tap"
      href={at(r.fix.path)}
      onclick={(e) => {
        const f = r.fix;
        if (!f?.state || !ownPress(e)) return;
        e.preventDefault();
        void goto(at(f.path), { state: f.state });
      }}>{r.fix.label}</a>
  {/if}
{/snippet}

<!--
  A FAMILY IS A DISCLOSURE: one button as tall as any row, its name, how many rules and what they have done together,
  and a chevron that turns; pressed, its members open under it in the order they came, each with its own count and
  idle sentence, indented to the family's words. No tile of its own: it is a row of the same list.
-->
<ul class="ledger ledger-lead hub-rows" data-dim={dim ? '' : undefined}>
  {#each folds as f, i (f.kind === 'one' ? f.row.key : `family:${f.family.key}`)}
    {#if grouped && i === firstAlone && alone > 0}
      <li class="alone-cap">{familyWords.alone(alone)}</li>
    {/if}
    {#if f.kind === 'one'}
      {#if allAlone || hidden <= 0 || kept.has(f.row.key)}
        {@const more = hidden > 0 && !kept.has(f.row.key)}
        <li {@attach heard(f.row)} in:foldIn={more} out:foldOut={more}>{@render item(f.row)}</li>
      {/if}
    {:else}
      {@const fam = f.family}
      {@const shown = opened.has(fam.key)}
      {@const said = familySaid(fam, now)}
      <li class="family">
        <button type="button" class="row line line-tall kin" aria-expanded={shown} onclick={() => flip(fam.key)}>
          <IconWell name={fam.members[0]?.icon ?? 'refresh'} size="l" />
          <span class="line-main">
            <span class="line-title name">{fam.name}</span>
            <span class="line-detail meta"
              ><span class="what">{familyWords.count(fam.count)}</span>{#if said}<span class="sep">{' · '}</span><span class="said">{said}</span>{/if}</span
            >
          </span>
          <!-- WHAT ITS SWITCHES SAY, IN THE SWITCHES' COLUMN: a bare chevron in a column of
               switches read as a row with its switch missing. "All on", then the chevron that opens it. -->
          <span class="aside fold-end">
            {#if ontoggle && familyOn(fam.members)}<span class="fold-on">{familyOn(fam.members)}</span>{/if}
            <span class="turn" data-open={shown ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
          </span>
        </button>
        {#if shown}
          <ul class="ledger ledger-lead members">
            {#each fam.members as m (m.key)}
              <li {@attach heard(m)}>{@render item(m)}</li>
            {/each}
          </ul>
        {/if}
      </li>
    {/if}
  {/each}
  {#if hidden > 0}
    <li class="fold-more">
      <button type="button" class="more-press tap" aria-expanded={allAlone} onclick={() => (allAlone = !allAlone)}>
        <span>{allAlone ? familyWords.fewer : familyWords.more(hidden)}</span>
        <span class="turn" data-open={allAlone ? '' : undefined}><Icon name="chevronDown" size="s" /></span>
      </button>
    </li>
  {/if}
</ul>

<style>
  /* THE LINK IS THE WHOLE ROW, and its words keep the ink they had rather than a link's. THE WELL, THE WORDS AND THE
     RIGHT-HAND COLUMN ON ONE LINE AT EVERY WIDTH: the shared card layout under 640 puts the words under the lead, and a
     hub row keeps its well beside both of its lines, as a search hit does. */
  .row {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    color: inherit;
    text-decoration: none;
  }

  .row .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .row .aside {
    grid-column: 3;
    grid-row: 1;
  }

  /* THE SECOND LINE WRAPS AND IS NEVER CLAMPED: what it is, then the verdict, with a dot before the verdict alone. The
     ledger's detail is one clipped line; here it is a sentence that has to be read to its end. */
  .meta {
    display: block;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  /* THE NAME WRAPS TO A SECOND LINE BEFORE IT IS CUT: "File what an account holds in the account's book" lost its end
     on a phone, and the end is the part that says which. */
  /* AND IT IS CUT AT THE SECOND LINE, NEVER DRAWN OVER WHAT IS UNDER IT (the scope of 24 October): a clamp with the
     overflow left visible still painted the third line of "Import the next ready-made skin bundle" over "A clock · Ran
     once" at 390, because under 640 the shared rows let a title's overflow show (`rows.css`). */
  .name {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* A ROW WITH A SWITCH: the same three columns and the switch as a fourth, at the row's own trailing edge. The row is
     as tall as any other, because the switch's 32px target fits inside the 56. */
  .switched {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
  }

  .switched .switch {
    grid-column: 4;
    grid-row: 1;
    z-index: var(--z-raise);
    /* THE TRACK ENDS ON THE ROW'S EDGE AT EVERY TARGET SIZE: under a thumb the button is 44 wide round a 36px track,
       and centred in it the track would sit four pixels inside the edge the rows above and below end on. */
    justify-items: end;
  }

  /* THE NAME IS THE LINK AND THE ROW IS ITS TARGET: static, so the hit box `.tap` draws is placed against the row
     (`rows.css` positions it), as Activity's rows do. The words keep the ink they had rather than a link's. */
  .open {
    position: static;
    color: inherit;
    text-decoration: none;
  }

  .open:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* OFF, AND STILL HERE: the name steps down to the second ink, as a turned-off add-on's does. Never red. */
  .switched[data-off] .name {
    color: var(--ink-2);
  }

  .said[data-dot]::before {
    content: '';
    display: inline-block;
    box-sizing: border-box;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: calc(6px * var(--dense, 1));
    border-radius: var(--r-ctl);
    vertical-align: 0.1em;
  }

  .said[data-dot='bad']::before {
    background: var(--red);
  }

  .said[data-dot='warn']::before {
    background: var(--warn-fill);
  }

  /* OFF IS NOT A STATE THAT NEEDS ANYTHING, so it is a ring and not a fill, in the quiet ink. */
  .said[data-dot='off']::before {
    border: 1.5px solid var(--ink-3);
  }

  /* A FAMILY'S ROW IS A BUTTON THAT LOOKS LIKE EVERY OTHER ROW: no face of a button's own, the whole width, and at
     least 56 tall, past the 44 a thumb needs. */
  .kin {
    inline-size: 100%;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* IN THE INK OF EVERY OTHER NAME: a button's own grey made each family read as turned
     off, under a heading that said On. */
  .kin .name {
    color: var(--ink);
  }

  .kin:focus-visible .name {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .fold-end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .fold-on {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: var(--fw-medium);
    white-space: nowrap;
  }

  /* THE CHEVRON TURNS WHEN THE FAMILY IS OPEN, in the quiet ink: the row's words say what it is. */
  .turn {
    display: grid;
    place-items: center;
    color: var(--ink-2);
    transition: transform var(--d-state) var(--ease-out);
  }

  .turn[data-open] {
    transform: rotate(180deg);
  }

  /* THE FOLD'S PRESS, QUIET INK UNDER THE ROWS, as a row's "N more details" is: not a button that competes with them. */
  .fold-more {
    list-style: none;
    padding-inline: var(--sp-3);
  }

  /* UNDER A THUMB ITS WORDS STAND IN A 44 BOX, and the box's air is the card's padding, not more on it. */
  @media (pointer: coarse) {
    .fold-more:last-child {
      margin-block-end: calc(-1 * var(--sp-3));
    }
  }
  .more-press {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }
  .more-press:hover {
    color: var(--ink);
  }

  /* ON THE ROWS' OWN EDGE: the ledger reaches out by --sp-3 and each row pads back in by as much. */
  .alone-cap {
    padding-block: var(--sp-3) var(--sp-1);
    padding-inline: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 600;
    list-style: none;
  }

  /* THE MEMBERS SIT UNDER THE FAMILY, their wells lined up with its words, so the fold reads as one thing opened. */
  .members {
    margin: 0 0 var(--sp-2) calc(var(--well-l) + var(--sp-3));
  }

  @media (prefers-reduced-motion: reduce) {
    .turn {
      transition: none;
    }
  }

  /* ON A PHONE A SWITCHED ROW'S NEXT TURN SITS IN ITS DETAIL LINE, so the switch and the turn do not squeeze the name. */
  .aside-in {
    display: none;
  }

  @media (width < 640px) {
    .aside[data-switched] {
      display: none;
    }

    .aside-in {
      display: inline;
    }
  }

  /* A TIME IN A FEED IS SET IN GEIST MONO; a next turn is words and keeps the UI face. */
  .aside[data-clock] {
    font-family: var(--font-mono);
  }

  /* THE TURNED-OFF GROUP, QUIETER AND NOT RED: the name steps down to the second ink. */
  .hub-rows[data-dim] .line:not(.switched) .name {
    color: var(--ink-2);
  }

  /* THE LINK THAT DOES WHAT THE SENTENCE ASKS, under the row and lined up with its words, not its well. */
  .fix {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    margin: 0 0 var(--sp-2) calc(var(--sp-3) + var(--well-l) + var(--sp-3));
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  @media (hover: hover) and (pointer: fine) {
    .fix:hover {
      text-decoration-color: currentColor;
    }

    /* A ROW THAT IS NOT ITSELF A LINK STILL TAKES THE WASH UNDER THE POINTER, and its hairlines step aside for it, as
       the shared rows' do. */
    .switched:hover {
      background: var(--hover);
    }

    .hub-rows > li:has(> .switched:hover) > .line::after,
    .hub-rows > li:has(> .switched:hover) + li > .line::after {
      opacity: 0;
    }
  }

  @media (pointer: coarse) {
    .fix {
      min-block-size: var(--tap);
      margin-block-end: 0;
    }
  }
</style>
