#!/bin/sh
# Claude Code runs this for SessionStart, SessionEnd, PostToolUse, UserPromptSubmit, PreToolUse and Stop:
# braindog-hook.sh start, end, beat, prompt, tool or stop.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

which="${1:-start}"
dir=$(dirname "$0")

# EVERY CALL THIS SCRIPT MAKES IS CLAUDE CODE'S, so the record is reached with the token setup made for Claude Code
# when there is one (http.ts, target).
BRAINDOG_AGENT=claude
export BRAINDOG_AGENT

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

# THE PROMPT, TOOL AND STOP HOOKS RUN ON EVERY PROMPT, TOOL CALL AND TURN, so they read the session's flags file before
# Node starts (inbox-file.ts): the words of the hooks that have something to do now, which the bridge and the hooks
# keep beside the inbox file. A hook whose word is not there ends here, having started no Node, and the call goes on.
# No file is no word: a session with no bridge, or none yet, is never held up. With its word, Node reads the inbox
# file alone (inbox-file.ts as its own entry) and prints what Claude Code reads.
case "$which" in
  prompt | tool | stop)
    raw=$(cat)
    id=$(printf '%s' "$raw" | grep -o '"session_id" *: *"[A-Za-z0-9._:-]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/; s/[^A-Za-z0-9_-]/_/g')
    [ -n "$id" ] || exit 0
    flags="${XDG_CONFIG_HOME:-$HOME/.config}/braindog/sessions/${id}.inbox.flags"
    grep -qw "$which" "$flags" 2>/dev/null || exit 0
    printf '%s' "$raw" | node "$dir/../src/inbox-file.ts" "$which" 2>/dev/null
    exit 0
    ;;
  # THE WATCHER, only installed with --rewake: Claude Code runs it in the background after a turn, and its exit 2,
  # with what he said on stderr, is what wakes an idle session. Its code is passed on, never made 0.
  watch)
    node "$dir/../src/inbox-file.ts" watch
    exit $?
    ;;
esac

if ! node "$dir/../src/main.ts" hook "$which"; then
  [ "$which" = start ] && printf 'BrainDog could not start; this session works without shared context.\n'
fi
exit 0
