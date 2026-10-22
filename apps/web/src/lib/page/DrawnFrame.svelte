<!--
  A drawn component in its sandbox (Draw; `braindog-render`'s `src/drawn.ts`): the frame, what it is
  handed and the two things it may ask back. Used by a `drawn` block on a page and by Make a component's preview.

  THE FRAME IS THE HOSTS' OWN DOCUMENT (`@braindog/host/drawn-frame`), never `srcdoc`, which would take this page's policy
  and run nothing. `sandbox="allow-scripts"` and no `allow-same-origin`, so it has an origin of its own that holds
  nothing, and that document's policy gives it no network. It says it is ready; this posts it the whole document once
  (`drawnDocument`: the policy, the start data, the bridge, then the code), and after that only new data and a new theme.

  WHAT COMES BACK IS CHECKED HERE. A message counts only from this frame's own window, and `drawnAsk` admits a height,
  clamped, and opening a row that is one of the rows this handed in. Anything else is dropped without a word.

  IT LOADS WHEN IT NEARS THE SCREEN, so a page holding one opens as fast as one without: until then the block holds its
  place at the height it starts at, and says what it is.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { DRAWN_HEIGHT, DRAWN_LABEL, drawnAsk, drawnDocument, drawnHeight, drawnTheme, type DrawnData, type DrawnTheme } from 'braindog-render';
  import { BASE } from '../at.ts';

  let {
    code,
    data,
    start = DRAWN_HEIGHT.first,
    title = DRAWN_LABEL,
    onopen = null,
  }: {
    /** The component, as the block declares it. A new one draws a new frame. */
    code: string;
    /** What it is handed: the block's rows, only the fields its columns name (`drawnData`). */
    data: DrawnData;
    /** The height it stands at before it says its own, the block's `height:`. */
    start?: number | undefined;
    /** What the frame is called to a screen reader: the block's heading. */
    title?: string | undefined;
    /** Opens one of the rows it was handed, by its spoken id; `null` where nothing opens (a preview). */
    onopen?: ((ref: string) => void) | null;
  } = $props();

  /** The hosts' frame document (`DRAWN_FRAME_PATH`), under the app's base. */
  const SRC = `${BASE}/drawn-frame`;

  let box = $state<HTMLDivElement | undefined>();
  let frame = $state<HTMLIFrameElement | undefined>();
  let near = $state(false);
  let height = $state(drawnHeight(untrack(() => start)));
  /** Whether the document has been written into the frame this code was drawn in. */
  let written = false;

  const refs = $derived(new Set(data.rows.map((r) => r.ref)));

  /** Light or dark as the page is drawn now: the reader's setting, else the device's. */
  function themeNow(): DrawnTheme {
    const root = document.documentElement;
    const scheme = root.getAttribute('data-scheme');
    const dark = scheme === 'dark' || (scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const css = getComputedStyle(root);
    return drawnTheme(dark ? 'dark' : 'light', (name) => css.getPropertyValue(name));
  }

  /** Plain JSON, never a reactive proxy, which a frame cannot be posted. */
  const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  const post = (message: unknown) => frame?.contentWindow?.postMessage(message, '*');

  /* NEAR THE SCREEN, THE FRAME IS PUT ON THE PAGE. */
  $effect(() => {
    if (!box || near) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near = true;
        seen.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    seen.observe(box);
    return () => seen.disconnect();
  });

  /* WHAT THE FRAME ASKS, from this frame's window and no other. */
  $effect(() => {
    const listen = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const m = e.data as { braindog?: unknown } | null;
      if (m && typeof m === 'object' && m.braindog === 'ready' && !written) {
        written = true;
        post({ braindog: 'draw', doc: drawnDocument(code, { data: plain(data), theme: themeNow() }) });
        return;
      }
      const asked = drawnAsk(e.data, refs);
      if (asked === null) return;
      if ('height' in asked) height = asked.height;
      else onopen?.(asked.open);
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  });

  /* NEW CODE IS A NEW FRAME, written again from the start. */
  $effect(() => {
    void code;
    written = false;
  });

  /* NEW DATA GOES IN WITHOUT DRAWING THE FRAME AGAIN. */
  $effect(() => {
    const now = plain(data);
    if (written) untrack(() => post({ braindog: 'data', data: now }));
  });

  /* AND SO DOES A NEW THEME: the reader's setting, and the device's when the setting follows it. */
  $effect(() => {
    if (!near) return;
    const again = () => {
      if (written) post({ braindog: 'theme', theme: themeNow() });
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', again);
    const watch = new MutationObserver(again);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme', 'data-theme', 'style'] });
    return () => {
      media.removeEventListener('change', again);
      watch.disconnect();
    };
  });
</script>

<div class="drawn" bind:this={box} style:block-size="{height}px">
  {#if near}
    {#key code}
      <iframe bind:this={frame} class="drawn-frame" src={SRC} sandbox="allow-scripts" {title} loading="lazy" referrerpolicy="no-referrer"></iframe>
    {/key}
  {:else}
    <p class="drawn-wait">{title}</p>
  {/if}
</div>

<style>
  .drawn {
    inline-size: 100%;
    min-inline-size: 0;
    overflow: hidden;
  }

  .drawn-frame {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    border: 0;
    background: transparent;
  }

  .drawn-wait {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
