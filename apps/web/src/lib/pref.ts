/**
 * What this person prefers, kept where the shell can read it before it paints.
 *
 * A COOKIE AND NOT `localStorage`, and that is the whole reason this file exists. The app is a
 * STATIC shell — there is no server to write `data-scheme` onto the `<html>` element — so the
 * fourteen bytes of script in `app.html` read this cookie and set the attributes before first
 * paint. `localStorage` is not readable from a synchronous inline script early enough to beat the
 * first frame, so a dark-mode user would see a white flash on every navigation.
 *
 * NOTHING WROTE IT. The parser in `app.html` has been correct since it was written and every
 * preference in this product was lost on refresh: scheme, text size, density, the rail's state,
 * whether bare character keys act. A setting that does not survive a reload is a setting somebody
 * changes once and then stops trusting.
 *
 * IT IS PER DEVICE, NOT PER RECORD. Text size and density are facts about the screen somebody is
 * looking at — a phone and a desk want different answers — so they belong beside the browser rather
 * than in the record, which is also why losing them costs nothing but is annoying every day.
 */

export type Pref = {
  scheme?: 'light' | 'dark' | undefined;
  text?: 'sm' | 'base' | 'md' | undefined;
  density?: 'compact' | 'comfortable' | 'roomy' | undefined;
  /**
   * A record's own accent, once a record has one.
   *
   * IT IS NOT AN ATTRIBUTE. `accent.ts` builds a whole palette from it and adopts a stylesheet, so
   * the value is read by JavaScript and by nothing else. `app.html` used to stamp it onto
   * `data-theme` before first paint, which bought nothing (there is no CSS rule anywhere that reads
   * a `data-theme` other than `hc`) and cost the high-contrast palette its own attribute.
   */
  theme?: string | undefined;
  /**
   * The high-contrast palette, which shipped and was unreachable.
   *
   * `packages/theme` solves it against a higher floor, `theme.mjs` writes it into `house.css` behind
   * `html[data-theme='hc']`, and `--check` byte-compares it on every build. Nothing in
   * `apps/web/src` ever set that attribute to `hc`. So a whole generated palette, validated by
   * sixteen checks, could not be turned on by the person it is for.
   *
   * WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings, and the one that was
   * written was the one nothing read.
   */
  contrast?: boolean | undefined;
  /** `false` folds the rail. `undefined` is open, which is what a first visit should be. */
  sidebar?: boolean | undefined;
  /** Whether bare letters act inside a focused grid. */
  chars?: boolean | undefined;
  /**
   * Whether the record proposes pages at all — `29 §4`'s one global switch.
   *
   * `19 §2` names it as the reason the `navigation` area exists: *"`navigation` was missing too: it
   * holds the *Suggest new pages* switch that `29 §4` places there."* `50 §4.7` has had
   * `suggestPages: boolean` in this type's specification the whole time and the type did not have it
   * — which the `prefs` gate noticed from the other side, listing it among the fields it excused
   * itself from covering while `Pref` had never held it.
   *
   * `undefined` IS ON, and no document states a default. `29 §3`'s trigger table describes them
   * firing, so on is the only reading consistent with the rest of that section — and it is a reading
   * rather than a citation, which is why it is said here rather than assumed.
   *
   * PER DEVICE, AND `19 §3` SAYS IT SHOULD NOT BE. *"nav order, hidden pages, pins, dismissals and
   * the *Suggest new pages* switch must survive a change of device, so none of them is a cookie."*
   * There is no table among `30 §1`'s thirty-one that could hold it and no `setPref` in `45 §5`;
   * `50 §10` owns the deviation and names the migration. This is the honest state, and the screen
   * does not claim otherwise.
   *
   * `ponytail:` move to a `member('*')` column and a `setPref` method when the record grows one.
   */
  suggestPages?: boolean | undefined;
  /**
   * The instant you last marked the activity feed read.
   *
   * "SINCE YOU WERE AWAY" NEVER ADVANCED. Home's feed reads a module constant and nothing anywhere
   * stored a mark, so the fifth session showed the same six items as the first — a heading making a
   * claim about the reader's own history that is the same claim for ever. `19 §6` calls this half of
   * Home the answer to *"what happened while you were not looking"*, and `copy.markAllRead` had been
   * sitting in `copy.ts` with no call site waiting for it.
   *
   * PER DEVICE, like everything else here, and that is the honest place for it: what you have looked
   * at on this screen is not a fact about the record. The real record has `member.seen_at` for the
   * account-wide version (`33 §2`'s `whatsNew` cursor), and this is the browser's half of it.
   */
  seen?: string | undefined;
  /**
   * Which columns you have hidden, per register.
   *
   * 50 §5.2 names it `prefs.columns[register]`, and the store did not exist — so untick a column,
   * press Done, reload, and it is back. The search, the filters and the sort on that same screen are
   * URL state, which is exactly why a reader expects this to hold too, and the doc comment beside
   * the control named the store it was not writing to.
   *
   * PER DEVICE, LIKE EVERYTHING ELSE HERE. Two people looking at one register may want different
   * columns and neither is editing the record.
   */
  columns?: Record<string, string[]> | undefined;
  /**
   * Your nav order, as a list of addresses.
   *
   * The rail's own header claims *"position lives in a per-user store and wins"*, and there was no
   * store: Move up reordered the list on screen and a reload put it back, silently — while `Hide`,
   * one item below it in the same menu, was honest about writing nothing.
   */
  nav?: string[] | undefined;
  /**
   * Which load-bearing nouns have already been explained to this person.
   *
   * `19 §6` requires a definition "the first time they appear on a screen … and never again", and
   * "never again" is a fact about a person rather than about a screen — so it has to outlive a
   * reload. `50 §4.7` states the preference set and has no slot for it; the URL would put "have you
   * read this" into a shareable address and component state forgets on navigation, so this is the
   * store that is left. One key, named here rather than added quietly.
   */
  defined?: string[] | undefined;
  /**
   * Whether the bar saying this is a sample record has been put away.
   *
   * A STRANGER LANDED ON SOMEBODY ELSE'S COMPANY WITH NO EXPLANATION. The app boots into a complete
   * synthetic business, which is the right decision: an empty product demonstrates nothing, and
   * `loop/REWORK.md` records that the sample is the most nearly finished part of the onboarding.
   * What was missing was the sentence saying so and the way out of it. Without them the first
   * screen reads as a product that has decided who you are.
   *
   * A DISMISSAL AND NOT A TIMER. `19 §3` puts dismissals in the set that must survive a change of
   * device and this cookie is per device, which is the same honest deviation every other key here
   * carries. The bar is put away once, by the person, and it is the record's own emptiness that
   * takes it away for good.
   */
  sampleSaid?: boolean | undefined;
};

const NAME = 'bd_pref';
/** A year. Long enough that it is never the reason something was forgotten. */
const YEAR = 60 * 60 * 24 * 365;

/** What the cookie holds now, or `{}` — including when there is no document at all. */
export function read(): Pref {
  if (typeof document === 'undefined') return {};
  const raw = new RegExp(`(?:^|; )${NAME}=([^;]*)`).exec(document.cookie)?.[1];
  if (!raw) return {};
  try {
    const out: unknown = JSON.parse(decodeURIComponent(raw));
    return out && typeof out === 'object' && !Array.isArray(out) ? (out as Pref) : {};
  } catch {
    /* A COOKIE THIS BUILD CANNOT READ IS NOT A CRASH. It is a preference from an older version, or
       one somebody edited; the default is the right answer and the next write replaces it. */
    return {};
  }
}

/**
 * Merge one change in and write it back.
 *
 * MERGED, NEVER REPLACED. Each setting is changed by its own control, and a write that carried only
 * the field it knew about would silently reset every other one — which is the shape of bug that
 * makes people think a product forgets things at random.
 */
export function write(change: Pref): Pref {
  const next = { ...read(), ...change };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete (next as Record<string, unknown>)[key];

  if (typeof document !== 'undefined')
    /* `SameSite=Lax` AND NO `Secure`, deliberately: this is read by the page's own shell and never
       sent anywhere that matters, and a `Secure` cookie is silently dropped on `http://localhost`,
       which is where a self-host is first opened. */
    document.cookie = `${NAME}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${YEAR}; samesite=lax`;

  return next;
}

/**
 * Put a preference on the document, and remember it.
 *
 * ONE FUNCTION FOR BOTH HALVES, because they were two and the second one was never written. An
 * attribute set without a cookie is a preference that lasts until the next navigation.
 */
export function apply(key: 'scheme' | 'text' | 'density', value: string | null): void {
  if (typeof document === 'undefined') return;
  if (value === null) document.documentElement.removeAttribute(`data-${key}`);
  else document.documentElement.setAttribute(`data-${key}`, value);
  write({ [key]: value ?? undefined } as Pref);
}

/**
 * The high-contrast palette, on or off.
 *
 * ITS OWN FUNCTION AND NOT A FOURTH KEY IN `apply`, because the attribute and the preference do not
 * share a name or a shape: the preference is a boolean and the attribute is the literal `hc`. Every
 * other pair above is `data-<key>` carrying the value, and pretending this one is too would mean
 * `apply('contrast', 'hc')` with the caller holding a string that means true.
 *
 * `theme` LEFT `apply` AT THE SAME TIME, and for the mirror reason: it never had an attribute worth
 * setting. `accent.ts` adopts a stylesheet, and `data-theme` is the high-contrast palette's switch.
 */
export function contrast(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.setAttribute('data-theme', 'hc');
  else document.documentElement.removeAttribute('data-theme');
  write({ contrast: on || undefined });
}
