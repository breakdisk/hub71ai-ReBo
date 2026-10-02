use std::{convert::Infallible, sync::Arc};

use axum::{
    body::Bytes,
    extract::State,
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer};
use uuid::Uuid;

use crate::{
    escalation::EscalationRouting,
    model::{
        ApiErrorBody, ApiErrorDetail, AuditRecord, CaseManagerEscalation, ExceptionRecord,
        ListResponse, OnboardingRequest, OnboardingResponse, PipelineSummary, StatusResponse,
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
}

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/status", get(status))
        .route("/api/pipelines", get(pipelines))
        .route("/api/exceptions", get(exceptions))
        .route("/api/escalations", get(escalations))
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
                .allow_methods([Method::GET, Method::POST])
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
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Json(ListResponse { items })
}

async fn exceptions(State(state): State<AppState>) -> Json<ListResponse<ExceptionRecord>> {
    let mut items = state.store.exceptions.read().await.clone();
    items.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    Json(ListResponse { items })
}

async fn audit_records(State(state): State<AppState>) -> Json<ListResponse<AuditRecord>> {
    let items = state.store.audits.read().await.clone();
    Json(ListResponse { items })
}

async fn escalations(
    State(state): State<AppState>,
) -> Json<ListResponse<CaseManagerEscalation>> {
    let mut items = state.store.escalations.read().await.clone();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Json(ListResponse { items })
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
            || matches!(byte, b'.' | b'!' | b'#' | b'$' | b'%' | b'&' | b'\'' | b'*' | b'+' | b'-' | b'/' | b'=' | b'?' | b'^' | b'_' | b'`' | b'{' | b'|' | b'}' | b'~')
    });
    let labels: Vec<_> = domain.split('.').collect();
    let domain_ok = labels.len() >= 2
        && labels
            .last()
            .is_some_and(|tld| tld.len() >= 2 && tld.bytes().all(|byte| byte.is_ascii_alphabetic()))
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
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
    use axum::{body::Body, http::{header, Request}};
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
        let mut builder = Request::post("/api/onboarding")
            .header(header::CONTENT_TYPE, "application/json");
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
        let (first_status, _) = post(app.clone(), onboarding("synthetic:first"), Some("first-key")).await;
        let (duplicate_status, duplicate) =
            post(app.clone(), onboarding("synthetic:second"), Some("second-key")).await;

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
        assert!(response["escalation"]["requiredNextAction"]
            .as_str()
            .unwrap()
            .len()
            > 0);
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
        assert_eq!(escalation_audit["escalation"]["owningTeam"], "icp_case_management");

        let pipeline_event = event_rx.recv().await.unwrap();
        let exception_event = event_rx.recv().await.unwrap();
        let escalation_event = event_rx.recv().await.unwrap();
        assert_eq!(pipeline_event.name, "pipeline.updated");
        assert_eq!(pipeline_event.data["state"], "failed");
        assert_eq!(exception_event.name, "exception.created");
        assert_eq!(escalation_event.name, "escalation.created");
        assert_eq!(escalation_event.data["status"], "pending_human");
        let pipeline_rows = state.store.pipelines.read().await.values().cloned().collect::<Vec<_>>();
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
        routing.icp.required_next_action = "Assign a senior case manager to review the ICP exception.".to_owned();
        let app = test_app_with_routing("local-demo", routing);
        let (status, response) = post(app.clone(), onboarding("demo:fail-icp"), None).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(response["escalation"]["severity"], "critical");
        assert_eq!(response["escalation"]["owningTeam"], "relocation_operations");
        assert_eq!(
            response["escalation"]["requiredNextAction"],
            "Assign a senior case manager to review the ICP exception."
        );

        let listed = app
            .oneshot(Request::get("/api/escalations").body(Body::empty()).unwrap())
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
        let (status, response) = post(test_app("production"), onboarding("demo:fail-icp"), None).await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(response["state"], "completed");
    }

    #[tokio::test]
    async fn invalid_request_and_idempotency_conflict_have_safe_errors() {
        let app = test_app("local-demo");
        let (invalid_status, invalid) = post(app.clone(), onboarding("  "), None).await;
        assert_eq!(invalid_status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid["error"]["code"], "INVALID_IDENTITY_TOKEN");
        assert!(invalid.to_string().find("  ").is_none());

        let (first_status, _) = post(app.clone(), onboarding("synthetic:a"), Some("shared-key")).await;
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
        assert_eq!(serde_json::from_slice::<Value>(&body).unwrap(), json!({"status":"ok"}));

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

\n