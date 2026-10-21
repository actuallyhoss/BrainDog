/**
 * A planted helper that reads a profile's login. This comment names .credentials.json, auth.json, claudeAiOauth and
 * Claude Code-credentials, and is no finding: only the one line of code below is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A comment naming auth.json is prose, not code.
export function peek(profile: string): string {
  return readFileSync(join(profile, '.credentials.json'), 'utf8');
}
