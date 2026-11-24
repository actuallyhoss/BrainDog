/**
 * EVERY SURFACE THAT DRAWS BLOCKS WAITS FOR THE DRAWERS THEIR KINDS NEED, BY THIS ONE HOLD (`lazy.ts`). A forecast, a
 * calendar or a feed drawn a moment after the blocks round it moved what was under it down: CLS 0.45 on Forecast, and
 * on Today "Edit Today" under the board went down when the feed landed (0.023 on a phone, 24 Nov). So a host hands this
 * the kinds it is about to draw and holds its body (its own skeleton, or its waiting bars) while `ready` is false. The
 * page reader (`PageView`), Today's board, the shared page, a row's page, a question's page, the Add block sheet and the
 * design sheets all hold by it.
 *
 * `ready` IS TRUE IN THE FIRST FRAME when every drawer is in hand (the site, a test, a tab that has drawn them), so a
 * host waits only where there is something to wait for. The kinds are read as a derived, so the frame an answer lands
 * in already knows to wait; asked again only when they change, so a drawer that did not come is not asked for in a
 * loop (`preloadKinds` gives a failed one up, and its block asks once more by itself).
 *
 * `once` HOLDS ONLY THE FIRST DRAWING, for a surface whose wait is the whole screen: a row's page put back to its bars
 * when a saved document gained a chart lost its place and the reader's scroll. `kinds` says `null` until there is
 * something to draw. After that the drawers are still asked for at once, and a block draws its body when it comes.
 *
 * ITS OWN ENTRY (`braindog-render/drawers-wait`) AS WELL AS THE KIT'S, so Today, which loads the page reader later and
 * keeps the kit out of its first chunk, can hold without taking the kit.
 */
import { preloadKinds } from './lazy.ts';

export { preloadKinds };

/** Whether the drawers a surface's blocks need have landed, as `drawersHeld` answers it. */
export type DrawersHeld = { readonly ready: boolean };

/** Hold a surface for the drawers of the kinds `kinds` reads (`null`: nothing to draw yet), from a component's setup. */
export function drawersHeld(kinds: () => Iterable<string> | null, { once = false }: { once?: boolean } = {}): DrawersHeld {
  const asked = $derived(kinds());
  const wait = $derived(asked === null ? null : preloadKinds(asked));
  let came = $state.raw<Promise<void> | null>(null);
  $effect(() => {
    const out = wait;
    if (out !== null) void out.then(() => (came = out));
  });
  /* Plain, not state: once it is set, `ready` reads nothing and stays true. */
  let drew = false;
  const ready = $derived.by(() => {
    if (drew) return true;
    const now = wait === null || came === wait;
    if (now && once && asked !== null) drew = true;
    return now;
  });
  return {
    get ready() {
      return ready;
    },
  };
}
