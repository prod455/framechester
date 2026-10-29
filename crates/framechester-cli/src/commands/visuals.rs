//! `visuals`: explanatory PNGs from a scene plan; no API, no TTS, no paid service.
use anyhow::bail;
use framechester_adapters::editorial_visuals::{self, VisualPlan};
use std::path::Path;

pub(crate) fn visuals(input: &Path, output: &Path) -> anyhow::Result<i32> {
    if std::fs::metadata(input)?.len() > 1_048_576 {
        bail!("plano visual excede 1 MB");
    }
    let plan: VisualPlan = serde_json::from_slice(&std::fs::read(input)?)?;
    let report = editorial_visuals::prepare(&plan, output)?;
    println!("{}", serde_json::to_string(&report)?);
    Ok(0)
}
