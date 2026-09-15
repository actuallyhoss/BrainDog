# Claude Code runs this for SessionStart and SessionEnd: braindog-hook.ps1 start, or braindog-hook.ps1 end.
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
  $raw | & node $main hook $Which
} catch {
  if ($Which -eq 'start') { 'BrainDog could not start; this session works without shared context.' }
}
exit 0
