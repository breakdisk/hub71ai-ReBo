use std::collections::HashMap;

use tokio::sync::RwLock;
use uuid::Uuid;

use crate::model::{
    AuditRecord, CaseManagerEscalation, ExceptionRecord, OnboardingResponse, PipelineSummary,
};

#[derive(Default)]
pub struct Store {
    pub pipelines: RwLock<HashMap<Uuid, PipelineSummary>>,
    pub exceptions: RwLock<Vec<ExceptionRecord>>,
    pub escalations: RwLock<Vec<CaseManagerEscalation>>,
    pub audits: RwLock<Vec<AuditRecord>>,
    pub idempotency: RwLock<HashMap<String, StoredSubmission>>,
}

#[derive(Debug, Clone)]
pub struct StoredSubmission {
    pub response: OnboardingResponse,
}

\n