<!--
  One step's card: a handle, what the step does in one line, and a menu of the moves.

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
  import type { IconName } from '$lib/ui/icons.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { ROOT, sayParts, sayStep, verbOf, words, type ListId, type Node, type Nudge, type Verb } from './flow.ts';
  import type { FlowDraft } from './flow.svelte.ts';

  let {
    flow,
    node,
    list,
    at,
    count,
    faults = [],
  }: { flow: FlowDraft; node: Node; list: ListId; at: number; count: number; faults?: string[] } = $props();

  const said = $derived(sayStep(node.step));
  /* THE SENTENCE AS PARTS, so a value a step reads is a chip and not a word run into the words round it: the sample
     said "Tell you: Gold is rate a gram" (`loop/research-canvas-ux.md` 1.6). `said` stays the plain join for every
     label and the live region, where a chip has nothing to draw. */
  const parts = $derived(sayParts(node.step));
  const verb = $derived(verbOf(node.step));
  /* A CARD JUST ADDED KEEPS ITS FAULTS UNTIL THE SHEET HAS CLOSED ON IT ONCE (`FlowDraft.holds`): every required box
     starts empty, and the card was told off while the inspector was still opening on it to be filled. */
  const shown = $derived(flow.holds(node.key) ? [] : faults);

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
    wait: 'clock',
    schedule: 'calendar',
  };

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

  function onkeydown(e: KeyboardEvent) {
    if (!e.altKey) return;
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
    if (e.button !== 0) return;
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
    onpointerdown={down}
    onpointermove={track}
    onpointerup={up}
    onpointercancel={() => flow.cancelDrag()}
    onlostpointercapture={() => flow.dragging === node.key && flow.cancelDrag()}
  >
    <Icon name="drag" size="s" />
  </button>

  <button type="button" class="say tap" onclick={() => flow.select(node.key)}>
    {#if verb && GLYPH[verb]}<span class="glyph"><Icon name={GLYPH[verb]!} size="s" /></span>{/if}
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
    <ul class="faults">
      {#each shown as f (f)}<li><span class="warn"><Icon name="alert" size="m" /></span>{f}</li>{/each}
    </ul>
  {/if}
</div>

<style>
  .card {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-1);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .card:hover {
    border-color: var(--edge);
  }

  .card[data-selected] {
    border-color: var(--ink2);
  }

  /* A FAULT IS A WORD UNDER THE CARD, NOT A TINT ON IT. The card was `--warn-wash` behind its text, and
     `loop/DESIGN-SYSTEM.md` 1.2 and 4.8 draw an intent as a word, a dot or a 16px glyph and an error as ink with a
     glyph, never as a wash; so the card stays neutral and each sentence under it leads with the warn glyph. */

  /* The one held: half there, so the column does not close up and move every other card under the pointer. */
  .card[data-dragging] {
    opacity: 0.45;
  }

  /* THE LANDING LINE, the rule `PageBody.svelte` draws for a block, copied because it is scoped there: a 3px ink bar
     on the edge the held card will arrive at, over the gap rather than inside the card, so nothing reflows under the
     pointer. Every card is full width, so it is always a line across the top or the bottom. */
  .card[data-drop]::after {
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    inset-inline: calc(var(--sp-1) * -1);
    block-size: 3px;
    background: var(--ink);
    border-radius: var(--r-pill);
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
    border-radius: var(--r-sm);
    color: var(--dim);
    font: inherit;
  }

  .handle,
  .more-trigger {
    justify-content: center;
    inline-size: var(--ctl-h);
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

  .say {
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-ui);
    text-align: start;
    cursor: pointer;
  }

  .glyph {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    background: var(--s2);
    border-radius: var(--r-sm);
    color: var(--ink2);
  }

  .said {
    overflow-wrap: anywhere;
  }

  /* THE INSPECTOR'S CHIP, IN THE UI FACE. `rate` and `what` are names a person picked, not identifiers to copy, so
     not `--font-id` (`loop/DESIGN-SYSTEM.md` 2.1). */
  .ref {
    display: inline-block;
    margin-inline: 2px;
    padding: 0 var(--sp-2);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    line-height: calc(var(--ctl-h-sm) - 2px);
    vertical-align: baseline;
  }

  .handle:hover,
  .say:hover,
  .more-trigger:hover {
    background: var(--hover-wash);
  }

  .faults {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0 var(--sp-2) var(--sp-1) calc(var(--ctl-h) + var(--sp-2));
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .faults li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .warn {
    display: inline-flex;
    padding-block-start: 1px;
    color: var(--warn);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .mi {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* RED ONLY UNDER THE POINTER OR THE FOCUS. Remove was `--danger` at rest, and `loop/DESIGN-SYSTEM.md` 4.3 gives a
     destructive ghost its danger label on hover or focus alone; at rest it is one more item in the menu. */
  .mi[data-tone='bad']:hover,
  .mi[data-tone='bad']:focus-visible {
    color: var(--danger);
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }

    .handle,
    .more-trigger {
      inline-size: var(--tap);
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition: none;
    }
  }
</style>
