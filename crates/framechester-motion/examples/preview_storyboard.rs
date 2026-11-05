//! Renders a contact sheet of a storyboard with estimated timing (no TTS): one PNG per
//! sampled instant, for visual review of whole-video continuity such as stage scenes.
//! Usage: preview_storyboard <storyboard.json> <output dir> [frames per scene]
use framechester_core::narration::{
    assemble_scene, paragraph_breaks, segment_narration, SegmentAudio,
};
use framechester_core::storyboard::Storyboard;
use framechester_motion::compose::{compose, frame_svg};
use framechester_motion::raster::Rasterizer;
use framechester_motion::text::Typesetter;

fn main() {
    let mut args = std::env::args().skip(1);
    let input = args.next().expect("storyboard.json");
    let out = std::path::PathBuf::from(args.next().expect("output dir"));
    let per_scene: usize = args
        .next()
        .map_or(4, |value| value.parse().expect("frames per scene"));
    std::fs::create_dir_all(&out).unwrap();
    let mut storyboard: Storyboard =
        serde_json::from_str(&std::fs::read_to_string(input).unwrap()).unwrap();
    let mut start = 0.0f32;
    for scene in storyboard.scenes.iter_mut() {
        framechester_core::planner::complete_scene(scene);
        let texts = segment_narration(&scene.narration);
        let audio: Vec<SegmentAudio> = texts
            .iter()
            .map(|text| SegmentAudio {
                duration_secs: text.split_whitespace().count().max(1) as f32 * 0.33,
                leading_silence_secs: 0.05,
                trailing_silence_secs: 0.1,
                pauses: Vec::new(),
            })
            .collect();
        let breaks = paragraph_breaks(&scene.narration, &texts);
        let (segments, duration) = assemble_scene(&texts, &audio, &breaks);
        scene.segments = segments;
        scene.duration_secs = duration;
        scene.start_secs = start;
        start += duration;
    }
    let typesetter = Typesetter::new().unwrap();
    let composed = compose(&storyboard, &typesetter).unwrap();
    for issue in composed.issues() {
        println!("{issue:?}");
    }
    let canvas = composed.canvas;
    let rasterizer = Rasterizer::new(&typesetter, canvas.width, canvas.height);
    for scene in &composed.scenes {
        for frame in 0..per_scene {
            let t =
                scene.start_secs + scene.duration_secs * (frame as f32 + 0.5) / per_scene as f32;
            let svg = frame_svg(&composed, t, "Inter");
            rasterizer
                .save_png(
                    &svg,
                    &out.join(format!("s{:02}-{frame}-{t:05.2}.png", scene.id)),
                )
                .unwrap();
        }
    }
    println!(
        "{:.1}s, {} cenas",
        composed.total_duration_secs(),
        composed.scenes.len()
    );
}
