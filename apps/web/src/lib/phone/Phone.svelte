<!--
  What makes BrainDog behave like a phone's own app, in one place the shell loads after its first screen:

  - the phone's status bar in the app bar's colour, following the scheme chosen in Settings (`syncThemeColor`);
  - the iPhone's launch pictures, named only on an iPhone (`startupImages`);
  - back with a swipe from the left edge on an iPhone's Home Screen app (`EdgeBack`);
  - the field being typed in kept above the keyboard (`keepFieldInView`);
  - the two asks, the Home Screen and notifications, each once (`PhoneHints`).

  ITS OWN CHUNK, loaded after the shell has drawn (`AppFrame.svelte`), so none of it is in the bytes every first screen
  waits for.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { BASE } from '$lib/at.ts';
  import { keepFieldInView, onPhone, startupImages, watchThemeColor } from './device.ts';
  import EdgeBack from './EdgeBack.svelte';
  import PhoneHints from './PhoneHints.svelte';

  let { waiting = 0, path = '', host }: { waiting?: number; path?: string; host?: 'cloud' | 'self-host' | undefined } = $props();

  onMount(() => {
    startupImages(`${location.origin}${BASE}`);
    const stop = [watchThemeColor(), onPhone() ? keepFieldInView() : () => {}];
    return () => stop.forEach((f) => f());
  });
</script>

<EdgeBack />
<PhoneHints {waiting} {path} {host} />
