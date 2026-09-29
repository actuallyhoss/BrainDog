<!--
  A file field where it is drawn: a button that opens the phone's picker or its camera, and once a file is chosen its
  name, its size, a preview when it is a picture, and a way to take it off (OPS-20).

  ONE STRING IN AND OUT, the file as the row holds it written out (`field-draft.ts` `fileDraft`), because both screens
  keep what is being edited as one string and save it through `patchOf`, which reads the file back with `fileOf`. The
  bytes are not in that string: they go to `PUT /api/files` the moment a file is chosen, and the record's answer, the
  hash, the type and the size, is what the draft holds with the file's own name beside it.

  THE UPLOAD IS NOT THE SAVE. A file sent and then abandoned is bytes nothing names, which the store is content
  addressed to shrug off; the row changes only when the screen that owns the save sends the draft.

  AT 390 IT IS ONE LINE AND THE BUTTONS GO UNDER IT: the name and the size read first, and each button keeps its 44px
  under a thumb. From 640px they share the line. A picture's preview is never wider than the column it sits in.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { fileDraft, fileOf, type FileValue } from '$lib/record/field-draft.ts';
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    label,
    id,
  }: {
    value?: string | undefined;
    /** The field's name, which the button and the preview are announced by. */
    label: string;
    /** The id a `<label for>` points at, given to the button. */
    id?: string | undefined;
  } = $props();

  /* THIS FIELD'S WORDS, said only by it. */
  const words = {
    add: 'Add a file',
    replace: 'Replace the file',
    remove: 'Remove the file',
    sending: 'Adding the file',
    tooBig: 'This file is bigger than 2 MB. Choose a smaller one.',
    preview: (field: string) => `Preview of ${field.toLowerCase()}`,
    size: (bytes: number) =>
      bytes < 1024 ? `${bytes} bytes` : bytes < 1_048_576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`,
  } as const;

  /** The most one file may be, the stores' own ceiling (`apps/worker/src/files.ts` `FILE_MOST`), said before it is sent. */
  const MOST = 2_097_152;

  /** The six types the store takes; SVG is never one. The picker offers these, and a phone offers its camera for them. */
  const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf';

  const file = $derived<FileValue | null>(fileOf(value));
  const picture = $derived(file !== null && file.mime.startsWith('image/'));

  let picker = $state<HTMLInputElement | undefined>(undefined);
  let sending = $state(false);
  let why = $state('');

  /**
   * The chosen file, sent, and the draft set from the record's answer.
   *
   * ONE AT A TIME: a second choice while one is in flight is not taken, so a double press sends once. The record's own
   * sentence is shown when it refuses, and a failed send says the record could not be reached.
   */
  async function send(chosen: File): Promise<void> {
    if (sending) return;
    why = '';
    if (chosen.size > MOST) {
      why = words.tooBig;
      return;
    }
    sending = true;
    try {
      const res = await fetch(`${apiBase()}/api/files`, {
        method: 'PUT',
        headers: { 'content-type': chosen.type || 'application/octet-stream', accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: chosen,
      });
      if (res.status === 401) {
        why = copy.signInAgain;
        return;
      }
      const said = (await res.json().catch(() => null)) as { sha256?: unknown; mime?: unknown; bytes?: unknown; refusal?: { fix?: unknown } } | null;
      if (!res.ok) {
        why = typeof said?.refusal?.fix === 'string' ? said.refusal.fix : copy.recordNotReached;
        return;
      }
      const kept = fileOf(JSON.stringify({ sha256: said?.sha256, mime: said?.mime, bytes: said?.bytes, name: chosen.name }));
      if (kept === null) {
        why = copy.recordNotReached;
        return;
      }
      value = fileDraft(kept);
    } catch {
      why = copy.recordNotReached;
    } finally {
      sending = false;
      if (picker) picker.value = '';
    }
  }
</script>

<div class="file-field">
  <div class="file-head">
    {#if file}
      <div class="file-line">
        <Icon name="doc" size="s" />
        <span class="file-name">{file.name}</span>
        <span class="file-size">{words.size(file.bytes)}</span>
      </div>
    {/if}
    <div class="file-actions">
      <button
        type="button"
        class="file-button"
        {id}
        disabled={sending}
        aria-describedby={why ? `${id ?? 'file'}-why` : undefined}
        onclick={() => picker?.click()}
      >
        <Icon name="plus" size="s" />
        {sending ? words.sending : file ? words.replace : words.add}
      </button>
      {#if file}
        <button type="button" class="file-button file-remove" disabled={sending} onclick={() => ((value = ''), (why = ''))}>
          <Icon name="trash" size="s" />
          {words.remove}
        </button>
      {/if}
    </div>
  </div>
  {#if file && picture}
    <img class="file-preview" src={`${apiBase()}/api/files/${file.sha256}`} alt={words.preview(label)} />
  {/if}
  <input
    class="file-picker"
    type="file"
    accept={ACCEPT}
    tabindex="-1"
    aria-hidden="true"
    bind:this={picker}
    onchange={(e) => {
      const chosen = e.currentTarget.files?.[0];
      if (chosen) void send(chosen);
    }}
  />
  {#if why}<p class="file-why" id="{id ?? 'file'}-why" role="status">{why}</p>{/if}
</div>

<style>
  .file-field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE NAME AND ITS BUTTONS: one under the other on a phone, sharing a line from 640px (below). */
  .file-head {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .file-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink2);
  }

  .file-name {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* NEVER WIDER THAN ITS COLUMN, and never taller than a phone can show beside the buttons. */
  .file-preview {
    display: block;
    max-inline-size: 100%;
    max-block-size: 16rem;
    inline-size: auto;
    block-size: auto;
    object-fit: contain;
    border-radius: var(--r-md);
  }

  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  /* 44px UNDER A THUMB AND AT EVERY WIDTH, the row page's other controls' shape. */
  .file-button {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background-color: var(--s1);
    border: 0;
    /* A PILL, because it is something you press: the quiet button's shape, not a field's. */
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
    cursor: pointer;
  }

  .file-button:disabled {
    color: var(--dim);
    cursor: default;
  }

  .file-remove {
    color: var(--danger);
  }

  /* THE NATIVE PICKER IS NEVER SEEN: the button above opens it, and the browser's own control is the one on the page
     that would look like another application's. Hidden by size and not by `display: none`, because a phone's browser
     has refused to open a picker it does not lay out. */
  .file-picker {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .file-why {
    margin: 0;
    color: var(--danger);
    font-size: var(--t-sm);
  }

  /* FROM 640px THE NAME AND ITS BUTTONS SHARE ONE LINE when there is room; below it the buttons sit under the name. */
  @media (min-width: 640px) {
    .file-head {
      flex-flow: row wrap;
      align-items: center;
      column-gap: var(--sp-4);
    }
  }
</style>
