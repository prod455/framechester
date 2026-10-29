//! Closed catalog of original vector icons drawn on a 24×24 grid as stroked paths.
//! Nothing here is loaded from disk or copied from an icon set.
use crate::format::Rect;
use crate::scene::{Node, Shape};
use framechester_core::storyboard::Icon;

/// Path commands on a 24×24 grid, stroke width 2 (scaled with the icon).
fn paths(icon: Icon) -> &'static [&'static str] {
    match icon {
        Icon::Agent => &[
            "M5 9 h14 a2 2 0 0 1 2 2 v7 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-7 a2 2 0 0 1 2 -2 z",
            "M8.5 14 h0.01",
            "M15.5 14 h0.01",
            "M12 9 v-3",
            "M12 6 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0",
            "M9 17 h6",
        ],
        Icon::Skill => &[
            "M6 3 h9 l5 5 v13 a1 1 0 0 1 -1 1 h-13 a1 1 0 0 1 -1 -1 v-17 a1 1 0 0 1 1 -1 z",
            "M15 3 v5 h5",
            "M8 12 h8",
            "M8 16 h5",
        ],
        Icon::Folder => &[
            "M3 7 a2 2 0 0 1 2 -2 h4 l2 2 h8 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 z",
        ],
        Icon::File => &[
            "M6 3 h8 l5 5 v12 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 v-16 a1 1 0 0 1 1 -1 z",
            "M14 3 v5 h5",
        ],
        Icon::Tool => &[
            "M14.5 5.5 a4 4 0 0 0 -5 5 l-6 6 a1.5 1.5 0 0 0 2 2 l6 -6 a4 4 0 0 0 5 -5 l-2.5 2.5 l-2 -2 z",
        ],
        Icon::Loop => &[
            "M4 12 a8 8 0 0 1 14 -5",
            "M18 4 v3.5 h-3.5",
            "M20 12 a8 8 0 0 1 -14 5",
            "M6 20 v-3.5 h3.5",
        ],
        Icon::Check => &["M5 12.5 l4.5 4.5 l9.5 -10"],
        Icon::Cross => &["M6 6 l12 12", "M18 6 l-12 12"],
        Icon::Bolt => &["M13 2 l-8 12 h6 l-1 8 l8 -12 h-6 z"],
        Icon::Brain => &[
            "M9 4 a3 3 0 0 0 -3 3 a3 3 0 0 0 -2 5 a3 3 0 0 0 2 5 a3 3 0 0 0 6 1 v-13 a3 3 0 0 0 -3 -1 z",
            "M15 4 a3 3 0 0 1 3 3 a3 3 0 0 1 2 5 a3 3 0 0 1 -2 5 a3 3 0 0 1 -6 1 v-13 a3 3 0 0 1 3 -1 z",
        ],
        Icon::Gear => &[
            "M12 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8",
            "M12 2 v3", "M12 19 v3", "M2 12 h3", "M19 12 h3",
            "M4.9 4.9 l2.1 2.1", "M17 17 l2.1 2.1", "M4.9 19.1 l2.1 -2.1", "M17 7 l2.1 -2.1",
        ],
        Icon::Database => &[
            "M12 4 a8 3 0 1 0 0.01 0",
            "M4 7 v10 a8 3 0 0 0 16 0 v-10",
            "M4 12 a8 3 0 0 0 16 0",
        ],
        Icon::Cloud => &[
            "M7 18 a4 4 0 0 1 -0.5 -8 a5.5 5.5 0 0 1 10.5 -1 a4.5 4.5 0 0 1 1 9 z",
        ],
        Icon::User => &[
            "M12 12 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8",
            "M4 21 a8 8 0 0 1 16 0",
        ],
        Icon::Clock => &["M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", "M12 7 v5 l3 2"],
        Icon::Chart => &["M4 20 h16", "M7 16 v-5", "M12 16 v-9", "M17 16 v-3"],
        Icon::Shield => &["M12 3 l8 3 v6 c0 5 -3.5 8 -8 9 c-4.5 -1 -8 -4 -8 -9 v-6 z", "M9 12 l2 2 l4 -4"],
        Icon::Search => &["M10.5 10.5 m-6.5 0 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0", "M15.5 15.5 l5 5"],
        Icon::Arrow => &["M4 12 h15", "M13 6 l6 6 l-6 6"],
        Icon::Question => &[
            "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0",
            "M9.5 9.5 a2.5 2.5 0 1 1 3.5 2.3 c-0.7 0.4 -1 0.9 -1 1.7",
            "M12 17 h0.01",
        ],
        Icon::Code => &["M8 7 l-5 5 l5 5", "M16 7 l5 5 l-5 5", "M14 4 l-4 16"],
        Icon::Book => &[
            "M4 4 h6 a2 2 0 0 1 2 2 v14 a2 2 0 0 0 -2 -2 h-6 z",
            "M20 4 h-6 a2 2 0 0 0 -2 2 v14 a2 2 0 0 1 2 -2 h6 z",
        ],
    }
}

/// Scales a 24-grid path to `size` pixels at (x, y) by rewriting its numbers. Relative
/// commands only scale; absolute ones also translate. Arc flags are left untouched.
fn scale_path(d: &str, x: f32, y: f32, size: f32) -> String {
    let factor = size / 24.0;
    let mut out = String::new();
    let mut command = 'M';
    let mut index = 0usize;
    let mut number = String::new();
    let emit = |number: &mut String, out: &mut String, index: &mut usize, command: char| {
        if number.is_empty() {
            return;
        }
        let value: f32 = number.parse().unwrap_or(0.0);
        let relative = command.is_ascii_lowercase();
        let is_arc = command.eq_ignore_ascii_case(&'a');
        let position = if is_arc { *index % 7 } else { *index % 2 };
        if is_arc && (position == 3 || position == 4) {
            // Arc flags must be literal 0 or 1.
            out.push_str(if value > 0.5 { "1 " } else { "0 " });
            *index += 1;
            number.clear();
            return;
        }
        let result = match (is_arc, position) {
            (true, 0 | 1) => value * factor,
            (true, 2) => value,
            (true, 5) | (false, 0) => {
                if relative {
                    value * factor
                } else {
                    x + value * factor
                }
            }
            _ => {
                if relative {
                    value * factor
                } else {
                    y + value * factor
                }
            }
        };
        out.push_str(&format!("{result:.2} "));
        *index += 1;
        number.clear();
    };
    for character in d.chars() {
        if character.is_ascii_alphabetic() {
            emit(&mut number, &mut out, &mut index, command);
            command = character;
            index = 0;
            out.push(character);
            out.push(' ');
        } else if character == ' ' || character == ',' {
            emit(&mut number, &mut out, &mut index, command);
        } else {
            number.push(character);
        }
    }
    emit(&mut number, &mut out, &mut index, command);
    out
}

/// Stroked icon nodes at (x, y) with the given size and colour.
pub fn icon_nodes(object: &str, icon: Icon, x: f32, y: f32, size: f32, colour: &str) -> Vec<Node> {
    let width = (size / 12.0).max(2.0);
    paths(icon)
        .iter()
        .map(|d| {
            Node::new(
                object,
                Shape::Path {
                    d: scale_path(d, x, y, size),
                    stroke: colour.to_string(),
                    width,
                    length: size * 4.0,
                    fill: None,
                    dashed: false,
                },
            )
            .with_origin((x + size / 2.0, y + size / 2.0))
            .decorative()
        })
        .collect()
}

pub fn icon_bbox(x: f32, y: f32, size: f32) -> Rect {
    Rect::new(x, y, size, size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_icon_scales_into_valid_svg_paths() {
        let typesetter = crate::text::Typesetter::new().unwrap();
        for icon in [
            Icon::Agent,
            Icon::Skill,
            Icon::Folder,
            Icon::File,
            Icon::Tool,
            Icon::Loop,
            Icon::Check,
            Icon::Cross,
            Icon::Bolt,
            Icon::Brain,
            Icon::Gear,
            Icon::Database,
            Icon::Cloud,
            Icon::User,
            Icon::Clock,
            Icon::Chart,
            Icon::Shield,
            Icon::Search,
            Icon::Arrow,
            Icon::Question,
            Icon::Code,
            Icon::Book,
        ] {
            let nodes = icon_nodes("i", icon, 10.0, 10.0, 48.0, "#fff");
            assert!(!nodes.is_empty(), "{icon:?}");
            let mut graph = crate::scene::Graph::default();
            graph.extend(nodes);
            let svg = graph.svg(0.0, 80, 80, "Inter");
            let background_end = svg.find("/>").map(|at| at + 2).unwrap();
            let background_start = svg.find("<rect").unwrap();
            let svg = format!("{}{}", &svg[..background_start], &svg[background_end..]);
            let tree = resvg::usvg::Tree::from_str(&svg, typesetter.options()).unwrap();
            let bbox = tree.root().abs_bounding_box();
            // usvg reports the root box normalized to the origin; sizes are what matter.
            assert!(
                bbox.width() > 10.0 && bbox.width() <= 50.0,
                "{icon:?} {bbox:?}"
            );
            assert!(
                bbox.height() > 6.0 && bbox.height() <= 50.0,
                "{icon:?} {bbox:?}"
            );
        }
    }

    #[test]
    fn scaling_keeps_arc_flags_and_translates_absolute_coordinates() {
        let scaled = scale_path("M12 12 m-9 0 a9 9 0 1 0 18 0", 100.0, 200.0, 48.0);
        assert!(
            scaled.starts_with("M 124.00 224.00 m -18.00 0.00 a 18.00 18.00 0.00 1 0 36.00 0.00"),
            "{scaled}"
        );
    }
}
