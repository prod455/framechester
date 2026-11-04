//! Renders a filmstrip of every caused transition (flow → title), for visual review:
//! `cargo run --release -p framechester-motion --example preview_transitions -- <dir> [look]`.
use framechester_core::domain::Scene;
use framechester_core::narration::{assemble_scene, segment_narration, SegmentAudio};
use framechester_core::planner::plan_scene;
use framechester_core::storyboard::{Look, StoryboardScene, Transition, VideoFormat};
use framechester_motion::compose::{compose_scene, frame_svg, transition_secs, Composed};
use framechester_motion::format::Canvas;
use framechester_motion::raster::Rasterizer;
use framechester_motion::text::Typesetter;

fn narrated(id: u32, brief: &str, narration: &str, index: usize) -> StoryboardScene {
    let mut scene = plan_scene(
        &Scene {
            id,
            heading: "Conceito da cena em uma frase".into(),
            narration: narration.into(),
            visual_brief: brief.into(),
            duration_hint_secs: 5.0,
        },
        index,
    )
    .unwrap();
    let texts = segment_narration(narration);
    let audio: Vec<SegmentAudio> = texts
        .iter()
        .map(|t| SegmentAudio {
            duration_secs: t.split_whitespace().count() as f32 * 0.33,
            leading_silence_secs: 0.05,
            trailing_silence_secs: 0.1,
            pauses: Vec::new(),
        })
        .collect();
    let (segments, duration) = assemble_scene(&texts, &audio, &vec![false; texts.len()]);
    scene.segments = segments;
    scene.duration_secs = duration;
    scene
}

fn main() {
    let out = std::path::PathBuf::from(std::env::args().nth(1).expect("output dir"));
    let look = std::env::args()
        .nth(2)
        .map(|value| Look::parse(&value).expect("unknown look"))
        .unwrap_or_default();
    let typesetter = Typesetter::new().unwrap();
    let canvas = Canvas::for_storyboard(VideoFormat::Horizontal, look);
    let rasterizer = Rasterizer::new(&typesetter, canvas.width, canvas.height);
    let first = narrated(
        1,
        "#fluxo Objetivo [user] -> Decidir [brain] {primary} -> Agir [tool] -> Observar [search]",
        "O agente recebe o objetivo, decide, age e observa.",
        1,
    );
    for transition in [
        Transition::Expand,
        Transition::Iris,
        Transition::BlurSwap,
        Transition::DipCut,
    ] {
        let mut second = narrated(
            2,
            "#pergunta E se a skill decidir?",
            "E se a skill decidir?",
            2,
        );
        second.transition = transition;
        second.start_secs = first.duration_secs;
        let composed = Composed {
            canvas,
            scenes: vec![
                compose_scene(&typesetter, &canvas, &first, 1, 3),
                compose_scene(&typesetter, &canvas, &second, 2, 3),
            ],
        };
        let seam = first.duration_secs;
        let span = transition_secs(transition);
        for (step, fraction) in [0.1f32, 0.35, 0.6, 0.85].into_iter().enumerate() {
            let svg = frame_svg(&composed, seam + span * fraction, "Inter");
            rasterizer
                .save_png(&svg, &out.join(format!("{transition:?}-{step}.png")))
                .unwrap();
        }
    }
}
