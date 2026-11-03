/**
 * The look's words: the editor in Settings > Appearance, its contrast gate and its specimen.
 *
 * A NEW AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads it into `copy`, and every key here is read as a
 * literal `copy.<key>` by `lib/theme/LookEditor.svelte`, `lib/theme/Specimen.svelte` or the Appearance area, so
 * `dead-copy` sees each one drawn. Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports
 * nothing.
 *
 * CONTRAST IS SAID IN WORDS AND NEVER AS A RATIO. The person at this screen chose a colour; "3.61:1 against s3" is the
 * theme author's sentence and `checks.ts` keeps it for them. Here a pair is Fails, Tight or Fine, a colour has a name a
 * person would give it ("the panel", "quiet text"), and a fix is a verb and that name.
 */

/** How far a fix moves a colour: the one axis a person can see without knowing what a lightness is. */
export type LookWay = 'darken' | 'lighten';

/* ── the look and its editor ────────────────────────────────────────────── */

export const theme = {
  lookTitle: 'How your BrainDog looks',
  lookHint:
    'Every colour your BrainDog is drawn in, in light and in dark, for everybody who opens it.',
  lookOwn: 'Your BrainDog has a look of its own.',
  lookHouseNow: 'Your BrainDog is in the usual look.',
  lookEdit: 'Edit the look',
  lookClose: 'Close the editor',
  lookHouse: 'Use the usual look',
  lookHouseBack: 'BrainDog is back in the usual look.',
  lookMember: 'Your look goes to the owner in Needs you, and everyone sees it once they accept.',
  /** The title the editor wears when a theme refused at install opened it with its fixes staged. */
  lookFixAndInstall: 'Fix and install',
  lookStaged: 'The colours that could not be read are selected, and a fix is ready for each. Check them, then install.',
  lookStagedNone: 'This plugin brought no look to fix.',

  lookColours: 'Colours',
  lookInLight: 'In light',
  lookInDark: 'In dark',
  lookEditingLight: (name: string) => `${name}, in light`,
  lookEditingDark: (name: string) => `${name}, in dark`,
  lookChanged: 'Changed',
  /** Every colour by the name a person would give it. The order is the editor's list, ground first. */
  lookRoles: {
    sunk: 'the sunken ground',
    bg: 'the page',
    s1: 'the panel',
    s2: 'a raised panel',
    s3: 'the highest panel',
    ink: 'text',
    ink2: 'second text',
    dim: 'quiet text',
    faint: 'faint text',
    line: 'hairlines',
    edge: 'edges',
    earn: 'money in',
    warn: 'needs you',
    danger: 'the past due dot',
    'danger-text': 'past due text',
    info: 'running',
    'earn-fill': 'the money in chip',
    'warn-fill': 'the needs you chip',
    'danger-fill': 'the past due chip',
    'info-fill': 'the running chip',
    accent: 'the accent',
    'accent-edge': "the accent's edge",
    'accent-hover': 'the accent under the pointer',
    'accent-press': 'the accent pressed',
    'accent-text': 'accent text',
    'accent-ink': 'text on the accent',
    'focus-in': 'the focus ring',
    'focus-out': "the focus ring's outer edge",
  } as Record<string, string>,

  lookNudge: 'Nudge',
  lookDarker: 'Darker',
  lookLighter: 'Lighter',
  lookDuller: 'Duller',
  lookRicher: 'Richer',
  lookWarmer: 'Warmer',
  lookCooler: 'Cooler',
  lookPick: 'Pick',
  lookPickHint: 'Lighter toward the top, richer toward the right. A colour no screen can show is left out.',
  lookPickCell: (lighter: number, richer: number) => `Lightness ${lighter}, richness ${richer}`,
  lookEnter: 'Enter',
  lookEnterLabel: 'Colour code',
  lookEnterHelp: 'A hash and six digits, 0 to 9 and A to F, as a brand guide writes it.',
  lookEnterWrong: 'That is not a colour code. It is a hash and six digits, 0 to 9 and A to F.',
  lookEnterUse: 'Use this colour',
  lookPutBack: 'Put it back',

  lookCorners: 'Corners',
  lookSquare: 'Square',
  lookSoft: 'Soft',
  lookRound: 'Round',
  lookDensity: 'Density',

  lookSpecimen: 'How it looks',
  lookSpecimenOpen: 'Show how it looks',

  lookGate: 'Can everyone read it',
  lookGateFine: 'Every pair reads well, in light and in dark.',
  lookFineCount: (n: number) => (n === 1 ? 'One more pair reads well.' : `${n} more pairs read well.`),
  lookFails: 'Fails',
  lookTight: 'Tight',
  lookFine: 'Fine',
  lookPair: (colour: string, ground: string, dark: boolean, more: boolean) =>
    `${colour} on ${ground}, in ${dark ? 'dark' : 'light'}${more ? ' with more contrast on' : ''}`,
  lookGrey: (a: string, b: string, dark: boolean) => `${a} beside ${b} in grey, in ${dark ? 'dark' : 'light'}`,
  lookSample: 'Read this at its real size',
  lookFix: (way: LookWay, name: string) => `${way === 'darken' ? 'Darken' : 'Lighten'} ${name}`,
  lookShow: (name: string) => `Show ${name}`,
  /** Why the record's own check refused a look, by the code it answered with, for the findings no pair above shows. */
  lookWhy: {
    CONTRAST_FLOOR: 'Some text or an edge would be too faint to see.',
    INTENT_INSEPARABLE: 'Two of the colours that carry a meaning would look the same to a reader who sees colour differently.',
    THEME_LADDER_ORDER: 'The grounds no longer step from darkest to lightest, so a panel would blur into the page.',
    THEME_VALUE_INVALID: 'One of the colours is not one BrainDog can draw.',
  } as Record<string, string>,
  lookWhyElse: 'BrainDog cannot draw this look as it stands.',
  lookBlocked: 'Fix every pair marked Fails, then save.',
  lookNoHue: 'The accent is almost grey, and a look is built from a colour. Pick an accent with some colour in it.',

  lookSave: 'Save the look',
  lookPropose: 'Send the look to the owner',
  lookInstall: 'Install the fixed look',
  lookSaving: 'Saving',
  lookSaved: 'BrainDog is in its new look.',
  lookProposed: 'Your look is in Needs you, waiting for the owner.',
  /** The question a member's look is filed under, which the owner reads on Decide. */
  lookProposeQuestion: 'Change how your BrainDog looks?',

  /* The specimen's own sample content: a small page drawn in the edited look. */
  lookSampleHead: 'This week',
  lookSampleRows: ['Invoice to Harbour and Co', 'Van insurance renewal', 'Order more oat milk'] as readonly string[],
  lookSampleWhen: ['Today', 'In 3d', '2 Oct'] as readonly string[],
  lookSampleEarn: 'Paid in',
  lookSampleWarn: 'Due soon',
  lookSampleDanger: 'Past due',
  lookSampleInfo: 'Running',
  lookSampleAdd: 'Add one',
  lookSampleCancel: 'Cancel',
  lookSampleChip: 'Open',
  lookSampleField: 'Customer',
  lookSampleFieldValue: 'Harbour and Co',
  lookSampleSwitch: 'Remind me the day before',
  lookSampleNote: 'A note on the page reads like this, in second text on the panel.',
  lookSampleQuiet: 'Added 3d ago by you',
  lookSampleFaint: 'Faint text is kept for large type',
  /* THE WORDS MONEY GIVES A DIRECTION, `owed_to_me` said as "Money in", and not the retired "Owed to you". */
  lookSampleFigure: 'Money in',
};
