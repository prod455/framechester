//! The run report the Studio reads after `produce`: `pipeline_report.json` in the workdir.
use crate::domain::PipelineReport;
use crate::error::Result;
use std::path::Path;

pub fn write_report(workdir: &Path, report: &PipelineReport) -> Result<()> {
    std::fs::create_dir_all(workdir)?;
    let path = workdir.join("pipeline_report.json");
    let text = serde_json::to_string_pretty(report)?;
    std::fs::write(path, text)?;
    Ok(())
}
