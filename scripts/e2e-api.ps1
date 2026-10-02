param(
    [string]$BaseUrl = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"

function Assert-That {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "E2E assertion failed: $Message" }
}

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body,
        [hashtable]$Headers = @{}
    )

    $request = @{
        Uri = "$BaseUrl$Path"
        Method = $Method
        Headers = $Headers
        SkipHttpErrorCheck = $true
    }
    if ($null -ne $Body) {
        $request.Body = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
        $request.ContentType = "application/json"
    }
    $response = Invoke-WebRequest @request
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
        $parsed = ConvertFrom-Json -InputObject $response.Content
    }
    return [pscustomobject]@{
        Status = [int]$response.StatusCode
        Json = $parsed
        Raw = [string]$response.Content
    }
}

function Wait-ForSseEvent {
    param([System.IO.StreamReader]$Reader, [string]$Name, [int]$TimeoutSeconds = 10)

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lineTask = $Reader.ReadLineAsync()
    while ([DateTime]::UtcNow -lt $deadline) {
        $remainingMs = [int][Math]::Min(1000, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
        if (-not $lineTask.Wait($remainingMs)) { continue }
        $line = $lineTask.Result
        if ($null -eq $line) { break }
        if ($line -ceq "event: $Name") { return $true }
        $lineTask = $Reader.ReadLineAsync()
    }
    return $false
}

# Fail quickly if the service is not started.
$health = Invoke-Json -Method "GET" -Path "/health" -Body $null
Assert-That ($health.Status -eq 200 -and $health.Json.status -eq "ok") "health endpoint responds"

$initialStatus = (Invoke-Json -Method "GET" -Path "/api/status" -Body $null).Json
Assert-That ($initialStatus.environment -eq "local-demo" -and $initialStatus.providers -eq "mock") "service advertises local mock providers"

# Subscribe before creating pipelines so the test observes live events.
$eventClient = [System.Net.Http.HttpClient]::new()
$eventClient.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan
$eventResponse = $eventClient.GetAsync(
    "$BaseUrl/api/events",
    [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
).GetAwaiter().GetResult()
Assert-That ($eventResponse.IsSuccessStatusCode) "SSE endpoint connects"
Assert-That ($eventResponse.Content.Headers.ContentType.MediaType -eq "text/event-stream") "SSE content type is correct"
$eventReader = [System.IO.StreamReader]::new($eventResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult())

$suffix = [Guid]::NewGuid().ToString("N")
$idempotencyKey = [Guid]::NewGuid().ToString()
$successToken = "demo:smoke-$suffix"
$successBody = @{
    firstName = "Alex"
    lastName = "Example"
    email = "alex-$suffix@example.test"
    identityToken = $successToken
}

try {
    $created = Invoke-Json -Method "POST" -Path "/api/onboarding" -Body $successBody -Headers @{ "Idempotency-Key" = $idempotencyKey }
    Assert-That ($created.Status -eq 201) "new onboarding returns HTTP 201"
    Assert-That ($created.Json.state -eq "completed" -and $created.Json.stage -eq "complete") "success saga completes all stages"
    Assert-That ($created.Json.pipelineId) "success response contains a pipeline ID"
    Assert-That (-not $created.Raw.Contains($successToken)) "identity token is not returned"

    $replay = Invoke-Json -Method "POST" -Path "/api/onboarding" -Body $successBody -Headers @{ "Idempotency-Key" = $idempotencyKey }
    Assert-That ($replay.Status -eq 200 -and $replay.Json.pipelineId -eq $created.Json.pipelineId) "idempotent retry replays the original pipeline"

    $listed = (Invoke-Json -Method "GET" -Path "/api/pipelines" -Body $null).Json.items
    Assert-That (@($listed | Where-Object { $_.pipelineId -eq $created.Json.pipelineId }).Count -eq 1) "completed pipeline is visible in the dashboard API"
    Assert-That (-not (ConvertTo-Json -InputObject $listed -Depth 8 -Compress).Contains($successToken)) "pipeline listing does not expose identity tokens"
    Assert-That (Wait-ForSseEvent -Reader $eventReader -Name "pipeline.updated") "pipeline updates stream over SSE"

    $invalid = Invoke-Json -Method "POST" -Path "/api/onboarding" -Body @{ firstName = ""; lastName = "Example"; email = "bad@example.test"; identityToken = "demo:invalid" }
    Assert-That ($invalid.Status -eq 400) "invalid onboarding is rejected with HTTP 400"

    $duplicateEmail = @{
        firstName = "Sam"
        lastName = "Different"
        email = $successBody.email
        identityToken = "demo:second-token-$suffix"
    }
    $conflict = Invoke-Json -Method "POST" -Path "/api/onboarding" -Body $duplicateEmail -Headers @{ "Idempotency-Key" = [Guid]::NewGuid().ToString() }
    Assert-That ($conflict.Status -eq 409) "an email reused for another request returns HTTP 409"

    $failureToken = "demo:fail-icp"
    $failureBody = @{
        firstName = "Taylor"
        lastName = "Mock"
        email = "taylor-$suffix@example.test"
        identityToken = $failureToken
    }
    $failed = Invoke-Json -Method "POST" -Path "/api/onboarding" -Body $failureBody -Headers @{ "Idempotency-Key" = [Guid]::NewGuid().ToString() }
    Assert-That ($failed.Status -eq 201 -and $failed.Json.state -eq "failed" -and $failed.Json.stage -eq "icp") "synthetic ICP rejection creates a failed pipeline"
    Assert-That ($failed.Json.exception.code -eq "ICP_DEMO_REJECTION") "mock failure carries a typed exception"
    Assert-That (-not $failed.Raw.Contains($failureToken)) "identity token is not returned after provider rejection"
    Assert-That ($failed.Json.escalation.status -eq "pending_human") "hard failure creates a pending human escalation"
    Assert-That ($failed.Json.escalation.owningTeam -eq "icp_case_management") "ICP failure is routed to the specialist case-management team"
    Assert-That (-not $failed.Raw.Contains($failureToken)) "escalation response does not expose the identity token"

    $exceptions = (Invoke-Json -Method "GET" -Path "/api/exceptions" -Body $null).Json.items
    Assert-That (@($exceptions | Where-Object { $_.pipelineId -eq $failed.Json.pipelineId -and $_.code -eq "ICP_DEMO_REJECTION" }).Count -eq 1) "failed pipeline appears in the exception inbox"
    Assert-That (-not (ConvertTo-Json -InputObject $exceptions -Depth 8 -Compress).Contains($failureToken)) "exception inbox does not expose identity tokens"
    Assert-That (Wait-ForSseEvent -Reader $eventReader -Name "exception.created") "exceptions stream over SSE"
    $escalations = (Invoke-Json -Method "GET" -Path "/api/escalations" -Body $null).Json.items
    Assert-That (@($escalations | Where-Object { $_.pipelineId -eq $failed.Json.pipelineId -and $_.status -eq "pending_human" -and $_.owningTeam -eq "icp_case_management" }).Count -eq 1) "failed pipeline appears once in the specialist human-review queue"
    Assert-That (-not (ConvertTo-Json -InputObject $escalations -Depth 8 -Compress).Contains($failureToken)) "escalation queue does not expose identity tokens"
    Assert-That (Wait-ForSseEvent -Reader $eventReader -Name "escalation.created") "human escalations stream over SSE"
    $audit = (Invoke-Json -Method "GET" -Path "/api/audit" -Body $null).Json.items
    Assert-That (@($audit | Where-Object { $_.pipelineId -eq $failed.Json.pipelineId -and $_.action -eq "human_escalation.created" -and $_.escalation.owningTeam -eq "icp_case_management" }).Count -eq 1) "human routing choice is present in the audit trail"
    Assert-That (-not (ConvertTo-Json -InputObject $audit -Depth 8 -Compress).Contains($failureToken)) "audit trail does not expose identity tokens"

    $finalStatus = (Invoke-Json -Method "GET" -Path "/api/status" -Body $null).Json
    Assert-That ($finalStatus.pipelineCount -ge ($initialStatus.pipelineCount + 2)) "status counts both new pipelines"
    Assert-That ($finalStatus.exceptionCount -ge ($initialStatus.exceptionCount + 1)) "status counts the mock exception"

    Write-Output "PASS: API end-to-end smoke checks (success saga, idempotency, validation, conflict, ICP exception, human escalation, SSE, audit, token privacy)"
}
finally {
    $eventReader.Dispose()
    $eventResponse.Dispose()
    $eventClient.Dispose()
}
