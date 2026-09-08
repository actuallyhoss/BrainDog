<!--
  `/settings` — the address a person types, which used to answer with a row-id refusal.

  There was no page here, so `GET /settings` fell through to the `/[id]` catch-all and rendered
  *"Nothing answers to “settings”. An id is a list and a number, like obligations#4 — or the short
  code a thing was given…"* The in-app rail links to `/settings/appearance` and `g ,` resolves, so
  this only ever bit a URL that was typed, bookmarked, pasted or written by an agent — which is every
  one of those, and every one of them is somebody who already knows what they were looking for.

  IT REDIRECTS RATHER THAN LISTING. A second index of the twelve areas would be a second nav for a
  rail that is on the screen the moment you arrive, and `19 §3`'s objection to a second door into one
  room applies exactly. Appearance is the first area in the rail, so the address a person types lands
  where the link they would have clicked lands.

  `replaceState`, so Back returns to wherever they came from rather than to a redirect that fires
  again.
-->
<script lang="ts">
  import { goto } from '$app/navigation';

  $effect(() => {
    void goto('/settings/appearance', { replaceState: true });
  });
</script>
