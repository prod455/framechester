use framechester_core::domain::{PublishReceipt, PublishRequest, PublishStatus};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, Publisher};

#[derive(Debug, Default)]
pub struct DryRunPublisher;

impl Publisher for DryRunPublisher {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "dry-run-publisher".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "nao publica de verdade".into(),
                "publicacao real exige aprovacao explicita".into(),
            ],
        }
    }

    fn publish(&self, request: &PublishRequest) -> Result<PublishReceipt> {
        if !request.media_path.is_file() {
            return Err(FramechesterError::InvalidInput(format!(
                "video inexistente: {}",
                request.media_path.display()
            )));
        }
        if !request.dry_run {
            return Ok(PublishReceipt {
                provider: "dry-run".into(),
                status: PublishStatus::Blocked,
                video_id: None,
                message: "publicacao real desativada neste MVP; use dry_run=true".into(),
                published_at_unix: None,
                dry_run: true,
            });
        }
        if request.title.trim().is_empty() {
            return Err(FramechesterError::InvalidInput(
                "titulo de publicacao vazio".into(),
            ));
        }
        let receipt = PublishReceipt {
            provider: "dry-run".into(),
            status: PublishStatus::DryRun,
            video_id: None,
            message: format!(
                "dry-run: {} -> {} ({:?}, canal {:?})",
                request.title,
                request.media_path.display(),
                request.privacy,
                request.channel
            ),
            published_at_unix: None,
            dry_run: true,
        };
        if let Some(parent) = request.media_path.parent() {
            let path = parent.join("publish_receipt.json");
            if let Ok(text) = serde_json::to_string_pretty(&receipt) {
                let _ = std::fs::write(path, text);
            }
        }
        Ok(receipt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::domain::{now_unix, PublishPrivacy};
    use std::path::PathBuf;

    fn request(path: PathBuf, dry_run: bool) -> PublishRequest {
        PublishRequest {
            media_path: path,
            title: "Teste".into(),
            description: "desc".into(),
            privacy: PublishPrivacy::Private,
            dry_run,
            channel: None,
        }
    }

    #[test]
    fn missing_media_fails() {
        let publisher = DryRunPublisher;
        assert!(publisher
            .publish(&request(PathBuf::from("nao-existe.mp4"), true))
            .is_err());
    }

    #[test]
    fn dry_run_does_not_publish() {
        let dir = std::env::temp_dir().join(format!("framechester-publish-{}", now_unix()));
        std::fs::create_dir_all(&dir).unwrap();
        let media = dir.join("video.mp4");
        std::fs::write(&media, b"synthetic").unwrap();
        let receipt = DryRunPublisher
            .publish(&request(media.clone(), true))
            .unwrap();
        assert_eq!(receipt.status, PublishStatus::DryRun);
        assert!(receipt.dry_run);
        assert!(
            receipt.published_at_unix.is_none(),
            "dry-run has no publication time"
        );
        assert!(media
            .parent()
            .unwrap()
            .join("publish_receipt.json")
            .is_file());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn live_publish_is_blocked_without_network() {
        let dir = std::env::temp_dir().join(format!("framechester-publish-live-{}", now_unix()));
        std::fs::create_dir_all(&dir).unwrap();
        let media = dir.join("video.mp4");
        std::fs::write(&media, b"synthetic").unwrap();
        let receipt = DryRunPublisher.publish(&request(media, false)).unwrap();
        assert_eq!(receipt.status, PublishStatus::Blocked);
        assert!(receipt.video_id.is_none());
        std::fs::remove_dir_all(dir).ok();
    }
}
