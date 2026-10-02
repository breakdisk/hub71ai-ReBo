use std::collections::HashMap;

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::model::{
    AuditRecord, CaseManagerEscalation, ExceptionRecord, HomeReadinessGate, OnboardingResponse,
    PipelineSummary, ResilienceReviewEvidence, SalaryChangeEvidence, TravelDayEvidence,
};

#[derive(Default)]
pub struct Store {
    pub pipelines: RwLock<HashMap<Uuid, PipelineSummary>>,
    pub exceptions: RwLock<Vec<ExceptionRecord>>,
    pub escalations: RwLock<Vec<CaseManagerEscalation>>,
    pub audits: RwLock<Vec<AuditRecord>>,
    pub idempotency: RwLock<HashMap<String, StoredSubmission>>,
    pub travel_days: RwLock<Vec<TravelDayEvidence>>,
    pub salary_changes: RwLock<Vec<SalaryChangeEvidence>>,
    pub home_readiness: RwLock<Option<HomeReadinessGate>>,
    pub resilience_reviews: RwLock<Vec<ResilienceReviewEvidence>>,
}

#[derive(Debug, Clone)]
pub struct StoredSubmission {
    pub response: OnboardingResponse,
}
