<!--
  "CHANGE THIS" WHERE A SETTING SHOWS (§45 d8, "everything else he says on the page itself"): a setting that decides how
  this page reads, changed on the page, without a trip to Settings. Today two:

  - MONEY'S CURRENCY on Money's pages: every figure is added up in it. The same setting Settings > Words and money keeps
    (`setPackConfig` on the add-on that declares `home_currency`), so both say the same thing.
  - A LIST'S NAME on that list's page: the record's `renameList`, wherever the name is kept.

  ONE SMALL SHEET, ONE CONTROL, AND AN UNDO. The change is made at once and the toast puts it back. The owner's, as the
  setting is everywhere else; anybody else is never offered it.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  import { apiBase } from '$lib/at.ts';
  import { currencyLabel, currencyOptions } from '$lib/record/currencies.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  let {
    open = $bindable(false),
    what,
    onchanged,
  }: {
    open?: boolean;
    /** Which setting: Money's currency (what it is now), or one list's name. */
    what: { kind: 'currency'; code: string | null } | { kind: 'list'; id: string; name: string };
    /** The page read again once it changed. */
    onchanged?: (() => void | Promise<void>) | undefined;
  } = $props();

  const words = {
    currencyTitle: 'Money is counted in',
    currencyWhy: 'Every figure on these pages is added up in it. Other currencies count at the day’s rate, marked ≈.',
    currencyNow: (code: string) => `Money is counted in ${currencyLabel(code)} now.`,
    listTitle: 'What this list is called',
    listWhy: 'Everywhere it is named, for everyone here. Its entries stay as they are.',
    save: 'Change it',
    cancel: 'Leave it',
    noMoney: 'No plugin here keeps a currency, so there is nothing to change.',
    undone: 'Put back as it was.',
  } as const;

  let busy = $state(false);
  let fix = $state('');
  let typed = $state('');
  /* THE BOX STARTS ON WHAT IT IS NOW, each time the sheet opens. */
  $effect(() => {
    if (!open) return;
    fix = '';
    typed = what.kind === 'list' ? what.name : (what.code ?? '');
  });

  const choices = $derived(what.kind === 'currency' ? currencyOptions(what.code ?? '') : null);

  /** The add-on that keeps the currency and what it holds now, read when it is changed and not before. */
  async function moneyPack(): Promise<{ id: string; was: string | null; set: (code: string | null) => Promise<{ ok: boolean; fix?: string }> } | null> {
    const [{ createClient }, { live }, { currencyPackOf, HOME_CURRENCY }] = await Promise.all([
      import('@braindog/client'),
      import('$lib/record/packs.ts'),
      import('../../routes/settings/[area]/words-money.ts'),
    ]);
    const source = live(createClient({ base: apiBase() }));
    const held = await source.packs();
    if (!held.ok) return null;
    const read = await Promise.all(held.value.filter((p) => p.disabled_at === null).map(async (state) => ({ state, settings: await source.config(state.id).then((c) => (c.ok ? c.value : null)) })));
    const pack = currencyPackOf(read);
    if (pack === null) return null;
    const was = typeof pack.values[HOME_CURRENCY] === 'string' ? (pack.values[HOME_CURRENCY] as string) : null;
    return {
      id: pack.id,
      was,
      set: async (code) => {
        const out = await source.setConfig(pack.id, { [HOME_CURRENCY]: code });
        return out.ok ? { ok: true } : { ok: false, fix: out.refusal.fix };
      },
    };
  }

  async function changed(): Promise<void> {
    const { forget } = await import('$lib/record/boot-live.ts');
    forget();
    await invalidateAll();
    await onchanged?.();
  }

  async function save(e?: Event): Promise<void> {
    e?.preventDefault();
    if (busy) return;
    const next = typed.trim();
    if (next === '') return;
    busy = true;
    fix = '';
    try {
      if (what.kind === 'currency') {
        const pack = await moneyPack();
        if (pack === null) return void (fix = words.noMoney);
        if ((pack.was ?? '').toUpperCase() === next.toUpperCase()) return void (open = false);
        const out = await pack.set(next);
        if (!out.ok) return void (fix = out.fix ?? '');
        open = false;
        await changed();
        toasts.push(words.currencyNow(next), { undo: () => void pack.set(pack.was).then(() => changed().then(() => toasts.push(words.undone))) });
      } else {
        const { renameListNow } = await import('$lib/record/list-name.ts');
        const id = what.id;
        const out = await renameListNow(apiBase(), id, next);
        if (!out.ok) return void (fix = out.fix);
        open = false;
        await changed();
        const was = out.renamed.was;
        toasts.push(out.renamed.said, { undo: () => void renameListNow(apiBase(), id, was).then(() => changed().then(() => toasts.push(words.undone))) });
      }
    } finally {
      busy = false;
    }
  }
</script>

<Sheet bind:open title={what.kind === 'currency' ? words.currencyTitle : words.listTitle}>
  <form class="here" onsubmit={save}>
    <p class="here-why">{what.kind === 'currency' ? words.currencyWhy : words.listWhy}</p>
    {#if what.kind === 'currency' && choices}
      <span class="field">
        <select class="field-input" aria-label={words.currencyTitle} bind:value={typed} disabled={busy}>
          {#each choices.common as c (c.code)}<option value={c.code}>{c.label}</option>{/each}
          {#if choices.other.length > 0}
            <optgroup label="More">
              {#each choices.other as c (c.code)}<option value={c.code}>{c.label}</option>{/each}
            </optgroup>
          {/if}
        </select>
      </span>
    {:else}
      <span class="field"><input class="field-input" type="text" maxlength="40" aria-label={words.listTitle} bind:value={typed} disabled={busy} /></span>
    {/if}
    {#if fix}<p class="here-fix" role="alert">{fix}</p>{/if}
    <div class="here-acts">
      <Button weight="primary" type="submit" disabled={busy || typed.trim() === ''}>{words.save}</Button>
      <Button weight="bare" onclick={() => (open = false)}>{words.cancel}</Button>
    </div>
  </form>
</Sheet>

<style>
  .here {
    display: grid;
    gap: var(--sp-3);
  }

  .here-why,
  .here-fix {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .here-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
