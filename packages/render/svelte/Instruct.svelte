<!--
  The composer of the Agents page (agents and MCP plan §2.1, §7.1): one field, "Tell an agent", and under it one line of
  choices said as words: To, On and When, then Send, then what happens once it is sent, in a sentence.

  IT READS NOTHING. The host works out who can be reached, where, and what each choice means (`InstructView`, worded by
  `apps/web/src/lib/record/instruct.ts`), and hears each choice and the send back by its key. So the sentence under the
  field is the host's to change the moment a choice changes, and the composer never claims a run is live on its own.

  ENTER SENDS, SHIFT AND ENTER IS A NEW LINE, as a message box does. SEND IS NEVER GREYED FOR AN EMPTY FIELD: the host
  hears the press and says why under the field (the UI pass, 2.A.1), which a disabled button never could.

  THE CHOICES ARE THE PLATFORM'S OWN SELECT, with the app's chevron, drawn as a chip (radius 8, never a pill): on a phone
  it opens the system's picker, and a screen reader hears "To, Whoever's next". "When" is two choices only while both are true ("Now" needs a
  matching run that is live); otherwise it is the one word it is, with nothing to press. "On" is words, not a control,
  while the choice is a run, which is on its own project.

  "MACHINE" AND "PROFILE" are drawn only when the host offers them: where his runs are on two machines or more, or
  under two Claude Code profiles or more, and never for a named run.

  ONE LINE WHERE THE HOST ASKS (`line`, the Agents page's lead): the field, "To" and Send on one row, and the rest of the
  choices with what happens next only once he has started, by focus or by words, so the page opens on one line and not
  on a form.
-->
<script lang="ts">
  import { agentMarkFill } from '../src/index.ts';
  import type { ControlMark, InstructView } from './types.ts';

  let {
    view,
    said = $bindable(''),
    mark,
    onto,
    onon,
    onwhen,
    onmachine,
    onseat,
    onsend,
    line = false,
  }: {
    view: InstructView;
    /** What he typed, held by the host so a draft survives the page reading itself again. */
    said?: string;
    /** An agent kind's maker mark, or nothing for one without (the host's `agentMark`). */
    mark?: ((agent: string) => ControlMark | null) | undefined;
    onto: (key: string) => void;
    onon: (key: string) => void;
    onwhen: (when: 'now' | 'next') => void;
    /** A machine chosen, by name, `''` for any. */
    onmachine?: ((key: string) => void) | undefined;
    /** A profile chosen, by name, `''` for any. */
    onseat?: ((key: string) => void) | undefined;
    onsend: () => void;
    /** The field, To and Send on one row; the other choices once he has started. */
    line?: boolean;
  } = $props();

  const uid = $props.id();
  const WHEN: Record<'now' | 'next', string> = { now: 'Now', next: 'Next start' };

  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  /* WHETHER HE HAS STARTED: the field or a choice holds the focus, or there are words in it, or a fault to read. */
  let within = $state(false);
  const started = $derived(!line || within || said.trim() !== '' || view.fault !== null || view.busy);

  /** Puts the caret in the field, for a run row's Tell. */
  export function focus(): void {
    field?.focus();
  }

  const shown = $derived(view.agent && mark ? mark(view.agent) : null);
  const onLabel = $derived(view.on.find((c) => c.key === view.onKey)?.label ?? '');

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!view.busy) onsend();
    }
  }
</script>

{#snippet toPick()}
  <label class="ins-pick">
    {#if shown}<svg class="ins-mark agent-mark" data-tone={shown.tone} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={agentMarkFill(shown.tone) ?? undefined}
        ><path d={shown.d} fill-rule={shown.rule} clip-rule={shown.rule}></path></svg
      >{/if}<span class="ins-key">To</span>
    <select class="ins-select" value={view.toKey} onchange={(e) => onto(e.currentTarget.value)}>
      {#each view.to as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet send()}
  <button class="ins-send" type="submit" aria-busy={view.busy ? 'true' : undefined}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span>{view.busy ? 'On its way' : 'Send'}</span>
  </button>
{/snippet}

{#snippet rest()}
  {#if view.onFixed}
    <span class="ins-pick" data-fixed=""><span class="ins-key">On</span><span class="ins-value">{onLabel}</span></span>
  {:else}
    <label class="ins-pick">
      <span class="ins-key">On</span>
      <select class="ins-select" value={view.onKey} onchange={(e) => onon(e.currentTarget.value)}>
        {#each view.on as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
      </select>
    </label>
  {/if}
  {#if view.machine}
    <label class="ins-pick">
      <span class="ins-key">Machine</span>
      <select class="ins-select" value={view.machineKey ?? ''} onchange={(e) => onmachine?.(e.currentTarget.value)}>
        {#each view.machine as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
      </select>
    </label>
  {/if}
  {#if view.seat}
    <label class="ins-pick">
      <span class="ins-key">Profile</span>
      <select class="ins-select" value={view.seatKey ?? ''} onchange={(e) => onseat?.(e.currentTarget.value)}>
        {#each view.seat as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
      </select>
    </label>
  {/if}
  {#if view.when.length > 1}
    <div class="ins-when" role="radiogroup" aria-label="When">
      {#each view.when as w (w)}
        <button type="button" class="ins-when-one" role="radio" aria-checked={w === view.whenKey} onclick={() => onwhen(w)}>{WHEN[w]}</button>
      {/each}
    </div>
  {:else}
    <span class="ins-pick" data-fixed=""><span class="ins-key">When</span><span class="ins-value">{WHEN[view.whenKey]}</span></span>
  {/if}
{/snippet}

<form
  class="ins"
  data-line={line ? '' : undefined}
  aria-label="Tell an agent"
  onsubmit={(e) => (e.preventDefault(), view.busy || onsend())}
  onfocusin={() => (within = true)}
  onfocusout={(e) => (within = e.currentTarget.contains(e.relatedTarget as Node | null))}
>
  <label class="ins-field" for="{uid}-said"><span class="ins-hide">What to tell it</span></label>
  {#if line}
    <div class="ins-line">
      <textarea
        bind:this={field}
        bind:value={said}
        id="{uid}-said"
        class="ins-said"
        rows="1"
        maxlength="2000"
        enterkeyhint="send"
        autocomplete="off"
        placeholder="Tell an agent what to do…"
        aria-describedby="{uid}-next"
        aria-invalid={view.fault ? 'true' : undefined}
        onkeydown={keydown}
      ></textarea>
      {@render toPick()}
      {@render send()}
    </div>
    {#if started}<div class="ins-picks">{@render rest()}</div>{/if}
  {:else}
    <textarea
      bind:this={field}
      bind:value={said}
      id="{uid}-said"
      class="ins-said"
      rows="2"
      maxlength="2000"
      enterkeyhint="send"
      autocomplete="off"
      placeholder="Tell an agent what to do…"
      aria-describedby="{uid}-next"
      aria-invalid={view.fault ? 'true' : undefined}
      onkeydown={keydown}
    ></textarea>
    <div class="ins-bar">
      <div class="ins-picks">
        {@render toPick()}
        {@render rest()}
      </div>
      {@render send()}
    </div>
  {/if}
  {#if view.fault}<p class="ins-fault" role="alert">{view.fault}</p>{/if}
  <p class="ins-next" id="{uid}-next" hidden={!started}>{view.next}</p>
</form>
