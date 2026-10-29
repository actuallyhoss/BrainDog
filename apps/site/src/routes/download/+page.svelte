<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  /**
   * /download: BrainDog for Mac. The link is the signed DMG the build publishes at /desktop/BrainDog.dmg; the update
   * feed beside it is /desktop/latest.json (apps/desktop). Held until a signed build exists (`HELD` in `launch.ts`).
   */
  import { site } from '$lib/copy.ts';
  import PageHead from '$lib/site/PageHead.svelte';
</script>

<Seo title={site.meta.download.title} description={site.meta.download.description} path="/download" />
<PageHead title="BrainDog for Mac" lead="The same record in its own window. Press Option and Space anywhere to ask Slash." />

<section class="wrap">
  <p><a href="/desktop/BrainDog.dmg">Download for Mac</a></p>
  <p>Needs macOS 12 or later, on Apple silicon or Intel. It updates itself.</p>
</section>
