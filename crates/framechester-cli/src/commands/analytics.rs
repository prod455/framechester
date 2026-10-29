//! `analytics`: scores a local snapshot per channel; never queries YouTube.
use crate::cli::load_config;
use anyhow::Context;
use std::path::{Path, PathBuf};

pub(crate) fn analytics_report(
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
