//! Canvas geometry per output format: safe areas for the social interfaces that will
//! cover parts of the frame, the content box, the caption band and the type scale.
//! Every format gets its own numbers; nothing is derived by cropping another format.
use framechester_core::storyboard::VideoFormat;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }
    pub fn right(&self) -> f32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }
    pub fn cx(&self) -> f32 {
        self.x + self.w / 2.0
    }
    pub fn cy(&self) -> f32 {
        self.y + self.h / 2.0
    }
    pub fn contains(&self, other: &Rect) -> bool {
        other.x >= self.x - 0.5
            && other.y >= self.y - 0.5
            && other.right() <= self.right() + 0.5
            && other.bottom() <= self.bottom() + 0.5
    }
    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.right()
            && other.x < self.right()
            && self.y < other.bottom()
            && other.y < self.bottom()
    }
    pub fn inset(&self, amount: f32) -> Rect {
        Rect::new(
            self.x + amount,
            self.y + amount,
            (self.w - 2.0 * amount).max(0.0),
            (self.h - 2.0 * amount).max(0.0),
        )
    }
}

/// Font sizes in pixels for one format.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct TypeScale {
    pub title: f32,
    pub heading: f32,
    pub body: f32,
    pub label: f32,
    pub small: f32,
    pub caption: f32,
    pub code: f32,
    pub number: f32,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Canvas {
    pub format: VideoFormat,
    pub width: u32,
    pub height: u32,
    /// Where explanatory content lives; social UI never covers it.
    pub content: Rect,
    /// Where captions are drawn; also clear of social UI.
    pub captions: Rect,
    /// Title-safe area: nothing readable outside it.
    pub safe: Rect,
    pub margin: f32,
    pub gap: f32,
    pub radius: f32,
    pub stroke: f32,
    pub type_scale: TypeScale,
    /// Icon size in pixels.
    pub icon: f32,
    pub vertical: bool,
}

impl Canvas {
    pub fn for_format(format: VideoFormat) -> Self {
        let (width, height) = format.dimensions();
        match format {
            // Shorts/Reels/TikTok overlays: status bar on top, action buttons on the right
            // from roughly 55% to 85% of the height, caption and audio strip at the bottom.
            VideoFormat::Vertical => Canvas {
                format,
                width,
                height,
                content: Rect::new(72.0, 230.0, 936.0, 1040.0),
                captions: Rect::new(72.0, 1330.0, 820.0, 230.0),
                safe: Rect::new(54.0, 180.0, 972.0, 1420.0),
                margin: 72.0,
                gap: 28.0,
                radius: 26.0,
                stroke: 4.0,
                type_scale: TypeScale {
                    title: 82.0,
                    heading: 58.0,
                    body: 42.0,
                    label: 38.0,
                    small: 30.0,
                    caption: 54.0,
                    code: 34.0,
                    number: 190.0,
                },
                icon: 64.0,
                vertical: true,
            },
            VideoFormat::Horizontal => Canvas {
                format,
                width,
                height,
                content: Rect::new(112.0, 92.0, 1696.0, 760.0),
                captions: Rect::new(312.0, 896.0, 1296.0, 120.0),
                safe: Rect::new(96.0, 54.0, 1728.0, 972.0),
                margin: 112.0,
                gap: 32.0,
                radius: 24.0,
                stroke: 4.0,
                type_scale: TypeScale {
                    title: 86.0,
                    heading: 56.0,
                    body: 38.0,
                    label: 34.0,
                    small: 27.0,
                    caption: 46.0,
                    code: 32.0,
                    number: 210.0,
                },
                icon: 56.0,
                vertical: false,
            },
            // X feed: small on the timeline, so type is larger relative to the frame and
            // captions are shorter.
            VideoFormat::X => Canvas {
                format,
                width,
                height,
                content: Rect::new(72.0, 56.0, 1136.0, 500.0),
                captions: Rect::new(180.0, 586.0, 920.0, 96.0),
                safe: Rect::new(48.0, 32.0, 1184.0, 656.0),
                margin: 72.0,
                gap: 22.0,
                radius: 18.0,
                stroke: 3.0,
                type_scale: TypeScale {
                    title: 62.0,
                    heading: 42.0,
                    body: 29.0,
                    label: 26.0,
                    small: 21.0,
                    caption: 36.0,
                    code: 24.0,
                    number: 150.0,
                },
                icon: 42.0,
                vertical: false,
            },
        }
    }

    /// Scale factor relative to the 1080-wide vertical canvas, for motion distances.
    pub fn motion_scale(&self) -> f32 {
        (self.width.min(self.height) as f32 / 1080.0).max(0.5)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_and_captions_stay_inside_the_safe_area_without_overlapping() {
        for format in [
            VideoFormat::Vertical,
            VideoFormat::Horizontal,
            VideoFormat::X,
        ] {
            let canvas = Canvas::for_format(format);
            assert!(canvas.safe.contains(&canvas.content), "{format:?} content");
            assert!(
                canvas.safe.contains(&canvas.captions),
                "{format:?} captions"
            );
            assert!(
                !canvas.content.intersects(&canvas.captions),
                "{format:?} overlap"
            );
            assert!(canvas.captions.right() <= canvas.width as f32);
        }
        let vertical = Canvas::for_format(VideoFormat::Vertical);
        // The right-hand action buttons of Shorts/Reels sit roughly at x > 920 between
        // 55% and 85% of the height; captions must stay left of them.
        assert!(vertical.captions.right() <= 920.0);
    }
}
