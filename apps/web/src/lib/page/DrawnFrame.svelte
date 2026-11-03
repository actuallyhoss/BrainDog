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

  ON A BOARD (`size`, `picture`; widgets plan §8, W7) the frame is the size's, fixed, and the component is told its size
  (`braindog.size`). With `picture` it runs only while it is on screen, the browser is idle and one of the few places to
  run is free (`drawn-alive.ts`); otherwise it draws the picture it last handed back, kept on this device
  (`drawn-pictures.ts`), in the same sandbox with no script at all (`drawnPictureDocument`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { DRAWN_HEIGHT, DRAWN_LABEL, drawnAsk, drawnDocument, drawnFrameHeight, drawnHeight, drawnPictureDocument, drawnTheme, type DrawnAct, type DrawnData, type DrawnTheme, type WidgetSize } from 'braindog-render';
  import { BASE } from '../at.ts';
  import { askAlive, letGo } from './drawn-alive.ts';
  import { keepPicture, keptPicture, pictureKey } from './drawn-pictures.ts';

  let {
    code,
    data,
    start = DRAWN_HEIGHT.first,
    title = DRAWN_LABEL,
    onopen = null,
    size = null,
    picture = false,
    whose = null,
    onact = null,
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
    /** The widget frame it is drawn in on a board, fixed; `null` on a page, where it says its own height. */
    size?: WidgetSize | null;
    /** On a board: run only while on screen and one of the few places is free, else draw its last picture. */
    picture?: boolean;
    /** Who the pictures are kept for, the person and the BrainDog (`whoseOf`); `null` keeps and draws none. */
    whose?: string | null;
    /**
     * A row its view asks to add or change (`braindog.create` / `braindog.update`), handed to the record, which checks it
     * against the block's own `acts:` and writes as the reader. `null` where nothing writes (a preview, a board): the
     * view is then answered that it cannot. What comes back is posted to the frame as plain JSON.
     */
    onact?: ((act: DrawnAct) => Promise<unknown>) | null;
  } = $props();

  /** The hosts' frame document (`DRAWN_FRAME_PATH`), under the app's base. */
  const SRC = `${BASE}/drawn-frame`;

  let box = $state<HTMLDivElement | undefined>();
  let frame = $state<HTMLIFrameElement | undefined>();
  let near = $state(false);
  let height = $state(drawnHeight(untrack(() => start)));
  /** Whether the document has been written into the frame this code was drawn in. */
  let written = false;
  /** Whether the component runs now; always, unless it is a board's (`picture`). */
  let alive = $state(!untrack(() => picture));
  /** The picture it last left on this device, drawn while it does not run. */
  let kept = $state<{ picture: string; height: number } | null>(null);
  /** This frame, to the count of frames running. */
  const me = Symbol('drawn');

  /** The board's own row and gap where it measures them (its rows follow its width), else the house's 168 and 12. */
  let measured = $state<{ row: number; gap: number } | null>(null);
  $effect(() => {
    if (!size || !box) return;
    const board = box.closest<HTMLElement>('[data-cols]');
    if (!board) return;
    const read = () => {
      const css = getComputedStyle(board);
      const row = parseFloat(css.gridAutoRows);
      const gap = parseFloat(css.rowGap);
      if (Number.isFinite(row) && row > 0) measured = { row, gap: Number.isFinite(gap) ? gap : 12 };
    };
    read();
    const sized = new ResizeObserver(read);
    sized.observe(board);
    return () => sized.disconnect();
  });

  /** On a board the frame is the size's; elsewhere the component says its height. */
  const tall = $derived(size ? (measured ? drawnFrameHeight(size, measured.row, measured.gap) : drawnFrameHeight(size)) : height);

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
        const theme = themeNow();
        if (alive) post({ braindog: 'draw', doc: drawnDocument(code, { data: plain(data), theme, size }) });
        else if (kept) post({ braindog: 'draw', doc: drawnPictureDocument(kept.picture, theme) });
        if (alive && picture) snapSoon();
        return;
      }
      const asked = drawnAsk(e.data, refs);
      if (asked === null) return;
      if ('height' in asked) height = asked.height;
      else if ('open' in asked) onopen?.(asked.open);
      else if ('act' in asked) {
        const id = asked.act.id;
        const answer = onact === null ? Promise.resolve({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This view cannot write here.' } }) : onact(asked.act);
        void answer
          .catch(() => ({ ok: false, refusal: { code: 'INTERNAL', fix: 'It could not be written. Try again.' } }))
          .then((said) => post({ braindog: 'done', id, answer: plain(said ?? null) }));
      }
      else if (picture && alive) {
        if (whose !== null) keepPicture(pictureKey(whose, code, size, themeNow().mode), asked.picture, tall);
        kept = { picture: asked.picture, height: tall };
      }
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  });

  /* NEW CODE IS A NEW FRAME, written again from the start, and so is coming alive or going back to the picture. */
  $effect(() => {
    void code;
    void alive;
    written = false;
  });

  /* NEW DATA GOES IN WITHOUT DRAWING THE FRAME AGAIN, and a running board widget leaves a new picture after it. */
  $effect(() => {
    const now = plain(data);
    if (written && alive) untrack(() => {
      post({ braindog: 'data', data: now });
      if (picture) snapSoon();
    });
  });

  /* A NEW SIZE IS SAID TO THE COMPONENT, which draws what fits the new frame. */
  $effect(() => {
    const now = size;
    if (written && alive) untrack(() => post({ braindog: 'size', size: now }));
  });

  /** Its picture, asked a moment after it drew, so what is kept is what settled. */
  let snapping: ReturnType<typeof setTimeout> | undefined;
  function snapSoon() {
    clearTimeout(snapping);
    snapping = setTimeout(() => {
      if (alive && written) post({ braindog: 'picture' });
    }, 900);
  }

  /* THE PICTURE THIS DEVICE KEPT, read once for this code, size and theme, and for this person on this BrainDog alone. */
  $effect(() => {
    if (!picture) return;
    kept = whose === null ? null : keptPicture(pictureKey(whose, code, size, themeNow().mode));
  });

  /*
   * ON A BOARD, IT RUNS ONLY ON SCREEN AND WHEN THE BROWSER IS IDLE, and only while a place to run is free. Off screen it
   * goes back to its picture and gives its place to the next one waiting.
   */
  $effect(() => {
    if (!picture || !box) return;
    let shown = false;
    let idle: number | undefined;
    const wake = () => {
      if (shown) tryAlive();
    };
    const tryAlive = () => {
      const run = () => {
        if (shown && askAlive(me, wake)) alive = true;
      };
      idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 1500 }) : (setTimeout(run, 200) as unknown as number);
    };
    const seen = new IntersectionObserver((entries) => {
      const now = entries.some((e) => e.isIntersecting);
      if (now === shown) return;
      shown = now;
      if (shown) tryAlive();
      else {
        alive = false;
        letGo(me);
      }
    });
    seen.observe(box);
    return () => {
      seen.disconnect();
      if (idle !== undefined) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
        else clearTimeout(idle);
      }
      clearTimeout(snapping);
      letGo(me);
    };
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

<div class="drawn" bind:this={box} style:block-size="{tall}px">
  {#if near && (alive || kept)}
    {#key `${code}|${alive}`}
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
