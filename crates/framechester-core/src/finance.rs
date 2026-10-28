use crate::error::{FramechesterError, Result};
use serde::{Deserialize, Serialize};

pub const FREE_STORAGE_GB: u64 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageProvider {
    B2,
    R2,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct FinanceInput {
    pub eligible: bool,
    pub views_long: u64,
    pub rpm_long_cents: u64,
    pub views_shorts: u64,
    pub rpm_shorts_cents: u64,
    pub other_revenue_cents: u64,
    pub storage_provider: StorageProvider,
    pub storage_gb: u64,
    pub usd_brl_cents: u64,
    pub additional_cost_cents: u64,
    pub taxes_basis_points: u32,
    pub own_hours: u64,
    pub hour_rate_cents: u64,
    pub economic_allocations_cents: u64,
}

impl Default for FinanceInput {
    fn default() -> Self {
        Self {
            eligible: false,
            views_long: 0,
            rpm_long_cents: 0,
            views_shorts: 0,
            rpm_shorts_cents: 0,
            other_revenue_cents: 0,
            storage_provider: StorageProvider::B2,
            storage_gb: FREE_STORAGE_GB,
            usd_brl_cents: 534,
            additional_cost_cents: 0,
            taxes_basis_points: 0,
            own_hours: 0,
            hour_rate_cents: 0,
            economic_allocations_cents: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FinanceReport {
    pub backup_cents: u64,
    pub gross_revenue_cents: u64,
    pub taxes_cents: u64,
    pub cash_cost_cents: u64,
    pub cash_result_cents: i64,
    pub economic_result_cents: i64,
    pub breakeven_long_views: Option<u64>,
}

fn round_div(numerator: u128, denominator: u128) -> u64 {
    if denominator == 0 {
        return 0;
    }
    let rounded = (numerator + denominator / 2) / denominator;
    u64::try_from(rounded).unwrap_or(u64::MAX)
}

fn div_ceil(numerator: u64, denominator: u64) -> u64 {
    if denominator == 0 {
        return 0;
    }
    numerator.div_ceil(denominator)
}

pub fn storage_cost_cents(input: &FinanceInput) -> u64 {
    let chargeable = input.storage_gb.saturating_sub(FREE_STORAGE_GB) as u128;
    let exchange = input.usd_brl_cents as u128;
    match input.storage_provider {
        StorageProvider::B2 => round_div(chargeable * 695 * exchange, 100_000),
        StorageProvider::R2 => round_div(chargeable * 3 * exchange, 200),
    }
}

pub fn simulate(input: &FinanceInput) -> Result<FinanceReport> {
    if input.usd_brl_cents == 0 {
        return Err(FramechesterError::InvalidInput(
            "cambio usd_brl_cents deve ser maior que zero".into(),
        ));
    }
    if input.taxes_basis_points > 10_000 {
        return Err(FramechesterError::InvalidInput(
            "taxes_basis_points deve estar entre 0 e 10000".into(),
        ));
    }
    let platform_revenue = if input.eligible {
        let long = round_div(
            input.views_long as u128 * input.rpm_long_cents as u128,
            1000,
        );
        let shorts = round_div(
            input.views_shorts as u128 * input.rpm_shorts_cents as u128,
            1000,
        );
        long + shorts
    } else {
        0
    };
    let gross_revenue_cents = platform_revenue + input.other_revenue_cents;
    let taxes_cents = round_div(
        gross_revenue_cents as u128 * input.taxes_basis_points as u128,
        10_000,
    );
    let backup_cents = storage_cost_cents(input);
    let cash_cost_cents = backup_cents + input.additional_cost_cents;
    let cash_result_cents =
        gross_revenue_cents as i64 - taxes_cents as i64 - cash_cost_cents as i64;
    let own_cost = input.own_hours.saturating_mul(input.hour_rate_cents);
    let economic_result_cents =
        cash_result_cents - own_cost as i64 - input.economic_allocations_cents as i64;
    let breakeven_long_views = if input.eligible && input.rpm_long_cents > 0 {
        Some(div_ceil(
            cash_cost_cents.saturating_mul(1000),
            input.rpm_long_cents,
        ))
    } else {
        None
    };
    Ok(FinanceReport {
        backup_cents,
        gross_revenue_cents,
        taxes_cents,
        cash_cost_cents,
        cash_result_cents,
        economic_result_cents,
        breakeven_long_views,
    })
}

pub fn format_brl(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let absolute = cents.unsigned_abs();
    format!("{sign}R$ {},{:02}", absolute / 100, absolute % 100)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input_with(storage_gb: u64, provider: StorageProvider) -> FinanceInput {
        FinanceInput {
            storage_gb,
            storage_provider: provider,
            ..FinanceInput::default()
        }
    }

    #[test]
    fn zero_revenue_until_eligible() {
        let mut input = input_with(50, StorageProvider::B2);
        input.views_long = 1_000_000;
        input.rpm_long_cents = 600;
        let report = simulate(&input).unwrap();
        assert_eq!(report.gross_revenue_cents, 0);
        assert!(report.breakeven_long_views.is_none());
    }

    #[test]
    fn free_storage_has_zero_cost() {
        let report = simulate(&input_with(10, StorageProvider::B2)).unwrap();
        assert_eq!(report.backup_cents, 0);
        assert_eq!(report.cash_result_cents, 0);
    }

    #[test]
    fn b2_50gb_at_534_cents_per_usd() {
        let report = simulate(&input_with(50, StorageProvider::B2)).unwrap();
        assert_eq!(report.backup_cents, 148);
    }

    #[test]
    fn r2_50gb_at_534_cents_per_usd() {
        let report = simulate(&input_with(50, StorageProvider::R2)).unwrap();
        assert_eq!(report.backup_cents, 320);
    }

    #[test]
    fn b2_150gb_and_500gb() {
        assert_eq!(
            simulate(&input_with(150, StorageProvider::B2))
                .unwrap()
                .backup_cents,
            520
        );
        assert_eq!(
            simulate(&input_with(500, StorageProvider::B2))
                .unwrap()
                .backup_cents,
            1819
        );
    }

    #[test]
    fn revenue_taxes_and_breakeven() {
        let mut input = input_with(50, StorageProvider::B2);
        input.eligible = true;
        input.views_long = 100_000;
        input.rpm_long_cents = 600;
        input.taxes_basis_points = 1000;
        input.additional_cost_cents = 100;
        let report = simulate(&input).unwrap();
        assert_eq!(report.gross_revenue_cents, 60_000);
        assert_eq!(report.taxes_cents, 6_000);
        assert_eq!(report.cash_cost_cents, 248);
        assert_eq!(report.cash_result_cents, 53_752);
        assert_eq!(report.breakeven_long_views, Some(414));
    }

    #[test]
    fn economic_result_subtracts_own_hours() {
        let mut input = input_with(10, StorageProvider::B2);
        input.eligible = true;
        input.views_long = 1000;
        input.rpm_long_cents = 1000;
        input.own_hours = 2;
        input.hour_rate_cents = 5000;
        let report = simulate(&input).unwrap();
        assert_eq!(report.cash_result_cents, 1000);
        assert_eq!(report.economic_result_cents, -9000);
    }

    #[test]
    fn invalid_exchange_rate_fails() {
        let mut input = input_with(50, StorageProvider::B2);
        input.usd_brl_cents = 0;
        assert!(simulate(&input).is_err());
    }

    #[test]
    fn formats_brl() {
        assert_eq!(format_brl(148), "R$ 1,48");
        assert_eq!(format_brl(-9000), "-R$ 90,00");
    }
}
