<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  /**
   * /download: BrainDog for Mac. The link is /desktop/BrainDog.dmg, which `static/_redirects` sends to the R2 bucket the
   * release publishes to (`tools/desktop/release.mjs --publish`); the update feed beside it is /desktop/latest.json.
   * Held until a notarised build is published there (`HELD` in `launch.ts`).
   *
   * THE APPS ARE COMING, NOT OUT (2 November): the iPhone and Mac apps are paused, so the page says they are coming and
   * names no date. The download link comes back only once a notarised build is published (`DESKTOP_NOTARIZED`).
   */
  import { site } from '$lib/copy.ts';
  import { DESKTOP_NOTARIZED } from '$lib/desktop.ts';
  import { APP } from '$lib/links.ts';
  import PageHead from '$lib/site/PageHead.svelte';
</script>

<Seo title={site.meta.download.title} description={site.meta.download.description} path="/download" />
<PageHead title="BrainDog for iPhone and Mac" lead="The apps are coming: a notification the moment something needs you, and sharing into BrainDog from any app. Until then, BrainDog works in any browser, on your phone too." />

<section class="wrap">
  {#if DESKTOP_NOTARIZED}
    <p><a href="/desktop/BrainDog.dmg">Download for Mac</a></p>
    <p>Needs macOS 12 or later, on Apple silicon or Intel. It updates itself.</p>
  {:else}
    <p>Open <a href={APP}>app.brain.dog</a> in any browser and sign in.</p>
  {/if}
</section>
