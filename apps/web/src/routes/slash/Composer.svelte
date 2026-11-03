<!--
  The one place a question to Slash is typed, on the Slash page.

  A FIELD THAT GROWS, THE ROWS IT IS ABOUT AS CHIPS ABOVE IT, AND ONE SEND. Enter sends, Shift+Enter is a new line.
  Each chip is a row the ask is sent with (`attach`), drawn as the app's capsule with its list's glyph, and taken off by
  its ×, or by Backspace in an empty field.

  @ ATTACHES A ROW. Typed as a word of its own, it opens a list under the field (over it, when the field is docked at
  the foot of a conversation): the rows changed last while nothing follows the @, the rows that answer as letters are
  typed. Arrows move, Enter or Tab picks, Esc closes, a tap picks. The @ and its letters leave the sentence and the row
  becomes a chip. The @ button does the same for a thumb.

  WITH NOTHING TYPED, ENTER AND ESC ARE THE WAITING CARD'S (`onempty`): Enter does what Slash asks, Esc leaves it.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { refOfHref } from '$lib/send/send.ts';
  import { ATTACH_MOST, type Chip } from './with.ts';

  let {
    value = $bindable(''),
    chips = $bindable([]),
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
    chips?: Chip[];
    /** An answer is on its way: the send waits for it. */
    busy?: boolean;
    /** No model behind Slash: nothing can be asked. */
    disabled?: boolean;
    /** At the foot of a conversation, so the @ list opens upward. */
    docked?: boolean;
    placeholder: string;
    onsend: (text: string) => void;
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
    attach: 'Add a row as context',
    remove: (name: string) => `Take ${name} off`,
    recent: 'Changed lately',
    found: 'Rows',
    none: (q: string) => `Nothing called “${q}”`,
    full: `Up to ${ATTACH_MOST} rows`,
    keys: 'to ask',
    newline: 'new line',
  } as const;

  type Hit = { ref: string; label: string; detail: string; icon: string };

  let field = $state<HTMLTextAreaElement>();
  /** The @ word being typed: where its @ is and the letters after it. */
  let token = $state<{ start: number; q: string } | null>(null);
  /** An @ list closed with Esc stays closed until its word changes. */
  let shut = $state<string | null>(null);
  let hits = $state<Hit[]>([]);
  let found = $state(false);
  let cursor = $state(0);
  let asked = 0;

  const open = $derived(token !== null && shut !== `${token.start}:${token.q}` && !disabled);
  const full = $derived(chips.length >= ATTACH_MOST);
  const canSend = $derived(!disabled && !busy && value.trim().length >= 2);
  const lists = $derived(((page.data as { index?: { registers?: { id: string; name: string; icon: string; count: number }[] } }).index?.registers ?? []).map((r) => ({ ...r })));
  const listNamed = $derived(new Map(lists.map((l) => [l.id, l.name] as const)));
  const listOf = (ref: string): string => listNamed.get(ref.split('#')[0] ?? '') ?? '';

  const reader = () => import('$lib/record/palette-live.ts').then((m) => m.paletteReader(apiBase()));

  onMount(() => {
    if (autofocus && matchMedia('(pointer: fine)').matches) field?.focus({ preventScroll: true });
  });

  /** Focus the field, the caret at its end. */
  export function focus(): void {
    field?.focus({ preventScroll: true });
    const n = field?.value.length ?? 0;
    field?.setSelectionRange(n, n);
  }

  /* THE FIELD GROWS WITH WHAT IS TYPED, up to six lines, then scrolls. */
  $effect(() => {
    void value;
    if (!field) return;
    field.style.blockSize = 'auto';
    field.style.blockSize = `${Math.min(field.scrollHeight, 6 * 22 + 20)}px`;
  });

  /** The @ word under the caret, if there is one. */
  function readToken() {
    if (!field) return;
    const before = value.slice(0, field.selectionStart ?? value.length);
    const m = /(^|\s)@([^\s@]{0,40})$/u.exec(before);
    token = m ? { start: before.length - m[2]!.length - 1, q: m[2]! } : null;
  }

  /* THE ROWS FOR THE @ WORD: changed lately with no letters, else what answers them, a beat after the last key. */
  $effect(() => {
    const t = token;
    if (t === null || !open) return;
    const mine = ++asked;
    const wait = setTimeout(
      () => {
        void reader().then(async (r) => {
          let next: Hit[];
          if (t.q === '') {
            const recent = await r.recent(lists as never, 8).catch(() => []);
            next = recent.map((x) => ({ ref: x.target, label: x.title, detail: x.list, icon: String(x.icon ?? 'rows') }));
          } else {
            const out = await r.find(t.q, 8);
            next = out.value.hits.flatMap((h): Hit[] => {
              const ref = refOfHref(h.href);
              return ref ? [{ ref, label: h.title, detail: listOf(ref) || h.detail, icon: String(h.icon ?? 'rows') }] : [];
            });
          }
          if (mine !== asked) return;
          const taken = new Set(untrack(() => chips.map((c) => c.ref)));
          hits = next.filter((h) => !taken.has(h.ref)).slice(0, 7);
          found = true;
          cursor = 0;
        });
      },
      t.q === '' ? 0 : 110,
    );
    return () => clearTimeout(wait);
  });

  function pick(h: Hit) {
    const t = token;
    if (t === null || full) return;
    const after = value.slice(t.start + 1 + t.q.length);
    const head = value.slice(0, t.start);
    value = (head.endsWith(' ') && after.startsWith(' ') ? head + after.slice(1) : head + after).replace(/^\s+/u, '');
    chips = [...chips, { ref: h.ref, label: h.label, icon: h.icon }];
    token = null;
    hits = [];
    found = false;
    const caret = Math.min(head.length, value.length);
    queueMicrotask(() => {
      field?.focus();
      field?.setSelectionRange(caret, caret);
    });
  }

  function drop(ref: string) {
    chips = chips.filter((c) => c.ref !== ref);
    field?.focus();
  }

  /** The @ button: an @ at the caret, a word of its own, so the list opens as if it were typed. */
  function atButton() {
    if (!field || disabled) return;
    const at = field.selectionStart ?? value.length;
    const pad = at > 0 && !/\s$/u.test(value.slice(0, at)) ? ' ' : '';
    value = `${value.slice(0, at)}${pad}@${value.slice(at)}`;
    const caret = at + pad.length + 1;
    shut = null;
    queueMicrotask(() => {
      field?.focus();
      field?.setSelectionRange(caret, caret);
      readToken();
    });
  }

  function send() {
    if (!canSend) return;
    token = null;
    onsend(value.trim());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (open && (hits.length > 0 || e.key === 'Escape')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cursor = (cursor + 1) % Math.max(1, hits.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        cursor = (cursor - 1 + hits.length) % Math.max(1, hits.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        const h = hits[cursor];
        if (h) {
          e.preventDefault();
          pick(h);
          return;
        }
      }
      if (e.key === 'Escape' && token) {
        e.preventDefault();
        e.stopPropagation();
        shut = `${token.start}:${token.q}`;
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() === '') onempty?.('enter');
      else send();
      return;
    }
    if (e.key === 'Escape' && value.trim() === '' && onempty?.('escape')) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && value === '' && chips.length > 0) {
      e.preventDefault();
      chips = chips.slice(0, -1);
    }
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
  {#if chips.length > 0}
    <ul class="chips" aria-label="Sent with the question">
      {#each chips as c (c.ref)}
        <li class="chip" data-loading={c.loading ? '' : undefined}>
          <Icon name={c.icon as IconName} size="s" />
          <span class="chip-name" dir="auto">{c.label}</span>
          <button type="button" class="chip-x tap" aria-label={words.remove(c.label)} onclick={() => drop(c.ref)}><Icon name="close" size="s" /></button>
        </li>
      {/each}
    </ul>
  {/if}
  <textarea
    bind:this={field}
    bind:value
    class="input"
    rows="1"
    aria-label={words.label}
    aria-autocomplete="list"
    aria-controls="slash-at-list"
    aria-activedescendant={open && hits[cursor] ? `slash-at-${cursor}` : undefined}
    {placeholder}
    {disabled}
    enterkeyhint="send"
    autocomplete="off"
    spellcheck="true"
    {onkeydown}
    oninput={readToken}
    onclick={readToken}
    onkeyup={(e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') readToken();
    }}
    onblur={() => setTimeout(() => (token = null), 150)}
  ></textarea>
  <div class="foot">
    {#if needs}
      <span class="grow"></span>
      <a class="needs tap" href={needs.href}>{needs.label}<Icon name="arrow" size="s" /></a>
    {:else}
      <button type="button" class="at tap" aria-label={words.attach} title={words.attach} disabled={disabled || full} onclick={atButton}>@</button>
      {#if hint}<span class="hint">{hint}</span>{/if}
      <span class="grow"></span>
      <span class="keys" aria-hidden="true"><kbd>↵</kbd> {words.keys}<span class="sep"></span><kbd>⇧↵</kbd> {words.newline}</span>
      <button type="submit" class="send tap" aria-label={words.send} disabled={!canSend} data-busy={busy ? '' : undefined}>
        {#if busy}<span class="spin" aria-hidden="true"></span>{:else}<Icon name="arrow" size="m" />{/if}
      </button>
    {/if}
  </div>

  {#if open && (hits.length > 0 || found)}
    <div class="pick" role="presentation">
      <p class="pick-head caps-label">{full ? words.full : token?.q === '' ? words.recent : words.found}</p>
      {#if hits.length > 0 && !full}
        <ul class="pick-list" id="slash-at-list" role="listbox" aria-label={words.attach}>
          {#each hits as h, i (h.ref)}
            <li id={`slash-at-${i}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                class="pick-row tap"
                tabindex="-1"
                data-cursor={i === cursor ? '' : undefined}
                onmouseenter={() => (cursor = i)}
                onmousedown={(e) => e.preventDefault()}
                onclick={() => pick(h)}
              >
                <span class="pick-glyph"><Icon name={h.icon as IconName} size="s" /></span>
                <span class="pick-name" dir="auto">{h.label}</span>
                {#if h.detail}<span class="pick-in">{h.detail}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if !full && token && token.q !== ''}
        <p class="pick-none">{words.none(token.q)}</p>
      {/if}
    </div>
  {/if}
</form>

<style>
  /* ONE SURFACE: the chips, the field and its foot, the tile's fill with the field's edge, the focus ring on the whole. */
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

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CHIP IS THE APP'S CAPSULE: 28 tall, the soft fill, the list's glyph, the name, and its ×. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-inline-size: 100%;
    block-size: var(--ctl-panel, 28px);
    padding-inline: 10px 2px;
    background: var(--soft-fill);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 1;
  }

  .chip :global(svg) {
    flex: none;
    color: var(--ink-3);
  }

  .chip[data-loading] .chip-name {
    color: var(--ink-3);
  }

  .chip-name {
    min-inline-size: 0;
    max-inline-size: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-x {
    display: grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-3);
    cursor: pointer;
  }

  @media (hover: hover) {
    .chip-x:hover {
      background: var(--row-wash-press, var(--row-wash));
      color: var(--ink);
    }
  }

  .input {
    display: block;
    inline-size: 100%;
    min-block-size: 22px;
    margin: 0;
    padding: 2px 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    box-shadow: none;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-row, 15px);
    line-height: 22px;
    resize: none;
    overflow-y: auto;
  }

  .input::placeholder {
    color: var(--ink-3);
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
    margin-inline-start: -4px;
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
    gap: 6px;
    block-size: 32px;
    padding-inline: 14px;
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
    gap: 4px;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    white-space: nowrap;
  }

  .keys .sep {
    inline-size: 10px;
  }

  .keys kbd {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
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

  /* THE @ LIST, a menu on glass: under the field, or over it when the field is at the foot of a conversation. */
  .pick {
    position: absolute;
    inset-inline: 0;
    inset-block-start: calc(100% + 6px);
    z-index: 20;
    max-inline-size: 440px;
    padding: 4px;
    background: var(--glass-regular, var(--tile));
    backdrop-filter: var(--glass-filter, none);
    border-radius: var(--r-pop, 12px);
    box-shadow: var(--glass-edge, none), var(--elev-popover, 0 8px 24px rgb(0 0 0 / 0.16));
  }

  .composer[data-docked] .pick {
    inset-block: auto calc(100% + 6px);
  }

  .pick-head {
    margin: 0;
    padding: 6px 8px 4px;
    color: var(--ink-3);
  }

  .pick-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pick-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: 36px;
    padding-inline: 8px;
    border: 0;
    border-radius: var(--r-menu-row, 8px);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: pointer;
  }

  .pick-row[data-cursor] {
    background: var(--menu-row-fill, var(--row-wash));
  }

  .pick-glyph {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--ink-3);
  }

  .pick-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-in {
    flex: none;
    max-inline-size: 40%;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-none {
    margin: 0;
    padding: 8px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  @media (pointer: coarse) {
    .pick-row {
      min-block-size: 44px;
    }
  }
</style>
