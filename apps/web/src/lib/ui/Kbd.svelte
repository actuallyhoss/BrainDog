<!--
  A key binding, printed where the thing it operates is.

  Every palette row prints its binding on its trailing edge, and this is the highest-leverage single
  component in the spec. Superhuman's own words: "If you don't know a shortcut, just hit Cmd+K …
  type in what you want to do. You can see the shortcut for next time."

  So the palette becomes the shortcut teacher, the slow path and the fast path are the same list,
  and there is no cheat sheet to keep in sync (19 §4).
-->
<script lang="ts" module>
  /**
   * THE KEY THE READER ACTUALLY HAS.
   *
   * The table writes `⌘K`, because the Mac glyphs are the compact ones and one canonical spelling
   * beats a conditional in ninety call sites. Printed unchanged, though, this app told a Windows
   * reader to press a key their keyboard does not have — `⌘K`, `⌘\`, `⌘Z`, `⌘↵`, `⌥V`, and a
   * primary button reading "Commit the decision ⌘↵" — while the key that works is Ctrl.
   *
   * A SHORTCUT HINT NOBODY CAN FOLLOW IS WORSE THAN NONE: it is the palette teaching the wrong
   * lesson, on the component whose whole purpose is that the slow path teaches the fast one.
   *
   * `navigator.platform` IS DEPRECATED AND STILL THE ONE THAT ANSWERS. `userAgentData` is
   * Chromium-only, so it is tried first and the old property is the fallback rather than the
   * source. AN EMPTY `userAgentData.platform`, which Chrome gives where it will not say, falls through to
   * `navigator.platform`: with `??` it stopped at the empty answer, and a Mac read Ctrl.
   *
   * DECIDED ONCE, AS THE MODULE LOADS, AND NEVER WRITTEN AGAIN (ui-perfect, 3 Nov). It was asked in `onMount`, so every
   * hint drew "Ctrl+K" first and was rewritten to "⌘K" a frame later: the top bar's search hint changed under the eye on
   * every load on a Mac, and the shortcut sheet rewrote some thirty caps each time it was drawn. The app is drawn in the
   * browser only (`ssr = false` at the root), so there is no server answer to agree with, and the first draw can be the
   * right one. Outside a browser (a script that renders a part) it is the ordinary answer.
   */
  const MAC: boolean =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad|ipod/i.test((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '');
</script>

<script lang="ts">
  let { keys }: { keys: string } = $props();

  const mac = MAC;

  /** `⌘` is Ctrl, `⌥` is Alt, and a modifier joins its key with a plus, which is the convention. */
  const said = (part: string): string =>
    mac
      ? part
      : part
          .replace(/⌘/g, 'Ctrl+')
          .replace(/⌥/g, 'Alt+')
          .replace(/⇧/g, 'Shift+')
          .replace(/↵|⏎/g, 'Enter')
          /* `Ctrl+ Home` from `⌘Home` — the glyph carried no separator and the word needs none either. */
          .replace(/\+\s+/g, '+');

  /** Two spaces separate alternatives; a single space separates a sequence. */
  const parts = $derived(keys.split('  ').map(said));
</script>

<span class="kbd-run">
  {#each parts as part, i}
    {#if i > 0}<span class="kbd-or">or</span>{/if}
    <!-- A SEQUENCE IS ONE CAP A KEY (P41): "g then h" is g, the word, then h. -->
    {#each part.split(' then ') as step, j}
      {#if j > 0}<span class="kbd-or">then</span>{/if}
      <kbd class="kbd">{step}</kbd>
    {/each}
  {/each}
</span>

<style>
  .kbd-run {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    white-space: nowrap;
  }

  /* THE CAP: Geist Mono 12 on the `--tile-2` fill, an 18px square at its smallest, radius `--r-xs`, and no
     border. The old raised cap with a thicker bottom edge was a picture of a keyboard; this is a label. */
  .kbd {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 var(--sp-1);
    background: var(--tile-2);
    border-radius: 4px;
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
    font-weight: 500;
    line-height: 1;
    text-align: center;
  }

  .kbd-or {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  @media (forced-colors: active) {
    .kbd {
      border: 1px solid CanvasText;
    }
  }
</style>
