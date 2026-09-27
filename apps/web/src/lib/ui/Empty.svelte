<!--
  One shape, five states. Collapsing them into a single "Nothing here yet" is the failure.

  The record is empty on day one, and that is the likeliest recorded cause of death — an empty TYPED
  register is less legible than an empty notes app, because the columns advertise what you have not
  done. So an empty state is a class of designed thing, not an afterthought (13 §5).

  Three rules the copy obeys: be specific about what WILL be here; a CTA is Verb + Noun, never
  "Get Started"; and the CTA is a real button or link, so it joins the tab order.

  `cleared` has no action, because nobody manufactures work.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import * as clipboard from '../clipboard.ts';
  import { copy } from '../copy.ts';
  import type { Snippet } from 'svelte';

  import Icon from './Icon.svelte';
  import { drew, undrew } from './screen.svelte.ts';
  import type { IconName } from './icons.ts';

  export type EmptyKind = 'no-data-yet' | 'no-results' | 'cleared' | 'no-permission' | 'error';

  let {
    kind,
    title,
    body,
    query,
    rid,
    actions,
    agentPrompt,
    heading = false,
    lines,
    compact = false,
    glyph,
    detail,
  }: {
    kind: EmptyKind;
    title: string;
    /**
     * `true` when this empty state IS the page.
     *
     * A not-found route renders nothing but this, so its title is the page's only heading and has
     * to be the `h1` — a document with no level-one heading gives a screen reader nothing to jump
     * to and nothing to announce, and every one of these pages was a `<p>`. Inside a block or a
     * section it stays a paragraph, because the block already has the heading and a second `h1`
     * halfway down the page is worse than none.
     */
    heading?: boolean;
    body?: string | undefined;
    /** Quoted VERBATIM. "38 rows, none matching `overdue`" is the whole of the state. */
    query?: string | undefined;
    /** A copyable request id, always. One sentence in the house voice, never a stack trace. */
    rid?: string | undefined;
    actions?: Snippet | undefined;
    /** The highest-value line in the product: the buyer already has agents, and an empty register is
        the right place to say so. */
    agentPrompt?: string | undefined;
    /** One line per thing that was wrong, each already a whole sentence. */
    lines?: string[] | undefined;
    /**
     * Inside a frame that already has one.
     *
     * A block draws its own heading, so the full column here would be a second title under the
     * first. Compact is one line at the body size with its action, and no glyph: the same five
     * designed states rather than a sixth shape that drifts from them. Inside a `Section` it is
     * compact whether or not this is passed (the style block below says how).
     */
    compact?: boolean;
    /** The glyph of the screen's subject, drawn only on the whole-screen form: a broken invite is a link. */
    glyph?: IconName | undefined;
    /**
     * The technical reason, folded under "Details" and never the content.
     *
     * A PERSON TOLD "200 WITH A BODY THAT IS NOT JSON" HAS BEEN TOLD NOTHING THEY CAN ACT ON, and that string was the
     * title of the not-found screen (design SYS-8). The sentence says what happened in their words; this keeps the
     * transport's words one press away for whoever reports the fault.
     */
    detail?: string | undefined;
  } = $props();

  /**
   * One glyph per kind, and none for `no-data-yet`.
   *
   * Five states were designed as five different things and then drawn as one paragraph in five colours, so the
   * difference between "nothing here yet" and "you cannot see this" was carried by the sentence alone.
   *
   * NOTHING-YET HAS NO GLYPH OF ITS OWN BECAUSE IT HAS NO SUBJECT OF ITS OWN. It was the three-line menu glyph, so
   * Automations, Machines, Usage, Slash and Home all drew a hamburger beside their first-use sentence (design SYS-8);
   * a whole screen passes the glyph of what will be there, and one that passes none draws the sentence alone.
   */
  const GLYPH: Record<EmptyKind, IconName | null> = {
    'no-data-yet': null,
    'no-results': 'search',
    cleared: 'check',
    'no-permission': 'lock',
    error: 'alert',
  };

  const shown = $derived(glyph ?? GLYPH[kind]);

  /**
   * THE HALF OF THE READINESS CONTRACT THAT COSTS NO ROUTE ANYTHING.
   *
   * Eighteen of the nineteen `+page.svelte` files import this component, so `empty` and `refused`
   * land in one file rather than in eighteen, and a screen drawing one of these five states says so
   * without its route being edited.
   *
   * THE FIVE KINDS MAP ONTO TWO VALUES WITHOUT INVENTING A VOCABULARY. `error` is already this
   * component's refusal state, which is what the request id below is keyed on, and the other four
   * are a screen that has an answer and the answer is nothing. A gate measures a designed empty
   * state normally and must not measure a refusal, which is the whole reason they are told apart.
   */
  $effect(() => {
    const said = kind === 'error' ? 'refused' : 'empty';
    /**
     * `untrack`, AND WITHOUT IT EVERY DESIGNED EMPTY STATE IN THE PRODUCT THREW.
     *
     * `drew` reaches `screen.svelte.ts`, whose `s.empties++` and `s.refusals++` both READ and
     * write the same `$state`. An effect that reads what it writes depends on itself, so Svelte
     * reran this one until it gave up: `effect_update_depth_exceeded`, on `/p/nowhere`, `/v/nope`,
     * `/nowhere` and `/decide/ZZ99`, which is four of the five states this component exists to
     * draw. The markup was correct throughout, which is why it survived: the only symptom is a
     * console nobody reads on a screen nobody expects to be interesting.
     *
     * The dependency this effect is meant to have is `kind`, and `said` above already reads it.
     * Everything after that is the notification, and a notification is not a dependency.
     */
    untrack(() => drew(said));
    /* AND IT IS TAKEN BACK WHEN THIS GOES. An `Empty` mounts for a frame on a list whose first page
       is still being assembled, and without the teardown that frame set the answer for the life of
       the screen: thirty-nine rows drawn and `data-screen="empty"` over them. */
    return () => untrack(() => undrew(said));
  });
</script>

<div class="empty" data-kind={kind} class:compact>
  {#if shown && !compact}<span class="empty-glyph" aria-hidden="true"><Icon name={shown} size="xl" /></span>{/if}
  {#if heading}
    <h1 class="empty-title">{title}</h1>
  {:else}
    <p class="empty-title">{title}</p>
  {/if}
  {#if body}<p class="empty-body">{body}</p>{/if}
  {#if lines?.length}
    <ul class="empty-lines">
      {#each lines as line}<li>{line}</li>{/each}
    </ul>
  {/if}
  {#if query}<p class="empty-query"><code>{query}</code></p>{/if}
  <!--
    THE REQUEST ID IS A FACT ABOUT A FAILURE, and it appeared on four `no-results` screens where
    nothing had failed — which teaches a reader that it means nothing, and it is the one thing on
    the screen that has to mean something when it matters. `kind === 'error'` is the only state
    there is a request to look up for: a spoken id that resolves to nothing was never a request.

    AND IT IS COPYABLE, which `13 §5.2` asks for in as many words. One noun and an opaque token
    with no sentence and no affordance is a string somebody transcribes wrong into an email.
  -->
  {#if rid && kind === 'error'}
    <p class="empty-rid">
      If you report this, quote
      <button type="button" class="rid tap" onclick={() => void clipboard.put(rid)}>
        <code>{rid}</code><Icon name="copy" size="s" />
      </button>
    </p>
  {/if}
  {#if agentPrompt}
    <p class="empty-agent">Or ask your assistant:</p>
    <pre class="empty-prompt"><code>{agentPrompt}</code></pre>
  {/if}
  {#if actions}<div class="empty-actions">{@render actions()}</div>{/if}
  {#if detail}
    <details class="empty-details">
      <summary class="empty-summary tap">{copy.readDetails}</summary>
      <p class="empty-reason">{detail}</p>
    </details>
  {/if}
</div>

<style>
  /* A control, because it is one: the id is there to be taken somewhere else. */
  .rid {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* No box: the state sits on the page's own ground, the way the rows it stands in for do. */
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 56ch;
    padding-block: var(--sp-4);
  }

  /* Nothing is centred: centring one line in a row of left-aligned ones is worse than not marking
     it at all, and a tight empty state inside a block's own frame keeps the page's shape (19 §6). */
  /* The bare glyph, no tile. It takes the kind's tone where there is one and the dim ink where
     there is not. Absence is not an alarm: `no-data-yet` and `no-results` are ordinary and must not
     arrive in the danger colour just because they are empty. */
  .empty-glyph {
    display: flex;
    margin-block-end: var(--sp-1);
    color: var(--dim);
  }

  .empty[data-kind='error'] .empty-glyph {
    color: var(--danger);
  }

  .empty[data-kind='cleared'] .empty-glyph {
    color: var(--earn);
  }

  /* THE UI FACE, AT THE SIZE OF A SECTION'S LEAD. An empty state is a sentence, not a poster, and
     the display face here made every not-found page louder than the Home it should lead back to. */
  .empty-title {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  /* The refusals, as a list, because they are several separate facts and a joined sentence reads as
     one. */
  .empty-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    list-style: none;
  }

  /**
   * ONE LINE AT THE BODY SIZE, ITS ONE ACTION, AND NO GLYPH.
   *
   * `19 §6` Partial asks a block's empty state for "one line naming what belongs there, and the
   * register link". The first compact form dropped the frame, shrank the glyph and the title, and
   * still drew them with the body and a full-weight button in a column, so an empty money page
   * repeated the same three sentences once per block. The second kept a 20px glyph and a 500-weight
   * title beside it, which is still a heading's weight on a line that is not one.
   *
   * So the sentence is `--t-base` at 400 in the secondary ink, under a section title of the same
   * size at 600, with the action at the trailing edge. The body goes, because the body is the
   * register's `holds:` sentence and it is already on the register's own screen, which is where
   * the action leads. The agent line goes with it for the same reason: four copies of one prompt is
   * not four times the help.
   *
   * INSIDE A `Section` THIS IS THE FORM WHETHER OR NOT THE CALLER SAID `compact`. The whole-screen
   * form belongs to a state that IS the screen, and a section is never that. The settings areas
   * never passed the flag, so "No passkey yet." drew at 16px 600 with the menu glyph under a 14px
   * section title and read as the heading, with the heading as its caption (design SYS-8).
   * `Section` emits `section.section` and nothing else does, so the ancestor selector names exactly
   * the case and no caller has to be edited to be right.
   */
  .empty.compact,
  :global(section.section) .empty {
    flex-direction: row;
    align-items: center;
    /* WRAPPING, because an `error` block keeps its lines and they are the content. One clause per
       line, below the sentence they belong to, rather than run into it. */
    flex-wrap: wrap;
    gap: var(--sp-2);
    max-inline-size: none;
    padding: var(--sp-2) 0;
    background: none;
    border: 0;
  }

  .empty.compact .empty-title,
  :global(section.section) .empty .empty-title {
    color: var(--ink2);
    font-family: inherit;
    font-size: var(--t-base);
    font-weight: 400;
    letter-spacing: normal;
  }

  /* THE FRAME IS GONE AND SO IS THE COLUMN, so the parts that only made sense stacked go too. The
     refusal lines stay: on an `error` block they are the whole content, and a block that cannot say
     which clause it failed on is the silence this component exists to break. The glyph is not drawn
     at all when `compact` is passed; this hides the one a section's empty state was handed. */
  .empty.compact .empty-body,
  .empty.compact .empty-agent,
  .empty.compact .empty-prompt,
  :global(section.section) .empty .empty-glyph,
  :global(section.section) .empty .empty-body,
  :global(section.section) .empty .empty-agent,
  :global(section.section) .empty .empty-prompt {
    display: none;
  }

  /* EXCEPT A REFUSAL'S BODY, WHICH IS THE RECORD'S OWN SENTENCE. The Vault's Keys and Machines sections draw "not
     yours" as the title and the record's reason and remedy ("Ask an owner to raise your access.") as the body, and
     a section that hid it would say a door is shut without saying who holds the key. It takes its own line under the
     title, as the refusal lines do. */
  :global(section.section) .empty:is([data-kind='no-permission'], [data-kind='error']) .empty-body {
    display: block;
    flex-basis: 100%;
  }

  .empty.compact .empty-actions,
  :global(section.section) .empty .empty-actions {
    margin-block-start: 0;
    margin-inline-start: auto;
  }

  .empty.compact .empty-lines,
  .empty.compact .empty-query,
  .empty.compact .empty-rid,
  .empty.compact .empty-details,
  :global(section.section) .empty .empty-lines,
  :global(section.section) .empty .empty-query,
  :global(section.section) .empty .empty-rid,
  :global(section.section) .empty .empty-details {
    flex-basis: 100%;
  }

  .empty-body,
  .empty-agent {
    color: var(--dim);
    max-inline-size: var(--measure);
  }

  .empty-query code,
  .empty-rid code {
    padding: 2px 6px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .empty-rid {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE COMMAND KEEPS THE IDENTIFIER FACE, because it is a literal somebody pastes, and loses the
     box: a sunk, bordered panel read as a terminal on a screen meant for anybody. */
  .empty-prompt {
    margin: 0;
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* THE REASON IS QUIET AND WRAPS, as `ReadState`'s is. It is there for whoever reports the fault,
     so it sits under the action in the secondary ink, and an address or a path inside it breaks
     rather than pushing the page sideways at 320. */
  .empty-details {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .empty-summary {
    inline-size: fit-content;
    cursor: pointer;
  }

  .empty-reason {
    margin-block: var(--sp-1) 0;
    margin-inline: 0;
    max-inline-size: var(--measure);
    overflow-wrap: anywhere;
  }

  /* THE TITLE STAYS INK IN EVERY KIND. The glyph carries the tone; a whole sentence in the alarm
     colour is harder to read and says nothing the glyph beside it does not. */
</style>
