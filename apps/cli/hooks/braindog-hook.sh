#!/bin/sh
# Claude Code runs this for SessionStart, SessionEnd, PostToolUse, UserPromptSubmit, PreToolUse and Stop:
# braindog-hook.sh start, end, beat, prompt, tool or stop.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

which="${1:-start}"
# Its own folder, without starting `dirname`.
case "$0" in */*) dir=${0%/*} ;; *) dir=. ;; esac

# EVERY CALL THIS SCRIPT MAKES IS CLAUDE CODE'S, so the record is reached with the token setup made for Claude Code
# when there is one (http.ts, target).
BRAINDOG_AGENT=claude
export BRAINDOG_AGENT

# NODE KEEPS WHAT IT COMPILED, so a hook after the first starts in about half the time: the sources' types are not
# stripped again and the command is not parsed again. Measured on an M-series Mac, the inbox reader went from 42 to
# 20 ms and the whole command from 77 to 50. A cache he set himself is left as it is.
NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-$HOME/.braindog/cache/node}"
export NODE_COMPILE_CACHE

# THE SESSION'S ID, READ BY THE SHELL ITSELF, with no program started: the text after the first "session_id", the
# colon, and the quoted id, as beat.ts and inbox-file.ts name the files by it. An event with none leaves `id` empty.
session_id() {
  after=${raw#*\"session_id\"}
  [ "$after" = "$raw" ] && return
  gap=${after%%\"*}
  case "$gap" in *[!\ :]* | '') return ;; esac
  rest=${after#*\"}
  id=${rest%%\"*}
  case "$id" in '' | *[!A-Za-z0-9._:-]*) id='' ;; *[.:]*) id=$(printf '%s' "$id" | tr '.:' '__') ;; esac
}

# THE BEAT RUNS AFTER EVERY TOOL CALL, so it reads one file's age before Node starts (beat.ts). The session's stamp
# under ~/.braindog/beats, named from the event's session_id as beat.ts names it; written inside five minutes, the
# beat is already on the record and this ends here, having started no Node. The stamp is touched here too after Node,
# so the five minutes hold whatever Node did: an older command without `hook beat`, or no Node at all.
if [ "$which" = beat ]; then
  raw=$(cat)
  id=''
  session_id
  stamp="${HOME}/.braindog/beats/${id:--}"
  [ -n "$(find "$stamp" -mmin -5 2>/dev/null)" ] && exit 0
  printf '%s' "$raw" | node "$dir/../src/main.ts" hook beat >/dev/null 2>&1
  mkdir -p "${HOME}/.braindog/beats" 2>/dev/null && touch "$stamp" 2>/dev/null
  exit 0
fi

# THE PROMPT, TOOL AND STOP HOOKS RUN ON EVERY PROMPT, TOOL CALL AND TURN, so they read the session's flags file before
# Node starts (inbox-file.ts): the words of the hooks that have something to do now, which the bridge and the hooks
# keep beside the inbox file. A hook whose word is not there ends here, having started no program but `cat`, and the
# call goes on. No file is no word: a session with no bridge, or none yet, is never held up. With its word, Node reads
# the inbox file alone (inbox-file.ts as its own entry, which imports nothing but Node's own) and prints what Claude
# Code reads.
case "$which" in
  prompt | tool | stop)
    raw=$(cat)
    id=''
    session_id
    [ -n "$id" ] || exit 0
    # Where the CLI keeps sessions: XDG, else Windows' APPDATA (Git Bash runs this there), else ~/.config.
    cfg="${XDG_CONFIG_HOME:-}"
    [ -z "$cfg" ] && [ -n "${APPDATA:-}" ] && cfg=$(cygpath -u "$APPDATA" 2>/dev/null || printf %s "$APPDATA")
    cfg="${cfg:-$HOME/.config}"
    # THE SESSION'S TURN (inbox-file.ts, turnPath): `work` from his prompt, `rest` once a turn ends with no hook holding
    # it open, so the next start here can tell a window closed at rest from one that died at work. The shell's own
    # printf into the file, so no program starts. A subagent's stop is not the session's.
    turn="$cfg/braindog/sessions/${id}.turn"
    [ "$which" = prompt ] && { printf 'work\n' > "$turn"; } 2>/dev/null
    flags="$cfg/braindog/sessions/${id}.inbox.flags"
    words=''
    [ -f "$flags" ] && IFS= read -r words < "$flags"
    case " $words " in
      *" $which "*) ;;
      *)
        case "$which:$raw" in stop:*'"agent_id"'*) ;; stop:*) { printf 'rest\n' > "$turn"; } 2>/dev/null ;; esac
        exit 0
        ;;
    esac
    # AN ANSWER MADE READY BEFORE THE HOOK RAN (inbox-file.ts, writeReady), younger than the two minutes a file is
    # good for: printed with cat, the state and flags after it put in place with mv, and no Node started, so a hook with
    # something to say costs what one with nothing does. A subagent, a turn a Stop hook already continued, and a tool
    # named by its server are Node's to judge; a stopped run's own BrainDog tools and ToolSearch go on.
    ready="$cfg/braindog/sessions/${id}.inbox.${which}.ready"
    if [ -f "$ready" ] && [ -n "$(find "$ready" -mmin -2 2>/dev/null)" ]; then
      case "$which:$raw" in
        stop:*'"agent_id"'* | stop:*'"stop_hook_active":true'* | stop:*'"stop_hook_active": true'* | tool:*'"mcp_server"'*) ready='' ;;
      esac
      if [ "$which" = tool ] && [ -n "$ready" ]; then
        after=${raw#*\"tool_name\"}
        rest=${after#*\"}
        tool=${rest%%\"*}
        [ "$after" = "$raw" ] && tool=''
        case "$tool" in mcp__braindog__* | mcp__plugin_*_braindog__* | ToolSearch) exit 0 ;; '') ready='' ;; esac
      fi
      if [ -n "$ready" ]; then
        cat "$ready"
        if [ "$which" != tool ]; then
          mv -f "$ready.state" "${ready%.inbox.*}.hooks.json" 2>/dev/null
          mv -f "$ready.flags" "$flags" 2>/dev/null
          rm -f "$ready"
        fi
        exit 0
      fi
    fi
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
