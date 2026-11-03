<!--
  Settings > Delete this record: the one act with no rollback, confirmed by typing the record's slug.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { words as levelWords } from '../../levels.ts';
  /* Lane F: deleting the record. */
  import { deleteRecordNow } from '$lib/record/settings-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);

  /* THE RECORD'S OWN NAME. The Danger section named it two ways in three lines (`this record` and
     `the studio`) and one of the two was a literal. It is the shell's name and not the sample's:
     the layout asked `boot` once and kept the answer. */
  const RECORD = $derived(shell.index.name);
  const SLUG = $derived(shell.index.slug);

  /* THE NAME, TYPED TO CONFIRM (`02 §9`, agents F15 with the spec's Δ): the record's name as it is read everywhere, not
     its slug, compared without case. A name is what a person knows; an id is what the host knows, and is what is sent. */
  let typed = $state('');
  let deleting = $state(false);
  let deletedSaid = $state('');
  /* SAID ONLY AFTER A PRESS OR AN ENTER WITH THE WRONG NAME, never while typing and never before anything is typed:
     "Type The Studio exactly." under the button before a key was pressed read as an error. */
  let wrong = $state(false);
  let field = $state<HTMLInputElement | null>(null);

  const words = {
    exactly: (name: string) => `Type ${name} exactly.`,
    notIt: (name: string) => `That is not ${name}.`,
    exportFirst: 'Download a copy first',
  } as const;

  const matches = $derived(typed.trim().toLocaleLowerCase() === RECORD.trim().toLocaleLowerCase());

  async function deleteNow() {
    if (deleting) return;
    /* OFF IS NOT DISABLED: the press says why and puts the person in the field (first F16). */
    if (!matches) {
      /* A PRESS WITH NOTHING TYPED SAYS WHAT TO TYPE, and a wrong name says it is not this one. */
      wrong = true;
      field?.focus();
      return;
    }
    deleting = true;
    const at = opened();
    const out = await deleteRecordNow(apiBase(), SLUG);
    closed(true, at);
    deleting = false;
    if (out.ok) {
      deletedSaid = copy.recordDeleted(RECORD);
      toasts.push(deletedSaid, { intent: 'good' });
    } else toasts.push(out.fix, { intent: 'warn' });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void deleteNow();
  }
</script>

<!-- ITS OWN AREA, AND IT WAS THE LAST SECTION OF `Export`. See `AREAS` in `+page.svelte`: a person
     looking for a copy of their data found the one act with no rollback. -->
<!-- `Danger` IS A ONE-WORD HEADING THAT STATES NO FACT, over a line saying `Delete this
     record` over a button saying `Delete the studio`: three lines, two of them the same
     sentence, and the two disagreeing about what the record is called. One sentence saying
     what happens, and the button that does it. -->
<!--
  AND THE CONFIRMATION IS THE CONTROL, not a sentence about one.

  Four documents give the same flow (`02 §9`: *"an ADMIN method, browser session,
  re-authenticated, **the slug typed**"*; `33 §4`; `33 §10`; `19 §2`), and the screen was one
  button whose toast said *"Deleting a record asks you to type its name first"*. A control that
  DESCRIBES its own safeguard has not got one: the description is exactly as far as the product
  went, on the one action `53 §5.9` says has no rollback after step 2.

  The field is the gate. The button is disabled until the slug is typed, so the safeguard is a
  thing you do rather than a thing you are told about. Re-authentication is the half nothing
  specifies HOW to do (`49 §4.2`'s `authed_at` is the only lever the documents give), so the
  screen says it will be asked for rather than inventing a mechanism.
-->
<!--
  AND IT IS THE OWNER'S, WHICH IS THE ONE PLACE THAT COST THE MOST TO GET WRONG.

  Driven as a `read` colleague: this screen drew *"Delete studio. Deleting studio removes every
  list, page and row in it. It cannot be undone."*, the confirm field and the red button, to
  somebody who cannot change a single row. One control said it was off and nothing on the
  screen said why, so the field read as the way to turn the button on.

  THE SENTENCE REPLACES THE WHOLE BLOCK rather than standing beside a disabled one, because
  there is nothing here for a colleague to fill in: `deleteRecord` needs `owner`, and a person
  who is not one has no second step to take on this screen except asking somebody.
-->
{#if !anOwner}
  <Tile icon="trash" class="section" data-surface="tile" title={RECORD}>
    <div class="section-body">
      <Empty kind="no-permission" title={levelWords.ownersOnlyTitle} body={levelWords.ownersOnlyHow} />
    </div>
  </Tile>
{:else}
<!-- ON THE GROUND AND UNBOXED: the sentence, what it costs, the typed name and the verb. The box this
     sat in was a red-edged panel, and red is what needs him, not what is dangerous; the words carry the weight here. -->
<!-- THE CARD IS THE RECORD IT DELETES: "Delete this record" stood over a card of the same name,
     so the card is named by what it holds. -->
<Tile icon="trash" class="section" data-surface="tile" title={RECORD}>
  <div class="section-body">
    <div class="danger">
      <p class="danger-title">{copy.deleteWhat(RECORD)}</p>
      <!-- WHAT IT COSTS, BEFORE THE FIELD, AND THE COST IS THE NAME. This line used to offer a
           final copy and an hour to change his mind. `Directory.prepare` refuses a released
           slug with *"is never given out again"*, so the reversal it invited is the exact one
           the host has already decided against, and `destroy()` takes no copy on the way out.
           `delete-costs.test.ts` holds both. -->
      <p class="danger-why">{copy.deleteCosts}</p>
      <!-- THE ONE WAY BACK, BEFORE THE FIELD: a copy taken now is the only thing that answers a change of mind. -->
      <div><Button href="/settings/export" size="sm"><Icon name="download" size="s" />{words.exportFirst}</Button></div>
      <!-- `field-row` PUTS THE LABEL ABOVE THE FIELD. ARMED, the button is the primary with its bin; OFF it is
           quiet and `aria-disabled`, and a press says why. -->
      <div class="field-row">
        <label class="field-row-label" for="delete-slug">{copy.typeSlug(RECORD)}</label>
        <div class="field-row-controls">
          <div class="field field-lg" data-invalid={wrong ? '' : undefined}>
            <input
              class="field-input"
              id="delete-slug"
              type="text"
              autocapitalize="off"
              spellcheck="false"
              autocomplete="off"
              aria-invalid={wrong}
              aria-describedby="delete-said"
              bind:this={field}
              bind:value={typed}
              oninput={() => (wrong = false)}
              onkeydown={onkey}
            />
          </div>
          <!-- DANGEROUS BEFORE IT IS ARMED TOO: the bin and the words in red on the quiet
               fill, so the grey button no longer reads as one more setting. Armed, it is the red fill. -->
          <span class="go" data-armed={matches ? '' : undefined}>
            <Button
              weight={matches ? 'primary' : 'quiet'}
              tone="bad"
              aria-disabled={!matches}
              aria-busy={deleting}
              disabled={deleting}
              onclick={deleteNow}
              >{#if !matches}<Icon name="trash" size="m" />{/if}{copy.deleteRecord}</Button
            >
          </span>
        </div>
        <p id="delete-said" class="said" data-wrong={wrong ? '' : undefined} aria-live="polite">
          {#if wrong}<Icon name="alert" size="s" />{typed.trim() === '' ? words.exactly(RECORD) : words.notIt(RECORD)}{/if}
        </p>
      </div>
      {#if deletedSaid}<p class="hint" role="status">{deletedSaid}</p>{/if}
    </div>
  </div>
</Tile>
{/if}

<style>
  /* THE LABEL, THE FIELD AND THE BUTTON ARE `settings.css`'s FIELD ROW, which puts the field and its
     button at one height. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .danger {
    display: grid;
    gap: var(--sp-4);
    max-inline-size: var(--measure);
  }

  .danger p {
    margin: 0;
  }

  /* WHAT HAPPENS, AT THE ROW'S WEIGHT IN INK. Red means "needs you": the act is irreversible because the sentence says
     so, not because of its colour. */
  .danger-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  .danger-why {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  /* THE LINE UNDER THE FIELD: what to type in the quiet ink, and the wrong name in red with its glyph. Held at one line,
     so the row does not move when it changes. */
  .said {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 20px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  .said[data-wrong] {
    color: var(--red);
  }

  .go {
    display: contents;
  }

  .go:not([data-armed]) :global(.btn) {
    color: var(--red);
  }

  .field[data-invalid] {
    box-shadow: inset 0 0 0 1px var(--red);
  }
</style>
