//! Typesetting with the bundled fonts: measurement, wrapping and fitting. Text is never
//! cut with an ellipsis; when it does not fit at the minimum size the caller gets `None`
//! and QA reports an overflow.
use crate::format::Rect;
use crate::scene::{xml, Anchor, Node, Shape};
use crate::tokens::{self, LINE_HEIGHT};
use framechester_core::error::{FramechesterError, Result};
use resvg::usvg;
use std::collections::HashMap;
use std::sync::Mutex;

const INTER_REGULAR: &[u8] = include_bytes!("../../../assets/fonts/inter/Inter-Regular.otf");
const INTER_SEMIBOLD: &[u8] = include_bytes!("../../../assets/fonts/inter/Inter-SemiBold.otf");
const INTER_BOLD: &[u8] = include_bytes!("../../../assets/fonts/inter/Inter-Bold.otf");
const MONO_REGULAR: &[u8] =
    include_bytes!("../../../assets/fonts/liberation/LiberationMono-Regular.ttf");
const MONO_BOLD: &[u8] = include_bytes!("../../../assets/fonts/liberation/LiberationMono-Bold.ttf");
/// Display faces of the looks (OFL-1.1): `papel` and `planta`.
const ARCHIVO_BLACK: &[u8] =
    include_bytes!("../../../assets/fonts/archivo-black/ArchivoBlack-Regular.ttf");
const BEBAS_NEUE: &[u8] = include_bytes!("../../../assets/fonts/bebas-neue/BebasNeue-Regular.ttf");

/// Names and SHA-256 of the bundled fonts, recorded in the render manifest.
pub fn bundled_fonts() -> Vec<(&'static str, String)> {
    use sha2::{Digest, Sha256};
    [
        ("Inter-Regular.otf", INTER_REGULAR),
        ("Inter-SemiBold.otf", INTER_SEMIBOLD),
        ("Inter-Bold.otf", INTER_BOLD),
        ("LiberationMono-Regular.ttf", MONO_REGULAR),
        ("LiberationMono-Bold.ttf", MONO_BOLD),
        ("ArchivoBlack-Regular.ttf", ARCHIVO_BLACK),
        ("BebasNeue-Regular.ttf", BEBAS_NEUE),
    ]
    .into_iter()
    .map(|(name, bytes)| {
        let digest = Sha256::digest(bytes);
        (
            name,
            digest.iter().map(|byte| format!("{byte:02x}")).collect(),
        )
    })
    .collect()
}

/// Text, font size bits, weight and family.
type MeasureKey = (String, u32, u16, &'static str);

pub struct Typesetter {
    options: usvg::Options<'static>,
    cache: Mutex<HashMap<MeasureKey, f32>>,
}

impl Typesetter {
    /// Loads only the bundled fonts, so layout is identical on every machine.
    pub fn new() -> Result<Self> {
        let mut options = usvg::Options::default();
        {
            let db = options.fontdb_mut();
            for bytes in [
                INTER_REGULAR,
                INTER_SEMIBOLD,
                INTER_BOLD,
                MONO_REGULAR,
                MONO_BOLD,
                ARCHIVO_BLACK,
                BEBAS_NEUE,
            ] {
                db.load_font_data(bytes.to_vec());
            }
            db.set_sans_serif_family(tokens::FONT_SANS);
            db.set_monospace_family(tokens::FONT_MONO);
        }
        options.font_family = tokens::FONT_SANS.into();
        options.text_rendering = usvg::TextRendering::OptimizeLegibility;
        options.shape_rendering = usvg::ShapeRendering::GeometricPrecision;
        let typesetter = Self {
            options,
            cache: Mutex::new(HashMap::new()),
        };
        if typesetter.measure("Framechester", 40.0, tokens::WEIGHT_BOLD, tokens::FONT_SANS) <= 0.0 {
            return Err(FramechesterError::Unavailable(
                "fontes embutidas nao carregaram; build corrompido".into(),
            ));
        }
        Ok(typesetter)
    }

    pub fn options(&self) -> &usvg::Options<'static> {
        &self.options
    }

    /// Advance width of a single line of text.
    pub fn measure(&self, text: &str, size: f32, weight: u16, family: &'static str) -> f32 {
        if text.is_empty() {
            return 0.0;
        }
        let key = (text.to_string(), size.to_bits(), weight, family);
        if let Some(width) = self
            .cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(&key).copied())
        {
            return width;
        }
        let svg = format!(
            "<svg xmlns='http://www.w3.org/2000/svg' width='40000' height='1000'><text x='0' y='500' font-family='{}' font-size='{size}' font-weight='{weight}' xml:space='preserve'>{}</text></svg>",
            xml(family),
            xml(text)
        );
        let width = usvg::Tree::from_str(&svg, &self.options)
            .map(|tree| {
                // usvg normalizes the root box to the origin, so only the width is usable.
                // It is ink-based: add side bearings so adjacent words do not touch.
                tree.root().abs_bounding_box().width() + size * 0.08
            })
            .unwrap_or(0.0);
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(key, width);
        }
        width
    }

    /// Greedy word wrap without truncation. A single word wider than the box is kept
    /// on its own line (and will be reported as overflow by the caller if needed).
    pub fn wrap(
        &self,
        text: &str,
        size: f32,
        weight: u16,
        family: &'static str,
        max_width: f32,
    ) -> Vec<String> {
        let mut lines = Vec::new();
        for paragraph in text.split('\n') {
            let mut current = String::new();
            for word in paragraph.split_whitespace() {
                let candidate = if current.is_empty() {
                    word.to_string()
                } else {
                    format!("{current} {word}")
                };
                if current.is_empty() || self.measure(&candidate, size, weight, family) <= max_width
                {
                    current = candidate;
                } else {
                    lines.push(std::mem::take(&mut current));
                    current = word.to_string();
                }
            }
            if !current.is_empty() {
                lines.push(current);
            }
        }
        lines
    }

    /// Largest size between `max_size` and `min_size` (stepping down 2 px) at which the
    /// wrapped text fits `max_width` × `max_height`. `None` when it never fits.
    #[allow(clippy::too_many_arguments)]
    pub fn fit(
        &self,
        text: &str,
        max_size: f32,
        min_size: f32,
        max_width: f32,
        max_height: f32,
        weight: u16,
        family: &'static str,
    ) -> Option<(f32, Vec<String>)> {
        let mut size = max_size;
        loop {
            let lines = self.wrap(text, size, weight, family, max_width);
            let height = lines.len() as f32 * size * LINE_HEIGHT;
            let widest = lines
                .iter()
                .map(|line| self.measure(line, size, weight, family))
                .fold(0.0f32, f32::max);
            if height <= max_height && widest <= max_width {
                return Some((size, lines));
            }
            if size <= min_size {
                return None;
            }
            size = (size - 2.0).max(min_size);
        }
    }

    /// A text node for one line; `x` is the anchor position. The box approximates
    /// ascent 0.8em and descent 0.25em, which is conservative for Inter.
    #[allow(clippy::too_many_arguments)]
    pub fn line(
        &self,
        object: &str,
        text: &str,
        x: f32,
        baseline: f32,
        size: f32,
        weight: u16,
        family: &'static str,
        fill: &str,
        anchor: Anchor,
    ) -> Node {
        let width = self.measure(text, size, weight, family);
        let left = match anchor {
            Anchor::Start => x,
            Anchor::Middle => x - width / 2.0,
            Anchor::End => x - width,
        };
        Node::new(
            object,
            Shape::Text {
                x,
                y: baseline,
                size,
                weight,
                family,
                fill: fill.to_string(),
                anchor,
                content: text.to_string(),
                bbox: Rect::new(left, baseline - size * 0.8, width, size * 1.05),
                counter: None,
            },
        )
    }

    /// Nodes for a wrapped block whose first baseline is at `top + size`.
    #[allow(clippy::too_many_arguments)]
    pub fn block(
        &self,
        object: &str,
        lines: &[String],
        x: f32,
        top: f32,
        size: f32,
        weight: u16,
        family: &'static str,
        fill: &str,
        anchor: Anchor,
    ) -> Vec<Node> {
        lines
            .iter()
            .enumerate()
            .map(|(index, line)| {
                self.line(
                    object,
                    line,
                    x,
                    top + size * 0.85 + index as f32 * size * LINE_HEIGHT,
                    size,
                    weight,
                    family,
                    fill,
                    anchor,
                )
            })
            .collect()
    }

    /// One text node per word of `lines`, at the same baselines and with the
    /// same line breaks as [`Self::block`]: kinetic typography reveals word
    /// by word without changing the layout. Each word keeps its measured box
    /// (so overflow/overlap QA sees exactly what is drawn) and the words of a
    /// line span exactly the fitted line: the first box starts where the line
    /// starts and the last box ends where it ends, the leftover width split
    /// evenly between the words. No word can leave the fitted line, on either
    /// side.
    #[allow(clippy::too_many_arguments)]
    pub fn word_block(
        &self,
        object: &str,
        lines: &[String],
        x: f32,
        top: f32,
        size: f32,
        weight: u16,
        family: &'static str,
        fill: &str,
        anchor: Anchor,
    ) -> Vec<Node> {
        let mut nodes = Vec::new();
        for (index, line) in lines.iter().enumerate() {
            let words: Vec<&str> = line.split_whitespace().collect();
            let widths: Vec<f32> = words
                .iter()
                .map(|word| self.measure(word, size, weight, family))
                .collect();
            let fitted_width = self.measure(line, size, weight, family);
            let left = match anchor {
                Anchor::Start => x,
                Anchor::Middle => x - fitted_width / 2.0,
                Anchor::End => x - fitted_width,
            };
            // Word boxes carry their own side bearings, so their sum is below the
            // line's measured width by about one space per gap; never negative gaps.
            let gaps = words.len().saturating_sub(1);
            let space = if gaps == 0 {
                0.0
            } else {
                ((fitted_width - widths.iter().sum::<f32>()) / gaps as f32).max(0.0)
            };
            let baseline = top + size * 0.85 + index as f32 * size * LINE_HEIGHT;
            let mut cursor = left;
            for (word, width) in words.iter().zip(&widths) {
                nodes.push(self.line(
                    object,
                    word,
                    cursor,
                    baseline,
                    size,
                    weight,
                    family,
                    fill,
                    Anchor::Start,
                ));
                cursor += width + space;
            }
        }
        nodes
    }

    /// Height of a block of `lines` lines at `size`.
    pub fn block_height(size: f32, lines: usize) -> f32 {
        lines.max(1) as f32 * size * LINE_HEIGHT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measures_wraps_and_fits_with_bundled_fonts() {
        let typesetter = Typesetter::new().unwrap();
        let narrow = typesetter.measure("iii", 40.0, 400, tokens::FONT_SANS);
        let wide = typesetter.measure("WWW", 40.0, 400, tokens::FONT_SANS);
        assert!(wide > narrow * 2.0, "proportional font: {narrow} vs {wide}");
        let mono_i = typesetter.measure("iii", 40.0, 400, tokens::FONT_MONO);
        let mono_w = typesetter.measure("WWW", 40.0, 400, tokens::FONT_MONO);
        assert!(
            (mono_i - mono_w).abs() < 1.0,
            "monospace: {mono_i} vs {mono_w}"
        );
        let lines = typesetter.wrap(
            "uma frase com varias palavras para quebrar",
            40.0,
            400,
            tokens::FONT_SANS,
            300.0,
        );
        assert!(lines.len() >= 3);
        assert_eq!(
            lines.join(" "),
            "uma frase com varias palavras para quebrar"
        );
        let fitted = typesetter.fit(
            "Skills versus agentes",
            80.0,
            30.0,
            400.0,
            200.0,
            700,
            tokens::FONT_SANS,
        );
        assert!(fitted.is_some());
        let impossible = typesetter.fit(
            "x".repeat(400).as_str(),
            80.0,
            60.0,
            200.0,
            100.0,
            700,
            tokens::FONT_SANS,
        );
        assert!(impossible.is_none(), "never truncated, reported instead");
        assert_eq!(bundled_fonts().len(), 7);
    }

    #[test]
    fn word_block_words_stay_inside_the_fitted_line() {
        let typesetter = Typesetter::new().unwrap();
        let lines = vec!["Movimento bom nao e enfeite palavra".to_string()];
        let nodes = typesetter.word_block(
            "title",
            &lines,
            40.0,
            100.0,
            60.0,
            700,
            tokens::FONT_SANS,
            "#fff",
            Anchor::Start,
        );
        assert_eq!(nodes.len(), 6, "one node per word");
        let line_right = 40.0 + typesetter.measure(&lines[0], 60.0, 700, tokens::FONT_SANS);
        for node in &nodes {
            let right = node.bbox().right();
            assert!(
                right <= line_right + 1.0,
                "word box {right} beyond fitted line {line_right}"
            );
            assert!(
                node.bbox().x >= 40.0 - 0.01,
                "word box {} starts before the line",
                node.bbox().x
            );
        }
        // Words keep narration order along the line.
        let mut xs: Vec<f32> = nodes.iter().map(|node| node.bbox().x).collect();
        let sorted = {
            let mut v = xs.clone();
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            v
        };
        assert_eq!(xs, sorted);
        xs.clear();
    }
}
