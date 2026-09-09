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

  AND IT DREW A BLANK PAGE WITH NO TITLE while the redirect ran. The effect fires after mount, so
  for one frame or several on a cold load this route was an empty document whose tab said nothing:
  a person who typed the address watched a blank screen and had no way to tell it from a broken one.
  A title and one line cost nothing and are correct even if the redirect never lands, which on a
  slow first load is a real state and not a hypothetical.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';

  $effect(() => {
    void goto('/settings/appearance', { replaceState: true });
  });
</script>

<svelte:head><title>{titleOf(copy.settings)}</title></svelte:head>

<p class="going" role="status">{copy.settingsGoing}</p>

<style>
  .going {
    padding: var(--sp-6) var(--sp-5);
    color: var(--dim);
  }
</style>
