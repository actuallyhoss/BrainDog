/**
 * The design agent's first recommendation: which navigation shape suits this record.
 *
 * `docs/19-INTERFACE.md` section 3 draws three shapes a person can choose in Settings, the rail, a
 * top bar and a menu, and says the design agent recommends one rather than applying it. Its own
 * words: "It reads what the record actually has: how many declared pages, how many sections, how
 * many were opened in the last sixty days, whether the nav has been arranged by hand. It answers
 * with one shape and one sentence of why ... never applied, one click to accept, Dismiss terminal,
 * and it never writes nav order. It never recommends a shape it cannot justify from the record,
 * because a recommendation with no reason is an advertisement."
 *
 * This file is that reading, kept as a pure function over facts already available about the record
 * and the screen. There is no design-agent runtime elsewhere in this codebase to hang this off, so
 * rather than inventing one, the recommendation lives as a function a caller can test against a
 * fixed case and a settings screen can call on render.
 *
 * WHAT IT NEVER DOES: it never writes `nav.shape`. That write happens on the click that accepts the
 * suggestion, in the caller, exactly as `settings/navigation` already does for a promoted page.
 *
 * AND IT NEVER TALKS SOMEBODY OFF THE DEFAULT INTO THE RAIL. The top bar of 19 October is the shell again (chosen
 * 20 October), so a record that never chose a shape is on the bar, and the side rail stays a choice in Settings rather
 * than an offer. A bar somebody picked can still be told the rail would hold everything.
 */

export type NavShape = 'rail' | 'bar' | 'menu';

export type NavShapeSignals = {
  /** Declared pages and lists placed in the nav today, not counting the native spine. */
  entries: number;
  /** Distinct sections those entries are grouped into. */
  sections: number;
  /** Whether this person has reordered the nav by hand (`Pref.nav` is non-empty). */
  handArranged: boolean;
  /** The shape somebody chose, or `undefined` while nobody has, which is the top bar (`NavPrefs.chosen`). */
  current: NavShape | undefined;
  /**
   * The viewport width in CSS pixels, when it is known. Below 900px `19 §3` keeps the tab bar
   * regardless of what is chosen here, so a shape recommendation on a narrow screen would be a
   * suggestion nobody would ever see take effect.
   */
  viewportWidth?: number | undefined;
};

export type NavShapeRecommendation = {
  shape: NavShape;
  /** One plain sentence, stating the fact of the record it was read from. */
  reason: string;
};

/**
 * The top bar's own fixed number of visible slots before it overflows into More.
 *
 * Four is `19 §3`'s own freelancer number and a constant rather than a measurement, so the figure a
 * reader is told does not change as they drag the window. `TopBar.svelte` draws the same four, so this is that constant read once rather than
 * a second copy of it.
 */
const TOP_BAR_SLOTS = 4;

/**
 * The narrowest screen a shape offer is shown on, in CSS pixels. Below it `19 §3` keeps the tab bar whatever is chosen, so
 * the offer would change nothing anyone sees. THE ONE RULE THE BROWSER KEEPS (ENG-B14): the record cannot know the screen.
 */
export const SHAPE_MIN_WIDTH = 900;

/**
 * Read the signals and answer with one shape and one sentence, or `null` when the shape already set
 * suits the record and there is nothing to say.
 */
export function recommendNavShape(signals: NavShapeSignals): NavShapeRecommendation | null {
  const { entries, sections, handArranged, current, viewportWidth } = signals;
  /* NOBODY CHOSE, SO THE TOP BAR: what the shell draws for a record that keeps no shape (`nav-prefs.svelte.ts`). */
  const effective: NavShape = current ?? 'bar';

  if (viewportWidth !== undefined && viewportWidth < SHAPE_MIN_WIDTH) return null;

  let best: NavShape;
  let reason: string;

  if (entries <= 1) {
    /* Nothing declared yet beyond the spine, or one page. A persistent rail is chrome around
       almost nothing, and 19 §3 names the menu for exactly this case, "the smallest chrome". */
    best = 'menu';
    reason =
      entries === 0
        ? 'Nothing is placed in your nav yet, so a menu keeps the chrome smallest until there is something to show.'
        : 'Only one page is placed, so a menu keeps the chrome smallest rather than a rail around it.';
  } else if (entries <= TOP_BAR_SLOTS) {
    /* Small enough that the top bar's own fixed slots hide nothing behind More. */
    best = 'bar';
    reason = `You have ${entries} nav ${entries === 1 ? 'entry' : 'entries'}, small enough for a top bar to show all of them with nothing behind More.`;
  } else {
    /* Grown past what the top bar's four slots can show without hiding some behind More. */
    best = 'rail';
    const hidden = entries - TOP_BAR_SLOTS;
    reason =
      sections > 1
        ? `You have ${entries} entries across ${sections} sections, more than a top bar's four slots can show without hiding ${hidden} behind More.`
        : `You have ${entries} entries, more than a top bar's four slots can show without hiding ${hidden} behind More.`;
  }

  /* Arranging the nav by hand is a fact about this person caring which order it reads in, and the
     menu shows that order only after an extra click. The rail always shows it, so the rail stands
     in the menu's place rather than the recommendation being dropped and the fact ignored. */
  if (handArranged && best === 'menu') {
    best = 'rail';
    reason = 'You have arranged your nav by hand, so a rail keeps that order visible rather than behind a menu.';
  }

  if (best === effective) return null;
  /* The default is the top bar, and the side rail is somebody's choice to make, not ours to offer (the header). */
  if (current === undefined && best === 'rail') return null;
  return { shape: best, reason };
}

/**
 * Build the signals from what the shell already knows, so a caller reads the record once rather
 * than re-deriving `entries` and `sections` its own way.
 *
 * `navEntries` is the same list `Sidebar.svelte` groups by `arrange()`, `section` field and all;
 * `registerCount` is `index.registers.length`, the lists drawn under their own "Lists" section.
 * Both are already computed by `record/api.ts`'s `boot()`, so this reads them rather than the rows.
 * `navShape` is the shape somebody chose (`navPrefs.chosen`), not the one drawn: the drawn shape is never `undefined`, and
 * a caller that hands it in tells this a record on the default rail picked the rail.
 */
export function navShapeSignals(
  navEntries: readonly { section: string }[],
  registerCount: number,
  pref: { nav?: readonly string[] | undefined; navShape?: NavShape | undefined },
  viewportWidth?: number | undefined,
): NavShapeSignals {
  const sections = new Set(navEntries.map((e) => e.section));
  /* Registers are not sectioned individually. They are one more section, "Lists", the moment there
     is at least one to draw. */
  if (registerCount > 0) sections.add('lists');

  return {
    entries: navEntries.length + registerCount,
    sections: sections.size,
    handArranged: (pref.nav?.length ?? 0) > 0,
    current: pref.navShape,
    viewportWidth,
  };
}
