use framechester_core::domain::MetricSample;
use framechester_core::error::Result;
use framechester_core::ports::{AdapterInfo, MetricsProvider};
use std::path::PathBuf;

#[derive(Debug, Default)]
pub struct NullMetrics;

impl MetricsProvider for NullMetrics {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "null-metrics".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec!["nao coleta metricas reais".into()],
        }
    }

    fn fetch(&self, _video_ids: &[String]) -> Result<Vec<MetricSample>> {
        Ok(Vec::new())
    }
}

#[derive(Debug, Clone)]
pub struct FileMetricsProvider {
    path: PathBuf,
}

impl FileMetricsProvider {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl MetricsProvider for FileMetricsProvider {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            name: "file-metrics".into(),
            license: "Apache-2.0".into(),
            network: false,
            unit_cost: "R$ 0,00".into(),
            secrets: Vec::new(),
            failure_modes: vec![
                "arquivo de metricas ausente".into(),
                "schema invalido".into(),
            ],
        }
    }

    fn fetch(&self, video_ids: &[String]) -> Result<Vec<MetricSample>> {
        if !self.path.is_file() {
            return Ok(Vec::new());
        }
        let text = std::fs::read_to_string(&self.path)?;
        let all: Vec<MetricSample> = serde_json::from_str(&text)?;
        if video_ids.is_empty() {
            return Ok(all);
        }
        Ok(all
            .into_iter()
            .filter(|sample| video_ids.iter().any(|id| id == &sample.video_id))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use framechester_core::domain::now_unix;

    #[test]
    fn missing_file_is_empty_not_error() {
        let provider = FileMetricsProvider::new("nao-existe-metrics.json");
        assert!(provider.fetch(&[]).unwrap().is_empty());
    }

    #[test]
    fn filters_by_video_id() {
        let dir = std::env::temp_dir().join(format!("framechester-metrics-{}", now_unix()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("metrics.json");
        let samples = vec![
            MetricSample {
                video_id: "a".into(),
                provider: "local".into(),
                views: 10,
                watch_hours: 1.0,
                revenue_cents: 0,
                monetized: false,
                captured_at_unix: now_unix(),
            },
            MetricSample {
                video_id: "b".into(),
                provider: "local".into(),
                views: 20,
                watch_hours: 2.0,
                revenue_cents: 0,
                monetized: false,
                captured_at_unix: now_unix(),
            },
        ];
        std::fs::write(&path, serde_json::to_string(&samples).unwrap()).unwrap();
        let provider = FileMetricsProvider::new(path);
        let filtered = provider.fetch(&["b".into()]).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].views, 20);
        std::fs::remove_dir_all(dir).ok();
    }
}
