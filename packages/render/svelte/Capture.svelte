<!--
  `capture`: the one-line add (`src/capture.ts`). Drawn to the same tree as `html.ts`'s `capture`
  when the host passes no `oncapture`; `src/parity.test.ts` compiles this file and compares the two.

  THE FIELD EXISTS ONLY WHERE THE HOST CAN WRITE. With no `oncapture` this draws the list, named, and a
  door to it where the evaluator gave it an address, and nothing that takes a key: a control that
  cannot act is absent rather than greyed out (`19 §6`). A disabled input was ruled out by name,
  because it reads as a record that is broken rather than as a page that cannot write.

  THE BUTTON IS INSIDE THE FIELD'S EDGE AND APPEARS ONCE THERE IS TEXT, because
  an Add beside an empty field is a button that does nothing when pressed, and it is the same
  question `captureSubmit` answers at the press, so three spaces neither show an Add nor send a row
  with no title. Enter sends too, because it is a form, and the field empties once the host has the
  line; whether the write lands is the host's to say, beside the row it adds.
-->
<script lang="ts">
  import { CAPTURE_ADD, captureNowhere, hrefFor, capturePlan, capturePrompt, capturePromptFor, captureSubmit, inline, text as plain, type Block, type RenderOptions } from '../src/index.ts';
  import type { OnCapture } from './types.ts';

  let {
    block,
    opts = {},
    oncapture,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put the line: the register, the text as typed and trimmed, and what the new row inherits. */
    oncapture?: OnCapture | undefined;
  } = $props();

  const plan = $derived(capturePlan(block.rows, opts));
  const heading = $derived(plain(inline(block.heading ?? '', opts)).trim());
  const prompt = $derived(plan ? capturePrompt(heading, plan) : '');
  /* THE FIELD SAYS ITS OWN HEADING, so it is drawn alone: a tile reading "Add a task" over a field reading "Add a task"
     said one thing twice (visual review 4). `data-bare` tells the host's stylesheet the tile needs no heading row. */
  const bare = $derived(heading !== '' && prompt === heading);
  let typed = $state('');
  const ready = $derived(captureSubmit(plan, typed) !== null);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const sent = captureSubmit(plan, typed);
    if (!sent || !oncapture) return;
    oncapture(sent.register, sent.text, sent.inherited);
    typed = '';
  }
</script>

{#if !plan}
  <div class="capture"></div>
{:else if oncapture}
  <form class="capture" data-bare={bare ? '' : undefined} onsubmit={submit}>
    <span class="capture-field">
      <input class="capture-input" type="text" name="capture" autocomplete="off" enterkeyhint="done" placeholder={prompt} aria-label={prompt} bind:value={typed} />
      {#if ready}<button type="submit" class="capture-add">{CAPTURE_ADD}</button>{/if}
    </span>
  </form>
{:else}
  <div class="capture">
    <p class="capture-elsewhere">{#if plan.href}<a class="capture-where" href={hrefFor(opts, plan.href)}>{capturePromptFor(plan.label)}</a>{:else}{captureNowhere(plan.label)}{/if}</p>
  </div>
{/if}
