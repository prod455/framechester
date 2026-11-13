//! Command-line surface: arguments, value enums and the dispatch to `commands`.
use crate::commands::analytics::analytics_report;
use crate::commands::doctor::{config_check, doctor};
use crate::commands::hyperframes::{confronto, internacionais, ConfrontoArgs, InternacionaisArgs};
use crate::commands::produce::{plan_command, produce, short};
use crate::commands::qa::qa_video;
use crate::commands::report::report_command;
use crate::commands::run::run_pipeline;
use clap::{Parser, Subcommand, ValueEnum};
use framechester_core::config::Config;
use framechester_core::domain::ScriptFormat;
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
    #[command(about = "produz o video com o motor animado (atalho de produce usado pelo Studio)")]
    Run(RunArgs),
    #[command(about = "planeja o storyboard semantico de um roteiro autoral (sem TTS nem render)")]
    Plan(ProduceArgs),
    #[command(
        about = "produz um video explicativo animado: storyboard, narracao por segmento, render vetorial, mixagem e QA"
    )]
    Produce(ProduceArgs),
    #[command(
        about = "divide um video ja narrado em Shorts verticais: partes seguidas ate o limite, cada uma aberta pelo gancho"
    )]
    Short(ShortArgs),
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
    #[command(
        about = "video de confronto em numeros pelo HyperFrames: projeto, render, QA tecnico e manifesto"
    )]
    Confronto(ConfrontoArgs),
    #[command(
        about = "gera o JSON de confronto de duas selecoes a partir do CSV international_results (CC0)"
    )]
    Internacionais(InternacionaisArgs),
    #[command(about = "gera report.html a partir de pipeline_report.json")]
    Report {
        #[arg(long)]
        workdir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, clap::Args)]
pub(crate) struct RunArgs {
    #[arg(long, help = "roteiro JSON autoral vinculado ao topico")]
    pub(crate) script: PathBuf,
    #[arg(long, help = "arquivo JSON com Topic ou lista de Topic")]
    pub(crate) topic: PathBuf,
    #[arg(long, default_value_t = 0)]
    pub(crate) topic_index: usize,
    #[arg(
        long,
        help = "id local cadastrado em [[channels]]; obrigatorio quando ha canais"
    )]
    pub(crate) channel: Option<String>,
    #[arg(long, value_enum, help = "short (vertical) ou long (horizontal)")]
    pub(crate) format: Option<FormatArg>,
    #[arg(long)]
    pub(crate) workdir: Option<PathBuf>,
    #[arg(long)]
    pub(crate) voice: Option<String>,
    #[arg(long, help = "renderiza previa com marca de revisao; sem pacote")]
    pub(crate) preview_only: bool,
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
    #[arg(
        long,
        help = "slug do episodio; grava em channels/<canal>/episodes/<slug> sem sobrescrever outros episodios"
    )]
    pub(crate) episode: Option<String>,
    #[arg(long)]
    pub(crate) workdir: Option<PathBuf>,
    #[arg(long, help = "destino do storyboard em `plan`")]
    pub(crate) output: Option<PathBuf>,
    #[arg(long)]
    pub(crate) voice: Option<String>,
    #[arg(
        long,
        help = "visual: noite, papel ou planta; sem ele vale o do storyboard, depois o do canal"
    )]
    pub(crate) look: Option<String>,
    #[arg(
        long,
        help = "renderiza previa com marca de revisao; sem aprovacao editorial nem pacote"
    )]
    pub(crate) preview_only: bool,
    #[arg(long)]
    pub(crate) json: bool,
}

#[derive(Debug, clap::Args)]
pub(crate) struct ShortArgs {
    #[arg(
        long,
        help = "storyboard.json narrado de um video pronto (pasta do trabalho)"
    )]
    pub(crate) from: PathBuf,
    #[arg(long, default_value_t = framechester_core::shorts::DEFAULT_MAX_SECS, help = "duracao maxima em segundos")]
    pub(crate) max_secs: f32,
    #[arg(long, default_value_t = 1, value_parser = clap::value_parser!(u32).range(1..), help = "qual parte produzir, a partir de 1")]
    pub(crate) part: u32,
    #[arg(
        long,
        help = "so lista as partes (cenas e duracao), sem narrar nem renderizar"
    )]
    pub(crate) list: bool,
    #[arg(
        long,
        help = "id local cadastrado em [[channels]]; obrigatorio quando ha canais"
    )]
    pub(crate) channel: Option<String>,
    #[arg(long)]
    pub(crate) workdir: Option<PathBuf>,
    #[arg(long)]
    pub(crate) voice: Option<String>,
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

pub(crate) fn run(cli: Cli) -> anyhow::Result<i32> {
    match cli.command {
        Commands::Doctor { json } => doctor(&cli.config, json),
        Commands::ConfigCheck { json } => config_check(&cli.config, json),
        Commands::Analytics {
            channel,
            input,
            json,
        } => analytics_report(&cli.config, &channel, &input, json),
        Commands::Run(args) => run_pipeline(&cli.config, args),
        Commands::Plan(args) => plan_command(&cli.config, args),
        Commands::Produce(args) => produce(&cli.config, args),
        Commands::Short(args) => short(&cli.config, args),
        Commands::Qa {
            video,
            format,
            json,
        } => qa_video(&cli.config, &video, format, json),
        Commands::Confronto(args) => confronto(&cli.config, args),
        Commands::Internacionais(args) => internacionais(&cli.config, args).or_else(|error| {
            eprintln!("erro: {error:#}");
            Ok(crate::commands::hyperframes::EXIT_ERROR)
        }),
        Commands::Report { workdir, json } => report_command(&workdir, json),
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
