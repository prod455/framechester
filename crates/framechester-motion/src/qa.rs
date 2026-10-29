//! Automated quality gate for a motion render: layout (overflow, intersections, safe
//! areas), semantic motion (every scene changes visibly, no long stills), media integrity
//! (codec, resolution, fps, duration, black frames, freezes), audio (loudness, true
//! peak, silence, clipping), caption sync and storyboard consistency. Critical failures
//! are `Fail` and block approval; the report is also written as JSON.
use crate::audio::LoudnessTarget;
use crate::components::{LayoutIssue, Severity};
use crate::compose::Composed;
use framechester_core::domain::{QaCheck, QaReport, QaStatus};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::storyboard::{narration_words, Storyboard};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

fn check(id: &str, name: &str, status: QaStatus, detail: impl Into<String>) -> QaCheck {
    QaCheck {
        id: id.into(),
        name: name.into(),
        status,
        detail: detail.into(),
    }
}

fn pass_or_fail(ok: bool) -> QaStatus {
    if ok {
        QaStatus::Pass
    } else {
        QaStatus::Fail
    }
}

/// Everything the gate needs besides the storyboard and the composed scenes.
pub struct QaInput<'a> {
    pub ffmpeg: &'a str,
    pub ffprobe: &'a str,
    pub video: &'a Path,
    pub srt: &'a Path,
    pub contact_sheet: &'a Path,
    pub target: LoudnessTarget,
    pub expected_fps: u32,
    pub expected_codec: &'a str,
}

#[derive(Debug, Clone, Serialize)]
pub struct QaDocument {
    pub video: String,
    pub overall: QaStatus,
    pub blocking: Vec<String>,
    pub checks: Vec<QaCheck>,
    pub layout_issues: Vec<LayoutIssue>,
    pub scenes: Vec<SceneQa>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SceneQa {
    pub id: u32,
    pub kind: String,
    pub start_secs: f32,
    pub duration_secs: f32,
    pub visual_changes: usize,
    pub longest_still_secs: f32,
    pub caption_chunks: usize,
}

fn run(program: &str, args: &[&str]) -> Result<std::process::Output> {
    Command::new(program).args(args).output().map_err(|error| {
        FramechesterError::Unavailable(format!("falha ao executar {program}: {error}"))
    })
}

fn stderr_of(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

/// Parses `key: value` pairs printed by ffmpeg filters (ebur128 summary, astats).
fn metric(text: &str, key: &str) -> Option<f32> {
    text.lines()
        .filter_map(|line| {
            let at = line.find(key)?;
            let rest = line[at + key.len()..].trim_start();
            let rest = rest.strip_prefix(':')?.trim();
            rest.split_whitespace().next()?.parse::<f32>().ok()
        })
        .next_back()
}

fn layout_checks(composed: &Composed) -> (Vec<QaCheck>, Vec<LayoutIssue>) {
    let issues: Vec<LayoutIssue> = composed.issues().into_iter().cloned().collect();
    let mut checks = Vec::new();
    for code in [
        "text_overflow",
        "code_overflow",
        "caption_overflow",
        "outside_safe_area",
        "text_intersection",
    ] {
        let hits: Vec<&LayoutIssue> = issues.iter().filter(|issue| issue.code == code).collect();
        let critical = hits
            .iter()
            .any(|issue| issue.severity == Severity::Critical);
        let name = match code {
            "text_overflow" => "textos cabem sem truncar",
            "code_overflow" => "codigo cabe na janela",
            "caption_overflow" => "legendas cabem na faixa",
            "outside_safe_area" => "textos dentro das areas seguras",
            _ => "textos nao se sobrepoem",
        };
        checks.push(check(
            &format!("layout_{code}"),
            name,
            if hits.is_empty() {
                QaStatus::Pass
            } else if critical {
                QaStatus::Fail
            } else {
                QaStatus::NeedsHuman
            },
            if hits.is_empty() {
                "ok".to_string()
            } else {
                hits.iter()
                    .take(3)
                    .map(|issue| format!("cena {}: {}", issue.scene_id, issue.detail))
                    .collect::<Vec<_>>()
                    .join(" | ")
            },
        ));
    }
    (checks, issues)
}

fn motion_checks(storyboard: &Storyboard, composed: &Composed) -> (Vec<QaCheck>, Vec<SceneQa>) {
    let mut checks = Vec::new();
    let mut scenes = Vec::new();
    let mut still_failures = Vec::new();
    let mut change_failures = Vec::new();
    for (scene, composed_scene) in storyboard.scenes.iter().zip(&composed.scenes) {
        let mut times: Vec<f32> = composed_scene
            .change_times
            .iter()
            .copied()
            .filter(|t| *t <= scene.duration_secs)
            .collect();
        times.insert(0, 0.0);
        times.push(scene.duration_secs);
        let longest = times
            .windows(2)
            .map(|pair| pair[1] - pair[0])
            .fold(0.0f32, f32::max);
        let changes = composed_scene.change_times.len();
        let chunks =
            crate::captions::chunk_words(scene, if composed.canvas.vertical { 5 } else { 7 }).len();
        if longest > scene.validation.max_still_secs + 0.01
            && composed_scene.graph.breathe.is_none()
        {
            still_failures.push(format!(
                "cena {}: {longest:.1}s sem mudanca (limite {:.1}s)",
                scene.id, scene.validation.max_still_secs
            ));
        }
        if changes < scene.validation.min_visual_changes.max(1) {
            change_failures.push(format!(
                "cena {}: {changes} mudanca(s) visual(is); minimo {}",
                scene.id,
                scene.validation.min_visual_changes.max(1)
            ));
        }
        scenes.push(SceneQa {
            id: scene.id,
            kind: scene.composition.kind_name().to_string(),
            start_secs: scene.start_secs,
            duration_secs: scene.duration_secs,
            visual_changes: changes,
            longest_still_secs: longest,
            caption_chunks: chunks,
        });
    }
    checks.push(check(
        "semantic_motion",
        "cada cena anima o que a narracao explica",
        pass_or_fail(change_failures.is_empty()),
        if change_failures.is_empty() {
            "ok".into()
        } else {
            change_failures.join(" | ")
        },
    ));
    checks.push(check(
        "long_still",
        "sem trechos parados alem do limite da cena",
        pass_or_fail(still_failures.is_empty()),
        if still_failures.is_empty() {
            "ok".into()
        } else {
            still_failures.join(" | ")
        },
    ));
    (checks, scenes)
}

fn consistency_checks(storyboard: &Storyboard) -> Vec<QaCheck> {
    let mut checks = Vec::new();
    let mut mismatches = Vec::new();
    let mut missing_resources = Vec::new();
    for scene in &storyboard.scenes {
        let spoken: Vec<String> = scene
            .segments
            .iter()
            .flat_map(|segment| narration_words(&segment.text))
            .collect();
        if spoken != narration_words(&scene.narration) {
            mismatches.push(format!(
                "cena {}: narracao gravada difere do roteiro",
                scene.id
            ));
        }
        for resource in scene.resources.iter().filter(|resource| !resource.optional) {
            missing_resources.push(format!(
                "cena {}: recurso obrigatorio '{}' ({}) nao foi fornecido",
                scene.id, resource.id, resource.description
            ));
        }
    }
    checks.push(check(
        "script_scene_consistency",
        "narracao gravada corresponde ao roteiro de cada cena",
        pass_or_fail(mismatches.is_empty()),
        if mismatches.is_empty() {
            format!("{} cenas conferidas", storyboard.scenes.len())
        } else {
            mismatches.join(" | ")
        },
    ));
    checks.push(check(
        "required_resources",
        "recursos obrigatorios presentes",
        pass_or_fail(missing_resources.is_empty()),
        if missing_resources.is_empty() {
            "nenhum recurso externo exigido".into()
        } else {
            missing_resources.join(" | ")
        },
    ));
    checks
}

fn caption_checks(storyboard: &Storyboard, srt: &Path) -> Vec<QaCheck> {
    let text = std::fs::read_to_string(srt).unwrap_or_default();
    let mut cues: Vec<(f32, f32)> = Vec::new();
    for block in text.split("\n\n") {
        let Some(line) = block.lines().nth(1) else {
            continue;
        };
        let Some((start, end)) = line.split_once("-->") else {
            continue;
        };
        let parse = |value: &str| -> Option<f32> {
            let value = value.trim().replace(',', ".");
            let mut parts = value.split(':');
            let h: f32 = parts.next()?.parse().ok()?;
            let m: f32 = parts.next()?.parse().ok()?;
            let s: f32 = parts.next()?.parse().ok()?;
            Some(h * 3600.0 + m * 60.0 + s)
        };
        if let (Some(start), Some(end)) = (parse(start), parse(end)) {
            cues.push((start, end));
        }
    }
    let total = storyboard.total_duration_secs();
    let overlapping = cues
        .windows(2)
        .filter(|pair| pair[0].1 > pair[1].0 + 0.001)
        .count();
    let outside = cues
        .iter()
        .filter(|(start, end)| *start < -0.001 || *end > total + 0.05)
        .count();
    let expected_visible = storyboard
        .scenes
        .iter()
        .filter(|scene| !scene.captions.hidden)
        .count();
    let mut checks = vec![check(
        "captions_present",
        "legendas geradas para as cenas narradas",
        pass_or_fail(cues.len() >= expected_visible || expected_visible == 0),
        format!("{} legendas", cues.len()),
    )];
    checks.push(check(
        "captions_sync",
        "legendas em ordem, sem sobreposicao e dentro do video",
        pass_or_fail(overlapping == 0 && outside == 0),
        format!("{overlapping} sobrepostas, {outside} fora do video de {total:.1}s"),
    ));
    checks
}

fn media_checks(
    input: &QaInput<'_>,
    storyboard: &Storyboard,
    composed: &Composed,
) -> Result<Vec<QaCheck>> {
    let mut checks = Vec::new();
    let video = input.video.to_string_lossy().to_string();
    if !input.video.is_file() {
        checks.push(check(
            "file",
            "arquivo de video existe",
            QaStatus::Fail,
            video,
        ));
        return Ok(checks);
    }
    let probe = framechester_adapters_free_probe(input.ffprobe, input.video)?;
    let (width, height) = composed.canvas.format.dimensions();
    let stream = |kind: &str| -> Option<&serde_json::Value> {
        probe
            .get("streams")?
            .as_array()?
            .iter()
            .find(|stream| stream.get("codec_type").and_then(|v| v.as_str()) == Some(kind))
    };
    let video_stream = stream("video");
    let (got_w, got_h) = video_stream
        .map(|s| {
            (
                s.get("width").and_then(|v| v.as_u64()).unwrap_or(0),
                s.get("height").and_then(|v| v.as_u64()).unwrap_or(0),
            )
        })
        .unwrap_or((0, 0));
    checks.push(check(
        "resolution",
        "resolucao do formato",
        pass_or_fail(got_w == width as u64 && got_h == height as u64),
        format!("{got_w}x{got_h}, esperado {width}x{height}"),
    ));
    let fps = video_stream
        .and_then(|s| s.get("avg_frame_rate"))
        .and_then(|v| v.as_str())
        .and_then(|value| {
            let (n, d) = value.split_once('/')?;
            let n: f32 = n.parse().ok()?;
            let d: f32 = d.parse().ok()?;
            (d != 0.0).then_some(n / d)
        })
        .unwrap_or(0.0);
    checks.push(check(
        "fps",
        "fps do perfil",
        pass_or_fail((fps - input.expected_fps as f32).abs() < 0.6),
        format!("{fps:.2}, esperado {}", input.expected_fps),
    ));
    let codec = video_stream
        .and_then(|s| s.get("codec_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    checks.push(check(
        "codec",
        "codec de video",
        pass_or_fail(codec == input.expected_codec),
        format!("{codec}, esperado {}", input.expected_codec),
    ));
    let audio_codec = stream("audio")
        .and_then(|s| s.get("codec_name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    checks.push(check(
        "audio_stream",
        "stream de audio AAC presente",
        pass_or_fail(audio_codec == "aac"),
        format!("{audio_codec}, esperado aac"),
    ));
    let duration: f32 = probe
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|v| v.as_str())
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(0.0);
    let expected = storyboard.total_duration_secs();
    checks.push(check(
        "duration",
        "duracao igual ao storyboard",
        pass_or_fail((duration - expected).abs() <= 0.6),
        format!("{duration:.2}s, storyboard {expected:.2}s"),
    ));
    let decode = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-v",
            "error",
            "-i",
            &video,
            "-f",
            "null",
            "-",
        ],
    )?;
    checks.push(check(
        "decode",
        "decodificacao completa",
        pass_or_fail(decode.status.success() && stderr_of(&decode).trim().is_empty()),
        if decode.status.success() {
            "ok".into()
        } else {
            stderr_of(&decode).chars().take(200).collect::<String>()
        },
    ));
    let black = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-nostats",
            "-i",
            &video,
            "-vf",
            "blackdetect=d=0.4:pix_th=0.08",
            "-an",
            "-f",
            "null",
            "-",
        ],
    )?;
    if !black.status.success() {
        return Err(FramechesterError::External("blackdetect falhou".into()));
    }
    let black_hits = stderr_of(&black).matches("black_start").count();
    checks.push(check(
        "black",
        "sem frames pretos",
        pass_or_fail(black_hits == 0),
        format!("{black_hits} trecho(s) preto(s)"),
    ));
    let max_still = storyboard
        .scenes
        .iter()
        .map(|scene| scene.validation.max_still_secs)
        .fold(5.0f32, f32::max);
    let freeze_filter = format!("freezedetect=n=0.0005:d={max_still:.1}");
    let freeze = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-nostats",
            "-i",
            &video,
            "-vf",
            &freeze_filter,
            "-an",
            "-f",
            "null",
            "-",
        ],
    )?;
    if !freeze.status.success() {
        return Err(FramechesterError::External("freezedetect falhou".into()));
    }
    let freeze_hits = stderr_of(&freeze).matches("freeze_start").count();
    checks.push(check(
        "freeze",
        "sem imagem congelada alem do limite",
        pass_or_fail(freeze_hits == 0),
        format!("{freeze_hits} congelamento(s) acima de {max_still:.1}s"),
    ));
    // Loudness, true peak, silence and clipping from one analysis pass each.
    let ebur = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-nostats",
            "-i",
            &video,
            "-af",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
    )?;
    let ebur_text = stderr_of(&ebur);
    let integrated = ebur_text
        .rsplit("Integrated loudness:")
        .next()
        .and_then(|tail| metric(tail, "I"));
    let true_peak = ebur_text
        .rsplit("True peak:")
        .next()
        .and_then(|tail| metric(tail, "Peak"));
    let target = input.target;
    checks.push(check(
        "loudness",
        &format!(
            "loudness integrada em {:.0} LUFS (±1 LU)",
            target.integrated_lufs
        ),
        match integrated {
            Some(value) if (value - target.integrated_lufs).abs() <= 1.0 => QaStatus::Pass,
            Some(_) => QaStatus::Fail,
            None => QaStatus::Fail,
        },
        integrated
            .map(|value| format!("{value:.1} LUFS"))
            .unwrap_or_else(|| "ebur128 sem leitura".into()),
    ));
    checks.push(check(
        "true_peak",
        &format!("true peak ate {:.1} dBTP", target.true_peak_dbtp),
        match true_peak {
            Some(value) if value <= target.true_peak_dbtp + 0.2 => QaStatus::Pass,
            Some(_) => QaStatus::Fail,
            None => QaStatus::Fail,
        },
        true_peak
            .map(|value| format!("{value:.1} dBTP"))
            .unwrap_or_else(|| "ebur128 sem leitura de pico".into()),
    ));
    let silence = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-nostats",
            "-i",
            &video,
            "-af",
            "silencedetect=n=-45dB:d=2.5",
            "-f",
            "null",
            "-",
        ],
    )?;
    let silence_hits = stderr_of(&silence).matches("silence_start").count();
    checks.push(check(
        "silence",
        "sem silencios longos",
        pass_or_fail(silence_hits == 0),
        format!("{silence_hits} silencio(s) acima de 2,5s"),
    ));
    let stats = run(
        input.ffmpeg,
        &[
            "-hide_banner",
            "-nostats",
            "-i",
            &video,
            "-af",
            "astats=measure_perchannel=none:measure_overall=Peak_level+Flat_factor",
            "-f",
            "null",
            "-",
        ],
    )?;
    let stats_text = stderr_of(&stats);
    let peak_level = metric(&stats_text, "Peak level dB");
    let flat = metric(&stats_text, "Flat factor").unwrap_or(0.0);
    checks.push(check(
        "clipping",
        "sem clipping de audio",
        pass_or_fail(peak_level.is_some_and(|peak| peak < -0.3) && flat < 1.0),
        format!(
            "pico {} dBFS, flat factor {flat:.2}",
            peak_level
                .map(|p| format!("{p:.2}"))
                .unwrap_or_else(|| "?".into())
        ),
    ));
    let loud_enough = integrated.is_some_and(|value| value > -30.0);
    checks.push(check(
        "audio_level",
        "audio audivel",
        pass_or_fail(loud_enough),
        integrated
            .map(|v| format!("{v:.1} LUFS"))
            .unwrap_or_else(|| "sem leitura".into()),
    ));
    checks.push(check(
        "contact_sheet",
        "contact sheet gerado",
        pass_or_fail(input.contact_sheet.is_file()),
        input.contact_sheet.display().to_string(),
    ));
    Ok(checks)
}

fn framechester_adapters_free_probe(ffprobe: &str, path: &Path) -> Result<serde_json::Value> {
    let output = run(
        ffprobe,
        &[
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path.to_string_lossy(),
        ],
    )?;
    if !output.status.success() {
        return Err(FramechesterError::External(format!(
            "ffprobe: {}",
            stderr_of(&output).chars().take(200).collect::<String>()
        )));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| FramechesterError::External(format!("ffprobe json invalido: {error}")))
}

/// Runs the whole gate. Media checks need FFmpeg; layout and storyboard checks do not.
pub fn audit(
    storyboard: &Storyboard,
    composed: &Composed,
    input: &QaInput<'_>,
) -> Result<QaDocument> {
    let (mut checks, layout_issues) = layout_checks(composed);
    let (motion, scenes) = motion_checks(storyboard, composed);
    checks.extend(motion);
    checks.extend(consistency_checks(storyboard));
    checks.extend(caption_checks(storyboard, input.srt));
    checks.extend(media_checks(input, storyboard, composed)?);
    let report = QaReport::new(checks.clone());
    let blocking = checks
        .iter()
        .filter(|check| check.status == QaStatus::Fail)
        .map(|check| format!("{}: {}", check.name, check.detail))
        .collect();
    Ok(QaDocument {
        video: input.video.display().to_string(),
        overall: report.overall(),
        blocking,
        checks,
        layout_issues,
        scenes,
    })
}

impl QaDocument {
    pub fn report(&self) -> QaReport {
        QaReport::new(self.checks.clone())
    }

    pub fn write(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_filter_metrics() {
        let text = "  Integrated loudness:\n    I:         -14.2 LUFS\n    Threshold: -24.8 LUFS\n  True peak:\n    Peak:       -1.6 dBFS\n";
        assert_eq!(
            text.rsplit("Integrated loudness:")
                .next()
                .and_then(|t| metric(t, "I")),
            Some(-14.2)
        );
        assert_eq!(
            text.rsplit("True peak:")
                .next()
                .and_then(|t| metric(t, "Peak")),
            Some(-1.6)
        );
        assert_eq!(
            metric(
                "[Parsed_astats_0 @ 0x1] Peak level dB: -1.52\n[x] Flat factor: 0.000000",
                "Flat factor"
            ),
            Some(0.0)
        );
    }
}
