<!--
  "Sign in", drawn only while the visitor is signed out: once `/signed-in.js` marks the page `data-in`, `app.css`
  hides every `.when-out`, and `Start.svelte` beside it says "Open BrainDog" instead (`signed-in.ts`).
-->
<script lang="ts">
  import { shell } from '../copy/shell.ts';
  import { SIGNIN } from '../links.ts';

  let { class: klass = '' }: { class?: string } = $props();
</script>

<a class={['when-out', klass]} href={SIGNIN} rel="external">{shell.nav.signin}</a>
