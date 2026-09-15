#!/bin/sh
# Claude Code runs this for SessionStart and SessionEnd: braindog-hook.sh start, or braindog-hook.sh end.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

which="${1:-start}"
dir=$(dirname "$0")
if ! node "$dir/../src/main.ts" hook "$which"; then
  [ "$which" = start ] && printf 'BrainDog could not start; this session works without shared context.\n'
fi
exit 0
