//! Original explanatory graphics. External SVG, HTML, images and URLs are never loaded.
use crate::scene_layout::{self, SceneLayout};
use framechester_core::domain::{Scene, ScriptFormat};
use framechester_core::error::{FramechesterError, Result};
use resvg::{tiny_skia, usvg};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Deserialize)]
pub struct VisualPlan {
    pub channel: String,
    pub title: String,
    pub format: ScriptFormat,
    pub scenes: Vec<Scene>,
}

#[derive(Debug, Serialize)]
pub struct PreparedVisual {
    pub scene_id: u32,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VisualReport {
    pub renderer: &'static str,
    pub width: u32,
    pub height: u32,
    pub scenes: Vec<PreparedVisual>,
}

pub fn requires_capture(brief: &str) -> bool {
    let lower = brief.to_lowercase();
    [
        "captura pendente",
        "gravação real",
        "gravacao real",
        "gravação de tela",
        "gravacao de tela",
        "screen recording",
        "captura real",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn xml(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control() || c.is_whitespace())
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn text_width(text: &str, size: f32, bold: bool, options: &usvg::Options) -> Result<f32> {
    let weight = if bold { 700 } else { 400 };
    let svg = format!("<svg xmlns='http://www.w3.org/2000/svg' width='20000' height='500'><text x='0' y='200' font-family='{}' font-size='{size}' font-weight='{weight}'>{}</text></svg>", xml(&options.font_family), xml(text));
    let tree = usvg::Tree::from_str(&svg, options)
        .map_err(|error| FramechesterError::External(error.to_string()))?;
    Ok(tree.root().abs_bounding_box().width())
}

fn wrap(
    text: &str,
    size: f32,
    width: f32,
    lines: usize,
    bold: bool,
    options: &usvg::Options,
) -> Result<Vec<String>> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut truncated = false;
    for word in text.split_whitespace() {
        let candidate = if current.is_empty() {
            word.to_owned()
        } else {
            format!("{current} {word}")
        };
        if text_width(&candidate, size, bold, options)? <= width {
            current = candidate;
        } else if !current.is_empty() {
            result.push(std::mem::take(&mut current));
            if result.len() == lines {
                truncated = true;
                break;
            }
            current = word.to_owned();
        } else {
            for character in word.chars() {
                let candidate = format!("{current}{character}");
                if text_width(&candidate, size, bold, options)? > width && !current.is_empty() {
                    result.push(std::mem::take(&mut current));
                    if result.len() == lines {
                        truncated = true;
                        break;
                    }
                }
                current.push(character);
            }
            if truncated {
                break;
            }
        }
    }
    if !current.is_empty() && result.len() < lines {
        result.push(current);
    }
    if truncated {
        if let Some(last) = result.last_mut() {
            while !last.is_empty() && text_width(&format!("{last}…"), size, bold, options)? > width
            {
                last.pop();
            }
            last.push('…');
        }
    }
    // A long token starting after a line break must also fit the same bounds.
    for line in &mut result {
        if text_width(line, size, bold, options)? > width {
            while !line.is_empty() && text_width(&format!("{line}…"), size, bold, options)? > width
            {
                line.pop();
            }
            line.push('…');
        }
    }
    Ok(result)
}

fn text(svg: &mut String, lines: &[String], x: f32, y: f32, size: f32, color: &str, bold: bool) {
    let weight = if bold { 700 } else { 400 };
    for (index, line) in lines.iter().enumerate() {
        svg.push_str(&format!("<text x='{x}' y='{}' font-size='{size}' font-weight='{weight}' fill='{color}'>{}</text>", y + index as f32 * size * 1.25, xml(line)));
    }
}

// Dark editorial theme shared by every layout; see docs/GUIA_VISUAL.md.
const BACKGROUND: &str = "#0B0F17";
const RULE: &str = "#243041";
const INK: &str = "#EEF2F8";
const MUTED: &str = "#8C99AE";
const ACCENT: &str = "#F2B544";

/// Lowest baseline of a block that starts at `top` (its first baseline is `top + size`).
fn bottom_of(top: f32, size: f32, lines: usize) -> f32 {
    top + size + (lines.max(1) - 1) as f32 * size * 1.25
}

/// Draws `content` below `top` at the largest size from `max` down to `min` whose
/// wrapped height stays above `bottom`. At `min` the text is cut with an ellipsis
/// instead of overflowing into the caption band. Returns the lowest baseline.
#[allow(clippy::too_many_arguments)]
fn fit(
    svg: &mut String,
    content: &str,
    x: f32,
    top: f32,
    width: f32,
    bottom: f32,
    max: f32,
    min: f32,
    color: &str,
    bold: bool,
    options: &usvg::Options,
) -> Result<f32> {
    let mut size = max;
    loop {
        let unlimited = wrap(content, size, width, 64, bold, options)?;
        if bottom_of(top, size, unlimited.len()) + size * 0.3 <= bottom || size <= min {
            let lines = (((bottom - top - size * 0.3 - size) / (size * 1.25)).floor() as usize + 1)
                .max(1)
                .min(unlimited.len().max(1));
            let wrapped = wrap(content, size, width, lines, bold, options)?;
            text(svg, &wrapped, x, top + size, size, color, bold);
            return Ok(bottom_of(top, size, wrapped.len()));
        }
        size = (size - 6.0).max(min);
    }
}

struct Frame {
    vertical: bool,
    margin: f32,
    width: f32,
    top: f32,
    bottom: f32,
    heading: f32,
    body: f32,
}

/// Draws one layout inside the frame and returns its lowest baseline, which never
/// exceeds `f.bottom`; the test below checks that with fields at their size limits.
fn body(
    svg: &mut String,
    layout: &SceneLayout,
    scene: &Scene,
    f: &Frame,
    options: &usvg::Options,
) -> Result<f32> {
    let x = f.margin;
    let usable = f.width - 2.0 * f.margin;
    let heading = |svg: &mut String, size: f32, lines: usize| -> Result<f32> {
        let wrapped = wrap(&scene.heading, size, usable, lines, true, options)?;
        text(svg, &wrapped, x, f.top + size, size, INK, true);
        Ok(bottom_of(f.top, size, wrapped.len()))
    };
    let lowest = match layout {
        SceneLayout::Destaque => {
            let used = heading(svg, f.heading, 3)?;
            let top = (used + 60.0).max(if f.vertical { 650.0 } else { 530.0 });
            let excerpt = scene
                .narration
                .split('\n')
                .find(|part| !part.trim().is_empty())
                .unwrap_or(&scene.narration);
            let wrapped = wrap(
                excerpt,
                f.body,
                usable - 44.0,
                (((f.bottom - top - f.body) / (f.body * 1.25)).floor() as usize + 1)
                    .clamp(1, if f.vertical { 8 } else { 4 }),
                false,
                options,
            )?;
            svg.push_str(&format!(
                "<rect x='{x}' y='{top}' width='8' height='{}' fill='{ACCENT}'/>",
                wrapped.len() as f32 * f.body * 1.25 + 8.0
            ));
            text(svg, &wrapped, x + 38.0, top + f.body, f.body, INK, false);
            bottom_of(top, f.body, wrapped.len())
        }
        SceneLayout::Pergunta(question) => {
            text(
                svg,
                &["PERGUNTA".into()],
                x,
                f.top + 40.0,
                30.0,
                ACCENT,
                true,
            );
            fit(
                svg,
                question,
                x,
                f.top + 80.0,
                usable,
                f.bottom,
                f.heading * 1.15,
                f.body,
                INK,
                true,
                options,
            )?
        }
        SceneLayout::Numero { value, caption } => {
            let used = heading(svg, f.body, 2)?;
            // A truncated number changes its meaning: shrink until it fits on one line.
            let mut size: f32 = if f.vertical { 230.0 } else { 220.0 };
            while size > 72.0 && text_width(value, size, true, options)? > usable {
                size -= 8.0;
            }
            let top = used + 60.0;
            text(
                svg,
                std::slice::from_ref(value),
                x,
                top + size,
                size,
                ACCENT,
                true,
            );
            fit(
                svg,
                caption,
                x,
                top + size + 40.0,
                usable,
                f.bottom,
                f.body,
                30.0,
                INK,
                false,
                options,
            )?
        }
        SceneLayout::Lista(items) => {
            let mut top = heading(svg, f.heading * 0.8, 1)? + 50.0;
            let gap = 24.0;
            let count = items.len() as f32;
            let per_item = (f.bottom - top - gap * (count - 1.0)) / count;
            // Two lines per item when they fit; otherwise one line, cut with an ellipsis.
            let (lines, size) = if per_item >= 36.0 * 2.5 {
                (2, (per_item / 2.5).min(f.body))
            } else {
                (1, (per_item / 1.25).clamp(28.0, f.body))
            };
            let mut lowest = top;
            for (index, item) in items.iter().enumerate() {
                text(
                    svg,
                    &[format!("{:02}", index + 1)],
                    x,
                    top + size,
                    size,
                    ACCENT,
                    true,
                );
                let wrapped = wrap(item, size, usable - 110.0, lines, false, options)?;
                text(svg, &wrapped, x + 110.0, top + size, size, INK, false);
                lowest = bottom_of(top, size, wrapped.len());
                top = lowest + size * 0.25 + gap;
            }
            lowest
        }
        SceneLayout::Comparacao { left, right } => {
            let top = heading(svg, f.heading * 0.8, 2)? + 80.0;
            let sides = [left, right];
            if f.vertical {
                let half = (f.bottom - top - 40.0) / 2.0;
                let mut lowest = top;
                for (index, side) in sides.iter().enumerate() {
                    let start = top + index as f32 * (half + 40.0);
                    if index == 1 {
                        svg.push_str(&format!(
                            "<path d='M{x} {} H{}' stroke='{RULE}' stroke-width='2'/>",
                            start - 20.0,
                            f.width - x
                        ));
                    }
                    let wrapped = wrap(&side.label, f.body, usable, 1, true, options)?;
                    text(svg, &wrapped, x, start + f.body, f.body, ACCENT, true);
                    lowest = fit(
                        svg,
                        &side.text,
                        x,
                        start + f.body * 1.6,
                        usable,
                        start + half,
                        f.body,
                        30.0,
                        INK,
                        false,
                        options,
                    )?;
                }
                lowest
            } else {
                let column = (usable - 80.0) / 2.0;
                let mut lowest = top;
                for (index, side) in sides.iter().enumerate() {
                    let cx = x + index as f32 * (column + 80.0);
                    let wrapped = wrap(&side.label, f.body, column, 1, true, options)?;
                    text(svg, &wrapped, cx, top + f.body, f.body, ACCENT, true);
                    lowest = lowest.max(fit(
                        svg,
                        &side.text,
                        cx,
                        top + f.body * 1.6,
                        column,
                        f.bottom,
                        f.body,
                        30.0,
                        INK,
                        false,
                        options,
                    )?);
                }
                let mid = x + column + 40.0;
                svg.push_str(&format!(
                    "<path d='M{mid} {top} V{}' stroke='{RULE}' stroke-width='2'/>",
                    f.bottom
                ));
                lowest
            }
        }
        SceneLayout::LinhaDoTempo(entries) => {
            let top = heading(svg, f.heading * 0.8, if f.vertical { 2 } else { 1 })? + 90.0;
            let mut lowest = top;
            if f.vertical {
                let step = ((f.bottom - top) / entries.len() as f32).min(260.0);
                svg.push_str(&format!(
                    "<path d='M{} {top} V{}' stroke='{RULE}' stroke-width='4'/>",
                    x + 12.0,
                    top + step * (entries.len() as f32 - 0.5)
                ));
                for (index, entry) in entries.iter().enumerate() {
                    let row = top + index as f32 * step;
                    svg.push_str(&format!(
                        "<circle cx='{}' cy='{}' r='14' fill='{ACCENT}'/>",
                        x + 12.0,
                        row + 4.0
                    ));
                    let label = wrap(&entry.label, f.body, usable - 60.0, 1, true, options)?;
                    text(svg, &label, x + 60.0, row + 18.0, f.body, ACCENT, true);
                    lowest = fit(
                        svg,
                        &entry.text,
                        x + 60.0,
                        row + 18.0 + f.body * 0.5,
                        usable - 60.0,
                        row + step - 20.0,
                        f.body * 0.85,
                        28.0,
                        INK,
                        false,
                        options,
                    )?;
                }
            } else {
                let column = usable / entries.len() as f32;
                let line = top + 30.0;
                svg.push_str(&format!(
                    "<path d='M{x} {line} H{}' stroke='{RULE}' stroke-width='4'/>",
                    f.width - x
                ));
                for (index, entry) in entries.iter().enumerate() {
                    let cx = x + index as f32 * column;
                    svg.push_str(&format!(
                        "<circle cx='{}' cy='{line}' r='14' fill='{ACCENT}'/>",
                        cx + 14.0
                    ));
                    let label = wrap(&entry.label, f.body, column - 30.0, 1, true, options)?;
                    text(svg, &label, cx, line + 100.0, f.body, ACCENT, true);
                    lowest = lowest.max(fit(
                        svg,
                        &entry.text,
                        cx,
                        line + 110.0,
                        column - 30.0,
                        f.bottom,
                        34.0,
                        26.0,
                        INK,
                        false,
                        options,
                    )?);
                }
            }
            lowest
        }
        SceneLayout::Citacao { quote, author } => {
            text(
                svg,
                &["“".into()],
                x - 10.0,
                f.top + 170.0,
                220.0,
                ACCENT,
                true,
            );
            let author_size = f.body * 0.8;
            let author_room = author_size * 2.5 + 40.0;
            let used = fit(
                svg,
                quote,
                x,
                f.top + 220.0,
                usable,
                f.bottom - author_room,
                f.heading * 0.85,
                f.body,
                INK,
                false,
                options,
            )?;
            fit(
                svg,
                &format!("— {author}"),
                x,
                used + 40.0,
                usable,
                f.bottom,
                author_size,
                26.0,
                MUTED,
                false,
                options,
            )?
        }
    };
    Ok(lowest)
}

fn frame(width: u32, height: u32) -> Frame {
    let vertical = width < height;
    let h = height as f32;
    // Keep the bottom area clear for burned-in narration captions.
    let footer_y = h - if vertical { 470.0 } else { 290.0 };
    Frame {
        vertical,
        margin: if vertical { 82.0 } else { 112.0 },
        width: width as f32,
        top: 250.0,
        bottom: footer_y - 70.0,
        heading: if vertical { 72.0 } else { 88.0 },
        body: if vertical { 48.0 } else { 44.0 },
    }
}

fn render_scene(
    plan: &VisualPlan,
    scene: &Scene,
    layout: &SceneLayout,
    index: usize,
    width: u32,
    height: u32,
    options: &usvg::Options,
) -> Result<tiny_skia::Pixmap> {
    let f = frame(width, height);
    let (w, margin) = (f.width, f.margin);
    let usable = w - 2.0 * margin;
    let footer_y = f.bottom + 70.0;
    let mut svg = format!("<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'><rect width='100%' height='100%' fill='{BACKGROUND}'/><g font-family='{}'><path d='M{margin} 190 H{}' stroke='{RULE}' stroke-width='2'/>", xml(&options.font_family), w - margin);
    text(
        &mut svg,
        &wrap(&plan.channel, 32.0, usable - 150.0, 1, false, options)?,
        margin,
        130.0,
        32.0,
        MUTED,
        false,
    );
    text(
        &mut svg,
        &[format!("{} / {}", index + 1, plan.scenes.len())],
        w - margin - 110.0,
        130.0,
        30.0,
        MUTED,
        false,
    );
    body(&mut svg, layout, scene, &f, options)?;
    text(
        &mut svg,
        &wrap(&plan.title, 26.0, usable, 1, false, options)?,
        margin,
        footer_y,
        26.0,
        MUTED,
        false,
    );
    svg.push_str(&format!(
        "<path d='M{margin} {} H{}' stroke='{RULE}' stroke-width='2'/>",
        footer_y + 40.0,
        w - margin
    ));
    text(
        &mut svg,
        &[if requires_capture(&scene.visual_brief) {
            "Prévia ilustrativa · gravação pendente".into()
        } else {
            "Visual explicativo · trecho do roteiro".into()
        }],
        margin,
        footer_y + 90.0,
        26.0,
        MUTED,
        false,
    );
    svg.push_str("</g></svg>");
    let tree = usvg::Tree::from_str(&svg, options)
        .map_err(|error| FramechesterError::External(error.to_string()))?;
    let mut pixmap = tiny_skia::Pixmap::new(width, height).ok_or_else(|| {
        FramechesterError::Unavailable("memoria insuficiente para gerar visual".into())
    })?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    Ok(pixmap)
}

fn fonts() -> Result<usvg::Options<'static>> {
    let mut options = usvg::Options::default();
    options.fontdb_mut().load_system_fonts();
    if options.fontdb.is_empty() {
        return Err(FramechesterError::Unavailable(
            "fontes locais ausentes; instale DejaVu Sans para gerar visuais".into(),
        ));
    }
    for family in ["Segoe UI", "DejaVu Sans", "Arial"] {
        if options
            .fontdb
            .faces()
            .any(|face| face.families.iter().any(|(name, _)| name == family))
        {
            options.font_family = family.into();
            break;
        }
    }
    Ok(options)
}

pub fn prepare(plan: &VisualPlan, output: &Path) -> Result<VisualReport> {
    let mut ids = HashSet::new();
    if plan.scenes.is_empty()
        || plan.scenes.len() > 32
        || plan.title.trim().is_empty()
        || plan.title.len() > 2000
        || plan.channel.len() > 1000
        || plan.scenes.iter().any(|scene| {
            !ids.insert(scene.id)
                || scene.heading.trim().is_empty()
                || scene.heading.len() > 3000
                || scene.narration.trim().is_empty()
                || scene.narration.len() > 200_000
                || scene.visual_brief.len() > 20_000
        })
    {
        return Err(FramechesterError::InvalidInput(
            "plano visual invalido; informe de 1 a 32 cenas completas, sem IDs duplicados".into(),
        ));
    }
    // A malformed directive is a note, not a defect: the scene falls back to the default layout.
    let layouts: Vec<_> = plan
        .scenes
        .iter()
        .map(|scene| {
            scene_layout::parse_or_default(scene.id, &scene.visual_brief, &scene.narration)
        })
        .collect();
    let (width, height) = match plan.format {
        ScriptFormat::Long => (1920, 1080),
        ScriptFormat::Short => (1080, 1920),
    };
    let options = fonts()?;
    std::fs::create_dir_all(output)?;
    let mut scenes = Vec::new();
    for (index, (scene, (layout, fallback))) in plan.scenes.iter().zip(&layouts).enumerate() {
        let file = format!("scene-{}.png", scene.id);
        render_scene(plan, scene, layout, index, width, height, &options)?
            .save_png(output.join(&file))
            .map_err(|error| FramechesterError::External(error.to_string()))?;
        if requires_capture(&scene.visual_brief) {
            scenes.push(PreparedVisual { scene_id: scene.id, status: "requires_capture", file: Some(file), reason: Some("Previa ilustrativa criada; a gravacao real continua pendente para a versao final.".into()) });
        } else {
            scenes.push(PreparedVisual {
                scene_id: scene.id,
                status: "generated",
                file: Some(file),
                reason: fallback
                    .as_ref()
                    .map(|detail| format!("layout padrao usado; {detail}")),
            });
        }
    }
    Ok(VisualReport {
        renderer: "framechester-editorial-v2",
        width,
        height,
        scenes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_capture_requirements_are_not_replaced_with_invented_evidence() {
        assert!(requires_capture("[CAPTURA PENDENTE] Resultado da tela"));
        assert!(requires_capture("Gravação real do terminal"));
        assert!(!requires_capture("Diagrama ilustrativo de uma tarefa"));
    }
    #[test]
    fn data_is_escaped_before_entering_the_graphic() {
        assert_eq!(xml("<script>&\"'"), "&lt;script&gt;&amp;&quot;&apos;");
    }
    #[test]
    fn duplicate_scene_ids_fail_before_writing() {
        let scene = Scene {
            id: 1,
            heading: "Conceito".into(),
            narration: "Texto".into(),
            visual_brief: "Diagrama".into(),
            duration_hint_secs: 10.0,
        };
        let plan = VisualPlan {
            channel: "demo".into(),
            title: "Demo".into(),
            format: ScriptFormat::Short,
            scenes: vec![scene.clone(), scene],
        };
        let directory = tempfile::tempdir().unwrap();
        assert!(prepare(&plan, &directory.path().join("out")).is_err());
        assert!(!directory.path().join("out").exists());
    }
    #[test]
    fn invalid_directive_falls_back_to_the_default_layout() {
        let plan = VisualPlan {
            channel: "demo".into(),
            title: "Demo".into(),
            format: ScriptFormat::Long,
            scenes: vec![Scene {
                id: 3,
                heading: "Escala".into(),
                narration: "Sem o numero falado.".into(),
                visual_brief: "#numero 90% | dos casos".into(),
                duration_hint_secs: 5.0,
            }],
        };
        let directory = tempfile::tempdir().unwrap();
        let report = prepare(&plan, &directory.path().join("out")).unwrap();
        assert_eq!(report.scenes[0].status, "generated");
        assert!(report.scenes[0]
            .reason
            .as_deref()
            .unwrap()
            .contains("cena 3"));
        assert!(directory.path().join("out").join("scene-3.png").is_file());
    }
    #[test]
    fn every_layout_renders_in_both_formats() {
        let briefs = [
            "Sem diretiva",
            "#pergunta Por que a GPU venceu?",
            "#numero 175.000.000.000 | parâmetros no GPT-3",
            "#lista Mostrar exemplos; Medir o erro; Ajustar pesos",
            "#comparacao CPU: em fila | GPU: em multidão",
            "#linha-do-tempo 1958: Perceptron; 1986: Backprop; 2012: AlexNet; 2017: Transformer; 2020: GPT-3",
            "#citacao Attention Is All You Need | Vaswani et al., 2017",
        ];
        let scenes = briefs
            .iter()
            .enumerate()
            .map(|(id, brief)| Scene {
                id: id as u32,
                heading: "Cena".into(),
                narration: "Eram 175.000.000.000 parâmetros. Attention Is All You Need.".into(),
                visual_brief: (*brief).into(),
                duration_hint_secs: 5.0,
            })
            .collect::<Vec<_>>();
        for format in [ScriptFormat::Long, ScriptFormat::Short] {
            let plan = VisualPlan {
                channel: "demo".into(),
                title: "Demo".into(),
                format,
                scenes: scenes.clone(),
            };
            let directory = tempfile::tempdir().unwrap();
            let report = prepare(&plan, directory.path()).unwrap();
            assert_eq!(report.scenes.len(), briefs.len());
            assert!(report
                .scenes
                .iter()
                .all(|scene| scene.status == "generated"));
        }
    }
    #[test]
    fn fields_at_their_limits_stay_above_the_caption_band() {
        let options = fonts().unwrap();
        let word = "palavra ";
        let long = word.repeat(20).trim().to_string(); // 159 chars
        let label = "r".repeat(40);
        let number = "1234567890123456";
        let briefs = [
            format!("#pergunta {long}"),
            format!("#numero {number} | {long}"),
            format!("#lista {long}; {long}; {long}; {long}; {long}"),
            format!("#comparacao {label}: {long} | {label}: {long}"),
            format!("#linha-do-tempo {label}: {long}; {label}: {long}; {label}: {long}; {label}: {long}; {label}: {long}"),
            format!("#citacao {long} | {long}"),
            "x".repeat(3000),
        ];
        let narration = format!("{number} {long} {}", "y".repeat(500));
        for (width, height) in [(1920, 1080), (1080, 1920)] {
            let f = frame(width, height);
            for brief in &briefs {
                let scene = Scene {
                    id: 1,
                    heading: "h".repeat(3000),
                    narration: narration.clone(),
                    visual_brief: brief.clone(),
                    duration_hint_secs: 5.0,
                };
                let layout = scene_layout::parse(1, &scene.visual_brief, &scene.narration).unwrap();
                let mut svg = String::new();
                let lowest = body(&mut svg, &layout, &scene, &f, &options).unwrap();
                assert!(
                    lowest <= f.bottom,
                    "{width}x{height} {}: {lowest} > {}",
                    &brief[..12],
                    f.bottom
                );
                assert!(usvg::Tree::from_str(&format!("<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>{svg}</svg>"), &options).is_ok());
            }
        }
    }
}
