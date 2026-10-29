//! `doctor` and `config-check`: local tools, paths and effective configuration.
use crate::cli::load_config;
use framechester_adapters::kokoro::KokoroTts;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize)]
pub(crate) struct Check {
    name: String,
    ok: bool,
    critical: bool,
    detail: String,
}

pub(crate) fn check_command(name: &str, args: &[&str], critical: bool) -> Check {
    match Command::new(name).args(args).output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let first = text.lines().next().unwrap_or("").trim().to_string();
            Check {
                name: name.into(),
                ok: true,
                critical,
                detail: first,
            }
        }
        Ok(output) => Check {
            name: name.into(),
            ok: false,
            critical,
            detail: format!("exit {}", output.status),
        },
        Err(error) => Check {
            name: name.into(),
            ok: false,
            critical,
            detail: error.to_string(),
        },
    }
}

pub(crate) fn check_env(name: &str) -> Check {
    let present = std::env::var(name)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    Check {
        name: name.into(),
        ok: present,
        critical: false,
        detail: if present {
            "configurada".into()
        } else {
            "ausente".into()
        },
    }
}

pub(crate) fn doctor(path: &Option<PathBuf>, json: bool) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    let mut checks = Vec::new();
    checks.push(check_command("ffmpeg", &["-version"], true));
    checks.push(check_command("ffprobe", &["-version"], true));
    checks.push(check_command("restic", &["version"], false));
    match KokoroTts::new(&config.tts) {
        Ok(_) => checks.push(Check {
            name: "commercial_voice".into(),
            ok: true,
            critical: true,
            detail: format!(
                "Kokoro {} | Apache-2.0 | modelo e vozes conferidos por SHA-256",
                config.tts.voice_name
            ),
        }),
        Err(error) => checks.push(Check {
            name: "commercial_voice".into(),
            ok: false,
            critical: true,
            detail: error.to_string(),
        }),
    }
    checks.push(Check {
        name: "asr".into(),
        ok: Path::new(&config.asr.model).is_file(),
        critical: false,
        detail: if Path::new(&config.asr.model).is_file() {
            format!(
                "{} | idioma {} | habilitado={}",
                config.asr.model, config.asr.language, config.asr.enabled
            )
        } else {
            format!("modelo ausente: {}", config.asr.model)
        },
    });
    checks.push(check_env("ANTHROPIC_API_KEY"));
    checks.push(check_env("ANTHROPIC_MODEL"));
    checks.push(check_env("YOUTUBE_CLIENT_SECRET"));
    checks.push(check_env("YOUTUBE_TOKEN_FILE"));
    checks.push(check_env("RESTIC_REPOSITORY"));
    checks.push(check_env("RESTIC_PASSWORD"));
    checks.push(Check {
        name: "telemetry".into(),
        ok: !config.app.telemetry,
        critical: true,
        detail: "deve permanecer false".into(),
    });
    checks.push(Check {
        name: "dry_run".into(),
        ok: config.app.dry_run,
        critical: true,
        detail: format!("{}", config.app.dry_run),
    });
    let ok = checks
        .iter()
        .filter(|check| check.critical)
        .all(|check| check.ok);
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "ok": ok,
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "checks": checks,
            }))?
        );
    } else {
        println!(
            "framechester {} ({}/{})",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH
        );
        for check in &checks {
            let marker = if check.ok {
                "ok"
            } else if check.critical {
                "FALHA"
            } else {
                "aviso"
            };
            println!("  [{marker:5}] {:<26} {}", check.name, check.detail);
        }
        println!(
            "resultado: {}",
            if ok { "pronto" } else { "pendencias criticas" }
        );
    }
    Ok(if ok { 0 } else { 1 })
}

pub(crate) fn config_check(path: &Option<PathBuf>, json: bool) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "ok": true,
                "workdir": config.workdir_path(),
                "config": config,
            }))?
        );
    } else {
        println!("configuracao valida");
        println!("workdir: {}", config.workdir_path().display());
        println!("dry_run: {}", config.app.dry_run);
        println!("telemetry: {}", config.app.telemetry);
        println!(
            "render: {}x{} @ {} fps, {} crf {}",
            config.render.width,
            config.render.height,
            config.render.fps,
            config.render.video_codec,
            config.render.crf
        );
        println!(
            "tts: motor={} voz={} (catalogo comercial)",
            config.tts.engine, config.tts.voice_name
        );
        println!(
            "llm: provider={} model={}",
            config.llm.provider,
            if config.llm.model.is_empty() {
                "(vazio)"
            } else {
                &config.llm.model
            }
        );
        println!(
            "publish: enabled={} rede={} privacidade={}",
            config.publish.enabled, config.publish.network, config.publish.privacy
        );
        println!(
            "backup: enabled={} provider={}",
            config.backup.enabled, config.backup.provider
        );
    }
    Ok(0)
}
