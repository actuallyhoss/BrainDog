# Claude Code runs this for SessionStart, SessionEnd and PostToolUse: braindog-hook.ps1 start, end or beat.
# It hands the event on standard input to `braindog hook`, which holds all the logic and its tests.
# A hook must never stop a session, so every path ends in exit 0.

param([string]$Which = 'start')

# Windows PowerShell 5.1 pipes text to a program as ASCII unless told otherwise, which would mangle a
# folder name in the event.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding

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
  $raw | & node $main hook $Which
} catch {
  if ($Which -eq 'start') { 'BrainDog could not start; this session works without shared context.' }
}
exit 0
