//! Binding to the HyperFrames renderer (`hyperframes/`, docs/HYPERFRAMES.md).
//! The Node package builds the composition and renders it; the engine only starts it,
//! runs its own technical QA on the MP4 and records the verdict in the manifest.
use crate::cli::{load_config, FormatArg};
use crate::commands::qa::{exit_code, technical_report};
use crate::commands::report::print_qa;
use anyhow::{bail, Context};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, clap::Args)]
pub(crate) struct ConfrontoArgs {
    #[arg(
        long,
        help = "JSON de confronto (gerado por `internacionais` ou escrito a mao)"
    )]
    pub(crate) dados: PathBuf,
    #[arg(
        long,
        help = "pasta de saida: projeto/, final.mp4 e render_manifest.json"
    )]
    pub(crate) saida: PathBuf,
    #[arg(long, default_value = "standard", value_parser = ["draft", "standard", "high"])]
    pub(crate) qualidade: String,
    #[arg(long, help = "duracao da corrida em segundos (padrao 46)")]
    pub(crate) corrida: Option<f64>,
    #[arg(long, help = "so monta o projeto HyperFrames, sem render nem QA")]
    pub(crate) sem_render: bool,
    #[arg(
        long,
        help = "id local em [[channels]]; obrigatorio quando ha canais (vai para o manifesto)"
    )]
    pub(crate) canal: Option<String>,
    #[arg(
        long,
        help = "angulo editorial mostrado sob o titulo (ate 44 caracteres), ex.: \"O 7 a 1 e so 1 de 23 jogos\""
    )]
    pub(crate) gancho: Option<String>,
}

#[derive(Debug, clap::Args)]
pub(crate) struct InternacionaisArgs {
    #[arg(long, help = "results.csv da base international_results (CC0)")]
    pub(crate) csv: PathBuf,
    #[arg(long, help = "lado A, nome como na base (ex.: Brazil)")]
    pub(crate) a: String,
    #[arg(long, help = "lado B, nome como na base (ex.: Argentina)")]
    pub(crate) b: String,
    #[arg(long, help = "data em que o CSV foi baixado, AAAA-MM-DD")]
    pub(crate) lido_em: String,
    #[arg(long)]
    pub(crate) saida: PathBuf,
}

/// The renderer package: `FRAMECHESTER_HYPERFRAMES_DIR`, else `hyperframes/` under the cwd.
fn package_dir() -> anyhow::Result<PathBuf> {
    let dir = std::env::var_os("FRAMECHESTER_HYPERFRAMES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("hyperframes"));
    let dir = std::path::absolute(&dir)?;
    if !dir.join("node_modules/tsx/dist/cli.mjs").is_file() {
        bail!(
            "renderizador HyperFrames nao instalado em {}: rode `npm --prefix hyperframes ci`",
            dir.display()
        );
    }
    Ok(dir)
}

fn abs(path: &Path) -> anyhow::Result<OsString> {
    Ok(std::path::absolute(path)?.into_os_string())
}

/// `node <tsx> <package>/src/cli.ts <args>`: the Node CLI, with every path absolute.
pub(crate) fn node_args(package: &Path, args: Vec<OsString>) -> Vec<OsString> {
    let mut out = vec![
        package
            .join("node_modules/tsx/dist/cli.mjs")
            .into_os_string(),
        package.join("src/cli.ts").into_os_string(),
    ];
    out.extend(args);
    out
}

fn run_node(args: Vec<OsString>) -> anyhow::Result<()> {
    let package = package_dir()?;
    let status = Command::new("node")
        .args(node_args(&package, args))
        .status()
        .context("node nao encontrado no PATH (Node.js 22 ou mais novo)")?;
    if !status.success() {
        bail!("renderizador HyperFrames terminou com {status}");
    }
    Ok(())
}

pub(crate) fn confronto_args(args: &ConfrontoArgs) -> anyhow::Result<Vec<OsString>> {
    let mut out: Vec<OsString> = vec![
        "confronto".into(),
        "--dados".into(),
        abs(&args.dados)?,
        "--saida".into(),
        abs(&args.saida)?,
        "--qualidade".into(),
        args.qualidade.clone().into(),
    ];
    if let Some(seconds) = args.corrida {
        if seconds.is_nan() || seconds <= 0.0 {
            bail!("--corrida deve ser positiva");
        }
        out.extend(["--corrida".into(), seconds.to_string().into()]);
    }
    if let Some(hook) = &args.gancho {
        out.extend(["--gancho".into(), hook.into()]);
    }
    if args.sem_render {
        out.push("--sem-render".into());
    }
    Ok(out)
}

/// The manifest with the channel it was made for and the engine's QA verdict in `qa`.
pub(crate) fn attach_qa(
    mut manifest: serde_json::Value,
    channel_id: Option<&str>,
    status: &str,
    report: serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    let object = manifest
        .as_object_mut()
        .context("render_manifest.json nao e um objeto JSON")?;
    object.insert("channel_id".into(), serde_json::json!(channel_id));
    object.insert(
        "qa".into(),
        serde_json::json!({ "status": status, "engine": "framechester qa", "report": report }),
    );
    Ok(manifest)
}

pub(crate) fn confronto(config: &Option<PathBuf>, args: ConfrontoArgs) -> anyhow::Result<i32> {
    // The channel is checked before a two-minute render, not after.
    let config = load_config(config)?;
    let channel = config.select_channel(args.canal.as_deref())?;
    if let Some(language) = channel.as_ref().and_then(|c| c.language.as_deref()) {
        if language != "pt-BR" {
            bail!("o template confronto escreve em pt-BR; o canal esta em {language}");
        }
    }
    run_node(confronto_args(&args)?)?;
    if args.sem_render {
        return Ok(0);
    }
    let video = args.saida.join("final.mp4");
    let (_, report) = technical_report(&config, &video, Some(FormatArg::Short))?;
    let code = exit_code(&report);
    let status = ["pass", "needs_human", "fail"][code as usize];
    let manifest_path = args.saida.join("render_manifest.json");
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&manifest_path)
            .with_context(|| format!("lendo {}", manifest_path.display()))?,
    )?;
    let manifest = attach_qa(
        manifest,
        channel.as_ref().map(|c| c.id.as_str()),
        status,
        serde_json::to_value(&report)?,
    )?;
    std::fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest)? + "\n",
    )?;
    println!("QA tecnico de {}:", video.display());
    print_qa(&report);
    Ok(code)
}

pub(crate) fn internacionais(args: InternacionaisArgs) -> anyhow::Result<i32> {
    run_node(vec![
        "internacionais".into(),
        "--csv".into(),
        abs(&args.csv)?,
        "--a".into(),
        args.a.into(),
        "--b".into(),
        args.b.into(),
        "--lido-em".into(),
        args.lido_em.into(),
        "--saida".into(),
        abs(&args.saida)?,
    ])?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args() -> ConfrontoArgs {
        ConfrontoArgs {
            dados: PathBuf::from("examples/esporte/x.confronto.json"),
            saida: PathBuf::from("artifacts/x"),
            qualidade: "draft".into(),
            corrida: Some(30.0),
            sem_render: false,
            canal: None,
            gancho: Some("O 7 a 1 é só 1 de 23 jogos".into()),
        }
    }

    #[test]
    fn node_gets_absolute_paths_and_only_the_flags_given() {
        let out = confronto_args(&args()).unwrap();
        let text: Vec<String> = out
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect();
        assert_eq!(text[0], "confronto");
        assert!(Path::new(&text[2]).is_absolute());
        assert!(text[2].ends_with("x.confronto.json"));
        assert!(Path::new(&text[4]).is_absolute());
        assert_eq!(
            &text[5..],
            [
                "--qualidade",
                "draft",
                "--corrida",
                "30",
                "--gancho",
                "O 7 a 1 é só 1 de 23 jogos"
            ]
        );
        let package = Path::new("/repo/hyperframes");
        let full = node_args(package, out);
        assert!(full[0].to_string_lossy().ends_with("tsx/dist/cli.mjs"));
        assert!(full[1].to_string_lossy().ends_with("src/cli.ts"));
    }

    #[test]
    fn non_positive_race_is_refused() {
        let mut a = args();
        a.corrida = Some(0.0);
        assert!(confronto_args(&a).is_err());
    }

    #[test]
    fn qa_verdict_replaces_the_manifest_qa_field() {
        let manifest =
            serde_json::json!({ "renderer": "hyperframes", "qa": { "status": "pending" } });
        let out = attach_qa(
            manifest,
            Some("esporte-em-dados"),
            "fail",
            serde_json::json!({ "checks": [] }),
        )
        .unwrap();
        assert_eq!(out["channel_id"], "esporte-em-dados");
        assert_eq!(out["qa"]["status"], "fail");
        assert_eq!(out["qa"]["engine"], "framechester qa");
        assert_eq!(out["renderer"], "hyperframes");
        assert!(attach_qa(serde_json::json!([]), None, "pass", serde_json::json!({})).is_err());
    }
}
