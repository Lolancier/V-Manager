$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot "third_party\GPT-SoVITS"
$pythonPath = Join-Path $runtimeRoot ".conda\python.exe"
$apiPath = Join-Path $runtimeRoot "api_v2.py"
$logPath = Join-Path $runtimeRoot "vmanager-api.log"
$endpoint = "http://127.0.0.1:9880/docs"

function Test-GptSovitsApi {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $endpoint -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (Test-GptSovitsApi) {
    Write-Host "GPT-SoVITS is already available at http://127.0.0.1:9880"
    exit 0
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "GPT-SoVITS Python runtime is missing: $pythonPath"
}
if (-not (Test-Path -LiteralPath $apiPath)) {
    throw "GPT-SoVITS api_v2.py is missing: $apiPath"
}

$runtimeBin = Join-Path $runtimeRoot ".conda\Library\bin"
$runtimeScripts = Join-Path $runtimeRoot ".conda\Scripts"
$runtimeEnv = Join-Path $runtimeRoot ".conda"
$shell = New-Object -ComObject WScript.Shell
$shell.CurrentDirectory = $runtimeRoot
$command = 'cmd.exe /d /s /c "set ""PATH=' + $runtimeBin + ';' + $runtimeScripts + ';' + $runtimeEnv + ';%PATH%"" && ""' + $pythonPath + '"" -u -I api_v2.py -a 127.0.0.1 -p 9880 1>>""' + $logPath + '"" 2>>&1"'
$null = $shell.Run($command, 0, $false)

$deadline = (Get-Date).AddSeconds(120)
do {
    Start-Sleep -Seconds 3
    if (Test-GptSovitsApi) {
        Write-Host "GPT-SoVITS started at http://127.0.0.1:9880"
        Write-Host "Log: $logPath"
        exit 0
    }
} while ((Get-Date) -lt $deadline)

throw "GPT-SoVITS did not become ready within 120 seconds. Check: $logPath"
