<!--
  A product screenshot, in the reader's own scheme.

  TWO FILES AND A `<picture>`, not one image and a CSS filter. The app generates a light palette and
  a dark one from the same seed and they are not each other inverted — the dark surfaces are warm
  charcoal, the light ones cream, and the intents are solved separately against each ground. A single
  screenshot with `filter: invert()` over it would be a picture of a product that does not exist.

  `loading="lazy"` on everything below the hero, and `width`/`height` on all of them: a marketing
  page that reflows as its screenshots arrive is a page that moves the sentence you were reading.

  AND FOUR FILES, BECAUSE A LAPTOP SCREENSHOT ON A PHONE IS A GREY TEXTURE.

  These were 2880 by 1800, and the box they land in on a phone is 358px wide. Twelve per cent.
  The app's 15px body renders at 1.9 pixels, its labels at 1.5, and every figure, row and heading
  the page is pointing at is below the size at which a pixel exists. Six of the nine sections of
  the home page are built around "look at this screen", and on a phone none of them showed one.

  So there is a narrow capture too, taken at 390 by 844, which lands in that same 358px box at
  ninety-two per cent. The type is the size the type is.

  THE ORDER OF THE `<source>` ELEMENTS IS THE WHOLE MECHANISM. A `<picture>` takes the first one
  whose `media` matches, so the two narrow entries have to come before the two wide ones or the
  scheme match wins and the width is never consulted. Both conditions live in one query for the
  same reason: `<source>` has no way to say "and".

  `phone` IS OPTIONAL. `arrange` is a state rather than a route and its setup presses a control a
  narrow window puts somewhere else, so that one shot has no narrow capture and falls back to the
  wide one, which is the behaviour a missing `<source>` gives for free.
-->
<script lang="ts">
  let {
    name,
    alt,
    caption,
    eager = false,
    phone = true,
  }: { name: string; alt: string; caption?: string; eager?: boolean; phone?: boolean } = $props();
</script>

<figure class="shot">
  <div class="frame" class:tall={phone}>
    <picture>
      {#if phone}
        <source srcset="/shots/{name}-phone-dark.png" media="(width < 640px) and (prefers-color-scheme: dark)" />
        <source srcset="/shots/{name}-phone-light.png" media="(width < 640px)" />
      {/if}
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

  /**
   * THE BOX IS RESERVED FOR THE PICTURE THAT WILL ARRIVE, AND THE TWO ARE DIFFERENT SHAPES.
   *
   * `width` and `height` on the `<img>` are the wide capture's 16:10, which is what stops the page
   * reflowing while it loads. A `<picture>` that swaps in a 390 by 844 source keeps those
   * attributes, so on a phone the browser reserves a 16:10 box and then draws a 1:2.16 image into
   * a container that has to grow: the reflow the attributes exist to prevent, on the one device
   * where a page moving under a thumb is worst.
   *
   * `aspect-ratio` on the frame at the same query the source swaps at, so the space is right
   * before the bytes arrive. `.tall` and not a bare rule, because the one shot with no narrow
   * capture still gets the wide image here and must keep the wide box.
   */
  @media (width < 640px) {
    .frame.tall {
      aspect-ratio: 390 / 844;
    }

    .frame.tall img {
      block-size: 100%;
      object-fit: cover;
      object-position: top center;
    }
  }

  figcaption {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }
</style>
