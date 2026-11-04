<!--
  The live desk in the hero: the app's own window on Maya's made-up record, drawn in the app's frame of 27 October
  (DIRECTION, "27 October, later"): the sidebar holds every place and the top bar says where you are and lets you ask.
  The sidebar opens on BrainDog's mark and name with the button that hides it, then the places (Today, Needs you with its count, Work, Money, Agents,
  People), then her projects. The top bar runs across the work only: the crumb, "Ask or change anything", the bell
  and her face. Five places press through (§23: the product's own parts, never a screenshot); Work and People are
  drawn so the frame is the app's, and open nothing.

  ALL FIVE PANES ARE IN THE HTML. With scripting on, only the chosen one shows. With scripting off, the <noscript>
  rule below lays every pane out one under another, each headed by its name. A style element is not held by the page's
  script policy, so the rule needs no hash.

  BETWEEN 761 AND 1060 THE SIDEBAR SHRINKS TO ITS ICONS, as the app's does under 1,280. ON A PHONE it is the app's phone
  Today: the date, the search, the bell and her face on top, the app's tab bar along the foot (Today, Needs you,
  Projects, Money, Menu), in a 440px frame that clips, with no sidebar. The window draws on the app's
  own surfaces (`--desk-*` in Look B).

  THE COUNT ON NEEDS YOU reads the desk's asks (`needs.svelte.ts`), so answering one on Today or in Needs you moves it.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import Mark from '../Mark.svelte';
  import { onMount } from 'svelte';
  import { FOUNDER, PROJECT, PROJECTS, PROJECT_ORDER, TODAY, dateSaid, slotVars } from '../demo/maya.ts';
  import Agents from './Agents.svelte';
  import Ask from './Ask.svelte';
  import Money from './Money.svelte';
  import Needs from './Needs.svelte';
  import Project from './Project.svelte';
  import Today from './Today.svelte';
  import { needs } from './needs.svelte.ts';
  import { DESK, TABS, type Tab } from './words.ts';
  import type { IconName } from '../icons.ts';

  let chosen = $state<Tab>('today');
  let asking = $state(false);
  const tabs: Record<string, HTMLButtonElement> = {};

  const count = $derived(needs.open.length);
  /* THE VISITOR'S OWN DAY on the phone's bar, once the page runs. */
  let date = $state('');
  onMount(() => void (date = dateSaid(new Date())));

  function show(tab: Tab, focus = false): void {
    chosen = tab;
    if (focus) tabs[tab]?.focus();
  }

  /* THE SIDEBAR'S ROWS IN THE APP'S ORDER: a row with a tab opens its pane, a row without one is drawn and opens
     nothing. Up and Down move between the five that open, as in a list of links. */
  type Row = { tab?: Tab; label: string; icon: IconName; n?: string };
  const ROWS: Row[] = [
    { tab: 'today', label: DESK.tabs.today, icon: DESK.icons.today! },
    { tab: 'needs', label: DESK.tabs.needs, icon: DESK.icons.needs! },
    { label: DESK.more.work, icon: 'work', n: '12' },
    { tab: 'money', label: DESK.tabs.money, icon: DESK.icons.money! },
    { tab: 'agents', label: DESK.tabs.agents, icon: DESK.icons.agents!, n: String(TODAY.working.length) },
    { label: DESK.more.people, icon: 'people', n: '6' },
  ];
  const ORDER: Tab[] = ['today', 'needs', 'money', 'agents', 'projects'];

  /* THE PHONE'S BAR: the app's four tabs (`tabsOf`) and Menu, which wears the live dot while an agent works. */
  const PHONE_TABS: { label: string; icon: IconName; on?: boolean; count?: boolean; live?: boolean }[] = [
    { label: DESK.tabs.today, icon: DESK.icons.today!, on: true },
    { label: DESK.tabs.needs, icon: DESK.icons.needs!, count: true },
    { label: DESK.tabs.projects, icon: DESK.icons.projects! },
    { label: DESK.tabs.money, icon: DESK.icons.money! },
    { label: DESK.menu, icon: 'rows', live: TODAY.working.length > 0 },
  ];

  function move(e: KeyboardEvent, tab: Tab): void {
    const at = ORDER.indexOf(tab);
    const to = e.key === 'ArrowDown' ? (at + 1) % ORDER.length : e.key === 'ArrowUp' ? (at - 1 + ORDER.length) % ORDER.length : -1;
    if (to < 0) return;
    e.preventDefault();
    show(ORDER[to]!, true);
  }

  /* THE CRUMB: the place, and on a project its parent first. */
  const crumb = $derived(chosen === 'projects' ? [DESK.more.projects, PROJECTS[PROJECT.id].name] : [DESK.tabs[chosen]]);
</script>

<noscript>
  <style>
    .desk .desk-pane { display: block !important; }
    .desk .desk-pane + .desk-pane { border-block-start: 1px solid var(--rule); }
    .desk .desk-pane-name { display: block !important; }
    .desk .desk-tab[aria-current='page'] { background: none !important; font-weight: 500 !important; }
    .desk .desk-tab, .desk [class~='desk-ask-bar'], .desk [class~='lead'] { pointer-events: none; }
    .desk [class~='desk-js'] { display: none !important; }
    .desk { block-size: auto !important; }
    .desk .ptabs { display: none !important; }
  </style>
</noscript>

<div class="win desk" class:slashing={asking} data-desk>
  <aside class="side">
    <p class="side-head">
      <Mark height={20} tone="inherit" /><span class="rec">{DESK.brand}</span>
      <svg class="hide-side" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2.5" /><path d="M6 2.5v11" /></svg>
    </p>
    <nav class="places" aria-label={DESK.places}>
      {#each ROWS as row}
        {#if row.tab}
          {@const tab = row.tab}
          <button
            type="button"
            class="desk-tab srow"
            id="desk-tab-{tab}"
            aria-controls="desk-pane-{tab}"
            aria-current={chosen === tab ? 'page' : undefined}
            bind:this={tabs[tab]}
            onclick={() => show(tab)}
            onkeydown={(e) => move(e, tab)}
          >
            <span class="tab-icon"><Icon name={row.icon} /></span><span class="cap">{row.label}</span>
            {#if tab === 'needs'}<span class="count num" hidden={count === 0}>{count}</span>{/if}
            {#if tab === 'agents'}<span class="live" aria-hidden="true"></span>{/if}
            {#if row.n}<span class="n num">{row.n}</span>{/if}
          </button>
        {:else}
          <span class="srow still">
            <span class="tab-icon"><Icon name={row.icon} /></span><span class="cap">{row.label}</span>
            {#if row.n}<span class="n num">{row.n}</span>{/if}
          </span>
        {/if}
      {/each}
      <p class="side-sh"><span>{DESK.more.projects}</span><span class="n">{DESK.more.inPlay}</span></p>
      {#each PROJECT_ORDER as id}
        {@const p = PROJECTS[id]}
        {#if id === PROJECT.id}
          <button
            type="button"
            class="desk-tab srow proj"
            id="desk-tab-projects"
            aria-controls="desk-pane-projects"
            aria-current={chosen === 'projects' ? 'page' : undefined}
            style={slotVars(p.slot)}
            bind:this={tabs.projects}
            onclick={() => show('projects')}
            onkeydown={(e) => move(e, 'projects')}
          >
            <span class="pm">{p.name.charAt(0)}</span><span class="cap">{p.name}</span>
          </button>
        {:else}
          <span class="srow still proj" style={slotVars(p.slot)}>
            <span class="pm">{p.name.charAt(0)}</span><span class="cap">{p.name}</span>
          </span>
        {/if}
      {/each}
    </nav>
  </aside>
  <div class="app-top">
    <span class="phone-date">{date}</span>
    <p class="crumb">
      {#each crumb as part, i}{#if i > 0}<Icon name="chevron-right" size="s" />{/if}<span class:here={i === crumb.length - 1}
          >{part}</span
        >{/each}
    </p>
    <Ask bind:open={asking} />
    <span class="bell" role="img" aria-label={DESK.bell}><Icon name="bell" /><i></i></span>
    <span class="face" style={slotVars(FOUNDER.slot)} aria-hidden="true">{FOUNDER.initials}</span>
  </div>
  <div class="work">
  {#each TABS as tab}
    <div
      class="desk-pane"
      class:on={chosen === tab}
      id="desk-pane-{tab}"
      role="region"
      aria-label={DESK.tabs[tab]}
      tabindex="-1"
    >
      <!-- TODAY NAMES ITSELF in its greeting, an h2 that shows with scripts on; the others' names show only without. -->
      {#if tab !== 'today'}<h2 class="desk-pane-name">{DESK.tabs[tab]}</h2>{/if}
      {#if tab === 'today'}
        <Today />
      {:else if tab === 'needs'}
        <Needs />
      {:else if tab === 'projects'}
        <Project />
      {:else if tab === 'money'}
        <Money />
      {:else}
        <Agents />
      {/if}
    </div>
  {/each}
  </div>
  <!-- THE PHONE'S TAB BAR, as the app's (`TabBar.svelte`): four places and Menu, Today lit. Drawn only on a phone, and
       only a picture: the panes above are what a visitor presses. -->
  <div class="ptabs" aria-hidden="true">
    {#each PHONE_TABS as t (t.label)}
      <span class="ptab" class:on={t.on}>
        <span class="pt-ic"><Icon name={t.icon} />{#if t.count && count > 0}<b class="pt-n num">{count}</b>{/if}{#if t.live}<i class="pt-live"></i>{/if}</span>
        <span class="pt-w">{t.label}</span>
      </span>
    {/each}
  </div>
</div>

<style>
  /* THE WINDOW, on the app's own surfaces: the desk's board and tiles are the app's in both schemes (SPEC 4.7). */
  .win {
    --board: var(--desk-board);
    --tile: var(--desk-tile);
    --soft: var(--desk-tile-2);
    --rule: var(--desk-rule);
    --rule2: var(--desk-rule);
    --muted: var(--desk-ink-3);
    position: relative;
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    border-radius: 16px;
    background: var(--board);
    box-shadow: var(--win-shadow);
    overflow: hidden;
    font-size: var(--t-site-14);
    line-height: 1.45;
    color: var(--ink);
    text-align: start;
  }

  /* THE SIDEBAR: the record's name in a head as tall as the bar, the places, then the projects (the app's 27 October
     frame). It and the top bar share one surface; only the work sits on the board. */
  /* THE SIDEBAR IS A FLOATING CARD (the app since 3 Nov): 10 in from the window, radius 16, the chrome's soft
     elevation, and no rule against the work. */
  .side {
    grid-row: 1 / -1;
    grid-column: 1;
    min-inline-size: 0;
    margin: 10px 0 10px 10px;
    padding-block-end: 6px;
    background: var(--tile);
    border-radius: 16px;
    box-shadow: var(--glass-edge), var(--elev-chrome);
  }

  .side-head {
    display: flex;
    align-items: center;
    gap: 8px;
    block-size: 50px;
    box-sizing: border-box;
    margin: 0;
    padding: 0 14px;
    color: var(--muted);
  }

  .side-head :global(.mark) {
    color: var(--red-fill);
  }

  .rec {
    flex: 1;
    color: var(--ink);
    font: 600 15px/1 var(--head);
    letter-spacing: -0.01em;
  }

  /* THE BUTTON THAT HIDES THE SIDEBAR, drawn as the app's: a panel with its edge. */
  .hide-side {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .places {
    display: grid;
    gap: 2px;
    padding: 2px 0 10px;
  }

  .srow {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    block-size: 32px;
    margin: 0 8px;
    padding: 0 8px;
    border-radius: 10px;
    color: var(--ink2);
    font: 400 14px/1.3 var(--ui);
    white-space: nowrap;
  }

  .desk-tab {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    block-size: 32px;
    margin: 0 8px;
    padding: 0 8px;
    border-radius: 10px;
    color: var(--ink2);
    font: 400 14px/1.3 var(--ui);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--d-state, 90ms) ease-out;
  }

  .cap {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-icon {
    display: inline-flex;
    color: var(--muted);
  }

  .tab-icon :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  .desk-tab:hover {
    color: var(--ink);
    background: var(--row-wash);
  }

  /* THE PAGE SHE IS ON: the chosen fill, the ink at 500 and the accent glyph, as the app's sidebar. */
  .desk-tab[aria-current='page'] {
    background: var(--chosen);
    color: var(--ink);
    font-weight: 500;
  }

  .desk-tab[aria-current='page'] .tab-icon {
    color: var(--red-fill);
  }

  .desk-tab:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .n {
    color: var(--muted);
    font-size: var(--t-site-12);
    font-weight: 400;
  }

  /* THE COUNT (SPEC 2.A.2): the one red pill, white figure, on the place that waits on her. */
  .count {
    min-inline-size: 20px;
    block-size: 20px;
    padding-inline: 6px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--red-fill);
    color: var(--on-red);
    font: 600 12px/20px var(--ui);
    text-align: center;
  }

  .count[hidden] {
    display: none;
  }

  .live {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: var(--live);
  }

  .side-sh {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 14px 0 4px;
    padding: 0 16px;
    color: var(--ink);
    font: 600 13px/1.2 var(--ui);
  }

  /* A PROJECT'S MARK: its initial on its own hue, 20px, as the app's sidebar draws it. */
  .pm {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border-radius: 6px;
    background: var(--ph-tint);
    color: var(--ph);
    font: 600 11px/1 var(--ui);
  }

  /* THE TOP BAR, across the work only: the crumb, Ask, the bell and her face. */
  .app-top {
    position: relative;
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 60px;
    padding: 10px 20px 0 24px;
    z-index: var(--z-raise);
  }

  .phone-date {
    display: none;
  }

  .crumb {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    margin: 0;
    color: var(--muted);
    font: 500 15px/1.3 var(--ui);
    white-space: nowrap;
  }

  .crumb :global(.icon) {
    inline-size: 14px;
    block-size: 14px;
  }

  /* THE PAGE'S NAME IS THE LARGE TITLE on the top line, beside search, the bell and her face (the app's desk bar). */
  .crumb .here {
    color: var(--ink);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.021em;
  }

  .bell {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    border-radius: 50%;
    background: var(--g-fill);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    color: var(--ink);
  }

  .bell :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .bell i {
    position: absolute;
    inset-block-start: 7px;
    inset-inline-end: 8px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--ink);
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    border-radius: 50%;
    background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--sep);
    color: var(--ink);
    font: 600 13px/1 var(--ui);
  }

  .work {
    grid-column: 2;
    min-inline-size: 0;
  }

  .ptabs {
    display: none;
  }

  .ptab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-inline-size: 0;
    color: var(--muted);
  }

  .pt-ic {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 26px;
    border-radius: 999px;
  }

  .pt-ic :global(.icon) {
    inline-size: 20px;
    block-size: 20px;
  }

  .ptab.on {
    color: var(--ink);
  }

  .ptab.on .pt-ic {
    background: var(--chosen);
    color: var(--red-fill);
  }

  .pt-w {
    max-inline-size: 100%;
    margin-block: -0.12em;
    padding-block: 0.12em;
    overflow: hidden;
    font: 500 11px/1.1 var(--ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE ONE RED: what waits on her, on the tray's corner. */
  .pt-n {
    position: absolute;
    inset-block-start: -4px;
    inset-inline-end: 0;
    min-inline-size: 16px;
    block-size: 16px;
    padding-inline: 4px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--red-fill);
    color: var(--on-red);
    font: 600 10px/16px var(--ui);
    text-align: center;
  }

  .pt-live {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-end: 8px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 0 2px var(--tile);
  }

  .desk-pane {
    display: none;
    padding: 12px 20px 20px 24px;
  }

  .desk-pane:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .desk-pane.on {
    display: block;
    animation: swap 160ms ease-out both;
  }

  .desk-pane-name {
    display: none;
    margin: 0 2px 12px;
    font: 600 17px/1.2 var(--head);
    letter-spacing: -0.021em;
  }

  @keyframes swap {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ── The parts every place shares, said once here for the five panes under this window ── */

  .win :global(.grid) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 14px;
  }

  .win :global(.t) {
    min-inline-size: 0;
    padding: 20px;
    background: var(--tile);
    border: 1px solid var(--card-edge);
    border-radius: 16px;
    box-shadow: var(--shadow-card);
  }

  .win :global(.s3) {
    grid-column: span 3;
  }

  .win :global(.s4) {
    grid-column: span 4;
  }

  .win :global(.s5) {
    grid-column: span 5;
  }

  .win :global(.s6) {
    grid-column: span 6;
  }

  .win :global(.s7) {
    grid-column: span 7;
  }

  .win :global(.s8) {
    grid-column: span 8;
  }

  .win :global(.s12) {
    grid-column: span 12;
  }

  /* A TILE'S HEAD (SPEC 2.A.4): a 28px neutral well with its 18px icon, the title 15/600, a count, an end slot. */
  .win :global(.thd) {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: 24px;
    margin: 0 0 12px;
    color: var(--ink);
    font: 600 15px/1.3 var(--ui);
  }

  /* A CARD'S HEAD GLYPH IS BARE (the app, 3 Nov): 18px in the third ink, no well. */
  .win :global(.thd > .well) {
    inline-size: 18px;
    block-size: 18px;
    background: none;
    color: var(--muted);
  }

  .win :global(.thd .r) {
    margin-inline-start: auto;
    color: var(--muted);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .win :global(.well) {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--soft);
    color: var(--ink2);
  }

  .win :global(.well .icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .win :global(.well.l) {
    inline-size: 32px;
    block-size: 32px;
  }

  .win :global(.well.l .icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  /* A late row's well (SPEC 2.A.5): the red tint and the red glyph, beside the late word. */
  .win :global(.well.late) {
    background: var(--red-tint);
    color: var(--red);
  }

  .win :global(.well.ph) {
    background: var(--ph-tint);
    color: var(--ph);
  }

  .win :global(.big) {
    font: 600 28px/34px var(--head);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .win :global(.sub) {
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .win :global(.late-word) {
    color: var(--red);
    font-weight: 600;
  }

  .win :global(.fig) {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .win :global(.num) {
    font-variant-numeric: tabular-nums;
  }

  .win :global(.list) {
    display: grid;
  }

  .win :global(.li) {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
    padding: 10px 0;
  }

  .win :global(.li:first-child) {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .win :global(.grow) {
    flex: 1;
    min-inline-size: 0;
  }

  .win :global(.grow b) {
    display: block;
    font-weight: 600;
  }

  .win :global(.grow span) {
    display: block;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  /* AN AGENT'S FACE (SPEC 2.A.5): a 28px disc with the maker's mark, and an 8px live dot cut out of its corner. */
  .win :global(.aface) {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--soft);
    color: var(--ink);
  }

  .win :global(.aface.on::after) {
    content: '';
    position: absolute;
    inset-block-end: -1px;
    inset-inline-end: -1px;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 0 2px var(--tile);
  }

  /* THE ANSWER BUTTONS: the suggested one solid red with white words, the other quiet. */
  .win :global(.dbtn) {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    block-size: 32px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--soft-fill);
    color: var(--ink);
    font: 500 13.5px/1 var(--ui);
    white-space: nowrap;
    transition: background var(--d-press, 70ms) ease-out;
  }

  .win :global(.dbtn:hover) {
    background: var(--soft-fill-hover);
  }

  .win :global(.dbtn.red) {
    background: var(--red-fill);
    color: var(--on-red);
  }

  .win :global(.dbtn.red:hover) {
    background: var(--red-fill-hover);
  }

  .win :global(.dbtn.red:active) {
    background: var(--red-fill-press);
  }

  /* AN ANSWER IN THE DRAWING IS INK, as the app draws a suggested answer: the one solid red on the page is Start free
     (1 Nov), and three red buttons in the picture outshouted it. */
  .win :global(.dbtn.ink) {
    background: var(--ink);
    box-shadow: var(--shadow-raised);
    color: var(--page);
  }

  .win :global(.dbtn.ink:hover) {
    background: var(--ink2);
  }

  .win :global(.dbtn:focus-visible),
  .win :global(.undo:focus-visible),
  .win :global(.lead:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .win :global(.undo) {
    all: unset;
    cursor: pointer;
    color: var(--ink2);
    font-size: var(--t-site-13);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    /* 24 TALL UNDER A MOUSE, and the line does not grow. */
    box-sizing: border-box;
    padding-block: 3px;
    margin-block: -3px;
  }

  .win :global(.area) {
    display: block;
    inline-size: 100%;
    block-size: 64px;
    margin-block-start: 12px;
  }

  /* THE CASH LINE IN INK (SPEC 4.3's Forecast rules): a 2px ink line over a 6% ink fill. */
  .win :global(.area .l) {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }

  .win :global(.area .a) {
    fill: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  /* THE ICON RAIL: the sidebar keeps its icons and the projects their marks, as the app's does when it is narrow. */
  @media (max-width: 1060px) {
    .win {
      grid-template-columns: 56px minmax(0, 1fr);
    }

    .cap,
    .n,
    .rec,
    .hide-side,
    .side-sh {
      display: none;
    }

    .side-head {
      justify-content: center;
      padding: 0;
    }

    .srow,
    .desk-tab {
      justify-content: center;
      margin: 0 8px;
      padding: 0;
    }

    .count {
      position: absolute;
      margin: -18px -22px 0 0;
      min-inline-size: 16px;
      block-size: 16px;
      padding-inline: 4px;
      font-size: var(--t-app-xs);
      line-height: 16px;
    }

    .desk-tab {
      position: relative;
    }

    .live {
      position: absolute;
      margin: -16px -18px 0 0;
    }

    .proj:first-of-type {
      margin-block-start: 12px;
    }

    .win :global(.grid) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .win :global(.s3),
    .win :global(.s4),
    .win :global(.s5),
    .win :global(.s6),
    .win :global(.s7),
    .win :global(.s8) {
      grid-column: span 6;
    }

    .win :global(.hide-mid) {
      display: none;
    }
  }

  /* THE PHONE: Today alone, in a 440px frame that clips, with the app's tab bar drawn along its foot. The frame's 540px
     made the hero a screen and a half before the first band; the desk at 760 and up keeps its five places. */
  @media (max-width: 760px) {
    .win {
      block-size: 440px;
    }

    .win {
      grid-template-columns: minmax(0, 1fr);
    }

    .side,
    .crumb {
      display: none;
    }

    .app-top,
    .work {
      grid-column: 1;
    }

    .app-top {
      min-block-size: 56px;
      padding: 6px 12px 0 16px;
      border-block-end: 0;
    }

    .phone-date {
      display: block;
      flex: 1;
      color: var(--muted);
      font-size: var(--t-site-13);
    }

    .face {
      margin-inline-start: 0;
    }

    .desk-pane {
      padding: 4px 12px 76px;
    }

    /* THE PHONE BAR FLOATS: a capsule 10 off each side and the foot, the chrome's soft elevation (the app since 3 Nov). */
    .ptabs {
      position: absolute;
      inset-block-end: 10px;
      inset-inline: 10px;
      z-index: var(--z-raise);
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      block-size: 58px;
      background: color-mix(in oklab, var(--tile) 88%, transparent);
      -webkit-backdrop-filter: blur(24px) saturate(130%);
      backdrop-filter: blur(24px) saturate(130%);
      border-radius: 999px;
      box-shadow: var(--glass-edge), var(--elev-popover);
    }

    .win :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
    }

    .win :global(.grid > *) {
      grid-column: auto;
    }

    .win :global(.hide-phone) {
      display: none;
    }

    .win :global(.t) {
      padding: 16px;
    }
  }

  @media (pointer: coarse) {
    .win :global(.dbtn),
    .win :global(.undo) {
      min-block-size: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .desk-pane.on {
      animation: none;
    }
  }
</style>
