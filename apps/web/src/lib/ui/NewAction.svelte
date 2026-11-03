<!--
  The "New door" and "New scheduled action" sheets: what used to be a declaration somebody typed, asked as
  a form, filed as one `change` and accepted in the same press.

  ONE SHEET FOR BOTH, because a door and a scheduled action are one kind of declaration, an ingest, and the questions
  they share (a name, the list it writes, what each row holds) should read the same in both. `kind` picks which half is
  asked. The rules and the words are `lib/record/action-draft.ts`, which a test can import without a DOM.

  A DOOR'S ADDRESS IS SHOWN ONCE, HERE, AND NOWHERE ELSE. Once the door is installed the sheet mints its token through
  the webhook doors screen's own `mintDoor`, so the address is built one way; it lives in `said` and closing the sheet
  drops it, as leaving the Ingest area drops the doors screen's. Nothing here logs or keeps it.

  REACHED FROM OUTSIDE THE HUB by `?new=door` or `?new=action&preset=<id>`, which the hub reads and
  hands in as `kind` and `preset`, so a declared page can link to a sheet already filled in.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { callerAt, listDoors, mintDoor, type Said } from '$lib/ui/webhook-doors.ts';
  import { openActions } from '$lib/record/actions.ts';
  import { homeCurrency, moneyCurrencies } from '$lib/record/api.ts';
  import {
    AUTH_KINDS,
    CHANNELS,
    EVERY,
    actionWords as w,
    declarationOf,
    fieldsOf,
    fileDraft,
    keyLabels,
    listsOffered,
    presetOf,
    type ActionDraft,
    type ActionKind,
    type Filed,
  } from '$lib/record/action-draft.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';

  let {
    open,
    kind,
    preset = null,
    onclose,
  }: { open: boolean; kind: ActionKind; preset?: string | null | undefined; onclose: () => void } = $props();

  let draft = $state<ActionDraft>(presetOf('action', null));
  /* THE PROBLEM IS THE ONE THE LAST PRESS FOUND, under the box it is about. */
  let problem = $state<{ fix: string; at: keyof ActionDraft } | null>(null);
  let busy = $state(false);
  let filed = $state<Filed | null>(null);
  /* THE DOOR'S ADDRESS, the only copy there will be. */
  let said = $state<Said | null>(null);
  /* THE INGEST NAME A DOOR WAS INSTALLED UNDER, so a sign-in the mint asked for can finish it. */
  let door = $state<string | null>(null);
  let reproving = $state(false);
  /* The Keychain's labels; `null` is a Keychain this sheet cannot read, and the key is then typed. */
  let keys = $state<string[] | null | undefined>(undefined);
  /* EVERY INGEST ID THE RECORD ALREADY DECLARES, doors and scheduled actions together, so `declarationOf` can refuse a
     name that would silently replace one; `undefined` while unread never blocks a press. */
  let taken = $state<Set<string> | undefined>(undefined);

  async function loadTaken() {
    const [doors, actions] = await Promise.all([listDoors(call()), openActions((url, init) => fetch(url, init), apiBase())]);
    const ids = new Set<string>();
    if (doors.kind === 'doors') for (const d of doors.doors) ids.add(d.id);
    if (actions.first.ok) for (const a of actions.first.value) ids.add(a.ingest);
    taken = ids;
  }

  const call = () => callerAt(apiBase());
  const lists = $derived(open ? listsOffered() : []);
  const fields = $derived(draft.register === '' ? [] : fieldsOf(draft.register));
  const isDoor = $derived(kind === 'door');
  const done = $derived(filed !== null && filed.kind !== 'refused');

  /* A FRESH DRAFT EACH TIME THE SHEET OPENS, from the preset the address named, and everything the last one said gone
     with the sheet: a token must not be the first thing a second opening shows. Untracked, so typing into the draft
     does not reset it. */
  $effect(() => {
    if (!open) return;
    untrack(() => {
      /* THE RECORD'S OWN CURRENCIES, as its `boot` said them, or the rates preset knows only the home one and quotes
         nothing. */
      draft = presetOf(kind, preset, { currencies: moneyCurrencies(), home: homeCurrency() });
      problem = null;
      filed = null;
      said = null;
      door = null;
      busy = false;
      if (kind === 'action' && keys === undefined) void keyLabels(call()).then((k) => (keys = k));
      void loadTaken();
    });
  });

  function close() {
    said = null;
    filed = null;
    onclose();
  }

  const lineOf = (s: Said | null): string => (s === null || s.kind === 'minted' ? '' : s.fix);

  function addLine() {
    draft.map = [...draft.map, { field: fields[0]?.id ?? '', from: 'answer', text: '' }];
  }

  function removeLine(i: number) {
    draft.map = draft.map.filter((_, n) => n !== i);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (busy || done) return;
    const built = declarationOf(draft, taken);
    if (!built.ok) {
      problem = { fix: built.fix, at: built.at };
      return;
    }
    problem = null;
    busy = true;
    filed = await fileDraft(call(), built.decl, built.name);
    if (filed.kind === 'refused') problem = { fix: filed.fix, at: 'name' };
    if (filed.kind === 'installed' && isDoor) {
      door = String(built.decl.body.ingest);
      await mint();
    }
    busy = false;
  }

  async function mint() {
    if (door === null) return;
    said = await mintDoor(call(), location.origin, door);
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, then the same mint again: the doors screen's own `reprove`, so the two cannot come
     to disagree about what a fresh sign-in is. */
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    if (back) await mint();
    reproving = false;
  }
</script>

<Sheet open={open} title={isDoor ? w.newDoor : w.newAction} subtitle={isDoor ? w.doorSub : w.actionSub} onclose={close}>
  <form id="new-action-form" class="new-action" onsubmit={save}>
    {#if !done}
      <label class="part">
        <span class="label">{w.name}</span>
        <span class="field" data-bad={problem?.at === 'name' ? '' : undefined}>
          <input class="field-input" type="text" maxlength="80" autocomplete="off" placeholder={w.namePlaceholder} bind:value={draft.name} />
        </span>
        {#if problem?.at === 'name'}<span class="help bad" role="alert">{problem.fix}</span>{/if}
      </label>

      {#if !isDoor}
        <div class="part">
          <span class="label" id="new-action-channel">{w.channel}</span>
          <Segmented role="group" aria-labelledby="new-action-channel">
            {#each CHANNELS as c (c)}
              <button type="button" class="segment" aria-pressed={draft.channel === c} data-on={draft.channel === c ? '' : undefined} onclick={() => (draft.channel = c)}>
                {w.channels[c]}
              </button>
            {/each}
          </Segmented>
          <span class="help">{w.channelHelp[draft.channel]}</span>
        </div>

        <label class="part">
          <span class="label">{w.url}</span>
          <span class="field">
            <input class="field-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" bind:value={draft.url} />
          </span>
          {#if problem?.at === 'url'}<span class="help bad" role="alert">{problem.fix}</span>{:else}<span class="help">{w.urlHelp}</span>{/if}
        </label>

        <label class="part">
          <span class="label">{w.grant}</span>
          {#if keys}
            <select class="pick" bind:value={draft.grant}>
              <option value="">{w.grantNone}</option>
              {#each keys as k (k)}<option value={k}>{k}</option>{/each}
            </select>
          {:else}
            <span class="field">
              <input class="field-input" type="text" maxlength="40" autocomplete="off" placeholder={w.grantTyped} bind:value={draft.grant} />
            </span>
          {/if}
          {#if problem?.at === 'grant'}<span class="help bad" role="alert">{problem.fix}</span>{:else}<span class="help">{w.grantHelp}</span>{/if}
        </label>

        {#if draft.grant !== ''}
          <label class="part">
            <span class="label">{w.auth}</span>
            <select class="pick" bind:value={draft.auth}>
              {#each AUTH_KINDS as a (a)}<option value={a}>{w.auths[a]}</option>{/each}
            </select>
          </label>
          {#if draft.auth === 'header' || draft.auth === 'query'}
            <label class="part">
              <span class="label">{w.keyName}</span>
              <span class="field">
                <input class="field-input" type="text" maxlength="60" autocomplete="off" spellcheck="false" bind:value={draft.keyName} />
              </span>
              {#if problem?.at === 'keyName'}<span class="help bad" role="alert">{problem.fix}</span>{/if}
            </label>
          {/if}
        {/if}

        <label class="part">
          <span class="label">{w.every}</span>
          <select class="pick" bind:value={draft.every}>
            {#each EVERY as e (e)}<option value={e}>{w.everies[e]}</option>{/each}
          </select>
        </label>
      {/if}

      <label class="part">
        <span class="label">{w.register}</span>
        <select class="pick" bind:value={draft.register}>
          <option value="">{w.registerNone}</option>
          {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          <!-- A PRESET'S LIST THIS TAB HAS NOT LEARNT YET is still offered, by the name the record would give it, so
               opening a preset never silently empties the box. -->
          {#if draft.register !== '' && !lists.some((l) => l.id === draft.register)}
            <option value={draft.register}>{draft.register.replace(/_/gu, ' ')}</option>
          {/if}
        </select>
        {#if problem?.at === 'register'}<span class="help bad" role="alert">{problem.fix}</span>{/if}
      </label>

      {#if !isDoor && draft.channel === 'pull'}
        <label class="part">
          <span class="label">{w.rows}</span>
          <span class="field">
            <input class="field-input" type="text" autocomplete="off" spellcheck="false" bind:value={draft.rows} />
          </span>
          {#if problem?.at === 'rows'}<span class="help bad" role="alert">{problem.fix}</span>{:else}<span class="help">{w.rowsHelp}</span>{/if}
        </label>
      {/if}

      {#if draft.register !== '' && draft.filled && draft.channel === 'poll' && draft.register === draft.filled.register}
        <!-- A FILLED DRAFT IS FILED WITH ITS FILLER'S MAPS (`declarationOf`), so its map lines would be empty and ignored:
             the sheet says what the filler made instead. -->
        <p class="help">{draft.filled.said}</p>
      {:else if draft.register !== ''}
        <fieldset class="part lines">
          <legend class="label">{w.map}</legend>
          <span class="help">{w.mapHelp}</span>
          {#each draft.map as line, i (i)}
            <div class="map-line">
              <select class="pick" aria-label={w.map} bind:value={line.field}>
                {#each fields as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
                {#if line.field !== '' && !fields.some((f) => f.id === line.field)}
                  <option value={line.field}>{line.field.replace(/_/gu, ' ')}</option>
                {/if}
              </select>
              <select class="pick" aria-label={w.fromAnswer} bind:value={line.from}>
                <option value="answer">{w.fromAnswer}</option>
                <option value="fixed">{w.fromFixed}</option>
                <option value="arrived">{w.fromArrived}</option>
              </select>
              {#if line.from !== 'arrived'}
                <span class="field">
                  <input class="field-input" type="text" autocomplete="off" spellcheck="false" aria-label={line.from === 'fixed' ? w.fromFixed : w.fromAnswer} bind:value={line.text} />
                </span>
              {/if}
              <Button weight="bare" onclick={() => removeLine(i)}>{w.removeLine(fields.find((f) => f.id === line.field)?.name ?? line.field)}</Button>
            </div>
          {/each}
          <div class="row-actions">
            <Button weight="quiet" onclick={addLine}>{w.addLine}</Button>
          </div>
        </fieldset>
      {/if}
    {:else if filed?.kind === 'filed'}
      <p class="said" role="status">{filed.fix ?? w.filed}</p>
      {#if filed.fix}<p class="help">{w.filed}</p>{/if}
    {:else if !isDoor}
      <p class="said" role="status">{w.saved(draft.name.trim())}</p>
    {:else}
      <p class="said" role="status">{w.doorMade(draft.name.trim())}</p>
      {#if said?.kind === 'minted'}
        {@const minted = said}
        <!-- SHOWN ONCE, from `said` alone. THE SENTENCE IS PASSED to `clipboard.put`, so its toast says the one line
             and never quotes the text, which is a live credential. -->
        <div class="once">
          <p class="label">{copy.doorsOnce}</p>
          {#if minted.url}
            <p class="mono wrap">{minted.url}</p>
            <div class="row-actions">
              <Button weight="primary" onclick={() => void clipboard.put(minted.url ?? '', copy.doorsUrlCopied, copy.doorsUrlCopied)}>{copy.doorsCopyUrl}</Button>
            </div>
            <p class="help">{copy.doorsPost}</p>
          {:else}
            <p class="mono wrap">{minted.token}</p>
            <div class="row-actions">
              <Button weight="primary" onclick={() => void clipboard.put(minted.token, copy.doorsTokenCopied, copy.doorsTokenCopied)}>{copy.doorsCopyToken}</Button>
            </div>
            <p class="help">{copy.doorsNoAddress}</p>
          {/if}
        </div>
      {:else}
        <p class="said bad" role="status">{lineOf(said)}</p>
        {#if said?.kind === 'signin'}
          <div class="row-actions">
            <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
          </div>
        {/if}
      {/if}
    {/if}
  </form>

  {#snippet footer()}
    {#if done}
      <Button weight={isDoor && said?.kind === 'minted' ? 'quiet' : 'primary'} onclick={close}>{w.close}</Button>
    {:else}
      <Button type="submit" form="new-action-form" weight="primary" disabled={busy}>{busy ? w.making : isDoor ? w.makeDoor : w.makeAction}</Button>
    {/if}
  {/snippet}
</Sheet>

<style>
  /* ONE COLUMN AT EVERY WIDTH. A sheet is a phone's form and the desktop's is the same questions, so nothing here sits
     side by side except a map line's own controls, which wrap under each other where there is no room. */
  .new-action {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .part {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  /* THE LABEL SITS ABOVE ITS FIELD in the meta step and the second ink. */
  .label {
    margin: 0 0 var(--sp-1);
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .help {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .bad {
    color: var(--red);
  }

  /* A FIELD HAS NO BORDER NOW (`controls.css`), so the one that is wrong is ringed inside its own edge, beside the line
     under it that says why. */
  .field[data-bad] {
    box-shadow: inset 0 0 0 1px var(--red);
  }

  /* 16px TEXT IN EVERY INPUT, so a phone does not zoom the page when one is focused. */
  .field-input,
  .pick {
    font-size: max(16px, var(--fs-body));
  }

  /* A SELECT IS A FIELD: 40 tall and 44 under a thumb, the `--tile-2` fill with no border, radius `--r-pop`, as
     `controls.css` draws `.field`. */
  .pick {
    min-inline-size: 0;
    min-block-size: 40px;
    padding-inline: var(--sp-3);
    background: var(--tile);
    border: 0;
    box-shadow: inset 0 0 0 1px var(--rule-strong);
    border-radius: var(--r-field);
    color: var(--ink);
    font: inherit;
  }

  @media (pointer: coarse) {
    .pick {
      min-block-size: var(--tap);
    }
  }

  .lines {
    gap: var(--sp-3);
  }

  /* ONE LINE OF THE MAP, A HAIRLINE ABOVE IT. Its own class and not `.line`, which is the shared row's (`rows.css`) and
     drew a list row's height, padding and press on every line of this form. */
  .map-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  .map-line > * {
    flex: 1 1 10rem;
    min-inline-size: 0;
  }

  .said {
    margin: 0;
    color: var(--ink);
    line-height: var(--lh-body);
  }

  /* THE ADDRESS SHOWN ONCE, in the sheet's inner well at the field's corner, so the one thing to copy is one shape. */
  .once {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  /* THE ADDRESS IS ONE LONG WORD, so without this the sheet scrolls sideways at 390. */
  .wrap {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    letter-spacing: 0;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
