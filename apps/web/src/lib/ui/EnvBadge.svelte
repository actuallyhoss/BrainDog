<!--
  The word that says which deployment this is.

  13 section 2.3 rule 1: colour never carries meaning alone. The environment palette
  (`packages/theme/src/environment.ts`) is measured to be 29 delta-E from the production accent to
  the worst dichromat, which is a long way - and it is still a colour, and about one reader in
  twelve of them would be sorting two windows by a difference they cannot see. So the deployment is
  also a word, permanently, in the one place both the rail and the phone's header draw.

  NOT A BANNER AND NOT DISMISSIBLE. A banner is a thing people close, and the moment it is closed
  the two windows are identical again - which is the failure, arriving later and with more
  confidence. This is four characters beside the mark, it is in the DOM on every screen that has
  chrome, and there is no control anywhere that removes it.

  AND NOT PAINTED IN THE ACCENT. The accent is already saying "alpha" to everybody who can see it;
  a second copy of that signal in the same channel adds nothing and costs the badge its legibility.
  It is `dim` ink inside an `edge` boundary - a label, which is what it is.

  IT IS ALSO IN THE TAB TITLE, and that is not redundancy. This element is only drawn where there is
  chrome to draw it in: `/start` and `/s/<token>` carry no shell at all (50 section 5.13 step 6), and
  a browser tab is read while looking at something else. `title.ts` carries the other half.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { ENV, named } from '$lib/env.ts';

  /* A LOOKUP RATHER THAN A SENTENCE BUILT BY CONCATENATION, because 50 section 4.5 step 2 says a
     label built out of an expression contributes nothing to the screenshot allow-list and blurs
     under `data-shot`. The deployment's name is the one word on the screen that must stay legible
     in a screenshot: a screenshot of alpha filed as evidence about production is the same
     confusion the badge exists to prevent, one artefact along. */
  const LABEL: Record<string, string> = { alpha: copy.alpha };
</script>

{#if named}
  <span class="env">{LABEL[ENV]}</span>
{/if}

<style>
  /**
   * `--dim` and `--edge`, both proved against every surface by checks A and D - so the badge is
   * legible on the rail, on a panel and on a raised card without knowing which one it is sitting on.
   * `--t-xs` is 12px, which is above the 24px floor `faint` would have needed and well inside what
   * `dim` is solved for.
   */
  .env {
    display: inline-block;
    padding-block: 1px;
    padding-inline: var(--sp-2);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }
</style>
