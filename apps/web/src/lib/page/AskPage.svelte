<!--
  Change a page by describing it: one field, Slash's drafts drawn as the page would stand, and one press to keep one.

  NOTHING IS FILED BY ASKING. The press calls the record's `slashDraft`, which drafts, checks and draws each change and
  keeps none of it. What the owner sees is the page as each draft would make it, beside the page as it is, through the
  same reader every declared page goes through (`PageView mode="preview"`). Only then does a press file it: "Keep it"
  files it and accepts it in one go, "Ask in Needs you" files it for later, and "Throw away" drops it unfiled. "Try again"
  asks the same words once more with the draft shown handed back as turned down, so Slash drafts another way; the one
  turned down is dropped unfiled, and the record leaves it out if it comes back.

  ONE COMPONENT FOR BOTH PLACES A DESCRIPTION IS TYPED. With `page` it is the sheet a page's head opens, about that
  page; without it it is the Slash screen's describe field, about the whole BrainDog. The drafts are drawn the same
  way in both, so what the owner learns to read in one is what they read in the other.

  ONE DRAFT DRAWN AT A TIME. A page drawn twice on one screen writes its ids twice, and a sheet holding two whole pages
  side by side with their old selves is too long to compare anything in; with several drafts, the questions are a list
  to choose from and the chosen one is drawn.
-->
<script lang="ts">
  import { apiBase, at } from '../at.ts';
  import { createClient } from '@braindog/client';
  import { forget } from '$lib/record/boot-live.ts';
  import { byRules, changeWords as words, draftChange, fileDrafted, type Drafted, type Kept, type SlashClient } from '$lib/record/slash.ts';
  import type { Rehearsed } from '../../routes/decide/[id]/proposed.ts';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageView from './PageView.svelte';
  import type { SaidPage, SayIn } from './say-page.ts';
  import { sayWords } from './say-page.ts';

  let {
    page: about,
    model,
    ask,
    onkept,
    built,
    say,
  }: {
    /** The page the description is about, by its address. Left out on the Slash screen, which is about everything. */
    page?: string | undefined;
    /** Whether this host has a model for Slash to draft with; without one the field is not offered at all. */
    model: boolean;
    /** A line already typed (a block's "Change this" the rules could not read), sent once on opening. */
    ask?: string | undefined;
    /** Called once a draft is kept, so the page behind reads itself again. */
    onkept?: (() => void | Promise<void>) | undefined;
    /**
     * The body a page the record holds none of yet is drawn from (Today, Decide), which the draft changes; keeping it
     * is the page's first write. Left out for a page the record holds.
     */
    built?: (() => Promise<unknown>) | undefined;
    /**
     * What the rules read a line against (`say-page.ts`): the page's own body, its blocks as drawn, his look and the lists.
     * Read first, before the model, so "move Bills up" or "show only open ones" is a draft at once and for nothing, and
     * works with no model. Left out where the page cannot be changed that way (a home the record holds none of yet).
     */
    say?: (() => Promise<Omit<SayIn, 'text'> | null>) | undefined;
  } = $props();

  /** One draft as the sheet holds it: what the record drew for it, and what a press on it came to. */
  type Shown = { key: number; draft: Drafted; drawn: Rehearsed | null; kept: Kept | null; said: string | null; busy: boolean; rule?: Ruled };
  /** A draft the rules made: what it does, and the page it was read against, which Undo puts back. */
  type Ruled = { said: Exclude<SaidPage, { do: 'which' }>; ctx: Omit<SayIn, 'text'>; version: number | null };

  let asked = $state('');
  let started = false;
  let sending = $state(false);
  /** The record's sentence for a description it would not draft from. */
  let fix = $state<string | null>(null);
  /** Whether the last answer came from Slash's own rules, which is when the source is offered instead. */
  let rules = $state(false);
  let answered = $state(false);
  let dropped = $state.raw<string[]>([]);
  /** What asking the model cost, as the record said it (§45: "each draft says what it cost"), or `null` when it was not asked. */
  let cost = $state<string | null>(null);
  let shown = $state.raw<Shown[]>([]);
  let chosen = $state(0);
  /** The words last sent, and the drafts turned down for them by Try again, which a new description forgets. */
  let lastAsked = '';
  let tried: Drafted[] = [];

  /* A LINE HANDED IN IS SENT ONCE, as if typed, so the model reads it only after the rules would not. */
  $effect(() => {
    if (started || (!model && !say) || !ask) return;
    started = true;
    asked = ask;
    void send();
  });

  /* EACH SEND IS NUMBERED, so drafts and drawings that arrive after a newer send are not drawn under its words. */
  let sends = 0;

  const current = $derived(shown[chosen] ?? null);
  const fieldId = $derived(about === undefined ? 'slash-described' : 'page-described');

  /* THE RECORD'S CLIENT, typed as the pure half takes it, as the Slash screen hands it. */
  const client = (): SlashClient => createClient({ base: apiBase() }) as unknown as SlashClient;

  const put = (key: number, patch: Partial<Shown>) => {
    shown = shown.map((s) => (s.key === key ? { ...s, ...patch } : s));
  };

  async function send(again = false) {
    const text = again ? lastAsked : asked.trim();
    if (sending || text === '') return;
    if (!again) tried = [];
    lastAsked = text;
    sending = true;
    fix = null;
    cost = null;
    const mine = ++sends;
    try {
      /* THE RULES FIRST, on a new line (never on Try again, which asks the model for another way): a draft at once. */
      if (!again && say) {
        const ruled = await ruleDraft(text, mine);
        if (mine !== sends) return;
        if (ruled === 'which') return;
        if (ruled) return;
        if (!model) {
          answered = true;
          shown = [];
          fix = sayWords.cannot;
          return;
        }
      } else if (!model) {
        answered = true;
        fix = sayWords.rulesOnly;
        return;
      }
      const body = built === undefined ? undefined : ((await built()) ?? undefined);
      const out = await draftChange(client(), text, about, body, tried);
      if (mine !== sends) return;
      answered = true;
      if (!out.ok) {
        fix = out.fix;
        return;
      }
      rules = byRules(out.drafted);
      dropped = out.drafted.dropped;
      cost = out.drafted.cost?.said ?? null;
      shown = out.drafted.drafts.map((draft, i) => ({ key: mine * 1000 + i, draft, drawn: null, kept: null, said: null, busy: false }));
      chosen = 0;
      /* DRAWN THROUGH DECIDE'S OWN PREVIEW, loaded on the first send and not with every page. The record drew each
         draft once to check it, as bare blocks; `previewOf` asks it again as the change and its sample rows, and turns
         the answer into what the reader draws, lists the change brings and refs walked, which is the one conversion a
         proposal on Decide goes through too. */
      const { previewOf } = await import('../../routes/decide/[id]/proposed.ts');
      for (const s of shown) {
        const rows = Object.keys(s.draft.rows).length > 0 ? { rows: s.draft.rows } : {};
        void previewOf({ to: s.draft.change.to, ...rows }, apiBase())
          .then((drawn) => {
            if (mine === sends) put(s.key, { drawn });
          })
          .catch(() => {
            if (mine === sends) put(s.key, { drawn: { from: 'none' } });
          });
      }
    } catch {
      if (mine === sends) fix = words.unreached;
    } finally {
      sending = false;
    }
  }

  /**
   * THE LINE READ BY THE RULES (`say-page.ts`): a draft drawn as the model's are, through Decide's own preview, but kept
   * by the one writer its kind has (his look, the page's body, or the list's name), with an Undo. `true` when it drafted,
   * `'which'` when it asked which block was meant, `false` when the rules could not read it.
   */
  async function ruleDraft(text: string, mine: number): Promise<boolean | 'which'> {
    let ctx: Omit<SayIn, 'text'> | null = null;
    try {
      ctx = (await say?.()) ?? null;
    } catch {
      ctx = null;
    }
    if (ctx === null || mine !== sends) return false;
    const { sayPage } = await import('./say-page.ts');
    const said = sayPage({ ...ctx, text });
    if (said === null) return false;
    answered = true;
    dropped = [];
    cost = null;
    rules = false;
    if (said.do === 'which') {
      shown = [];
      fix = said.said;
      return 'which';
    }
    const id = `page.${ctx.body.page}`;
    const draft: Drafted = { question: said.question, change: { to: { id, kind: 'page', body: said.do === 'look' ? said.preview : said.do === 'body' ? said.body : ctx.body } }, rows: {}, preview: { pages: [] } };
    const key = mine * 1000;
    shown = [{ key, draft, drawn: said.do === 'rename' ? { from: 'none' } : null, kept: null, said: null, busy: false, rule: { said, ctx, version: ctx.version ?? null } }];
    chosen = 0;
    if (said.do !== 'rename') {
      const { previewOf } = await import('../../routes/decide/[id]/proposed.ts');
      void previewOf({ to: draft.change.to }, apiBase())
        .then((drawn) => mine === sends && put(key, { drawn }))
        .catch(() => mine === sends && put(key, { drawn: { from: 'none' } }));
    }
    return true;
  }

  /** Keeps a rules draft by its own writer, and says so with the way back. */
  async function keepRule(s: Shown & { rule: Ruled }) {
    const { said, ctx } = s.rule;
    put(s.key, { busy: true, said: null });
    const base = apiBase();
    try {
      let undo: (() => Promise<unknown>) | null = null;
      if (said.do === 'look') {
        const { bodyOf, retireLook, writeLook } = await import('./look.ts');
        const was = ctx.look;
        const out = await writeLook(base, said.look);
        if (!out.ok) return put(s.key, { busy: false, said: out.fix });
        undo = () => (was && was.by === 'owner' ? writeLook(base, bodyOf(ctx.slug, was)) : retireLook(base, ctx.slug));
      } else if (said.do === 'body') {
        const { setBody } = await import('$lib/record/page-write.ts');
        const out = await setBody(base, said.body, undefined, s.rule.version);
        if (out.from !== 'written') return put(s.key, { busy: false, said: out.fix });
        const made = out.version;
        undo = () => setBody(base, ctx.body, undefined, made);
      } else {
        const { renameListNow } = await import('$lib/record/list-name.ts');
        const out = await renameListNow(base, said.list, said.name);
        if (!out.ok) return put(s.key, { busy: false, said: out.fix });
        undo = () => renameListNow(base, said.list, out.renamed.was);
      }
      forget();
      put(s.key, { busy: false, kept: { kind: 'kept' } });
      await onkept?.();
      const back = undo;
      toasts.push(said.said, {
        undo: () =>
          void back().then(async () => {
            forget();
            await onkept?.();
            toasts.push(sayWords.undone);
          }),
      });
    } catch {
      put(s.key, { busy: false, said: words.unreached });
    }
  }

  /** Keep a draft (file and accept) or only file it; a double press files once. */
  async function settle(key: number, keep: boolean) {
    const s = shown.find((x) => x.key === key);
    if (!s || s.busy || s.kept) return;
    if (s.rule) return void keepRule(s as Shown & { rule: Ruled });
    put(key, { busy: true, said: null });
    try {
      const kept = await fileDrafted(client(), s.draft, keep);
      /* THE RAIL'S DECIDE COUNT IS THE KEPT BOOT'S, and a filed change moves it whether or not it was accepted. */
      forget();
      if (kept.kind === 'refused') {
        put(key, { busy: false, said: kept.fix });
        return;
      }
      put(key, { busy: false, kept });
      if (kept.kind === 'kept') await onkept?.();
    } catch {
      put(key, { busy: false, said: words.unreached });
    }
  }

  /** Turn the draft shown down and ask the same words again: it goes unfiled, and Slash is told not to draft it again. */
  function retry(key: number) {
    const s = shown.find((x) => x.key === key);
    if (!s || s.busy || s.kept || sending) return;
    /* A RULES DRAFT TURNED DOWN ASKS THE MODEL for another way, with nothing of its own to hand back. */
    if (!s.rule) tried = [...tried, s.draft];
    void send(true);
  }

  function drop(key: number) {
    shown = shown.filter((s) => s.key !== key);
    chosen = Math.max(0, Math.min(chosen, shown.length - 1));
  }
</script>

<div class="ask">
  {#if !model && !say}
    <!-- NO FIELD THAT COULD NEVER WORK. Slash's own rules read how the record is used and cannot read a sentence, so
         with no model the sheet says so. -->
    <p class="ask-said">{words.noModel}</p>
  {:else}
    <form
      class="ask-form"
      onsubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label class="ask-hint" for={fieldId}>{about === undefined ? words.hintRecord : words.hintPage}</label>
      {#if about !== undefined && say}<p class="ask-said ask-examples">{sayWords.hint}</p>{/if}
      <textarea
        id={fieldId}
        class="ask-field"
        rows="3"
        placeholder={about === undefined ? words.placeholderRecord : words.placeholderPage}
        spellcheck="true"
        bind:value={asked}
      ></textarea>
      <div>
        <Button weight="primary" type="submit" disabled={sending || asked.trim() === ''}>{sending ? words.sending : words.send}</Button>
      </div>
    </form>

    {#if fix !== null}
      <p class="ask-said" role="alert">{fix}</p>
    {/if}

    {#if dropped.length > 0}
      <ul class="ask-dropped">
        {#each dropped as d (d)}<li class="ask-said">{d}</li>{/each}
      </ul>
    {/if}

    {#if cost !== null}
      <p class="ask-said ask-cost">{cost}</p>
    {/if}

    {#if answered && fix === null && shown.length === 0 && dropped.length === 0}
      <p class="ask-said">{words.none}</p>
    {/if}

    {#if shown.length > 1}
      <ul class="ask-picks" aria-label={words.which}>
        {#each shown as s, i (s.key)}
          <li>
            <button type="button" class="ask-pick" aria-pressed={i === chosen} onclick={() => (chosen = i)}>{s.draft.question}</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if current}
      {@const c = current}
      <section class="ask-draft" aria-label={c.draft.question}>
        {#if shown.length === 1}<p class="ask-question">{c.draft.question}</p>{/if}

        {#if c.rule && c.rule.said.do === 'rename'}
          <p class="ask-said">{c.rule.said.said}</p>
        {:else if c.drawn === null}
          <p class="ask-said" role="status">{words.drawing}</p>
        {:else if c.drawn.from === 'refused'}
          <p class="ask-said">{c.drawn.fix}</p>
        {:else if c.drawn.from === 'live'}
          {#each c.drawn.pages as tried, i (`${i}:${tried.id}`)}
            <PageView slug={tried.slug} got={tried.got} mode="preview" was={tried.was} />
          {:else}
            <p class="ask-said">{words.noPage}</p>
          {/each}
        {:else}
          <p class="ask-said">{words.unDrawn}</p>
        {/if}

        {#if c.kept === null}
          {#if c.said !== null}<p class="ask-said" role="alert">{c.said}</p>{/if}
          <div class="ask-actions">
            <Button weight="primary" disabled={c.busy} onclick={() => void settle(c.key, true)}>{c.busy ? words.keeping : words.keep}</Button>
            {#if !c.rule}<Button disabled={c.busy} onclick={() => void settle(c.key, false)}>{words.file}</Button>{/if}
            {#if model}<Button disabled={c.busy || sending} onclick={() => retry(c.key)}>{sending ? words.againing : words.again}</Button>{/if}
            <Button weight="bare" disabled={c.busy} onclick={() => drop(c.key)}>{words.drop}</Button>
          </div>
        {:else if c.kept.kind === 'kept'}
          <p class="ask-said" role="status">{words.kept}</p>
        {:else if c.kept.kind === 'filed'}
          <!-- A KEEP THE RECORD WOULD NOT ACCEPT IS STILL FILED, and says why beside where it waits. -->
          <p class="ask-said" role="status">
            {#if c.kept.fix}{c.kept.fix}{/if}
            {words.filed}
            <a class="ask-link" href={at(c.kept.href)}>{words.open}</a>
          </p>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .ask {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .ask-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .ask-hint,
  .ask-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* DECIDE'S REASON FIELD, the same box the Slash screen's field was, so a sentence typed here and one typed on Decide
     sit in the same kind of box. */
  .ask-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    resize: vertical;
  }

  .ask-examples {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ask-dropped,
  .ask-picks {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A QUESTION TO CHOOSE, a full-width row a thumb can press, with the chosen one marked by more than its colour. */
  .ask-pick {
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: pointer;
  }

  .ask-pick:hover {
    background: var(--hover);
  }

  .ask-pick[aria-pressed='true'] {
    border-color: var(--ink);
    font-weight: 600;
  }

  .ask-draft {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .ask-question {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .ask-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .ask-link {
    color: inherit;
    text-decoration: underline;
  }
</style>
