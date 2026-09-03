<!--
  A product screenshot, in the reader's own scheme.

  TWO FILES AND A `<picture>`, not one image and a CSS filter. The app generates a light palette and
  a dark one from the same seed and they are not each other inverted — the dark surfaces are warm
  charcoal, the light ones cream, and the intents are solved separately against each ground. A single
  screenshot with `filter: invert()` over it would be a picture of a product that does not exist.

  `loading="lazy"` on everything below the hero, and `width`/`height` on all of them: a marketing
  page that reflows as its screenshots arrive is a page that moves the sentence you were reading.
-->
<script lang="ts">
  let {
    name,
    alt,
    caption,
    eager = false,
  }: { name: string; alt: string; caption?: string; eager?: boolean } = $props();
</script>

<figure class="shot">
  <div class="frame">
    <picture>
      <source srcset="/shots/{name}-dark.png" media="(prefers-color-scheme: dark)" />
      <img
        src="/shots/{name}-light.png"
        {alt}
        width="2880"
        height="1800"
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  </div>
  {#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
  .shot {
    margin: 0;
    min-inline-size: 0;
  }

  /* A border and a radius, and no device frame. A laptop bezel drawn around a screenshot is a
     hundred pixels spent on a picture of hardware nobody is buying, and it dates the page to the
     year the bezel was fashionable. */
  .frame {
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--bg);
  }

  img {
    display: block;
    inline-size: 100%;
    block-size: auto;
  }

  figcaption {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }
</style>
