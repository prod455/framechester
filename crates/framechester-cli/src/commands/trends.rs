//! `trends`: lists and scores the local topic fixture.
use crate::cli::load_config;
use framechester_adapters::fixtures::StaticTrendSource;
use framechester_core::ports::{TrendRequest, TrendSource};
use std::path::PathBuf;

pub(crate) fn trends(
    path: &Option<PathBuf>,
    limit: usize,
    region: &str,
    json: bool,
) -> anyhow::Result<i32> {
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
