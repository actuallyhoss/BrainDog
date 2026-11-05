<!--
  What he told agents, as threads (agents and MCP plan §2.3, §7.1): what he said and to whom, how far it got as a bar of
  four stretches (Sent, Seen, Working, Done) in the agent's own colour, the trail in words ("Seen by Claude at 21:02, on
  its next prompt"), the agent's reply in its words, and what its run changed while it held it, by name, with Undo all.

  RED IS NEEDS YOU AND NOTHING ELSE (the UI pass): a reply marked Needs you says so in red, its last stretch red, and it
  is the one thread a person has to act on. A thread that went nowhere (declined, expired, taken back) draws its bar in
  the rule and its word quiet. Everything else is the agent's hue and ink.

  TAKE BACK IS THE ROW'S OWN UNDO while no run has taken it (§2.1's six seconds and after): the record withdraws it, and
  the thread says Taken back. Once a run took it, the way back is the receipts' Undo all, which puts back what the run
  changed, batch by batch, and says what it did.

  IT READS NOTHING. The host orders the threads (open and Needs you first, then done) and words each one
  (`ThreadView`); a press hands its `key` back.
-->
<script lang="ts">
  import { agentMarkFill } from '../src/index.ts';
  import type { ControlMark, ThreadView } from './types.ts';

  let {
    threads,
    mark,
    more = 0,
    ontakeback,
    onclose,
    onundo,
    onmore,
  }: {
    threads: readonly ThreadView[];
    mark?: ((agent: string) => ControlMark | null) | undefined;
    /** How many older threads are not drawn. */
    more?: number;
    ontakeback?: ((key: string) => void) | undefined;
    onclose?: ((key: string) => void) | undefined;
    onundo?: ((key: string) => void) | undefined;
    onmore?: (() => void) | undefined;
  } = $props();

  const STEPS = ['Sent', 'Seen', 'Working', 'Done'] as const;
  const hue = (agent: string | null): string => (agent && /^[a-z]+$/u.test(agent) ? `--told-c:var(--agent-${agent}, var(--ink))` : '--told-c:var(--ink)');
</script>

{#if threads.length > 0}
  <ol class="told" aria-label="What you told agents">
    {#each threads as t (t.key)}
      {@const m = t.agent && mark ? mark(t.agent) : null}
      <li class="told-item" data-tone={t.tone} data-sending={t.sending ? '' : undefined} aria-busy={t.sending || t.busy ? 'true' : undefined} style={hue(t.agent)}>
        <div class="told-top">
          <p class="told-said">{t.said}</p>
          <p class="told-to">
            {#if m}<svg class="told-mark agent-mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={agentMarkFill(m.tone) ?? undefined}
                ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
              >{/if}{t.to}
          </p>
        </div>
        <div class="told-state">
          <span class="told-bar" role="img" aria-label={t.word}>
            {#each t.steps as s, n (n)}<span class="told-step" data-step={s} title={STEPS[n]}></span>{/each}
          </span>
          <span class="told-word">{t.word}</span>
        </div>
        {#if t.trail}<p class="told-trail">{t.trail}</p>{/if}
        {#if t.reply}
          <figure class="told-reply">
            <blockquote class="told-quote"><p>{t.reply.text}</p></blockquote>
            <figcaption class="told-by">{t.reply.by}</figcaption>
          </figure>
        {/if}
        {#if t.receipts}
          {@const r = t.receipts}
          <div class="told-did">
            <p class="told-did-said">
              <span class="told-did-n">{r.said}</span>{#if r.names.length > 0}: {r.names.join(', ')}{/if}{#if r.more}{' '}{r.more}{/if}{#if r.commits}<span class="told-sep">{' · '}</span>{r.commits}{/if}
            </p>
            {#if r.undone}<p class="told-undone" role="status">{r.undone}</p>{:else if r.undo && onundo}<button type="button" class="told-btn" disabled={t.busy} onclick={() => onundo(t.key)}>Undo all</button>{/if}
          </div>
        {/if}
        {#if t.takeBack && ontakeback}
          <div class="told-do"><button type="button" class="told-btn" disabled={t.busy || t.sending} onclick={() => ontakeback(t.key)}>Take back</button></div>
        {:else if t.close && onclose}
          <div class="told-do"><button type="button" class="told-btn" disabled={t.busy || t.sending} onclick={() => onclose(t.key)}>Close</button></div>
        {/if}
      </li>
    {/each}
  </ol>
  {#if more > 0 && onmore}<button type="button" class="told-more" onclick={onmore}>Show {more} earlier</button>{/if}
{/if}
