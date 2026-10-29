//! Narration of a storyboard: one TTS request per segment (so sentence boundaries are
//! real), measured silences for word timing, semantic pauses, a cache keyed by text and
//! voice, and one WAV for the whole video aligned to the final scene timing.
use crate::audio::Pcm;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::narration::{assemble_scene, paragraph_breaks, segment_narration};
use framechester_core::ports::{TtsEngine, TtsRequest};
use framechester_core::storyboard::Storyboard;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Scene index, segment texts, paragraph breaks and the WAV path of each segment.
type ScenePlan = (usize, Vec<String>, Vec<bool>, Vec<PathBuf>);

/// RMS threshold (fraction of full scale) below which audio counts as silence.
const SILENCE_THRESHOLD: f32 = 0.012;

#[derive(Debug, Clone)]
pub struct NarrationResult {
    /// The whole-video narration, mono 16-bit, scene-aligned.
    pub voice: PathBuf,
    pub sample_rate: u32,
    pub segments_synthesized: usize,
    pub segments_cached: usize,
}

fn cache_key(text: &str, voice: &str, engine: &str) -> String {
    let digest = Sha256::digest(format!("{engine}\u{1f}{voice}\u{1f}{text}").as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Narrates every scene, fills `segments`, `duration_secs` and `start_secs`, and writes
/// `voice.wav` in `output_dir`. Cached segments are reused when `cache_dir` is given.
pub fn narrate(
    storyboard: &mut Storyboard,
    tts: &dyn TtsEngine,
    voice: &str,
    output_dir: &Path,
    cache_dir: Option<&Path>,
) -> Result<NarrationResult> {
    std::fs::create_dir_all(output_dir)?;
    let engine = tts.info().name;
    let mut requests = Vec::new();
    let mut plan: Vec<ScenePlan> = Vec::new();
    let mut cached = 0usize;
    for (index, scene) in storyboard.scenes.iter().enumerate() {
        let texts = segment_narration(&scene.narration);
        if texts.is_empty() {
            return Err(FramechesterError::InvalidInput(format!(
                "cena {} sem narracao segmentavel",
                scene.id
            )));
        }
        let breaks = paragraph_breaks(&scene.narration, &texts);
        let mut paths = Vec::with_capacity(texts.len());
        for (segment_index, text) in texts.iter().enumerate() {
            let key = cache_key(text, voice, &engine);
            let path = match cache_dir {
                Some(cache) => cache.join("tts").join(format!("{key}.wav")),
                None => {
                    output_dir.join(format!("scene_{:03}_seg_{segment_index:02}.wav", scene.id))
                }
            };
            if path.is_file() && Pcm::read(&path).is_ok_and(|pcm| pcm.duration_secs() > 0.05) {
                cached += 1;
            } else {
                requests.push(TtsRequest {
                    scene_id: scene.id,
                    text: text.clone(),
                    voice: voice.to_string(),
                    output: path.clone(),
                });
            }
            paths.push(path);
        }
        plan.push((index, texts, breaks, paths));
    }
    let synthesized = requests.len();
    if !requests.is_empty() {
        tts.synthesize_batch(&requests)?;
    }
    let mut full: Option<Pcm> = None;
    let mut cursor = 0.0f32;
    for (index, texts, breaks, paths) in plan {
        let mut measured = Vec::with_capacity(paths.len());
        let mut pcms = Vec::with_capacity(paths.len());
        for path in &paths {
            let pcm = Pcm::read(path)?;
            measured.push(pcm.measure(SILENCE_THRESHOLD));
            pcms.push(pcm);
        }
        let (segments, duration) = assemble_scene(&texts, &measured, &breaks);
        let sample_rate = pcms[0].sample_rate;
        let scene_audio = full.get_or_insert_with(|| Pcm::silence(sample_rate, 0.0));
        let scene_start_samples = scene_audio.samples.len();
        for (segment, pcm) in segments.iter().zip(&pcms) {
            let at = scene_start_samples as f32 / sample_rate as f32 + segment.start_secs;
            scene_audio.mix_at(pcm, at, 1.0);
        }
        let scene_end = ((cursor + duration) * sample_rate as f32).round() as usize;
        if scene_audio.samples.len() < scene_end {
            scene_audio.samples.resize(scene_end, 0);
        }
        let scene = &mut storyboard.scenes[index];
        scene.segments = segments;
        scene.duration_secs = duration;
        scene.start_secs = cursor;
        cursor += duration;
    }
    let full =
        full.ok_or_else(|| FramechesterError::InvalidInput("storyboard sem cenas".into()))?;
    let voice_path = output_dir.join("voice.wav");
    full.write(&voice_path)?;
    storyboard.validate()?;
    Ok(NarrationResult {
        voice: voice_path,
        sample_rate: full.sample_rate,
        segments_synthesized: synthesized,
        segments_cached: cached,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::domain::TtsAudio;
    use framechester_core::ports::AdapterInfo;
    use framechester_core::storyboard::*;

    /// Writes a tone whose length grows with the text, with 80 ms of silence around it.
    struct ToneTts;
    impl TtsEngine for ToneTts {
        fn info(&self) -> AdapterInfo {
            AdapterInfo::local("tone-tts", "test")
        }
        fn synthesize(&self, request: &TtsRequest) -> Result<TtsAudio> {
            let rate = 24_000;
            let voiced = request.text.split_whitespace().count() as f32 * 0.3;
            let mut pcm = Pcm::silence(rate, 0.08);
            let tone = Pcm {
                sample_rate: rate,
                samples: (0..(rate as f32 * voiced) as usize)
                    .map(|index| ((index as f32 * 0.2).sin() * 9000.0) as i16)
                    .collect(),
            };
            pcm.append(&tone)?;
            pcm.append(&Pcm::silence(rate, 0.08))?;
            pcm.write(&request.output)?;
            Ok(TtsAudio {
                scene_id: request.scene_id,
                path: request.output.clone(),
                duration_secs: pcm.duration_secs(),
                sample_rate: rate,
                voice: request.voice.clone(),
            })
        }
    }

    fn storyboard() -> Storyboard {
        Storyboard {
            version: SCHEMA_VERSION,
            title: "t".into(),
            channel: "c".into(),
            format: VideoFormat::Vertical,
            language: "pt-BR".into(),
            scenes: vec![
                StoryboardScene {
                    id: 1,
                    concept: "a".into(),
                    learning_goal: "b".into(),
                    narration: "Primeira frase longa da cena. Segunda frase da cena.".into(),
                    segments: Vec::new(),
                    duration_secs: 0.0,
                    start_secs: 0.0,
                    composition: Composition::Title {
                        text: "x".into(),
                        kicker: None,
                    },
                    animations: Vec::new(),
                    captions: CaptionPlan::default(),
                    resources: Vec::new(),
                    validation: ValidationCriteria::default(),
                    transition: Transition::Cut,
                },
                StoryboardScene {
                    id: 2,
                    concept: "a".into(),
                    learning_goal: "b".into(),
                    narration: "Terceira frase da outra cena.".into(),
                    segments: Vec::new(),
                    duration_secs: 0.0,
                    start_secs: 0.0,
                    composition: Composition::Title {
                        text: "y".into(),
                        kicker: None,
                    },
                    animations: Vec::new(),
                    captions: CaptionPlan::default(),
                    resources: Vec::new(),
                    validation: ValidationCriteria::default(),
                    transition: Transition::Push,
                },
            ],
            source_hash: None,
        }
    }

    #[test]
    fn narration_fills_real_timing_and_builds_one_aligned_wav_with_cache() {
        let directory = tempfile::tempdir().unwrap();
        let cache = directory.path().join("cache");
        let mut board = storyboard();
        let result = narrate(
            &mut board,
            &ToneTts,
            "pf_dora",
            &directory.path().join("audio"),
            Some(&cache),
        )
        .unwrap();
        assert_eq!(result.segments_synthesized, 3);
        assert_eq!(result.segments_cached, 0);
        let scene = &board.scenes[0];
        assert_eq!(scene.segments.len(), 2);
        assert!(
            (scene.segments[0].words[0].start_secs - 0.08).abs() < 0.02,
            "{:?}",
            scene.segments[0].words[0]
        );
        assert!(scene.duration_secs > scene.segments[1].end_secs);
        assert!((board.scenes[1].start_secs - scene.duration_secs).abs() < 1e-4);
        let voice = Pcm::read(&result.voice).unwrap();
        assert!((voice.duration_secs() - board.total_duration_secs()).abs() < 0.01);
        // The second scene's audio starts at its scene start, not earlier.
        let second_start = (board.scenes[1].start_secs * 24_000.0) as usize;
        assert!(
            voice.samples[second_start.saturating_sub(2000)..second_start]
                .iter()
                .all(|s| *s == 0)
        );
        let mut again = storyboard();
        let result = narrate(
            &mut again,
            &ToneTts,
            "pf_dora",
            &directory.path().join("audio2"),
            Some(&cache),
        )
        .unwrap();
        assert_eq!(result.segments_cached, 3);
        assert_eq!(again, board);
    }
}
