<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  /**
   * /download: BrainDog for Mac. The link is /desktop/BrainDog.dmg, which `static/_redirects` sends to the R2 bucket the
   * release publishes to (`tools/desktop/release.mjs --publish`); the update feed beside it is /desktop/latest.json.
   * Held until a notarised build is published there (`HELD` in `launch.ts`).
   */
  import { site } from '$lib/copy.ts';
  import PageHead from '$lib/site/PageHead.svelte';
</script>

<Seo title={site.meta.download.title} description={site.meta.download.description} path="/download" />
<PageHead title="BrainDog for Mac" lead="The same BrainDog in its own window. Press Option and Space anywhere to ask Slash." />

<section class="wrap">
  <p><a href="/desktop/BrainDog.dmg">Download for Mac</a></p>
  <p>Needs macOS 12 or later, on Apple silicon or Intel. It updates itself.</p>
</section>
