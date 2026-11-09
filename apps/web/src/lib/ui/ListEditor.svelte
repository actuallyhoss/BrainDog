<!--
  The Fields sheet: a list's fields, and the new-list sheet, which is the same sheet for a list that does not exist yet.

  ONE SHEET FOR BOTH, because a new list is a name, a line of what it holds and its first fields, and the first fields are
  asked exactly as a field on a live list is: the same kinds, the same one more question per kind, the same check
  (`drafted`). `register` names the list to edit; `null` makes a new one, starting from `name`.

  EVERY WRITE IS A MODULE'S (`field-write.ts`, `field-retire.ts`, `list-write.ts`), which the tests hold; this file draws
  them and keeps the in-flight guards. What an owner does lands at once and what a member does waits on Decide, and the
  line under each form says which before the press, so nobody is surprised afterwards.

  AT 390 IT IS A BOTTOM SHEET (`Sheet.svelte`), one field per row, the kind a native select, and every control 44px tall.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { labelOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import {
    addDrafted,
    drafted,
    DURATION_UNITS,
    renameField,
    renameOf,
    SHEET_KINDS,
    type FieldAsk,
    type FieldBody,
    type SheetKind,
  } from '$lib/record/field-write.ts';
  import { retirable, retireField, retireWords } from '$lib/record/field-retire.ts';
  import { DURATION_WORDS, fieldWords, kindSaid, SHEET_KIND_WORDS, sheetWords } from '$lib/record/field-words.ts';
  import { firstFieldOf, listOf, listWords, makeList, offered } from '$lib/record/list-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Retype from '$lib/ui/Retype.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { dbl } from '$lib/ui/dbl.ts';

  let {
    open = $bindable(false),
    register,
    owner,
    name = '',
    onchanged,
    onmade,
  }: {
    open?: boolean | undefined;
    register: string | null;
    owner: boolean;
    name?: string | undefined;
    /** A field landed on the list, so the screen under the sheet should ask for it again. */
    onchanged?: (() => void) | undefined;
    /** A new list landed, under this id. */
    onmade?: ((id: string) => void) | undefined;
  } = $props();

  /* `REGISTERS` IS A PLAIN OBJECT, read again after every write, so this counter is what tells the sheet to redraw. */
  let seen = $state(0);
  const decl = $derived.by(() => {
    void seen;
    return register === null ? undefined : REGISTERS[register];
  });
  const live = $derived(decl?.fields.filter((f) => f.retired !== true) ?? []);
  const lists = $derived.by(() => {
    void seen;
    return offered(Object.values(REGISTERS).map((d) => ({ id: d.id, name: d.name })));
  });
  const listName = (id: string): string => REGISTERS[id]?.name ?? id;

  /* ── the add form, shared by both modes ── */
  let label = $state('');
  let kind = $state<SheetKind>('text');
  let values = $state('');
  let to = $state('');
  let unit = $state<string>('h');
  let quantityUnit = $state('');
  let addFix = $state<string | null>(null);
  let adding = $state(false);

  /* ── renaming one field ── */
  let renaming = $state<string | null>(null);
  let renameText = $state('');
  let renameFix = $state<string | null>(null);
  let renamingBusy = $state(false);

  /* ── retiring: the field whose question is on its way ── */
  let retiring = $state<string | null>(null);

  /* ── a new list ── */
  let newName = $state('');
  let holds = $state('');
  let firsts = $state<FieldBody[]>([]);
  let listFix = $state<string | null>(null);
  let making = $state(false);

  function clearAdd() {
    label = '';
    kind = 'text';
    values = '';
    to = '';
    unit = 'h';
    quantityUnit = '';
    addFix = null;
  }

  /* EACH OPENING STARTS CLEAN, and a new list starts from the name the address gave. Untracked, so typing into the
     form does not reset it. */
  $effect(() => {
    if (!open) return;
    untrack(() => {
      clearAdd();
      renaming = null;
      renameFix = null;
      newName = name;
      holds = '';
      firsts = [];
      listFix = null;
      seen++;
    });
  });

  const ask = (): FieldAsk => ({
    label,
    kind,
    values,
    to,
    unit: kind === 'quantity' ? quantityUnit : unit,
  });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (adding) return;
    if (register === null) {
      /* A NEW LIST'S FIRST FIELDS ARE HELD HERE until the list is made, and go with it in one change. */
      const out = firstFieldOf(ask(), firsts, newName);
      if (!out.ok) {
        addFix = out.fix;
        return;
      }
      firsts = [...firsts, out.field];
      clearAdd();
      return;
    }
    if (!decl) return;
    const out = drafted(ask(), decl.fields, decl.name, lists.map((l) => l.id));
    if (!out.ok) {
      addFix = out.fix;
      return;
    }
    adding = true;
    addFix = null;
    const wrote = await addDrafted(apiBase(), register, out.field, owner);
    adding = false;
    /* A REFUSAL KEEPS WHAT WAS TYPED, under the record's own sentence. */
    if (wrote.from === 'refused') {
      addFix = wrote.fix;
      return;
    }
    clearAdd();
    seen++;
    if (wrote.from === 'added') {
      toasts.push(fieldWords.added(out.field.label));
      onchanged?.();
    } else toasts.push(wrote.fix ?? fieldWords.filed(out.field.label), wrote.fix ? { intent: 'warn' } : undefined);
  }

  function startRename(id: string, was: string) {
    renaming = id;
    renameText = was;
    renameFix = null;
  }

  /** A FIELD'S NAME DOUBLE-CLICKED (`lib/ui/dbl.ts`): its Rename, with the caret in the box. */
  const renamesField = (id: string, was: string) =>
    dbl((from) => {
      const row = from.closest('.fe-row');
      startRename(id, was);
      void tick().then(() => {
        const box = row?.querySelector<HTMLInputElement>('.fe-rename input');
        box?.focus();
        box?.select();
      });
    });

  async function rename(e: SubmitEvent) {
    e.preventDefault();
    if (renamingBusy || register === null || renaming === null) return;
    const field = renaming;
    const f = decl?.fields.find((x) => x.id === field);
    const was = f ? labelOf(f) : field;
    const out = renameOf(register, field, renameText);
    if (!out.ok) {
      renameFix = out.fix;
      return;
    }
    renamingBusy = true;
    renameFix = null;
    const wrote = await renameField(apiBase(), register, field, out.label, owner);
    renamingBusy = false;
    if (wrote.from === 'refused') {
      renameFix = wrote.fix;
      return;
    }
    renaming = null;
    seen++;
    if (wrote.from === 'added') {
      toasts.push(sheetWords.renamed(was, out.label));
      onchanged?.();
    } else toasts.push(wrote.fix ?? sheetWords.renameFiled(out.label), wrote.fix ? { intent: 'warn' } : undefined);
  }

  async function retire(id: string) {
    if (retiring !== null || register === null) return;
    retiring = id;
    const out = await retireField(apiBase(), register, id);
    retiring = null;
    if (out.from === 'refused') toasts.push(out.fix, { intent: 'warn' });
    else toasts.push(out.said);
  }

  async function make() {
    if (making) return;
    const out = listOf({ name: newName, holds, fields: firsts });
    if (!out.ok) {
      listFix = out.fix;
      return;
    }
    making = true;
    listFix = null;
    const wrote = await makeList(apiBase(), out.list, owner);
    making = false;
    if (wrote.from === 'refused') {
      listFix = wrote.fix;
      return;
    }
    open = false;
    if (wrote.from === 'made') {
      toasts.push(wrote.said);
      onmade?.(wrote.id);
    } else toasts.push(wrote.said, wrote.warn ? { intent: 'warn' } : undefined);
  }

  const title = $derived(register === null ? listWords.title : sheetWords.title(decl?.name ?? ''));
  const subtitle = $derived(register === null ? listWords.makeBody : sheetWords.subtitle);
</script>

<Sheet bind:open {title} {subtitle}>
  <div class="fe" data-list-editor={register === null ? 'new' : 'fields'}>
    {#if register === null}
      <!-- THE NEW LIST'S OWN QUESTIONS, above its fields: what it is called and what it holds. -->
      <div class="fe-part">
        <label class="fe-ask">
          <span class="fe-label">{listWords.name}</span>
          <span class="field"><input class="field-input" type="text" maxlength="60" autocomplete="off" placeholder={listWords.namePlaceholder} bind:value={newName} /></span>
        </label>
        <label class="fe-ask">
          <span class="fe-label">{listWords.holds}</span>
          <span class="field"><input class="field-input" type="text" maxlength="140" autocomplete="off" placeholder={listWords.holdsPlaceholder} bind:value={holds} /></span>
        </label>
      </div>

      <section class="fe-part" aria-label={listWords.firstFields}>
        <h3 class="fe-head">{listWords.firstFields}</h3>
        <p class="fe-help">{listWords.firstFieldsHelp}</p>
        <ul class="fe-rows">
          <li class="fe-row">
            <span class="fe-name">{fieldWords.label}</span>
            <span class="fe-kind">{sheetWords.titleField}</span>
          </li>
          {#each firsts as f (f.id)}
            <li class="fe-row">
              <span class="fe-name">{f.label}</span>
              <span class="fe-kind">{kindSaid(f, listName)}</span>
              <span class="fe-acts">
                <Button weight="quiet" aria-label={listWords.drop(f.label)} onclick={() => (firsts = firsts.filter((x) => x.id !== f.id))}>{listWords.takeOff}</Button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <ul class="fe-rows" aria-label={sheetWords.open}>
        {#each live as f (f.id)}
          {@const said = labelOf(f)}
          {@const can = retirable(register ?? '', f.id)}
          <li class="fe-row" data-field={f.id}>
            {#if renaming === f.id}
              <form class="fe-rename" onsubmit={rename}>
                <label class="fe-ask">
                  <span class="fe-label">{sheetWords.renameTo(said)}</span>
                  <span class="field"><input class="field-input" type="text" maxlength="60" autocomplete="off" bind:value={renameText} /></span>
                </label>
                {#if renameFix}<p class="fe-fix" role="alert">{renameFix}</p>{/if}
                <span class="fe-acts">
                  <Button type="submit" weight="primary" disabled={renamingBusy}>{sheetWords.saveName}</Button>
                  <Button weight="bare" onclick={() => (renaming = null)}>{sheetWords.cancel}</Button>
                </span>
              </form>
            {:else}
              <span class="fe-name" {@attach renamesField(f.id, said)}>{said}</span>
              <span class="fe-kind">{decl?.title === f.id ? sheetWords.titleField : kindSaid(f, listName)}</span>
              <span class="fe-acts">
                <Button weight="quiet" aria-label={`${sheetWords.rename} ${said}`} onclick={() => startRename(f.id, said)}>{sheetWords.rename}</Button>
                <Retype register={register ?? ''} field={f.id} label={said} {owner} onchanged={() => { seen++; onchanged?.(); }} />
                {#if can.ok}
                  <Button weight="quiet" aria-label={`${retireWords.retire} ${said}`} disabled={retiring !== null} onclick={() => retire(f.id)}>{retireWords.retire}</Button>
                {/if}
              </span>
            {/if}
          </li>
        {:else}
          <li class="fe-row"><span class="fe-kind">{sheetWords.none}</span></li>
        {/each}
      </ul>
      <p class="fe-help">{sheetWords.retireNote}</p>
    {/if}

    <!-- ADD A FIELD OF ANY KIND. The kind is a native select, which a phone draws as its own picker; the one more thing a
         kind needs is asked under it, and only for that kind. -->
    <form class="fe-part fe-add" onsubmit={add} aria-label={sheetWords.addHead}>
      <h3 class="fe-head">{sheetWords.addHead}</h3>
      <label class="fe-ask">
        <span class="fe-label">{fieldWords.label}</span>
        <span class="field"><input class="field-input" type="text" maxlength="60" autocomplete="off" placeholder={fieldWords.placeholder} bind:value={label} /></span>
      </label>
      <label class="fe-ask">
        <span class="fe-label">{fieldWords.kind}</span>
        <select class="fe-select" bind:value={kind}>
          {#each SHEET_KINDS as k (k)}<option value={k}>{SHEET_KIND_WORDS[k]}</option>{/each}
        </select>
      </label>
      {#if kind === 'enum'}
        <label class="fe-ask">
          <span class="fe-label">{sheetWords.values}</span>
          <textarea class="fe-text" rows="3" bind:value={values}></textarea>
          <span class="fe-help">{fieldWords.choicesHelp}</span>
        </label>
      {:else if kind === 'ref'}
        {#if lists.length === 0}
          <p class="fe-help">{sheetWords.noLists}</p>
        {:else}
          <label class="fe-ask">
            <span class="fe-label">{sheetWords.linkTo}</span>
            <select class="fe-select" bind:value={to}>
              <option value="" disabled>{sheetWords.pickList}</option>
              {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
            </select>
          </label>
        {/if}
      {:else if kind === 'duration'}
        <label class="fe-ask">
          <span class="fe-label">{sheetWords.unit}</span>
          <select class="fe-select" bind:value={unit}>
            {#each DURATION_UNITS as u (u)}<option value={u}>{DURATION_WORDS[u]}</option>{/each}
          </select>
        </label>
      {:else if kind === 'quantity'}
        <label class="fe-ask">
          <span class="fe-label">{sheetWords.quantityUnit}</span>
          <span class="field"><input class="field-input" type="text" maxlength="16" autocomplete="off" bind:value={quantityUnit} /></span>
          <span class="fe-help">{sheetWords.quantityHelp}</span>
        </label>
      {:else if kind === 'money'}
        <p class="fe-help">{sheetWords.moneyHelp}</p>
      {/if}
      {#if addFix}<p class="fe-fix" role="alert">{addFix}</p>{/if}
      <span class="fe-acts">
        <Button type="submit" disabled={adding}>{adding ? fieldWords.saving : fieldWords.save}</Button>
      </span>
      {#if register !== null}<p class="fe-help">{owner ? fieldWords.ownerNote : fieldWords.memberNote}</p>{/if}
    </form>
  </div>

  {#snippet footer()}
    <div class="fe-foot">
      {#if register === null}
        {#if listFix}<p class="fe-fix" role="alert">{listFix}</p>{:else}<p class="fe-help">{owner ? listWords.ownerNote : listWords.memberNote}</p>{/if}
        <Button weight="primary" disabled={making} onclick={make}>{making ? listWords.saving : owner ? listWords.save : listWords.ask}</Button>
      {:else}
        <Button weight="primary" onclick={() => (open = false)}>{sheetWords.done}</Button>
      {/if}
    </div>
  {/snippet}
</Sheet>

<style>
  .fe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .fe-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .fe-add {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .fe-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .fe-ask {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .fe-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .fe-help {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .fe-fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* ONE FIELD PER ROW: its name, what kind it is, and the row's own controls at the end, each 44px on a coarse pointer
     through `Button`'s own height. Where the row is too narrow, the controls wrap under the name rather than squeeze it. */
  .fe-rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fe-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    min-block-size: var(--tap);
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--rule);
  }

  .fe-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .fe-kind {
    flex: 1 1 8rem;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .fe-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .fe-rename {
    display: grid;
    flex: 1 1 100%;
    gap: var(--sp-2);
  }

  /* THE KIND IS A NATIVE SELECT, drawn in the house's field frame and never smaller than a thumb. */
  .fe-select,
  .fe-text {
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .fe-text {
    padding-block: var(--sp-2);
    resize: vertical;
  }

  .fe-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-3);
  }

  .fe-foot .fe-help,
  .fe-foot .fe-fix {
    flex: 1 1 12rem;
  }

  /* ON A PHONE THE PRIMARY IS FULL WIDTH in the sheet's footer, as every sheet's is. */
  @media (width < 640px) {
    .fe-foot {
      flex-direction: column;
      align-items: stretch;
    }

    .fe-foot .fe-help,
    .fe-foot .fe-fix {
      flex: 0 0 auto;
    }
  }
</style>
