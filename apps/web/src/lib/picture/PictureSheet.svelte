<!--
  The picture changer: what a project or a person is drawn by, changed in one sheet (his word of 4 and 9 November).

  THREE WAYS, ONE WRITE EACH. A picture, chosen, dropped anywhere on the sheet or pasted, cut to a square under a frame
  of the row's own shape (round for a person) and placed by dragging and zooming; a glyph, for a list that keeps a mark,
  from the glyph picker the panel always used; or the picture taken off. Each writes one field (a glyph also takes a
  picture off, since a picture is drawn over it) with its receipt and Undo (`picture-write.ts`).

  SMALL BEFORE IT LEAVES THE BROWSER. What the frame shows is drawn at `PICTURE_SIDE` a side and sent as WebP, or PNG
  where the browser writes no WebP, so a photo off a phone is tens of kilobytes, never its megabytes.

  THE FRAME IS A CANVAS, NOT AN IMAGE. The app's policy loads pictures from its own origin alone (`kit.csp`), so a
  picture not yet sent, which only a `blob:` address could name, drew nothing in an `<img>`; the decoded picture is
  painted onto the frame instead, as it is onto the square that is sent. For the same reason an SVG cannot be read here
  (it decodes only through an image), so it is refused with what to do; `braindog picture` makes one a PNG on a Mac.

  LOADED BY `PictureChange.svelte` the first time a mark is pressed, never with the screen.
-->
<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { markOf } from 'braindog-render';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { initialOf, initialsOf, slotOf } from '$lib/ui/face.ts';
  import { isGlyph, type IconName } from '$lib/ui/icons.ts';
  import { mayBeMark } from '../page/mark-pick.ts';
  import { centred, cover, decoded, held, squared, zoomed, ZOOM_MOST, type View } from './crop.ts';
  import { pictureIn } from './dropped.ts';
  import { glyphPatch, picturePatch, pictureSaid, sendPicture, writePicture } from './picture-write.ts';
  import { pictureFieldOf, pictureSrc, rowKey, type PictureTarget } from './picture.ts';
  import { pictureNow } from './pictures.svelte.ts';
  import { PICTURE_WORDS as W } from './words.ts';

  let {
    open,
    target,
    file = null,
    onclose,
  }: {
    open: boolean;
    target: PictureTarget;
    /** A picture dropped on the mark, which the sheet opens on, ready to place. */
    file?: File | null | undefined;
    onclose: () => void;
  } = $props();

  /** The frame a picture is placed under, in pixels a side. */
  const FRAME = 240;

  let shown = $state(false);
  $effect(() => {
    const want = open;
    untrack(() => {
      shown = want;
      if (want) start(file ?? null);
    });
  });

  /* WHAT IT IS DRAWN BY NOW, as every drawer draws it: the picture, else the glyph, else its letters. */
  const now = $derived(pictureNow(rowKey(target), target.picture));
  const mark = $derived(target.mark === undefined ? null : markOf(target.mark ?? '', target.name));
  const glyph = $derived(mark !== null && mark.length > 1 && isGlyph(mark) ? (mark as IconName) : null);
  const letters = $derived(target.round ? initialOf(target.name) : (mark ?? initialsOf(target.name)));
  const keepsMark = $derived(target.mark !== undefined);
  /* A LIST THAT KEEPS NO PICTURE YET (its add-on not updated) is offered its glyphs alone: nothing to choose, drop, paste
     or take off. */
  const keepsPicture = $derived(pictureFieldOf(target.register) !== null);

  /* THE PICTURE BEING PLACED: decoded once, and where it lies under the frame. */
  type Picked = { image: CanvasImageSource; w: number; h: number; drop: () => void };
  let picked = $state.raw<Picked | null>(null);
  let view = $state<View>({ zoom: 1, x: 0, y: 0 });
  let sending = $state(false);
  let said = $state('');
  let over = $state(false);
  let glyphs = $state(false);
  let chooser = $state<HTMLInputElement | null>(null);

  type Picker = Component<{ value?: string | null; onpick: (name: string) => void }>;
  let GlyphPicker = $state.raw<Picker | null>(null);

  function start(with_: File | null) {
    said = '';
    glyphs = false;
    let_go();
    if (with_) void take(with_);
    /* WITH NO PICTURE TO KEEP, THE GLYPHS ARE ALL IT OFFERS, so they are open at once. */
    else if (!keepsPicture && keepsMark) void showGlyphs();
  }

  function let_go() {
    picked?.drop();
    picked = null;
  }

  /** A chosen, dropped or pasted file, decoded and laid centred under the frame. */
  async function take(chosen: File) {
    said = '';
    if (!keepsPicture) return;
    if (chosen.type === 'image/svg+xml') {
      said = W.svg;
      return;
    }
    if (!chosen.type.startsWith('image/')) {
      said = W.unread;
      return;
    }
    try {
      const got = await decoded(chosen);
      let_go();
      picked = got;
      view = centred(got.w, got.h, FRAME);
      glyphs = false;
    } catch {
      said = W.unread;
    }
  }

  function close() {
    let_go();
    shown = false;
  }

  function closed() {
    let_go();
    glyphs = false;
    said = '';
    onclose();
  }

  /** What the frame shows, made small, sent, and written as the row's picture. */
  async function use() {
    const p = picked;
    if (!p || sending) return;
    sending = true;
    said = '';
    try {
      const blob = await squared(p.image, p.w, p.h, view, FRAME);
      const sent = await sendPicture(blob);
      if (!sent.ok) {
        said = sent.fix;
        return;
      }
      const patch = picturePatch(target.register, sent.file);
      if (patch && writePicture(target, patch, pictureSaid(target.name, sent.file), sent.file.sha256)) close();
    } catch {
      said = W.unread;
    } finally {
      sending = false;
    }
  }

  function remove() {
    const patch = picturePatch(target.register, null);
    if (patch && writePicture(target, patch, pictureSaid(target.name, null), null)) close();
  }

  async function showGlyphs() {
    said = '';
    if (!GlyphPicker) {
      try {
        GlyphPicker = (await import('../page/GlyphPicker.svelte')).default as unknown as Picker;
      } catch {
        said = W.glyphsUnloaded;
        return;
      }
    }
    glyphs = !glyphs;
  }

  /** A glyph picked, or `null` for none: the mark's field, and a picture taken off with it. */
  function pickGlyph(name: string | null) {
    if (name !== null && !mayBeMark(name)) {
      said = 'Pick a glyph that is not a button.';
      return;
    }
    if (name === (target.mark ?? null) && now === null) return close();
    const patch = glyphPatch(target, name);
    if (patch && writePicture(target, patch, name === null ? W.unmarked(target.name) : W.marked(target.name), null)) close();
  }

  /* ── placing it: a drag, the wheel, the zoom and the arrow keys ── */

  let dragging: { id: number; x: number; y: number; from: View } | null = null;

  function down(e: PointerEvent) {
    if (!picked || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { ...view } };
  }

  function move(e: PointerEvent) {
    const d = dragging;
    if (!d || d.id !== e.pointerId || !picked) return;
    view = held({ zoom: d.from.zoom, x: d.from.x + (e.clientX - d.x), y: d.from.y + (e.clientY - d.y) }, picked.w, picked.h, FRAME);
  }

  function up(e: PointerEvent) {
    if (dragging?.id === e.pointerId) dragging = null;
  }

  function zoomTo(z: number) {
    if (picked) view = zoomed(view, z, picked.w, picked.h, FRAME);
  }

  function wheel(e: WheelEvent) {
    if (!picked) return;
    e.preventDefault();
    zoomTo(view.zoom * Math.exp(-e.deltaY / 400));
  }

  function key(e: KeyboardEvent) {
    if (!picked) return;
    const step = e.shiftKey ? 24 : 6;
    const by = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (by) {
      e.preventDefault();
      view = held({ zoom: view.zoom, x: view.x + by[0]!, y: view.y + by[1]! }, picked.w, picked.h, FRAME);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(view.zoom * 1.1);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomTo(view.zoom / 1.1);
    }
  }

  /* A PASTE ANYWHERE WHILE THE SHEET IS UP is a picture to place, when it holds one. */
  $effect(() => {
    if (!shown || !keepsPicture) return;
    const paste = (e: ClipboardEvent) => {
      const got = pictureIn(e.clipboardData);
      if (!got) return;
      e.preventDefault();
      void take(got);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  const carries = (e: DragEvent): boolean => keepsPicture && Array.from(e.dataTransfer?.types ?? []).includes('Files');

  /* THE FRAME, PAINTED: the picture where `view` lays it, at the screen's own density, again on every move and zoom. */
  let canvas = $state<HTMLCanvasElement | null>(null);
  const density = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? Math.min(3, devicePixelRatio) : 1;
  $effect(() => {
    const c = canvas;
    const p = picked;
    const { zoom, x, y } = view;
    if (!c || !p) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const k = c.width / FRAME;
    const s = cover(p.w, p.h, FRAME) * zoom * k;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(p.image, x * k, y * k, p.w * s, p.h * s);
  });
  const slot = $derived(slotOf(target.hue ?? null));
</script>

<Sheet bind:open={shown} title={keepsPicture ? W.heading : W.glyphHeading} subtitle={target.name} fit narrow onclose={closed}>
  <div
    class="ps"
    role="group"
    aria-label={W.heading}
    data-over={over ? '' : undefined}
    ondragenter={(e) => {
      if (!carries(e)) return;
      e.preventDefault();
      over = true;
    }}
    ondragover={(e) => {
      if (!carries(e)) return;
      e.preventDefault();
    }}
    ondragleave={(e) => {
      if (e.currentTarget === e.target) over = false;
    }}
    ondrop={(e) => {
      over = false;
      const got = keepsPicture ? pictureIn(e.dataTransfer) : null;
      if (!got) return;
      e.preventDefault();
      void take(got);
    }}
  >
    {#if picked}
      <!-- PLACING IT: the frame in the row's own shape, the picture under it. Dragged, or moved by the arrow keys and zoomed
           by + and − once it is focused, so it is a focusable region with keys of its own; the zoom below says the same. -->
      <p class="ps-help">{W.move}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="ps-frame"
        data-round={target.round ? '' : undefined}
        style:--frame="{FRAME}px"
        role="application"
        aria-roledescription="picture"
        aria-label={W.move}
        tabindex="0"
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onwheel={wheel}
        onkeydown={key}
      >
        <canvas class="ps-canvas" bind:this={canvas} width={Math.round(FRAME * density)} height={Math.round(FRAME * density)}></canvas>
      </div>
      <label class="ps-zoom">
        <span class="ps-label">{W.zoom}</span>
        <input type="range" min="1" max={ZOOM_MOST} step="0.01" value={view.zoom} oninput={(e) => zoomTo(Number(e.currentTarget.value))} />
      </label>
    {:else}
      <!-- WHAT IT IS DRAWN BY NOW, and the ways to change it. -->
      <div class="ps-now">
        <span class="ps-well" data-round={target.round ? '' : undefined} data-slot={slot} aria-hidden="true">
          {#if now}<img class="ps-img" src={pictureSrc(now)} alt="" width="64" height="64" decoding="async" />{:else if glyph}<Icon name={glyph} size="l" />{:else}{letters}{/if}
        </span>
        {#if keepsPicture}
          <div class="ps-drop">
            <p class="ps-help">{W.drop}</p>
            <Button weight="ink" onclick={() => chooser?.click()}><Icon name="upload" size="s" />{W.choose}</Button>
          </div>
        {/if}
      </div>
      {#if keepsMark}
        <div class="ps-glyphs">
          <Button size="sm" aria-expanded={glyphs ? 'true' : 'false'} onclick={() => void showGlyphs()}>{keepsPicture ? W.glyph : W.glyphHeading}</Button>
          {#if glyphs && GlyphPicker}
            {@const Picker = GlyphPicker}
            <div class="ps-picker" role="group" aria-label={W.glyphHeading}>
              <Picker value={target.mark ?? null} onpick={(name) => pickGlyph(name)} />
              {#if target.mark}<Button size="sm" onclick={() => pickGlyph(null)}>{W.noGlyph}</Button>{/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
    {#if said}<p class="ps-said" role="status">{said}</p>{/if}
    <input
      class="ps-file"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
      tabindex="-1"
      aria-hidden="true"
      bind:this={chooser}
      onchange={(e) => {
        const got = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (got) void take(got);
      }}
    />
  </div>

  {#snippet footer()}
    {#if picked}
      <Button onclick={() => let_go()}>{W.back}</Button>
      <Button onclick={() => chooser?.click()}>{W.other}</Button>
      <Button weight="primary" disabled={sending} onclick={() => void use()}>{sending ? W.sending : W.use}</Button>
    {:else if now && keepsPicture}
      <Button tone="bad" onclick={remove}><Icon name="trash" size="s" />{W.remove}</Button>
    {/if}
  {/snippet}
</Sheet>

<style>
  .ps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    border-radius: var(--r-pop);
    outline: 2px dashed transparent;
    outline-offset: 4px;
    transition: outline-color var(--d-swap) var(--ease-standard);
  }

  /* A PICTURE HELD OVER THE SHEET: the whole of it takes the drop. */
  .ps[data-over] {
    outline-color: var(--focus);
  }

  .ps-now {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  /* WHAT IT IS DRAWN BY NOW, at 64: the slot's tint and colour, as its well everywhere else. */
  .ps-well {
    display: grid;
    flex: none;
    place-items: center;
    overflow: hidden;
    inline-size: 64px;
    block-size: 64px;
    border-radius: var(--r-tile);
    background: var(--ph-tint, var(--tile-2));
    color: var(--ph, var(--ink-2));
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
  }

  .ps-well[data-round] {
    border-radius: var(--r-round);
  }

  .ps-well[data-slot] {
    --ph: var(--cat-blue, var(--ink-2));
    --ph-tint: var(--cat-blue-tint, var(--tile-2));
  }

  .ps-well[data-slot='violet'] {
    --ph: var(--cat-violet, var(--ink-2));
    --ph-tint: var(--cat-violet-tint, var(--tile-2));
  }

  .ps-well[data-slot='pink'] {
    --ph: var(--cat-pink, var(--ink-2));
    --ph-tint: var(--cat-pink-tint, var(--tile-2));
  }

  .ps-well[data-slot='teal'] {
    --ph: var(--cat-teal, var(--ink-2));
    --ph-tint: var(--cat-teal-tint, var(--tile-2));
  }

  .ps-well[data-slot='sky'] {
    --ph: var(--cat-sky, var(--ink-2));
    --ph-tint: var(--cat-sky-tint, var(--tile-2));
  }

  .ps-well[data-slot='yellow'] {
    --ph: var(--cat-yellow, var(--ink-2));
    --ph-tint: var(--cat-yellow-tint, var(--tile-2));
  }

  .ps-well[data-slot='lime'] {
    --ph: var(--cat-lime, var(--ink-2));
    --ph-tint: var(--cat-lime-tint, var(--tile-2));
  }

  .ps-well[data-slot='slate'] {
    --ph: var(--cat-slate, var(--ink-2));
    --ph-tint: var(--cat-slate-tint, var(--tile-2));
  }

  .ps-well :global(.icon[data-size]) {
    inline-size: 28px;
    block-size: 28px;
  }

  .ps-img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  .ps-drop {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .ps-help,
  .ps-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .ps-said {
    color: var(--red);
  }

  .ps-glyphs {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .ps-picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    inline-size: 100%;
  }

  .ps-picker > :global(.picker) {
    inline-size: 100%;
  }

  /* THE FRAME: the row's own shape, the picture moved under it, a hand while it is held. */
  .ps-frame {
    position: relative;
    overflow: hidden;
    align-self: center;
    inline-size: var(--frame);
    block-size: var(--frame);
    border-radius: var(--r-tile);
    background: var(--tile-2);
    box-shadow: 0 0 0 1px var(--rule-strong);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .ps-frame[data-round] {
    border-radius: var(--r-round);
  }

  .ps-frame:active {
    cursor: grabbing;
  }

  .ps-frame:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .ps-canvas {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  /* THE PICTURE IS PLACED LEFT TO RIGHT WHATEVER THE PAGE READS, since `view` is measured from the frame's left edge. */
  .ps-frame {
    direction: ltr;
  }

  .ps-zoom {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .ps-zoom input {
    flex: 1;
    min-inline-size: 0;
    accent-color: var(--ink);
  }

  .ps-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .ps-file {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .ps {
      transition: none;
    }
  }
</style>
