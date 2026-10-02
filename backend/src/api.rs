use std::{cmp::Reverse, convert::Infallible, sync::Arc};

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{NaiveDate, Utc};
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer};
use uuid::Uuid;

use crate::{
    escalation::EscalationRouting,
    model::{
        ApiErrorBody, ApiErrorDetail, AuditRecord, CaseManagerEscalation,
        CreateResilienceReviewRequest, CreateSalaryChangeRequest, CreateTravelDayRequest,
        EscalationAction, EscalationActionRequest, EscalationAuditDetails, EscalationStatus,
        ExceptionRecord, HomeReadinessGate, HomeReadinessRequest, HomeReadinessResponse,
        HomeUtilitiesStatus, ListResponse, MobilityResponse, MobilityRulesetStatus,
        OnboardingRequest, OnboardingResponse, PipelineSummary, ResilienceResponse,
        ResilienceReviewEvidence, SalaryChangeEvidence, StatusResponse, TravelDayEvidence,
    },
    saga,
    store::{Store, StoredSubmission},
};

#[derive(Clone)]
pub(crate) struct AppState {
    store: Arc<Store>,
    events: broadcast::Sender<DemoEvent>,
    environment: Arc<str>,
    escalation_routing: Arc<EscalationRouting>,
}

#[derive(Debug, Clone)]
pub(crate) struct DemoEvent {
    name: &'static str,
    data: Value,
}

impl AppState {
    pub(crate) fn new(
        store: Store,
        events: broadcast::Sender<DemoEvent>,
        environment: String,
        escalation_routing: EscalationRouting,
    ) -> Self {
        Self {
            store: Arc::new(store),
            events,
            environment: environment.into(),
            escalation_routing: Arc::new(escalation_routing),
        }
    }

    fn allows_demo_failures(&self) -> bool {
        self.environment.as_ref() == "local-demo"
    }

    fn requires_local_demo(&self) -> Result<(), (StatusCode, Json<ApiErrorBody>)> {
        if self.environment.as_ref() == "local-demo" {
            Ok(())
        } else {
            Err(api_error(
                StatusCode::FORBIDDEN,
                "LOCAL_DEMO_ONLY",
                "This prototype workflow is available only in the local-demo environment.",
            ))
        }
    }
}

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/status", get(status))
        .route("/api/pipelines", get(pipelines))
        .route("/api/exceptions", get(exceptions))
        .route("/api/escalations", get(escalations))
        .route("/api/escalations/{id}", patch(update_escalation))
        .route("/api/mobility", get(mobility))
        .route("/api/mobility/travel-days", post(create_travel_day))
        .route("/api/mobility/salary-changes", post(create_salary_change))
        .route(
            "/api/home-readiness",
            get(home_readiness).post(record_home_readiness),
        )
        .route("/api/resilience", get(resilience))
        .route("/api/resilience/reviews", post(create_resilience_review))
        .route("/api/audit", get(audit_records))
        .route("/api/onboarding", post(create_onboarding))
        .route("/api/events", get(events))
        .layer(RequestBodyLimitLayer::new(16 * 1024))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    HeaderValue::from_static("http://127.0.0.1:5173"),
                    HeaderValue::from_static("http://localhost:5173"),
                    HeaderValue::from_static("http://127.0.0.1:4173"),
                    HeaderValue::from_static("http://localhost:4173"),
                ])
                .allow_methods([Method::GET, Method::POST, Method::PATCH])
                .allow_headers([
                    header::CONTENT_TYPE,
                    HeaderName::from_static("idempotency-key"),
                ]),
        )
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({"status":"ok"}))
}

async fn status(State(state): State<AppState>) -> Json<StatusResponse> {
    let pipeline_count = state.store.pipelines.read().await.len();
    let exception_count = state.store.exceptions.read().await.len();
    Json(StatusResponse {
        status: "healthy",
        environment: state.environment.to_string(),
        pipeline_count,
        exception_count,
        providers: "mock",
    })
}

async fn pipelines(State(state): State<AppState>) -> Json<ListResponse<PipelineSummary>> {
    let mut items = state
        .store
        .pipelines
        .read()
        .await
        .values()
        .cloned()
        .collect::<Vec<_>>();
    items.sort_by_key(|item| Reverse(item.updated_at));
    Json(ListResponse { items })
}

async fn exceptions(State(state): State<AppState>) -> Json<ListResponse<ExceptionRecord>> {
    let mut items = state.store.exceptions.read().await.clone();
    items.sort_by_key(|item| Reverse(item.occurred_at));
    Json(ListResponse { items })
}

async fn audit_records(State(state): State<AppState>) -> Json<ListResponse<AuditRecord>> {
    let items = state.store.audits.read().await.clone();
    Json(ListResponse { items })
}

async fn escalations(State(state): State<AppState>) -> Json<ListResponse<CaseManagerEscalation>> {
    let mut items = state.store.escalations.read().await.clone();
    items.sort_by_key(|item| Reverse(item.created_at));
    Json(ListResponse { items })
}

async fn update_escalation(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<(StatusCode, Json<CaseManagerEscalation>), (StatusCode, Json<ApiErrorBody>)> {
    state.requires_local_demo()?;
    let escalation_id = Uuid::parse_str(&id).map_err(|_| {
        api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_ESCALATION_ID",
            "Escalation id must be a UUID.",
        )
    })?;
    let request: EscalationActionRequest = decode_request(&body)?;
    if !request.human_confirmed {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "HUMAN_CONFIRMATION_REQUIRED",
            "A human must explicitly confirm this case action.",
        ));
    }

    let (updated, changed) = {
        let mut escalations = state.store.escalations.write().await;
        let Some(escalation) = escalations.iter_mut().find(|item| item.id == escalation_id) else {
            return Err(api_error(
                StatusCode::NOT_FOUND,
                "ESCALATION_NOT_FOUND",
                "No escalation exists for this id.",
            ));
        };

        match request.action {
            EscalationAction::Acknowledge => {
                if request.resolution_code.is_some() {
                    return Err(api_error(
                        StatusCode::BAD_REQUEST,
                        "UNEXPECTED_RESOLUTION_CODE",
                        "A resolution code is only valid when resolving an acknowledged case.",
                    ));
                }
                match escalation.status {
                    EscalationStatus::PendingHuman => {
                        escalation.status = EscalationStatus::Acknowledged;
                        escalation.acknowledged_at = Some(Utc::now());
                        (escalation.clone(), true)
                    }
                    EscalationStatus::Acknowledged => (escalation.clone(), false),
                    EscalationStatus::Resolved => {
                        return Err(api_error(
                            StatusCode::CONFLICT,
                            "ESCALATION_ALREADY_RESOLVED",
                            "A resolved case cannot be acknowledged again.",
                        ));
                    }
                }
            }
            EscalationAction::Resolve => {
                let Some(resolution_code) = request.resolution_code else {
                    return Err(api_error(
                        StatusCode::BAD_REQUEST,
                        "RESOLUTION_CODE_REQUIRED",
                        "Resolving a case requires an approved typed resolution code.",
                    ));
                };
                match escalation.status {
                    EscalationStatus::PendingHuman => {
                        return Err(api_error(
                            StatusCode::CONFLICT,
                            "ESCALATION_ACKNOWLEDGEMENT_REQUIRED",
                            "A case must be acknowledged before it can be resolved.",
                        ));
                    }
                    EscalationStatus::Acknowledged => {
                        escalation.status = EscalationStatus::Resolved;
                        escalation.resolved_at = Some(Utc::now());
                        escalation.resolution_code = Some(resolution_code);
                        (escalation.clone(), true)
                    }
                    EscalationStatus::Resolved
                        if escalation.resolution_code == Some(resolution_code) =>
                    {
                        (escalation.clone(), false)
                    }
                    EscalationStatus::Resolved => {
                        return Err(api_error(
                            StatusCode::CONFLICT,
                            "ESCALATION_RESOLUTION_CONFLICT",
                            "This case was already resolved with a different code.",
                        ));
                    }
                }
            }
        }
    };

    if changed {
        let action = match updated.status {
            EscalationStatus::Acknowledged => "human_escalation.acknowledged",
            EscalationStatus::Resolved => "human_escalation.resolved",
            EscalationStatus::PendingHuman => {
                unreachable!("only lifecycle transitions are audited")
            }
        };
        state.store.audits.write().await.push(AuditRecord {
            id: Uuid::new_v4(),
            pipeline_id: updated.pipeline_id,
            actor: "local-demo-human-confirmed".to_owned(),
            action: action.to_owned(),
            stage: updated.stage.clone(),
            state: crate::model::PipelineState::Failed,
            timestamp: Utc::now(),
            escalation: Some(EscalationAuditDetails {
                escalation_id: updated.id,
                severity: updated.severity,
                owning_team: updated.owning_team,
                status: updated.status,
                required_next_action: updated.required_next_action.clone(),
                resolution_code: updated.resolution_code,
            }),
        });
        let _ = state.events.send(DemoEvent {
            name: "escalation.updated",
            data: serde_json::to_value(&updated)
                .unwrap_or_else(|_| json!({"error":"event serialization failed"})),
        });
    }

    Ok((StatusCode::OK, Json(updated)))
}

async fn mobility(State(state): State<AppState>) -> Json<MobilityResponse> {
    let mut travel_days = state.store.travel_days.read().await.clone();
    travel_days.sort_by(|a, b| a.date.cmp(&b.date));
    let mut salary_changes = state.store.salary_changes.read().await.clone();
    salary_changes.sort_by(|a, b| a.effective_date.cmp(&b.effective_date));
    Json(MobilityResponse {
        ruleset: MobilityRulesetStatus {
            configured: false,
            approved: false,
            version: None,
        },
        travel_days,
        salary_changes,
    })
}

async fn create_travel_day(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<(StatusCode, Json<TravelDayEvidence>), (StatusCode, Json<ApiErrorBody>)> {
    state.requires_local_demo()?;
    let request: CreateTravelDayRequest = decode_request(&body)?;
    if !request.human_confirmed {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "HUMAN_CONFIRMATION_REQUIRED",
            "Travel-day evidence must be confirmed by the employee.",
        ));
    }
    if !request.consent_accepted {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "CONSENT_REQUIRED",
            "The employee must consent before a travel-day record is stored.",
        ));
    }
    if request.country != "AE" {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "UNSUPPORTED_COUNTRY",
            "This local demo accepts travel-day evidence only for AE.",
        ));
    }
    let date = parse_iso_date(&request.date).ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_DATE",
            "date must be a calendar date in YYYY-MM-DD format.",
        )
    })?;
    if date > Utc::now().date_naive() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "FUTURE_TRAVEL_DATE",
            "Travel-day evidence can only be recorded for a date that has occurred.",
        ));
    }

    let (record, status) = {
        let mut rows = state.store.travel_days.write().await;
        if let Some(existing) = rows.iter().find(|row| {
            row.date == request.date && row.country == request.country && row.kind == request.kind
        }) {
            (existing.clone(), StatusCode::OK)
        } else {
            let record = TravelDayEvidence {
                id: Uuid::new_v4(),
                date: request.date,
                country: request.country,
                kind: request.kind,
                human_confirmed: true,
                consent_accepted: true,
                recorded_at: Utc::now(),
            };
            rows.push(record.clone());
            (record, StatusCode::CREATED)
        }
    };
    if status == StatusCode::CREATED {
        let _ = state.events.send(DemoEvent {
            name: "mobility.travel_day.recorded",
            data: json!({"id": record.id}),
        });
    }
    Ok((status, Json(record)))
}

async fn create_salary_change(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<(StatusCode, Json<SalaryChangeEvidence>), (StatusCode, Json<ApiErrorBody>)> {
    state.requires_local_demo()?;
    let request: CreateSalaryChangeRequest = decode_request(&body)?;
    if !request.human_confirmed {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "HUMAN_CONFIRMATION_REQUIRED",
            "A human must confirm the salary-change evidence.",
        ));
    }
    if parse_iso_date(&request.effective_date).is_none() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_DATE",
            "effectiveDate must be a calendar date in YYYY-MM-DD format.",
        ));
    }
    if !request.basic_salary.is_finite()
        || request.basic_salary <= 0.0
        || request.basic_salary > 1_000_000_000.0
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_BASIC_SALARY",
            "basicSalary must be a positive finite number within the supported input range.",
        ));
    }
    if request.currency.len() != 3
        || !request
            .currency
            .bytes()
            .all(|byte| byte.is_ascii_uppercase())
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_CURRENCY",
            "currency must be a three-letter uppercase code.",
        ));
    }

    let (record, status) = {
        let mut rows = state.store.salary_changes.write().await;
        if let Some(existing) = rows
            .iter()
            .find(|row| row.effective_date == request.effective_date)
        {
            if existing.basic_salary == request.basic_salary
                && existing.currency == request.currency
            {
                (existing.clone(), StatusCode::OK)
            } else {
                return Err(api_error(
                    StatusCode::CONFLICT,
                    "SALARY_CHANGE_DATE_CONFLICT",
                    "A different salary-change record already exists for this effective date.",
                ));
            }
        } else {
            let record = SalaryChangeEvidence {
                id: Uuid::new_v4(),
                effective_date: request.effective_date,
                basic_salary: request.basic_salary,
                currency: request.currency,
                human_confirmed: true,
                recorded_at: Utc::now(),
            };
            rows.push(record.clone());
            (record, StatusCode::CREATED)
        }
    };
    if status == StatusCode::CREATED {
        let _ = state.events.send(DemoEvent {
            name: "mobility.salary_change.recorded",
            data: json!({"id": record.id}),
        });
    }
    Ok((status, Json(record)))
}

async fn home_readiness(State(state): State<AppState>) -> Json<HomeReadinessResponse> {
    let gate = state.store.home_readiness.read().await.clone();
    Json(home_readiness_response(gate))
}

async fn record_home_readiness(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<(StatusCode, Json<HomeReadinessResponse>), (StatusCode, Json<ApiErrorBody>)> {
    state.requires_local_demo()?;
    let request: HomeReadinessRequest = decode_request(&body)?;
    if !request.lease_proof_reviewed || !request.human_approved {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "HOME_APPROVALS_REQUIRED",
            "Lease proof review and human approval are both required to record this gate.",
        ));
    }
    let reference = request.lease_reference.trim();
    if !reference.starts_with("synthetic:")
        || reference.len() > 128
        || reference.chars().any(char::is_control)
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_LEASE_REFERENCE",
            "Use a synthetic opaque lease reference; lease documents and real identifiers are not accepted by this local demo.",
        ));
    }
    let gate = HomeReadinessGate {
        lease_reference: reference.to_owned(),
        lease_proof_reviewed: true,
        human_approved: true,
    };
    let (stored_gate, status) = {
        let mut stored = state.store.home_readiness.write().await;
        if stored.as_ref() == Some(&gate) {
            (gate, StatusCode::OK)
        } else {
            *stored = Some(gate.clone());
            (gate, StatusCode::CREATED)
        }
    };
    let response = home_readiness_response(Some(stored_gate));
    if status == StatusCode::CREATED {
        let _ = state.events.send(DemoEvent {
            name: "home_readiness.gate.recorded",
            data: json!({"gateRecorded": true}),
        });
    }
    Ok((status, Json(response)))
}

async fn resilience(State(state): State<AppState>) -> Json<ResilienceResponse> {
    let mut reviews = state.store.resilience_reviews.read().await.clone();
    reviews.sort_by_key(|review| review.recorded_at);
    Json(ResilienceResponse {
        status: "unknown",
        rpo_minutes: None,
        rto_minutes: None,
        failover_configured: false,
        reviews,
    })
}

async fn create_resilience_review(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<(StatusCode, Json<ResilienceReviewEvidence>), (StatusCode, Json<ApiErrorBody>)> {
    state.requires_local_demo()?;
    let request: CreateResilienceReviewRequest = decode_request(&body)?;
    if !request.human_confirmed {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "HUMAN_CONFIRMATION_REQUIRED",
            "A human must confirm the tabletop review record.",
        ));
    }
    let reviewed_date = parse_iso_date(&request.reviewed_at).ok_or_else(|| {
        api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_DATE",
            "reviewedAt must be a calendar date in YYYY-MM-DD format.",
        )
    })?;
    if reviewed_date > Utc::now().date_naive() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "FUTURE_REVIEW_DATE",
            "A resilience review date cannot be in the future.",
        ));
    }
    let review = ResilienceReviewEvidence {
        id: Uuid::new_v4(),
        reviewed_at: request.reviewed_at,
        outcome: request.outcome,
        evidence_type: "tabletop_only",
        failover_executed: false,
        recorded_at: Utc::now(),
    };
    state
        .store
        .resilience_reviews
        .write()
        .await
        .push(review.clone());
    let _ = state.events.send(DemoEvent {
        name: "resilience.tabletop_review.recorded",
        data: json!({"id": review.id}),
    });
    Ok((StatusCode::CREATED, Json(review)))
}

fn home_readiness_response(gate: Option<HomeReadinessGate>) -> HomeReadinessResponse {
    HomeReadinessResponse {
        lease_reference: gate.as_ref().map(|item| item.lease_reference.clone()),
        lease_proof_reviewed: gate.as_ref().is_some_and(|item| item.lease_proof_reviewed),
        human_approved: gate.as_ref().is_some_and(|item| item.human_approved),
        utilities: HomeUtilitiesStatus {
            status: "blocked",
            provider_status: "unconfigured",
            reason: "No utility provider adapter is configured; this approval gate does not submit or activate service.",
        },
    }
}

fn parse_iso_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|date| date.format("%Y-%m-%d").to_string() == value)
}

fn decode_request<T: DeserializeOwned>(body: &[u8]) -> Result<T, (StatusCode, Json<ApiErrorBody>)> {
    serde_json::from_slice(body).map_err(|_| {
        api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST",
            "Request body must be valid JSON with the required fields and value types.",
        )
    })
}

async fn events(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.events.subscribe()).filter_map(|message| async move {
        match message {
            Ok(message) => Some(Ok(Event::default()
                .event(message.name)
                .data(message.data.to_string()))),
            Err(_) => None,
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn create_onboarding(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<OnboardingResponse>), (StatusCode, Json<ApiErrorBody>)> {
    let request: OnboardingRequest = serde_json::from_slice(&body).map_err(|_| {
        api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_REQUEST",
            "Request body must be valid JSON with the required onboarding fields.",
        )
    })?;
    validate(&request)?;

    let candidate = crate::model::CandidateSummary {
        first_name: request.first_name.trim().to_owned(),
        last_name: request.last_name.trim().to_owned(),
        email: request.email.trim().to_ascii_lowercase(),
    };
    let raw_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    if raw_key.is_some_and(|key| key.len() > 128) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency-Key must be at most 128 characters.",
        ));
    }
    let idempotency_key = idempotency_digest(raw_key.unwrap_or(&candidate.email));

    // Serialize submissions at the idempotency boundary so simultaneous retries
    // cannot create multiple pipelines for the same idempotency key.
    let mut idempotency = state.store.idempotency.write().await;
    if let Some(previous) = idempotency.get(&idempotency_key) {
        if previous.response.candidate == candidate {
            return Ok((StatusCode::OK, Json(previous.response.clone())));
        }
        return Err(api_error(
            StatusCode::CONFLICT,
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was already used for a different candidate.",
        ));
    }

    // Idempotency-Key handles retries, while the candidate email is a separate
    // unique constraint. Keep this check under the same write lock as insertion
    // so concurrent requests with different keys cannot create duplicate rows.
    let duplicate_email = state
        .store
        .pipelines
        .read()
        .await
        .values()
        .any(|pipeline| pipeline.candidate.email == candidate.email);
    if duplicate_email {
        return Err(api_error(
            StatusCode::CONFLICT,
            "EMAIL_ALREADY_ONBOARDED",
            "An onboarding pipeline already exists for this email address.",
        ));
    }

    let pipeline_id = Uuid::new_v4();
    let result = saga::run(
        &request,
        pipeline_id,
        state.allows_demo_failures(),
        &state.escalation_routing,
    );
    let response = result.response.clone();
    {
        let mut pipelines = state.store.pipelines.write().await;
        pipelines.insert(pipeline_id, result.summary.clone());
    }
    {
        let mut exceptions = state.store.exceptions.write().await;
        if let Some(exception) = result.response.exception.clone() {
            exceptions.push(exception);
        }
    }
    {
        let mut escalations = state.store.escalations.write().await;
        if let Some(escalation) = result.response.escalation.clone() {
            escalations.push(escalation);
        }
    }
    state.store.audits.write().await.extend(result.audits);
    idempotency.insert(
        idempotency_key,
        StoredSubmission {
            response: response.clone(),
        },
    );
    drop(idempotency);

    let _ = state.events.send(DemoEvent {
        name: "pipeline.updated",
        data: serde_json::to_value(result.summary)
            .unwrap_or_else(|_| json!({"error":"event serialization failed"})),
    });
    if let Some(exception) = response.exception.clone() {
        let _ = state.events.send(DemoEvent {
            name: "exception.created",
            data: serde_json::to_value(exception)
                .unwrap_or_else(|_| json!({"error":"event serialization failed"})),
        });
    }
    if let Some(escalation) = response.escalation.clone() {
        let _ = state.events.send(DemoEvent {
            name: "escalation.created",
            data: serde_json::to_value(escalation)
                .unwrap_or_else(|_| json!({"error":"event serialization failed"})),
        });
    }

    Ok((StatusCode::CREATED, Json(response)))
}

fn validate(request: &OnboardingRequest) -> Result<(), (StatusCode, Json<ApiErrorBody>)> {
    let first_name = request.first_name.trim();
    let last_name = request.last_name.trim();
    let email = request.email.trim();
    let token = request.identity_token.trim();
    if first_name.is_empty()
        || last_name.is_empty()
        || first_name.len() > 100
        || last_name.len() > 100
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_NAME",
            "First and last name are required and must be at most 100 bytes each.",
        ));
    }
    if !is_valid_email(email) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_EMAIL",
            "A valid email address is required.",
        ));
    }
    if token.is_empty() || token.len() > 512 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "INVALID_IDENTITY_TOKEN",
            "identityToken must be a non-empty opaque token no longer than 512 bytes.",
        ));
    }
    Ok(())
}

fn is_valid_email(email: &str) -> bool {
    if email.len() > 254 || !email.is_ascii() {
        return false;
    }

    let mut parts = email.split('@');
    let Some(local) = parts.next() else {
        return false;
    };
    let Some(domain) = parts.next() else {
        return false;
    };
    if parts.next().is_some()
        || local.is_empty()
        || local.len() > 64
        || local.starts_with('.')
        || local.ends_with('.')
        || local.contains("..")
        || domain.is_empty()
    {
        return false;
    }

    let local_ok = local.bytes().all(|byte| {
        byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'.' | b'!'
                    | b'#'
                    | b'$'
                    | b'%'
                    | b'&'
                    | b'\''
                    | b'*'
                    | b'+'
                    | b'-'
                    | b'/'
                    | b'='
                    | b'?'
                    | b'^'
                    | b'_'
                    | b'`'
                    | b'{'
                    | b'|'
                    | b'}'
                    | b'~'
            )
    });
    let labels: Vec<_> = domain.split('.').collect();
    let domain_ok = labels.len() >= 2
        && labels.last().is_some_and(|tld| {
            tld.len() >= 2 && tld.bytes().all(|byte| byte.is_ascii_alphabetic())
        })
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        });
    local_ok && domain_ok
}

fn idempotency_digest(key: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(key.as_bytes());
    format!("{:x}", digest.finalize())
}

fn api_error(
    status: StatusCode,
    code: &'static str,
    message: &'static str,
) -> (StatusCode, Json<ApiErrorBody>) {
    (
        status,
        Json(ApiErrorBody {
            error: ApiErrorDetail { code, message },
        }),
    )
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{header, Method, Request},
    };
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tokio::sync::broadcast;
    use tower::ServiceExt;

    use super::*;

    fn test_app(environment: &str) -> Router {
        test_app_with_routing(environment, EscalationRouting::default())
    }

    fn test_app_with_routing(environment: &str, routing: EscalationRouting) -> Router {
        let (events, _) = broadcast::channel(16);
        router(AppState::new(
            Store::default(),
            events,
            environment.to_owned(),
            routing,
        ))
    }

    fn onboarding(token: &str) -> Value {
        json!({
            "firstName": "Ada",
            "lastName": "Lovelace",
            "email": "ada@example.test",
            "identityToken": token,
        })
    }

    async fn post(app: Router, request: Value, key: Option<&str>) -> (StatusCode, Value) {
        let mut builder =
            Request::post("/api/onboarding").header(header::CONTENT_TYPE, "application/json");
        if let Some(key) = key {
            builder = builder.header("idempotency-key", key);
        }
        let response = app
            .oneshot(builder.body(Body::from(request.to_string())).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap())
    }

    async fn call_json(
        app: Router,
        method: Method,
        path: &str,
        request: Value,
    ) -> (StatusCode, Value) {
        let response = app
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(request.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap())
    }

    async fn get_json(app: Router, path: &str) -> Value {
        let response = app
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn onboarding_runs_all_mock_steps_and_is_idempotent() {
        let app = test_app("local-demo");
        let (first_status, first) = post(
            app.clone(),
            onboarding("synthetic:opaque-ref"),
            Some("client-1"),
        )
        .await;
        let (retry_status, retry) = post(
            app.clone(),
            onboarding("synthetic:opaque-ref"),
            Some("client-1"),
        )
        .await;
        assert_eq!(first_status, StatusCode::CREATED);
        assert_eq!(retry_status, StatusCode::OK);
        assert_eq!(first["pipelineId"], retry["pipelineId"]);
        assert_eq!(first["state"], "completed");
        assert_eq!(first["stage"], "complete");
        assert_eq!(first["events"].as_array().unwrap().len(), 6);

        let listed = app
            .oneshot(Request::get("/api/pipelines").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_new_idempotency_key_cannot_create_a_second_pipeline_for_same_email() {
        let app = test_app("local-demo");
        let (first_status, _) = post(
            app.clone(),
            onboarding("synthetic:first"),
            Some("first-key"),
        )
        .await;
        let (duplicate_status, duplicate) = post(
            app.clone(),
            onboarding("synthetic:second"),
            Some("second-key"),
        )
        .await;

        assert_eq!(first_status, StatusCode::CREATED);
        assert_eq!(duplicate_status, StatusCode::CONFLICT);
        assert_eq!(duplicate["error"]["code"], "EMAIL_ALREADY_ONBOARDED");

        let listed = app
            .oneshot(Request::get("/api/pipelines").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn concurrent_submissions_for_same_email_create_at_most_one_pipeline() {
        let app = test_app("local-demo");
        let mut first = onboarding("synthetic:first");
        first["email"] = json!("race@example.test");
        let mut second = onboarding("synthetic:second");
        second["email"] = json!("race@example.test");

        let (first_result, second_result) = tokio::join!(
            post(app.clone(), first, Some("race-key-1")),
            post(app.clone(), second, Some("race-key-2")),
        );
        let statuses = [first_result.0, second_result.0];
        assert_eq!(
            statuses
                .iter()
                .filter(|status| **status == StatusCode::CREATED)
                .count(),
            1
        );
        assert_eq!(
            statuses
                .iter()
                .filter(|status| **status == StatusCode::CONFLICT)
                .count(),
            1
        );

        let listed = app
            .oneshot(Request::get("/api/pipelines").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn demo_failure_creates_exception_and_does_not_expose_token() {
        let (events, _) = broadcast::channel(16);
        let state = AppState::new(
            Store::default(),
            events.clone(),
            "local-demo".to_owned(),
            EscalationRouting::default(),
        );
        let mut event_rx = events.subscribe();
        let app = router(state.clone());
        let (status, response) = post(app.clone(), onboarding("demo:fail-icp"), None).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(response["state"], "failed");
        assert_eq!(response["stage"], "icp");
        assert_eq!(response["exception"]["code"], "ICP_DEMO_REJECTION");
        assert_eq!(response["escalation"]["severity"], "high");
        assert_eq!(response["escalation"]["owningTeam"], "icp_case_management");
        assert_eq!(response["escalation"]["status"], "pending_human");
        assert!(!response["escalation"]["requiredNextAction"]
            .as_str()
            .unwrap()
            .is_empty());
        assert!(response.to_string().find("demo:fail-icp").is_none());

        let listed = app
            .clone()
            .oneshot(Request::get("/api/exceptions").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
        assert_eq!(value["items"][0]["stage"], "icp");

        let audited = app
            .clone()
            .oneshot(Request::get("/api/audit").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = audited.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        let escalation_audit = value["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["action"] == "human_escalation.created")
            .unwrap();
        assert_eq!(escalation_audit["escalation"]["status"], "pending_human");
        assert_eq!(
            escalation_audit["escalation"]["owningTeam"],
            "icp_case_management"
        );

        let pipeline_event = event_rx.recv().await.unwrap();
        let exception_event = event_rx.recv().await.unwrap();
        let escalation_event = event_rx.recv().await.unwrap();
        assert_eq!(pipeline_event.name, "pipeline.updated");
        assert_eq!(pipeline_event.data["state"], "failed");
        assert_eq!(exception_event.name, "exception.created");
        assert_eq!(escalation_event.name, "escalation.created");
        assert_eq!(escalation_event.data["status"], "pending_human");
        let pipeline_rows = state
            .store
            .pipelines
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let exception_rows = state.store.exceptions.read().await.clone();
        let escalation_rows = state.store.escalations.read().await.clone();
        let audit_rows = state.store.audits.read().await.clone();
        let idempotency_rows = state
            .store
            .idempotency
            .read()
            .await
            .values()
            .map(|value| value.response.clone())
            .collect::<Vec<_>>();
        assert!(audit_rows.iter().any(|record| {
            record.action == "human_escalation.created"
                && record.escalation.as_ref().is_some_and(|routing| {
                    routing.owning_team == crate::model::SpecialistTeam::IcpCaseManagement
                        && routing.status == crate::model::EscalationStatus::PendingHuman
                })
        }));
        let persisted = serde_json::json!({
            "pipelines": pipeline_rows,
            "exceptions": exception_rows,
            "escalations": escalation_rows,
            "audits": audit_rows,
            "idempotency": idempotency_rows,
        });
        assert!(!persisted.to_string().contains("demo:fail-icp"));
    }

    #[tokio::test]
    async fn mock_failure_uses_configured_human_escalation_route() {
        let mut routing = EscalationRouting::default();
        routing.icp.severity = crate::model::EscalationSeverity::Critical;
        routing.icp.owning_team = crate::model::SpecialistTeam::RelocationOperations;
        routing.icp.required_next_action =
            "Assign a senior case manager to review the ICP exception.".to_owned();
        let app = test_app_with_routing("local-demo", routing);
        let (status, response) = post(app.clone(), onboarding("demo:fail-icp"), None).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(response["escalation"]["severity"], "critical");
        assert_eq!(
            response["escalation"]["owningTeam"],
            "relocation_operations"
        );
        assert_eq!(
            response["escalation"]["requiredNextAction"],
            "Assign a senior case manager to review the ICP exception."
        );

        let listed = app
            .oneshot(
                Request::get("/api/escalations")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = listed.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 1);
        assert_eq!(value["items"][0]["status"], "pending_human");
        assert_eq!(value["items"][0]["owningTeam"], "relocation_operations");
    }

    #[tokio::test]
    async fn demo_failure_token_is_disabled_outside_local_demo() {
        let app = test_app("production");
        let (status, response) = post(app.clone(), onboarding("demo:fail-icp"), None).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(response["state"], "completed");

        let (write_status, write_error) = call_json(
            app,
            Method::POST,
            "/api/mobility/travel-days",
            json!({
                "date": "2020-01-01", "country": "AE", "kind": "arrival",
                "humanConfirmed": true, "consentAccepted": true
            }),
        )
        .await;
        assert_eq!(write_status, StatusCode::FORBIDDEN);
        assert_eq!(write_error["error"]["code"], "LOCAL_DEMO_ONLY");
    }

    #[tokio::test]
    async fn invalid_request_and_idempotency_conflict_have_safe_errors() {
        let app = test_app("local-demo");
        let (invalid_status, invalid) = post(app.clone(), onboarding("  "), None).await;
        assert_eq!(invalid_status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid["error"]["code"], "INVALID_IDENTITY_TOKEN");
        assert!(invalid.to_string().find("  ").is_none());

        let (first_status, _) =
            post(app.clone(), onboarding("synthetic:a"), Some("shared-key")).await;
        let mut changed = onboarding("synthetic:b");
        changed["firstName"] = json!("Different");
        let (conflict_status, conflict) = post(app, changed, Some("shared-key")).await;
        assert_eq!(first_status, StatusCode::CREATED);
        assert_eq!(conflict_status, StatusCode::CONFLICT);
        assert_eq!(conflict["error"]["code"], "IDEMPOTENCY_CONFLICT");
    }

    #[tokio::test]
    async fn email_validation_rejects_malformed_addresses() {
        let app = test_app("local-demo");
        for email in [
            "not-an-email",
            "name@",
            "@example.com",
            "a..b@example.com",
            "name@-example.com",
            "name@example..com",
            "name@example.c",
            "tést@example.com",
        ] {
            let mut request = onboarding("synthetic:opaque-ref");
            request["email"] = json!(email);
            let (status, body) = post(app.clone(), request, None).await;
            assert_eq!(status, StatusCode::BAD_REQUEST, "email: {email}");
            assert_eq!(body["error"]["code"], "INVALID_EMAIL", "email: {email}");
        }
    }

    #[tokio::test]
    async fn health_and_status_contract_is_stable() {
        let health = test_app("local-demo")
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = health.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"status":"ok"})
        );

        let status = test_app("local-demo")
            .oneshot(Request::get("/api/status").body(Body::empty()).unwrap())
            .await
            .unwrap();
        let body = status.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["environment"], "local-demo");
        assert_eq!(value["providers"], "mock");
        assert_eq!(value["pipelineCount"], 0);
        assert_eq!(value["exceptionCount"], 0);
    }

    #[tokio::test]
    async fn escalation_requires_human_acknowledgement_and_typed_resolution() {
        let app = test_app("local-demo");
        let (_, created) = post(app.clone(), onboarding("demo:fail-icp"), None).await;
        let escalation_id = created["escalation"]["id"].as_str().unwrap();
        let path = format!("/api/escalations/{escalation_id}");

        let (too_early_status, too_early) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({
                "humanConfirmed": true,
                "action": "resolve",
                "resolutionCode": "provider_recovered"
            }),
        )
        .await;
        assert_eq!(too_early_status, StatusCode::CONFLICT);
        assert_eq!(
            too_early["error"]["code"],
            "ESCALATION_ACKNOWLEDGEMENT_REQUIRED"
        );

        let (unconfirmed_status, unconfirmed) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({"humanConfirmed": false, "action": "acknowledge"}),
        )
        .await;
        assert_eq!(unconfirmed_status, StatusCode::BAD_REQUEST);
        assert_eq!(unconfirmed["error"]["code"], "HUMAN_CONFIRMATION_REQUIRED");

        let (ack_status, ack) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({"humanConfirmed": true, "action": "acknowledge"}),
        )
        .await;
        assert_eq!(ack_status, StatusCode::OK);
        assert_eq!(ack["status"], "acknowledged");
        assert!(ack["acknowledgedAt"].as_str().is_some());

        let (ack_retry_status, ack_retry) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({"humanConfirmed": true, "action": "acknowledge"}),
        )
        .await;
        assert_eq!(ack_retry_status, StatusCode::OK);
        assert_eq!(ack_retry["acknowledgedAt"], ack["acknowledgedAt"]);

        let (missing_code_status, missing_code) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({"humanConfirmed": true, "action": "resolve"}),
        )
        .await;
        assert_eq!(missing_code_status, StatusCode::BAD_REQUEST);
        assert_eq!(missing_code["error"]["code"], "RESOLUTION_CODE_REQUIRED");

        let (resolved_status, resolved) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({
                "humanConfirmed": true,
                "action": "resolve",
                "resolutionCode": "evidence_corrected"
            }),
        )
        .await;
        assert_eq!(resolved_status, StatusCode::OK);
        assert_eq!(resolved["status"], "resolved");
        assert_eq!(resolved["resolutionCode"], "evidence_corrected");
        assert!(resolved["resolvedAt"].as_str().is_some());

        let (resolve_retry_status, resolve_retry) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({
                "humanConfirmed": true,
                "action": "resolve",
                "resolutionCode": "evidence_corrected"
            }),
        )
        .await;
        assert_eq!(resolve_retry_status, StatusCode::OK);
        assert_eq!(resolve_retry["resolvedAt"], resolved["resolvedAt"]);

        let (invalid_code_status, invalid_code) = call_json(
            app.clone(),
            Method::PATCH,
            &path,
            json!({
                "humanConfirmed": true,
                "action": "resolve",
                "resolutionCode": "send_to_government"
            }),
        )
        .await;
        assert_eq!(invalid_code_status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_code["error"]["code"], "INVALID_REQUEST");

        let audits = get_json(app, "/api/audit").await;
        let lifecycle_actions = audits["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|item| {
                item["action"]
                    .as_str()
                    .unwrap_or("")
                    .starts_with("human_escalation.")
            })
            .map(|item| item["action"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            lifecycle_actions,
            vec![
                "human_escalation.created",
                "human_escalation.acknowledged",
                "human_escalation.resolved"
            ]
        );
        let resolved_audit = audits["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["action"] == "human_escalation.resolved")
            .unwrap();
        assert_eq!(
            resolved_audit["escalation"]["resolutionCode"],
            "evidence_corrected"
        );
    }

    #[tokio::test]
    async fn mobility_records_are_consented_idempotent_and_never_make_legal_calculations() {
        let app = test_app("local-demo");
        let initial = get_json(app.clone(), "/api/mobility").await;
        assert_eq!(initial["ruleset"]["configured"], false);
        assert_eq!(initial["ruleset"]["approved"], false);
        assert!(initial["ruleset"]["version"].is_null());
        assert_eq!(initial["travelDays"].as_array().unwrap().len(), 0);
        assert_eq!(initial["salaryChanges"].as_array().unwrap().len(), 0);

        let travel_request = json!({
            "date": "2020-01-02",
            "country": "AE",
            "kind": "arrival",
            "humanConfirmed": true,
            "consentAccepted": true
        });
        let (travel_status, travel) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            travel_request.clone(),
        )
        .await;
        assert_eq!(travel_status, StatusCode::CREATED);
        assert_eq!(travel["humanConfirmed"], true);
        assert_eq!(travel["consentAccepted"], true);
        let (travel_retry_status, travel_retry) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            travel_request,
        )
        .await;
        assert_eq!(travel_retry_status, StatusCode::OK);
        assert_eq!(travel_retry["id"], travel["id"]);

        let (no_consent_status, no_consent) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            json!({
                "date": "2020-01-03", "country": "AE", "kind": "in_country_day",
                "humanConfirmed": true, "consentAccepted": false
            }),
        )
        .await;
        assert_eq!(no_consent_status, StatusCode::BAD_REQUEST);
        assert_eq!(no_consent["error"]["code"], "CONSENT_REQUIRED");

        let (other_country_status, other_country) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            json!({
                "date": "2020-01-04", "country": "US", "kind": "departure",
                "humanConfirmed": true, "consentAccepted": true
            }),
        )
        .await;
        assert_eq!(other_country_status, StatusCode::BAD_REQUEST);
        assert_eq!(other_country["error"]["code"], "UNSUPPORTED_COUNTRY");
        assert!(!other_country.to_string().contains("US"));

        let (bad_date_status, bad_date) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            json!({
                "date": "2020-02-30", "country": "AE", "kind": "departure",
                "humanConfirmed": true, "consentAccepted": true
            }),
        )
        .await;
        assert_eq!(bad_date_status, StatusCode::BAD_REQUEST);
        assert_eq!(bad_date["error"]["code"], "INVALID_DATE");

        let salary_request = json!({
            "effectiveDate": "2020-01-01",
            "basicSalary": 17500.0,
            "currency": "AED",
            "humanConfirmed": true
        });
        let (salary_status, salary) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/salary-changes",
            salary_request.clone(),
        )
        .await;
        assert_eq!(salary_status, StatusCode::CREATED);
        assert_eq!(salary["basicSalary"], 17500.0);
        let (salary_retry_status, salary_retry) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/salary-changes",
            salary_request,
        )
        .await;
        assert_eq!(salary_retry_status, StatusCode::OK);
        assert_eq!(salary_retry["id"], salary["id"]);

        let (salary_conflict_status, salary_conflict) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/salary-changes",
            json!({
                "effectiveDate": "2020-01-01", "basicSalary": 19000.0,
                "currency": "AED", "humanConfirmed": true
            }),
        )
        .await;
        assert_eq!(salary_conflict_status, StatusCode::CONFLICT);
        assert_eq!(
            salary_conflict["error"]["code"],
            "SALARY_CHANGE_DATE_CONFLICT"
        );

        let (invalid_salary_status, invalid_salary) = call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/salary-changes",
            json!({
                "effectiveDate": "2021-01-01", "basicSalary": -987654.0,
                "currency": "AED", "humanConfirmed": true
            }),
        )
        .await;
        assert_eq!(invalid_salary_status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_salary["error"]["code"], "INVALID_BASIC_SALARY");
        assert!(!invalid_salary.to_string().contains("987654"));

        let final_state = get_json(app, "/api/mobility").await;
        assert_eq!(final_state["travelDays"].as_array().unwrap().len(), 1);
        assert_eq!(final_state["salaryChanges"].as_array().unwrap().len(), 1);
        assert_eq!(final_state["ruleset"]["configured"], false);
        assert_eq!(final_state["ruleset"]["approved"], false);
        assert!(final_state.get("residencyConclusion").is_none());
        assert!(final_state.get("gratuityAmount").is_none());
        assert!(final_state.get("gratuityEstimate").is_none());
    }

    #[tokio::test]
    async fn home_readiness_only_records_reviewed_approval_and_stays_provider_blocked() {
        let app = test_app("local-demo");
        let initial = get_json(app.clone(), "/api/home-readiness").await;
        assert!(initial["leaseReference"].is_null());
        assert_eq!(initial["leaseProofReviewed"], false);
        assert_eq!(initial["humanApproved"], false);
        assert_eq!(initial["utilities"]["status"], "blocked");
        assert_eq!(initial["utilities"]["providerStatus"], "unconfigured");

        let (unapproved_status, unapproved) = call_json(
            app.clone(),
            Method::POST,
            "/api/home-readiness",
            json!({
                "leaseReference": "synthetic:lease-01",
                "leaseProofReviewed": true,
                "humanApproved": false
            }),
        )
        .await;
        assert_eq!(unapproved_status, StatusCode::BAD_REQUEST);
        assert_eq!(unapproved["error"]["code"], "HOME_APPROVALS_REQUIRED");

        let (real_reference_status, real_reference) = call_json(
            app.clone(),
            Method::POST,
            "/api/home-readiness",
            json!({
                "leaseReference": "real-contract-number",
                "leaseProofReviewed": true,
                "humanApproved": true
            }),
        )
        .await;
        assert_eq!(real_reference_status, StatusCode::BAD_REQUEST);
        assert_eq!(real_reference["error"]["code"], "INVALID_LEASE_REFERENCE");

        let gate_request = json!({
            "leaseReference": "synthetic:lease-01",
            "leaseProofReviewed": true,
            "humanApproved": true
        });
        let (created_status, created) = call_json(
            app.clone(),
            Method::POST,
            "/api/home-readiness",
            gate_request.clone(),
        )
        .await;
        assert_eq!(created_status, StatusCode::CREATED);
        assert_eq!(created["leaseReference"], "synthetic:lease-01");
        assert_eq!(created["utilities"]["status"], "blocked");
        assert_eq!(created["utilities"]["providerStatus"], "unconfigured");
        assert!(created.get("serviceOrderCreated").is_none());
        assert!(created["utilities"]["reason"]
            .as_str()
            .unwrap()
            .contains("does not submit"));

        let (retry_status, retry) = call_json(
            app.clone(),
            Method::POST,
            "/api/home-readiness",
            gate_request,
        )
        .await;
        assert_eq!(retry_status, StatusCode::OK);
        assert_eq!(retry, created);
        assert_eq!(get_json(app, "/api/home-readiness").await, created);
    }

    #[tokio::test]
    async fn resilience_reviews_are_tabletop_evidence_only_and_failover_remains_unknown() {
        let app = test_app("local-demo");
        let initial = get_json(app.clone(), "/api/resilience").await;
        assert_eq!(initial["status"], "unknown");
        assert!(initial["rpoMinutes"].is_null());
        assert!(initial["rtoMinutes"].is_null());
        assert_eq!(initial["failoverConfigured"], false);
        assert_eq!(initial["reviews"].as_array().unwrap().len(), 0);

        let (unconfirmed_status, unconfirmed) = call_json(
            app.clone(),
            Method::POST,
            "/api/resilience/reviews",
            json!({"humanConfirmed": false, "reviewedAt": "2020-01-01", "outcome": "gaps_identified"}),
        )
        .await;
        assert_eq!(unconfirmed_status, StatusCode::BAD_REQUEST);
        assert_eq!(unconfirmed["error"]["code"], "HUMAN_CONFIRMATION_REQUIRED");

        let (invalid_outcome_status, invalid_outcome) = call_json(
            app.clone(),
            Method::POST,
            "/api/resilience/reviews",
            json!({"humanConfirmed": true, "reviewedAt": "2020-01-01", "outcome": "failover_passed"}),
        )
        .await;
        assert_eq!(invalid_outcome_status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_outcome["error"]["code"], "INVALID_REQUEST");

        let (bad_date_status, bad_date) = call_json(
            app.clone(),
            Method::POST,
            "/api/resilience/reviews",
            json!({"humanConfirmed": true, "reviewedAt": "not-a-date", "outcome": "no_known_gaps"}),
        )
        .await;
        assert_eq!(bad_date_status, StatusCode::BAD_REQUEST);
        assert_eq!(bad_date["error"]["code"], "INVALID_DATE");

        let (review_status, review) = call_json(
            app.clone(),
            Method::POST,
            "/api/resilience/reviews",
            json!({"humanConfirmed": true, "reviewedAt": "2020-01-01", "outcome": "gaps_identified"}),
        )
        .await;
        assert_eq!(review_status, StatusCode::CREATED);
        assert_eq!(review["evidenceType"], "tabletop_only");
        assert_eq!(review["failoverExecuted"], false);

        let final_state = get_json(app, "/api/resilience").await;
        assert_eq!(final_state["status"], "unknown");
        assert!(final_state["rpoMinutes"].is_null());
        assert!(final_state["rtoMinutes"].is_null());
        assert_eq!(final_state["failoverConfigured"], false);
        assert_eq!(final_state["reviews"].as_array().unwrap().len(), 1);
        assert_eq!(final_state["reviews"][0]["evidenceType"], "tabletop_only");
        assert_eq!(final_state["reviews"][0]["failoverExecuted"], false);
    }

    #[tokio::test]
    async fn new_workflow_sse_events_do_not_broadcast_sensitive_record_values() {
        let (events, _) = broadcast::channel(16);
        let mut event_rx = events.subscribe();
        let app = router(AppState::new(
            Store::default(),
            events,
            "local-demo".to_owned(),
            EscalationRouting::default(),
        ));

        call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/travel-days",
            json!({
                "date": "2020-01-02", "country": "AE", "kind": "arrival",
                "humanConfirmed": true, "consentAccepted": true
            }),
        )
        .await;
        call_json(
            app.clone(),
            Method::POST,
            "/api/mobility/salary-changes",
            json!({
                "effectiveDate": "2020-01-01", "basicSalary": 123456.78,
                "currency": "AED", "humanConfirmed": true
            }),
        )
        .await;
        call_json(
            app.clone(),
            Method::POST,
            "/api/home-readiness",
            json!({
                "leaseReference": "synthetic:lease-private-reference",
                "leaseProofReviewed": true, "humanApproved": true
            }),
        )
        .await;
        call_json(
            app,
            Method::POST,
            "/api/resilience/reviews",
            json!({"humanConfirmed": true, "reviewedAt": "2020-01-03", "outcome": "gaps_identified"}),
        )
        .await;

        let travel_event = event_rx.recv().await.unwrap();
        assert_eq!(travel_event.name, "mobility.travel_day.recorded");
        assert_eq!(travel_event.data.as_object().unwrap().len(), 1);
        assert!(travel_event.data["id"].as_str().is_some());
        assert!(travel_event.data.get("date").is_none());
        assert!(travel_event.data.get("country").is_none());

        let salary_event = event_rx.recv().await.unwrap();
        assert_eq!(salary_event.name, "mobility.salary_change.recorded");
        assert_eq!(salary_event.data.as_object().unwrap().len(), 1);
        assert!(salary_event.data.get("basicSalary").is_none());
        assert!(salary_event.data.get("currency").is_none());

        let home_event = event_rx.recv().await.unwrap();
        assert_eq!(home_event.name, "home_readiness.gate.recorded");
        assert_eq!(home_event.data, json!({"gateRecorded": true}));
        assert!(home_event.data.get("leaseReference").is_none());

        let resilience_event = event_rx.recv().await.unwrap();
        assert_eq!(resilience_event.name, "resilience.tabletop_review.recorded");
        assert_eq!(resilience_event.data.as_object().unwrap().len(), 1);
        assert!(resilience_event.data.get("outcome").is_none());
    }

    #[tokio::test]
    async fn cors_allows_only_the_local_dashboard_origins() {
        let allowed = test_app("local-demo")
            .oneshot(
                Request::get("/api/status")
                    .header(header::ORIGIN, "http://127.0.0.1:5173")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            allowed
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "http://127.0.0.1:5173"
        );

        let denied = test_app("local-demo")
            .oneshot(
                Request::get("/api/status")
                    .header(header::ORIGIN, "https://untrusted.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(denied
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none());
    }
}
