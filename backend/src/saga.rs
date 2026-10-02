use chrono::Utc;
use uuid::Uuid;

use crate::{
    model::{
        AuditRecord, CandidateSummary, CaseManagerEscalation, EscalationAuditDetails,
        EscalationStatus, ExceptionRecord, OnboardingRequest, OnboardingResponse, PipelineState,
        PipelineSummary, Stage, StageEvent,
    },
    providers::{
        BankingProvider, IcpProvider, LogisticsProvider, MockProviders, ProviderError,
        ProviderStage, TravelProvider,
    },
    escalation::EscalationRouting,
};

#[derive(Debug)]
pub struct SagaResult {
    pub response: OnboardingResponse,
    pub summary: PipelineSummary,
    pub audits: Vec<AuditRecord>,
}

/// Runs a sequential saga against provider ports. For this local prototype the
/// only adapter is deterministic and mocked; opaque token data is never copied
/// into the saga output, audit records, or status events.
pub fn run(
    request: &OnboardingRequest,
    pipeline_id: Uuid,
    failure_tokens_enabled: bool,
    routing: &EscalationRouting,
) -> SagaResult {
    let candidate = CandidateSummary {
        first_name: request.first_name.trim().to_owned(),
        last_name: request.last_name.trim().to_owned(),
        email: request.email.trim().to_ascii_lowercase(),
    };
    let now = Utc::now();
    let mut events = vec![StageEvent {
        stage: Stage::Identity,
        state: PipelineState::Completed,
    }];
    let mut audits = vec![audit(
        pipeline_id,
        "identity.validated",
        Stage::Identity,
        PipelineState::Completed,
    )];

    let providers = MockProviders { failure_tokens_enabled };
    let steps: [(Stage, &str, fn(&MockProviders, &str) -> Result<(), ProviderError>); 4] = [
        (Stage::Icp, "icp.submitted", |p, t| p.submit(t)),
        (Stage::Banking, "banking.provisioned", |p, t| p.provision(t)),
        (Stage::Travel, "travel.booked", |p, t| p.book(t)),
        (Stage::Logistics, "logistics.arranged", |p, t| p.arrange(t)),
    ];

    let mut final_stage = Stage::Complete;
    let mut final_state = PipelineState::Completed;
    let mut exception = None;
    let mut escalation = None;
    for (stage, action, invoke) in steps {
        match invoke(&providers, &request.identity_token) {
            Ok(()) => {
                events.push(StageEvent {
                    stage: stage.clone(),
                    state: PipelineState::Completed,
                });
                audits.push(audit(pipeline_id, action, stage, PipelineState::Completed));
            }
            Err(error) => {
                final_stage = stage.clone();
                final_state = PipelineState::Failed;
                let record = ExceptionRecord {
                    id: Uuid::new_v4(),
                    pipeline_id,
                    stage: stage.clone(),
                    code: error.code.to_owned(),
                    message: failure_message(error.stage),
                    occurred_at: Utc::now(),
                };
                events.push(StageEvent {
                    stage: stage.clone(),
                    state: PipelineState::Failed,
                });
                audits.push(audit(
                    pipeline_id,
                    &format!("{}.failed", stage_name(&stage)),
                    stage,
                    PipelineState::Failed,
                ));
                let route = routing
                    .for_stage(&stage)
                    .expect("every failing provider stage must have escalation routing");
                let escalation_record = CaseManagerEscalation {
                    id: Uuid::new_v4(),
                    pipeline_id,
                    stage: stage.clone(),
                    severity: route.severity,
                    owning_team: route.owning_team,
                    status: EscalationStatus::PendingHuman,
                    required_next_action: route.required_next_action.clone(),
                    created_at: Utc::now(),
                };
                audits.push(escalation_audit(pipeline_id, &escalation_record));
                escalation = Some(escalation_record);
                exception = Some(record);
                break;
            }
        }
    }

    if final_state == PipelineState::Completed {
        events.push(StageEvent {
            stage: Stage::Complete,
            state: PipelineState::Completed,
        });
        audits.push(audit(
            pipeline_id,
            "pipeline.completed",
            Stage::Complete,
            PipelineState::Completed,
        ));
    }
    let summary = PipelineSummary {
        pipeline_id,
        candidate: candidate.clone(),
        stage: final_stage.clone(),
        state: final_state.clone(),
        created_at: now,
        updated_at: Utc::now(),
    };
    let response = OnboardingResponse {
        pipeline_id,
        state: final_state,
        stage: final_stage,
        candidate,
        events,
        exception,
        escalation,
    };
    SagaResult {
        response,
        summary,
        audits,
    }
}

fn escalation_audit(pipeline_id: Uuid, escalation: &CaseManagerEscalation) -> AuditRecord {
    AuditRecord {
        id: Uuid::new_v4(),
        pipeline_id,
        actor: "saga-orchestrator".to_owned(),
        action: "human_escalation.created".to_owned(),
        stage: escalation.stage.clone(),
        state: PipelineState::Failed,
        timestamp: Utc::now(),
        escalation: Some(EscalationAuditDetails {
            escalation_id: escalation.id,
            severity: escalation.severity,
            owning_team: escalation.owning_team,
            status: escalation.status,
            required_next_action: escalation.required_next_action.clone(),
        }),
    }
}

fn audit(pipeline_id: Uuid, action: &str, stage: Stage, state: PipelineState) -> AuditRecord {
    AuditRecord {
        id: Uuid::new_v4(),
        pipeline_id,
        actor: "saga-orchestrator".to_owned(),
        action: action.to_owned(),
        stage,
        state,
        timestamp: Utc::now(),
        escalation: None,
    }
}

fn stage_name(stage: &Stage) -> &'static str {
    match stage {
        Stage::Identity => "identity",
        Stage::Icp => "icp",
        Stage::Banking => "banking",
        Stage::Travel => "travel",
        Stage::Logistics => "logistics",
        Stage::Complete => "complete",
    }
}

fn failure_message(stage: ProviderStage) -> String {
    match stage {
        ProviderStage::Icp => {
            "Mock ICP provider rejected the synthetic identity token.".to_owned()
        }
        ProviderStage::Banking => {
            "Mock banking provider rejected the synthetic identity token.".to_owned()
        }
        ProviderStage::Travel => {
            "Mock travel provider rejected the synthetic identity token.".to_owned()
        }
        ProviderStage::Logistics => {
            "Mock logistics provider rejected the synthetic identity token.".to_owned()
        }
    }
}

\n