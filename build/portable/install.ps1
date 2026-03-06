# Selltkey Scraper - 초기 설정 (PowerShell)
# 관리자 권한으로 실행 필요

$ErrorActionPreference = "SilentlyContinue"
$Host.UI.RawUI.WindowTitle = "Selltkey Scraper - 초기 설정"

# 관리자 권한 확인 및 요청
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] 관리자 권한이 필요합니다. 권한을 요청합니다..."
    Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $scriptDir "app"

Write-Host "============================================"
Write-Host "  Selltkey Scraper - 초기 설정"
Write-Host "============================================"
Write-Host ""

# 1. Windows Defender 예외 경로 등록
Write-Host "[1/4] Windows Defender 예외 경로 등록 중..."
try {
    Add-MpPreference -ExclusionPath $appDir -ErrorAction Stop
    Write-Host "      [OK] Defender 예외 등록 완료: $appDir"
} catch {
    Write-Host "      [SKIP] Defender 설정을 변경할 수 없습니다. (Windows Defender가 비활성화되었거나 다른 백신 사용 중)"
}

# 2. SmartScreen Zone Identifier 제거
Write-Host "[2/4] SmartScreen 차단 해제 중..."
try {
    Get-ChildItem -Path $appDir -Recurse -ErrorAction Stop | Unblock-File -ErrorAction SilentlyContinue
    Write-Host "      [OK] 파일 차단 해제 완료"
} catch {
    Write-Host "      [SKIP] 파일 차단 해제에 실패했습니다."
}

# 3. Puppeteer Chromium 경로도 예외 등록
Write-Host "[3/4] Puppeteer Chromium 예외 등록 중..."
$puppeteerPaths = @(
    (Join-Path $appDir "resources\app.asar.unpacked\node_modules\puppeteer"),
    (Join-Path $appDir "resources\app.asar.unpacked\node_modules\@puppeteer")
)
foreach ($basePath in $puppeteerPaths) {
    if (Test-Path $basePath) {
        Get-ChildItem -Path $basePath -Directory | ForEach-Object {
            try {
                Add-MpPreference -ExclusionPath $_.FullName -ErrorAction Stop
            } catch { }
        }
    }
}
Write-Host "      [OK] Chromium 예외 등록 완료"

# 4. 바탕화면 바로가기 생성
Write-Host "[4/4] 바탕화면 바로가기 생성 중..."
try {
    $ws = New-Object -ComObject WScript.Shell
    $desktopPath = $ws.SpecialFolders("Desktop")
    $shortcutPath = Join-Path $desktopPath "Selltkey Scraper.lnk"
    $exePath = Join-Path $appDir "selltkeyscraper.exe"

    $sc = $ws.CreateShortcut($shortcutPath)
    $sc.TargetPath = $exePath
    $sc.WorkingDirectory = $appDir
    $sc.IconLocation = "$exePath,0"
    $sc.Save()
    Write-Host '      [OK] 바탕화면에 "Selltkey Scraper" 바로가기가 생성되었습니다.'
} catch {
    Write-Host "      [SKIP] 바로가기 생성에 실패했습니다: $_"
}

Write-Host ""
Write-Host "============================================"
Write-Host "  설정이 완료되었습니다!"
Write-Host '  바탕화면의 "Selltkey Scraper" 아이콘으로 실행하세요.'
Write-Host "============================================"
Write-Host ""
Read-Host "Enter 키를 누르면 종료합니다"
exit
