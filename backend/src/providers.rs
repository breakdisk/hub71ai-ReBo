//! Anti-corruption layer contracts and deterministic local-only adapters.

use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderStage {
    Icp,
    Banking,
    Travel,
    Logistics,
}

impl ProviderStage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Icp => "icp",
            Self::Banking => "banking",
            Self::Travel => "travel",
            Self::Logistics => "logistics",
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
#[error("mock provider rejected request")]
pub struct ProviderError {
    pub code: &'static str,
    pub stage: ProviderStage,
}

/// Provider ports deliberately accept only a transient opaque identity token.
/// Implementations must not retain or include it in logs, errors, or events.
pub trait IcpProvider: Send + Sync {
    fn submit(&self, opaque_identity_token: &str) -> Result<(), ProviderError>;
}

pub trait BankingProvider: Send + Sync {
    fn provision(&self, opaque_identity_token: &str) -> Result<(), ProviderError>;
}

pub trait TravelProvider: Send + Sync {
    fn book(&self, opaque_identity_token: &str) -> Result<(), ProviderError>;
}

pub trait LogisticsProvider: Send + Sync {
    fn arrange(&self, opaque_identity_token: &str) -> Result<(), ProviderError>;
}

#[derive(Debug, Default)]
pub struct MockProviders {
    pub failure_tokens_enabled: bool,
}

impl MockProviders {
    fn check(&self, token: &str, expected_stage: ProviderStage) -> Result<(), ProviderError> {
        let failure_token = format!("demo:fail-{}", expected_stage.as_str());
        if self.failure_tokens_enabled && token == failure_token {
            Err(ProviderError {
                code: match expected_stage {
                    ProviderStage::Icp => "ICP_DEMO_REJECTION",
                    ProviderStage::Banking => "BANKING_DEMO_REJECTION",
                    ProviderStage::Travel => "TRAVEL_DEMO_REJECTION",
                    ProviderStage::Logistics => "LOGISTICS_DEMO_REJECTION",
                },
                stage: expected_stage,
            })
        } else {
            Ok(())
        }
    }
}

impl IcpProvider for MockProviders {
    fn submit(&self, token: &str) -> Result<(), ProviderError> {
        self.check(token, ProviderStage::Icp)
    }
}

impl BankingProvider for MockProviders {
    fn provision(&self, token: &str) -> Result<(), ProviderError> {
        self.check(token, ProviderStage::Banking)
    }
}

impl TravelProvider for MockProviders {
    fn book(&self, token: &str) -> Result<(), ProviderError> {
        self.check(token, ProviderStage::Travel)
    }
}

impl LogisticsProvider for MockProviders {
    fn arrange(&self, token: &str) -> Result<(), ProviderError> {
        self.check(token, ProviderStage::Logistics)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_failure_tokens_are_stage_scoped() {
        let local = MockProviders {
            failure_tokens_enabled: true,
        };
        let production = MockProviders::default();
        assert_eq!(
            local.submit("demo:fail-icp").unwrap_err().code,
            "ICP_DEMO_REJECTION"
        );
        assert!(local.provision("demo:fail-icp").is_ok());
        assert!(production.submit("demo:fail-icp").is_ok());
        assert!(local.submit("synthetic:ok").is_ok());
    }
}
