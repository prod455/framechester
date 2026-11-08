//! FFmpeg side of a music-channel video: the tracks crossfaded into one soundtrack, and
//! a picture that keeps moving for hours (a slow drift over the cover, or a shifting
//! gradient without one), with the waveform of the music and the current track title.
//! The motion is what lets a long mix pass the freeze check of the technical QA.
use crate::ffmpeg::{find_font, require_success, run};
use framechester_core::domain::RenderProfile;
use framechester_core::error::{FramechesterError, Result};
use framechester_core::music::MusicMix;
use std::path::{Path, PathBuf};

/// Escapes a path for a filtergraph option value.
fn filter_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

/// Arguments that decode `inputs`, crossfade them in order and write a 48 kHz stereo WAV.
pub fn crossfade_args(inputs: &[PathBuf], crossfade_secs: f32, output: &Path) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    for input in inputs {
        args.extend(["-i".into(), input.to_string_lossy().to_string()]);
    }
    let mut graph: Vec<String> = (0..inputs.len())
        .map(|index| {
            format!("[{index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[s{index}]")
        })
        .collect();
    if crossfade_secs > 0.0 {
        let mut previous = "s0".to_string();
        for index in 1..inputs.len() {
            let next = format!("x{index}");
            graph.push(format!(
                "[{previous}][s{index}]acrossfade=d={crossfade_secs}:c1=tri:c2=tri[{next}]"
            ));
            previous = next;
        }
        graph.push(format!("[{previous}]anull[out]"));
    } else {
        let labels: String = (0..inputs.len())
            .map(|index| format!("[s{index}]"))
            .collect();
        graph.push(format!("{labels}concat=n={}:v=0:a=1[out]", inputs.len()));
    }
    args.extend([
        "-filter_complex".into(),
        graph.join(";"),
        "-map".into(),
        "[out]".into(),
        "-c:a".into(),
        "pcm_s16le".into(),
        output.to_string_lossy().to_string(),
    ]);
    args
}

#[derive(Debug, Clone)]
pub struct VideoPlan<'a> {
    pub audio: &'a Path,
    pub cover: Option<&'a Path>,
    /// One text file per chapter (same order as `mix.chapters()`), shown while it plays.
    pub title_files: &'a [PathBuf],
    pub font: Option<&'a Path>,
    pub mix: &'a MusicMix,
    pub profile: &'a RenderProfile,
}

/// The filtergraph: input 0 is the soundtrack, input 1 the cover when there is one.
pub fn video_filter(plan: &VideoPlan) -> String {
    let (w, h, fps) = (plan.profile.width, plan.profile.height, plan.profile.fps);
    let duration = plan.mix.duration_secs();
    let background = match plan.cover {
        // 12% larger than the frame, drifting on two slow sines (60 s and 90 s periods).
        Some(_) => {
            let (bw, bh) = (even(w as f32 * 1.12), even(h as f32 * 1.12));
            format!(
                "[1:v]scale={bw}:{bh}:force_original_aspect_ratio=increase,crop={bw}:{bh},\
                 crop={w}:{h}:x='(iw-ow)/2*(1+sin(2*PI*t/60))':y='(ih-oh)/2*(1+cos(2*PI*t/90))',\
                 setsar=1,format=yuv420p[bg]"
            )
        }
        // Computed at a quarter of the size: the gradient is smooth, upscaling is free.
        None => format!(
            "gradients=s={}x{}:r={fps}:d={duration:.3}:speed=0.004:nb_colors=3:\
             c0=0x1b1035:c1=0x0f3b57:c2=0x3d1f3a:type=linear,\
             scale={w}:{h}:flags=bicubic,setsar=1,format=yuv420p[bg]",
            even(w as f32 / 4.0),
            even(h as f32 / 4.0)
        ),
    };
    let wave_h = even(h as f32 / 6.0);
    let mut graph = vec![
        background,
        format!(
            "[0:a]showwaves=s={w}x{wave_h}:mode=cline:rate={fps}:colors=white@0.55:scale=sqrt,format=rgba[wave]"
        ),
        format!("[bg][wave]overlay=0:{}:format=auto[v0]", h - wave_h - h / 12),
    ];
    let mut last = "v0".to_string();
    if let Some(font) = plan.font {
        let chapters = plan.mix.chapters();
        for (index, (chapter, file)) in chapters.iter().zip(plan.title_files).enumerate() {
            let end = chapters
                .get(index + 1)
                .map(|next| next.start_secs)
                .unwrap_or(duration + 1.0);
            let next = format!("v{}", index + 1);
            graph.push(format!(
                "[{last}]drawtext=fontfile='{}':textfile='{}':fontsize={}:fontcolor=white@0.9:\
                 shadowcolor=black@0.6:shadowx=2:shadowy=2:x={}:y={}:\
                 enable='between(t,{:.3},{:.3})'[{next}]",
                filter_path(font),
                filter_path(file),
                h / 24,
                w / 20,
                h / 12,
                chapter.start_secs,
                end
            ));
            last = next;
        }
    }
    graph.push(format!("[{last}]format=yuv420p[v]"));
    graph.join(";")
}

fn even(value: f32) -> u32 {
    (value.round() as u32 / 2 * 2).max(2)
}

pub fn video_args(plan: &VideoPlan, output: &Path) -> Vec<String> {
    let profile = plan.profile;
    let mut args = vec!["-i".into(), plan.audio.to_string_lossy().to_string()];
    if let Some(cover) = plan.cover {
        args.extend([
            "-loop".into(),
            "1".into(),
            "-framerate".into(),
            profile.fps.to_string(),
            "-i".into(),
            cover.to_string_lossy().to_string(),
        ]);
    }
    args.extend([
        "-filter_complex".into(),
        video_filter(plan),
        "-map".into(),
        "[v]".into(),
        "-map".into(),
        "0:a".into(),
        "-r".into(),
        profile.fps.to_string(),
        "-c:v".into(),
        profile.video_codec.clone(),
        "-preset".into(),
        profile.preset.clone(),
        "-crf".into(),
        profile.crf.to_string(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        format!("{}k", profile.audio_bitrate_kbps),
        "-t".into(),
        format!("{:.3}", plan.mix.duration_secs()),
        "-movflags".into(),
        "+faststart".into(),
        output.to_string_lossy().to_string(),
    ]);
    args
}

pub fn crossfade(
    ffmpeg: &str,
    inputs: &[PathBuf],
    crossfade_secs: f32,
    output: &Path,
) -> Result<()> {
    for input in inputs {
        if !input.is_file() {
            return Err(FramechesterError::NotFound(input.display().to_string()));
        }
    }
    let mut args = vec!["-hide_banner".into(), "-nostats".into(), "-y".into()];
    args.extend(crossfade_args(inputs, crossfade_secs, output));
    require_success(run(ffmpeg, &args, None)?, "crossfade das faixas")?;
    Ok(())
}

/// Writes one title file per chapter in `dir` and renders the video.
pub fn render_video(
    ffmpeg: &str,
    audio: &Path,
    cover: Option<&Path>,
    mix: &MusicMix,
    profile: &RenderProfile,
    dir: &Path,
    output: &Path,
) -> Result<()> {
    if let Some(cover) = cover {
        if !cover.is_file() {
            return Err(FramechesterError::NotFound(cover.display().to_string()));
        }
    }
    let font = find_font();
    let titles_dir = dir.join("titles");
    std::fs::create_dir_all(&titles_dir)?;
    let mut title_files = Vec::new();
    for (index, chapter) in mix.chapters().iter().enumerate() {
        let file = titles_dir.join(format!("{index:03}.txt"));
        std::fs::write(&file, &chapter.title)?;
        title_files.push(file);
    }
    let plan = VideoPlan {
        audio,
        cover,
        title_files: &title_files,
        font: font.as_deref(),
        mix,
        profile,
    };
    let mut args = vec!["-hide_banner".into(), "-nostats".into(), "-y".into()];
    args.extend(video_args(&plan, output));
    require_success(run(ffmpeg, &args, None)?, "render do video musical")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::music::{MusicTrack, TrackSource};

    fn mix() -> MusicMix {
        let track = |id: &str| MusicTrack {
            id: id.into(),
            title: format!("Faixa {id}"),
            file: format!("generated/{id}.flac").into(),
            sha256: id.into(),
            duration_secs: 60.0,
            source: TrackSource::Generated {
                engine: "ace-step".into(),
                models: vec!["acestep-v15-turbo".into()],
                prompt: "ambient".into(),
                seed: 1,
            },
        };
        MusicMix::new(vec![track("a"), track("b"), track("c")], 4.0).unwrap()
    }

    fn profile() -> RenderProfile {
        RenderProfile {
            width: 1920,
            height: 1080,
            fps: 30,
            video_codec: "libx264".into(),
            crf: 20,
            preset: "veryfast".into(),
            audio_bitrate_kbps: 192,
        }
    }

    #[test]
    fn crossfade_chains_every_track_in_order() {
        let inputs: Vec<PathBuf> = ["a.flac", "b.flac", "c.flac"].map(PathBuf::from).to_vec();
        let graph = crossfade_args(&inputs, 4.0, Path::new("mix.wav"))
            .into_iter()
            .find(|arg| arg.contains("acrossfade"))
            .unwrap();
        assert!(graph.contains("[s0][s1]acrossfade=d=4:c1=tri:c2=tri[x1]"));
        assert!(graph.contains("[x1][s2]acrossfade=d=4:c1=tri:c2=tri[x2]"));
        assert!(graph.ends_with("[x2]anull[out]"));
        let concat = crossfade_args(&inputs, 0.0, Path::new("mix.wav")).join(" ");
        assert!(concat.contains("[s0][s1][s2]concat=n=3:v=0:a=1[out]"));
    }

    #[test]
    fn video_moves_shows_waveform_and_one_title_per_chapter() {
        let mix = mix();
        let profile = profile();
        let titles: Vec<PathBuf> = ["t0.txt", "t1.txt", "t2.txt"].map(PathBuf::from).to_vec();
        let font = PathBuf::from("C:/Fonts/f.ttf");
        let plan = VideoPlan {
            audio: Path::new("mix.wav"),
            cover: Some(Path::new("cover.png")),
            title_files: &titles,
            font: Some(&font),
            mix: &mix,
            profile: &profile,
        };
        let graph = video_filter(&plan);
        assert!(graph.contains("scale=2150:1210"), "{graph}");
        assert!(graph.contains("sin(2*PI*t/60)"));
        assert!(graph.contains("showwaves=s=1920x180"));
        assert_eq!(graph.matches("drawtext=").count(), 3);
        assert!(graph.contains("fontfile='C\\:/Fonts/f.ttf'"));
        assert!(graph.contains("enable='between(t,56.000,112.000)'"));
        assert!(graph.ends_with("[v3]format=yuv420p[v]"));
        let args = video_args(&plan, Path::new("final.mp4"));
        let at = |flag: &str| args[args.iter().position(|arg| arg == flag).unwrap() + 1].clone();
        assert_eq!(at("-t"), "172.000");
        assert_eq!(at("-c:v"), "libx264");
        assert_eq!(at("-loop"), "1");

        let plain = VideoPlan {
            cover: None,
            font: None,
            ..plan
        };
        let graph = video_filter(&plain);
        assert!(
            graph.starts_with("gradients=s=480x270:r=30:d=172.000"),
            "{graph}"
        );
        assert!(!graph.contains("drawtext"));
        assert!(graph.ends_with("[v0]format=yuv420p[v]"));
        assert!(!video_args(&plain, Path::new("final.mp4")).contains(&"-loop".to_string()));
    }
}
