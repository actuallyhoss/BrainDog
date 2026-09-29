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
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
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

  /* The slug, typed to confirm (`02 §9`); the button is disabled until it matches. */
  let typedSlug = $state('');
  let deleting = $state(false);
  let deletedSaid = $state('');

  async function deleteNow() {
    if (deleting) return;
    deleting = true;
    const at = opened();
    const out = await deleteRecordNow(apiBase(), typedSlug.trim());
    closed(true, at);
    deleting = false;
    if (out.ok) {
      deletedSaid = copy.recordDeleted(RECORD);
      toasts.push(deletedSaid, { intent: 'good' });
    } else toasts.push(out.fix, { intent: 'warn' });
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
  <Section title={copy.deleteRecord(RECORD)}>
    <Empty kind="no-permission" title={levelWords.ownersOnlyTitle} body={levelWords.ownersOnlyHow} />
  </Section>
{:else}
<!-- ON THE GROUND AND UNBOXED (SYSTEM §6, §11): the sentence, what it costs, the typed name and the verb. The box this
     sat in was a red-edged panel, and red is what needs him, not what is dangerous; the words carry the weight here. -->
<Section title={copy.deleteRecord(RECORD)}>
  <div class="danger">
    <p class="danger-title">{copy.deleteWhat(RECORD)}</p>
    <!-- WHAT IT COSTS, BEFORE THE FIELD, AND THE COST IS THE NAME. This line used to offer a
         final copy and an hour to change his mind. `Directory.prepare` refuses a released
         slug with *"is never given out again"*, so the reversal it invited is the exact one
         the host has already decided against, and `destroy()` takes no copy on the way out.
         `delete-costs.test.ts` holds both. -->
    <p class="danger-why">{copy.deleteCosts}</p>
    <!-- `field-row` PUTS THE LABEL ABOVE THE FIELD, a form's `--sp-2` over it; the label alone sat
         inline after the sentence with nothing to set its distance from the field. -->
    <div class="field-row">
      <label class="field-row-label" for="delete-slug">{copy.typeSlug(SLUG)}</label>
      <div class="field-row-controls">
        <div class="field field-lg">
          <input
            class="field-input"
            id="delete-slug"
            type="text"
            autocapitalize="off"
            spellcheck="false"
            autocomplete="off"
            bind:value={typedSlug}
          />
        </div>
        <Button
          tone="bad"
          disabled={typedSlug.trim() !== SLUG}
          aria-busy={deleting}
          onclick={deleteNow}
          >{copy.deleteRecord(RECORD)}</Button
        >
      </div>
    </div>
    {#if deletedSaid}<p class="hint" role="status">{deletedSaid}</p>{/if}
  </div>
</Section>
{/if}

<style>
  /* THE LABEL, THE FIELD AND THE BUTTON ARE `settings.css`'s FIELD ROW, which puts the field and its
     button at one height. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .danger {
    display: grid;
    gap: var(--sp-3);
    max-inline-size: var(--measure);
  }

  .danger > p {
    margin: 0;
  }

  /* WHAT HAPPENS, AT THE ROW'S WEIGHT IN INK. It was red, and red means "needs you" and nothing else (SYSTEM §2): the
     act is irreversible because the sentence says so, not because of its colour. */
  .danger-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
  }

  .danger-why {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }
</style>
