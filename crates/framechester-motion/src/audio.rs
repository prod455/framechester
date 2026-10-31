//! Soundtrack assembly: 16-bit PCM WAV reading and writing, silence measurement for
//! word timing, concatenation with semantic pauses, procedural transition sounds, the
//! optional licensed music bed, and the FFmpeg mix with two-pass EBU R128 loudness
//! normalization and a true-peak limiter.
use framechester_core::error::{FramechesterError, Result};
use framechester_core::narration::SegmentAudio;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Shortest silence inside a segment that counts as a pause, in 10 ms windows. Kokoro
/// pauses 50-400 ms at commas; consonant closures stay under about 60 ms.
const MIN_PAUSE_WINDOWS: usize = 8;

/// Mono 16-bit PCM audio in memory.
#[derive(Debug, Clone, PartialEq)]
pub struct Pcm {
    pub sample_rate: u32,
    pub samples: Vec<i16>,
}

impl Pcm {
    pub fn silence(sample_rate: u32, seconds: f32) -> Self {
        Self {
            sample_rate,
            samples: vec![0; (sample_rate as f32 * seconds.max(0.0)).round() as usize],
        }
    }

    pub fn duration_secs(&self) -> f32 {
        self.samples.len() as f32 / self.sample_rate as f32
    }

    pub fn append(&mut self, other: &Pcm) -> Result<()> {
        if other.sample_rate != self.sample_rate {
            return Err(FramechesterError::InvalidInput(format!(
                "taxas de amostragem diferentes: {} e {}",
                self.sample_rate, other.sample_rate
            )));
        }
        self.samples.extend_from_slice(&other.samples);
        Ok(())
    }

    /// Mixes `other` into this buffer starting at `at_secs`, with `gain` (linear),
    /// extending the buffer when needed. Clamps to avoid wrap-around.
    pub fn mix_at(&mut self, other: &Pcm, at_secs: f32, gain: f32) {
        let offset = (at_secs.max(0.0) * self.sample_rate as f32).round() as usize;
        let needed = offset + other.samples.len();
        if needed > self.samples.len() {
            self.samples.resize(needed, 0);
        }
        for (index, sample) in other.samples.iter().enumerate() {
            let mixed = self.samples[offset + index] as f32 + *sample as f32 * gain;
            self.samples[offset + index] = mixed.clamp(-32767.0, 32767.0) as i16;
        }
    }

    /// Leading and trailing silence below `threshold` (0..1 of full scale), with the RMS
    /// measured over 10 ms windows.
    pub fn measure(&self, threshold: f32) -> SegmentAudio {
        let window = (self.sample_rate / 100).max(1) as usize;
        let limit = threshold * 32767.0;
        let rms = |chunk: &[i16]| {
            (chunk.iter().map(|s| (*s as f32).powi(2)).sum::<f32>() / chunk.len().max(1) as f32)
                .sqrt()
        };
        let chunks: Vec<f32> = self.samples.chunks(window).map(rms).collect();
        let first = chunks.iter().position(|value| *value > limit);
        let last = chunks.iter().rposition(|value| *value > limit);
        let duration = self.duration_secs();
        let secs = |chunk: usize| chunk as f32 * window as f32 / self.sample_rate as f32;
        match (first, last) {
            (Some(first), Some(last)) => {
                // Internal pauses: at least 80 ms below the threshold between voiced parts.
                let mut pauses = Vec::new();
                let mut quiet_from: Option<usize> = None;
                for (index, value) in chunks.iter().enumerate().take(last + 1).skip(first) {
                    match (*value <= limit, quiet_from) {
                        (true, None) => quiet_from = Some(index),
                        (false, Some(from)) => {
                            if index - from >= MIN_PAUSE_WINDOWS {
                                pauses.push((secs(from), secs(index)));
                            }
                            quiet_from = None;
                        }
                        _ => {}
                    }
                }
                SegmentAudio {
                    duration_secs: duration,
                    leading_silence_secs: secs(first),
                    trailing_silence_secs: secs(chunks.len() - 1 - last).max(0.0),
                    pauses,
                }
            }
            _ => SegmentAudio {
                duration_secs: duration,
                leading_silence_secs: 0.0,
                trailing_silence_secs: 0.0,
                pauses: Vec::new(),
            },
        }
    }

    pub fn peak(&self) -> f32 {
        self.samples
            .iter()
            .map(|sample| (*sample as f32).abs() / 32767.0)
            .fold(0.0, f32::max)
    }

    pub fn read(path: &Path) -> Result<Self> {
        let bytes = std::fs::read(path)?;
        Self::from_wav(&bytes).ok_or_else(|| {
            FramechesterError::InvalidInput(format!(
                "WAV PCM 16-bit mono esperado em {}",
                path.display()
            ))
        })
    }

    pub fn from_wav(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
            return None;
        }
        let mut offset = 12usize;
        let mut sample_rate = 0u32;
        let mut channels = 0u16;
        let mut bits = 0u16;
        let mut data: Option<&[u8]> = None;
        while offset + 8 <= bytes.len() {
            let id = &bytes[offset..offset + 4];
            let size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?) as usize;
            let payload = offset + 8;
            let end = (payload + size).min(bytes.len());
            if id == b"fmt " && size >= 16 {
                channels = u16::from_le_bytes([bytes[payload + 2], bytes[payload + 3]]);
                sample_rate = u32::from_le_bytes(bytes[payload + 4..payload + 8].try_into().ok()?);
                bits = u16::from_le_bytes([bytes[payload + 14], bytes[payload + 15]]);
            } else if id == b"data" {
                data = Some(&bytes[payload..end]);
                break;
            }
            offset = payload + size + (size % 2);
        }
        let data = data?;
        if sample_rate == 0 || channels == 0 || bits != 16 {
            return None;
        }
        let frames = data.chunks_exact(2 * channels as usize);
        let samples: Vec<i16> = frames
            .map(|frame| {
                // Downmix by averaging channels.
                let sum: i32 = frame
                    .chunks_exact(2)
                    .map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as i32)
                    .sum();
                (sum / channels as i32) as i16
            })
            .collect();
        Some(Self {
            sample_rate,
            samples,
        })
    }

    pub fn to_wav(&self) -> Vec<u8> {
        let data_size = (self.samples.len() * 2) as u32;
        let mut bytes = Vec::with_capacity(44 + data_size as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&self.sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(self.sample_rate * 2).to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        for sample in &self.samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        bytes
    }

    pub fn write(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, self.to_wav())?;
        Ok(())
    }
}

/// A soft transition sound: band-limited noise with a short attack and an exponential
/// decay, deterministic (fixed LCG seed) so renders are reproducible.
pub fn transition_sfx(sample_rate: u32, seconds: f32, gain: f32) -> Pcm {
    let count = (sample_rate as f32 * seconds).round() as usize;
    let mut state: u32 = 0x9E37_79B9;
    let mut low = 0.0f32;
    let mut band = 0.0f32;
    let mut samples = Vec::with_capacity(count);
    for index in 0..count {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let noise = ((state >> 9) as f32 / (1u32 << 23) as f32) - 1.0;
        // Two one-pole filters make a gentle "whoosh" instead of white hiss.
        low += 0.08 * (noise - low);
        band += 0.3 * (low - band);
        let t = index as f32 / count.max(1) as f32;
        let envelope = (t / 0.12).min(1.0) * (-(t - 0.12).max(0.0) * 5.5).exp();
        samples.push((band * envelope * gain * 32767.0).clamp(-32767.0, 32767.0) as i16);
    }
    Pcm {
        sample_rate,
        samples,
    }
}

/// Export loudness targets; configurable, validated by `qa`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct LoudnessTarget {
    /// Integrated loudness in LUFS (e.g. -14 for YouTube-style platforms).
    pub integrated_lufs: f32,
    /// Maximum true peak in dBTP.
    pub true_peak_dbtp: f32,
    /// Loudness range target in LU.
    pub range_lu: f32,
}

impl Default for LoudnessTarget {
    fn default() -> Self {
        Self {
            integrated_lufs: -14.0,
            true_peak_dbtp: -1.5,
            range_lu: 9.0,
        }
    }
}

/// Mix inputs: the narration track plus optional licensed music.
#[derive(Debug, Clone)]
pub struct MixPlan {
    pub voice: PathBuf,
    pub music: Option<PathBuf>,
    /// Music gain in dB relative to full scale before ducking.
    pub music_gain_db: f32,
    pub target: LoudnessTarget,
    pub ffmpeg: String,
}

/// First-pass loudnorm measurements.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct LoudnessMeasurement {
    pub input_i: String,
    pub input_tp: String,
    pub input_lra: String,
    pub input_thresh: String,
    pub target_offset: String,
}

fn run_ffmpeg(ffmpeg: &str, args: &[String]) -> Result<std::process::Output> {
    let output = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostats", "-y"])
        .args(args)
        .output()
        .map_err(|error| {
            FramechesterError::Unavailable(format!("falha ao executar {ffmpeg}: {error}"))
        })?;
    if !output.status.success() {
        return Err(FramechesterError::External(format!(
            "ffmpeg (audio) falhou: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(500)
                .collect::<String>()
        )));
    }
    Ok(output)
}

/// Extracts the JSON block `loudnorm` prints at the end of a first pass.
pub fn parse_loudnorm(stderr: &str) -> Option<LoudnessMeasurement> {
    let start = stderr.rfind('{')?;
    let end = stderr[start..].find('}')? + start;
    serde_json::from_str(&stderr[start..=end]).ok()
}

/// The filter graph of the mix: voice (optionally ducking the music) then loudnorm.
fn mix_filter(plan: &MixPlan, measured: Option<&LoudnessMeasurement>) -> String {
    let target = plan.target;
    let mut loudnorm = format!(
        "loudnorm=I={}:TP={}:LRA={}:print_format=json",
        target.integrated_lufs, target.true_peak_dbtp, target.range_lu
    );
    if let Some(measured) = measured {
        loudnorm.push_str(&format!(
            ":measured_I={}:measured_TP={}:measured_LRA={}:measured_thresh={}:offset={}:linear=true",
            measured.input_i, measured.input_tp, measured.input_lra, measured.input_thresh, measured.target_offset
        ));
    }
    let limiter = format!(
        "alimiter=limit={:.4}:attack=5:release=50:level=false",
        10f32.powf((target.true_peak_dbtp - 0.3) / 20.0)
    );
    match &plan.music {
        Some(_) => format!(
            "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={}dB,aloop=loop=-1:size=2e9[music];\
             [0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[voice][side];\
             [music][side]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=600:makeup=1[ducked];\
             [voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,{loudnorm},{limiter},aresample=48000[out]",
            plan.music_gain_db
        ),
        None => format!("[0:a]aformat=sample_rates=48000:channel_layouts=stereo,{loudnorm},{limiter},aresample=48000[out]"),
    }
}

/// Mixes and normalizes in two passes; writes a 48 kHz stereo WAV and returns the first
/// and second pass measurements for the manifest and QA.
pub fn mix(plan: &MixPlan, output: &Path) -> Result<(LoudnessMeasurement, LoudnessMeasurement)> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut inputs = vec!["-i".to_string(), plan.voice.to_string_lossy().to_string()];
    if let Some(music) = &plan.music {
        if !music.is_file() {
            return Err(FramechesterError::InvalidInput(format!(
                "musica ausente: {}",
                music.display()
            )));
        }
        inputs.extend(["-i".to_string(), music.to_string_lossy().to_string()]);
    }
    let first_pass = run_ffmpeg(
        &plan.ffmpeg,
        &[
            inputs.clone(),
            vec![
                "-filter_complex".into(),
                mix_filter(plan, None),
                "-map".into(),
                "[out]".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ],
        ]
        .concat(),
    )?;
    let measured =
        parse_loudnorm(&String::from_utf8_lossy(&first_pass.stderr)).ok_or_else(|| {
            FramechesterError::External(
                "loudnorm nao devolveu medicoes na primeira passagem".into(),
            )
        })?;
    let second_pass = run_ffmpeg(
        &plan.ffmpeg,
        &[
            inputs,
            vec![
                "-filter_complex".into(),
                mix_filter(plan, Some(&measured)),
                "-map".into(),
                "[out]".into(),
                "-c:a".into(),
                "pcm_s16le".into(),
                output.to_string_lossy().to_string(),
            ],
        ]
        .concat(),
    )?;
    let applied =
        parse_loudnorm(&String::from_utf8_lossy(&second_pass.stderr)).ok_or_else(|| {
            FramechesterError::External("loudnorm nao devolveu medicoes na segunda passagem".into())
        })?;
    Ok((measured, applied))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_round_trip_and_silence_measurement() {
        let mut pcm = Pcm::silence(24_000, 0.2);
        let tone = Pcm {
            sample_rate: 24_000,
            samples: (0..24_000)
                .map(|index| ((index as f32 * 0.1).sin() * 12_000.0) as i16)
                .collect(),
        };
        pcm.append(&tone).unwrap();
        pcm.append(&Pcm::silence(24_000, 0.3)).unwrap();
        let bytes = pcm.to_wav();
        let back = Pcm::from_wav(&bytes).unwrap();
        assert_eq!(back, pcm);
        let measured = back.measure(0.01);
        assert!(
            (measured.leading_silence_secs - 0.2).abs() < 0.02,
            "{measured:?}"
        );
        assert!(
            (measured.trailing_silence_secs - 0.3).abs() < 0.02,
            "{measured:?}"
        );
        assert!((measured.duration_secs - 1.5).abs() < 1e-3);
    }

    #[test]
    fn internal_pauses_are_measured_and_short_dips_are_not() {
        let tone = |seconds: f32| Pcm {
            sample_rate: 24_000,
            samples: (0..(24_000.0 * seconds) as usize)
                .map(|index| ((index as f32 * 0.1).sin() * 12_000.0) as i16)
                .collect(),
        };
        let mut pcm = Pcm::silence(24_000, 0.1);
        pcm.append(&tone(0.5)).unwrap();
        pcm.append(&Pcm::silence(24_000, 0.25)).unwrap(); // comma pause
        pcm.append(&tone(0.5)).unwrap();
        pcm.append(&Pcm::silence(24_000, 0.05)).unwrap(); // between syllables
        pcm.append(&tone(0.5)).unwrap();
        let measured = pcm.measure(0.01);
        assert_eq!(measured.pauses.len(), 1, "{measured:?}");
        let (start, end) = measured.pauses[0];
        assert!(
            (start - 0.6).abs() < 0.02 && (end - 0.85).abs() < 0.02,
            "{measured:?}"
        );
    }

    #[test]
    fn sfx_is_deterministic_short_and_quiet() {
        let a = transition_sfx(48_000, 0.3, 0.3);
        let b = transition_sfx(48_000, 0.3, 0.3);
        assert_eq!(a, b);
        assert!(a.peak() <= 0.35 && a.peak() > 0.02, "{}", a.peak());
        let mut bed = Pcm::silence(48_000, 1.0);
        bed.mix_at(&a, 0.9, 1.0);
        assert!((bed.duration_secs() - 1.2).abs() < 1e-3);
    }

    #[test]
    fn parses_loudnorm_json_from_stderr() {
        let stderr = "[Parsed_loudnorm_0 @ 0x1] \n{\n\t\"input_i\" : \"-23.5\",\n\t\"input_tp\" : \"-5.1\",\n\t\"input_lra\" : \"4.2\",\n\t\"input_thresh\" : \"-33.7\",\n\t\"output_i\" : \"-14.0\",\n\t\"output_tp\" : \"-1.5\",\n\t\"output_lra\" : \"4.0\",\n\t\"output_thresh\" : \"-24.1\",\n\t\"normalization_type\" : \"dynamic\",\n\t\"target_offset\" : \"0.3\"\n}\n";
        let measured = parse_loudnorm(stderr).unwrap();
        assert_eq!(measured.input_i, "-23.5");
        assert_eq!(measured.target_offset, "0.3");
        let plan = MixPlan {
            voice: "v.wav".into(),
            music: None,
            music_gain_db: -22.0,
            target: LoudnessTarget::default(),
            ffmpeg: "ffmpeg".into(),
        };
        let filter = mix_filter(&plan, Some(&measured));
        assert!(filter.contains("measured_I=-23.5"));
        assert!(filter.contains("I=-14:TP=-1.5"));
        assert!(filter.contains("alimiter=limit=0.8128"));
    }
}
