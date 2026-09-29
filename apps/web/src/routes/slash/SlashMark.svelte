<!--
  Slash's face on its own screen: the stroke its face carries everywhere else, in a circle.

  THE SAME STROKE AS `AgentFace`'s SLASH, so the face a person meets in History and on a run is the one that answers here.
  It is drawn here rather than through `AgentFace`, because that component is a run's face (a hue from the run, a door to
  it) and an answer on this screen names no run.

  WHERE IT IS: beside Slash's own sentence in the Ask tile, so an answer reads as somebody's, with its sources above it.
  A CIRCLE, because faces for agents are circles and Slash is one; in the tile's inner fill and ink, never the brand's red,
  since Slash is a part of the product and not the product.

  DECORATION, AND HIDDEN FROM A SCREEN READER: the answer's footer names what drew it.
-->
<script lang="ts">
</script>

<div class="slash-mark" aria-hidden="true">
  <svg class="slash-mark-stroke" viewBox="0 0 24 24"><path d="M15.5 4.5 8.5 19.5" /></svg>
</div>

<style>
  /* 28, the heading well's size, so the face sits on a sentence's first line the way a well sits on a tile's heading. */
  .slash-mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    background: var(--s1);
    border-radius: var(--r-pill);
    color: var(--ink);
  }

  .slash-mark-stroke {
    inline-size: 60%;
    block-size: 60%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: round;
  }

  @media (forced-colors: active) {
    .slash-mark {
      outline: 1px solid CanvasText;
      outline-offset: -1px;
    }
  }
</style>
