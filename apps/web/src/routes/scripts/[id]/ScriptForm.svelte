<!--
  The one form both script screens draw: `/scripts/new` with an empty draft, `/scripts/<id>` with the installed one.

  THE HEADER FIRST, THEN THE SOURCE, THEN WHAT A RUN WOULD DO. The header is what the owner approves (what starts it,
  where it fetches from, which keys it sends, which lists it reads and writes), so it is a group of pickers on the
  ground and never text a person has to get the grammar of right. The source is a tile holding a monospace field, with
  tab handling and no editor dependency; what a trial answered is a tile of its own, beside the source at 900px and up
  and under it on a phone, full width. A field inside a tile is a field (the tile's inner fill), never a tile.

  ONE PRIMARY. The owner's is "Save and turn on", which files the change and accepts it in one press; anyone else's is
  "Send to Decide", which files it for the owner. "Try it" runs the draft once and writes nothing.

  CHECKED HERE ONLY FOR WHAT A PERSON MISTYPES. The record checks the body again on filing (`scriptBody`), and its
  sentence is drawn as it said it. The form's own faults show after the first press, beside the field they are about.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { TONES } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { humanize, listName } from '$lib/record/names.ts';
  import { faultsOf, idFrom, indent, sendDraft, tryDraft, words, type Door, type Draft, type Tried } from '$lib/record/script-draft.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';

  let {
    start,
    fromVersion,
    found = true,
    owner,
    lists,
    keys,
    doors,
    taken,
    onsent,
  }: {
    start: Draft;
    /** The version the form opened, or `null` for a new script. */
    fromVersion: number | null;
    /** Whether the installed source was found, so an empty box on an installed script says why. */
    found?: boolean | undefined;
    owner: boolean;
    lists: readonly { id: string; name: string }[];
    /** The vault's key labels, or `null` when this caller cannot read the vault. */
    keys: readonly string[] | null;
    /** The doors, or `null` when this caller cannot read them. */
    doors: readonly Door[] | null;
    taken: readonly string[];
    /** After an accept, so the screen can open the installed script or read it again. */
    onsent?: ((script: string) => void) | undefined;
  } = $props();

  /* THE DRAFT IS THE FORM'S FROM HERE ON. The screen hands the starting draft once; a read of the record asked again
     while somebody types never replaces what they wrote. */
  // svelte-ignore state_referenced_locally
  let draft = $state<Draft>({ ...start, keys: [...start.keys], reads: [...start.reads], writes: [...start.writes] });
  let input = $state('');
  let tried = $state<Tried | null>(null);
  let trying = $state(false);
  let sending = $state(false);
  let pressed = $state(false);
  let refusal = $state('');
  /* FILED ONCE. A change in Decide is the owner's to answer, so the press that filed it is not offered again, and a
     second press cannot put the same script in front of the owner twice. */
  let filed = $state<{ question: string | null; why: string | null } | null>(null);

  const fresh = $derived(fromVersion === null);
  const faults = $derived(faultsOf(draft));
  const faultAt = (where: string): string | null => (pressed ? (faults.find((f) => f.at === where)?.say ?? null) : null);

  /* WHAT WAS PICKED STAYS OFFERED, so a key the vault no longer lists, or a door this caller cannot read, is still
     there to untick rather than silently dropped from the body. */
  const keyChoices = $derived([...new Set([...(keys ?? []), ...draft.keys])].sort((a, b) => a.localeCompare(b)));
  const listChoices = $derived([
    ...lists,
    ...[...draft.reads, ...draft.writes].filter((id, i, all) => all.indexOf(id) === i && !lists.some((l) => l.id === id)).map((id) => ({ id, name: listName(id) })),
  ]);
  const doorChoices = $derived(doors === null ? null : [...doors, ...(draft.door !== '' && !doors.some((d) => d.id === draft.door) ? [{ id: draft.door, description: '' }] : [])]);
  const EVERY = ['15m', '1h', '6h', '1d'];
  const everyChoices = $derived(draft.every !== '' && !EVERY.includes(draft.every) ? [...EVERY, draft.every] : EVERY);

  const GROUPS = [
    { which: 'reads', label: words.reads },
    { which: 'writes', label: words.writes },
  ] as const;

  const toggle = (xs: string[], x: string): string[] => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  /* TAB INDENTS, AND ESCAPE THEN TAB LEAVES. A box that kept Tab for ever would trap a keyboard user inside it, so the
     press after Escape is the browser's own. */
  let escaped = false;
  async function onSourceKey(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (e.key === 'Escape') {
      escaped = true;
      return;
    }
    const leave = escaped;
    escaped = false;
    if (e.key !== 'Tab' || leave || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const box = e.currentTarget;
    const next = indent(box.value, box.selectionStart, box.selectionEnd, e.shiftKey);
    draft.source = next.text;
    await tick();
    box.setSelectionRange(next.start, next.end);
  }

  async function tryIt() {
    if (trying) return;
    trying = true;
    const mark = opened();
    const out = await tryDraft(apiBase(page.url), { ...draft, script: draft.script || idFrom(draft.title, taken) }, input, listName);
    closed(true, mark);
    trying = false;
    tried = out;
  }

  async function send() {
    if (sending) return;
    pressed = true;
    refusal = '';
    if (faults.length > 0) return;
    if (fresh) draft.script = idFrom(draft.title, taken);
    sending = true;
    const mark = opened();
    const out = await sendDraft(apiBase(page.url), draft, fromVersion, owner);
    closed(true, mark);
    sending = false;
    if (out.kind === 'refused') {
      refusal = out.fix;
      return;
    }
    if (out.kind === 'installed') {
      toasts.push(words.installed(draft.title.trim()), { intent: 'good' });
      onsent?.(out.script);
      return;
    }
    filed = { question: out.question, why: out.why ?? null };
    toasts.push(words.filed(draft.title.trim()));
  }
</script>

<div class="form">
  <Section title={words.header}>
    <div class="fields">
      <div class="item">
        <label class="label" for="script-title">{words.title}</label>
        <div class="field" data-wrong={faultAt('title') ? '' : undefined}>
          <!-- THE HELP LINE IS WHERE A FAULT IS SAID, so the field names it (`aria-describedby`) and a screen reader hears
               the fault with the field, not only as a line somewhere under it. -->
          <input id="script-title" class="field-input" type="text" autocomplete="off" aria-describedby="script-title-help" aria-invalid={faultAt('title') ? 'true' : undefined} bind:value={draft.title} />
        </div>
        <p class="help" id="script-title-help" class:wrong={faultAt('title') !== null}>{faultAt('title') ?? words.titleHelp}</p>
      </div>

      <!-- WHAT STARTS IT IS A GROUP OF CHOICES WITH ONE FAULT BETWEEN THEM, so the group carries the fault's id. -->
      <fieldset class="item" aria-describedby={faultAt('starts') ? 'script-starts-fault' : undefined}>
        <legend class="label">{words.starts}</legend>
        <p class="sub" id="script-every">{words.every}</p>
        <Segmented role="group" aria-labelledby="script-every">
          <button type="button" class="segment" aria-pressed={draft.every === ''} data-on={draft.every === '' ? '' : undefined} onclick={() => (draft.every = '')}>{words.everyNone}</button>
          {#each everyChoices as e (e)}
            <button type="button" class="segment" aria-pressed={draft.every === e} data-on={draft.every === e ? '' : undefined} onclick={() => (draft.every = e)}>
              {words.everyAs[e] ?? words.everyOther(e)}
            </button>
          {/each}
        </Segmented>

        {#if doorChoices !== null && doorChoices.length > 0}
          <p class="sub" id="script-door">{words.door}</p>
          <Segmented role="group" aria-labelledby="script-door">
            <button type="button" class="segment" aria-pressed={draft.door === ''} data-on={draft.door === '' ? '' : undefined} onclick={() => (draft.door = '')}>{words.doorNone}</button>
            {#each doorChoices as d (d.id)}
              <button type="button" class="segment" aria-pressed={draft.door === d.id} data-on={draft.door === d.id ? '' : undefined} title={d.description || undefined} onclick={() => (draft.door = d.id)}>
                {humanize(d.id)}
              </button>
            {/each}
          </Segmented>
        {:else if doorChoices === null}
          <label class="sub" for="script-door-typed">{words.doorTyped}</label>
          <div class="field">
            <input id="script-door-typed" class="field-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={draft.door} />
          </div>
        {/if}

        <div class="switch-line">
          <span id="script-rule">{words.rule}</span>
          <button type="button" class="switch" role="switch" aria-checked={draft.rule} aria-labelledby="script-rule" onclick={() => (draft.rule = !draft.rule)}>
            <span class="switch-track"></span>
          </button>
        </div>
        {#if faultAt('starts')}<p class="help wrong" id="script-starts-fault">{faultAt('starts')}</p>{/if}
      </fieldset>

      <div class="item">
        <label class="label" for="script-egress">{words.egress}</label>
        <textarea
          id="script-egress"
          class="lines"
          rows="3"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          inputmode="url"
          aria-describedby="script-egress-help"
          aria-invalid={faultAt('egress') ? 'true' : undefined}
          data-wrong={faultAt('egress') ? '' : undefined}
          bind:value={draft.egress}
        ></textarea>
        <p class="help" id="script-egress-help" class:wrong={faultAt('egress') !== null}>{faultAt('egress') ?? words.egressHelp}</p>
      </div>

      <fieldset class="item">
        <legend class="label">{words.keys}</legend>
        {#if keyChoices.length > 0}
          <div class="picks">
            {#each keyChoices as k (k)}
              <label class="pick"><input type="checkbox" checked={draft.keys.includes(k)} onchange={() => (draft.keys = toggle(draft.keys, k))} />{k}</label>
            {/each}
          </div>
        {/if}
        {#if keys === null}<p class="help">{words.keysShut}</p>{:else if keyChoices.length === 0}<p class="help">{words.keysNone}</p>{/if}
      </fieldset>

      {#each GROUPS as group (group.which)}
        <fieldset class="item">
          <legend class="label">{group.label}</legend>
          {#if listChoices.length === 0}
            <p class="help">{words.listsNone}</p>
          {:else}
            <div class="picks">
              {#each listChoices as l (l.id)}
                <label class="pick">
                  <input type="checkbox" checked={draft[group.which].includes(l.id)} onchange={() => (draft[group.which] = toggle(draft[group.which], l.id))} />{l.name}
                </label>
              {/each}
            </div>
          {/if}
        </fieldset>
      {/each}
    </div>
  </Section>

  <div class="work">
    <Tile icon="code" title={words.source}>
      <div class="box">
        {#if !found && draft.source === ''}<p class="help">{words.notFound}</p>{/if}
        <label class="label" for="script-source">{words.sourceLabel}</label>
        <textarea
          id="script-source"
          class="code"
          aria-describedby="script-source-help"
          aria-invalid={faultAt('source') ? 'true' : undefined}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          wrap="off"
          data-wrong={faultAt('source') ? '' : undefined}
          bind:value={draft.source}
          onkeydown={onSourceKey}
        ></textarea>
        <p class="help" id="script-source-help" class:wrong={faultAt('source') !== null}>{faultAt('source') ?? words.sourceHelp}</p>

        {#if draft.door !== ''}
          <label class="label" for="script-input">{words.input}</label>
          <textarea id="script-input" class="code code-sm" autocomplete="off" autocapitalize="off" spellcheck="false" wrap="off" bind:value={input}></textarea>
          <p class="help">{words.inputHelp}</p>
        {/if}
      </div>
    </Tile>

    <Tile icon="play" title={words.tried}>
      <div class="box" aria-live="polite">
        {#if tried === null}
          <p class="help">{words.triedNone}</p>
        {:else if tried.kind === 'not-run' || tried.kind === 'held'}
          <p class="said">{tried.kind === 'held' ? tried.say : tried.why}</p>
        {:else}
          {#if tried.kind === 'refused'}
            <p class="said" data-intent="bad">
              <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>
              {words.refused}: {tried.why}
            </p>
          {:else if tried.writes.length === 0}
            <p class="said">{words.writesNone}</p>
          {:else}
            <p class="sub">{words.wouldWrite}</p>
            <ul class="writes">
              {#each tried.writes as w, i (i)}<li>{w}</li>{/each}
            </ul>
          {/if}
          <p class="sub">{words.log}</p>
          {#if tried.log.trim() === ''}<p class="help">{words.logNone}</p>{:else}<pre class="log">{tried.log}</pre>{/if}
          <p class="help">{tried.spent}</p>
        {/if}
      </div>
    </Tile>
  </div>

  {#if refusal}<p class="said" data-intent="bad" role="alert"><span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>{/if}
  {#if filed}
    <p class="said" role="status">
      {filed.why ? words.notAccepted(filed.why) : words.filed(draft.title.trim())}
      {#if filed.question}<a class="link" href={at(`/decide/${filed.question}`)}>{words.openDecide}</a>{/if}
    </p>
  {/if}

  <div class="do">
    <Button weight="quiet" disabled={trying} onclick={() => void tryIt()}>{trying ? words.trying : words.tryIt}</Button>
    <Button weight="primary" disabled={sending || (filed !== null && filed.why === null)} onclick={() => void send()}>{sending ? words.sending : owner ? words.install : words.propose}</Button>
  </div>
</div>

<style>
  .form {
    display: grid;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  .fields {
    display: grid;
    gap: var(--sp-5);
    max-inline-size: var(--measure);
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
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* A TILE'S OWN LINES, closer together than the tile's gap: a label sits on its field, the help under it. */
  .box {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .sub {
    margin: 0;
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .help {
    margin: 0;
    margin-block-start: calc(var(--sp-1) - var(--sp-2));
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .help.wrong {
    color: var(--danger-text);
  }

  /* A FIELD WITH A FAULT IN IT: a red edge drawn inside it, since a field has no border to colour. */
  .field[data-wrong],
  .lines[data-wrong],
  .code[data-wrong] {
    box-shadow: inset 0 0 0 1.5px var(--danger);
  }

  .switch-line {
    display: grid;
    grid-template-columns: fit-content(var(--measure)) auto;
    align-items: center;
    justify-content: start;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* A FIELD IS THE INNER FILL WITH NO BORDER, rounded 12, on the ground and inside a tile alike. */
  .lines,
  .code {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
  }

  .lines {
    font-family: var(--font-ui);
    overflow-wrap: anywhere;
  }

  /* THE SOURCE KEEPS ITS LINES. It scrolls sideways inside its own box, never the page, and holds its indentation. */
  .code {
    min-block-size: calc(var(--sp-9) * 4);
    font-family: var(--font-id);
    white-space: pre;
    overflow-x: auto;
    tab-size: 2;
  }

  .code-sm {
    min-block-size: var(--sp-9);
  }

  /* FOCUS IS THE 2PX INK RING OFFSET 2, as on every other field. */
  .lines:focus-visible,
  .code:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-4);
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink2);
    font-size: var(--t-base);
    cursor: pointer;
  }

  /* ON A PHONE THE SOURCE IS FULL WIDTH AND WHAT A RUN WOULD DO STACKS UNDER IT. From 900 up they sit side by side,
     the source the wider, so a trial is read beside the lines that made it. */
  .work {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .work {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
    }
  }

  .said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .said[data-intent] {
    color: var(--tone);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }

  .writes {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    font-size: var(--t-base);
  }

  .log {
    margin: 0;
    padding: var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .link {
    margin-inline-start: var(--sp-2);
    color: var(--link);
  }

  .do {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: var(--sp-2);
  }

  @media (pointer: coarse) {
    .do {
      gap: var(--sp-3);
    }

    .pick {
      min-block-size: var(--tap);
      font-size: var(--t-md);
    }
  }

  /* A PHONE'S PRESS IS FULL WIDTH, the primary first where the thumb is. */
  @media (width < 640px) {
    .do {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }
</style>
