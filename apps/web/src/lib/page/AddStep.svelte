<!--
  "Add a step" under a path: one line, the step's title, written as a row of the path's list (`addStep` in
  `page-writes.ts`), and the path read again so the new stone is drawn at its foot.

  THE CAPTURE'S LINE AND NOT A SECOND ONE. The same box, border, height and Add inside its edge that a `capture` block
  draws (`blocks.css`, "capture: the one-line add"), so a person who has added a row anywhere recognises this one, and
  its Add is 44px on a touch screen by the same rule.

  THE FIELD EMPTIES ONLY WHEN THE STEP WAS WRITTEN. A refusal is said in a toast by the write, and the words stay in the
  box to be fixed and sent again rather than typed a second time. A second press while the first is in flight sends
  nothing, so one line is never two steps.

  DRAWN ONLY WHERE THE PAGE CAN WRITE: the host mounts it under a path only with a `Writes` whose `stepable` says yes.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import type { Writes } from './page-writes.ts';

  let { block, writes }: { block: LiveBlock; writes: Writes } = $props();

  let typed = $state('');
  let sending = $state(false);
  const ready = $derived(typed.trim() !== '' && !sending);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!ready) return;
    sending = true;
    try {
      if (await writes.addStep(block, typed)) typed = '';
    } finally {
      sending = false;
    }
  }
</script>

<form class="capture" onsubmit={submit}>
  <span class="capture-field">
    <input
      class="capture-input"
      type="text"
      name="step"
      autocomplete="off"
      enterkeyhint="done"
      placeholder={copy.pathStepNew}
      aria-label={copy.pathStepAdd}
      bind:value={typed}
    />
    {#if ready}<button type="submit" class="capture-add">{copy.pathStepAdd}</button>{/if}
  </span>
</form>
