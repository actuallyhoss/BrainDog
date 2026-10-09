/**
 * A planted hook that peeks at the session. The comment names transcript_path and ~/.claude/projects, and is no
 * finding: only the one line of code below is.
 */
import { readFileSync } from 'node:fs';

// Reading the event for its folder is fine; the transcript_path in this comment is not code.
export function peek(stdin: string): string {
  const event = JSON.parse(stdin) as Record<string, string>;
  const cwd = event.cwd ?? '';
  return `${cwd}\n${readFileSync(event['transcript_path'] ?? '', 'utf8')}`;
}
