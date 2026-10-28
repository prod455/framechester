use anyhow::{bail, Context};
use clap::{Parser, Subcommand, ValueEnum};
use framechester_adapters::anthropic::AnthropicLlm;
use framechester_adapters::authored_script::AuthoredScriptLlm;
use framechester_adapters::backup::ResticBackup;
use framechester_adapters::ffmpeg::{inspect_output, AsrOptions, FfmpegQa, FfmpegRenderer};
use framechester_adapters::fixtures::{
    LocalEvidenceProvider, StaticTrendSource, SyntheticAssetProvider, TemplateLlm,
};
use framechester_adapters::kokoro::KokoroTts;
use framechester_adapters::local_assets::LocalAssetProvider;
use framechester_adapters::metrics::NullMetrics;
use framechester_adapters::publish::DryRunPublisher;
use framechester_core::config::Config;
use framechester_core::domain::{
    now_unix, PipelineReport, PublishPrivacy, QaReport, QaStatus, ScriptFormat, Stage, Topic,
};
use framechester_core::finance::{self, FinanceInput, StorageProvider};
use framechester_core::pipeline::{Pipeline, PipelineOptions, PipelineProviders};
use framechester_core::ports::{
    AssetProvider, BackupProvider, GenerationBudget, LlmProvider, TrendRequest, TrendSource,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Parser)]
#[command(
    name = "framechester",
    version,
    about = "Framechester V4 - motor local de producao"
)]
struct Cli {
    #[arg(long, global = true, help = "caminho do framechester.toml")]
    config: Option<PathBuf>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(about = "checa ferramentas, caminhos e variaveis de ambiente")]
    Doctor {
        #[arg(long)]
        json: bool,
    },
    #[command(about = "valida a configuracao e mostra os valores efetivos")]
    ConfigCheck {
        #[arg(long)]
        json: bool,
    },
    #[command(about = "analisa um snapshot JSON local por canal; nao consulta o YouTube")]
    Analytics {
        #[arg(long)]
        channel: String,
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "lista e pontua topicos do fixture local")]
    Trends {
        #[arg(long, default_value_t = 10)]
        limit: usize,
        #[arg(long, default_value = "BR")]
        region: String,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "executa o pipeline completo em dry-run")]
    Run(RunArgs),
    #[command(
        about = "prepara visuais explicativos locais; nao usa API nem substitui capturas reais"
    )]
    Visuals {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    #[command(about = "roda QA tecnico em um video existente")]
    Qa {
        #[arg(long)]
        video: PathBuf,
        #[arg(
            long,
            value_enum,
            help = "perfil de proporcao esperado: short vertical, long horizontal"
        )]
        format: Option<FormatArg>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "valida o repositorio restic configurado")]
    BackupCheck {
        #[arg(long)]
        json: bool,
    },
    #[command(about = "cria um snapshot restic local; exige --yes")]
    Backup {
        #[arg(long = "path", required = true, help = "caminho a incluir; repetivel")]
        paths: Vec<PathBuf>,
        #[arg(long, help = "confirmacao explicita; sem isto nada e executado")]
        yes: bool,
        #[arg(long, help = "permite repositorio remoto e eventual custo/egress")]
        allow_remote: bool,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "restaura um snapshot restic; exige --yes")]
    Restore {
        #[arg(long)]
        snapshot: String,
        #[arg(long)]
        target: PathBuf,
        #[arg(long, help = "confirmacao explicita; sem isto nada e executado")]
        yes: bool,
        #[arg(long, help = "permite repositorio remoto e eventual custo/egress")]
        allow_remote: bool,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "gera report.html a partir de pipeline_report.json")]
    Report {
        #[arg(long)]
        workdir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "simula custos e receita sem prometer resultado")]
    Finance(FinanceArgs),
}

#[derive(Debug, clap::Args)]
struct RunArgs {
    #[arg(
        long,
        conflicts_with = "llm",
        help = "roteiro JSON autoral vinculado ao topico; sem chamada de IA"
    )]
    script: Option<PathBuf>,
    #[arg(
        long,
        help = "manifesto JSON de imagens/videos locais com licenca, origem e SHA256"
    )]
    assets: Option<PathBuf>,
    #[arg(
        long,
        help = "id local cadastrado em [[channels]]; obrigatorio quando ha canais"
    )]
    channel: Option<String>,
    #[arg(long, help = "arquivo JSON com Topic ou lista de Topic")]
    topic: Option<PathBuf>,
    #[arg(long, default_value_t = 0)]
    topic_index: usize,
    #[arg(long, value_enum)]
    format: Option<FormatArg>,
    #[arg(long, help = "limite de cenas; padrao depende do formato")]
    max_scenes: Option<usize>,
    #[arg(long)]
    workdir: Option<PathBuf>,
    #[arg(long)]
    voice: Option<String>,
    #[arg(long, value_enum)]
    privacy: Option<PrivacyArg>,
    #[arg(long, value_enum)]
    llm: Option<LlmArg>,
    #[arg(
        long,
        default_value_t = 0,
        help = "orcamento em centavos; Anthropic bloqueado ate existir cotacao e controle de custo"
    )]
    max_cost_cents: u32,
    #[arg(long, default_value_t = 4000)]
    max_output_tokens: u32,
    #[arg(long, help = "roda QA ASR local com whisper; requer modelo")]
    asr: bool,
    #[arg(long, help = "queima legendas PT-BR no MP4 final")]
    burn_subtitles: bool,
    #[arg(long, requires_all = ["script", "assets"], help = "renderiza previa com marca de revisao; sem pacote ou publicacao")]
    preview_only: bool,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, clap::Args)]
struct FinanceArgs {
    #[arg(long)]
    eligible: bool,
    #[arg(long, default_value_t = 0)]
    views_long: u64,
    #[arg(long, default_value_t = 0)]
    rpm_long_cents: u64,
    #[arg(long, default_value_t = 0)]
    views_shorts: u64,
    #[arg(long, default_value_t = 0)]
    rpm_shorts_cents: u64,
    #[arg(long, default_value_t = 0)]
    other_revenue_cents: u64,
    #[arg(long, value_enum, default_value = "b2")]
    provider: ProviderArg,
    #[arg(long, default_value_t = 50)]
    storage_gb: u64,
    #[arg(long, default_value_t = 534)]
    usd_brl_cents: u64,
    #[arg(long, default_value_t = 0)]
    additional_cost_cents: u64,
    #[arg(long, default_value_t = 0)]
    taxes_bp: u32,
    #[arg(long, default_value_t = 0)]
    own_hours: u64,
    #[arg(long, default_value_t = 0)]
    hour_rate_cents: u64,
    #[arg(long, default_value_t = 0)]
    economic_allocations_cents: u64,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum FormatArg {
    Short,
    Long,
}

impl From<FormatArg> for ScriptFormat {
    fn from(value: FormatArg) -> Self {
        match value {
            FormatArg::Short => ScriptFormat::Short,
            FormatArg::Long => ScriptFormat::Long,
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum PrivacyArg {
    Private,
    Unlisted,
    Public,
}

impl From<PrivacyArg> for PublishPrivacy {
    fn from(value: PrivacyArg) -> Self {
        match value {
            PrivacyArg::Private => PublishPrivacy::Private,
            PrivacyArg::Unlisted => PublishPrivacy::Unlisted,
            PrivacyArg::Public => PublishPrivacy::Public,
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum LlmArg {
    Template,
    Anthropic,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum ProviderArg {
    B2,
    R2,
}

#[derive(Debug, Serialize)]
struct Check {
    name: String,
    ok: bool,
    critical: bool,
    detail: String,
}

fn main() {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("erro: {error:#}");
            std::process::exit(1);
        }
    }
}

fn run(cli: Cli) -> anyhow::Result<i32> {
    match cli.command {
        Commands::Doctor { json } => doctor(&cli.config, json),
        Commands::ConfigCheck { json } => config_check(&cli.config, json),
        Commands::Analytics {
            channel,
            input,
            json,
        } => analytics_report(&cli.config, &channel, &input, json),
        Commands::Trends {
            limit,
            region,
            json,
        } => trends(&cli.config, limit, &region, json),
        Commands::Run(args) => run_pipeline(&cli.config, args),
        Commands::Visuals { input, output } => {
            if std::fs::metadata(&input)?.len() > 1_048_576 {
                bail!("plano visual excede 1 MB");
            }
            let plan = serde_json::from_slice(&std::fs::read(input)?)?;
            let report = framechester_adapters::editorial_visuals::prepare(&plan, &output)?;
            println!("{}", serde_json::to_string(&report)?);
            Ok(0)
        }
        Commands::Qa {
            video,
            format,
            json,
        } => qa_video(&cli.config, &video, format, json),
        Commands::BackupCheck { json } => backup_check(json),
        Commands::Backup {
            paths,
            yes,
            allow_remote,
            json,
        } => backup_snapshot(&paths, yes, allow_remote, json),
        Commands::Restore {
            snapshot,
            target,
            yes,
            allow_remote,
            json,
        } => backup_restore(&snapshot, &target, yes, allow_remote, json),
        Commands::Report { workdir, json } => report_command(&workdir, json),
        Commands::Finance(args) => finance_report(args),
    }
}

fn load_config(path: &Option<PathBuf>) -> anyhow::Result<Config> {
    let resolved = match path {
        Some(path) => Some(path.clone()),
        None => {
            let candidate = PathBuf::from("framechester.toml");
            candidate.is_file().then_some(candidate)
        }
    };
    Ok(Config::load_or_default(resolved.as_deref())?)
}

fn analytics_report(
    path: &Option<PathBuf>,
    channel: &str,
    input: &Path,
    json: bool,
) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    let profile = config
        .select_channel(Some(channel))?
        .context("analytics exige canal cadastrado")?;
    let snapshot: framechester_core::analytics::AnalyticsSnapshot =
        serde_json::from_slice(&std::fs::read(input)?)?;
    snapshot.validate_for_channel(&profile.id)?;
    let summary = snapshot.summarize()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
    } else {
        println!("Snapshot local informado pelo operador; dados nao verificados na plataforma");
        println!(
            "canal: {} | origem: {:?} | formato: {:?}",
            summary.channel_id, summary.source, summary.format
        );
        println!(
            "periodo: {} a {} | moeda: {}",
            summary.period_start, summary.period_end, summary.currency
        );
        println!(
            "views: {} | engaged views: {:?}",
            summary.views, summary.engaged_views
        );
        println!(
            "receita estimada (centavos): {:?} | recebida (centavos): {:?}",
            summary.estimated_revenue_cents, summary.paid_revenue_cents
        );
        println!(
            "RPM estimado (centavos): {:?} | base: {:?}",
            summary.estimated_rpm_cents, summary.rpm_view_basis
        );
        println!("None = desconhecido; fixture e simulacao nao comprovam receita ou elegibilidade");
    }
    Ok(0)
}

fn check_command(name: &str, args: &[&str], critical: bool) -> Check {
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

fn check_env(name: &str) -> Check {
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

fn doctor(path: &Option<PathBuf>, json: bool) -> anyhow::Result<i32> {
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

fn config_check(path: &Option<PathBuf>, json: bool) -> anyhow::Result<i32> {
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

fn trends(path: &Option<PathBuf>, limit: usize, region: &str, json: bool) -> anyhow::Result<i32> {
    let _config = load_config(path)?;
    let source = StaticTrendSource::sample();
    let signals = source.fetch(&TrendRequest {
        since: "2026-01-01".into(),
        region: region.into(),
        limit,
    })?;
    if json {
        println!("{}", serde_json::to_string_pretty(&signals)?);
    } else {
        println!("{:<6} {:<12} {:<48} bloqueios", "score", "serie", "titulo");
        for signal in &signals {
            println!(
                "{:<6.2} {:<12} {:<48} {}",
                signal.score,
                signal.topic.series,
                signal.topic.title,
                if signal.blocked_reasons.is_empty() {
                    "nenhum".to_string()
                } else {
                    signal.blocked_reasons.join("; ")
                }
            );
        }
    }
    Ok(0)
}

fn select_topic(args: &RunArgs) -> anyhow::Result<Topic> {
    if let Some(path) = &args.topic {
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("ler topico {}", path.display()))?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .with_context(|| format!("JSON invalido em {}", path.display()))?;
        if value.is_array() {
            let topics: Vec<Topic> = serde_json::from_value(value)?;
            return topics
                .get(args.topic_index)
                .cloned()
                .with_context(|| format!("indice {} fora da lista de topicos", args.topic_index));
        }
        return Ok(serde_json::from_value(value)?);
    }
    let source = StaticTrendSource::sample();
    let signals = source.fetch(&TrendRequest {
        since: "2026-01-01".into(),
        region: "BR".into(),
        limit: 10,
    })?;
    let signal = signals
        .get(args.topic_index)
        .with_context(|| format!("indice {} fora dos topicos disponiveis", args.topic_index))?;
    if !signal.blocked_reasons.is_empty() {
        bail!("topico bloqueado: {}", signal.blocked_reasons.join("; "));
    }
    Ok(signal.topic.clone())
}

fn build_llm(config: &Config, choice: Option<LlmArg>) -> anyhow::Result<Box<dyn LlmProvider>> {
    let provider = match choice {
        Some(LlmArg::Template) => "template",
        Some(LlmArg::Anthropic) => "anthropic",
        None => config.llm.provider.as_str(),
    };
    if provider == "anthropic" {
        Ok(Box::new(AnthropicLlm::from_config(&config.llm)?))
    } else {
        Ok(Box::new(TemplateLlm))
    }
}

fn run_pipeline(path: &Option<PathBuf>, args: RunArgs) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    let channel = config.select_channel(args.channel.as_deref())?;
    if args.script.is_none()
        && (matches!(args.llm, Some(LlmArg::Anthropic))
            || (args.llm.is_none() && config.llm.provider == "anthropic"))
    {
        eprintln!("Anthropic esta bloqueado ate existir cotacao e controle de custo; use --script para producao local");
    }
    if config.publish.enabled {
        eprintln!(
            "aviso: publish.enabled=true ignorado; publicacao real nao implementada (dry-run)"
        );
    }
    let format: ScriptFormat = args.format.map(Into::into).unwrap_or(ScriptFormat::Short);
    let max_scenes = args
        .max_scenes
        .unwrap_or_else(|| format.target_scene_count());
    if max_scenes == 0 {
        bail!("max_scenes deve ser maior que zero");
    }
    let workdir = args.workdir.clone().unwrap_or_else(|| {
        config
            .workdir_path()
            .join(format!("run-{}-{}", now_unix(), std::process::id()))
    });
    let voice = args
        .voice
        .clone()
        .unwrap_or_else(|| config.tts.voice_name.clone());
    let privacy: PublishPrivacy = args
        .privacy
        .map(Into::into)
        .unwrap_or(PublishPrivacy::Private);
    let topic = select_topic(&args)?;
    let budget = GenerationBudget {
        max_output_tokens: args.max_output_tokens,
        max_cost_cents: args.max_cost_cents,
    };
    let llm: Box<dyn LlmProvider> = match &args.script {
        Some(path) => Box::new(AuthoredScriptLlm::from_path(path)?),
        None => build_llm(&config, args.llm)?,
    };
    let assets: Box<dyn AssetProvider> = match &args.assets {
        Some(path) => Box::new(LocalAssetProvider::from_json_file(path)?),
        None => Box::new(SyntheticAssetProvider),
    };
    let mut tts_config = config.tts.clone();
    tts_config.voice_name = voice.clone();
    let tts = KokoroTts::new(&tts_config)?;
    let providers = PipelineProviders {
        trends: Box::new(StaticTrendSource::sample()),
        facts: Box::new(LocalEvidenceProvider),
        llm,
        assets,
        tts: Box::new(tts),
        renderer: Box::new(
            FfmpegRenderer::new(&config.render.ffmpeg_path, &config.render.ffprobe_path)
                .with_preview_watermark(args.preview_only),
        ),
        qa: Box::new({
            let qa = FfmpegQa::new(&config.render.ffmpeg_path, &config.render.ffprobe_path);
            if args.asr || config.asr.enabled {
                qa.with_asr(AsrOptions {
                    model: PathBuf::from(&config.asr.model),
                    language: config.asr.language.clone(),
                    min_coverage: config.asr.min_coverage,
                })
            } else {
                qa
            }
        }),
        publisher: Box::new(DryRunPublisher),
        metrics: Box::new(NullMetrics),
    };
    let pipeline = Pipeline::new(
        providers,
        PipelineOptions {
            channel,
            workdir: workdir.clone(),
            format,
            max_scenes,
            dry_run: true,
            voice,
            privacy,
            render_profile: config.render_profile_for(format),
            budget,
            burn_subtitles: args.burn_subtitles,
        },
    );
    let report = if args.preview_only {
        pipeline.preview(topic)?
    } else {
        pipeline.run(topic)?
    };
    write_html_report(&report, &report.artifacts_dir)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_report(&report);
        println!(
            "html: {}",
            report.artifacts_dir.join("report.html").display()
        );
    }
    Ok(if report.stage == Stage::Blocked { 2 } else { 0 })
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn html_class(status: QaStatus) -> &'static str {
    match status {
        QaStatus::Pass => "pass",
        QaStatus::Fail => "fail",
        QaStatus::NeedsHuman => "warn",
        QaStatus::Skipped => "skip",
    }
}

fn relative_link(path: &Path, workdir: &Path) -> String {
    path.strip_prefix(workdir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn qa_table(report: &QaReport) -> String {
    let rows = report
        .checks
        .iter()
        .map(|check| {
            format!(
                "<tr><td>{}</td><td><span class=\"badge {}\">{}</span></td><td>{}</td></tr>",
                html_escape(&check.name),
                html_class(check.status),
                qa_label(check.status),
                html_escape(&check.detail)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    format!(
        "<table><thead><tr><th>Checagem</th><th>Status</th><th>Detalhe</th></tr></thead><tbody>{rows}</tbody></table>"
    )
}

fn write_html_report(report: &PipelineReport, workdir: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(workdir)?;
    let title = report
        .script
        .as_ref()
        .map(|script| script.title.clone())
        .unwrap_or_else(|| report.topic_id.clone());
    let mut body = String::new();
    if let Some(channel) = &report.channel {
        body.push_str(&format!(
            "<p>Canal: <strong>{}</strong></p>",
            html_escape(&channel.id)
        ));
    }
    if let Some(script) = &report.script {
        body.push_str(&format!(
            "<p class=\"muted\">{} cenas | {:?} | serie {}</p>",
            script.scenes.len(),
            script.format,
            html_escape(&script.series)
        ));
    }
    if let Some(render) = &report.render {
        let video = relative_link(&render.path, workdir);
        body.push_str(&format!(
            "<section class=\"card\"><h2>Render</h2><p>{:.1}s | {}x{} | {} fps | {} KiB | sha256 {}</p>\
             <video controls preload=\"metadata\" src=\"{}\"></video>\
             <p><a href=\"{}\">abrir MP4</a></p></section>",
            render.duration_secs,
            render.width,
            render.height,
            render.fps,
            render.bytes / 1024,
            html_escape(&render.sha256),
            html_escape(&video),
            html_escape(&video)
        ));
    }
    if let Some(package) = &report.package {
        let thumbnail = package
            .thumbnail
            .as_ref()
            .map(|path| relative_link(path, workdir));
        let mut links = String::new();
        for (label, path) in [
            ("SRT", &package.subtitles),
            ("descricao", &package.description),
            ("metadata", &package.metadata),
            ("fontes", &package.sources),
        ] {
            let href = relative_link(path, workdir);
            links.push_str(&format!(
                "<li><a href=\"{}\">{}</a></li>",
                html_escape(&href),
                label
            ));
        }
        body.push_str(&format!(
            "<section class=\"card\"><h2>Pacote de publicacao</h2>{}<ul>{links}</ul></section>",
            thumbnail
                .as_ref()
                .map(|path| format!(
                    "<img class=\"thumb\" src=\"{}\" alt=\"thumbnail\">",
                    html_escape(path)
                ))
                .unwrap_or_default()
        ));
    }
    if let Some(qa) = &report.technical_qa {
        body.push_str(&format!(
            "<section class=\"card\"><h2>QA tecnico: <span class=\"badge {}\">{}</span></h2>{}</section>",
            html_class(qa.overall()),
            qa_label(qa.overall()),
            qa_table(qa)
        ));
    }
    if let Some(qa) = &report.editorial_qa {
        body.push_str(&format!(
            "<section class=\"card\"><h2>QA editorial: <span class=\"badge {}\">{}</span></h2>{}</section>",
            html_class(qa.overall()),
            qa_label(qa.overall()),
            qa_table(qa)
        ));
    }
    if let Some(publish) = &report.publish {
        body.push_str(&format!(
            "<section class=\"card\"><h2>Publicacao</h2><p>{:?} | dry_run={} | {}</p></section>",
            publish.status,
            publish.dry_run,
            html_escape(&publish.message)
        ));
    }
    if !report.warnings.is_empty() {
        let items = report
            .warnings
            .iter()
            .map(|warning| format!("<li>{}</li>", html_escape(warning)))
            .collect::<Vec<_>>()
            .join("");
        body.push_str(&format!(
            "<section class=\"card warn\"><h2>Avisos</h2><ul>{items}</ul></section>"
        ));
    }
    let html = format!(
        "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
         <title>Framechester - {title}</title><style>\
         :root{{color-scheme:dark}}body{{font-family:system-ui,sans-serif;margin:0;background:#0b1220;color:#e2e8f0}}\
         main{{max-width:1000px;margin:0 auto;padding:24px}}h1{{font-size:1.6rem;margin:0 0 4px}}\
         h2{{font-size:1.1rem;margin:0 0 12px}}.muted{{color:#94a3b8}}.card{{background:#111a2e;border:1px solid #1e3a5f;border-radius:12px;padding:16px;margin:16px 0}}\
         video,img.thumb{{width:100%;max-width:640px;border-radius:8px;display:block;margin:8px 0}}\
         table{{width:100%;border-collapse:collapse;font-size:.92rem}}th,td{{text-align:left;padding:6px;border-bottom:1px solid #1e293b;vertical-align:top}}\
         .badge{{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.78rem;font-weight:600}}\
         .pass{{background:#14532d;color:#bbf7d0}}.fail{{background:#7f1d1d;color:#fecaca}}.warn{{background:#78350f;color:#fde68a}}.skip{{background:#334155;color:#cbd5e1}}\
         a{{color:#7dd3fc}}footer{{color:#64748b;font-size:.8rem;margin:24px 0}}</style></head>\
         <body><main><h1>{title}</h1><p class=\"muted\">tema {} | etapa {:?}</p>{body}\
         <footer>Framechester | dry-run por padrao | nenhum upload real foi feito</footer></main></body></html>",
        html_escape(&report.topic_id),
        report.stage,
        title = html_escape(&title),
    );
    std::fs::write(workdir.join("report.html"), html)?;
    Ok(())
}

fn report_command(workdir: &Path, json: bool) -> anyhow::Result<i32> {
    let path = workdir.join("pipeline_report.json");
    let text = std::fs::read_to_string(&path)
        .with_context(|| format!("relatorio ausente: {}", path.display()))?;
    let report: PipelineReport = serde_json::from_str(&text)?;
    write_html_report(&report, workdir)?;
    let output = workdir.join("report.html");
    if json {
        println!("{}", serde_json::json!({"report": output}));
    } else {
        println!("html: {}", output.display());
    }
    Ok(0)
}

fn qa_label(status: QaStatus) -> &'static str {
    match status {
        QaStatus::Pass => "pass",
        QaStatus::Fail => "fail",
        QaStatus::NeedsHuman => "needs_human",
        QaStatus::Skipped => "skipped",
    }
}

fn print_qa(report: &QaReport) {
    println!("  geral: {}", qa_label(report.overall()));
    for check in &report.checks {
        println!(
            "  - {:<20} {:<12} {}",
            check.id,
            qa_label(check.status),
            check.detail
        );
    }
}

fn print_report(report: &PipelineReport) {
    if let Some(channel) = &report.channel {
        println!("canal: {}", channel.id);
    }
    println!("tema: {}", report.topic_id);
    println!("etapa: {:?}", report.stage);
    if let Some(script) = &report.script {
        println!(
            "roteiro: {} | {} cenas | {:?}",
            script.title,
            script.scenes.len(),
            script.format
        );
    }
    if let Some(render) = &report.render {
        println!(
            "render: {} | {:.1}s | {} KiB | sha256 {}",
            render.path.display(),
            render.duration_secs,
            render.bytes / 1024,
            &render.sha256[..12.min(render.sha256.len())]
        );
    }
    if let Some(qa) = &report.technical_qa {
        println!("qa tecnico:");
        print_qa(qa);
    }
    if let Some(qa) = &report.editorial_qa {
        println!("qa editorial:");
        print_qa(qa);
    }
    if let Some(package) = &report.package {
        println!(
            "pacote: srt {} | descricao {} | metadata {} | fontes {}",
            package.subtitles.display(),
            package.description.display(),
            package.metadata.display(),
            package.sources.display()
        );
        if let Some(thumbnail) = &package.thumbnail {
            println!("thumbnail: {}", thumbnail.display());
        }
    }
    if let Some(publish) = &report.publish {
        println!(
            "publicacao: {:?} | dry_run={} | {}",
            publish.status, publish.dry_run, publish.message
        );
    }
    for warning in &report.warnings {
        println!("aviso: {warning}");
    }
    println!(
        "relatorio: {}",
        report.artifacts_dir.join("pipeline_report.json").display()
    );
}

fn qa_video(
    path: &Option<PathBuf>,
    video: &Path,
    format: Option<FormatArg>,
    json: bool,
) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    if !video.is_file() {
        bail!("video inexistente: {}", video.display());
    }
    let profile = format
        .map(|format| config.render_profile_for(format.into()))
        .unwrap_or_else(|| config.render_profile());
    let output = inspect_output(&config.render.ffprobe_path, video, &profile)?;
    let qa = FfmpegQa::new(&config.render.ffmpeg_path, &config.render.ffprobe_path);
    let report = qa.technical(&output, &profile)?;
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "video": video,
                "output": output,
                "technical_qa": report,
            }))?
        );
    } else {
        println!(
            "video: {} | {:.1}s | {}x{}",
            video.display(),
            output.duration_secs,
            output.width,
            output.height
        );
        print_qa(&report);
    }
    Ok(match report.overall() {
        QaStatus::Fail => 2,
        QaStatus::NeedsHuman => 1,
        _ => 0,
    })
}

fn backup_check(json: bool) -> anyhow::Result<i32> {
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

fn backup_snapshot(
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

fn backup_restore(
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

fn finance_report(args: FinanceArgs) -> anyhow::Result<i32> {
    let input = FinanceInput {
        eligible: args.eligible,
        views_long: args.views_long,
        rpm_long_cents: args.rpm_long_cents,
        views_shorts: args.views_shorts,
        rpm_shorts_cents: args.rpm_shorts_cents,
        other_revenue_cents: args.other_revenue_cents,
        storage_provider: match args.provider {
            ProviderArg::B2 => StorageProvider::B2,
            ProviderArg::R2 => StorageProvider::R2,
        },
        storage_gb: args.storage_gb,
        usd_brl_cents: args.usd_brl_cents,
        additional_cost_cents: args.additional_cost_cents,
        taxes_basis_points: args.taxes_bp,
        own_hours: args.own_hours,
        hour_rate_cents: args.hour_rate_cents,
        economic_allocations_cents: args.economic_allocations_cents,
    };
    let report = finance::simulate(&input)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!(
            "backup:           {}",
            finance::format_brl(report.backup_cents as i64)
        );
        println!(
            "receita bruta:    {}",
            finance::format_brl(report.gross_revenue_cents as i64)
        );
        println!(
            "impostos:         {}",
            finance::format_brl(report.taxes_cents as i64)
        );
        println!(
            "custo caixa:      {}",
            finance::format_brl(report.cash_cost_cents as i64)
        );
        println!(
            "resultado caixa:  {}",
            finance::format_brl(report.cash_result_cents)
        );
        println!(
            "resultado econom.:{}",
            finance::format_brl(report.economic_result_cents)
        );
        match report.breakeven_long_views {
            Some(views) => println!("breakeven:        {views} views longas"),
            None => println!("breakeven:        nao elegivel ou rpm zero"),
        }
        println!("simulacao sem garantia de receita, elegibilidade ou aprovacao.");
    }
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_html_report_values() {
        let escaped = html_escape("<script>alert('x')</script> & \"y\"");
        assert!(!escaped.contains("<script>"));
        assert!(escaped.contains("&lt;script&gt;"));
        assert!(escaped.contains("&amp;"));
    }
}
