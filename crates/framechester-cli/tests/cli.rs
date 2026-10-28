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
