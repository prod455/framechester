//! Local claim check: never upgrades a claim to verified on its own.
use framechester_core::domain::{Claim, ClaimStatus};
use framechester_core::error::Result;
use framechester_core::ports::{AdapterInfo, FactEvidenceProvider};

#[derive(Debug, Default)]
pub struct LocalEvidenceProvider;

impl FactEvidenceProvider for LocalEvidenceProvider {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "local-evidence".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "nao verifica fatos na internet".into(),
                "claim sem fonte permanece nao verificado".into(),
            ],
        }
    }

    fn verify(&self, claims: &[Claim]) -> Result<Vec<Claim>> {
        Ok(claims
            .iter()
            .map(|claim| {
                let mut updated = claim.clone();
                if updated.source_urls.is_empty() {
                    updated.status = ClaimStatus::Unverified;
                } else if updated.status == ClaimStatus::Unverified {
                    updated.status = ClaimStatus::Cited;
                }
                updated
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_evidence_never_invents_verification() {
        let provider = LocalEvidenceProvider;
        let claims = vec![
            Claim {
                text: "com fonte".into(),
                status: ClaimStatus::Unverified,
                source_urls: vec!["https://example.com".into()],
            },
            Claim {
                text: "sem fonte".into(),
                status: ClaimStatus::Verified,
                source_urls: Vec::new(),
            },
        ];
        let verified = provider.verify(&claims).unwrap();
        assert_eq!(verified[0].status, ClaimStatus::Cited);
        assert_eq!(verified[1].status, ClaimStatus::Unverified);
    }

    #[test]
    fn local_evidence_preserves_contradiction() {
        let claims = vec![Claim {
            text: "contradito".into(),
            status: ClaimStatus::Contradicted,
            source_urls: vec!["https://example.com".into()],
        }];
        let verified = LocalEvidenceProvider.verify(&claims).unwrap();
        assert_eq!(verified[0].status, ClaimStatus::Contradicted);
    }
}
