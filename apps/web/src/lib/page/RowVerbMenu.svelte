<!--
  A row's menu on a declared page: its verbs in one place, for a pointer and a phone as the keys are for a keyboard.
  Open, Done, Edit, the day, the state or the project, and Delete; each a write with its Undo (`row-host.svelte.ts`).
  `RowMenu.svelte` places it at the row and turns it into a bottom sheet under a thumb, and adds "Hand to" for a list
  that says who holds its rows.

  ONE MENU, IN STEPS. "Set the day…", "Move…" and "File under…" close this menu and open the next one at the same row,
  as Work's does, so no menu ever holds a second menu inside it. Only what the list has is offered.
-->
<script lang="ts">
  import { at as inApp } from '$lib/at.ts';
  import { REGISTERS, refOptions } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import { dayIn, projectOf } from '$lib/work/board.ts';
  import type { RowHost } from './row-host.svelte.ts';
  import { daysFor, finished, keyOf, movesFor, titleOf, words, type RowAt } from './row-verbs.ts';

  let { host, reread }: { host: RowHost; reread: () => Promise<void> } = $props();

  const m = $derived(host.menu);
  const entry = $derived(m ? host.entry(m.row) : undefined);
  const shape = $derived(m ? host.shapeOf(m.row.register) : null);
  const mayWrite = $derived(m ? host.writable(m.row) : false);

  /** The row's element, which the next step of the menu opens at. */
  const rowEl = (): HTMLElement | null => (m ? document.querySelector<HTMLElement>(`[data-row="${CSS.escape(keyOf(m.row))}"]`) : null);

  /** Where a step opens: the row on the page, or where the last step stood when the row is in the panel only. */
  const anchor = () => rowEl() ?? document.querySelector<HTMLElement>('dialog[open] .more');

  /** The day picker, a date box the browser opens: shown under the menu's row once "Pick a day" is pressed. */
  let picker = $state<HTMLInputElement | null>(null);
  let picking = $state<{ row: RowAt; at: { x: number; y: number } } | null>(null);
  function pickDay() {
    if (!m) return;
    picking = { row: m.row, at: { x: m.at.x, y: m.at.y + m.at.height } };
    setTimeout(() => {
      picker?.focus();
      try {
        picker?.showPicker?.();
      } catch {
        /* A browser that will not open its picker from here still has the box. */
      }
    });
  }

  function closed() {
    const el = rowEl();
    el?.focus({ preventScroll: true });
  }
</script>

<RowMenu
  bind:open={host.menuOpen}
  at={m?.at ?? null}
  label={entry && shape ? words.menu(titleOf(entry, shape)) : words.more}
  onclose={closed}
  hand={m?.mode === 'row' && entry && mayWrite && REGISTERS[m.row.register]
    ? { register: m.row.register, row: entry, decl: REGISTERS[m.row.register]!, onhanded: () => void reread() }
    : null}
>
  {#if m && entry && shape}
    {@const r = m.row}
    {#if m.mode === 'row'}
      <a class="mi" role="menuitem" href={inApp(`/r/${r.register}/${r.seq}`)}><Icon name="external" size="s" /><span class="mi-name">{words.open}</span></a>
      {#if mayWrite}
        {#if shape.state && shape.tickTo}
          <button class="mi" role="menuitem" type="button" onclick={() => host.toggle(r)}>
            <Icon name="check" size="s" /><span class="mi-name">{finished(entry, shape) ? words.reopen : words.marks.done}</span><Kbd keys="x" />
          </button>
        {/if}
        <button class="mi" role="menuitem" type="button" onclick={() => host.open(r, true)}><Icon name="edit" size="s" /><span class="mi-name">{words.edit}</span><Kbd keys="e" /></button>
        {#if shape.due}
          <button class="mi" role="menuitem" type="button" onclick={() => host.then('due', anchor)}><Icon name="calendar" size="s" /><span class="mi-name">{words.dayOf}</span></button>
        {/if}
        {#if shape.state && shape.states.length > 1}
          <button class="mi" role="menuitem" type="button" onclick={() => host.then('move', anchor)}><Icon name="arrow" size="s" /><span class="mi-name">{words.move}</span></button>
        {/if}
        {#if shape.project}
          <button class="mi" role="menuitem" type="button" onclick={() => host.then('project', anchor)}><Icon name="projects" size="s" /><span class="mi-name">{words.fileUnder}</span></button>
        {/if}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => host.remove(r)}><Icon name="trash" size="s" /><span class="mi-name">{words.delete}</span><Kbd keys="Delete" /></button>
      {/if}
    {:else if m.mode === 'due'}
      {#each daysFor(host.today()) as d (d.day)}
        <button class="mi" role="menuitem" type="button" onclick={() => host.setDue(r, d.day)}><span class="mi-name">{d.label}</span></button>
      {/each}
      <button class="mi" role="menuitem" type="button" onclick={pickDay}><span class="mi-name">{words.pickDay}…</span></button>
      {#if shape.due && dayIn(entry.fields[shape.due])}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => host.setDue(r, null)}><span class="mi-name">{words.noDue}</span></button>
      {/if}
    {:else if m.mode === 'move'}
      {#each movesFor(entry, shape) as v (v)}
        <button class="mi" role="menuitem" type="button" onclick={() => host.setState(r, v)}><span class="mi-name">{words.moveTo(shape.said[v] ?? v)}</span></button>
      {/each}
    {:else if m.mode === 'project' && shape.project}
      {@const now = projectOf(entry.fields, shape)}
      {#each refOptions(shape.project.to).filter((p) => p.value !== now) as p (p.value)}
        <button class="mi" role="menuitem" type="button" onclick={() => host.setProject(r, p.value, p.label)}><span class="mi-name">{words.fileTo(p.label)}</span></button>
      {/each}
      {#if now !== null}
        <hr class="mi-rule" />
        <button class="mi" role="menuitem" type="button" onclick={() => host.setProject(r, null, words.noProject)}><span class="mi-name">{words.unfile}</span></button>
      {/if}
    {/if}
  {/if}
</RowMenu>

{#if picking}
  {@const p = picking}
  <!-- THE BROWSER'S OWN DAY PICKER, under the row the menu stood at; a day chosen is the write, and leaving it is not. -->
  <input
    bind:this={picker}
    class="pick"
    type="date"
    aria-label={words.pickDay}
    style="left:{p.at.x}px; top:{p.at.y}px"
    onchange={(e) => {
      const day = (e.currentTarget as HTMLInputElement).value;
      if (day) host.setDue(p.row, day);
      picking = null;
    }}
    onblur={() => (picking = null)}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        picking = null;
      }
    }}
  />
{/if}

<style>
  /* The menu's lines, as Work's and the list screen's row menus draw them. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
    min-inline-size: 0;
  }

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  .pick {
    position: fixed;
    z-index: var(--z-palette);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--bg);
    border: 0;
    border-radius: var(--r-md);
    box-shadow: var(--e2);
    color: var(--ink);
    font: inherit;
  }

  @media (width < 640px), (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }
</style>
