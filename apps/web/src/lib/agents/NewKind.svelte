<!--
  The "New kind" form: a job kind written in plain fields and filed for Needs you.

  ONE FIELD A ROW, IN THE ORDER A PERSON THINKS IT: what it is called, what to do (with the words a run fills in under
  it), where, with which tools, for how long, and how it may ask. The record's tools and the file tools are pickers, so
  nobody has to know a tool's name; commands are typed one a line.

  THE KERNEL'S CHECK, DRAWN WHERE IT IS ABOUT. `kindFaultAt` runs the record's own `jobBody` on the body, and after the
  first press its sentence sits under the field it names. Nothing is sent while there is one.

  ONE SENTENCE AND THREE WAYS TO START (24 October): what it is called, what to do, and how far it may go, picked
  from three presets in one column 720px wide; every tool, command and limit is under More, filled in by the preset and
  still changeable. ONE PRIMARY AT THE END, "Save as a job", AND IT ONLY FILES. A kind is approved once by the owner in Needs you, so the press opens
  that question and the line after it links there; it is not offered twice.
-->
<script lang="ts">
  import '$lib/ui/forms.css';
  import { page } from '$app/state';
  import { TONES } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { AGENTS_PAGE } from '$lib/nav/rail.ts';
  import { AGENTS, FILE_TOOLS, PERMISSIONS, PRESETS, RECORD_TOOLS, TURNS_MOST, blankKind, fileKind, kindFaultAt, presetOf, recordToolWords, slotParts, slotsOf, withPreset, words, writesOf, type KindDraft } from './new-kind.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';

  /* THE FIRST WAY TO START IS PICKED, so a kind written with no choice made still reads and tells, changing nothing. */
  let draft = $state<KindDraft>(withPreset(blankKind(), PRESETS[0]!));
  const picked = $derived(presetOf(draft));
  /* MORE OPENS BY ITSELF where the record's check is about a field under it, so a fault is never folded away. */
  const UNDER_MORE = ['repo', 'commands', 'turns', 'permission', 'writes', 'agent'];
  let pressed = $state(false);
  let sending = $state(false);
  let refusal = $state('');
  /* FILED ONCE: the question it opened, or `''` when the record answered none. */
  let filed = $state<string | null>(null);

  const fault = $derived(kindFaultAt(draft));
  const faultAt = (field: string): string | null => (pressed && fault !== null && fault.at === field ? fault.fix : null);
  const forced = $derived(draft.permission === 'acceptEdits');

  /** The fields that carry a help line a sentence can be drawn in. */
  const SHOWN = ['title', 'prompt', 'repo', 'commands', 'turns', 'permission', 'writes', 'agent'];

  const toggle = (list: readonly string[], one: string): string[] => (list.includes(one) ? list.filter((t) => t !== one) : [...list, one]);

  function retype(prompt: string) {
    draft.prompt = prompt;
    draft.args = slotsOf(prompt, draft.args);
  }

  function relabel(id: string, label: string) {
    draft.args = draft.args.map((a) => (a.id === id ? { ...a, label } : a));
  }

  async function send() {
    pressed = true;
    refusal = '';
    /* A sentence about a field the form has no line for is said where the press is, so it is never silent. */
    if (fault !== null) {
      if (!SHOWN.includes(fault.at)) refusal = fault.fix;
      return;
    }
    sending = true;
    /* A PLAIN COPY BY HAND, NOT `$state.snapshot`: this form was its only caller, and the clone it brings sits in the
       Svelte chunk every screen loads, which put the entry script over its debt. */
    const out = await fileKind(apiBase(page.url), { ...draft, args: draft.args.map((a) => ({ ...a })), tools: [...draft.tools] });
    sending = false;
    if (out.kind === 'refused') refusal = out.fix;
    else filed = out.question ?? '';
  }
</script>

{#snippet slotted(text: string)}{#each slotParts(text) as part, i (i)}{#if part.slot}<code class="code">{part.text}</code>{:else}{part.text}{/if}{/each}{/snippet}

{#snippet help(id: string, field: string, said: string)}
  {#if (faultAt(field) ?? said) !== ''}<p class="help" id={id} class:wrong={faultAt(field) !== null}>{@render slotted(faultAt(field) ?? said)}</p>{/if}
{/snippet}

<div class="form">
  <!-- NO TITLE ON THE TILE: the page's own heading is "New kind", one line over it. -->
  <Tile class="section" data-surface="tile">
    <div class="section-body">
      <!-- ONE COLUMN, 720PX AT MOST (24 October): what it is, how far it may go, and the rest under More. -->
      <div class="fields">
        <div class="column">
        <div class="item">
          <label class="label" for="kind-title">{words.title}</label>
          <div class="field" data-wrong={faultAt('title') ? '' : undefined}>
            <input id="kind-title" class="field-input" type="text" autocomplete="off" maxlength="120" aria-describedby="kind-title-help" aria-invalid={faultAt('title') ? 'true' : undefined} bind:value={draft.title} />
          </div>
          {@render help('kind-title-help', 'title', '')}
        </div>

        <div class="item">
          <label class="label" for="kind-prompt">{words.prompt}</label>
          <textarea
            id="kind-prompt"
            class="lines"
            rows="6"
            aria-describedby="kind-prompt-help"
            aria-invalid={faultAt('prompt') ? 'true' : undefined}
            data-wrong={faultAt('prompt') ? '' : undefined}
            value={draft.prompt}
            oninput={(e) => retype(e.currentTarget.value)}
          ></textarea>
          {@render help('kind-prompt-help', 'prompt', words.promptHelp)}
          {#if draft.args.length > 0}
            <p class="sub">{words.slots}</p>
            {#each draft.args as a (a.id)}
              <label class="sub" for={`kind-slot-${a.id}`}>{@render slotted(words.slotLabel(a.id))}</label>
              <div class="field">
                <input id={`kind-slot-${a.id}`} class="field-input" type="text" autocomplete="off" maxlength="40" value={a.label} oninput={(e) => relabel(a.id, e.currentTarget.value)} />
              </div>
            {/each}
          {/if}
        </div>

        <fieldset class="item">
          <legend class="label">{words.presets}</legend>
          <div class="presets">
            {#each PRESETS as p (p.id)}
              <label class="preset" data-on={picked === p.id ? '' : undefined}>
                <input type="radio" name="kind-preset" value={p.id} checked={picked === p.id} onchange={() => (draft = withPreset(draft, p))} />
                <span class="preset-words"><span class="preset-name">{p.label}</span><span class="preset-said">{p.said}</span></span>
              </label>
            {/each}
          </div>
        </fieldset>

        <details class="more" open={pressed && fault !== null && UNDER_MORE.includes(fault.at) ? true : undefined}>
        <summary class="label more-head"><Icon name="chevron" size="s" />{words.more}</summary>
        <div class="column">
        <div class="item">
          <label class="label" for="kind-repo">{words.repo}</label>
          <div class="field" data-wrong={faultAt('repo') ? '' : undefined}>
            <input id="kind-repo" class="field-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="kind-repo-help" bind:value={draft.repo} />
          </div>
          {@render help('kind-repo-help', 'repo', words.repoHelp)}
        </div>

        <fieldset class="item">
          <legend class="label">{words.recordTools}</legend>
          <div class="picks form-checks">
            {#each RECORD_TOOLS as t (t)}
              <label class="pick"><input type="checkbox" checked={draft.tools.includes(t)} onchange={() => (draft.tools = toggle(draft.tools, t))} />{recordToolWords(t)}</label>
            {/each}
          </div>
        </fieldset>

        <fieldset class="item">
          <legend class="label">{words.fileTools}</legend>
          <div class="picks form-checks">
            {#each FILE_TOOLS as t (t)}
              <label class="pick"><input type="checkbox" checked={draft.tools.includes(t)} onchange={() => (draft.tools = toggle(draft.tools, t))} />{words.toolFile[t] ?? t}</label>
            {/each}
          </div>
        </fieldset>

        <div class="item">
          <label class="label" for="kind-commands">{words.commands}</label>
          <textarea id="kind-commands" class="lines code" rows="3" spellcheck="false" autocapitalize="off" aria-describedby="kind-commands-help" data-wrong={faultAt('commands') ? '' : undefined} bind:value={draft.commands}></textarea>
          {@render help('kind-commands-help', 'commands', words.commandsHelp)}
        </div>

        <div class="item">
          <label class="label" for="kind-turns">{words.turns}</label>
          <div class="field form-number" data-wrong={faultAt('turns') ? '' : undefined}>
            <input id="kind-turns" class="field-input" type="number" min="1" max={TURNS_MOST} step="1" inputmode="numeric" aria-describedby="kind-turns-help" value={draft.turns} oninput={(e) => (draft.turns = Number(e.currentTarget.value))} />
          </div>
          {@render help('kind-turns-help', 'turns', words.turnsHelp)}
        </div>

        <fieldset class="item" aria-describedby="kind-agent-help">
          <legend class="label">{words.agent}</legend>
          <div class="picks form-checks">
            {#each AGENTS as a (a)}
              <label class="pick"><input type="radio" name="kind-agent" value={a} checked={draft.agent === a} onchange={() => (draft.agent = a)} />{a === 'codex' ? words.codex : words.claude}</label>
            {/each}
          </div>
          {@render help('kind-agent-help', 'agent', words.agentHelp)}
        </fieldset>

        <!-- TWO CHOICES, AND ONLY THE KERNEL'S. A skipped permission is not among them, so it cannot be picked. -->
        <fieldset class="item" aria-describedby="kind-permission-help">
          <legend class="label">{words.permission}</legend>
          <div class="picks form-checks">
            {#each PERMISSIONS as p (p)}
              <label class="pick"><input type="radio" name="kind-permission" value={p} checked={draft.permission === p} onchange={() => (draft.permission = p)} />{p === 'acceptEdits' ? words.acceptEdits : words.dontAsk}</label>
            {/each}
          </div>
          {@render help('kind-permission-help', 'permission', forced ? words.acceptEditsHelp : words.dontAskHelp)}
        </fieldset>

        <div class="item">
          <label class="pick">
            <input type="checkbox" aria-describedby="kind-writes-help" checked={writesOf(draft)} disabled={forced} onchange={(e) => (draft.writes = e.currentTarget.checked)} />{words.writes}
          </label>
          {@render help('kind-writes-help', 'writes', forced ? words.writesForced : words.writesHelp)}
        </div>
        </div>
        </details>
        </div>
      </div>

      {#if refusal}<p class="said" data-intent="bad" role="alert"><span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>{/if}
      {#if filed !== null}
        <p class="said" role="status">
          {#if filed !== ''}<a class="link" href={at(`/decide/${filed}`)}>{words.sent}</a>{:else}{words.sent}.{/if}
          {words.sentLine}
        </p>
      {/if}

      <!-- AT THE TILE'S FOOT, ON THE START EDGE, never loose on the board under it. -->
      <div class="do form-submit">
        <Button weight="primary" disabled={sending || filed !== null} onclick={() => void send()}>{sending ? words.busy : words.send}</Button>
        <Button weight="quiet" href={at(AGENTS_PAGE)}>{words.cancel}</Button>
      </div>
    </div>
  </Tile>
</div>

<style>
  .form {
    display: grid;
    gap: var(--sp-6);
    min-inline-size: 0;
    max-inline-size: 1080px;
  }

  /* THE THREE WAYS TO START: one a row, its name and what it does, the picked one on the tile's ink edge. */
  .presets {
    display: grid;
    gap: var(--sp-2);
  }

  .preset {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-pop);
    cursor: pointer;
  }

  .preset[data-on] {
    outline: 1.5px solid var(--ink);
    outline-offset: -1.5px;
  }

  .preset input {
    margin-block-start: 3px;
  }

  .preset-words {
    display: grid;
    gap: 2px;
  }

  .preset-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .preset-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .more-head {
    cursor: pointer;
    min-block-size: var(--ctl-h);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    list-style: none;
  }

  .more > .column {
    margin-block-start: var(--sp-3);
  }

  .fields {
    gap: var(--sp-5);
  }

  .column {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .item {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  /* THE LABEL SITS ABOVE ITS FIELD in the meta size and the second ink. */
  .label {
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .sub {
    margin: 0;
    margin-block-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .help {
    margin: 0;
    margin-block-start: calc(var(--sp-1) - var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .help.wrong {
    color: var(--red);
  }

  /* A FIELD WITH A FAULT IN IT: a red edge drawn inside it, since a field has no border to colour. */
  .field[data-wrong],
  .lines[data-wrong] {
    box-shadow: inset 0 0 0 1.5px var(--red);
  }

  /* A FIELD IS THE INNER FILL WITH NO BORDER, as on every other form. */
  .lines {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
    /* IT GROWS WITH WHAT IS TYPED, SO NO GRIP (G30): where field-sizing is not known, the grip stays as it was. */
    resize: vertical;
  }

  @supports (field-sizing: content) {
    .lines {
      field-sizing: content;
      min-block-size: calc(3lh + 2 * var(--sp-2));
      resize: none;
    }

    #kind-prompt {
      min-block-size: calc(6lh + 2 * var(--sp-2));
    }
  }

  .code {
    font-family: var(--font-mono);
  }

  .lines:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink-2);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .pick:has(input:disabled) {
    cursor: default;
  }

  .said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .said[data-intent] {
    color: var(--tone);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }

  .link {
    margin-inline-end: var(--sp-1);
    color: var(--red);
  }


  /* A COARSE POINTER GETS 44PX: each pick and the link to Decide. */
  @media (pointer: coarse) {
    .pick {
      min-block-size: var(--tap);
      font-size: var(--fs-body);
    }

    .link {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  /* A PHONE'S PRESS IS FULL WIDTH. */
  @media (width < 640px) {
    .do {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
