//! `finance`: cost and revenue simulation; a scenario, not a promise.
use crate::cli::{FinanceArgs, ProviderArg};
use framechester_core::finance;
use framechester_core::finance::{FinanceInput, StorageProvider};

pub(crate) fn finance_report(args: FinanceArgs) -> anyhow::Result<i32> {
    let input = FinanceInput {
        eligible: args.eligible,
        views_long: args.views_long,
        rpm_long_cents: args.rpm_long_cents,
        views_shorts: args.views_shorts,
        rpm_shorts_cents: args.rpm_shorts_cents,
        other_revenue_cents: args.other_revenue_cents,
        storage_provider: match args.provider {
            ProviderArg::B2 => StorageProvider::B2,
            ProviderArg::R2 => StorageProvider::R2,
        },
        storage_gb: args.storage_gb,
        usd_brl_cents: args.usd_brl_cents,
        additional_cost_cents: args.additional_cost_cents,
        taxes_basis_points: args.taxes_bp,
        own_hours: args.own_hours,
        hour_rate_cents: args.hour_rate_cents,
        economic_allocations_cents: args.economic_allocations_cents,
    };
    let report = finance::simulate(&input)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!(
            "backup:           {}",
            finance::format_brl(report.backup_cents as i64)
        );
        println!(
            "receita bruta:    {}",
            finance::format_brl(report.gross_revenue_cents as i64)
        );
        println!(
            "impostos:         {}",
            finance::format_brl(report.taxes_cents as i64)
        );
        println!(
            "custo caixa:      {}",
            finance::format_brl(report.cash_cost_cents as i64)
        );
        println!(
            "resultado caixa:  {}",
            finance::format_brl(report.cash_result_cents)
        );
        println!(
            "resultado econom.:{}",
            finance::format_brl(report.economic_result_cents)
        );
        match report.breakeven_long_views {
            Some(views) => println!("breakeven:        {views} views longas"),
            None => println!("breakeven:        nao elegivel ou rpm zero"),
        }
        println!("simulacao sem garantia de receita, elegibilidade ou aprovacao.");
    }
    Ok(0)
}
