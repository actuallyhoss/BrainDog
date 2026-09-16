/**
 * A PAGE'S SOURCE, AS A FILE SOMEBODY CAN KEEP.
 *
 * `.dog` is one page, one file: the text you get when you open the source of a page, in the terse
 * dialect `@braindog/dog` prints and parses. It is not one file holding a whole record; the record
 * is the database and it keeps its own name, `.brain`.
 *
 * THE TEXT LIVED IN THE ROUTE AND NOTHING COULD BE DONE WITH IT. It was a `<pre>` behind `?src=1`:
 * readable, and impossible to save, diff, send or edit. Printing it and writing it are the same
 * bytes by construction now, because there is one function and the screen and the file both call
 * it.
 *
 * `dogText`, `dogName`, `DogPage` AND `DogBlock` NOW LIVE IN `@braindog/dog` AND ARE RE-EXPORTED
 * HERE UNCHANGED. The CLI needs the identical dialect to write a `.dog` file with `braindog page
 * pull` and read one back with `push` and `check`, and apps in this repository do not import each
 * other's source — so the one function this screen and that command must agree on byte for byte
 * lives in a package both of them depend on, and this file keeps its own public names so nothing
 * that already imports `dogText`, `dogName` or `DogPage` from here has to change.
 */

export { dogName, dogText, type DogBlock, type DogPage } from '@braindog/dog';

/**
 * Hand the text to the browser as a file.
 *
 * `text/plain` BECAUSE IT IS TEXT. There is no registered type for this and inventing one would
 * mean an operating system that opens the file in nothing, where every machine already opens plain
 * text in the editor the person reads code in.
 */
export function saveDog(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
