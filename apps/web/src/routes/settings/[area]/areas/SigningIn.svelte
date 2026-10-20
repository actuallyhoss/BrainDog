<!--
  Settings > Signing in (the UI pass of 20 October, agents F14): who you are, your passkeys, where you are signed in and
  the records you can open, in that order. They were three areas (Identity, Recovery, Sessions) of one or two lines each;
  their old addresses land here (`place.ts` `MOVED`). Each part keeps its own component and its own state.
-->
<script lang="ts">
  import type { AreaProps } from '../settings-state.svelte.ts';
  import Identity from './Identity.svelte';
  import Recovery from './Recovery.svelte';
  import Sessions from './Sessions.svelte';

  let { shell, area }: AreaProps = $props();
</script>

<Identity {shell} {area} part="you" />
<Recovery {shell} {area} />
<Sessions {shell} {area} />
<Identity {shell} {area} part="records" />
