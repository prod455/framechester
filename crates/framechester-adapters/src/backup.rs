use framechester_core::domain::BackupReceipt;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, BackupProvider};
use std::path::{Path, PathBuf};
use std::process::Command;

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

pub fn mask_repository(repository: &str) -> String {
    let trimmed = repository.trim();
    if let Some(index) = trimmed.find("://") {
        let scheme = &trimmed[..index];
        let rest = &trimmed[index + 3..];
        let authority = rest.split('/').next().unwrap_or(rest);
        let host = authority.rsplit('@').next().unwrap_or(authority);
        let host = host.split('?').next().unwrap_or(host);
        return format!("{scheme}://{host}/...");
    }
    if let Some((scheme, _)) = trimmed.split_once(':') {
        if scheme.len() > 1 && !scheme.contains(['\\', '/']) {
            return format!("{scheme}:...");
        }
    }
    let name = Path::new(trimmed)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "oculto".into());
    format!("local:{name}")
}

fn has_regular_file(path: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            return true;
        }
        if path.is_dir() && has_regular_file(&path) {
            return true;
        }
    }
    false
}

#[derive(Debug, Clone)]
pub struct ResticBackup {
    restic: String,
    repository: String,
}

impl ResticBackup {
    pub fn from_env(restic_path: &str) -> Result<Self> {
        let repository = std::env::var("RESTIC_REPOSITORY").unwrap_or_default();
        if repository.trim().is_empty() {
            return Err(FramechesterError::Unavailable(
                "RESTIC_REPOSITORY nao configurado".into(),
            ));
        }
        let has_password = [
            "RESTIC_PASSWORD",
            "RESTIC_PASSWORD_FILE",
            "RESTIC_PASSWORD_COMMAND",
        ]
        .iter()
        .any(|name| {
            std::env::var(name)
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        });
        if !has_password {
            return Err(FramechesterError::Unavailable(
                "configure RESTIC_PASSWORD ou RESTIC_PASSWORD_FILE".into(),
            ));
        }
        Ok(Self {
            restic: restic_path.to_string(),
            repository,
        })
    }

    pub fn repository_display(&self) -> String {
        mask_repository(&self.repository)
    }

    pub fn is_remote(&self) -> bool {
        let repository = self.repository.trim();
        !(repository.starts_with('/')
            || repository.starts_with("\\\\")
            || repository.contains(":\\"))
    }

    fn run(
        &self,
        args: &[String],
        current_dir: Option<&Path>,
    ) -> std::io::Result<std::process::Output> {
        let mut command = Command::new(&self.restic);
        command.arg("-r").arg(&self.repository).args(args);
        if let Some(directory) = current_dir {
            command.current_dir(directory);
        }
        command.output()
    }

    fn sanitize(&self, text: &str) -> String {
        let masked = mask_repository(&self.repository);
        let replaced = text.replace(&self.repository, &masked);
        truncate(&replaced, 500)
    }
}

impl BackupProvider for ResticBackup {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "restic-backup".into(),
            license: "restic BSD-2-Clause".into(),
            network: !self.repository.starts_with('/') && !self.repository.contains(":\\"),
            unit_cost: "depende do provedor B2/R2".into(),
            secrets: vec![
                "RESTIC_PASSWORD".into(),
                "B2_ACCOUNT_KEY".into(),
                "AWS_SECRET_ACCESS_KEY".into(),
            ],
            failure_modes: vec![
                "credencial ausente".into(),
                "repositorio inacessivel".into(),
                "disco cheio".into(),
                "timestamp Windows no restore".into(),
            ],
        }
    }

    fn check(&self) -> Result<BackupReceipt> {
        let output = self
            .run(&["cat".into(), "config".into()], None)
            .map_err(|error| FramechesterError::Unavailable(format!("restic: {error}")))?;
        if !output.status.success() {
            return Err(FramechesterError::External(format!(
                "restic check falhou: {}",
                self.sanitize(&String::from_utf8_lossy(&output.stderr))
            )));
        }
        Ok(BackupReceipt {
            provider: "restic".into(),
            repository: self.repository_display(),
            status: "ok".into(),
            snapshot_id: None,
            bytes: None,
            message: "repositorio acessivel".into(),
        })
    }

    fn snapshot(&self, paths: &[PathBuf]) -> Result<BackupReceipt> {
        if paths.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "nenhum caminho para backup".into(),
            ));
        }
        let mut args = vec![
            "backup".to_string(),
            "--json".to_string(),
            "--tag".to_string(),
            "framechester".to_string(),
        ];
        for path in paths {
            if !path.exists() {
                return Err(FramechesterError::InvalidInput(format!(
                    "caminho inexistente: {}",
                    path.display()
                )));
            }
            args.push(path.to_string_lossy().to_string());
        }
        let output = self
            .run(&args, None)
            .map_err(|error| FramechesterError::Unavailable(format!("restic: {error}")))?;
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if !output.status.success() {
            return Err(FramechesterError::External(format!(
                "restic backup falhou: {}",
                self.sanitize(&stderr)
            )));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut snapshot_id = None;
        let mut bytes = None;
        for line in stdout.lines().rev() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                if snapshot_id.is_none() {
                    snapshot_id = value
                        .get("snapshot_id")
                        .and_then(|value| value.as_str())
                        .map(str::to_string);
                }
                if bytes.is_none() {
                    bytes = value
                        .get("total_bytes_processed")
                        .and_then(|value| value.as_u64());
                }
                if snapshot_id.is_some() {
                    break;
                }
            }
        }
        let mut warnings = Vec::new();
        if stderr.contains("failed to") || stderr.contains("warning") {
            warnings.push("restic emitiu aviso; verifique o log local".to_string());
        }
        Ok(BackupReceipt {
            provider: "restic".into(),
            repository: self.repository_display(),
            status: if warnings.is_empty() {
                "ok".into()
            } else {
                "warning".into()
            },
            snapshot_id,
            bytes,
            message: warnings.join("; "),
        })
    }

    fn restore(&self, snapshot_id: &str, target: &Path) -> Result<BackupReceipt> {
        if snapshot_id.trim().is_empty() {
            return Err(FramechesterError::InvalidInput("snapshot vazio".into()));
        }
        std::fs::create_dir_all(target)?;
        let output = self
            .run(
                &[
                    "restore".into(),
                    snapshot_id.to_string(),
                    "--target".into(),
                    target.to_string_lossy().to_string(),
                ],
                None,
            )
            .map_err(|error| FramechesterError::Unavailable(format!("restic: {error}")))?;
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let timestamp_issue = stderr.contains("timestamp")
            || stderr.contains("failed to restore timestamp")
            || stderr.contains("failed to set");
        if !output.status.success() && (!timestamp_issue || !has_regular_file(target)) {
            return Err(FramechesterError::External(format!(
                "restic restore falhou: {}",
                self.sanitize(&stderr)
            )));
        }
        let status = if timestamp_issue { "warning" } else { "ok" };
        Ok(BackupReceipt {
            provider: "restic".into(),
            repository: self.repository_display(),
            status: status.into(),
            snapshot_id: Some(snapshot_id.to_string()),
            bytes: None,
            message: if status == "warning" {
                "arquivos restaurados; timestamp pode ter falhado no Windows".into()
            } else {
                "restore concluido".into()
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_remote_credentials() {
        assert_eq!(
            mask_repository("s3:https://key:secret@bucket.example.com/path"),
            "s3:https://bucket.example.com/..."
        );
        assert_eq!(mask_repository("b2:bucket-id:path"), "b2:...");
        assert_eq!(
            mask_repository("C:\\backups\\framechester"),
            "local:framechester"
        );
    }

    #[test]
    fn distinguishes_local_and_remote_repositories() {
        let local = ResticBackup {
            restic: "restic".into(),
            repository: "C:\\backups\\fc".into(),
        };
        assert!(!local.is_remote());
        let remote = ResticBackup {
            restic: "restic".into(),
            repository: "b2:bucket:path".into(),
        };
        assert!(remote.is_remote());
    }

    #[test]
    fn missing_env_is_unavailable_not_silent() {
        let saved = std::env::var("RESTIC_REPOSITORY").ok();
        std::env::remove_var("RESTIC_REPOSITORY");
        let error = ResticBackup::from_env("restic").unwrap_err();
        assert!(matches!(error, FramechesterError::Unavailable(_)));
        if let Some(value) = saved {
            std::env::set_var("RESTIC_REPOSITORY", value);
        }
    }
}
