<!--
  CAPTURE: add a row by typing its name and pressing Enter. From 640 the toolbar's primary ("Add a bill or invoice")
  opens it as a line under the toolbar, in the tile, where the row will land; below 640 the head's "+" opens it as the
  bottom sheet. A drawer the height of the window for one field read as an empty panel.

  IT WAS A LINE UNDER THE TOOLBAR, and before that a modal asking for every declared field. The line was the list's
  third row of controls over its first row of data, and the toolbar's end now holds the list's one primary (the UI pass
  of 20 October, money F7), so the line went into the sheet that primary opens: "New bill or invoice", one field, Add,
  and "Fill in the rest" for a row that needs more than its name.

  IT STAYS OPEN AFTER ENTER (motion F7.4): the field empties, the caret stays, and the next name can be typed at once,
  while the row lands in the list behind with the list's motion. It closes on Close, Esc or a pull down. A press of Add
  with nothing typed puts the caret back in the field and adds nothing: a primary is never drawn disabled (first F16).

  `form` AND `type="submit"` RATHER THAN A KEYDOWN HANDLER, because Enter in a single-field form is the platform's own
  behaviour and a phone's keyboard prints "Go" for it without being asked.

  THE LINE IS THE PAGE'S. `value` is bound to the page's `capture`, because the page empties it when the question
  changes and puts the typing back when the record refuses it; `open` is the page's too, since what opens the sheet is
  in the head and the toolbar; `captureRow` and `allFields` are the page's, and this file only draws the sheet.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { rowIn, rowOut } from '$lib/ui/motion.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';

  let {
    one,
    example = null,
    named = null,
    value = $bindable(''),
    open = $bindable(false),
    captureRow,
    allFields,
    fault = null,
    asked = null,
    onsame,
    onnew,
  }: {
    one: string;
    /** A name from the list itself, shown in the field as what a name here looks like. */
    example?: string | null;
    /** A list of people or of organisations, asked for by name ("Who?") with an example nobody here holds. */
    named?: 'person' | 'org' | null;
    value?: string;
    /** The sheet, which the toolbar's primary and the phone's "+" open. */
    open?: boolean;
    captureRow: () => void;
    /** The whole form, for a row that needs more than its name. Absent, the sheet offers only Add. */
    allFields?: (() => void) | undefined;
    /** Why the last line was refused, in the list's words, said under the field (audit 31 Oct h, AH5). */
    fault?: string | null;
    /** A question the line waits on, said under the field with its two answers (AM18): "Is this Salma, the client
        already here?" */
    asked?: string | null;
    onsame?: (() => void) | undefined;
    onnew?: (() => void) | undefined;
  } = $props();

  /* This part's own words. */
  const words = {
    title: (what: string) => `New ${what}`,
    ask: (eg: string | null) => (named === 'person' ? 'Who? e.g. Sam Lee' : named === 'org' ? 'Name, e.g. Northwind Ltd' : eg ? `What is it? e.g. ${eg}` : 'What is it?'),
    allFields: 'Fill in the rest',
    same: 'Same person',
    someoneNew: 'Someone new',
    close: 'Close',
  } as const;

  /* THE LINE CLOSES ON ESCAPE and gives the keyboard back to the button that opened it. */
  function closeLine() {
    open = false;
    void tick().then(() => document.querySelector<HTMLElement>('[data-capture-open]')?.focus());
  }

  /* The line's field takes the caret the moment it opens. */
  const caret = (node: HTMLInputElement) => {
    node.focus();
  };

  let input = $state<HTMLInputElement>();

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (value.trim()) captureRow();
    /* THE CARET STAYS FOR THE NEXT ONE, and an empty press is answered by putting it there. */
    await tick();
    input?.focus();
  }
</script>

{#if !rowsAsCards()}
  {#if open}
    <form class="capture capture-line" class:capture-asking={asked} in:rowIn out:rowOut onsubmit={add} aria-label={words.title(one)}>
      <label class="capture-label" for="capture">{copy.captureIn(one)}</label>
      <div class="field capture-box">
        <Icon name="plus" size="s" />
        <input
          bind:this={input}
          {@attach caret}
          id="capture"
          class="field-input capture-input"
          type="text"
          autocomplete="off"
          bind:value
          placeholder={words.ask(example)}
          onkeydown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            closeLine();
          }}
          aria-describedby={fault ? 'capture-fault' : undefined}
        />
      </div>
      {#if fault}<p class="capture-fault" id="capture-fault" role="alert">{fault}</p>{/if}
    {#if asked}
      <div class="capture-ask" role="group" aria-labelledby="capture-asked">
        <p id="capture-asked" role="status">{asked}</p>
        <Button weight="primary" onclick={() => onsame?.()}>{words.same}</Button>
        <Button weight="quiet" onclick={() => onnew?.()}>{words.someoneNew}</Button>
      </div>
    {/if}
      <Button weight="primary" type="submit" data-capture-go>{copy.captureAdd}</Button>
      {#if allFields}<Button weight="quiet" onclick={() => allFields?.()}>{words.allFields}</Button>{/if}
      <button type="button" class="capture-close tap" aria-label={words.close} onclick={closeLine}><Icon name="close" size="s" /></button>
    </form>
  {/if}
{:else}
<Sheet bind:open title={words.title(one)}>
  <form id="capture-sheet" class="capture" onsubmit={add}>
    <label class="capture-label" for="capture">{copy.captureIn(one)}</label>
    <div class="field capture-box">
      <Icon name="plus" size="s" />
      <input
        bind:this={input}
        id="capture"
        class="field-input capture-input"
        type="text"
        autocomplete="off"
        enterkeyhint="done"
        bind:value
        placeholder={words.ask(example)}
        aria-describedby={fault ? 'capture-fault' : undefined}
      />
    </div>
    {#if fault}<p class="capture-fault" id="capture-fault" role="alert">{fault}</p>{/if}
    {#if asked}
      <div class="capture-ask" role="group" aria-labelledby="capture-asked">
        <p id="capture-asked" role="status">{asked}</p>
        <Button weight="primary" onclick={() => onsame?.()}>{words.same}</Button>
        <Button weight="quiet" onclick={() => onnew?.()}>{words.someoneNew}</Button>
      </div>
    {/if}
  </form>
  {#snippet footer()}
    {#if allFields}
      <Button
        weight="quiet"
        onclick={() => {
          open = false;
          allFields?.();
        }}>{words.allFields}</Button
      >
    {/if}
    <Button weight="primary" type="submit" form="capture-sheet" data-capture-go>{copy.captureAdd}</Button>
  {/snippet}
</Sheet>
{/if}

<style>
  /* WHY THE LINE WAS REFUSED, under the field, in the warning ink, inside the sheet where the press was made. */
  .capture-fault {
    flex-basis: 100%;
    margin: var(--sp-1) 0 0;
    color: var(--red);
    font-size: var(--fs-cap);
  }

  /* THE QUESTION THE LINE WAITS ON, under the field, its two answers beside it, wrapping at a phone's width. */
  .capture-ask {
    order: 1;
    display: flex;
    flex-basis: 100%;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .capture-ask p {
    flex-basis: 100%;
    margin: 0;
    color: var(--ink);
  }

  /* ONE FIELD, AND IT LOOKS LIKE ONE. The label is for a screen reader: the field's own placeholder says what to type,
     and a visible label above a single-field form turns one line into three. */
  .capture {
    margin: 0;
  }

  .capture-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE FIELD IS `controls.css`'s, 44 tall here at every width since it is the sheet's whole content, with the ring
     every field wears on its box. */
  .capture-box {
    min-block-size: var(--tap);
  }

  /* The body size under a mouse, and 16px under a thumb, so a phone never zooms into the field. */
  .capture-input {
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  @media (pointer: coarse) {
    .capture-input {
      font-size: var(--fs-body, 16px);
    }
  }

  .capture-input::placeholder {
    color: var(--ink-3);
  }

  /* FROM 640, ONE LINE IN THE TILE: the field takes the room, then Add, Fill in the rest and the close. */
  .capture-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .capture-asking {
    flex-wrap: wrap;
  }

  .capture-line .capture-box {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 40px;
  }

  .capture-close {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .capture-close:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }
</style>
