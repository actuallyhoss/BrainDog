<!--
  One step's card: a handle, what the step does in one line, and a menu of the moves.

  A NODE IS A TILE: the flat surface at radius `--r-tile`, no border and no shadow, sitting straight on the board with
  the `--rule` connectors between it and the next. Its verb is the icon in a 28px well, the sentence is
  a row title, and the card's state is said by the well, which is the system's own language for it: the chosen card's
  well is ink (the rail's chosen place is drawn the same way), and a card with something wrong has a red well over the
  sentences that say what. No border round a card, ever, and no lift: the chosen one is said by its well alone.

  EVERY STEP THE GRAMMAR HOLDS GETS A CARD, `meet` and `run_job` with the rest: the sentence is `flow.ts`'s, worked
  from the step's arguments, and a verb this build has no glyph for takes the group's. A stored id is never the words
  on a card: a job is said by its name in words, a person by what the step calls them.

  THE RADIUS IS THE TILE'S AND THE PADDING IS 8, so the handle's 36px circle and the card's corner are one curve: 18 of
  radius and 8 of inset is the 22 of the corner, give or take a pixel.

  DRAGGED BY POINTER EVENTS, NOT BY HTML DRAG AND DROP, and that is the touch requirement rather than a taste. The page
  builder's `draggable` works under a mouse and does nothing under a finger: no browser fires `dragstart` from a touch
  on a phone. A pointer captured on the handle is one code path for a mouse, a pen and a thumb, and `touch-action:
  none` on the handle alone is what stops the page scrolling under a drag without stopping it scrolling anywhere else.

  THE CARD UNDER THE FINGER IS FOUND BY `elementFromPoint`, because a captured pointer's events all go to the handle
  that captured them, so no other card ever hears a `pointerover`. Each card and each empty arm carries its list and
  index in `data-` attributes; the handle reads them from whatever is under the pointer and writes `over` on the draft,
  and the card that `over` names draws the landing line. The same before-or-after rule as `PageBody.svelte`'s blocks,
  copied rather than imported because that rule is scoped to that file, and here every card is full width, so the
  pointer's height alone decides the edge.

  THE KEYBOARD IS THE SAME MOVE. Alt with an arrow on the card (the handle, the sentence or the menu, since keydown
  bubbles to the card) calls `nudge`, which calls the `moveBetween` a drop calls: up, down, right into the branch beside
  it, left out of the branch it is in. The menu offers the same four as words, for a single pointer and for anybody
  who does not know the chord. Focus follows the card to where it went.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { onMount } from 'svelte';
  import { ROOT, grammarStep, sayParts, sayStep, verbOf, words, type ListId, type Node, type Nudge, type Verb } from './flow.ts';
  import { grammarNow, grammarState, loadGrammar } from './grammar.ts';
  import type { FlowDraft } from './flow.svelte.ts';
  import { editWords } from './source.ts';

  let {
    flow,
    node,
    list,
    at,
    count,
    faults = [],
  }: { flow: FlowDraft; node: Node; list: ListId; at: number; count: number; faults?: string[] } = $props();

  /* THE TAB'S GRAMMAR, read once (`grammar.ts`): every sentence below is worked out again when it arrives, since a verb
     and its arguments are the grammar's to name. */
  /* THE TAB'S GRAMMAR, FOLLOWED BY ITS OWN SUBSCRIPTION and not `$grammarState`: Svelte's store helpers would go into
     the runtime every screen loads (the entry budget). */
  let read = $state.raw(grammarNow());
  $effect(() => grammarState.subscribe((s) => (read = s)));
  const grammar = $derived(read.state === 'ready' ? read.grammar : null);
  onMount(() => void loadGrammar());

  const said = $derived.by(() => {
    void grammar;
    return sayStep(node.step, flow.draft.name);
  });
  /* THE SENTENCE AS PARTS, so a value a step reads is a chip and not a word run into the words round it: the sample
     said "Tell you: Gold is rate a gram". `said` stays the plain join for every
     label and the live region, where a chip has nothing to draw. */
  const parts = $derived.by(() => {
    void grammar;
    return sayParts(node.step, flow.draft.name);
  });
  const verb = $derived(verbOf(node.step, grammar));
  /* A CARD JUST ADDED KEEPS ITS FAULTS UNTIL THE SHEET HAS CLOSED ON IT ONCE (`FlowDraft.holds`): every required box
     starts empty, and the card was told off while the inspector was still opening on it to be filled. */
  /* THE RECORD'S OWN WORD JOINS THEM, from `checkAutomation`, on the card its `at` names (`FlowDraft.serve`). It is held
     with the rest for a card just added, which the record would fault for the same empty boxes. */
  const served = $derived(flow.served?.key === node.key ? flow.served.say : null);
  const shown = $derived(flow.holds(node.key) ? [] : served !== null && !faults.includes(served) ? [...faults, served] : faults);
  /* HOW THIS STEP WENT IN THE LAST TRY, painted under the sentence until the next edit (`FlowDraft.paintOf`). */
  const paint = $derived(flow.paintOf(node.key));

  /** One glyph per group of verbs, from the set the app already draws. No new artwork. */
  const GLYPH: Partial<Record<Verb, IconName>> = {
    if: 'filter',
    set_var: 'edit',
    stop: 'stop',
    tag: 'tag',
    untag: 'tag',
    set: 'edit',
    move: 'arrow',
    link: 'link',
    note: 'doc',
    create: 'plus',
    notify: 'bell',
    suggest: 'decide',
    ask_person: 'ask',
    ask_slash: 'star',
    call: 'globe',
    run: 'plug',
    script: 'code',
    run_job: 'play',
    meet: 'user-plus',
    wait: 'clock',
    schedule: 'calendar',
  };

  /** A verb with no glyph of its own takes its group's: an action changes the item, a step's own verb does something else. */
  const glyph = $derived<IconName>((verb && GLYPH[verb]) || (verb && grammarStep(verb, grammar)?.group === 'action' ? 'edit' : 'refresh'));

  let open = $state(false);

  const dragging = $derived(flow.dragging === node.key);
  const edge = $derived(flow.over && flow.dragging !== node.key && flow.over.list === list && flow.over.at === at ? flow.over.edge : undefined);

  /** Put focus back on this card's handle after a move re-renders it somewhere else in the tree. */
  async function refocus() {
    await tick();
    document.querySelector<HTMLElement>(`[data-flow-card][data-key="${CSS.escape(node.key)}"] .handle`)?.focus();
  }

  /** A move from the menu says a refusal out loud; from the keyboard the live region already has, once per press. */
  async function move(dir: Nudge, loud = false) {
    if (flow.nudge(node.key, dir)) await refocus();
    else if (loud && flow.why) toasts.push(flow.why, { intent: 'warn' });
  }

  /* NOTHING MOVES OVER A RECORD WHOSE GRAMMAR WAS NOT READ: the editor opens read only (`grammar.ts` OLDER, UNREAD). */
  const locked = $derived(read.state === 'older' || read.state === 'unread');

  function onkeydown(e: KeyboardEvent) {
    if (!e.altKey || locked) return;
    const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' } as Record<string, Nudge>)[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    void move(dir);
  }

  /* ── the drag ───────────────────────────────────────────────────────────── */

  /**
   * THE BOX THAT SCROLLS, WHICH IS NOT THE WINDOW. The shell scrolls one panel (`+layout.svelte`'s `.body`), and a
   * captured pointer with `touch-action: none` cannot scroll it either, so a card dragged towards a step off-screen
   * would stop at the edge. Moving near the panel's top or bottom edge scrolls it a step per move.
   */
  let scroller: HTMLElement | null = null;
  const EDGE = 48;
  const STEP = 16;

  function scrollerOf(from: HTMLElement): HTMLElement | null {
    for (let at = from.parentElement; at; at = at.parentElement) {
      const y = getComputedStyle(at).overflowY;
      if ((y === 'auto' || y === 'scroll') && at.scrollHeight > at.clientHeight) return at;
    }
    return document.scrollingElement as HTMLElement | null;
  }

  function down(e: PointerEvent) {
    if (e.button !== 0 || locked) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    scroller = scrollerOf(handle);
    flow.dragging = node.key;
    flow.over = null;
  }

  function track(e: PointerEvent) {
    if (flow.dragging !== node.key) return;
    const box = scroller?.getBoundingClientRect();
    if (scroller && box) {
      if (e.clientY < Math.max(0, box.top) + EDGE) scroller.scrollTop -= STEP;
      else if (e.clientY > Math.min(innerHeight, box.bottom) - EDGE) scroller.scrollTop += STEP;
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-flow-card], [data-flow-empty]');
    const target = hit?.dataset.list;
    if (!hit || target === undefined) return;
    if (hit.dataset.flowEmpty !== undefined) {
      flow.over = { list: target, at: 0, edge: 'before' };
      return;
    }
    const r = hit.getBoundingClientRect();
    flow.over = { list: target, at: Number(hit.dataset.at), edge: e.clientY > r.top + r.height / 2 ? 'after' : 'before' };
  }

  async function up() {
    if (flow.dragging !== node.key) return;
    scroller = null;
    if (flow.drop()) await refocus();
    else if (flow.why) toasts.push(flow.why, { intent: 'warn' });
  }
</script>

<!-- THE KEYDOWN IS THE BUTTONS', BUBBLED. The card is not a tab stop and does nothing when it has focus itself; the
     handle, the sentence and the menu inside it are the stops, and Alt with an arrow pressed on any of them lands here,
     the same arrangement `PageBody.svelte` uses for a block's `⌥↑`. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="card"
  data-flow-card
  data-menu-host
  data-key={node.key}
  data-list={list}
  data-at={at}
  data-drop={edge}
  data-dragging={dragging ? '' : undefined}
  data-selected={flow.selected === node.key ? '' : undefined}
  data-fault={shown.length > 0 ? '' : undefined}
  role="group"
  aria-label={said}
  {onkeydown}
>
  <button
    type="button"
    class="handle tap"
    aria-label={words.drag(said)}
    title={words.drag(said)}
    aria-describedby={shown.length > 0 ? `faults-${node.key}` : undefined}
    onpointerdown={down}
    onpointermove={track}
    onpointerup={up}
    onpointercancel={() => flow.cancelDrag()}
    onlostpointercapture={() => flow.dragging === node.key && flow.cancelDrag()}
    onclick={() => (open = true)}
  >
    <Icon name="drag" size="s" />
  </button>

  <button type="button" class="say tap" aria-describedby={shown.length > 0 ? `faults-${node.key}` : undefined} onclick={() => flow.select(node.key)}>
    <IconWell name={glyph} size="m" tone={flow.selected === node.key ? 'ink' : shown.length > 0 ? 'danger' : undefined} />
    <span class="said">{#each parts as p, i (i)}{#if p.ref}<span class="ref">{p.text}</span>{:else}{p.text}{/if}{/each}</span>
  </button>

  <div class="more">
    <Menu label={words.moreFor(said)} align="end" bind:open>
      {#snippet trigger()}
        <span class="more-trigger"><Icon name="more" size="s" /><span class="vh">{words.moreFor(said)}</span></span>
      {/snippet}
      <button type="button" class="mi" role="menuitem" onclick={() => flow.select(node.key)}>{words.edit}</button>
      {#if at > 0}<button type="button" class="mi" role="menuitem" onclick={() => void move('up', true)}>{words.moveUp}</button>{/if}
      {#if at < count - 1}<button type="button" class="mi" role="menuitem" onclick={() => void move('down', true)}>{words.moveDown}</button>{/if}
      <button type="button" class="mi" role="menuitem" onclick={() => void move('in', true)}>{words.moveIn}</button>
      {#if list !== ROOT}<button type="button" class="mi" role="menuitem" onclick={() => void move('out', true)}>{words.moveOut}</button>{/if}
      <button type="button" class="mi" role="menuitem" data-tone="bad" onclick={() => flow.remove(node.key)}>{words.remove}</button>
    </Menu>
  </div>

  {#if shown.length > 0}
    <ul class="faults" id={`faults-${node.key}`}>
      {#each shown as f (f)}<li><span class="warn" aria-hidden="true"><Icon name="alert" size="m" /></span>{f}</li>{/each}
    </ul>
  {/if}

  {#if paint}
    <!-- THE WORD CARRIES THE OUTCOME AND THE DOT ONLY REPEATS IT (a dot never stands
         alone). A step that did something says its answer; one that did not says the runner's sentence for why. -->
    <p class="paint">
      <span class="paint-dot" data-state={paint.state} aria-hidden="true"></span>
      <span class="paint-word">{editWords.tryState[paint.state]}</span>
      {#if paint.answer}<span class="paint-said">{paint.answer}</span>{:else if paint.state !== 'done' && paint.say}<span class="paint-said">{paint.say}</span>{/if}
    </p>
  {/if}
</div>

<style>
  /* THE NODE: a tile's surface, radius and depth, 8 of padding, and no border in any state. */
  .card {
    /* WHERE THE SENTENCE STARTS, so the faults and the try's answer under it line up with its words and not the handle:
       the handle, the card's gap, the say button's own padding, the well, and the gap after the well. */
    --lead: calc(var(--ctl-h) + var(--sp-1) + var(--sp-2) + var(--well) + var(--sp-2));

    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
    transition: opacity var(--d-state) var(--ease-out);
  }

  /* A FAULT IS A WORD UNDER THE CARD AND A RED WELL, NOT A TINT ON IT. The card was `--warn-tint` behind its text, and
     the design system draws an intent as a word, a dot or a 16px glyph and an error as ink with a
     glyph, never as a wash; so the card stays white and each sentence under it leads with the glyph. */

  /* The one held: half there, so the column does not close up and move every other card under the pointer. */
  .card[data-dragging] {
    opacity: 0.45;
  }

  /* THE LANDING LINE, the rule `PageBody.svelte` draws for a block, copied because it is scoped there: a 3px ink bar
     on the edge the held card will arrive at, over the gap rather than inside the card, so nothing reflows under the
     pointer. Every card is full width, so it is always a line across the top or the bottom, inset from the corners. */
  .card[data-drop]::after {
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    inset-inline: var(--sp-3);
    block-size: 3px;
    background: var(--ink);
    border-radius: var(--r-ctl);
    pointer-events: none;
  }

  .card[data-drop='before']::after {
    inset-block-start: calc(var(--sp-2) * -1 - 2px);
  }

  .card[data-drop='after']::after {
    inset-block-end: calc(var(--sp-2) * -1 - 2px);
  }

  .handle,
  .say,
  .more-trigger {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    background: none;
    border: 0;
    color: var(--ink-3);
    font: inherit;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* THE HANDLE AND THE MENU ARE CIRCLES, the handle's in the card's corner curve. */
  .handle,
  .more-trigger {
    justify-content: center;
    inline-size: var(--ctl-h);
    border-radius: var(--r-ctl);
  }

  /* THE HANDLE ALONE TAKES THE GESTURE. `none` on the whole card would stop a thumb scrolling the column wherever it
     landed on a card, which on a phone is most of the screen. */
  .handle {
    touch-action: none;
    cursor: grab;
  }

  .card[data-dragging] .handle {
    cursor: grabbing;
  }

  /* THE SENTENCE, AS A ROW TITLE: 15 at 500, after its verb's well. It wraps; a step is read whole. */
  .say {
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    text-align: start;
    cursor: pointer;
  }

  .said {
    overflow-wrap: anywhere;
  }

  /* A VALUE THE STEP READS IS A CHIP IN THE SENTENCE, in the UI face and the meta size: `rate` and `what` are names a
     person picked, not identifiers to copy, so not `--font-mono`. The tile's inner fill,
     a pill, and no border. */
  .ref {
    display: inline-block;
    margin-inline: 2px;
    padding: 0 var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 22px;
    vertical-align: baseline;
  }

  /* HOVER ONLY WHERE THERE IS ONE: the tile's inner fill under what is pointed at. */
  @media (hover: hover) and (pointer: fine) {
    .handle:hover,
    .say:hover,
    .more-trigger:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  /* WHAT IS WRONG, UNDER THE SENTENCE AND LINED UP WITH IT: red words at 500 after the glyph, because a fault is what
     stands between him and the save ("faults say danger text with the glyph"). */
  .faults {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0 var(--sp-2) var(--sp-1) var(--lead);
    list-style: none;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .faults li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .warn {
    display: inline-flex;
    padding-block-start: 1px;
    color: var(--red);
  }

  /* UNDER THE SENTENCE, LINED UP WITH IT, as the faults are: the handle's and the well's columns are left clear. */
  .paint {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    margin: 0;
    padding: 0 var(--sp-2) var(--sp-1) var(--lead);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* A STATE IS A 6PX DOT AND ITS WORD, each in its meaning: done is green, what it would do out in the world
     the second ink, parked on something amber, a failure red, and a step never reached a hollow ring. */
  .paint-dot {
    display: inline-block;
    flex: none;
    box-sizing: border-box;
    inline-size: var(--dot);
    block-size: var(--dot);
    border-radius: var(--r-ctl);
    background: var(--good);
  }

  .paint-dot[data-state='would'] {
    background: var(--ink-2);
  }

  .paint-dot[data-state='waiting'] {
    background: var(--warn-fill);
  }

  .paint-dot[data-state='failed'] {
    background: var(--red);
  }

  .paint-dot[data-state='skipped'] {
    background: transparent;
    border: 1.5px solid var(--ink-3);
  }

  .paint-word {
    color: var(--ink);
    font-weight: 500;
  }

  .paint-said {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (pointer: coarse) {
    .card {
      --lead: calc(var(--tap) + var(--sp-1) + var(--sp-2) + var(--well) + var(--sp-2));
    }

    .handle,
    .more-trigger {
      inline-size: var(--tap);
      min-block-size: var(--tap);
    }
  }

  /* FORCED COLOURS DROP THE FILL AND THE SHADOW, so a card keeps an edge, and the chosen one a heavier one. */
  @media (forced-colors: active) {
    .card {
      outline: 1px solid CanvasText;
    }

    .card[data-selected] {
      outline-width: 3px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
