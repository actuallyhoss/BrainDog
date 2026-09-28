<!--
  Slash's mark at the head of its own screen: the stroke its face carries everywhere else, in a disc (DSN-18).

  THE SAME STROKE AS `AgentFace`'s SLASH, so the face a person meets in History and on a run is the one at the top of
  the screen where Slash explains itself. It is drawn here rather than through `AgentFace`, because that component is a
  run's face (a hue from the run, a door to it) and this screen names no run.

  DECORATION, AND HIDDEN FROM A SCREEN READER: the page's title says "Slash" beside it.
-->
<script lang="ts">
</script>

<div class="slash-mark" aria-hidden="true">
  <svg class="slash-mark-stroke" viewBox="0 0 24 24"><path d="M15.5 4.5 8.5 19.5" /></svg>
</div>

<style>
  /* A NEUTRAL DISC, in ink on the raised ground: the brand's red is kept for the product's own mark (design D-1), and
     Slash is a part of the product, not the product. */
  .slash-mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--sp-7);
    block-size: var(--sp-7);
    background: var(--s2);
    border-radius: var(--r-pill);
    color: var(--ink);
  }

  .slash-mark-stroke {
    inline-size: 55%;
    block-size: 55%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
</style>
