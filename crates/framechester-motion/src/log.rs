//! Structured logging: JSON lines with phase timings and peak memory, so a render can be
//! profiled after the fact. Nothing leaves the machine.
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Timing {
    pub phase: String,
    pub seconds: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_memory_mb: Option<f32>,
}

pub struct Logger {
    path: Option<PathBuf>,
    started: Instant,
    pub timings: Vec<Timing>,
}

/// Peak resident memory of this process in megabytes (Linux only; `None` elsewhere).
pub fn peak_memory_mb() -> Option<f32> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let line = status.lines().find(|line| line.starts_with("VmHWM:"))?;
    let kb: f32 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024.0)
}

impl Logger {
    pub fn new(path: Option<&Path>) -> Self {
        if let Some(parent) = path.and_then(Path::parent) {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Some(path) = path {
            let _ = std::fs::write(path, "");
        }
        Self {
            path: path.map(Path::to_path_buf),
            started: Instant::now(),
            timings: Vec::new(),
        }
    }

    pub fn event(&self, phase: &str, status: &str, detail: serde_json::Value) {
        let record = serde_json::json!({
            "t": self.started.elapsed().as_secs_f32(),
            "phase": phase,
            "status": status,
            "detail": detail,
            "peak_memory_mb": peak_memory_mb(),
        });
        if let Some(path) = &self.path {
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .append(true)
                .create(true)
                .open(path)
            {
                let _ = writeln!(file, "{record}");
            }
        }
    }

    /// Runs `work`, recording its wall time under `phase`.
    pub fn time<T>(&mut self, phase: &str, work: impl FnOnce() -> T) -> T {
        self.event(phase, "start", serde_json::Value::Null);
        let start = Instant::now();
        let result = work();
        let seconds = start.elapsed().as_secs_f32();
        self.timings.push(Timing {
            phase: phase.to_string(),
            seconds,
            peak_memory_mb: peak_memory_mb(),
        });
        self.event(phase, "done", serde_json::json!({ "seconds": seconds }));
        result
    }

    pub fn total_seconds(&self) -> f32 {
        self.started.elapsed().as_secs_f32()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_json_lines_and_timings() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("log.jsonl");
        let mut logger = Logger::new(Some(&path));
        let value = logger.time("compose", || 41 + 1);
        assert_eq!(value, 42);
        assert_eq!(logger.timings.len(), 1);
        let text = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<serde_json::Value> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1]["status"], "done");
    }
}
