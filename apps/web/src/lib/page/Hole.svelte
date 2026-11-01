<!--
  What a hole does when it is pressed, on a declared page and on a row's screen: `press` is the renderer's `hole`.

  A HOLE IS A TASK AND A BUTTON IS A PROMISE (`packages/render/src/html.ts`, `hole`). The renderer draws a missing value
  as a button only where the host hands it this, and the host handed it nothing, so a hole was a marked span everywhere.

  A NAMED PATH WITH NO VALUE OPENS THE PLACE THE VALUE LIVES (`row-href.ts` `holePlace`): the row whose field is empty,
  or the rows a figure is worked out over. The host may take a path itself first (`mine`), as a row's screen does for a
  field of the row it is already on.

  ANYTHING ELSE OPENS "FIND THIS OUT": `{unknown}`, a part of a split nobody has named, a path that names nothing here.
  The sheet holds the sentence the hole sat in, which the reader may reword, and one press adds one task holding it
  and a link back to the page it was read on. Nothing is drawn until a hole is pressed.
-->
<script module lang="ts">
  /* WHICH HOLE WAS PRESSED, since the renderer says only its path: one listener for the tab, ahead of the press itself. */
  let pressed: Element | null = null;
  let listening = false;
  function listen() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('click', (e) => (pressed = e.target instanceof Element ? e.target.closest('.hole, [data-hole]') : null), true);
  }

  /* THE LINE A HOLE SITS IN: its paragraph, its item, its cell, or the bar that is the hole. */
  const LINE = 'p, li, td, th, dd, dt, figcaption, h1, h2, h3, h4, h5, h6, [data-hole]';

  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  export const holeWords = {
    title: 'Find this out',
    lead: (one: string, page: string) => `Nothing answers this yet. Add a ${one} to find it out. It keeps a link back to ${page}.`,
    label: 'What to find out',
    add: (one: string) => `Add ${one}`,
    adding: 'Adding',
    added: (one: string) => `${cap(one)} added`,
    noList: 'There is no list of tasks to add this to.',
    cannot: (list: string) => `You can read what is here, but adding to ${list} is not open to you.`,
    back: (page: string, href: string) => `Asked on [${page.replace(/[[\]]/gu, '')}](${href}).`,
    thisPage: 'this page',
  };
</script>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { apiBase, at, here } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { handFor } from '$lib/record/hand-of.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { may } from '$lib/record/may.ts';
  import { holePlace, holeSentence } from '$lib/record/row-href.ts';
  import { capturedFields, rowWriter } from '$lib/record/rows-write.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  let {
    row = null,
    name = '',
    mine = null,
  }: {
    /** The row the page is drawn for, where it is drawn for one: a bare field in a path is a field of it. */
    row?: { register: string; seq: number } | null;
    /** What the page is called, for the link back. Absent, the page's own heading is read. */
    name?: string;
    /** The host's own answer to a named path, tried first: `true` when it took the press. */
    mine?: ((path: string) => boolean) | null;
  } = $props();

  listen();

  let open = $state(false);
  let asked = $state(false);
  let draft = $state('');
  let adding = $state(false);
  let problem = $state<string | null>(null);
  let from = $state({ page: '', href: '' });

  /* THE LIST A TASK GOES IN: the first list a row is handed to somebody on (`hand:`), read off the declarations and
     never by a list's name, so a record whose tasks are another add-on's gets the sheet too. */
  const list = $derived(open ? (Object.keys(REGISTERS).find((id) => handFor(REGISTERS[id]) !== null) ?? null) : null);
  const decl = $derived(list === null ? undefined : REGISTERS[list]);
  const allowed = $derived(list !== null && may(route.data as unknown as Shell, 'append', list));

  /** The renderer's `hole`: a path with no value, or `null` for `{unknown}` and for a part nobody named. */
  export function press(path: string | null) {
    const el = pressed;
    if (path !== null) {
      if (mine?.(path)) return;
      const place = holePlace(path, row);
      const now = `${here()}${globalThis.location?.search ?? ''}`;
      if (place !== null && place !== now && place !== here()) return void goto(at(place));
    }
    const line = el?.closest(LINE) ?? el;
    draft = holeSentence(line?.textContent);
    const heading = name || document.querySelector('#main h1')?.textContent?.replace(/\s+/gu, ' ').trim() || holeWords.thisPage;
    from = { page: heading, href: `${here()}${globalThis.location?.search ?? ''}` };
    problem = null;
    asked = true;
    open = true;
  }

  async function add() {
    const said = holeSentence(draft);
    if (list === null || !decl || said === '' || adding) return;
    const { fields } = capturedFields(list, said, [], Date.now());
    /* THE LINK BACK GOES WHERE THE TASK IS READ, its note, and with the write itself where the list has no note. */
    const note = decl.fields.find((f) => f.type === 'document' && f.id !== decl.title);
    const back = holeWords.back(from.page, from.href);
    adding = true;
    problem = null;
    const out = await rowWriter(apiBase()).create(list, note ? { ...fields, [note.id]: back } : fields, note ? undefined : back);
    adding = false;
    if (!out.ok) return void (problem = out.fix);
    open = false;
    toasts.push(holeWords.added(decl.one));
  }
</script>

{#if asked}
  <Sheet bind:open title={holeWords.title}>
    {#if list === null || !decl}
      <p class="hole-note">{holeWords.noList}</p>
    {:else if !allowed}
      <p class="hole-note">{holeWords.cannot(decl.name)}</p>
    {:else}
      <form
        class="hole-form"
        onsubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <p class="hole-note">{holeWords.lead(decl.one, from.page)}</p>
        <textarea class="hole-said" rows="3" aria-label={holeWords.label} bind:value={draft}></textarea>
        {#if problem}<p class="hole-why" role="status">{problem}</p>{/if}
        <div class="hole-actions">
          <Button type="submit" weight="primary" disabled={adding || draft.trim() === ''}>{adding ? holeWords.adding : holeWords.add(decl.one)}</Button>
          <Button weight="bare" onclick={() => (open = false)}>{copy.editCancel}</Button>
        </div>
      </form>
    {/if}
  </Sheet>
{/if}

<style>
  /* A HOLE THAT IS A BUTTON IS A 44px TARGET UNDER A THUMB, though it is a word in a sentence: "unknown" on a project
     page measured 74x23. It is a button only where this file is mounted, which is why the rule is here and the skin's
     `.hole` is left as a span's. `.tap`'s trick on both axes (`a11y.css`): an invisible box grown round the word, so
     the sentence does not move and a mouse sees no change. */
  @media (pointer: coarse) {
    :global(button.hole) {
      position: relative;
    }

    :global(button.hole)::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }

  .hole-form {
    display: grid;
    gap: var(--sp-3);
  }
  .hole-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 1.5;
  }
  .hole-said {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: max(var(--ctl-h), var(--tap));
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 1.6;
    resize: vertical;
  }
  .hole-why {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }
  .hole-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
