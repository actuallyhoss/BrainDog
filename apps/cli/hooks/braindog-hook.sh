#!/bin/sh
# Claude Code runs this for SessionStart, SessionEnd and PostToolUse: braindog-hook.sh start, end or beat.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

which="${1:-start}"
dir=$(dirname "$0")

# THE BEAT RUNS AFTER EVERY TOOL CALL, so it reads one file's age before Node starts (beat.ts). The session's stamp
# under ~/.braindog/beats, named from the event's session_id as beat.ts names it; written inside five minutes, the
# beat is already on the record and this ends here, having started no Node. The stamp is touched here too after Node,
# so the five minutes hold whatever Node did: an older command without `hook beat`, or no Node at all.
if [ "$which" = beat ]; then
  raw=$(cat)
  id=$(printf '%s' "$raw" | grep -o '"session_id" *: *"[A-Za-z0-9._:-]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/; s/[^A-Za-z0-9_-]/_/g')
  stamp="${HOME}/.braindog/beats/${id:--}"
  [ -n "$(find "$stamp" -mmin -5 2>/dev/null)" ] && exit 0
  printf '%s' "$raw" | node "$dir/../src/main.ts" hook beat >/dev/null 2>&1
  mkdir -p "${HOME}/.braindog/beats" 2>/dev/null && touch "$stamp" 2>/dev/null
  exit 0
fi

if ! node "$dir/../src/main.ts" hook "$which"; then
  [ "$which" = start ] && printf 'BrainDog could not start; this session works without shared context.\n'
fi
exit 0
