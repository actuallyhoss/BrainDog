/**
 * THE SKILLS THE AGENTS ADD-ON SHIPS: what a session working in any BrainDog reaches for
 * after an import, and when the record's signs go red. Slash offers them to a record with agents on, the night they are
 * missing, as one question (`noticeWhole` in `packages/record/src/slash.ts`); the owner's yes writes them to Skills.
 *
 * DATA, NOT A DECLARATION. The agents pack document stays as it is (agents 1.10.0 is not rehashed): a skill is an entry of
 * Skills, so it travels in the catalogue beside the pack (`usecases/catalogue.ts`), as a use case's skills already do.
 *
 * NOTHING HERE NAMES A PERSON, A PROJECT OR A RECORD. Each step says how to find what it works on, and
 * the session reads the names from the record it is in (`test/agents-skills.test.ts`).
 *
 * A VERB IS WRITTEN "call `verb`", and a resource "read `braindog:...`", so the test can hold every one to a tool or a
 * route that exists. `rev` RISES WITH EVERY CHANGE TO `body`, and the text it replaces goes to the end of `was`, so a
 * record still holding the old text, untouched, is offered the new one, and one somebody edited is left alone.
 */

/** One skill as the agents add-on ships it: the fields of Skills it fills, its version, and the texts it replaced. */
export type ShippedSkill = {
  /** The folder name the skill is written to: small letters and dashes. */
  name: string;
  trigger: string;
  what: string;
  body: string;
  rev: number;
  /** The texts of every version before `rev`, oldest first: `was[n - 1]` is version n. Absent at version 1. */
  was?: readonly string[];
};

/** Version 1 of After an import, kept for `was`: it cleared every mark no host draws. */
const AFTER_AN_IMPORT_1 = `# After an import

Use this skill once an import has written into this BrainDog, to tidy what it left in one question the owner answers.

## Find what the import wrote

1. Call \`context\` first.
2. Call \`list\` on Projects and read each project's tags. A project an import wrote carries a tag shaped \`source:kind:id\`, such as \`tallybook:project:42\`. Leave every project without one alone.
3. Nothing carries such a tag: stop. There is nothing to tidy.

## Build one arrangement

Read \`braindog:grammar/proposals\` for its shape. Put in it, as parts:

- Install Project brief (\`project-brief\`) when it is not on, so each project has About, Stage, In the way and a plan of steps.
- For each project, lift out of its note: the line that says what it is into About; the stage it says it is at into Stage; what it says is in the way into In the way, one item a line; and each line of its plan into a plan step, in order, with what the step gains.
- Write the note again with what was lifted taken out and every other word kept.
- Call \`checkPaths\` with the note as \`document\` and \`things\` as \`register\`. Each placeholder that names nothing goes in a code span, so the page prints it as text. Where your client cannot reach it, call \`record_index\` and treat as naming nothing every placeholder whose first word it does not name.
- A project marked Earning with nothing coming in for 90 days moves to the lane its note bears out: Building while work goes on, Parked if not. Never Closed. The figure \`projects-earning-silent\` counts them where the record has it; otherwise read its money in over the last 90 days.
- Propose a health (On track, At risk or Off track) from what is in the way, and an aim (a day) where the note names one. Where the note says nothing, leave both out.
- Call \`pagesCensus\`. A project whose page heading names a glyph no host draws (\`glyphs_unknown\`) has its mark cleared.
- A choice the note leaves open goes in the same arrangement as a choice, never as a question of its own.

## Before you file

- Keep every character. For each project, the old note is no longer than the new note and everything lifted out of it, put together. If it is longer, put the missing words back in the note.
- Call \`propose\` once, with \`body_kind\` \`arrange\`, the cause \`tidy\`, and the question "Tidy what the import left?". One question for every project, never one each.
- The record refuses a part because Project brief is not on yet: file the install and the other parts now, and the brief's fields after the yes, with the cause \`tidy-briefs\`.
`;

/** The line of version 1 that version 2 changes: a mark no host draws was only ever cleared. */
const MARK_CLEARED = "- Call \`pagesCensus\`. A project whose page heading names a glyph no host draws (\`glyphs_unknown\`) has its mark cleared.\n";

/**
 * VERSION 2: a mark that names no glyph is given the nearest one a host draws, as a part of the same
 * arrangement, and cleared only where none is near. The glyphs are the ones \`braindog:grammar/page\` already hands, by
 * group, so the skill names no glyph of its own.
 */
const MARK_NEAREST = `- Call \`pagesCensus\`. For each project whose page heading names a glyph no host draws (\`glyphs_unknown\`), read \`braindog:grammar/page\`: its \`glyphs\` names every glyph a mark may use, by group. Put in the same arrangement, as a part, the nearest glyph a host draws for that project's mark: the same word spelled the way the glyphs spell it, else one a letter or two from it, else one from the group that says what the project is. Clear the mark only where no glyph there is near, and say which in the arrangement's why.
`;

const AFTER_AN_IMPORT = AFTER_AN_IMPORT_1.replace(MARK_CLEARED, MARK_NEAREST);

/** Version 1 of Keep a record current, kept for `was`: it called what is on offer an add-on. */
const KEEP_A_RECORD_CURRENT_1 = `# Keep a record current

Use this skill when a session starts and \`context\` shows a red sign, to offer the owner what would cure it, in one question.

1. Call \`context\` and read its \`signs\`: each red sign by its name, with one sentence about what is wrong.
2. No sign is red: stop.
3. Call \`governance\` and look for an open question with the cause \`setup\`. One is open: stop. Never file a second while one waits.
4. Read what is on offer: read \`braindog:arrangement/offer\`, or \`braindog:arrangement/offer/<word>\` with a word from the sign. A cure is an add-on whose line names what the sign says is missing, or a feed that would bring in what stopped arriving.
5. Put the cure for each red sign in one arrangement: an add-on to install or turn on, a feed to start, and each key it needs, by its label. Read \`braindog:grammar/proposals\` for its shape. A sign with nothing on offer that cures it is left out, and said in the arrangement's why.
6. Call \`propose\` once, with \`body_kind\` \`arrange\`, the cause \`setup\`, and a question that names what it keeps current, such as "Keep this BrainDog's money current?".
7. Change nothing yourself. The owner decides in BrainDog.
`;

/**
 * VERSION 2 says plugin where version 1 said add-on, as the app calls them since 3 Nov. Nothing else moved.
 */
const KEEP_A_RECORD_CURRENT = KEEP_A_RECORD_CURRENT_1.replace('A cure is an add-on whose', 'A cure is a plugin whose').replace('arrangement: an add-on to install', 'arrangement: a plugin to install');

/** The skills the agents add-on ships, in the order Slash offers them. */
export const AGENTS_SKILLS: readonly ShippedSkill[] = [
  {
    name: 'after-an-import',
    trigger: 'after an import has written into this BrainDog, to tidy what it left in one question',
    what: 'Finds what an import left untidy and files one question that tidies it.',
    body: AFTER_AN_IMPORT,
    rev: 2,
    was: [AFTER_AN_IMPORT_1],
  },
  {
    name: 'keep-a-record-current',
    trigger: 'when a session starts and a sign is red, to offer what would cure it in one question',
    what: 'Reads the signs and what is on offer, and files one question that cures what is red.',
    body: KEEP_A_RECORD_CURRENT,
    rev: 2,
    was: [KEEP_A_RECORD_CURRENT_1],
  },
];
