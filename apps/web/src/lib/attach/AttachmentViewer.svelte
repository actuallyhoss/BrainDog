<!--
  One attached file open over its thing: its name, what it is and who put it, its versions to pick from, Download and
  Close; and the file itself, shown by what it is, so that NOTHING IT HOLDS RUNS IN BRAINDOG'S OWN ORIGIN:

  - A PAGE (a Claude artifact, any `.html`) in the hosts' own frame for attached pages (`/drawn-frame/file`,
    `@braindog/host/drawn-frame`): `sandbox="allow-scripts"` and no `allow-same-origin`, under a policy that lets its
    libraries load from the artifact CDNs and nothing else, with no network at all (`connect-src 'none'`). It says it is
    ready from its own window and is posted the page once; nothing it says back is acted on. A line over it says so.
  - A PDF by the browser's own viewer, from a `blob:` the app makes with the type `application/pdf` and no other, so a
    blob here is never a page. "Open full screen" opens the same blob in a tab of its own, which is how a phone shows
    every page of it.
  - A PICTURE by `<img>` from the file door, where an SVG's script never runs.
  - TEXT as text, never as markup.
  - Anything else: no preview, and Download.

  FROM 900 UP, a tile `--inset` in from every edge over the scrim; ON A PHONE, THE WHOLE SCREEN, Close at the top end, 44
  square. Escape, the backdrop and Close all end in the dialog's own close. LOADED BY `import()` on the first open.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { BASE, apiBase } from '$lib/at.ts';
  import { overlays } from '$lib/a11y/keys.svelte.ts';
  import { actor } from '$lib/record/names.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { scrims, settled } from '$lib/ui/panel.ts';
  import { since } from 'braindog-render';
  import { attachWords as words, bytesOf, download, fileAt, kindWord, readOne, sizeOf, type Opened } from './attached.ts';

  let {
    open = $bindable(false),
    id,
    name,
  }: {
    open?: boolean | undefined;
    id: string;
    /** Its name as the list said it, the dialog's name until the read lands. */
    name: string;
  } = $props();

  const uid = $props.id();
  const SRC = `${BASE}/drawn-frame/file`;

  let el = $state<HTMLDialogElement>();
  let frame = $state<HTMLIFrameElement>();
  let held = false;
  let lift: (() => void) | null = null;

  let shown = $state.raw<Opened | null>(null);
  let fix = $state('');
  /** What is drawn: the page's text for the frame, a PDF's `blob:` address, or text. */
  let doc = $state<string | null>(null);
  let pdf = $state<string | null>(null);
  let text = $state<string | null>(null);
  let drawn = $state(0);
  let written = false;

  const me = $derived(String(page.data.me?.person ?? '') || null);
  const names = $derived(new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)));
  const now = $derived(Date.now());
  const who = (by: string): string => actor(by, me, names).name;

  function letGo() {
    if (pdf !== null) URL.revokeObjectURL(pdf);
    pdf = null;
    doc = null;
    text = null;
  }

  /** Read one version, or the one it stands at, and draw it by what it is. */
  async function show(version?: number) {
    fix = '';
    const base = apiBase();
    const got = await readOne(base, id, version);
    if (!got.ok) {
      fix = got.fix;
      return;
    }
    letGo();
    shown = got.value;
    const kind = got.value.kind;
    if (kind === 'page' || kind === 'pdf' || kind === 'text') {
      const bytes = await bytesOf(base, got.value.sha256);
      if (bytes === null) {
        fix = words.notReached;
        return;
      }
      if (kind === 'page') doc = new TextDecoder().decode(bytes);
      /* A PDF AND NOTHING ELSE: the type is written here, never read from the file or the door. */
      else if (kind === 'pdf') pdf = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      else text = new TextDecoder().decode(bytes);
    }
    written = false;
    drawn++;
  }

  $effect(() => {
    if (open && shown === null && fix === '') void show();
  });

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
    letGo();
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

  /* THE FRAME SAYS IT IS READY FROM ITS OWN WINDOW, and is handed the page once. Nothing else it says is read. */
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

  async function save() {
    if (shown && !(await download(apiBase(), shown))) fix = words.notReached;
  }

  function picked(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    if (Number.isSafeInteger(v) && v > 0) void show(v);
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
  <header class="a-head">
    <div class="a-name">
      <h2 class="a-title" id="{uid}-title" dir="auto">{shown?.name || name}</h2>
      {#if shown}
        <p class="a-made">{kindWord(shown.kind, shown.name)} · {sizeOf(shown.bytes)} · {who(shown.by)}{shown.at ? `, ${since(shown.at, now)}` : ''}</p>
      {/if}
    </div>
    {#if shown}
      <div class="a-tools">
        {#if shown.history.length > 1}
          <label class="a-sr" for="{uid}-v">{words.versions}</label>
          <select id="{uid}-v" class="a-versions" value={String(shown.version)} onchange={picked}>
            {#each shown.history as v (v.version)}
              <option value={String(v.version)}>{words.version(v.version)} · {who(v.by)}</option>
            {/each}
          </select>
        {/if}
        <Button size="sm" onclick={() => void save()}><Icon name="download" size="s" />{words.download}</Button>
      </div>
    {/if}
    <button type="button" class="a-close tap" onclick={() => (open = false)} aria-label={words.close} title={words.close}>
      <Icon name="close" size="m" />
    </button>
  </header>

  {#if shown?.kind === 'page' && doc !== null}
    <p class="a-note-line"><Icon name="lock" size="s" />{words.sandboxed}</p>
  {/if}

  <div class="a-body">
    {#if fix}
      <p class="a-note" role="status">{fix}</p>
    {:else if shown === null}
      <p class="a-note" role="status">{words.reading}</p>
    {:else if shown.kind === 'page' && doc !== null}
      {#key drawn}
        <iframe bind:this={frame} class="a-frame" src={SRC} sandbox="allow-scripts" title={shown.name} referrerpolicy="no-referrer"></iframe>
      {/key}
    {:else if shown.kind === 'pdf' && pdf !== null}
      {#key drawn}
        <iframe class="a-frame a-pdf" src={pdf} title={shown.name}></iframe>
      {/key}
      <p class="a-foot"><a class="a-link" href={pdf} target="_blank" rel="noopener noreferrer">{words.openPdf}</a></p>
    {:else if shown.kind === 'picture'}
      <div class="a-picture"><img src={fileAt(apiBase(), shown.sha256)} alt={shown.name} /></div>
    {:else if shown.kind === 'text' && text !== null}
      <pre class="a-text" dir="auto">{text}</pre>
    {:else}
      <div class="a-none">
        <p class="a-note">{words.noPreview}</p>
        <Button size="sm" weight="primary" onclick={() => void save()}><Icon name="download" size="s" />{words.download}</Button>
      </div>
    {/if}
  </div>
</dialog>

<style>
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

  .a-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 20px;
    border-block-end: 1px solid var(--rule);
  }

  .a-name {
    flex: 1;
    min-inline-size: 0;
  }

  .a-title {
    margin: 0;
    font-size: var(--fs-head);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-made {
    margin: 2px 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .a-versions {
    flex: none;
    block-size: var(--ctl-h);
    max-inline-size: 200px;
    padding: 0 8px;
    background: var(--tile-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-field, 12px);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
  }

  .a-close {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    cursor: pointer;
  }

  .a-close:hover {
    color: var(--ink);
  }

  .a-note-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8px 20px;
    border-block-end: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .a-body {
    flex: 1;
    min-block-size: 0;
    display: flex;
    flex-direction: column;
  }

  .a-frame {
    flex: 1;
    display: block;
    inline-size: 100%;
    block-size: 100%;
    border: 0;
    background: #fff;
  }

  .a-foot {
    margin: 0;
    padding: 8px 20px;
    border-block-start: 1px solid var(--rule);
    font-size: var(--fs-meta);
  }

  .a-link {
    color: var(--ink);
    font-weight: 600;
  }

  .a-picture {
    flex: 1;
    min-block-size: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    overflow: auto;
    background: var(--board);
  }

  .a-picture img {
    max-inline-size: 100%;
    max-block-size: 100%;
    object-fit: contain;
  }

  .a-text {
    flex: 1;
    min-block-size: 0;
    margin: 0;
    padding: 16px 20px;
    overflow: auto;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--fs-meta);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .a-none {
    display: grid;
    justify-items: start;
    gap: 12px;
    padding: 24px 20px;
  }

  .a-note {
    margin: 0;
    padding: 24px 20px;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .a-none .a-note {
    padding: 0;
  }

  .a-sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (width < 900px) {
    .viewer {
      inset: 0;
      border-radius: 0;
      padding-block-start: env(safe-area-inset-top);
      padding-block-end: env(safe-area-inset-bottom);
    }

    .a-head {
      flex-wrap: wrap;
      padding: 8px 12px 8px 16px;
    }

    .a-name {
      flex-basis: calc(100% - 56px);
    }

    /* DRAWN AT ITS SIZE UNDER A THUMB TOO (ops style): `.tap` gives it the 44px it needs to be pressed. */
    .a-close {
      order: 1;
    }

    .a-tools {
      order: 2;
      flex-basis: 100%;
    }

    .a-note-line {
      padding-inline: 16px;
    }
  }
</style>
