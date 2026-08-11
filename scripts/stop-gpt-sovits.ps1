$ErrorActionPreference = "Stop"

$endpoint = "http://127.0.0.1:9880/control?command=exit"
try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $endpoint -TimeoutSec 5
} catch {
    # A successful exit may close the connection before a response is returned.
}

Start-Sleep -Seconds 2
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:9880/docs" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        throw "GPT-SoVITS is still running at http://127.0.0.1:9880"
    }
} catch {
    if ($_.Exception.Message -like "GPT-SoVITS is still running*") {
        throw
    }
}

Write-Host "GPT-SoVITS stopped."
