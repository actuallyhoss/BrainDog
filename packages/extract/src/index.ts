/**
 * `@braindog/extract` — one raw arrival into typed rows under one `ingest` declaration, and nothing else.
 *
 * THE PURE MIDDLE OF THE PIPELINE (`07 §7` steps 2 and 3). It reads a declaration and a payload and returns
 * fields, a confidence and a receipt. It has no `Sql`, no `Http` and no `Clock`, touches no table, writes no
 * row and logs no byte, which is what makes it the one part of ingest that can be driven entirely from a
 * string in a test (`43 §1`).
 *
 * `43 §2`'s NINE FUNCTIONS ARE ALL HERE: `matches`, `extract`, `testAgainst`, `isDuplicate`, `parseMoney`,
 * `parseDate`, `readRows`, `select` and `run`. A message goes in one end and rows come out the other.
 *
 * NO `RegExp` UNDER `src/`, AND A GATE SAYS SO (`43 §8`, `31 §3` layer 4). A payload is a stranger's, and the
 * classic way to turn one into an outage is a pattern that backtracks. Every scanner in this package is a
 * single pass whose index only advances.
 */

export {
  COMBINATORS,
  EXTRACTORS,
  fold,
  matchLiterals,
  normalise,
  run,
  type Form,
  type Found,
  type ExtractorUnknown,
  type Json,
  type RunCtx,
} from './extractors.ts';

export {
  numberTokens,
  parseMoney,
  readAmount,
  scanDecimals,
  scanInts,
  scanMoney,
  type CurrencyTable,
  type Money,
  type NumberToken,
} from './money.ts';

export { parseDate, scanDates, type DateFormatInvalid } from './date.ts';

export { readRows, select, UNPARSEABLE, type Format, type Read } from './formats.ts';

export { matches, skipReason, subjectOf, CHANNELS, type Channel, type Matchable, type RawArrival } from './arrival.ts';

export {
  extract,
  type Confidence,
  type Declaration,
  type ExtractCtx,
  type ExtractedRow,
  type Extraction,
  type FieldOutcome,
  type Fields,
  type Receipt,
  type Route,
} from './pipeline.ts';

export { isDuplicate, type Dedupe } from './dedupe.ts';

export { testAgainst, type Report, type Tally } from './report.ts';
