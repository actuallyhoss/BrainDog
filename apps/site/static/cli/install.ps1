# Installs braindog, BrainDog's command line, for the person who runs it, on Windows:
#
#   irm https://brain.dog/cli/install.ps1 | iex
#
# WHAT IT WRITES, AND NOTHING ELSE. The command is one JavaScript file, built by apps/cli/scripts/bundle.mjs and
# published beside this script by the deploy. It goes to %USERPROFILE%\.braindog\bin\braindog.mjs, with a braindog.cmd
# shim beside it (and a braindog.ps1 when PowerShell may run one, below), and that folder goes on the user's PATH when
# it is not there already. No administrator, no system folder. Once installed, `braindog update` keeps it current: it
# reads the build published beside this script, downloads the same file to the same sum, keeps the old one as
# braindog.mjs.prev, and places the Agent Skill and hooks again. Running this script again still works, and is how a
# command older than the update verb catches up the first time.
#
# THE FILE IS HELD TO ITS SHA-256 BEFORE IT REPLACES ANYTHING. The sum is published from the same place, so it catches a
# download cut short or altered on the way; it does not defend against someone able to change what the site serves,
# who could change both.
#
# AND TO ITS SIGNATURE BEFORE IT RUNS, once $pin holds a key (apps/cli/src/release-key.ts, tools/ship/cli-key.mjs): one made at
# release with a key that is not on the site. Empty, the sum alone. THIS SCRIPT COMES FROM THE SITE TOO, so the pin holds
# against the bundle being swapped on its own, and against somebody who can rewrite the site only if you read this script
# before running it, or compare $pin with the key published in the repository's README.
#
# NODE IS NOT INSTALLED FOR YOU. The command runs on Node 24.13 or later (apps/cli/package.json, engines), and which
# Node a machine has is its owner's choice, so a missing or older one stops this with the address to get one.
#
# ONE SCRIPT BLOCK, because `iex` runs this in the caller's own session: `exit` would close their window, and every
# variable set here would be left behind in it. `return` ends the block and leaves the window as it was. It is written
# for Windows PowerShell 5.1, the one every Windows machine has, and runs the same under PowerShell 7.

& {
  $ErrorActionPreference = 'Stop'
  # Windows PowerShell 5.1 redraws a progress bar for every block Invoke-WebRequest reads, which slows the download.
  $ProgressPreference = 'SilentlyContinue'
  # Windows PowerShell 5.1 may still offer only TLS 1.0 and 1.1 by default, and a host that asks for 1.2 would refuse it.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $base = 'https://brain.dog/cli'
  $pin = 'KO5elmVCY0qrMP33qBHbPiKr-0vj58zCmV-4cnXFoZ0'
  $dir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.braindog\bin'
  $say = { param([string]$line) [Console]::Out.WriteLine($line) }
  $fail = { param([string]$line) [Console]::Error.WriteLine($line) }

  $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $node) {
    & $fail 'braindog runs on Node.js 24.13 or later, and there is no node on this PATH. Install it from https://nodejs.org, open a new window, then run this again.'
    return
  }
  $version = (& $node.Source -p 'process.versions.node' | Out-String).Trim()
  $parsed = $null
  if (-not [version]::TryParse($version, [ref]$parsed) -or $parsed -lt [version]'24.13.0') {
    & $fail "braindog runs on Node.js 24.13 or later, and this node is $version. Update it from https://nodejs.org, then run this again."
    return
  }

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # THE DOWNLOAD LANDS BESIDE ITS DESTINATION, so the move that replaces an installed copy is a rename on one volume.
  $tmp = Join-Path $dir ('.download.' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $file = Join-Path $tmp 'braindog.mjs'
    $sumFile = Join-Path $tmp 'braindog.mjs.sha256'
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$base/braindog.mjs" -OutFile $file
      Invoke-WebRequest -UseBasicParsing -Uri "$base/braindog.mjs.sha256" -OutFile $sumFile
    } catch {
      & $fail "braindog could not be downloaded from $base ($($_.Exception.Message))."
      return
    }

    $want = ((Get-Content -Raw -LiteralPath $sumFile).Trim() -split '\s+')[0].ToLowerInvariant()
    if ($want -notmatch '^[0-9a-f]{64}$') {
      & $fail "The checksum at $base/braindog.mjs.sha256 is not a SHA-256, so nothing was installed."
      return
    }
    $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    if ($got -ne $want) {
      & $fail "The download does not match its checksum (expected $want, got $got), so nothing was installed. Run this again to download it afresh."
      return
    }

    # A FILE FOR THE CHECK AND NOT node -e, because Windows PowerShell 5.1 strips the double quotes from an argument it hands on.
    if ($pin -ne '') {
      $sigFile = Join-Path $tmp 'braindog.mjs.sig'
      $buildFile = Join-Path $tmp 'braindog.mjs.build'
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/braindog.mjs.sig" -OutFile $sigFile
        Invoke-WebRequest -UseBasicParsing -Uri "$base/braindog.mjs.build" -OutFile $buildFile
      } catch {
        & $fail "This build has no signature at $base/braindog.mjs.sig, so nothing was installed. Run this again in a few minutes; if it says the same, do not install it another way."
        return
      }
      $check = Join-Path $tmp 'check.cjs'
      [IO.File]::WriteAllText($check, 'const c=require("node:crypto"),f=require("node:fs");const [pin,sum,build,sig]=process.argv.slice(2);const [r,b]=f.readFileSync(sig,"utf8").trim().split(/\s+/);const s=Buffer.from(b||"","base64url");const m=Buffer.from("braindog-cli release\n"+sum+"\n"+build+"\n"+r+"\n");process.exit(/^\d+$/.test(r)&&s.length===64&&pin.split(" ").some((x)=>{try{return c.verify(null,m,{key:{kty:"OKP",crv:"Ed25519",x},format:"jwk"},s)}catch(e){return false}})?0:1)')
      $null = & $node.Source $check $pin $got ((Get-Content -Raw -LiteralPath $buildFile).Trim()) $sigFile
      if ($LASTEXITCODE -ne 0) {
        & $fail "The signature on this build is not BrainDog's, so nothing was installed and it did not run. Run this again in a few minutes; if it says the same, do not install it another way."
        return
      }
    }

    # ASKED BEFORE IT IS PUT IN PLACE, so a file this Node cannot run never replaces one that works. Standard error is
    # left alone rather than redirected: under 'Stop', Windows PowerShell 5.1 turns a redirected line of it into a throw.
    $null = & $node.Source $file --version
    if ($LASTEXITCODE -ne 0) {
      & $fail 'The downloaded braindog did not run under this Node, so nothing was installed.'
      return
    }
    Move-Item -Force -LiteralPath $file -Destination (Join-Path $dir 'braindog.mjs')

    # THE SHIMS FIND THE FILE BESIDE THEMSELVES (%~dp0 and $PSScriptRoot), so they need no path written into them and
    # keep working if the profile folder is renamed. UTF-8 with no byte order mark, which cmd would read as text.
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $write = {
      param([string]$name, [string[]]$lines)
      $staged = Join-Path $tmp $name
      [IO.File]::WriteAllText($staged, (($lines -join "`r`n") + "`r`n"), $utf8)
      Move-Item -Force -LiteralPath $staged -Destination (Join-Path $dir $name)
    }
    & $write 'braindog.cmd' @('@echo off', 'node "%~dp0braindog.mjs" %*')

    # THE .ps1 ONLY WHERE POWERSHELL WILL RUN IT. PowerShell prefers braindog.ps1 to braindog.cmd in the same folder,
    # and under the 'Restricted' policy a fresh Windows machine has, or 'AllSigned', it refuses the script instead of
    # falling back to the .cmd, so `braindog` would stop working in the very window it was installed from. The .cmd
    # works in both shells; the .ps1 only passes arguments more faithfully. Windows PowerShell and PowerShell 7 keep
    # separate policies, so from PowerShell 7 the other one is asked too.
    $policies = @([string](Get-ExecutionPolicy))
    if ($PSVersionTable.PSEdition -eq 'Core') {
      $desktop = Get-Command powershell.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($desktop) { $policies += (& $desktop.Source -NoProfile -NonInteractive -Command 'Get-ExecutionPolicy' | Out-String).Trim() }
    }
    $ps1 = Join-Path $dir 'braindog.ps1'
    if (@($policies | Where-Object { $_ -in 'Restricted', 'AllSigned' }).Count -eq 0) {
      & $write 'braindog.ps1' @('& node (Join-Path $PSScriptRoot ''braindog.mjs'') @args', 'exit $LASTEXITCODE')
    } elseif (Test-Path -LiteralPath $ps1) {
      Remove-Item -Force -LiteralPath $ps1
    }
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
  }

  # THE USER'S PATH, READ AND WRITTEN IN THE REGISTRY AS IT IS STORED. [Environment]::GetEnvironmentVariable expands
  # %USERPROFILE% and the like in the answer, and SetEnvironmentVariable writes a plain string back, so a round trip
  # through them would turn every such entry into a fixed path. Here the raw value is read and its kind kept.
  $same = { param([string]$a) [Environment]::ExpandEnvironmentVariables($a).Trim().TrimEnd('\') -ieq $dir.TrimEnd('\') }
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  try {
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if (-not @($raw -split ';' | Where-Object { & $same $_ }).Count) {
      $kind = if ($key.GetValueNames() -contains 'Path') { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
      $key.SetValue('Path', ((@($raw.TrimEnd(';')) + $dir | Where-Object { $_ }) -join ';'), $kind)
      # Windows tells open programs the environment changed only when it is changed through the API, so one name is
      # set and removed through it: Explorer then hands the new PATH to every window opened after this.
      [Environment]::SetEnvironmentVariable('BRAINDOG_INSTALLING', '1', 'User')
      [Environment]::SetEnvironmentVariable('BRAINDOG_INSTALLING', $null, 'User')
      & $say "Added $dir to your PATH."
    }
  } finally {
    $key.Close()
  }
  # AND THIS WINDOW'S, which the registry does not reach, so the next line typed here finds braindog.
  if (-not @($env:Path -split ';' | Where-Object { & $same $_ }).Count) { $env:Path = ($env:Path.TrimEnd(';') + ';' + $dir) }

  # THE ANSWER IS PRINTED BY THE COMMAND ITSELF AND NOT CAPTURED HERE, because a capture in Windows PowerShell 5.1 reads
  # Node's UTF-8 through the console's own code page, which can turn the separators of the version line into others.
  & $say "Installed braindog at $dir\braindog.mjs, through the shim in the same folder:"
  & (Join-Path $dir 'braindog.cmd') --version
  & $say 'Run braindog --version here or in any new window to check it.'
}
