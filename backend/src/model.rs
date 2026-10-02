use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Identity,
    Icp,
    Banking,
    Travel,
    Logistics,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PipelineState {
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CandidateSummary {
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineSummary {
    #[serde(rename = "pipelineId")]
    pub pipeline_id: Uuid,
    pub candidate: CandidateSummary,
    pub stage: Stage,
    pub state: PipelineState,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageEvent {
    pub stage: Stage,
    pub state: PipelineState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExceptionRecord {
    pub id: Uuid,
    #[serde(rename = "pipelineId")]
    pub pipeline_id: Uuid,
    pub stage: Stage,
    pub code: String,
    pub message: String,
    #[serde(rename = "occurredAt")]
    pub occurred_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscalationSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SpecialistTeam {
    IcpCaseManagement,
    BankingOperations,
    TravelDesk,
    LogisticsCoordination,
    RelocationOperations,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscalationStatus {
    PendingHuman,
    Acknowledged,
    Resolved,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscalationResolutionCode {
    EvidenceCorrected,
    ProviderRecovered,
    ApprovedManualResolution,
    FalsePositive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EscalationAction {
    Acknowledge,
    Resolve,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EscalationRoute {
    pub severity: EscalationSeverity,
    pub owning_team: SpecialistTeam,
    pub required_next_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaseManagerEscalation {
    pub id: Uuid,
    pub pipeline_id: Uuid,
    pub stage: Stage,
    pub severity: EscalationSeverity,
    pub owning_team: SpecialistTeam,
    pub status: EscalationStatus,
    pub required_next_action: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acknowledged_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution_code: Option<EscalationResolutionCode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EscalationAuditDetails {
    pub escalation_id: Uuid,
    pub severity: EscalationSeverity,
    pub owning_team: SpecialistTeam,
    pub status: EscalationStatus,
    pub required_next_action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution_code: Option<EscalationResolutionCode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EscalationActionRequest {
    pub human_confirmed: bool,
    pub action: EscalationAction,
    pub resolution_code: Option<EscalationResolutionCode>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TravelDayKind {
    Arrival,
    Departure,
    InCountryDay,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MobilityRulesetStatus {
    pub configured: bool,
    pub approved: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TravelDayEvidence {
    pub id: Uuid,
    pub date: String,
    pub country: String,
    pub kind: TravelDayKind,
    pub human_confirmed: bool,
    pub consent_accepted: bool,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTravelDayRequest {
    pub date: String,
    pub country: String,
    pub kind: TravelDayKind,
    pub human_confirmed: bool,
    pub consent_accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SalaryChangeEvidence {
    pub id: Uuid,
    pub effective_date: String,
    pub basic_salary: f64,
    pub currency: String,
    pub human_confirmed: bool,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSalaryChangeRequest {
    pub effective_date: String,
    pub basic_salary: f64,
    pub currency: String,
    pub human_confirmed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobilityResponse {
    pub ruleset: MobilityRulesetStatus,
    pub travel_days: Vec<TravelDayEvidence>,
    pub salary_changes: Vec<SalaryChangeEvidence>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HomeReadinessRequest {
    pub lease_reference: String,
    pub lease_proof_reviewed: bool,
    pub human_approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HomeReadinessGate {
    pub lease_reference: String,
    pub lease_proof_reviewed: bool,
    pub human_approved: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeUtilitiesStatus {
    pub status: &'static str,
    pub provider_status: &'static str,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeReadinessResponse {
    pub lease_reference: Option<String>,
    pub lease_proof_reviewed: bool,
    pub human_approved: bool,
    pub utilities: HomeUtilitiesStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResilienceReviewOutcome {
    GapsIdentified,
    NoKnownGaps,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateResilienceReviewRequest {
    pub human_confirmed: bool,
    pub reviewed_at: String,
    pub outcome: ResilienceReviewOutcome,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResilienceReviewEvidence {
    pub id: Uuid,
    pub reviewed_at: String,
    pub outcome: ResilienceReviewOutcome,
    pub evidence_type: &'static str,
    pub failover_executed: bool,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResilienceResponse {
    pub status: &'static str,
    pub rpo_minutes: Option<u64>,
    pub rto_minutes: Option<u64>,
    pub failover_configured: bool,
    pub reviews: Vec<ResilienceReviewEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRecord {
    pub id: Uuid,
    #[serde(rename = "pipelineId")]
    pub pipeline_id: Uuid,
    pub actor: String,
    pub action: String,
    pub stage: Stage,
    pub state: PipelineState,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escalation: Option<EscalationAuditDetails>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OnboardingRequest {
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
    pub email: String,
    #[serde(rename = "identityToken")]
    pub identity_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingResponse {
    #[serde(rename = "pipelineId")]
    pub pipeline_id: Uuid,
    pub state: PipelineState,
    pub stage: Stage,
    pub candidate: CandidateSummary,
    pub events: Vec<StageEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exception: Option<ExceptionRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escalation: Option<CaseManagerEscalation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub status: &'static str,
    pub environment: String,
    pub pipeline_count: usize,
    pub exception_count: usize,
    pub providers: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorDetail {
    pub code: &'static str,
    pub message: &'static str,
}
