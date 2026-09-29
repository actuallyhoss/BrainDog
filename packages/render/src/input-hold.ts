/**
 * What an `inputs` box shows while a person is typing into it (`svelte/Inputs.svelte`).
 *
 * APART FROM `inputs.ts` BECAUSE THAT MODULE IS ALL PUBLIC, every name on the package root for a host to wire the form
 * with (`root-exports.test.ts`). This is the drawer's own business: a host hands `oninput` and never sees a hold.
 *
 * A pure function, and not an effect in the markup, so the rule is tested without a browser: Svelte's `set_value`
 * writes whatever the attribute answers and leaves the box alone when the answer is what it already holds.
 */

/**
 * What a person typed into a box, kept so the record's next value does not land on top of it: the text, whether the box
 * still has them in it, and the value the record held when they left it.
 */
export type InputHold = { text: string; typing: boolean; since: string };

/** The hold a keystroke makes: the text as it stands, in a box still being typed into. */
export const typedHold = (text: string, value: string): InputHold => ({ text, typing: true, since: value });

/** The hold once the box is left, pinned to the value the record held then. */
export const leftHold = (hold: InputHold, value: string): InputHold => ({ ...hold, typing: false, since: value });

/**
 * What a text box shows: the record's value, or what the person typed while that is still theirs.
 *
 * WHILE THE BOX IS BEING TYPED INTO, WHAT WAS TYPED. The host writes after a pause and reads the page again, and the
 * value it read came back into the box: a price written as `1250` was reformatted to `EGP 1,250.00` under the cursor
 * of somebody still typing, and a write the record refused as stale put the other person's figure over theirs, with
 * the sentence beside the box about a text that was no longer in it.
 *
 * ONCE IT IS LEFT, WHAT WAS TYPED UNTIL THE RECORD ANSWERS SOMETHING NEW. Dropping the text on leaving would lose it
 * in exactly the case it matters, a conflict read back while the box was focused; keeping it forever would hide a
 * change somebody makes later. So it is pinned to the value the record held when the box was left, and the first
 * different value the record hands the box is shown.
 */
export const shownIn = (value: string, hold: InputHold | undefined): string =>
  hold && (hold.typing || hold.since === value) ? hold.text : value;

