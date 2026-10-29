//! `report` and the console/HTML rendering shared with `run`.
use anyhow::Context;
use framechester_core::domain::{PipelineReport, QaReport, QaStatus};
use std::path::Path;

pub(crate) fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(crate) fn html_class(status: QaStatus) -> &'static str {
    match status {
        QaStatus::Pass => "pass",
        QaStatus::Fail => "fail",
        QaStatus::NeedsHuman => "warn",
        QaStatus::Skipped => "skip",
    }
}

pub(crate) fn relative_link(path: &Path, workdir: &Path) -> String {
    path.strip_prefix(workdir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

pub(crate) fn qa_table(report: &QaReport) -> String {
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

pub(crate) fn write_html_report(report: &PipelineReport, workdir: &Path) -> anyhow::Result<()> {
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

pub(crate) fn report_command(workdir: &Path, json: bool) -> anyhow::Result<i32> {
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

pub(crate) fn qa_label(status: QaStatus) -> &'static str {
    match status {
        QaStatus::Pass => "pass",
        QaStatus::Fail => "fail",
        QaStatus::NeedsHuman => "needs_human",
        QaStatus::Skipped => "skipped",
    }
}

pub(crate) fn print_qa(report: &QaReport) {
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

pub(crate) fn print_report(report: &PipelineReport) {
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
