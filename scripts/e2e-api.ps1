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
    Assert-That (-not [string]::IsNullOrWhiteSpace([string]$created.Json.pipelineId)) "success response contains a pipeline ID"
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

    # Record travel evidence with explicit consent/confirmation. This is a day
    # ledger only; it must never infer UAE or home-country tax residency.
    $mobilityBefore = (Invoke-Json -Method "GET" -Path "/api/mobility" -Body $null).Json
    Assert-That (-not $mobilityBefore.ruleset.configured -and -not $mobilityBefore.ruleset.approved -and $null -eq $mobilityBefore.ruleset.version) "tax/gratuity ruleset starts unavailable"
    $travelDay = @{
        date = (Get-Date -Format "yyyy-MM-dd")
        country = "AE"
        kind = "in_country_day"
        humanConfirmed = $true
        consentAccepted = $true
    }
    $travelRecorded = Invoke-Json -Method "POST" -Path "/api/mobility/travel-days" -Body $travelDay
    Assert-That ($travelRecorded.Status -in @(200, 201)) "consented travel-day evidence is recorded"
    $mobility = (Invoke-Json -Method "GET" -Path "/api/mobility" -Body $null).Json
    Assert-That (@($mobility.travelDays | Where-Object { $_.date -eq $travelDay.date -and $_.country -eq "AE" -and $_.kind -eq "in_country_day" }).Count -eq 1) "travel-day evidence is visible in the mobility ledger"
    Assert-That (-not $mobility.ruleset.configured -and $null -eq $mobility.gratuityEstimate -and $null -eq $mobility.residencyConclusion) "unreviewed rules do not yield a tax conclusion or gratuity amount"

    $salaryChange = @{
        effectiveDate = (Get-Date -Format "yyyy-MM-dd")
        basicSalary = 25000
        currency = "AED"
        humanConfirmed = $true
    }
    $salaryRecorded = Invoke-Json -Method "POST" -Path "/api/mobility/salary-changes" -Body $salaryChange
    Assert-That ($salaryRecorded.Status -in @(200, 201)) "confirmed synthetic basic-salary change is recorded"
    $mobility = (Invoke-Json -Method "GET" -Path "/api/mobility" -Body $null).Json
    Assert-That (@($mobility.salaryChanges | Where-Object { $_.effectiveDate -eq $salaryChange.effectiveDate -and $_.basicSalary -eq 25000 -and $_.currency -eq "AED" }).Count -eq 1) "salary evidence is visible in the ledger"
    Assert-That ($null -eq $mobility.gratuityEstimate) "salary records do not display a gratuity estimate without an approved ruleset"

    # Close the simulated case through two explicit human actions. The action
    # is local bookkeeping; it never contacts ICP/GDRFA or a PRO.
    $escalationId = $failed.Json.escalation.id
    $acknowledged = Invoke-Json -Method "PATCH" -Path "/api/escalations/$escalationId" -Body @{ humanConfirmed = $true; action = "acknowledge" }
    Assert-That ($acknowledged.Status -eq 200 -and $acknowledged.Json.status -eq "acknowledged") "specialist case acknowledgment is recorded"
    $resolved = Invoke-Json -Method "PATCH" -Path "/api/escalations/$escalationId" -Body @{ humanConfirmed = $true; action = "resolve"; resolutionCode = "evidence_corrected" }
    Assert-That ($resolved.Status -eq 200 -and $resolved.Json.status -eq "resolved") "case resolution requires a typed outcome"
    $openCases = (Invoke-Json -Method "GET" -Path "/api/escalations" -Body $null).Json.items
    Assert-That (@($openCases | Where-Object { $_.id -eq $escalationId -and $_.status -eq "resolved" }).Count -eq 1) "case lifecycle state is visible in the specialist queue"
    $audit = (Invoke-Json -Method "GET" -Path "/api/audit" -Body $null).Json.items
    Assert-That (@($audit | Where-Object { $_.pipelineId -eq $failed.Json.pipelineId -and $_.action -eq "human_escalation.acknowledged" }).Count -eq 1) "case acknowledgment is audited"
    Assert-That (@($audit | Where-Object { $_.pipelineId -eq $failed.Json.pipelineId -and $_.action -eq "human_escalation.resolved" }).Count -eq 1) "case resolution is audited"

    # Home readiness captures a reviewed lease reference and explicit approval,
    # while correctly blocking utility/IoT actions because adapters are absent.
    $homeBefore = (Invoke-Json -Method "GET" -Path "/api/home-readiness" -Body $null).Json
    Assert-That ($homeBefore.utilities.status -eq "blocked" -and $homeBefore.utilities.providerStatus -eq "unconfigured") "utilities stay blocked until a real provider adapter is configured"
    $homeRequest = Invoke-Json -Method "POST" -Path "/api/home-readiness" -Body @{ leaseReference = "synthetic:lease-$suffix"; leaseProofReviewed = $true; humanApproved = $true }
    Assert-That ($homeRequest.Status -in @(200, 201) -and $homeRequest.Json.leaseProofReviewed -and $homeRequest.Json.humanApproved) "lease review and resident approval are recorded"
    Assert-That ($homeRequest.Json.utilities.status -eq "blocked" -and $homeRequest.Json.utilities.providerStatus -eq "unconfigured") "recorded approval does not activate utilities or smart-home controls"

    # A tabletop review is evidence of discussion only. It cannot set recovery
    # objectives or claim a completed failover.
    $resilienceBefore = (Invoke-Json -Method "GET" -Path "/api/resilience" -Body $null).Json
    Assert-That ($resilienceBefore.status -eq "unknown" -and -not $resilienceBefore.failoverConfigured -and $null -eq $resilienceBefore.rpoMinutes -and $null -eq $resilienceBefore.rtoMinutes) "regional recovery remains unconfigured and unmeasured"
    $review = Invoke-Json -Method "POST" -Path "/api/resilience/reviews" -Body @{ humanConfirmed = $true; reviewedAt = (Get-Date -Format "yyyy-MM-dd"); outcome = "gaps_identified" }
    Assert-That ($review.Status -in @(200, 201) -and $review.Json.evidenceType -eq "tabletop_only" -and -not $review.Json.failoverExecuted) "resilience review is stored as tabletop-only evidence"
    $resilience = (Invoke-Json -Method "GET" -Path "/api/resilience" -Body $null).Json
    Assert-That ($resilience.status -eq "unknown" -and -not $resilience.failoverConfigured -and $null -eq $resilience.rpoMinutes -and $null -eq $resilience.rtoMinutes) "tabletop review does not claim measured recovery or failover"

    $finalStatus = (Invoke-Json -Method "GET" -Path "/api/status" -Body $null).Json
    Assert-That ($finalStatus.pipelineCount -ge ($initialStatus.pipelineCount + 2)) "status counts both new pipelines"
    Assert-That ($finalStatus.exceptionCount -ge ($initialStatus.exceptionCount + 1)) "status counts the mock exception"

    Write-Output "PASS: API end-to-end checks (onboarding, idempotency, typed case lifecycle, consented travel/salary evidence, guarded home readiness, tabletop-only resilience, SSE, audit, identity privacy)"
}
finally {
    $eventReader.Dispose()
    $eventResponse.Dispose()
    $eventClient.Dispose()
}
