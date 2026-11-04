<!--
  The one place a question to Slash is typed, on the Slash page.

  A FIELD THAT GROWS AND ONE SEND. Enter sends, Shift+Enter is a new line. @ IS INLINE (`$lib/mention`, the same field as
  the panel's): type it anywhere and a list opens at it, and the row picked goes in the sentence as a mention. Its
  letters are the row: delete them and it is gone. The @ button types one for a thumb.

  WITH NOTHING TYPED, ENTER AND ESC ARE THE WAITING CARD'S (`onempty`): Enter does what Slash asks, Esc leaves it.
-->
<script lang="ts">
    import Icon from '$lib/ui/Icon.svelte';
  import MentionField from '$lib/mention/MentionField.svelte';
  import { sentOf, type Mention, type SentMention } from '$lib/mention/mention.ts';

  let {
    value = $bindable(''),
    mentions = $bindable([]),
    busy = false,
    disabled = false,
    docked = false,
    placeholder,
    onsend,
    onempty,
    autofocus = false,
    hint = null,
    needs = null,
  }: {
    value?: string;
    mentions?: Mention[];
    /** An answer is on its way: the send waits for it. */
    busy?: boolean;
    /** No model behind Slash: nothing can be asked. */
    disabled?: boolean;
    /** At the foot of a conversation, so the @ list opens upward. */
    docked?: boolean;
    placeholder: string;
    onsend: (text: string, mentions: readonly SentMention[]) => void;
    /** Enter or Esc with nothing typed. True when it was taken. */
    onempty?: ((key: 'enter' | 'escape') => boolean) | undefined;
    autofocus?: boolean;
    /** One quiet line at the foot, such as the asks left this month. */
    hint?: string | null;
    /** Why nothing can be asked here and the way to change that, drawn in the composer's own foot. */
    needs?: { label: string; href: string } | null;
  } = $props();

  const words = {
    label: 'Ask Slash',
    send: 'Ask',
    mention: 'Mention an item',
    keys: 'to ask',
    newline: 'new line',
  } as const;

  let field = $state<ReturnType<typeof MentionField> | null>(null);

  const canSend = $derived(!disabled && !busy && value.trim().length >= 2);

  /** Focus the field, the caret at its end. */
  export function focus(): void {
    field?.focusEnd();
  }

  /** A row named from outside: a mention at the head of the sentence. */
  export function put(row: { ref: string; label: string }): void {
    field?.put(row);
  }

  function send() {
    if (!canSend) return;
    const said = sentOf(value, mentions);
    onsend(said.text, said.mentions);
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() === '') onempty?.('enter');
      else send();
      return;
    }
    if (e.key === 'Escape' && value.trim() === '' && onempty?.('escape')) e.preventDefault();
  }
</script>

<form
  class="composer"
  data-slash-composer
  data-docked={docked ? '' : undefined}
  data-disabled={disabled ? '' : undefined}
  onsubmit={(e) => {
    e.preventDefault();
    send();
  }}
>
  <div class="input">
    <MentionField
      bind:this={field}
      autofocus={autofocus && matchMedia('(pointer: fine)').matches}
      bind:value
      bind:mentions
      label={words.label}
      {placeholder}
      {disabled}
      above={docked}
      lines={6}
      {onkey}
    />
  </div>
  <div class="foot">
    {#if needs}
      <span class="grow"></span>
      <a class="needs tap" href={needs.href}>{needs.label}<Icon name="arrow" size="s" /></a>
    {:else}
      <button type="button" class="at tap" aria-label={words.mention} title={words.mention} {disabled} onmousedown={(e) => e.preventDefault()} onclick={() => field?.typeAt()}>@</button>
      {#if hint}<span class="hint">{hint}</span>{/if}
      <span class="grow"></span>
      <span class="keys" aria-hidden="true"><kbd>↵</kbd> {words.keys}<span class="sep"></span><kbd>⇧↵</kbd> {words.newline}</span>
      <button type="submit" class="send tap" aria-label={words.send} disabled={!canSend} data-busy={busy ? '' : undefined}>
        {#if busy}<span class="spin" aria-hidden="true"></span>{:else}<Icon name="arrow" size="m" />{/if}
      </button>
    {/if}
  </div>

</form>

<style>
  /* ONE SURFACE: the field and its foot, the tile's fill with the field's edge, the focus ring on the whole. */
  .composer {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-3) var(--sp-2);
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    box-shadow: var(--shadow-card);
    transition: border-color var(--d-state, 120ms) var(--ease-out, ease);
  }

  .composer:focus-within {
    border-color: color-mix(in oklab, var(--focus, var(--ink)) 60%, var(--rule-strong));
    box-shadow:
      0 0 0 2px var(--focus-ring),
      var(--shadow-card);
  }

  .composer[data-disabled] {
    background: var(--tile-2);
    box-shadow: none;
  }

  .input {
    --mf-line: calc(22px * var(--type, 1));
    --mf-pad: 2px;
    display: flex;
    font-size: var(--fs-row, 15px);
    line-height: var(--mf-line);
  }

  /* SIXTEEN UNDER A THUMB, so a phone does not zoom into the field. */
  @media (pointer: coarse) {
    .input {
      font-size: 16px;
    }
  }

  .foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
  }

  .at {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    margin-inline-start: calc(-1 * var(--sp-1));
    padding: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: 16px;
    font-weight: var(--fw-semi);
    cursor: pointer;
  }

  @media (hover: hover) {
    .at:not(:disabled):hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  .at:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .hint {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grow {
    flex: 1;
  }

  .needs {
    display: inline-flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    block-size: 32px;
    padding-inline: calc(14px * var(--dense, 1));
    border-radius: var(--r-pill);
    background: var(--red-fill);
    color: var(--on-red, #fff);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .keys {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    white-space: nowrap;
  }

  .keys .sep {
    inline-size: 10px;
  }

  .keys kbd {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: calc(11px * var(--type, 1));
  }

  /* NO KEYS ON A PHONE: the send is the thumb's. */
  @media (pointer: coarse), (width < 640px) {
    .keys {
      display: none;
    }
  }

  /* THE SCREEN'S ONE PRIMARY: the accent circle, an arrow up. */
  .send {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--red-fill);
    color: var(--on-red, #fff);
    cursor: pointer;
    transition:
      opacity var(--d-state, 120ms) var(--ease-out, ease),
      transform 70ms var(--ease-out, ease);
  }

  .send :global(svg) {
    transform: rotate(-90deg);
  }

  .send:disabled {
    background: var(--soft-fill);
    color: var(--ink-3);
    cursor: default;
  }

  .send[data-busy] {
    background: var(--soft-fill);
  }

  .send:not(:disabled):active {
    transform: scale(0.97);
  }

  .spin {
    inline-size: 14px;
    block-size: 14px;
    border: 2px solid color-mix(in oklab, var(--ink) 25%, transparent);
    border-block-start-color: var(--ink-2);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation-duration: 2.4s;
    }
  }
</style>
