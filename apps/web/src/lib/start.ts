/**
 * Which register `/start?add=<something>` means.
 *
 * IT LIVES HERE BECAUSE IT IS THE ONE PIECE OF THAT SCREEN A TEST CAN HOLD. The rest of `/start` is
 * markup and a focus call; this is a mapping from what somebody typed to a register id, it has an
 * answer for every input, and it was wrong for three of the five words the screen puts on tiles.
 *
 * THE TILES SAY *Money*, *The estate*, *People*, *Projects*, *Work*. The keys behind them are
 * `obligations`, `services`, `people`, `things`, `tasks`. Only `people` is both. Nothing on the page
 * writes the parameter, so nothing was broken — it is a link somebody types or shares from what is
 * in front of them, and it worked two times in five.
 */

/** Letters and digits only, with a leading `the` dropped — so `the-estate`, `The Estate` and `estate` are one word. */
export const plain = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^the/, '');

/**
 * The register a parameter names, or `undefined` when it names nothing.
 *
 * NOT A FUZZY MATCH. An exact comparison against the two names the screen already publishes: the
 * register id, and the word on the tile. `?add=nonsense` still gets the choice list, which is the
 * honest answer to a register this record does not have.
 */
export function addKey(
  asked: string,
  choices: readonly { key: string; label: string }[],
): string | undefined {
  return choices.find((c) => c.key === asked || plain(c.key) === plain(asked) || plain(c.label) === plain(asked))?.key;
}
