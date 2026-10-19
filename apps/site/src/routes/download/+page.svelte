<script lang="ts">
  /**
   * /download: BrainDog for Mac. The link is the signed DMG the build publishes at /desktop/BrainDog.dmg; the update
   * feed beside it is /desktop/latest.json (apps/desktop). Held until a signed build exists (`HELD` in `launch.ts`).
   */
  import { site } from '$lib/copy.ts';
  import PageHead from '$lib/site/PageHead.svelte';
</script>

<svelte:head>
  <title>{site.meta.download.title}</title>
  <meta name="description" content={site.meta.download.description} />
  <link rel="canonical" href="https://brain.dog/download" />
</svelte:head>

<PageHead title="BrainDog for Mac" lead="The same record in its own window. Press Option and Space anywhere to ask Slash." />

<section class="wrap">
  <p><a href="/desktop/BrainDog.dmg">Download for Mac</a></p>
  <p>Needs macOS 12 or later, on Apple silicon or Intel. It updates itself.</p>
</section>
