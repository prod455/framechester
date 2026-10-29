//! Code demonstration: an editor window whose lines are typed in and highlighted.
//! Objects are `line:N`; a highlight paints an accent bar and a band behind the line.
use super::Ctx;
use crate::format::Rect;
use crate::scene::{Anchor, Node, Shape};
use crate::tokens;

pub fn line_id(index: usize) -> String {
    format!("line:{index}")
}

pub fn build(
    ctx: &mut Ctx<'_>,
    area: Rect,
    language: &str,
    lines: &[String],
    file_name: Option<&str>,
) -> Vec<Node> {
    let mut nodes = Vec::new();
    let gap = ctx.canvas.gap;
    let scale = ctx.canvas.type_scale;
    let bar_h = scale.small * 2.2;
    let line_h = ctx.line_height(scale.code) * 1.15;
    let needed = bar_h + gap + lines.len() as f32 * line_h + gap;
    let height = needed.min(area.h);
    if needed > area.h + 0.5 {
        ctx.issue(
            super::Severity::Critical,
            "code_overflow",
            format!(
                "{} linhas de codigo nao cabem na area; use ate {} linhas",
                lines.len(),
                ((area.h - bar_h - 2.0 * gap) / line_h).floor() as usize
            ),
        );
    }
    let window = Rect::new(area.x, area.y, area.w, height);
    nodes.push(
        Node::new(
            "window",
            Shape::Rect {
                rect: window,
                rx: ctx.canvas.radius,
                fill: "#0A0E16".into(),
                stroke: Some((tokens::RULE.into(), ctx.canvas.stroke * 0.6)),
            },
        )
        .with_z(-3)
        .decorative(),
    );
    nodes.push(
        Node::new(
            "window",
            Shape::Rect {
                rect: Rect::new(window.x, window.y, window.w, bar_h),
                rx: ctx.canvas.radius,
                fill: tokens::SURFACE.into(),
                stroke: None,
            },
        )
        .with_z(-2)
        .decorative(),
    );
    for (index, colour) in [tokens::DANGER, tokens::ACCENT, tokens::SUCCESS]
        .iter()
        .enumerate()
    {
        nodes.push(
            Node::new(
                "window",
                Shape::Circle {
                    cx: window.x + gap * 0.9 + index as f32 * scale.small * 0.9,
                    cy: window.y + bar_h / 2.0,
                    r: scale.small * 0.26,
                    fill: (*colour).into(),
                    stroke: None,
                },
            )
            .decorative(),
        );
    }
    let title = match file_name {
        Some(name) => format!("{name}  ·  {language}"),
        None => language.to_string(),
    };
    nodes.push(ctx.ts.line(
        "window",
        &title,
        window.cx(),
        window.y + bar_h / 2.0 + scale.small * 0.35,
        scale.small,
        tokens::WEIGHT_REGULAR,
        tokens::FONT_MONO,
        tokens::MUTED,
        Anchor::Middle,
    ));
    let gutter = ctx
        .ts
        .measure("00", scale.code, tokens::WEIGHT_REGULAR, tokens::FONT_MONO)
        + gap;
    let text_x = window.x + gap + gutter;
    let max_width = window.right() - gap - text_x;
    for (index, line) in lines.iter().enumerate() {
        let id = line_id(index);
        let top = window.y + bar_h + gap + index as f32 * line_h;
        let baseline = top + scale.code * 0.95;
        nodes.push(
            Node::new(
                &id,
                Shape::Rect {
                    rect: Rect::new(
                        window.x + ctx.canvas.stroke,
                        top - scale.code * 0.12,
                        window.w - 2.0 * ctx.canvas.stroke,
                        line_h,
                    ),
                    rx: 0.0,
                    fill: "#1B2A3F".into(),
                    stroke: None,
                },
            )
            .with_z(-1)
            .decorative()
            .with_glow(tokens::ACCENT),
        );
        nodes.last_mut().expect("band").props.opacity = crate::anim::Track::constant(0.0);
        nodes.push(ctx.ts.line(
            &id,
            &format!("{:>2}", index + 1),
            window.x + gap,
            baseline,
            scale.code,
            tokens::WEIGHT_REGULAR,
            tokens::FONT_MONO,
            tokens::MUTED,
            Anchor::Start,
        ));
        let colour = token_colour(line, language);
        let width = ctx
            .ts
            .measure(line, scale.code, tokens::WEIGHT_REGULAR, tokens::FONT_MONO);
        if width > max_width {
            ctx.issue(
                super::Severity::Critical,
                "text_overflow",
                format!(
                    "linha de codigo {} ultrapassa a janela; encurte-a",
                    index + 1
                ),
            );
        }
        nodes.push(ctx.ts.line(
            &id,
            line,
            text_x,
            baseline,
            scale.code,
            tokens::WEIGHT_REGULAR,
            tokens::FONT_MONO,
            colour,
            Anchor::Start,
        ));
    }
    nodes
}

/// One colour per line, by what the line mostly is; a full tokenizer would add little
/// at caption-reading distance.
fn token_colour(line: &str, language: &str) -> &'static str {
    let trimmed = line.trim_start();
    if trimmed.starts_with('#') || trimmed.starts_with("//") || trimmed.starts_with("--") {
        tokens::MUTED
    } else if trimmed.starts_with("---") || trimmed == "```" {
        tokens::RULE
    } else if language.contains("markdown") || language == "md" {
        if trimmed.contains(':') {
            tokens::SECONDARY
        } else {
            tokens::INK
        }
    } else if trimmed.starts_with("def ")
        || trimmed.starts_with("fn ")
        || trimmed.starts_with("function ")
        || trimmed.starts_with("class ")
        || trimmed.starts_with("import ")
        || trimmed.starts_with("use ")
        || trimmed.starts_with("return")
    {
        tokens::PRIMARY
    } else if trimmed.contains('"') || trimmed.contains('\'') {
        tokens::ACCENT
    } else {
        tokens::INK
    }
}
