<!--
  "Add a step": the menu of step kinds, grouped as §6 names them, Check, Change, Ask, Call out, Wait.

  A MENU AND NOT A SHEET, for `Menu.svelte`'s reason: it is a short list of verbs about the gap you pressed, and it
  belongs beside that gap. Choosing one adds a blank card there and opens the inspector on it, so the sheet is the
  second thing somebody sees and never the first.

  THE GROUP HEADINGS ARE `role="none"`, so the menu's roving focus walks the verbs and skips the words over them, and a
  screen reader hears each verb once with its group as the list's structure rather than as a stop.

  THE TRIGGER IS A CIRCLE ON THE CONNECTOR in the column, `compact`, and the labelled pill alone in an empty list. Both
  are 44px under a thumb: touch has no hover to reveal a control that only shows on hover, so these are always drawn.

  THE PILL SAYS WHEN A DRAG WILL LAND ON IT, `landing`. The row it sits in is the empty list's drop target, and with the
  "Nothing yet" box gone the pill is the only thing there to light up, so it takes the ink ring the landing line between
  two cards is drawn in.

  BOTH ARE SMALL NODES ON THE WIRE: the tile's white at its first depth, on the `--rule` connector.

  ASK SLASH IS OFFERED WHERE A MODEL IS, read from the layout's `slash` here rather than passed down through `FlowList`,
  because every menu on the canvas asks the same question of the same tab and none of the lists between has a use for it.

  EVERY STEP THE RECORD'S GRAMMAR HOLDS, on its shelf (`flow.ts` `stepGroups`), and none it does not. The grammar is
  read once for the tab (`grammar.ts`); over a record older than the app there is none, the menu offers nothing, and
  the labelled one says the record's one line in its place. A compact one on the wire draws nothing, so the line is
  said where an empty list is and not at every gap.

  ON A PHONE IT IS A SEARCHABLE SHEET, WITH A LINE SAYING WHAT EACH STEP DOES. Twenty verbs in an action sheet
  are a long scroll of labels ("Come back later", "Run a call on this row") that a stranger has to guess at; the sheet
  puts a search box at the top, which reads the label and the line (`flow.ts` `STEP_HELP`), and a line under each. The
  width is the app's one answer to "cards or a table" (`body.svelte.ts` `rowsAsCards`), so a menu never asks
  `matchMedia` for itself, one listener per gap on the canvas.
-->
<script lang="ts">
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { page } from '$app/state';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { onMount } from 'svelte';
  import { helpOf, labelOf, stepGroups, words, type Verb } from './flow.ts';
  import { grammarNow, grammarState, loadGrammar } from './grammar.ts';

  let {
    label = words.addStep,
    compact = false,
    landing = false,
    onpick,
  }: { label?: string; compact?: boolean; landing?: boolean; onpick: (verb: Verb) => void } = $props();

  let open = $state(false);
  let sheet = $state(false);
  let query = $state('');
  /* THE TAB'S GRAMMAR, FOLLOWED BY ITS OWN SUBSCRIPTION and not `$grammarState`: Svelte's store helpers would go into
     the runtime every screen loads (the entry budget). */
  let read = $state.raw(grammarNow());
  $effect(() => grammarState.subscribe((s) => (read = s)));
  const groups = $derived(stepGroups(page.data.slash === true, read.state === 'ready' ? read.grammar : null));
  onMount(() => void loadGrammar());
  const phone = $derived(rowsAsCards());

  /* EVERY WORD TYPED HAS TO BE IN THE LABEL OR THE LINE, in any order and any case, so "row tag" finds "Add a tag". */
  const shown = $derived.by(() => {
    const said = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    if (said.length === 0) return groups;
    return groups
      .map((g) => ({ ...g, verbs: g.verbs.filter((v) => said.every((w) => `${labelOf(v)} ${helpOf(v)}`.toLowerCase().includes(w))) }))
      .filter((g) => g.verbs.length > 0);
  });

  function choose(verb: Verb) {
    sheet = false;
    query = '';
    onpick(verb);
  }
</script>

<div class="step-menu" data-compact={compact ? '' : undefined} data-landing={landing ? '' : undefined}>
  {#if read.state === 'older' || read.state === 'unread'}
    {#if !compact}<p class="older">{read.say}</p>{/if}
  {:else if phone}
    <button type="button" class="open" aria-haspopup="dialog" aria-expanded={sheet} onclick={() => (sheet = true)}>
      <span class="add">
        <Icon name="plus" size="s" />
        <span class={compact ? 'vh' : undefined}>{label}</span>
      </span>
    </button>
  {:else}
    <Menu {label} bind:open>
      {#snippet trigger()}
        <span class="add">
          <Icon name="plus" size="s" />
          <span class={compact ? 'vh' : undefined}>{label}</span>
        </span>
      {/snippet}
      {#each groups as group (group.label)}
        <p class="group" role="none">{group.label}</p>
        {#each group.verbs as verb (verb)}
          <button type="button" class="mi" role="menuitem" title={helpOf(verb)} onclick={() => onpick(verb)}><Icon name="plus" size="s" />{labelOf(verb)}</button>
        {/each}
      {/each}
    </Menu>
  {/if}
</div>

{#if phone && read.state !== 'older' && read.state !== 'unread'}
  <Sheet
    open={sheet}
    title={words.addStep}
    onclose={() => {
      sheet = false;
      query = '';
    }}
  >
    <div class="find">
      <div class="field">
        <Icon name="search" size="s" />
        <input class="field-input" type="search" aria-label={words.findStep} placeholder={words.findStep} autocomplete="off" spellcheck="false" bind:value={query} />
      </div>
    </div>
    {#each shown as group (group.label)}
      <p class="group">{group.label}</p>
      <ul class="picks">
        {#each group.verbs as verb (verb)}
          <li>
            <button type="button" class="pick" onclick={() => choose(verb)}>
              <span class="pick-label">{labelOf(verb)}</span>
              {#if helpOf(verb) !== ''}<span class="pick-help">{helpOf(verb)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/each}
    {#if shown.length === 0}<p class="none">{words.noStep}</p>{/if}
  </Sheet>
{/if}

<style>
  .step-menu {
    display: flex;
    justify-content: center;
  }

  /* THE PLUS ON THE WIRE, AND THE BUTTON IN AN EMPTY ARM: small nodes of the canvas, flat on the board as every tile
     is, a rectangle at the control's radius on the `--rule` line they sit on. The words are the second ink, and ink
     under the pointer. */
  .add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3) 0 var(--sp-2);
    background: var(--tile);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    transition:
      color var(--d-state) var(--ease-out),
      background var(--d-state) var(--ease-out);
  }

  .step-menu[data-compact] .add {
    inline-size: var(--ctl-h-sm);
    padding: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .add:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  /* THE BUTTON SAYS A DRAG WILL LAND ON IT with the landing line's own ink, an outline drawn round it, not a border. */
  .step-menu[data-landing] .add {
    outline: 2px solid var(--ink);
    outline-offset: 0;
    color: var(--ink);
  }

  /* THE RECORD'S ONE LINE, where the button would be: words at the body's size, nothing to press. */
  .older {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-align: center;
  }

  /* THE FOCUS RING FOLLOWS THE ROUND SHAPE, since the button round it is the thing focused. */
  .step-menu :global(.menu-trigger),
  .open {
    border-radius: var(--r-ctl);
  }

  /* 44 UNDER A THUMB, as every target in this app is (`13 §7`), and the circle stays a circle. */
  @media (pointer: coarse) {
    .add {
      min-block-size: var(--tap);
    }

    .step-menu[data-compact] .add {
      inline-size: var(--tap);
    }
  }

  /* THE WORDS ARE THERE ON THE CIRCLE TOO, for a screen reader: an icon alone would name the button nothing. */
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A GROUP'S HEADING IN THE MENU: sentence case at 500 in the meta size, never a letterspaced eyebrow. */
  .group {
    margin: var(--sp-2) var(--sp-2) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .group:first-child {
    margin-block-start: var(--sp-1);
  }

  /* THE PHONE'S TRIGGER IS A BARE BUTTON AROUND THE SAME PILL, so the column looks the same at every width. */
  .open {
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }

  .find {
    padding-block-end: var(--sp-2);
  }

  .picks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW OF THE SHEET: the step's name, and under it what the step does, the whole row the target at 44 or more, and
     the sheet's inner fill under the one pressed or focused. */
  .pick {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .pick:focus-visible,
  .pick:active {
    background: var(--tile-2);
  }

  .pick-label {
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .pick-help {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .none {
    margin: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
