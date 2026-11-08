//! Client of a local ACE-Step 1.5 REST server (`uv run acestep-api`, default port 8001):
//! submit with `POST /release_task`, poll `POST /query_result` (status 0 running,
//! 1 done, 2 failed), download from the `file` URL of the result. Documented in
//! docs/en/API.md of github.com/ace-step/ACE-Step-1.5, read 2026-11-08.
//!
//! The server must be loopback (`config::is_loopback_url`): prompts and audio never
//! leave the machine. The models the server reports are kept in the track source, so
//! `music::MusicTrack::clearance` decides with what actually generated the audio.
use framechester_core::config::{is_loopback_url, MusicConfig};
use framechester_core::error::{FramechesterError, Result};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// ACE-Step has no instrumental flag; this lyrics tag asks for no vocals.
pub const INSTRUMENTAL: &str = "[Instrumental]";
const MAX_AUDIO_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct GenerationRequest {
    pub prompt: String,
    /// The server accepts 10 to 600 seconds.
    pub duration_secs: f32,
    pub seed: i64,
    /// Turbo models take 1-20, base models 1-200.
    pub inference_steps: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GeneratedAudio {
    pub bytes: Vec<u8>,
    /// File extension of `bytes`.
    pub format: &'static str,
    pub seed: i64,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TaskState {
    Running,
    Done {
        file: String,
        seed: Option<i64>,
        models: Vec<String>,
    },
    Failed(String),
}

pub struct AceStepClient {
    base_url: String,
    api_key: Option<String>,
    client: reqwest::blocking::Client,
    poll_every: Duration,
    timeout: Duration,
}

impl std::fmt::Debug for AceStepClient {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AceStepClient")
            .field("base_url", &self.base_url)
            .field("api_key", &self.api_key.as_ref().map(|_| "[REDACTED]"))
            .finish()
    }
}

pub fn release_body(request: &GenerationRequest) -> Result<Value> {
    if request.prompt.trim().is_empty() {
        return Err(FramechesterError::InvalidInput("prompt vazio".into()));
    }
    if !(10.0..=600.0).contains(&request.duration_secs) {
        return Err(FramechesterError::InvalidInput(
            "duracao da faixa deve ficar entre 10 e 600 s (limite do ACE-Step)".into(),
        ));
    }
    if !(1..=200).contains(&request.inference_steps) {
        return Err(FramechesterError::InvalidInput(
            "inference_steps deve ficar entre 1 e 200".into(),
        ));
    }
    Ok(json!({
        "prompt": request.prompt,
        "lyrics": INSTRUMENTAL,
        "audio_duration": request.duration_secs,
        "seed": request.seed,
        "use_random_seed": false,
        "inference_steps": request.inference_steps,
        "audio_format": "flac",
        "batch_size": 1,
    }))
}

fn data(value: &Value) -> &Value {
    value.get("data").unwrap_or(value)
}

pub fn parse_task_id(value: &Value) -> Result<String> {
    data(value)
        .get("task_id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .ok_or_else(|| FramechesterError::External("ACE-Step nao devolveu task_id".into()))
}

fn as_seed(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => text.split(',').next()?.trim().parse().ok(),
        _ => None,
    }
}

pub fn parse_query(value: &Value, task_id: &str) -> Result<TaskState> {
    let entry = data(value)
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| entry.get("task_id").and_then(Value::as_str) == Some(task_id))
        })
        .ok_or_else(|| {
            FramechesterError::External(format!("ACE-Step nao conhece a tarefa {task_id}"))
        })?;
    match entry.get("status").and_then(Value::as_i64) {
        Some(0) => Ok(TaskState::Running),
        Some(1) => {
            // `result` is a JSON string; with a batch it holds a list of results.
            let result = match entry.get("result") {
                Some(Value::String(text)) => serde_json::from_str(text)?,
                Some(other) => other.clone(),
                None => Value::Null,
            };
            let result = match result {
                Value::Array(mut items) if !items.is_empty() => items.swap_remove(0),
                other => other,
            };
            let file = result
                .get("file")
                .and_then(Value::as_str)
                .filter(|file| !file.is_empty())
                .ok_or_else(|| FramechesterError::External("ACE-Step concluiu sem arquivo".into()))?
                .to_string();
            let models = ["dit_model", "lm_model"]
                .iter()
                .filter_map(|key| result.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|model| !model.is_empty() && *model != "None")
                .map(str::to_string)
                .collect();
            Ok(TaskState::Done {
                file,
                seed: as_seed(result.get("seed_value")),
                models,
            })
        }
        Some(2) => Ok(TaskState::Failed(
            entry
                .get("result")
                .map(|result| result.to_string().chars().take(300).collect())
                .unwrap_or_else(|| "sem detalhe".into()),
        )),
        _ => Err(FramechesterError::External(
            "ACE-Step devolveu status desconhecido".into(),
        )),
    }
}

/// The download URL of a result `file`, which the server gives relative to itself.
/// An absolute URL is accepted only on the same loopback server.
pub fn audio_url(base_url: &str, file: &str) -> Result<String> {
    let base = base_url.trim_end_matches('/');
    if file.starts_with("http://") || file.starts_with("https://") {
        return if is_loopback_url(file) && file.starts_with(&format!("{base}/")) {
            Ok(file.to_string())
        } else {
            Err(FramechesterError::External(
                "ACE-Step apontou o audio para fora do servidor local".into(),
            ))
        };
    }
    if file.starts_with('/') {
        Ok(format!("{base}{file}"))
    } else {
        Err(FramechesterError::External(format!(
            "caminho de audio inesperado: {file}"
        )))
    }
}

impl AceStepClient {
    pub fn from_config(config: &MusicConfig) -> Result<Self> {
        if !is_loopback_url(&config.acestep_url) {
            return Err(FramechesterError::Config(
                "music.acestep_url deve ser loopback".into(),
            ));
        }
        let api_key = (!config.acestep_api_key_env.trim().is_empty())
            .then(|| std::env::var(&config.acestep_api_key_env).ok())
            .flatten()
            .filter(|key| !key.trim().is_empty());
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .no_proxy()
            .build()
            .map_err(|error| FramechesterError::Unavailable(error.to_string()))?;
        Ok(Self {
            base_url: config.acestep_url.trim_end_matches('/').to_string(),
            api_key,
            client,
            poll_every: Duration::from_secs(3),
            timeout: Duration::from_secs(60 * 60),
        })
    }

    fn post(&self, path: &str, body: &Value) -> Result<Value> {
        let mut request = self
            .client
            .post(format!("{}{path}", self.base_url))
            .json(body);
        if let Some(key) = &self.api_key {
            request = request.bearer_auth(key);
        }
        let response = request.send().map_err(|error| {
            FramechesterError::Unavailable(format!(
                "ACE-Step fora do ar em {} ({error}); rode `uv run acestep-api` no clone do ACE-Step-1.5",
                self.base_url
            ))
        })?;
        let status = response.status();
        if !status.is_success() {
            return Err(FramechesterError::External(format!(
                "ACE-Step {path} respondeu {status}"
            )));
        }
        response
            .json()
            .map_err(|error| FramechesterError::External(format!("ACE-Step {path}: {error}")))
    }

    /// Generates one instrumental track and waits for it.
    pub fn generate(&self, request: &GenerationRequest) -> Result<GeneratedAudio> {
        let task_id = parse_task_id(&self.post("/release_task", &release_body(request)?)?)?;
        let started = Instant::now();
        let (file, seed, models) = loop {
            match parse_query(
                &self.post("/query_result", &json!({ "task_id_list": [task_id] }))?,
                &task_id,
            )? {
                TaskState::Running if started.elapsed() < self.timeout => {
                    std::thread::sleep(self.poll_every)
                }
                TaskState::Running => {
                    return Err(FramechesterError::External(format!(
                        "ACE-Step nao terminou {task_id} em {} min",
                        self.timeout.as_secs() / 60
                    )))
                }
                TaskState::Failed(detail) => {
                    return Err(FramechesterError::External(format!(
                        "ACE-Step falhou: {detail}"
                    )))
                }
                TaskState::Done { file, seed, models } => break (file, seed, models),
            }
        };
        let mut download = self.client.get(audio_url(&self.base_url, &file)?);
        if let Some(key) = &self.api_key {
            download = download.bearer_auth(key);
        }
        let response = download
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| FramechesterError::External(format!("baixar audio: {error}")))?;
        if response.content_length().unwrap_or(0) > MAX_AUDIO_BYTES {
            return Err(FramechesterError::External("audio grande demais".into()));
        }
        let bytes = response
            .bytes()
            .map_err(|error| FramechesterError::External(format!("baixar audio: {error}")))?
            .to_vec();
        Ok(GeneratedAudio {
            format: if file.ends_with(".flac") {
                "flac"
            } else {
                "audio"
            },
            bytes,
            seed: seed.unwrap_or(request.seed),
            models,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> GenerationRequest {
        GenerationRequest {
            prompt: "lofi hip hop, mellow piano, vinyl crackle, 75 bpm".into(),
            duration_secs: 180.0,
            seed: 42,
            inference_steps: 8,
        }
    }

    #[test]
    fn release_body_is_instrumental_fixed_seed_single_flac() {
        let body = release_body(&request()).unwrap();
        assert_eq!(body["lyrics"], INSTRUMENTAL);
        assert_eq!(body["use_random_seed"], false);
        assert_eq!(body["seed"], 42);
        assert_eq!(body["batch_size"], 1);
        assert_eq!(body["audio_format"], "flac");
        let mut too_long = request();
        too_long.duration_secs = 900.0;
        assert!(release_body(&too_long).is_err());
        let mut empty = request();
        empty.prompt = " ".into();
        assert!(release_body(&empty).is_err());
    }

    #[test]
    fn parses_task_lifecycle_from_documented_shapes() {
        let released = json!({"code": 200, "data": {"task_id": "t1", "status": "queued", "queue_position": 1}});
        assert_eq!(parse_task_id(&released).unwrap(), "t1");
        let running = json!({"data": [{"task_id": "t1", "status": 0, "result": ""}]});
        assert_eq!(parse_query(&running, "t1").unwrap(), TaskState::Running);
        let inner = json!([{"file": "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc.flac", "seed_value": "1234", "dit_model": "acestep-v15-turbo", "lm_model": "acestep-5Hz-lm-1.7B"}]);
        let done = json!({"data": [{"task_id": "t1", "status": 1, "result": inner.to_string()}]});
        assert_eq!(
            parse_query(&done, "t1").unwrap(),
            TaskState::Done {
                file: "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc.flac".into(),
                seed: Some(1234),
                models: vec!["acestep-v15-turbo".into(), "acestep-5Hz-lm-1.7B".into()],
            }
        );
        let failed = json!({"data": [{"task_id": "t1", "status": 2, "result": "out of memory"}]});
        assert!(matches!(
            parse_query(&failed, "t1").unwrap(),
            TaskState::Failed(_)
        ));
        assert!(parse_query(&done, "other").is_err());
    }

    #[test]
    fn audio_never_downloads_from_outside_the_local_server() {
        let base = "http://127.0.0.1:8001";
        assert_eq!(
            audio_url(base, "/v1/audio?path=x.flac").unwrap(),
            "http://127.0.0.1:8001/v1/audio?path=x.flac"
        );
        assert!(audio_url(base, "http://127.0.0.1:8001/v1/audio?path=x").is_ok());
        assert!(audio_url(base, "https://cdn.example.com/x.flac").is_err());
        assert!(audio_url(base, "x.flac").is_err());
        assert!(audio_url(base, "http://127.0.0.1:80011/x.flac").is_err());
    }
}
