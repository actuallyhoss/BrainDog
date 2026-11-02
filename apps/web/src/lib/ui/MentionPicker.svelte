<!--
  @MENTIONS IN A COMMENT BOX (work2 2 Nov, 1). Typing "@" in a comment, a reply or a question's note opens a short list of
  the people on this record, the owner and colleagues, filtered by what is typed after the "@" (any word of a name, from
  its start). Up and Down move, Enter or Tab puts the name in, Escape shuts it; a tap or a click picks one. What goes in is
  "@" and the person's whole name and a space, which is the form the record already rings for (`namedIn` in
  `packages/record/src/methods/comments.ts`: "@" then a whole or a first name).

  IT HANGS OFF THE FIELD, NOT AROUND IT: the box keeps its own markup and its own Enter, and this listens to the field it
  is handed. Its keys are heard before the box's own (a listener on the field, in the capture phase), so Enter picks a
  name while the list is open and sends the comment when it is shut. The list is fixed to the window under the field, or
  over it where the window has no room below, so no tile's overflow cuts it.

  THE FIELD IS TOLD WHAT IT HAS: a combobox with its list, which option is active, and whether the list is open, so a
  screen reader hears the names as Up and Down move through them.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Face from './Face.svelte';

  export type Mentionable = { id: string; name: string };

  let {
    field,
    people,
  }: {
    /** The comment box this list serves. */
    field: HTMLInputElement | HTMLTextAreaElement | null | undefined;
    /** Who may be named, the reader left out. */
    people: readonly Mentionable[];
  } = $props();

  const uid = $props.id();
  const listId = `${uid}-mentions`;

  /** The most names the list shows at once: a short list to choose from, not a directory. */
  const MOST = 6;

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  /** Where the "@" being typed starts in the field's value. */
  let from = -1;
  /** The "@" Escape shut the list on: it stays shut for that one until another "@" is typed. */
  let dismissed = -1;
  let place = $state<{ left: number; top: number | null; bottom: number | null; width: number }>({ left: 0, top: 0, bottom: null, width: 240 });

  /**
   * THE "@" BEING TYPED: the text from an "@" that starts a word up to the caret, at most two words long ("@Dana Re"), and
   * no "@" or line break inside. An "@" inside a word (an email address) is not a mention.
   */
  const AT = /(^|[^\p{L}\p{N}@._-])@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/u;

  const words = (name: string): string[] => name.toLocaleLowerCase('en').split(/\s+/u);
  const matches = $derived.by(() => {
    const q = query.toLocaleLowerCase('en').trim();
    if (q === '') return people.slice(0, MOST);
    return people
      .filter((p) => {
        const n = p.name.toLocaleLowerCase('en');
        return n.startsWith(q) || words(p.name).some((w) => w.startsWith(q));
      })
      .slice(0, MOST);
  });

  function read() {
    if (!field) return;
    const caret = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? caret;
    const m = caret === end ? AT.exec(field.value.slice(0, caret)) : null;
    if (!m || people.length === 0) {
      dismissed = -1;
      return shut();
    }
    const typed = m[2] ?? '';
    if (caret - typed.length - 1 === dismissed) return shut();
    dismissed = -1;
    const was = query;
    query = typed;
    from = caret - query.length - 1;
    if (!open || was !== query) active = 0;
    open = matches.length > 0;
    if (open) measure();
  }

  function shut() {
    open = false;
    query = '';
    from = -1;
  }

  const coarse = (): boolean => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

  /** Under the field, or over it when the window has less room below than the list needs. */
  function measure() {
    if (!field) return;
    const r = field.getBoundingClientRect();
    const room = window.innerHeight - r.bottom;
    const need = Math.min(matches.length, MOST) * (coarse() ? 44 : 40) + 12;
    const width = Math.min(Math.max(220, Math.min(r.width, 320)), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    place = room < need && r.top > need ? { left, top: null, bottom: window.innerHeight - r.top + 4, width } : { left, top: r.bottom + 4, bottom: null, width };
  }

  function pick(p: Mentionable) {
    if (!field || from < 0) return shut();
    const caret = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, from);
    const after = field.value.slice(caret).replace(/^[^\s@]*/u, '');
    const said = `@${p.name} `;
    field.value = `${before}${said}${after.replace(/^ /u, '')}`;
    const at = before.length + said.length;
    field.setSelectionRange(at, at);
    /* THE BOX'S OWN BINDING HEARS IT as it hears typing. */
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    shut();
  }

  function onkey(e: KeyboardEvent) {
    if (!open || e.isComposing) return;
    const n = matches.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      active = (active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      const p = matches[active];
      if (!p) return;
      e.preventDefault();
      e.stopPropagation();
      pick(p);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismissed = from;
      shut();
    }
  }

  $effect(() => {
    const el: HTMLElement & { value: string } | null | undefined = field;
    if (!el) return;
    const onInput = () => read();
    const onCaret = () => untrack(() => (open || el.value.includes('@') ? read() : undefined));
    const onBlur = () => untrack(shut);
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', listId);
    el.addEventListener('keydown', onkey, true);
    el.addEventListener('input', onInput);
    el.addEventListener('click', onCaret);
    el.addEventListener('keyup', onCaret);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('keydown', onkey, true);
      el.removeEventListener('input', onInput);
      el.removeEventListener('click', onCaret);
      el.removeEventListener('keyup', onCaret);
      el.removeEventListener('blur', onBlur);
      el.removeAttribute('role');
      el.removeAttribute('aria-autocomplete');
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-expanded');
      el.removeAttribute('aria-activedescendant');
    };
  });

  /* THE NAMES LANDING AFTER THE "@" (design pass 2 Nov): a box asks who it may offer when it is first entered, so an "@"
     typed at once came before the names and opened nothing until the next key. Read the field again when they land. */
  $effect(() => {
    if (people.length === 0) return;
    untrack(() => {
      if (field && document.activeElement === field) read();
    });
  });

  /* WHAT THE FIELD SAYS OF THE LIST, kept with it. */
  $effect(() => {
    const el = field;
    if (!el) return;
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && matches[active]) el.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else el.removeAttribute('aria-activedescendant');
  });

  /* WHILE OPEN, THE LIST FOLLOWS THE FIELD when the page or a tile scrolls, or the window changes size. */
  $effect(() => {
    if (!open) return;
    const again = () => measure();
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  });
</script>

{#if open}
  <ul
    id={listId}
    class="mentions"
    role="listbox"
    aria-label="People to mention"
    style:left="{place.left}px"
    style:top={place.top === null ? null : `${place.top}px`}
    style:bottom={place.bottom === null ? null : `${place.bottom}px`}
    style:inline-size="{place.width}px"
  >
    {#each matches as p, i (p.id)}
      <!-- A PRESS NEVER TAKES THE FOCUS FROM THE BOX, so the caret is where the name goes and the box stays open to type.
           Its keys are the box's (a combobox: Up, Down, Enter, Escape on the field), so the option has none of its own. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id="{listId}-{i}"
        class="mention"
        role="option"
        aria-selected={i === active}
        onpointerdown={(e) => e.preventDefault()}
        onpointerenter={() => (active = i)}
        onclick={() => pick(p)}
      >
        <span class="mark" aria-hidden="true"><Face name={p.name} kind="person" size="s" /></span>
        <span class="name">{p.name}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .mentions {
    position: fixed;
    z-index: var(--z-palette);
    box-sizing: border-box;
    max-block-size: 260px;
    margin: 0;
    padding: var(--sp-1);
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
    color: var(--ink);
    animation: mentions-in var(--d-menu) var(--ease-out);
  }

  /* A MENU OPENING (Look B motion): in over --d-menu with a 2px settle toward the field. */
  @keyframes mentions-in {
    from {
      opacity: 0;
      translate: 0 -2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mentions {
      animation: none;
    }
  }

  .mention {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
    padding-inline: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
    font-size: var(--fs-ctl);
    line-height: 20px;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* UNDER A THUMB A NAME IS A 44PX TARGET (Look B phones). */
  @media (pointer: coarse) {
    .mention {
      min-block-size: 44px;
    }
  }

  .mention[aria-selected='true'] {
    background: var(--hover);
  }

  .mark {
    display: inline-flex;
    flex: none;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
