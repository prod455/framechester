//! `music`: the music-channel path. Tracks enter a per-channel library only with a
//! cleared source (generated locally by ACE-Step 1.5, or a CC0/PDM/CC BY hit from
//! Openverse); `music mix` crossfades library tracks into a long video with chapters,
//! credits and AI disclosure, then runs the technical QA. Nothing is published.
use crate::cli::{load_config, MusicArgs, MusicCommand};
use crate::commands::produce::valid_episode_slug;
use crate::commands::report::print_qa;
use anyhow::{bail, Context};
use framechester_adapters::acestep::{AceStepClient, GenerationRequest};
use framechester_adapters::ffmpeg::{inspect_output, probe_duration, probe_json, FfmpegQa};
use framechester_adapters::music_video;
use framechester_adapters::openverse::OpenverseClient;
use framechester_core::config::Config;
use framechester_core::domain::{QaStatus, ScriptFormat};
use framechester_core::music::{slug, Clearance, MusicLibrary, MusicMix, MusicTrack, TrackSource};
use framechester_motion::audio::{mix as normalize, LoudnessTarget, MixPlan};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

struct ChannelMusic {
    language: String,
    ffprobe: String,
    channel_dir: PathBuf,
    music_dir: PathBuf,
}

impl ChannelMusic {
    fn open(config: &Config, channel: &str) -> anyhow::Result<Self> {
        let profile = config
            .select_channel(Some(channel))?
            .context("canal nao cadastrado")?;
        let channel_dir = profile.scoped_workdir(&config.workdir_path())?;
        Ok(Self {
            language: profile.language().to_string(),
            ffprobe: config.render.ffprobe_path.clone(),
            music_dir: channel_dir.join("music"),
            channel_dir,
        })
    }

    fn library_path(&self) -> PathBuf {
        self.music_dir.join("library.json")
    }

    fn load(&self) -> anyhow::Result<MusicLibrary> {
        let path = self.library_path();
        if !path.is_file() {
            return Ok(MusicLibrary::default());
        }
        let text = std::fs::read_to_string(&path)?;
        serde_json::from_str(&text).with_context(|| format!("JSON invalido em {}", path.display()))
    }

    fn save(&self, library: &MusicLibrary) -> anyhow::Result<()> {
        std::fs::create_dir_all(&self.music_dir)?;
        let path = self.library_path();
        let temporary = path.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_string_pretty(library)?)?;
        std::fs::rename(&temporary, &path)?;
        Ok(())
    }

    /// Writes the audio, measures it and adds it to the library; the file is removed
    /// again when the library refuses the track.
    fn store(
        &self,
        library: &mut MusicLibrary,
        title: &str,
        subdir: &str,
        extension: &str,
        bytes: &[u8],
        source: TrackSource,
    ) -> anyhow::Result<MusicTrack> {
        let id = unique_id(library, &slug(title));
        let file = PathBuf::from(subdir).join(format!("{id}.{extension}"));
        let path = self.music_dir.join(&file);
        std::fs::create_dir_all(path.parent().expect("file has a parent"))?;
        std::fs::write(&path, bytes)?;
        let added = (|| -> anyhow::Result<MusicTrack> {
            let probe = probe_json(&self.ffprobe, &path)?;
            let duration_secs = probe_duration(&probe)
                .filter(|secs| *secs > 0.0)
                .context("ffprobe nao leu a duracao do audio")?;
            let track = MusicTrack {
                id,
                title: title.to_string(),
                file,
                sha256: hex(&Sha256::digest(bytes)),
                duration_secs,
                source,
            };
            library.add(track.clone())?;
            self.save(library)?;
            Ok(track)
        })();
        if added.is_err() {
            let _ = std::fs::remove_file(&path);
        }
        added
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn unique_id(library: &MusicLibrary, base: &str) -> String {
    let taken = |id: &str| library.tracks.iter().any(|track| track.id == id);
    if !taken(base) {
        return base.to_string();
    }
    (2..)
        .map(|n| format!("{base}-{n}"))
        .find(|id| !taken(id))
        .expect("unbounded range")
}

/// Fixed seed per prompt and position, so the same command regenerates the same tracks.
fn derived_seed(prompt: &str, index: u32) -> i64 {
    let digest = Sha256::digest(format!("{prompt}\n{index}").as_bytes());
    i64::from(u32::from_be_bytes(digest[..4].try_into().expect("4 bytes")) >> 1)
}

pub(crate) fn music(path: &Option<PathBuf>, args: MusicArgs) -> anyhow::Result<i32> {
    let config = load_config(path)?;
    let channel = ChannelMusic::open(&config, &args.channel)?;
    match args.command {
        MusicCommand::Generate {
            prompt,
            title,
            count,
            duration,
            seed,
            steps,
        } => {
            let client = AceStepClient::from_config(&config.music)?;
            let mut library = channel.load()?;
            for index in 0..count {
                let seed = seed
                    .map(|seed| seed + i64::from(index))
                    .unwrap_or_else(|| derived_seed(&prompt, index));
                let request = GenerationRequest {
                    prompt: prompt.clone(),
                    duration_secs: duration,
                    seed,
                    inference_steps: steps,
                };
                let title = if count > 1 {
                    format!("{title} {}", index + 1)
                } else {
                    title.clone()
                };
                eprintln!("gerando {title} ({duration:.0}s, seed {seed})...");
                let audio = client.generate(&request)?;
                let track = channel.store(
                    &mut library,
                    &title,
                    "generated",
                    audio.format,
                    &audio.bytes,
                    TrackSource::Generated {
                        engine: "ace-step-1.5".into(),
                        models: audio.models,
                        prompt: prompt.clone(),
                        seed: audio.seed,
                    },
                )?;
                println!(
                    "{} | {:.0}s | {}",
                    track.id,
                    track.duration_secs,
                    track.file.display()
                );
            }
            Ok(0)
        }
        MusicCommand::Search { query, limit, take } => {
            let client = OpenverseClient::new(&config.music.openverse_url)?;
            let (hits, skipped) = client.search(&query, limit)?;
            for line in &skipped {
                eprintln!("descartado {line}");
            }
            let mut library = channel.load()?;
            for (index, hit) in hits.iter().enumerate() {
                let duration = hit
                    .duration_secs
                    .map(|secs| format!("{secs:.0}s"))
                    .unwrap_or_else(|| "?".into());
                println!(
                    "{:>2}. {} - {} | {} | {duration} | {}",
                    index + 1,
                    hit.title,
                    hit.creator,
                    hit.license.label(),
                    hit.landing_url
                );
                if index < take {
                    let bytes = client.download(hit)?;
                    let extension = hit.filetype.as_deref().unwrap_or("mp3");
                    if !extension.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
                        bail!("tipo de arquivo inesperado: {extension}");
                    }
                    let track = channel.store(
                        &mut library,
                        &hit.title,
                        "library",
                        extension,
                        &bytes,
                        hit.source(),
                    )?;
                    println!("    adicionada como {}", track.id);
                }
            }
            if hits.is_empty() {
                println!("nenhuma faixa monetizavel encontrada");
            }
            Ok(0)
        }
        MusicCommand::List { json } => {
            let library = channel.load()?;
            if json {
                println!("{}", serde_json::to_string_pretty(&library)?);
                return Ok(0);
            }
            for track in &library.tracks {
                let origin = match &track.source {
                    TrackSource::Generated { models, .. } => format!("IA {}", models.join("+")),
                    TrackSource::Library {
                        provider, license, ..
                    } => format!("{provider} {}", license.label()),
                };
                let status = match track.clearance() {
                    Clearance::Clear { attribution: None } => "liberada".to_string(),
                    Clearance::Clear {
                        attribution: Some(_),
                    } => "liberada com credito".to_string(),
                    Clearance::Refused(reason) => format!("RECUSADA: {reason}"),
                };
                println!(
                    "{} | {} | {:.0}s | {origin} | {status}",
                    track.id, track.title, track.duration_secs
                );
            }
            Ok(0)
        }
        MusicCommand::Mix {
            episode,
            tracks,
            cover,
            crossfade,
            json,
        } => mix(
            &config,
            &channel,
            &episode,
            &tracks,
            cover.as_deref(),
            crossfade,
            json,
        ),
    }
}

fn mix(
    config: &Config,
    channel: &ChannelMusic,
    episode: &str,
    ids: &[String],
    cover: Option<&Path>,
    crossfade: Option<f32>,
    json: bool,
) -> anyhow::Result<i32> {
    if !valid_episode_slug(episode) {
        bail!("--episode deve ser slug a-z, 0-9 e hifen");
    }
    let dir = channel.channel_dir.join("music-mixes").join(episode);
    let video = dir.join("final.mp4");
    if video.exists() {
        bail!("{} ja existe; use outro --episode", video.display());
    }
    let library = channel.load()?;
    let mix = MusicMix::new(
        library.select(ids)?,
        crossfade.unwrap_or(config.music.crossfade_secs),
    )?;
    std::fs::create_dir_all(&dir)?;
    let inputs: Vec<PathBuf> = mix
        .tracks
        .iter()
        .map(|track| channel.music_dir.join(&track.file))
        .collect();
    let ffmpeg = &config.render.ffmpeg_path;
    eprintln!(
        "mixando {} faixas ({:.1} min)...",
        mix.tracks.len(),
        mix.duration_secs() / 60.0
    );
    let raw = dir.join("crossfade.wav");
    music_video::crossfade(ffmpeg, &inputs, mix.crossfade_secs, &raw)?;
    let soundtrack = dir.join("soundtrack.wav");
    let loudness = normalize(
        &MixPlan {
            voice: raw.clone(),
            music: None,
            music_gain_db: 0.0,
            target: LoudnessTarget {
                integrated_lufs: config.audio.target_lufs,
                true_peak_dbtp: config.audio.true_peak_dbtp,
                range_lu: config.audio.loudness_range_lu,
            },
            ffmpeg: ffmpeg.clone(),
        },
        &soundtrack,
    );
    std::fs::remove_file(&raw).ok();
    let (measured, applied) = loudness?;
    let profile = config.render_profile_for(ScriptFormat::Long);
    eprintln!("renderizando {}...", video.display());
    let rendered =
        music_video::render_video(ffmpeg, &soundtrack, cover, &mix, &profile, &dir, &video);
    std::fs::remove_file(&soundtrack).ok();
    rendered?;
    let description = mix.description(&channel.language);
    std::fs::write(dir.join("description.txt"), &description)?;
    let output = inspect_output(&config.render.ffprobe_path, &video, &profile)?;
    let qa = FfmpegQa::new(ffmpeg, &config.render.ffprobe_path).technical(&output, &profile)?;
    let manifest = serde_json::json!({
        "episode": episode,
        "video": video,
        "duration_secs": mix.duration_secs(),
        "crossfade_secs": mix.crossfade_secs,
        "tracks": mix.tracks,
        "chapters": mix.chapters(),
        "loudness": { "measured": measured, "applied": applied },
        "technical_qa": qa,
        "published": false,
    });
    std::fs::write(
        dir.join("mix.json"),
        serde_json::to_string_pretty(&manifest)?,
    )?;
    if json {
        println!("{}", serde_json::to_string_pretty(&manifest)?);
    } else {
        println!(
            "video: {} | {:.1} min | {} faixas",
            video.display(),
            mix.duration_secs() / 60.0,
            mix.tracks.len()
        );
        println!("descricao: {}", dir.join("description.txt").display());
        print_qa(&qa);
    }
    Ok(match qa.overall() {
        QaStatus::Fail => 2,
        QaStatus::NeedsHuman => 1,
        _ => 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_are_stable_and_distinct_per_position() {
        assert_eq!(derived_seed("lofi", 0), derived_seed("lofi", 0));
        assert_ne!(derived_seed("lofi", 0), derived_seed("lofi", 1));
        assert!(derived_seed("lofi", 3) >= 0);
    }

    #[test]
    fn ids_get_a_suffix_instead_of_colliding() {
        let mut library = MusicLibrary::default();
        assert_eq!(unique_id(&library, "chuva"), "chuva");
        library.tracks.push(MusicTrack {
            id: "chuva".into(),
            title: "Chuva".into(),
            file: "generated/chuva.flac".into(),
            sha256: "x".into(),
            duration_secs: 60.0,
            source: TrackSource::Generated {
                engine: "ace-step-1.5".into(),
                models: vec!["acestep-v15-turbo".into()],
                prompt: "rain".into(),
                seed: 1,
            },
        });
        assert_eq!(unique_id(&library, "chuva"), "chuva-2");
    }
}
