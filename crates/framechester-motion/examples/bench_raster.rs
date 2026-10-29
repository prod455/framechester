use framechester_core::storyboard::Easing;
use framechester_motion::format::Rect;
use framechester_motion::raster::{encode_frames, EncodeProfile, Rasterizer};
use framechester_motion::scene::{Anchor, Graph, Shape};
use framechester_motion::text::Typesetter;
fn main() {
    let typesetter = Typesetter::new().unwrap();
    let rasterizer = Rasterizer::new(&typesetter, 1080, 1920);
    let mut graph = Graph::default();
    for i in 0..12 {
        let mut node = typesetter.line(
            "t",
            &format!("Linha de texto número {i} com palavras"),
            80.0,
            300.0 + i as f32 * 90.0,
            44.0,
            600,
            framechester_motion::tokens::FONT_SANS,
            "#EEF2F8",
            Anchor::Start,
        );
        node.props
            .reveal(i as f32 * 0.2, 0.5, (0.0, 30.0), Easing::EaseOut);
        graph.push(node);
        let mut rect = framechester_motion::scene::Node::new(
            "r",
            Shape::Rect {
                rect: Rect::new(60.0, 260.0 + i as f32 * 90.0, 900.0, 70.0),
                rx: 20.0,
                fill: "#182130".into(),
                stroke: Some(("#5B9DFF".into(), 4.0)),
            },
        );
        rect.props.pop(i as f32 * 0.2, 0.5, Easing::Back);
        rect.z = -1;
        graph.push(rect);
    }
    let start = std::time::Instant::now();
    let frames = 150;
    let out = std::path::PathBuf::from(std::env::args().nth(1).unwrap_or("/tmp/bench.mp4".into()));
    let profile = EncodeProfile {
        ffmpeg: "ffmpeg".into(),
        fps: 30,
        video_codec: "libx264".into(),
        crf: 20,
        preset: "veryfast".into(),
        threads: 0,
    };
    let written = encode_frames(&rasterizer, &profile, frames, &out, &|index| {
        graph.svg(index as f32 / 30.0, 1080, 1920, "Inter")
    })
    .unwrap();
    let elapsed = start.elapsed().as_secs_f32();
    println!(
        "{written} frames in {elapsed:.2}s = {:.1} fps",
        written as f32 / elapsed
    );
}
