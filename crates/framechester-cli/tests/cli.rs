use std::process::Command;

fn binary() -> Command {
    Command::new(env!("CARGO_BIN_EXE_framechester"))
}

#[test]
fn help_lists_core_commands() {
    let output = binary().arg("--help").output().unwrap();
    assert!(output.status.success());
    let text = String::from_utf8_lossy(&output.stdout);
    for command in [
        "doctor",
        "config-check",
        "trends",
        "run",
        "qa",
        "backup-check",
        "finance",
    ] {
        assert!(text.contains(command), "comando ausente: {command}");
    }
}

#[test]
fn visuals_command_generates_local_art_without_tts_or_paid_services() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("plan.json");
    std::fs::write(&input, r#"{"channel":"Canal demonstrativo","title":"Uma skill na prática","format":"long","scenes":[{"id":42,"heading":"Como funciona","narration":"Uma skill reúne instruções para uma tarefa.","visual_brief":"Diagrama explicativo de entrada, tarefa e saída.","duration_hint_secs":15.0},{"id":77,"heading":"Teste real","narration":"Vamos observar o experimento.","visual_brief":"[CAPTURA PENDENTE] Gravação real da execução.","duration_hint_secs":15.0}]}"#).unwrap();
    let output = directory.path().join("visuals");
    let result = binary()
        .args(["visuals", "--input"])
        .arg(&input)
        .arg("--output")
        .arg(&output)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(report["scenes"][0]["status"], "generated");
    assert_eq!(report["scenes"][1]["status"], "requires_capture");
    let png = std::fs::read(output.join("scene-42.png")).unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 1920);
    assert!(
        output.join("scene-77.png").is_file(),
        "A pending recording still needs a visibly marked illustrative preview"
    );
    assert_eq!(report["scenes"][1]["file"], "scene-77.png");
}

#[test]
fn config_check_uses_safe_defaults() {
    let output = binary().arg("config-check").output().unwrap();
    assert!(output.status.success());
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(text.contains("configuracao valida"));
    assert!(text.contains("dry_run: true"));
    assert!(text.contains("telemetry: false"));
}

#[test]
fn finance_is_a_simulation_not_a_promise() {
    let output = binary()
        .args(["finance", "--storage-gb", "50", "--provider", "b2"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(text.contains("R$ 1,48"));
    assert!(text.contains("sem garantia de receita"));
}

#[test]
fn backup_check_without_env_fails_cleanly() {
    let output = binary()
        .arg("backup-check")
        .env_remove("RESTIC_REPOSITORY")
        .env_remove("RESTIC_PASSWORD")
        .output()
        .unwrap();
    assert!(!output.status.success());
    let text = String::from_utf8_lossy(&output.stderr);
    assert!(text.contains("RESTIC_REPOSITORY"));
    assert!(!text.contains("panicked"));
}

#[test]
fn configured_channels_require_an_explicit_selection_before_tools_run() {
    let directory = tempfile::tempdir().unwrap();
    let config = directory.path().join("channels.toml");
    std::fs::write(
        &config,
        "[[channels]]\nid = 'tech'\n[[channels]]\nid = 'science'\n",
    )
    .unwrap();
    let output = binary()
        .arg("--config")
        .arg(&config)
        .arg("run")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("--channel"));
}

#[test]
fn unknown_channel_is_rejected_before_media_production() {
    let directory = tempfile::tempdir().unwrap();
    let config = directory.path().join("channels.toml");
    std::fs::write(&config, "[[channels]]\nid = 'tech'\n").unwrap();
    let output = binary()
        .arg("--config")
        .arg(&config)
        .args(["run", "--channel", "unknown"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("canal nao cadastrado"));
}

#[test]
fn analytics_keeps_fixture_revenue_unknown_and_rejects_another_channel() {
    let directory = tempfile::tempdir().unwrap();
    let config = directory.path().join("channels.toml");
    std::fs::write(
        &config,
        "[[channels]]\nid = 'tech'\n[[channels]]\nid = 'science'\n",
    )
    .unwrap();
    let input = directory.path().join("snapshot.json");
    std::fs::write(&input, r#"{"channel_id":"tech","period_start":"2026-10-01","period_end":"2026-10-27","source":"fixture","currency":"BRL","monetization_enabled":false,"format":"shorts","views":2000,"engaged_views":1200,"watch_minutes":400,"estimated_revenue_cents":null,"paid_revenue_cents":null}"#).unwrap();
    let output = binary()
        .arg("--config")
        .arg(&config)
        .args(["analytics", "--channel", "tech", "--input"])
        .arg(&input)
        .arg("--json")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let summary: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(summary["source"], "fixture");
    assert_eq!(summary["channel_id"], "tech");
    assert!(summary["estimated_revenue_cents"].is_null());
    assert!(summary["estimated_rpm_cents"].is_null());
    let wrong = binary()
        .arg("--config")
        .arg(&config)
        .args(["analytics", "--channel", "science", "--input"])
        .arg(&input)
        .output()
        .unwrap();
    assert!(!wrong.status.success());
}
