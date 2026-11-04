<!--
  The field a question to Slash is typed in, in the panel and on Slash's own page: one sentence, and @ in it.

  A REAL TEXTAREA OVER A MIRROR. The textarea does the typing and draws the words, so IME, spellcheck, selection, undo,
  paste as text, right to left and the phone's own keyboard are all the browser's. Behind it a mirror holds the same
  letters in the same type, transparent, and paints only each mention's fill. Nothing can go out of step with what is
  typed, and if a browser ever draws a line a pixel off, the worst of it is a fill a pixel off: the words stay readable.
  The mirror is also what gives the field its height, so it grows with the sentence as Slack's does, up to `lines`, then
  scrolls, with no measuring and no jump. And it says where the @ is on screen, which a textarea cannot.

  TYPE @ AT THE START OR AFTER A SPACE, and a list opens at that @ (`MentionList.svelte`). Up and Down move, Enter or Tab
  picks, Esc closes it and leaves the @ as words, and Enter while it is open never sends.

  THE PICK GOES IN THE SENTENCE: `@Name`, a space, the caret after it. It goes in through `execCommand`, the one way to
  change a text field that keeps its undo. A mention is one thing to the caret: arrows step over it, a click inside it
  lands at an end, a selection takes all of it, and Backspace at its end deletes it whole. What became of it is `mention.ts`.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { apiBase } from '../at.ts';
  import { best, early, keep, merged } from '../record/search-kept.ts';
  import { keptRead } from '../shell/side-read.ts';
  import type { SearchResult } from '../record/api.ts';
  import { ATTACH_MOST } from '../../routes/slash/with.ts';
  import { lastLately, OFFERS_MOST, offersOf, readerFor, readLately, tell, type Offer } from './find.ts';
  import MentionList from './MentionList.svelte';
  import { editOf, endingAt, foundAgain, labelOf, piecesOf, shifted, snapped, startingAt, stillThere, tokenOf, triggerAt, type Mention, type Trigger } from './mention.ts';

  let {
    value = $bindable(''),
    mentions = $bindable([]),
    field = $bindable(),
    label,
    placeholder,
    disabled = false,
    above = false,
    lines = 5,
    describedby,
    autofocus = false,
    onkey,
  }: {
    value?: string;
    mentions?: Mention[];
    /** The textarea, for whoever gives it focus. */
    field?: HTMLTextAreaElement | HTMLInputElement | undefined;
    label: string;
    placeholder?: string | undefined;
    disabled?: boolean;
    /** The field sits at the foot of something, so the list opens over the @ when it can. */
    above?: boolean;
    /** How many lines it grows to before it scrolls. */
    lines?: number;
    describedby?: string | undefined;
    autofocus?: boolean;
    /** A key the field and its list did not take: Enter to send, and so on. */
    onkey?: ((e: KeyboardEvent) => void) | undefined;
  } = $props();

  const listId = `mention-list-${Math.random().toString(36).slice(2, 8)}`;

  let box = $state<HTMLTextAreaElement>();
  let mirror = $state<HTMLDivElement>();
  $effect(() => {
    field = box;
  });
  onMount(() => {
    if (autofocus) box?.focus({ preventScroll: true });
  });

  /* WHAT THE FIELD LAST HELD, so an edit can be told from a change made from outside, and each span moved by it. */
  let held = '';
  let cameFrom = 0;
  let composing = false;
  let dragging = false;
  /* TYPED IN SINCE IT WAS LAST CLEARED FROM OUTSIDE: ⌘Z is this field's own even with all the words deleted (`AppFrame`). */
  let edited = $state(false);
  /** Every mention this draft has had, so undo and paste can find them again. */
  const known = new Map<string, Mention>();

  let trigger = $state<Trigger | null>(null);
  /** The @ an Esc closed: its list stays closed until that @ is gone or the caret has left it. */
  let shut = $state<number | null>(null);
  let offers = $state<Offer[]>([]);
  let answered = $state(false);
  /** The rows drawn are for letters typed before the last ones, so Enter waits rather than picks one of them. */
  let stale = $state(false);
  let cursor = $state(0);
  let asked = 0;
  let namesAsked = false;
  let shown: SearchResult | null = null;

  const wanting = $derived(trigger !== null && shut !== trigger.start && !disabled);
  const q = $derived(wanting ? (trigger?.q ?? '') : null);
  /* A PERSON'S ADDRESS IS LOOKED FOR BY WHAT COMES BEFORE ITS @: the record indexes names, and "ada@vine.co" holds "ada". */
  const asking = $derived(q !== null && /[^@]@/u.test(q) ? q.slice(0, q.indexOf('@')) : q);
  const spaced = $derived(q !== null && q.includes(' '));
  const full = $derived(new Set(mentions.map((m) => m.ref)).size >= ATTACH_MOST);
  /* A NAME WITH A SPACE IN IT THAT NOTHING ANSWERS IS JUST THE SENTENCE GOING ON, and the list goes away unasked. */
  const drawn = $derived(wanting && (offers.length > 0 || full || (answered && !spaced)));
  /* ENTER NEVER SENDS WHILE THE LIST IS OPEN OR ON ITS WAY: "@ba" and a fast Enter did not mean send "@ba". */
  const holdsEnter = $derived(wanting && (drawn || !spaced));
  const at = $derived(drawn && trigger ? trigger.start : null);
  const pieces = $derived(piecesOf(value, mentions, at));

  const registers = $derived(((page.data as { index?: { registers?: { id: string; name: string; icon: string }[] } }).index?.registers ?? []).map((r) => ({ id: r.id, name: r.name, icon: String(r.icon) })));
  const listNamed = $derived(new Map(registers.map((l) => [l.id, l.name] as const)));
  const listOf = (ref: string): string => listNamed.get(ref.split('#')[0] ?? '') ?? '';
  const lead = (): string | null => {
    const id = keptRead(apiBase())?.list;
    return id ? (listNamed.get(id) ?? null) : null;
  };

  /* A CHANGE FROM OUTSIDE (sent, cleared, a question put in the field) keeps only the mentions still in the words. */
  $effect(() => {
    const now = value;
    untrack(() => {
      if (now === held) return;
      held = now;
      if (now === '') {
        known.clear();
        edited = false;
      }
      const kept = stillThere(now, mentions);
      if (kept.length !== mentions.length) mentions = kept;
      read();
    });
  });

  /** Read where the caret is: the @ word it is in, if any. */
  function read() {
    if (!box || document.activeElement !== box) {
      trigger = null;
      return;
    }
    const caret = box.selectionStart ?? value.length;
    const collapsed = box.selectionStart === box.selectionEnd;
    const next = collapsed ? triggerAt(value, caret, mentions) : null;
    if (next === null) shut = null;
    if (next?.start !== trigger?.start || next?.q !== trigger?.q) trigger = next;
  }

  /* THE CARET AND THE MENTIONS, whatever moved it. `selectionchange` is on the document, and only the field's is ours. */
  function settle() {
    if (!box || composing || document.activeElement !== box) return;
    const s = box.selectionStart ?? 0;
    const e = box.selectionEnd ?? s;
    if (!dragging && !(s !== e && matchMedia('(pointer: coarse)').matches)) {
      const fit = snapped(mentions, s, e, cameFrom);
      if (fit) {
        box.setSelectionRange(fit.start, fit.end, box.selectionDirection ?? 'none');
        cameFrom = fit.start === fit.end ? fit.start : cameFrom;
        read();
        return;
      }
    }
    if (s === e) cameFrom = s;
    read();
  }

  $effect(() => {
    document.addEventListener('selectionchange', settle);
    return () => document.removeEventListener('selectionchange', settle);
  });

  function oninput(e: Event) {
    if (!box) return;
    const now = box.value;
    const kind = (e as InputEvent).inputType ?? '';
    const moved = shifted(mentions, editOf(held, now, box.selectionStart ?? now.length));
    mentions = /^history|FromPaste|FromDrop/u.test(kind) ? foundAgain(now, known.values(), moved) : moved;
    held = now;
    value = now;
    edited = true;
    cameFrom = box.selectionStart ?? now.length;
    read();
  }

  /** Change the letters from `from` to `to`, keeping undo. Every edit of ours comes through here and `oninput` above. */
  function replace(from: number, to: number, text: string) {
    if (!box) return;
    box.focus({ preventScroll: true });
    const was = box.value;
    box.setSelectionRange(from, to);
    let done = false;
    try {
      done = text === '' ? document.execCommand('delete') : document.execCommand('insertText', false, text);
    } catch {
      done = false;
    }
    /* A BROWSER WITH NO `execCommand` ON A TEXT FIELD STILL GETS THE WORDS, without their undo. */
    if (!done || box.value === was) {
      box.setRangeText(text, from, to, 'end');
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }
  }

  function pick(o: Offer) {
    const t = trigger;
    if (!box || !t || full) return;
    let end = t.start + 1 + t.q.length;
    while (end < value.length && !/[\s@]/u.test(value[end]!)) end++;
    const name = labelOf(o.label);
    const token = tokenOf(name);
    const spaceAfter = end < value.length && /\s/u.test(value[end]!);
    replace(t.start, end, spaceAfter ? token : `${token} `);
    const span: Mention = { start: t.start, end: t.start + token.length, ref: o.ref, label: name };
    known.set(token, span);
    mentions = [...mentions.filter((m) => m.end <= span.start || m.start >= span.end), span].sort((a, b) => a.start - b.start);
    const caret = span.end + 1;
    box.setSelectionRange(caret, caret);
    cameFrom = caret;
    shut = null;
    trigger = null;
    offers = [];
    answered = false;
  }

  /** The @ button: an @ at the caret, as if typed, a word of its own, and the list opens on it. */
  export function typeAt(): void {
    if (!box || disabled) return;
    box.focus({ preventScroll: true });
    if (wanting) return;
    const from = box.selectionEnd ?? value.length;
    const pad = from > 0 && !/\s/u.test(value[from - 1]!) ? ' ' : '';
    replace(from, from, `${pad}@`);
    const caret = from + pad.length + 1;
    box.setSelectionRange(caret, caret);
    shut = null;
    read();
  }

  /** A row named from outside (`/slash?with=`): a mention at the start of the sentence, kept off undo as it was no typing. */
  export function put(row: { ref: string; label: string }): void {
    if (mentions.some((m) => m.ref === row.ref)) return;
    const name = labelOf(row.label);
    const token = `${tokenOf(name)} `;
    const span: Mention = { start: 0, end: token.length - 1, ref: row.ref, label: name };
    known.set(tokenOf(name), span);
    mentions = [span, ...shifted(mentions, { from: 0, oldTo: 0, newTo: token.length })];
    held = `${token}${value}`;
    value = held;
  }

  /** Focus, the caret at the end of the words. */
  export function focusEnd(): void {
    box?.focus({ preventScroll: true });
    const n = value.length;
    box?.setSelectionRange(n, n);
  }

  /**
   * THE KEYS. `keyCode` 229 too: Safari ends a composition with an Enter that has `isComposing` false, and that Enter
   * belongs to the IME, not to sending.
   */
  function onkeydown(e: KeyboardEvent) {
    if (!box || e.isComposing || e.keyCode === 229) return;
    if (wanting) {
      if (drawn && e.key === 'ArrowDown' && offers.length > 0) {
        e.preventDefault();
        cursor = (cursor + 1) % offers.length;
        return;
      }
      if (drawn && e.key === 'ArrowUp' && offers.length > 0) {
        e.preventDefault();
        cursor = (cursor - 1 + offers.length) % offers.length;
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey && holdsEnter) || (e.key === 'Tab' && !e.shiftKey && offers.length > 0 && !full)) {
        e.preventDefault();
        e.stopPropagation();
        /* THE ROWS ON SCREEN ARE FOR EARLIER LETTERS: Enter waits for the answer rather than pick one of them. */
        if (stale && !full) return;
        const o = offers[cursor];
        if (o && !full) pick(o);
        else if (answered || full) shut = trigger?.start ?? null;
        return;
      }
      if (e.key === 'Escape' && drawn) {
        e.preventDefault();
        e.stopPropagation();
        shut = trigger?.start ?? null;
        return;
      }
    }
    if (tokenKey(e)) return;
    onkey?.(e);
  }

  /* A PHONE'S KEYBOARD SAYS NOTHING USEFUL ON KEYDOWN (Android sends 229 for every key): Backspace reaches us here instead. */
  function onbeforeinput(e: InputEvent) {
    if (!box || composing || !e.cancelable || e.inputType !== 'deleteContentBackward') return;
    const s = box.selectionStart ?? 0;
    if (s !== box.selectionEnd) return;
    const m = endingAt(mentions, s);
    if (!m) return;
    e.preventDefault();
    replace(m.start, m.end, '');
  }

  /** Whether a mention took the key: it goes whole, and arrows step over it. */
  function tokenKey(e: KeyboardEvent): boolean {
    if (!box || mentions.length === 0) return false;
    const s = box.selectionStart ?? 0;
    const end = box.selectionEnd ?? s;
    if (e.key === 'Backspace' && s === end && !e.metaKey) {
      const m = endingAt(mentions, s);
      if (m) return take(e, () => replace(m.start, m.end, ''));
      /* A WHOLE-WORD DELETE TAKES THE MENTION IT REACHES, rather than half its name. */
      if (e.altKey || e.ctrlKey) {
        let at = s;
        while (at > 0 && /\s/u.test(value[at - 1]!)) at--;
        const near = at < s ? endingAt(mentions, at) : undefined;
        if (near) return take(e, () => replace(near.start, s, ''));
      }
      return false;
    }
    if (e.key === 'Delete' && s === end && !e.metaKey) {
      const m = startingAt(mentions, s);
      return m ? take(e, () => replace(m.start, m.end, '')) : false;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.altKey && !e.ctrlKey) {
      const rtl = getComputedStyle(box).direction === 'rtl';
      const back = (e.key === 'ArrowLeft') !== rtl;
      if (e.shiftKey) {
        const toEnd = box.selectionDirection !== 'backward';
        const focus = s === end ? s : toEnd ? end : s;
        const anchor = s === end ? s : toEnd ? s : end;
        const m = back ? endingAt(mentions, focus) : startingAt(mentions, focus);
        if (!m) return false;
        const to = back ? m.start : m.end;
        return take(e, () => box?.setSelectionRange(Math.min(anchor, to), Math.max(anchor, to), to < anchor ? 'backward' : 'forward'));
      }
      if (s !== end) return false;
      const m = back ? endingAt(mentions, s) : startingAt(mentions, s);
      if (!m) return false;
      const to = back ? m.start : m.end;
      return take(e, () => {
        box?.setSelectionRange(to, to);
        cameFrom = to;
        read();
      });
    }
    return false;
  }

  const take = (e: KeyboardEvent, act: () => void): true => {
    e.preventDefault();
    act();
    return true;
  };

  /* THE ROWS FOR THE LETTERS: nothing typed is the rows touched last, and letters are answered from this device at once
     and by the record a beat later, the rows already drawn staying where they are. */
  $effect(() => {
    const letters = asking;
    if (letters === null) {
      untrack(() => {
        asked++;
        offers = [];
        answered = false;
        stale = false;
        shown = null;
        cursor = 0;
      });
      return;
    }
    const mine = ++asked;
    const base = apiBase();
    const lists = untrack(() => registers);
    const show = (rows: Offer[]) => {
      if (mine !== asked) return;
      const was = untrack(() => offers[cursor]?.ref);
      offers = rows;
      answered = true;
      stale = false;
      const again = rows.findIndex((o) => o.ref === was);
      cursor = again >= 0 ? again : 0;
    };
    if (!namesAsked) {
      namesAsked = true;
      void readerFor(base).then((r) => r.names());
    }
    if (letters === '') {
      const kept = lastLately(base);
      if (kept) show(tell(kept));
      void readLately(base, lists).then(show);
      return;
    }
    untrack(() => (stale = true));
    const hasSpace = letters.includes(' ');
    const kept = early(base, letters, OFFERS_MOST, lead());
    if (kept) {
      shown = kept.value;
      show(offersOf(best(letters, kept.value, lead()), listOf));
      /* NOTHING FOR LESS IS NOTHING FOR MORE: the sentence going on past a name asks the record nothing. */
      if (kept.exact && kept.value.total === 0 && hasSpace) return;
    }
    const wait = setTimeout(() => {
      void readerFor(base)
        .then((r) => r.find(letters, OFFERS_MOST))
        .then((out) => {
          if (mine !== asked) return;
          if (out.fix === null) keep(base, letters, out.value);
          const answer = merged(shown, best(letters, out.value, lead()));
          shown = answer;
          show(offersOf(answer, listOf));
        });
    }, 110);
    return () => clearTimeout(wait);
  });

  /* (AND IN THE MARKUP, A ZERO-WIDTH MARK ONLY WHERE A LINE WOULD OTHERWISE HAVE NO HEIGHT: empty, or after a new line. After a
     space at the very edge of a line it would wrap by itself and make the field a line too tall.) */

  /* THE SCROLLED LINES OF A LONG SENTENCE: the mirror scrolls as the field does. */
  const follow = () => {
    if (mirror && box) mirror.scrollTop = box.scrollTop;
  };
  /* A CLASSIC SCROLLBAR TAKES WIDTH FROM THE TEXTAREA ALONE, and the mirror would wrap elsewhere. */
  $effect(() => {
    const b = box;
    const m = mirror;
    if (!b || !m) return;
    const fit = () => {
      const bar = b.offsetWidth - b.clientWidth;
      const pad = bar > 0 ? `${bar}px` : '';
      if (m.style.paddingInlineEnd !== pad) m.style.paddingInlineEnd = pad;
      follow();
    };
    const watch = new ResizeObserver(fit);
    watch.observe(b);
    return () => watch.disconnect();
  });
  $effect(() => {
    void value;
    queueMicrotask(follow);
  });
</script>

<div class="mf" style:--mf-lines={lines}>
  <div class="mf-mirror" bind:this={mirror} dir="auto" aria-hidden="true">{#each pieces as p}{#if p.kind === 'text'}{p.text}{:else if p.kind === 'token'}<span class="mf-token">{p.text}</span>{:else}<span class="mf-at" data-mention-at>{p.text}</span>{/if}{/each}{#if value === '' || value.endsWith('\n')}&#8203;{/if}</div>
  <!-- svelte-ignore a11y_autofocus (SvelteKit hands focus to the body as a page lands, unless something says `autofocus`.) -->
  <textarea
    bind:this={box}
    {autofocus}
    class="mf-input"
    rows="1"
    dir="auto"
    data-edited={edited ? '' : undefined}
    {value}
    {placeholder}
    {disabled}
    role="combobox"
    aria-label={label}
    aria-autocomplete="list"
    aria-expanded={drawn}
    aria-controls={drawn ? listId : undefined}
    aria-activedescendant={drawn && offers[cursor] ? `${listId}-${cursor}` : undefined}
    aria-describedby={describedby}
    enterkeyhint="send"
    autocomplete="off"
    spellcheck="true"
    {onkeydown}
    {onbeforeinput}
    {oninput}
    onscroll={follow}
    onclick={settle}
    onkeyup={settle}
    onpointerdown={() => {
      dragging = true;
      const up = () => {
        dragging = false;
        removeEventListener('pointerup', up, true);
        removeEventListener('pointercancel', up, true);
        queueMicrotask(settle);
      };
      addEventListener('pointerup', up, true);
      addEventListener('pointercancel', up, true);
    }}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => {
      composing = false;
      settle();
    }}
    onfocus={settle}
    onblur={() =>
      setTimeout(() => {
        if (document.activeElement !== box) trigger = null;
      }, 150)}
  ></textarea>
  {#if drawn}
    <MentionList
      id={listId}
      anchor={mirror}
      {above}
      rows={offers}
      {cursor}
      {full}
      most={ATTACH_MOST}
      nothing={!full && offers.length === 0 ? (q ?? '') : null}
      lately={q === ''}
      onhover={(i) => (cursor = i)}
      onpick={pick}
    />
  {/if}
</div>

<style>
  /* ONE CELL: the mirror in the flow gives the height, the textarea lies over it and fills it. */
  .mf {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
    min-inline-size: 0;
  }

  /* THE SAME TYPE AND THE SAME WRAP, LETTER FOR LETTER, or the fills would land beside their words. */
  .mf-mirror,
  .mf-input {
    grid-area: 1 / 1;
    box-sizing: border-box;
    margin: 0;
    padding-block: var(--mf-pad, 2px);
    padding-inline: 0;
    border: 0;
    font: inherit;
    letter-spacing: inherit;
    text-align: start;
    text-indent: 0;
    text-transform: none;
    text-rendering: auto;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: normal;
  }

  .mf-mirror {
    max-block-size: calc(var(--mf-lines) * var(--mf-line, 22px) + 2 * var(--mf-pad, 2px));
    overflow: hidden;
    color: transparent;
    pointer-events: none;
    user-select: none;
  }

  .mf-input {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    border-radius: 0;
    outline: 0;
    box-shadow: none;
    background: none;
    color: var(--ink);
    resize: none;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    appearance: none;
    scrollbar-width: thin;
  }

  .mf-input::placeholder {
    color: var(--ink-3);
  }

  .mf-input:focus-visible {
    /* focus-ok: the caret is the field's own sign of focus, and the box round it carries the state change. */
    outline: none;
    box-shadow: none;
  }

  /* A MENTION: a fill behind its letters, as Slack and Discord draw one. A shadow gives it room at its ends, since any
     padding would move the letters off the textarea's. */
  .mf-token {
    --mention-fill: color-mix(in oklab, var(--info) 18%, transparent);
    background: var(--mention-fill);
    border-radius: 4px;
    box-shadow: 0 0 0 1.5px var(--mention-fill);
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  @media (forced-colors: active) {
    .mf-token {
      outline: 1px solid Highlight;
    }
  }
</style>
