<!--
  A BLOCK'S OWN MENU: Move up, Move down, the other column, its width, Change to, Hide and Remove, from the
  block's head, at every width. Each press is one kept change and one line with Undo; the rows are `block-menu.ts`'s.

  CHANGE TO AND REMOVE SET THE PAGE HE WROTE (`page-write.ts` `changeBlock`), and the rest set its look. Whether he wrote
  it and what the block may become (`kindsFor`, the renderer's) are read with the page, as the menu is reached; on an
  add-on's page Change to says where it is instead. Remove asks nothing: the line over Undo is the way back.

  THE PAGE IS READ AS THE MENU IS REACHED, not handed down: the head knows its own block, and the order, widths and
  columns of the rest are the record's, read once a pointer or the keyboard comes near (`ahead`) and shared by every
  block's menu on the page until a press changes it.

  ON A POINTER THE MARK WAITS for the tile's hover or focus, as the source link does, so a page at rest
  shows none. ON TOUCH IT IS ALWAYS THERE, the last thing in the head, 44 square.
-->
<script module lang="ts">
  /* ONE READ A PAGE, shared by every menu on it, and dropped when a press writes. */
  let held: { slug: string; at: number; got: Promise<unknown> } | null = null;
  const FRESH = 10_000;

  /* WHETHER THE READER WROTE THE PAGE, read once a page as the page is, and dropped when a press writes. */
  let authored: { slug: string; at: number; got: Promise<boolean | null> } | null = null;

  /** One column as `kindsFor` reads it (`braindog-render` `KindColumn`). */
  type KindColumn = { field: string; type?: string | undefined };
  type KindsFor = (kind: string, columns: readonly KindColumn[]) => readonly string[];

  /* `kindsFor` FROM THE RENDERER, which every page already loads, so this adds nothing to what a screen fetches. A build
     whose renderer does not answer it yet offers no kind to change to, rather than a guess at one. */
  let kindsHeld: Promise<KindsFor> | null = null;
  const none: KindsFor = () => [];
  const loadKinds = (): Promise<KindsFor> =>
    (kindsHeld ??= import('braindog-render/kinds-for')
      .then((m) => (m as unknown as { kindsFor?: KindsFor }).kindsFor ?? none)
      .catch(() => none));

  /** The kinds a block may become, by the name a person knows them by, where neither shared table names one yet. */
  const MORE_NAMES: Readonly<Record<string, string>> = { lines: 'Line over time' };

  /**
   * EACH KIND'S PICTURE, a small line drawing of what it draws, in the icon set's 24 grid and stroke: rows for a table,
   * tiles for cards, ticks for a to-do list, falling bars for a bar chart, a rising line for a line over time.
   *
   * PATHS AS DATA, NEVER MARKUP: drawn by `{#each}` and not `{@html}`, whose helper alone grew the shared runtime chunk
   * the entry script counts past its ceiling. A rectangle or a circle is the same outline as a path.
   */
  const PICTURES: Readonly<Record<string, readonly { d: string; w?: number }[]>> = {
    table: [{ d: 'M6.25 4.75h11.5a2.5 2.5 0 0 1 2.5 2.5v9.5a2.5 2.5 0 0 1 -2.5 2.5h-11.5a2.5 2.5 0 0 1 -2.5 -2.5v-9.5a2.5 2.5 0 0 1 2.5 -2.5z' }, { d: 'M3.75 9.5h16.5M3.75 14.25h16.5M10 9.5v9.75' }],
    cards: [{ d: 'M5.75 3.75h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2z' }, { d: 'M15.25 3.75h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2z' }, { d: 'M5.75 13.25h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2z' }, { d: 'M15.25 13.25h3a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-3a2 2 0 0 1 -2 -2v-3a2 2 0 0 1 2 -2z' }],
    todo: [{ d: 'M5 5h2a1.25 1.25 0 0 1 1.25 1.25v2a1.25 1.25 0 0 1 -1.25 1.25h-2a1.25 1.25 0 0 1 -1.25 -1.25v-2a1.25 1.25 0 0 1 1.25 -1.25z' }, { d: 'M11.25 7.25h9M11.25 16.75h9' }, { d: 'M5 14.5h2a1.25 1.25 0 0 1 1.25 1.25v2a1.25 1.25 0 0 1 -1.25 1.25h-2a1.25 1.25 0 0 1 -1.25 -1.25v-2a1.25 1.25 0 0 1 1.25 -1.25z' }],
    board: [{ d: 'M5.75 3.75h0.5a2 2 0 0 1 2 2v12.5a2 2 0 0 1 -2 2h-0.5a2 2 0 0 1 -2 -2v-12.5a2 2 0 0 1 2 -2z' }, { d: 'M11.75 3.75h0.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1 -2 2h-0.5a2 2 0 0 1 -2 -2v-6.5a2 2 0 0 1 2 -2z' }, { d: 'M17.75 3.75h0.5a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-0.5a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2z' }],
    calendar: [{ d: 'M7.25 5.25h9.5a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1 -3.5 3.5h-9.5a3.5 3.5 0 0 1 -3.5 -3.5v-8a3.5 3.5 0 0 1 3.5 -3.5z' }, { d: 'M3.75 10h16.5M8 3.25v3.5M16 3.25v3.5' }],
    bar: [{ d: 'M4.75 6.5h14.5M4.75 12h9.5M4.75 17.5h5.5' }],
    split: [{ d: 'M5.75 9h12.5a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12.5a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2z' }, { d: 'M11 9v6M16 9v6' }],
    lines: [{ d: 'M3.75 17.5l5-5.5 4 3 7.5-8' }],
    spec: [{ d: 'M4.75 7h5M13 7h6.25M4.75 12h5M13 12h6.25M4.75 17h5M13 17h6.25' }],
    params: [{ d: 'M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1' }, { d: 'M13 6.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z' }, { d: 'M7 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z' }, { d: 'M15 17.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z' }],
    steps: [{ d: 'M5 6.5h.01M5 12h.01M5 17.5h.01', w: 2.75 }, { d: 'M9 6.5h10.25M9 12h10.25M9 17.5h10.25' }],
    timeline: [{ d: 'M6 4.75v14.5M10.5 8h8.75M10.5 16h8.75' }, { d: 'M4.25 8a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0z' }, { d: 'M4.25 16a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0z' }],
    code: [{ d: 'M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14' }],
    tree: [{ d: 'M5 5v14M5 8h5M5 16h5' }, { d: 'M13.5 5.5h4.25a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1 -1.5 1.5h-4.25a1.5 1.5 0 0 1 -1.5 -1.5v-2a1.5 1.5 0 0 1 1.5 -1.5z' }, { d: 'M13.5 13.5h4.25a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1 -1.5 1.5h-4.25a1.5 1.5 0 0 1 -1.5 -1.5v-2a1.5 1.5 0 0 1 1.5 -1.5z' }],
  };
</script>

<script lang="ts">
  import { createClient } from '@braindog/client';
  import { apiBase } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { lookUndo, lookOfArrangement } from '$lib/record/arrange-look.ts';
  import { spanOf, stepsFor } from '$lib/record/arrange.ts';
  import { blockWords } from '$lib/record/block-edit.ts';
  import { answeredTypes, lookOf, type LiveBlock, type LiveLook } from '$lib/record/page-live.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { actionsFor, editOf, hideBody, laidAfter, laidOf, placeOf, rowIcon, saidOf, words, type Action, type ChangeAt, type Edit, type Laid, type MenuBlock } from './block-menu.ts';
  import { layoutOf } from './layout.ts';
  import { CHANGE_EVENT, takeLine } from './slash-entry.ts';
  import { retireLook, writeLook } from './look.ts';

  let {
    block,
    slug,
    name,
    reread,
  }: {
    /** The block whose head the menu sits in; it has a key a look may name, or the menu is not drawn. */
    block: LiveBlock & { key: string };
    /** The page's address, which it is read by and its look written under. */
    slug: string;
    /** The block's name as its head says it, which the menu and its lines name it by. */
    name: string;
    /** Reads the page again after a press, without blanking it. */
    reread: () => Promise<void>;
  } = $props();

  let open = $state(false);
  type Read = { laid: Laid[]; live: LiveLook | null; rail: boolean };
  let read = $state.raw<Read | null>(null);

  /** A kind as a person names it: the shared table's name, the editor's, or this menu's own. */
  const nameOf = (kind: string): string => copy.kindNames[kind] ?? blockWords.kindNames[kind] ?? MORE_NAMES[kind] ?? kind;
  const kindName = $derived((copy.kindNames[block.kind] ?? blockWords.kindNames[block.kind] ?? 'block').toLowerCase());
  /* CHANGE TO AND REMOVE: whether he wrote the page and what the block may become, once read. Absent, neither is offered. */
  let change = $state.raw<ChangeAt | undefined>(undefined);
  const mine = $derived<MenuBlock>({
    key: block.key,
    kind: block.kind,
    columns: block.columns.length,
    span: read?.laid.find((l) => l.key === block.key)?.span ?? spanOf(block.kind, block.span, block.columns.length),
    name,
    kindName,
  });
  const place = $derived(read ? placeOf(read.laid, block.key, read.rail) : null);
  const rows = $derived(
    actionsFor(mine, {
      owner: true,
      area: place?.area ?? null,
      first: place?.first ?? false,
      last: place?.last ?? false,
      hidden: false,
      steps: stepsFor(block.kind, block.columns.length),
      change,
      today: slug !== 'home' && slug !== 'today',
    }),
  );
  const LAST: readonly string[] = ['today', 'this', 'hide', 'show', 'remove'];
  const isKindRow = (a: Action): boolean => a.kind !== undefined || a.id === 'change';
  const moves = $derived(rows.filter((a) => a.span === undefined && !isKindRow(a) && !LAST.includes(a.id)));
  const widths = $derived(rows.filter((a) => a.span !== undefined));
  const kinds = $derived(rows.filter(isKindRow));
  const last = $derived(rows.filter((a) => LAST.includes(a.id)));

  /** The page as the record answers it now, read once for every menu on it. */
  function readPage(fresh = false): Promise<unknown> {
    if (!fresh && held && held.slug === slug && Date.now() - held.at < FRESH) return held.got;
    const got = createClient({ base: apiBase() })
      .page(slug)
      .then((out) => (out.ok ? out.value : null))
      .catch(() => null);
    held = { slug, at: Date.now(), got };
    return got;
  }

  async function laid(fresh = false): Promise<Read | null> {
    const page = (await readPage(fresh)) as { blocks?: unknown; look?: unknown } | null;
    if (!page || !Array.isArray(page.blocks)) return null;
    const got: Read = { laid: laidOf(page.blocks, page), live: lookOf(page.look), rail: layoutOf(page) !== null };
    read = got;
    return got;
  }

  /** Whether the reader wrote the page, read once for every menu on it; `null` where the record would not say. */
  async function mineOf(fresh = false): Promise<boolean | null> {
    if (!fresh && authored && authored.slug === slug && Date.now() - authored.at < FRESH) return authored.got;
    const got = import('$lib/record/page-write.ts')
      .then((w) => w.authoredOf(apiBase(), slug))
      .then((out) => ('from' in out ? null : out.mine))
      .catch(() => null);
    authored = { slug, at: Date.now(), got };
    return got;
  }

  /**
   * What Change to offers this block: the page's author, and `kindsFor` over its columns typed as the record declares
   * their fields (`schema`), or as the block answered them where no list declares one (`answeredTypes`).
   */
  async function changeOf(fresh = false): Promise<ChangeAt> {
    const w = await import('$lib/record/page-write.ts');
    const [mine, kindsFor, decl] = await Promise.all([
      mineOf(fresh),
      loadKinds(),
      block.register ? w.schemaOf(apiBase(), block.register) : Promise.resolve(null),
    ]);
    const answered = answeredTypes(block) ?? {};
    const typed = (field: string): string | undefined => {
      const f = decl?.fields.find((d) => d.id === field);
      return f?.type ?? (f?.values ? 'enum' : undefined) ?? answered[field];
    };
    const columns = block.columns.map((c) => ({ field: c.field, type: typed(c.field) }));
    const got: ChangeAt = { mine: mine ?? undefined, kinds: kindsFor(block.kind, columns), kindName: nameOf };
    change = got;
    return got;
  }

  /* READ AS THE POINTER OR THE KEYBOARD COMES NEAR, so the rows are the page's by the time the menu opens. */
  let near = $state<HTMLElement>();
  $effect(() => {
    const el = near;
    if (!el) return;
    const ahead = () => {
      void laid();
      void changeOf();
    };
    el.addEventListener('pointerenter', ahead);
    el.addEventListener('focusin', ahead);
    return () => {
      el.removeEventListener('pointerenter', ahead);
      el.removeEventListener('focusin', ahead);
    };
  });
  $effect(() => {
    if (open) {
      void laid();
      void changeOf();
    }
  });

  let busy = false;

  /* "CHANGE THIS": the sheet is loaded when it is asked for, with the kinds and pins read as the menu was reached. */
  let asking = $state(false);
  /* LOADED ON THE FIRST ASK AND KEPT, so a close that leaves a change unanswered can still push its Undo. */
  let askLoaded = $state(false);
  let pins = $state.raw<readonly string[]>([]);
  /* A LINE FROM SLASH: the sheet opens on it and makes the change at once. */
  let startLine = $state('');

  async function openChange(line: string) {
    pins = (await laid())?.live?.pinned ?? [];
    startLine = line;
    askLoaded = true;
    asking = true;
  }

  /* "Change ..." IN SLASH NAMES THE BLOCK IN FOCUS by its key; only that block's menu answers. */
  $effect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; line: string }>).detail;
      if (d.key === block.key) void openChange(d.line);
    };
    window.addEventListener(CHANGE_EVENT, on);
    return () => window.removeEventListener(CHANGE_EVENT, on);
  });

  /** A press: the next look written, the page read again, and the line that says so with its way back. */
  async function press(action: Action) {
    open = false;
    if (busy || action.disabled) return;
    if (action.id === 'this') {
      return void (await openChange(takeLine()));
    }
    if (action.id === 'today') return void (await toToday());
    busy = true;
    try {
      const now = await laid();
      if (!now) return void toasts.push(copy.recordNotReached, { intent: 'warn' });
      const edit = editOf(action, mine, { laid: now.laid });
      if (!edit) return;
      if ('kind' in edit || 'remove' in edit) return void (await pageChange(edit, action));
      const body =
        'hide' in edit
          ? hideBody(slug, now.live, block.key, edit.hide)
          : lookOfArrangement(slug, now.live, laidAfter(now.laid, block.key, edit));
      const out = await writeLook(apiBase(), body);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      held = null;
      await reread();
      toasts.push(saidOf(edit, name, action.id), { undo: () => void undo(now.live) });
    } finally {
      busy = false;
    }
  }

  /**
   * CHANGE TO OR REMOVE: the page he wrote set whole without the block, or with it as the kind pressed, and the line that
   * says so with the body before as its Undo. Nothing is asked first, since Undo is the way back.
   */
  async function pageChange(edit: Extract<Edit, { kind: string } | { remove: true }>, action: Action) {
    const w = await import('$lib/record/page-write.ts');
    const which = { key: block.key, kind: block.kind, source: block.source, heading: block.heading ?? name };
    const out = await w.changeBlock(
      apiBase(),
      slug,
      which,
      'remove' in edit ? { remove: true } : { kind: edit.kind, kinds: change?.kinds ?? [] },
    );
    if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
    held = null;
    authored = null;
    await reread();
    const said = saidOf(edit, name, action.id, 'kind' in edit ? nameOf(edit.kind) : undefined);
    toasts.push(said, { undo: () => void putBack(out.before, out.version) });
  }

  /** Undo of Change to or Remove: the body before set again, at the version the change made. */
  async function putBack(before: import('$lib/record/pages-live.ts').PageBody, version: number | null) {
    const w = await import('$lib/record/page-write.ts');
    const out = await w.setBody(apiBase(), before, undefined, version);
    held = null;
    authored = null;
    if (out.from !== 'written') toasts.push(out.fix, { intent: 'warn' });
    await reread();
  }

  /**
   * ADD TO TODAY (the widgets plan of 29 October, §4.3): the block as this page declares it, filled for this page, put on
   * Today's board at the size its kind draws first, Today kept first where the record keeps none. One press, with Undo.
   */
  async function toToday() {
    if (busy) return;
    busy = true;
    try {
      const [{ bodyOfBlock }, { addToToday }] = await Promise.all([import('$lib/record/pages-live.ts'), import('$lib/board/add-today.ts')]);
      const out = await addToToday(apiBase(), bodyOfBlock(block as unknown as Record<string, unknown>) as Record<string, unknown>);
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      toasts.push(words.onToday(name), { intent: 'good', undo: () => void out.undo?.() });
    } finally {
      busy = false;
    }
  }

  /** Undo: the look before written again, or the look retired where there was none to put back. */
  async function undo(live: LiveLook | null) {
    const back = lookUndo(slug, live);
    const out = 'write' in back ? await writeLook(apiBase(), back.write) : await retireLook(apiBase(), back.retire);
    held = null;
    if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    await reread();
  }
</script>

{#snippet item(a: Action, role: 'menuitem' | 'menuitemradio')}
  <button
    type="button"
    class="bm-item"
    {role}
    data-tone={a.id === 'remove' ? 'bad' : undefined}
    aria-checked={role === 'menuitemradio' ? a.current === true : undefined}
    aria-disabled={a.disabled ? 'true' : undefined}
    title={a.why}
    onclick={() => void press(a)}
  >
    {#if a.kind}<span class="mi-slot"><svg class="bm-picture" viewBox="0 0 24 24" aria-hidden="true">{#each PICTURES[a.kind] ?? PICTURES.table ?? [] as part, i (i)}<path d={part.d} stroke-width={part.w} />{/each}</svg></span>{:else}<Icon name={rowIcon(a.id)} size="s" />{/if}
    <span class="bm-label">{a.label}</span>
    {#if a.current}<Icon name="check" size="s" />{/if}
    {#if a.why}<span class="bm-why">{a.why}</span>{/if}
  </button>
{/snippet}

<span class="block-menu" data-open={open ? '' : undefined} bind:this={near}>
  <Menu label={words.menu(name)} align="end" bind:open>
    {#snippet trigger()}<span class="bm-mark"><Icon name="more" size="s" /><span class="sr-only">{words.menu(name)}</span></span>{/snippet}
    {#each moves as a (a.id)}{@render item(a, 'menuitem')}{/each}
    <p class="bm-group" role="none">{words.width}</p>
    {#each widths as a (a.id)}{@render item(a, 'menuitemradio')}{/each}
    {#if kinds.some((a) => a.kind)}<p class="bm-group" role="none">{words.change}</p>{/if}
    {#each kinds as a (a.id)}{@render item(a, 'menuitem')}{/each}
    {#each last as a (a.id)}{@render item(a, 'menuitem')}{/each}
  </Menu>
</span>

{#if askLoaded}
  {#await import('./ChangeThis.svelte') then { default: ChangeThis }}
    <ChangeThis bind:open={asking} {block} {slug} {name} kinds={change?.kinds ?? []} kindNames={copy.kindNames} pinned={pins} start={startLine} {reread} />
  {/await}
{/if}

<style>
  /* THE LAST THING IN THE HEAD, at its right end: after the source link where there is one, which holds the end. */
  .block-menu {
    flex: none;
    margin-inline-start: auto;
  }

  .bm-mark {
    display: grid;
    place-items: center;
    inline-size: var(--sp-6);
    block-size: var(--sp-6);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .bm-mark:hover,
  .block-menu:has(:focus-visible) .bm-mark,
  .block-menu[data-open] .bm-mark {
    background: var(--hover);
    color: var(--ink);
  }

  /* ON A POINTER IT WAITS FOR THE TILE, and fades rather than folds, so the heading row never moves under it. Open, or
     reached by the keyboard, it stays. */
  @media (hover: hover) and (pointer: fine) {
    :global(.block-source) ~ .block-menu {
      margin-inline-start: 0;
    }

    .block-menu {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.block-slot:is(:hover, :focus-within)) .block-menu,
    .block-menu:focus-within,
    .block-menu[data-open] {
      opacity: 1;
    }
  }

  /* UNDER A THUMB A TARGET IS 44 SQUARE, the mark drawn in its middle. */
  @media not ((hover: hover) and (pointer: fine)) {
    .bm-mark {
      inline-size: 44px;
      block-size: 44px;
    }
  }

  .bm-group {
    margin: var(--sp-2) var(--sp-2) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* THE ROWS: `Menu.svelte` gives them their height and rhythm; the colours are these. */
  .bm-item {
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .bm-item:hover,
  .bm-item:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .bm-item[aria-checked='true'] {
    color: var(--ink);
  }

  /* A WIDTH TOO NARROW FOR THE BLOCK IS GREYED AND SAYS WHY, beside its name. */
  .bm-item[aria-disabled='true'] {
    color: var(--ink-3);
    cursor: default;
  }

  .bm-item[aria-disabled='true']:hover {
    background: none;
  }

  .bm-why {
    margin-inline-start: auto;
    font-size: var(--fs-meta);
  }

  /* A KIND'S PICTURE, in the icon set's stroke, before its name. */
  .bm-picture {
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    margin-inline-end: var(--sp-2);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
