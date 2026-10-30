#!/bin/sh
# The plugin's hooks: Claude Code runs this for SessionStart, SessionEnd, PostToolUse, UserPromptSubmit, PreToolUse and
# Stop, as run.sh start, end, beat, prompt, tool or stop: the six `braindog install` registers.
#
# EACH EVENT GOES TO THE COMMAND LINE'S OWN HOOK SCRIPT, the one `braindog install` and `braindog setup` register, so the
# plugin and an install do one thing the same way: what the person told the run on the next prompt, a stop that holds
# the next tool call, a turn that may not end while the run owes a reply, and the beat that keeps a long session Working.
#
# A PROFILE WHOSE SETTINGS ALREADY RUN THAT SCRIPT IS LEFT TO IT, so a profile with the plugin and an install runs each
# hook once and not twice. Where the command line is not installed, nothing happens. A hook must never stop a session,
# so every path ends in exit 0, or in the script's own.

which="${1:-start}"

cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if grep -qs 'braindog-hook\.' "$cfg/settings.json" "$cfg/settings.local.json"; then
  exit 0
fi

# Beside the command, where `braindog setup`, `braindog install` and the start hook write it.
script="$HOME/.braindog/bin/hooks/braindog-hook.sh"
if [ -f "$script" ]; then
  exec sh "$script" "$which"
fi

# NO SCRIPT YET: the start and the end go through the command itself, which writes the script for the next session.
# The other four wait for it rather than start Node on every prompt and tool call.
case "$which" in
  start | end)
    if command -v braindog >/dev/null 2>&1; then
      BRAINDOG_AGENT=claude braindog hook "$which" || true
    fi
    ;;
esac
exit 0
