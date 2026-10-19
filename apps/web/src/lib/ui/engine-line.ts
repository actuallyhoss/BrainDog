/**
 * The one line Today and Slash show when Slash's model has stopped: not answering, his own key closed, or the month's
 * asks spent. `null` while it answers, so a healthy record shows nothing.
 *
 * The engine's own sentence (`engineSaid`) leads where it has one; the cap's is said here, since `engineHealth` reads only
 * whether the model answers and not what the month has left.
 */

import type { EngineHealth, SlashStatus } from '@braindog/client';
import { metered, resetsWords } from './slash-asks.ts';

/** The line cut into what is wrong (`lead`, drawn as needing him) and what follows it. */
export type EngineLine = { lead: string; rest: string };

const cut = (text: string): EngineLine => {
  const at = text.indexOf('. ');
  return at < 0 ? { lead: text, rest: '' } : { lead: text.slice(0, at + 1), rest: text.slice(at + 1) };
};

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
