<!--
  One template field, with its data tokens drawn as pills: `{{vars.rate}}` is a pill that says `rate`, and nobody at
  the canvas meets a brace ("data tokens as pills, never raw braces").

  AN EDITABLE BOX, NOT AN INPUT, because an `<input>` holds only characters and a pill is not one. The box is
  `contenteditable="plaintext-only"`, so a paste lands as words and never as somebody's markup; each pill is a
  `contenteditable="false"` span the caret steps over and Backspace takes out whole. What the box holds is read back
  as text by walking it (`read`), a pill as its braces, so the value this hands up is exactly the template the record
  fills (`fill` in `packages/kernel/src/flow.ts`), and `chips.ts` `piecesOf` is the one reading of it the other way.

  THE BOX IS DRAWN FROM THE VALUE ONLY WHEN THE VALUE COMES FROM OUTSIDE. Redrawing on every keystroke would throw the
  caret to the start; the value this component last handed up is remembered (`emitted`) and a value equal to it is
  left alone, as `QueryBuilder.svelte` does with its tree.

  A CHIP GOES IN WHERE THE CARET WAS. The chips under the box are the answers the step can read, grouped by where each
  comes from (`chips.ts` `groupChips`); pressing one does not move focus out of the box (the press is kept from taking
  it), so the selection it replaces is the one the person made.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { chipWord, piecesOf, type ChipGroup } from './chips.ts';
  import { words } from './flow.ts';

  let {
    id,
    labelledby,
    value,
    multiline = false,
    placeholder = '',
    groups = [],
    onchange,
  }: {
    id: string;
    /** The id of the visible label above the box, which names it for a screen reader as `for` would an input. */
    labelledby: string;
    value: string;
    multiline?: boolean;
    placeholder?: string | undefined;
    groups?: readonly ChipGroup[];
    onchange: (text: string) => void;
  } = $props();

  let box = $state<HTMLDivElement>();
  let emitted: string | null = null;
  /** Where the caret last was inside the box, so a chip pressed after it goes there. */
  let caret: Range | null = null;

  /* A PILL IS MADE HERE, and its class is styled below through `:global`, since Svelte scopes only what its markup emits. */
  function pill(ref: string): HTMLSpanElement {
    const s = document.createElement('span');
    s.className = 'tok-pill';
    s.contentEditable = 'false';
    s.dataset.ref = ref;
    s.textContent = chipWord(ref);
    return s;
  }

  function draw(text: string) {
    if (!box) return;
    box.replaceChildren(...piecesOf(text).map((p) => ('ref' in p ? pill(p.ref) : document.createTextNode(p.text))));
  }

  $effect(() => {
    const v = value;
    if (!box || v === emitted) return;
    emitted = v;
    untrack(() => draw(v));
  });

  /** The box as text: words as they are, a pill as its braces, a line break the browser drew as a new line. */
  function read(node: globalThis.Node): string {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.textContent ?? '';
      else if (c instanceof HTMLElement) {
        if (c.dataset.ref) out += `{{${c.dataset.ref}}}`;
        else if (c.tagName === 'BR') out += '\n';
        else {
          if ((c.tagName === 'DIV' || c.tagName === 'P') && out !== '' && !out.endsWith('\n')) out += '\n';
          out += read(c);
        }
      }
    }
    return out;
  }

  function commit() {
    if (!box) return;
    const text = read(box);
    /* A ONE-LINE FIELD NEVER HOLDS A LINE BREAK, which a paste could still carry past the Enter the keys refuse. */
    const said = multiline ? text : text.replace(/\n+/gu, ' ');
    emitted = said;
    onchange(said);
  }

  function keep() {
    const sel = globalThis.getSelection?.();
    if (box && sel && sel.rangeCount > 0 && box.contains(sel.getRangeAt(0).startContainer)) caret = sel.getRangeAt(0).cloneRange();
  }

  function insert(ref: string) {
    if (!box) return;
    const p = pill(ref);
    const at = caret && box.contains(caret.startContainer) ? caret : null;
    if (at) {
      at.deleteContents();
      at.insertNode(p);
    } else box.append(p);
    const after = document.createRange();
    after.setStartAfter(p);
    after.collapse(true);
    box.focus();
    const sel = globalThis.getSelection?.();
    sel?.removeAllRanges();
    sel?.addRange(after);
    caret = after.cloneRange();
    commit();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !multiline) e.preventDefault();
  }
</script>

<div class="field tok-field" data-multi={multiline ? '' : undefined}>
  <div
    {id}
    bind:this={box}
    class="tok-box"
    role="textbox"
    tabindex="0"
    aria-labelledby={labelledby}
    aria-multiline={multiline}
    contenteditable="plaintext-only"
    spellcheck="false"
    data-placeholder={placeholder}
    oninput={() => {
      commit();
      keep();
    }}
    onkeyup={keep}
    onmouseup={keep}
    onblur={keep}
    {onkeydown}
  ></div>
</div>
{#if groups.length > 0}
  <!-- EACH HEADING NAMES ITS GROUP, because two chips can share a word ("amount" from the row and from a call), and a
       screen reader hearing "Put amount in" twice needs the heading to tell them apart. -->
  <div class="tok-groups">
    {#each groups as g, i (g.label)}
      <p class="tok-head" id="{id}-from-{i}">{g.label}</p>
      <div class="tok-chips" role="group" aria-labelledby="{id}-from-{i}">
        {#each g.chips as c (c.path)}
          <button type="button" class="tok-chip" aria-label={words.chipInsert(c.word)} onpointerdown={(e) => e.preventDefault()} onclick={() => insert(c.path)}>{c.word}</button>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .tok-field {
    align-items: stretch;
    padding: 0;
  }

  .tok-box {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-3);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    cursor: text;
  }

  .tok-field[data-multi] .tok-box {
    min-block-size: calc(var(--ctl-h) * 2.5);
  }

  .tok-box:focus-visible {
    /* focus-ok: `.field:focus-within` in controls.css draws the ink ring on the wrapper. */
    outline: none;
  }

  .tok-box:empty::before {
    content: attr(data-placeholder);
    color: var(--ink-3);
  }

  /* A PILL IN THE RUNNING TEXT: the tile's own white on the field's `--tile-2` well, edged by a hairline ring the way the
     chosen segment is, in the UI face at the meta size, and never split across two lines. */
  .tok-box :global(.tok-pill) {
    display: inline-block;
    margin: 0 1px;
    padding: 0 var(--sp-2);
    background: var(--tile);
    border-radius: var(--r-ctl);
    box-shadow: 0 0 0 0.5px var(--rule);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 1.5;
    white-space: nowrap;
    user-select: all;
  }

  .tok-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .tok-head {
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .tok-chips {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--dense, 1));
  }

  /* A CHIP TO PUT IN IS A QUIET PILL: the tile's inner fill, no border, the second ink, and a step
     darker under the pointer. */
  .tok-chip {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .tok-chip:hover {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .tok-chip {
      min-block-size: var(--tap);
    }

    .tok-box {
      min-block-size: var(--tap);
      font-size: var(--fs-body);
    }
  }
</style>
