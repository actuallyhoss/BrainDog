<!--
  The fourth colour notation, and the plainest of the four.

  The gate knew hex, `rgb()` and `oklch()`. `color: red` is how somebody writes a colour when they
  are not thinking about the theme, which is exactly the population this gate exists for — and it
  went straight through. Two real scrims in this repository were `color-mix(in srgb, black …)` and
  neither had ever been seen.
-->
<div class="seeded">x</div>

<style>
  .seeded {
    color: red;
  }

  /* AND A NAME THAT IS ALSO A WORD MUST NOT REPORT. `tan`, `linen`, `plum` and `gold` are CSS
     colour names and ordinary English, so the rule is the PROPERTY plus the name — a register
     called `linen` and a comment about gold are not colours. Neither of these two lines is a
     finding, and a gate that reported them would be switched off. */
  .fine::after {
    content: 'gold';
  }

  .also-fine {
    grid-template-areas: 'tan plum';
  }
</style>
