<!--
  The steps of an automation that does more than one thing: a short ordered list that can be dragged into another order,
  moved with Alt and the up and down arrows, added to and taken from. A single step shows nothing here, since there is
  no order to keep.

  THE ORDER IS THE SENTENCE'S ORDER. A change returns the new list of steps and the box reads the sentence again, so
  what is shown is always what the record read and not what this list holds.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import type { ActionOption } from '$lib/flow/source.ts';
  import { addStep, dropStep, keyMove, moveStep, sentenceWords as w } from './sentence.ts';

  let {
    steps,
    options,
    disabled = false,
    onchange,
  }: {
    steps: readonly string[];
    /** What can be added, from the list the automation is about. */
    options: readonly ActionOption[];
    disabled?: boolean;
    onchange: (steps: string[]) => void;
  } = $props();

  let dragging = $state<number | null>(null);
  let over = $state<number | null>(null);
  let list = $state<HTMLElement>();

  const said = (text: string): string => options.find((o) => o.text === text)?.label ?? text;
  const addable = $derived(options.filter((o) => !steps.includes(o.text)));

  /** Moves a step and keeps the keyboard on it: the list is redrawn from the record's answer, so focus is put back after. */
  async function shift(from: number, to: number) {
    if (disabled || from === to) return;
    onchange(moveStep(steps, from, to));
    queueMicrotask(() => requestAnimationFrame(() => list?.querySelectorAll<HTMLElement>('[data-handle]')[to]?.focus()));
  }

  function key(e: KeyboardEvent, at: number) {
    const to = keyMove(e.key, e.altKey, at, steps.length);
    if (to === null) return;
    e.preventDefault();
    void shift(at, to);
  }

  function drop(e: DragEvent, to: number) {
    e.preventDefault();
    const from = dragging;
    dragging = null;
    over = null;
    if (from !== null) void shift(from, to);
  }
</script>

{#if steps.length > 1 || addable.length > 0}
  <div class="steps" aria-label={w.steps}>
    <p class="head">{w.steps}</p>
    <ol bind:this={list}>
      {#each steps as step, at (at)}
        <li
          data-over={over === at && dragging !== null && dragging !== at ? '' : undefined}
          data-drag={dragging === at ? '' : undefined}
          draggable={steps.length > 1 && !disabled}
          ondragstart={(e) => {
            dragging = at;
            e.dataTransfer?.setData('text/plain', String(at));
          }}
          ondragover={(e) => {
            if (dragging === null) return;
            e.preventDefault();
            over = at;
          }}
          ondragend={() => {
            dragging = null;
            over = null;
          }}
          ondrop={(e) => drop(e, at)}
        >
          {#if steps.length > 1}
            <button type="button" class="handle" data-handle aria-label={w.move(at + 1)} aria-describedby="steps-hint" {disabled} onkeydown={(e) => key(e, at)}>
              <Icon name="more" size="s" />
            </button>
          {/if}
          <span class="n num">{at + 1}</span>
          <span class="step">{said(step)}</span>
          {#if steps.length > 1}
            <button type="button" class="drop" aria-label={w.remove(at + 1)} {disabled} onclick={() => onchange(dropStep(steps, at))}>
              <Icon name="close" size="s" />
            </button>
          {/if}
        </li>
      {/each}
    </ol>
    {#if steps.length > 1}<p id="steps-hint" class="hint">{w.stepsHint}</p>{/if}
    {#if addable.length > 0 && !disabled}
      <Menu label={w.add}>
        {#snippet trigger()}<span class="add"><Icon name="plus" size="s" /><span>{w.add}</span></span>{/snippet}
        {#each addable as option (option.text)}
          <button type="button" class="mi" role="menuitem" onclick={() => onchange(addStep(steps, option.text))}>{option.label}</button>
        {/each}
      </Menu>
    {/if}
  </div>
{/if}

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .head,
  .hint {
    margin: 0;
    font-size: var(--fs-meta);
    line-height: 18px;
    color: var(--ink-2);
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-pop);
    background: var(--tile);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  li[draggable='true'] {
    cursor: grab;
  }

  /* WHERE A DROP WOULD LAND is a line in the red, and the step in hand is quieter. */
  li[data-over] {
    box-shadow: 0 -2px 0 0 var(--on);
  }

  li[data-drag] {
    opacity: 0.5;
  }

  .n {
    color: var(--ink-2);
    min-inline-size: 1.5ch;
  }

  .step {
    flex: 1;
    min-inline-size: 0;
  }

  .handle,
  .drop {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 32px;
    min-block-size: 32px;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    cursor: pointer;
  }

  .handle {
    cursor: grab;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }
</style>
