/**
 * Which register `/start?add=<something>` means.
 *
 * IT LIVES HERE BECAUSE IT IS THE ONE PIECE OF THAT SCREEN A TEST CAN HOLD. The rest of `/start` is
 * markup and a focus call; this is a mapping from what somebody typed to a register id, it has an
 * answer for every input, and it was wrong for three of the five words the screen puts on tiles.
 *
 * THE TILES SAY *Money*, *Services*, *People*, *Projects*, *Work*. The keys behind them are
 * `obligations`, `services`, `people`, `things`, `tasks`. Two of the five are both. Nothing on the
 * page writes the parameter, so nothing was broken — it is a link somebody types or shares from
 * what is in front of them, and it worked two times in five.
 *
 * THE SECOND TILE SAID *The estate* WHEN THIS WAS WRITTEN, which is why `plain` drops a leading
 * `the` at all: `?add=the-estate` had to reach the same register as `?add=estate`. The tile says
 * *Services* now, because one area of the record answering to four names is what a vocabulary pass
 * took off the first screen. So `?add=estate` and `?add=the-estate` get the choice list from here
 * on, which is the honest answer to a word this record's tiles no longer use, and the rule below
 * stays because a tile beginning with *the* is a tile somebody will write again.
 */

/**
 * Letters and digits only, with a leading `the` dropped when it is a word of its own, so
 * `the-services`, `The Services` and `services` are one word.
 *
 * IT USED TO STRIP THE SEPARATORS FIRST AND `^the` SECOND, and by the time the article was looked
 * for the gap that made it an article was gone. Measured: `theatre` came back `atre`, `themes`
 * `mes`, `theft` `ft`, `them` `m`. Nothing was broken while no register id and no word on a tile
 * began with those three letters, and the test guarding it asked about `things`, which begins `th`
 * and could not have failed. The two steps are the other way round now and the article has to be
 * followed by a gap, so a pack shipping *Theatre* or *Themes* is addressable and `?add=the-estate`
 * still reaches the same word as `?add=estate`.
 *
 * AND `the` ON ITS OWN SURVIVES AS `the`. There is no noun after it to qualify, and folding it to
 * the empty string would make `?add=the` the same input as `?add=`, which is a different thing
 * somebody typed. Both get the choice list today; only one of them stays addressable on the day a
 * tile says *The*.
 */
export const plain = (v: string): string =>
  v.toLowerCase().replace(/^[^a-z0-9]*the(?=[^a-z0-9])/, '').replace(/[^a-z0-9]+/g, '');

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
