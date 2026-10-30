//! Command-line surface: arguments, value enums and the dispatch to `commands`.
use crate::commands::analytics::analytics_report;
use crate::commands::backup::{backup_check, backup_restore, backup_snapshot};
use crate::commands::doctor::{config_check, doctor};
use crate::commands::finance::finance_report;
use crate::commands::produce::{plan_command, produce};
use crate::commands::qa::qa_video;
use crate::commands::report::report_command;
use crate::commands::run::run_pipeline;
use crate::commands::trends::trends;
use crate::commands::visuals::visuals;
use clap::{Parser, Subcommand, ValueEnum};
use framechester_core::config::Config;
use framechester_core::domain::{PublishPrivacy, ScriptFormat};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "framechester",
    version,
    about = "Framechester V4 - motor local de producao"
)]
pub(crate) struct Cli {
    #[arg(long, global = true, help = "caminho do framechester.toml")]
    pub(crate) config: Option<PathBuf>,
    #[command(subcommand)]
    pub(crate) command: Commands,
}

#[derive(Debug, Subcommand)]
pub(crate) enum Commands {
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
    #[command(about = "planeja o storyboard semantico de um roteiro autoral (sem TTS nem render)")]
    Plan(ProduceArgs),
    #[command(
        about = "produz um video explicativo animado: storyboard, narracao por segmento, render vetorial, mixagem e QA"
    )]
    Produce(ProduceArgs),
    #[command(about = "prepara visuais explicativos locais; nao usa API nem chaves")]
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
pub(crate) struct RunArgs {
    #[arg(
        long,
        conflicts_with = "llm",
        help = "roteiro JSON autoral vinculado ao topico; sem chamada de IA"
    )]
    pub(crate) script: Option<PathBuf>,
    #[arg(
        long,
        help = "manifesto JSON de imagens/videos locais com licenca, origem e SHA256"
    )]
    pub(crate) assets: Option<PathBuf>,
    #[arg(
        long,
        help = "id local cadastrado em [[channels]]; obrigatorio quando ha canais"
    )]
    pub(crate) channel: Option<String>,
    #[arg(long, help = "arquivo JSON com Topic ou lista de Topic")]
    pub(crate) topic: Option<PathBuf>,
    #[arg(long, default_value_t = 0)]
    pub(crate) topic_index: usize,
    #[arg(long, value_enum)]
    pub(crate) format: Option<FormatArg>,
    #[arg(long, help = "limite de cenas; padrao depende do formato")]
    pub(crate) max_scenes: Option<usize>,
    #[arg(long)]
    pub(crate) workdir: Option<PathBuf>,
    #[arg(long)]
    pub(crate) voice: Option<String>,
    #[arg(long, value_enum)]
    pub(crate) privacy: Option<PrivacyArg>,
    #[arg(long, value_enum)]
    pub(crate) llm: Option<LlmArg>,
    #[arg(
        long,
        default_value_t = 0,
        help = "orcamento em centavos; Anthropic bloqueado ate existir cotacao e controle de custo"
    )]
    pub(crate) max_cost_cents: u32,
    #[arg(long, default_value_t = 4000)]
    pub(crate) max_output_tokens: u32,
    #[arg(long, help = "roda QA ASR local com whisper; requer modelo")]
    pub(crate) asr: bool,
    #[arg(long, help = "queima legendas PT-BR no MP4 final")]
    pub(crate) burn_subtitles: bool,
    #[arg(
        long,
        requires = "script",
        help = "renderiza previa com marca de revisao; sem pacote ou publicacao"
    )]
    pub(crate) preview_only: bool,
    #[arg(
        long,
        value_enum,
        help = "legacy: imagens estaticas por cena (padrao); motion: storyboard semantico animado"
    )]
    pub(crate) engine: Option<EngineArg>,
    #[arg(long)]
    pub(crate) json: bool,
}

#[derive(Debug, Clone, clap::Args)]
pub(crate) struct ProduceArgs {
    #[arg(
        long,
        conflicts_with = "storyboard",
        help = "roteiro JSON autoral vinculado ao topico"
    )]
    pub(crate) script: Option<PathBuf>,
    #[arg(
        long,
        help = "storyboard JSON pronto (schema docs/schemas/storyboard.schema.json)"
    )]
    pub(crate) storyboard: Option<PathBuf>,
    #[arg(long, help = "arquivo JSON com Topic ou lista de Topic")]
    pub(crate) topic: Option<PathBuf>,
    #[arg(long, default_value_t = 0)]
    pub(crate) topic_index: usize,
    #[arg(
        long,
        help = "vertical (1080x1920), horizontal (1920x1080) ou x (1280x720)"
    )]
    pub(crate) format: Option<String>,
    #[arg(
        long,
        help = "id local cadastrado em [[channels]]; obrigatorio quando ha canais"
    )]
    pub(crate) channel: Option<String>,
    #[arg(long)]
    pub(crate) workdir: Option<PathBuf>,
    #[arg(long, help = "destino do storyboard em `plan`")]
    pub(crate) output: Option<PathBuf>,
    #[arg(long)]
    pub(crate) voice: Option<String>,
    #[arg(
        long,
        help = "renderiza previa com marca de revisao; sem aprovacao editorial nem pacote"
    )]
    pub(crate) preview_only: bool,
    #[arg(long)]
    pub(crate) json: bool,
}

#[derive(Debug, clap::Args)]
pub(crate) struct FinanceArgs {
    #[arg(long)]
    pub(crate) eligible: bool,
    #[arg(long, default_value_t = 0)]
    pub(crate) views_long: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) rpm_long_cents: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) views_shorts: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) rpm_shorts_cents: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) other_revenue_cents: u64,
    #[arg(long, value_enum, default_value = "b2")]
    pub(crate) provider: ProviderArg,
    #[arg(long, default_value_t = 50)]
    pub(crate) storage_gb: u64,
    #[arg(long, default_value_t = 534)]
    pub(crate) usd_brl_cents: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) additional_cost_cents: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) taxes_bp: u32,
    #[arg(long, default_value_t = 0)]
    pub(crate) own_hours: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) hour_rate_cents: u64,
    #[arg(long, default_value_t = 0)]
    pub(crate) economic_allocations_cents: u64,
    #[arg(long)]
    pub(crate) json: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub(crate) enum FormatArg {
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
pub(crate) enum PrivacyArg {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub(crate) enum EngineArg {
    Legacy,
    Motion,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub(crate) enum LlmArg {
    Template,
    Anthropic,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub(crate) enum ProviderArg {
    B2,
    R2,
}

pub(crate) fn run(cli: Cli) -> anyhow::Result<i32> {
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
        Commands::Plan(args) => plan_command(&cli.config, args),
        Commands::Produce(args) => produce(&cli.config, args),
        Commands::Visuals { input, output } => visuals(&input, &output),
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

pub(crate) fn load_config(path: &Option<PathBuf>) -> anyhow::Result<Config> {
    let resolved = match path {
        Some(path) => Some(path.clone()),
        None => {
            let candidate = PathBuf::from("framechester.toml");
            candidate.is_file().then_some(candidate)
        }
    };
    Ok(Config::load_or_default(resolved.as_deref())?)
}
