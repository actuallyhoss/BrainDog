<!--
  "Get early access" (or "Start free" once sign-up is open), and "Open BrainDog" in its place once the visitor is
  signed in.

  RED ONLY FOR THE ONE MAIN ACTION (Look B): a page's own start button is the red one, and the bar's is ink, the app's
  strong neutral for a strong choice where the screen's red is spent elsewhere. `tone` says which.

  BOTH ARE IN THE HTML. `/signed-in.js` marks the page `data-in` before the first paint when the app's `bd_in` cookie
  is there (`signed-in.ts`), and `app.css` shows `.when-in` and hides `.when-out` under it, so nothing flickers and the
  page reads whole with scripting off (as signed out). Every start button on the site is this component.

  `rel="external"` on both, because the app is not a page of this site: the prerender crawler would otherwise follow
  the link and stop the build.
-->
<script lang="ts">
  import { shell } from '../copy/shell.ts';
  import { APP, SIGNUP } from '../links.ts';

  let { size = 'md', tone = 'red' }: { size?: 'md' | 'sm' | 'lg'; tone?: 'red' | 'ink' } = $props();

  const cls = $derived(`btn ${tone}${size === 'md' ? '' : ` ${size}`}`);
</script>

<a class="{cls} when-out" href={SIGNUP} rel="external">{shell.nav.start}</a>
<a class="{cls} when-in" href={APP} rel="external">{shell.nav.open}</a>
