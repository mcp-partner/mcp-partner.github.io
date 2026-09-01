[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Purge
)

$ErrorActionPreference = 'Stop'
$AppName = 'MCP Partner (CORS Bypass)'
$AppUrl = 'https://mcp-partner.github.io/?unsafe-cors-bypass=1'
$InstallDir = Join-Path $env:LOCALAPPDATA 'MCP Partner CORS Bypass'
$ProfileDir = Join-Path $InstallDir 'ChromeProfile'
$IconPath = Join-Path $InstallDir 'mcp-partner.ico'
$ManagerPath = Join-Path $InstallDir 'install-windows.ps1'
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "$AppName.lnk"
$ProgramsDir = [Environment]::GetFolderPath('Programs')
$StartMenuShortcut = Join-Path $ProgramsDir "$AppName.lnk"

function Remove-Shortcuts {
    Remove-Item -LiteralPath $DesktopShortcut -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $StartMenuShortcut -Force -ErrorAction SilentlyContinue
}

if ($Uninstall -or $Purge) {
    Remove-Shortcuts
    Remove-Item -LiteralPath $IconPath -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed MCP Partner shortcuts and icon.'

    if ($Purge) {
        $ExpectedDir = Join-Path $env:LOCALAPPDATA 'MCP Partner CORS Bypass'
        if ($InstallDir -ne $ExpectedDir) {
            throw "Refusing to remove unexpected path: $InstallDir"
        }
        Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host 'Removed the isolated browser profile.'
    }
    else {
        Write-Host "The isolated profile remains at: $ProfileDir"
    }
    exit 0
}

function Find-ChromiumBrowser {
    if ($env:MCP_PARTNER_BROWSER -and (Test-Path -LiteralPath $env:MCP_PARTNER_BROWSER -PathType Leaf)) {
        return $env:MCP_PARTNER_BROWSER
    }

    $Candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
    )

    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
            return $Candidate
        }
    }
    return $null
}

$BrowserPath = Find-ChromiumBrowser
if (-not $BrowserPath) {
    throw 'No supported Chromium browser found. Install Chrome, Edge, or Brave first.'
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null

if ($PSCommandPath) {
    $SourcePath = [IO.Path]::GetFullPath($PSCommandPath)
    $DestinationPath = [IO.Path]::GetFullPath($ManagerPath)
    if ($SourcePath -ne $DestinationPath) {
        Copy-Item -LiteralPath $SourcePath -Destination $ManagerPath -Force
    }
}

Invoke-WebRequest `
    -Uri 'https://mcp-partner.github.io/icon_256px.ico' `
    -OutFile $IconPath `
    -UseBasicParsing

$Arguments = @(
    "--app=`"$AppUrl`""
    "--user-data-dir=`"$ProfileDir`""
    '--disable-web-security'
    '--allow-running-insecure-content'
    '--disable-extensions'
    '--disable-sync'
    '--no-first-run'
    '--no-default-browser-check'
    '--window-size=1400,900'
) -join ' '

$Shell = New-Object -ComObject WScript.Shell
foreach ($ShortcutPath in @($DesktopShortcut, $StartMenuShortcut)) {
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $BrowserPath
    $Shortcut.Arguments = $Arguments
    $Shortcut.WorkingDirectory = Split-Path -Parent $BrowserPath
    $Shortcut.IconLocation = "$IconPath,0"
    $Shortcut.Description = 'MCP Partner with browser CORS disabled in an isolated profile'
    $Shortcut.WindowStyle = 1
    $Shortcut.Save()
}

Write-Host "Installed: $AppName"
Write-Host "Browser:   $BrowserPath"
Write-Host "Desktop:   $DesktopShortcut"
Write-Host "Start Menu:$StartMenuShortcut"
Write-Host "Profile:   $ProfileDir"
Write-Host "Manage:    $ManagerPath"
Write-Host ''
Write-Warning 'Use this shortcut only for MCP Partner. Do not sign in or browse other sites in its window.'
