<!--
  One shape, five states. Collapsing them into a single "Nothing here yet" is the failure.

  The record is empty on day one, and that is the likeliest recorded cause of death — an empty TYPED
  register is less legible than an empty notes app, because the columns advertise what you have not
  done. So an empty state is a class of designed thing, not an afterthought (13 §5).

  Three rules the copy obeys: be specific about what WILL be here; a CTA is Verb + Noun, never
  "Get Started"; and the CTA is a real button or link, so it joins the tab order.

  THE WHOLE SCREEN'S FORM IS ONE TILE ON THE BOARD: 24 in (20 on a phone), at most
  640 wide, centred on the page. In it, the glyph in a 40px NEUTRAL well, the title at 17/600 in
  ink, the one line at 15/22 in `--ink-2`, and 12 under it the ONE action, which the caller passes as
  `Button weight="primary"`; a second action is quiet. Then the agent prompt in a `CodeLine` with its Copy. Inside a
  tile, a sheet or a panel the same column is drawn on that surface, because a tile never holds a tile.

  INSIDE A SECTION it is the compact one line, its action at the trailing edge (below).

  `cleared` has no action, because nobody manufactures work.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import * as clipboard from '../clipboard.ts';
  import { copy } from '../copy.ts';
  import type { Snippet } from 'svelte';

  import CodeLine from './CodeLine.svelte';
  import Icon from './Icon.svelte';
  import IconWell from './IconWell.svelte';
  import { inline } from 'braindog-render';
  import { Text } from 'braindog-render/svelte';
  import { drew, undrew } from './screen.svelte.ts';
  import { screenSays } from './empty-part.ts';
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
    icon,
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
     * title of the not-found screen. The sentence says what happened in their words; this keeps the
     * transport's words one press away for whoever reports the fault.
     */
    detail?: string | undefined;
    /**
     * The host's glyph drawings, for a title an AUTHOR wrote (a block's `empty:`), so `{{icon:rocket}} shipped` draws
     * the rocket rather than its braces. Absent, the title is drawn as the plain text it always was, which is
     * every title typed in `copy`.
     */
    icon?: ((name: string) => string | null) | undefined;
  } = $props();

  /**
   * One glyph per kind, and none for `no-data-yet`.
   *
   * Five states were designed as five different things and then drawn as one paragraph in five colours, so the
   * difference between "nothing here yet" and "you cannot see this" was carried by the sentence alone.
   *
   * NOTHING-YET HAS NO GLYPH OF ITS OWN BECAUSE IT HAS NO SUBJECT OF ITS OWN. It was the three-line menu glyph, so
   * Automations, Machines, Usage, Slash and Home all drew a hamburger beside their first-use sentence;
   * a whole screen passes the glyph of what will be there, and one that passes none draws the sentence alone.
   */
  const GLYPH: Record<EmptyKind, IconName | null> = {
    'no-data-yet': null,
    'no-results': 'search',
    cleared: 'check',
    'no-permission': 'lock',
    error: 'alert',
  };

  /* THE WELL IS NEUTRAL IN EVERY KIND: the title says what happened, and a red or green square beside a sentence is a
     second voice saying it louder. */
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
    /* A COMPACT ONE IS A PART INSIDE A SECTION and says nothing unless it is a refusal (`empty-part.ts`): one
       "Nothing matched." under a project's money section settled the whole page `empty`. */
    const said = screenSays(kind, compact);
    if (said === null) return;
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

<div class="empty" data-kind={kind} data-surface={compact ? undefined : 'tile'} class:compact>
  {#if shown && !compact}<span class="empty-glyph" aria-hidden="true"><IconWell name={shown} size="card" /></span>{/if}
  {#if heading}
    <h1 class="empty-title">{#if icon}<Text nodes={inline(title, { icon })} opts={{ icon }} />{:else}{title}{/if}</h1>
  {:else}
    <p class="empty-title">{#if icon}<Text nodes={inline(title, { icon })} opts={{ icon }} />{:else}{title}{/if}</p>
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
  {#if actions}<div class="empty-actions">{@render actions()}</div>{/if}
  {#if agentPrompt}
    <!-- "YOUR AGENT", NOT SLASH: the prompt under it is a line to paste into an agent outside BrainDog (Claude Code, a
         terminal), which Slash cannot run, so naming Slash here would promise something untrue. AFTER the action: the
         screen's own way on comes first, and the agent's is the other way. -->
    <div class="empty-prompt">
      <p class="empty-agent">Or ask your agent:</p>
      <CodeLine text={agentPrompt} />
    </div>
  {/if}
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

  /* A COMPACT ONE SITS AT THE START, in the column of start-aligned lines it is one of (19 §6). */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-inline-size: 0;
  }

  /* THE WHOLE SCREEN'S FORM: one tile at most 640 wide, CENTRED, its words and its one action centred in it: a
     refusal or an empty screen is the only thing on the page, so it sits where the eye lands, not at the start edge. */
  .empty:not(.compact) {
    align-items: center;
    margin-inline: auto;
    text-align: center;
    max-inline-size: 640px;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  @media (width < 640px) {
    .empty:not(.compact) {
      padding: calc(var(--sp-4) + var(--sp-1));
    }
  }

  /* ON A SURFACE ALREADY, the same column without a second tile: a tile never holds a tile. `:where`, so a section's
     compact line below still outranks it. */
  :global(:where(.tile, .sheet, dialog, [data-surface='tile'], .block-slot)) .empty:not(.compact) {
    align-items: flex-start;
    margin-inline: 0;
    text-align: start;
    max-inline-size: 56ch;
    padding: var(--sp-2) 0;
    background: none;
    border-radius: 0;
  }

  /* THE WELL, 40px and neutral, 16 above the title. */
  .empty-glyph {
    display: flex;
    margin-block-end: var(--sp-2);
  }

  /* 17 AT 600 IN INK: an empty state is a sentence, not a poster, and it leads the space the rows would fill the way a
     tile's title would. */
  .empty-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
   * So the sentence is `--fs-body` at 400 in the secondary ink, under a tile title of the same
   * size at 600, with the action at the trailing edge. The body goes, because the body is the
   * register's `holds:` sentence and it is already on the register's own screen, which is where
   * the action leads. The agent line goes with it for the same reason: four copies of one prompt is
   * not four times the help.
   *
   * INSIDE A `Section` THIS IS THE FORM WHETHER OR NOT THE CALLER SAID `compact`. The whole-screen
   * form belongs to a state that IS the screen, and a section is never that. `Section` draws a tile
   * that also carries `section`, and nothing else does, so the ancestor selector names exactly the
   * case and no caller has to be edited to be right.
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
    border-radius: 0;
  }

  .empty.compact .empty-title,
  :global(section.section) .empty .empty-title {
    color: var(--ink-2);
    font-family: inherit;
    font-size: var(--fs-body);
    font-weight: var(--fw-regular);
    line-height: 22px;
    letter-spacing: normal;
  }

  /* THE FRAME IS GONE AND SO IS THE COLUMN, so the parts that only made sense stacked go too. The
     refusal lines stay: on an `error` block they are the whole content, and a block that cannot say
     which clause it failed on is the silence this component exists to break. The glyph is not drawn
     at all when `compact` is passed; this hides the one a section's empty state was handed. */
  .empty.compact .empty-body,
  .empty.compact .empty-prompt,
  :global(section.section) .empty .empty-glyph,
  :global(section.section) .empty .empty-body,
  :global(section.section) .empty .empty-prompt {
    display: none;
  }

  /* EXCEPT A REFUSAL'S BODY, WHICH IS THE RECORD'S OWN SENTENCE. The Keychain's Keys and Machines sections draw "not
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

  /* THE ONE LINE: 15/22 in the second ink, at the measure. */
  .empty-body {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .empty-query {
    margin: 0;
  }

  .empty-query code,
  .empty-rid code {
    padding: 2px 6px;
    background: var(--tile-2);
    border-radius: var(--r-xs);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  .empty-rid {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* TWELVE UNDER THE LINE: the column's 8 and 4 more. */
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-1);
  }

  /* A CENTRED SCREEN CENTRES ITS ACTIONS TOO. With a full-width line in the row (the not-found page's nearest pages,
     `NearLinks`), the row spanned the tile and its buttons sat at the start edge under a centred title. `--row-justify`
     carries the same choice into that line's own list. On a surface the screen reads from its start, as before. */
  .empty:not(.compact) .empty-actions {
    justify-content: center;
    --row-justify: center;
  }

  :global(:where(.tile, .sheet, dialog, [data-surface='tile'], .block-slot)) .empty:not(.compact) .empty-actions {
    justify-content: flex-start;
    --row-justify: flex-start;
  }

  /* THE AGENT'S WAY ON, 16 under the action, the prompt in its copyable line. */
  /* CODE READS FROM ITS START: a centred empty state centres its words, never a command or a prompt to paste. */
  .empty :global(.code-line) {
    text-align: start;
  }

  .empty-prompt {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    align-self: stretch;
    min-inline-size: 0;
    margin-block-start: var(--sp-2);
  }

  .empty-agent {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* THE REASON IS QUIET AND WRAPS, as `ReadState`'s is. It is there for whoever reports the fault,
     so it sits under the action in the secondary ink, and an address or a path inside it breaks
     rather than pushing the page sideways at 320. */
  .empty-details {
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* THE TITLE STAYS INK IN EVERY KIND. The well is neutral; a whole sentence in the alarm colour is harder to read and
     says nothing the words do not. */
</style>
