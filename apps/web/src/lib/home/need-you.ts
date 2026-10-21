/**
 * THE ONE COUNT OF WHAT NEEDS YOU: the open questions, as `boot` says them (`waits`), else the count the reader was
 * handed, and the instructions a run answered Needs you (`told`, agents and MCP plan §2.3: "Needs you, which counts in
 * Needs you and Today"). The rail's badge, the phone tab's badge, Today's header and Today's sentence all ask here, so
 * no two disagree. The late work is a separate number and is said on its own; it is never folded into this one.
 *
 * A FILE OF ITS OWN, because the shell asks it on every screen and `today-tiles.ts` carries Today's readers with it:
 * imported from there, the badge put the kernel in front of the first paint.
 */
export const needYouCount = (waits: { questions: number } | null | undefined, fallback: number, told = 0): number => (waits?.questions ?? fallback) + Math.max(0, told);

/** The kernel's list of what he told agents (`INSTRUCTIONS` in `packages/kernel/src/instruction.ts`). */
export const TOLD_LIST = 'instructions';

/**
 * WHETHER THE SHELL ASKS WHAT CAME BACK FROM WHAT HE TOLD AGENTS (`record/told-live.ts`): only where `boot` lists the
 * kernel's `instructions` with a row in it (its registers, or the shell's `index.registers`, which keeps every list
 * that holds something) and says the caller owns it (`me.levels`), since only the owner is answered `instructionList`.
 * A record where he never told an agent anything is asked nothing.
 */
export function toldReadable(registers: readonly { id: string; count: number }[] | undefined, levels: Readonly<Record<string, string>> | undefined): boolean {
  const list = (registers ?? []).find((r) => r.id === TOLD_LIST);
  return list !== undefined && list.count > 0 && levels?.[TOLD_LIST] === 'owner';
}
