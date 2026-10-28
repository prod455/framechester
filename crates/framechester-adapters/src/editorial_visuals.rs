//! Original explanatory graphics. External SVG, HTML, images and URLs are never loaded.
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

#[derive(Serialize)]
pub struct PreparedVisual {
    pub scene_id: u32,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Serialize)]
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

fn render_scene(
    plan: &VisualPlan,
    scene: &Scene,
    index: usize,
    width: u32,
    height: u32,
    options: &usvg::Options,
) -> Result<tiny_skia::Pixmap> {
    let vertical = width < height;
    let w = width as f32;
    let h = height as f32;
    let margin = if vertical { 82.0 } else { 112.0 };
    let usable = w - 2.0 * margin;
    let heading_size = if vertical { 72.0 } else { 88.0 };
    let body_size = if vertical { 48.0 } else { 44.0 };
    let mut svg = format!("<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'><rect width='100%' height='100%' fill='#F4F6FA'/><g font-family='{}'><path d='M{margin} 190 H{}' stroke='#C5CFDF' stroke-width='2'/>", xml(&options.font_family), w - margin);
    text(
        &mut svg,
        &wrap(&plan.channel, 32.0, usable - 150.0, 1, false, options)?,
        margin,
        130.0,
        32.0,
        "#475569",
        false,
    );
    text(
        &mut svg,
        &[format!("{} / {}", index + 1, plan.scenes.len())],
        w - margin - 110.0,
        130.0,
        30.0,
        "#475569",
        false,
    );
    let heading = wrap(&scene.heading, heading_size, usable, 3, true, options)?;
    text(
        &mut svg,
        &heading,
        margin,
        310.0,
        heading_size,
        "#17263E",
        true,
    );
    let body_y = (310.0 + heading.len() as f32 * heading_size * 1.25 + 60.0).max(if vertical {
        700.0
    } else {
        580.0
    });
    // Keep the bottom area clear for burned-in narration captions.
    let footer_y = h - if vertical { 470.0 } else { 290.0 };
    let excerpt = scene
        .narration
        .split(['\n'])
        .find(|part| !part.trim().is_empty())
        .unwrap_or(&scene.narration);
    let body_lines = (((footer_y - 70.0 - body_y) / (body_size * 1.25)).floor() as usize + 1)
        .clamp(1, if vertical { 8 } else { 4 });
    let body = wrap(
        excerpt,
        body_size,
        usable - 44.0,
        body_lines,
        false,
        options,
    )?;
    svg.push_str(&format!(
        "<rect x='{margin}' y='{}' width='8' height='{}' fill='#325EAD'/>",
        body_y - body_size,
        body.len() as f32 * body_size * 1.25 + 8.0
    ));
    text(
        &mut svg,
        &body,
        margin + 38.0,
        body_y,
        body_size,
        "#27364E",
        false,
    );
    text(
        &mut svg,
        &wrap(&plan.title, 26.0, usable, 1, false, options)?,
        margin,
        footer_y,
        26.0,
        "#475569",
        false,
    );
    svg.push_str(&format!(
        "<path d='M{margin} {} H{}' stroke='#C5CFDF' stroke-width='2'/>",
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
        "#475569",
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
    let (width, height) = match plan.format {
        ScriptFormat::Long => (1920, 1080),
        ScriptFormat::Short => (1080, 1920),
    };
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
    std::fs::create_dir_all(output)?;
    let mut scenes = Vec::new();
    for (index, scene) in plan.scenes.iter().enumerate() {
        let file = format!("scene-{}.png", scene.id);
        render_scene(plan, scene, index, width, height, &options)?
            .save_png(output.join(&file))
            .map_err(|error| FramechesterError::External(error.to_string()))?;
        if requires_capture(&scene.visual_brief) {
            scenes.push(PreparedVisual { scene_id: scene.id, status: "requires_capture", file: Some(file), reason: Some("Previa ilustrativa criada; a gravacao real continua pendente para a versao final.".into()) });
        } else {
            scenes.push(PreparedVisual {
                scene_id: scene.id,
                status: "generated",
                file: Some(file),
                reason: None,
            });
        }
    }
    Ok(VisualReport {
        renderer: "framechester-editorial-v1",
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
}
