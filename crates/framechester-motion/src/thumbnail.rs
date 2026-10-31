//! Video thumbnail, 1280 × 720: the character of the topic on the left points at the title
//! set large on the right. Drawn with the same design system as the video; no external file.
use crate::components::{character, Ctx};
use crate::format::{Canvas, Rect};
use crate::raster::Rasterizer;
use crate::scene::{Anchor, Graph, Node, Shape};
use crate::text::Typesetter;
use crate::tokens;
use framechester_core::error::Result;
use framechester_core::persona::Persona;
use framechester_core::storyboard::{Character, Composition, Pose, Storyboard, VideoFormat};
use std::path::Path;

pub const WIDTH: u32 = 1280;
pub const HEIGHT: u32 = 720;

/// Who appears on the thumbnail: a preset character or one the script described.
#[derive(Debug, Clone, PartialEq)]
pub enum Cast {
    Preset(Character),
    Described(Persona),
}

/// The character the video already uses, so the thumbnail promises what the video shows.
pub fn cast_of(storyboard: &Storyboard) -> Option<Cast> {
    storyboard
        .scenes
        .iter()
        .find_map(|scene| match &scene.composition {
            Composition::Character {
                persona: Some(persona),
                ..
            } => Some(Cast::Described(persona.clone())),
            Composition::Character { character, .. } => Some(Cast::Preset(*character)),
            _ => None,
        })
}

/// Returns the frame graph and any layout issue (a title too long to fit is reported, not cut).
pub fn compose(
    typesetter: &Typesetter,
    title: &str,
    cast: &Cast,
) -> (Graph, Vec<crate::components::LayoutIssue>) {
    let canvas = Canvas::for_format(VideoFormat::X);
    let mut ctx = Ctx::new(&canvas, typesetter, 0);
    let margin = 56.0;
    let stage = Rect::new(margin, 70.0, 430.0, HEIGHT as f32 - 70.0);
    let pose = if title.trim_end().ends_with('?') {
        Pose::Think
    } else {
        Pose::Point
    };
    let mut nodes = match cast {
        Cast::Preset(preset) => character::figure(stage, *preset, pose),
        Cast::Described(persona) => character::persona_figure(stage, persona, pose),
    };
    let text_area = Rect::new(
        stage.right() + 40.0,
        margin,
        WIDTH as f32 - stage.right() - 40.0 - margin,
        HEIGHT as f32 - margin * 2.0,
    );
    let (title_nodes, bottom) = ctx.fitted(
        "title",
        title,
        text_area,
        104.0,
        56.0,
        tokens::WEIGHT_BOLD,
        tokens::INK,
        Anchor::Start,
        0.5,
    );
    let block_height = bottom - title_nodes.first().map_or(bottom, |node| node.bbox().y);
    nodes.extend(title_nodes);
    // Accent bar beside the title block, for contrast at small sizes.
    let bar_top = bottom - block_height;
    nodes.push(
        Node::new(
            "accent",
            Shape::Rect {
                rect: Rect::new(text_area.x - 24.0, bar_top, 10.0, block_height.max(60.0)),
                rx: 5.0,
                fill: tokens::ACCENT.into(),
                stroke: None,
            },
        )
        .decorative(),
    );
    (
        Graph {
            nodes,
            ..Graph::default()
        },
        ctx.issues,
    )
}

/// Writes the PNG thumbnail.
pub fn render(
    typesetter: &Typesetter,
    title: &str,
    cast: &Cast,
    path: &Path,
) -> Result<Vec<crate::components::LayoutIssue>> {
    let (graph, issues) = compose(typesetter, title, cast);
    let svg = graph.svg(0.0, WIDTH, HEIGHT, tokens::FONT_SANS);
    Rasterizer::new(typesetter, WIDTH, HEIGHT).save_png(&svg, path)?;
    Ok(issues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_typical_title_fits_beside_the_character() {
        let typesetter = Typesetter::new().unwrap();
        for (title, character) in [
            (
                "Skills vs. Agentes de IA: a diferença na prática",
                Character::Robot,
            ),
            ("Agente ou skill?", Character::Developer),
            ("O que a ciência diz sobre o sono", Character::Scientist),
        ] {
            let (graph, issues) = compose(&typesetter, title, &Cast::Preset(character));
            assert!(issues.is_empty(), "{title}: {issues:?}");
            let safe = Rect::new(0.0, 0.0, WIDTH as f32, HEIGHT as f32);
            for node in graph.nodes.iter().filter(|node| node.is_text()) {
                assert!(safe.contains(&node.bbox()), "{title}: {:?}", node.bbox());
            }
        }
    }
}
