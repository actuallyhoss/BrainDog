<!--
  SAYS THE NEW PAGE'S NAME ON A REAL MOVE, AND ONLY THEN.

  SvelteKit's own announcer (`#svelte-announcer`, written by kit/src/core/sync/write_root.js) speaks whenever the page
  store notifies after mount, and an `invalidate` after a write notifies it too: Mark paid on Today or Mark done on a
  task had the page's title read out, assertively, over the toast's "Marked paid" (audit 31 Oct i, AI1). So its region
  is turned off here, and this one speaks after a navigation that moved to another address. A move between the same
  address with other search words (a list's filter) speaks only when the title changed, as Kit's did. The page's own
  live messages (the toasts) are untouched.
-->
<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';

  let said = $state('');

  /* Kit draws its region after the root mounts, which is after this mounts, so wait for it to appear. */
  onMount(() => {
    const quiet = (): boolean => {
      const kit = document.getElementById('svelte-announcer');
      if (kit === null) return false;
      kit.setAttribute('aria-live', 'off');
      kit.setAttribute('aria-hidden', 'true');
      return true;
    };
    if (quiet()) return;
    const watch = new MutationObserver(() => { if (quiet()) watch.disconnect(); });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  });

  /* The title last heard or shown, so a filter that keeps the name stays quiet. */
  let last = '';
  let wait: ReturnType<typeof setTimeout> | undefined;
  let watching: MutationObserver | undefined;

  /* A page may set its title a beat after the move (Today's Work view does), so the name is read once it has held
     still for a moment, as a person would hear it, and never a stale one. */
  const settle = (speak: (title: string, before: string) => boolean): void => {
    clearTimeout(wait);
    watching?.disconnect();
    const before = last;
    const until = Date.now() + 1000;
    const done = (): void => {
      watching?.disconnect();
      const title = document.title || 'untitled page';
      last = title;
      if (!speak(title, before)) return;
      /* Emptied first, so a move to a page with the same name is still read. */
      said = '';
      void tick().then(() => { said = title; });
    };
    const later = (): void => { clearTimeout(wait); wait = setTimeout(done, Math.max(0, Math.min(150, until - Date.now()))); };
    watching = new MutationObserver(later);
    watching.observe(document.head, { subtree: true, childList: true, characterData: true });
    later();
  };
  onMount(() => () => { clearTimeout(wait); watching?.disconnect(); });

  afterNavigate(({ from, to, type }) => {
    const enter = type === 'enter' || from === null || to === null;
    const moved = !enter && from.url.pathname !== to.url.pathname;
    const searched = !enter && from.url.search !== to.url.search;
    if (!enter && !moved && !searched) return;
    settle((title, before) => !enter && (moved || title !== before));
  });
</script>

<div class="route-say" aria-live="assertive" aria-atomic="true" data-route-say>{said}</div>

<style>
  .route-say {
    position: absolute;
    left: 0;
    top: 0;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
    width: 1px;
    height: 1px;
  }
</style>
