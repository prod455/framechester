//! `backup-check`, `backup`, `restore`: restic operations behind explicit `--yes`.
use anyhow::bail;
use framechester_adapters::backup::ResticBackup;
use framechester_core::ports::BackupProvider;
use std::path::{Path, PathBuf};

pub(crate) fn backup_check(json: bool) -> anyhow::Result<i32> {
    let provider = ResticBackup::from_env("restic")?;
    let receipt = provider.check()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    } else {
        println!(
            "backup: {} | {} | {}",
            receipt.status, receipt.repository, receipt.message
        );
    }
    Ok(0)
}

pub(crate) fn backup_snapshot(
    paths: &[PathBuf],
    yes: bool,
    allow_remote: bool,
    json: bool,
) -> anyhow::Result<i32> {
    if !yes {
        bail!("snapshot recusado: confirme com --yes apos revisar os caminhos");
    }
    let provider = ResticBackup::from_env("restic")?;
    if provider.is_remote() && !allow_remote {
        bail!("repositorio remoto exige --allow-remote e autorizacao explicita de custo");
    }
    let receipt = provider.snapshot(paths)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    } else {
        println!(
            "backup: {} | {} | snapshot {} | {}",
            receipt.status,
            receipt.repository,
            receipt.snapshot_id.as_deref().unwrap_or("-"),
            receipt.message
        );
    }
    Ok(if receipt.status == "ok" || receipt.status == "warning" {
        0
    } else {
        2
    })
}

pub(crate) fn backup_restore(
    snapshot: &str,
    target: &Path,
    yes: bool,
    allow_remote: bool,
    json: bool,
) -> anyhow::Result<i32> {
    if !yes {
        bail!("restore recusado: confirme com --yes apos revisar snapshot e destino");
    }
    let provider = ResticBackup::from_env("restic")?;
    if provider.is_remote() && !allow_remote {
        bail!("restore de repositorio remoto exige --allow-remote e autorizacao explicita");
    }
    let receipt = provider.restore(snapshot, target)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    } else {
        println!(
            "restore: {} | {} | {}",
            receipt.status, receipt.repository, receipt.message
        );
    }
    Ok(if receipt.status == "ok" || receipt.status == "warning" {
        0
    } else {
        2
    })
}
