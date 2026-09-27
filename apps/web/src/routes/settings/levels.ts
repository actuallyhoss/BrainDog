/**
 * Which settings areas hold the OWNER'S controls, and what a colleague reads in their place.
 *
 * EVERY AREA WAS DRAWN TO EVERY LEVEL, WITH THE OWNER'S CONTROLS IN IT.
 * `loop/research-second-person.md` finding 7 drove seven colleagues through these screens and each
 * of them was shown the owner's settings: `/settings/delete` offered the confirm field and the red
 * button to somebody who cannot change one row, `/settings/export` offered four buttons that all
 * refuse at the press, `/settings/agents` offered a six-digit field and an Approve, and
 * `/settings/people` drew the invitation form under its own refusal. Driven again here on a real
 * self-host at 1440 by 900, a `read` colleague was offered 3 controls on People, 4 on Agents, 1 on
 * Backups, 6 on Export and 2 on Delete, and exactly one of the sixteen said it was off.
 *
 * THE THREE THINGS A CONTROL CAN BE, and this file is the choice between them. A control a person
 * cannot use is worse than an absent one, and an absent one with no explanation is worse than a
 * refusal that names what is missing. So an owner's control is not drawn to somebody who is not an
 * owner, and the sentence that replaces it says what is missing and what to do about it.
 *
 * IT IS NOT A FOURTH PATTERN. The record already answers a colleague this way at the press, in one
 * sentence naming the remedy, and `/settings/people` already draws a standing hint beside a control
 * it will not honour (`id="last-owner"`) rather than refusing after it. What moves here is WHEN: to
 * arrival, where a person still has a choice about what to do next. `inbound-door.ts` does the same
 * for a HOST that cannot honour a control; this is the same question asked about a PERSON who may
 * not, and the two are asked in that order, because a host with no door has none for anybody.
 *
 * WHY `owner` AND NOT A LADDER PER AREA. Every settings write in the product is an ADMIN method:
 * `members`, `invite`, `listTokens`, `createToken`, `deviceApprove`, `snapshots`, `export` and
 * `deleteRecord` all need `owner` (`packages/record/src/index.ts` `ROUTES`), and `write` or `decide`
 * reaches none of them. There is no second rung to draw, so there is no second sentence.
 */

/** What this needs of the shell's `me`, and nothing more. `boot-live.ts` builds both. */
export type Me = { readonly level: string; readonly owner: boolean };

/**
 * Is this person an owner of the record in front of them?
 *
 * `me.owner` IS THE RECORD'S OWN ANSWER and `me.level` is the same fact spelt out, so both are read:
 * `layoutOf` sets `owner: level === 'owner'` from `boot`, and the sample's `me` carries both, which
 * is what keeps the demo drawing every control exactly as it did.
 *
 * FALSE IS TRUE OF A REFUSED BOOT TOO, and that is the case this has to be right about. A record
 * that refuses `boot` hands the shell `refusedShell()`, whose level is the fallback `read` rather
 * than anything the record said, so a screen must not tell that reader what level they hold. It may
 * tell them they are not an owner: an owner boots.
 */
export const ownsRecord = (me: Me): boolean => me.owner || me.level === 'owner';

/**
 * The settings areas with a control on them only an owner can use.
 *
 * THE LIST IS HERE AND THE GATE IS IN THE MARKUP, which `levels.test.ts` holds together: the test
 * fails if an area in this set draws its owner's controls ungated, and fails if an area outside it
 * gates anything. A predicate on the area object would be a better shape and there is nothing on an
 * area to ask, which is the argument `KEEPS` and `REPORTS` make in the page beside this.
 *
 * FOUR OF THESE ARE PARTLY A COLLEAGUE'S, and that is why this is not a nav filter. `ingest` still
 * lists where rows come in from, `billing` still says what this deployment bills, `export` still
 * checks a file in the browser, and `recovery` and `identity` are about the person rather than the
 * record. Taking the row out of the rail would take those away and leave nothing that says why.
 */
export const OWNER_CONTROLS: ReadonlySet<string> = new Set([
  'people',
  'agents',
  'ingest',
  'backups',
  'billing',
  'export',
  'delete',
]);

export const words = {
  /**
   * WHAT IS MISSING AND WHAT TO DO, and not what they hold.
   *
   * The record's own refusal reads "This needs owner, and you have read access. Ask an owner to
   * raise your access." Where the screen has that sentence in hand it is drawn verbatim and this one
   * is not used: People, Agents and Backups each read something the record refuses, so each has the
   * record's words for the reader. Export, Delete, Billing and the mail section read nothing, and
   * the level in the shell after a refused `boot` is a fallback rather than the record's answer, so
   * this names the ceiling and the remedy and claims nothing about the reader's level.
   */
  ownersOnly: 'Only an owner of this record can do this. Ask an owner to raise your access, or to do it for you.',
  /* THE SAME TWO SENTENCES WHERE THEY ARE AN EMPTY STATE: a title takes no full stop, so the first is the title and the
     second its body. */
  ownersOnlyTitle: 'Only an owner can do this',
  ownersOnlyHow: 'Ask an owner to raise your access, or to do it for you.',
} as const;
