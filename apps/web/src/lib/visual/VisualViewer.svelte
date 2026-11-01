<!--
  One visual open over its thing: its page in the sandbox frame the whole width of
  the window, its versions to step between with the arrows or the list, newest first with who made each and when, and
  Undo on the newest.

  A DRAFT OPENS FIRST, MARKED, with Keep, Try again and Throw away over its page (`DraftBar.svelte`). The version it
  stands at is a step away, tagged Current, and a draft never kept is tagged Thrown away in the list.

  LOADED BY `import()` ON THE FIRST PRESS (`VisualStrip.svelte`), so no page that only holds a visual carries this or the
  renderer's frame document in its first load.

  THE FRAME IS THE DRAWN BLOCK'S (`DrawnFrame.svelte`, docs/12-SECURITY.md §8): the hosts' own `/drawn-frame`,
  `sandbox="allow-scripts"` and nothing else, so it has an origin that holds nothing and a policy with no network. It says
  it is ready, from its own window and no other, and is posted the whole document once (`visualDocument`: the policy,
  the theme, then the page with its pictures inline, which the app read through the file door with its own sign-in).
  Nothing it says back is acted on: the page scrolls inside the frame, so not even its height is read.

  FROM 900 UP, a tile `--inset` in from every edge of the window over the scrim, the page on the left and its versions
  in a column beside it. ON A PHONE, THE WHOLE SCREEN, with Close at the top end, 44 square, and the versions a row
  under the head. Escape, the backdrop and Close all end in the dialog's own close.

  UNDO IS THE RECORD'S, of the write that made the newest version (`undo-write.ts`). It goes at once when that write
  drew this visual and nothing else, and says first what else it takes back when the write did more.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { BASE, apiBase } from '$lib/at.ts';
  import { overlays } from '$lib/a11y/keys.svelte.ts';
  import { actor } from '$lib/record/names.ts';
  import { undoApply, undoPlan, type UndoPlan } from '$lib/record/undo-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { scrims, settled } from '$lib/ui/panel.ts';
  import { drawnTheme, visualDocument, type DrawnTheme } from 'braindog-render';
  import DraftBar from './DraftBar.svelte';
  import { forgetCards, madeLine, readOpened, readPictures, stepOf, tagOf, undoAsks, undoOf, visualWords as words, type Opened } from './held.ts';

  let {
    open = $bindable(false),
    id,
    on,
    title,
    onchanged,
  }: {
    open?: boolean | undefined;
    /** The visual. */
    id: string;
    /** The thing it is on, as the strip read it, so an Undo can have the strip read it again. */
    on: string;
    /** Its title as the strip said it, the dialog's name until the read lands. */
    title: string;
    /** Said after an Undo or a press on a draft changed what the thing holds. */
    onchanged?: (() => void) | undefined;
  } = $props();

  const uid = $props.id();
  const SRC = `${BASE}/drawn-frame`;

  let el = $state<HTMLDialogElement>();
  let frame = $state<HTMLIFrameElement>();
  let held = false;
  let lift: (() => void) | null = null;

  /** The version shown, the one the visual stands at now, and the draft waiting beside it, as the last read said. */
  let shown = $state.raw<Opened | null>(null);
  let standing = $state<number | null>(null);
  let draft = $state<number | null>(null);
  let doc = $state<string | null>(null);
  let fix = $state('');
  let missing = $state(0);
  let busy = $state(false);
  let asking = $state.raw<UndoPlan | null>(null);
  let said = $state('');
  /** Counted up for each document drawn, so a new version or a new theme is a new frame. */
  let drawn = $state(0);
  let written = false;

  const me = $derived(String(page.data.me?.person ?? '') || null);
  const names = $derived(new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)));
  const who = (by: string): string => actor(by, me, names).name;
  const now = $derived(Date.now());
  const undoBatch = $derived(shown ? undoOf(shown.versions, standing, shown.version) : null);
  const older = $derived(shown ? stepOf(shown.versions, shown.version, true) : null);
  const newer = $derived(shown ? stepOf(shown.versions, shown.version, false) : null);

  /** Light or dark as the page is drawn now, and its colours: the drawn block's reading of them. */
  function themeNow(): DrawnTheme {
    const root = document.documentElement;
    const scheme = root.getAttribute('data-scheme');
    const dark = scheme === 'dark' || (scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const css = getComputedStyle(root);
    return drawnTheme(dark ? 'dark' : 'light', (name) => css.getPropertyValue(name));
  }

  /** Read one version, or the draft waiting, else the one it stands at, with its pictures, and draw it. */
  async function show(version?: number) {
    fix = '';
    const base = apiBase();
    const got = await readOpened(base, id, version);
    if (!got.ok) {
      fix = got.fix;
      return;
    }
    const pictures = await readPictures(base, got.value.pictures);
    standing = got.value.kept;
    draft = got.value.draft;
    shown = got.value;
    missing = pictures.missing;
    doc = visualDocument(got.value.page, pictures.inline, themeNow());
    written = false;
    drawn++;
  }

  /* OPENED, IT READS WHERE IT STANDS. */
  $effect(() => {
    if (open && shown === null && fix === '') void show();
  });

  /* THE DIALOG, opened and closed as `Sheet.svelte` does: the keys' lock and the scrim held while it is up. */
  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
      held = true;
      lift ??= scrims.lay();
    } else if (!open && el.open) {
      el.close();
    }
  });

  $effect(() => () => {
    if (held) overlays.close();
    held = false;
    lift?.();
    lift = null;
  });

  function closed() {
    open = false;
    if (held) {
      overlays.close();
      held = false;
    }
    if (lift && el) {
      const go = lift;
      lift = null;
      settled(el, go);
    }
  }

  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) open = false;
  }

  /* THE FRAME SAYS IT IS READY FROM ITS OWN WINDOW, and is handed the document once. Nothing else it says is read. */
  $effect(() => {
    const listen = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow || written || doc === null) return;
      const m = e.data as { braindog?: unknown } | null;
      if (m && typeof m === 'object' && m.braindog === 'ready') {
        written = true;
        frame.contentWindow?.postMessage({ braindog: 'draw', doc }, '*');
      }
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  });

  /* A NEW THEME DRAWS IT AGAIN, since the page reads its colours once, as it loads. */
  $effect(() => {
    if (!open) return;
    const again = () => {
      if (shown) void show(shown.version);
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', again);
    const watch = new MutationObserver(again);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });
    return () => {
      media.removeEventListener('change', again);
      watch.disconnect();
    };
  });

  /* ── a draft settled: what the record said, and the thing read again ── */

  async function settled_(line: string) {
    said = line;
    forgetCards(apiBase(), on);
    onchanged?.();
    await show();
  }

  /* ── Undo ── */

  async function undo() {
    if (undoBatch === null || busy) return;
    busy = true;
    said = '';
    const scope = { batch: undoBatch };
    const read = await undoPlan(apiBase(), scope);
    busy = false;
    if (read.from !== 'plan') {
      said = read.fix;
      return;
    }
    if (undoAsks(read.plan.steps.length)) asking = read.plan;
    else await putBack(read.plan);
  }

  async function putBack(plan: UndoPlan) {
    if (undoBatch === null) return;
    busy = true;
    asking = null;
    const out = await undoApply(apiBase(), { batch: undoBatch }, plan);
    busy = false;
    said = out.from === 'undone' ? out.said : out.fix;
    if (out.from !== 'undone') return;
    forgetCards(apiBase(), on);
    onchanged?.();
    const back = await readOpened(apiBase(), id);
    if (back.ok) await show();
    else {
      /* PUT BACK PAST ITS FIRST VERSION, IT IS TAKEN AWAY: said, and the frame let go. */
      shown = null;
      doc = null;
      standing = null;
      fix = words.gone;
    }
  }
</script>

<dialog
  bind:this={el}
  class="viewer"
  aria-labelledby="{uid}-title"
  onclick={onbackdrop}
  oncancel={(e) => (e.preventDefault(), (open = false))}
  onclose={closed}
>
  <header class="v-head">
    <div class="v-name">
      <h2 class="v-title" id="{uid}-title" dir="auto">{shown?.title || title}</h2>
      {#if shown}
        <p class="v-made">
          {#if shown.versions.length > 1}<span>{words.version(shown.version)}</span>{' · '}{/if}{madeLine(who(shown.by), shown.at, now)}
        </p>
      {/if}
    </div>
    {#if shown && shown.versions.length > 1}
      <div class="v-step">
        <button type="button" class="v-arrow tap" disabled={older === null} onclick={() => older !== null && void show(older)} aria-label={words.older} title={words.older}>
          <Icon name="back" size="m" />
        </button>
        <button type="button" class="v-arrow tap" disabled={newer === null} onclick={() => newer !== null && void show(newer)} aria-label={words.newer} title={words.newer}>
          <Icon name="arrow" size="m" />
        </button>
      </div>
    {/if}
    {#if undoBatch !== null}
      <Button size="sm" disabled={busy} onclick={() => void undo()}>{words.undo}</Button>
    {/if}
    <button type="button" class="v-close tap" onclick={() => (open = false)} aria-label={words.close} title={words.close}>
      <Icon name="close" size="m" />
    </button>
  </header>

  {#if asking}
    <div class="v-ask" role="alertdialog" aria-labelledby="{uid}-ask">
      <p id="{uid}-ask">{words.undoMore(asking.steps.length - 1)}</p>
      <div class="v-ask-do">
        <Button size="sm" onclick={() => (asking = null)}>{words.keep}</Button>
        <Button size="sm" weight="primary" disabled={busy} onclick={() => asking && void putBack(asking)}>{words.undoYes}</Button>
      </div>
    </div>
  {/if}
  {#if shown && draft !== null && shown.version === draft}
    {#key `${shown.id} ${draft}`}
      <div class="v-draft"><DraftBar id={shown.id} version={draft} by={shown.by} title={shown.title} onsettled={(line) => void settled_(line)} /></div>
    {/key}
  {/if}
  {#if said}<p class="v-said" role="status">{said}</p>{/if}

  <div class="v-body" data-one={shown && shown.versions.length > 1 ? undefined : ''}>
    <div class="v-page">
      {#if doc !== null}
        {#key drawn}
          <iframe bind:this={frame} class="v-frame" src={SRC} sandbox="allow-scripts" title={shown?.title || title} referrerpolicy="no-referrer"></iframe>
        {/key}
      {:else if fix}
        <p class="v-note" role="status">{fix}</p>
      {:else}
        <p class="v-note" role="status">{words.reading}</p>
      {/if}
      {#if missing > 0}<p class="v-missing" role="status">{words.picturesMissing(missing)}</p>{/if}
    </div>

    {#if shown && shown.versions.length > 1}
      <nav class="v-versions" aria-label={words.versions(shown.versions.length)}>
        <ol>
          {#each shown.versions as v (v.version)}
            {@const tag = tagOf(v.version, shown.versions, standing, draft)}
            <li>
              <button type="button" class="v-version tap" aria-current={v.version === shown.version ? 'true' : undefined} onclick={() => void show(v.version)}>
                <span class="v-version-n">{words.version(v.version)}{#if tag}<span class="v-tag">{tag}</span>{/if}</span>
                <span class="v-version-by">{madeLine(who(v.by), v.at, now)}</span>
              </button>
            </li>
          {/each}
        </ol>
      </nav>
    {/if}
  </div>
</dialog>

<style>
  /* FROM 900 UP: the whole width of the window, `--inset` in from every edge, a tile over the scrim. */
  .viewer {
    position: fixed;
    inset: var(--inset);
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    inline-size: auto;
    block-size: auto;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: var(--tile);
    color: var(--ink);
    border: 0;
    border-radius: var(--r-tile);
  }

  .viewer:not([open]) {
    display: none;
  }

  .viewer::backdrop {
    background: var(--scrim);
  }

  .v-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 20px;
    border-block-end: 1px solid var(--rule);
  }

  .v-name {
    flex: 1;
    min-inline-size: 0;
  }

  .v-title {
    margin: 0;
    font-size: var(--fs-head);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v-made {
    margin: 2px 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .v-close {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
  }

  .v-close:hover {
    color: var(--ink);
  }

  .v-step {
    flex: none;
    display: flex;
    gap: 4px;
  }

  .v-arrow {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
  }

  .v-arrow:hover:not(:disabled) {
    background: var(--tile-2);
    color: var(--ink);
  }

  .v-arrow:disabled {
    color: var(--ink-3);
    opacity: 0.5;
    cursor: default;
  }

  .v-draft {
    padding: 10px 20px;
    border-block-end: 1px solid var(--rule);
  }

  .v-ask,
  .v-said {
    margin: 0;
    padding: 10px 20px;
    border-block-end: 1px solid var(--rule);
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }

  .v-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }

  .v-ask p {
    margin: 0;
    flex: 1 1 240px;
  }

  .v-ask-do {
    display: flex;
    gap: 8px;
  }

  .v-body {
    flex: 1;
    min-block-size: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
  }

  .v-body[data-one] {
    grid-template-columns: minmax(0, 1fr);
  }

  .v-page {
    position: relative;
    min-inline-size: 0;
    min-block-size: 0;
    display: flex;
    flex-direction: column;
  }

  .v-frame {
    flex: 1;
    display: block;
    inline-size: 100%;
    block-size: 100%;
    border: 0;
    background: var(--board);
  }

  .v-note {
    margin: 0;
    padding: 24px 20px;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .v-missing {
    margin: 0;
    padding: 8px 20px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    border-block-start: 1px solid var(--rule);
  }

  .v-versions {
    min-block-size: 0;
    overflow-y: auto;
    border-inline-start: 1px solid var(--rule);
    padding: 8px;
  }

  .v-versions ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }

  .v-version {
    display: grid;
    gap: 2px;
    inline-size: 100%;
    padding: 8px 12px;
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .v-version:hover {
    background: var(--tile-2);
  }

  .v-version[aria-current='true'] {
    background: var(--tile-2);
    font-weight: 600;
  }

  .v-version-n {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-body);
  }

  .v-version-by {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  .v-tag {
    color: var(--red);
    font-size: var(--fs-cap);
    font-weight: 600;
  }

  /* ON A PHONE, THE WHOLE SCREEN: no inset and no corners, Close at the top end, the versions a row under the head. */
  @media (width < 900px) {
    .viewer {
      inset: 0;
      border-radius: 0;
      padding-block-start: env(safe-area-inset-top);
      padding-block-end: env(safe-area-inset-bottom);
    }

    .v-head {
      padding: 8px 12px 8px 16px;
    }

    .v-close {
      inline-size: 44px;
      block-size: 44px;
    }

    .v-body,
    .v-body[data-one] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .v-versions {
      grid-row: 1;
      overflow-x: auto;
      overflow-y: hidden;
      border-inline-start: 0;
      border-block-end: 1px solid var(--rule);
    }

    .v-versions ol {
      grid-auto-flow: column;
      grid-auto-columns: max-content;
    }

    .v-ask,
    .v-said,
    .v-draft,
    .v-note,
    .v-missing {
      padding-inline: 16px;
    }

    .v-arrow {
      inline-size: 44px;
      block-size: 44px;
    }
  }
</style>
