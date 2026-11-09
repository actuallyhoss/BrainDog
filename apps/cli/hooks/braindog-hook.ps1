# Claude Code runs this for SessionStart, SessionEnd, PostToolUse, UserPromptSubmit, PreToolUse and Stop:
# braindog-hook.ps1 start, end, beat, prompt, tool or stop.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

param([string]$Which = 'start')

# Windows PowerShell 5.1 pipes text to a program as ASCII unless told otherwise, which would mangle a
# folder name in the event.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding

# EVERY CALL THIS SCRIPT MAKES IS CLAUDE CODE'S, so the record is reached with the token setup made for Claude Code
# when there is one (http.ts, target).
$env:BRAINDOG_AGENT = 'claude'

# NODE KEEPS WHAT IT COMPILED (braindog-hook.sh says why): a hook after the first starts in about half the time. A cache
# he set himself is left as it is.
if (-not $env:NODE_COMPILE_CACHE) { $env:NODE_COMPILE_CACHE = Join-Path $env:USERPROFILE '.braindog\cache\node' }

$main = Join-Path $PSScriptRoot '..\src\main.ts'
try {
  $raw = [Console]::In.ReadToEnd()
  # THE BEAT RUNS AFTER EVERY TOOL CALL, so it reads one file's age before Node starts (beat.ts): the session's stamp
  # under ~\.braindog\beats, named from the event's session_id as beat.ts names it. Written inside five minutes, the
  # beat is already on the record and this ends here, having started no Node. The stamp is touched here too after Node,
  # so the five minutes hold whatever Node did: an older command without `hook beat`, or no Node at all.
  if ($Which -eq 'beat') {
    $id = '-'
    $m = [regex]::Match($raw, '"session_id"\s*:\s*"([A-Za-z0-9._:-]+)"')
    if ($m.Success) { $id = $m.Groups[1].Value -replace '[^A-Za-z0-9_-]', '_' }
    $stamp = Join-Path (Join-Path $env:USERPROFILE '.braindog\beats') $id
    if ((Test-Path -LiteralPath $stamp) -and (Get-Item -LiteralPath $stamp).LastWriteTime -gt (Get-Date).AddMinutes(-5)) { exit 0 }
    try { $raw | & node $main hook beat | Out-Null } catch { }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stamp) | Out-Null
    [System.IO.File]::WriteAllText($stamp, (Get-Date).ToString('o'))
    exit 0
  }
  # THE PROMPT, TOOL AND STOP HOOKS read the session's flags file first (inbox-file.ts), the words of the hooks that
  # have something to do now, under the folder the hosts file is in. A hook whose word is not there ends here, and the
  # call goes on; with it, Node reads the inbox file alone and prints what Claude Code reads.
  if (@('prompt', 'tool', 'stop') -contains $Which) {
    $m = [regex]::Match($raw, '"session_id"\s*:\s*"([A-Za-z0-9._:-]+)"')
    if (-not $m.Success) { exit 0 }
    $id = $m.Groups[1].Value -replace '[^A-Za-z0-9_-]', '_'
    $base = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } elseif ($env:APPDATA) { $env:APPDATA } else { Join-Path $env:USERPROFILE '.config' }
    # THE SESSION'S TURN (inbox-file.ts, turnPath): work from his prompt, rest once a turn ends with no hook holding it
    # open, so the next start here can tell a window closed at rest from one that died at work. A subagent's stop is
    # not the session's.
    $turn = Join-Path $base "braindog\sessions\$id.turn"
    if ($Which -eq 'prompt') { try { [System.IO.File]::WriteAllText($turn, 'work') } catch { } }
    $rest = ($Which -eq 'stop') -and ($raw -notmatch '"agent_id"')
    $flags = Join-Path $base "braindog\sessions\$id.inbox.flags"
    if (-not (Test-Path -LiteralPath $flags)) { if ($rest) { try { [System.IO.File]::WriteAllText($turn, 'rest') } catch { } }; exit 0 }
    $words = ([System.IO.File]::ReadAllText($flags)) -split '\s+'
    if ($words -notcontains $Which) { if ($rest) { try { [System.IO.File]::WriteAllText($turn, 'rest') } catch { } }; exit 0 }
    try { $raw | & node (Join-Path $PSScriptRoot '..\src\inbox-file.ts') $Which } catch { }
    exit 0
  }
  # THE WATCHER, only installed with --rewake: its exit 2, with what he said on stderr, wakes an idle session.
  if ($Which -eq 'watch') {
    $raw | & node (Join-Path $PSScriptRoot '..\src\inbox-file.ts') watch
    exit $LASTEXITCODE
  }
  $raw | & node $main hook $Which
} catch {
  if ($Which -eq 'start') { 'BrainDog could not start; this session works without shared context.' }
}
exit 0
