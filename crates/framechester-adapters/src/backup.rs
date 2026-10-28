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
        if target.as_os_str().is_empty() {
            return Err(FramechesterError::InvalidInput(
                "restore exige destino novo ou vazio".into(),
            ));
        }
        match std::fs::symlink_metadata(target) {
            Ok(metadata) => {
                if !metadata.is_dir()
                    || metadata.file_type().is_symlink()
                    || std::fs::read_dir(target)?.next().transpose()?.is_some()
                {
                    return Err(FramechesterError::InvalidInput(
                        "restore exige diretorio novo ou vazio, sem redirecionamento por link"
                            .into(),
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
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
        if !output.status.success() {
            return Err(FramechesterError::External(format!(
                "restic restore falhou; destino pode estar parcial e nao foi validado: {}",
                self.sanitize(&stderr)
            )));
        }
        let timestamp_issue = stderr.contains("timestamp") || stderr.contains("failed to set");
        let status = if timestamp_issue { "warning" } else { "ok" };
        Ok(BackupReceipt {
            provider: "restic".into(),
            repository: self.repository_display(),
            status: status.into(),
            snapshot_id: Some(snapshot_id.to_string()),
            bytes: None,
            message: if status == "warning" {
                "restic retornou sucesso; revise o aviso de timestamp/metadados".into()
            } else {
                "restore concluido".into()
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_backup(directory: &Path, exit_code: u8, stderr: &str) -> (ResticBackup, PathBuf) {
        let marker = directory.join("invoked.txt");
        #[cfg(windows)]
        let executable = {
            let path = directory.join("fake-restic.cmd");
            let script = format!(
                "@echo off\r\n>\"{}\" echo invoked\r\n>\"%~6\\restored.txt\" echo fixture-restored\r\n{}exit /b {exit_code}\r\n",
                marker.display(),
                if stderr.is_empty() {
                    String::new()
                } else {
                    format!("echo {stderr} 1>&2\r\n")
                }
            );
            std::fs::write(&path, script).unwrap();
            path
        };
        #[cfg(unix)]
        let executable = {
            use std::os::unix::fs::PermissionsExt;
            let path = directory.join("fake-restic.sh");
            let script = format!(
                "#!/bin/sh\nprintf '%s' 'invoked' > '{}'\nprintf '%s' 'fixture-restored' > \"$6/restored.txt\"\nprintf '%s' '{stderr}' >&2\nexit {exit_code}\n",
                marker.display()
            );
            std::fs::write(&path, script).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
            path
        };
        (
            ResticBackup {
                restic: executable.to_string_lossy().into_owned(),
                repository: directory
                    .join("fixture-repository")
                    .to_string_lossy()
                    .into_owned(),
            },
            marker,
        )
    }

    #[test]
    fn restore_rejects_timestamp_mixed_with_missing_or_corrupt_content() {
        for stderr in [
            "failed to restore timestamp; missing blob",
            "failed to restore timestamp; content checksum mismatch",
        ] {
            let directory = tempfile::tempdir().unwrap();
            let (backup, marker) = fake_backup(directory.path(), 1, stderr);
            let target = directory.path().join("target");
            let result = backup.restore("fixture-snapshot", &target);
            assert!(marker.exists());
            assert!(target.join("restored.txt").exists());
            assert!(matches!(result, Err(FramechesterError::External(_))));
        }
    }

    #[test]
    fn restore_rejects_nonempty_destination_before_running_restic() {
        let directory = tempfile::tempdir().unwrap();
        let (backup, marker) = fake_backup(directory.path(), 0, "");
        let target = directory.path().join("target");
        std::fs::create_dir(&target).unwrap();
        let existing = target.join("existing.txt");
        std::fs::write(&existing, "operator-data").unwrap();
        let result = backup.restore("fixture-snapshot", &target);
        assert!(matches!(result, Err(FramechesterError::InvalidInput(_))));
        assert!(!marker.exists());
        assert!(!target.join("restored.txt").exists());
        assert_eq!(std::fs::read_to_string(existing).unwrap(), "operator-data");
    }

    #[test]
    fn restore_accepts_new_or_empty_destination_when_process_succeeds() {
        for existing_empty in [false, true] {
            let directory = tempfile::tempdir().unwrap();
            let (backup, marker) = fake_backup(directory.path(), 0, "");
            let target = directory.path().join("target");
            if existing_empty {
                std::fs::create_dir(&target).unwrap();
            }
            let receipt = backup.restore("fixture-snapshot", &target).unwrap();
            assert_eq!(receipt.status, "ok");
            assert!(marker.exists());
            assert_eq!(
                std::fs::read_to_string(target.join("restored.txt"))
                    .unwrap()
                    .trim(),
                "fixture-restored"
            );
        }
    }

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
