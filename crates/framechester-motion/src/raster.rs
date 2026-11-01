//! Frame rasterization with resvg and streaming into FFmpeg as raw RGBA. Frames are
//! rendered in parallel batches and written in order; FFmpeg encodes the silent video
//! track, which `render` later muxes with the mixed audio.
use crate::text::Typesetter;
use framechester_core::error::{FramechesterError, Result};
use resvg::{tiny_skia, usvg};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct Rasterizer<'a> {
    typesetter: &'a Typesetter,
    pub width: u32,
    pub height: u32,
}

impl<'a> Rasterizer<'a> {
    pub fn new(typesetter: &'a Typesetter, width: u32, height: u32) -> Self {
        Self {
            typesetter,
            width,
            height,
        }
    }

    pub fn render(&self, svg: &str) -> Result<tiny_skia::Pixmap> {
        let tree = usvg::Tree::from_str(svg, self.typesetter.options())
            .map_err(|error| FramechesterError::External(format!("svg invalido: {error}")))?;
        let mut pixmap = tiny_skia::Pixmap::new(self.width, self.height).ok_or_else(|| {
            FramechesterError::Unavailable("memoria insuficiente para o frame".into())
        })?;
        resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
        Ok(pixmap)
    }

    pub fn save_png(&self, svg: &str, path: &Path) -> Result<()> {
        let pixmap = self.render(svg)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        pixmap
            .save_png(path)
            .map_err(|error| FramechesterError::External(error.to_string()))
    }
}

/// Encoder settings for the silent video track.
#[derive(Debug, Clone)]
pub struct EncodeProfile {
    pub ffmpeg: String,
    pub fps: u32,
    pub video_codec: String,
    pub crf: u32,
    pub preset: String,
    /// Worker threads for rasterization; 0 means the number of CPUs.
    pub threads: usize,
}

/// Streams `frames` frames produced by `svg_at(index)` into FFmpeg. Returns the number of
/// frames written. `svg_at` runs on several threads at once.
pub fn encode_frames(
    rasterizer: &Rasterizer<'_>,
    profile: &EncodeProfile,
    frames: usize,
    output: &Path,
    svg_at: &(dyn Fn(usize) -> String + Sync),
) -> Result<usize> {
    if frames == 0 {
        return Err(FramechesterError::InvalidInput(
            "nenhum frame para codificar".into(),
        ));
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let log_path = output.with_extension("encode.log");
    let log = std::fs::File::create(&log_path)?;
    let mut child = Command::new(&profile.ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            &format!("{}x{}", rasterizer.width, rasterizer.height),
            "-r",
            &profile.fps.to_string(),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            &profile.video_codec,
            "-preset",
            &profile.preset,
            "-crf",
            &profile.crf.to_string(),
            "-pix_fmt",
            "yuv420p",
            // Reels refuse edit lists ('no edit lists' in the Instagram video spec).
            "-use_editlist",
            "0",
            "-movflags",
            "+faststart",
        ])
        .arg(output)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(|error| {
            FramechesterError::Unavailable(format!("falha ao executar {}: {error}", profile.ffmpeg))
        })?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| FramechesterError::External("stdin do ffmpeg indisponivel".into()))?;
    let workers = if profile.threads == 0 {
        std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(2)
            .clamp(1, 8)
    } else {
        profile.threads
    };
    let batch = workers * 2;
    let mut written = 0usize;
    let mut failure: Option<FramechesterError> = None;
    let mut start = 0usize;
    while start < frames && failure.is_none() {
        let end = (start + batch).min(frames);
        let indices: Vec<usize> = (start..end).collect();
        let results: Vec<Result<tiny_skia::Pixmap>> = std::thread::scope(|scope| {
            let handles: Vec<_> = indices
                .chunks(indices.len().div_ceil(workers).max(1))
                .map(|chunk| {
                    scope.spawn(move || {
                        chunk
                            .iter()
                            .map(|index| rasterizer.render(&svg_at(*index)))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles
                .into_iter()
                .flat_map(|handle| {
                    handle.join().unwrap_or_else(|_| {
                        vec![Err(FramechesterError::External(
                            "thread de render falhou".into(),
                        ))]
                    })
                })
                .collect()
        });
        for result in results {
            match result {
                Ok(pixmap) => {
                    if let Err(error) = stdin.write_all(pixmap.data()) {
                        failure = Some(FramechesterError::External(format!(
                            "ffmpeg fechou a entrada no frame {written}: {error}"
                        )));
                        break;
                    }
                    written += 1;
                }
                Err(error) => {
                    failure = Some(error);
                    break;
                }
            }
        }
        start = end;
    }
    drop(stdin);
    let status = child.wait()?;
    if let Some(error) = failure {
        return Err(error);
    }
    if !status.success() {
        let log_text = std::fs::read_to_string(&log_path).unwrap_or_default();
        return Err(FramechesterError::External(format!(
            "ffmpeg falhou ao codificar frames: {}",
            log_text.chars().take(400).collect::<String>()
        )));
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a_frame_with_text() {
        let typesetter = Typesetter::new().unwrap();
        let rasterizer = Rasterizer::new(&typesetter, 64, 32);
        let pixmap = rasterizer
            .render("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='32'><rect width='100%' height='100%' fill='#000'/><text x='2' y='24' font-size='20' fill='#fff' font-family='Inter'>Hi</text></svg>")
            .unwrap();
        let lit = pixmap
            .pixels()
            .iter()
            .filter(|pixel| pixel.red() > 100)
            .count();
        assert!(lit > 10, "text was drawn: {lit} pixels");
    }
}
