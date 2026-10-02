use thiserror::Error;

use crate::model::{EscalationRoute, EscalationSeverity, SpecialistTeam, Stage};

/// Stage-specific, local routing policy for failed mock saga steps.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EscalationRouting {
    pub icp: EscalationRoute,
    pub banking: EscalationRoute,
    pub travel: EscalationRoute,
    pub logistics: EscalationRoute,
}

impl Default for EscalationRouting {
    fn default() -> Self {
        Self {
            icp: EscalationRoute {
                severity: EscalationSeverity::High,
                owning_team: SpecialistTeam::IcpCaseManagement,
                required_next_action: "Review the mock ICP rejection and determine the next compliant case step.".to_owned(),
            },
            banking: EscalationRoute {
                severity: EscalationSeverity::High,
                owning_team: SpecialistTeam::BankingOperations,
                required_next_action: "Review the mock bank response and confirm the candidate's next eKYC step.".to_owned(),
            },
            travel: EscalationRoute {
                severity: EscalationSeverity::Medium,
                owning_team: SpecialistTeam::TravelDesk,
                required_next_action: "Review the mock booking failure and contact the candidate with a revised itinerary.".to_owned(),
            },
            logistics: EscalationRoute {
                severity: EscalationSeverity::Medium,
                owning_team: SpecialistTeam::LogisticsCoordination,
                required_next_action: "Review the mock mover failure and agree a revised shipment plan with the candidate.".to_owned(),
            },
        }
    }
}

impl EscalationRouting {
    /// Parse and validate a complete JSON routing table from local configuration.
    pub fn from_json(raw: &str) -> Result<Self, EscalationRoutingError> {
        let routing: Self = serde_json::from_str(raw)?;
        for (stage, route) in [
            ("icp", &routing.icp),
            ("banking", &routing.banking),
            ("travel", &routing.travel),
            ("logistics", &routing.logistics),
        ] {
            let action = route.required_next_action.trim();
            if action.is_empty() || action.len() > 240 || action.chars().any(char::is_control) {
                return Err(EscalationRoutingError::InvalidNextAction { stage });
            }
        }
        Ok(routing)
    }

    pub fn for_stage(&self, stage: &Stage) -> Option<&EscalationRoute> {
        match stage {
            Stage::Icp => Some(&self.icp),
            Stage::Banking => Some(&self.banking),
            Stage::Travel => Some(&self.travel),
            Stage::Logistics => Some(&self.logistics),
            Stage::Identity | Stage::Complete => None,
        }
    }
}

#[derive(Debug, Error)]
pub enum EscalationRoutingError {
    #[error("invalid escalation routing JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("invalid requiredNextAction for {stage}; it must be 1-240 printable bytes")]
    InvalidNextAction { stage: &'static str },
}

#[cfg(test)]
mod tests {
    use crate::model::{EscalationSeverity, SpecialistTeam, Stage};

    use super::{EscalationRouting, EscalationRoutingError};

    #[test]
    fn routing_is_stage_specific_and_configurable() {
        let configured = serde_json::json!({
            "icp": {
                "severity": "critical",
                "owningTeam": "relocation_operations",
                "requiredNextAction": "Assign a senior case manager to review this exception."
            },
            "banking": {
                "severity": "high",
                "owningTeam": "banking_operations",
                "requiredNextAction": "Review the eKYC exception."
            },
            "travel": {
                "severity": "medium",
                "owningTeam": "travel_desk",
                "requiredNextAction": "Review the travel exception."
            },
            "logistics": {
                "severity": "low",
                "owningTeam": "logistics_coordination",
                "requiredNextAction": "Review the logistics exception."
            }
        });
        let routing = EscalationRouting::from_json(&configured.to_string()).unwrap();
        let icp = routing.for_stage(&Stage::Icp).unwrap();
        assert_eq!(icp.severity, EscalationSeverity::Critical);
        assert_eq!(icp.owning_team, SpecialistTeam::RelocationOperations);
        assert_eq!(
            icp.required_next_action,
            "Assign a senior case manager to review this exception."
        );
        assert!(routing.for_stage(&Stage::Complete).is_none());
    }

    #[test]
    fn routing_rejects_empty_or_multiline_next_actions() {
        let mut configured = serde_json::to_value(EscalationRouting::default()).unwrap();
        configured["icp"]["requiredNextAction"] = serde_json::json!(" \n ");
        assert!(matches!(
            EscalationRouting::from_json(&configured.to_string()),
            Err(EscalationRoutingError::InvalidNextAction { stage: "icp" })
        ));
    }
}
