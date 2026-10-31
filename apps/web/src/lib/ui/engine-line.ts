/**
 * The one line Today and Slash show when Slash's model has stopped: not answering, his own key closed, or the month's
 * asks spent. `null` while it answers, so a healthy record shows nothing.
 *
 * The engine's own sentence (`engineSaid`) leads where it has one; the cap's is said here, since `engineHealth` reads only
 * whether the model answers and not what the month has left.
 */

import type { EngineHealth, SlashStatus } from '@braindog/client';
import { metered, resetsWords } from './slash-cap.ts';

/** The line cut into what is wrong (`lead`, drawn as needing him) and what follows it. */
export type EngineLine = { lead: string; rest: string };

const cut = (text: string): EngineLine => {
  const at = text.indexOf('. ');
  return at < 0 ? { lead: text, rest: '' } : { lead: text.slice(0, at + 1), rest: text.slice(at + 1) };
};

/** The one quiet line under Today's brief while the writing model is not answering: the lines above it are the rules'. */
export const RULES_WRITE = 'Written by BrainDog’s rules: the writing model is not answering.';

/**
 * WHETHER THE MODEL THAT WRITES IS QUIET: the engine says it is not answering or his key is closed, or the record's own
 * written brief says it is paused, which it says only when the model failed the last time it was asked (`paused`). The
 * engine's health speaks for the model that writes and never for the search embedding (`@braindog/slash`
 * `LEDGER_WRITING`), so an embedding answering is not the model answering.
 */
export function writingQuiet(engine: EngineHealth | null, paused: string | null = null): boolean {
  if (paused !== null && paused.trim() !== '') return true;
  const state = engine?.health.state;
  return state === 'not_answering' || state === 'key_closed';
}

/**
 * THE ONE QUIET LINE TODAY SAYS UNDER ITS BRIEF, or `null` while the model writes. While it is quiet the line says
 * the rules wrote what is above it, and his own closed key says what the engine says about it, since that one is his to
 * fix. Otherwise the month's asks spent, as `engineLine` says it. Never a second line: this is the one.
 */
export function quietLine(engine: EngineHealth | null, status: SlashStatus | null = null, paused: string | null = null): string | null {
  if (engine?.health.state === 'key_closed') {
    const said = engine.said.text.trim();
    return said === '' ? RULES_WRITE : `${RULES_WRITE} ${said}`;
  }
  if (writingQuiet(engine, paused)) return RULES_WRITE;
  const spent = engineLine(null, status);
  return spent === null ? null : `${spent.lead}${spent.rest}`;
}

export function engineLine(engine: EngineHealth | null, status: SlashStatus | null = null): EngineLine | null {
  if (engine !== null && (engine.health.state === 'not_answering' || engine.health.state === 'key_closed')) {
    const text = engine.said.text.trim();
    if (text !== '') return cut(text);
  }
  if (status === null || !metered(status)) return null;
  const again = resetsWords(status.asks.resets);
  /* HIS ASKS SPENT: his own questions wait, and the cap is his to raise up to what his plan holds. */
  if (status.asks.cap > 0 && status.asks.used >= status.asks.cap)
    return cut(`Slash has used this month's ${status.asks.cap} asks. It answers again on ${again}, or raise the limit in Settings.`);
  /* THE RECORD'S OWN READING SPENT: headlines and the brief keep to the rules until the month turns. */
  const bg = status.background;
  if (bg !== undefined && bg.cap > 0 && bg.used >= bg.cap)
    return cut(`Slash has done this month's reading. Until ${again}, BrainDog works from its rules.`);
  return null;
}
