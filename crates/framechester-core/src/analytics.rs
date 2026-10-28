use crate::channel::ChannelProfile;
use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalyticsSource {
    YoutubeStudioExport,
    Fixture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnalyticsFormat {
    Long,
    Shorts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnalyticsSnapshot {
    pub channel_id: String,
    pub period_start: String,
    pub period_end: String,
    pub source: AnalyticsSource,
    pub currency: String,
    pub monetization_enabled: bool,
    pub format: AnalyticsFormat,
    pub views: u64,
    pub engaged_views: Option<u64>,
    pub watch_minutes: u64,
    /// Estimated revenue generated in this observation window.
    pub estimated_revenue_cents: Option<u64>,
    /// Cash received in the window, potentially earned in an earlier period.
    pub paid_revenue_cents: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RpmViewBasis {
    Views,
    EngagedViews,
}

/// Local observations, not proof of YouTube eligibility or independent verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSummary {
    pub channel_id: String,
    pub period_start: String,
    pub period_end: String,
    pub source: AnalyticsSource,
    pub currency: String,
    pub monetization_enabled: bool,
    pub format: AnalyticsFormat,
    pub views: u64,
    pub engaged_views: Option<u64>,
    pub watch_minutes: u64,
    pub estimated_revenue_cents: Option<u64>,
    pub paid_revenue_cents: Option<u64>,
    pub rpm_view_basis: RpmViewBasis,
    pub estimated_rpm_cents: Option<f64>,
}

impl AnalyticsSnapshot {
    pub fn validate_for_channel(&self, channel_id: &str) -> Result<()> {
        ChannelProfile {
            id: self.channel_id.clone(),
            youtube_channel_id: None,
        }
        .validate()?;
        if self.channel_id != channel_id {
            return Err(FramechesterError::InvalidInput(
                "snapshot pertence a outro canal".into(),
            ));
        }
        if !valid_date(&self.period_start)
            || !valid_date(&self.period_end)
            || self.period_start > self.period_end
        {
            return Err(FramechesterError::InvalidInput(
                "periodo deve conter datas reais YYYY-MM-DD em ordem cronologica".into(),
            ));
        }
        if self.currency != "BRL" {
            return Err(FramechesterError::InvalidInput(
                "snapshot requer moeda BRL; conversao deve ser explicita antes da importacao"
                    .into(),
            ));
        }
        if self.engaged_views.is_some_and(|views| views > self.views) {
            return Err(FramechesterError::InvalidInput(
                "engaged_views nao pode exceder views da mesma janela".into(),
            ));
        }
        if !self.monetization_enabled && self.estimated_revenue_cents.is_some_and(|value| value > 0)
        {
            return Err(FramechesterError::InvalidInput(
                "receita estimada positiva contradiz monetizacao desabilitada no periodo".into(),
            ));
        }
        Ok(())
    }

    pub fn summarize(&self) -> Result<AnalyticsSummary> {
        self.validate_for_channel(&self.channel_id)?;
        let (rpm_view_basis, denominator) = match self.format {
            AnalyticsFormat::Long => (RpmViewBasis::Views, Some(self.views)),
            AnalyticsFormat::Shorts => (RpmViewBasis::EngagedViews, self.engaged_views),
        };
        let estimated_rpm_cents = self.estimated_revenue_cents.and_then(|revenue| {
            denominator
                .filter(|views| *views > 0)
                .map(|views| revenue as f64 * 1000.0 / views as f64)
        });
        Ok(AnalyticsSummary {
            channel_id: self.channel_id.clone(),
            period_start: self.period_start.clone(),
            period_end: self.period_end.clone(),
            source: self.source,
            currency: self.currency.clone(),
            monetization_enabled: self.monetization_enabled,
            format: self.format,
            views: self.views,
            engaged_views: self.engaged_views,
            watch_minutes: self.watch_minutes,
            estimated_revenue_cents: self.estimated_revenue_cents,
            paid_revenue_cents: self.paid_revenue_cents,
            rpm_view_basis,
            estimated_rpm_cents,
        })
    }
}

fn valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let number = |part: &[u8]| {
        part.iter()
            .fold(0_u16, |value, digit| value * 10 + (digit - b'0') as u16)
    };
    let year = number(&bytes[..4]);
    let month = number(&bytes[5..7]);
    let day = number(&bytes[8..]);
    if year == 0 || day == 0 {
        return false;
    }
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => return false,
    };
    day <= days
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> AnalyticsSnapshot {
        serde_json::from_str(
            r#"{
                "channel_id":"science",
                "period_start":"2026-09-01",
                "period_end":"2026-09-30",
                "source":"fixture",
                "currency":"BRL",
                "monetization_enabled":true,
                "format":"long",
                "views":25000,
                "engaged_views":null,
                "watch_minutes":90000,
                "estimated_revenue_cents":50000,
                "paid_revenue_cents":17500
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn local_snapshot_preserves_source_period_and_separate_revenue_classes() {
        let snapshot = fixture();
        snapshot.validate_for_channel("science").unwrap();
        let summary = snapshot.summarize().unwrap();
        assert_eq!(summary.source, AnalyticsSource::Fixture);
        assert_eq!(summary.channel_id, "science");
        assert_eq!(summary.period_start, "2026-09-01");
        assert_eq!(summary.period_end, "2026-09-30");
        assert_eq!(summary.estimated_revenue_cents, Some(50000));
        assert_eq!(summary.paid_revenue_cents, Some(17500));
        assert_eq!(summary.estimated_rpm_cents, Some(2000.0));
        assert_eq!(summary.rpm_view_basis, RpmViewBasis::Views);
    }

    #[test]
    fn snapshot_from_another_channel_cannot_be_used() {
        assert!(fixture().validate_for_channel("technology").is_err());
        let mut snapshot = fixture();
        snapshot.channel_id = "../other".into();
        assert!(snapshot.validate_for_channel("../other").is_err());
    }

    #[test]
    fn shorts_rpm_uses_engaged_views_instead_of_raw_starts() {
        let mut snapshot = fixture();
        snapshot.format = AnalyticsFormat::Shorts;
        snapshot.engaged_views = Some(10000);
        let summary = snapshot.summarize().unwrap();
        assert_eq!(summary.views, 25000);
        assert_eq!(summary.engaged_views, Some(10000));
        assert_eq!(summary.rpm_view_basis, RpmViewBasis::EngagedViews);
        assert_eq!(summary.estimated_rpm_cents, Some(5000.0));
    }

    #[test]
    fn missing_revenue_is_not_filled_from_views_or_payments() {
        let mut snapshot = fixture();
        snapshot.estimated_revenue_cents = None;
        let summary = snapshot.summarize().unwrap();
        assert_eq!(summary.estimated_revenue_cents, None);
        assert_eq!(summary.estimated_rpm_cents, None);
        assert_eq!(summary.paid_revenue_cents, Some(17500));
        snapshot.paid_revenue_cents = None;
        assert_eq!(snapshot.summarize().unwrap().paid_revenue_cents, None);
    }

    #[test]
    fn missing_or_zero_shorts_denominator_never_invents_rpm() {
        let mut snapshot = fixture();
        snapshot.format = AnalyticsFormat::Shorts;
        for engaged in [None, Some(0)] {
            snapshot.engaged_views = engaged;
            assert_eq!(snapshot.summarize().unwrap().estimated_rpm_cents, None);
        }
        snapshot.format = AnalyticsFormat::Long;
        snapshot.views = 0;
        snapshot.engaged_views = None;
        assert_eq!(snapshot.summarize().unwrap().estimated_rpm_cents, None);
    }

    #[test]
    fn monetization_disabled_rejects_positive_revenue_and_preserves_explicit_zero() {
        let mut snapshot = fixture();
        snapshot.monetization_enabled = false;
        assert!(snapshot.validate_for_channel("science").is_err());
        snapshot.estimated_revenue_cents = Some(0);
        snapshot.paid_revenue_cents = Some(0);
        let summary = snapshot.summarize().unwrap();
        assert_eq!(summary.estimated_revenue_cents, Some(0));
        assert_eq!(summary.paid_revenue_cents, Some(0));
        assert_eq!(summary.estimated_rpm_cents, Some(0.0));
        snapshot.estimated_revenue_cents = None;
        assert_eq!(snapshot.summarize().unwrap().estimated_revenue_cents, None);
    }

    #[test]
    fn prior_period_payments_do_not_require_current_monetization_or_create_rpm() {
        let mut snapshot = fixture();
        snapshot.monetization_enabled = false;
        for estimated in [None, Some(0)] {
            snapshot.estimated_revenue_cents = estimated;
            snapshot.validate_for_channel("science").unwrap();
            let summary = snapshot.summarize().unwrap();
            assert!(!summary.monetization_enabled);
            assert_eq!(summary.paid_revenue_cents, Some(17500));
            assert_eq!(summary.estimated_revenue_cents, estimated);
            assert_eq!(summary.estimated_rpm_cents, estimated.map(|_| 0.0));
        }
    }

    #[test]
    fn currency_and_engaged_view_population_must_be_consistent() {
        let mut snapshot = fixture();
        snapshot.currency = "USD".into();
        assert!(snapshot.validate_for_channel("science").is_err());
        snapshot.currency = "BRL".into();
        snapshot.engaged_views = Some(snapshot.views + 1);
        assert!(snapshot.validate_for_channel("science").is_err());
    }

    #[test]
    fn dates_are_real_calendar_days_and_window_is_ordered() {
        let mut snapshot = fixture();
        for (start, end) in [
            ("2026-02-29", "2026-03-01"),
            ("2026-04-31", "2026-05-01"),
            ("2026-00-01", "2026-01-01"),
            ("2026-13-01", "2027-01-01"),
            ("0000-01-01", "2026-01-01"),
            ("2026-09-30", "2026-09-01"),
            ("2026-9-01", "2026-09-30"),
            ("2026-09-01", "2026-09-00"),
            ("2026-09-01", "2026-09-30T00:00:00Z"),
        ] {
            snapshot.period_start = start.into();
            snapshot.period_end = end.into();
            assert!(
                snapshot.validate_for_channel("science").is_err(),
                "{start} -> {end}"
            );
        }
        snapshot.period_start = "2024-02-29".into();
        snapshot.period_end = "2024-02-29".into();
        assert!(snapshot.validate_for_channel("science").is_ok());
        snapshot.period_start = "1900-02-29".into();
        snapshot.period_end = "1900-03-01".into();
        assert!(snapshot.validate_for_channel("science").is_err());
        snapshot.period_start = "2000-02-29".into();
        snapshot.period_end = "2000-03-01".into();
        assert!(snapshot.validate_for_channel("science").is_ok());
    }

    #[test]
    fn invalid_source_format_and_negative_values_are_rejected_at_import() {
        let valid = serde_json::to_value(fixture()).unwrap();
        for (field, value) in [
            ("source", serde_json::json!("guessed")),
            ("format", serde_json::json!("mixed")),
            ("views", serde_json::json!(-1)),
            ("estimated_revenue_cents", serde_json::json!(-100)),
        ] {
            let mut invalid = valid.clone();
            invalid[field] = value;
            assert!(serde_json::from_value::<AnalyticsSnapshot>(invalid).is_err());
        }
        let mut invalid = valid;
        invalid["guessed_revenue"] = serde_json::json!(500);
        assert!(serde_json::from_value::<AnalyticsSnapshot>(invalid).is_err());
    }
}
